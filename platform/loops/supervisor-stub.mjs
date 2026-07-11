#!/usr/bin/env node
/**
 * Hive Cortex supervisor stub — dry-run only.
 * Lists declared loops, applies Trust Gate to outbound defs, prints what WOULD run.
 * No network, no WhatsApp, no DB writes.
 *
 * Usage: node platform/loops/supervisor-stub.mjs [--json]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const asJson = process.argv.includes("--json");

const loopsDoc = JSON.parse(readFileSync(join(root, "schema/loops.json"), "utf8"));
const roster = JSON.parse(readFileSync(join(root, "schema/brain-roster.json"), "utf8"));

const law1 = new Set(loopsDoc.trustGate.law1Destinations);
const forbidden = new Set(loopsDoc.trustGate.forbiddenWithoutPick);

function trustCheck(loop) {
  const ob = loop.outbound;
  if (!ob) return { ok: true, reason: "no outbound" };
  if (forbidden.has(ob.destinationClass) && ob.requiresHumanPick !== true) {
    return { ok: false, reason: `Law#2: ${ob.destinationClass} requires human pick` };
  }
  if (ob.channel === "whatsapp" && !law1.has(ob.destinationClass)) {
    return { ok: false, reason: `Law#1: ${ob.destinationClass} not an authorized WA destination` };
  }
  return { ok: true, reason: "pass" };
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: "dry-run",
  brains: roster.brains.map((b) => ({
    id: b.id,
    migration: b.migration.status,
    blocker: b.migration.blocker,
  })),
  loops: loopsDoc.loops.map((loop) => {
    const trust = trustCheck(loop);
    return {
      name: loop.name,
      kind: loop.kind,
      enabled: !!loop.enabled,
      schedule: loop.schedule,
      blocker: loop.blocker ?? null,
      wouldRun: !!loop.enabled && !loop.blocker && trust.ok,
      trust,
    };
  }),
};

const runnable = report.loops.filter((l) => l.wouldRun);
const blocked = report.loops.filter((l) => !l.wouldRun);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log("BEE Hive Cortex — supervisor dry-run\n");
console.log("Brains:");
for (const b of report.brains) {
  console.log(`  [${b.migration}] ${b.id}${b.blocker ? ` — ${b.blocker}` : ""}`);
}
console.log("\nLoops that WOULD run now:");
for (const l of runnable) {
  console.log(`  ✓ ${l.name} (${l.kind}) @ ${l.schedule}`);
}
console.log("\nLoops blocked / disabled:");
for (const l of blocked) {
  const why = l.blocker || (!l.enabled ? "disabled" : l.trust.reason);
  console.log(`  · ${l.name} — ${why}`);
}
console.log(`\nSummary: ${runnable.length} runnable / ${report.loops.length} declared / brains migrated-ish: ${report.brains.filter((b) => b.migration === "migrated").length}`);
