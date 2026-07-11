#!/usr/bin/env node
/**
 * Prints how this cloud session can (or cannot) reach Barak's Windows PC.
 * Run: node platform/connections/remote-access-check.mjs
 */
import { spawnSync } from "node:child_process";

const probes = [
  { name: "ssh-client", cmd: ["which", "ssh"] },
  { name: "tailscale-cli", cmd: ["which", "tailscale"] },
  { name: "ping-tailscale-example", cmd: ["ping", "-c", "1", "-W", "2", "100.90.97.36"] },
];

console.log("BEE remote-access-check (cloud side)\n");
for (const p of probes) {
  const r = spawnSync(p.cmd[0], p.cmd.slice(1), { encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`${ok ? "✓" : "✗"} ${p.name}${ok && r.stdout ? " — " + r.stdout.trim().split("\n")[0] : ""}`);
  if (!ok && r.stderr) console.log(`    ${r.stderr.trim().split("\n")[0]}`);
}

console.log(`
Verdict:
  This Cursor Cloud pod cannot reach Barak's Tailscale/Windows today.
  To let agents act on the PC:
    A) Cursor Desktop local Agent on E:\\bee-assets  (immediate)
    B) Cursor Private Worker on the PC               (best long-term)
    C) Tailscale path + OpenSSH                      (needs network bridge)
  See docs/REMOTE_ACCESS.md
`);
