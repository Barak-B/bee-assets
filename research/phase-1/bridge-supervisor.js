#!/usr/bin/env node
// bridge-supervisor.js — MIGRATION (Wave 13, Task #59).
//
// Keeps the Hermes WhatsApp bridge (bridge.js) alive as a STANDALONE process,
// decoupled from the Hermes gateway. In the migration architecture the gateway
// is OUT of the WhatsApp loop; this supervisor runs the bridge and
// alfred-inbound-watcher.js is the sole consumer of /messages.
//
// ── WHY A SUPERVISOR (and the cardinal rule) ─────────────────────────────────
// On 2026-05-26 a live, CONNECTED bridge was killed to load a patch. WhatsApp
// Server saw the abrupt disconnect, marked the device "disconnected", and
// invalidated the session — forcing a QR re-pair and cascading a gateway crash.
// LESSON: never abruptly kill a connected Baileys bridge.
//
// This supervisor exists to AVOID manual kill-restarts:
//   • It NEVER proactively kills a running bridge.
//   • It only (re)spawns AFTER the bridge process has exited on its own. By then
//     the previous process is gone and creds are already flushed to disk, so the
//     respawn is the normal Baileys reconnect path (re-uses saved creds).
//   • If the bridge exits because WhatsApp LOGGED IT OUT, respawning cannot help
//     (needs a human QR re-pair) — so the supervisor STOPS and alerts instead of
//     crash-looping.
//   • Crash-loop guard: too many restarts in a short window → stop + alert.
//
// ── ⚠ STOPPING THE SUPERVISOR STOPS THE BRIDGE ───────────────────────────────
// Ctrl+C (SIGINT) here forwards SIGTERM to the bridge, which terminates a possibly
// CONNECTED bridge — the very thing that risks the session. Prefer a graceful
// `hermes whatsapp logout` if you intend to re-pair anyway. Only stop the
// supervisor when you actually mean to take WhatsApp down.
//
// ── PRE-FLIGHT ───────────────────────────────────────────────────────────────
//   • Refuses to start if port 3000 is already listening (a bridge/consumer is up).
//   • Refuses to start if the session is not registered (you must pair first via
//     qr-png.js) — prevents the "bridge runs but shows QR forever" confusion.
//     Override with --allow-unpaired to let it run and display the QR.
//
// USAGE (regular PowerShell, NOT inside a Claude session):
//   node bridge-supervisor.js
//   node bridge-supervisor.js --allow-unpaired     # let it boot to show a QR
//   $env:WHATSAPP_MODE="bot"; $env:WHATSAPP_ALLOWED_USERS="*"; node bridge-supervisor.js
//
// ENV: WA_SESSION_DIR · BRIDGE_PORT (3000) · WHATSAPP_MODE (self-chat|bot)
//      WHATSAPP_ALLOWED_USERS · BRIDGE_JS (path override)

"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");

// ── Config ───────────────────────────────────────────────────────────────────
const HOME = os.homedir();
// Canonical standalone session path. MUST match the path qr-png.js / pair-helper.js
// pair into, so pairing and the bridge agree. (Default of both pair helpers.)
const SESSION_DIR = process.env.WA_SESSION_DIR || path.join(HOME, ".hermes", "platforms", "whatsapp", "session");
const BRIDGE_JS = process.env.BRIDGE_JS || path.join(HOME, "AppData", "Local", "hermes", "hermes-agent", "scripts", "whatsapp-bridge", "bridge.js");
const PORT = parseInt(process.env.BRIDGE_PORT || "3000", 10);
const MODE = process.env.WHATSAPP_MODE || "self-chat";
const ALLOW_UNPAIRED = process.argv.includes("--allow-unpaired");

const LOG_DIR = path.join(__dirname, "logs");
const SUP_LOG = path.join(LOG_DIR, "bridge-supervisor.jsonl");
const BRIDGE_OUT = path.join(LOG_DIR, "bridge-stdout.log");
const BRIDGE_ERR = path.join(LOG_DIR, "bridge-stderr.log");

// Crash-loop guard: more than MAX_RESTARTS within WINDOW_MS → stop + alert.
const MAX_RESTARTS = 5;
const WINDOW_MS = 120000;
const restartTimes = [];

let child = null;
let stopping = false;
let sawLogout = false;

// ── Logging ──────────────────────────────────────────────────────────────────
function log(event, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(SUP_LOG, line + "\n");
  } catch { /* logging must never crash the supervisor */ }
}

// ── Pre-flight helpers ─────────────────────────────────────────────────────--
function portListening(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (v) => { if (!done) { done = true; sock.destroy(); resolve(v); } };
    sock.setTimeout(1500);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, "127.0.0.1");
  });
}

function isRegistered(sessionDir) {
  try {
    const creds = path.join(sessionDir, "creds.json");
    if (!fs.existsSync(creds)) return false;
    const j = JSON.parse(fs.readFileSync(creds, "utf8"));
    return !!j.registered;
  } catch {
    return false;
  }
}

// ── Spawn / restart ────────────────────────────────────────────────────────--
function spawnBridge() {
  const outStream = fs.createWriteStream(BRIDGE_OUT, { flags: "a" });
  const errStream = fs.createWriteStream(BRIDGE_ERR, { flags: "a" });

  const env = { ...process.env, WHATSAPP_MODE: MODE };
  const args = [BRIDGE_JS, "--port", String(PORT), "--session", SESSION_DIR, "--mode", MODE];

  log("spawn", { node: process.execPath, bridge: BRIDGE_JS, port: PORT, mode: MODE, session: SESSION_DIR });
  child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });

  const scan = (buf, stream) => {
    const s = buf.toString();
    stream.write(s);
    // Detect logout so the exit handler knows not to respawn into a dead session.
    if (/Logged out/i.test(s)) {
      sawLogout = true;
      log("detected", { signal: "logged_out" });
    }
    if (/WhatsApp connected/i.test(s)) log("detected", { signal: "connected" });
    if (/listening on port/i.test(s)) log("detected", { signal: "http_listening" });
  };
  child.stdout.on("data", (b) => scan(b, outStream));
  child.stderr.on("data", (b) => scan(b, errStream));

  child.on("exit", (code, signal) => {
    log("bridge_exit", { code, signal });
    child = null;
    if (stopping) return;

    if (sawLogout || code === 1) {
      log("STOP_logged_out", {
        msg: "Bridge logged out / fatal exit. Respawn cannot recover a logged-out session.",
        action: "Re-pair with your phone: run qr-png.js (writes to the same session dir), then restart this supervisor.",
        sessionDir: SESSION_DIR,
      });
      process.exit(2);
    }

    // Crash-loop guard.
    const now = Date.now();
    restartTimes.push(now);
    while (restartTimes.length && now - restartTimes[0] > WINDOW_MS) restartTimes.shift();
    if (restartTimes.length > MAX_RESTARTS) {
      log("STOP_crash_loop", {
        msg: `Bridge restarted >${MAX_RESTARTS} times in ${WINDOW_MS / 1000}s. Stopping to avoid a thrash loop.`,
        action: "Inspect logs/bridge-stderr.log. Likely a code/dependency error, not a session issue.",
      });
      process.exit(3);
    }

    const delay = Math.min(2000 * restartTimes.length, 15000);
    log("respawn_scheduled", { delayMs: delay, recentRestarts: restartTimes.length });
    setTimeout(spawnBridge, delay);
  });

  child.on("error", (err) => {
    log("spawn_error", { err: err.message });
  });
}

// ── Shutdown ─────────────────────────────────────────────────────────────────
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log("shutdown_requested", {
    sig,
    warning: "Stopping the supervisor terminates the bridge. If it was CONNECTED, this risks the session — a re-pair may be needed.",
  });
  if (child) {
    // SIGTERM (not SIGKILL) — give Baileys a chance to flush, though bridge.js has
    // no explicit graceful-logout handler. We do NOT escalate to SIGKILL.
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
    setTimeout(() => process.exit(0), 3000);
  } else {
    process.exit(0);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (!fs.existsSync(BRIDGE_JS)) {
    log("FATAL", { msg: "bridge.js not found", path: BRIDGE_JS });
    process.exit(1);
  }

  if (await portListening(PORT)) {
    log("FATAL", {
      msg: `Port ${PORT} is already in use — a bridge or another /messages consumer is running.`,
      action: "Stop it first (or check the Hermes gateway isn't managing WhatsApp). Refusing to start a second bridge (would double-drain /messages).",
    });
    process.exit(1);
  }

  const registered = isRegistered(SESSION_DIR);
  if (!registered && !ALLOW_UNPAIRED) {
    log("FATAL", {
      msg: "Session is NOT registered (creds.registered=false) — bridge would just display a QR forever.",
      sessionDir: SESSION_DIR,
      action: "Pair first: `node qr-png.js --fresh` (scan with phone), wait for PAIRED, then restart this supervisor. Or pass --allow-unpaired to boot anyway and show the QR.",
    });
    process.exit(1);
  }

  // Bot mode rejects ALL incoming unless an allowlist is set (bridge.js line ~958).
  // Without this guard you get a confusing "bridge up but Alfred sees nothing" state.
  if (MODE === "bot" && !(process.env.WHATSAPP_ALLOWED_USERS || "").trim()) {
    log("WARN", {
      msg: "bot mode + empty WHATSAPP_ALLOWED_USERS — the bridge REJECTS all incoming. Alfred will see nothing.",
      action: 'Set WHATSAPP_ALLOWED_USERS="*" for full coverage, or a comma list of phone numbers.',
    });
  }

  log("startup", { sessionDir: SESSION_DIR, registered, mode: MODE, port: PORT, allowUnpaired: ALLOW_UNPAIRED });
  log("reminder", { msg: "alfred-inbound-watcher.js must be the ONLY /messages consumer. The Hermes gateway must NOT also run WhatsApp." });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  spawnBridge();
}

main().catch((err) => {
  log("FATAL", { err: err.message });
  process.exit(1);
});
