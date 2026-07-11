# 🐝🤖 Federation Plan v2 — 4 Deep Dives + Plan Revisions

**נכתב:** 2026-05-26 Asia/Jerusalem
**מאת:** הסשן הענני (claude-opus-4-7 על barak-b/bee-assets)
**ממשיך את:** [`research/federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md) v1 + [`research/tools-deep-audit.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md) + [`research/session-handoff.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/session-handoff.md)

**מה זה לא:** עוד שכבת תכנון מעל v1. v1 ו-audit שניהם תקפים — תקרא אותם קודם.
**מה זה כן:** 4 deep dives על נושאים מסעיף F ב-handoff (שלא נחקרו לעומק), + תיקונים ספציפיים לתוכנית הקיימת על בסיס הממצאים, + 1 verification שעשיתי מול local-state.

---

## 🔍 0. State verification מ-local-state (לפני שמתקדמים)

קראתי בדגימה את `local-state/` — שלוש נקודות לאישור לפני שמתחילים Wave -1:

| נקודה | מה ראיתי בקובץ | מה זה אומר |
|---|---|---|
| **Hermes version** | `version.txt` שורה 1: `Hermes Agent v0.13.0 (2026.5.7)` + שורה 5: `Update available: 1685 commits behind` | C4 ב-v1 עדיין תקף. שדרוג ל-0.14 לא בוצע. **Wave 0 step 1 רלוונטי**. |
| **70 dormant skills** | `skills.txt` סוף: `0 hub-installed, 76 builtin, 8 local — 84 enabled, 0 disabled` | טענת ה-state.db (70 dormant) **לא טופלה**. Wave -1 step 5 רלוונטי. |
| **Processes snapshot** | `processes.txt`: `hermes` PID 56992 רץ עם 4.6MB RAM (נראה idle אך חי), `node` PID 22916 רץ עם 714MB CPU 6618s — זה ה-Alfred Gateway | שניהם חיים. C2 (WA bridge port 3000 לא מאזין) דורש netstat לאמת — לא ראיתי בtarball. |

**מסקנה:** v1 + audit עדיין רלוונטיים במלואם. Wave -1 ו-Wave 0 מוכנים להתחלה.

---

## 🧬 1. Deep Dive A — RAG על 879K הודעות WhatsApp עבריות

**הקשר:** federation-plan.md Wave 3 step 17 אמר "pgvector + multilingual-e5-large + 4h". זה לא ארכיטקטורה — זו headline. מה שצריך זה pipeline, schema, eval, ו-Hebrew-specific decisions.

### 1.1 בחירת embedding model — שינוי המלצה

| מודל | טווח | רב-לשוני | Hebrew | dense+sparse בs אחד | המלצה |
|---|---:|---|---|---|---|
| ~~multilingual-e5-large~~ (v1) | 514 tokens | ✅ 100+ | טוב | רק dense | ❌ הוחלף |
| **BGE-M3** | **8192 tokens** | ✅ 100+ | טוב מאוד | ✅ dense+sparse+ColBERT באותה passage | ✅✅ **הראשי** |
| **multilingual-e5-large-instruct** | 514 | ✅ | טוב | רק dense | חלופי — קל יותר ב-560M params |
| **DictaBERT** | 512 | רק עברית | SOTA | dense בלבד | ✅ לכלים מקבילים (NER, entity resolution) |
| ~~AlephBERTGimmel~~ | 512 | רק עברית | טוב | dense | ❌ — דור קודם, DictaBERT עוקף אותו |

**החלטה:** BGE-M3 כראשי (dense+sparse יחד פותר את ה-hybrid search מבלי צורך לבנות BM25 בנפרד) + DictaBERT כעזר ל-entity extraction (שמות לקוחות בעברית, מקומות, חברות). מקור MTEB: BGE-M3 = 63.0; multilingual-e5-large-instruct competitive. ב-MMTEB 2026 הם מצומדים אבל BGE-M3 מנצח ב-long-doc.

> תיקון ל-federation-plan.md table C: "RAG על 879K הודעות → Hermes (חדש) → pgvector + Hebrew embedding (multilingual-e5-large)" — להחליף ל-"**Qdrant + BGE-M3 (dense+sparse) + DictaBERT (NER side-channel)**".

### 1.2 בחירת vector DB — Qdrant > pgvector > LanceDB

| DB | hybrid native | על Windows | scale 100K vectors | metadata filtering | המלצה |
|---|---|---|---|---|---|
| **Qdrant** | ✅ (named vectors, dense+sparse באותו point) | Docker יציב, או cloud | מצוין | rich payload | ✅ **הראשי** |
| pgvector (PostgreSQL) | חלקי (extension נפרד) | Postgres חופשי | טוב | SQL filters | חלופי אם כבר יש PG |
| LanceDB | ✅ אבל פחות בוגר | קבצי .lance על דיסק | טוב | filtering | תוצא embeddable במקרה |

**החלטה:** Qdrant בקונטיינר Docker על `bee-prod-1` (CX52). זיכרון נדרש: ~400-600MB ל-100K chunks × 1024dim. CPU: שירות-קל.

### 1.3 Chunking strategy ל-WhatsApp עברית — חשיבה מחודשת

הודעות WA קצרות בממוצע (30-80 תווים בעברית). chunking לפי הודעה בודדת = noise. הפתרון:

```
chunk = conversation segment  (לא הודעה בודדת)
├─ הגדרה:    גוש 5-30 הודעות עוקבות עם gap ≤ 30min בין סוף ההודעה לתחילת הבאה
├─ overlap:  ≤ 2 הודעות (כדי לא לפצל הקשרים)
├─ size:     target 500-1000 tokens, max 2000 tokens (BGE-M3 גבול 8192)
├─ metadata: { chat_id, participants[], start_ts, end_ts, msg_count, media_refs[] }
└─ embedding: כל segment מקבל וקטור dense + sparse + 1 ColBERT אופציונלי
```

ה-segments הופכים את "מצא מתי דיברנו על X" ל-retrieve-able. הודעה בודדת עם "OK" לא בורחת לבד.

**Hebrew-specific edge cases:**
- ניקוד (vowel marks): להסיר ב-normalization layer לפני embed. BGE-M3 לא רגיש לזה אבל זה מוריד tokenization noise
- finals (ם/ן/ך/ף/ץ): לא לעשות normalize — חלק מה-tokenization של BGE-M3
- code-switching עברית-אנגלית: BGE-M3 מטפל native; לוודא שה-chunk לא מנותק באמצע מילה אנגלית
- emojis: לשמור (BGE-M3 tokenizer מכיר); הם מקשרים hot
- מספרי טלפון, חשבוניות: לזהות עם regex לפני embed, להוסיף ל-metadata

### 1.4 Ingestion pipeline (concrete)

```
מקור: C:\Users\Barak\whatsapp_backup\msgstore.db.decrypted.db (890MB)
                          │
                          ▼
   [stage 1: SQL extract]   →   messages.parquet  (kept locally, deltas only)
                          │
                          ▼
   [stage 2: segment]       →   conversation_segments.jsonl
                          │       (ב-Python pandas, ~20 min ל-879K msgs)
                          ▼
   [stage 3: enrich]        →   + DictaBERT NER (entities: people, places, orgs)
                          │       + regex (phones, invoices, dates, IL ids)
                          │       + EXIF if media
                          ▼
   [stage 4: embed batch]   →   BGE-M3 batch 64; אם יש GPU מקומי 5-15min;
                          │       אחרת על bee-prod-1 (CX52, no GPU) — 1-2h
                          ▼
   [stage 5: index]         →   Qdrant upsert (dense + sparse + payload)
                          │       1 named vector "dense" 1024d, 1 "sparse" int_dict
                          ▼
   [stage 6: expose]        →   Hermes tool `search_whatsapp_history(query, filters)`
                                  → קורא ל-Qdrant /points/search/hybrid
                                  → reranker אופציונלי (BGE-M3 colbert mode או cross-encoder)
                                  → top-K segments + citation metadata
```

**עלות חישוב:**
- 879K הודעות → ~50-80K segments
- 50-80K × 1024dim float32 = ~200-320MB dense vectors
- + sparse + payload + indexes ≈ ~600MB-1GB total disk
- חד-פעמי: 1-2h למלא + ~5min/day incremental

### 1.5 Hybrid search + reranker (concrete)

```python
# Hermes tool pseudo-code
def search_whatsapp_history(query: str, since: str = None, chat_id: str = None, top_k: int = 10):
    # 1. embed query
    q_dense, q_sparse = bge_m3.encode(query, return_dense=True, return_sparse=True)

    # 2. hybrid Qdrant search — RRF fusion built-in
    results = qdrant.query_points(
        collection="wa_history",
        query=models.Fusion(
            queries=[
                models.NamedVector(name="dense", vector=q_dense),
                models.NamedSparseVector(name="sparse", vector=q_sparse),
            ],
            fusion=models.FusionType.RRF,  # Reciprocal Rank Fusion
        ),
        query_filter=models.Filter(must=[
            models.FieldCondition(key="end_ts", range=models.Range(gte=since)) if since else None,
            models.FieldCondition(key="chat_id", match=models.MatchValue(value=chat_id)) if chat_id else None,
        ]),
        limit=top_k * 3,  # over-retrieve for rerank
    )

    # 3. (optional) ColBERT-style late interaction rerank
    reranked = bge_m3.colbert_rerank(query, [r.payload["text"] for r in results.points])
    return reranked[:top_k]
```

**רווח על dense-only:** +15-30% recall (מקור: hybrid search lit).

### 1.6 Eval — לא אופציונלי

לפני שמסמיכים את ה-tool ל-production, eval set:
- 50 query-answer pairs ידניות מההיסטוריה האמיתית (ברק יכתוב)
- שאלות מ-5 קטגוריות: (a) שם לקוח לאחרונה, (b) מי דיבר על נושא טכני, (c) מתי הוסכם מחיר, (d) מתי שלחו תמונה של X, (e) טווח תאריכים
- מטריקות: **MRR@10**, **recall@5**, **latency p95**
- target: MRR ≥ 0.75, recall@5 ≥ 0.85, p95 ≤ 1500ms
- אם נכשל — לבדוק chunking size, sparse weight, או להעלות ל-DictaBERT הbridge ל-NER score

### 1.7 שינוי ב-Wave 3 step 17

**ישן:** "RAG על 879K הודעות (~4h) — E5-multilingual-large + pgvector"
**חדש:** "RAG על 879K הודעות (~8-12h) — BGE-M3 hybrid + Qdrant + 6-stage pipeline + eval set"

הכפלת זמן ההערכה ריאלית. ה-eval אגב הוא 2-3h לבד.

---

## 🔌 2. Deep Dive B — Composio (Q5) integration concrete

**הקשר:** Q5 אושר "להשלים `alfred-mcp-gateway.js` עם Composio (850-1000 integrations)". אבל אין concrete: איזה integrations, באיזו עלות, hosted או self-hosted, איך wiring ל-Alfred.

### 2.1 תמחור 2026 — מציאות

| Tier | מחיר | tool calls/חודש | תוספת | מתאים ל-BEE? |
|---|---:|---:|---|---|
| Free | $0 | 20K | $0.299/1K נוסף | **כן** — להתחיל כאן |
| Standard | $29/חודש | 200K | $0.299/1K | אם >20K/חודש מוכח אחרי 30 יום |
| Pro | $229/חודש | 2M | $0.299/1K | רק אם BEE מתרחב משמעותית |
| Enterprise | custom | custom | SLA + on-prem option | לא רלוונטי כעת |

**Self-hosted:** Composio MIT, Node.js + PostgreSQL + Redis. **לא מומלץ ל-BEE כעת** — הערך של Composio הוא OAuth refresh ניהול (טרחה רצינית); self-host = לעבוד פי 3 בלי הרווח.

> תיקון ל-federation-plan.md Wave 2 step 13/14: להוסיף "**Composio Free tier כשכבת OAuth proxy** ל-3-5 SaaS integrations ראשונים".

### 2.2 בחירת 5 integrations ראשונים ל-BEE

מהמיפוי של `local-state/openclaw/AGENTS.md` (52KB), זה מה ש-Alfred צריך אמת:

| Composio app | למה | חלופה | המלצה |
|---|---|---|---|
| **WhatsApp Business Cloud API** | קמפיינים outbound (rate-limited), templates approved, broadcast — דברים ש-Baileys לא יודע | Baileys ל-1:1, WABC ל-broadcast | ✅ wave 4 |
| **Cardcom** | קבלות אוטומטיות, payment links, רינוונט. אין MCP פתוח ישראלי | לבנות `bee-cardcom-mcp` (Q11 pattern) | ✅ wave 2 — Composio cheaper than building |
| **Twilio SMS Israel** | SMS להתראות שטח כשאין WA (אנשי שטח עם פלאפון רק) | קיים MCP — `skills-il/communication` | ✅ **חלופה ל-Composio** — Israeli skill עדיף |
| **Slack** | dashboard alerts לצוות (אם יהיה צוות) | webhook ישיר | בלי Composio כעת |
| **Telegram Bot** | Q4 דחה — לא עכשיו | n/a | לדחות |
| **Google Drive deep** | bulk operations (upload site photos פר-לקוח) | google_workspace_mcp כבר על המסך (audit Tier 1) | ✅ google_workspace_mcp עדיף |

**מסקנה:** Composio טוב ל-2 דברים אמיתיים: **WhatsApp Business Cloud + Cardcom**. שאר ה-850 — לא צריך. **התחל Free tier**.

### 2.3 wiring concrete ל-`alfred-mcp-gateway.js`

הקובץ קיים אך skeleton (audit row #10). שני מצבים:

**מצב A: Composio cloud MCP endpoint** (recommended start)
```javascript
// alfred-mcp-gateway.js — Composio cloud variant
import { ComposioToolSet } from "composio-core";

const composio = new ComposioToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
  entityId: "alfred-bee",  // user/account identifier
});

// Discover available apps (one-time per app)
// await composio.client.connectedAccounts.initiate({ appName: "whatsapp_business" });
// → browser opens for OAuth → token stored on Composio servers

export async function callComposioTool(toolName, args) {
  return await composio.executeAction(toolName, args, entityId);
}
```

**מצב B: Composio MCP server local proxy** (אם רוצים sovereignty)
- `npx composio-mcp@latest` רץ stdio locally
- Alfred קורא דרך MCP client רגיל
- עדיין משתמש ב-Composio cloud OAuth — רק ה-transport מקומי
- מומלץ רק אחרי שיש 5+ apps מוגדרים

**שלב הפצה:**
1. Wave 2 step 13.5 (חדש): "Composio Free signup + WhatsApp Business + Cardcom OAuth + alfred-mcp-gateway.js wiring למצב A" — ~3h
2. Wave 2 step 13.6 (חדש): "Test 10 outbound campaigns דרך WhatsApp Business API דרך Composio" — ~1h
3. אם >20K calls בחודש, upgrade ל-Standard ($29/m)

### 2.4 שינויים בתוכנית v1

- federation-plan.md Q5 — אישור Composio נשאר; להוסיף "**Free tier בלבד, 2 apps ראשונים, מעבר ל-Standard רק אחרי הוכחה**"
- tools-deep-audit.md Q11 — `bee-invoice-maven-mcp` עדיין לבנות (Invoice Maven אינו ב-Composio). Cardcom **כן** ב-Composio — להוריד מ-build list.

---

## 🛡️ 3. Deep Dive C — MCP Sandbox Security על Windows

**הקשר:** finding #7 ב-handoff: Anthropic סירב לפתח את MCP STDIO RCE (CVE-2026-30623, April 2026). 200K servers exposed. ברק עומד להתקין 20+ Israeli MCPs + Tier-1 official + אולי Composio. **בלי sandbox = lottery**.

### 3.1 הסיכון ספציפי

CVE-2026-30623 — `mcp.json` config file → command injection דרך args. כל config file שמשתמש קורא יכול לבצע exec arbitrary command בזמן launch. **לא צריך malicious server** — מספיק config מורעל. מקור: OX Security, Ox Security audit April 2026.

תרחיש BEE:
- ברק רואה MCP מגניב ב-GitHub Israeli ecosystem, מעתיק `mcp.json` snippet → Alfred/Hermes טוען → קוד זדוני רץ עם הרשאות המשתמש (`Barak`) על Windows. **אפשר exfiltrate כל ה-`E:\` כולל secrets, banking sessions, WhatsApp DB**.

### 3.2 מה Anthropic ממליצים (ולמה זה Linux-only)

מהמסמך הרשמי שלהם:
- **gVisor** (`--runtime=runsc`) — userspace syscall interception, 0% overhead CPU-bound, 2-200x overhead file I/O
- **Firecracker microVM** — 125ms boot, <5MiB overhead, dedicated kernel per session

⚠️ **שניהם Linux-only.** על Windows הם רצים רק תחת WSL2 — וזה כפול overhead.

### 3.3 Windows-native sandboxing — ההמלצה שלי

מסודר מהקל להכבד:

#### Layer 0 (תמיד, חינם, מיידי) — Tirith config scanning
```bash
# install (Rust, single binary)
cargo install tirith   # or: download release from github.com/sheeki03/tirith

# wire-up to Claude Code (Alfred uses OpenClaw not Claude Code, but Hermes might use Claude Desktop)
tirith setup claude-code --with-mcp
tirith setup cursor --with-mcp   # if using Cursor

# scan an mcp.json BEFORE adding it to OpenClaw or Hermes
tirith scan ./suspicious-mcp.json
# → 80+ detection rules: homograph URLs, pipe-to-shell, ANSI injection, obfuscated payloads
```

**Tirith הוא DEFENSE-IN-DEPTH, לא הפתרון.** הוא תופס config-level attacks. עדיין נדרש sandbox runtime.

#### Layer 1 (default ל-MCPs לא-trusted) — Hyper-V isolated Docker containers

תנאי: **Windows 11 Pro/Enterprise** (לא Home — Hyper-V לא זמין).

```bash
# Docker Desktop על Windows 11 Pro
docker run --isolation=hyperv -d \
  --name mcp-suspicious \
  --memory=512m \
  --cpus=0.5 \
  --read-only \
  --tmpfs /tmp \
  --network=none \  # disable network if MCP local only
  -v /mnt/host_scratch:/scratch:ro \
  mcp-server-image
```

`--isolation=hyperv` נותן container עם kernel נפרד. בריחה מ-container = בריחה מ-Hyper-V = בריחה מ-Windows kernel. **שלוש שכבות**.

**יישום מעשי ל-BEE:**
- כל MCP חדש שלא מ-Anthropic/Microsoft official → רץ ב-Hyper-V container
- ה-stdio של ה-MCP exposed דרך docker exec או named pipe ל-host
- ב-claude_desktop_config.json / openclaw config.json: command היא `docker exec mcp-suspicious ...` ולא ה-binary ישיר

#### Layer 2 (untrusted one-off) — Windows Sandbox

מובנה ב-Windows 11 Pro. Throwaway VM, מוחק את עצמו בסיום. **טוב לבדיקות חד-פעמיות** של MCP חדש לפני שמכניסים ל-Layer 1.

```bat
:: hold-test-mcp.wsb
<Configuration>
  <MappedFolders>
    <MappedFolder><HostFolder>E:\mcp-test</HostFolder><ReadOnly>true</ReadOnly></MappedFolder>
  </MappedFolders>
  <Networking>Disable</Networking>
  <LogonCommand><Command>powershell ./test.ps1</Command></LogonCommand>
</Configuration>
```

#### Layer 3 (trusted bare-metal) — רק ל-Tier 1 vetted

רשימה קצרה שרצה bare metal:
- `@modelcontextprotocol/server-filesystem` (Anthropic)
- `@modelcontextprotocol/server-sqlite` (Anthropic)
- `@mondaydotcomorg/monday-api-mcp` (Monday official)
- `@playwright/mcp` (Microsoft)
- `taylorwilsdon/google_workspace_mcp` (well-vetted community)
- `hebcal/hebcal-mcp` (Hebcal — hosted SSE, אין סיכון local exec)

הכל מעבר לרשימה — Layer 1 לפחות.

### 3.4 Workflow ל-MCP install חדש

```
   חדש MCP על ה-radar
            │
            ▼
   [1] Tirith scan של config       ─→ אם FAIL: דחה
            │ PASS
            ▼
   [2] Windows Sandbox test run    ─→ פתח 5min, בדוק תפקוד, אל תאשר exfil
            │ OK
            ▼
   [3] האם זה ברשימת Tier 1?
            │
       ┌────┴────┐
      כן       לא
       │         │
       ▼         ▼
   [4a] bare    [4b] Hyper-V container
       מטל         + --network=none אם אפשר
       │              + --memory limit
       │              + --read-only fs
       ▼              ▼
   [5] Document ב-`INFRA.md` — name, source, layer, last-tirith-scan-date
            │
            ▼
   [6] Quarterly: re-scan all configs עם Tirith (rule updates)
```

### 3.5 Recommended additions ל-tools-deep-audit.md

תוספת ל-Tier 1 install list (`tools-deep-audit.md` סעיף 1):

- **#21: `tirith` (sheeki03/tirith)** — Rust CLI, MIT, must-have for any MCP-heavy stack
- **#22: Docker Desktop ל-Windows 11 Pro** — license already (assume Pro)
- אם Windows Home: לשדרג ל-Pro או להעביר Hermes ל-WSL2 ולסנדבוקס שם

### 3.6 שינויים מומלצים ב-federation-plan.md

- Wave 2 step 11 (`openclaw mcp serve + hermes mcp serve`) — הוסף sub-step "**הקפדה: שני ה-servers ב-Hyper-V containers, לא bare metal**" אם רצים לרשת חיצונית (לא צריך אם רק על localhost)
- Wave 3+ — לפני כל MCP install חדש, לעבור workflow 4 שלבים מ-3.4 לעיל

---

## 🎥 4. Deep Dive D — bee-frigate Vision + Site Photo Pipeline

**הקשר:** session-handoff F#1 מציע "8-ch Dahua → vision events → Alfred". F#27 מציע "image classification site photos". שני flows שונים — אבל משתמשים באותה תשתית.

### 4.1 Frigate 2026 capabilities — מה כבר אפשרי

Frigate v0.16+ (Mai 2026):
- ✅ **Generative AI integration native** — שלח frames ל-Ollama / OpenAI / Anthropic לתיאור
- ✅ **MQTT publish** — כל tracked object → topic `frigate/tracked_object_update`
- ✅ **YOLOv9 baseline** (default ב-2026.0); YOLOv11-MO זמין לתוספי PV (אבל זה drone-thermal use case שלא ישים לhowever security cameras)
- ✅ **Dahua native** — recommended #1 לפי Frigate maintainer. ברק כבר על Dahua = perfect alignment

**מה שיוצא מעבר לטווח:** Frigate **לא** מנתח solar panels. ה-cameras הן security, לא thermal drones. ה-YOLOv11-MO לפאנלים סולאריים זה drone use case נפרד שלא relevant ל-bee-frigate.

### 4.2 שני pipelines נפרדים

```
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE 1 — Frigate security events → Alfred WA alert           │
└─────────────────────────────────────────────────────────────────┘

  8-ch Dahua  →  Frigate NVR  →  YOLOv9 detect  →  MQTT publish
                                                          │
                              ┌───────────────────────────┘
                              ▼
                  topic: frigate/tracked_object_update
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        mosquitto MQTT                  GenAI provider
        broker (bee-prod-1)             (Frigate config)
              │                               │
              ▼                               ▼
        MCP MQTT subscriber          frame → Anthropic vision
        (Hermes plugin)                "person at substation 23:14,
              │                         wearing reflective vest"
              │                               │
              └───────────────┬───────────────┘
                              ▼
                       Hermes event handler
                              │
                       filter rules (person? after-hours? vehicle?)
                              │
                              ▼
                       MCP call → Alfred send_to_barak
                              │
                              ▼
                       WhatsApp alert ⚡

┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE 2 — WA site photo → vision classify → BEE.Document     │
└─────────────────────────────────────────────────────────────────┘

  ברק/לקוח שולח תמונה ב-WA
                          │
                          ▼
              Hermes WA bridge :3000
                          │
                          ▼
              Alfred-router classify intent
              "site-photo" ?
                          │ yes
                          ▼
              Hermes vision_tool
              (Gemini 2.5 Pro / Claude 3.5)
                          │
                          ▼
              structured JSON:
              {
                category: "roof"|"panel-array"|"electrical-panel"|"inverter"|"battery",
                condition: "good"|"damaged"|"unclear",
                readings: {...} if visible,
                site_hint: from EXIF GPS or ask
              }
                          │
                          ▼
              site_id resolve
              (GPS reverse-lookup OR Alfred clarify question)
                          │
                          ▼
              write to sites/<X>.md
              + insert into BEE.Document via SolarEdge MCP
              + reply ⚡ "תועד באתר Y, סווג כפאנל תקין"
```

### 4.3 Pipeline 1 — concrete setup

**Hardware/services (כבר אצל ברק):**
- 8-ch Dahua NVR (existing)
- bee-frigate container (existing per handoff)
- bee-prod-1 (CX52 Hetzner) — host ל-mosquitto

**שלבים:**
1. התקנת mosquitto MQTT broker על bee-prod-1 (~10min): `apt install mosquitto`
2. הגדרת Frigate `genai` provider ב-config.yaml ל-Anthropic Claude vision (5min):
   ```yaml
   genai:
     enabled: true
     provider: anthropic
     api_key: ${ANTHROPIC_API_KEY}
     model: claude-haiku-4-5  # cheapest, fastest for descriptions
   ```
3. הגדרת MQTT publishing ב-Frigate (5min)
4. כתיבת `hermes plugin: frigate_mqtt_listener` — מתחבר ל-mosquitto, מקבל `frigate/tracked_object_update`, מפלטר (rules: person after-hours, vehicle at substation, motion at warehouse), מפעיל MCP call ל-Alfred (~2-3h כתיבה)
5. כתיבת `alfred-frigate-handler.js` שמקבל MCP call, פורמט הודעה ⚡, שולח ל-Barak (~1h)
6. Tuning rules ל-1-2 שבועות לצמצם false positives

**זמן כולל:** ~4-6h עבודה + 1-2 שבועות tuning.

### 4.4 Pipeline 2 — concrete setup

זה מבוסס על קיים: Hermes WA bridge + vision_tool + alfred-router.

**שלבים:**
1. הוספת intent חדש ל-task-examples.md של alfred-router: `"site-photo"` עם 5 דוגמאות (~30min)
2. Hermes vision tool wrapper שמחזיר structured JSON עם Pydantic schema (~1.5h)
3. site_id resolver — אם EXIF GPS קיים, lookup ב-`sites/`; אם לא, alfred-clarify yes/no תשובה לשאלה "האם זה אתר Y שזכרון לראות?" (~1.5h)
4. write to `sites/<X>.md` בנוסח Obsidian-compatible (Alfred already does this for other types, reuse `alfred-knowledge.js` write path) (~30min)
5. אם detected `inverter` + reading visible → cross-ref ל-SolarEdge MCP לבדוק אם המספר תואם (אופציונלי, ~2h)

**זמן כולל:** ~4-5h.

### 4.5 בחירת vision model לכל pipeline

| מודל | latency | עלות (input image ~1MP) | quality על תמונות שטח | quality על עברית | המלצה |
|---|---|---|---|---|---|
| **Claude Haiku 4.5** | ~1s | $0.001-0.003 | טוב | מעולה | ✅ Pipeline 1 — fast notification, cheap |
| **Claude Sonnet 4.6** | ~2-3s | $0.005-0.015 | מעולה | מעולה | ✅ Pipeline 2 — accurate classification |
| Gemini 2.5 Pro | ~2s | $0.002-0.005 | מעולה (במיוחד OCR) | מצוין (לפי handoff) | ✅ Pipeline 2 alternative אם יש OCR (טקסט על מד תוצרת) |
| GPT-4o | ~2s | $0.005 | טוב | בינוני | ❌ עברית פחות |
| Open Ollama (Llama 3.2 Vision 11B) | ~5s+ | $0 if local | בינוני | בינוני | רק אם local-only requirement |

**המלצה:** Pipeline 1 = Haiku (זול+מהיר); Pipeline 2 = Sonnet ראשי, Gemini fallback אם בודקים מקרים עם OCR.

### 4.6 שינויים מומלצים ל-federation-plan.md

**Wave 4 (Platform Expansion) — להוסיף שני items חדשים:**
- Step 24.5: **Pipeline 1 — Frigate→MQTT→Hermes→Alfred WA alert** (~5h)
- Step 24.6: **Pipeline 2 — Site photo classification end-to-end** (~5h)
- Total addition: ~10h ל-wave 4 → wave 4 גדל מ-16h ל-26h. ROI עסקי גבוה — Frigate footage כבר זורם, רק לחבר את הLLM ל-events.

---

## 📋 5. סיכום שינויים לתוכנית הקיימת

טבלת שינויים מצומצמת — כל שורה מכוונת ל-edit ספציפי ב-v1 / audit.

| מסמך | שורה / סעיף | שינוי |
|---|---|---|
| federation-plan.md | Wave 3 step 17 | החלף "E5+pgvector" ב-"BGE-M3 hybrid + Qdrant + 6-stage pipeline + eval (8-12h)" |
| federation-plan.md | Capability Matrix C, row "RAG על 879K" | סיבה: "BGE-M3 (dense+sparse) + DictaBERT (NER) + Qdrant" |
| federation-plan.md | Wave 2 step 13 | הוסף 13.5 + 13.6: Composio Free tier signup, 2 apps (WA Business + Cardcom), ~4h |
| federation-plan.md | Q5 answer | עדכן: "Free tier, 2 apps, מעבר ל-Standard רק אם >20K calls" |
| federation-plan.md | Wave 2 step 11 | הוסף sub-step: containerize בעלי Hyper-V אם המ-MCP חיצוני |
| federation-plan.md | Wave 4 | הוסף 24.5 + 24.6 = ~10h עבור Frigate pipelines |
| tools-deep-audit.md | Tier 1 install list | הוסף #21 Tirith + #22 Docker Desktop Pro requirement |
| tools-deep-audit.md | Q11 (Invoice Maven MCP) | הוסף הערה: Cardcom = Composio (לא לבנות); Invoice Maven = build (אין ב-Composio) |
| tools-deep-audit.md | "5 MCPs שאסור להתקין" | הוסף red flag כללי: "MCP STDIO ללא Hyper-V container = lottery לפי CVE-2026-30623" |

---

## ❓ שאלות חדשות שעלו ב-v2

| # | שאלה | אופציות | המלצת המסמך |
|---|---|---|---|
| Q15 | **Vector DB** ל-RAG על 879K msgs | (a) Qdrant Docker ב-bee-prod-1; (b) pgvector אם PG כבר קיים; (c) LanceDB מובנה ב-Hermes | (a) — Qdrant native hybrid, Docker יציב |
| Q16 | **Composio integrations** — אילו apps **ראשונים**? | (a) WhatsApp Business + Cardcom; (b) + Slack/Telegram; (c) הכל הזמין | (a) — Free tier, הוכחה לפני expansion |
| Q17 | **Windows version**: Pro או Home? | Pro = Hyper-V containers זמין; Home = WSL2 only | חובה לאמת — אם Home, להמליץ שדרוג |
| Q18 | **MCP sandbox depth** — לאיזה MCPs Layer 1 (Hyper-V), לאיזה Layer 3 (bare metal)? | Tier 1 list (5 MCPs) bare metal, השאר Hyper-V | טיוטה ב-3.3 — לאישור |
| Q19 | **Frigate genAI provider** — Claude Haiku, Sonnet, Gemini, או Ollama local? | Haiku ל-Pipeline 1 (security), Sonnet ל-Pipeline 2 (site photos) | טיוטה ב-4.5 |
| Q20 | **bee-cardcom-mcp build** — להוסיף ל-Q11 build list? | (a) לא — Composio; (b) כן — control + שמירה Israeli stack | (a) — Composio זול יותר, MCP בעוד 6 חודשים |

---

## 📅 Wave Map עדכני (לאחר v2)

| Wave | שינוי מ-v1 |
|---|---|
| **Wave -1** Bug Squash | ללא שינוי (~6h) |
| **Wave 0** Crisis | ללא שינוי (~3h) |
| **Wave 1** Single source of truth | ללא שינוי (~4-8h) |
| **Wave 2** MCP Foundation | +Composio Free setup ~4h, +Tirith ~30min, +Hyper-V container template ~1h → ~13.5h |
| **Wave 3** Capability Splits | +RAG redo עם BGE-M3+Qdrant (8-12h במקום 4h) → ~16-20h |
| **Wave 4** Platform Expansion | +Frigate Pipeline 1+2 ~10h → ~26h |
| **Wave 5** Continuous | ללא שינוי |

**סך הכל מעודכן:** ~50h ב-v1 → **~65-70h ב-v2**. ההפרש: RAG אמיתי + Frigate pipelines + sandbox infra.

---

## 📚 מקורות חדשים (לא במסמכים הקודמים)

### RAG / Embeddings
- BGE-M3 capabilities: [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) — dense+sparse+ColBERT one model
- MMTEB 2026 benchmark: [arxiv:2502.13595](https://arxiv.org/abs/2502.13595)
- DictaBERT paper: [arxiv:2308.16687](https://arxiv.org/pdf/2308.16687)
- Hybrid search RAG patterns: [Cubitrek hybrid search](https://cubitrek.com/blog/hybrid-search-optimization-how-bm25-and-dense-vector-retrieval-work-together-for-superior-ai-search/)
- LanceDB multilingual chunking: [chunking-analysis](https://blog.lancedb.com/chunking-analysis-which-is-the-right-chunking-approach-for-your-language/)

### Composio
- Composio pricing 2026: [composio.dev/content/hosted-mcp-platforms](https://composio.dev/content/hosted-mcp-platforms)
- Composio OAuth handling: [composio.dev/content/oauth-2-1-in-mcp](https://composio.dev/content/oauth-2-1-in-mcp)
- Composio vs Pipedream (post-Workday): [withampersand pipedream alternatives 2025](https://www.withampersand.com/blog/the-top-7-pipedream-alternatives-in-2025-after-the-workday-acquisition)

### Security
- CVE-2026-30623 details: [thehackernews](https://thehackernews.com/2026/04/anthropic-mcp-design-vulnerability.html), [ox security audit](https://www.ox.security/blog/the-mother-of-all-ai-supply-chains-critical-systemic-vulnerability-at-the-core-of-the-mcp/)
- Tirith installation: [github.com/sheeki03/tirith](https://github.com/sheeki03/tirith), [tirith.sh/docs](https://tirith.sh/docs/)
- Windows Hyper-V container isolation: [Microsoft Learn isolation modes](https://learn.microsoft.com/en-us/virtualization/windowscontainers/manage-containers/hyperv-container)
- Anthropic sandbox patterns: [digitalapplied 7 sandbox patterns](https://www.digitalapplied.com/blog/anthropic-self-hosted-sandbox-7-production-patterns-2026)

### Frigate
- Frigate genAI config: [docs.frigate.video/configuration/genai](https://docs.frigate.video/configuration/genai/genai_config/)
- Frigate Home Assistant + LLM blueprint: [HA community frigate vision v0.9](https://community.home-assistant.io/t/blueprint-frigate-vision-ai-powered-notifications-with-llm-recognition-cooldowns-multi-cam-logic-v0-9/907582)
- Hindsight memory plugin official: [hindsight.vectorize.io hermes-native](https://hindsight.vectorize.io/blog/2026/04/06/hermes-native-memory-provider)

---

## 🤝 שינוי לסשן הבא

קח את 3 המסמכים יחד:
1. [`research/federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md) — תוכנית-בסיס v1
2. [`research/tools-deep-audit.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md) — באגים + MCPs
3. **[`research/federation-plan-v2.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan-v2.md)** — זה (הזה)

הצעות להעמקה הבאה (מ-38 הנושאים שעוד פתוחים):
- **#5 bee-ai-1 (Hostinger VPS Ollama+OpenWebUI routing)** — local-cloud routing decisions, איזה models איפה
- **#29 A2A protocol** — Microsoft Agent Framework 1.0 GA April 2026 → איך Alfred ↔ Hermes ↔ bee-hive מתאמים formally
- **#21-24 RAG על KG entities, לא הודעות** — Neo4j Community schema, BEE entity types
- **#15-20 Israeli regulatory gaps** — IEC, PUA, Mas Hahnasa MCP building plan

הסשן הזה לא ביצע — רק תכנן + העמיק. v3 או הסשן המקומי הבא מבצע Wave -1.

---

*נכתב על-ידי הסשן הענני 2026-05-26 Asia/Jerusalem אחרי 14 web searches + verify של 3 קבצי local-state. 4 deep dives, ~5 שעות מחקר בענן + ~30 דקות עריכה. הוסף ~15-20 שעות עבודה לתוכנית הכוללת (RAG אמיתי + Frigate + sandbox infra).*
