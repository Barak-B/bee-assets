#!/usr/bin/env node
// alfred-inbound-watcher.js — MIGRATION KEYSTONE (Wave 13).
//
// ── THE "TWO ALFREDS" PROBLEM ────────────────────────────────────────────────
// We had two systems both wanting to be Alfred:
//   • OpenClaw-alfred  — the persona + brain (alfred-router/enrich/compose/clarify
//                        /vision/pdf/voice-action/correction-detector). Faster,
//                        more professional. → THIS IS ALFRED. (Barak's decision.)
//   • Hermes Agent     — the WhatsApp transport (Baileys bridge on :3000) + heavy
//                        tools/holographic memory. → BECOMES TRANSPORT + BACKEND.
//
// This watcher is the bridge between the two layers. It makes OpenClaw-alfred the
// SOLE brain that answers WhatsApp, using Hermes purely as the pipe.
//
// ── DATA FLOW ────────────────────────────────────────────────────────────────
//   WhatsApp ─▶ Hermes bridge (:3000) ─▶ queue
//                                          │  GET /messages   (DRAIN — splices queue)
//                                          ▼
//                            [ alfred-inbound-watcher ]   ← this file
//                                          │  maps event → alfred-handle message
//                                          ▼
//                            alfred-handle.handle()  /  alfred-voice-action.processVoice()
//                                          │  returns envelope (PROPOSAL only)
//                                          ▼
//                            resolveOutbound() → constitutional destinations only
//                                          │  POST /send {chatId,message}
//                                          ▼
//                            Hermes bridge ─▶ WhatsApp
//
// ── ⚠ DRAIN CONFLICT ─────────────────────────────────────────────────────────
// GET /messages is a *drain* (messageQueue.splice). Only ONE consumer may poll it.
// The Hermes gateway also polls /messages when it manages WhatsApp itself. You MUST
// run the bridge WITHOUT the Hermes gateway's WhatsApp polling while this watcher is
// live, or the two will steal messages from each other. See the supervisor runbook
// (Task #59). Symptom of a conflict: ~50% of inbounds silently vanish.
//
// ── 🔒 CONSTITUTIONAL OUTBOUND RULE (immutable) ──────────────────────────────
// Alfred may send to EXACTLY FOUR destinations — all of them Barak's own internal
// surfaces. It NEVER sends directly to a client. (Client sends are always Barak's
// manual forward from the Drafts group.) Any computed destination outside these
// four is dropped + logged. This is enforced here AND by the bridge's Layer-9 gate.
//   1. self-chat   972509554483@s.whatsapp.net    (summaries / clarifications)
//   2. Drafts      120363407758194119@g.us         (reviewable reply drafts)
//   3. Voice       120363409101459201@g.us         (voice-memo transcripts)
//   4. Neri sync   120363425994041413@g.us         (Neri coordination)
//
// ── SAFETY DEFAULT ───────────────────────────────────────────────────────────
// SEND_MODE defaults to "dry-run": the watcher logs exactly what it *would* send
// but does not POST. Flip to live only with --live (or SEND_MODE=live) AFTER the
// bridge is paired + you've eyeballed a dry-run. Building/running in dry-run is
// non-destructive.
//
// ── USAGE ────────────────────────────────────────────────────────────────────
//   node alfred-inbound-watcher.js              # poll loop, DRY-RUN (safe default)
//   node alfred-inbound-watcher.js --live       # poll loop, actually sends
//   node alfred-inbound-watcher.js --once       # poll exactly once, then exit
//   node alfred-inbound-watcher.js --self-test  # offline invariant checks, no network
//
// ENV: BRIDGE_URL (def http://127.0.0.1:3000) · POLL_INTERVAL_MS (def 2500)
//      SEND_MODE (dry-run|live) · GROQ_API_KEY (enables voice transcription)
//      GROQ_WHISPER_MODEL (def whisper-large-v3) · WATCHER_LOG (def logs/…)

"use strict";

const fs = require("fs");
const path = require("path");
const { handle } = require("./alfred-handle");
const { processVoice } = require("./alfred-voice-action");

// Work-ledger (Task #63) — optional; degrades gracefully if better-sqlite3 is unavailable.
let ledger = null;
try { ledger = require("./alfred-work-ledger"); } catch (e) { /* ledger optional */ }

// Data archive (Task #67) — optional; files every artifact into E:\bee-data.
let archive = null;
try { archive = require("./alfred-archive"); } catch (e) { /* archive optional */ }

// Memory-graph (Task #70) — optional; builds the local KG from each message.
let memgraph = null;
try { memgraph = require("./alfred-memory-graph"); } catch (e) { /* memgraph optional */ }
function memgraphIngest(classification, text, sender) {
  if (!memgraph) return;
  try {
    if (classification) memgraph.ingestHints({ classification, sender, source: "wa" });
    if (text) memgraph.ingestText({ text, sender, source: "wa" });
  } catch (e) { log("memgraph_error", { err: e.message }); }
}

// ── Constitutional destinations (the only 4 JIDs Alfred may ever send to) ─────
const SELF_CHAT = "972509554483@s.whatsapp.net";
const DRAFTS    = "120363407758194119@g.us";
const VOICE     = "120363409101459201@g.us";
const NERI_SYNC = "120363425994041413@g.us";
const ALLOWED   = new Set([SELF_CHAT, DRAFTS, VOICE, NERI_SYNC]);

// alfred-handle dispatch.target → concrete JID. Anything not listed → null (no send).
// "ideas-drawer" has no dedicated group among the 4, so ideas surface to Barak's
// self-chat (he files them from there).
const TARGET_JID = {
  "self-chat":    SELF_CHAT,
  "drafts-group": DRAFTS,
  "ideas-drawer": SELF_CHAT,
  "voice-group":  VOICE,
  "neri-sync":    NERI_SYNC,
  "log-only":     null,
};

// ── Config ───────────────────────────────────────────────────────────────────
const BRIDGE_URL       = (process.env.BRIDGE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 2500;
const ARGV             = process.argv.slice(2);
const SEND_MODE        = (ARGV.includes("--live") ? "live" : (process.env.SEND_MODE || "dry-run")).toLowerCase();
const LOG_DIR          = path.join(__dirname, "logs");
const LOG_FILE         = process.env.WATCHER_LOG || path.join(LOG_DIR, "inbound-watcher.jsonl");
const FAILED_FILE      = path.join(LOG_DIR, "inbound-watcher.failed.jsonl");

// ── State ──────────────────────────────────────────────────────────────────--
const seen = new Set();          // dedup processed messageIds
const SEEN_MAX = 1000;
let consecutiveErrors = 0;
let pollTimer = null;
let stopping = false;

// Loop-break heuristic: our own posts (summaries / voice posts) can be echoed back
// by the bridge in self-chat mode. The bridge has its own echo guard, but we add a
// belt-and-suspenders check on the recognizable Alfred prefixes.
const OWN_POST_PREFIXES = ["⚡ *📨", "🎤 *"];

// ── Logging ────────────────────────────────────────────────────────────────--
function log(event, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch { /* logging must never break the loop */ }
}

function persistFailed(item, srcEvent, reason) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(FAILED_FILE, JSON.stringify({
      t: new Date().toISOString(), reason,
      jid: item.jid, kind: item.kind, text: item.text,
      srcMessageId: srcEvent?.messageId, srcChatId: srcEvent?.chatId,
    }) + "\n");
  } catch { /* best-effort */ }
}

// ── Pure helpers (exported for --self-test) ───────────────────────────────────
function isAllowedDestination(jid) {
  return !!jid && ALLOWED.has(jid);
}

function resolveTargetJid(target) {
  return Object.prototype.hasOwnProperty.call(TARGET_JID, target) ? TARGET_JID[target] : null;
}

// Baileys timestamps arrive as seconds (number) or a Long-ish {low,high}. alfred-handle
// expects ms (it does `new Date(ts)`). Normalize defensively.
function normalizeTs(ts) {
  if (ts && typeof ts === "object" && "low" in ts) ts = ts.low;
  let n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  if (n < 1e12) n *= 1000; // looks like seconds → ms
  return n;
}

function looksLikeOwnPost(text) {
  const t = (text || "").trimStart();
  return OWN_POST_PREFIXES.some((p) => t.startsWith(p));
}

// Map a bridge /messages event → the message shape alfred-handle.handle() expects.
// handle() only preprocesses mediaType "image" and "document" (.pdf). Other media
// (video/sticker/etc.) are passed as plain text (the bridge fills body with a
// "[type received]" placeholder + any caption). Voice (ptt/audio) is routed
// separately to processVoice() and never reaches this mapper.
function mapEventToMessage(event) {
  const mt = event.mediaType || "";
  const passMedia = (mt === "image" || mt === "document") ? mt : undefined;
  const firstUrl = Array.isArray(event.mediaUrls) && event.mediaUrls.length ? event.mediaUrls[0] : null;
  return {
    source: "whatsapp",
    sender: event.senderId,
    text: event.body || "",
    mediaType: passMedia,
    mediaPath: passMedia && firstUrl ? firstUrl : undefined,
    quotedBody: event.quotedBody || undefined,
    quotedMessageId: event.quotedMessageId || undefined,
    quotedFrom: event.quotedFrom || undefined,
    ts: normalizeTs(event.timestamp),
    sessionId: `wa-${event.chatId || "unknown"}`,
  };
}

// Turn an alfred-handle envelope into a list of constitutional outbound items.
// Rules:
//   • target "log-only" (noise / suppressed) → send NOTHING.
//   • correction short-circuit → send NOTHING (detector already handled it).
//   • summaryToBarak / clarificationPrompt → always to self-chat.
//   • messageOut (draft) → to its target JID, but only drafts-group/self-chat/ideas-drawer.
//   • final filter: every jid must be in the constitutional allowlist.
function resolveOutbound(env) {
  const out = [];
  if (!env || env.error) return out;
  if (env.correction && env.correction.matched) return out;
  const d = env.dispatch || {};
  if (d.target === "log-only") return out;

  if (d.summaryToBarak) {
    out.push({ kind: "summary", target: "self-chat", jid: SELF_CHAT, text: d.summaryToBarak });
  }
  if (d.clarificationPrompt) {
    out.push({ kind: "clarification", target: "self-chat", jid: SELF_CHAT, text: d.clarificationPrompt });
  }
  if (d.messageOut) {
    const jid = resolveTargetJid(d.target);
    if (jid && (d.target === "drafts-group" || d.target === "self-chat" || d.target === "ideas-drawer")) {
      out.push({ kind: "draft", target: d.target, jid, text: d.messageOut });
    }
  }
  return out.filter((o) => isAllowedDestination(o.jid));
}

// Turn an alfred-voice-action envelope into constitutional outbound items.
function resolveVoiceOutbound(v) {
  const out = [];
  if (!v || !v.ok) return out;
  if (v.voiceGroupPost && v.voiceGroupJid) {
    out.push({ kind: "voice-post", target: "voice-group", jid: v.voiceGroupJid, text: v.voiceGroupPost });
  }
  if (v.selfChatProposal) {
    out.push({ kind: "voice-proposal", target: "self-chat", jid: v.selfChatJid || SELF_CHAT, text: v.selfChatProposal });
  }
  if (v.clarificationPrompt) {
    out.push({ kind: "clarification", target: "self-chat", jid: SELF_CHAT, text: v.clarificationPrompt });
  }
  return out.filter((o) => isAllowedDestination(o.jid));
}

// ── Voice transcription (Groq Whisper) ────────────────────────────────────────
// Optional: only active when GROQ_API_KEY is set. Uses Node 18+ global fetch/FormData/Blob.
// Returns { ok:true, text } or { ok:false, reason }. Never throws — failures defer the
// one voice event and the loop continues.
async function transcribeAudio(filePath) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, reason: "no_GROQ_API_KEY (voice transcription not wired)" };
  if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
    return { ok: false, reason: "node<18_no_global_fetch_FormData" };
  }
  try {
    const buf = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("file", new Blob([buf]), path.basename(filePath));
    form.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3");
    form.append("language", "he");
    form.append("response_format", "json");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) return { ok: false, reason: `groq_http_${r.status}` };
    const j = await r.json();
    const text = (j.text || "").trim();
    return text ? { ok: true, text } : { ok: false, reason: "groq_empty_transcript" };
  } catch (e) {
    return { ok: false, reason: `groq_error: ${e.message}` };
  }
}

// ── Send ───────────────────────────────────────────────────────────────────--
async function dispatchSend(item, srcEvent) {
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
      persistFailed(item, srcEvent, `http_${r.status}`);
      return false;
    }
    log("sent", { jid: item.jid, kind: item.kind, target: item.target });
    return true;
  } catch (e) {
    log("send_error", { jid: item.jid, kind: item.kind, err: e.message });
    persistFailed(item, srcEvent, e.message);
    return false;
  }
}

// ── Work-ledger helpers (Task #63) — track every request input→output ─────────
function requesterKind(jid) {
  const d = String(jid || "").replace(/\D/g, "");
  return d.startsWith("972509554483") ? "barak" : null; // router/identity refines the rest
}
function ledgerRecord(event, source) {
  if (!ledger) return null;
  try {
    return ledger.record({
      source, messageId: event.messageId, sender: event.senderId,
      requesterKind: requesterKind(event.senderId),
      text: event.body, meta: { chatId: event.chatId, mediaType: event.mediaType || "" },
    });
  } catch (e) { log("ledger_error", { op: "record", err: e.message }); return null; }
}
function ledgerStep(id, status, patch) {
  if (!ledger || !id) return;
  try { ledger.transition(id, status, patch || {}); }
  catch (e) { log("ledger_error", { op: "transition", status, err: e.message }); }
}
function ledgerFinalize(id, opts) {
  if (!ledger || !id) return;
  try {
    if (opts.correction) { ledger.transition(id, "done", { intent: "correction" }); return; }
    if (!opts.outboundCount) { ledger.transition(id, "dropped", { intent: opts.intent, urgency: opts.urgency }); return; }
    ledger.transition(id, opts.review ? "awaiting_barak" : "done", {
      intent: opts.intent, urgency: opts.urgency, outputDest: (opts.sentDests || []).join(",") || null,
    });
  } catch (e) { log("ledger_error", { op: "finalize", err: e.message }); }
}

// ── Archive helpers (Task #67) — file every artifact into E:\bee-data ─────────
function archiveArtifacts(event, env, wid) {
  if (!archive) return;
  try {
    const ts = normalizeTs(event.timestamp);
    const intent = env && env.classification && env.classification.intent;
    const meta = { ts, source: "wa", sender: event.senderId, ledgerId: wid, intent };
    const firstUrl = Array.isArray(event.mediaUrls) && event.mediaUrls.length ? event.mediaUrls[0] : null;
    const mt = event.mediaType || "";
    if (firstUrl && mt === "image") archive.archiveFile({ srcPath: firstUrl, type: "image", meta });
    else if (firstUrl && mt === "document" && /\.pdf$/i.test(firstUrl)) archive.archiveFile({ srcPath: firstUrl, type: "pdf", meta });
    if (event.body) archive.appendConversation({ contact: event.chatId || event.senderId, direction: "in", text: event.body, ts, meta: { messageId: event.messageId } });
    const summary = env && env.dispatch && env.dispatch.summaryToBarak;
    if (summary) archive.archiveSummary({ text: summary, intent, meta });
  } catch (e) { log("archive_error", { id: event.messageId, err: e.message }); }
}
function archiveVoice(event, v, tr, wid) {
  if (!archive) return;
  try {
    const ts = normalizeTs(event.timestamp);
    const intent = v && v.classification && v.classification.intent;
    const meta = { ts, source: "voice", sender: event.senderId, ledgerId: wid, intent };
    const audio = Array.isArray(event.mediaUrls) && event.mediaUrls.length ? event.mediaUrls[0] : null;
    let id;
    if (audio) { const r = archive.archiveFile({ srcPath: audio, type: "voice-audio", meta }); if (r && r.ok) id = r.id; }
    const text = (tr && tr.text) || "";
    if (text) archive.archiveTranscript({ id, text, meta });
    if (text || event.body) archive.appendConversation({ contact: event.chatId || event.senderId, direction: "in", text: text || event.body, ts, meta: { messageId: event.messageId, kind: "voice" } });
    const prop = v && v.selfChatProposal;
    if (prop) archive.archiveSummary({ id, text: prop, intent, meta });
  } catch (e) { log("archive_error", { id: event.messageId, err: e.message }); }
}

// ── Per-event processing ──────────────────────────────────────────────────────
function markSeen(id) {
  seen.add(id);
  if (seen.size > SEEN_MAX) {
    const first = seen.values().next().value;
    seen.delete(first);
  }
}

async function processVoiceEvent(event) {
  const wid = ledgerRecord(event, "voice");
  const audioPath = Array.isArray(event.mediaUrls) && event.mediaUrls.length ? event.mediaUrls[0] : null;
  if (!audioPath) { log("voice_no_audio", { id: event.messageId }); ledgerStep(wid, "failed", { error: "no_audio" }); return; }

  const tr = await transcribeAudio(audioPath);
  if (!tr.ok) {
    // Per alfred-voice-action CLI note: on transcription failure the runtime should
    // post a fallback marker. We keep that conservative — only in live mode, only to
    // the voice group, only for Barak's own self-chat memos. The item parks in
    // awaiting_condition (waiting on transcription) so the sweep can surface it.
    log("voice_deferred", { id: event.messageId, reason: tr.reason });
    ledgerStep(wid, "awaiting_condition", { error: tr.reason });
    // Preserve the audio even when transcription isn't wired yet, so nothing is lost.
    if (archive && audioPath) { try { archive.archiveFile({ srcPath: audioPath, type: "voice-audio", meta: { ts: normalizeTs(event.timestamp), source: "voice", sender: event.senderId, ledgerId: wid } }); } catch (e) { log("archive_error", { err: e.message }); } }
    const digits = String(event.senderId || "").replace(/\D/g, "");
    if (SEND_MODE === "live" && digits.startsWith("972509554483")) {
      await dispatchSend({ kind: "voice-failed", target: "voice-group", jid: VOICE, text: "🎤 [תמלול נכשל — הקשב להקלטה]" }, event);
    }
    return;
  }

  ledgerStep(wid, "processing");
  let v;
  try {
    v = await processVoice({
      transcript: tr.text,
      sender: event.senderId,
      ts: normalizeTs(event.timestamp),
      mediaPath: audioPath,
      contactName: event.senderName,
      sessionId: `wa-voice-${event.chatId || "unknown"}`,
    });
  } catch (e) {
    log("voice_handle_error", { id: event.messageId, err: e.message });
    ledgerStep(wid, "failed", { error: e.message });
    return;
  }

  const outbound = resolveVoiceOutbound(v);
  log("voice_processed", { id: event.messageId, intent: v && v.classification && v.classification.intent, outboundCount: outbound.length });
  const sentDests = [];
  for (const o of outbound) { if (await dispatchSend(o, event)) sentDests.push(o.jid); }
  ledgerFinalize(wid, {
    correction: !!(v && v.correctionShortCircuit),
    intent: v && v.classification && v.classification.intent,
    outboundCount: outbound.length,
    review: outbound.some((o) => o.kind === "clarification" || o.kind === "voice-proposal"),
    sentDests,
  });
  archiveVoice(event, v, tr, wid);
  memgraphIngest(v && v.classification, (tr && tr.text) || event.body, event.senderId);
}

async function processEvent(event) {
  if (!event || !event.messageId) return;
  if (seen.has(event.messageId)) return;
  markSeen(event.messageId);

  if (looksLikeOwnPost(event.body)) {
    log("skip_own_echo", { id: event.messageId });
    return;
  }

  const mt = event.mediaType || "";
  if (mt === "ptt" || mt === "audio") {
    return processVoiceEvent(event);
  }

  const wid = ledgerRecord(event, "wa");
  const message = mapEventToMessage(event);
  ledgerStep(wid, "processing");
  let env;
  try {
    env = await handle(message);
  } catch (e) {
    log("handle_error", { id: event.messageId, err: e.message });
    ledgerStep(wid, "failed", { error: e.message });
    return;
  }

  const outbound = resolveOutbound(env);
  log("processed", {
    id: event.messageId,
    intent: env && env.classification && env.classification.intent,
    target: env && env.dispatch && env.dispatch.target,
    outboundCount: outbound.length,
  });
  const sentDests = [];
  for (const o of outbound) { if (await dispatchSend(o, event)) sentDests.push(o.jid); }
  ledgerFinalize(wid, {
    correction: !!(env && env.correction && env.correction.matched),
    intent: env && env.classification && env.classification.intent,
    urgency: env && env.classification && env.classification.urgency,
    outboundCount: outbound.length,
    review: outbound.some((o) => o.kind === "draft" || o.kind === "clarification"),
    sentDests,
  });
  archiveArtifacts(event, env, wid);
  memgraphIngest(env && env.classification, event.body, event.senderId);
}

// ── Poll loop ──────────────────────────────────────────────────────────────--
async function pollOnce() {
  try {
    const r = await fetch(`${BRIDGE_URL}/messages`, { method: "GET" });
    if (!r.ok) { consecutiveErrors++; log("poll_non200", { status: r.status }); return; }
    const events = await r.json();
    consecutiveErrors = 0;
    if (Array.isArray(events) && events.length) {
      log("polled", { count: events.length });
      for (const ev of events) await processEvent(ev);
    }
  } catch (e) {
    consecutiveErrors++;
    // Bridge down (ECONNREFUSED) is expected before pairing — log quietly, keep trying.
    log("poll_error", { err: e.message, consecutive: consecutiveErrors });
  }
}

function scheduleNext() {
  if (stopping) return;
  // Exponential-ish backoff while the bridge is unreachable, capped at 30s.
  const delay = consecutiveErrors > 0
    ? Math.min(POLL_INTERVAL_MS * Math.min(consecutiveErrors, 10), 30000)
    : POLL_INTERVAL_MS;
  pollTimer = setTimeout(loop, delay);
}

function loop() {
  pollOnce().finally(scheduleNext);
}

// ── Offline self-test (no network, no LLM, no cost) ───────────────────────────
function selfTest() {
  let pass = 0, fail = 0;
  const assert = (cond, msg) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", msg); } };

  // target → jid
  assert(resolveTargetJid("self-chat") === SELF_CHAT, "self-chat → SELF_CHAT");
  assert(resolveTargetJid("drafts-group") === DRAFTS, "drafts-group → DRAFTS");
  assert(resolveTargetJid("ideas-drawer") === SELF_CHAT, "ideas-drawer → SELF_CHAT");
  assert(resolveTargetJid("voice-group") === VOICE, "voice-group → VOICE");
  assert(resolveTargetJid("log-only") === null, "log-only → null");
  assert(resolveTargetJid("bogus") === null, "unknown target → null");

  // allowlist
  assert(isAllowedDestination(SELF_CHAT), "SELF_CHAT allowed");
  assert(isAllowedDestination(DRAFTS), "DRAFTS allowed");
  assert(isAllowedDestination(VOICE), "VOICE allowed");
  assert(isAllowedDestination(NERI_SYNC), "NERI_SYNC allowed");
  assert(!isAllowedDestination("97299999999@s.whatsapp.net"), "random JID blocked");
  assert(!isAllowedDestination(""), "empty JID blocked");
  assert(!isAllowedDestination(null), "null JID blocked");

  // timestamp normalize
  assert(normalizeTs(1700000000) === 1700000000000, "seconds → ms");
  assert(normalizeTs(1700000000000) === 1700000000000, "ms unchanged");
  assert(normalizeTs({ low: 1700000000, high: 0 }) === 1700000000000, "Long{low} → ms");
  assert(normalizeTs("garbage") > 1e12, "garbage → now()");

  // event → message
  const m1 = mapEventToMessage({ messageId: "a", chatId: SELF_CHAT, senderId: SELF_CHAT, body: "שלום", mediaType: "", mediaUrls: [], timestamp: 1700000000 });
  assert(m1.source === "whatsapp" && m1.text === "שלום", "text event body maps");
  assert(m1.mediaType === undefined && m1.mediaPath === undefined, "text event no media");
  assert(m1.ts === 1700000000000, "text event ts normalized");
  assert(m1.sessionId === `wa-${SELF_CHAT}`, "sessionId derives from chatId");

  const m2 = mapEventToMessage({ messageId: "b", chatId: "c@g.us", senderId: "x", body: "cap", mediaType: "image", mediaUrls: ["E:/cache/img.jpg"], timestamp: 1700000000000 });
  assert(m2.mediaType === "image" && m2.mediaPath === "E:/cache/img.jpg", "image event maps path");

  const m3 = mapEventToMessage({ messageId: "c", chatId: "c", senderId: "x", body: "doc", mediaType: "document", mediaUrls: ["E:/cache/file.pdf"], timestamp: 1 });
  assert(m3.mediaType === "document" && m3.mediaPath === "E:/cache/file.pdf", "document event maps path");

  const m4 = mapEventToMessage({ messageId: "d", chatId: "c", senderId: "x", body: "[video received]", mediaType: "video", mediaUrls: ["E:/cache/v.mp4"], timestamp: 1 });
  assert(m4.mediaType === undefined && m4.mediaPath === undefined, "video event → plain text (no media preprocess)");

  // reply context passthrough
  const m5 = mapEventToMessage({ messageId: "e", chatId: "c", senderId: "x", body: "תקן", mediaType: "", mediaUrls: [], quotedBody: "חשבונית כהן", quotedMessageId: "Q1", quotedFrom: "y@s.whatsapp.net", timestamp: 1 });
  assert(m5.quotedBody === "חשבונית כהן" && m5.quotedMessageId === "Q1" && m5.quotedFrom === "y@s.whatsapp.net", "reply context passes through");

  // resolveOutbound — client draft envelope (summary + draft)
  const o1 = resolveOutbound({ dispatch: { target: "drafts-group", messageOut: "draft body", summaryToBarak: "summary line", clarificationPrompt: null } });
  assert(o1.length === 2, "client draft → 2 outbound (summary+draft)");
  assert(o1.every((o) => isAllowedDestination(o.jid)), "client draft → all constitutional");
  assert(o1.find((o) => o.kind === "draft").jid === DRAFTS, "draft → DRAFTS");
  assert(o1.find((o) => o.kind === "summary").jid === SELF_CHAT, "summary → SELF_CHAT");

  // resolveOutbound — internal-task envelope (summary only, target self-chat, no draft)
  const o2 = resolveOutbound({ dispatch: { target: "self-chat", messageOut: null, summaryToBarak: "task summary", clarificationPrompt: null } });
  assert(o2.length === 1 && o2[0].kind === "summary" && o2[0].jid === SELF_CHAT, "internal-task → 1 summary to self-chat");

  // resolveOutbound — clarification present
  const o3 = resolveOutbound({ dispatch: { target: "self-chat", messageOut: null, summaryToBarak: "s", clarificationPrompt: "מה השעה?" } });
  assert(o3.length === 2 && o3.some((o) => o.kind === "clarification"), "clarification adds an outbound");

  // resolveOutbound — noise (log-only) → nothing
  const o4 = resolveOutbound({ dispatch: { target: "log-only", messageOut: null, summaryToBarak: "should-not-send" } });
  assert(o4.length === 0, "noise/log-only → 0 outbound (no self-chat spam)");

  // resolveOutbound — correction short-circuit → nothing
  const o5 = resolveOutbound({ correction: { matched: true }, dispatch: { target: "log-only", messageOut: null, summaryToBarak: null } });
  assert(o5.length === 0, "correction match → 0 outbound");

  // resolveOutbound — error / empty envelope → nothing
  assert(resolveOutbound({ error: "empty text" }).length === 0, "error envelope → 0 outbound");
  assert(resolveOutbound(null).length === 0, "null envelope → 0 outbound");

  // resolveOutbound — ideas-drawer draft routes to self-chat (if a draft ever exists)
  const o6 = resolveOutbound({ dispatch: { target: "ideas-drawer", messageOut: "idea body", summaryToBarak: "s" } });
  assert(o6.find((o) => o.kind === "draft") && o6.find((o) => o.kind === "draft").jid === SELF_CHAT, "ideas-drawer draft → self-chat");

  // resolveVoiceOutbound — full voice envelope
  const v1 = resolveVoiceOutbound({ ok: true, voiceGroupPost: "🎤 post", voiceGroupJid: VOICE, selfChatProposal: "proposal", selfChatJid: SELF_CHAT, clarificationPrompt: null });
  assert(v1.length === 2, "voice → post + proposal = 2");
  assert(v1.find((o) => o.kind === "voice-post").jid === VOICE, "voice post → VOICE group");
  assert(v1.find((o) => o.kind === "voice-proposal").jid === SELF_CHAT, "voice proposal → self-chat");

  // resolveVoiceOutbound — non-self memo (voiceGroupPost null) → proposal only
  const v2 = resolveVoiceOutbound({ ok: true, voiceGroupPost: null, voiceGroupJid: null, selfChatProposal: "p", selfChatJid: SELF_CHAT });
  assert(v2.length === 1 && v2[0].kind === "voice-proposal", "non-self voice → proposal only");

  // resolveVoiceOutbound — failed envelope → nothing
  assert(resolveVoiceOutbound({ ok: false }).length === 0, "voice not-ok → 0 outbound");

  // own-echo guard
  assert(looksLikeOwnPost("⚡ *📨 📊 סטטוס מלקוח"), "own summary detected");
  assert(looksLikeOwnPost("🎤 *14:30 27/05*"), "own voice post detected");
  assert(!looksLikeOwnPost("שלום, מתי תגיע?"), "normal message not flagged");

  console.log(`\nSELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── Entry ──────────────────────────────────────────────────────────────────--
function shutdown() {
  stopping = true;
  if (pollTimer) clearTimeout(pollTimer);
  log("shutdown", {});
  process.exit(0);
}

async function main() {
  if (ARGV.includes("--self-test")) return selfTest();

  log("startup", {
    bridge: BRIDGE_URL,
    sendMode: SEND_MODE,
    pollMs: POLL_INTERVAL_MS,
    voiceTranscription: process.env.GROQ_API_KEY ? "enabled" : "deferred(no GROQ_API_KEY)",
    ledger: ledger ? "on" : "off",
    once: ARGV.includes("--once"),
  });
  if (SEND_MODE !== "live") {
    log("notice", { msg: "DRY-RUN — no messages will actually be sent. Use --live to enable sends." });
  }
  log("reminder", { msg: "Hermes gateway must NOT also poll /messages while this runs (drain conflict)." });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (ARGV.includes("--once")) {
    await pollOnce();
    log("once_done", {});
    return;
  }
  loop();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL:", err.message);
    if (err.stack) console.error(err.stack.split("\n").slice(0, 4).join("\n"));
    process.exit(1);
  });
}

module.exports = {
  // pure functions (tested by --self-test)
  isAllowedDestination,
  resolveTargetJid,
  normalizeTs,
  looksLikeOwnPost,
  mapEventToMessage,
  resolveOutbound,
  resolveVoiceOutbound,
  // runtime
  processEvent,
  pollOnce,
  // constants
  SELF_CHAT, DRAFTS, VOICE, NERI_SYNC,
};
