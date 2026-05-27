#!/usr/bin/env node
// alfred-ledger-sweep.js — the hive's "nothing falls through the cracks" guard (Wave 14, Task #65).
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// alfred-work-ledger.js makes the input→processing→editing→output lifecycle
// DURABLE: every request is a tracked work-item. But a passive tracker only
// answers questions when asked. Barak's actual worry — "לוודא כי אכן כל המשימות
// שלנו בטיפול" — needs an ACTIVE guard: a periodic sweep that surfaces STUCK
// items (received/processing/drafted/awaiting_condition that haven't moved in a
// while) straight to Barak's WhatsApp self-chat, so stale work gets noticed
// before it rots.
//
// We deliberately do NOT alert on `awaiting_barak` (that's a legitimate ball in
// Barak's court, not Alfred dropping it) nor on terminal states
// (done/dropped/failed). The ledger's own `stuck()` default already encodes that
// (ACTIVE_STUCK = received|processing|drafted|awaiting_condition).
//
// ── WHAT IT DOES ───────────────────────────────────────────────────────────--
//   1. ledger.sweep({ olderThanMs }) — olderThanMs from --older-min (default 90).
//   2. Format a concise HEBREW alert (header · stats summary · stuck list, or a
//      short "✅ הכל בטיפול" when clean).
//   3. Post to SELF-CHAT ONLY via the bridge: POST http://127.0.0.1:3000/send
//      {chatId, message}. DRY-RUN by default — only POSTs on --live / SEND_MODE=live.
//      Bridge down? Catch + log, never crash.
//
// HARD RULE: the ONLY send destination is Barak's self-chat. SELF_CHAT is
// hardcoded below and is the only JID this file will ever POST to.
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   node alfred-ledger-sweep.js                 → dry-run sweep (log alert, no send)
//   node alfred-ledger-sweep.js --live          → sweep + actually POST to self-chat
//   node alfred-ledger-sweep.js --older-min 120 → override staleness threshold
//   node alfred-ledger-sweep.js self-test       → offline self-test (temp DB, no network)
//
// ── REGISTER AS AN OPENCLAW CRON (every ~3 hours) ──────────────────────────────
// The `openclaw cron` CLI is the SOURCE OF TRUTH for scheduled jobs. Do NOT hand-
// edit ~/.openclaw/.../jobs.json — the gateway rewrites it and your edit is lost.
// Register (note --live so it actually notifies; drop it to stage as dry-run):
//
//   openclaw cron add \
//     --name "ledger-sweep" \
//     --schedule "0 */3 * * *" \
//     --command "node E:/Desktop/OpenClawAgent/alfred-ledger-sweep.js --live --older-min 90"
//
//   openclaw cron list                 # verify it registered
//   openclaw cron run ledger-sweep     # fire once on demand
//   openclaw cron remove ledger-sweep  # unregister
//
// (Verb names follow the same `openclaw cron <verb>` family the other alfred crons
//  use; `openclaw cron list` is authoritative for the exact verbs on this gateway.)

"use strict";

const os = require("os");
const path = require("path");

// The ONLY JID this module may ever send to. Hardcoded on purpose — Barak's self-chat.
const SELF_CHAT = "972509554483@s.whatsapp.net";
const BRIDGE_URL = "http://127.0.0.1:3000/send";
const DEFAULT_OLDER_MIN = 90;

// ── arg parsing ────────────────────────────────────────────────────────────--
function getArg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function hasFlag(name) {
  return process.argv.includes("--" + name);
}

// ── formatting ─────────────────────────────────────────────────────────────--
// Render one stuck work-item line: status · source · intent · age(min) · text · short-id.
function fmtItem(row) {
  const age = Math.round((Date.now() - row.updated_at) / 60000);
  const status = String(row.status || "?").padEnd(18);
  const source = String(row.source || "?").padEnd(7);
  const intent = String(row.intent || "-").padEnd(16);
  const text = String(row.text || "").slice(0, 40);
  const sid = String(row.id || "").slice(0, 8);
  return `• ${status} ${source} ${intent} ${age}m  ${text}  [${sid}]`;
}

// Build the full Hebrew alert string from a sweep() result. Pure — no I/O.
function formatAlert(sweepResult, olderMin) {
  const s = sweepResult.stats || {};
  const stuck = Array.isArray(sweepResult.stuck) ? sweepResult.stuck : [];
  const inHandling = s.inHandling || 0;
  const done = s.done || 0;
  const dropped = s.dropped || 0;
  const failed = s.failed || 0;
  const total = s.total || 0;

  const statsLine =
    `📊 בטיפול: ${inHandling} · הושלמו: ${done} · נדחו: ${dropped} · נכשלו: ${failed} · סה"כ: ${total}`;

  if (stuck.length === 0) {
    return [
      "✅ הכל בטיפול — אין משימות תקועות.",
      statsLine,
    ].join("\n");
  }

  const header = `⚠️ *סריקת יומן עבודה — ${stuck.length} משימות תקועות* (ללא תזוזה מעל ${olderMin} דק')`;
  const lines = stuck.map(fmtItem);
  return [header, statsLine, "", ...lines].join("\n");
}

// ── sweep core (pure-ish: reads the ledger, returns {sweepResult, alert}) ─────
function runSweep(ledger, olderMin) {
  const olderThanMs = olderMin * 60000;
  const sweepResult = ledger.sweep({ olderThanMs });
  const alert = formatAlert(sweepResult, olderMin);
  return { sweepResult, alert };
}

// ── delivery (self-chat ONLY) ──────────────────────────────────────────────--
// Returns a small result object; NEVER throws (bridge-down is logged, not fatal).
async function deliver(alert, { live }) {
  if (!live) {
    console.log("[DRY RUN] would send to self-chat (" + SELF_CHAT + "):\n" + alert);
    return { delivered: false, dryRun: true };
  }
  try {
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Hardcoded SELF_CHAT — this module sends to no other JID, ever.
      body: JSON.stringify({ chatId: SELF_CHAT, message: alert }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log("[ledger-sweep] alert sent to self-chat via bridge");
      return { delivered: true };
    }
    const bodyText = await res.text().catch(() => "");
    console.error(`[ledger-sweep] bridge ${res.status}: ${String(bodyText).slice(0, 120)} — alert NOT sent`);
    return { delivered: false, status: res.status };
  } catch (err) {
    console.error(`[ledger-sweep] bridge unreachable (${err && err.message}) — alert NOT sent (no crash)`);
    return { delivered: false, error: err && err.message };
  }
}

// ── self-test (offline, temp DB, no network) ───────────────────────────────--
async function selfTest() {
  const crypto = require("crypto");
  const fs = require("fs");

  const tmp = path.join(os.tmpdir(), `ledger-sweep-test-${crypto.randomBytes(4).toString("hex")}.db`);
  process.env.WORK_LEDGER_DB = tmp;

  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗", m); } };

  let ledger;
  try {
    ledger = require("./alfred-work-ledger");
    ledger.open(tmp); // honor the temp path explicitly

    // Seed: one item we'll AGE into "processing" stuck, plus fresh items that must NOT show.
    const stuckId = ledger.record({ source: "wa", messageId: "old1", sender: SELF_CHAT, text: "תקוע: ההזמנה של כהן לא זזה כבר שעתיים" });
    ledger.transition(stuckId, "processing");

    const freshId = ledger.record({ source: "email", messageId: "fresh1", text: "הצעת מחיר טרייה" });
    ledger.transition(freshId, "processing"); // active but NOT aged → must not be listed

    ledger.record({ source: "voice", messageId: "fresh2", text: "עוד בקשה טרייה" }); // received, fresh

    // AGE the stuck item to ~2h ago by reaching into the SAME temp DB directly.
    const Database = require("better-sqlite3");
    const raw = new Database(tmp);
    const twoHoursAgo = Date.now() - 7200000;
    raw.prepare("UPDATE work_items SET updated_at=? WHERE id=?").run(twoHoursAgo, stuckId);
    raw.close();

    // Re-open via the ledger so the aged row is read back through the public API.
    ledger.open(tmp);

    // Run the real sweep + formatter against a 90-min threshold.
    const { sweepResult, alert } = runSweep(ledger, 90);

    // Assertions on the sweep result.
    ok(sweepResult.stuck.length === 1, `exactly 1 stuck item (got ${sweepResult.stuck.length})`);
    ok(sweepResult.stuck.length === 1 && sweepResult.stuck[0].id === stuckId, "stuck item is the aged one");

    // Assertions on the produced alert TEXT.
    const stuckPrefix = stuckId.slice(0, 8);
    const freshPrefix = freshId.slice(0, 8);
    ok(alert.includes(stuckPrefix), `alert contains stuck id-prefix [${stuckPrefix}]`);
    ok(alert.includes("1 משימות תקועות"), "alert states the correct stuck count (1)");
    ok(!alert.includes(freshPrefix), `fresh item [${freshPrefix}] is NOT listed`);
    ok(alert.includes('סה"כ: 3'), "stats summary shows total 3");
    ok(!alert.includes("הכל בטיפול"), "non-empty sweep does not use the clean banner");

    // The clean-path banner (no stuck) renders correctly.
    const cleanAlert = formatAlert({ stats: { inHandling: 2, done: 1, dropped: 0, failed: 0, total: 3 }, stuck: [] }, 90);
    ok(cleanAlert.includes("✅ הכל בטיפול"), "clean sweep uses ✅ הכל בטיפול banner");

    // Delivery must be forced dry-run during self-test (NEVER POST).
    const d = await deliver(alert, { live: false });
    ok(d.dryRun === true && d.delivered === false, "self-test delivery is dry-run (no network)");

    try { ledger.open(":memory:"); } catch { /* release file handle on temp db */ }
  } catch (e) {
    fail++;
    console.error("  ✗ self-test threw:", e && e.message);
  } finally {
    // Clean up temp DB + WAL/SHM siblings.
    for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) {
      try { fs.rmSync(f, { force: true }); } catch { /* noop */ }
    }
  }

  console.log(`\nSWEEP SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── main / CLI ─────────────────────────────────────────────────────────────--
async function main() {
  const cmd = process.argv[2];
  if (cmd === "self-test" || cmd === "--self-test") return selfTest();

  const olderMin = Number(getArg("older-min", String(DEFAULT_OLDER_MIN)));
  const olderMinSafe = Number.isFinite(olderMin) && olderMin > 0 ? olderMin : DEFAULT_OLDER_MIN;
  const live = hasFlag("live") || process.env.SEND_MODE === "live";

  const ledger = require("./alfred-work-ledger");
  const { alert } = runSweep(ledger, olderMinSafe);
  await deliver(alert, { live });
}

if (require.main === module) {
  main().catch((e) => { console.error("ERROR:", e && e.message); process.exit(1); });
}

module.exports = { formatAlert, fmtItem, runSweep, deliver, SELF_CHAT };
