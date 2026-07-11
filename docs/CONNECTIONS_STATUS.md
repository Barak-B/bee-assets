# Connections status — 2026-07-11 (updated after Barak local wire)

## מה חובר

| חיבור | מצב |
|---|---|
| Canon publish (`BEE_CANON.md`) | ✅ |
| `connect-local` copy → Alfred + Hermes dirs | ✅ |
| Alfred `AGENTS.md` step 5 (repaired, headers=1) | ✅ |
| Hermes `external_dirs` + char_limit 4096 + port 3100 | ✅ |
| Max brain | ✅ migrated |
| Trust Gate · GitHub · cursor-cloud | ✅ |

## אימות חי (ברק — עכשיו)

1. **הפעל מחדש Hermes gateway** (כדי ש-config ייטען)
2. שאל את **Alfred** (openclaw main / WhatsApp self-chat):  
   `what bank does BEE use and VAT cadence?`  
   צפוי: Mercantile code 17 / monthly
3. שאל את **Hermes** אותו דבר
4. (אופציונלי P0) Cursor Desktop → MCP → Authenticate **Monday**

## עדיין פתוח

| חיבור | פעולה |
|---|---|
| Monday MCP | Desktop OAuth |
| Obsidian/graphify sync script | על branch עם `research/` (PR #2 / bridge) |
| Live Q&A confirm | שלח תשובות Alfred+Hermes לכאן |

## פקודות

```bash
node platform/connections/connect-all.mjs
```
