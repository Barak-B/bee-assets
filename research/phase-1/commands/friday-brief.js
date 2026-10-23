#!/usr/bin/env node
/**
 * friday-brief.js — Thursday-evening end-of-week wrap for Barak
 *
 * Source: anthropic-smb-comparison.md §10 Action #18
 * Cadence: Thu 17:00 Asia/Jerusalem
 * Output: Single WhatsApp message to self-chat
 *
 * USAGE:
 *   node friday-brief.js
 *   node friday-brief.js --dry-run
 *
 * CRON: openclaw cron add friday-brief --schedule "0 17 * * 4" \
 *         --script "commands/friday-brief.js" --tz "Asia/Jerusalem"
 */

import { formatBrief, sendToSelfChat } from "./shared/format-brief.js";
import {
  gatherCompletedJobs,
  gatherSlippedItems,
  gatherWins,
  gatherCashCollected,
  gatherNextWeekPriorities,
  gatherWeekendTickets,
} from "./shared/data-aggregator.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const [completed, slipped, wins, cash, nextWeek, weekendTickets] = await Promise.all([
    gatherCompletedJobs({ days: 5 }).catch((e) => ({ error: e.message })),
    gatherSlippedItems().catch((e) => ({ error: e.message })),
    gatherWins({ days: 5 }).catch((e) => ({ error: e.message })),
    gatherCashCollected({ days: 5 }).catch((e) => ({ error: e.message })),
    gatherNextWeekPriorities({ limit: 3 }).catch((e) => ({ error: e.message })),
    gatherWeekendTickets().catch((e) => ({ error: e.message })),
  ]);

  const sections = [
    { emoji: "✅", heading: "Done this week", body: formatCompleted(completed) },
    { emoji: "⏰", heading: "Slipped (with reasons)", body: formatSlipped(slipped) },
    { emoji: "🏆", heading: "Wins", body: formatWins(wins) },
    { emoji: "💰", heading: "Cash collected", body: formatCash(cash) },
    { emoji: "🎯", heading: "Top 3 next week", body: formatNextWeek(nextWeek) },
    { emoji: "📞", heading: "Weekend attention", body: formatWeekend(weekendTickets) },
  ];

  const message = formatBrief({
    title: "*End-of-week wrap*",
    intro: hebrewDateString(),
    sections,
    footer: "_Shabbat shalom._ Reply /save if any item should carry to next-week brief.",
  });

  if (DRY_RUN) {
    console.log("=== DRY RUN OUTPUT ===");
    console.log(message);
    return;
  }
  await sendToSelfChat(message);
  console.log("[friday-brief] sent");
}

function formatCompleted(c) {
  if (c.error) return `_(${c.error})_`;
  if (!c.jobs?.length) return "אין משימות שהושלמו השבוע (חריג — לבדוק).";
  return `${c.jobs.length} משימות הושלמו. Top:\n` +
    c.jobs.slice(0, 5).map((j) => `  ✓ ${j.title} (${j.day})`).join("\n");
}

function formatSlipped(s) {
  if (s.error) return `_(${s.error})_`;
  if (!s.items?.length) return "✓ אין slip.";
  return s.items
    .map((i) => `  ↪ ${i.name} — ${i.days_overdue}d (${i.reason || "n/a"})`)
    .join("\n");
}

function formatWins(w) {
  if (w.error) return `_(${w.error})_`;
  const closed = w.deals_won_count || 0;
  const installed = w.installations_done_count || 0;
  if (!closed && !installed) return "_שבוע שקט._";
  const lines = [];
  if (closed) lines.push(`${closed} deals נסגרו, סה"כ ${w.deals_won_value_nis?.toLocaleString()} ₪`);
  if (installed) lines.push(`${installed} התקנות הושלמו`);
  return lines.join("\n");
}

function formatCash(c) {
  if (c.error) return `_(${c.error})_`;
  return `${c.paid_nis?.toLocaleString() || 0} ₪ נכנסו, ${c.outstanding_nis?.toLocaleString() || 0} ₪ עדיין פתוחים`;
}

function formatNextWeek(n) {
  if (n.error) return `_(${n.error})_`;
  if (!n.items?.length) return "_(לא זוהה priority — Monday brief יפרט)_";
  return n.items.map((i, idx) => `  ${idx + 1}. ${i.title}`).join("\n");
}

function formatWeekend(w) {
  if (w.error) return `_(${w.error})_`;
  if (!w.tickets?.length) return "✓ נקי. נוח.";
  return w.tickets.map((t) => `  📞 ${t.summary}`).join("\n");
}

function hebrewDateString() {
  return new Date().toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

main().catch((e) => {
  console.error(`[friday-brief] fatal: ${e.message}`);
  process.exit(1);
});
