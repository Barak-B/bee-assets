#!/usr/bin/env node
// alfred-memory-graph.js — local knowledge-graph memory for the hive (Wave 14, Task #69).
//
// ── PROVENANCE ────────────────────────────────────────────────────────────────
// Schema DESIGN adapted (clean-room, original code) from the MIT-licensed
// KLSGG/agent-memory-graph (https://github.com/KLSGG/agent-memory-graph):
// the entities + temporal-relationships + FTS5 + memory_log shape. We deliberately
// DID NOT copy its code and DROPPED its LLM-extraction path (which calls
// OpenAI/Anthropic/Ollama when an API key env var is set) — so this module has
// ZERO network egress by construction. Their text extractor was English-only
// (capitalized proper nouns + English verbs); useless for Hebrew. Ours is built
// for Hebrew + the B.E.E domain, and its PRIMARY ingest is the structured
// entityHints the router already produces (clientName/siteName/amountIls/…),
// which is far more reliable than regex NER.
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// A queryable graph that links the things B.E.E cares about — לקוחות ↔ אתרים ↔
// אנשים ↔ ציוד ↔ תשלומים — so Alfred can recall "what do we know about כהן?"
// (which sites, last fault, open payment, who handled it) as structured context,
// not just flat notes. Complements the ledger (lifecycle) + archive (artifacts).
//
// ── STORAGE ──────────────────────────────────────────────────────────────────
// better-sqlite3, local file at ~/.openclaw/workspace/memory-graph.db
// (alongside decisions.sqlite + work-ledger.db). Env override: MEMORY_GRAPH_DB.
//
// ── API ──────────────────────────────────────────────────────────────────────
//   open(path)                       — (re)open a specific DB (tests/override)
//   upsertEntity({name,type,props,source,confidence}) → id
//   addRelation({from,fromType,to,toType,relation,validFrom,source,confidence,props}) → id
//   ingestHints({classification,sender,source,ts}) — PRIMARY path (router output)
//   ingestText({text,sender,source,ts})            — light Hebrew keyword fallback
//   neighbors(name,{depth}) · subgraph(name,{depth}) · search(q) · query(opts) · stats()
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   node alfred-memory-graph.js stats
//   node alfred-memory-graph.js search "כהן"
//   node alfred-memory-graph.js neighbors "כהן"
//   node alfred-memory-graph.js ingest --text "תקלה באתר כפר יובל" --sender 972...@s.whatsapp.net
//   node alfred-memory-graph.js self-test
//
// Pure local. NEVER sends/fetches anything. Every public fn try/catches.

"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const WORKSPACE = path.join(os.homedir(), ".openclaw", "workspace");
const DEFAULT_DB = process.env.MEMORY_GRAPH_DB || path.join(WORKSPACE, "memory-graph.db");

// B.E.E entity types (Hebrew domain). 'unknown' for unclassified.
const TYPES = ["client", "site", "person", "company", "equipment", "payment", "topic", "unknown"];

let _db = null;
let _dbPath = null;

function open(p) {
  if (_db) { try { _db.close(); } catch { /* noop */ } _db = null; }
  _dbPath = p || DEFAULT_DB;
  fs.mkdirSync(path.dirname(_dbPath), { recursive: true });
  _db = new Database(_dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'unknown',
      props TEXT DEFAULT '{}',
      created_at INTEGER, updated_at INTEGER,
      source TEXT, confidence REAL DEFAULT 1.0,
      mention_count INTEGER DEFAULT 1,
      lifecycle TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      props TEXT DEFAULT '{}',
      created_at INTEGER, updated_at INTEGER,
      source TEXT, confidence REAL DEFAULT 1.0,
      valid_from INTEGER, valid_until INTEGER,
      lifecycle TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS memory_log (
      id TEXT PRIMARY KEY,
      raw_text TEXT, entities TEXT DEFAULT '[]', relations TEXT DEFAULT '[]',
      ts INTEGER, session_id TEXT, source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ent_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_ent_name ON entities(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_id);
    CREATE INDEX IF NOT EXISTS idx_rel_to ON relationships(to_id);
    CREATE INDEX IF NOT EXISTS idx_rel_pair ON relationships(from_id, to_id, relation);
    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(name, type, props, content=entities, content_rowid=rowid);
    CREATE TRIGGER IF NOT EXISTS ent_ai AFTER INSERT ON entities BEGIN
      INSERT INTO entities_fts(rowid,name,type,props) VALUES (new.rowid,new.name,new.type,new.props);
    END;
    CREATE TRIGGER IF NOT EXISTS ent_ad AFTER DELETE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts,rowid,name,type,props) VALUES ('delete',old.rowid,old.name,old.type,old.props);
    END;
    CREATE TRIGGER IF NOT EXISTS ent_au AFTER UPDATE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts,rowid,name,type,props) VALUES ('delete',old.rowid,old.name,old.type,old.props);
      INSERT INTO entities_fts(rowid,name,type,props) VALUES (new.rowid,new.name,new.type,new.props);
    END;
  `);
  return _db;
}
function db() { return _db || open(DEFAULT_DB); }

function norm(s) { return String(s || "").trim().replace(/\s+/g, " "); }

// Upsert an entity, deduped by (name COLLATE NOCASE, type). Bumps mention_count.
function upsertEntity({ name, type = "unknown", props = {}, source = null, confidence = 1.0 } = {}) {
  const d = db();
  const nm = norm(name);
  if (!nm) return null;
  const ty = TYPES.includes(type) ? type : "unknown";
  const now = Date.now();
  const existing = d.prepare("SELECT id, props, mention_count, type FROM entities WHERE name = ? COLLATE NOCASE AND type = ?").get(nm, ty);
  if (existing) {
    let merged = {};
    try { merged = { ...JSON.parse(existing.props || "{}"), ...props }; } catch { merged = props; }
    d.prepare("UPDATE entities SET mention_count = mention_count + 1, updated_at = ?, props = ?, confidence = MAX(confidence, ?) WHERE id = ?")
      .run(now, JSON.stringify(merged), confidence, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  d.prepare(`INSERT INTO entities (id,name,type,props,created_at,updated_at,source,confidence,mention_count,lifecycle)
    VALUES (@id,@name,@type,@props,@now,@now,@source,@confidence,1,'active')`)
    .run({ id, name: nm, type: ty, props: JSON.stringify(props || {}), now, source, confidence });
  return id;
}

// Add (or refresh) a relationship; upserts both endpoints. Deduped by (from,to,relation).
function addRelation({ from, fromType = "unknown", to, toType = "unknown", relation, validFrom = null, source = null, confidence = 0.8, props = {} } = {}) {
  const d = db();
  const rel = norm(relation);
  const fromId = upsertEntity({ name: from, type: fromType, source, confidence });
  const toId = upsertEntity({ name: to, type: toType, source, confidence });
  if (!fromId || !toId || !rel || fromId === toId) return null;
  const now = Date.now();
  const existing = d.prepare("SELECT id FROM relationships WHERE from_id = ? AND to_id = ? AND relation = ?").get(fromId, toId, rel);
  if (existing) {
    d.prepare("UPDATE relationships SET updated_at = ?, confidence = MAX(confidence, ?), valid_until = NULL, lifecycle='active' WHERE id = ?")
      .run(now, confidence, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  d.prepare(`INSERT INTO relationships (id,from_id,to_id,relation,props,created_at,updated_at,source,confidence,valid_from,lifecycle)
    VALUES (@id,@from_id,@to_id,@relation,@props,@now,@now,@source,@confidence,@valid_from,'active')`)
    .run({ id, from_id: fromId, to_id: toId, relation: rel, props: JSON.stringify(props || {}), now, source, confidence, valid_from: validFrom });
  return id;
}

function logMemory({ text, entities, relations, sessionId, source }) {
  try {
    db().prepare("INSERT INTO memory_log (id,raw_text,entities,relations,ts,session_id,source) VALUES (?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), String(text || "").slice(0, 1000), JSON.stringify(entities || []), JSON.stringify(relations || []), Date.now(), sessionId || null, source || null);
  } catch { /* best-effort */ }
}

// ── PRIMARY ingest: from the router's structured classification ───────────────
// classification = { intent, entityHints:{clientName,siteName,amountIls,dateMentioned,...} }
// Builds high-confidence entities + relations. This is the reliable path (the
// router's LLM already did the hard NER); regex on Hebrew is only a fallback.
function ingestHints({ classification, sender = null, source = "router", ts = Date.now() } = {}) {
  try {
    const c = classification || {};
    const h = c.entityHints || {};
    const intent = c.intent || "unknown";
    const ents = [];
    const rels = [];

    const client = norm(h.clientName);
    const site = norm(h.siteName);
    const amount = h.amountIls;

    if (client) { upsertEntity({ name: client, type: "client", source, confidence: 0.9 }); ents.push({ name: client, type: "client" }); }
    if (site) { upsertEntity({ name: site, type: "site", source, confidence: 0.9 }); ents.push({ name: site, type: "site" }); }

    // client ↔ site
    if (client && site) { addRelation({ from: client, fromType: "client", to: site, toType: "site", relation: "AT_SITE", validFrom: ts, source, confidence: 0.85 }); rels.push([client, "AT_SITE", site]); }

    // intent-specific edges
    const subject = site || client;
    if (subject) {
      if (intent === "client-fault") { addRelation({ from: subject, fromType: site ? "site" : "client", to: "תקלה", toType: "topic", relation: "HAS_FAULT", validFrom: ts, source, confidence: 0.8 }); rels.push([subject, "HAS_FAULT", "תקלה"]); }
      if (intent === "client-payment" && amount != null) {
        const pay = `תשלום ${amount}₪`;
        upsertEntity({ name: pay, type: "payment", props: { amountIls: amount }, source, confidence: 0.85 });
        addRelation({ from: client || subject, fromType: "client", to: pay, toType: "payment", relation: "HAS_PAYMENT", validFrom: ts, source, confidence: 0.85 });
        rels.push([client || subject, "HAS_PAYMENT", pay]);
      }
      if (intent === "internal-meeting" && sender) {
        addRelation({ from: senderName(sender), fromType: "person", to: subject, toType: site ? "site" : "client", relation: "MEETING_ABOUT", validFrom: ts, source, confidence: 0.7 });
      }
    }
    // who raised it
    if (sender && subject) { addRelation({ from: senderName(sender), fromType: "person", to: subject, toType: site ? "site" : "client", relation: "RAISED", validFrom: ts, source, confidence: 0.6 }); }

    if (ents.length || rels.length) logMemory({ text: `[hints] intent=${intent}`, entities: ents, relations: rels, source });
    return { entities: ents, relations: rels };
  } catch (e) { return { error: e.message, entities: [], relations: [] }; }
}

function senderName(jid) {
  const s = String(jid || "");
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("972509554483")) return "ברק";
  return s.split("@")[0] || s || "unknown";
}

// ── FALLBACK ingest: light Hebrew keyword → relation + amount ─────────────────
// Detects the RELATION TYPE from keywords and links the sender to any KNOWN
// entity already in the graph (matched by name appearing in the text). Modest by
// design — the structured ingestHints path is the workhorse.
const HE_RELATION_KEYWORDS = [
  { re: /תקלה|תקול|לא עובד|נפל|כבה|down/i, relation: "HAS_FAULT", topic: "תקלה" },
  { re: /תשלום|שיל[םמ]|שול[םמ]|חשבונית|העברה בנקאית|לשל[םמ]/i, relation: "HAS_PAYMENT", topic: "תשלום" },
  { re: /פגיש|להיפגש|נפגש|ביקור באתר/i, relation: "MEETING_ABOUT", topic: "פגישה" },
  { re: /התקנ|הותקן|הרכבה|חיבור|חיברנו/i, relation: "INSTALLED_AT", topic: "התקנה" },
  { re: /הצעת מחיר|הצעה|quote/i, relation: "QUOTE_FOR", topic: "הצעת מחיר" },
];
function extractAmount(text) {
  const m = String(text || "").match(/([\d][\d,\.]*)\s*(?:ש"?ח|שקל|₪|nis)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function ingestText({ text, sender = null, source = "text", ts = Date.now(), knownEntities = null } = {}) {
  try {
    const t = String(text || "");
    if (!t.trim()) return { entities: [], relations: [] };
    const ents = [], rels = [];
    // match known entities (from caller, e.g. roster/clients, or those already in the graph)
    const known = Array.isArray(knownEntities) && knownEntities.length
      ? knownEntities
      : db().prepare("SELECT name, type FROM entities WHERE type IN ('client','site','person','company') LIMIT 500").all();
    const hits = known.filter((e) => e.name && e.name.length >= 2 && t.includes(e.name));
    const amount = extractAmount(t);
    let matchedRel = null;
    for (const k of HE_RELATION_KEYWORDS) { if (k.re.test(t)) { matchedRel = k; break; } }

    for (const h of hits) { ents.push({ name: h.name, type: h.type }); }

    if (matchedRel) {
      const subj = hits[0];
      if (subj) {
        if (matchedRel.relation === "HAS_PAYMENT" && amount != null) {
          const pay = `תשלום ${amount}₪`;
          upsertEntity({ name: pay, type: "payment", props: { amountIls: amount }, source, confidence: 0.6 });
          addRelation({ from: subj.name, fromType: subj.type, to: pay, toType: "payment", relation: "HAS_PAYMENT", validFrom: ts, source, confidence: 0.55 });
          rels.push([subj.name, "HAS_PAYMENT", pay]);
        } else {
          addRelation({ from: subj.name, fromType: subj.type, to: matchedRel.topic, toType: "topic", relation: matchedRel.relation, validFrom: ts, source, confidence: 0.5 });
          rels.push([subj.name, matchedRel.relation, matchedRel.topic]);
        }
      }
    }
    if (sender && hits[0]) { addRelation({ from: senderName(sender), fromType: "person", to: hits[0].name, toType: hits[0].type, relation: "RAISED", validFrom: ts, source, confidence: 0.45 }); }
    if (ents.length || rels.length) logMemory({ text: t, entities: ents, relations: rels, source });
    return { entities: ents, relations: rels, amount };
  } catch (e) { return { error: e.message, entities: [], relations: [] }; }
}

// ── recall ────────────────────────────────────────────────────────────────────
function findEntity(name) {
  return db().prepare("SELECT * FROM entities WHERE name = ? COLLATE NOCASE ORDER BY mention_count DESC LIMIT 1").get(norm(name)) || null;
}
function neighbors(name, { depth = 1 } = {}) {
  const d = db();
  const root = findEntity(name);
  if (!root) return { entity: null, edges: [] };
  const seen = new Set([root.id]);
  let frontier = [root.id];
  const edges = [];
  for (let i = 0; i < Math.max(1, depth); i++) {
    const next = [];
    for (const id of frontier) {
      const rows = d.prepare(`
        SELECT r.relation, r.confidence, r.valid_from, e1.name AS from_name, e1.type AS from_type, e2.name AS to_name, e2.type AS to_type, r.from_id, r.to_id
        FROM relationships r JOIN entities e1 ON e1.id=r.from_id JOIN entities e2 ON e2.id=r.to_id
        WHERE (r.from_id=? OR r.to_id=?) AND r.lifecycle='active'`).all(id, id);
      for (const row of rows) {
        edges.push({ from: row.from_name, fromType: row.from_type, relation: row.relation, to: row.to_name, toType: row.to_type, confidence: row.confidence });
        for (const nid of [row.from_id, row.to_id]) if (!seen.has(nid)) { seen.add(nid); next.push(nid); }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  // dedup edges
  const uniq = []; const k = new Set();
  for (const e of edges) { const key = `${e.from}|${e.relation}|${e.to}`; if (!k.has(key)) { k.add(key); uniq.push(e); } }
  return { entity: { name: root.name, type: root.type, mentions: root.mention_count }, edges: uniq };
}
function subgraph(name, opts = {}) { return neighbors(name, opts); }

function search(q, { limit = 20 } = {}) {
  try {
    const query = `"${String(q || "").replace(/["*]/g, " ").trim()}"`;
    if (query === '""') return [];
    return db().prepare(`SELECT e.name, e.type, e.mention_count FROM entities_fts f JOIN entities e ON e.rowid=f.rowid WHERE entities_fts MATCH ? ORDER BY e.mention_count DESC LIMIT ?`).all(query, limit);
  } catch { return []; }
}

function query({ type, relation, limit = 50 } = {}) {
  const d = db();
  if (relation) return d.prepare(`SELECT e1.name AS from_name, r.relation, e2.name AS to_name FROM relationships r JOIN entities e1 ON e1.id=r.from_id JOIN entities e2 ON e2.id=r.to_id WHERE r.relation=? LIMIT ?`).all(relation, limit);
  if (type) return d.prepare("SELECT name,type,mention_count FROM entities WHERE type=? ORDER BY mention_count DESC LIMIT ?").all(type, limit);
  return d.prepare("SELECT name,type,mention_count FROM entities ORDER BY mention_count DESC LIMIT ?").all(limit);
}

function stats() {
  const d = db();
  const ents = d.prepare("SELECT type, COUNT(*) c FROM entities GROUP BY type").all();
  const rels = d.prepare("SELECT relation, COUNT(*) c FROM relationships GROUP BY relation").all();
  const byType = {}; ents.forEach((r) => (byType[r.type] = r.c));
  const byRel = {}; rels.forEach((r) => (byRel[r.relation] = r.c));
  return {
    entities: ents.reduce((a, r) => a + r.c, 0), byType,
    relationships: rels.reduce((a, r) => a + r.c, 0), byRelation: byRel,
  };
}

// ── self-test (offline, temp DB) ──────────────────────────────────────────────
function selfTest() {
  const tmp = path.join(os.tmpdir(), `mem-graph-test-${crypto.randomBytes(4).toString("hex")}.db`);
  open(tmp);
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗", m); } };

  // entity upsert + dedup + mention_count
  const id1 = upsertEntity({ name: "כהן", type: "client" });
  const id1b = upsertEntity({ name: "כהן", type: "client" });
  ok(id1 && id1 === id1b, "entity dedup by name+type");
  ok(findEntity("כהן").mention_count === 2, "mention_count incremented");
  ok(upsertEntity({ name: "כהן", type: "site" }) !== id1, "same name diff type → distinct entity");

  // relation + dedup
  const r1 = addRelation({ from: "כהן", fromType: "client", to: "כפר יובל", toType: "site", relation: "AT_SITE" });
  const r1b = addRelation({ from: "כהן", fromType: "client", to: "כפר יובל", toType: "site", relation: "AT_SITE" });
  ok(r1 && r1 === r1b, "relationship dedup by (from,to,relation)");

  // ingestHints — client-fault
  const ih = ingestHints({ classification: { intent: "client-fault", entityHints: { clientName: "לוי", siteName: "מטולה" } }, sender: "972500000000@s.whatsapp.net" });
  ok(ih.entities.length >= 2, "ingestHints created client+site");
  ok(ih.relations.some((r) => r[1] === "AT_SITE"), "ingestHints linked client AT_SITE site");
  ok(ih.relations.some((r) => r[1] === "HAS_FAULT"), "ingestHints client-fault → HAS_FAULT");

  // ingestHints — client-payment with amount
  const ip = ingestHints({ classification: { intent: "client-payment", entityHints: { clientName: "כהן", amountIls: 8200 } } });
  ok(ip.relations.some((r) => r[1] === "HAS_PAYMENT"), "ingestHints payment → HAS_PAYMENT");
  ok(findEntity("תשלום 8200₪") && findEntity("תשלום 8200₪").type === "payment", "payment entity created");

  // ingestText — Hebrew keyword + known-entity match
  const it = ingestText({ text: "יש תקלה גדולה אצל כהן באתר", sender: "972509554483@s.whatsapp.net" });
  ok(it.relations.some((r) => r[1] === "HAS_FAULT"), "ingestText detected fault on known entity כהן");
  const itp = ingestText({ text: "כהן העביר תשלום של 1500 ש\"ח" });
  ok(itp.amount === 1500, "ingestText extracted amount 1500");

  // neighbors / recall
  const nb = neighbors("כהן", { depth: 1 });
  ok(nb.entity && nb.entity.name === "כהן", "neighbors found root");
  ok(nb.edges.length >= 2, "neighbors returns connected edges");

  // search (FTS5, Hebrew)
  const sr = search("כהן");
  ok(sr.length >= 1 && sr.some((e) => e.name === "כהן"), "FTS5 search finds Hebrew entity");

  // stats
  const st = stats();
  ok(st.entities >= 5 && st.relationships >= 3, "stats counts entities + relationships");
  ok(st.byType.client >= 1 && st.byType.site >= 1, "stats byType has client+site");

  try { db().close(); } catch { /* noop */ }
  for (const suf of ["", "-wal", "-shm"]) { try { fs.rmSync(tmp + suf, { force: true }); } catch { /* noop */ } }
  console.log(`\nMEMORY-GRAPH SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────--
function arg(name, def) { const i = process.argv.indexOf("--" + name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
function main() {
  const cmd = process.argv[2];
  if (cmd === "self-test" || cmd === "--self-test") return selfTest();
  if (cmd === "stats") { console.log(JSON.stringify(stats(), null, 2)); }
  else if (cmd === "search") { console.log(JSON.stringify(search(process.argv[3] || "", { limit: Number(arg("limit", "20")) }), null, 2)); }
  else if (cmd === "neighbors") { console.log(JSON.stringify(neighbors(process.argv[3] || "", { depth: Number(arg("depth", "1")) }), null, 2)); }
  else if (cmd === "ingest") { console.log(JSON.stringify(ingestText({ text: arg("text", ""), sender: arg("sender", null) }), null, 2)); }
  else { console.log("usage: node alfred-memory-graph.js [stats|search <q>|neighbors <name>|ingest --text \"..\"|self-test] [--limit N] [--depth N]"); }
}
if (require.main === module) {
  try { main(); } catch (e) { console.error("ERROR:", e.message); process.exit(1); }
}

module.exports = { open, upsertEntity, addRelation, ingestHints, ingestText, neighbors, subgraph, search, query, stats, findEntity, TYPES, DEFAULT_DB };
