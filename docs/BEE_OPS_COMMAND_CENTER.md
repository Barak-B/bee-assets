# BEE Ops Command Center — מקס אקטיבי

> **מטרה:** מסמך פיקוד חי. מה היה · מה רצינו · מה ממשיכים · איך מתקדמים · מה מחובר ומה חסום.
> **עודכן:** 2026-07-11 · ריצה `bc-59a59400-0cc5-4b4d-a597-e1a26b834461` ("למידת AI ואינטגרציה")
> **בעלים:** ברק ברזל · B.E.E · `barak-barzel@barak-e.com`
> **Companion:** `docs/MAX_KNOWLEDGE_BASE.md` (PR #7) = digest קנוני. **הקובץ הזה** = תוכנית פעולה + מפת חיבורים.

---

## 0 — תקציר מנהלים (30 שניות)

| | |
|---|---|
| **העסק** | קבלנות חשמל + סולאר · ~137 לקוחות · 255 אתרים · 18 רכבים · 149 ממירים |
| **המערכת** | כוורת Alfred (persona/WA) + Hermes (כלים כבדים) + עמוד שדרה Wave 53–55 |
| **איפה האמת** | Branch `claude/capability-extensions-collection-JjV2s` (PR #2) — **לא** `main` |
| **מה רץ באמת** | Importer/normalizer/validator + price-anomaly + Alfred/Hermes חיים |
| **מה הבא בלי dropoffs** | MVP row 8 — Wave 54 engineering orchestrator skeleton |
| **חוסם #1 אצל ברק** | 5 artifact dropoffs (OB-1…5) + auth ל-MCPs ב-Cursor Desktop |
| **חוסם #2 ארכיטקטוני** | Canon → Alfred/Hermes wiring ממתין לאישור |

---

## 1 — מפת סוכנים פעילים (Cloud · נכון ל-2026-07-11)

| bcId | שם | סטטוס | תוצר | URL |
|---|---|---|---|---|
| `bc-59a59400-…` | **למידת AI ואינטגרציה** (זו הריצה) | RUNNING | Command Center זה | [agents/…](https://cursor.com/agents/bc-59a59400-0cc5-4b4d-a597-e1a26b834461) |
| `bc-df5ef7ee-…` | בסיס ידע למקס | IDLE | `docs/MAX_KNOWLEDGE_BASE.md` · PR #7 | [agents/…](https://cursor.com/agents/bc-df5ef7ee-734d-4460-b339-aa78c363634e) |
| `bc-68ffc151-…` | מידול תלת-ממדי רחפן | IDLE | Design-only · ממתין למקור הפרויקט הישן | [agents/…](https://cursor.com/agents/bc-68ffc151-c80c-4dbd-9cc4-dc48939ed103) |

### סוכנים מקומיים (Windows · חיים)

| סוכן | תפקיד | פורט / נתיב |
|---|---|---|
| **Alfred / OpenClaw** | Persona · WhatsApp · cron · drafts · Law #1 | ≈3000 · `E:\Desktop\OpenClawAgent\` |
| **Hermes** | Tools כבדים · MoA · memory · kanban | ≈3100 · `E:\bee-hermes\` |
| **n8n** | אוטומציות | 5678 |
| **Redis** | Locks | 6379 |

### סוכני עמוד השדרה (LLD / קוד)

| Wave | רכיב | LLD | קוד Phase A | עדיפות הבאה |
|---|---|---|---|---|
| 53/A | bank-receipts | ✅ | ✅ | Port ל-BEE app + OB-4 |
| 53/B | procurement + price-anomaly | ✅ | ✅ | Wire `checkLineAnomaly` ב-ingest |
| 53/C | proposals | ✅ | ❌ | אחרי ledger + engineering |
| 53/D | accounting-ledger | ✅ | ❌ | צריך OB-2 |
| 54 | engineering-agent | ✅ | partial specs | **Row 8 — עכשיו** |
| 55 | customer-success | ✅ | ❌ | אחרי spine MVP |
| — | regulatory / tender | skill | חי / MVP | Firecrawl ל-2 מקורות שבורים |

---

## 2 — מה היה (היסטוריה מרוכזת)

### גל מחקר + ביצוע (מאי–יוני 2026)

1. **Federation Alfred⇄Hermes** — תוכניות v1/v2, חלוקת תפקידים, MCP משותף.
2. **Phase 1 (מאי 26)** — 7/7 actions: smart-router, cron restore, heartbeat, roster, Gmail OAuth diagnose, DeepSeek anomaly, tender MVP (2 מכרזים אמיתיים ב-dry-run).
3. **Phase 2 scaffolding** — Neo4j, bee-mcp-server skeleton, sites-mapping.
4. **Wave 53–55** — 6 LLDs + 10 החלטות נעולות (LD/EA) + Phase A ל-53/A+B.
5. **Graphify + Obsidian bridge** — BRAIN כ-hub, sync scripts, CLOUD_CORTEX_TOOLING checklist.
6. **Price-anomaly** — piece ראשון של smart layer, 7/7 tests.
7. **Max KB (יולי 11)** — digest onboarding ל-cortex עתידי.

### מה ברק רצה (כוונות חוזרות מהקנון + USER.md)

- להחליף שכבה מילולית/ידנית (WA + Gmail + Monday + ראש) ב-spine מבוקר.
- **Law #1/#2** — שליטה אנושית; אין auto-send ללקוחות.
- לגדל את העסק **וגם** לבנות BEE כ-SaaS.
- עדיפות: **סוכני הנדסה** (PV, חישובים, תקנים, BOM) לפני ניטור עסקי.
- WhatsApp בעברית; תיעוד ב-Obsidian; מחקר לפני הצעה.

### פרויקט נפרד פתוח

- **מידול תלת-ממדי מרחפן** — התחיל עם Claude, לא הסתיים; הסוכן בענן מצא ש-`bee-assets` לא הפרויקט. ממתין לקישור/ריפו/סיכום.

---

## 3 — מפת חיבורים: MCP · Skills · Hooks

### 3.1 MCP בריצת Cloud הנוכחית

| שרת | סטטוס | מה נותן | פעולה נדרשת |
|---|---|---|---|
| **cursor-cloud** | ✅ ready | סוכנים, transcripts, environment | — |
| **Cloudflare-docs** | ✅ ready | תיעוד Workers/Pages | — |
| **Context7** | ✅ ready | docs לספריות | — |
| **Notion** | ❌ needsAuth | משימות / KB חיצוני | Auth ב-Cursor Desktop |
| **Monday** | ❌ needsAuth | CRM / לוחות BEE | Auth ב-Cursor Desktop (**P0**) |
| **GitLab** | ❌ needsAuth | issues / MR | Auth אם בשימוש |
| **Canva** | ❌ needsAuth | עיצוב | Auth אם בשימוש |
| **Huggingface-skills** | ❌ needsAuth | מודלים / Spaces | Auth אם בשימוש |
| **Cloudflare-bindings/builds/observability** | ❌ needsAuth | infra | Auth אם בשימוש |
| **bee-graph** (מקומי/Tailscale) | ⛔ לא רשום בענן | Graphify query | Stand-up + Environment pin |

**מקס לא יכול ללחוץ OAuth בשבילך.** אחרי auth — שמור Environment ב-Cursor עם ה-MCPs המחוברים והפעל מחדש סוכנים ממנו.

### 3.2 Skills זמינים ל-cortex הזה (Cursor plugins)

| משפחה | Skills | שימוש ל-BEE |
|---|---|---|
| **Notion** | create-page/task/db, search, find, knowledge-capture, tasks-* | תיעוד תוכניות + board משימות (אחרי auth) |
| **Monday CRM** | morning-briefing, board-diagnosis, forecast, workspace-builder… | CRM יומי אחרי Monday auth |
| **Canva** | brand-check, edit-design, bulk-create… | חומרי שיווק/הצעות |
| **Cloudflare** | workers, durable-objects, wrangler, Agents SDK… | אם/כש-BEE על CF |
| **Hugging Face** | spaces, train, datasets, Gradio… | ניסויי מודלים / Vision |
| **GitLab** | gitlab-ci-author + workflow | CI אם עוברים ל-GL |
| **Superpowers** | brainstorming, TDD, plans, debugging, worktrees… | משמעת ביצוע |
| **App Builder** | Adobe Runtime scaffolder/testing | רק אם רלוונטי |

### 3.3 Skills / hooks מקומיים (snapshots ב-research)

- `research/local-state/openclaw/skills.txt` + `mcp-servers.txt` + hooks ב-Hermes
- Alfred: channels, cron, HEARTBEAT, TOOLS
- Hermes: providers, memory-providers, plugins, SOUL.md
- **פער:** `AGENT_CANON` מוכן אבל Alfred/Hermes עדיין לא טוענים אותו ב-startup (ממתין לאישור ברק)

### 3.4 Checklist חיבור קבוע (מ-CLOUD_CORTEX_TOOLING)

1. [ ] Auth Monday (+ Notion אם צריך)
2. [ ] Auth Cloudflare-* אם רלוונטי
3. [ ] Environment שמור עם `Barak-B/bee-assets` + MCP מחוברים
4. [ ] Secrets בשם בלבד: `DEEPSEEK_API_KEY`, `GRAPHIFY_API_KEY`, `MONDAY_API_KEY`
5. [ ] Stand-up `bee-graph` HTTP MCP (Tailscale) + רישום
6. [ ] הפעלת cloud agents מ-Environment (לא JIT ריק)
7. [ ] מקומי: `pwsh -File E:\bee-assets\research\scripts\verify-brain-sync.ps1`

---

## 4 — תוכנית התקדמות (עכשיו → spine MVP)

### מסלול A — Cloud יכול לבד (מומלץ להתחיל)

| # | משימה | Owner | Gate |
|---|---|---|---|
| A1 | **Wave 54 row 8** — orchestrator skeleton + `cable-tables/` + `inverter-specs.json` layout | cloud | cache round-trip |
| A2 | Wire `checkLineAnomaly` מתוך `ingest.ts` + schedule `rebuildBenchmarks` | cloud | anomalies ≠ hardcoded 0 |
| A3 | עדכון `BRAIN.md` + Command Center אחרי כל גל | cloud | commit עם השינוי |
| A4 | מיזוג / יישור PR #7 (Max KB) + המסמך הזה לתוך עץ docs | cloud + Barak review | docs קוהרנטיים |

### מסלול B — דורש ברק (דקות–שעות)

| # | משימה | משחרר |
|---|---|---|
| B1 | Auth Monday (+ Notion) ב-Cursor Desktop + שמירת Environment | cortex אקטיבי על CRM |
| B2 | Dropoffs ל-`bee-handoff/2026-06-16/`: Mercantile CSV, IM export, cable PDFs, fault cases | Phase B bank/ledger/wire |
| B3 | Gateway restart + Gmail OAuth (Phase 1 leftovers) | digest cron חי |
| B4 | אישור wiring של AGENT_CANON → Alfred/Hermes startup | אין drift בין מוחות |
| B5 | (אופציונלי) קישור לפרויקט רחפן הישן — ריפו / Claude project / סיכום | סוכן רחפן יכול לבנות |

### מסלול C — Local Claude / מכונת ברק

| # | משימה |
|---|---|
| C1 | Port 53/A Phase A → BEE app (Prisma migrate) |
| C2 | 53/A Phase B על CSV אמיתי אחרי OB-4 |
| C3 | Graphify extract + Obsidian sync אחרי commits |
| C4 | Hermes bridge_port 3000→3100 (collision עם Alfred) |

### אבני דרך שברק ירגיש

| M | תוצאה מורגשת |
|---|---|
| M1 | קבלה מבנק Mercantile נכנסת אוטומטית + ⚡ |
| M2 | מייל ספק → PO + watchlist ⚡ |
| M3 | כרטסת לקוח תואמת Invoice Maven |
| M4 | הצעה: brief → PDF ב-~90 שניות |
| M5 | Spine MVP — לולאה סגורה + סיכום חודשי |
| M6 | Sunday digest על 137 לקוחות |
| M7 | אבחון תקלה לפני נסיעה לאתר |

---

## 5 — חוקים שלא נפתחים מחדש

1. Law #1 — 4 יעדי WA בלבד  
2. Law #2 — אדם מאשר כל שליחה חיצונית  
3. Bank = Mercantile **code 17**  
4. Invoice Maven בלבד · מע״מ חודשי · מקדמות 0% · מספור רציף  
5. `wire_sizing` / `protection_coordination` = Tier-0, **בלי LLM**  
6. אל תמכור יכולת שלא בקוד (ראה BRAIN §4b)

---

## 6 — מפת PRs / ענפים

| PR | Branch | מצב | תוכן |
|---|---|---|---|
| #2 | `claude/capability-extensions-collection-JjV2s` | OPEN | **הקנון** — research המלא |
| #1 | `claude/electron-chat-integration-5VtHN` | DRAFT | master-plan.html |
| #3 | folder-inventory | MERGED | דוח מלאי → main |
| #4 | folder-inventory self-contained | OPEN | docs preview |
| #5 | `cursor/brain-obsidian-bridge-436d` | DRAFT | BRAIN↔Obsidian + tooling gaps |
| #6 | `cursor/setup-dev-environment-7dda` | DRAFT | AGENTS.md |
| #7 | `cursor/max-knowledge-base-634e` | DRAFT | Max onboarding canon |
| *(זה)* | `cursor/bee-ops-command-center-4461` | NEW | Command Center / תוכנית פעולה |

---

## 7 — מה מקס עושה מעכשיו (מצב אקטיבי)

1. **שומר על Command Center** מעודכן בכל סשן.
2. **לא בונה על `main`** — קורא/כותב מול branch הקנון או docs ממוקדים.
3. **מציע צעד הבא קונקרטי** במקום "מה תרצה?" — ברירת מחדל: **A1 (Wave 54 row 8)** אלא אם ברק מפנה לרחפן / dropoffs / auth.
4. **מבקש auth** ל-Monday/Notion כשצריך נתונים חיים — בלי להמציא.
5. **לא מערבב** פרויקט רחפן עם כוורת אלא אם מתבקש במפורש.
6. **מכבד** Law #1/#2 ו-Tier-0 בטיחות בכל הצעה.

---

## 8 — בקשות מיידיות מברק (סדר עדיפות)

1. **Cursor Desktop → Auth:** Monday (P0), Notion (P1 אם בשימוש) → שמור Environment → הפעל מחדש cloud agent.
2. **החלט מסלול הבא:**  
   - **א)** Wave 54 orchestrator (הנדסה) — מומלץ  
   - **ב)** Dropoffs OB-1…5  
   - **ג)** פרויקט רחפן — שלח מקור  
   - **ד)** חיבור Monday חי + morning briefing
3. **(כשנוח)** אישור wiring של AGENT_CANON ל-Alfred/Hermes.

---

*נכתב ע״י מקס (למידת AI ואינטגרציה) אחרי סריקת כל סוכני הענן, PR #2 research, Max KB, CLOUD_CORTEX_TOOLING, MVP plan, ו-skills/MCP הזמינים בסביבה.*
