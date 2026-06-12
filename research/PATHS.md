# PATHS.md — Canonical Machine Topology (single source of truth)

**Why this file exists:** sessions kept guessing paths (`E:\Desktop\OpenClawAgent\workspace\scripts` — does not exist; hit live by Barak 2026-06-10 with `PathNotFound`). Ground truth below is extracted from the live-system snapshot (`local-state/openclaw/cron-jobs.json` — the running crons themselves — and `local-state/README.md` §D).

**Rule for every future session/script:** consult this file before writing any absolute path. If reality diverges, fix THIS file first, then the scripts.

## Barak's Windows PC

| What | Path | Evidence |
|---|---|---|
| **Alfred scripts** (30+ `alfred-*.js`, `dashboard-server.js`, `bridge.js`) | `E:\Desktop\OpenClawAgent\` — **repo ROOT, there is NO `scripts\` or `workspace\` subdir here** | live crons: `cd E:/Desktop/OpenClawAgent && node alfred-tomorrow-digest.js` |
| **OpenClaw workspace** (AGENTS.md constitution 52KB, SOUL.md, memory/, sites/, skills/, task-examples.md, contacts.md, roster.yaml) | `C:\Users\Barak\.openclaw\workspace\` | local-state README §D + AGENTS.md self-references |
| OpenClaw config | `C:\Users\Barak\.openclaw\openclaw.json` | gitnexus/graphify config snippets |
| OpenClaw credentials | `C:\Users\Barak\.openclaw\credentials\` | gmail-oauth-recovery.md |
| Alfred secrets | `E:\Desktop\OpenClawAgent\secrets\bee-integrations.env` (extracted from BEE app SQLite) | v17 14.A / v13 10.F.1 |
| **Hermes project repo** | `E:\bee-hermes\` | confirmed live (Barak cd'd into it, AGENTS.md written there) |
| Hermes config/state | `C:\Users\Barak\AppData\Local\hermes\` (config.yaml, state.db ~167MB, memories/) | local-state README |
| Hermes skills (graphify etc.) | `C:\Users\Barak\.hermes\skills\` | graphify 0.8.36 source (`skill_dst`) |
| Claude Code skills | `C:\Users\Barak\.claude\skills\` | graphify install output (screenshot 2026-06-10) |
| Other BEE projects | `E:\bee-hive`, `E:\bee-build`, `E:\bee-assets`, `E:\bee-ai-watcher` | local-state README §D.3 |
| **Obsidian vault (Q67 — solved 2026-06-13)** | `E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\` (the `C:\Users\Barak\Desktop\...` spelling resolves to the same folder — Desktop is redirected). PARA structure; BEE notes in `3-Projects\BEE\`; `protocol_hive.md` synced there | verified live: both paths Test-Path=True, 3-Projects\BEE exists |
| BEE Operations app (Drive sync) | `K:\האחסון שלי\BEE_Operations` | live cron activity-report job |
| Desktop alias | `C:\Users\Barak\Desktop\...` may appear in docs — Desktop is redirected; canonical is `E:\Desktop\...` | AGENTS.md uses both spellings |

### Known-WRONG paths (do not use)

| Wrong | Why it's wrong | Use instead |
|---|---|---|
| `E:\Desktop\OpenClawAgent\workspace\` | does not exist (PathNotFound, live test) | workspace → `C:\Users\Barak\.openclaw\workspace\`; scripts → `E:\Desktop\OpenClawAgent\` |
| `E:\Desktop\OpenClawAgent\scripts\` | scripts are at repo root, no subdir | `E:\Desktop\OpenClawAgent\` |
| `C:\Users\Barak\.openclaw\workspace\scripts\` | the workspace holds data/markdown, not the JS scripts | `E:\Desktop\OpenClawAgent\` |

## bee-prod-1 (Hetzner CX52)

| What | Path |
|---|---|
| BEE Operations app | `/opt/bee-ops` (assumed in kit scripts — verify on first SSH; override via `BEE_APP_DIR`) |
| GitNexus internal fork (if deployed) | `/opt/gitnexus-source` |
| Graphify graph (Stage 2 output) | `/opt/bee-ops/graphify-out/graph.json` |
| Graphify MCP API key | `/etc/graphify-mcp.key` |
| Backups | `/var/backups/` (planned, v8 5.C) |

## Env-var overrides honored by our scripts

| Var | Meaning | Default |
|---|---|---|
| `OPENCLAW_SCRIPTS` | Alfred scripts root | `E:\Desktop\OpenClawAgent` |
| `TENDER_DB` | tender-tracker SQLite | `<OPENCLAW_SCRIPTS>\tender-tracker-mvp\tenders.db` |
| `BEE_APP_DIR` | BEE app source on server | `/opt/bee-ops` |
| `BEE_DB_DSN` | BEE PostgreSQL DSN | (unset — enables schema pass) |
| `GRAPH_PATH` | graph.json for MCP server | `/opt/bee-ops/graphify-out/graph.json` |
