# 🏢🤖 BEE Office Automation — Comprehensive Architecture (v3)

**נכתב:** 2026-05-26 Asia/Jerusalem
**מאת:** הסשן הענני, אחרי קריאת AGENTS.md (52KB constitution) + cron-jobs.json + skills.txt + 10 web research queries
**ממשיך את:** [`federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md) (v1) + [`tools-deep-audit.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md) + [`federation-plan-v2.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan-v2.md)

**מה זה:** ארכיטקטורת AI Chief of Staff מלאה ל-BEE — הסוכנים עושים את כל העבודה המשרדית בצורה מקיפה, מקצועית, מאובטחת. v1+v2 הגדירו את התשתית (Alfred+Hermes+MCP+memory+security); v3 מגדיר את **המוצר** — את חוויית-המשתמש האמיתית של ברק יום-יום.

---

## 0. מה שצריך לרוץ ביום-יום של ברק — 4 התרחישים שביקשת

לפני שמתפזרים לארכיטקטורה, אקבע שמה אנחנו בונים מבטיח בדיוק את הדברים שהזכרת:

### תרחיש 1: "ארז שולח לי ב-28 לחודש יש בדיקה בקדש ברנע"
```
   📱 WA inbound (Erez → Barak)                                   t=0
       │
       └─→ Hermes WA bridge → Alfred handle pipeline             t+200ms
              │
              ├─→ intent classifier  ─→ "regulatory" (98%)
              │
              ├─→ DictaBERT NER + regex ─→ {
              │       date_raw: "28 לחודש",
              │       date_resolved: "2026-06-28" (next-month "28th"),
              │       place: "קדש ברנע",
              │       type: "בדיקה",
              │       source_person: "ארז" → contact_resolve → Erez Cohen (electrician)
              │   }
              │
              ├─→ ambiguity check
              │   • "28 לחודש" — האם החודש הקרוב או נוכחי? if today > 20 → next month
              │   • "קדש ברנע" — known site? → check `sites/kfar-yuval.md` and others
              │     → no match → flag site_unknown=true
              │
              ├─→ cross-reference
              │   • upcoming regulatory deadlines mentioning Kadesh Barnea?
              │   • inspector inspector roster — who is "Erez"? is he authorized inspector?
              │   • calendar conflict on 2026-06-28?
              │
              └─→ proposal draft (sent to Barak as ⚡ draft message)        t+3-5s
                  ┌──────────────────────────────────────────────────────┐
                  │ ⚡ ארז (אלקטריקאי בודק) הודיע על בדיקה בקדש ברנע    │
                  │ ב-28/6 (יום ראשון).                                  │
                  │                                                      │
                  │ • לפתוח אירוע ביומן? (8:00-12:00 ברירת מחדל)         │
                  │ • להוסיף למונדיי "הקמות" → "בדיקות 2026 Q2"?         │
                  │ • לתעד באתר sites/? (האתר חדש)                       │
                  │ • להזכיר 24 שעות לפני?                               │
                  │                                                      │
                  │ 👍 = הכל          ❌ = אף אחד         ✏️ = להתאים    │
                  └──────────────────────────────────────────────────────┘
                          │
                          │ Barak reacts 👍                          t+10s-2h
                          ▼
                  execute via MCP (4 calls):
                    • Google Calendar MCP — create event
                    • Monday MCP — create item in "הקמות"
                    • write sites/kadesh-barnea.md skeleton
                    • schedule 24h reminder via Hermes cron
                          │
                          ▼
                  audit log entry + ⚡ "בוצע. אירוע ביומן + מונדי + תזכורת."
                          │
                          ▼
                  episodic memory: { event: "calendar_proposed_accepted",
                                      source: "Erez", type: "inspection",
                                      latency_to_approve: 47min, … }
```

### תרחיש 2: "להחזיק כל הזמן את המשימות לביצוע וללחוץ לעזור לי לסיים"

יש לי `TASKS.md` בקונסטיטוציה — אבל הוא passive. הוא צריך להפוך ל-**active task queue**:

```
TASKS.md  →  task_queue.jsonl (machine-readable, structured)
              ├─ id: ULID
              ├─ title, description, source (inbound msg id)
              ├─ created_at, due_date (parsed), priority (auto-assigned)
              ├─ owner (default: Barak), assignee (delegate-able)
              ├─ status: open / in_progress / waiting / done / cancelled
              ├─ blockers, dependencies
              ├─ nudge_count, last_nudge_at
              └─ outcome, feedback (post-completion)

      ⏰ daily nudge cron (08:30, 13:30, 18:30)
              │
              ├─ filter: status=open AND (due_date<3d OR priority>=high)
              │
              ├─ rank by Eisenhower quadrant:
              │   Q1 (urgent+important)    → דחוף מיידי, להזכיר עכשיו
              │   Q2 (important not urgent) → לקבוע זמן יעודי השבוע
              │   Q3 (urgent not important) → להאציל (אוטומציה / Neri / Shlomi)
              │   Q4 (neither)              → לבטל / לדחות
              │
              ├─ skip if Barak in quiet hours (per AGENTS.md)
              │
              └─ ⚡ "3 משימות פתוחות לטיפול:
                  1. [🔴] לשלוח הצעת מחיר ל-לקוח X — דדליין מחר
                  2. [🟠] לבדוק אם הגיעו חלקים ל-Y — כבר 4 ימים תלוי
                  3. [🟡] לעדכן רישיון בודק חשמלאי — שבוע נשאר

                  ✏️ תרצה שאדחוף את 1 עכשיו? (טיוטה לX מוכנה)"
```

ה-"ללחוץ" שביקשת = nudge_count מאסקלצי לפי אי-ביצוע. אם משימה שיושבת 3 ימים בלי תזוזה → escalate intent (אולי delegate, אולי redefine, אולי cancel).

### תרחיש 3: "אני רוצה שבהמשך יבצעו אותן ויוגשו לי לעיון"

זה ה-**autonomous execution loop** עם feedback. 3 רמות אמון מתפתחות:

| Phase | רמה | מה ה-agent עושה | מה ברק עושה | trigger מעבר |
|---|---|---|---|---|
| **L0 — supervised** | אישור פר-פעולה | מציע, מנסח, מציג | מאשר 👍 או דוחה ❌ או מתקן ✏️ | תמיד כברירת מחדל |
| **L1 — confirm-after** | confirm bulk | מבצע bulk + מציג סיכום | מאשר בדיעבד (reversible 24h) | אחרי 20+ אישורי 👍 רצופים על same intent |
| **L2 — autonomous** | full-auto | מבצע + מתעד | reviews weekly | אחרי 100+ הצלחות + 0 false positives 30 ימים |

**דוגמא:** ניסוח טיוטות תשובה ללקוחות:
- ביום 1: 10 טיוטות → 10 אישורים ידניים (L0)
- אחרי שבוע: 70 טיוטות → 65 אישורים, 5 תיקונים → עדיין L0 (יש שגיאות)
- אחרי חודש: 200 טיוטות → 198 אישורים, 2 תיקונים → upgrade ל-L1 (שולח, מציג סיכום ביום)
- אחרי 3 חודשים: 500 טיוטות → 0 תיקונים → L2 על intent זה בלבד

**Feedback loop:** כל תיקון (✏️) שברק עושה נשמר ב-`task-examples.md` עם delta (what was, what should be), נכנס ל-fine-tuning של router classifier ו-template library. **agent משתפר מ-feedback אמיתי**, לא מ-RLHF abstract.

### תרחיש 4: "כל ערב המשימות הפתוחות של כל עובד וסידור עבודה למחר/השבוע"

זה ה-**evening operations briefing**. מבוסס על Monday.com webhook + state aggregation:

```
   ⏰ 20:30 daily cron (Sunday-Thursday)
              │
              ├─ pull from Monday.com (today's deltas)
              │   • "הקמות" board: which items moved status today?
              │   • "Activities" board: per-tech daily activity log
              │   • "Client Projects": which projects had progress?
              │
              ├─ pull from Google Calendar (3-calendar lock)
              │   • tasks-neri tomorrow
              │   • tasks-shlomi-solar tomorrow
              │   • personal (Barak) tomorrow
              │
              ├─ pull from BEE.Document snapshot
              │   • completed jobs today
              │   • unresolved customer issues
              │
              ├─ cross-reference TASKS.md + open inspections/regulatory
              │
              └─ compose evening briefing
                  ┌─────────────────────────────────────────────────┐
                  │ 🌙 *סיכום יום + סידור מחר*                       │
                  │ 2026-05-26 ב-20:30                              │
                  │                                                 │
                  │ *ניר היום:*                                      │
                  │   • סגר 3 קריאות (kfar-yuval×2 + נווה אילן×1)    │
                  │   • 2 פתוחות לסיום: Sungrow ירוחם, electric דימונה │
                  │   • ⚠️ ירוחם — תלוי 4 ימים, להעריך escalation     │
                  │                                                 │
                  │ *שלמי היום:*                                     │
                  │   • שלח 2 הצעות מחיר (לקוח Z — אישר, A — ממתין) │
                  │   • לקוח Z שילם 50% → Cardcom רישום פתוח         │
                  │                                                 │
                  │ *סידור מחר (יום שלישי 27/5):*                    │
                  │   ניר   08:30  Sungrow ירוחם (סיום)              │
                  │         11:30  electric דימונה (continue)        │
                  │         14:00  pickup חלקים מ-spareparts           │
                  │   שלמי  09:00  הצעה ללקוח A — phone callback     │
                  │         12:00  pickup חומרים לוגיסטיקה Z          │
                  │   ברק   10:00  ↑ פגישה אישית (יומן 1)             │
                  │         15:00  ↑ עדכון Monday "הקמות"            │
                  │                                                 │
                  │ *דחוף לטיפול שלך מחר:*                            │
                  │   🔴 לחתום על הצעת מחיר ללקוח A (Cardcom token) │
                  │   🟠 לסבב מפתח SolarEdge (403 4 ימים)             │
                  │                                                 │
                  │ *תחזית שבוע (28/5-1/6):*                          │
                  │   • 3 בדיקות מתוכננות (קדש ברנע, נווה אילן, ערד)  │
                  │   • 1 הסכם ענכא לחתום (X)                         │
                  │   • להזכיר: מ.מ ב-30/5 רישיון בודק חשמלאי         │
                  │                                                 │
                  │ 👍 = הכל בסדר   ✏️ = להתאים מחר                  │
                  └─────────────────────────────────────────────────┘
```

זה לא רק "summary" — זה **operations daily standup אוטומטי**. עם feedback (✏️) הוא משתפר.

---

## 1. ארכיטקטורה 9 שכבות (full picture)

```
                ┌─────────────────────────────────────────────────────────────────┐
                │                                                                 │
                │  Layer 9 — SECURITY & GOVERNANCE  (Tirith + Hyper-V + Audit)    │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 8 — BRIEFING & PROACTIVE   (morning agenda, evening      │
                │              SCHEDULING            briefing, weekly review)     │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 7 — SELF-IMPROVEMENT       (3-path framework, feedback   │
                │              LOOP                  capture, pattern mining)     │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 6 — MEMORY                 (working / episodic /         │
                │              MULTI-TIER            semantic / procedural /      │
                │                                    long-term archive)            │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 5 — EXECUTION              (MCP-mediated; idempotent;    │
                │              (after gate)          rollback log)                 │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 4 — APPROVAL GATE          (L0/L1/L2 trust levels;       │
                │                                    reactions; time-decay)       │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 3 — PROPOSAL                (calendar event? task? reply?│
                │              GENERATION            escalate? cross-ref?)       │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 2 — UNDERSTANDING          (intent classify + DictaBERT  │
                │              & RESOLUTION          NER + entity resolution +   │
                │                                    confidence scoring)         │
                │                                                                 │
                ├─────────────────────────────────────────────────────────────────┤
                │                                                                 │
                │  Layer 1 — CAPTURE                (WhatsApp / voice / Gmail /  │
                │              MULTI-CHANNEL         Monday webhooks / SolarEdge │
                │                                    alerts / Frigate events)    │
                │                                                                 │
                └─────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 — CAPTURE (multi-channel input)

נכון לעכשיו רק WhatsApp פעיל (channels.txt). בנייה של 5 נוספים:

| channel | מקור | סטטוס נוכחי | תוספת ב-v3 |
|---|---|---|---|
| **WhatsApp inbound** | Baileys via Hermes :3000 | ✅ פעיל | להוסיף Monday webhook fanout |
| **Voice notes** | WA inbound → Groq Whisper | ✅ פעיל לפי AGENTS.md voice intent | להוסיף Hebrew DictaLM 3.0 לזיהוי entity מסוים |
| **Gmail** | gmail-morning-digest cron | ⛔ DISABLED | להפעיל + להוסיף inbound trigger ל-emails מ-customers/vendors |
| **Monday.com webhooks** | אין | ❌ חסר | להוסיף webhook → Hermes → Alfred (תרחיש 4) |
| **SolarEdge alerts** | API polling | חלקי | להפוך ל-event-driven via SolarEdge MCP (audit Tier 1) |
| **Frigate camera events** | אין | ❌ חסר (v2 Wave 4) | MQTT → Hermes (v2 Pipeline 1) |
| **Calendar deltas** | אין | ❌ חסר | להאזין ל-Google Calendar push notifications (יהיה גם trigger) |

**Capture נורמליזציה:** כל אירוע נכנס עם schema אחיד:
```json
{
  "event_id": "01JBXQ...",
  "captured_at": "2026-05-26T14:23:11Z",
  "source": "whatsapp" | "voice" | "gmail" | "monday" | "solaredge" | "frigate" | "calendar",
  "source_id": "originalMsgId",
  "from": "+972...|email|api",
  "raw": {...},
  "media_refs": [...],
  "thread_id": "..." // for conversation continuity
}
```

נשמר ב-`captured_events.jsonl` (append-only) + duplicate-detection hash. ה-source of truth לכל מה שקרה.

---

## 3. Layer 2 — UNDERSTANDING & RESOLUTION

### 3.1 Intent classifier — extension של 10 הקיימים

ה-router הקיים יש לו 10 intents (AGENTS.md). אוסיף 8 נוספים שעלו מתרחישים:

| intent חדש | דוגמה | פעולה |
|---|---|---|
| `tech-update` | "סגרתי קריאה בkfar-yuval" (מ-ניר) | Monday status update + episodic log |
| `inspection-scheduled` | "ארז הודיע על בדיקה ב-28" (תרחיש 1) | calendar + Monday + sites/ |
| `parts-arrival` | "הגיעו החלקים ל-Sungrow" | tasks update (unblock) |
| `customer-payment-received` | "X שילם" | Monday + Cardcom record + invoice flag |
| `escalation-needed` | "לקוח מתלונן 3 ימים" | priority bump + alert |
| `personal-reminder` | "תזכיר לי ל-X בערב" | TASKS + cron |
| `delegated-result` | "סיימתי את X" (ממ-Shlomi/Neri) | task close + feedback link |
| `weekly-pattern` | "כל יום ראשון יש לי..." | פעולה חוזרת — להוסיף recurring task |

ה-classifier יעבוד עם **router-v2** שמשלב:
- **Fast path** (under 100ms): few-shot LLM classification עם 50 דוגמאות מ-task-examples.md (cached in-memory)
- **Slow path** (300-800ms): רק אם confidence < 0.85 — מפעיל full Sonnet עם context מורחב

חיסכון: ~70% מההודעות הולכות fast path עם DeepSeek-Chat או Haiku.

### 3.2 DictaBERT NER pipeline (חדש ל-v3)

כל הודעה inbound עוברת NER **לפני** ה-LLM call (חוסך טוקנים, מדויק יותר):

```python
# נקרא לפני router
entities = dictabert_ner(message_text)
# entities = {
#   "PERSON": [{"text": "ארז", "score": 0.97}],
#   "LOC":    [{"text": "קדש ברנע", "score": 0.92}],
#   "DATE":   [{"text": "28 לחודש", "score": 0.89}],
#   "ORG":    [],
#   "MONEY":  [],
# }

# ה-router מקבל text + entities יחד
intent, confidence = router_classify(text, entities, recent_thread_context)

# resolver מנפץ entities ל-IDs:
resolved = {
  "person_id": contact_resolve("ארז"),  # → "erez_cohen_electrician" or null
  "site_id":   site_resolve("קדש ברנע"),   # → "kadesh_barnea" (חדש) or null
  "date_iso":  date_resolve("28 לחודש"),  # → "2026-06-28"
  ...
}
```

DictaBERT רץ local (CPU OK, ~50ms per message). חוסך LLM calls + מתמקד.

### 3.3 Confidence scoring — מתי לא לפעול אוטו

לכל proposal יש composite confidence:
```
overall = min(intent_conf, ner_avg_conf, resolver_match_conf)

≥ 0.90  → act / propose with high confidence
0.70-0.90 → propose with hedge ("נראה לי ש...")
< 0.70   → ask clarify before proposing
```

ה-thresholds מתכווננים פר-intent מ-feedback (Layer 7).

---

## 4. Layer 3 — PROPOSAL GENERATION

לכל אירוע מובן (Layer 2), ה-agent מציע 1-N פעולות. ה-proposal הוא **structured JSON** + **human-readable draft**:

```json
{
  "proposal_id": "01JBXQ...",
  "trigger_event": "01JBXP...",
  "actions": [
    {
      "type": "calendar_event_create",
      "calendar": "personal",
      "title": "בדיקה — קדש ברנע (ארז)",
      "start": "2026-06-28T08:00:00+03:00",
      "end":   "2026-06-28T12:00:00+03:00",
      "attendees": ["erez_cohen_electrician"],
      "reminder_24h_before": true
    },
    {
      "type": "monday_item_create",
      "board": "הקמות",
      "group": "בדיקות 2026 Q2",
      "name": "קדש ברנע — בדיקה 28/6",
      "fields": {...}
    },
    {
      "type": "sites_doc_create",
      "path": "sites/kadesh-barnea.md",
      "skeleton_template": "new-site"
    },
    {
      "type": "cron_schedule",
      "name": "remind-kadesh-barnea-inspection",
      "cron": "0 8 27 6 *",
      "action": "send_msg",
      "payload": {"text": "מחר בדיקה בקדש ברנע 08:00"}
    }
  ],
  "rationale": "ארז (אלקטריקאי בודק מאומת) דיווח על בדיקה ב-28. תאריך עתידי, אתר לא מוכר → ליצור skeleton.",
  "risk_score": 0.15,
  "estimated_revenue_impact": null,
  "blast_radius": "calendar+monday+filesystem+cron",
  "rollback_plan": "delete calendar event, delete monday item, git rm sites/, cron disable",
  "expires_at": "2026-05-26T18:00:00Z"  // proposals expire if no answer
}
```

### 4.1 Reply suggestion (חדש)

לכל inbound מ-לקוח, ה-agent מציע **גם** תשובה. דוגמה:
```
inbound: לקוח X: "המערכת לא עובדת מהבוקר"
agent proposal:
  • action: send_reply (draft)
    draft: "בוקר טוב X, פותח קריאה מיידית. ניר יחזור אליך תוך 30 דקות עם בדיקה."
  • action: monday_create_item (priority=urgent, assignee=Neri)
  • action: solaredge_check_inverter (background)
```

הברק רק מאשר 👍, או מתקן ✏️ "תכתוב שאחזור בעצמי תוך שעה". התיקון נכנס ל-procedural memory.

### 4.2 Escalation flagging

כללי escalation אוטומטיים (procedural memory, ניתנים לעדכון):
- task > 3 days no movement → priority++
- inbound contains [דחוף, מיידי, breakdown, גז, שריפה, פגיעה] → top priority
- customer mentioned >2 days without response → "X לא קיבל תשובה X ימים — לחזור"
- regulatory deadline < 7 days → daily reminder
- inspector authority-issue → 24h escalate to Barak personally

---

## 5. Layer 4 — APPROVAL GATE (RACI per action type)

### 5.1 Action risk matrix

| action category | default level | promotion criteria | side-effect class |
|---|---|---|---|
| **read** (search, query, fetch) | L2 auto | — | none — read-only |
| **draft** (compose reply, create document text) | L2 auto | — | local-file write, reversible |
| **schedule** (calendar event, cron) | L0 supervised | 20 approved + reversible | external — calendar visible |
| **monday-update** (status change) | L0 supervised | 30 approved + 0 wrong + matches pattern | external — visible to team |
| **outbound message** (to non-Barak) | L0 always | never auto (constitutional) | external — communication |
| **financial** (invoice send, payment process) | L0 always | never auto | irreversible (in many cases) |
| **regulatory** (gov filings, license actions) | L0 always | never auto | legal liability |
| **delete** (any deletion) | L0 always | never auto | data loss |

### 5.2 Approval channels — שיטות תגובה

1. **Reaction-based** (default for non-text proposals):
   - 👍 → approve all
   - ❌ → reject all
   - ✏️ → "Please reply with corrections"
   - ⭐ → "Approve + escalate priority"
   - 🕐 → "Snooze 1 hour"

2. **Quick reply commands** (text):
   - `כן 1,3` → approve actions 1 and 3 only
   - `לא` → reject
   - `דחה ל-מחר 9` → snooze

3. **Dashboard click** (Alfred dashboard port 8765 — exists per audit):
   - 17 routes exist already — add `/proposals/<id>/approve` + `/reject` + `/edit`

### 5.3 Time-decay rules

| time elapsed | action |
|---|---|
| 0-15min | quiet — wait for response |
| 15min-1h | gentle re-prompt: "ראיתי שעוד לא ענית — לדחות ל-מאוחר?" |
| 1-4h | downgrade priority — move to morning briefing |
| 4-24h | auto-expire — proposal cancelled, logged for review |
| 24h+ | escalation prompt — "X לא ענית 24 שעות. כן/לא?" |

חריגים: urgent intents (escalation-needed, customer-fault breakdown) — 5min re-prompt עד תשובה.

---

## 6. Layer 5 — EXECUTION (after gate)

לכל action שאושר:

```
                       proposal approved
                              │
                              ▼
                  ┌──────────────────────┐
                  │   pre-flight check    │
                  │   • API health        │
                  │   • idempotency key   │
                  │   • secrets present   │
                  │   • Tirith pre-scan   │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼──────────┐
                  │   execute via MCP   │
                  │  (Hyper-V sandbox    │
                  │   for non-Tier-1)   │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────────┐
                  │   result classification │
                  │   • success             │
                  │   • partial             │
                  │   • failure (retryable) │
                  │   • failure (terminal)  │
                  └──────────┬──────────────┘
                             │
                  ┌──────────▼──────────┐
                  │   audit log entry   │
                  │   + episodic memory │
                  │   + outcome notify  │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │   ⚡ confirm to Barak │
                  │   ("בוצע: …")        │
                  └─────────────────────┘
```

### 6.1 Idempotency — חובה לכל action חיצוני

לכל action יוצרים `idempotency_key = hash(proposal_id + action_index)`. נשמר ב-`executed_actions.db`. אם נופלים באמצע + מנסים שוב → מזהים ולא יוצרים כפול.

### 6.2 Rollback log

כל action שמשנה state חיצוני יוצר rollback entry:
```json
{
  "action_id": "...",
  "rollback_command": "delete calendar event eventId=abc + delete monday item itemId=xyz",
  "expires_at": "+24h",
  "auto_rollback_triggers": ["customer_complaint", "barak_says_undo"]
}
```

24 שעות window. אחרי זה — manual.

---

## 7. Layer 6 — MEMORY MULTI-TIER

### 7.1 חמש שכבות זיכרון

הv2 הציע hindsight + RAG. v3 מציע מבנה מלא של 5 שכבות לפי best practices 2026:

| Tier | סוג | מה נשמר | TTL | איפה | quotation |
|---|---|---|---|---|---|
| **T1** Working | conversation context | current msg + last 3-5 exchanges | session | system prompt | ~2K tokens cap |
| **T2** Episodic | recent events (raw) | last 30 days events_log, decisions, outcomes | 30d→archive | `episodic_events.jsonl` + hindsight | append-only |
| **T3** Semantic | facts about entities | people, sites, equipment, customer history | persistent | `MEMORY.md` + `USER.md` + `sites/*.md` + `contacts.md` | curated |
| **T4** Procedural | learned rules | "Erez = inspector", "evenings = quiet", patterns | persistent | `procedural_rules.yaml` | versioned |
| **T5** Archive | full history | 879K WA messages + all events ever | infinite | Qdrant RAG (v2) | searchable |

### 7.2 ה-MEMORY.md היום + מה לשנות

נכון לעכשיו (לפי AGENTS.md):
- `memory/<date>.md` daily log — ⛔ broken since 17/5
- `MEMORY.md` curated — בשימוש
- `TASKS.md` — בשימוש
- `contacts.md` — בשימוש (DMs only)
- `sites/<slug>.md` — קיים רק ל-kfar-yuval
- `task-examples.md` — בשימוש

**הוספות ל-v3:**
- `episodic_events.jsonl` — append-only structured log, source of truth ל-Layer 7 learning
- `procedural_rules.yaml` — gateway להחלטות auto ("if X then Y")
- `entity_graph.json` — knowledge graph (people → sites → equipment → jobs); נטען לזיכרון מ-hindsight
- `roster.yaml` — **חדש וקריטי** — list של עובדים + alumni + inspectors + suppliers (היום אין; ה-agent לא יודע מי "ארז")
- `customers.yaml` — נורמליזציה של contacts.md (מ-flat ל-structured)

### 7.3 דוגמה ל-roster.yaml (תרחיש 1 דורש את זה)

```yaml
employees:
  - id: barak
    name: "ברק ברזל"
    role: principal
    phone: "+972509554483"
    calendars: ["personal", "tasks-neri-watch", "tasks-shlomi-solar-watch"]

  - id: neri
    name: "נרי"
    role: technician
    phone: "+972..."  # if known
    skills: ["electrical", "solar-install", "inverter-troubleshoot"]
    calendars: ["tasks-neri"]
    monday_groups: ["הקמות-active"]

  - id: shlomi_shirazi
    name: "שלמי שיראזי"
    role: solar-sales-ops
    phone: "+972..."
    skills: ["sales", "solar-design", "quotes"]
    calendars: ["tasks-shlomi-solar"]

external_inspectors:
  - id: erez_cohen
    name: "ארז כהן"
    role: licensed-electrical-inspector
    phone: "+972..."
    license_number: "..."
    authority: "המשרד לכלכלה"
    common_sites: ["kfar-yuval", "...]

suppliers:
  - id: prime_energy
    name: "Prime Energy"
    role: contractor
    contact: "..."
```

זה ה-source ל-resolver של Layer 2. בלי זה, "ארז" נשאר string.

### 7.4 Memory write policy

מי כותב מה ומתי:

| trigger | writes to | TTL |
|---|---|---|
| inbound WA captured | episodic_events.jsonl + memory/<date>.md | T2: 30d→archive |
| action executed | episodic_events.jsonl + audit_log.jsonl | T2 |
| Barak corrects ✏️ | task-examples.md + procedural_rules.yaml (if significant) | T4 |
| customer interaction | contacts.md (last_seen, sentiment_drift) | T3 |
| new site identified | sites/<slug>.md skeleton + entity_graph.json | T3 |
| weekly review | MEMORY.md summary append + procedural_rules.yaml updates | T3/T4 |

---

## 8. Layer 7 — SELF-IMPROVEMENT LOOP

### 8.1 Three-path framework (mindstudio 2026 pattern)

| Path | מי decides | מה משתנה | דוגמה |
|---|---|---|---|
| **Path 1** auto | agent alone | thresholds + few-shot examples | "באחרונה 50 inboundים from Erez classified inspection at 0.92 → bump threshold ל-0.85" |
| **Path 2** approval | Barak approves | procedural_rules + new intents | "agent learned ש-'בדיקה' = always pair with Calendar event — להוסיף rule?" |
| **Path 3** context | agent expands | entity_graph + roster | "discovered new contact 'יוסי הקבלן' from 3 mentions — add to roster?" |

### 8.2 Feedback capture (every interaction)

לכל interaction נשמר:
```json
{
  "proposal_id": "...",
  "barak_action": "approved" | "rejected" | "edited",
  "edit_delta": "...", // if edited
  "response_latency_seconds": 47,
  "time_of_day": "14:23",
  "downstream_outcome": null  // filled in 24h-7d later
}
```

7 ימים אחרי כל action → check downstream:
- did customer reply? was it positive?
- did the task get done?
- did barak undo within 24h?
- was the calendar event attended?

### 8.3 Weekly self-review (Sunday 19:00) — להפעיל מחדש (ב-audit DISABLED)

```
   cron weekly: weekly-self-review
        │
        ├─ aggregate 7 days of feedback
        ├─ identify patterns:
        │    • intents with >10% reject/edit rate → flag
        │    • new entities discovered → propose to roster
        │    • timing patterns → propose quiet-hours updates
        │
        ├─ generate ⚡ report:
        │    "השבוע: 87 inboundים, 76 approved (87%), 8 edited, 3 rejected.
        │     בעיות:
        │       • 'מחירון' intent — 4 מתוך 6 ערכת ✏️ → אני מציע פרומפט מחדש
        │       • Erez Cohen מוזכר 3 פעמים — להוסיף לroster?
        │     להלן 3 הצעות שיפור:
        │       1. שינוי router prompt עבור intent X
        │       2. הוספת roster entry
        │       3. הורדת nudge frequency של Tasks Q3
        │     👍 = כולם   ✏️ = לבחור   ❌ = לא עכשיו"
        │
        └─ if approved → execute changes + log version-bump
```

---

## 9. Layer 8 — BRIEFING & PROACTIVE SCHEDULING

### 9.1 רוטינה יומית מומלצת

| time | briefing | תוכן | פעיל היום? |
|---|---|---|---|
| **06:30** | morning weather scan | safety alerts לעבודות שטח | ✅ |
| **07:00** | morning urgent digest | Monday top 5 urgent + overnight WA | ⛔ to enable |
| **07:30** | morning agenda | היום: calendar + tasks + deadlines + weather | חדש |
| **08:00** | gmail digest | unread mails categorized | ⛔ to enable |
| **09:30** | gov regulations | gov.il deltas | ✅ |
| **13:00** | mid-day check | "איך בוקר? יש משימות שהוזנחו?" + Monday deltas | חדש |
| **18:00** | wrap-up nudge | tasks open + לא נסגרו → דחיפה אחרונה | חדש |
| **20:30** | evening operations briefing (תרחיש 4) | per-tech today + tomorrow plan + week ahead | חדש |
| **23:30** | daily cost alert | token spend + anomalies | ✅ |

### 9.2 Briefing composition pipeline

```
   trigger time / cron
            │
            ▼
   gather: pull from Monday + Calendar + Tasks + BEE.DB + episodic
            │
            ▼
   filter: only relevant to this hour (e.g., morning skips finished items)
            │
            ▼
   rank: Eisenhower quadrant + customer importance + deadline distance
            │
            ▼
   compose: Hebrew template with ⚡ prefix + structured sections
            │
            ▼
   send: via Alfred outbound → Barak self-chat
            │
            ▼
   await: 👍 or ✏️ or no-response (quiet hours respected)
            │
            ▼
   memory: log this briefing for self-improvement (which sections were edited?)
```

### 9.3 Weekly briefing (Sunday 09:00)

תוספת ל-evening (תרחיש 4):
```
   ⚡ *סיכום שבועי + תכנון לשבוע הבא*
   2026-05-26 ב-09:00

   *שבוע שעבר (19-25/5):*
   • 12 הקמות active (3 הושלמו, 9 ממשיכים)
   • 4 קריאות אזורית (2 פתורות, 2 פתוחות)
   • 6 הצעות מחיר (3 נסגרו, 1 נדחתה, 2 ממתינות)
   • 3 בדיקות regulatory (כולן עברו)
   • Cost: $342 (vs budget $400 — תקין)

   *שבוע הבא (26/5-1/6):*
   • 2 בדיקות מתוכננות:
       - 28/5 בודקה קדש ברנע (Erez)
       - 30/5 פיקוח חיצוני נווה אילן
   • 1 deadline: מ.מ ב-30/5 רישיון בודק חשמלאי
   • 3 followups ממתינים מ-שבוע שעבר (Z payment, Y parts, X agreement)

   *bottlenecks זוהו:*
   • ניר עמוס יומיים-3 — לחלק טסקים?
   • הצעות מחיר ממוצע 4 ימים לתשובה — להאיץ?

   *הצעות שיפור AGENT (Path 2 — דורש אישור):*
   • להוסיף Erez Cohen ל-roster
   • לשנות router intent 'parts' threshold ל-0.80 (היום 0.85, פעמיים החמיץ)
   • להפעיל auto-status-update עבור Monday "Activities" (אחרי 30 פעמים הצלחה)

   👍 = הכל בסדר   ✏️ = לדון   ❌ = לא עכשיו
```

---

## 10. Layer 9 — SECURITY & GOVERNANCE

מהמסמכים הקודמים (v2 deep dive C) + תוספות specific ל-office automation:

### 10.1 Defense-in-depth layers

| Layer | מה זה מגן | כלי | סטטוס |
|---|---|---|---|
| **Config-level** | malicious mcp.json | Tirith pre-scan | v2 |
| **Process isolation** | RCE in MCP servers | Hyper-V container | v2 |
| **Network isolation** | data exfil | --network=none per MCP | v2 |
| **Credential scope** | API key leak blast | per-MCP API keys, OS-level secret store | חדש v3 |
| **Outbound allowlist** | rogue agent sending to attacker | sendPolicy 4 destinations (constitutional) | קיים |
| **Audit log** | forensics | append-only audit_log.jsonl, signed weekly | חדש v3 |
| **PII handling** | leak of customer data | data residency rules | חדש v3 |
| **Action confirmation** | accidental side effect | Layer 4 gates | קיים+חדש |
| **Rollback window** | mistaken action | 24h reversible per action | חדש v3 |
| **Approval logging** | "who authorized what" | every gate decision logged | חדש v3 |

### 10.2 PII / data residency policy (חדש)

ל-BEE יש PII רגיש: phone numbers, customer addresses, payment data, ID numbers בחשבוניות. למרות שזה sole-proprietor business — חוק הגנת הפרטיות חל.

**כללים:**
1. **לעולם לא** לשלוח full PII ל-LLM cloud מבלי redact למעט Anthropic (יש BAA → ניתן) ו-Gemini (יש Israel data residency option).
2. בהקשרי vision (תמונות חשבוניות, תעודות זהות) — לשלוח עם strip של ID numbers, phone numbers ע"י regex pre-processing.
3. SolarEdge / Monday data — דרך MCP-mediated, בלי לעבור דרך LLM אלא אם דרוש לתשובה.
4. WhatsApp history (879K) — RAG מקומי בלבד (Qdrant על bee-prod-1), לעולם לא לעבור דרך OpenAI/anthropic.
5. Customer files — encrypted at rest (BitLocker על E: drive recommended).

### 10.3 Audit log format

```json
{
  "audit_id": "01JBXR...",
  "timestamp": "2026-05-26T18:23:11Z",
  "actor": "alfred|hermes|barak|cron-name",
  "action_type": "calendar_create|monday_update|message_send|...",
  "target": "calendar:personal|monday:הקמות|wa:+972509554483",
  "trigger_chain": ["msg_id1", "proposal_id", "approval_id"],
  "decision_basis": "approved_by_barak|auto_L2|cron|rule_match",
  "outcome": "success|failure|partial",
  "secrets_accessed": ["MONDAY_API_KEY"],  // names only, not values
  "rollback_id": "01JBXS...",
  "signature": "ed25519:..."  // weekly hash chain for tamper-evidence
}
```

נשמר ב-`audit_log.jsonl` (append-only, חתוםו שבועי). חובה לכל action שמשנה state חיצוני. **הוא ה-Witness** אם משהו ישתבש.

### 10.4 Quarterly security review (חדש cron)

```
   cron quarterly: security-review (Jan/Apr/Jul/Oct 1st 09:00)
        │
        ├─ Tirith re-scan all MCP configs (rule updates)
        ├─ MCP version audit (deprecated? known-CVE?)
        ├─ API key rotation reminder (SolarEdge, Monday, Anthropic, Groq)
        ├─ audit_log integrity check (signature chain)
        ├─ outbound destinations confirm (4 allowed still match constitution)
        ├─ data residency check (where is data physically?)
        │
        └─ generate quarterly security report
```

---

## 11. New capabilities matrix (per scenario × layer)

| scenario | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Layer 5 | Layer 6 | Layer 7 | Layer 8 |
|---|---|---|---|---|---|---|---|---|
| **1. Erez inspection** | WA capture | NER+resolver | calendar+monday+sites proposal | reactions L0 | 4 MCP calls | episodic + roster | feedback if edit | + into morning agenda |
| **2. Task tracking** | n/a (cron) | n/a | nudge proposal | reactions/snooze | task status update | task_queue.jsonl | escalation rules | morning + 13:00 + evening |
| **3. Autonomous execution** | per-intent | confidence gate | proposal | L0→L1→L2 progression | with rollback | episodic | three-path | weekly review |
| **4. Monday + briefings** | webhook | tech-update intent | per-employee summary | L0 daily | Monday MCP + Calendar MCP | aggregation | bottleneck detection | evening 20:30 + weekly |

---

## 12. שינויים לתוכניות הקיימות + waves חדשים

מתבסס על federation-plan v1/v2. כל wave להוסיף או לעדכן:

### Wave -1 (Bug Squash) — להוסיף 3 items
- ⬛ Re-enable `morning-urgent-digest` (10:00) — currently disabled per audit
- ⬛ Re-enable `evening-urgent-digest` (22:00) — currently disabled
- ⬛ Re-enable `weekly-self-review` (Sun 09:00) — critical for self-improvement loop

### Wave 1 → להוסיף sub-step
- 1.5: Build `roster.yaml` from contacts + manual addition of inspectors/employees (~2h, **critical foundation**)

### Wave 2 (MCP Foundation) → להוסיף
- 11.5: Build Monday.com webhook → Hermes → Alfred pipeline (~3h)
- 11.6: Build Calendar push notification listener (~2h)

### Wave 3 (Capability Splits) → להוסיף
- 16.5: Build DictaBERT NER service (local Python, FastAPI) — ~3h
- 16.6: Refactor router-v2 with fast/slow paths + entity injection — ~4h
- 16.7: Build proposal/approval/rollback pipeline — ~6h
- 16.8: Build task_queue.jsonl + nudge cron — ~3h

### Wave 4 (Platform Expansion) → להוסיף
- 24.5: Build evening operations briefing (תרחיש 4) — ~5h
- 24.6: Build weekly review with 3-path feedback — ~4h
- 24.7: Build per-action audit log + signature chain — ~3h

### Wave 5 (Continuous) → להוסיף
- 30: Quarterly security review automation
- 31: 3-path self-improvement automation (Path 1 auto)

**סך תוספת ל-v3:** ~38h של עבודה נוספת לפדרציה. Total cumulative: ~100h.

---

## 13. שאלות חדשות שעולות

| # | שאלה | מתי דרוש | המלצה |
|---|---|---|---|
| Q21 | **mi הם העובדים/בודקים?** roster.yaml מי "ארז", "ניר", "שלמי", inspectors? | Wave 1.5 | ברק מספק רשימה ידנית — 10-15 דקות עבודה שלו |
| Q22 | **Monday webhook setup** — האם יש access לMonday admin להגדיר webhooks? | Wave 2 | ברק מאשר → ~30min config |
| Q23 | **trust progression** — איזה intents מסוכנים לעלות ל-L2? | Wave 3 ongoing | התחל עם `draft` + `schedule` בלבד; השאר L0 |
| Q24 | **evening briefing timing** — 20:30 מתאים? יש שעות שקטות? | Wave 4 | quiet hours definitions ב-AGENTS.md — לכבד |
| Q25 | **rollback window** — 24h ברירת מחדל מתאים? | Wave 4 | תלוי בaction type — financial לעולם לא; calendar 24h; reply 1h |
| Q26 | **DictaLM 3.0 vs cloud router** — local model ל-NER worth the install? | Wave 3 | yes — חוסך 60% של LLM calls על entity extraction |
| Q27 | **Hindsight knowledge graph entity types** — מה ה-types ל-BEE? | Wave 3 | Person/Site/Equipment/Job/Customer/Invoice/Inspection — 7 types |
| Q28 | **PII redaction in cloud calls** — ידני בכל call? auto-redact pre-LLM? | Wave 2 | auto via regex pre-processor + Anthropic BAA ל-rest |

---

## 14. KPIs ל-Office Automation

מעבר ל-KPIs של v1 (tokens, cost, latency), v3 מוסיף KPIs **operations**:

| KPI | מטרה | מדידה |
|---|---|---|
| **Proposal acceptance rate** | >85% | (approved + auto-approved) / total proposals |
| **Edit rate** | <10% | edited / total approved |
| **Time-to-decision** | p50 < 5min, p95 < 1h | latency from proposal to barak response |
| **Task completion velocity** | -20% reduction in cycle time | from task created to task done |
| **Briefing satisfaction** | >90% no edits | weekly briefings sent w/o ✏️ |
| **Customer response time** | <1h business hours | from inbound to outbound reply |
| **Tech productivity** | +15% jobs/week | per-employee Monday closure rate |
| **False positives (urgent)** | <2/week | "ארז flagged urgent but wasn't" |
| **Self-improvement velocity** | 2-3 procedural rules/week | new rules added or modified |
| **Audit log integrity** | 100% signed | weekly verification |

---

## 15. גודל "המוצר" המלא

לסיכום היקף ה-AI Chief of Staff שאנחנו בונים ל-BEE:

| metric | v1 בלבד | v3 כולל |
|---|---|---|
| לימודי לבד | ✅ basic | ✅✅ 3-path framework |
| ערוצי input | 1 (WA) | 6+ (WA, voice, gmail, monday, solaredge, frigate) |
| intents מסווגים | 10 | 18 |
| MEMORY tiers | 2 (file + state.db) | 5 (working/episodic/semantic/procedural/archive) |
| approval levels | 1 (always confirm) | 3 (L0/L1/L2 graduating) |
| daily briefings | 5 (3 enabled + 2 disabled) | 9 (כולם enabled, חדשים) |
| weekly briefings | אין | full review + suggestions |
| security layers | basic auth | 10 defense-in-depth |
| audit | partial cron | signed append-only log |
| self-improvement | manual | 3-path automated |
| MCP servers | 0 | ~25 (Tier 1 + Israeli + custom) |

זה לא "Alfred עם MCPs". זה **operations team in a box**.

---

## 16. מקורות (חדשים מעבר ל-v1/v2)

### AI Chief of Staff patterns 2026
- **AI Chief of Staff landscape 2026:** [usecarly.com best AI chief of staff](https://www.usecarly.com/blog/best-ai-chief-of-staff/), [get-alfred.ai blog](https://get-alfred.ai/blog/best-ai-chief-of-staff-tools)
- **AI Agent Architecture Redis 2026:** [redis.io/blog/ai-agent-architecture](https://redis.io/blog/ai-agent-architecture/)
- **Multi-agent orchestration:** [codebridge mastering multi-agent orchestration](https://www.codebridge.tech/articles/mastering-multi-agent-orchestration-coordination-is-the-new-scale-frontier)
- **Personal AI assistants 2026:** [arahi.ai personal AI assistant 2026](https://arahi.ai/blog/which-personal-ai-assistant-should-you-choose-practical-guide-2026)

### Self-improvement loops
- **Three-path framework:** [mindstudio self-improving AI agent feedback loop](https://www.mindstudio.ai/blog/self-improving-ai-agent-feedback-loop)
- **Personalized agents from human feedback:** [arxiv 2602.16173](https://arxiv.org/pdf/2602.16173)
- **Agent loop 2026:** [gleecus.com agent loop adaptive AI 2026](https://gleecus.com/blogs/agent-loop-adaptive-ai-agents-complete-guide-2026/)
- **PAR — preference as reward:** recent 2025-2026 research achieving 5pp higher win rates

### Memory architectures
- **Episodic / semantic / procedural memory:** [atlan best AI agent memory frameworks 2026](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/), [machinelearningmastery 3 types long-term memory](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/)
- **MemMachine paper:** [arxiv 2604.04853](https://arxiv.org/pdf/2604.04853)
- **State of agent memory 2026:** [mem0 state of AI agent memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)

### Approval gates & governance
- **Agentic workflow approval framework:** [digitalapplied governance framework](https://www.digitalapplied.com/blog/agentic-workflow-approval-gate-framework-governance)
- **Microsoft Copilot Studio multistage approvals:** [learn.microsoft.com copilot studio flows](https://learn.microsoft.com/en-us/microsoft-copilot-studio/flows-advanced-approvals)
- **Human-in-the-loop AI agents:** [stackai human-in-the-loop AI agents](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)

### Task management
- **Eisenhower matrix AI 2026:** [taskade Eisenhower complete guide 2026](https://www.taskade.com/blog/eisenhower-matrix), [monday.com Eisenhower template 2026](https://monday.com/blog/project-management/eisenhower-matrix-template/)
- **Briefing automation:** [n8n morning briefing podcast workflow](https://n8n.io/workflows/8143-morning-briefing-podcast-generate-daily-summaries-with-gemini-ai-weather-and-calendar/), [vibestacklab automated morning briefing](https://vibestacklab.substack.com/p/how-to-automate-your-morning-with)

### Field service automation
- **Monday.com field service AI 2026:** [monday.com AI service management 2026](https://monday.com/blog/service/ai-service-management/), [monday.com dispatching software 2026](https://monday.com/blog/service/dispatching-software/)
- **AI field service trends:** [erpsoftwareblog AI field service 2026](https://erpsoftwareblog.com/2026/01/ai-field-service-automation/)
- **Agentic workflows field operations:** [opsima agentic workflows field operations 2026](https://opsima.com/blog/operational-insights/agentic-workflows-field-operations/)

### Voice + transcription
- **Whisper + LLM task extraction:** [umevo second brain voice notes notion](https://www.umevo.ai/blogs/ume-all-posts/building-a-second-brain-syncing-ai-voice-notes-to-notion)
- **WhatsApp structured extraction:** [dev.to seryllns deterministic outputs](https://dev.to/seryllns_/designing-deterministic-outputs-from-unstructured-messages-2hlc)

---

## 17. הקשר ל-v1, v2 + הוראה לסשן הבא

**קרא ב-ל הסדר:**
1. [`research/session-handoff.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/session-handoff.md) — מה כבר נחקר
2. [`research/federation-plan.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan.md) — אינפראס v1
3. [`research/tools-deep-audit.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/tools-deep-audit.md) — באגים + MCPs
4. [`research/federation-plan-v2.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/federation-plan-v2.md) — RAG + Composio + sandbox + Frigate
5. **[`research/office-automation-architecture.md`](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/office-automation-architecture.md)** — זה. ה-product layer

**העמקות עתידיות לסשן הבא** (מ-handoff section F + חדשים):
- A2A protocol design (קואופרציה Alfred ↔ Hermes ↔ bee-hive ↔ bee-ai-watcher)
- KG schema פרטים (Neo4j Community vs LanceDB graph mode)
- Voice e2e פרטים (openWakeWord training עברית)
- Israeli regulatory gaps (Mas Hahnasa, NI, IEC MCP building)
- Customer journey automation (post-sale follow-up loops)

**אין הוראת ביצוע. רק תכנון.** ברק יבחר waves להתחיל ולפי איזה סדר. v3 הוסיף ~38h של עבודה ל~100h כולל.

---

*נכתב על-ידי הסשן הענני 2026-05-26 Asia/Jerusalem אחרי 10 web searches + Explore agent ל-AGENTS.md 52KB + 5 קריאות local-state. 9-layer architecture, 4 user scenarios mapped end-to-end, 28 שאלות פתוחות, ~100h כולל ל-build out. ה-Chief of Staff המלא ל-BEE — לא "agent עם MCPs", אלא **operations team in a box**.*
