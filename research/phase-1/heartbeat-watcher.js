#!/usr/bin/env node
// heartbeat-watcher.js — Phase 1 Action #5 (silent-outage prevention)
//
// SOURCE: master-plan-v1-v20.md v9 Step 12 + v15 12.B Action #5
// PROBLEM SOLVED: DeepSeek balance hit $0 on 2026-05-22; 4 Hermes crons broken
//                 silently for 3+ days before noticed.
// HOW THIS HELPS: Daily 23:55 check — if Hermes consumed 0 tokens in 24h,
//                 send urgent ⚡ alert to Barak via Alfred.
//
// HOW TO INSTALL:
//   1. Copy to: E:\Desktop\OpenClawAgent\scripts\heartbeat-watcher.js
//   2. Adjust HERMES_STATE_DB_PATH below if Hermes state.db lives elsewhere
//   3. Register as Alfred cron:
//        openclaw cron add heartbeat-watcher \
//            --schedule "55 23 * * *" \
//            --script "scripts/heartbeat-watcher.js" \
//            --timezone "Asia/Jerusalem"
//   4. Test manually: node scripts/heartbeat-watcher.js --dry-run
//
// ROLLBACK: openclaw cron disable heartbeat-watcher

const Database = require("better-sqlite3");
const path = require("path");

// ============================================================
// CONFIG — adjust paths to match your local setup
// ============================================================
const HERMES_STATE_DB_PATH =
  process.env.HERMES_STATE_DB ||
  path.join(process.env.LOCALAPPDATA || "", "hermes", "hermes-agent", "state.db");

const ALFRED_SELF_CHAT = process.env.SELF_PHONE_E164 || "972509554483";

// Thresholds
const HOURS_LOOKBACK = 24;
const MIN_TOKENS_HEALTHY = 1; // anything > 0 means Hermes is alive
const DRY_RUN = process.argv.includes("--dry-run");

// ============================================================
// Token usage check
// ============================================================
function getTokensLast24h() {
  const db = new Database(HERMES_STATE_DB_PATH, { readonly: true });
  try {
    // Adjust this SQL to match Hermes schema. Common patterns:
    // - session_messages table with input_tokens + output_tokens
    // - tool_calls or completions table with usage data
    const sql = `
      SELECT
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COUNT(*) AS message_count
      FROM session_messages
      WHERE created_at > datetime('now', ?)
    `;
    const result = db.prepare(sql).get(`-${HOURS_LOOKBACK} hours`);
    return {
      total: (result.input_tokens || 0) + (result.output_tokens || 0),
      input: result.input_tokens || 0,
      output: result.output_tokens || 0,
      messages: result.message_count || 0,
    };
  } catch (err) {
    // If schema differs, try fallback
    console.error(`[heartbeat] Schema mismatch on state.db: ${err.message}`);
    return null;
  } finally {
    db.close();
  }
}

// ============================================================
// Alert sending (via Alfred self-chat)
// ============================================================
async function sendAlert(message) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would send to ${ALFRED_SELF_CHAT}: ${message}`);
    return;
  }

  // OPTION A: Direct WhatsApp via Hermes bridge (port 3000)
  try {
    const res = await fetch("http://127.0.0.1:3000/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: `${ALFRED_SELF_CHAT}@s.whatsapp.net`,
        text: message,
      }),
      // 10s timeout — bridge may itself be down
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log(`[heartbeat] Alert sent via Hermes bridge`);
      return;
    }
    throw new Error(`Bridge returned ${res.status}`);
  } catch (err) {
    console.error(`[heartbeat] Hermes bridge unreachable: ${err.message}`);
  }

  // OPTION B: Fallback to alfred-clarify.js push (if bridge down)
  // ... insert your Alfred outbound helper here
  // Example:
  // const alfred = require("./alfred-identity.js");
  // await alfred.pushToSelfChat(message);

  // OPTION C: Last resort — write to disk for next run to pick up
  const fs = require("fs");
  const stuckPath = path.join(__dirname, "..", "memory", "heartbeat-alerts-pending.jsonl");
  fs.appendFileSync(
    stuckPath,
    JSON.stringify({ ts: new Date().toISOString(), message }) + "\n"
  );
  console.log(`[heartbeat] Alert queued to ${stuckPath} (bridge was down)`);
}

// ============================================================
// Main check
// ============================================================
async function check() {
  console.log(
    `[heartbeat] ${new Date().toISOString()} — checking last ${HOURS_LOOKBACK}h…`
  );

  const usage = getTokensLast24h();

  if (!usage) {
    await sendAlert(
      `🚨 heartbeat-watcher: state.db read failed. Hermes may be very broken.\n` +
        `Path: ${HERMES_STATE_DB_PATH}\n` +
        `Run: hermes status, then check disk space + permissions.`
    );
    process.exit(1);
  }

  console.log(
    `[heartbeat] total=${usage.total} tokens, messages=${usage.messages}`
  );

  if (usage.total < MIN_TOKENS_HEALTHY) {
    await sendAlert(
      `🚨 *Hermes silent outage detected*\n\n` +
        `Last ${HOURS_LOOKBACK}h:\n` +
        `• Tokens consumed: ${usage.total} (expected: 1M+)\n` +
        `• Messages: ${usage.messages}\n\n` +
        `Likely causes:\n` +
        `• DeepSeek balance $0 → top up at platform.deepseek.com\n` +
        `• Hermes process crashed → \`hermes gateway status\`\n` +
        `• Port 3000 blocked → \`netstat -ano | findstr :3000\`\n\n` +
        `Run \`hermes logs --tail 100\` for diagnosis.`
    );
    process.exit(2);
  }

  // Healthy — silent unless verbose
  if (process.argv.includes("--verbose")) {
    console.log(`[heartbeat] OK: ${usage.total} tokens / ${usage.messages} messages`);
  }
}

check().catch((err) => {
  console.error(`[heartbeat] Fatal error: ${err.message}`);
  process.exit(99);
});
