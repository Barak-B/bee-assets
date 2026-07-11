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
| **Alfred + Hermes Brain Bus** | ראה בלוק PowerShell למטה |
| **Monday MCP** | Cursor Desktop → Settings → MCP → Authenticate **Monday** (P0 ל-`collect.monday`) |
| Notion MCP | אופציונלי |
| Obsidian / Graphify sync | אחרי שאתה על branch עם `research/`: `sync-vault-and-graphify.ps1 -PushCanonToAgents` |

### PowerShell — מעבר ל-branch + חיבור (העתק-הדבק)

אם `git checkout` נכשל בגלל שינויים ב-`research/graphify-out/*` (פלט graphify מקומי) — **stash** ואז checkout:

```powershell
cd E:\bee-assets
git fetch origin

# שמור פלט graphify מקומי בצד (לא נמחק)
git stash push -m "local-graphify-out" -- research/graphify-out/

git checkout cursor/hive-cortex-platform-634e
git pull origin cursor/hive-cortex-platform-634e

# עכשיו הקובץ קיים:
pwsh -File platform\connections\connect-local.ps1
```

אם תרצה להחזיר את ה-graphify אחרי (אופציונלי; עלול להיות conflict):
```powershell
git stash list
# git stash pop   # רק אם צריך את הגרף הישן על branch הזה
```

## פקודות

```bash
# ענן / בכל clone שכבר על hive-cortex:
node platform/connections/connect-all.mjs
```

דוחות חיים: `platform/status/connections.json` · `platform/status/canon-drift.json`
