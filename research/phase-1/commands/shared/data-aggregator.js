// shared/data-aggregator.js — fan-out to atomic skills + collect results
//
// Each gatherer returns a normalized shape. If a data source isn't available
// (e.g., Phase 1 — no bee-mcp-server yet), the gatherer either falls back
// to direct script calls or returns { error: "not available yet" }.
//
// As Phase 2/3 land, these gatherers get richer — but the briefs continue
// to work with whatever's available today.

const USE_MCP = process.env.USE_MCP === "true";
const MCP_URL = process.env.BEE_MCP_URL || "http://localhost:18791/mcp";

// ============================================================
// Pipeline / Monday boards
// ============================================================

export async function gatherPipeline() {
  // Phase 1: call alfred-monday.js directly
  // Phase 2+: use bee-mcp tool
  if (USE_MCP) {
    return mcpCall("bee.listProjects", { status: "negotiating,quoted", limit: 20 })
      .then((projects) => ({
        open_quotes: projects.length,
        open_quotes_aged_7d: projects.filter((p) =>
          daysSince(p.created_at) > 7
        ).length,
        deals_close_to_close: projects
          .filter((p) => p.status === "negotiating" && p.value_nis > 0)
          .sort((a, b) => b.value_nis - a.value_nis)
          .slice(0, 3)
          .map((p) => ({ name: p.name, value_nis: p.value_nis })),
      }));
  }
  // Phase 1 fallback: shell out to alfred-monday.js
  return runShellHelper("alfred-monday.js", ["--pipeline-summary"]);
}

// ============================================================
// Schedule (Monday הקמות board)
// ============================================================

export async function gatherSchedule({ days = 7 } = {}) {
  if (USE_MCP) {
    const after = new Date().toISOString();
    const before = new Date(Date.now() + days * 86400000).toISOString();
    return mcpCall("bee.listJobs", {
      status: "scheduled,in-progress",
      scheduled_after: after,
      scheduled_before: before,
      limit: 50,
    }).then((jobs) => ({
      jobs: jobs.slice(0, 5).map((j) => ({
        day: new Date(j.scheduled_for).toLocaleDateString("he-IL", { weekday: "short" }),
        title: j.title_he,
        assignee: j.assigned_name_he,
      })),
    }));
  }
  return runShellHelper("alfred-monday.js", ["--upcoming-jobs", String(days)]);
}

// ============================================================
// Tenders
// ============================================================

export async function gatherTenders({ within_days = 14 } = {}) {
  // Read tender-tracker-mvp/tenders.db
  const { default: Database } = await import("better-sqlite3");
  const dbPath = process.env.TENDER_DB ||
    `${process.env.HOME || process.env.USERPROFILE}/.openclaw/workspace/scripts/tender-tracker-mvp/tenders.db`;
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`
      SELECT id, name_he, deadline_date,
             julianday(deadline_date) - julianday('now') AS days_to_deadline
      FROM tenders
      WHERE status IN ('open', 'applying')
        AND deadline_date IS NOT NULL
        AND julianday(deadline_date) - julianday('now') BETWEEN 0 AND ?
      ORDER BY deadline_date ASC
    `).all(within_days);
    db.close();
    return { tenders: rows.map((r) => ({ ...r, days_to_deadline: Math.ceil(r.days_to_deadline) })) };
  } catch (e) {
    return { error: e.message };
  }
}

// ============================================================
// Customer health alerts
// ============================================================

export async function gatherHealthAlerts({ score_below = 50 } = {}) {
  if (USE_MCP) {
    return mcpCall("bee.listCustomers", { limit: 200 })
      .then((customers) => ({
        customers: customers
          .filter((c) => c.health_score !== null && c.health_score < score_below)
          .map((c) => ({
            name_he: c.name_he,
            score: c.health_score,
            reason: c.last_health_reason,
          })),
      }));
  }
  return { error: "health scoring requires Phase 2 bee-mcp-server" };
}

// ============================================================
// Cash position (Invoice Maven)
// ============================================================

export async function gatherCash() {
  if (USE_MCP) {
    // Phase 3+ — when invoice-maven-mcp exists
    return mcpCall("invoice-maven.cashPosition", {});
  }
  return { error: "Invoice Maven MCP not yet built (Phase 3)" };
}

// ============================================================
// Calendar
// ============================================================

export async function gatherCalendar({ days = 1 } = {}) {
  return runShellHelper("alfred-calendar.js", ["--upcoming", String(days)]);
}

// ============================================================
// Friday-brief gatherers
// ============================================================

export async function gatherCompletedJobs({ days = 5 } = {}) {
  if (USE_MCP) {
    const after = new Date(Date.now() - days * 86400000).toISOString();
    return mcpCall("bee.listJobs", { status: "done", scheduled_after: after, limit: 50 })
      .then((jobs) => ({
        jobs: jobs.map((j) => ({
          title: j.title_he,
          day: new Date(j.completed_at).toLocaleDateString("he-IL", { weekday: "short" }),
        })),
      }));
  }
  return runShellHelper("alfred-monday.js", ["--completed-this-week"]);
}

export async function gatherSlippedItems() {
  if (USE_MCP) {
    return mcpCall("bee.listJobs", { status: "in-progress,blocked", scheduled_before: new Date().toISOString() })
      .then((jobs) => ({
        items: jobs.map((j) => ({
          name: j.title_he,
          days_overdue: Math.floor(
            (Date.now() - new Date(j.scheduled_for).getTime()) / 86400000
          ),
          reason: j.blocked_reason,
        })),
      }));
  }
  return { error: "slip detection needs bee-mcp-server" };
}

export async function gatherWins({ days = 5 } = {}) {
  if (USE_MCP) {
    const after = new Date(Date.now() - days * 86400000).toISOString();
    const [closed, installed] = await Promise.all([
      mcpCall("bee.listProjects", { status: "won", created_after: after }),
      mcpCall("bee.listProjects", { status: "completed", updated_after: after }),
    ]);
    return {
      deals_won_count: closed.length,
      deals_won_value_nis: closed.reduce((s, p) => s + (p.contract_value_nis || 0), 0),
      installations_done_count: installed.length,
    };
  }
  return runShellHelper("alfred-monday.js", ["--wins-this-week"]);
}

export async function gatherCashCollected({ days = 5 } = {}) {
  if (USE_MCP) return mcpCall("invoice-maven.collectedSince", { days });
  return { error: "Invoice Maven MCP not yet built" };
}

export async function gatherNextWeekPriorities({ limit = 3 } = {}) {
  if (USE_MCP) {
    return mcpCall("bee.listJobs", { priority: "high,urgent", status: "pending,scheduled", limit })
      .then((jobs) => ({ items: jobs.map((j) => ({ title: j.title_he })) }));
  }
  return { error: "needs bee-mcp-server" };
}

export async function gatherWeekendTickets() {
  if (USE_MCP) {
    return mcpCall("bee.listAlerts", { severity: "critical,high", status: "open", limit: 5 })
      .then((alerts) => ({
        tickets: alerts.map((a) => ({ summary: `${a.site_name_he}: ${a.message}` })),
      }));
  }
  return { error: "needs bee-mcp-server" };
}

// ============================================================
// Helpers
// ============================================================

async function mcpCall(toolName, args) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`MCP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`MCP: ${data.error.message}`);
  const content = data.result?.content?.[0]?.text;
  return content ? JSON.parse(content) : null;
}

async function runShellHelper(script, args) {
  // Shells out to E:\Desktop\OpenClawAgent\<script>
  // Phase 1 fallback path when MCP not available
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const base = process.env.OPENCLAW_SCRIPTS || "E:\\Desktop\\OpenClawAgent";
  const { stdout } = await exec("node", [`${base}\\${script}`, ...args], { timeout: 15000 });
  try {
    return JSON.parse(stdout);
  } catch {
    return { raw_output: stdout.slice(0, 500) };
  }
}

function daysSince(ts) {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}
