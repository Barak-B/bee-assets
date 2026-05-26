# 🤝 Session Handoff — Federation Research Round 2

**תאריך מקור:** 2026-05-26 03:30 Asia/Jerusalem
**ל-מי:** הסשן הבא (מקומי או ענני) שימשיך לחקור ולשפר
**מה ביקש המשתמש:** "תוציא לי סיכום לכל הסשן שלנו ותן לאותו סשן לאתר עוד כלים ולשפר עוד את התוכנית"

---

## 🎯 משימה: פדרציה אופטימלית בין OpenClaw (Alfred) ל-Hermes Agent

ברק רוצה לסיים את ה-migration שהתחיל בין שתי המערכות. המטרה:
- **לבטל כפילויות** (היום: 2 Baileys על אותו מספר, 2 cron schedulers, firecrawl כפול, gov-rss כפול)
- **חלוקת עבודה הגיונית** — כל אחד עושה את מה שהוא טוב בו
- **לפתוח יכולות חדשות** שלא היו אפשריות (RAG, voice e2e, reactions surface, multi-channel)

---

## 📦 4 מסמכים שהופקו ב-session — קישורי GitHub

ה-repo: [`Barak-B/bee-assets`](https://github.com/Barak-B/bee-assets) · ה-branch: `claude/capability-extensions-collection-JjV2s`

| מסמך | תיאור | שורות |
|---|---|---|
| [`research/local-state/`](https://github.com/Barak-B/bee-assets/tree/claude/capability-extensions-collection-JjV2s/research/local-state) | סנאפשוט המצב החי (config, plugins, skills, cron, AGENTS.md, HTML overviews) | 7,500+ |
| [`research/federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md) | תוכנית פדרציה — 3-layer architecture, 55-capability decision matrix, Waves 0-5 | 458 |
| [`research/tools-deep-audit.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md) | באגים קונקרטיים + MCP replacement matrix + Israeli ecosystem 20-item install list | 321 |
| [`research/agent-architecture.html`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/agent-architecture.html) | HTML ויזואלי: 6 שכבות, 20 אינטגרציות עם progress bars, 12 יעדים | 1,134 |
| [`research/agent-io-flow.html`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/agent-io-flow.html) | HTML ויזואלי: 11 inputs × 13 task types × 10 outputs + 10 end-to-end דוגמאות | 1,177 |

---

## 🔬 מה כבר נחקר ב-session הזה (10 sub-agents מקבילים)

### Round 1 — Federation foundation
1. **Hermes deep inventory** — 85 Python tools categorized (browser, code_execution, terminal, vision, memory, mcp, delegate, kanban, MoA, voice, etc.); 8 memory plugin backends on disk (hindsight/mem0/honcho/holographic/supermemory/byterover/retaindb/openviking); 19 gateway platforms; 84 skills (14 in use)
2. **OpenClaw deep inventory** — 96 bundled extensions (50 LLM providers, 7 messaging, 7 voice/audio, 6 image/video, 7 web/search, 3 memory, 7 infra, 1 doc, 4 code/tools, 4 specialty); 12 workspace skills; 32 alfred-*.js scripts; 17 dashboard routes; AGENTS.md (52KB, 8 foundational rules + 4 outbound destinations)
3. **SOTA web research May 2026** — Hermes v0.14.0 (May 16) with OAuth proxy! Monday.com official MCP, Anthropic prompt-cache TTL 5min→1h default change, `hermes claw migrate` command exists, Microsoft Agent Framework 1.0 GA April 2026, OpenClaw v2026.5.22 (gateway 5ms startup)

### Round 2 — Tools deep audit
4. **state.db analytics (172MB DB)** — 1,504 sessions, 17,158 messages; top 4 tools = 91% of all calls (search_files/terminal/read_file/session_search); `memory` tool 97.6% error rate; `web_search` 80% error; 70/84 skills dormant; 3-day silent outage May 19-21 (461 cron, 0 tokens)
5. **MCP server alternatives** — 22,775 MCPs in Glama directory · 5 official Tier-1 to install (Monday/Google Workspace/Filesystem/Playwright/SQLite) · 5 to AVOID (postmark-mcp backdoor 300 orgs compromised Sept 2025, unsigned whatsapp-mcp exfil PoC, OWASP MCP05 shell injection)
6. **alfred-*.js code audit (2,862 LOC)** — 10 critical bugs found with file:line: router fallback INVERTED (prefers DeepSeek over Anthropic — explains DeepSeek-402 cascade), DST hardcoded +03:00, 3 SQL injection sites, placeholder warranty query, O(n) DB opens, sequential calendar fetches (45s → 15s)
7. **Israeli MCP ecosystem** — `skills-il` (YooTech / agentskills.co.il) = 182 skills MIT in 12 bundles · `danielrosehill/Israeli-AI` = 59 MCPs + 16 skills · Israeli bank scrapers v6.7.4 underneath all banking MCPs · israel-law-mcp (66 statutes) · IMS weather · Pikud Haoref alerts · BudgetKey · Hebcal · Sefaria

### Round 3 — Visual synthesis
8. **OpenClaw extensions deep** (partial, agent self-stopped at 41/96 due to internal hallucination — still got categorization)
9. **Hermes capabilities internals deep** — exact API signatures of Mixture-of-Agents (4× cost ~$75/1M, OpenRouter required, max 1 successful reference, 6 retry attempts), Code Execution Sandbox (UDS/file/TCP transport per OS, blocks recursive delegate/clarify/memory/send_message), Kanban (7 verbs, DB schema, env-var worker dispatch), Delegate (max 3 children, depth 2 default cap 3, blocks recursion), Memory (§ delimiter, 2200/1375 char limits, frozen at session start for prefix cache stability), Skills Hub (3 trust tiers, GitHub auth chain)
10. **Future-needs Q3-Q4 2026** — DictaLM 3.0 (1.7B/12B/24B, tool calling native, 65K ctx, Dec 2025) · BGE-M3 embeddings (Hebrew + dense+sparse+ColBERT in one) · Qdrant or LanceDB for vector DB · openWakeWord for custom "Alfred" word · Groq Whisper-large-v3-turbo ($0.04/hr unbeatable) · ElevenLabs+Piper TTS combo · vLLM Semantic Router v0.1 Iris (Jan 2026) · Langfuse Cloud · AgentGateway v1.0 (March 2026 Linux Foundation) · Gemini 2.5 Pro for Hebrew OCR · Hindsight memory (91.4% LongMemEval) · Neo4j (⚠️ **Kuzu DEPRECATED 2026**) · n8n self-hosted with MCP Trigger node · Tirith + Docker + gVisor for security (⚠️ **Anthropic refused to patch MCP RCE in April 2026 — DIY sandboxing required**)

---

## 🎲 14 הכרעות שניתנו על-ידי המשתמש

| # | שאלה | תשובה |
|---|---|---|
| Q1 | DeepSeek 402 | טעינת balance + להישאר ברירת מחדל |
| Q2 | אילו MCPs לגל הראשון | Tier 1 + Tier 2 Israeli (skills-il bundles) במכה |
| Q3 | active-memory plugin | להפעיל עכשיו |
| Q4 | Telegram channel | לדחות |
| Q5 | alfred-mcp-gateway.js | להשלים עם Composio (850-1000 integrations) |
| Q6 | memory location | שניהם ב-sync — Alfred master, Hermes mirror |
| Q7 | שדרוג OpenClaw ל-2026.5.22 | לבדוק אם כבר שודרג; אם לא — לשדרג |
| Q8 | Hermes memory backend | (open-ended) → hindsight knowledge graph (auto-categorize by entity) |
| Q9 | web_search backend | Tavily (semantic) |
| Q10 | 70 dormant Hermes skills | Disable-only (הפיך מהר) |
| Q11 | Invoice Maven MCP | לבנות עם anthropic-skills:mcp-builder (1-2 ימים) |
| Q12 | active-memory timeout | 3 שניות + 500 טוקנים max |
| Q13 | WhatsApp MCP standalone | ftaricano/mcp-whatsapp (production-ready, circuit breaker) |
| Q14 | התראה לא-tokens | (No preference — המלצה הייתה Hermes cron heartbeat row) |

---

## 🚨 7 ממצאי-עומק שמשנים את התוכנית

1. **`alfred-router.js:37-39` — fallback מקודד הפוך.** ההערה אומרת "Prefer anthropic" אבל הקוד מחזיר DeepSeek קודם. זה ההסבר למה הכל קרס ב-22/5 כש-DeepSeek balance נגמר. **תיקון 3 דקות** עם השפעה אסטרטגית.

2. **Hermes `memory` tool 97.6% err** — 80 מ-82 קריאות ב-14 ימים נכשלו עם "Memory is not available". הסוכן ממשיך לקרוא כי ה-system prompt מציע. **80 round-trips מבוזבזים**.

3. **70 מ-84 Hermes skills רדומים** — לא נטענו אפילו פעם ב-14 ימים. תופסים ~6-10K טוקנים ב-system prompt בכל קריאה. **חיסכון ~50M טוקנים חודשי** מ-disable batch.

4. **3-day silent outage 19-21/5** — 461 cron sessions עם 0 tokens. ה-LLM endpoint היה down ואין alert. **המסוכן ביותר — אפילו אחרי שמרימים שוב, יכול להישבר 3 ימים בלי שמישהו ידע**.

5. **`skills-il` ecosystem גילוי גדול** — 182 skills MIT של YooTech (agentskills.co.il) כולל israeli-vat-reporting, israeli-payroll-calculator, israeli-bituach-leumi, israeli-company-lookup, hebrew-rtl-best-practices, shabbat-aware-scheduler, cardcom-payment-gateway, ועוד 175. צריך פשוט להתקין bundles.

6. **Hermes v0.14.0 שוחרר 16/5 עם OAuth proxy** — `hermes auth claude` מתחבר ל-Claude Pro/Max OAuth שלך, **בלי API key, בלי balance**. גם פותר את DeepSeek 402 וגם נותן גישה ל-Claude Opus + Sonnet מ-Hermes ישירות. **שדרוג קריטי**.

7. **Anthropic סירב לפתור באג RCE ב-MCP STDIO (April 2026 OX Security)** — 150M+ downloads, 7K servers, 200K vulnerable instances. **Tirith + Docker + gVisor חובה לפני התקנת MCPs רבים**.

---

## 📐 ארכיטקטורת הפדרציה (3 שכבות)

```
            WhatsApp (one phone, one device slot)
                          │
                          ▼
        Layer 1 — TRANSPORT (Hermes Bridge, port 3000)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
   Layer 2 — PERSONA              Layer 3 — BRAIN
   Alfred (OpenClaw)              Hermes 0.14
   • AGENTS.md (52KB)             • 85 tools (browser/code/MoA/...)
   • 32 alfred-*.js               • 84 skills (hub-installable)
   • 16 cron jobs                 • 8 memory plugins (hindsight chosen)
   • 17 dashboard routes          • Kanban + delegate
   • 12 workspace skills          • OAuth proxy → Claude Pro
   ◄─────────── MCP bus ───────────►
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Monday MCP       Google MCP        Israeli MCPs (×20)
   (official)       (workspace)       (banks, gov, law, hebcal)
```

**עקרונות:**
- כל פלט WhatsApp עובר דרך Alfred (sendPolicy constitutional)
- Tools heavy-state נשארים אצל בעל-state (Calendar→Alfred, MoA→Hermes)
- Memory מפוצל לפי טווח (יומי human-readable→Alfred, semantic→Hermes)
- MCP bus משותף — שניהם רואים את אותם external services

---

## 📅 7 גלים מתוכננים — סטטוס

| Wave | תוכן | זמן משוער | סטטוס |
|---|---|---|---|
| **-1** Bug Squash | 13 תיקונים קונקרטיים (router fallback, memory tool, web_search, 70 skills, DST, SQL injections, parallel calendar fetches) | ~6h | מוכן להתחיל |
| **0** Crisis Resolution | DeepSeek top-up, OpenClaw 2026.5.22 שדרוג (אם בטוח), Hermes 0.14 update, heartbeat alert ל-0-tokens-24h | ~3h | מוכן |
| **1** Single Source of Truth | השבת Alfred Baileys, 11 cron payloads → POST :3000/send, inbound watcher, dedup firecrawl/gov-rss | ~4-8h | מוכן |
| **2** MCP Foundation | mcp serve משני הצדדים, Composio (Q5), Tier 1 MCPs (Monday/Google/Filesystem/Playwright/SQLite), Tier 2 Israeli (skills-il bundles) | ~8h | מוכן |
| **3** Capability Splits | hindsight memory plugin, RAG על 879K הודעות (Qdrant+BGE-M3), voice end-to-end action loop, reactions surface, Israeli MCPs activation | ~12h | מוכן |
| **4** Platform Expansion + Observability | bee-solaredge-mcp + bee-sungrow-mcp + bee-invoice-maven-mcp custom build, Langfuse+AgentGateway, inverter alarm triage e2e, ftaricano whatsapp-mcp (Q13) | ~16h | מוכן |
| **5** Voice-First + Continuous | openWakeWord "Alfred", DictaLM 3.0 local routing, Telegram (Q4 דחה), weekly insights→GPT→tune, self-improving cron אקטיב | ongoing | מוכן |

**סך הכל ~50h עבודה לפדרציה מלאה.**

---

## 🔬 שטחי מחקר נוספים שעוד לא נחקרו לעומק

הסשן הזה כיסה הרבה. אבל יש gaps. הסשן הבא יכול להעמיק על:

### A. Hardware + Site Integration
1. **bee-frigate cameras (8-ch Dahua)** — איך לחבר vision events לסוכן? motion → image → Gemini Vision → site update? wiring להמתנה.
2. **Sungrow Modbus direct** — `developer-api.isolarcloud.com` REST API דרך Tailscale? איזה ערך מעבר ל-BEE backend?
3. **Deye Modbus** — דורש Tailscale ל-ESS device. מה הproject שווה ל-Barak מבחינה עסקית?
4. **Tracer GPS reverse-engine** — closed system. אופציות: contact ספק, mitmproxy capture של mobile app, scrape web portal?
5. **bee-ai-1 (Hostinger VPS, Ollama+OpenWebUI)** — איך זה משתלב ב-routing מקומי-ענני? איזה models צריך להפעיל? עברית ?

### B. בעיות קונקרטיות שנשארות
6. **gov.il Cloudflare block** — alfred-gov-rss.js נחסם. אופציות: Wayback Machine fallback (כבר?), browserbase cloud scrape, residential proxy?
7. **SolarEdge 403** — דחוף לסבב מפתח. האם יש דרך לאוטומציה של renewal?
8. **memory/&lt;date&gt;.md write loop** — איזה cron אחראי? למה הפסיק 17/5? צריך לאתר במקור.
9. **BEE Electron HTTP API design** — היום snapshot read-only. איך לתכנן API למכתב? endpoints? auth?

### C. כלים שטרם נחקרו לעומק
10. **Composio integration אמת** — איך באמת לחבר alfred-mcp-gateway.js? איזה apps Barak צריך באמת? cardcom (payments) + WhatsApp Cloud API + Telegram + Slack?
11. **n8n self-hosted** — האם להציב על bee-prod-1? איזה workflows? MCP Trigger node integration practical example?
12. **AgentGateway v1.0** — איך עובד באמת? Helicone alternative? איך integrate עם Hermes ו-Alfred ביחד?
13. **Hindsight setup details** — האם cloud-only? איך synch עם Alfred file-based memory? data residency Israel?
14. **vLLM Semantic Router** — איך באמת מציבים? local Mac/Linux? Windows host friendly?

### D. Domain-specific Israeli gaps
15. **חברת חשמל (IEC)** — אין API. האם יש contact? open data initiative?
16. **רשות החשמל (PUA)** — חוזרי תעריפים PDF scraping. monthly publication patterns.
17. **בודק חשמלאי registry** — האם יש מקור נתונים פתוח? לעקוב אחרי רישיון תוקף.
18. **מס הכנסה automation** — דיווח 102 + 137 לעצמאים. tax-and-finance skill קיים אבל לא קצוץ.
19. **ביטוח לאומי דיווחים** — דיווח חודשי לעצמאים. skills-il/government-services יש skill אבל לא MCP.
20. **Cardcom payment links** — Israeli payment processor. integration לקבלות אוטומטיות.

### E. RAG וזיכרון לטווח-ארוך
21. **879K WhatsApp messages** — איך לבנות RAG production-ready? schema, ingestion pipeline, index strategy. Hebrew tokenization edge cases (vowel marks, finals).
22. **DictaBERT integration** — איך לייצר embeddings? batch או streaming? GPU? Apple Silicon MLX?
23. **Hebrew entity resolution** — שמות, מקומות, חברות. AlephBERT vs DictaBERT vs custom fine-tune?
24. **Knowledge graph על BEE entities** — Neo4j Community schema. nodes = Client/Site/Inverter/Project/Job/Alert/Person. edges?

### F. Voice + Multi-Modal
25. **openWakeWord training "Alfred" עברי** — איך עוקפים את החסר ב-Picovoice? quality benchmarks?
26. **Hebrew TTS voice cloning** — לפלוט בקולו של ברק? ElevenLabs Voice Lab?
27. **Image classification site photos** — לסווג אוטומטית: גג / לוח חשמל / סוללה / panel תקין/פגום?
28. **PDF invoice extraction structured** — Gemini 2.5 Pro vs AI21 RTL parser benchmarks אמיתיים על חשבוניות עבריות.

### G. Multi-agent / A2A
29. **A2A protocol שימוש בפועל** — Microsoft Agent Framework, Claude Agent SDK shared sessions. איך Alfred ↔ Hermes ↔ bee-hive ↔ bee-ai-watcher יתאמו?
30. **Sub-agent for solar/regulatory/calendar (workspace skills)** — היום SKELETON. האם להשאיר as skeletons או להפעיל? orchestrator wiring?
31. **Kanban worker pool design** — מי spawn-יב workers? לאיזה משימות? איזה profiles?

### H. Security + Compliance
32. **Tirith deployment actual** — איך להתקין ולבדוק? false-positive rate?
33. **Docker + gVisor on Windows** — האם זה realistic על desktop? Hyper-V isolation alternative?
34. **MCP server signing DIY** — pin versions + checksums + sigstore. workflow?
35. **GDPR/Privacy Protection Act Israeli compliance** — Israel-Law-MCP יודע. אבל איך applies לזכר WhatsApp 879K?

### I. Observability + Cost
36. **Langfuse self-host on bee-prod-1** — feasible? PostgreSQL+ClickHouse+Redis יעיל על CX52?
37. **AgentGateway routing rules** — איך לכתוב? per-route per-agent?
38. **Cost-per-skill granular tracking** — alfred-cost-monitor.js היום. איך לעדכן ל-per-MCP-server?

---

## 🎁 התחלה מהירה לסשן הבא

אם הסשן הבא רוצה להמשיך מהמקום שלי:

```bash
# 1. Clone
git clone https://github.com/Barak-B/bee-assets.git E:\bee-assets
cd E:\bee-assets
git checkout claude/capability-extensions-collection-JjV2s

# 2. Read in order
cat research/session-handoff.md          # ← זה הקובץ הנוכחי
cat research/federation-plan.md          # תוכנית waves
cat research/tools-deep-audit.md         # באגים + MCP replacements
# View HTML in browser:
#   research/agent-architecture.html
#   research/agent-io-flow.html

# 3. Verify current state
hermes --version                          # אם 0.13 — לשדרג ל-0.14
openclaw plugins list --json | grep enabled
hermes skills list | wc -l                # אם > 14 active = work needed
curl http://127.0.0.1:18789/health        # OpenClaw alive?
curl http://127.0.0.1:3000/health         # Hermes bridge alive?
```

**מקורות מפתח לקריאה חוזרת:**
- `C:\Users\Barak\.openclaw\workspace\AGENTS.md` (52KB — חוקה)
- `C:\Users\Barak\AppData\Local\hermes\config.yaml` (Hermes config)
- `E:\bee-hermes\docs\topology.md` (v1.3 of topology)
- `E:\Desktop\OpenClawAgent\docs\capability-tree.md` (v2.1)
- `~/.openclaw/cron/jobs.json` (16 cron jobs)

---

## 🧭 כיוונים מומלצים לסשן הבא

### עדיפות גבוהה (אם רק יש שעה)
1. **לאמת ולבדוק שדרוג Hermes 0.14** — האם תהליך update עובד? backup config first. **זה משחרר את הכל**.
2. **תיקון router fallback 3-line** — הkey fix שמשנה הכל.
3. **לאתר ולתקן memory/&lt;date&gt;.md write loop** — תלוי בדיגסטים יומיים.

### עדיפות בינונית (יום עבודה)
4. **חקירת Composio integration אמת** — Q5 הוכרע, אבל לא מומש. quick-start guide.
5. **bee-solaredge-mcp custom build POC** — Q11 דומה. anthropic-skills:mcp-builder.
6. **Israeli MCPs Tier 1 installation script** — 6 MCPs ב-3 פקודות.

### עדיפות אסטרטגית (שבוע)
7. **RAG architecture detailed** — 879K messages. Hebrew. Qdrant or LanceDB. BGE-M3 batch ingestion.
8. **A2A protocol design** — Alfred ↔ Hermes ↔ bee-hive ↔ bee-ai-watcher coordination.
9. **bee-frigate vision integration** — security cameras → site monitoring loop.

---

## 📊 metrics לפני/אחרי

מצב לפני שהתחלנו (2026-05-25):
- ❌ DeepSeek balance מת, Hermes cron נכשל 5/16
- ❌ Hermes WA bridge לא עונה
- ❌ memory/<date>.md stale 9d
- ❌ alfred-router fallback הפוך — bug אדריכלי שאף אחד לא ידע
- ❌ 70/84 Hermes skills רדומים בלי שאיש שם לב
- ❌ 0 MCPs מוגדרים בשני הצדדים
- ❌ אין תוכנית פדרציה כתובה
- ❌ אין רשימה מאוחדת של אינטגרציות עם status
- ❌ אין מפת זרימת קלט/פלט

מצב אחרי הסשן (2026-05-26):
- ✅ 458 שורות תוכנית פדרציה מבוססת 3 חוקרי-משנה + state.db
- ✅ 321 שורות tools-deep-audit עם 10 באגים ספציפיים (file:line)
- ✅ 2 HTMLs ויזואליים עם 60+ אינטגרציות + 13 task types
- ✅ 14 הכרעות אסטרטגיות מאושרות
- ✅ 7 waves מתוכננים, ~50h עבודה ידועה
- ✅ 38 נושאי-המשך מוגדרים לסשן הבא
- ✅ Hermes v0.14 OAuth proxy גילוי משחק-משנה
- ✅ skills-il (182 skills MIT) גילוי שני
- ❌ עדיין לא בוצעה אף משימה — תכנון בלבד

---

## 🤝 הוראה לסשן הבא

קח את ה-handoff הזה, קרא את 4 המסמכים המקושרים, ואז:

1. **תאמת** את current state — ייתכן שמשהו השתנה
2. **התעמק** ב-3-5 מהנושאים שלא נחקרו לעומק (סעיף F לעיל)
3. **שפר** את התוכנית עם הממצאים החדשים
4. **כתוב** מסמך נוסף `research/federation-plan-v2.md` שמשלב את הכל
5. **דחוף** ל-branch אותו או חדש לפי בחירת ברק

הסשן הזה ניצל את הכוורת (Hive Protocol) — 10 sub-agents מקבילים. הסשן הבא יכול לפצל יותר עוד יותר. ערכים שעוד לא מוצו: ביבליוגרפיה של Daniel Rosehill repos, agentskills.co.il bundles individually, אנתרופי-skills repo (17 skills) deep dive, Composio specific integrations Barak צריך, n8n MCP Trigger templates.

**אין הוראת ביצוע. רק תכנון.** ברק מבקש שיפור התוכנית — לא הפעלה.

---

*נכתב על-ידי הסשן המקומי של Claude Code (claude-opus-4-7) ב-2026-05-26 03:30 Asia/Jerusalem. מבוסס על 10 sub-agents מקבילים, קריאה ישירה של state.db 172MB, 2,862 LOC של alfred-*.js, ו-22,775 MCPs ב-Glama directory.*
