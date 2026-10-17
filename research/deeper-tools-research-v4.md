# 🔬 Deeper Tools Research v4 — 6 New Deep Dives

**נכתב:** 2026-05-26 Asia/Jerusalem
**מאת:** הסשן הענני אחרי 12 web searches על כלים שלא כוסו עדיין לעומק
**ממשיך את:** v1 + audit + v2 + v3 (office automation). זה לא תוכנית חדשה — זה **תוספת כלים** ל-toolbox עם המלצות concrete.

⚠️ **ממצא קריטי שמשנה הכל:** Israel SHAAM e-invoicing **חובה מ-ינואר 2026 על חשבוניות מעל 10K ש"ח, מ-יוני 2026 מעל 5K ש"ח**. BEE חייבת להיות מוכנה — אחרת חשבוניות לא יוכרו ל-VAT. רואים בסעיף 3 למטה.

---

## 1. A2A Coordination — Microsoft Agent Framework + Claude Agent SDK

### 1.1 ה-context שבו זה משחק

ב-handoff F#29 ועוד היה: "Alfred ↔ Hermes ↔ bee-hive ↔ bee-ai-watcher יתאמו?" — איך מקואופרים בין סוכנים שונים בלי כפילויות. שני סטנדרטים חדשים שיצאו ב-2026 פותרים את זה.

### 1.2 Microsoft Agent Framework 1.0 — GA April 2026

- **שני SDKs:** .NET ו-Python באותו `Microsoft.Agents.AI` — same concepts, same API
- **MCP native:** כל agent מקבל MCP tools כשכבת resource
- **A2A native:** Agent-to-Agent protocol לתקשורת **בין frameworks שונים**
- **דוגמה:** Python agent → A2A → .NET agent → .NET agent מחזיר → Python agent ממשיך
- **Source:** [Microsoft DevBlogs Agent Framework 1.0](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)

**רלוונטיות ל-BEE:** Alfred (Node.js OpenClaw), Hermes (Python), bee-hive (TBD), bee-ai-watcher (TBD). אם בעתיד יהיו עוד agents — A2A הוא הסטנדרט.

### 1.3 Claude Agent SDK — Agent Teams (experimental May 2026)

- מצב "team lead" שמנהל מספר agents כל אחד בקונטקסט נפרד
- כל "teammate" עם session thread משלו
- **Handoff pattern רשמי:** `HANDOFF.md` בקובץ + שני agents קוראים אותו
  - "create file at /agent-context/handoff-notes/for-[next-agent].md"
  - "next agent's init prompt should check for handoff notes addressed to it"
- **Source:** [Claude Code Agent Teams 2026 guide](https://claudefa.st/blog/guide/agents/agent-teams)

### 1.4 איזה pattern ל-BEE — המלצה concrete

| Pattern | מתי | יישום |
|---|---|---|
| **MCP cross-call** (כבר v1) | Alfred קורא לטול ב-Hermes | רגיל, fastest |
| **A2A messaging** | אם יהיה בעתיד bee-hive ב-.NET | להוסיף MAF SDK ל-Hermes Python side |
| **HANDOFF.md pattern** | משימה ארוכה שעוברת בין sessions | להוסיף `handoff-notes/` ל-Alfred workspace |
| **shared context.md** | working context יום | כבר יש (MEMORY.md) — ל-formalize structure |

**שיעור ל-v3:** Alfred ↔ Hermes כיום עובד דרך MCP (תוכנית v1). אין לדחוף ל-A2A עוד כי שניהם יודעים MCP. **A2A מומלץ רק אם יווצר agent חדש ב-runtime שונה.**

---

## 2. Hebrew Document Generation — Anthropic Skills + RTL

### 2.1 מה Anthropic-skills מספק

מ-GitHub `anthropics/skills` (Apache 2.0):

| Skill | פורמט | מקרי שימוש BEE |
|---|---|---|
| `docx` | Word | הצעות מחיר, חוזים, מכתבים רשמיים, דוחות אתר |
| `pdf` | PDF | תעודות, חתימות סופיות, archives |
| `xlsx` | Excel | דוחות הכנסות, רשימת לקוחות, מצב מלאי |
| `pptx` | PowerPoint | מצגות ללקוחות B2B, סיכומי פרויקטים |

**Source:** [github.com/anthropics/skills](https://github.com/anthropics/skills) — keys: `skills/docx/SKILL.md`, `skills/pdf/SKILL.md`, etc.

### 2.2 RTL Hebrew specific — מה הסקיל יודע

- `w:bidi` XML element על paragraphs
- `w:rFonts` עם `w:cs` ל-complex script fonts (David, Heebo)
- `font.complex_script=True` לכל run
- `WD_ALIGN_PARAGRAPH.RIGHT` ברירת מחדל

### 2.3 דוגמאות שימוש concrete ל-BEE

#### A. הצעת מחיר אוטומטית

```
inbound msg → Alfred classify → intent=client-quote → resolver מזהה לקוח X
                          ↓
                  draft proposal generation:
                  • Anthropic skill `docx`
                  • template: "bee-quote-template.docx" (Barak מכין פעם אחת)
                  • fill placeholders: client_name, site_address, system_size_kW,
                    price_NIS, terms, contact_back
                  • output: "quote-2026-05-26-clientX.docx"
                          ↓
                  upload to Google Drive (folder structure: /quotes/2026/Q2/)
                          ↓
                  Alfred ⚡ "טיוטת הצעה ללקוח X מוכנה. לראות / לערוך / לשלוח?"
```

**זמן build:** ~3h ל-template + integration.

#### B. דוח אתר עם תמונות (Pipeline 2 מ-v2 חלק 4)

```
WA inbound: site photos + voice note
                          ↓
Hermes vision_tool extracts: { category, condition, equipment_visible }
Hermes whisper_tool transcribes voice note → action items
                          ↓
generate `site-report-{site_id}-{date}.docx`:
  • title page: BEE branding + site address + date + technician
  • photos embedded with captions (auto from vision)
  • condition summary (from vision)
  • findings & recommendations (from voice note + LLM compose)
  • signature lines
                          ↓
save to sites/{site_id}/reports/ + Monday.com attach
```

#### C. חוזה אוטומטי

`anthropic-skills/docx` יודע ליצור חוזים מובנים עם:
- Title (centered) → "הסכם התקנה — לקוח X"
- Parties section → BEE Israel + Customer
- Numbered clauses (1.1, 1.2, ...)
- Signature blocks
- Hebrew fonts throughout

עבור BEE זה מאיץ flow כל הסכם מ-30min ידני ל-2min agent + 5min human review.

### 2.4 השוואה ל-skills-il/government-services

`skills-il/government-services` (34 skills MIT, audit Tier 2) מטפל בדוחות לרשויות (לא חוזים). יחד הם משלימים:

| צורך | מי | פעולה |
|---|---|---|
| חוזה תקני B2C | `anthropics-skills/docx` | template-based generation |
| תעודה רשמית לרשות | `skills-il/government-services` | פורמט גוב.יל מאומת |
| חשבוניות מס | `cardcom-payment-gateway` (skills-il Tier 1) | SHAAM-compliant (סעיף 3) |
| דוח שטח | `anthropics-skills/docx` + Hermes vision | טכני + תמונות |

---

## 3. Israeli Compliance — SHAAM, Cardcom, Bituach Leumi

### 3.1 ⚠️ SHAAM e-invoicing — חובה דחופה

**ה-finding המשמעותי ביותר במחקר הזה.**

| תאריך | חובה על חשבוניות מעל | מה זה אומר ל-BEE |
|---|---:|---|
| 1 ינואר 2026 | **10,000 ₪** | כל invoice > 10K צריך allocation number מ-SHAAM |
| 1 יוני 2026 | **5,000 ₪** | הסף יורד — רוב חשבוניות BEE מעל 5K |

**מה זה SHAAM:**
- מערכת SHAAM של רשות המסים
- חשבונית נשלחת **לפני** לקוח → SHAAM מאשרת → מחזירה allocation number → רק אז שולחים ללקוח
- בלי allocation number → **הלקוח לא יוכל לקזז VAT**
- API: JSON (לא XML), real-time validation
- מקור: [VATupdate Israel e-invoicing](https://www.vatupdate.com/2025/12/14/israel-expands-mandatory-e-invoicing-lower-thresholds-and-new-vat-compliance-rules-for-2026/), [Sovos Israel CTC](https://sovos.com/vat/tax-rules/e-invoicing-israel/)

### 3.2 איך BEE מתחברת ל-SHAAM

**3 אופציות:**

| אופציה | מתאים אם | עלות | זמן |
|---|---|---|---|
| **A. דרך תוכנת חשבונאות קיימת** | BEE משתמשת ב-Hashavshevet/Priority/חשבשבת חישוב | ~₪200-500/חודש | 0 (כבר בנוי) |
| **B. דרך Cardcom** | BEE משתמשת ב-Cardcom לסליקה | בכלל המחיר | 1 שעה הגדרה |
| **C. ישיר ל-SHAAM API + middleware** | מאוד גמיש | ~₪0 + 2-3 ימי פיתוח | 2-3 ימים |

**ההמלצה:** **אופציה B דרך Cardcom**, כי:
- Cardcom כבר מטפל ב-allocation numbers
- כבר ב-skills-il/tax-and-finance (Tier 1)
- Composio יכול לקרוא ל-Cardcom (v2 deep dive B)
- BEE כבר משתמשת ב-Invoice Maven — לבדוק אם הם תומכים, אם לא — לעבור ל-Cardcom

**אם BEE על Invoice Maven (כיום):** לפנות לתמיכה של Invoice Maven — האם הם תומכים SHAAM? אם לא, deadline ינואר → דחוף לעבור.

### 3.3 Cardcom — REST API V11

מ-skills-il/tax-and-finance + cardcom support docs:
- **REST API V11** + legacy endpoints
- **Low Profile** — payment + automatic token creation
- **ChargeToken** — recurring charges על existing token
- כל token charge יוצר אוטומטית חשבונית מס + receipt
- **תאימות:** SHAAM-compliant (יוצר allocation numbers)
- **Auth:** API Key + API Password
- **Test env:** Terminal 1000 + test card `4580000000000000`, CVV 123

**מה ל-BEE:**
- Migration path מ-Invoice Maven ל-Cardcom (אם דחוף):
  - Day 1: signup + test env API working
  - Day 2: import past customers + tokens (manual)
  - Day 3: integrate `alfred-invoice-maven.js` → swap ל-Cardcom API calls
  - Day 4: parallel run — issue 5 invoices both systems → compare
  - Day 5: full cutover
- **חשוב:** Cardcom ב-Composio (v2). זה אומר שני agents (Alfred + Hermes) יוכלו לקרוא דרך MCP.

### 3.4 Bituach Leumi — אין API

מהמחקר: אין public API. דיווח חודשי עוצמאי דורש:
- Login ל-dashboard מקוון
- form 6127 ל-auto-payment via bank withdrawal
- העלאה ידנית או fax

**אופציות אוטומציה:**
- (a) browser-automation skill (יש ל-Hermes) — Playwright ל-login + form fill — 4-6 שעות build, fragile
- (b) RPA חיצוני (כמו UiPath/Microsoft Power Automate Desktop) — overkill
- (c) **לא לאוטומציה** — pay ידני, alert בלבד (recommended)

**המלצה ל-v4:** לבנות `alfred-bituach-reminder.js` (cron 1-5 לחודש) שמתזכר ב-WA, **לא לאוטומציה את הדיווח עצמו**. הסיכון משפטי מ-broken automation גבוה מהפלוס.

### 3.5 Mas Hachnasa — דוחות 102 + 137

- **102** — דיווח חודשי שכר עובדים + ניכוי
- **137** — דיווח שנתי

מ-search: אין API ציבורי לדיווחים אלה. SHAAM API שונה — הוא לחשבוניות outbound, לא לדיווחים פנימיים.

**אופציות:**
- (a) דרך תוכנת חשבונאות (Hashavshevet/Priority) — אם BEE משלמת לתוכנה
- (b) דרך רואה חשבון של BEE — חיצוני, אין צורך לבנות
- (c) רק תזכורות → דחיפה לרוח"ח

**המלצה:** option (c) — `alfred-tax-reminders.js` (cron 5-15 לחודש), לא automation.

### 3.6 BEE compliance dashboard

לבנות panel חדש ב-Alfred dashboard port 8765:
```
/compliance
  ├─ SHAAM status: X invoices this month, Y pending allocation
  ├─ Cardcom status: Z tokens active, $K monthly recurring
  ├─ Bituach Leumi: next due in N days (reminder set)
  ├─ Mas Hachnasa: forms 102 (W), 137 (V) — next due
  └─ regulatory inspections: list with status
```

זמן build: ~3-4h (dashboard exists, just add route).

---

## 4. Voice & Multi-Modal Full Stack — Hebrew End-to-End

### 4.1 Hebrew Speech-to-Text — מה הכי טוב 2026

| מודל / שירות | accuracy | latency | עלות | מומלץ ל-BEE |
|---|---|---|---|---|
| **Speechmatics Hebrew** | 96% (best) | ~1.5s | ~$1.20/hour | ⭐ אם accuracy חשוב |
| **Groq Whisper-large-v3** | 92-94% | 0.5s | $0.04/hour | ⭐⭐ best ROI |
| **ivrit-ai fine-tuned Whisper** | 95% (Hebrew-specific) | 0.5s local / 3.5s | $0 local | אם privacy חובה |
| OpenAI Whisper API | 88% | 1-2s | $0.36/hour | ❌ Groq עדיף |
| AssemblyAI | 87% Hebrew | ~1s | $0.6/hour | ❌ |

**המלצה ל-BEE:**
- **default:** Groq Whisper-large-v3 (כבר בקונפיג של AGENTS.md)
- **upgrade ל-Speechmatics** רק אם יש שגיאות תכופות בtranscription (במיוחד שמות לקוחות, מילים טכניות)
- **fallback ל-WhisperType (local ivrit-ai)** אם דרושה offline-only

**Source:** [WhisperType repo](https://github.com/Danaor/WhisperType), [Speechmatics Hebrew](https://www.speechmatics.com/speech-to-text/hebrew)

### 4.2 Hebrew TTS — ל-Alfred לדבר

| Provider | quality | voice cloning Hebrew | עלות | use case |
|---|---|---|---|---|
| **ElevenLabs Multilingual v2** | מעולה | ✅ Professional 30min audio sample | $0.18/1K chars | ברק כברירת מחדל לקוליות |
| **OpenAI TTS-1-hd** | טוב | ❌ | $0.03/1K chars | זול, generic |
| **Azure Cognitive (Hebrew Avri)** | טוב מעולה | ✅ Custom Neural Voice | $$$ | enterprise only |
| **Coqui XTTS-v2 local** | בינוני | ✅ free | $0 | offline experiments |
| **Piper local** | בסיסי | ❌ | $0 | low-resource |

**המלצה ל-BEE:**
- **Phase 1 (now):** ElevenLabs default Hebrew voice — לתשובות קוליות לברק
- **Phase 2 (אופציונלי):** ElevenLabs voice cloning **של ברק** — Alfred משאיר voice messages בקול של ברק (1min sample). חוסך מהפך-קולי. **שימוש זהיר** — לא לשלוח ללקוחות (deepfake risk).
- **Phase 3 (אסטרטגי):** Custom Hebrew voice "Alfred" — design דרך ElevenLabs Voice Design, sounds professional ולא קל-המבל.

**Source:** [ElevenLabs Hebrew TTS](https://elevenlabs.io/text-to-speech/hebrew), [ElevenLabs Voice Cloning](https://elevenlabs.io/voice-cloning)

### 4.3 PDF Invoice Extraction — Gemini > rest

**Use case BEE:** ספקים שולחים חשבוניות PDF → Alfred צריך לחלץ סכום, מס, פריטים, ולעלות ל-Monday + BEE.DB.

| approach | accuracy invoices | Hebrew text | tables | cost |
|---|---|---|---|---|
| **Gemini 2.5 Pro vision** | 98% | מעולה | ✅ Gemini Layout Parser | $0.005/page |
| **Gemini 3.1 Pro vision** | 99% | מעולה | ✅ | $0.008/page |
| Claude Sonnet 4.6 vision | 95% | מעולה | OK | $0.015/page |
| Tesseract OCR + LLM | 75% | בעייתי | ❌ | $0 + LLM cost |
| Document AI (Google) Custom Extractor | 97% | מעולה | ✅ | $$$ |

**המלצה:** **Gemini 2.5 Pro** דרך Hermes vision tool (כבר בקונפיג).

**Pipeline:**
```
PDF arrived (Gmail / WhatsApp / Drive)
        ↓
Hermes vision tool with prompt:
"Extract from this Hebrew invoice: vendor_name, vendor_id, invoice_number,
date, items[{description, qty, unit_price, total}], subtotal, vat_amount,
total_amount, allocation_number_if_present. Return JSON."
        ↓
Pydantic validation
        ↓
match vendor in BEE.DB → if new, propose add to suppliers
        ↓
Alfred: ⚡ "חשבונית מ-X על ₪Y. לאשר רישום?"
```

**Source:** [Gemini Document Processing](https://ai.google.dev/gemini-api/docs/document-processing), [n8n invoice extraction templates](https://n8n.io/workflows/7239-parse-invoices-and-documents-with-gemini-ai-ocr-and-google-sheets-integration/)

### 4.4 Wake Word "Alfred" — מצב חסום + workaround

מ-search: openWakeWord תומך 20+ languages לcustom training, **אבל Home Assistant מימוש תומך רק אנגלית כרגע**.

**אופציות ל-BEE:**

| approach | feasibility | quality |
|---|---|---|
| **openWakeWord ידני (custom pipeline)** | ✅ — לא דרך HA, ישירות עם הספרייה | Hebrew supported via TTS samples |
| **Picovoice Porcupine Hebrew** | ❌ — Picovoice עדיין לא תומך עברית | n/a |
| **MFCC + simple classifier custom** | ⚙️ — DIY, ~1 week dev | OK ל-clean-audio environment |
| **Use English wake word: "Hey Alfred"** | ✅ trivial | 100% (לא עברית בכלל) |
| **Always-listening (no wake word)** | privacy issue + cost | n/a |

**המלצה ל-BEE:** **"Hey Alfred" באנגלית** ב-Phase 1. אם ברק רוצה עברי 100% — להמתין לעדכון openWakeWord (אפשר לתרום), או לקודד DIY ב-2026 Q4.

**Source:** [openWakeWord GitHub](https://github.com/dscripka/openWakeWord), [Picovoice 2026 guide](https://picovoice.ai/blog/complete-guide-to-wake-word/)

### 4.5 DictaLM 3.0 — Hebrew local LLM

**Released Feb 2026 ע"י Dicta (Hebrew Center for Text Analysis).** Open weights.

| Variant | base | size | tool calling | context | quality (Hebrew) |
|---|---|---|---|---|---|
| **DictaLM-3.0-1.7B** | Qwen3-1.7B | קטן | ✅ | 65K | OK ל-NER/classify |
| **DictaLM-3.0-12B** | Nemotron Nano V2 | בינוני | ✅ | 65K | טוב — proposals draft |
| **DictaLM-3.0-24B** | Mistral-Small-3.1 | גדול | ✅ | 65K | מעולה — outperforms larger multilingual LLMs |
| **DictaLM-3.0-24B-Thinking** | + reasoning | גדול | ✅ | 65K | **+15.7% accuracy** with fewer tokens |

**רלוונטיות ל-BEE:**

| use case | מומלץ | למה |
|---|---|---|
| **PII-sensitive classification** (customer data, ID numbers) | DictaLM-3.0-12B local | לא שולחים ענן |
| **fast NER pre-processing** | DictaLM-3.0-1.7B local | חליפי ל-DictaBERT NER, יותר חכם בbusiness logic |
| **proposal/contract drafting (sensitive)** | DictaLM-3.0-24B-Thinking | privacy + quality |
| **everyday tasks** | ענן (Claude/Gemini) | זה זמין + פיתוח מהיר |

**Deployment:**
- **GPU:** RTX 4070 ומעלה → 12B אפשרי; A100 → 24B raw
- **CPU:** 12B אפשרי עם llama.cpp + quantization Q4 → ~16GB RAM
- **bee-prod-1 (Hetzner CX52, 16GB RAM, no GPU):** רק 1.7B realistic. 12B אפשרי עם heavy quantization אבל איטי.
- **המלצה:** הוסף **GPU machine ל-Hetzner** (CCX23 עם 6vCPU/24GB) או cloud GPU on-demand (Modal/Daytona) ל-jobs sensitive.

**Source:** [Dicta-LM 3.0 paper](https://arxiv.org/pdf/2602.02104), [HuggingFace DictaLM 3.0 collection](https://huggingface.co/collections/dicta-il/dictalm-30-collection)

### 4.6 DictaBERT-NER specifics

מ-`huggingface.co/dicta-il/dictabert-ner`:

**9 entity categories:**
- PER (person)
- LOC (location)
- ORG (organization)
- TIMEX (time expressions)
- GPE (geopolitical)
- TTL (titles)
- WOA (work of art)
- DUC (product)
- EVE (event)

**Training:** NEMO dataset, 6,220 sentences, 7,713 entities

**Performance:** Outperforms all previous Hebrew NER models on benchmarks.

**ל-BEE pipeline (Layer 2 ב-v3):**
- Run DictaBERT-NER local Python service via FastAPI (port 18790)
- ~50ms per message
- Pre-processing לפני כל LLM call
- חוסך ~40% tokens של LLM כי lookup מוקדם

---

## 5. n8n + Workflow Automation Glue

### 5.1 ה-context

n8n היא ה-glue ל-1,200+ integrations שלא נמצאים ב-Composio. בנוסף, היא משמשת כ-MCP host דרך **MCP Server Trigger node**. ב-2026 הוא הוסיף native MCP support.

### 5.2 שני nodes חדשים

| node | תפקיד | רלוונטיות |
|---|---|---|
| **MCP Server Trigger** | n8n workflow = MCP tool | Alfred/Hermes יכולים לקרוא לכל workflow כtool |
| **MCP Client Tool** | n8n קורא ל-external MCP servers | n8n workflow יכול לקרוא ל-Hermes tools |

זה means n8n **גם** server **גם** client — bidirectional integration.

### 5.3 Deployment ל-BEE — self-hosted על bee-prod-1

**זמן setup:** ~1-2h

```bash
# bee-prod-1 (Hetzner CX52)
docker compose -f n8n-compose.yml up -d

# components:
#   n8n     (port 5678, behind nginx/cloudflared)
#   postgres (workflow storage)
#   redis   (queue mode)

# config:
#   N8N_HOST=automation.bee-prod-1.com  (cloudflared tunnel)
#   N8N_PROTOCOL=https
#   N8N_PORT=5678
#   N8N_ENCRYPTION_KEY=<32 random bytes>
#   EXECUTIONS_MODE=queue (for scale)
```

**עלות הוספה:** ~$5-10/month (already runs on existing CX52).

### 5.4 Workflows ראשונים ל-BEE — מצוין 5 שכבר יש templates ב-community

1. **Morning briefing podcast** ([n8n template 8143](https://n8n.io/workflows/8143-morning-briefing-podcast-generate-daily-summaries-with-gemini-ai-weather-and-calendar/)) — Gemini + weather + calendar → audio file → WA send. **ROI: medium**.
2. **Invoice OCR pipeline** ([n8n template 7239](https://n8n.io/workflows/7239-parse-invoices-and-documents-with-gemini-ai-ocr-and-google-sheets-integration/)) — drop PDF in Drive → Gemini extract → Google Sheets row. **ROI: high** (BEE has many supplier invoices).
3. **n8n workflows MCP server** ([template 3770](https://n8n.io/workflows/3770-build-your-own-n8n-workflows-mcp-server/)) — n8n exposes own workflow library כ-MCP server, Alfred discoverable.
4. **Telegram chatbot** — אם Q4 ייפתח בעתיד, n8n workflow קיים.
5. **CRM sync** — Monday ↔ Google Contacts ↔ Mailchimp.

### 5.5 הגיון משלים

**Composio (v2 deep dive B) ו-n8n משלימים זה את זה:**
- Composio: managed cloud, OAuth handled, 850-1000 apps, paid
- n8n: self-hosted, you own state, 1200+ apps, free

**ההמלצה ל-BEE:**
- **Composio:** apps שעדיין לא ב-n8n או שדורשים OAuth מורכב (WhatsApp Business Cloud API, Cardcom)
- **n8n:** הכל אחר — חיבורים אד-הוק, automation מבוססת event, מאחורי תוצאות-ענן privacy

---

## 6. Langfuse — observability לפדרציה

### 6.1 מצב נוכחי

- `daily-cost-alert` (23:30) cron — מודיע על cost spike
- אין token-per-tool, אין trace, אין eval
- אין A/B testing ל-prompts
- v1 federation-plan Wave 4 step 23 הציע "Helicone or Langfuse" — לא נסגר

### 6.2 Langfuse — מה זה

- **Open source MIT**, YC W23
- LLM observability + token tracking + cost analysis + evals + prompt playground
- Integrates: OpenTelemetry, LangChain, OpenAI SDK, LiteLLM, Anthropic SDK
- 100% feature parity bin self-hosted vs cloud (rare)

### 6.3 Self-hosted vs Cloud — תמחור reality check

| option | infrastructure | monthly cost | data sovereignty | מומלץ |
|---|---|---|---|---|
| **Cloud Pro** | n/a (managed) | **$199-300/m** | Anthropic-grade | ✅ ל-BEE |
| **Self-hosted MIT** | PostgreSQL + ClickHouse + Redis + S3 | **$3,000-4,000/m** (with DevOps overhead) | full | ❌ overkill |

**Source:** [Langfuse Pricing 2026 — CheckThat AI](https://checkthat.ai/brands/langfuse/pricing), [Confident AI top observability tools 2026](https://www.confident-ai.com/knowledge-base/compare/top-7-llm-observability-tools)

**ההמלצה ל-BEE: Langfuse Cloud Pro — $199-300/חודש.** 6-10x זול מ-self-hosted. הפדרציה עוד לא בparity scale שמצדיק self-host.

**אם privacy critical:** ה-traces שווים יותר מ-$2,800/חודש דיף — **אז כן self-host**.

### 6.4 Integration

```
                     Alfred (OpenClaw)
                          │
                          ├─→ Anthropic SDK (default)
                          │
                          └─→ wrap עם Langfuse Anthropic adapter
                              auto-traces every call

                     Hermes (Python)
                          │
                          ├─→ OpenAI SDK / Anthropic SDK / LiteLLM
                          │
                          └─→ Langfuse wrapper

                     n8n workflows
                          │
                          └─→ Langfuse n8n integration
                              (כל run = trace)
```

**ROI:**
- Cost monitoring per-skill (today: aggregate only)
- Slow-tool detection
- Token-waste detection (top reason Hermes audited 70 dormant skills wasn't caught)
- Prompt A/B (replay traffic with new prompt to compare)

### 6.5 חלופה — Helicone

Mentioned in v1 Wave 4. Helicone זול יותר (~$50/m), אבל פחות features ופחות built-in integrations עם Anthropic SDK ב-Python.

**ההמלצה:** **Langfuse Cloud Pro** ספציפית עבור BEE. אם budget מאוד tight — Helicone לזמני.

---

## 7. Solar Inverter Modbus Direct Integration

### 7.1 ה-context

BEE כיום משתמשת ב-SolarEdge API (alfred-solaredge.js, **403 active**) + Sungrow API. Modbus TCP direct היא דרך לא תלויה בענן: read inverter local network.

### 7.2 איזה inverters תומכים Modbus TCP

| Brand | Modbus TCP | API support | רלוונטיות BEE |
|---|---|---|---|
| **SolarEdge** | ✅ דרך Modbus Energy Meter add-on | ✅ Cloud API | יש |
| **Sungrow** | ✅ direct LAN | ✅ iSolarCloud API | יש |
| **Deye** | ✅ via WiFi/RS485 (אם connected) | ⚠️ ESS only via Tailscale (handoff F#3) | חלקי |
| **Huawei** | ✅ FusionSolar Modbus TCP | ✅ Cloud | אם BEE מתקין |
| **Growatt** | ✅ ShineMaster | ✅ Cloud | אם BEE מתקין |

### 7.3 בעיה עיקרית של פתרון Modbus

הinverter **חייב להיות באותה רשת מקומית** עם ה-collector — או דרך VPN/Tailscale. ל-BEE שמתקין באתרי לקוחות:
- אופציה A: Tailscale subnet router באתר → bee-prod-1 reads inverter via Tailscale
- אופציה B: Site has device (Raspberry Pi) that reads Modbus + sends to BEE backend
- אופציה C: Stay on cloud APIs (current)

### 7.4 ל-BEE — האם שווה לעבור ל-Modbus direct?

**ROI analysis:**

| מטרה | cloud API | Modbus direct |
|---|---|---|
| reading production | rate-limited 15min | real-time |
| alerts ל-fault | ~5-30min delay | <1min |
| cost | rate-limited free | $0 (after setup) |
| reliability | depends on cloud | depends on site network |
| setup cost | low | high (Tailscale per site, Pi per site) |

**ההמלצה:** **לא לעבור ל-Modbus direct כללי.** רק לאתרי high-value (commercial, large residential) שבהם downtime יקר. אחרים — cloud API מספיק.

**אם דרוש Modbus:**
- שימוש ב-Python script כמו [thomasfa18/solar-sungrow](https://github.com/thomasfa18/solar-sungrow) או [WillCodeForCats/solaredge-modbus-multi](https://github.com/WillCodeForCats/solaredge-modbus-multi)
- expose דרך Hermes כ-MCP tool
- אינטגרציה ל-alfred-solaredge.js (existing) — fallback ל-Modbus אם cloud 403

---

## 8. סיכום — tools להוסיף ל-BEE toolbox

| Tool | Wave מתאים | זמן | ROI | Cost |
|---|---|---|---|---|
| **SHAAM integration (via Cardcom)** | 🚨 **דחוף**, Wave 0+ | 4-6h | חובה משפטית | בקצב Cardcom |
| **Anthropic-skills docx/pdf/xlsx** | Wave 3 | 3h template + 2h integration | High — proposals/contracts | $0 |
| **DictaBERT-NER local service** | Wave 3 (Layer 2 v3) | 3h | High — chuck 40% LLM cost | $0 + RAM 1GB |
| **DictaLM 3.0 (12B) local for PII-sensitive** | Wave 4 | 6-8h setup + GPU acquisition | Medium — privacy | $40-80/m cloud GPU OR one-time GPU box |
| **Gemini 2.5 Pro for invoice OCR** | Wave 3 | 2h (Hermes tool wrap) | High — eliminate manual entry | $0.005/page |
| **ElevenLabs Hebrew TTS** | Wave 4 | 1h | Medium — voice responses | $0.18/1K chars |
| **n8n self-hosted** | Wave 4 | 2h deploy + workflows ongoing | Medium — automation glue | $5-10/m |
| **Langfuse Cloud Pro** | Wave 4 | 2h wire | High — observability | $199-300/m |
| **A2A protocol (MAF SDK)** | future Wave | TBD | Low — not needed now | $0 |
| **Solar Modbus direct (high-value sites only)** | Wave 5+ | 1-2 days per site | Medium — for downtime-critical sites | hardware $50-200 per site |

---

## 9. שינויים מומלצים לתוכניות הקיימות

### v1 federation-plan.md
- **Wave 0 — להוסיף step 6:** SHAAM compliance check. אם BEE על Invoice Maven, לבדוק תאימות **לפני** ינואר 2026 (or June for <10K threshold).
- **Wave 3 — להוסיף step 19.5:** DictaLM 3.0 12B local deployment על bee-prod-1 (אם GPU נוסף) או cloud-on-demand.

### v3 office-automation-architecture.md
- **Layer 2 step 3.2 (DictaBERT NER):** להחליף "DictaBERT" ב-"**DictaBERT-NER specifically** (huggingface.co/dicta-il/dictabert-ner)". 9 entity categories, NEMO benchmark winner.
- **Layer 9 Security:** להוסיף "Compliance corner — SHAAM allocation numbers verifier, monthly Bituach Leumi reminder, quarterly Mas Hahnasa form 102/137 reminders".
- **Capability matrix:** להוסיף "compliance" category — דוחות/חשבוניות/דיווחים.

### v2 federation-plan-v2.md
- **Composio deep dive section 2:** להוסיף Cardcom + WhatsApp Business Cloud כ-Tier 1 (Q16 answer).
- **Frigate deep dive section 4:** להוסיף n8n MCP Server Trigger כ-alternative routing ל-Frigate events.

### tools-deep-audit.md
- **Tier 1 install list — להוסיף:**
  - #23 `dicta-il/dictabert-ner` (HuggingFace) — local Python service for Hebrew NER
  - #24 `anthropic-skills/docx + pdf + xlsx` — already mentioned but emphasize for BEE proposals
  - #25 `n8n self-hosted` — MCP Server Trigger node
  - #26 `langfuse cloud pro` — observability
- **Custom-build candidates — להוסיף:**
  - **`bee-shaam-mcp`** — wraps SHAAM API ל-Hermes/Alfred. **Estimated effort:** 2-3 days. **Priority: HIGH** (deadline-driven).

---

## 10. KPIs חדשים ל-v4

| KPI | מטרה | מדידה |
|---|---|---|
| **SHAAM compliance** | 100% of invoices > threshold cleared | weekly review of issued invoices |
| **Invoice extraction accuracy** | >95% structured fields correct | sample 10/week manually |
| **Document generation savings** | save >30min/proposal | log time stamps |
| **DictaBERT NER hit rate** | >85% entities resolved automatically | track per-pipeline run |
| **Langfuse trace coverage** | >95% of LLM calls traced | dashboard count |
| **Voice TTS user satisfaction** | qualitative — Barak says "natural" | weekly check-in |

---

## 11. שאלות חדשות (Q29-Q34)

| # | שאלה | קריטיות | המלצה |
|---|---|---|---|
| Q29 | **Invoice Maven SHAAM support?** | 🔴 חובה לדעת לפני ינואר | לפנות לתמיכה Invoice Maven מיד |
| Q30 | **Cardcom migration path?** | 🟠 high if Q29=no | ימים 2-5 לפי תיאור 3.3 |
| Q31 | **GPU machine ל-DictaLM 3.0?** | 🟡 medium | Hetzner CCX23 ($45/m) או on-demand cloud (Modal $0.5/h) |
| Q32 | **Langfuse Cloud Pro budget?** | 🟡 medium | $199-300/m approved? |
| Q33 | **n8n self-host vs no?** | 🟡 medium | yes — דר already exists on bee-prod-1 |
| Q34 | **Solar Modbus direct — sites prioritization** | 🟢 low | רק לאתרים commercial/critical |

---

## 12. מקורות נוספים (לא במסמכים קודמים)

### A2A & Multi-agent
- **Microsoft Agent Framework 1.0 GA:** [DevBlogs](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/), [Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/04/06/microsoft-ships-production-ready-agent-framework-1-0-for-net-and-python.aspx)
- **Claude Agent Teams 2026:** [Claude API multi-agent](https://platform.claude.com/docs/en/managed-agents/multi-agent), [claudefa.st agent teams guide](https://claudefa.st/blog/guide/agents/agent-teams)
- **HANDOFF.md pattern:** [mindstudio claude code agent teams](https://www.mindstudio.ai/blog/claude-code-agent-teams-parallel-workflows)

### Hebrew documents
- **Anthropic skills github:** [github.com/anthropics/skills](https://github.com/anthropics/skills)
- **docx skill specifically:** [skills/docx/SKILL.md](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md)
- **skills-il Hebrew Documents:** [agentskills.co.il hebrew-documents](https://agentskills.co.il/en/skills/developer-tools/hebrew-documents)

### Israeli compliance
- **SHAAM e-invoicing:** [Sovos Israel CTC](https://sovos.com/vat/tax-rules/e-invoicing-israel/), [VATupdate 2025-12](https://www.vatupdate.com/2025/12/14/israel-expands-mandatory-e-invoicing-lower-thresholds-and-new-vat-compliance-rules-for-2026/), [KPMG Israel e-invoicing 2025-12](https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-israel-expansion-of-mandatory-e-invoicing-model.html)
- **Cardcom invoice API:** [cardcom support docs](https://support.cardcom.solutions/hc/he/articles/4416393115666-Creating-invoice-via-API), [CARDCOM MCP LobeHub](https://lobehub.com/mcp/tigermedia-cardcom-mcp)
- **Bituach Leumi self-employed:** [aboulafia bituach leumi](https://aboulafia.co.il/en/bituach-leumi-for-self-employed/), [cwsisrael freelancer tax 2026](https://www.cwsisrael.com/freelancer-tax-compliance-in-israel-2026/)

### Voice & Hebrew NLP
- **DictaLM 3.0:** [arxiv paper](https://arxiv.org/abs/2602.02104), [dicta.org.il/dicta-lm-3](https://dicta.org.il/dicta-lm-3), [HuggingFace collection](https://huggingface.co/collections/dicta-il/dictalm-30-collection)
- **DictaBERT-NER:** [HuggingFace dictabert-ner](https://huggingface.co/dicta-il/dictabert-ner)
- **WhisperType (ivrit-ai):** [github WhisperType](https://github.com/Danaor/WhisperType)
- **Speechmatics Hebrew:** [speechmatics.com hebrew](https://www.speechmatics.com/speech-to-text/hebrew)
- **Hebrew NLP Resources NNLP-IL:** [github NNLP-IL Hebrew-Resources](https://github.com/NNLP-IL/Hebrew-Resources/blob/master/models_tools_services.rst)
- **danielrosehill Hebrew AI Models catalog:** [github danielrosehill Hebrew-AI-Models](https://github.com/danielrosehill/Hebrew-AI-Models)

### n8n
- **MCP Server Trigger:** [n8n docs mcptrigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/)
- **n8n 2026 self-host guide:** [automationbyexperts n8n 2026](https://automationbyexperts.com/blog/n8n-ai-workflow-automation-guide-2026)
- **n8n MCP step-by-step:** [generect n8n mcp guide 2026](https://generect.com/blog/n8n-mcp/)

### Observability
- **Langfuse pricing 2026:** [checkthat langfuse pricing](https://checkthat.ai/brands/langfuse/pricing)
- **AgentGateway + Langfuse integration:** [agentgateway langfuse integration](https://agentgateway.dev/blog/2026-02-17-agentgateway-langfuse-integration/)
- **From Helicone to Langfuse n8n:** [medium automation labs langfuse n8n](https://medium.com/@automation.labs/from-helicone-to-self-hosted-langfuse-tracing-n8n-ai-agents-9e3282e07f12)

### Solar Modbus
- **SolarEdge Modbus:** [knowledge-center.solaredge.com api docs](https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf)
- **Sungrow Modbus Python:** [github thomasfa18 solar-sungrow](https://github.com/thomasfa18/solar-sungrow)
- **Multi-inverter Modbus:** [github WillCodeForCats solaredge-modbus-multi](https://github.com/WillCodeForCats/solaredge-modbus-multi)

---

## 13. הוראה לסשן הבא

קח את כל 5 המסמכים יחד:
1. `session-handoff.md` — מה כבר נחקר
2. `federation-plan.md` — תוכנית-בסיס v1
3. `tools-deep-audit.md` — באגים + MCPs
4. `federation-plan-v2.md` — RAG + Composio + sandbox + Frigate
5. `office-automation-architecture.md` — AI Chief of Staff v3
6. **`deeper-tools-research-v4.md`** — זה. כלים נוספים

**העדיפות הגבוהה ביותר ל-action:**
1. 🚨 **SHAAM compliance (סעיף 3)** — Cardcom MCP + Invoice Maven check
2. **Anthropic-skills docx ל-proposal generation** — מהיר ROI
3. **DictaBERT-NER local service** — חיסכון בעלות LLM

**עוד 30 נושאים פתוחים בsection F של handoff.** ב-deep dive הבא הצעות:
- בעיות נשארות (gov.il Cloudflare block, SolarEdge 403 renewal automation)
- Knowledge graph Neo4j על BEE entities
- Tirith deployment actual (security from v2)
- Hindsight setup details
- vLLM Semantic Router

**אין הוראת ביצוע. רק תכנון.** ברק בוחר waves.

---

*נכתב על-ידי הסשן הענני 2026-05-26 Asia/Jerusalem אחרי 12 web searches על 6 deep dive topics לא-מכוסים. ~700+ שורות. ה-finding הקריטי ביותר: SHAAM e-invoicing מנדטורי מ-יוני 2026 על כל חשבונית BEE > 5K ₪. החלטה לעשות מיד.*
