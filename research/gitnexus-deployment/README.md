# GitNexus Deployment Kit — Ready-to-Execute

**Pre-req:** [`gitnexus-audit.md`](../gitnexus-audit.md) read + approved
**Target:** bee-prod-1 (Hetzner CX52) + Alfred (E:\) + Hermes
**Time:** ~30-40 min total
**Risk:** 🟡 medium (new MCP server in agents) — but reversible

## What this kit does

Implements the **§5 + §6** deployment plan from the audit:
1. Clones GitNexus as an **internal fork** to `/opt/gitnexus-source` on bee-prod-1
2. Sanitizes: removes `@scarf/scarf`, pins versions, `npm audit` clean
3. Builds locally (`npm install --ignore-scripts && npm run build`)
4. Verifies "no network" claim via `strace -e network`
5. Indexes BEE Operations app codebase
6. Registers MCP in Alfred + Hermes with **`allowed_tools` whitelist** (10 read-only tools; `rename`, `cypher`, `group_sync` excluded)
7. Smoke tests via curl

## Execution order

```
Step 1 (5 min) [bee-prod-1 SSH]:  scripts/prepare-fork.sh
Step 2 (10 min)[bee-prod-1 SSH]:  scripts/deploy.sh
Step 3 (5 min) [bee-prod-1 SSH]:  scripts/verify-network-egress.sh   (one-time sanity)
Step 4 (5 min) [bee-prod-1 SSH]:  scripts/index-bee-app.sh
Step 5 (3 min) [Barak's PC]:      apply configs/alfred-openclaw.snippet.json to openclaw.json
Step 6 (3 min) [Barak's PC]:      apply configs/hermes-mcp.snippet.yaml to hermes config
Step 7 (5 min) [either]:          scripts/smoke-test.sh
```

If anything fails → `scripts/rollback.sh` on bee-prod-1 + revert config files.

## Files

```
gitnexus-deployment/
├── README.md                    — this file
├── scripts/
│   ├── prepare-fork.sh          — clone + sanitize + audit (idempotent)
│   ├── deploy.sh                — npm install + build + link
│   ├── verify-network-egress.sh — strace -e network sanity check
│   ├── index-bee-app.sh         — first `gitnexus analyze` of BEE app
│   ├── smoke-test.sh            — post-deploy verification (curl + tool calls)
│   └── rollback.sh              — emergency teardown
└── configs/
    ├── alfred-openclaw.snippet.json — MCP registration for Alfred
    ├── hermes-mcp.snippet.yaml      — MCP registration for Hermes
    └── allowed-tools.txt            — the 10 whitelisted tool names
```

## Pre-flight requirements

Before running Step 1, verify on bee-prod-1:

```bash
# Node 18+ installed?
node --version  # expect v18.x or v20.x or v22.x

# npm available?
npm --version   # expect 9.x+

# git available?
git --version

# Disk space (gitnexus + node_modules ~ 500MB; index size depends on BEE app)
df -h /opt    # expect >2GB free

# Permissions: can write to /opt?
sudo mkdir -p /opt/gitnexus-source && sudo chown -R $USER:$USER /opt/gitnexus-source

# Tailscale active (for Alfred → bee-prod-1 SSH-stdio MCP)?
tailscale status | grep -i online
```

If any of these fails → fix before proceeding.

## What this kit does NOT do (deferred)

- **bee-mcp-proxy with audit logging** (§4.3) — recommended hardening, deferred to Phase 5 polish. Initial deploy uses direct MCP without audit log.
- **systemd unit** for `gitnexus serve` HTTP API — we use stdio MCP only. HTTP server not enabled.
- **Web UI** (port 4173) — not deployed. Skip unless Barak explicitly wants it later.
- **`gitnexus-claude-plugin` auto hooks** (PreToolUse/PostToolUse) — per audit §5.3 verdict, skip initial. Re-evaluate after 30 days of MCP-only usage.
- **Cursor integration** — we use Claude Code, not Cursor. Skip.

These can be added later without re-doing the base deploy.

## Rollback procedure

If anything goes wrong:

```bash
# On bee-prod-1
bash scripts/rollback.sh
# Removes /opt/gitnexus-source, unlinks npm global, deletes ~/.gitnexus, no other side effects

# On Barak's PC
# 1. Revert openclaw.json: remove the "gitnexus" entry under "mcpServers"
#    A .bak file is created by Step 5 instructions
# 2. Revert hermes config: same — backup created by Step 6
# 3. Restart both agents to clear cached MCP registrations
```

GitNexus has zero impact on BEE data — it only READS the BEE app code repo + writes to its own `.gitnexus/` directory. Rollback is fully reversible with no data loss.

## After deploy

Expected verification:
- [ ] `node /opt/gitnexus-source/gitnexus/dist/cli.js list` shows 1 repo (BEE app)
- [ ] Alfred can call `bee.listRoutes` via gitnexus MCP → returns BEE app routes
- [ ] Hermes can call `gitnexus.query "alfred-handle"` → returns relevant symbols
- [ ] strace check: zero external network during MCP session
- [ ] `.gitnexus/` permissions: 700 (chmod confirmed)
- [ ] `rename` tool calls REJECTED by allowed_tools filter (test: try, expect error)
- [ ] No `@scarf/scarf` in deployed node_modules

## Next steps after successful deploy

Now Phase 2 Action #14 (BEE app API doc) becomes a 1-hour task instead of 8h:
```bash
# On bee-prod-1, with gitnexus MCP running
echo "Generate full API documentation for the BEE app from its code graph" | alfred-via-mcp
# Alfred uses gitnexus route_map + tool_map + context to produce bee-app-api-doc.md
# Saves ~7h of manual route enumeration.
```

Same for Phase 3 engineering-agent — every design call now goes:
```
engineering-agent → context("Site model") → understands BEE schema → drafts design
```

This is the **net 30-50h savings** projected in audit §5.4.
