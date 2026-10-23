# 🔍 Tools Deep Audit — באגים, כפילויות, ו-MCPs להחלפה

**נכתב:** 2026-05-26 02:50 Asia/Jerusalem
**הקשר:** מסמך השלמה ל-[`research/federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md).
**מקור:** 4 חוקרי-משנה מקבילים — Hermes state.db analytics (172MB DB, 1,504 sessions) · alfred-*.js code-level audit (2,862 LOC) · MCP server replacements (12K+ servers in directories) · Israeli MCP/skills ecosystem (skills-il = 182 skills).

---

## 🚨 חמשת התיקונים שאפשר לעשות הלילה

זמן כולל: ~90 דקות. כל אחד מהם — bug אמיתי שמעמיס טוקנים או מסכן את המערכת.

### 1. alfred-router.js — fallback provider הפוך (1 שורה, 3 דק')

[`alfred-router.js:30-40`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/openclaw/AGENTS.md) — הקוד כיום:

```javascript
// Prefer anthropic if billing-OK, fallback to deepseek (per session history)
if (providers.deepseek?.apiKey) return { kind: "deepseek", apiKey: providers.deepseek.apiKey, model: "deepseek-chat" };
if (providers.anthropic?.apiKey) return { kind: "anthropic", apiKey: providers.anthropic.apiKey, model: "claude-sonnet-4-6" };
```

**הבעיה:** ההערה אומרת "Prefer anthropic" אבל הקוד מחזיר DeepSeek קודם. **זה ההסבר למה כל המערכת קרסה ב-22/5 כש-DeepSeek balance נגמר** — Alfred לא ידע ליפול לאנתרופיק כי הקוד אף פעם לא הגיע לשורה הבאה.

**תיקון:** להחליף את הסדר של שני ה-if. ROI מוחלט.

### 2. Hermes `memory` tool — 97.6% error rate (5 דק')

מ-state.db: **80 מ-82 קריאות memory נכשלו** ב-14 ימים עם `"Memory is not available. It may be disabled in config"`. הסוכן ממשיך לקרוא כי ה-system prompt מציע. 80 round-trips מבוזבזים.

**תיקון:** או להפעיל memory plugin (`hermes plugins enable hindsight` למשל) או להסיר את memory tool מה-catalog. **מומלץ הפעלה** — זה מאפשר את ה-RAG העתידי.

### 3. Hermes `web_search` token מת (3 דק')

מ-state.db: **80% error rate (16/20)** עם `"Unauthorized: Failed to search. Unauthorized: Invalid token"`. ה-API key פג תוקף או נחתך. `web_extract` (11/11 OK) עובד — רק חיפוש.

**תיקון:** רוטציה של ה-key במקור (Tavily? Brave? Exa? — תלוי בקונפיג) או הסרה.

### 4. Hermes prompt_caching ל-1h TTL (2 דק')

Anthropic הוריד את ברירת המחדל מ-1h ל-5min ב-2026-03-06. עליית עלות 30-60%. Hermes כיום ב-`cache_ttl: 5m` (config.yaml line 100).

**תיקון:** `cache_ttl: 1h` ב-config.yaml + restart. עלות writes פי 2 אבל reads רק 10% מבסיס — דה-פקטו חיסכון של 50%+ ב-bursty workloads.

### 5. ניקוי 70 skills רדומים מ-system prompt של Hermes (10 דק')

מ-state.db: **70 מתוך 84 skills לא נטענו אפילו פעם אחת ב-14 ימים**. כל אחד מהם תופס מקום ב-system prompt (~6-10K טוקנים בסך הכל לפי החישוב).

הרדומים כוללים: `airtable, arxiv, ascii-art, baoyu-comic, baoyu-infographic, blogwatcher, claude-design, codex, comfyui, design-md, dogfood, dspy, excalidraw, fine-tuning-with-trl, gif-search, github-*, godmode, heartmula, huggingface-hub, humanizer, ideation, jupyter-live-kernel, kanban-worker, linear, llama-cpp, llm-wiki, manim-video, maps, nano-pdf, native-mcp, node-inspect-debugger, notion, ocr-and-documents, opencode, openhue, outlines, p5js, pixel-art, plan, pokemon-player, polymarket, popular-web-designs, powerpoint, pretext, requesting-code-review, rtl-terminal-output, segment-anything-model, sketch, songsee, songwriting-and-ai-music, spike, spotify, systematic-debugging, teams-meeting-pipeline, test-driven-development, touchdesigner-mcp, webhook-subscriptions, weights-and-biases, writing-plans, youtube-content, yuanbao, architecture-diagram, ...`

**תיקון:** `hermes skills disable <name>` (או batch). יש 14 בשימוש פעיל ב-14 ימים. אם רוצים שמרני — להשאיר את ה-top 30. **חיסכון ~6-10K טוקנים פר-קריאה** = ~50M טוקנים חודשי.

---

## 📊 Hermes Real-World Usage (mined from state.db 172MB)

### Top 10 כלים מנוצלים

| כלי | קריאות 14ד | OK | err | err% |
|---|---:|---:|---:|---:|
| **search_files** | 2,949 | 2,940 | 9 | 0.3 |
| **terminal** | 1,419 | 1,413 | 6 | 0.4 |
| **read_file** | 610 | 599 | 11 | 1.8 |
| **session_search** | 454 | 454 | 0 | 0.0 |
| execute_code | 128 | 109 | 19 | **14.8** |
| skill_view | 111 | 110 | 1 | 0.9 |
| **memory** | 82 | 2 | 80 | 🔴 **97.6** |
| write_file | 40 | 40 | 0 | 0.0 |
| todo | 38 | 38 | 0 | 0.0 |
| browser_navigate | 30 | 28 | 2 | 6.7 |
| **web_search** | 20 | 4 | 16 | 🔴 **80.0** |

**4 הראשונים = 91% מהtraffic.** כל אופטימיזציה שם — חיסכון מהותי.

### Top 14 skills מנוצלים (מתוך 84)

```
obsidian (35) · google-workspace (21) · whatsapp-crypt15-extraction (10)
· openclaw-to-hermes-migration (8) · hermes-agent (8) · barak-business-integrations (7)
· regulatory-rss-monitoring (6) · himalaya (4) · barak-activity-reporting (4)
· research-before-proposing, hermes-agent-skill-authoring, kanban-orchestrator,
  subagent-driven-development, autonomous-ai-agents, alfred-platform-upgrade (1 each)
```

רק `obsidian` חוצה את סף ה-20 לזמן של 14 ימים. 70 skills מצוטטים ב-system prompt לחינם.

### פילוח פלטפורמות

| פלטפורמה | sessions | tool calls | input+cache tokens | P50 tokens/session | הערה |
|---|---:|---:|---:|---:|---|
| **cron** | 1,316 | 5,544 | 79.2M | 28K | 99% מ-sessions — אבל 640 (49%) ZERO tool calls (no-op) |
| **whatsapp** | 7 | 197 | 12.5M | **995K** | רק 7 sessions — אבל כבדות מאוד (P95 = 3.4M) |
| **cli** | 6 | 213 | 6.1M | **473K** | רק 6 — אבל P95 = 1.2M |

### גילוי הריגה: 3 ימים שקטים

ב-2026-05-19/20/21: 461 cron sessions, **0 tokens, 0 tool calls**. ה-LLM endpoint היה לא-מאומת או down — והcron לא הבחין/התריע. **חוסר אזהרה זה הסיכון הגדול ביותר היום** — אפילו מי שמחיים את גמל המערכת, יכול לרוץ 3 ימים ולא לדעת שהוא מת.

---

## 🐛 10 באגי alfred-*.js עם קואורדינטות

מ-2,862 LOC שנקראו על-ידי agent code-auditor:

| # | קובץ:שורה | חומרה | מה הבעיה | תיקון |
|---|---|---|---|---|
| 1 | `alfred-router.js:37-39` | 🔴 קריטי | fallback provider הפוך (DeepSeek לפני Anthropic) | החלפת סדר |
| 2 | `alfred-clarify.js:392-393` | 🟠 גבוה | `+03:00` hardcoded ב-`quietEndIso()` — נשבר בכל מעבר שעון Mar/Oct | `Intl.DateTimeFormat` עם Asia/Jerusalem |
| 3 | `alfred-customer360.js:99` | 🟠 גבוה | `WHERE id IN (SELECT id FROM WarrantyRecord LIMIT 0)` — placeholder תמיד מחזיר 0 שורות | הסרה או tabling |
| 4 | `alfred-enrich.js:85` + `alfred-customer-intelligence.js:83` + `alfred-knowledge.js:114` | 🔴 SQL injection | SQL string interpolation עם backtick ל-IDs | parameterized queries (`?` ב-better-sqlite3) |
| 5 | `alfred-customer-intelligence.js:281-310` | 🟡 ביצועים | `scoreAll()` פותח/סוגר BEE DB פר-לקוח — O(n) opens | פתיחה פעם אחת |
| 6 | `alfred-customer360.js:240-262` | 🟡 ביצועים | 3 קריאות calendar.js רציפות (3×15s = 45s) | `Promise.all()` — 15s |
| 7 | `alfred-router.js:45-66` + `alfred-clarify.js:120-147` | 🟡 ביצועים | task-examples.md + knowledge graph נקראים מחדש בכל classify | in-memory cache עם invalidation |
| 8 | `alfred-clarify.js:63` + `alfred-identity.js:39` + `alfred-customer-intelligence.js:49` | 🟢 ארכיטקטורה | `SELF_PHONE = '+972509554483'` ב-3 מקומות | export מ-`alfred-identity.js` |
| 9 | `alfred-knowledge.js:81` | 🟠 לוגיקה | `text.replace(/[^\d]/g, "")` — מסיר אותיות עברית, נכשל ב-mixed text | regex עברית-aware |
| 10 | `alfred-mcp-gateway.js` (כל הקובץ) | 🟡 skeleton | אין tests, אין connections מוגדרים, no retry | להחליט: או להשלים (Composio) או למחוק (מועדף — MCP direct) |

**שני דפוסי-עומק:**
- **3 קבצים מממשים מחדש env file parser** במקום לייבא — `alfred-identity.js:55-62` ו-`alfred-customer360.js:52-60`
- **חסרות ספריות:** אין `dotenv` / `zod` / `winston` — Logs ל-`console.error`, parsing JSON ללא validation. כשהקוד צומח אלה הופכים לבאגים נסתרים.

---

## 🔌 MCP Replacement Matrix — מה להחליף, מה לשמור

### Tier 1 — להתקין עכשיו (high ROI, אורח-חיים יציב)

| במקום הסקריפט | להתקין MCP | פקודה | רווח |
|---|---|---|---|
| `alfred-monday.js` + `alfred-monday-deep.js` + `alfred-monday-digest.js` | **`@mondaydotcomorg/monday-api-mcp`** רשמי | `npx @mondaydotcomorg/monday-api-mcp -t <TOKEN>` | 3 קבצים → 1 שרת רשמי. שני הסוכנים נהנים ביחד. |
| `alfred-calendar.js` + `alfred-gmail.js` | **`taylorwilsdon/google_workspace_mcp`** | `pip install google-workspace-mcp` + OAuth | calendar+gmail+drive בגייטוויי אחד |
| `browser_tool` + `browser_camofox` + `browserbase` ב-Hermes | **`@playwright/mcp`** (Microsoft) | `npx @playwright/mcp@latest` | accessibility-tree snapshots = 4x פחות טוקנים מ-full HTML |
| `file_operations` ב-Hermes | **`@modelcontextprotocol/server-filesystem`** | `npm i -g @modelcontextprotocol/server-filesystem` | Anthropic-maintained, פחות maintenance |
| `alfred-bee.js` (SQLite read-only) | **`@modelcontextprotocol/server-sqlite`** | `npm i -g @modelcontextprotocol/server-sqlite` | Same as above |

### Tier 2 — אופציונלי (תועלת ברורה אבל לא דחוף)

| במקום | MCP | רווח | חסרון |
|---|---|---|---|
| `alfred-gov-rss.js` | `veithly/rss-mcp` | generic RSS, פחות תחזוקה | Cloudflare blocking נשאר אותו דבר |
| `alfred-weather.js` | `gbrigandi/mcp-server-openmeteo` | אותה API + workflow tools | אבד את הלוגיקה הספציפית של "scan-events" |
| `alfred-tracer.js` | — | אין MCP — Tracer = closed API | להישאר על הסקריפט הקיים |
| `alfred-solaredge.js` | לבנות `bee-solaredge-mcp` ב-`E:\bee-mcp-servers\` | יצרוך גם Hermes גם Alfred | זמן פיתוח 4-6h |

### Tier 3 — לא להחליף (custom logic = לא מתאים ל-MCP)

`alfred-knowledge.js`, `alfred-customer360.js`, `alfred-customer-intelligence.js`, `alfred-handle.js`, `alfred-router.js`, `alfred-clarify.js`, `alfred-enrich.js`, `alfred-compose.js`, `alfred-identity.js` — אלה ה-orchestration brain. **לא רוצים שיהיו MCP**. נשארים ב-OpenClaw.

### האלטרנטיבה לכל ה-Hermes browser tools

Microsoft ממליצים על **Playwright CLI** במקום MCP — חוסכים 4x טוקנים. אבל ה-MCP הוא standardized — שווה את ה-tradeoff.

---

## 🚫 5 MCPs ש**אסור** להתקין

מתועדים security incidents — כולם אמיתיים מ-2025-2026:

| MCP | מה הסיפור | מקור |
|---|---|---|
| **`postmark-mcp`** | **MALWARE** — v1.0.16 הוסיף BCC לכל המיילים אל `phan@giftshop.club`. ~300 ארגונים נחשפו לפני disclosure | [Koi Security, Sept 2025](https://www.sqlservercentral.com/editorials/lessons-from-the-postmark-mcp-backdoor) |
| **`@modelcontextprotocol/server-puppeteer`** | **deprecated officially** — צוות MCP מפנה ל-Playwright | npm registry deprecation note |
| **Cloned Oura MCP (SmartLoader)** | trojanized clone → StealC infostealer | Public registries — verify provenance |
| **`whatsapp-mcp` unsigned variants** | Tool-poisoning attack → exfiltration של כל ה-WhatsApp history. **רלוונטי לך כי יש לך Hermes WA bridge** | [Invariant Labs PoC](https://thehackernews.com/2026/04/anthropic-mcp-design-vulnerability.html) |
| **Generic shell/terminal MCPs** | 53% משתמשים ב-static API keys לא-מאובטחים; 82% path traversal vulns | [OWASP MCP05:2025](https://owasp.org/www-project-mcp-top-10/2025/MCP05-2025–Command-Injection&Execution) |

**Red flags כלליים:** אין releases ב-6+ חודשים אחרונים, npm לא חתום, שמות זהים ל-MCPs מוכרים (typosquatting), אין maintainer email מאומת.

---

## 🇮🇱 רשימת התקנה למערכת ישראלית (20 פריטים)

מבוסס על agent web research של `skills-il` (= **YooTech**, agentskills.co.il) ו-`danielrosehill/Israeli-AI-Agents-And-MCPs`. סך הכל **182 skills מ-skills-il + 59 MCPs מ-danielrosehill**, MIT, security-vetted.

### Tier 1 — חיוני לעבודה היומיומית של B.E.E (6)

1. **`il-bank-mcp`** (glekner) — Mercantile + שאר בנקים, מבוסס `israeli-bank-scrapers v6.7.4` Puppeteer · [link](https://github.com/glekner/il-bank-mcp)
2. **`GuyKh/ims-mcp`** — תחזית IMS למיני מערכת סולארית · [link](https://github.com/GuyKh/ims-mcp)
3. **`yaniv-golan/pikud-haoref-alerts`** — Claude Code plugin עם התראות פיקוד העורף — קריטי לבטיחות עובדים בשטח · [link](https://github.com/yaniv-golan/pikud-haoref-alerts)
4. **`reuvenaor/israel-statistics-mcp`** — נתוני CBS למחקר שוק · [link](https://github.com/reuvenaor/israel-statistics-mcp)
5. **`DavidOsherDevDev/data-gov-il-mcp`** — Open Data גוב.יל (החזוק ביותר מתוך 3 גרסאות) · [link](https://github.com/DavidOsherDevDev/data-gov-il-mcp)
6. **`Ansvar-Systems/israel-law-mcp`** — 66 חוקים + 537 סעיפים · [link](https://github.com/Ansvar-Systems/israel-law-mcp)

### Tier 2 — Skills bundles מ-skills-il (להתקין כ-Claude Code plugin)

7. **`skills-il/localization`** (14 skills) — `hebrew-content-writer`, `hebrew-rtl-best-practices`, `hebrew-tailwind-preset`, `israeli-accessibility-compliance`, `shabbat-aware-scheduler`, ועוד · [link](https://github.com/skills-il/localization)
8. **`skills-il/tax-and-finance`** (19 skills) — `israeli-vat-reporting`, `israeli-payroll-calculator`, `israeli-client-payment-chaser`, `cardcom-payment-gateway`, `tase-stock-analysis` · [link](https://github.com/skills-il/tax-and-finance)
9. **`skills-il/government-services`** (34 skills) — `israeli-bituach-leumi`, `israeli-company-lookup`, `israeli-land-tenders`, `israeli-gov-form-automator` · [link](https://github.com/skills-il/government-services)
10. **`skills-il/communication`** — SMS/Email channels ישראליים (לקוחות) · [link](https://github.com/skills-il/communication)

### Tier 3 — Skills ספציפיים (5)

11. **`lirantal/skill-railil`** — Israel Railways API (תיאום נסיעות צוות) · [link](https://github.com/lirantal/skill-railil)
12. **`alexpolonsky/agent-skill-ontopo`** — הזמנת מסעדות ללקוחות · [link](https://github.com/alexpolonsky/agent-skill-ontopo)
13. **`avivshafir/israeli-corporate-law-skill`** — דיני חברות (חוזי קבלן) · [link](https://github.com/avivshafir/israeli-corporate-law-skill)
14. **`barvhaim/remy-mcp`** — מכרזי רשות מקרקעי ישראל — רלוונטי להצעות סולאריות · [link](https://github.com/barvhaim/remy-mcp)
15. **`hebcal/hebcal-mcp`** — לוח עברי + חגים (SSE hosted ב-`hebcal.com/mcp`) · [link](https://github.com/hebcal/hebcal-mcp)

### Tier 4 — Anthropic official skills (5 רלוונטיים)

Barak כבר משתמש ב-`anthropic-skills:bee-brand` ו-`anthropic-skills:client-ledger`. להוסיף:

16. **`anthropic-skills/docx`** — לחשבוניות/הצעות word
17. **`anthropic-skills/pdf`** — לתעודות ומסמכים
18. **`anthropic-skills/xlsx`** — לדוחות מ-Monday/BEE
19. **`anthropic-skills/mcp-builder`** — לבנות **`bee-invoice-maven-mcp`** ב-עצמך (Invoice Maven אין MCP)
20. **`anthropic-skills/skill-creator`** — לבנות **`bee-solaredge-mcp`** ו-**`bee-sungrow-mcp`**

### Custom-build candidates (אין MCP — לכתוב בעצמנו)

| MCP חסר | סיבה | מאמץ משוער |
|---|---|---|
| `bee-invoice-maven-mcp` | אין docs ציבוריים — לבקש מ-Invoice Maven או לעבוד עם REST שלהם | 1-2 ימים |
| `bee-solaredge-mcp` | אין רשמי. עוטף `EVWorth/solaredge` Python | 1 יום |
| `bee-sungrow-mcp` | אין רשמי. עוטף `developer-api.isolarcloud.com` | 1 יום |
| `bee-deye-mcp` | רק Modbus — דורש מודוס ל-Tailscale ל-ESS | 2-3 ימים |
| `bee-tracer-mcp` | API סגור — דורש קשר עם ספק | unknown |
| **`il-iec-mcp`** | חברת חשמל אין API. החזק ביותר — לפנות לרשות החשמל לעדכון | אסטרטגי |

---

## 🪲 חסרי MCP ב-Israeli ecosystem — gap analysis

לפי research של agent 18, אין MCP ל:
- **מס הכנסה** (Mas Hachnasa)
- **ביטוח לאומי** (Bituach Leumi)
- **רשם החברות** (ICA)
- **בתי משפט / פסקדין**
- **Hebrew NLP morphology**
- **רשות החשמל / נגה / חברת חשמל**

זה מקום שב-2026 יש בו vacuum. אם Barak רוצה להיות מומחה — לבנות 1-2 מהם (להפצה דרך skills-il).

---

## 🧪 Hebrew NLP Stack 2026 — SOTA

לפני שמתחילים RAG על 879K הודעות (Wave 3 ב-federation-plan):

| מודל | תפקיד | מה זה |
|---|---|---|
| **DictaLM 2.0** | Generation עברי | Mistral-7B fine-tuned, 200B tokens, SOTA Hebrew generation |
| **DictaBERT** | Embeddings / NER | מנצח AlephBERT ברוב ה-benchmarks |
| **AlephBERTGimmel** | Tokenizer | 128K vocab Hebrew BERT — לטיפול ב-RTL |
| **HeRo** | Sentiment / NER / QA | RoBERTa-based, SOTA |
| **multilingual-e5-large** | Cross-lingual embeddings | אם רוצים שגם אנגלית/עברית באותו vector space |

**להמלצה ל-RAG (Wave 3):** Qdrant + DictaBERT (Hebrew-only) ו-multilingual-e5-large (multi). `israeli-bank-scrapers` שכבר משתמשים בו ב-banking MCPs רוב הסיכויים שאינו מעורב — זה רק לדאטא בנקאית.

---

## 🧭 שינויים בתוכנית הראשית (`federation-plan.md`)

הממצאים החדשים משנים סדר עדיפויות. הצעת עדכון:

### Wave -1 — Bug Squash Friday (יום-יומיים, ~6h)
**לפני Wave 0** של federation. Quick wins חיוניים:

- ⬛ תקן router fallback (3 דק', massive impact)
- ⬛ הסר/הפעל memory tool ב-Hermes (5 דק')
- ⬛ רוטציה של web_search token (3 דק')
- ⬛ cache_ttl 5m → 1h ב-Hermes (2 דק')
- ⬛ Disable 70 dormant skills ב-Hermes (10 דק')
- ⬛ Fix DST hardcode ב-alfred-clarify.js (15 דק')
- ⬛ Remove warranty placeholder ב-alfred-customer360.js (5 דק')
- ⬛ Add heartbeat ל-`cron_complete with 0 tokens` בHermes (1h — מסר alerting קריטי)
- ⬛ SQL injection fix ב-3 קבצי Alfred (20 דק')
- ⬛ Parallelize calendar fetches ב-alfred-customer360.js (10 דק')
- ⬛ DRY: SELF_PHONE לקובץ אחד (15 דק')
- ⬛ Cache few-shot examples (in-memory) (30 דק')

### Wave 2 — MCP Foundation — דוחקה לפני Wave 1 dedup
היררכיה חדשה לאחר Wave -1:
- **Wave 0:** משברים מיידים (כפי שבfederation-plan)
- **Wave 1:** התקנת **Tier 1 MCPs ראשונים** (`@mondaydotcomorg/monday-api-mcp`, `taylorwilsdon/google_workspace_mcp`, filesystem, playwright, sqlite) — לפני שמרחיבים — להיות בטוחים שזה עובד
- **Wave 2:** Single source of truth (Baileys dedup)
- **Wave 3:** Israeli MCPs Tier 1 + skills-il bundles
- **Wave 4:** Build custom MCPs ל-SolarEdge / Sungrow / Invoice Maven

---

## 📋 7 הכרעות חדשות שמחייבות אישור

| # | שאלה | אופציות | המלצה |
|---|---|---|---|
| Q8 | **Memory backend ל-Hermes** — איזה plugin? | hindsight / mem0 / honcho / supermemory / file-based בלבד | **hindsight** — knowledge graph, מתאים לentity resolution של לקוחות/אתרים |
| Q9 | **web_search backend** — איזה ספק? | Brave / Tavily / Exa / DuckDuckGo / Searxng | **Brave** או **Exa** (תלוי בreloud-friendly) — Tavily אם רוצים semantic |
| Q10 | **70 dormant skills — האם להסיר או רק disable?** | hard remove / disable-only (לעתיד) | **disable-only** — מאפשר חזרה. חיסכון בtoken זהה. |
| Q11 | **invoice maven MCP — לבנות?** | (a) לבנות עם anthropic mcp-builder; (b) לעבור ל-Green Invoice (יש MCP); (c) להשאיר ידני | (a) — לשמור על Invoice Maven (חוקתי); MCP-builder skill כבר זמין. 1-2 ימים. |
| Q12 | **Israeli skills bundles** — להתקין הכל בבת אחת או בהדרגה? | (a) הכל; (b) רק tier 1; (c) רק skills שצריך כעת | (b) — Tier 1 + skills-il/localization. השאר לפי דרישה. |
| Q13 | **WhatsApp MCP standalone** — להתקין כתחליף ל-Hermes bridge? | (a) כן ל-lharries; (b) לא — נשאר ב-Hermes; (c) לבדוק `ftaricano` (יש circuit breaker) | (b) — Hermes bridge עובד; דדיקציה ל-1 transport. |
| Q14 | **silent outage alert (3-day-no-tokens)** — איפה לבנות? | Hermes cron / Alfred dashboard / external watcher | **Hermes cron בריא** — כותב heartbeat row לDB; Alfred dashboard מציג |

---

## 🔗 קישורים שכבר נדחפו

- **תוכנית ראשית:** [research/federation-plan.md](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md)
- **המסמך הזה:** [research/tools-deep-audit.md](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md)
- **סנאפשוט המצב:** [research/local-state/](https://github.com/Barak-B/bee-assets/tree/claude/capability-extensions-collection-JjV2s/research/local-state)
- **HTML של אלפרד:** [alfred-overview.html](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/openclaw/alfred-overview.html)
- **HTML של Hermes:** [hermes-overview.html](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/hermes/hermes-overview.html)
- **HTML של שיתוף הפעולה:** [hermes-alfred-cooperation.html](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/local-state/hermes/hermes-alfred-cooperation.html)

---

## 🧠 Source citations

Findings מקור:
- **Hermes state.db analytics:** ניתוח שאילתות SQL ישיר ב-172MB DB, 1,504 sessions, 17,158 messages
- **alfred-*.js code audit:** קריאה מלאה של 10 קבצים — 2,862 LOC
- **MCP server alternatives:** Glama (22,775), mcp.so (20,222), modelcontextprotocol/servers, awesome-mcp-servers (87.8K stars), Microsoft playwright-mcp, mondaydotcomorg/monday-api-mcp
- **Israeli ecosystem:** danielrosehill/Israeli-AI-Agents-And-MCPs (59 MCPs + 16 skills), skills-il GitHub org (182 skills, 12 bundles)
- **Security warnings:** Koi Security (postmark backdoor Sept 2025), Invariant Labs (WhatsApp MCP exfil), OWASP MCP Top 10 2025, The Hacker News (Anthropic RCE design vuln April 2026)
- **Hebrew NLP:** DictaLM 2.0 (Mistral-7B FT, 200B tokens), DictaBERT, AlephBERTGimmel, HeRo
- **MCP transports:** Streamable HTTP standard (replaced SSE 2025-03-26, refined 2025-11-25)
- **Smithery, Composio, Glama, MintMCP** — managed MCP hosts assessed

---

*המסמך הזה הוא ה-deep audit שביקשת — מאתר באגים ספציפיים, מציע MCP replacements, ומאיר את המקומות שבהם המערכת בזבזה טוקנים בלי לדעת. כל תיקון כאן ניתן ליישום עצמאי בלי לפרק את התוכנית הכוללת. ממליץ להתחיל מ-Wave -1 (Bug Squash) — 6 שעות עבודה, חיסכון משמעותי + יציבות חדשה.*
