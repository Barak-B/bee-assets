#!/usr/bin/env node
// tender-tracker-mvp/index.js — main entry
//
// Phase 1 Action #7 — see README.md for context.
//
// Flow:
//   1. Load config
//   2. Open local sqlite db (creates schema if first run)
//   3. Poll all sources → extract candidate tenders
//   4. Filter by keywords → dedup against db
//   5. New finds → write to sqlite + Monday board + alert ⚡
//   6. Run deadline-watcher → alerts for T-30/14/7/3/1/0
//   7. Log + exit

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { pollAllSources } from "./gov-rss-poller.js";
import { syncToMonday, ensureBoard } from "./monday-board-sync.js";
import { runDeadlineWatcher } from "./deadline-watcher.js";

// ===== CLI flags =====
const DRY_RUN = process.argv.includes("--dry-run");
const NO_ALERTS = process.argv.includes("--no-alerts");
const ALERTS_ONLY = process.argv.includes("--alerts-only");
const VERBOSE = process.argv.includes("--verbose");

// ===== Setup =====
const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  readFileSync(join(__dirname, "config.json"), "utf-8")
);
const db = new Database(join(__dirname, "tenders.db"));
initSchema(db);

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenders (
      id              TEXT PRIMARY KEY,             -- UUID
      name_he         TEXT NOT NULL,
      source          TEXT NOT NULL,
      source_url      TEXT,
      issued_date     TEXT,
      deadline_date   TEXT NOT NULL,
      submission_method TEXT,
      estimated_value_nis INTEGER,
      status          TEXT NOT NULL DEFAULT 'open',  -- open|applying|submitted|won|lost|missed|closed
      monday_item_id  TEXT,
      raw_html_or_json TEXT,
      created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_alert_day  INTEGER,                       -- last threshold day alerted
      notes           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON tenders(deadline_date);
    CREATE INDEX IF NOT EXISTS idx_tenders_status   ON tenders(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenders_source_url ON tenders(source_url);
  `);
}

// ===== Logging =====
function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  // TODO: also write to config.logging.log_file
}

const info = (msg) => log("INFO", msg);
const warn = (msg) => log("WARN", msg);
const err = (msg) => log("ERROR", msg);
const dbg = (msg) => VERBOSE && log("DEBUG", msg);

// ===== Main =====
async function main() {
  info(`tender-tracker-mvp starting (dry_run=${DRY_RUN}, alerts_only=${ALERTS_ONLY})`);

  if (!ALERTS_ONLY) {
    // Phase A: discover new tenders
    info("Phase A: Polling sources...");
    const candidates = await pollAllSources(config, { verbose: VERBOSE });
    info(`Found ${candidates.length} raw candidates`);

    // Phase B: filter + dedup
    const filtered = filterAndDedup(candidates, config, db);
    info(`After filter+dedup: ${filtered.length} new tenders`);

    // Phase C: persist + monday sync + initial alert
    if (filtered.length > 0) {
      const boardCtx = DRY_RUN ? null : await ensureBoard(config);

      for (const tender of filtered) {
        if (DRY_RUN) {
          info(`[DRY] Would persist: ${tender.name_he} (deadline ${tender.deadline_date})`);
          continue;
        }
        persistTender(db, tender);

        const mondayItemId = await syncToMonday(boardCtx, tender, config);
        if (mondayItemId) {
          db.prepare(
            "UPDATE tenders SET monday_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).run(mondayItemId, tender.id);
        }

        if (!NO_ALERTS) {
          await sendNewTenderAlert(tender, config);
        }
      }
    }
  }

  // Phase D: deadline watcher (always run unless --no-alerts)
  if (!NO_ALERTS) {
    info("Phase D: Running deadline-watcher...");
    const alertsSent = await runDeadlineWatcher(db, config, { dryRun: DRY_RUN, verbose: VERBOSE });
    info(`Deadline alerts sent: ${alertsSent}`);
  }

  info("tender-tracker-mvp complete");
  db.close();
}

function filterAndDedup(candidates, config, db) {
  const include = config.keywords.include.map((k) => k.toLowerCase());
  const exclude = config.keywords.exclude.map((k) => k.toLowerCase());

  const filtered = candidates.filter((c) => {
    const hay = `${c.name_he || ""} ${c.description || ""}`.toLowerCase();

    if (exclude.some((e) => hay.includes(e))) {
      dbg(`Excluded by keyword: ${c.name_he}`);
      return false;
    }
    if (!include.some((i) => hay.includes(i))) {
      dbg(`No matching keyword: ${c.name_he}`);
      return false;
    }
    return true;
  });

  // Dedup against db
  const existsStmt = db.prepare("SELECT id FROM tenders WHERE source_url = ?");
  const seen = new Set();
  const fresh = [];

  for (const tender of filtered) {
    if (seen.has(tender.source_url)) continue;
    seen.add(tender.source_url);

    const existing = existsStmt.get(tender.source_url);
    if (existing) {
      dbg(`Already in db: ${tender.name_he}`);
      continue;
    }

    // Assign UUID
    tender.id = crypto.randomUUID();
    fresh.push(tender);
  }

  return fresh;
}

function persistTender(db, t) {
  db.prepare(`
    INSERT INTO tenders
      (id, name_he, source, source_url, issued_date, deadline_date,
       submission_method, estimated_value_nis, status, raw_html_or_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    t.id,
    t.name_he,
    t.source,
    t.source_url || null,
    t.issued_date || null,
    t.deadline_date,
    t.submission_method || null,
    t.estimated_value_nis || null,
    t.raw ? JSON.stringify(t.raw) : null
  );
}

async function sendNewTenderAlert(tender, config) {
  const daysToDeadline = Math.ceil(
    (new Date(tender.deadline_date) - new Date()) / (1000 * 60 * 60 * 24)
  );

  const msg =
    `📋 *מכרז חדש זוהה*\n\n` +
    `*${tender.name_he}*\n` +
    `מקור: ${tender.source}\n` +
    `Deadline: ${tender.deadline_date} (${daysToDeadline} ימים)\n` +
    (tender.estimated_value_nis ? `ערך מוערך: ₪${tender.estimated_value_nis.toLocaleString()}\n` : "") +
    (tender.source_url ? `קישור: ${tender.source_url}\n` : "") +
    `\nMonday: <link will appear after sync>`;

  await sendToSelfChat(msg, config);
}

async function sendToSelfChat(message, config) {
  const url = config.alfred.hermes_bridge_url;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: `${config.alfred.self_phone_e164}@s.whatsapp.net`,
        text: message,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
    info("Alert sent");
  } catch (e) {
    err(`sendToSelfChat failed: ${e.message}`);
  }
}

// ===== Run =====
main().catch((e) => {
  err(`Fatal: ${e.message}\n${e.stack}`);
  process.exit(1);
});
