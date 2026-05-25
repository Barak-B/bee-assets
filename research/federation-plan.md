# 🐝🤖 OpenClaw ↔ Hermes — תוכנית פדרציה ושיפור

**נכתב:** 2026-05-26 02:14 Asia/Jerusalem
**מבוסס על:** 3 חוקרים מקבילים (Hermes tools deep-dive · OpenClaw extensions deep-dive · SOTA web research May 2026) + מסמך הקוואופרציה הקיים [`hermes-alfred-cooperation.html`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/hermes/hermes-alfred-cooperation.html) + סנאפשוט המצב הנוכחי ב-[`research/local-state/`](https://github.com/Barak-B/bee-assets/tree/claude/capability-extensions-collection-JjV2s/research/local-state).
**מטרה:** לבטל כפילויות, להגדיר חלוקת עבודה בה כל מערכת עושה את מה שהיא טובה בו, ולשפר משמעותית את המהירות והאיכות.

---

## 📌 הכרעת-על — Synthesis בשורה אחת

**OpenClaw = the channel & persona plane. Hermes = the brain & skills plane. שניהם חושפים `mcp serve` ומדברים זה לזה דרך MCP. שלוש שכבות מוגדרות: Transport (Hermes Baileys), Persona (Alfred על OpenClaw), Brain (Hermes 0.14 עם Claude Pro OAuth).** זה לא איחוד ולא מיגרציה מלאה — זה **פדרציה** עם boundary ברור.

המסקנה הזו צמחה מ-3 חוקרים שהגיעו לאותה נקודה דרך זוויות שונות, ומצטרפת לדיוק הארכיטקטוני של אופציה B שכבר נבחרה במסמך הקוואופרציה אתמול. ההפתעה — Hermes v0.14.0 (16/5) ו-OpenClaw v2026.5.22 (22/5) שניהם הוסיפו `mcp serve` רשמי. **הפדרציה הזו הפכה מ-hack ל-pattern נתמך upstream**.

---

## 🚨 משבר נוכחי — חייב להיפתר לפני כל wave

| # | משבר | חומרה | תיקון מומלץ | זמן |
|---|---|---|---|---|
| C1 | **DeepSeek balance HTTP 402** — 5 cron של Hermes נכשלים מ-22/5 | 🔴 חוסם הכל | **שדרוג ל-Hermes 0.14 + OAuth proxy ל-Claude Pro** — מסיר את DeepSeek לגמרי | 1h |
| C2 | **Hermes WA bridge port 3000 לא מאזין** (PID נראה חי אבל לא מגיב) | 🔴 חוסם פדרציה | restart `hermes gateway` + log inspection | 15min |
| C3 | **OpenClaw 2026.5.2, אבל 2026.5.22 הוסיף gateway startup ב-5ms** (פי 4100 מהיר יותר) | 🟡 הזדמנות עיקרית שמתפספסת | npm i openclaw@2026.5.22 **אחרי שמוודאים `@openclaw/whatsapp` כבר עם dist/** (זה הסיבה שעדיין על 2026.5.2 — לפי המזיכרון). בודקים שוב בעוד שבועיים. | 30min |
| C4 | **Hermes 1685 commits מאחור** — v0.14.0 כבר שוחרר ב-16/5 עם xAI Grok 1M ctx, Microsoft Teams, OpenAI-compat proxy, x_search tool, Curator | 🟡 פספוס יכולות מהותיות | `hermes update` (אחרי backup של config.yaml + state.db) | 1-2h |
| C5 | **`memory/<date>.md` של Alfred הפסיק 2026-05-17** — 9 ימים בלי כתיבת זיכרון יומי | 🟡 daily-digest cron עיוור | לאתר איזה cron אחראי לכתיבה, להפעיל | 1h |

> **המלצה:** לפני שניגשים ל-Wave 0 (transport unification), פתרון C1+C2 קודם. C3+C4 בלילה אחרי.

---

## 🏗️ הארכיטקטורה המוצעת — 3 שכבות

```
                ┌──────────────────────────────────────────┐
                │    WhatsApp (one phone, one device slot) │
                └──────────────────┬───────────────────────┘
                                   │
                ┌──────────────────▼───────────────────────┐
                │   🔌 Layer 1 — TRANSPORT                  │
                │   Hermes Bridge (Baileys, port 3000)     │
                │   • inbound: /messages long-poll          │
                │   • outbound: POST /send                  │
                │   • allowlist enforcement                 │
                │   • bee-hive already consumes here        │
                └────┬─────────────────────────┬───────────┘
                     │                         │
              webhook in              POST /send out
                     │                         │
        ┌────────────▼──────┐    ┌─────────────▼─────────┐
        │  🛡️ Layer 2 —      │    │  🧠 Layer 3 —         │
        │     PERSONA       │◄──►│     BRAIN             │
        │  Alfred           │MCP │  Hermes 0.14          │
        │  (OpenClaw)       │    │  (workspace=none,     │
        │                   │    │   fresh sessions)     │
        │  • AGENTS.md      │    │                       │
        │    constitutional │    │  • 85 tools           │
        │  • 32 alfred-*.js │    │  • 84 skills (hub)    │
        │  • 12 skills      │    │  • 8 memory backends  │
        │  • 16 cron jobs   │    │  • Kanban dispatcher  │
        │  • 17 dash routes │    │  • Mixture-of-Agents  │
        │  • clarify loop   │    │  • Code exec sandbox  │
        │  • heartbeat      │    │  • Sub-agent delegate │
        │  • prompt cache   │    │  • Web/browser/vision │
        │    1h system      │    │                       │
        └─────────┬─────────┘    └──────────┬────────────┘
                  │                         │
                  └─────── MCP bus ─────────┤
                              │             │
              ┌───────────────┼─────────────┼───────────────────┐
              │               │             │                   │
        ┌─────▼──────┐  ┌─────▼──────┐ ┌────▼──────┐  ┌─────────▼─────┐
        │ Monday MCP │  │ Gmail MCP  │ │ Cal MCP   │  │ SolarEdge MCP │
        │ (official) │  │            │ │           │  │ (custom)      │
        └────────────┘  └────────────┘ └───────────┘  └───────────────┘
```

**שלושה עקרונות פדרציה:**
1. **Constitutional outbound לעולם דרך Alfred.** Hermes יכול לדעת איך לחשוב, אבל הוא חייב לשלוח דרך Alfred כי רק שם מוטמע sendPolicy של 4 יעדים מאושרים. אם Hermes רוצה לכתוב לברק, הוא קורא לטול MCP של Alfred בשם `send_to_barak` שעטוף ב-`⚡ *...*` אוטומטית.
2. **Tool calls עם state כבד נשארים אצל בעל ה-state.** Calendar→Alfred (3-calendar lock). BEE-DB→Alfred (snapshot ב-secrets). Tracer/SolarEdge→Alfred (API keys מוטמעים). אבל coding/browser/code-exec → Hermes (sandbox+RPC הוא הייחוד שלו).
3. **Memory מפוצל מטרה לפי טווח.** `memory/<date>.md` (workspace, יומי, אנושי-קריא) → Alfred. `state.db` (167MB, session history, semantic) → Hermes. בעתיד: `hindsight` plugin של Hermes מקבל ממנו knowledge graph לטווח-ארוך.

---

## 🧩 Capability Decision Matrix

55 capabilities מ-3 החוקרים, ממויינות לפי הכרעה.

### A. Transport & Messaging
| Capability | בעל-בית | סיבה |
|---|---|---|
| WhatsApp Baileys bridge | **Hermes** | bee-hive כבר צורך מ-:3000. Hermes 0.14 stable. אחד מספיק (4 device slots ל-WA, אבל race condition שמובא במסמך שיתוף הפעולה — Issue #1052). |
| WhatsApp self-chat mode | **Alfred** | OpenClaw עם `selfChatMode: true` ב-config — זהות `+972509554483` |
| Telegram platform | **Hermes (חדש)** | 19 פלטפורמות gateway ב-Hermes — Telegram pluggable מיד |
| Discord platform | **Hermes (עתיד)** | gateway/platforms/discord.py מאומת |
| Slack platform | **Hermes (עתיד)** | gateway/platforms/slack.py מאומת |
| Email IMAP/SMTP | **Hermes (חדש)** | gateway/platforms/email.py + skill `himalaya` ב-Hermes |
| iMessage | n/a | macOS-only, לא רלוונטי |
| Allowlist enforcement | **Hermes (transport)** + **Alfred (sendPolicy)** | shared responsibility — שניהם מוודאים |

### B. Agent Persona / Intelligence
| Capability | בעל-בית | סיבה |
|---|---|---|
| Hebrew persona "Alfred" | **Alfred** | AGENTS.md 52KB constitution; ⚡ *...* format; battery-react |
| ⚡ format outbound | **Alfred** | Hard-coded ב-self-chat mode |
| Constitutional rules (8 foundational) | **Alfred** | Immutable AGENTS.md; Hermes אין מקבילה |
| Intent classification (10 intents) | **Alfred** | alfred-router.js with task-examples.md few-shot |
| Clarification loop | **Alfred** | alfred-clarify.js + cooldowns + quiet hours |
| Heartbeat 30-min idle scan | **Alfred** | alfred-heartbeat.js — one finding per run |
| Self-improving skill | **Alfred** | workspace/skills/self-improving + weekly cron |
| Voice notes → transcribe + classify | **Hermes** (STT) + **Alfred** (handle) | Whisper-large-v3 ב-Groq דרך Hermes; Alfred מפעיל classify+post |
| General reasoning (fresh session) | **Hermes** | No persona, no constitution, more raw capability |
| Hard reasoning (Mixture-of-Agents) | **Hermes** | mixture_of_agents_tool.py — UNIQUE |
| Coding tasks (autonomous) | **Hermes** | skill `claude-code` + sandboxed code_execution |
| Plan/spike/research-before-proposing | **Hermes** | skills `plan`, `spike`, `research-before-proposing` |

### C. Memory & State
| Capability | בעל-בית | סיבה |
|---|---|---|
| Daily memory (human-readable) | **Alfred** | `memory/<date>.md` markdown files — text-readable |
| Session history (semantic) | **Hermes** | state.db 167 MB, 1454 sessions |
| Long-term semantic search | **Hermes (חדש)** | Activate ONE memory plugin: **`hindsight`** מומלץ (knowledge graph, entity resolution, multi-strategy retrieval) |
| User profile (USER.md) | **Both — synced** | Alfred owns master; Hermes mirrors |
| MEMORY.md curated | **Both** | אחר workspace; ייסונכרן ל-claude memory directory |
| Active memory blocking recall | **Alfred (להפעיל)** | `active-memory` plugin של OpenClaw — currently disabled — להפעיל |
| RAG על 879K הודעות היסטוריה | **Hermes (חדש)** | pgvector + Hebrew embedding (multilingual-e5-large) + Hermes כtool |
| Frozen memory snapshot in system prompt | **Hermes pattern** | Hermes memory_tool.py דפוס — מומלץ לאמץ ב-Alfred |
| Prompt cache 1h TTL | **Both — explicit** | ⚠️ ברירת המחדל ירדה ל-5min ב-3/2026. שני הצדדים חייבים `cache_ttl: 1h` מפורש. כיום ב-Hermes config: `cache_ttl: 5m` — תיקון מיידי. |

### D. External Integrations (Business Tools)
| Capability | בעל-בית | סיבה |
|---|---|---|
| Monday.com CRM | **Alfred → MCP (חדש)** | אופציה לעבור ל-`@mondaydotcomorg/monday-api-mcp` רשמי. Alfred לקרוא לטול MCP. שני הצדדים נהנים. |
| Google Calendar (3-calendar lock) | **Alfred** | alfred-calendar.js + הגבלת 3 calendars constitutional |
| Google Calendar MCP | **חדש — שניהם** | Hermes יכול גם, אבל הכניסה דרך Alfred (לשמירה על הגבלה) |
| Gmail | **Alfred** | alfred-gmail.js (skeleton — להשלים) |
| SolarEdge production API | **Alfred** | alfred-solaredge.js — ⚠️ HTTP 403 — דחוף לסבב מפתח |
| Sungrow API | **Alfred** | (אם לא מומש — להוסיף) |
| Tracer fleet GPS | **Alfred** | alfred-tracer.js |
| Invoice Maven (חשבוניות) | **Alfred** | alfred-invoice-maven.js, --yes gated |
| BEE Operations DB snapshot | **Alfred** | refresh-bee-snapshot.js cron + secrets/bee-ops-snapshot.db |
| gov.il regulatory RSS | **Alfred** (יחיד) | **כפילות לבטל** — Alfred owns. Hermes `regulatory-rss-monitoring` skill — disable. |
| Israeli VAT/tax deadlines | **Alfred** | alfred-deadlines.js — deterministic logic |
| Weather (Open-Meteo) | **Alfred** | alfred-weather.js — free API |
| WhatsApp history (decrypted 879K msgs) | **Hermes** | Hermes already has the DB at C:\Users\Barak\whatsapp_backup; build RAG here |

### E. Tools (Heavy Capabilities)
| Capability | בעל-בית | סיבה |
|---|---|---|
| Browser automation | **Hermes** | 3 providers (Browserbase/Browser Use/Camofox); browser_tool.py |
| Headless web scrape (Firecrawl) | **Hermes** (יחיד) | **כפילות לבטל** — 13 ב-Alfred, 14 ב-Hermes. Remove from Alfred. |
| Vision (image analysis) | **Hermes** | vision_tools.py + multi-provider |
| OCR documents | **Hermes** | skill `ocr-and-documents` |
| Code execution sandbox | **Hermes** | code_execution_tool.py + UDS RPC — UNIQUE |
| Terminal multi-backend | **Hermes** | local/docker/modal/vercel/ssh/singularity/daytona |
| File operations | **Both** | each owns its workspace |
| Skills hub (installable) | **Hermes** | skills_hub.py + GitHub adapter |
| MCP client (consume external MCP) | **Both** | Each acts as MCP client to external servers |
| MCP server (expose own tools) | **Both (חדש)** | `hermes mcp serve --port 3999` + `openclaw mcp serve` |

### F. Orchestration / Workflow
| Capability | בעל-בית | סיבה |
|---|---|---|
| Cron scheduling | **Alfred** | 11 פעילים בריאים. Hermes cron broken (gateway down) + DeepSeek 402. |
| Hermes cron (future) | **Hermes (אחרי repair)** | `hermes cron` עם SQLite-backed state — אבל לא עכשיו |
| Kanban task workflow (async) | **Hermes** | kanban_tools.py + dispatcher — UNIQUE |
| Sub-agent delegation | **Hermes** | delegate_tool.py + restricted toolsets — UNIQUE |
| Mixture-of-Agents (4 frontier) | **Hermes** | mixture_of_agents_tool.py — UNIQUE |
| Background goals / standing tasks | **Hermes** | `/goal` durability layer (v0.13.0) |
| Dashboard UI (17 routes + SSE) | **Alfred** | dashboard-server.js port 8765 — אין מקביל ב-Hermes |
| Task clarification (few-shot learning) | **Alfred** | alfred-clarify.js — לא ב-Hermes |
| Heartbeat scheduler | **Alfred** | alfred-heartbeat.js — לא ב-Hermes |

### G. Provider / Model Routing
| Capability | בעל-בית | סיבה |
|---|---|---|
| Default LLM provider | **Both — DIFFERENT** | Alfred: `deepseek-chat → gemini-flash → claude-sonnet`. Hermes 0.14: **Claude Pro OAuth proxy** (Hermes 0.14 שינוי קריטי — לא תלוי ב-DeepSeek balance) |
| Vision model | **Hermes** | `deepseek-v4-flash` — תוקן מ-OpenRouter במאי |
| Reasoning model | **Hermes (חדש)** | xAI Grok 1M ctx ב-0.14 — `x_search` כtool ייעודי |
| Audio transcription (Whisper) | **Alfred** (חיבור) | `tools.media.audio.provider: groq, model: whisper-large-v3` |
| TTS | **Hermes** | edge / elevenlabs / openai / piper / neutts |
| Image generation | **Hermes** | fal-ai/flux-2/klein/9b |
| Embedding (semantic) | **Hermes (חדש)** | Multilingual e5-large (Hebrew-aware) |

### H. Security / Safety
| Capability | בעל-בית | סיבה |
|---|---|---|
| sendPolicy (outbound allowlist) | **Alfred** | constitutional — only 4 destinations |
| Inbound allowlist | **Both** | Hermes `whatsapp.allow_from` + Alfred `channels.whatsapp.allowFrom` |
| Constitutional file immutability | **Alfred** | AGENTS.md + manual edit only |
| Tirith supply-chain scanning | **Hermes** | tirith_security.py + skills_guard.py |
| URL safety (SSRF/phishing) | **Hermes** | url_safety.py + website_policy.py |
| Approval gate (dangerous commands) | **Both** | each owns its own |
| Command allowlist | **Hermes** | config command_allowlist (3 entries) |
| Skill quarantine | **Hermes** | skills_guard.py — scan before install |

### I. Observability / Cost
| Capability | בעל-בית | סיבה |
|---|---|---|
| `/insights` analytics | **Hermes** | 280.6M tokens / 14 days insights view |
| Cost monitoring | **Alfred** | alfred-cost-monitor.js + budget alert cron |
| Activity tracing | **Alfred** | alfred-tracer.js |
| LLM gateway (Helicone/Langfuse) | **חדש — בין שניהם** | Wave 4 — observability foundation |
| `/insights → GPT → tune` cycle | **Hermes** (loop) | optimization-playbook.md exists |

---

## 🌊 Wave-by-Wave Migration Plan

### Wave 0 — Crisis Fix (היום-מחר, ~3h)
**מטרה:** להחזיר את שתי המערכות לפעולה תקינה. כל wave הבא תלוי בזה.

1. **שדרוג Hermes ל-0.14.0** (~1h)
   - `git -C C:\Users\Barak\AppData\Local\hermes\hermes-agent backup`
   - `hermes update` (אומרת לעצמך 1685 commits behind)
   - בודקים שה-config שורד: `hermes config check`
   - אם יש breaking changes, אחזור ל-config.yaml.bak.20260524_1127

2. **הפעלת OAuth proxy — סוף תלות DeepSeek** (~30min)
   - `hermes auth claude` — מתחבר ל-Claude Pro/Max דרך OAuth (לא API key)
   - בvalidates: 5 keys לפי MEMORY של Hermes (Anthropic/Gemini/GitHub/Groq/Perplexity)
   - שינוי `config.yaml`: `model.default: claude-opus-4-7` (או sonnet-4-6 אם opus יקר)
   - או הוספת fallback chain: deepseek → claude-pro → gemini-flash
   - **תיקון מיידי שני:** `prompt_caching.cache_ttl: 1h` (כיום `5m` — עלייה של 30-60% בעלות)

3. **תיקון Hermes WA bridge port 3000** (~15min)
   - `netstat -ano | findstr ":3000"` — מוודאים שלא מאזין
   - `hermes gateway status` — אם מציג down, restart
   - לוג: `Get-Content C:\Users\Barak\AppData\Local\hermes\logs\errors.log -Tail 50`
   - אם פייל ב-startup — דרך הנפוצה: kill כל python+node, אחרי zellij `hermes gateway install` (NSSM service)

4. **`memory/<date>.md` חי שוב** (~30min)
   - לזהות מי כותב את memory/<date>.md — ככל הנראה `alfred-handle.js` או process ראשי של OpenClaw
   - אם זה ה-process ראשי שכבה, להפעיל פעם אחת cron מעיר אותו
   - בדיקה שhe cron `morning-urgent-digest` ו-`evening-urgent-digest` קוראים מהקובץ הנכון

5. **רוטציה של SOLAREDGE_APIKEY** (~15min)
   - מערכת SolarEdge החזירה 403 לפי alfred-solaredge.js
   - חידוש דרך solaredge.com → secrets/bee-integrations.env
   - בדיקת tail בלוגים

### Wave 1 — Single Source of Truth (ימים 2-3, ~4h)
**מטרה:** לבטל את הכפילות הקריטית — Baileys כפול + duplicate skills.

6. **השבתת Alfred Baileys** (~1h, **REVERSIBLE**)
   - גיבוי: `Copy ~/.openclaw/openclaw.json → ~/.openclaw/openclaw.json.bak.pre-bridge-migration`
   - עריכה: `plugins.entries.whatsapp.enabled: false` + `channels.whatsapp.enabled: false`
   - `openclaw cron disable <כל cron שמשתמש ב-WhatsApp עצמו>` — אבל ההגדרה היא `delivery.channel: whatsapp` — צריך לשנות בכל cron עוד
   - Restart OpenClaw gateway
   - בדיקה: כעת רק bridge אחד מחובר ל-WA → קונפליקט 401 נעלם

7. **Alfred outbound → HTTP POST :3000/send** (~2h)
   - 11 cron payloads רשומים `to: whatsapp:+972509554483`. אחד-אחד:
     - שינוי `delivery.mode: announce` → `delivery.mode: none`
     - תוספת לסקריפט שמופעל: `curl -X POST http://127.0.0.1:3000/send -d '{"chatId":"972509554483@s.whatsapp.net","message":...}'`
   - בדיקה אחת-אחת ש-cron אכן שולח דרך bridge
   - **אזהרה:** ב-`alfred-router.js` יש קריאות outbound באמצעות OpenClaw send API — צריך לחפש ולהעביר ל-bridge

8. **Alfred inbound webhook מ-Hermes** (~1h)
   - אופציה ג' המומלצת מהמסמך הקיים: Alfred קורא `/messages` long-poll
   - מימוש: סקריפט `alfred-inbound-watcher.js` שרץ ברקע, קורא `/messages?since=last_id`, מזין ל-alfred-router.js
   - alternative: webhook עם port חדש, אבל יותר עבודה

9. **Firecrawl dedup** (~15min)
   - 13 variants ב-Alfred symlink-escape (אינם נטענים בכלל לפי `skills list` עם warnings)
   - 14 variants ב-Hermes (`skills/research/`)
   - מחיקת `~/.openclaw/skills/firecrawl*` ו-`~/.agents/skills/firecrawl*` (Alfred symlinks)
   - Hermes נשאר master. Alfred מבקש דרך MCP.

10. **gov-rss dedup** (~30min)
    - שתי המערכות מנטרות. בחירה: Alfred (כי דחיפות עברית ובהמשך תיעוד ל-`sites/`)
    - Hermes `regulatory-rss-monitoring` skill — disable. רק Alfred ירוץ.

### Wave 2 — MCP Foundation (שבוע 1, ~8h)
**מטרה:** לבנות את ה-MCP bus המשותף. נכון לעכשיו אפס MCP servers מוגדרים בשתי המערכות.

11. **`openclaw mcp serve` + `hermes mcp serve`** (~1h)
    - OpenClaw: `openclaw mcp serve` חושף את הערוצים המנותבים (WhatsApp 4 destinations) כ-MCP tools
    - Hermes: `hermes mcp serve --port 3999` חושף את 85 הכלים שלו כ-MCP tools
    - בדיקה: רושמים את שני ה-servers ב-Claude Desktop config וכל אחד רואה את השני

12. **MCP חיבור צולב — Alfred ↔ Hermes** (~1h)
    - `hermes mcp add openclaw --url http://127.0.0.1:18789/mcp` — Hermes רואה את ערוצי OpenClaw
    - `openclaw mcp add hermes --url http://127.0.0.1:3999` — Alfred רואה את כלי Hermes
    - בדיקה: Hermes מנסה `tools/call name: send_to_barak` → OpenClaw מקבל ועוטף ב-`⚡ *...*`

13. **Monday.com MCP — רשמי** (~2h)
    - `@mondaydotcomorg/monday-api-mcp` הוכרז 2026 בdedicated AI-agent signup
    - חיבור: stdio או HTTP. דורש Monday API token (יש לנו).
    - שינוי alfred-monday*.js: עוטף את MCP במקום קריאה ישירה ל-GraphQL
    - הרווח: Hermes גם יכול לקרוא ל-Monday מבלי שכל סקריפט יהיה ב-OpenClaw

14. **Google Calendar + Gmail + Drive MCP** (~2h)
    - דרך maton.ai (חבר proxy רשום ב-google-calendar-api skill) או Composio.dev
    - Alfred ממשיך להחזיק 3-calendar lock דרך alfred-calendar.js, אבל גם Hermes נגיש בקריאה
    - ⚠️ שני הצדדים — sendPolicy עדיין ב-Alfred. Hermes יכול לקרוא אבל לא לשלוח invitations מבלי עידוד דרך Alfred.

15. **SolarEdge MCP — לבנות שלנו** (~2h)
    - אין MCP רשמי עוד ל-SolarEdge
    - בניית `bee-solaredge-mcp` ב-`E:\bee-mcp-servers\bee-solaredge\`
    - דקטה דקטה דרך rest API; אקספוז 5 tools: list_sites, get_alerts, get_production, top_n_alerts, overview
    - חיבור כ-stdio MCP ל-OpenClaw + Hermes
    - הרווח: רוטציית מפתח במקום אחד, צריכה דרך MCP

### Wave 3 — Capability Splits (שבועות 2-3, ~12h)
**מטרה:** Alfred יעשה רק מה שהוא צריך לעשות; Hermes יעשה את ה-heavy lifting.

16. **Memory enhancement — Hermes hindsight** (~2h)
    - הפעלת Hermes plugin `memory/hindsight`: `hermes plugins enable hindsight`
    - הגדרת `memory.provider: hindsight` ב-config.yaml
    - hindsight בונה knowledge graph אוטומטי מ-session messages
    - Alfred קורא ל-hindsight כ-MCP tool כשצריך to-query semantic memory: "מתי דיברנו לאחרונה עם רפאל סולאר?"

17. **RAG על 879K הודעות** (~4h)
    - DB כבר decrypted: `C:/Users/Barak/whatsapp_backup/msgstore.db.decrypted.db` (890MB)
    - שלב 1: yield-by-chat → embedding (E5-multilingual-large), שמירה ב-pgvector על bee-prod-1 או באלmas מקומי
    - שלב 2: Hermes tool `search_whatsapp_history(query, filters)` שעוטף semantic + metadata search
    - הרווח: "מצא לי את כל ההודעות מ-X שבהן הוא דיבר על Y" — לא אפשרי לפני זה

18. **Voice end-to-end** (~3h)
    - inbound voice → Hermes WA bridge (כבר מקבל) → Groq Whisper transcribe → POST :alfred-handle (סקריפט חדש או דרך MCP)
    - Alfred classify (router) → POST פלט ל-voice-transcripts group דרך :3000/send
    - הרווח: voice-to-action בלי ידני

19. **Reactions as control surface** (~2h)
    - 👍 על draft message → Alfred שולח
    - ❌ על draft → ביטול
    - ⭐ על message → escalate to dashboard
    - מימוש: Hermes WA bridge שומע reactions event, מעביר ל-Alfred dashboard SSE
    - **ייחודי** — לפי המחקר, אף אחד אחר לא בנה את זה

20. **Active-memory blocking recall** (~1h)
    - הפעלת `active-memory` extension ב-OpenClaw (כיום disabled)
    - sub-agent רץ לפני כל reply מאפשר ל-Alfred למשוך זיכרון רלוונטי לפני שעונה
    - הקובעים: timeout budget, max_tokens budget

### Wave 4 — Platform Expansion (חודש 2, ~16h)
**מטרה:** הרחבה לערוצים נוספים + observability.

21. **Telegram channel** (~2h)
    - `hermes gateway platform enable telegram`
    - Hermes 0.14 כבר תומך Telegram fully
    - אותו Alfred persona זמין דרך Telegram + WhatsApp

22. **Email channel (IMAP/SMTP)** (~2h)
    - `hermes gateway platform enable email`
    - Alfred (דרך Hermes MCP) קורא ל-himalaya skill לקבלת אימייל
    - alfred-gmail.js (skeleton) — להשלים, או להחליף בHermes himalaya skill ישירות

23. **LLM Gateway observability — Helicone או Langfuse** (~4h)
    - Helicone proxy: כל קריאת LLM עוברת דרך — log + cost + A/B
    - אופציונלי: Langfuse self-hosted
    - שני המערכות מצביעות proxy URL
    - הרווח: ראיית cost-per-skill, latency-per-tool, A/B prompts על traffic real

24. **Inverter alarm triage end-to-end** (~4h)
    - SolarEdge alarm → Alfred דרך SolarEdge MCP → classify severity → ניסוח question ב-WA לברק ("מערכת X באתר Y מדווחת על Z, האם reboot?") → תגובת ברק → action
    - לפי Digiqt: 35% הפחתת truck rolls
    - הרווח: ROI ישיר עסקי

25. **Israeli AI agents marketplace** (~4h)
    - `github.com/danielrosehill/Israeli-AI-Agents-And-MCPs` + agentskills.co.il
    - אימוץ Mas Hachnasa MCP / Bituach Leumi automation / Hebrew NLP
    - חיסכון: שבועות של פיתוח שלא צריך לעשות

### Wave 5 — Continuous Optimization (ongoing)
**מטרה:** loop של measurement + tune.

26. **`hermes /insights` שבועי** — token analysis → GPT analysis → config tune. כבר יש playbook ב-`E:\bee-hermes\docs\optimization-playbook.md`.
27. **self-improving skill weekly review** — Sunday 09:00 cron, Alfred סוקר 7 ימים, מציע 0-3 שיפורים.
28. **Dashboard expansion** — להוסיף ל-dashboard-server.js routes שמציגות גם Hermes state (kanban, ongoing goals).
29. **A/B prompts על traffic real** — Replay של inbound אחרון על גרסת prompt חדשה (נדרש Helicone).
30. **Skill curator (Hermes 0.12 feature)** — `hermes curator run` כל 15 משימות מדרג ומאחד skills.

---

## 💎 Sleeper Capabilities — דברים שנפתחים מהפדרציה

מהמחקר + ה-inventories. כל אחד מהם דורש 1-4h למימוש.

1. **חשבוניות דרך תמונה** — תמונה ב-WA → Hermes Vision → חילוץ סכום/לקוח/תאריך → BEE.Document
2. **לוג ביקור באתר אוטומטי** — live-location ב-WA + תמונות → EXIF → `sites/<X>.md`
3. **A/B prompts על traffic real** — Hermes ישמור inbound; להריץ prompt חדש offline ולהשוות
4. **Composio integration** — Composio's WhatsApp+Claude SDK יש לו pattern ל-supervisor של Baileys. אפשר לאמץ
5. **`hermes claw migrate`** — פקודה רשמית של Hermes ל-import OpenClaw configs. אם נחליט בעתיד למזג — קיים כבר
6. **קמפיינים outbound עם rate limit** — Hermes /send queue + priority lanes (transactional > marketing). 20 msg/sec עם backoff.
7. **xAI Grok x_search tool** — חיפוש real-time עם 1M ctx — חדש ב-Hermes 0.14
8. **MCP sampling pattern** — MCP server מבקש מ-LLM completion → routes back to Hermes auxiliary LLM. enables MCP-server reasoning
9. **Sub-agent delegation עם isolated toolsets** — Hermes spawn fresh task_id, restricted commands — מצוין לעבודה רגישה
10. **Kanban + workers** — Async task workflow: create → ready → picked → running → done; דרך תיק messages.upsert

---

## ❓ שאלות פתוחות שמחייבות הכרעה של ברק

| # | שאלה | אופציות | המלצת המסמך |
|---|---|---|---|
| Q1 | **DeepSeek — נגמור איתו?** | (a) Top up + מעבר ל-Hermes 0.14 (משנה default ל-Claude); (b) להשאיר DeepSeek כ-fallback זול | (a) — Claude Pro OAuth ב-Hermes 0.14 חוסך חודש שלם של headache |
| Q2 | **מהן ה-skill הראשונות שנעטוף ב-MCP?** | (a) Monday only; (b) Monday+Calendar+Gmail; (c) הכל בבת אחת | (b) — שלוש ROI הגבוהות |
| Q3 | **Active-memory plugin — ב-Alfred?** | פעיל / כבוי | פעיל — להפעיל מיד, חוסך טוקנים |
| Q4 | **Hermes Telegram channel — להפעיל?** | כן / לא | כן — 2h עבודה, מאפשר assistant גם מהטלפון אם WhatsApp חוסם |
| Q5 | **השארת alfred-mcp-gateway.js הקיים?** | (a) למחוק כי MCP isolated; (b) לשמור כ-fallback ל-Zapier; (c) להשלים | (a) — MCP servers מומלצים על Zapier MCP יישבת זה. |
| Q6 | **memory write — איפה?** | (a) Alfred memory/<date>.md ; (b) Hermes hindsight ; (c) שניהם — sync | (c) — שניהם, Alfred קובע, Hermes משתמש |
| Q7 | **שדרוג OpenClaw ל-2026.5.22?** | (a) עכשיו; (b) אחרי שauthor של @openclaw/whatsapp ישתחרר עם dist/ | (b) — לפי המזיכרון, 2026.5.22 שובר WA כיום. בודקים בעוד שבועיים |

---

## 📊 KPIs — איך נדע שהפדרציה עובדת

| KPI | מטרה | מדידה | תדירות |
|---|---|---|---|
| Tokens/day | -30% מהבסיס הנוכחי (~20M/day) | `hermes insights --days 1` | יומי |
| Cost/day | -40% (בעיקר ע"י OAuth proxy + 1h cache) | חישוב מ-/insights | יומי |
| WhatsApp conflicts | 0 (היום: occasional 401) | bridge.log | יומי |
| Cron success rate | >95% (היום: 70% בגלל 402) | `hermes cron list` | יומי |
| Skill ROI | nu | new MCP calls per day | שבועי |
| Voice-to-action latency | <30s | log timing | per-voice |
| Memory recall accuracy | סמוך לאיגוף בשאלות "מתי דיברנו לאחרונה עם X?" | manual test | שבועי |

---

## 🔄 Rollback Plan

אם משהו מתפרק — איך חוזרים:

- **Wave 0:** `Copy config.yaml.bak.20260524_1127 ← config.yaml`. Restart hermes.
- **Wave 1:** `Copy openclaw.json.bak.pre-bridge-migration ← openclaw.json`. Set `plugins.whatsapp.enabled: true`. Restart OpenClaw gateway. Alfred Baileys חי שוב.
- **Wave 2:** הסרת MCP servers דרך CLI: `hermes mcp remove <name>` / `openclaw mcp remove <name>`. הסקריפטים הישירים (alfred-monday.js וכו') ממשיכים לעבוד מיד.
- **Wave 3+:** Plugins disabled. Workflows reverted ל-direct calls.

---

## 📚 מקורות

מבוסס על:
- [`research/local-state/`](https://github.com/Barak-B/bee-assets/tree/claude/capability-extensions-collection-JjV2s/research/local-state) — סנאפשוט מצב נוכחי שאספתי לסשן הענני
- [`research/local-state/hermes/hermes-alfred-cooperation.html`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/hermes/hermes-alfred-cooperation.html) — מסמך אדריכלות קיים שלך מ-25/5
- [`E:\bee-hermes\docs\topology.md`](https://github.com/Barak-B/bee-assets/tree/claude/capability-extensions-collection-JjV2s) v1.3 — Hermes topology
- 3 חוקרי-משנה מקבילים (Hermes inventory · OpenClaw inventory · SOTA research)

מחקר web — קישורים מרכזיים:
- Hermes 0.14 release notes: [github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16)
- Hermes 0.14 changelog: [hermes-ai.net/changelog](https://hermes-ai.net/changelog/)
- OpenClaw MCP serve docs: [docs.openclaw.ai/cli/mcp](https://docs.openclaw.ai/cli/mcp)
- OpenClaw vs Hermes head-to-head: [pickaxe.co/post/hermes-agent-vs-openclaw](https://pickaxe.co/post/hermes-agent-vs-openclaw)
- Persistent AI agents comparison: [thenewstack.io/persistent-ai-agents-compared](https://thenewstack.io/persistent-ai-agents-compared/)
- Monday.com official MCP: [github.com/mondaycom/mcp](https://github.com/mondaycom/mcp)
- Anthropic prompt-cache 5min TTL change: [dev.to/whoffagents/claude-prompt-caching-in-2026](https://dev.to/whoffagents/claude-prompt-caching-in-2026-the-5-minute-ttl-change-thats-costing-you-money-4363)
- MCP ecosystem roadmap 2026: [thenewstack.io/model-context-protocol-roadmap-2026](https://thenewstack.io/model-context-protocol-roadmap-2026/)
- Microsoft Agent Framework 1.0 GA: [techcommunity.microsoft.com](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/the-future-of-agentic-ai-inside-microsoft-agent-framework-1-0/4510698)
- WhatsApp Claude agent template: [github.com/dsebastien/whatsapp-claude-agent](https://github.com/dsebastien/whatsapp-claude-agent)
- Israeli AI agents repo: [github.com/danielrosehill/Israeli-AI-Agents-And-MCPs](https://github.com/danielrosehill/Israeli-AI-Agents-And-MCPs)
- Baileys 2025 REST API: [github.com/WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)

---

**הקובץ הזה הוא הצעת תוכנית. שום פעולה לא ירוצה לפני שתאשר את ה-waves. נוסיף בדף הזה את ההכרעות שלך על Q1-Q7 לפני שמתחילים Wave 0.**

*נכתב על-ידי הסשן המקומי של Claude Code, מבוסס על 3 חוקרי-משנה מקבילים + סנאפשוט הדיסק החי + מחקר web עדכני ל-May 2026.*
