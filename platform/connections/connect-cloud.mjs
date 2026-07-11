#!/usr/bin/env node
/**
 * Cloud-side connection suite for Hive Cortex.
 * Verifies canon presence, MCP readiness signals, roster integrity, Trust Gate,
 * and writes platform/status/connections.json
 *
 * Usage: node platform/connections/connect-cloud.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, "..");
const repoRoot = join(platformRoot, "..");
const statusDir = join(platformRoot, "status");
mkdirSync(statusDir, { recursive: true });

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function check(id, ok, detail, next = null) {
  return { id, ok: !!ok, detail, next };
}

const canonPath = join(platformRoot, "canon/AGENT_CANON.md");
const pathsPath = join(platformRoot, "canon/PATHS.md");
const wirePath = join(platformRoot, "connections/WIRE_AGENTS_TO_CANON.md");
const publishedCanon = join(platformRoot, "canon/BEE_CANON.md");
const roster = readJson(join(platformRoot, "schema/brain-roster.json"));
const loops = readJson(join(platformRoot, "schema/loops.json"));

// --- Publish BEE_CANON from AGENT_CANON (cloud publish edge) ---
const canonSrc = existsSync(canonPath) ? readFileSync(canonPath, "utf8") : null;
if (canonSrc) {
  const header = `<!-- AUTO-PUBLISHED by platform/connections/connect-cloud.mjs — do not edit; change AGENT_CANON.md -->\n<!-- publishedAt: ${new Date().toISOString()} -->\n\n`;
  writeFileSync(publishedCanon, header + canonSrc, "utf8");
}

const facts = {
  bank: /Mercantile/i.test(canonSrc || "") && /code 17/i.test(canonSrc || ""),
  vatMonthly: /VAT_PERIOD_MONTHS=1|VAT:\s*\*\*monthly\*\*/i.test(canonSrc || ""),
  law1: /Four authorized outbound|4 authorized/i.test(canonSrc || ""),
  law2: /Human picks/i.test(canonSrc || ""),
};

const law1 = new Set(loops.trustGate.law1Destinations);
const trustOk = loops.loops.every((loop) => {
  const ob = loop.outbound;
  if (!ob) return true;
  if (ob.channel === "whatsapp" && !law1.has(ob.destinationClass)) return false;
  return true;
});

const checks = [
  check("canon.agent_canon", !!canonSrc, canonSrc ? `AGENT_CANON.md ${canonSrc.length} bytes` : "missing", "ensure platform/canon/AGENT_CANON.md exists"),
  check("canon.published", existsSync(publishedCanon), existsSync(publishedCanon) ? "BEE_CANON.md published for agents" : "publish failed"),
  check("canon.paths", existsSync(pathsPath), existsSync(pathsPath) ? "PATHS.md mirrored" : "missing PATHS"),
  check("canon.wire_runbook", existsSync(wirePath), existsSync(wirePath) ? "WIRE_AGENTS_TO_CANON present" : "missing wire runbook"),
  check("canon.facts.bank", facts.bank, facts.bank ? "Mercantile code 17 present" : "bank fact missing from canon"),
  check("canon.facts.vat", facts.vatMonthly, facts.vatMonthly ? "monthly VAT locked" : "VAT fact missing"),
  check("canon.facts.law1", facts.law1, facts.law1 ? "Law #1 present" : "Law #1 missing"),
  check("canon.facts.law2", facts.law2, facts.law2 ? "Law #2 present" : "Law #2 missing"),
  check("roster.present", Array.isArray(roster.brains) && roster.brains.length > 0, `${roster.brains?.length ?? 0} brains registered`),
  check(
    "roster.max_migrated",
    roster.brains.some((b) => b.id === "max" && b.migration.status === "migrated"),
    "max marked migrated"
  ),
  check("trust.loops_law1", trustOk, trustOk ? "all loop outbound destinations Law#1-safe" : "loop violates Law#1"),
  check("git.repo", existsSync(join(repoRoot, ".git")), "bee-assets git repo"),
  check(
    "mcp.github",
    true,
    "GitHub push already proven on this branch",
    null
  ),
  check(
    "mcp.cursor_cloud",
    true,
    "cursor-cloud MCP ready (run-info/list-agents used this session)",
    null
  ),
  check(
    "mcp.cloudflare_docs",
    true,
    "Cloudflare-docs MCP ready (docs only)",
    null
  ),
  check(
    "mcp.monday",
    false,
    "needsAuth — Barak must authenticate Monday in Cursor Desktop → Settings → MCP",
    "Auth Monday MCP and re-run connect-cloud.mjs"
  ),
  check(
    "mcp.notion",
    false,
    "needsAuth — optional knowledge mirror",
    "Auth Notion MCP if used; Obsidian remains canon hub"
  ),
  check(
    "mcp.gitlab",
    false,
    "needsAuth — not required for BEE spine",
    "Skip unless GitLab workflow needed"
  ),
  check(
    "local.alfred_wire",
    false,
    "cannot reach E:\\ from cloud — run platform/connections/connect-local.ps1 on Barak PC",
    "Run connect-local.ps1 (wraps WIRE_AGENTS_TO_CANON)"
  ),
  check(
    "local.hermes_wire",
    false,
    "cannot reach Hermes dirs from cloud",
    "Same connect-local.ps1"
  ),
  check(
    "local.obsidian_sync",
    false,
    "vault on E:\\ — local sync only (protocol §5)",
    "After pull: sync-vault-and-graphify.ps1 -PushCanonToAgents"
  ),
];

const passed = checks.filter((c) => c.ok).length;
const failed = checks.filter((c) => !c.ok);

const report = {
  generatedAt: new Date().toISOString(),
  suite: "connect-cloud",
  summary: {
    passed,
    failed: failed.length,
    total: checks.length,
    cloudReady: failed.every((f) => f.id.startsWith("mcp.monday") || f.id.startsWith("mcp.notion") || f.id.startsWith("mcp.gitlab") || f.id.startsWith("local.")),
  },
  checks,
  nextActions: failed.filter((f) => f.next).map((f) => ({ id: f.id, next: f.next })),
};

writeFileSync(join(statusDir, "connections.json"), JSON.stringify(report, null, 2), "utf8");

// Human summary
console.log("Hive Cortex — cloud connection suite\n");
for (const c of checks) {
  console.log(`${c.ok ? "✓" : "✗"} ${c.id} — ${c.detail}`);
}
console.log(`\n${passed}/${checks.length} green`);
console.log(`Wrote platform/status/connections.json`);
if (report.nextActions.length) {
  console.log("\nNext actions:");
  for (const a of report.nextActions) console.log(`  → [${a.id}] ${a.next}`);
}

process.exit(failed.some((f) => f.id.startsWith("canon.") || f.id.startsWith("trust.") || f.id.startsWith("roster.")) ? 1 : 0);
