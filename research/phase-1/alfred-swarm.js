#!/usr/bin/env node
// alfred-swarm.js — the hive's division-of-labor CONTRACT (Wave 14).
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// Alfred is not one agent — it's a HIVE of two cooperating agents that share the
// work of turning an inbound message into a correct, sent reply:
//
//   ALFRED  = the BRAIN.   Language · reasoning · media.
//             classify intent, compose Hebrew replies, ask clarifying questions,
//             detect Barak's corrections, OCR images (vision), extract PDFs,
//             transcribe voice. Anything that is "understand / phrase / perceive".
//
//   HERMES  = the HANDS + MEMORY.   Transport · heavy tools · data · recall.
//             solar monitoring (SolarEdge/Sungrow/Tracer), Monday.com, Google
//             Workspace, calendar, client/site DB lookups, tender feeds, holographic
//             memory + curator. Anything that is "fetch / call an API / remember".
//
// Barak's ask: make them "work as a swarm/hive that shares tasks." A swarm only
// works if every member knows WHO OWNS WHAT. This file is that coordination
// contract — the single source of truth for the split — expressed as pure logic
// so both agents (and the docs, and the hive map) read the SAME rules.
//
//   • CAPABILITY_OWNER  — capability → 'alfred' | 'hermes'   (the law)
//   • route(cap)        — who handles this capability? (null if unknown)
//   • plan(intent)      — ordered [{step,cap,agent}] pipeline for each router intent
//   • summary()         — caps-per-agent + counts + steps-per-intent (for docs/maps)
//
// ── THE RULE OF THUMB ──────────────────────────────────────────────────────────
//   reasoning / language / media           → ALFRED   (it's the model talking)
//   data / tool calls / monitoring / memory → HERMES   (it's the world being touched)
//
// Why this boundary? Alfred holds the conversation + the LLM; cheap, stateful,
// latency-sensitive. Hermes holds the credentials, the API clients, the SQLite
// stores and the long-term memory; it's where side-effects and secrets live.
// Keeping perception/phrasing on one side and fetch/recall on the other means the
// brain never holds a vendor token and the hands never guess at Hebrew tone.
//
// The 10 router intents (see alfred-router.js) each become an ordered plan that
// ALWAYS starts with `classify` (Alfred) and then chains the minimum capabilities
// needed — Hermes fetches the facts, Alfred phrases the answer and clarifies.
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   node alfred-swarm.js plan <intent>      — print the ordered pipeline
//   node alfred-swarm.js route <capability> — print the owning agent
//   node alfred-swarm.js summary            — print the hive map (JSON)
//   node alfred-swarm.js self-test          — offline self-check (also: --self-test)
//
// Pure logic. No network, no deps beyond Node core. NEVER sends/fetches anything;
// it only DECLARES who should.

"use strict";

const AGENTS = ["alfred", "hermes"];

// ── CAPABILITY_OWNER ── the law: every capability maps to exactly one agent. ────
// ALFRED owns understanding + phrasing + perception (the LLM and the media pipe).
// HERMES owns data + tool calls + monitoring + memory (the credentials and APIs).
const CAPABILITY_OWNER = {
  // ── ALFRED — reasoning / language / media ──────────────────────────────────
  "classify":          "alfred", // read a message, decide intent + urgency
  "compose":           "alfred", // write the Hebrew reply / draft
  "clarify":           "alfred", // ask Barak a disambiguating question
  "correction-detect": "alfred", // notice "לא, התכוונתי…" and learn the fix
  "vision-ocr":        "alfred", // OCR / describe an image (inverter screen, doc photo)
  "pdf-extract":       "alfred", // pull text/fields out of a PDF
  "voice-transcribe":  "alfred", // speech → text for voice notes

  // invoice: the verb decides the owner. Here we register the capability under the
  // INVOICE LIFE that recurs in conversation — DRAFTING an invoice/quote reply, which
  // is language work → ALFRED. (Raw invoice DATA fetches ride 'tender-fetch'/DB on the
  // Hermes side; if a dedicated invoice-data cap is ever needed, it belongs to Hermes.)
  "invoice":           "alfred", // DRAFT an invoice/quote — phrasing, so Alfred

  // ── HERMES — data / tool / monitoring / memory ─────────────────────────────
  "client-db-lookup":  "hermes", // resolve a client record from the DB
  "site-lookup":       "hermes", // resolve a site/installation record
  "solar-monitoring":  "hermes", // live production/fault telemetry (SolarEdge/Sungrow/Tracer)
  "calendar-fetch":    "hermes", // read Google Calendar events / availability
  "monday":            "hermes", // Monday.com boards (jobs, CRM, pipeline)
  "google-workspace":  "hermes", // Gmail / Drive / Sheets calls
  "holographic-memory":"hermes", // long-term holographic memory recall
  "curator":           "hermes", // memory curation / knowledge upkeep
  "tender-fetch":      "hermes", // pull tenders / regulatory / invoice DATA feeds
};

// ── route(capability) → 'alfred' | 'hermes' | null ─────────────────────────────
// The single lookup both agents use to decide "is this mine?". Unknown → null.
function route(capability) {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_OWNER, capability)
    ? CAPABILITY_OWNER[capability]
    : null;
}

// Small helper so plans stay declarative and every step's agent is DERIVED from
// the law above (never hand-typed → can't drift out of sync with CAPABILITY_OWNER).
function s(step, cap) {
  return { step, cap, agent: route(cap) };
}

// ── PLANS ── ordered pipelines per router intent. ──────────────────────────────
// Convention: ALWAYS open with classify (Alfred). Hermes fetches the facts in the
// middle; Alfred composes + offers to clarify at the end. `noise` short-circuits.
const PLANS = {
  // Existing client asking about job/system progress → need job + live status, then phrase.
  "client-status": [
    s("classify intent", "classify"),
    s("resolve client record", "client-db-lookup"),
    s("pull job/board status", "monday"),
    s("pull live monitoring", "solar-monitoring"),
    s("compose status reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Fault report → live telemetry first (is it really down?), then who/where, then reply.
  "client-fault": [
    s("classify intent", "classify"),
    s("pull live monitoring", "solar-monitoring"),
    s("resolve client/site", "client-db-lookup"),
    s("resolve site/installation", "site-lookup"),
    s("compose reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Quote request → identify client + site, recall similar past quotes, draft the quote reply.
  "client-quote": [
    s("classify intent", "classify"),
    s("resolve client record", "client-db-lookup"),
    s("resolve site/installation", "site-lookup"),
    s("recall similar past quotes", "holographic-memory"),
    s("draft quote/invoice reply", "invoice"),
    s("clarify if needed", "clarify"),
  ],

  // Payment → identify client, fetch invoice/payment DATA, compose, clarify on mismatch.
  "client-payment": [
    s("classify intent", "classify"),
    s("resolve client record", "client-db-lookup"),
    s("fetch invoice/payment data", "tender-fetch"),
    s("compose payment reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Vendor → it usually maps to a Monday order/PO; recall context; compose to supplier.
  "vendor": [
    s("classify intent", "classify"),
    s("pull order/PO from Monday", "monday"),
    s("recall vendor context", "holographic-memory"),
    s("compose vendor reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Regulatory → pull the relevant tender/permit/inspection feed, recall, compose.
  "regulatory": [
    s("classify intent", "classify"),
    s("fetch tender/permit feed", "tender-fetch"),
    s("recall regulatory context", "holographic-memory"),
    s("compose regulatory reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Internal task → Barak's own todo; recall related context, file it on Monday, confirm.
  "internal-task": [
    s("classify intent", "classify"),
    s("recall related context", "holographic-memory"),
    s("file task on Monday", "monday"),
    s("compose confirmation", "compose"),
  ],

  // Internal idea → capture into long-term memory + curate; light acknowledgement.
  "internal-idea": [
    s("classify intent", "classify"),
    s("store idea in memory", "holographic-memory"),
    s("curate / link idea", "curator"),
    s("compose acknowledgement", "compose"),
  ],

  // Internal meeting → check calendar availability, recall attendees, draft scheduling reply.
  "internal-meeting": [
    s("classify intent", "classify"),
    s("check calendar availability", "calendar-fetch"),
    s("recall attendee context", "holographic-memory"),
    s("compose scheduling reply", "compose"),
    s("clarify if needed", "clarify"),
  ],

  // Noise → classify and stop. Nothing to fetch, nothing to send.
  "noise": [
    s("classify intent", "classify"),
  ],
};

const INTENTS = Object.keys(PLANS);

// ── plan(intent) → ordered [{step,cap,agent}] ──────────────────────────────────
// Returns a defensive copy so callers can't mutate the contract. Unknown intent →
// the minimal safe plan (classify only), so the hive always at least understands.
function plan(intent) {
  const p = PLANS[intent];
  if (!p) return [s("classify intent", "classify")];
  return p.map((step) => ({ step: step.step, cap: step.cap, agent: step.agent }));
}

// ── summary() → the hive map ────────────────────────────────────────────────────
// {alfred:[caps...], hermes:[caps...], counts:{alfred,hermes}, intents:{intent:#steps}}
function summary() {
  const out = { alfred: [], hermes: [], counts: { alfred: 0, hermes: 0 }, intents: {} };
  for (const cap of Object.keys(CAPABILITY_OWNER)) {
    const owner = CAPABILITY_OWNER[cap];
    if (owner === "alfred") out.alfred.push(cap);
    else if (owner === "hermes") out.hermes.push(cap);
  }
  out.counts.alfred = out.alfred.length;
  out.counts.hermes = out.hermes.length;
  for (const intent of INTENTS) out.intents[intent] = PLANS[intent].length;
  return out;
}

// ── self-test (offline, pure) ──────────────────────────────────────────────────
function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗", m); } };

  // (a) every capability in CAPABILITY_OWNER routes to a known agent
  for (const cap of Object.keys(CAPABILITY_OWNER)) {
    ok(AGENTS.includes(route(cap)), `capability '${cap}' routes to a known agent`);
  }

  // (e) unknown capability → null
  ok(route("does-not-exist") === null, "unknown capability → route() null");
  ok(route("") === null, "empty capability → route() null");
  ok(route(undefined) === null, "undefined capability → route() null");

  // (b) every non-noise intent → non-empty ordered array; noise → minimal
  for (const intent of INTENTS) {
    const p = plan(intent);
    ok(Array.isArray(p), `plan('${intent}') is an array`);
    if (intent === "noise") {
      ok(p.length >= 1, "noise plan is minimal (>=1 step, just classify)");
    } else {
      ok(p.length > 0, `plan('${intent}') is non-empty`);
      ok(p.length >= 2, `plan('${intent}') chains beyond classify`);
    }
    // every plan opens with classify on alfred
    ok(p[0] && p[0].cap === "classify" && p[0].agent === "alfred",
       `plan('${intent}') starts with classify@alfred`);
  }

  // (c) + (d) consistency: every step.agent === route(step.cap), and cap is known
  for (const intent of INTENTS) {
    for (const st of plan(intent)) {
      ok(Object.prototype.hasOwnProperty.call(CAPABILITY_OWNER, st.cap),
         `[${intent}] step cap '${st.cap}' exists in CAPABILITY_OWNER`);
      ok(st.agent === route(st.cap),
         `[${intent}] step '${st.step}' agent matches route('${st.cap}')`);
    }
  }

  // unknown intent → minimal safe plan (classify only)
  const u = plan("totally-unknown-intent");
  ok(u.length === 1 && u[0].cap === "classify", "unknown intent → minimal classify plan");

  // summary shape + accounting
  const sum = summary();
  ok(Array.isArray(sum.alfred) && Array.isArray(sum.hermes), "summary has alfred/hermes arrays");
  ok(sum.counts.alfred === sum.alfred.length && sum.counts.hermes === sum.hermes.length,
     "summary counts match array lengths");
  ok(sum.counts.alfred + sum.counts.hermes === Object.keys(CAPABILITY_OWNER).length,
     "summary covers every capability");
  ok(Object.keys(sum.intents).length === INTENTS.length, "summary lists every intent");

  console.log(`\nSWARM SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────────
function main() {
  const cmd = process.argv[2];
  if (cmd === "self-test" || cmd === "--self-test") return selfTest();

  if (cmd === "plan") {
    const intent = process.argv[3];
    if (!intent) { console.log("usage: node alfred-swarm.js plan <intent>"); return; }
    const p = plan(intent);
    console.log(`plan(${intent}) — ${p.length} step(s):`);
    p.forEach((st, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${st.agent.padEnd(6)} ${st.cap.padEnd(20)} ${st.step}`));
  } else if (cmd === "route") {
    const cap = process.argv[3];
    if (!cap) { console.log("usage: node alfred-swarm.js route <capability>"); return; }
    const owner = route(cap);
    console.log(owner ? `${cap} → ${owner}` : `${cap} → (unknown capability)`);
  } else if (cmd === "summary") {
    console.log(JSON.stringify(summary(), null, 2));
  } else {
    console.log("usage: node alfred-swarm.js [plan <intent>|route <capability>|summary|self-test]");
    console.log("intents: " + INTENTS.join(", "));
  }
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("ERROR:", e.message); process.exit(1); }
}

module.exports = { CAPABILITY_OWNER, AGENTS, INTENTS, route, plan, summary };
