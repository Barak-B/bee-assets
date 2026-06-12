# Session Handoff — 2026-06-12 (Cloud → Local)

**מקור:** סשן ענן (Claude Code web) על branch `claude/capability-extensions-collection-JjV2s`, PR #2.
**יעד:** סשן Claude Code מקומי על המכונה של ברק.
**קרא קודם:** `research/protocol_hive.md` (החוקה) + `research/PATHS.md` (נתיבים קנוניים). שניהם מחייבים.

---

## 1. מה הושג בסשן הזה (TL;DR)

1. **Graphify v0.8.38 הותקן ופועל על המכונה של ברק** — גרף ידע חי על `E:\Desktop\OpenClawAgent`: **1,874 nodes / 3,280 edges / 104 communities**, code-only, $0. אומת ב-3 שאילתות (query/path/explain).
2. **`research/graphify-deployment/`** — kit מלא: one-shot installer (`install-windows.ps1`), `index-bee-app.sh`, `serve-mcp.sh` (systemd+Tailscale+API key), `smoke-test.sh`, snippets ל-Alfred+Hermes MCP.
3. **`research/PATHS.md`** — טופולוגיה קנונית של המכונה אחרי שתפסנו סשנים ממציאים נתיבים. 9 קבצים תוקנו.
4. **`research/protocol_hive.md`** — חוקת הכוורת v2 (מנוסחת עם Gemini): Tiers 0-4, cursor tuple, distributed locks, fuzzy dedup, async audio, validation circuit, err_manifest, צורת LLD מחייבת.
5. **`research/hive-full-inventory.html`** — דשבורד RTL מלא: כלים/ארכיטקטורה/סוכנים/לקחים.
6. **PR #2 עודכן** — title+body משקפים את כל ה-bundle (55+ commits, ~39K שורות), הוצא מ-draft.

## 2. מצב הגרף אצל ברק — נכון לסיום הסשן

| פריט | מצב |
|---|---|
| גרף | `E:\Desktop\OpenClawAgent\graphify-out\graph.json` — 1,874/3,280/104, code-only |
| `.graphifyignore` | קיים: `backups/`, `**/document_cache/`, secrets, logs + חסימת docs/images (code-only mode) |
| Skill registrations | ✅ Claude Code (PreToolUse hook) · ✅ Alfred (`~/.openclaw/workspace/AGENTS.md`) · ✅ Hermes (`E:\bee-hermes\AGENTS.md` + `~/.hermes/skills/graphify/`) |
| git hook | ❓ לא אומת שהותקן — בדוק: `cd E:\Desktop\OpenClawAgent; graphify hook status` |
| Community labels | ❌ נכשל — אין `DEEPSEEK_API_KEY` ב-`secrets\bee-integrations.env` (ה-grep החזיר ריק) ואין קרדיט ב-Anthropic API. הקהילות = "Community N" |
| Full extract (docs/PDF/images) | ❌ ברק רוצה (-Full) אבל חסום על אותו key חסר |

## 3. משימות לסשן המקומי — לפי סדר

### A. השלמת graphify -Full (החסם: DeepSeek key)
1. בדוק אם קיים key: `Select-String -Path E:\Desktop\OpenClawAgent\secrets\bee-integrations.env -Pattern "(?i)deepseek"`
2. אם אין — בקש מברק להוציא מ-platform.deepseek.com/api_keys (יש לו $96 balance) ולשמור: `Add-Content ...env "DEEPSEEK_API_KEY=sk-..."`
3. הרץ: `cd E:\bee-assets; git pull; pwsh research\graphify-deployment\scripts\install-windows.ps1 -Full`
   - ה-installer כבר יודע הכל: ימצא את ה-key, יעדיף DeepSeek על claude-cli (שנכשל על PDFs בינאריים — `claude -p exited 1`), יתייג עם `--backend=deepseek` (חובה `=`, ראה באג למטה).
4. עלות צפויה: ~$1-3 ל-~250 קבצים (49 docs + 31 PDFs + 155 images).

### B. אימותים מהירים
- `graphify hook status` ב-`E:\Desktop\OpenClawAgent` — אם לא מותקן: `graphify hook install`
- `graphify query "what writes to the work ledger?"` — אמור להחזיר את שרשרת inbound-watcher
- בדוק שה-PreToolUse hook של Claude Code עובד: שאלת קוד על Alfred אמורה לנתב לגרף לפני grep

### C. גרף שני על bee-assets (אופציונלי, מומלץ)
```powershell
cd E:\bee-assets
graphify extract . --no-viz --backend=deepseek   # ה-90 docs של ה-research ייכנסו
graphify hook install
```

### D. סנכרון Obsidian (החוליה החסרה היחידה בלולאה)
- **שאלה פתוחה Q67: איפה ה-vault של ברק?** ברגע שידוע: עדכן `research/PATHS.md`, העתק את `protocol_hive.md` לשם, ושקול `graphify extract --obsidian`.

### E. הגל הבא (ברק טרם בחר)
שלוש אופציות על השולחן: **bank-receipts ingestion** (המלצת הסשן — ROI מיידי + sandbox לכל מנגנוני ה-protocol) / **n8n spine** / **CRM component**. בנה לפי צורת ה-LLD המחייבת ב-`protocol_hive.md` §7 (4 sections, Mermaid, lock+cursor+dedup+validation).

## 4. לקחים טכניים קריטיים מהסשן (אל תחזור עליהם)

| לקח | פרטים |
|---|---|
| **נתיבים** | סקריפטים של Alfred ב-`E:\Desktop\OpenClawAgent\` (שורש! אין `scripts\` ואין `workspace\` שם). ה-workspace ב-`C:\Users\Barak\.openclaw\workspace\`. הכל ב-PATHS.md — תבדוק שם לפני כל נתיב מוחלט |
| **graphify extras** | backend claude דורש `[anthropic]`, backend deepseek דורש `[openai]` (OpenAI-compatible). ה-installer כבר כולל את שניהם |
| **באג graphify 0.8.38** | `cluster-only`/`label` קוראים `--backend` רק בצורת `--backend=X` (עם שווה). עם רווח — מתעלמים בשקט ונופלים ל-Anthropic. מקור: `__main__.py:3122` |
| **claude-cli backend** | נכשל על PDFs בינאריים (`claude -p exited 1`) וגם החזיר markdown במקום JSON על חלק מהמסמכים. DeepSeek אמין יותר ל-semantic extraction |
| **רעש בגרף** | `backups/` הכפיל כל קובץ; `~\.hermes\document_cache` (טילדה literal בנתיב) שבר resolution. שניהם ב-.graphifyignore עכשיו |
| **PowerShell** | פקודות נפרדות בשורות נפרדות (אין הפרדה אוטומטית); `claw`/`hermes install` הם project-scoped — חייבים `cd` לתיקיית הפרויקט (system32 = PermissionError) |
| **GitNexus** | kit מוכן ב-`research/gitnexus-deployment/` אבל DEFER — graphify מכסה ~80% והוא read-only בלי whitelist gymnastics |

## 5. קבצים שנוצרו/עודכנו בסשן (כולם pushed)

```
research/protocol_hive.md                      ← חוקת הכוורת v2 (קרא ראשון!)
research/PATHS.md                              ← נתיבים קנוניים + טבלת known-WRONG
research/hive-full-inventory.html              ← דשבורד מלאי מלא RTL
research/session-handoff-2026-06-12-graphify.md ← הקובץ הזה
research/graphify-deployment/
  ├── README.md                                ← 4-stage rollout + השוואת GitNexus
  ├── demo/phase1-code-GRAPH_REPORT.md
  ├── scripts/install-windows.ps1              ← one-shot: -Full / -SkipLabel / -DeepSeekKey
  ├── scripts/index-bee-app.sh                 ← Stage 2: BEE app code+PG+docs
  ├── scripts/serve-mcp.sh                     ← Stage 3: systemd, Tailscale-bound + Bearer
  ├── scripts/smoke-test.sh
  └── configs/{alfred-openclaw.snippet.json, hermes-mcp.snippet.yaml, graphify-mcp.service}
research/graphify-out/                         ← גרף ה-research (code pass, 452/757/32)
+ תיקוני נתיבים ב-9 קבצי phase-1
```

## 6. שאלות פתוחות לברק

| # | שאלה | חוסם |
|---|---|---|
| Q67 | נתיב ה-Obsidian vault? | סנכרון אוטומטי של protocol_hive + graphify --obsidian |
| חדש | DeepSeek API key ב-secrets? (כרגע אין) | -Full extract + community labels |
| חדש | הגל הבא: בנק / n8n / CRM? | תחילת ה-LLD הבא |
| Q77 | deepseek-chat 169M tokens anomaly | ~$7/חודש מבוזבז — auto-discoverable מ-logs |

## 7. מצב ה-repo

- Branch: `claude/capability-extensions-collection-JjV2s`, מסונכרן עם origin, working tree נקי
- PR #2: open, לא draft, 55+ commits, ~39K שורות
- אזהרה: קיים branch נוסף `claude/electron-chat-integration-5VtHN` ב-origin (סשן אחר?) — לא נגענו

---
*נכתב 2026-06-12 21:45 UTC ע"י סשן הענן. ה-cortex המקומי ממשיך מכאן — hands-on execution הוא שלך.*
