#!/usr/bin/env node
/**
 * Run all cloud-side connection steps in order.
 * Usage: node platform/connections/connect-all.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script) {
  console.log(`\n======== ${script} ========\n`);
  const r = spawnSync(process.execPath, [join(__dirname, script)], {
    stdio: "inherit",
  });
  return r.status ?? 1;
}

let code = 0;
code = run("connect-cloud.mjs") || code;
const drift = run("collect-canon-drift.mjs");
// drift exit 1 is expected until Alfred/Hermes migrated — do not fail the whole suite hard
if (drift !== 0) {
  console.log("\n(note) canon-drift reported issues — expected until connect-local.ps1 completes\n");
}

// Also run supervisor dry-run for connection health surface
console.log("\n======== supervisor-stub ========\n");
spawnSync(process.execPath, [join(__dirname, "../loops/supervisor-stub.mjs")], {
  stdio: "inherit",
});

process.exit(code);
