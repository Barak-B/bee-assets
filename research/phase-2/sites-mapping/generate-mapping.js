#!/usr/bin/env node
/**
 * generate-mapping.js — Phase 2 Action #11
 *
 * Build sites/_mapping.json: { "<jid>@g.us": "<site_slug>", ... }
 *
 * Inputs (in priority order):
 *   1. WA chat export CSV from wa-contacts-export.md (Phase 1.5 #3)
 *      OR direct sqlite3 query against workspace.db
 *   2. BEE app snapshot — site list with name + city + customer
 *   3. Existing sites/<X>.md files in workspace
 *
 * Strategy:
 *   - Pull all @g.us group chats from workspace.db
 *   - For each group, score match against each BEE site by:
 *      a) Hebrew name fuzzy match (group name contains site name)
 *      b) Customer name appears in group title
 *      c) City name appears in group title
 *   - High-confidence matches (>0.8): auto-assign
 *   - Medium (0.5-0.8): write to review.json for Barak
 *   - Low (<0.5): leave unmapped (one of: customer-only, site-less, group-not-site)
 *
 * USAGE:
 *   node generate-mapping.js --workspace-db <path> --sites <bee-snapshot.json> [--dry-run]
 *
 * OUTPUT:
 *   - sites/_mapping.json         (high-confidence auto-mapped)
 *   - sites/_mapping_review.json  (medium-confidence for Barak review)
 *   - sites/_mapping_unmatched.json (low-conf — likely customer-personal chats)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== CLI =====
const args = parseArgs();

function parseArgs() {
  const out = {
    workspace_db:
      process.env.WORKSPACE_DB ||
      join(process.env.HOME || process.env.USERPROFILE, "AppData", "Local", "hermes", "hermes-agent", "workspace.db"),
    sites_json: null,
    out_dir: join(__dirname, "output"),
    dry_run: false,
    verbose: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k === "--workspace-db") out.workspace_db = process.argv[++i];
    else if (k === "--sites") out.sites_json = process.argv[++i];
    else if (k === "--out") out.out_dir = process.argv[++i];
    else if (k === "--dry-run") out.dry_run = true;
    else if (k === "--verbose") out.verbose = true;
  }
  return out;
}

// ===== Step 1: Pull all WA groups from workspace.db =====
function loadWaGroups(dbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`workspace.db not found at ${dbPath}`);
  }
  const db = new Database(dbPath, { readonly: true });
  // Note: schema may vary by Baileys version. Adjust column names if needed.
  // Try multiple schemas:
  const candidates = [
    `SELECT chat_id AS id, COALESCE(display_name, name, subject, chat_id) AS name,
            COALESCE(last_message_at, 0) AS last_msg,
            COALESCE(message_count, 0) AS messages
     FROM chats
     WHERE chat_id LIKE '%@g.us'
       AND COALESCE(archived, 0) = 0`,
    `SELECT id, name, lastMessageTimestamp AS last_msg, messageCount AS messages
     FROM chats WHERE id LIKE '%@g.us' AND archived = 0`,
  ];
  let groups;
  for (const sql of candidates) {
    try {
      groups = db.prepare(sql).all();
      break;
    } catch (e) {
      // try next schema
    }
  }
  db.close();
  if (!groups) throw new Error("Could not query chats table — schema unknown. Inspect workspace.db structure.");
  return groups;
}

// ===== Step 2: Load BEE sites snapshot =====
function loadBeeSites(path) {
  if (!path || !existsSync(path)) {
    console.warn(
      "No --sites snapshot provided. Mapping will rely on group names alone (high false-negative)."
    );
    return [];
  }
  const sites = JSON.parse(readFileSync(path, "utf-8"));
  // Accept either array or { sites: [...] } shape
  return Array.isArray(sites) ? sites : sites.sites || [];
}

// ===== Step 3: Score match =====
function scoreMatch(groupName, site) {
  let score = 0;
  const name = (groupName || "").toLowerCase();
  const siteName = (site.name_he || site.name || "").toLowerCase();
  const customer = (site.customer_name || "").toLowerCase();
  const city = (site.city || "").toLowerCase();

  // a) Direct name match
  if (siteName && name.includes(siteName)) {
    score += 0.6;
    if (name.startsWith(siteName) || name.endsWith(siteName)) score += 0.1;
  }

  // b) Customer name match
  if (customer && name.includes(customer)) score += 0.2;

  // c) City match
  if (city && name.includes(city)) score += 0.15;

  // d) Hebrew-specific: "התקנת מערכת" + site name = strong signal
  if (siteName && /התקנ|מערכת|סולא/u.test(name) && name.includes(siteName)) {
    score += 0.1;
  }

  // Penalize ambiguous matches (multiple sites named similarly)
  if (siteName && siteName.length < 4) score *= 0.5;

  return Math.min(1.0, score);
}

// ===== Step 4: Main =====
function main() {
  const groups = loadWaGroups(args.workspace_db);
  const sites = loadBeeSites(args.sites_json);
  console.log(`Loaded ${groups.length} WA groups and ${sites.length} BEE sites`);

  if (groups.length === 0) {
    console.error("No groups found. Check workspace.db schema.");
    process.exit(1);
  }

  const mapping = {}; // high-confidence
  const review = {}; // medium-confidence
  const unmatched = []; // low-confidence

  for (const g of groups) {
    let best = { site_id: null, score: 0 };
    for (const site of sites) {
      const s = scoreMatch(g.name, site);
      if (s > best.score) {
        best = {
          site_id: site.id || site.slug,
          site_name: site.name_he || site.name,
          customer: site.customer_name,
          score: s,
        };
      }
    }

    const entry = {
      group_id: g.id,
      group_name: g.name,
      messages: g.messages,
      last_msg: new Date(g.last_msg * 1000).toISOString(),
      best,
    };

    if (best.score >= 0.8) {
      mapping[g.id] = best.site_id;
      if (args.verbose) console.log(`✓ ${g.name} → ${best.site_name} (${best.score.toFixed(2)})`);
    } else if (best.score >= 0.5) {
      review[g.id] = entry;
      if (args.verbose) console.log(`? ${g.name} → ${best.site_name} (${best.score.toFixed(2)})`);
    } else {
      unmatched.push(entry);
    }
  }

  console.log(`\nResults:`);
  console.log(`  High-conf  mapped:  ${Object.keys(mapping).length}`);
  console.log(`  Medium-conf review: ${Object.keys(review).length}`);
  console.log(`  Unmatched:          ${unmatched.length}`);

  if (args.dry_run) {
    console.log("\n[DRY RUN] Not writing files.");
    return;
  }

  // Ensure output dir exists
  const { mkdirSync } = require("node:fs");
  mkdirSync(args.out_dir, { recursive: true });

  writeFileSync(join(args.out_dir, "_mapping.json"), JSON.stringify(mapping, null, 2));
  writeFileSync(join(args.out_dir, "_mapping_review.json"), JSON.stringify(review, null, 2));
  writeFileSync(
    join(args.out_dir, "_mapping_unmatched.json"),
    JSON.stringify(unmatched, null, 2)
  );

  console.log(`\nFiles written to ${args.out_dir}/`);
  console.log("Next: review _mapping_review.json with Barak, promote confirmed matches.");
}

main();
