# 📞 Voice & Call Pipeline v5 — Calls + Voice → Tasks + Leads

**נכתב:** 2026-05-26 Asia/Jerusalem
**מאת:** הסשן הענני אחרי 12 web searches על phone+voice+leads+CRM integration
**ממשיך את:** v1+v2+v3+v4. v3 office-automation-architecture כיסה WhatsApp voice notes. **v5 פותח את כל הערוץ הקולי המלא** — שיחות טלפון, voicemail, missed calls, WA voice — והפיכתן ל-leads + tasks ב-Monday + contacts ב-`contacts.md`.

⚠️ **קריטי משפטי:** ישראל = one-party consent (סעיף 2). חוקי, אבל כללי best-practice מומלצים. iOS 18.1+ מקליט אבל **כל המשתתפים שומעים הכרזה אוטומטית** (מקור: Apple Support) — חשוב להבין.

---

## 0. הפער ומה אנחנו ממלאים

לפי AGENTS.md הקיים + audit + v3:
- **WhatsApp voice notes:** ✅ פעיל — Groq Whisper transcription + Alfred classify
- **שיחות טלפון יוצאות (Barak מתקשר):** ❌ חסר לחלוטין
- **שיחות טלפון נכנסות:** ❌ חסר — Alfred לא יודע על שיחה אלא אם ברק כתב משהו ב-WA
- **שיחות שטח טכנאים:** ❌ חסר — אין capture של "ניר התקשר ללקוח X ואמר…"
- **Missed calls:** ❌ אין auto-reply, אין recovery
- **Voicemail:** ❌ אין transcription, אין follow-up

**מה זה אומר ב-BEE day-to-day:**
- ברק מתקשר ללקוח 15 דקות, מסכים על מחיר ₪50K, סוגר בעל-פה. אין רישום. בלי תזכורת. בלי הכרה ל-Monday. שכחה אפשרית.
- לקוח מתקשר ב-13:00 (Barak בפגישה). 6 שעות אחר כך ברק רואה missed call. הלקוח כבר התקשר למתחרה.
- ניר מתקשר מהשטח ללקוח Z להגיד "סיים, החשבון יצא מחר". זה לא מתועד בשום מקום.
- שולחים voicemail ארוך עם פרטים חשובים — ברק לא מקשיב 3 ימים.

**v5 פותר את כל אלה.**

---

## 1. שתי קטגוריות עיקריות + 5 sub-types

| קטגוריה | מי | סוג audio | חיוני? | פרטיות |
|---|---|---|---|---|
| **Phone calls outbound** | Barak/Neri/Shlomi → לקוח | mono, 8-16kHz | ✅✅✅ | one-party consent legal |
| Phone calls inbound | לקוח → Barak | mono | ✅✅ | one-party consent legal |
| Missed inbound | לקוח, ברק לא ענה | metadata only | ✅✅✅ (lead recovery!) | n/a |
| Voicemail | לקוח השאיר הודעה | mono, lower quality | ✅✅ | n/a — לקוח השאיר |
| WhatsApp voice | לקוח/ספק/עובד | OGG opus | ✅ (כבר פעיל) | ה-שולח שלח |

המטרה: **לכידה + תמלול + הפקת ערך** של כולם.

---

## 2. ⚖️ חוקיות הקלטת שיחות ב-ישראל (2026)

**Source:** [Justanswer Israeli law](https://www.justanswer.com/law/mmrjh-want-record-conversation-without-person-knowing.html), [Times of Israel 2-party consent proposal](https://www.timesofisrael.com/netanyahu-mulls-2-party-consent-for-phone-call-recordings/)

| כלל | מצב נוכחי 2026 |
|---|---|
| **חוק האזנת סתר התשל"ט-1979 + שינויים** | ישראל = **one-party consent**: צד אחד לשיחה יכול להקליט בלי להודיע לצד השני |
| הצעה ל-two-party consent (Netanyahu Dec 2016) | **לא עברה** — נשארה חוק one-party |
| הקלטה שמשמשת כראיה בבימ"ש | ביהמ"ש קיבל הקלטות one-party, אבל **כפוף לנסיבות** — לפעמים פסל אם נאסף בכוונה זדונית |
| **השלכה חוקית עקיפה:** | פסיקה — נהג שהקליט בני נתניהו שילם ₪30K פיצוי (פס"ד 606698). זה הקלטה של שיחה פרטית של אחר. |

**המסקנה ל-BEE:**
- ✅ ברק יכול להקליט כל שיחה שהוא צד בה (one-party legal)
- ✅ ניר/שלמי יכולים להקליט שיחות שטח (הם צד)
- ⚠️ **best practice:** אמירת disclaimer בתחילת שיחה — "שלום, שיחה זו עשויה להיות מוקלטת לצרכי שירות". בלי disclaimer ה-recording חוקי, **אבל** ברגע הלקוח גילה ויש lawsuit אחר כך — disclaimer מגן.
- ⚠️ הקלטה של שיחה שברק **לא צד** בה (Neri ↔ לקוח, וברק רוצה ש-Alfred ייכנס) — דורש את אחד הצדדים שיודע

**אופציות compliance ל-BEE:**

| גישה | חוקיות | UX | המלצה |
|---|---|---|---|
| הקלטה sans disclaimer | חוקי | יעיל | ❌ — סיכון משפטי עתידי |
| **Disclaimer לפני כל שיחה (אוטומטי)** | חוקי + מגן | ייעלם הרבה רעש | ✅✅✅ |
| Two-party explicit consent | חוקי + best practice | יוצר חיכוך עם לקוח | רק לשיחות sensitive |
| לא להקליט בכלל | חוקי | מאבד הכל | ❌ |

---

## 3. ארכיטקטורה: Capture → Transcribe → Extract → Route → Follow-up

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 1 — CAPTURE (per device + per channel)                            │
│                                                                          │
│  iPhone iOS 18.1+ native       Android Cube ACR Premium                  │
│  → Notes + Apple Intel.        → auto-record all/selected               │
│  ⚠️ audible announcement       → Google Drive sync                       │
│                                                                          │
│  Mobile2CRM (recommended)      JustCall virtual                          │
│  → business profile sep.       → Israeli numbers 03/04                  │
│  → CRM integrated direct       → voicemail transcription                │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼  (audio file: .m4a / .ogg / .mp3 / .wav)
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 2 — TRANSCRIBE                                                    │
│                                                                          │
│  Priority order (cost vs accuracy):                                      │
│    1. Groq Whisper-large-v3 ($0.04/h, 0.5s latency)  — default          │
│    2. Speechmatics Hebrew (96%, $1.20/h)              — if 1 fails       │
│    3. Deepgram Hebrew (<300ms, real-time)             — if streaming     │
│    4. WhisperType ivrit-ai (local, free, 3.5s)        — if offline only  │
│                                                                          │
│  Output: timestamped Hebrew text + speaker diarization (when possible)   │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼  (Hebrew transcript + metadata)
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 3 — EXTRACT (Hermes LLM + DictaBERT-NER)                          │
│                                                                          │
│  Single LLM call with structured prompt extracts:                        │
│    • Speakers identified (Barak / customer / other)                      │
│    • Action items (commit by Barak, commit by other)                     │
│    • Dates/times mentioned (parsed Hebrew)                               │
│    • Money mentioned (price quoted, payment status)                      │
│    • People + places (entities)                                          │
│    • Lead classification (new/existing/returning customer)               │
│    • Sentiment (positive/neutral/frustrated/urgent)                      │
│    • Deal probability (0-100% based on signals)                          │
│    • Next steps committed                                                │
│    • Topic tags                                                          │
│    • Whether to recommend follow-up + when                               │
│                                                                          │
│  Output: structured JSON validated via Pydantic                          │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼  (JSON proposal)
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 4 — ROUTE (per intent)                                            │
│                                                                          │
│  Each extracted item routes to its proper destination:                   │
│    • Lead detected → Monday "Leads" board create item                   │
│    • Existing customer interaction → Monday "Activities" log + contacts │
│    • Task committed → task_queue.jsonl + TASKS.md                       │
│    • Calendar item → Google Calendar event                              │
│    • Payment mentioned → Cardcom/Invoice Maven follow-up flag           │
│    • Equipment/site mentioned → sites/<X>.md update                     │
│    • Knowledge → MEMORY.md / contacts.md                                │
│                                                                          │
│  All routes go through Layer 4 approval gate from v3 (default L0)        │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 5 — FOLLOW-UP (the proactive part)                                │
│                                                                          │
│  Auto-trigger workflows based on call outcomes:                          │
│    • Missed call → SMS/WA back within 30s                               │
│    • Voicemail received → transcribe + propose callback time            │
│    • "אחזור אליך מחר" mentioned → schedule reminder + task              │
│    • Price quoted → 24h follow-up if no payment confirmation            │
│    • Lead interest signal → next-day follow-up draft                    │
│    • Customer frustrated → escalate priority + alert                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer 1 Capture — בחירת כלי per device

### 4.1 iPhone (אם Barak iPhone)

**iOS 18.1+ native:** [Apple support](https://support.apple.com/guide/iphone/record-and-transcribe-a-call-iph57c6590e9/ios)
- ✅ עובד בישראל (לא ברשימת המדינות החסומות)
- ✅ הקלטה + transcript (שני הצדדים) + Apple Intelligence summary
- ✅ נשמר ב-Notes app
- ⚠️ **מודיע אוטומטית לצד השני שמקליט** ("This call is now being recorded")
- ⚠️ דורש iPhone 15 Pro/Max ומעלה ל-Apple Intelligence (Summary). הקלטה זמינה רחב יותר.

**מסקנה ל-iPhone Barak:**
- Phase 1: השתמש native iOS 18.1 — הכרזה אוטומטית = ה-disclaimer כבר כלול. **חוקי, נקי**.
- Phase 2: Apple Intelligence summary ב-Notes → sync ל-iCloud → Alfred reads Notes/iCloud (דרך MCP)
- ROI: 0 setup, $0/m

### 4.2 Android (אם field techs Android)

**Cube ACR Premium:** [cubeacr.app](https://cubeacr.app/)
- ✅ הקלטה אוטומטית — כל השיחות או רק נבחרים
- ✅ הקלטת WhatsApp / Viber / Skype / LINE קולי
- ✅ Google Drive sync built-in
- ✅ Premium: transcription + PIN lock + cloud backup
- Cost: ~₪150/year per device
- ⚠️ אין הכרזה אוטומטית — צריך לשים disclaimer voice ידני בתחילת שיחה (Cube ACR יודע לנגן disclaimer)

**Truecaller (גם)**: built-in call recording בארצות שמותר, Secure Cloud Sync.

**מסקנה ל-Android:**
- Cube ACR Premium עם Auto-record selected contacts (לקוחות בלבד, לא משפחה)
- Auto-upload ל-Drive → folder watcher של Alfred / Hermes
- Cost: ₪450/year (3 מכשירים)

### 4.3 Mobile2CRM (ה-Israeli option) — המומלץ אם BEE רוצה enterprise-grade

**Source:** [mobile2crm.com](https://mobile2crm.com/), Israeli startup

מה זה:
- מפצל ה-cellphone ל-virtual business profile נפרד
- כל שיחה/WA/SMS/Teams **על profile עסקי** נקלטת אוטומטית ל-CRM
- אינטגרציה מקורית: Salesforce, HubSpot, Pipedrive, ServiceNow, NICE, Verint, Audiocodes
- ⚠️ **לא רואה Monday.com ברשימה הציבורית** — לפנות לתמיכה לבדוק
- Israeli טלפוניה מודעת — Cellcom/Partner/Pelephone aware
- Compliance-grade — בנוי לחברות ביטוח + פיננסים

**יתרון מעל Cube ACR:**
- separation ברורה personal/business (פרטיות מהמעסיק/כלל)
- compliance-ready (משפטי + tax records)
- אין צורך באפליקציה נפרדת לכל פלטפורמה

**חיסרון:**
- enterprise pricing (אין quote ציבורי — צריך לפנות)
- אולי overkill ל-BEE כעת

**המלצה:** **לא** עכשיו. להתחיל עם iOS native + Cube ACR. אם BEE מתרחבת ויש 5+ field techs → Mobile2CRM שווה לפנות.

### 4.4 JustCall — Israeli virtual numbers

**Source:** [justcall.io Israel](https://justcall.io/hub/business-phone/israel/)

- Israeli local numbers — 03 (תל אביב), 04 (חיפה), 02 (ירושלים), etc.
- Voicemail transcription built-in (95%+)
- AI-powered missed call automation
- SMS automation
- ~$30/user/month

**שימוש פוטנציאלי ל-BEE:**
- מספר עסקי נפרד שלא חושף את הסלולרי הפרטי של ברק
- כל שיחה נקלטת + מתומללת + נכנסת ל-pipeline
- Voicemail "אחזור אליך תוך X" אוטומטי

**שיקול:** מספר חדש = צריך לפרסם ולחזק. Barak כבר על +972509554483 — לא קל להחליף.

**המלצה ל-v5:**
- Phase 1: השאר על הסלולרי הקיים, השתמש ב-iOS native / Cube ACR
- Phase 2 (אופציה): JustCall כ-"מספר עסק קדמי" שלא שולל את הקיים, לפרסום אתר + Monday + email signature
- Phase 3 (אם BEE גדלה): Mobile2CRM full federation

---

## 5. Layer 2 Transcribe — Hebrew engines compared

| Engine | accuracy Hebrew | latency | cost/hour | מקור |
|---|---|---|---|---|
| **Groq Whisper-large-v3** | 92-94% | 0.5s | **$0.04** | [groq.com](https://groq.com/) |
| **Speechmatics Hebrew** | **96%** | ~1.5s | $1.20 | [speechmatics.com hebrew](https://www.speechmatics.com/speech-to-text/hebrew) |
| Deepgram Hebrew Israeli | 90% | **<300ms** | $0.43 | [deepgram.com hebrew](https://deepgram.com/product/speech-to-text/hebrew) |
| Sonix Hebrew | 85-99% | 10x real-time batch | $10/h | [sonix.ai hebrew](https://sonix.ai/languages/transcribe-hebrew-audio) |
| Soniox Hebrew | competitive | real-time | varies | [soniox.com](https://soniox.com/speech-to-text/hebrew) |
| HappyScribe Hebrew | competitive | batch | $0.12/min ($7.20/h) | [happyscribe.com hebrew](https://www.happyscribe.com/transcribe-hebrew) |
| **WhisperType (ivrit-ai local)** | 95% Hebrew-specific | 3.5s local / 0.5s Groq | **$0 local** | [github WhisperType](https://github.com/Danaor/WhisperType) |
| Apple Intelligence (iOS 18.1+) | 90% est. (Hebrew not announced explicitly) | post-call | **$0 built-in** | [apple support](https://support.apple.com/guide/iphone/record-and-transcribe-a-call-iph57c6590e9/ios) |

**המלצה stack ל-BEE:**

```
default:     Groq Whisper-large-v3 ($0.04/h)
  ↓ if Hebrew transcript looks broken
fallback:    Speechmatics Hebrew ($1.20/h)
  ↓ if streaming needed (live voicemail flow)
real-time:   Deepgram Hebrew Israeli (<300ms)
  ↓ if Barak wants 100% privacy / no cloud
offline:     WhisperType ivrit-ai (local on bee-prod-1)
```

עלות אומדן: 100 שיחות × 5min ממוצע = 500min = 8.3h × $0.04 = **~$0.33/חודש**. אפסי.

---

## 6. Layer 3 Extract — מה ה-LLM שולף מתמלול

### 6.1 ה-schema המבנה

```python
from pydantic import BaseModel, Field
from enum import Enum

class Sentiment(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    FRUSTRATED = "frustrated"
    URGENT = "urgent"

class CallType(str, Enum):
    LEAD_NEW = "lead-new"
    LEAD_FOLLOWUP = "lead-followup"
    EXISTING_CUSTOMER = "existing-customer"
    INTERNAL_TEAM = "internal-team"
    SUPPLIER = "supplier"
    INSPECTOR = "inspector"
    UNKNOWN = "unknown"

class ActionItem(BaseModel):
    description: str
    owner: str  # barak / customer / neri / shlomi
    due_date: str | None  # ISO date if mentioned
    confidence: float = Field(ge=0, le=1)

class CallAnalysis(BaseModel):
    call_id: str
    duration_seconds: int
    participants: list[str]  # ["barak", "+972...", ...]
    call_type: CallType
    sentiment: Sentiment
    summary_he: str  # 1-3 sentence Hebrew summary
    
    # Lead specific
    is_lead_signal: bool
    lead_quality_score: int = Field(ge=0, le=100)  # 0-100 lead quality
    deal_probability: int = Field(ge=0, le=100)  # if it's a sales call
    estimated_value_NIS: int | None
    
    # Extracted entities
    customers_mentioned: list[str]
    sites_mentioned: list[str]
    equipment_mentioned: list[str]
    competitors_mentioned: list[str]
    
    # Actions
    action_items: list[ActionItem]
    next_call_proposed: str | None  # date
    
    # Money
    prices_mentioned_NIS: list[int]
    payment_committed: bool
    payment_due_date: str | None
    
    # Routing hints
    monday_board_target: str  # "Leads" | "Activities" | "Deals" | ...
    requires_followup: bool
    followup_priority: str  # "low" | "normal" | "high" | "urgent"
    followup_window: str  # "1h" | "24h" | "1w"
    
    # Quality
    overall_confidence: float = Field(ge=0, le=1)
    needs_human_review: bool
```

### 6.2 LLM prompt template (Hebrew-aware)

```
מערכת:
אתה analyst של שיחות BEE — חברת התקנות חשמל וסולאר.
קיבלת תמלול של שיחת טלפון בעברית. הוצא JSON לפי schema מצורף.

הקשר:
- BEE = חברה ישראלית, ברק בעלים. עובדים: ניר (טכנאי) + שלמי (sales solar).
- לקוחות: residential + commercial + industrial.
- אתרים פעילים מוכרים: [from sites/]
- ספקים מוכרים: [from suppliers list]

תמלול:
[HEBREW TRANSCRIPT]

מטא-נתונים:
- duration: 4:32
- caller_id: +972509554483 (Barak) → +972549999999 (לקוח לא ידוע)
- date: 2026-05-26 14:23

הנחיות:
1. דובר הראשי = ברק
2. סווג sentiment על-בסיס lyrics + טון (מהתמלול)
3. lead_quality_score: 0-30 = cold, 30-60 = warm, 60-80 = hot, 80+ = ready-to-buy
4. action_items: רק מחויבויות מפורשות ("אני אעשה X")
5. הוצא JSON תקף בלבד.
```

הקשר ה-system prompt גדל לפי roster (Q21 ב-v3), sites, suppliers, recent calls.

### 6.3 Lead scoring rubric (BEE-specific)

| Signal | +Score |
|---|---|
| ביקש הצעת מחיר | +30 |
| נתן תקציב | +20 |
| הזכיר deadline | +15 |
| הזכיר מתחרה שמציע מחיר | +25 |
| ביקש לחזור עם פרטים | +10 |
| "חבר המליץ עליכם" | +15 |
| הזכיר אתר ספציפי + לוקיישן | +10 |
| ביקש לקבוע פגישה | +20 |
| הזכיר שותף לקבלת החלטות | +5 |
| **תוצאה:** | sum, cap 100 |

| Anti-signal | -Score |
|---|---|
| "רק בודק מחירים" | -15 |
| ביקש "תשלחו catalog" בלי commitment | -10 |
| לקוח חוזר עם תלונה | -5 (אבל marks "existing customer") |
| אמר "אחשוב על זה" וניתק | -20 |

### 6.4 Pattern detection דרך episodic memory

מ-Layer 6 (memory) ב-v3: לכל קריאה — checkagain אם הלקוח התקשר בעבר.
- אם כן: "פעם שלישית מתקשר השבוע — followup פושר" → priority high
- אם פתח deal לפני 30 ימים שלא נסגר: "warm followup needed"
- אם לקוח קיים שמתלונן 2 פעמים: escalate

---

## 7. Layer 4 Route — איפה כל פרט נכנס

| extracted | יעד | פעולה |
|---|---|---|
| `is_lead_signal=true` + customer לא קיים | Monday "Leads" board | create item + lead_quality_score + summary |
| `is_lead_signal=true` + customer קיים | Monday "Activities" + contacts.md | log activity |
| `existing-customer` + תקלה | Monday "קריאות" | create urgent ticket |
| `action_items` בעלי `owner=barak` | task_queue.jsonl + TASKS.md | nudge cron |
| `action_items` בעלי `owner=customer` | contacts.md "אצלם" | tracker |
| `next_call_proposed` | Google Calendar | event "שיחה עם X" |
| `payment_committed=true` | Cardcom + Invoice Maven | flag for invoice within 24h |
| `equipment_mentioned` + new | sites/<X>.md or roster | skeleton |
| call_summary | contacts.md (existing) או leads_log.jsonl | append |
| **Always:** | episodic_events.jsonl | full append |

### 7.1 Monday.com Leads board — structure מומלץ

```
שם הלקוח       | מקור (call/WA/email/referral) | תאריך first contact
טלפון          | מייל                          | אזור (city)
Lead score     | Sentiment                     | Deal probability
Estimated NIS  | Status (new/contacted/quoted/won/lost)
Last call ID   | Last call summary             | Next followup date
Tags           | Notes                         | Owner (Barak/Shlomi)
```

Webhook: ברגע שמשנים status → Hermes capture → trigger relevant cron (e.g., status="quoted" → cron for 3-day followup if no response).

---

## 8. Layer 5 Follow-up — automation flows

### 8.1 Missed call recovery (ROI הגבוה ביותר!)

**Source data:**
- response in 5min = **21x lead qualification** vs 30min (signpost research)
- SMS open rate 98% vs voicemail (where most ignore)

**Flow:**
```
phone receives missed call
        ↓ <30s
auto WA/SMS:
"היי, ראיתי שהתקשרת אליי. עכשיו לא נוח לי לדבר.
 אחזור אליך:
   - תוך שעה
   - מחר בבוקר
   - תשלח מסר?
 ⚡ ברק / BEE"
        ↓ (response)
classify intent → route
```

**מימוש concrete:**
- אם iOS — Shortcut + Personal Automation triggers on missed call → run shortcut that sends WA
- אם Android — Cube ACR has webhook hooks, or use Tasker
- אם Mobile2CRM — built-in feature

**ROI ל-BEE:** ב-50 missed calls/חודש, אם 10% מובילות ל-quote = 5 leads, ב-30K NIS ממוצע per quote × 30% close rate = **₪45K/חודש פוטנציאל יושב ב-missed calls**.

### 8.2 Post-call follow-up

```
לאחר שיחה שהיא lead מנותח
        ↓
delay 24h
        ↓
check status: did anything happen?
  • new email from lead? (Gmail watch)
  • new WA from lead?
  • Monday status changed?
        ↓ if nothing
auto draft followup:
"היי X, רציתי לוודא שקיבלת את הפרטים. יש שאלות?"
        ↓
ברק approves 👍 → send
or 24h → escalate to dashboard
```

### 8.3 Voicemail flow

```
voicemail received (JustCall או carrier voicemail)
        ↓
audio file → Layer 2 transcribe (Hebrew)
        ↓
Layer 3 extract: who, what, when needed
        ↓
Alfred ⚡ Barak:
"📞 voicemail מ-+972...:
'היי ברק, זה X מהפרויקט Y. צריך אישור על שינוי תכנון, דחוף.'

 מבחינתי: lead urgency=high, callback within 2h proposed.
 לחזור? 👍 = הצעת מחיר חוזרת. ✏️ = לשנות.

 reading the original voicemail audio: [link]"
```

### 8.4 Long-term lead nurturing

leads שלא נסגרו ב-30 ימים → drip campaign אופציה:
- T+7: SMS "היי, אם יש לך שאלות"
- T+14: WA עם case study רלוונטי
- T+30: WA "עדכון מחירים שעוד תקף"

**אזהרה:** spam risk. WhatsApp Business אסור outbound לא-mediated > 24h. צריך opt-in flow.

---

## 9. תרחישים end-to-end

### 9.1 תרחיש: ברק מתקשר ללקוח חדש (outbound)

```
14:00 ברק מתקשר ל-+972549999999 (lead מ-Monday "Leads")
14:00:05 iOS 18.1 הכריז "this call may be recorded"
14:00:08 ברק מתחיל לדבר
14:18:00 שיחה מסתיימת (18min)
        ↓
14:18:01 iOS שומר recording + transcript ב-Notes
        ↓ (Alfred polls iCloud Notes כל 30s)
14:18:30 Alfred זיהה new note → upload to Hermes
        ↓
14:18:35 Hermes ↳ Groq Whisper transcribe → 4,200 words
14:18:42 Hermes ↳ Claude Sonnet extract → JSON:
            {
              call_type: "lead-new",
              lead_quality_score: 78,  # hot
              deal_probability: 65,
              estimated_value_NIS: 85000,
              sentiment: "positive",
              action_items: [
                {owner: "barak", description: "לשלוח הצעת מחיר מפורטת",
                 due_date: "2026-05-27"},
                {owner: "customer", description: "לשלוח תמונות אתר",
                 due_date: "2026-05-28"}
              ],
              next_call_proposed: "2026-05-29 10:00",
              prices_mentioned_NIS: [85000, 90000],
              summary_he: "לקוח X מ-Y, מעוניין במערכת 10kWp..."
            }
14:18:50 Alfred routing:
            • Monday "Leads" → create item "X" score=78
            • Monday "Activities" → log call
            • task_queue → "לשלוח הצעת מחיר" priority=high due tomorrow
            • Google Calendar → event "שיחה עם X" 29/5 10:00
            • contacts.md → append entry
            • episodic_events.jsonl → full log
        ↓
14:18:55 Alfred ⚡ Barak:
            "📞 שיחה עם X (18min) — Lead score 78/100 🔥
             • הוסף ל-Monday Leads
             • הוסף משימה: לשלוח הצעה (מחר)
             • הוסף ל-יומן: שיחה ב-29/5 10:00
             • היה בסדר? 👍 / ✏️"
```

**זמן מתחילת שיחה לתיעוד מלא: ~55 שניות.** המידע יושב במערכות.

### 9.2 תרחיש: שיחת תלונה דחופה (inbound)

```
13:23 ברק בפגישה. iPhone צלצל. ברק לא ענה.
        ↓ <30s
iOS auto-shortcut (Personal Automation: "When call missed") →
  shortcut runs → POST to alfred-webhook
        ↓
Alfred check sender: +972541234567 → contacts.md → "X, customer, אתר ירוחם"
Alfred check episodic: לקוח X פעמים פעילות 5 ימים אחרונים? כן — 2 שיחות
        ↓
Alfred classify: customer existing + missed call → likely follow-up or complaint
        ↓
Alfred auto-send WA:
   "היי X, ראיתי שהתקשרת. עכשיו לא נוח לי, אחזור אליך תוך 30 דקות.
    אם דחוף — תשלח לי כאן בWA. ⚡ ברק"
        ↓
13:24 customer reply WA: "השוט עוסם, אין חשמל בכלל!"
        ↓
Alfred classify: client-fault + urgent (חשמל מנותק)
Alfred lookup site: ירוחם → site_id=yeruham → tech=ניר
Alfred ⚡ Barak: "📞 X (ירוחם) דיווח על השבתת חשמל. ניר זמין מ-14:00.
                   להפיק קריאה דחופה ב-Monday + להודיע לניר? 👍"
        ↓
Barak finishes meeting, sees alert, 👍
        ↓
Alfred: 
   • Monday "קריאות" → urgent ticket
   • SMS Neri "ברק מבקש שתלך ל-X ירוחם, חשמל מנותק. urgent."
   • WA X: "ניר בדרך תוך שעה. עדכון יגיע אליך."
```

**זמן מ-missed call לתגובה ראשונית: <30 שניות. מ-tech dispatch: <5min**.

### 9.3 תרחיש: ניר מתקשר מהשטח (field call)

```
ניר באתר Z, מתקשר ללקוח Z להגיד "סיימתי, החשבון יוצא מחר"
        ↓
Cube ACR Premium on Neri's Android: auto-record (Z ב-allowed list)
        ↓
Cube ACR upload to Google Drive folder /bee-shared/calls/neri/2026-05-26/
        ↓ (Alfred has Drive watcher cron every 5min)
Alfred detects new file → Hermes transcribe → extract
        ↓
extract: 
  • participants: [neri, customer_z]
  • action_items: [{owner: barak, description: "להפיק חשבון ל-Z", due: tomorrow}]
  • job_status: "completed"
  • site: yeruham (already known)
        ↓
Alfred ⚡ Barak (during evening briefing):
  "ניר היום סיים את Z ירוחם. הוא הבטיח חשבון מחר.
   להפיק automatic invoice via Cardcom?
   או טיוטה לבדיקה ידנית?"
```

ברק מאשר → Cardcom יוצר טוקן + חשבונית עם allocation number מ-SHAAM → נשלחת ל-Z.

### 9.4 תרחיש: voicemail מ-supplier

```
ספק Prime Energy השאיר voicemail (Barak לא ענה, voicemail אצל הסלולרי):
"שלום ברק, זה רן מ-Prime. ההזמנה לפאנלים של כפר יובל מוכנה למשלוח מחר.
 צריך לדעת האם להוריד את הסחורה באתר או לאחסון.
 רן 052-..."
        ↓
JustCall (if configured) או manual upload of voicemail audio
        ↓
transcribe + extract:
  • call_type: supplier
  • participants: [rran_prime_energy]
  • action_items: [{owner: barak, description: "להחליט: אתר vs אחסון",
                    due: tomorrow}]
  • equipment_mentioned: [panels-kfar-yuval-order]
        ↓
Alfred ⚡ Barak (morning agenda next day):
  "🎤 voicemail מ-רן Prime Energy:
   ההזמנה לכפר יובל מוכנה למשלוח מחר.
   צריך החלטה היכן להוריד.
   
   המלצה (לפי sites/kfar-yuval.md):
     'גישה לאתר ב-תאריך X — Neri יהיה שם' → לאתר ישירות
     
   👍 = לאשר לאתר. ✏️ = לבחור אחסון."
```

---

## 10. Privacy + Compliance — full picture

### 10.1 Recording disclosure best practices ל-BEE

מומלץ implement את כל אלה:

| מקום | פעולה |
|---|---|
| Email signature | "שיחות עשויות להיות מוקלטות לצרכי שירות ושיפור" |
| WhatsApp Business profile (אם תופעל) | "Calls and messages may be recorded" |
| iOS native | אוטומטי — Apple already announces |
| Android Cube ACR | להגדיר recorded disclaimer voice |
| Mobile2CRM | virtual business number + standard disclosure |

### 10.2 GDPR + Israeli Privacy Protection Act

חוק הגנת הפרטיות התשמ"א-1981 (עודכן 2025):
- כל איסוף PII דורש purpose + retention period
- הקלטות = PII (קולו של אדם = identifier biometric)
- BEE כ-controller צריך:
  - לתעד מטרת הקלטה (service improvement, training, dispute resolution)
  - retention policy (recommendation: 2 years)
  - מקום אחסון מתועד
  - access controls

### 10.3 Where to store recordings — proposal

```
Tier 1 — hot (last 30 days)
  Location: bee-prod-1 (Hetzner Israel/EU)
  Encryption: at-rest + in-transit
  Access: Barak + Hermes (read-only)
  Purpose: extraction + analysis

Tier 2 — warm (30-180 days)
  Location: Google Drive shared (Israeli residency option)
  Encryption: Google-managed
  Access: Barak + Alfred
  Purpose: occasional re-review

Tier 3 — archive (180+ days)
  Location: Hetzner cold storage / Backblaze B2
  Encryption: client-side AES-256
  Access: Barak only, request-based
  Purpose: legal/dispute evidence
  Retention: 2 years then delete (or longer if dispute active)
```

### 10.4 Sensitive content redaction

לפני שולחים transcript ל-LLM cloud (Anthropic, Gemini, OpenAI):
- ID numbers (תעודת זהות): regex `\d{9}` → REDACTED
- Credit card-like: regex → REDACTED
- Bank account numbers: REDACTED
- Phone numbers: keep last 3 digits, mask rest
- Email: keep domain, mask local part

זה Layer חדש ב-Layer 3 — `redactor()` pre-LLM.

---

## 11. Integration עם Alfred + Hermes הקיימים

### 11.1 שינוי MEMORY.md / contacts.md

**contacts.md היום** (per AGENTS.md):
- DMs only (לא groups)
- per-contact: name, phone, last_seen, sentiment_drift, tags

**הוספת v5 לכל contact:**
```
- call_count_30d: int
- last_call_id: ULID
- last_call_summary: str (short)
- avg_call_duration: int (seconds)
- preferred_contact_time: str (morning/afternoon/evening)
- common_topics: list[str]
- relationship_health: float (-1 to 1)
```

### 11.2 Alfred dashboard — new routes

הוסף ל-`http://127.0.0.1:8765`:
- `/calls` — recent calls list with summaries
- `/calls/<id>` — full call detail + transcript + actions taken
- `/leads` — Monday Leads sync + scores + next-action
- `/missed` — missed calls awaiting follow-up

### 11.3 Cron jobs חדשים

| cron name | timing | פעולה |
|---|---|---|
| `call-folder-watcher` | every 5min | scan Drive folders + iCloud Notes for new recordings |
| `missed-call-recovery-check` | every 10min | ensure all missed calls have an outgoing WA reply |
| `voicemail-process` | every 15min | check JustCall voicemail queue |
| `lead-followup-due` | daily 09:00 | leads in Monday with status=quoted >3 days → follow-up draft |
| `cold-lead-nurturing` | weekly Mon 10:00 | leads status=no-response >30 days → opt-in drip prompt |

---

## 12. עלות אומדן ל-BEE

נניח שימוש ממוצע:
- 50 phone calls/חודש × 8min ממוצע = 400min = 6.7h
- 30 WA voice notes/חודש × 2min ממוצע = 60min = 1h
- 20 voicemails/חודש × 1min ממוצע = 20min = 0.33h

**Voice processing:**

| component | usage | unit cost | monthly |
|---|---|---|---|
| Groq Whisper transcribe | 8h | $0.04/h | **$0.32** |
| Claude Sonnet extract | 100 calls × ~3K tokens | $3/M | **$0.90** |
| DictaBERT-NER local | unlimited | $0 (local) | $0 |
| Cube ACR Premium | 3 devices | ₪150/year each | **₪38/month** ≈ $10 |
| iOS native | included | $0 | $0 |
| Total monthly | | | **~$11** |

**Optional upgrades:**
- JustCall: $30/user/month = $30 (1 number)
- Speechmatics fallback (rarely): negligible (~$0.10/m)
- Langfuse Cloud Pro tracing: $199/m (covers all of BEE, not just calls)
- Mobile2CRM: enterprise — ask quote

**Net minimal cost: ~$11/month** עבור pipeline פעיל מלא. **ROI:** estimated value of 1 saved lead per month from missed call recovery alone ≫ $11.

---

## 13. שינויים מומלצים לתוכניות הקיימות

### v3 office-automation-architecture.md
- **Layer 1 Capture (סעיף 2 ב-v3):** הוסף `phone_calls` channel (iOS native / Cube ACR / JustCall / Mobile2CRM)
- **Layer 2 Understanding intent (v3 3.1):** הוסף 4 intents חדשים:
  - `phone-call-outbound` (Barak called)
  - `phone-call-inbound-answered`
  - `phone-call-missed`
  - `voicemail`
- **Layer 8 Briefing:** הוסף section "calls today" ל-evening briefing
- **Layer 9 Security:** הוסף retention policy 2-tier (hot/warm/archive)

### tools-deep-audit.md
- **Tier 1 install list — הוסף:**
  - #27: **Cube ACR Premium** (Android only, ₪150/year/device)
  - #28: **iOS 18.1+ native Call Recording** (free, iPhone only)
  - #29: **Groq Whisper-large-v3 API** (configured already in AGENTS.md likely, formalize)
- **Tier 2 (if scale grows):**
  - #30: **Mobile2CRM** — Israeli, enterprise-grade
  - #31: **JustCall** — Israeli numbers + voicemail transcription

### tools-deep-audit.md Q section
- הוסף Q35: "האם iOS auto-announce תקבל מהלקוחות?" — ייתכן שלא ברק אוהב — בודקים בפיילוט
- הוסף Q36: "iOS או Android primary device לברק?" קובע אסטרטגיה

---

## 14. KPIs ל-Voice Pipeline

| KPI | מטרה | מדידה |
|---|---|---|
| **Calls captured rate** | >95% של business calls | per-device check |
| **Transcription accuracy Hebrew** | >90% | sample 5/week manual check |
| **Lead extraction precision** | >80% (true positives) | weekly Barak review |
| **Lead extraction recall** | >70% (don't miss leads) | quarterly missed-leads audit |
| **Missed call → response time** | <60s | from missed_call event to WA sent |
| **Missed call recovery rate** | >40% (lead engaged after WA) | rate of follow-throughs |
| **Voicemail → action time** | <2h | transcribed + first action proposed |
| **False positive escalations** | <5/week | "urgent" calls that weren't |
| **Storage cost** | <$20/month | Drive + Hetzner |
| **Compliance audit** | 100% recordings have disclosure trail | quarterly |

---

## 15. שאלות חדשות (Q35-Q42)

| # | שאלה | קריטיות |
|---|---|---|
| Q35 | **iOS או Android primary device לברק?** | High — קובע tool choice |
| Q36 | האם BEE רוצה **virtual business number נפרד**? (JustCall או Mobile2CRM) | High — privacy + brand decision |
| Q37 | **Cube ACR ב-Neri/Shlomi?** הם מסכימים להקליט? | High — practical adoption |
| Q38 | **Apple iOS auto-announce** — מקובל על לקוחות BEE? | Medium — test with 5 calls first |
| Q39 | **Storage location for recordings** — Hetzner Israel? Google Drive? local NAS? | High — privacy + cost |
| Q40 | **Retention period** — 2 שנים? אחרת? | Medium — Israeli law min 7 years for tax-related, 5 for others typically |
| Q41 | **Lead board structure ב-Monday** — קיים? לבנות מחדש לפי 6.1 הצעה? | High — affects routing |
| Q42 | **DictaBERT-NER local** — להריץ כPython service על bee-prod-1? | Medium — already planned in v3 |

---

## 16. Wave additions ל-tu existing waves

| Wave | תוספת v5 | זמן | תלות |
|---|---|---|---|
| **Wave 1.6** (חדש) | iOS Shortcut for missed-call auto-WA | ~1h | iOS device |
| **Wave 2.5** (חדש) | Cube ACR install + Drive folder watcher | ~2h | Android device |
| **Wave 3.5** (חדש) | Voice pipeline Layer 2+3 (transcribe + extract) | ~6h | DictaBERT-NER service exists |
| **Wave 3.6** (חדש) | Voice pipeline Layer 4 routing | ~4h | Monday MCP working |
| **Wave 3.7** (חדש) | Voice pipeline Layer 5 follow-up automation | ~4h | wave 3.5+3.6 done |
| **Wave 4.5** (חדש) | Lead nurturing drip campaign | ~3h | wave 3.7 done |
| **Wave 4.6** (חדש) | Mobile2CRM evaluation pilot (if scale grows) | ~4h | optional |

**Total addition:** ~24h ל-v5. Cumulative: ~125h (v1-v5).

---

## 17. מקורות (חדשים)

### Israeli call recording law
- [Justanswer — Israel one-party consent](https://www.justanswer.com/law/mmrjh-want-record-conversation-without-person-knowing.html)
- [Times of Israel — 2-party consent proposal (never passed)](https://www.timesofisrael.com/netanyahu-mulls-2-party-consent-for-phone-call-recordings/)
- [Carol Hauser LinkedIn — Israel call recording legal](https://www.linkedin.com/posts/carolhauser_did-you-know-that-in-israel-you-can-legally-activity-7274706895095943168-fT5e)

### Phone capture tools
- [Apple Support — iOS call recording](https://support.apple.com/guide/iphone/record-and-transcribe-a-call-iph57c6590e9/ios), [MacRumors iOS 18.1 guide](https://www.macrumors.com/how-to/ios-record-your-phone-calls/)
- [Cube ACR](https://cubeacr.app/), [Cube ACR FAQ](https://cubeacr.app/faq.html)
- [Mobile2CRM (Israeli)](https://mobile2crm.com/), [Mobile2CRM Salesforce listing](https://appexchange.salesforce.com/appxListingDetail?listingId=a0N3A00000FoiThUAJ)
- [JustCall Israeli numbers + voicemail](https://justcall.io/hub/business-phone/israel/)

### Hebrew transcription
- [Sonix Hebrew](https://sonix.ai/languages/transcribe-hebrew-audio)
- [Speechmatics Hebrew](https://www.speechmatics.com/speech-to-text/hebrew)
- [Deepgram Hebrew Israeli](https://deepgram.com/product/speech-to-text/hebrew)
- [Soniox Hebrew](https://soniox.com/speech-to-text/hebrew)
- [HappyScribe Hebrew](https://www.happyscribe.com/transcribe-hebrew)
- [WhisperType ivrit-ai](https://github.com/Danaor/WhisperType)

### Sales call AI (English-first, applicable to extracted text)
- [Gong AI for scoring](https://help.gong.io/docs/gong-ai-for-scoring)
- [CallRail lead qualification](https://support.callrail.com/hc/en-us/articles/5711776551437-How-to-qualify-leads-in-CallRail)
- [Fireflies sales-tuned AI](https://www.guideflow.com/blog/best-ai-note-taking-tools)
- [Granola action items](https://www.itsconvo.com/blog/granola-vs-otter-vs-fathom)

### WhatsApp voice → tasks
- [n8n WhatsApp AI agent template](https://n8n.io/workflows/3586-ai-powered-whatsapp-chatbot-for-text-voice-images-and-pdfs-with-memory/)
- [Auto-create tasks from WhatsApp](https://archizsolutions.com/auto-create-tasks-from-whatsapp/)
- [WhatsApp AI voice agents 2026](https://respond.io/blog/whatsapp-ai-voice-agent)

### Missed call recovery
- [Signpost — 21x lead qualification within 5min](https://www.signpost.com/blog/how-to-automate-follow-up-after-missed-calls-2026-guide/)
- [HighLevel — Missed Call WhatsApp Back](https://help.gohighlevel.com/support/solutions/articles/155000002417-missed-call-whatsapp-back-overview-setup)
- [NextPhone — Missed Call Text Back guide 2026](https://www.getnextphone.com/blog/missed-call-text-back)

### Voicemail
- [JustCall Voicemail Transcription](https://justcall.io/product/voicemail-transcription/)
- [NextPhone Voicemail Follow-Up 2026](https://www.getnextphone.com/blog/voicemail-follow-up-automation)

---

## 18. הוראה לסשן הבא + כיוונים פתוחים

קח את כל 6 המסמכים:
1. session-handoff.md
2. federation-plan.md (v1)
3. tools-deep-audit.md
4. federation-plan-v2.md (RAG/Composio/sandbox/Frigate)
5. office-automation-architecture.md (v3)
6. deeper-tools-research-v4.md (A2A/docs/SHAAM/voice/n8n/Langfuse/Modbus)
7. **voice-and-call-pipeline-v5.md (זה)** — voice→leads pipeline

**הצעות לעוד deep dives (מ-handoff F + חדשות):**
- **Knowledge graph על BEE entities** (Neo4j Community schema) — F#24
- **Tirith deployment actual + Docker on Windows reality check** — F#32-33
- **gov.il Cloudflare bypass strategies** — F#6 (remaining problem)
- **n8n workflow library customized ל-BEE** — F#11 partial
- **Customer journey post-sale automation** (NPS, retention, reviews, referral chain)
- **Sales pipeline analytics dashboard** — once Leads board exists
- **Multi-language support** (Hebrew + Arabic + Russian — if relevant clients) — not yet
- **Document signing flow** (DocuSign / קליק חתימה Israeli)

**אין הוראת ביצוע. רק תכנון.** ברק בוחר waves לפי ROI ויכולת.

---

*נכתב על-ידי הסשן הענני 2026-05-26 Asia/Jerusalem אחרי 12 web searches על phone+voice+leads. ~650 שורות. ה-finding הקריטי ביותר: missed call response within 5 minutes = 21x lead qualification. ROI של ~₪45K/חודש פוטנציאל ב-missed calls לבד.*
