#!/usr/bin/env node
/**
 * monday-brief.js — Sunday start-of-week briefing for Barak
 *
 * Source: anthropic-smb-comparison.md §10 Action #17
 * Cadence: Sun 07:00 Asia/Jerusalem (or on demand via /monday-brief)
 * Output: Single WhatsApp message to self-chat
 *
 * NOTE on dependencies:
 *   - In Phase 1 (before bee-mcp-server): falls back to direct alfred-*.js calls
 *   - In Phase 2+ (bee-mcp-server up): uses MCP tools for consistency
 *   - Both paths must produce same shape — controlled by USE_MCP env var
 *
 * USAGE:
 *   node monday-brief.js              # send to self-chat
 *   node monday-brief.js --dry-run    # print to stdout
 *   node monday-brief.js --verbose
 *
 * CRON: openclaw cron add monday-brief --schedule "0 7 * * 0" \
 *         --script "commands/monday-brief.js" --tz "Asia/Jerusalem"
 */

import { formatBrief, sendToSelfChat } from "./shared/format-brief.js";
import { gatherPipeline, gatherSchedule, gatherTenders, gatherHealthAlerts,
         gatherCash, gatherCalendar } from "./shared/data-aggregator.js";

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

async function main() {
  const start = Date.now();
  if (VERBOSE) console.log("[monday-brief] starting…");

  // Run all aggregators in parallel — they're independent
  const [pipeline, schedule, tenders, healthAlerts, cash, calendar] = await Promise.all([
    gatherPipeline().catch((e) => ({ error: e.message })),
    gatherSchedule({ days: 7 }).catch((e) => ({ error: e.message })),
    gatherTenders({ within_days: 14 }).catch((e) => ({ error: e.message })),
    gatherHealthAlerts({ score_below: 50 }).catch((e) => ({ error: e.message })),
    gatherCash().catch((e) => ({ error: e.message })),
    gatherCalendar({ days: 1 }).catch((e) => ({ error: e.message })),
  ]);

  if (VERBOSE) console.log(`[monday-brief] aggregated in ${Date.now() - start}ms`);

  const sections = [
    {
      emoji: "📈",
      heading: "Pipeline (this week)",
      body: formatPipeline(pipeline),
    },
    {
      emoji: "🗓️",
      heading: "Top 5 jobs this week",
      body: formatSchedule(schedule),
    },
    {
      emoji: "📋",
      heading: "Tender deadlines (next 14d)",
      body: formatTenders(tenders),
    },
    {
      emoji: "⚠️",
      heading: "Health alerts",
      body: formatAlerts(healthAlerts),
    },
    {
      emoji: "💰",
      heading: "Cash position",
      body: formatCash(cash),
    },
    {
      emoji: "📅",
      heading: "Tomorrow",
      body: formatCalendar(calendar),
    },
  ];

  const message = formatBrief({
    title: "*Monday brief — start of week*",
    intro: hebrewDateString(),
    sections,
    footer: "_Reply /thx if all clear, /huh if something's off._",
  });

  if (DRY_RUN) {
    console.log("=== DRY RUN OUTPUT ===");
    console.log(message);
    return;
  }

  await sendToSelfChat(message);
  console.log("[monday-brief] sent");
}

// ===== Formatters =====

function formatPipeline(p) {
  if (p.error) return `_(error: ${p.error})_`;
  if (!p.open_quotes && !p.deals_close) return "אין פעילות חדשה.";

  const lines = [];
  if (p.open_quotes > 0) {
    lines.push(`${p.open_quotes} הצעות פתוחות (${p.open_quotes_aged_7d} מעל שבוע)`);
  }
  if (p.deals_close_to_close && p.deals_close_to_close.length > 0) {
    lines.push("Close to close:");
    for (const d of p.deals_close_to_close.slice(0, 3)) {
      lines.push(`  • ${d.name} — ${d.value_nis.toLocaleString()} ₪`);
    }
  }
  return lines.join("\n");
}

function formatSchedule(s) {
  if (s.error) return `_(error: ${s.error})_`;
  if (!s.jobs || s.jobs.length === 0) return "אין משימות מתוזמנות.";
  return s.jobs
    .slice(0, 5)
    .map((j) => `  • ${j.day} — ${j.title} (${j.assignee || "לא משויך"})`)
    .join("\n");
}

function formatTenders(t) {
  if (t.error) return `_(error: ${t.error})_`;
  if (!t.tenders || t.tenders.length === 0) return "✓ אין deadlines קרובים.";
  return t.tenders
    .map((td) => {
      const urgency = td.days_to_deadline <= 3 ? "🚨" : td.days_to_deadline <= 7 ? "⚠️" : "📌";
      return `  ${urgency} ${td.name_he} — ${td.days_to_deadline} ימים`;
    })
    .join("\n");
}

function formatAlerts(a) {
  if (a.error) return `_(error: ${a.error})_`;
  if (!a.customers || a.customers.length === 0) return "✓ אין לקוחות ב-risk.";
  return a.customers
    .map((c) => `  • ${c.name_he} — health ${c.score}/100 (${c.reason || "n/a"})`)
    .join("\n");
}

function formatCash(c) {
  if (c.error) return `_(MCP/Invoice Maven not yet wired: ${c.error})_`;
  return [
    `AR open: ${c.ar_open_nis?.toLocaleString() || "?"} ₪`,
    `AR > 30d: ${c.ar_overdue_30d_nis?.toLocaleString() || "?"} ₪`,
    `This week paid: ${c.paid_this_week_nis?.toLocaleString() || "?"} ₪`,
  ].join("\n  ");
}

function formatCalendar(c) {
  if (c.error) return `_(error: ${c.error})_`;
  if (!c.events || c.events.length === 0) return "אין פגישות מחר.";
  return c.events
    .map((e) => `  • ${e.time} — ${e.title} ${e.location ? `(${e.location})` : ""}`)
    .join("\n");
}

function hebrewDateString() {
  const today = new Date();
  const opts = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  // Returns e.g., "יום ראשון, 26 במאי 2026"
  return today.toLocaleDateString("he-IL", opts);
}

main().catch((e) => {
  console.error(`[monday-brief] fatal: ${e.message}`);
  process.exit(1);
});
