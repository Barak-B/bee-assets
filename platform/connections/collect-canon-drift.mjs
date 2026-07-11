#!/usr/bin/env node
/**
 * collect.canon-drift — compare roster migration expectations to published canon facts.
 * Cloud-safe: does not call Alfred/Hermes live (those need local verify).
 *
 * Writes platform/status/canon-drift.json and exits 1 if critical drift.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dirname, "..");
const statusDir = join(platformRoot, "status");
mkdirSync(statusDir, { recursive: true });

const roster = JSON.parse(readFileSync(join(platformRoot, "schema/brain-roster.json"), "utf8"));
const canonFile = existsSync(join(platformRoot, "canon/BEE_CANON.md"))
  ? join(platformRoot, "canon/BEE_CANON.md")
  : join(platformRoot, "canon/AGENT_CANON.md");
const canon = readFileSync(canonFile, "utf8");

const requiredFacts = [
  { id: "bank_mercantile_17", re: /Mercantile[\s\S]{0,80}code 17/i },
  { id: "vat_monthly", re: /VAT[^\n]*monthly|VAT_PERIOD_MONTHS=1/i },
  { id: "law1_four_destinations", re: /Four authorized outbound|4 authorized WhatsApp outbound/i },
  { id: "law2_human_picks", re: /Human picks/i },
  { id: "invoice_maven", re: /Invoice Maven/i },
  { id: "no_invent_facts", re: /Don.?t invent operator facts|never invent operator facts/i },
];

const factResults = requiredFacts.map((f) => ({
  id: f.id,
  present: f.re.test(canon),
}));

const missingFacts = factResults.filter((f) => !f.present);

const brainIssues = [];
for (const b of roster.brains) {
  if (b.migration.status === "migrated" && b.migration.blocker) {
    brainIssues.push({ id: b.id, severity: "warn", msg: "migrated but still has blocker text" });
  }
  if (["alfred", "hermes"].includes(b.id) && b.migration.status !== "migrated") {
    brainIssues.push({
      id: b.id,
      severity: "high",
      msg: `live brain not migrated (${b.migration.status}): ${b.migration.blocker || ""}`,
    });
  }
  if (b.id === "max" && b.migration.status !== "migrated") {
    brainIssues.push({ id: b.id, severity: "high", msg: "cloud cortex should be migrated" });
  }
}

const critical = missingFacts.length > 0 || brainIssues.some((i) => i.severity === "high");

const report = {
  generatedAt: new Date().toISOString(),
  loop: "collect.canon-drift",
  canonFile,
  factResults,
  missingFacts: missingFacts.map((f) => f.id),
  brainIssues,
  critical,
  recommendation: critical
    ? "Run platform/connections/connect-local.ps1 on Barak PC; re-run connect-cloud.mjs after"
    : "No critical canon drift in repo artifacts",
};

writeFileSync(join(statusDir, "canon-drift.json"), JSON.stringify(report, null, 2), "utf8");

console.log("collect.canon-drift\n");
for (const f of factResults) console.log(`${f.present ? "✓" : "✗"} fact:${f.id}`);
for (const i of brainIssues) console.log(`${i.severity === "high" ? "!" : "~"} brain:${i.id} — ${i.msg}`);
console.log(critical ? "\nCRITICAL drift" : "\nOK — no critical drift in published canon");
console.log("Wrote platform/status/canon-drift.json");
process.exit(critical ? 1 : 0);
