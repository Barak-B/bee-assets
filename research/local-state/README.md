# Local-State Snapshot — OpenClaw + Hermes

**מיועד ל:** הסשן הענני שעובד על branch `claude/capability-extensions-collection-JjV2s` ובונה תוכנית מיגרציה/פדרציה.
**נאסף ע"י:** הסשן המקומי של Claude Code (claude-opus-4-7) על המכונה של ברק.
**מועד איסוף:** 2026-05-26 01:36 Asia/Jerusalem
**מצב פעיל:** OpenClaw gateway חי (port 18789). Hermes — בשפלה (פירוט למטה).

---

## TL;DR — 8 ממצאים שמשנים את התוכנית

1. **שני סוכנים, פרסונה אחת** — שניהם רצים תחת `personality: alfred` (OpenClaw `agents.defaults.workspace` + Hermes `display.personality: alfred`). מבחינת המשתמש, Alfred = WhatsApp self-chat. אין כאן שני בוטים — יש *פרסונה אחת על שני engines*.
2. **OpenClaw הוא ה-engine הפעיל בפועל היום**, לא Hermes. ה-gateway של OpenClaw (port 18789, PID 22916, 714MB) ענה ל-`/health` עם `{"ok":true,"status":"live"}`. ה-bridge של Hermes על port 3000 — **לא עונה** כרגע. גם `hermes cron list` הזהיר במפורש "Gateway is not running — jobs won't fire automatically."
3. **DeepSeek balance נגמר** — `hermes cron list` מציג `HTTP 402: Insufficient Balance` ב-4 ריצות אחרונות (morning-deadlines, monday-morning-digest, bee-db-snapshot-refresh, morning-weather-scan). זו ככל הנראה הסיבה ש-Hermes נכבה בפועל. ה-MEMORY של Hermes מאשר: "2026-05-22: DeepSeek API balance exhausted (HTTP 402)". **קרן מיגרציה חוסמת — צריך לטעון או להחליף provider לפני שמעבירים עוד עומס ל-Hermes.**
4. **Hermes 1685 commits מאחור.** `hermes --version` אומר: `v0.13.0 (2026.5.7)` + הודעה: "Update available: 1685 commits behind — run 'hermes update'". המיפוי במסמך topology v1.2 שלך התבסס על מצב שעבר.
5. **OpenClaw בגרסה 2026.5.2, ה-npm latest כבר 2026.5.22** — אבל הגרסה הזו שוברת את `@openclaw/whatsapp` (TS-only ship). יש memory עם פירוט בעיה והוראת *לא לעדכן*.
6. **Skills של OpenClaw "בורחות"** — 13 skills של `firecrawl*` הוגדרו עם symlinks ל-`~/.agents/skills/`, אבל OpenClaw מסרב להעמיס אותן: `reason=symlink-escape`. הן זמינות בפועל כ-skills של Claude Code (אצלי), אבל לא של OpenClaw.
7. **MCP פעיל = אפס.** ל-OpenClaw אין MCP servers ב-config (`mcp-servers.txt`: "No MCP servers configured"). ל-Hermes אותו דבר. ה-CLI של OpenClaw גם זרק `HTTP 401: Invalid bearer token` ב-`channels list`. כל הדיבור על MCP בתכנון הוא חזון, לא קיים.
8. **OpenClaw עם 31 skills מוכנים מתוך 76**, Hermes עם **84 skills פעילים** מתוך 84 (כולם בברירת מחדל). זוהי דומיננטיות של Hermes ב-skills generalists, מול דומיננטיות של OpenClaw בקסטומיזציה ייעודית (12 skills מקומיים: solar-agent, calendar-agent, openclaw-security-toolkit, regulatory-agent, n8n-workflow-automation, self-improving, summary, וכו'). Hermes לעומת זאת עם 8 skills מקומיים בלבד (whatsapp-crypt15-extraction, openclaw-to-hermes-migration, barak-activity-reporting, barak-business-integrations, rtl-terminal-output, regulatory-rss-monitoring, alfred-platform-upgrade, research-before-proposing).

---

## תשובות לשאלות D — תשתית משותפת

### D.1 — ClawMem (`@yoloshii/ClawMem`)
**לא מותקן.** בדקתי:
- `C:\Users\Barak\.openclaw\npm\node_modules\@yoloshii\` → לא קיים
- `C:\Users\Barak\AppData\Roaming\npm\node_modules\@yoloshii\` → לא קיים
- חיפוש grep אחר "clawmem" בכל `~/.openclaw/` ו-`hermes/.env` → 0 תוצאות
ל-Hermes יש 8 backends אחרים לזיכרון על הדיסק: `byterover, hindsight, holographic, honcho, mem0, openviking, retaindb, supermemory` — אבל `memory.provider: ''` ב-config, כלומר **אף אחד מהם לא פעיל**. רק `memories/MEMORY.md` (2.2KB) + `memories/USER.md` (1.2KB) נטענים כקבצי טקסט.

### D.2 — evey-bridge-plugin
**לא מותקן.** באף אחת מהמערכות לא נמצא package, npm dir, או reference.

### D.3 — Claude Code מקומי
**כן, רץ בכבדות.** Get-Process מציג **15 תהליכי `claude`** עם RAM כולל ~2.3GB. הסשן הגדול ביותר (PID 29092, 631 MB, 4.3 שעות CPU) פעיל מאז 2026-05-24 07:31 — סשן Antigravity ארוך. הסשן הנוכחי (PID 43584) רץ מ-01:23 הלילה. ב-`reference_ide_antigravity` מצוין ש-Claude Code רץ פנימית ב-Antigravity (לא ב-VS Code). אין שיתוף project root ישיר עם OpenClaw/Hermes — Claude Code עובד על `E:\bee-*` projects, OpenClaw על `~/.openclaw/workspace`, Hermes על `~/AppData/Local/hermes`.

### D.4 — Resource snapshot
ראה `processes.txt`. עיקרי:
- `node 22916` — OpenClaw gateway, **714 MB**, אומלץ פעיל בשבועיים האחרונים
- `claude 29092` — Antigravity Claude, 631 MB (הסשן השני של ברק)
- `python 54692` — Hermes gateway, 21 MB CPU 140s — *ייתכן ש-Hermes רץ אבל לא מצליח לפתוח port 3000*
- סך הכל 26 תהליכים רלוונטיים, ~3.5 GB RAM ל-AI stack
- **Port 18789**: LISTENING (OpenClaw) ✅
- **Port 3000**: לא ב-LISTEN (Hermes WA bridge) ⚠️
- **Port 8765**: לא ב-LISTEN (alfred-dashboard לא חי — היה אמור להיות)

---

## תשובות לשאלות E — Open questions מהתוכנית

### E.1 — Hermes WSL2 או Linux נפרד?
**לא — Native Windows.** Python 3.11.9, venv ב-`C:\Users\Barak\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe`. בנייה ל-Linux אפשרית (יש `singularity_image`, `docker_image: nikolaik/python-nodejs`) אבל בפועל רץ native.

### E.2 — מה זה "alfred" בדיוק?
**פרסונה, לא binary.** מופיע בשני מקומות:
- **OpenClaw**: `~/.openclaw/workspace/AGENTS.md` (52 KB) הוא ה-constitution של Alfred. SOUL.md (1.7 KB) משלים. ה-workspace כולה זה Alfred. הסקריפטים ב-`E:\Desktop\OpenClawAgent\` (30+ קבצי `alfred-*.js`) הם הכלים שלו.
- **Hermes**: `display.personality: alfred` ב-config + `~/AppData/Local/hermes/memories/MEMORY.md` שאומר "Agent persona: Alfred, Barak's personal assistant. Hebrew persona, WhatsApp format ⚡ *text*". כאן Alfred הוא persona prompt בלבד — לא קיים workspace מלא מקביל.

**מסקנה:** OpenClaw הוא הכלי שמגדיר את Alfred *כמהות*, Hermes הוא ה-engine שמריץ אותו *כקול*.

### E.3 — ClawMem / evey-bridge
**שניהם לא מותקנים** — ראה D.1, D.2.

### E.4 — Claude Code עם אותם projects?
חלקית. ראה D.3. Claude Code שותף ל-`E:\bee-hive`, `E:\bee-build`, `E:\bee-assets`, `E:\bee-hermes/docs`, `E:\bee-ai-watcher`. **אינו** שותף ל-`~/.openclaw/workspace` או `~/AppData/Local/hermes/`. אבל Claude יכול לקרוא הכל — קיים rule `Drive E only` שאומר שכל פרויקט עבודה חדש חייב להיווצר תחת `E:\`.

### E.5 — איזו גרסת Hermes בדיוק?
**`Hermes Agent v0.13.0 (2026.5.7)`**, Python 3.11.9, OpenAI SDK 2.33.0.
⚠️ **Hermes הזהיר: "Update available: 1685 commits behind — run 'hermes update'"**. הוא לא רץ נגד master אלא נגד נקודה ישנה למדי.
OpenClaw: `2026.5.2 (8b2a6e5)`. npm latest: `2026.5.22` (אבל **לא לעדכן** — שוברת WhatsApp).

### E.6 — אילו model providers משלמים עכשיו, ו-default על כל אגנט?

**OpenClaw** (מ-`openclaw.json`):
```
providers configured (with API keys):
  - perplexity (sonar-pro)
  - anthropic  (claude-opus-4-7, claude-sonnet-4-6)
  - deepseek   (deepseek-chat, deepseek-reasoner)
  - google     (gemini-2.5-flash, gemini-2.5-pro)
  - groq       (whisper-large-v3 — audio only, via env.GROQ_API_KEY)

agent.defaults.model.primary:  deepseek/deepseek-chat
agent.defaults.model.fallbacks: [google/gemini-2.5-flash, anthropic/claude-sonnet-4-6]
```

**Hermes** (מ-`config.yaml`):
```
model.default:   deepseek-v4-pro (DEAD — balance 402)
model.provider:  deepseek
auxiliary.vision: deepseek-v4-flash (fixed from openrouter)
delegation.model: '' (uses default)
image_gen.model: fal-ai/flux-2/klein/9b
tts.provider:    edge (free)
stt.provider:    local
on disk providers (28 plugins):  ai-gateway, alibaba, alibaba-coding-plan,
  anthropic, arcee, azure-foundry, bedrock, copilot, copilot-acp, custom,
  deepseek, gemini, gmi, huggingface, kilocode, kimi-coding, minimax, nous,
  nvidia, ollama-cloud, openai-codex, opencode-zen, openrouter, qwen-oauth,
  stepfun, xai, xiaomi, zai
```

**מסקנה מעשית:** שתי המערכות נשענות על DeepSeek לעבודה רגילה. כש-DeepSeek נכבה (כפי שקרה ב-22/5) — *שני* ה-engines נפלו. עצוב. ה-fallback של OpenClaw ל-Gemini אכן הציל אותו (ה-cron שלו עדיין ירוקים), אבל Hermes ללא fallback מקביל מוגדר.

---

## מבנה הקבצים שב-snapshot הזה

```
research/local-state/
├── README.md                           ← הקובץ הזה
├── processes.txt                       ← snapshot של תהליכי node/python/claude/hermes
│
├── openclaw/
│   ├── tree.txt                        ← 800 שורות של עץ E:\Desktop\OpenClawAgent
│   ├── config.redacted.json            ← ~/.openclaw/openclaw.json עם <REDACTED> לסודות
│   ├── AGENTS.md                       ← Alfred constitution (52KB!)
│   ├── SOUL.md                         ← Alfred persona core
│   ├── TOOLS.md                        ← workspace local notes
│   ├── HEARTBEAT.md                    ← (empty template)
│   ├── plugins.txt                     ← `openclaw plugins list` (68/93 enabled)
│   ├── channels.txt                    ← `openclaw channels list`
│   ├── cron.txt                        ← `openclaw cron list --all` (8 active + 8 disabled)
│   ├── cron-jobs.json                  ← raw ~/.openclaw/cron/jobs.json
│   ├── skills.txt                      ← `openclaw skills list` (31/76 ready)
│   ├── mcp-servers.txt                 ← "No MCP servers configured"
│   └── alfred-overview.html            ← הדף הוויזואלי המבוקש
│
└── hermes/
    ├── tree.txt                        ← 600 שורות של עץ E:\bee-hermes
    ├── version.txt                     ← hermes --version output
    ├── config.redacted.yaml            ← ~/AppData/Local/hermes/config.yaml redacted
    ├── SOUL.md                         ← Hermes SOUL.md
    ├── workspace-MEMORY.md             ← memories/MEMORY.md (2.2KB)
    ├── workspace-USER.md               ← memories/USER.md (1.2KB)
    ├── plugins.txt                     ← `hermes plugins list` (4 plugins, all disabled)
    ├── skills.txt                      ← `hermes skills list` (76 builtin + 8 local, all enabled)
    ├── cron.txt                        ← `hermes cron list` (16 jobs, gateway down)
    ├── cron-jobs.json                  ← raw ~/AppData/Local/hermes/cron/jobs.json
    ├── mcp-servers.txt                 ← "No MCP servers configured"
    ├── hooks.txt                       ← "No shell hooks configured"
    ├── memory-providers.txt            ← (error output — subcommand doesn't exist)
    ├── hermes-overview.html            ← הדף הוויזואלי המבוקש
    └── hermes-alfred-cooperation.html  ← BONUS: דף ייעודי על Hermes↔Alfred cooperation
```

---

## דברים שהסשן הענני צריך לקחת מהשטח

### דרישות חוסמות (אם אין — התוכנית לא יוצאת לפועל)
1. **לטעון DeepSeek balance או להחליף provider** — אחרת אי אפשר להעביר עוד עומס ל-Hermes. אופציות:
   - Top up at platform.deepseek.com
   - העברה ל-OpenRouter / Cerebras (Hermes יודע) / Qwen-OAuth (חינם, רשום ב-providers)
   - דרישת fallback ב-Hermes כמו ב-OpenClaw
2. **להחליט מה התפקיד של Hermes** — אם זה רק "outbound bridge ל-bee-hive" כפי שה-topology v1.2 מציג, אז הוא לא צריך agent persona בכלל. אם זה "specialist agents pool" כפי שה-4-Levels רוצה — צריך להפעיל את ה-gateway מחדש ולחבר orchestrator.

### החלטות שעדיין צריכות לבוא מברק
- האם להעביר את 16 ה-cron jobs מ-OpenClaw ל-Hermes (כפי שה-MEMORY של Hermes רומז שכבר הועברו — אבל בפועל 11 רצים על OpenClaw, רק 6 התחילו ב-Hermes ו-5 מהם נכשלו ב-402)
- האם MCP אמור להיות *משותף* (שני ה-engines צורכים את אותם MCP servers) או *מבודד* (כל אחד עם משלו)
- מה לעשות עם הסקריפטים ב-`E:\Desktop\OpenClawAgent\` — Alfred קורא להם דרך cron באמצעות `node alfred-*.js`. אם Hermes ייקח את ה-cron, האם הוא יקרא לאותם סקריפטים? או יממש מחדש?

### סיכון שעולה מהמיפוי החדש
- **שני סוכנים על אותו מספר WhatsApp** — OpenClaw self-chat-mode + Hermes "+972****4483 + +972544598655 + LID" — אם שניהם פעילים בו-זמנית עם אותו מספר, יש סיכון של תגובות כפולות לברק. כרגע זה לא קורה כי Hermes כבוי, אבל זה ה-race condition הראשון להפצה אם מעלים אותו.

---

## מה לא הוצא מתוך טעמי פרטיות
- ה-`.env` של Hermes (22.8 KB) — מכיל מפתחות. לא הועתק.
- מפתחות API ב-`openclaw.json` — הוחלפו ב-`<REDACTED>` בקובץ המועתק.
- ה-session.db של Hermes (167 MB) — היסטוריית שיחות. לא רלוונטי לתכנון.
- `auth.json`, `google_client_secret.json` — לא הועתקו.

---

*המסמך הזה נכתב למסירה ישירה לסשן הענני. אם משהו חסר או דורש עומק — להפעיל מחדש את הסשן המקומי על אותו branch.*
