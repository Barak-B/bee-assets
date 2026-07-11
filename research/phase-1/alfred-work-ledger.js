#!/usr/bin/env node
// alfred-work-ledger.js — the hive's work tracker (Wave 14, Task #63).
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// Barak: "לוודא כי אכן כל המשימות שלנו בטיפול (יש המון)". Every request — from ANY
// source (WhatsApp, email, voice, calendar, cron, manual) — becomes a tracked
// work-item that moves through a defined lifecycle:
//
//   received → processing → drafted → awaiting_barak / awaiting_condition → done
//                                          └→ dropped (noise)   └→ failed (error)
//
// This is the input→processing→editing→output guarantee, made durable: nothing
// falls through the cracks, and at any moment you can ask "what's in handling?
// what's stuck? what got done today?".
//
// Distinct from:
//   • TASKS.md            — Barak's human task list (intent: internal-task)
//   • alfred-clarify queue — pending clarification questions
//   • decisions.sqlite     — learned preference pairs (corrections)
// The ledger is the OPERATIONAL tracker of every request's handling lifecycle.
//
// ── STORAGE ──────────────────────────────────────────────────────────────────
// better-sqlite3 (already a dep), DB at ~/.openclaw/workspace/work-ledger.db
// (alongside the other alfred runtime state). Code lives on E: with the modules.
//
// ── API ──────────────────────────────────────────────────────────────────────
//   open(path)                     — (re)open a specific DB (tests/override)
//   record(item) → id              — insert a work-item (idempotent on source:messageId)
//   transition(id, status, patch?) — advance lifecycle + append stage history
//   get(id) · list(opts) · stats() · stuck(opts) · sweep()
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   node alfred-work-ledger.js stats
//   node alfred-work-ledger.js list [--status awaiting_barak] [--source wa] [--limit 50]
//   node alfred-work-ledger.js stuck [--older-min 60]
//   node alfred-work-ledger.js get <id>
//   node alfred-work-ledger.js self-test
//
// Foundational: this module NEVER sends WhatsApp/email. It only tracks state.

"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const WORKSPACE = path.join(os.homedir(), ".openclaw", "workspace");
const DEFAULT_DB = process.env.WORK_LEDGER_DB || path.join(WORKSPACE, "work-ledger.db");

const STATUSES = ["received", "processing", "drafted", "awaiting_barak", "awaiting_condition", "done", "dropped", "failed"];
const TERMINAL = new Set(["done", "dropped", "failed"]);
// "Active" = still in handling; these are what a sweep watches for staleness.
const ACTIVE_STUCK = ["received", "processing", "drafted", "awaiting_condition"];

let _db = null;
let _dbPath = null;

function open(p) {
  if (_db) { try { _db.close(); } catch { /* noop */ } _db = null; }
  _dbPath = p || DEFAULT_DB;
  fs.mkdirSync(path.dirname(_dbPath), { recursive: true });
  _db = new Database(_dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS work_items(
      id TEXT PRIMARY KEY,
      msg_key TEXT,
      created_at INTEGER, updated_at INTEGER,
      source TEXT, sender TEXT, requester_kind TEXT,
      intent TEXT, urgency TEXT, text TEXT,
      status TEXT,
      stage_history TEXT,
      output_dest TEXT, draft_ref TEXT,
      error TEXT, meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_status  ON work_items(status);
    CREATE INDEX IF NOT EXISTS idx_created ON work_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_msgkey  ON work_items(msg_key);
  `);
  return _db;
}

function db() { return _db || open(DEFAULT_DB); }

// Insert a new work-item. Idempotent: if source:messageId was already recorded,
// returns the existing id instead of duplicating.
function record(item = {}) {
  const d = db();
  const now = Date.now();
  const msgKey = item.msgKey || (item.source && item.messageId ? `${item.source}:${item.messageId}` : null);
  if (msgKey) {
    const existing = d.prepare("SELECT id FROM work_items WHERE msg_key=?").get(msgKey);
    if (existing) return existing.id;
  }
  const id = item.id || crypto.randomUUID();
  d.prepare(`INSERT INTO work_items
    (id,msg_key,created_at,updated_at,source,sender,requester_kind,intent,urgency,text,status,stage_history,output_dest,draft_ref,error,meta)
    VALUES (@id,@msg_key,@created_at,@updated_at,@source,@sender,@requester_kind,@intent,@urgency,@text,@status,@stage_history,@output_dest,@draft_ref,@error,@meta)`)
    .run({
      id, msg_key: msgKey, created_at: now, updated_at: now,
      source: item.source || null, sender: item.sender || null, requester_kind: item.requesterKind || null,
      intent: item.intent || null, urgency: item.urgency || null,
      text: (item.text || "").slice(0, 500),
      status: "received",
      stage_history: JSON.stringify([{ stage: "received", ts: now }]),
      output_dest: null, draft_ref: null, error: null,
      meta: item.meta ? JSON.stringify(item.meta) : null,
    });
  return id;
}

// Advance lifecycle. Appends to stage_history and optionally patches fields.
function transition(id, status, patch = {}) {
  if (!STATUSES.includes(status)) throw new Error("invalid status: " + status);
  const d = db();
  const row = d.prepare("SELECT stage_history FROM work_items WHERE id=?").get(id);
  if (!row) return false;
  const now = Date.now();
  let hist = [];
  try { hist = JSON.parse(row.stage_history) || []; } catch { hist = []; }
  hist.push({ stage: status, ts: now });

  const fields = ["status=@status", "updated_at=@updated_at", "stage_history=@stage_history"];
  const p = { id, status, updated_at: now, stage_history: JSON.stringify(hist) };
  const map = { intent: "intent", urgency: "urgency", requesterKind: "requester_kind",
                outputDest: "output_dest", draftRef: "draft_ref", error: "error" };
  for (const k in map) {
    if (patch[k] != null) { fields.push(`${map[k]}=@${map[k]}`); p[map[k]] = patch[k]; }
  }
  d.prepare(`UPDATE work_items SET ${fields.join(",")} WHERE id=@id`).run(p);
  return true;
}

function get(id) { return db().prepare("SELECT * FROM work_items WHERE id=?").get(id) || null; }

function list(opts = {}) {
  const d = db();
  const where = [], p = {};
  if (opts.status) { where.push("status=@status"); p.status = opts.status; }
  if (opts.source) { where.push("source=@source"); p.source = opts.source; }
  if (opts.since)  { where.push("created_at>=@since"); p.since = opts.since; }
  p.lim = opts.limit || 100;
  const sql = "SELECT * FROM work_items" + (where.length ? " WHERE " + where.join(" AND ") : "") +
              " ORDER BY created_at DESC LIMIT @lim";
  return d.prepare(sql).all(p);
}

function stats() {
  const rows = db().prepare("SELECT status,COUNT(*) c FROM work_items GROUP BY status").all();
  const out = { total: 0 };
  STATUSES.forEach((s) => (out[s] = 0));
  rows.forEach((r) => { out[r.status] = r.c; out.total += r.c; });
  out.inHandling = out.received + out.processing + out.drafted + out.awaiting_barak + out.awaiting_condition;
  out.terminal = out.done + out.dropped + out.failed;
  return out;
}

// Items that should have moved but haven't — the "nothing falls through" guard.
// By default excludes awaiting_barak (that's legitimate waiting on Barak).
function stuck({ olderThanMs = 3600000, statuses = ACTIVE_STUCK } = {}) {
  const d = db();
  const cutoff = Date.now() - olderThanMs;
  const ph = statuses.map((_, i) => "@s" + i).join(",");
  const p = { cutoff };
  statuses.forEach((s, i) => (p["s" + i] = s));
  return d.prepare(`SELECT * FROM work_items WHERE updated_at < @cutoff AND status IN (${ph}) ORDER BY updated_at ASC`).all(p);
}

// One-call health view for a cron/heartbeat to surface to Barak.
function sweep(opts = {}) {
  return { at: new Date().toISOString(), stats: stats(), stuck: stuck(opts) };
}

// ── self-test (offline, temp DB) ──────────────────────────────────────────────
function selfTest() {
  const tmp = path.join(os.tmpdir(), `work-ledger-test-${crypto.randomBytes(4).toString("hex")}.db`);
  open(tmp);
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗", m); } };

  // record
  const id1 = record({ source: "wa", messageId: "m1", sender: "972509554483@s.whatsapp.net", text: "תזכיר לי", intent: null });
  ok(!!id1, "record returns id");
  ok(get(id1).status === "received", "new item is received");
  ok(JSON.parse(get(id1).stage_history).length === 1, "stage history seeded");

  // idempotency
  const id1b = record({ source: "wa", messageId: "m1", sender: "x", text: "dup" });
  ok(id1b === id1, "idempotent on source:messageId");
  ok(stats().total === 1, "no duplicate row");

  // transition + patch
  ok(transition(id1, "processing"), "transition processing");
  ok(transition(id1, "drafted", { intent: "client-fault", urgency: "high" }), "transition drafted + patch");
  ok(get(id1).intent === "client-fault" && get(id1).urgency === "high", "patch fields persisted");
  ok(JSON.parse(get(id1).stage_history).length === 3, "stage history grew to 3");
  ok(transition(id1, "awaiting_barak", { outputDest: "120363407758194119@g.us" }), "transition awaiting_barak");
  ok(get(id1).output_dest.includes("@g.us"), "output_dest stored");

  // invalid status
  let threw = false;
  try { transition(id1, "bogus"); } catch { threw = true; }
  ok(threw, "invalid status throws");

  // transition unknown id
  ok(transition("no-such-id", "done") === false, "transition unknown id → false");

  // second item → done; third → dropped
  const id2 = record({ source: "email", messageId: "e1", text: "הצעת מחיר" });
  transition(id2, "processing"); transition(id2, "done");
  const id3 = record({ source: "wa", messageId: "n1", text: "סתם" });
  transition(id3, "dropped", { intent: "noise" });

  // stats
  const s = stats();
  ok(s.total === 3, "stats total 3");
  ok(s.inHandling === 1, "inHandling = 1 (id1 awaiting_barak)");
  ok(s.done === 1 && s.dropped === 1, "done=1 dropped=1");

  // list filters
  ok(list({ status: "done" }).length === 1, "list by status");
  ok(list({ source: "wa" }).length === 2, "list by source");
  ok(list({ limit: 1 }).length === 1, "list limit");

  // stuck: make id1's awaiting_barak NOT stuck by default, but a processing item old → stuck
  const id4 = record({ source: "voice", messageId: "v1", text: "old one" });
  transition(id4, "processing");
  db().prepare("UPDATE work_items SET updated_at=? WHERE id=?").run(Date.now() - 7200000, id4); // 2h ago
  const st = stuck({ olderThanMs: 3600000 });
  ok(st.length === 1 && st[0].id === id4, "stuck finds old processing item");
  ok(stuck({ olderThanMs: 3600000 }).every((r) => r.status !== "awaiting_barak"), "stuck excludes awaiting_barak by default");

  // sweep shape
  const sw = sweep();
  ok(sw.stats && Array.isArray(sw.stuck), "sweep returns {stats,stuck}");

  try { db().close(); } catch { /* noop */ }
  try { fs.rmSync(tmp, { force: true }); fs.rmSync(tmp + "-wal", { force: true }); fs.rmSync(tmp + "-shm", { force: true }); } catch { /* noop */ }

  console.log(`\nWORK-LEDGER SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────--
function getArg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function fmt(row) {
  const age = Math.round((Date.now() - row.updated_at) / 60000);
  return `${row.status.padEnd(18)} ${(row.source || "?").padEnd(7)} ${(row.intent || "-").padEnd(16)} ${age}m  ${(row.text || "").slice(0, 40)}  [${row.id.slice(0, 8)}]`;
}
function main() {
  const cmd = process.argv[2];
  if (cmd === "self-test") return selfTest();
  if (cmd === "stats") {
    console.log(JSON.stringify(stats(), null, 2));
  } else if (cmd === "list") {
    const rows = list({ status: getArg("status"), source: getArg("source"), limit: Number(getArg("limit", "50")) });
    console.log(`${rows.length} items:`);
    rows.forEach((r) => console.log("  " + fmt(r)));
  } else if (cmd === "stuck") {
    const rows = stuck({ olderThanMs: Number(getArg("older-min", "60")) * 60000 });
    console.log(`${rows.length} stuck items (older than ${getArg("older-min", "60")}m):`);
    rows.forEach((r) => console.log("  " + fmt(r)));
  } else if (cmd === "get") {
    const r = get(process.argv[3]);
    console.log(r ? JSON.stringify(r, null, 2) : "not found");
  } else {
    console.log("usage: node alfred-work-ledger.js [stats|list|stuck|get <id>|self-test] [--status X] [--source Y] [--limit N] [--older-min M]");
  }
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("ERROR:", e.message); process.exit(1); }
}

module.exports = { open, record, transition, get, list, stats, stuck, sweep, STATUSES, TERMINAL, DEFAULT_DB };
