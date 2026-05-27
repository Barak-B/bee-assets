#!/usr/bin/env node
// alfred-intake.js — UNIFIED MULTI-SOURCE INTAKE (Wave 14, Task #64).
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// Barak: "not just WhatsApp; we have a full data infrastructure of input (e.g. a
// quote by email, a site-tour by WhatsApp) that must flow input→processing→
// editing→output."
//
// alfred-inbound-watcher.js made OpenClaw-alfred the SOLE brain for WhatsApp. But
// WhatsApp is only one mouth of the funnel. Requests also arrive by email (a quote
// request), by calendar (a meeting), by cron (a scheduled trigger), and by hand
// (Barak types something). This module GENERALIZES intake: any source is mapped to
// ONE normalized event schema, then driven through the exact same machinery the
// watcher already proved out — work-ledger tracking + alfred-handle classification
// + the watcher's constitutional outbound resolver.
//
// ── DATA FLOW ────────────────────────────────────────────────────────────────
//   Gmail UNREAD ─┐
//   Calendar ─────┤
//   Cron ─────────┼─▶ normalized event {source,externalId,sender,text,…}
//   Manual ───────┘                      │
//                                         ▼
//                          [ alfred-intake.processEvent ]   ← this file
//                            1. ledger.record  (status: received)
//                            2. ledger.transition → processing
//                            3. map event → alfred-handle message
//                            4. alfred-handle.handle()  → envelope (PROPOSAL only)
//                            5. watcher.resolveOutbound  → constitutional dests
//                            6. POST /send {chatId,message}  (DRY-RUN by default)
//                            7. ledger finalize (done | awaiting_barak | dropped | failed)
//
// We deliberately REUSE the watcher's resolveOutbound + isAllowedDestination +
// SELF_CHAT/DRAFTS/VOICE/NERI_SYNC constants rather than re-deriving them, so the
// outbound contract is defined in exactly one place. WhatsApp itself keeps flowing
// through alfred-inbound-watcher.js (its drain-polling loop is unchanged); this
// module is the on-ramp for every OTHER source plus a manual/cron entry point.
//
// ── 🔒 CONSTITUTIONAL OUTBOUND RULE (immutable) ──────────────────────────────
// Alfred may send to EXACTLY FOUR destinations — all Barak's own internal surfaces.
// It NEVER sends directly to a client (or to an email sender). Any computed
// destination outside these four is dropped + logged. Enforced HERE via the
// watcher's isAllowedDestination, AND by the bridge's Layer-9 gate.
//   1. self-chat   972509554483@s.whatsapp.net    (summaries / clarifications)
//   2. Drafts      120363407758194119@g.us         (reviewable reply drafts)
//   3. Voice       120363409101459201@g.us         (voice-memo transcripts)
//   4. Neri sync   120363425994041413@g.us         (Neri coordination)
//
// ── SAFETY DEFAULT ───────────────────────────────────────────────────────────
// SEND_MODE defaults to "dry-run": we log exactly what we *would* POST to the
// bridge but do not actually send. Flip to live only with SEND_MODE=live AFTER the
// bridge is paired + you've eyeballed a dry-run. Gmail is READ-ONLY always: this
// module only LISTS unread mail — it never deletes, modifies, marks-read, or sends
// email. Building/running in dry-run is non-destructive.
//
// ── GRACEFUL DEGRADATION ─────────────────────────────────────────────────────
// Optional deps degrade like vision/voice do in the rest of Alfred — they never
// crash the funnel:
//   • work-ledger (better-sqlite3) missing → tracking is a no-op, processing continues.
//   • googleapis / Gmail creds missing or auth fails → fromGmail returns
//     {ok:false, reason:"gmail_not_wired", detail} and the process keeps running.
//
// ── USAGE ────────────────────────────────────────────────────────────────────
//   node alfred-intake.js gmail [--max N]        # poll UNREAD Gmail once, DRY-RUN
//   node alfred-intake.js manual --text "..."    # inject one manual event, DRY-RUN
//   node alfred-intake.js self-test              # offline invariant checks, no network/LLM
//   (prefix any of the above with SEND_MODE=live to actually POST to the bridge)
//
// ENV: BRIDGE_URL (def http://127.0.0.1:3000) · SEND_MODE (dry-run|live)
//      WORK_LEDGER_DB (override ledger DB path) · INTAKE_LOG (def logs/…)
//      GMAIL_TOKEN_FILE / GMAIL_CLIENT_FILE (override Gmail cred paths)

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { handle } = require("./alfred-handle");

// The watcher OWNS the constitutional outbound contract. Reuse it — do not redefine.
const watcher = require("./alfred-inbound-watcher");
const {
  resolveOutbound,
  isAllowedDestination,
  normalizeTs,
  SELF_CHAT,
  DRAFTS,
  VOICE,
  NERI_SYNC,
} = watcher;

// Work-ledger (Task #63) — optional; degrades gracefully if better-sqlite3 is unavailable.
let ledger = null;
try { ledger = require("./alfred-work-ledger"); } catch (e) { /* ledger optional */ }

// ── Config ───────────────────────────────────────────────────────────────────
const BRIDGE_URL = (process.env.BRIDGE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const ARGV       = process.argv.slice(2);
const SEND_MODE  = (process.env.SEND_MODE || "dry-run").toLowerCase();
const LOG_DIR    = path.join(__dirname, "logs");
const LOG_FILE   = process.env.INTAKE_LOG || path.join(LOG_DIR, "intake.jsonl");

// Gmail credential paths — identical defaults to alfred-gmail.js so a single OAuth
// setup (auth-second-account.js) serves both. Overridable for tests/alt accounts.
const GMAIL_CLIENT_FILE = process.env.GMAIL_CLIENT_FILE || path.join(__dirname, "secrets", "google-oauth-client.json");
const GMAIL_TOKEN_FILE  = process.env.GMAIL_TOKEN_FILE  || path.join(os.homedir(), ".alfred-google-token-secondary.json");

// Valid normalized event sources.
const SOURCES = new Set(["wa", "email", "voice", "cal", "cron", "manual"]);

// ── Logging (mirror the watcher: console + best-effort jsonl, never throws) ────
function log(event, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch { /* logging must never break the funnel */ }
}

// ── Normalized event schema ────────────────────────────────────────────────────
// {
//   source: "wa"|"email"|"voice"|"cal"|"cron"|"manual",
//   externalId: string,      // source-native id (Gmail messageId, WA messageId, job name…)
//   sender: string,          // from-address / JID / job name
//   senderKind?: string,     // optional hint ("barak" | "client" | "vendor" | "system"…)
//   text: string,            // the body we classify on
//   mediaType?: string,      // "image" | "document" | …  (handle() preprocesses image/pdf)
//   mediaPath?: string,
//   quotedBody?: string, quotedMessageId?: string, quotedFrom?: string,
//   ts: number,              // ms epoch (normalizeTs-safe on ingest)
//   meta?: object,           // free-form context (subject, threadId, jobName…)
// }
// makeEvent is a small validator/normalizer so every adapter emits the same shape.
function makeEvent(e = {}) {
  const source = SOURCES.has(e.source) ? e.source : "manual";
  return {
    source,
    externalId: e.externalId != null ? String(e.externalId) : null,
    sender: e.sender || "unknown",
    senderKind: e.senderKind || undefined,
    text: e.text || "",
    mediaType: e.mediaType || undefined,
    mediaPath: e.mediaPath || undefined,
    quotedBody: e.quotedBody || undefined,
    quotedMessageId: e.quotedMessageId || undefined,
    quotedFrom: e.quotedFrom || undefined,
    ts: normalizeTs(e.ts),
    meta: e.meta || undefined,
  };
}

// Map a normalized event → the message shape alfred-handle.handle() expects.
// Mirrors alfred-inbound-watcher.mapEventToMessage: only "image"/"document" media
// is forwarded for preprocessing; anything else rides as plain text.
function eventToMessage(evt) {
  const mt = evt.mediaType || "";
  const passMedia = (mt === "image" || mt === "document") ? mt : undefined;
  return {
    source: evt.source,
    sender: evt.sender,
    text: evt.text || "",
    mediaType: passMedia,
    mediaPath: passMedia ? evt.mediaPath : undefined,
    quotedBody: evt.quotedBody || undefined,
    quotedMessageId: evt.quotedMessageId || undefined,
    quotedFrom: evt.quotedFrom || undefined,
    ts: normalizeTs(evt.ts),
    sessionId: `${evt.source}-${evt.externalId || evt.sender || "unknown"}`,
  };
}

// ── Work-ledger helpers (mirror the watcher's ledger accounting) ───────────────
// Only Barak's own self-chat JID is classified "barak" up front; the router/identity
// refines the rest. Email/cron/manual senders are left null (unknown requester kind).
function requesterKind(evt) {
  if (evt.senderKind) return evt.senderKind;
  const d = String(evt.sender || "").replace(/\D/g, "");
  return d.startsWith("972509554483") ? "barak" : null;
}
function ledgerRecord(evt) {
  if (!ledger) return null;
  try {
    return ledger.record({
      source: evt.source,
      messageId: evt.externalId,
      sender: evt.sender,
      requesterKind: requesterKind(evt),
      text: evt.text,
      meta: { ...(evt.meta || {}), mediaType: evt.mediaType || "" },
    });
  } catch (e) { log("ledger_error", { op: "record", err: e.message }); return null; }
}
function ledgerStep(id, status, patch) {
  if (!ledger || !id) return;
  try { ledger.transition(id, status, patch || {}); }
  catch (e) { log("ledger_error", { op: "transition", status, err: e.message }); }
}
// Finalize logic mirrors alfred-inbound-watcher.ledgerFinalize exactly:
//   correction matched      → done (intent: correction)
//   no outbound (log-only)  → dropped
//   draft/clarification sent → awaiting_barak
//   summary only            → done
function ledgerFinalize(id, opts) {
  if (!ledger || !id) return;
  try {
    if (opts.correction) { ledger.transition(id, "done", { intent: "correction" }); return; }
    if (!opts.outboundCount) { ledger.transition(id, "dropped", { intent: opts.intent, urgency: opts.urgency }); return; }
    ledger.transition(id, opts.review ? "awaiting_barak" : "done", {
      intent: opts.intent, urgency: opts.urgency,
      outputDest: (opts.sentDests || []).join(",") || null,
    });
  } catch (e) { log("ledger_error", { op: "finalize", err: e.message }); }
}

// ── Send (mirror the watcher: constitutional guard → dry-run log OR live POST) ──
async function dispatchSend(item) {
  // Constitutional guard (defense in depth) — never send outside the 4 destinations.
  if (!isAllowedDestination(item.jid)) {
    log("BLOCKED_non_constitutional_dest", { jid: item.jid, kind: item.kind });
    return false;
  }
  if (SEND_MODE !== "live") {
    log("DRYRUN_send", { jid: item.jid, kind: item.kind, target: item.target, preview: (item.text || "").slice(0, 140) });
    return true; // intended routing is valid — count it for ledger accounting
  }
  try {
    const r = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: item.jid, message: item.text }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      log("send_failed", { jid: item.jid, kind: item.kind, status: r.status, body: body.slice(0, 200) });
      return false;
    }
    log("sent", { jid: item.jid, kind: item.kind, target: item.target });
    return true;
  } catch (e) {
    log("send_error", { jid: item.jid, kind: item.kind, err: e.message });
    return false;
  }
}

// ── Core: process ONE normalized event end-to-end ──────────────────────────────
// record (received) → processing → handle() → resolveOutbound → dispatch (dry-run
// by default) → finalize. Returns a small summary for callers/tests:
//   { ok, workId, intent, urgency, outboundCount, sentDests, status }
async function processEvent(evt) {
  const e = makeEvent(evt);
  const wid = ledgerRecord(e);            // status: received
  const message = eventToMessage(e);
  ledgerStep(wid, "processing");

  let env;
  try {
    env = await handle(message);
  } catch (err) {
    log("handle_error", { source: e.source, externalId: e.externalId, err: err.message });
    ledgerStep(wid, "failed", { error: err.message });
    return { ok: false, workId: wid, status: "failed", error: err.message, outboundCount: 0, sentDests: [] };
  }

  const outbound = resolveOutbound(env);
  const correction = !!(env && env.correction && env.correction.matched);
  const intent = env && env.classification && env.classification.intent;
  const urgency = env && env.classification && env.classification.urgency;
  log("processed", {
    source: e.source,
    externalId: e.externalId,
    intent,
    target: env && env.dispatch && env.dispatch.target,
    outboundCount: outbound.length,
  });

  const sentDests = [];
  for (const o of outbound) { if (await dispatchSend(o)) sentDests.push(o.jid); }

  const review = outbound.some((o) => o.kind === "draft" || o.kind === "clarification");
  ledgerFinalize(wid, { correction, intent, urgency, outboundCount: outbound.length, review, sentDests });

  // Derive the final ledger status we drove to (for callers/tests).
  const status = correction ? "done"
    : (!outbound.length ? "dropped"
      : (review ? "awaiting_barak" : "done"));

  return { ok: true, workId: wid, intent, urgency, outboundCount: outbound.length, sentDests, status };
}

// ── Source adapters ────────────────────────────────────────────────────────────

// fromManual(text, sender?) — wrap a hand-typed request and run it through the funnel.
async function fromManual(text, sender) {
  const evt = makeEvent({
    source: "manual",
    externalId: `manual-${Date.now()}`,
    sender: sender || SELF_CHAT,          // Barak by default → requesterKind "barak"
    text: text || "",
    ts: Date.now(),
    meta: { via: "manual" },
  });
  return processEvent(evt);
}

// fromCron(jobName, text) — wrap a scheduled trigger (heartbeat, digest, sweep…).
async function fromCron(jobName, text) {
  const evt = makeEvent({
    source: "cron",
    externalId: `cron-${jobName}-${Date.now()}`,
    sender: jobName || "cron",
    senderKind: "system",
    text: text || "",
    ts: Date.now(),
    meta: { jobName: jobName || null },
  });
  return processEvent(evt);
}

// fromGmail({max}) — poll UNREAD Gmail and funnel each message.
// READ-ONLY: lists unread inbox + fetches metadata/snippet only. Never deletes,
// modifies, marks-read, or sends. Reuses the same OAuth client+token as
// alfred-gmail.js. On any wiring/auth problem returns {ok:false, reason, detail}
// and does NOT throw — mirrors how vision/voice degrade.
async function fromGmail({ max = 10 } = {}) {
  // 1) optional dep present?
  let google;
  try { ({ google } = require("googleapis")); }
  catch (e) { return { ok: false, reason: "gmail_not_wired", detail: `googleapis not installed: ${e.message}` }; }

  // 2) credentials present?
  if (!fs.existsSync(GMAIL_CLIENT_FILE)) {
    return { ok: false, reason: "gmail_not_wired", detail: `OAuth client missing at ${GMAIL_CLIENT_FILE}` };
  }
  if (!fs.existsSync(GMAIL_TOKEN_FILE)) {
    return { ok: false, reason: "gmail_not_wired", detail: `OAuth token missing at ${GMAIL_TOKEN_FILE} (run: node auth-second-account.js)` };
  }

  // 3) build auth (same pattern as alfred-gmail.js, incl. token auto-refresh persist)
  let g;
  try {
    const raw = JSON.parse(fs.readFileSync(GMAIL_CLIENT_FILE, "utf8"));
    const c = raw.installed || raw.web;
    if (!c || !c.client_id || !c.client_secret) {
      return { ok: false, reason: "gmail_not_wired", detail: "OAuth client file missing client_id/client_secret" };
    }
    const auth = new google.auth.OAuth2(c.client_id, c.client_secret, "http://localhost");
    auth.setCredentials(JSON.parse(fs.readFileSync(GMAIL_TOKEN_FILE, "utf8")));
    auth.on("tokens", (t) => {
      try {
        const cur = JSON.parse(fs.readFileSync(GMAIL_TOKEN_FILE, "utf8"));
        fs.writeFileSync(GMAIL_TOKEN_FILE, JSON.stringify({ ...cur, ...t }, null, 2), { mode: 0o600 });
      } catch { /* best-effort token persist */ }
    });
    g = google.gmail({ version: "v1", auth });
  } catch (e) {
    return { ok: false, reason: "gmail_not_wired", detail: `auth setup failed: ${e.message}` };
  }

  // 4) list UNREAD inbox (read-only)
  let msgs;
  try {
    const r = await g.users.messages.list({ userId: "me", q: "is:unread in:inbox", maxResults: max });
    msgs = r.data.messages || [];
  } catch (e) {
    // auth failure (expired refresh, revoked grant) lands here — degrade, don't crash.
    return { ok: false, reason: "gmail_not_wired", detail: `gmail list failed: ${e.message}` };
  }

  // 5) map each → normalized event → funnel
  const results = [];
  for (const m of msgs) {
    let evt;
    try {
      const d = await g.users.messages.get({
        userId: "me", id: m.id, format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = (d.data.payload && d.data.payload.headers) || [];
      const h = (name) => {
        const found = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
        return found ? found.value : "";
      };
      const from = h("From");
      const subject = h("Subject");
      const snippet = (d.data.snippet || "").trim();
      // Extract a bare address from "Name <addr@x>" for the sender field.
      const addrMatch = from.match(/<([^>]+)>/);
      const senderAddr = (addrMatch ? addrMatch[1] : from).trim() || "unknown";
      evt = makeEvent({
        source: "email",
        externalId: m.id,
        sender: senderAddr,
        senderKind: "client",     // email defaults to external; router/identity refines
        text: `${subject}\n${snippet}`.trim(),
        ts: Number(d.data.internalDate) || Date.now(),
        meta: { subject, from, threadId: m.threadId, snippet },
      });
    } catch (e) {
      log("gmail_msg_error", { id: m.id, err: e.message });
      continue; // skip this one, keep going
    }
    const res = await processEvent(evt);
    results.push({ id: m.id, ...res });
  }

  log("gmail_polled", { count: msgs.length, processed: results.length, sendMode: SEND_MODE });
  return { ok: true, count: msgs.length, processed: results.length, results };
}

// ── Offline self-test (no network, no LLM, no cost) ────────────────────────────
// (a) a normalized email event records in the ledger w/ source "email" + transitions;
// (b) resolveOutbound on a synthetic client-draft envelope → ONLY constitutional dests;
// (c) a log-only/noise envelope → zero outbound.
function selfTest() {
  let pass = 0, fail = 0;
  const assert = (cond, msg) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", msg); } };

  // Force the ledger onto a throwaway temp DB so we never touch real state.
  const tmpDb = path.join(os.tmpdir(), `intake-selftest-${process.pid}-${Date.now()}.db`);
  process.env.WORK_LEDGER_DB = tmpDb;
  let lg = null;
  try { lg = require("./alfred-work-ledger"); } catch { /* ledger optional */ }
  if (lg && lg.open) { try { lg.open(tmpDb); } catch { /* fall through */ } }

  // (a) normalized email event → ledger record (source "email") + transitions.
  if (lg) {
    const evt = makeEvent({
      source: "email", externalId: "selftest-eml-1", sender: "client@example.com",
      text: "בקשת הצעת מחיר\nשלום, אשמח להצעה למערכת 10 קילו-וואט", ts: 1700000000000,
      meta: { subject: "בקשת הצעת מחיר" },
    });
    assert(evt.source === "email", "email event normalized to source 'email'");
    assert(evt.ts === 1700000000000, "email event ts preserved (ms)");

    const id = ledgerRecord(evt);
    assert(!!id, "email event records in ledger → id");
    const row1 = lg.get(id);
    assert(row1 && row1.source === "email", "ledger row source is 'email'");
    assert(row1 && row1.status === "received", "new ledger item status 'received'");

    ledgerStep(id, "processing");
    assert(lg.get(id).status === "processing", "transition → processing");

    // finalize as a draft → awaiting_barak (mirrors the watcher's review path)
    ledgerFinalize(id, { correction: false, intent: "client-quote", urgency: "medium", outboundCount: 2, review: true, sentDests: [DRAFTS, SELF_CHAT] });
    const row2 = lg.get(id);
    assert(row2 && row2.status === "awaiting_barak", "draft finalize → awaiting_barak");
    assert(row2 && (row2.output_dest || "").includes("@g.us"), "output_dest recorded on finalize");

    // idempotency: same source:externalId returns same id
    const idDup = ledgerRecord(evt);
    assert(idDup === id, "ledger idempotent on source:externalId");

    // a dropped (log-only) item finalizes to 'dropped'
    const noiseEvt = makeEvent({ source: "email", externalId: "selftest-eml-2", sender: "noreply@x.com", text: "newsletter", ts: 1700000001000 });
    const nid = ledgerRecord(noiseEvt);
    ledgerStep(nid, "processing");
    ledgerFinalize(nid, { correction: false, intent: "noise", urgency: "low", outboundCount: 0, review: false, sentDests: [] });
    assert(lg.get(nid).status === "dropped", "no-outbound finalize → dropped");
  } else {
    console.error("  (ledger unavailable — better-sqlite3 missing; skipping ledger asserts but NOT failing: graceful-degradation contract)");
  }

  // (b) resolveOutbound on a synthetic client-draft envelope → ONLY constitutional dests.
  // NOTE: this is the watcher's own resolveOutbound (imported), exercised WITHOUT
  // calling handle() — so the self-test stays offline and costs no LLM call.
  const draftEnv = { dispatch: { target: "drafts-group", messageOut: "x", summaryToBarak: "y", clarificationPrompt: null } };
  const ob = resolveOutbound(draftEnv);
  assert(ob.length === 2, "client-draft envelope → 2 outbound (summary + draft)");
  assert(ob.every((o) => isAllowedDestination(o.jid)), "every outbound dest is constitutional");
  const dests = new Set(ob.map((o) => o.jid));
  assert(dests.has(DRAFTS) && dests.has(SELF_CHAT), "draft→DRAFTS, summary→SELF_CHAT");
  // No outbound may ever target something outside the 4 constitutional JIDs.
  const allowed = new Set([SELF_CHAT, DRAFTS, VOICE, NERI_SYNC]);
  assert(ob.every((o) => allowed.has(o.jid)), "no outbound escapes the 4 constitutional JIDs");

  // (c) a log-only / noise envelope → zero outbound (no self-chat spam).
  const noiseEnv = { dispatch: { target: "log-only", messageOut: null, summaryToBarak: "should-not-send", clarificationPrompt: null } };
  assert(resolveOutbound(noiseEnv).length === 0, "log-only/noise envelope → 0 outbound");
  // correction short-circuit and error/null envelopes also yield nothing.
  assert(resolveOutbound({ correction: { matched: true }, dispatch: { target: "log-only" } }).length === 0, "correction match → 0 outbound");
  assert(resolveOutbound({ error: "empty text" }).length === 0, "error envelope → 0 outbound");

  // event normalization edge cases
  const m = eventToMessage(makeEvent({ source: "email", externalId: "z", sender: "a@b.com", text: "hi", ts: 1700000000 }));
  assert(m.source === "email" && m.text === "hi", "eventToMessage carries source + text");
  assert(m.sessionId === "email-z", "sessionId derives from source+externalId");
  assert(m.ts === 1700000000000, "eventToMessage normalizes seconds → ms");
  const badSrc = makeEvent({ source: "twitter", text: "x" });
  assert(badSrc.source === "manual", "unknown source falls back to 'manual'");

  // cleanup temp DB
  if (lg) { try { lg.open(path.join(os.tmpdir(), `intake-noop-${process.pid}.db`)); } catch { /* noop */ } }
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.rmSync(tmpDb + suffix, { force: true }); } catch { /* noop */ }
  }

  console.log(`\nINTAKE SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────--
function getArg(name, def) {
  const i = ARGV.indexOf("--" + name);
  return i !== -1 && ARGV[i + 1] ? ARGV[i + 1] : def;
}

async function main() {
  const cmd = ARGV[0];

  if (cmd === "self-test" || cmd === "--self-test") return selfTest();

  if (cmd === "gmail") {
    const max = Number(getArg("max", "10")) || 10;
    log("startup", { mode: "gmail", max, sendMode: SEND_MODE, ledger: ledger ? "on" : "off",
      bridge: BRIDGE_URL, clientFile: GMAIL_CLIENT_FILE, tokenFile: GMAIL_TOKEN_FILE });
    if (SEND_MODE !== "live") log("notice", { msg: "DRY-RUN — nothing actually sent. Use SEND_MODE=live to enable sends." });
    const r = await fromGmail({ max });
    if (!r.ok) {
      log("gmail_unavailable", { reason: r.reason, detail: r.detail });
      console.error(`Gmail intake unavailable: ${r.reason} — ${r.detail}`);
      return; // graceful: exit 0, this is an expected/degraded state, not a crash
    }
    log("gmail_done", { count: r.count, processed: r.processed });
    return;
  }

  if (cmd === "manual") {
    const text = getArg("text");
    if (!text) { console.error('manual requires --text "..."'); process.exit(2); }
    log("startup", { mode: "manual", sendMode: SEND_MODE, ledger: ledger ? "on" : "off", bridge: BRIDGE_URL });
    if (SEND_MODE !== "live") log("notice", { msg: "DRY-RUN — nothing actually sent. Use SEND_MODE=live to enable sends." });
    const r = await fromManual(text, getArg("sender"));
    log("manual_done", r);
    return;
  }

  console.error("usage: node alfred-intake.js [gmail [--max N] | manual --text \"...\" [--sender X] | self-test]");
  console.error("  (prefix with SEND_MODE=live to actually POST to the bridge; default is dry-run)");
  process.exit(2);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL:", err.message);
    if (err.stack) console.error(err.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  });
}

module.exports = {
  // core
  processEvent,
  makeEvent,
  eventToMessage,
  // adapters
  fromGmail,
  fromManual,
  fromCron,
  // re-exported constitutional constants (single source of truth = the watcher)
  SELF_CHAT, DRAFTS, VOICE, NERI_SYNC,
};
