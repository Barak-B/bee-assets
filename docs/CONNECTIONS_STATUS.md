# Connections status — 2026-07-11

## מה חובר מהענן (עכשיו)

| חיבור | מצב |
|---|---|
| Canon publish (`AGENT_CANON` → `BEE_CANON.md`) | ✅ |
| PATHS + wire runbook ב-repo | ✅ |
| Trust Gate על loops | ✅ |
| GitHub | ✅ |
| cursor-cloud MCP | ✅ |
| Cloudflare-docs MCP | ✅ |
| `collect.canon-drift` runnable | ✅ |
| Max brain | ✅ migrated |

## מה מחכה לך (לחיצה / מכונה מקומית)

| חיבור | פעולה |
|---|---|
| **Alfred + Hermes Brain Bus** | `pwsh -File platform\connections\connect-local.ps1` ואז 2 עריכות חוקתיות שהסקריפט מדפיס |
| **Monday MCP** | Cursor Desktop → Settings → MCP → Authenticate **Monday** (P0 ל-`collect.monday`) |
| Notion MCP | אופציונלי |
| Obsidian / Graphify sync | אחרי pull: `sync-vault-and-graphify.ps1 -PushCanonToAgents` (על PR #2 / אחרי מיזוג research) |

## פקודות

```bash
# ענן / בכל clone:
node platform/connections/connect-all.mjs

# Windows של ברק:
pwsh -File platform\connections\connect-local.ps1
```

דוחות חיים: `platform/status/connections.json` · `platform/status/canon-drift.json`
