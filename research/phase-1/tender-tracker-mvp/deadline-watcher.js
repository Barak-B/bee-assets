// deadline-watcher.js
//
// For each open tender in db, check days-to-deadline and emit alerts
// at configured thresholds (default 30/14/7/3/1/0).
//
// Idempotency: tracks last_alert_day per tender so we don't spam.
// If today's days-to-deadline crosses a new threshold, emit; else skip.

import fetch from "node-fetch";

/**
 * @param {Database} db - better-sqlite3 instance
 * @param {object} config
 * @param {object} opts
 * @returns {Promise<number>} count of alerts sent
 */
export async function runDeadlineWatcher(db, config, opts = {}) {
  const { dryRun = false, verbose = false } = opts;
  const thresholds = config.alert_thresholds_days || [30, 14, 7, 3, 1, 0];

  const open = db.prepare(`
    SELECT *
    FROM tenders
    WHERE status IN ('open', 'applying')
    ORDER BY deadline_date ASC
  `).all();

  if (verbose) console.log(`[deadline-watcher] ${open.length} open tenders`);

  let alertsSent = 0;
  for (const t of open) {
    const days = daysUntil(t.deadline_date);

    // Past deadline → mark missed (if status still open)
    if (days < 0) {
      if (t.status === "open") {
        if (verbose) console.log(`[deadline-watcher] ${t.name_he} marking missed (${days}d past)`);
        if (!dryRun) {
          db.prepare("UPDATE tenders SET status = 'missed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(t.id);
          await sendAlert(
            `🚨 *Tender deadline passed without submission*\n\n` +
            `*${t.name_he}*\n` +
            `Deadline was: ${t.deadline_date} (${-days} days ago)\n` +
            `Source: ${t.source}\n\n` +
            `Marked as 'missed' in db. If you DID submit, reply: \`/tender submitted ${t.id}\``,
            config
          );
          alertsSent++;
        }
      }
      continue;
    }

    // Find which threshold we crossed
    const threshold = thresholds.find((th) => days <= th);
    if (threshold === undefined) continue; // not yet within any window

    // Did we already alert for this or a tighter threshold?
    if (t.last_alert_day !== null && t.last_alert_day <= threshold) {
      continue; // already alerted, skip
    }

    if (verbose) console.log(`[deadline-watcher] ${t.name_he}: ${days}d → alert at ${threshold}d threshold`);

    const msg = buildMessage(t, days, threshold);
    if (!dryRun) {
      await sendAlert(msg, config);
      db.prepare(
        "UPDATE tenders SET last_alert_day = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(threshold, t.id);
    }
    alertsSent++;
  }

  return alertsSent;
}

// ===== Helpers =====

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function buildMessage(t, days, threshold) {
  const urgency = (() => {
    if (threshold === 0) return "🚨🚨🚨 DEADLINE TODAY";
    if (threshold === 1) return "🚨🚨 TOMORROW";
    if (threshold === 3) return "🚨 3 DAYS";
    if (threshold === 7) return "⚠️ 7 DAYS";
    if (threshold === 14) return "📋 14 DAYS";
    return "📅 NEW TENDER";
  })();

  let msg =
    `${urgency}\n\n` +
    `*${t.name_he}*\n` +
    `Deadline: ${t.deadline_date} (${days === 0 ? "TODAY" : `${days} ימים`})\n` +
    `Source: ${t.source}\n`;

  if (t.estimated_value_nis) {
    msg += `Estimated value: ₪${t.estimated_value_nis.toLocaleString()}\n`;
  }
  if (t.source_url) {
    msg += `Link: ${t.source_url}\n`;
  }
  if (t.monday_item_id) {
    msg += `Monday: <link>\n`;
  }

  // Action prompts vary by urgency
  msg += "\n";
  if (threshold === 0) {
    msg += `*Did you submit?* Reply:\n  \`/tender submitted ${t.id}\`\n  \`/tender skip ${t.id}\``;
  } else if (threshold <= 3) {
    msg += `Finalize submission. Documents ready? Pricing locked?`;
  } else if (threshold <= 7) {
    msg += `Start gathering documents. Block prep time.`;
  } else if (threshold <= 14) {
    msg += `Schedule review session. Decide pursue / skip.`;
  } else {
    msg += `Reviewed for fit when you have a moment.`;
  }

  return msg;
}

async function sendAlert(message, config) {
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
    if (!res.ok) throw new Error(`Bridge ${res.status}`);
  } catch (e) {
    console.error(`[deadline-watcher] sendAlert failed: ${e.message}`);
    // Queue for retry
    const fs = await import("node:fs");
    fs.appendFileSync(
      "./tender-alerts-pending.jsonl",
      JSON.stringify({ ts: new Date().toISOString(), message }) + "\n"
    );
  }
}
