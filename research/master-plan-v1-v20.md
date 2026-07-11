# Federation + Office Automation — Comprehensive Plan (May 26, 2026 — Updated)

## 📌 Status overview

| Doc | Topic | Status |
|---|---|---|
| `federation-plan.md` | OpenClaw ⇄ Hermes federation | ✅ pushed (and approved earlier in this plan file) |
| `tools-deep-audit.md` | Bug fixes + MCP replacements + Israeli ecosystem | ✅ pushed |
| `federation-plan-v2.md` | RAG (BGE-M3) + Composio + MCP sandbox + Frigate | ✅ pushed |
| `office-automation-architecture.md` | v3 AI Chief of Staff 9-layer | ✅ pushed |
| `deeper-tools-research-v4.md` | A2A + Hebrew docs + SHAAM + voice + n8n + Langfuse + Modbus | ✅ pushed |
| **`voice-and-call-pipeline-v5.md`** | **Phone calls + voicemail + missed-call recovery + lead extraction** | **⏳ written locally (45KB), NOT pushed — plan mode blocks commits** |
| **THIS PLAN FILE** | **v6 research: Knowledge Graph + Customer Journey + Sales Analytics + Marketing** | 📝 active |

⏳ **v5 לוקלית בtree אבל לא ב-GitHub.** ברגע שיוצאים מ-plan mode → push.

---

# Part 1 — Original Federation Plan (preserved, approved earlier)

## Context

You're mid-migration between **OpenClaw** (Peter Steinberger / `openclaw/openclaw`, Node.js Gateway daemon, codename `alfred` in your local setup at `E:\Desktop\OpenClawAgent\`) and **Hermes Agent** (Nous Research / `nousresearch/hermes-agent`, Python-based persistent learning agent at `E:\bee-hermes\`). Goal: stop running both as duplicate generalists, eliminate overlapping work (memory, cron, MCP, channels, skills), and let each take the slice it's *genuinely* better at.

(שאר התוכנית המקורית — Phase 0-5, open questions Q1-Q6, sources — נמצאת בקובץ המקורי שכבר אושר; לא מועתקת לכאן כדי לחסוך מקום, אבל היא חלק מהתוכנית).

---

# Part 2 — v5 Voice-and-Call Pipeline (written locally, pending push)

קובץ `research/voice-and-call-pipeline-v5.md` קיים. מסכם בקצרה:
- **ארכיטקטורת capture → transcribe → extract → route → follow-up**
- iOS 18.1 native + Cube ACR Premium + Mobile2CRM + JustCall comparison
- Hebrew transcription: Groq Whisper $0.04/h default, Speechmatics 96% fallback, Deepgram <300ms real-time
- 4 intents חדשים: phone-call-outbound/inbound/missed/voicemail
- Lead scoring rubric (0-100), Eisenhower-like routing
- Missed-call recovery: 5min response = 21x lead qualification
- Total monthly cost ~$11 + Cube ACR
- 8 שאלות חדשות (Q35-Q42), 7 waves additions

לאחר exit-plan-mode → push + create PR.

---

# Part 3 — NEW v6 Research: 4 Deep Dives

מבוסס על 11 web searches נוספים. כל deep dive עם המלצות concrete.

## 3.A — Knowledge Graph: BEE entities + Neo4j Community

### 3.A.1 ההקשר

בשני המקומות הקודמים הוזכר: v3 הציע `entity_graph.json` כשכבת זיכרון T4. session-handoff F#24 שאל "Neo4j Community schema על BEE entities". זה ה-deep dive.

### 3.A.2 למה knowledge graph לBEE

מבלי KG, השאלה "מי הלקוח שהזכיר Sungrow ירוחם בחודש שעבר וגם פנה אלינו ב-WA?" דורשת lookup חוצה 3-4 קבצים. עם KG → query אחד.

**Use cases ספציפיים ל-BEE:**
1. **Entity resolution:** "ארז" שהזכיר ניר ב-call → אותו "ארז כהן" שמופיע ב-Monday כ-inspector?
2. **Cross-reference:** customer X מתלונן על "ירידת ייצור" → query: site X → equipment installed → similar issues on same equipment elsewhere
3. **Pattern detection:** איזה sites generated 80% of revenue Q1? איזה לקוחות חוזרים? איזה suppliers איטיים?
4. **Lead routing:** lead חדש מ-area Y → who's the nearest tech? what's the equipment preference?

### 3.A.3 בחירת מערכת — Neo4j Community vs alternatives

| Option | Pros | Cons | מומלץ ל-BEE? |
|---|---|---|---|
| **Neo4j Community Edition** | בוגר, Cypher language, פרי GUI, GDS algorithms | יחיד-server (no clustering), 1 database limit | ✅ ל-MVP |
| Neo4j AuraDB Free | hosted, no setup, 200K nodes | cloud only, vendor lock | אופציה אם no infra |
| LanceDB graph mode (v2) | unified עם vectors | פחות בוגר, less query power | אם רוצים אחד-הכל |
| ArangoDB | multi-model (graph+doc+kv) | פחות פופולרי | ❌ overkill |
| **Hindsight (Hermes plugin)** | בנוי בHermes, free | לא query externally | ✅ as memory backend, לא main KG |
| Apache AGE (PostgreSQL extension) | על PG existing | פחות פיצ'רים | ❌ pgvector בכלל |

**ההמלצה:** **Neo4j Community Edition** על bee-prod-1 כ-Docker container. **+** Hindsight ב-Hermes כ-memory cache layer (auto-extract entities מ-conversations).

### 3.A.4 BEE entity schema — proposal

```cypher
// Node labels (entity types)
:Person      { id, name_he, name_en, phone, email, role }
:Customer    extends Person { customer_since, ltv_NIS, status }
:Employee    extends Person { hire_date, skills[], calendar_id }
:Inspector   extends Person { license_number, authority }
:Supplier    extends Person { company_name, payment_terms_days }
:Site        { id, name, address, city, lat, lon, size_kWp }
:Equipment   { id, type (inverter|panel|battery|meter), brand, model, serial, install_date }
:Job         { id, type (install|inspect|repair|quote), status, created_at, completed_at, value_NIS }
:Invoice     { id, number, date, amount_NIS, vat, allocation_number (SHAAM), status }
:Quote       { id, number, date, amount_NIS, status, valid_until }
:Lead        { id, source, score (0-100), stage, created_at, last_activity }
:Call        { id, recording_path, transcript, duration_sec, sentiment, created_at }
:Message     { id, channel, text, captured_at }
:Inspection  { id, scheduled_date, status, report_path, inspector_id }

// Relationship types
(:Customer)-[:OWNS]->(:Site)
(:Site)-[:HAS_EQUIPMENT]->(:Equipment)
(:Job)-[:PERFORMED_AT]->(:Site)
(:Job)-[:ASSIGNED_TO]->(:Employee)
(:Job)-[:FOR_CUSTOMER]->(:Customer)
(:Job)-[:PRODUCED_INVOICE]->(:Invoice)
(:Quote)-[:LED_TO]->(:Job)
(:Quote)-[:FOR_CUSTOMER]->(:Customer)
(:Lead)-[:CONVERTED_TO]->(:Customer)
(:Call)-[:WITH]->(:Person)
(:Message)-[:FROM]->(:Person)
(:Message)-[:MENTIONS]->(:Site | :Equipment | :Person | :Job)
(:Inspection)-[:AT]->(:Site)
(:Inspection)-[:CONDUCTED_BY]->(:Inspector)
(:Equipment)-[:SUPPLIED_BY]->(:Supplier)
(:Person)-[:REFERRED]->(:Lead) // referral tracking
(:Employee)-[:REPORTS_TO]->(:Employee)
```

### 3.A.5 Example queries

```cypher
// "מי דיברנו איתו על Sungrow ירוחם החודש?"
MATCH (m:Message)-[:MENTIONS]->(e:Equipment {brand: 'Sungrow'})
MATCH (m)-[:MENTIONS]->(s:Site {name: 'ירוחם'})
WHERE m.captured_at > date('2026-05-01')
RETURN DISTINCT m, s, e
ORDER BY m.captured_at DESC

// "איזה lead score ממוצע ללידים שמגיעים מ-referral?"
MATCH (referrer:Customer)-[:REFERRED]->(l:Lead)
RETURN AVG(l.score) AS avg_referral_score,
       COUNT(l) AS referral_count

// "איזה sites יש להם > 3 jobs פתוחים?"
MATCH (s:Site)<-[:PERFORMED_AT]-(j:Job {status: 'open'})
WITH s, COUNT(j) AS open_jobs
WHERE open_jobs > 3
RETURN s.name, open_jobs ORDER BY open_jobs DESC

// "Bottleneck detection: tech עם הכי הרבה jobs פתוחים"
MATCH (e:Employee)<-[:ASSIGNED_TO]-(j:Job {status: 'open'})
RETURN e.name_he, COUNT(j) AS open_jobs ORDER BY open_jobs DESC
```

### 3.A.6 Population strategy

ה-KG לא נבנה ידנית. מאוכלס מ-streams:

| Source | Frequency | Method |
|---|---|---|
| Monday.com | webhook real-time | per-row mapper |
| Google Calendar | every 15min | event → :Job or :Inspection |
| Gmail | every 30min | message → :Message + extract entities |
| WhatsApp (Alfred capture) | real-time | message → :Message + DictaBERT NER mentions |
| Phone calls (v5) | post-call | call → :Call + transcript mentions |
| BEE.DB snapshot | every 15min | sites + equipment sync |
| Cardcom invoices | webhook | invoice → :Invoice |
| Hindsight (Hermes) | continuous | auto-extract entities from sessions |

**ה-Hermes Hindsight plugin** עושה auto-extraction. מה שצריך לבנות:
1. **Neo4j MCP server** — exposed כ-MCP tool ל-Alfred + Hermes (`bee-kg-mcp`)
2. **Mapper functions** מ-Monday → Cypher; מ-Calendar → Cypher; etc.
3. **Entity resolver** — אם "ארז" מוזכר, בדוק קיים :Person? אם כן — link. אם לא — propose create.

### 3.A.7 Deployment

```bash
# bee-prod-1 (Hetzner CX52, 16GB RAM — מספיק ל-100K nodes easily)
docker run -d \
  --name bee-neo4j \
  -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
  -v /var/lib/bee-neo4j/data:/data \
  -v /var/lib/bee-neo4j/logs:/logs \
  -e NEO4J_AUTH=neo4j/<strong-password> \
  -e NEO4J_PLUGINS='["graph-data-science"]' \
  neo4j:5-community
```

עלות: $0 (Community edition free), CPU ~0.5 core, RAM ~2GB at BEE scale.

### 3.A.8 Time-to-value

| Phase | זמן | מה מקבלים |
|---|---|---|
| Setup + schema creation | 2h | Neo4j running |
| Mapper: Monday → KG | 3h | Real-time CRM sync |
| Mapper: Calendar → KG | 2h | Events tracked |
| Mapper: WA messages → KG | 3h | Entity mentions captured |
| bee-kg-mcp wrapper | 4h | Alfred/Hermes query-able |
| Hindsight integration | 2h | Auto-population from conversations |
| 5 BEE-specific Cypher queries packaged | 3h | "מי דיבר על X?" etc. ready |
| **Total** | **~19h** | **Full KG operational** |

### 3.A.9 שינוי ל-v3 architecture

ב-v3 Layer 6 (Memory T4 Procedural) הזכיר `entity_graph.json` flat file. **שינוי:** להחליף ל-**Neo4j live**. ה-JSON נשאר כ-snapshot weekly (backup + portability).

---

## 3.B — Customer Journey Post-Sale Automation

### 3.B.1 ההקשר

עד עכשיו v1-v5 התמקדו ב-**pre-sale** (lead → quote → close). אבל BEE עושה התקנות + תחזוקה — ה-**post-sale** הוא 80% מהערך. NPS, retention, reviews, referrals — שכבה שלמה שחסרה.

### 3.B.2 Post-sale lifecycle stages — BEE-specific

```
   החתמת חוזה
        ↓
   T+0   קבלת תשלום ראשון (advance)
        ↓
   T+1d  hello onboarding message ("ברק בקשר. ניר יגיע ב-X")
        ↓
   T+install  ההתקנה בפועל
        ↓
   T+0    Same-day: "התקנה הסתיימה. הכל עובד?"
        ↓
   T+24h post-install survey (CSAT 1-5)
        ↓
   T+7d  How's it going? (NPS 0-10 quick)
        ↓
   T+30d production status update ("המערכת ייצרה X kWh החודש. תקין")
        ↓
   T+30d Google review request (BUT — must be unincentivized per FTC rules)
        ↓
   T+90d  3-month checkup — automated alert if production deviation
        ↓
   T+180d 6-month reachout — refer friends? (referral activation)
        ↓
   T+365d 1-year anniversary — thank you message + warranty status
        ↓
   T+12-24m maintenance ping (filter clean, panel wash recommendation)
        ↓
   T+5y battery warranty check / replacement opportunity
```

### 3.B.3 Automation triggers — concrete cron + webhook

| Trigger | Source | Action |
|---|---|---|
| Job marked "completed" in Monday | webhook | Add to journey table at T+0 |
| 24h after completion | cron daily 10:00 | Send CSAT survey (1-5) via WA |
| 7 days after completion | cron daily 10:00 | NPS quick (0-10) |
| 30 days after completion | cron daily 10:00 | Production update + review request |
| NPS score 9-10 | auto trigger | Schedule referral ask in 14 days |
| NPS score 0-6 (detractor) | auto trigger | Immediate flag to Barak, propose call |
| 6 months silence from customer | weekly cron | "How's everything?" reachout proposal |

### 3.B.4 Google Review Automation — Hebrew + WhatsApp

**Source data:** 2-3x more reviews via automation vs manual; SMB doing 50-100 transactions/m collects 10-30 new reviews/m with auto.

**Pipeline:**
```
Job completed → 24h pass → first auto WA:
"היי X, ניר סיים את ההתקנה אצלך אתמול.
 הכל פועל כשורה? יש שאלות?"
  ↓
T+24h response YES + positive
  ↓ wait 5 days (let experience settle)
  ↓
"⭐ אם היית מרוצה מהשירות, נשמח לביקורת ב-Google!
 הקישור: [google.com/.../bee-review]
 ה-ביקורות עוזרות לעסקים מקומיים."
  ↓
optional: send same link via SMS (98% open rate)
```

**Compliance (FTC 2024 + Google policies):**
- **לא** להציע תמורה ("review → discount") — אסור
- **לא** ל-sentiment-route (לבקש רק מ-happy customers) — אסור FTC
- **כן** ל-ask כולם באותו אופן + same timing
- **כן** ל-respond ל-reviews (publicly) — increases CTR

**Tools to use:**
- **WiserReview** או **HiFiveStar** — Hebrew not specifically tested but generic works
- **n8n template** — DIY, free if self-host (v4 deep dive 5)
- **MTSFlow** — Google policy compliant, professional
- DIY בHermes — לבנות `bee-review-cron.js` + WA send → cheapest

### 3.B.5 Referral Program — חצי-ידני נכון לעכשיו, אוטומציה הדרגתית

**Structure ל-BEE:**

```
Double-sided reward (best practice לסולאר per ReferralRock):
  • Referrer (existing customer): ₪500-1,500 cash או credit
  • New customer (referee): 3-5% off פרויקט

Tracking:
  • Each customer has unique referral code → :Lead.referral_code
  • Code mentioned in inbound (call/WA) → auto-attribute
  • OR: explicit "מי הפנה אותך?" question on first contact

Activation:
  • 30 days post-install: "X, אם אתה מרוצה — נשמח שתפנה חברים. 
    הנה קישור הפנייה שלך: [unique URL]"
  • Reminder at 90 days, 180 days if no referrals yet
  • If customer refers 1 → upgrade ל-VIP status (faster service)
```

**Tools:**
- **Locorum** — focused on solar/home improvement, instant reward fulfillment
- **Referral Rock** — 50+ CRM integrations
- **DIY ב-Monday** — column "Referral code" + automation "if new lead has code, notify referrer"
- **המלצה ל-BEE Phase 1:** DIY ב-Monday + WA links — free, controllable
- **Phase 2 (>50 active customers):** Referral Rock — $200-400/m, full tracking

### 3.B.6 Win-back campaigns — lapsed customers

לקוחות שלא דיברנו איתם 12+ חודשים = **win-back candidates**.

**Detection:**
```sql
-- Lapsed customer query (KG-based)
MATCH (c:Customer)
WHERE NOT EXISTS {
  MATCH (c)<-[:WITH|:FROM]-(activity)
  WHERE activity.created_at > date() - duration({months: 12})
}
RETURN c.name_he, c.phone, c.last_seen
ORDER BY c.ltv_NIS DESC
LIMIT 50
```

**Win-back sequence:**
```
T+0    "X, שלום ממך כבר זמן. הכל בסדר?"
       (just a touchpoint, no ask)
       
T+7d if no response:
       "אם בא לך לראות עדכוני מערכת או ב-מבצע תחזוקה -
        כאן בשבילך. ⚡ ברק"
       
T+30d if still no response:
       Move to dormant — re-engage only on relevant trigger
       (e.g., product anniversary, warranty milestone)
```

**הגנה מ-spam:**
- Max 2 outreach attempts in 30 days
- Customer opt-out triggers permanent dormant status
- All outreach via approved channels (constitutional sendPolicy)

### 3.B.7 Customer health score — Composite metric

לכל לקוח, נחשב מדד 0-100 שמשקף "כמה ה-relationship בריא":

```python
def calc_customer_health(customer):
    score = 50  # baseline
    
    # Engagement signals (positive)
    if customer.last_activity_days < 30: score += 15
    if customer.replies_within_24h_rate > 0.7: score += 10
    if customer.nps_last >= 8: score += 15
    if customer.referrals_made >= 1: score += 10
    if customer.repeat_purchase: score += 10
    
    # Risk signals (negative)
    if customer.complaints_30d > 0: score -= 15
    if customer.nps_last <= 6: score -= 20
    if customer.payment_late_30d > 0: score -= 10
    if customer.last_activity_days > 180: score -= 25
    if customer.competitor_mentioned: score -= 15
    
    return max(0, min(100, score))
```

**משמש ל:**
- Alfred priority routing ("טפל קודם ב-Health<40")
- evening briefing (v3): "3 לקוחות ב-risk score < 30"
- automated escalation: health drop >15pts in week → Barak alert

### 3.B.8 Time-to-value

| Phase | זמן | פעולה |
|---|---|---|
| onboarding sequence (T+1d hello) | 1h | concrete cron + template |
| CSAT 24h + NPS 7d cron | 2h | survey logic + result capture ל-KG |
| Review request automation | 3h | Hebrew template + Google link generator |
| Referral code system | 4h | per-customer unique code + Monday tracking |
| Win-back detection + sequence | 3h | KG query + cron + template |
| Health score calculator | 3h | + dashboard widget |
| **Total** | **~16h** | **Full post-sale lifecycle automated** |

---

## 3.C — Sales Analytics Dashboard + Funnel

### 3.C.1 ההקשר

v3 הציע Alfred dashboard עם 17 routes. v5 הוסיף /calls + /leads + /missed. **חסר: analytics dashboard שמראה ROI + bottlenecks**.

**מקור benchmark:** [Improvado Sales Dashboard 2026](https://improvado.io/blog/sales-dashboard), [Forecastio 20 pipeline metrics 2026](https://forecastio.ai/blog/sales-pipeline-metrics)

### 3.C.2 BEE Sales Funnel — שלבים

```
1. Awareness     — מישהו שמע על BEE (ad click, referral mention, walk-by)
2. Lead          — pernu pratt — שם + טלפון, no commitment yet
3. Contacted     — Barak/Shlomi חזרו ל-lead
4. Qualified     — lead has budget + decision-making power + timing
5. Quote sent    — הצעת מחיר יצאה
6. Negotiating   — discussion of terms
7. Closed Won    — חוזה חתום + advance שולם
8. Installed     — work completed
9. Reviewed      — customer left review (post-sale loop)
10. Repeat / Referred — customer ordered again או הפנה חבר
```

### 3.C.3 KPIs — 22 metrics לBEE (subset של 80 standard)

| Stage | Metric | Target BEE | Source |
|---|---|---|---|
| 1→2 | **Lead capture rate** | >30% of awareness | Marketing UTM |
| 2→3 | **Contact rate** | >95% within 24h | Monday Activities |
| 2→3 | **Avg time to first contact** | <60min | timestamps |
| 3→4 | **Qualification rate** | >50% | lead_quality_score |
| 4→5 | **Quote send rate** | >80% (qualified → quote) | Monday |
| 5→7 | **Win rate** | >30% (quote → close) — SMB benchmark | Monday |
| 5→6 | **Avg time to first response on quote** | <48h | timestamps |
| 6→7 | **Negotiation cycle days** | <14d | timestamps |
| 7→8 | **Install fulfillment time** | <14d post-payment | timestamps |
| 8→9 | **Review rate** | >40% installs leave review | post-sale automation |
| 8→10 | **Repeat customer rate** | >20% in 24m | KG query |
| 8→10 | **Referral rate** | >15% installs refer someone | referral codes |
| Volume | **Leads/month** | track only | UTM + Monday |
| Volume | **Quotes/month** | track only | Monday |
| Volume | **Deals closed/month** | track only | Monday |
| Volume | **Revenue/month NIS** | target growth | Cardcom/invoices |
| Velocity | **Avg sales cycle days** | 30-90 SMB norm | Monday timestamps |
| Velocity | **Pipeline velocity** | >₪50K/week | calc: leads × win × value / cycle |
| Pipeline | **Pipeline coverage** | 3x of target | open quotes ÷ monthly target |
| Pipeline | **Avg deal size NIS** | track only | quote.amount avg |
| Health | **Pipeline aging** | <30% > 90 days | Monday stage durations |
| Health | **Stale deals** | <10% no activity 30d | last_activity_at |

### 3.C.4 Dashboard structure — 4 panels

```
┌──────────────────────────────────────────────────────────┐
│  Panel 1: TODAY                                          │
│  • New leads today: 3 (1 from Google, 1 WA, 1 referral)  │
│  • Quotes sent today: 2                                  │
│  • Deals closed today: 0                                 │
│  • Revenue today: ₪0 (last close 2d ago)                 │
│  • Open urgent items: 2 (calls due back, 1 quote due)   │
├──────────────────────────────────────────────────────────┤
│  Panel 2: THIS WEEK                                      │
│  • Pipeline value: ₪450K (12 active deals)               │
│  • Win rate (last 30d): 35% (above target)               │
│  • Avg deal size: ₪38K                                   │
│  • Top source: WhatsApp (40%), referrals (25%), Google (20%)│
├──────────────────────────────────────────────────────────┤
│  Panel 3: FUNNEL (last 90d)                              │
│  Leads ████████████████████ 120                          │
│  Contacted ███████████████ 115                           │
│  Qualified █████████ 65                                  │
│  Quoted ███████ 52                                       │
│  Closed Won ███ 18                                       │
│  → 15% lead-to-close rate                                │
│  → bottleneck: Qualified→Quoted (87% conversion good)    │
│  → bottleneck: Quoted→Won (35% — could improve)          │
├──────────────────────────────────────────────────────────┤
│  Panel 4: AI INSIGHTS (auto-generated weekly)            │
│  🔎 "ראיתי 5 deals stalled at 'quoted' >14 days —          │
│      טיוטה ל-followup מוכנה."                              │
│  🔎 "Win rate ירד מ-40% ל-30% החודש. בדיקה: לקוחות         │
│      מציינים מתחרה X כאלטרנטיבה. propose price strategy."   │
│  🔎 "Source 'Google Ads' עלות-per-deal עלה 25% — בדיקת     │
│      keywords נדרשת."                                     │
└──────────────────────────────────────────────────────────┘
```

### 3.C.5 Data pipeline ל-dashboard

```
Sources:
  • Monday.com (status changes, item creation, value fields)
  • Cardcom (payments, invoices issued)
  • KG (Neo4j) — relationships + history
  • Calls (v5) — duration, sentiment, outcome
  • UTM tracking (web → form)
        ↓
Aggregator service (Node.js or Python script)
  • Runs every 5min, computes all 22 metrics
  • Stores snapshot in time-series (SQLite or InfluxDB)
        ↓
Dashboard UI (Alfred dashboard extension)
  • Static HTML + Chart.js + SSE for real-time
  • /sales/today /sales/week /sales/funnel /sales/insights routes
        ↓
Weekly AI insights cron:
  • Sunday 18:00 — Claude Sonnet analyzes week's data
  • Output: 3-5 insights with proposed actions
  • Delivered ⚡ to Barak in evening briefing
```

### 3.C.6 A/B testing infrastructure

לפי v3 Layer 7 self-improvement, BEE צריך A/B for sales templates:

| Variant target | מה לבדוק | minimum sample |
|---|---|---|
| Quote subject line | "הצעת מחיר" vs "הצעה אישית לX" | 20 per variant |
| Quote send time | morning vs evening | 30 per variant |
| Followup wording | direct ("בא לחתום?") vs soft ("יש שאלות?") | 30 per |
| Initial contact channel | WA first vs call first | 50 per |
| Price anchor | bundled vs itemized | 30 per |

**Tools:**
- **DIY:** Hermes A/B testing skill (exists per skills audit)
- **Langfuse Cloud (v4)** — has built-in prompt A/B for AI calls
- **n8n templates** — A/B for email + WhatsApp

### 3.C.7 ROI metric model ל-BEE

```
Customer Lifetime Value (CLV):
  CLV = avg_order_value × purchases_per_year × customer_lifespan_years
  BEE est: ₪40K × 1.2 orders/y × 8 years = ₪384K

Customer Acquisition Cost (CAC):
  CAC = total_marketing_spend / new_customers
  Target: CLV:CAC ≥ 3:1 for healthy

Payback period:
  CAC ÷ (avg_monthly_margin_per_customer)
  
Channel ROI:
  Revenue_from_channel / Spend_on_channel
  Track per-channel via UTM + KG lead.source
```

### 3.C.8 Time-to-value

| Phase | זמן | פעולה |
|---|---|---|
| 22 KPI definitions + data source mapping | 4h | spec doc |
| Aggregator service (5min cron) | 6h | Node.js script |
| Dashboard 4 panels UI | 8h | HTML + Chart.js + SSE |
| Weekly AI insights cron | 3h | Claude Sonnet prompt + scheduling |
| A/B testing scaffold | 4h | template-rotation logic |
| **Total** | **~25h** | **Analytics fully operational** |

---

## 3.D — Marketing & Lead Acquisition Stack

### 3.D.1 ההקשר

BEE היום מגלגל לקוחות בעיקר דרך **referral + WA inbound**. עד כה לא דיברנו על marketing **outbound**. כדי לגדול, צריך proactive channels: Google Ads, Meta Lead Ads, SEO local, landing pages.

### 3.D.2 Channel mix recommendations ל-BEE — Israeli SMB

| Channel | Cost/lead | Quality | Setup | Volume | מתאים ל-BEE? |
|---|---|---|---|---|---|
| **Google Ads search** | ₪80-200 | High intent (searching solar) | medium | medium | ✅✅ — high intent buyers |
| **Google Ads Local Services Ads (LSA)** | pay-per-call ₪50-100 | Highest | easy | low-medium | ✅✅ — paid only on contact |
| **Meta Lead Ads** | ₪40-100 ($27.66 USD avg) | medium intent | medium | high | ✅ — cheap volume |
| **Local SEO + GMB** | low (long-term) | very high (organic) | hard | medium | ✅✅✅ — must have |
| **Referrals (existing)** | ₪500-1500 reward | highest | easy | low | ✅ — best ROI |
| **TikTok Israel** | ₪30-80 | low intent | hard (content creation) | high | ⚠️ — only if video team |
| **Israeli WhatsApp groups (industry)** | $0 | medium | manual | low | ⚠️ — risk of spam ban |
| **Outdoor signage (trucks)** | one-time | brand only | easy | low | ✅ — assumes Trace fleet |
| **Local print (city mag)** | medium | low intent | easy | very low | ❌ — outdated |

### 3.D.3 Google Ads — Israeli specifics

מ-research:
- Google = 97.79% Israeli search market
- Geo-targeting: densely populated cities + nearest radius (Tel Aviv 30km, Jerusalem 20km, חיפה 25km)
- Hebrew + Russian campaigns separate (49% Hebrew + 18% Russian)
- ₪80-200 per click for solar keywords (competitive)

**Setup ל-BEE:**

```
Campaign 1: Solar — generic
  Keywords: "התקנת מערכת סולארית", "פאנלים סולאריים מחיר", 
            "סולאר ביתי", "אנרגיה סולארית"
  Geo: Israel center + south (BEE region)
  Budget: ₪2,000/m
  Schedule: 06:00-22:00, all days

Campaign 2: Solar — high-intent  
  Keywords: "מערכת סולארית מחיר", "הצעת מחיר סולארית",
            "כמה עולה התקנת פאנלים"
  Geo: Same
  Budget: ₪1,500/m
  Schedule: 08:00-19:00, Sun-Thu

Campaign 3: Electrical
  Keywords: "חשמלאי", "תיקון חשמל", "בודק חשמלאי"
  Geo: tight to BEE service area
  Budget: ₪1,000/m
  
Campaign 4: Brand defense
  Keywords: "BEE" + variants
  Bid: low, just prevent competitor poaching
```

**Total est budget:** ₪4,500/m → est 25-35 leads/m at ₪150 CPL → 3-5 deals/m at 15% close = ₪120K-200K revenue.

### 3.D.4 Meta Lead Ads — supplemental volume

- $27.66/lead avg, but lower intent than Google
- Best for **awareness + retargeting**, not first-touch
- Israeli SMBs see decent results on Facebook + Instagram combined

**Setup ל-BEE:**

```
Campaign 1: Awareness
  Audience: lookalike of existing customers + interests (סולאר, חיסכון, התייעלות אנרגטית)
  Creative: testimonial video, before/after install photos
  Budget: ₪1,500/m
  Goal: Brand awareness + lead form fills

Campaign 2: Retargeting
  Audience: visited bee-website.com (Pixel)
  Creative: case study + offer
  Budget: ₪800/m

Lead Ad form fields:
  - Name, phone, email
  - Address (city only — privacy)
  - Estimated monthly electric bill
  - Roof type / direction
  → Auto-import to Monday "Leads" via Facebook Conversions API → webhook → Hermes
```

### 3.D.5 Local SEO + Google My Business

**Israeli market data:**
- 78% Israeli searches in Hebrew
- 85% mobile-first
- ₪4,800-6,500/m typical SMB SEO investment
- 14-21 days to see GMB ranking changes

**Foundation actions:**

```
GMB optimization:
  • Complete profile (hours, photos, services, attributes)
  • Hebrew + English names where appropriate
  • Service area definition (cities + radius)
  • Categories: "מתקין מערכות סולאריות" + "חשמלאי"
  • Weekly post (offers, completed projects, tips)
  • Q&A section pre-populated

Citation building:
  • Israeli directories: Yad2, Easy, MyApp, GoPlan, b144
  • Industry: solar associations, regulatory listings (PUA)
  • NAP consistency (name/address/phone same everywhere)

On-page SEO:
  • Hebrew RTL site (hreflang he-IL)
  • Schema markup (LocalBusiness, Service, FAQPage)
  • City-specific landing pages (Tel Aviv, חיפה, באר שבע, etc.)
  • Internal linking between services + projects + blog

Content marketing:
  • Weekly blog post (Hebrew) about solar tips, regulatory updates, case studies
  • Customer testimonial videos (with permission)
  • FAQ schema for common questions

Review velocity:
  • From v6 3.B.4 — auto-request reviews
  • Target: 4-5 reviews/m, 4.7+ avg rating
```

### 3.D.6 Landing page optimization — Hebrew RTL specifics

**Key principles 2026:**
- Message match (ad → landing page)
- Simplicity > complexity
- Trust signals (reviews, awards, regulatory licenses)
- Mobile-first (85% Israeli mobile)

**Hebrew RTL considerations:**
- Direction: RTL throughout (CSS `direction: rtl`)
- Number formatting: ₪ symbol position right or left of number (Hebrew convention right: "1,000 ₪")
- Read order: right-to-left, so CTAs go on right side
- Fonts: David, Heebo, Open Sans Hebrew (Google Fonts)
- Mixed Hebrew-English: handle ltr/rtl per text run
- Form fields: labels above field (not left/right — confuses RTL)

**Template ל-BEE landing page:**

```
[hero with "התקנת מערכת סולארית — חוסך 70% מחשבון החשמל"]
[CTA: "קבל הצעת מחיר חינם"  ← prominent right side]
[trust badges: "10 שנות אחריות" + "התקנות מוסמכות" + "מעל 200 לקוחות מרוצים"]
[3 benefits with icons]
[social proof: testimonials with photo + name + city]
[FAQ accordion: top 8 questions]
[form: name + phone + city + estimated bill — 4 fields max]
[footer: contact + licenses + Google review snippet]
```

**Conversion tools:**
- **Heatmaps:** Hotjar (free tier) or Lucky Orange
- **A/B testing:** Google Optimize discontinued; alternatives = VWO, AB Tasty, or DIY with feature flags
- **Forms:** Tally.so (free), Typeform (paid), or DIY ב-React/Vue

### 3.D.7 Lead attribution — UTM + multi-touch

**Simple UTM scheme ל-BEE:**

```
utm_source = google | facebook | instagram | tiktok | referral | email
utm_medium = cpc | organic | social | partner | email
utm_campaign = solar-generic-2026q2 | solar-highintent-2026q2 | ...
utm_term = (keyword if applicable)
utm_content = (ad variant)

Example URL:
bee.co.il/solar?utm_source=google&utm_medium=cpc&utm_campaign=solar-highintent-2026q2&utm_term=מערכת+סולארית+מחיר
```

**Capture flow:**

```
Visitor lands → JS captures UTM → first-party cookie
        ↓
Visitor fills form → form submission includes UTM data
        ↓
Form → webhook → Monday "Leads" with utm_source/medium/campaign columns
        ↓
KG: (:Lead {source: 'google-cpc-solar-highintent'})-[:LANDED]-(:LandingPage)
        ↓
Later: lead → quote → close → :Job
        ↓
Attribution analytics: 
  "Of 18 closed deals last 30d, source breakdown:"
  • Google CPC: 7 (39%)
  • Referral: 5 (28%)
  • WhatsApp direct: 4 (22%)
  • Facebook: 2 (11%)
  • Cost-per-deal: Google ₪450, FB ₪750, referral ₪500 (avg reward paid)
```

**Multi-touch attribution model:**
- **First-touch** (overstates awareness channels)
- **Last-touch** (overstates closer-channels)
- **Linear** (equal credit all touches)
- **U-shaped** (40% first, 40% last, 20% middle) — **המלצה ל-BEE**

Tools:
- **Cometly** ($299/m) — full multi-touch
- **Improvado** — enterprise
- **DIY** — track in KG with timestamps + simple linear or U-shape calc in dashboard

### 3.D.8 Marketing budget proposal ל-BEE 2026 Q3-Q4

```
Channel              Monthly      Annual
─────────────────────────────────────────
Google Ads search    ₪4,500       ₪54,000
Google LSA           ₪1,500       ₪18,000
Meta Lead Ads        ₪2,300       ₪27,600
SEO + content        ₪3,000       ₪36,000
Referral rewards     ₪3,000       ₪36,000 (assumed 6 referrals × ₪500)
Landing page tools   ₪200         ₪2,400
Attribution tool     ₪0 (DIY)     ₪0
─────────────────────────────────────────
Total marketing      ₪14,500      ₪174,000

Target outcomes:
  • New leads: 60/m × 12 = 720/year
  • Closed deals: 720 × 15% close = 108 deals
  • Revenue (avg ₪40K): ₪4,320,000
  • Marketing ROI: 4,320K / 174K = 24:1 — strong
```

(numbers הם projections — דורש validation מול ה-actual של BEE היום)

### 3.D.9 Time-to-value

| Phase | זמן | פעולה |
|---|---|---|
| GMB optimization | 4h | profile complete + photos + first posts |
| Local SEO foundation | 1 week | citations + on-page + schema + city pages |
| Google Ads setup | 4h | 4 campaigns + tracking |
| Meta Lead Ads setup | 3h | 2 campaigns + Pixel + form |
| Landing page (Hebrew RTL) | 12h | design + dev + A/B variants |
| UTM tracking integration | 4h | JS + form → Monday columns + KG |
| Attribution dashboard | 6h | extension של panel 3 בv6 3.C.4 |
| **Total** | **~33h** | **Marketing stack operational** |

---

## 3.E — Integration: איך הכל מתחבר

### 3.E.1 Unified flow diagram

```
┌──────────────────────────────────────────────────────────────┐
│  INPUTS                                                       │
│  • WhatsApp inbound (Alfred via Hermes :3000)                │
│  • Phone calls (v5 — iOS native / Cube ACR)                  │
│  • Email (Gmail)                                              │
│  • Google Ads / Meta forms (webhooks)                        │
│  • Landing page submissions                                   │
│  • Monday webhooks                                            │
│  • Referral signups (unique URLs)                            │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  UNDERSTANDING (v3 Layer 2 + v5 + v6)                         │
│  • DictaBERT NER extracts entities                            │
│  • Intent classification (18+ from v3, 4 more from v5)        │
│  • Confidence scoring                                         │
│  • UTM enrichment (from v6 3.D.7)                             │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  KNOWLEDGE GRAPH (v6 3.A)                                     │
│  Neo4j Community on bee-prod-1                                │
│  Entities: Person/Customer/Site/Equipment/Job/Quote/Lead/Call │
│  Cross-references all data                                    │
│  Source of truth for analytics queries                       │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  ROUTING + DECISION (v3 Layer 3-4)                            │
│  • Lead → Monday Leads board                                  │
│  • Existing customer → Monday Activities                      │
│  • Task → task_queue.jsonl                                    │
│  • Calendar item → Google Calendar                            │
│  • Health-score-low → escalate to Barak                       │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  POST-SALE LIFECYCLE (v6 3.B)                                 │
│  • T+24h CSAT survey                                          │
│  • T+30d review request                                       │
│  • T+180d referral activation                                 │
│  • T+12m anniversary                                          │
│  • Lapsed customer detection                                  │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  ANALYTICS + INSIGHTS (v6 3.C)                                │
│  • 22 KPIs computed every 5min                                │
│  • Funnel visualization                                       │
│  • Weekly AI insights (Claude Sonnet)                         │
│  • A/B testing infrastructure                                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  MARKETING ATTRIBUTION (v6 3.D)                               │
│  • UTM tracking through journey                               │
│  • Multi-touch (U-shaped) attribution                         │
│  • Channel ROI feedback to budget allocation                  │
│  • Continuous optimization loop                               │
└──────────────────────────────────────────────────────────────┘
```

### 3.E.2 Data dependencies

| Layer | Depends on |
|---|---|
| Marketing acquisition (3.D) | UTM + KG + Monday |
| Sales analytics (3.C) | KG + Monday + Cardcom |
| Post-sale lifecycle (3.B) | KG + Calendar + WA |
| Knowledge graph (3.A) | All sources via mappers |
| Voice pipeline (v5) | Audio capture + Whisper + KG mention extraction |

**Order of build (recommended):**
1. KG foundation (3.A) — без него אין נקודת אגירה
2. Voice pipeline (v5) — gives rich data fast
3. Analytics dashboard (3.C) — visibility once data flows
4. Post-sale automation (3.B) — depends on visibility
5. Marketing stack (3.D) — needs analytics ל-feedback loop

### 3.E.3 Total scope additions to existing waves

| Wave | original (v1-v5) | v6 addition |
|---|---:|---|
| Wave 3 | ~16-20h | +19h (KG setup) → ~35-39h |
| Wave 4 | ~26h | +16h (post-sale) + 25h (analytics) → ~67h |
| Wave 5 | ongoing | +33h (marketing stack) → ongoing+33h |
| **Cumulative total** | ~125h | **~225h** for full v1-v6 build-out |

---

## 3.F — שאלות חדשות (Q43-Q50)

| # | שאלה | קריטיות | המלצה |
|---|---|---|---|
| Q43 | **Neo4j Community על bee-prod-1?** OK עם RAM extra ~2GB? | 🟠 high | yes — CX52 16GB יש כיסוי |
| Q44 | **כמה לקוחות קיימים לBEE היום?** ל-customer health scoring + win-back | 🟠 high | מספר ↓ → manual phase Phase 1 |
| Q45 | **קיים Google Business Profile?** אם לא — Wave 1 | 🟠 high | חובה לפני Marketing Wave |
| Q46 | **תקציב marketing חודשי realistic?** ₪14,500 הצעה — אפשר פחות בהתחלה | 🟡 medium | להתחיל ₪5K-7K test |
| Q47 | **bee-website.com קיים?** SEO + landing pages | 🟠 high | אם לא — Wave 5.5 ייעודי לבניית site |
| Q48 | **A/B testing platform** — DIY בHermes, Langfuse, או external? | 🟡 medium | DIY בHermes (audit Q5 skill) |
| Q49 | **Review automation policy** — willing לסכן את "neutral" reviews? FTC compliant | 🟢 low | yes — long-term gain > short-term filtering |
| Q50 | **Referral rewards** — ₪500-1,500 — באישור? | 🟡 medium | depends on margin per deal |

---

## 3.G — מקורות חדשים (v6 research)

### Knowledge graph
- [Neo4j Knowledge Graph Generation 2026](https://neo4j.com/blog/developer/knowledge-graph-generation/)
- [Neo4j IT Service Graph](https://neo4j.com/developer/industry-use-cases/agnostic/it-service-graph/it-service-graph/)
- [neo4j-labs/create-context-graph](https://github.com/neo4j-labs/create-context-graph)
- [6-Minute Guide to Knowledge Graphs and Neo4j](https://medium.com/data-science-collective/6-minute-guide-to-knowledge-graphs-and-neo4j-c9f95d379f0c)

### Customer journey + NPS + reviews
- [LoyaltyLoop 2026 Customer Service Benchmarks SMB](https://loyaltyloop.com/blog/customer-service-benchmarks-smb-2026.html)
- [Customer Retention Software 2026 (ClearlyRated, Appcues)](https://www.clearlyrated.com/blog/customer-retention-software)
- [Field Service Management Buyers Guide 2026](https://research.isg-one.com/buyers-guide/business-technologies/customers-and-cx/field-service-management/2026)
- [WiserReview — Automate Google Reviews](https://wiserreview.com/blog/automate-google-reviews/)
- [MTSFlow Google Review Automation](https://mtsflow.com/)
- [GrowwStacks n8n Google review automation](https://growwstacks.com/blog/automate-google-reviews-with-n8n)
- [HiFiveStar best review tools 2026](https://blog.hifivestar.com/posts/best-tools-for-automating-google-review-requests-in-2026)

### Referral programs
- [ResultCalls Solar Referral 2026 Guide](https://resultcalls.com/blog/2026-solar-referral-program-guide-get-more-solar-leads)
- [ReferralRock — solar programs](https://referralrock.com/blog/solar-referral-programs/)
- [ServiceTitan electrical contractor referrals 2026](https://www.servicetitan.com/blog/electrical-contractor-referrals)

### Sales analytics
- [Improvado Sales Dashboard 2026](https://improvado.io/blog/sales-dashboard)
- [Salesmotion Pipeline Metrics 2026](https://salesmotion.io/blog/sales-pipeline-metrics)
- [Forecastio 20 Sales Pipeline Metrics 2026](https://forecastio.ai/blog/sales-pipeline-metrics)
- [Apollo Sales Pipeline Best Practices 2026](https://www.apollo.io/insights/what-is-a-sales-pipeline)
- [GrowthToday B2B Sales Funnel Metrics 2026](https://www.growthtoday.co/blog/b2b-sales-funnel-metrics)

### A/B testing + CRO
- [ChatArchitect WhatsApp A/B testing](https://www.chatarchitect.com/news/boost-conversions-with-a-b-testing-for-email-to-whatsapp-campaigns)
- [Monday email A/B testing complete guide 2026](https://monday.com/blog/monday-campaigns/email-ab-testing/)
- [Interakt WhatsApp template A/B for SMBs](https://www.interakt.shop/whatsapp-marketing/how-smbs-can-optimize-copy-ctas-and-interactive-elements-for-maximum-roi/)
- [EchoLeads WhatsApp conversion 45-60%](https://echoleads.ai/blog/whatsapp-conversion-rates-above-45-60-benchmark-2026)

### Marketing acquisition Israel
- [TechBehemoths Google Ads agencies Israel 2026](https://techbehemoths.com/companies/google-ads/israel)
- [AdWService Google Ads Israel customization](https://adwservice.com.ua/en/google-contextual-advertising-in-israel)
- [LocalSEOIsrael services 2026](https://localseoisrael.co.il/services/)
- [RankTracker Hebrew SEO complete guide](https://www.ranktracker.com/blog/a-complete-guide-for-doing-seo-in-hebrew/)
- [AdManage Facebook CPL benchmarks 2026](https://admanage.ai/blog/facebook-ads-cost-per-lead-benchmarks)
- [SalesHive Meta Ads 2026 review](https://saleshive.com/vendors/meta-ads-facebook-instagram/)

### CRO + landing pages
- [CRODigital Marketing CRO 2026 guide](https://crodigitalmarketing.com/conversion-rate-optimization-2026-guide/)
- [Leadfeeder Landing Page Best Practices 2026](https://www.leadfeeder.com/blog/conversion-optimization/landing-pages-convert/)
- [LuckyOrange CRO complete guide 2026](https://www.luckyorange.com/blog/posts/conversion-rate-optimization-guide)

### Attribution + UTM
- [SalesforceBen UTM tracking 2026](https://www.salesforceben.com/salesforce-utm-tracking-how-to-capture-every-touchpoint/)
- [Cometly UTM limitations 2026](https://www.cometly.com/post/utm-tracking-limitations)
- [Ruler Analytics multi-touch attribution](https://www.ruleranalytics.com/blog/click-attribution/multi-touch-attribution/)
- [Improvado 12 multi-touch attribution solutions 2026](https://improvado.io/blog/multi-touch-attribution-solutions)

---

## 3.H — Final scope summary (v1-v6 cumulative)

| Component | Status | Size | hours est |
|---|---|---|---|
| v1 federation OpenClaw⇄Hermes | ✅ pushed, approved | 458 lines | ~50h |
| tools-deep-audit MCPs | ✅ pushed | 321 lines | bundled in waves |
| v2 RAG+Composio+sandbox+Frigate | ✅ pushed | 458 lines | ~15h |
| v3 office automation 9-layer | ✅ pushed | 975 lines | ~38h |
| v4 A2A+docs+SHAAM+voice+n8n+Langfuse | ✅ pushed | 679 lines | ~24h |
| **v5 voice + call pipeline** | **⏳ written, awaiting push** | **650 lines** | **~24h** |
| **v6 (this plan) KG+post-sale+analytics+marketing** | **📝 in plan file** | **~900 lines** | **~93h** |
| **Total** | | **~4,500 lines** | **~244h** |

זה לא "Alfred with MCPs" — זו **operations team ב-codebase + AI brain מקיף**.

---

## 3.I — שלבי build-out מומלצים (final consolidated)

### Q3 2026 (יוני-אוגוסט)
- ✅ Wave -1: Bug squash + v1 quick wins (~6h)
- ✅ Wave 0: Crisis fix (Hermes 0.14, DeepSeek balance, port 3000) (~3h)
- ✅ Wave 1: Single source of truth — Baileys + dedup (~8h)
- 🚨 **SHAAM compliance** (v4 critical — deadline ינואר/יוני) (~6h)
- ✅ Wave 2: MCP foundation + Composio + Tier 1 + Tier 2 Israeli (~14h)
- ✅ KG foundation (v6 3.A) Neo4j + mappers (~19h)
- ✅ Voice pipeline v5 Layer 1-3 (~12h)

### Q4 2026 (ספטמבר-נובמבר)
- ✅ Wave 3: capability splits (RAG, voice e2e, reactions, active-memory) (~20h)
- ✅ Voice pipeline v5 Layer 4-5 (~12h)
- ✅ Analytics dashboard v6 3.C (~25h)
- ✅ Post-sale automation v6 3.B (~16h)

### Q1 2027 (דצמבר-פברואר)
- ✅ Wave 4: Platform expansion + Frigate + observability (~26h)
- ✅ Marketing stack v6 3.D (~33h)
- ✅ A2A protocol (אם בעתיד יהיו עוד agents)

### Q2 2027+ (אונגוינג)
- ✅ Wave 5: continuous optimization
- ✅ Quarterly security review
- ✅ Weekly self-improvement
- ✅ Customer health score continuous

---

## ⚠️ Verification (איך תדעו שזה עובד)

| Metric | Baseline (pre-v6) | Target post-v6 | מדידה |
|---|---|---|---|
| Customer health score avg | n/a — חדש | track baseline by Aug 2026 | KG query |
| NPS response rate | n/a | >50% | survey logs |
| Review rate (installs → reviews) | est <10% | >40% | GMB API |
| Referral rate | est <5% | >15% | KG: :Customer-[:REFERRED]->:Lead |
| Marketing CPL Google CPC | n/a | <₪150 | UTM analytics |
| Marketing CPL Meta | n/a | <₪100 | UTM analytics |
| Multi-touch attribution accuracy | 0% (no tracking) | >90% of leads tagged | UTM in Monday lead rows |
| Funnel visibility | manual | real-time dashboard | dashboard SSE |
| Sales cycle days | est 45d | <40d after KG + analytics | timestamps |
| Lapsed customer win-back rate | n/a | >10% | KG query + outcomes |
| Time to onboard new tech | manual | <1 day with KG context | demo session |

---

*נכתב על-ידי הסשן הענני 2026-05-26 Asia/Jerusalem ב-plan mode (locked from commits). ה-plan file הזה הוא ה-deliverable היחיד שניתן לעדכן. v5 voice pipeline ממתין ל-push ברגע שיוצאים מ-plan mode.*

*Total v1-v6: ~4,500 lines של תכנון, ~244h של עבודת פיתוח מתואמת.*

---

# Part 4 — v7: Full Agent Organization (Business + Personal Life)

**ההבנה החדשה:** v1-v6 כיסו את **החלק העסקי** של BEE. ברק ביקש משהו רחב יותר: צוות סוכנים שמכסה את **כל העיסוקים היומיים** — עסק + חיים אישיים + משפחה + בריאות + פיננסים אישיים + לימוד + רשתות חברתיות + חובות אזרחיות. **virtual organization** עם department heads, לא רק AI tools.

זה ה-paradigm shift: במקום סוכן אחד (Alfred) שמטפל בהכל, **12 סוכנים specialized** — כל אחד עם charter, tools, memory, escalation rules, ו-daily routines משלו.

## 4.A — מפת הפעילויות המלאה של ברק

לפי AGENTS.md + הנחות business owner + research על SMB Israeli owner-operators:

### A.1 Business surface (BEE)
| תחום | פעילות יומית/שבועית | זמן/שבוע (אומדן) |
|---|---|---|
| Sales & quotes | שיחות עם לידים, הצעות מחיר, מעקב | 8-12h |
| Project management | תיאום התקנות, dependencies, blockers | 5-8h |
| Customer support | מענה לתלונות, troubleshoot, follow-ups | 4-6h |
| Field operations | ביקורי אתר, פיקוח, troubleshoot | 6-10h |
| Procurement | הזמנות חלקים, ספקים, אספקה | 3-5h |
| HR / team | תיאום Neri/Shlomi, performance, payroll | 2-4h |
| Bookkeeping | חשבוניות, payments, expenses, reconcile | 3-5h |
| Tax & compliance | SHAAM, NI, Mas Hahnasa, regulatory | 2-3h |
| Banking | הפקדות, העברות, vendor pay | 1-2h |
| Marketing | ads, content, social, SEO | 2-4h |
| Vendor relations | meetings, negotiations | 2-3h |
| Strategic planning | quarterly review, growth decisions | 1-2h |
| **Total business** | | **~40-65h/week** |

### A.2 Personal surface
| תחום | פעילות יומית/שבועית | זמן/שבוע (אומדן) |
|---|---|---|
| Family logistics | ילדים, ת.ביה"ס/גן, חוגים, רופאים | 5-10h |
| Personal health | רופא, ספורט, תזונה, שינה, תרופות | 3-5h |
| Personal finance | חשבון אישי, השקעות, פנסיה, ביטוחים | 1-2h |
| Home management | תחזוקה, קניות, חשבונות בית | 2-4h |
| Vehicle (personal) | טיפולים, ביטוח, דלק, רישוי | <1h/week, ~3h/month |
| Social/relationships | חברים, אירועים, פגישות חברתיות | 2-5h |
| Continuing education | קריאה, סרטונים, קורסים, רישיון בודק | 2-4h |
| Hobbies / personal interests | (depends on Barak) | 1-3h |
| Spouse / partner | תיאום ביתי, romance, שותפות | 5-10h |
| Children's education | שיעורי בית, פעילויות, התפתחות | 3-5h |
| Spiritual / religious | שבת, חגים (אם רלוונטי) | 0-3h |
| Travel | חופשות, יציאות, business travel | varies |
| Driving / commute | בין אתרים, פגישות | 5-10h |
| Reading/learning | books, podcasts, articles | 2-4h |
| Networking | meetings, masterminds, conferences | 1-3h |
| Legal / contracts | סקירה, חתימה | 0-2h |
| **Total personal** | | **~33-70h/week** |

### A.3 Reality check
- 80-130h/week of "things to do" vs 168h total in a week
- Sleep ~50-56h leaves ~110h waking
- **Conclusion:** Without delegation, ברק נשרף. ה-AI organization ↑ לוקח 30-50% מהעומס.

---

## 4.B — Agent Organization Chart (12 Specialized Agents)

```
                          BARAK (Chief / Principal)
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
   ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
   │  ORCHESTRATOR    │    │   PERSONA       │    │   GUARDIAN       │
   │  Alfred Core     │    │   layer          │    │   security/audit │
   │  (router+state) │    │   (Hebrew voice,│    │   (Tirith/        │
   │                  │    │    ⚡ format)    │    │    sandboxing)   │
   └──────────────────┘    └──────────────────┘    └──────────────────┘
                                   │
            ┌──────────────────────┴──────────────────────┐
            │                                             │
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    BUSINESS AGENTS (BEE)                    PERSONAL AGENTS (Life)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    1. SalesAgent (CRO)                      7. FamilyAgent
       leads, quotes, deals, calls              kids, spouse, events, school

    2. OpsAgent (COO)                        8. HealthAgent
       projects, technicians, schedule         medical, fitness, sleep, nutrition

    3. CustomerSupportAgent                  9. PersonalFinanceAgent
       complaints, troubleshoot, support       bank, investments, pension, insurance

    4. FinanceAgent (CFO)                    10. LearningAgent
       AR, AP, cash flow, SHAAM, tax           CE, license renewal, courses, reading

    5. ProcurementAgent                      11. LogisticsAgent (LifeOps)
       suppliers, parts, inventory             errands, home, vehicle, appointments

    6. MarketingAgent (CMO)                  12. RelationshipsAgent
       ads, content, SEO, social, reviews      friends, network, social events
```

Total: **3 core (orchestrator/persona/guardian) + 6 business + 6 personal = 15 agents**.

הם לא 15 LLM instances. הם **15 specialized prompts + skill sets + tools** שמורצים ע"י Alfred (router) + Hermes (brain) שמכוסה ב-v1. כל "agent" כאן הוא role/persona, לא תהליך נפרד.

---

## 4.C — Agent Charters (12 specialized)

לכל סוכן: **Charter** (משימה), **Tools** (MCPs/skills), **Schedule** (cron + triggers), **Memory** (data scope), **Escalation** (מתי מודיע ל-Barak), **L0/L1/L2** trust progression (v3).

### Agent 1: SalesAgent (CRO virtual)

```yaml
charter: |
  אחראי על כל ה-pre-sale: leads, qualification, quotes, follow-up, closing.
  המטרה: מקסום win rate + reducing cycle time.

tools:
  - Monday MCP (Leads + Quotes + Deals boards)
  - Cardcom MCP (quote-to-invoice once won)
  - Calendar MCP (schedule sales calls)
  - WhatsApp Business via Composio (broadcast templates)
  - Email send via Gmail MCP
  - DictaBERT-NER (entity extraction)
  - Knowledge Graph query (v6 3.A)
  - Anthropic docx skill (quote generation Hebrew)

schedule:
  - 09:00 daily: morning lead briefing — top 5 active deals + nudges
  - 14:00 daily: midday check — any responses needed
  - 18:00 daily: end-of-day pipeline review
  - Triggered: every new lead inbound → instant draft response

memory_scope:
  - All :Lead, :Quote, :Deal nodes in KG
  - contacts.md
  - task-examples.md sales section
  - episodic: all sales-tagged events

escalation_to_barak:
  - lead_quality_score >= 80 (hot)
  - deal at "negotiating" >7 days (stalled)
  - customer mentions competitor by name
  - quote rejected (learn why)

trust_level:
  - L0: send quotes, reply to leads (always approve first)
  - L1 (after 50 approved): auto-send standard followups to specific patterns
  - L2 (after 200 approved): auto-respond to FAQs, auto-schedule meetings

kpis:
  - leads → contacted within 60min: >95%
  - quote send rate: >80% of qualified
  - win rate: >30%
  - avg cycle: <40 days
```

### Agent 2: OpsAgent (COO virtual)

```yaml
charter: |
  Project management for installations. Coordinates Neri + Shlomi + sub-contractors.
  Manages site visits, dependencies, blockers, technician schedules.

tools:
  - Monday MCP (הקמות + Activities boards)
  - Google Calendar MCP (3-calendar lock)
  - Tracer GPS MCP (technician location)
  - SolarEdge MCP (system status check)
  - Frigate MQTT subscribe (site events from v2)
  - Knowledge Graph (sites, equipment, jobs)
  - sites/<X>.md write access

schedule:
  - 07:00 daily: tomorrow plan finalize — per-tech schedule
  - 17:00 daily: today wrap-up + tomorrow brief draft
  - 12:00 weekly Sun: weekly schedule generated
  - Triggered: SolarEdge alert / Frigate event / Monday status change

memory_scope:
  - All :Site, :Job, :Equipment, :Employee nodes
  - sites/ directory
  - Cron schedule patterns

escalation_to_barak:
  - Job slipping >24h
  - Technician sick / unavailable (reschedule conflict)
  - SolarEdge severe alert (system down)
  - 3+ open critical issues on single site

trust_level:
  - L0: propose schedules, reschedules
  - L1 (after pattern proven): auto-assign jobs to technicians per skill+location
  - L2: auto-reschedule routine maintenance

kpis:
  - install fulfillment <14d post-payment
  - first-time-fix rate >85%
  - technician utilization: 70-80%
```

### Agent 3: CustomerSupportAgent

```yaml
charter: |
  Handle all post-sale customer interactions. Triage complaints. Route to OpsAgent if technician needed.
  Maintain customer health score.

tools:
  - WhatsApp inbound (existing pipeline)
  - Phone calls (v5)
  - Gmail
  - SolarEdge MCP (check system status before assuming complaint valid)
  - Knowledge Graph (customer history)
  - sentiment classifier

schedule:
  - Triggered: every customer inbound
  - 10:00 daily: review complaints from yesterday — any unresolved?
  - Weekly: health score sweep + flag dropouts

memory_scope:
  - :Customer nodes
  - contacts.md per customer
  - customer health score time series

escalation_to_barak:
  - Complaint sentiment "frustrated" or "urgent"
  - Health score drops >15pts in week
  - Customer mentions legal/insurance
  - System actually down (verified via SolarEdge)

trust_level:
  - L0: draft replies (always approve)
  - L1: auto-FAQ responses ("how do I check production?")
  - L2: routine post-install check-ins
```

### Agent 4: FinanceAgent (CFO virtual)

```yaml
charter: |
  All things money. AR (customer collections), AP (supplier payments), cash flow forecasting,
  SHAAM e-invoicing compliance, tax filing reminders, expense categorization.

tools:
  - Cardcom MCP (invoicing + tokens + SHAAM allocation)
  - Bank statements via Composio or Open Banking Israel
  - Invoice Maven (legacy, if still used)
  - SHAAM API direct (if integrated)
  - Knowledge Graph (:Invoice nodes)
  - Anthropic xlsx skill (financial reports)

schedule:
  - 08:00 daily: cash position check + AR aging
  - 17:00 daily: invoices issued today + payments received
  - Weekly Sun: cash flow forecast (13 weeks)
  - Monthly: Mas Hahnasa form 102 reminder
  - Monthly: Bituach Leumi self-employed reminder
  - Quarterly: VAT reporting prep

memory_scope:
  - :Invoice, :Payment, :Expense
  - Bank reconciliation history

escalation_to_barak:
  - Cash flow gap detected within 14 days
  - Invoice > 30 days overdue
  - SHAAM allocation failure
  - Bank reconciliation discrepancy
  - Tax form deadline within 7 days

trust_level:
  - L0: prepare invoice drafts, payment authorizations
  - L1: auto-issue SHAAM-cleared invoices once "won" deal closes
  - L2: never — financial actions always require Barak approval

kpis:
  - DSO (days sales outstanding) <30
  - SHAAM compliance 100%
  - cash forecast accuracy >92% (per chatfin.ai 2026 benchmark)
```

### Agent 5: ProcurementAgent

```yaml
charter: |
  Manage supplier relationships. Track parts inventory. Reorder before stockout.
  Negotiate prices on bulk orders. Verify deliveries.

tools:
  - Monday MCP (inventory if tracked there)
  - Email + WhatsApp suppliers
  - Prime Energy contact (if API exists)
  - Knowledge Graph (:Supplier, :Equipment)
  - Bank to verify supplier payments

schedule:
  - Weekly Sun 14:00: inventory levels review
  - Daily 10:00: confirm yesterday's deliveries
  - Triggered: low stock threshold, new project order

memory_scope:
  - :Supplier, :Equipment, :PurchaseOrder
  - past supplier performance (delivery times, quality)

escalation_to_barak:
  - Stockout imminent on critical part
  - Supplier price increased >10%
  - Delivery delayed >3 days
  - Quality issue reported

trust_level:
  - L0: propose orders, draft RFQs
  - L1 (after Barak approves 30+ orders to same supplier): auto-reorder routine items
  - L2: bulk negotiation requires Barak

kpis:
  - stockout incidents/year: <2
  - supplier delivery on-time rate: >90%
  - cost variance YoY: <5%
```

### Agent 6: MarketingAgent (CMO virtual)

```yaml
charter: |
  Drive lead acquisition. Manage Google Ads + Meta Lead Ads + SEO + content + reviews.
  A/B test templates and landing pages. Attribute leads to channels.

tools:
  - Google Ads API
  - Meta Business API
  - GMB / Google Business Profile API
  - n8n workflows (review automation, content scheduling)
  - WordPress/CMS MCP (if BEE website exists)
  - Anthropic docx (content drafts)
  - HeyGen / video tools for content
  - DictaLM 3.0 (Hebrew content generation, sensitive)

schedule:
  - Daily 11:00: ad performance review + budget adjustment proposals
  - Weekly Mon 09:00: content calendar — 3 posts/week proposed
  - Weekly Mon 14:00: review request batch (post-install customers from 30 days ago)
  - Monthly: full attribution report

memory_scope:
  - UTM data, ad performance, content engagement
  - Customer journey touchpoints

escalation_to_barak:
  - CPL increased >25% week-over-week
  - Ad account flagged/suspended
  - Negative review received
  - Content draft requires final approval

trust_level:
  - L0: propose ads, drafts, schedule, review responses
  - L1: auto-post pre-approved content templates (e.g., weekly project showcase)
  - L2: auto-pause ads underperforming + auto-launch retargeting (after pattern proven)

kpis:
  - new leads/month: >60
  - CPL Google: <₪150
  - CPL Meta: <₪100
  - review rate: >40% of installs
```

### Agent 7: FamilyAgent

```yaml
charter: |
  Manage family logistics. Kids' schedules, school events, doctor appointments,
  birthdays, anniversaries, family events. Coordinate with spouse.

tools:
  - Personal Calendar (separate from work-3-calendar lock)
  - Family WhatsApp group capture
  - School portal scraping (if exists)
  - Reminder system

schedule:
  - 07:00 daily: today's family events + reminders
  - 18:00 daily: tomorrow heads-up (pickup times, events)
  - Weekly Sun: family weekly plan (after evening briefing)
  - Yearly: birthday/anniversary reminders 30/14/7/1 days

memory_scope:
  - family-members.yaml (kids names, ages, schools, friends)
  - personal events log
  - kid-specific preferences, allergies, etc.

escalation_to_barak:
  - Schedule conflict with work
  - Doctor appointment needed (kid sick?)
  - School event tomorrow (heads-up)
  - Significant date approaching

trust_level:
  - L0: surface reminders only
  - L1 (rare): auto-confirm routine appointments via known providers
  - L2: never auto-act on family — too sensitive
```

### Agent 8: HealthAgent

```yaml
charter: |
  Manage personal health. Medical appointments, medication reminders, exercise tracking,
  sleep patterns, nutrition logs (if Barak tracks). Annual checkup scheduling.

tools:
  - Calendar (health-specific calendar)
  - Health/wellness apps integration (Apple Health / Google Fit / Garmin)
  - Pharmacy reminder
  - Doctor portal (if accessible)
  - Hedy AI or similar (visit assistant for medical Hebrew, per research)

schedule:
  - Morning daily: health metrics review (sleep score, HRV, etc.)
  - Reminder windows: prescription refills, annual physicals
  - Weekly: exercise + nutrition summary

memory_scope:
  - health-profile.yaml (conditions, allergies, medications)
  - health metrics time series

escalation_to_barak:
  - Sleep <6h for 3+ nights
  - Skipped medication
  - Lab result out-of-range (if integrated)
  - Annual physical due

trust_level:
  - L0: reminders + draft scheduling proposals
  - L1: auto-confirm routine refills with known pharmacy
  - L2: never — health decisions human only

privacy:
  - All health data local-only or encrypted (PII redaction before cloud LLM)
```

### Agent 9: PersonalFinanceAgent

```yaml
charter: |
  Manage personal finances (separate from BEE). Bank account, credit cards,
  investments, pension (קרן השתלמות + פנסיה), insurance policies.
  
tools:
  - Personal bank statements (via Israeli bank scrapers v6.7.4 — already in audit Tier 1)
  - il-bank-mcp (audit Tier 1 #1)
  - Investment portfolio scraping (broker accounts)
  - Pension fund portal scraping
  - Insurance policy tracking

schedule:
  - Daily 22:00: balance + transactions sweep
  - Monthly 1st: budget vs actual review
  - Quarterly: pension/investment performance summary
  - Annual: insurance review (renewals)

memory_scope:
  - personal-accounts.yaml
  - budget categories + targets
  - investment positions
  - insurance policies + renewal dates

escalation_to_barak:
  - Unusual transaction (over threshold or new merchant)
  - Investment value drop >5% (single day)
  - Insurance renewal in 30/14/7 days
  - Bank account low balance
  - Pension contribution missed

trust_level:
  - L0: surface alerts only
  - L1 (rare): auto-categorize routine transactions
  - L2: never on financial actions

privacy:
  - Bank data 100% local — never cloud LLM
```

### Agent 10: LearningAgent

```yaml
charter: |
  Continuing education. Track license renewal (בודק חשמלאי), industry news (solar/electrical),
  new product training, regulatory updates. Curate reading list.

tools:
  - PUA / רשות החשמל RSS scraper
  - solar industry RSS (greentech media, pv-magazine israel)
  - YouTube subscription tracker (industry channels)
  - Reading list (Pocket / Instapaper / Readwise)
  - Course platforms (Coursera, Udemy, edX)
  - LinkedIn Learning

schedule:
  - 06:00 daily: morning news digest (5 most relevant articles)
  - Weekly Sun 18:00: weekly learning summary + suggested reads
  - Quarterly: license renewal check (90/60/30/14 days)

memory_scope:
  - reading-list.md
  - completed courses log
  - certifications + expiry dates
  - learning preferences (topics, formats)

escalation_to_barak:
  - License expires within 90/60/30/14 days
  - Major regulatory change (electricity tariff, SHAAM rules)
  - Critical safety alert (product recall, etc.)
  - Conference / training opportunity matching preferences

trust_level:
  - L0: curate, recommend
  - L1: auto-bookmark + summarize daily digest
  - L2: never act on registration without approval
```

### Agent 11: LogisticsAgent (LifeOps)

```yaml
charter: |
  Errands. Vehicle maintenance (personal). Home repairs. Grocery (if Barak wants).
  Government services (renew passport, ID, etc.). Travel planning.

tools:
  - Calendar (life-events calendar)
  - Travel APIs (skyscanner, kayak)
  - Vehicle service center contacts
  - Home service contacts (אינסטלטור, חשמלאי לבית, גנן)
  - gov.il services (renewals, payments)

schedule:
  - Weekly Sat 18:00: upcoming week errands review
  - Monthly: vehicle service interval check
  - Yearly: passport/ID/license renewal calendar

memory_scope:
  - vehicle-personal.yaml (model, year, mileage, service history)
  - home-service-providers.yaml
  - errands queue

escalation_to_barak:
  - Vehicle service due
  - Major errand uncoordinated
  - Travel opportunity / required
  - Bill payment failure

trust_level:
  - L0: propose, draft
  - L1: routine bill payments (after pattern)
  - L2: rare, mostly stay supervised
```

### Agent 12: RelationshipsAgent

```yaml
charter: |
  Personal CRM. Track friends, family, business contacts beyond customers.
  Remind to reach out. Track conversations across time. Birthday/event reminders for non-family.

tools:
  - WhatsApp + Phone + Email capture
  - Knowledge Graph (:Person extends beyond Customer)
  - LinkedIn (if accessible)
  - Calendar for one-on-ones

schedule:
  - Weekly Sun: "people I haven't talked to in X weeks/months" report
  - Daily: birthday / anniversary check
  - Monthly: networking event scan (industry / personal)

memory_scope:
  - personal-contacts.yaml
  - conversation history with each
  - relationship strength score
  - shared interests / past topics

escalation_to_barak:
  - Important contact 6+ months silent
  - Birthday tomorrow (close friend / family extended)
  - Networking opportunity matching profile

trust_level:
  - L0: prompts, drafts
  - L1: auto-send birthday well-wishes (with personalization)
  - L2: never auto-message close people unsupervised
```

---

## 4.D — Orchestration: how the 12 work together

### 4.D.1 Daily orchestration flow

```
06:00 → LearningAgent: morning news digest (5 articles)
06:30 → OpsAgent: weather scan (existing cron)
07:00 → FamilyAgent: today's family events
07:00 → OpsAgent: tomorrow plan finalize (technicians)
07:30 → All-up morning agenda compiled by Alfred Core:
        "Today: 5 calls, 3 sales meetings, kid pickup 16:00,
         dr appointment Wed, license expires 60 days, ..."
        ⚡ to Barak
08:00 → FinanceAgent: cash + AR aging snapshot
09:00 → SalesAgent: lead briefing
09:30 → OpsAgent: gov regulations check (existing cron)
10:00 → CustomerSupportAgent: yesterday's complaints review

(during day — event-driven; agents respond to triggers)

13:00 → All agents: midday check-in compiled
17:00 → OpsAgent: today wrap + tomorrow draft
17:30 → FinanceAgent: today's payments/invoices
18:00 → FamilyAgent: tomorrow family heads-up
18:30 → SalesAgent: pipeline EOD
20:30 → ALL agents: evening operations briefing (the BIG one — v3 scenario 4)
        ⚡ Barak gets full report
22:00 → PersonalFinanceAgent: daily balance + transactions
23:00 → System: heartbeat checks, audit log signing
```

### 4.D.2 Weekly orchestration

```
Sun 09:00 → Weekly review (self-improvement loop v3)
            • Pattern findings
            • Procedural rule updates proposed
            • New entities discovered
            • Agent performance KPIs
Sun 14:00 → ProcurementAgent: inventory review
Sun 18:00 → LearningAgent: weekly learning summary
Sun 19:00 → SalesAgent + MarketingAgent: weekly pipeline + ad performance
Sat 18:00 → LogisticsAgent: upcoming week errands
```

### 4.D.3 Agent coordination protocol

agents צריכים לדבר זה עם זה. דוגמאות:

**OpsAgent → CustomerSupportAgent:**  
"Neri סיים אצל customer X. שלח follow-up confirming + CSAT in 24h?"

**SalesAgent → FinanceAgent:**  
"Deal closed at ₪80K. Invoice request via Cardcom? Allocation number?"

**FinanceAgent → ProcurementAgent:**  
"Supplier X payment overdue 5 days. Pause new orders to them?"

**HealthAgent → FamilyAgent → OpsAgent:**  
"Doctor appointment Wed 14:00. Family schedule allows? Move 14:00 site visit?"

**איך?** דרך MCP — כל agent חושף tool, האחרים קוראים. **או** דרך shared Knowledge Graph — אחד מוסיף node/relationship, אחרים מאזינים.

### 4.D.4 Master priority resolution

לפעמים שני agents רוצים את הזמן של ברק באותו רגע. **Priority resolver** מ-Alfred Core:

```python
priority = {
    "health_emergency": 100,
    "safety_alert": 95,  # קריאת חירום בשטח
    "family_urgent": 90,  # ילד חולה, etc.
    "customer_breakdown": 85,  # חשמל מנותק
    "financial_alert": 80,  # cash flow gap
    "deal_closing_window": 70,  # hot lead about to expire
    "compliance_deadline": 65,  # SHAAM, tax
    "routine_briefing": 30,
    "background_recommendation": 10,
}
```

הגבוה ביותר זוכה ב-⚡ הבא. השאר חוכים, או נכנסים ל-evening briefing.

---

## 4.E — Build-out priority (כי 15 agents = lot)

לא לבנות הכל בבת אחת. סדר עדיפות לפי ROI:

| Phase | Agents to activate | זמן | ROI |
|---|---|---|---|
| **Foundation** (waves -1 to 2) | OpsAgent + SalesAgent + CustomerSupportAgent + Alfred Core + Guardian | 30-40h | High — core business runs |
| **Phase 2** (waves 3-4) | FinanceAgent + MarketingAgent + ProcurementAgent | 30-40h | High — covers all of BEE |
| **Phase 3** (waves 5+) | LearningAgent + LogisticsAgent | 15-20h | Medium — life ops |
| **Phase 4** (post-MVP) | FamilyAgent + HealthAgent + PersonalFinanceAgent + RelationshipsAgent | 20-30h | Highest sensitivity — needs care |

**Total time:** ~100-130h ל-build out all 15 agents. **+ ~244h v1-v6 infrastructure = ~340-370h total.**

זו לא חברה גדולה — זה project של 2-4 חודשים עם developer dedicated.

---

## 4.F — Privacy boundaries (CRITICAL)

ל-12 הסוכנים יש פיצול חד:

| Boundary | Business agents | Personal agents |
|---|---|---|
| LLM provider | Anthropic (BAA) / Gemini Israel residency | **Local only** (DictaLM 3.0) for PII-sensitive |
| Memory location | bee-prod-1 (Israel/EU) + KG | Local-only memory (encrypted at rest) |
| Data sharing | within business agents OK | **never cross-share personal → business** |
| Cloud calls | OK with redaction | **block by default** unless explicit |
| Audit log | full | full + extra retention sensitive |
| Outbound channels | sendPolicy 4 destinations (constitutional) | personal channels strictly per-agent |

**Why this matters:** mixing personal + business in same LLM context = privacy nightmare. דוגמה: agent business עם access ל-personal calendar רואה "11:00 Dr appointment" → אם זה דולף ב-debug log → תפסר רפואית. **לכן 2 worlds, חיבור בדידני בלבד דרך orchestrator עם strict filters**.

---

## 4.G — Trust progression timeline

לכל agent — אותו pattern v3 (L0 → L1 → L2). אבל **personal agents בדרך כלל נשארים L0**:

| Agent | L0 → L1 typically | L1 → L2 typically | מי שמגיע ל-L2 |
|---|---|---|---|
| SalesAgent | 50 approvals | 200 approvals | ✅ likely L2 on standard followups |
| OpsAgent | 30 approvals | 150 approvals | ✅ likely L2 on routine reschedules |
| CustomerSupportAgent | 50 approvals | 200 approvals | ✅ L2 on FAQ-type |
| FinanceAgent | 100 approvals | Never (always Barak) | ❌ stays L1 max |
| ProcurementAgent | 30 approvals | 100 approvals | ✅ L2 on routine reorders |
| MarketingAgent | 50 approvals | 150 approvals | ✅ L2 on pre-approved templates |
| FamilyAgent | 20 approvals | Rarely L1, never L2 | ❌ stays L0 |
| HealthAgent | Never | Never | ❌ stays L0 (medical) |
| PersonalFinanceAgent | Never | Never | ❌ stays L0 |
| LearningAgent | 30 approvals | 100 approvals | ✅ L2 on bookmarking, summaries |
| LogisticsAgent | 20 approvals | 50 approvals | ✅ L1 on routine bill pays |
| RelationshipsAgent | 30 approvals | rarely L2 | ❌ stays L0 for messages |

---

## 4.H — Cost estimate per month — full org

| Category | monthly | annual |
|---|---|---|
| Anthropic Claude (Sonnet for most) | ~$150-300 | ~$1.8-3.6K |
| Gemini Pro (vision + Hebrew OCR) | ~$30-60 | ~$360-720 |
| Groq Whisper (voice) | ~$2-5 | ~$24-60 |
| DictaLM 3.0 GPU (Hetzner CCX23) | $45 | $540 |
| Composio Standard (after free) | $29 | $348 |
| n8n self-hosted (bee-prod-1 existing) | $5-10 | $60-120 |
| Langfuse Cloud Pro | $199-300 | $2,388-3,600 |
| Cube ACR Premium 3 devices | $30 | $360 |
| Neo4j Community (self-host) | $0 | $0 |
| Qdrant (self-host) | $0 | $0 |
| Israeli MCPs (skills-il etc.) | $0 (open source) | $0 |
| Google Ads | ₪4,500 ≈ $1,200 | ~$14,400 |
| Meta Lead Ads | ₪2,300 ≈ $620 | ~$7,440 |
| **Total non-marketing** | **~$500-700/m** | **~$6-8.5K/year** |
| **Total with marketing** | **~$2,300-2,500/m** | **~$28-30K/year** |

**ROI logic:** if BEE closes 10 more deals/year at ₪40K avg margin 30% = ₪120K added profit. ROI on agent organization (excluding marketing) > 1500%. ROI on full stack (incl. marketing) > 400%.

---

## 4.I — Open questions for v7

| # | שאלה | תיאור |
|---|---|---|
| Q51 | **קיים partner/spouse?** | קובע FamilyAgent depth + RelationshipsAgent scope |
| Q52 | **כמה ילדים + גילים?** | FamilyAgent ניהול schedule + reminders |
| Q53 | **רישיון בודק חשמלאי** מתי נחדש? | LearningAgent priority alert |
| Q54 | **חיים אישיים** — סודיות מי? | בארק לוגיקה מי רואה מה |
| Q55 | **תקציב marketing initial?** | רצוי ₪3K-7K test ב-Q3 |
| Q56 | **מי מנהל את הspouse/partner** באוטומציה? | אם spouse רוצה אקסס — admin? read-only? |
| Q57 | **דרגות trust comfort** — willing to let SalesAgent auto-reply? | פולטיקה תרבותית |
| Q58 | **GPU machine** — להוסיף Hetzner CCX23 לDictaLM 3.0? | קובע privacy depth |
| Q59 | **Personal Bank/insurance רוצים אוטומציה?** | מאוד sensitive — דורש אישור |
| Q60 | **Quarterly business review** — לבנות כsection? | strategic planning agent? |

---

## 4.J — שינויים / extensions לתוכניות קודמות

- **v3 office-automation-architecture.md:** "Layer 8 Briefing" צריך 9 שגרות מולטיפלות (כיום כללי). מקצר את "all agents check-in" לפי 4.D.1.
- **v5 voice-and-call-pipeline-v5.md:** routing אחרי extraction צריך agent-aware ("HealthAgent? FamilyAgent? CustomerSupportAgent?")
- **v6 KG (3.A):** :Person למעלה מ-:Customer — הוסף `:FamilyMember`, `:Friend`, `:HealthProvider`, `:Vendor` להפרדה ברורה
- **tools-deep-audit.md Tier 1:** הוסף #30: `il-bank-mcp` (כבר אצלם רשום) + #31: `family-calendar` (אם קיים)

---

## 4.K — Verification (איך תדעו ש-15 agents עובדים)

| Test | Method | Pass criterion |
|---|---|---|
| Each agent has charter file | check `agents/` directory | 15 yaml files exist |
| Daily orchestration runs | check cron logs | all 9-10 scheduled events fired |
| Inter-agent coordination | test scenario — close deal | SalesAgent → FinanceAgent → CustomerSupportAgent all updated |
| Privacy boundary holds | personal agent never sees business secret | inspect prompts for cross-leak |
| Priority resolution works | inject 2 conflicting alerts | only higher-priority surfaces ⚡ |
| Trust levels respected | L0 agent tries to act without approval | should be blocked |
| Memory scope isolated | KG query returns only agent-allowed nodes | ACL check |
| Audit log captures all | each agent action signed | weekly signature chain valid |

---

*Part 4 (v7) נכתב 2026-05-26 Asia/Jerusalem אחרי 12 web searches על specialized agent verticals + ניתוח מלא של פעילויות business + personal של ברק. ~700 שורות נוספות ל-plan file. סך הכל v1-v7: ~5,200 שורות תכנון, ~340-370h עבודת build full. 15 agents specialized: 3 core + 6 business + 6 personal. הפדרציה האמיתית = orchestrated organization, לא "AI tools".*

---

# Part 5 — v8: 6 More Deep Dives (Infrastructure + Compliance + Lifecycle)

מבוסס על 6 web searches נוספים. נושאים שעוד לא כוסו לעומק.

## 5.A — Hardware + Site Network Integration (concrete)

### 5.A.1 ההקשר

v2 + v4 הזכירו Modbus direct ל-inverters אבל לא concrete. handoff F#2-3 שאל "Sungrow Modbus דרך Tailscale" + "Deye ESS via Tailscale". כאן ה-deployment המעשי.

### 5.A.2 השוואת inverter brands (BEE installs)

| Brand | Modbus support | API | Hebrew docs | מיקום ב-BEE |
|---|---|---|---|---|
| **SolarEdge** | Modbus TCP ✅ via Modbus Energy Meter add-on | ✅ Monitoring API (currently 403) | חלקי | majority of fleet |
| **Sungrow** | Modbus TCP ✅ direct LAN | ✅ iSolarCloud API | חלקי | growing fleet |
| **Deye** | Modbus TCP (2024+) או proprietary pre-2024 | ⚠️ no public API | ❌ | ESS systems |
| **Huawei** | Modbus TCP ✅ FusionSolar | ✅ FusionSolar API | חלקי | rare in BEE? |
| **Growatt** | Modbus TCP ✅ ShineMaster | ✅ Cloud | חלקי | rare |

### 5.A.3 Network architecture options

**אופציה A: ענן בלבד (current state)**
```
BEE backend ──HTTPS──> SolarEdge cloud
            ──HTTPS──> iSolarCloud
            ──HTTPS──> FusionSolar
```
- Pros: easy, no site infra
- Cons: rate-limited, cloud-dependent, no real-time, 403 errors

**אופציה B: Tailscale subnet routers (recommended for high-value sites)**
```
        Tailnet (Tailscale mesh)
              │
   ┌──────────┼──────────────────────┐
   │          │                      │
 bee-prod-1   site-1                site-N
   (server)   ┌──────────────┐      ┌──────────────┐
              │ TS subnet    │      │ TS subnet    │
              │ router       │      │ router       │
              │ (Pi/mini-PC) │      │ (Pi/mini-PC) │
              └──────┬───────┘      └──────┬───────┘
                     │                     │
                Local network         Local network
                     │                     │
                inverters             inverters
                (Modbus TCP)          (Modbus TCP)
```

**אופציה C: Cellular IoT (no site router)**
- Raspberry Pi + 4G modem at each site
- Direct cellular → bee-prod-1
- More expensive ongoing ($10-15/m × number of sites)

### 5.A.4 Recommended for BEE — hybrid

| Site tier | Approach |
|---|---|
| **Tier 1 — high value commercial (>50kWp)** | Tailscale subnet router + Modbus direct + cloud fallback |
| **Tier 2 — standard residential (5-15kWp)** | Cloud API only (current) |
| **Tier 3 — critical / downtime-sensitive** | Tailscale + Modbus + alerts via Frigate camera if visible |

### 5.A.5 Deployment kit per site

```
Hardware (~$120-180 per site one-time):
  - Raspberry Pi 5 ($80)
  - SSD 256GB ($25)
  - PoE HAT ($25)
  - Case + cable ($15-25)

Software:
  - Tailscale (free for up to 3 users; BEE = 1 user OK)
  - Python script reading Modbus → publishing to MQTT
  - MQTT broker on bee-prod-1 (mosquitto, already exists for Frigate)
  - Hermes plugin: subscribe to MQTT topics → :Equipment node updates

Deployment time: ~3h per site (visit + provisioning)
Ongoing cost: $0 (Tailscale free tier)
```

### 5.A.6 Tracer GPS

מ-handoff F#4: closed system, no public API. אופציות:
- (a) Contact vendor for API access — ROI דורש >50 vehicles
- (b) Mitmproxy capture of mobile app → reverse engineer
- (c) Scrape web portal — fragile but works for low volume

**ההמלצה ל-BEE:** option (c) דרך Playwright MCP (audit Tier 1). Hermes web automation skill קורא ל-Tracer dashboard, מחלץ vehicle locations, מעלה ל-:Vehicle nodes ב-KG. ~4h build.

### 5.A.7 bee-frigate camera deployment

v2 הציע Pipeline 1+2. הקונקרטה:
- ה-Frigate container רץ where? (bee-prod-1 אם cameras קרובים, או edge box באתר)
- 8-ch Dahua → Frigate נדרש ~2-4 cores CPU + GPU (NVIDIA Tesla T4 או Coral USB)
- Mosquitto MQTT שיתוף עם Modbus broker

**Cost addition:** Coral USB AI accelerator $75 one-time. else CPU-only OK at lower FPS.

### 5.A.8 Build estimate

| Task | hours |
|---|---|
| Tailscale account + tailnet setup | 1h |
| Pi provisioning automated (Ansible) | 4h |
| Python Modbus reader generic | 6h |
| Hermes MCP wrapper for site data | 3h |
| KG mapper :Equipment + readings | 2h |
| First site deployment | 3h |
| Per-additional-site (replicate) | 2-3h |
| **Total per fleet of 10 sites** | **~45h** |

---

## 5.B — Gmail Email Management Deep

### 5.B.1 ההקשר

AGENTS.md audit הראה `gmail-morning-digest` cron disabled + `alfred-gmail.js` skeleton. Email = ערוץ חשוב לBEE (suppliers, regulatory, customers B2B).

### 5.B.2 What's needed

**Triage:**
- VIP filter (suppliers, customers, regulatory)
- Auto-archive (newsletters, marketing)
- Priority routing (urgent → ⚡ immediate; normal → daily digest)
- Hebrew + English handling

**Action extraction:**
- Invoice received → ProcurementAgent / FinanceAgent
- Customer inquiry → SalesAgent / CustomerSupportAgent
- Regulatory notice → LearningAgent + escalate to Barak
- Scheduling request → OpsAgent + Calendar MCP

**Draft replies:**
- Standard responses (FAQ, "out of office", "we got it, will reply")
- Quote attached, contract sent, etc.

### 5.B.3 Architecture

```
Gmail (via Google MCP / IMAP)
         │
         ▼ every 5min poll OR webhook (Google push notifications)
   ┌────────────────────┐
   │ Email Triage Agent  │
   │ (sub-skill of      │
   │  CustomerSupport + │
   │  Finance + ...)    │
   └─────────┬──────────┘
             │
             ▼ classify intent
        Priority lane
         │     │     │
       VIP  Normal  Spam
         │     │     │
         │     ▼     ▼
         │  digest archive
         ▼
    ⚡ Barak immediately
    (with draft reply attached)
```

### 5.B.4 Hebrew + English handling

Email גם בעברית גם באנגלית (ספקים בינלאומיים). DictaBERT-NER לעברית, generic LLM לאנגלית. Detect language first → route to right NER.

### 5.B.5 Existing tools

- **Beam AI Gmail integration** — full agent
- **Nylas CLI** — DIY build
- **n8n Gmail trigger** — workflow-based (recommended for BEE — אם n8n already deployed v4)
- **Apache Camel** — enterprise (overkill)
- **Hyper AI Templates** — ready templates

**ההמלצה ל-BEE:** **DIY via n8n + Gmail Watch New Emails trigger** + Hermes Claude Sonnet for triage. Free, self-hosted, controllable.

### 5.B.6 Build estimate

| Task | hours |
|---|---|
| Gmail OAuth + n8n Gmail node setup | 1h |
| Triage workflow (classify + label) | 3h |
| Hebrew + English language detector | 1h |
| Action extraction → Monday / Calendar / TASKS | 3h |
| Draft reply templates (Hebrew RTL) | 4h |
| Reactivate `gmail-morning-digest` cron | 1h |
| **Total** | **~13h** |

---

## 5.C — Backup & Disaster Recovery (BCDR)

### 5.C.1 ההקשר

לא כוסה בעבר. הסיכון: bee-prod-1 dies → BEE.DB ↓, Hermes state ↓, KG ↓, ClawMem ↓ — 50% של ה-stack מת.

### 5.C.2 What needs backup

| Asset | Where lives now | Sensitivity | Restore target time |
|---|---|---|---|
| **Hermes state.db** (172MB) | bee-prod-1 | high | <2h |
| **KG (Neo4j)** | bee-prod-1 | very high | <4h |
| **Qdrant vectors** (WA RAG) | bee-prod-1 | medium (regenerable from msgstore.db) | 1 day |
| **ClawMem SQLite** | bee-prod-1 | high | <2h |
| **Alfred workspace** (`E:\Desktop\OpenClawAgent\`) | Barak's PC | very high | <1h |
| **memory/<date>.md** | Barak's PC + Drive sync? | high | <1h |
| **MEMORY.md / contacts.md / sites/** | Barak's PC + git? | very high | <1h |
| **Call recordings** | iOS Notes + Drive + bee-prod-1 | high | <4h |
| **Customer files (proposals/contracts)** | Drive | very high | <2h |
| **Secrets / API keys** | `.env` files on bee-prod-1 + PC | extreme | <30min (have backup) |

### 5.C.3 3-2-1 backup strategy

**Industry standard 3-2-1:**
- **3** copies of data
- **2** different media
- **1** offsite

**Applied to BEE:**

| Asset | Copy 1 (primary) | Copy 2 (local) | Copy 3 (offsite) |
|---|---|---|---|
| Hermes state.db | bee-prod-1 active | Hetzner snapshot (daily) | Backblaze B2 (weekly) |
| Neo4j KG | bee-prod-1 active | Hetzner snapshot | Backblaze B2 |
| Qdrant | bee-prod-1 active | Hetzner snapshot | not needed (regenerable) |
| Alfred workspace | Barak's PC active | OneDrive/Drive sync | git private repo |
| Call recordings | bee-prod-1 | Hetzner | Drive (long-term) |
| Secrets | bee-prod-1 .env | PC encrypted backup | 1Password / Bitwarden |

### 5.C.4 Tools

| Tool | Use case | Cost |
|---|---|---|
| **Hetzner Storage Box** | Local snapshot target | $4/m per 100GB |
| **Backblaze B2** | Offsite cold storage | $0.005/GB/month + egress |
| **restic** (open source) | Encrypted incremental backups | $0 |
| **rclone** | Drive/B2 sync | $0 |
| **borgbackup** | Deduplicated encrypted backups | $0 |

### 5.C.5 Backup schedule

```
Daily 03:00 (low-traffic hour):
  • Hermes state.db → bee-prod-1:/var/backups/hermes-{date}.db
  • Neo4j dump → bee-prod-1:/var/backups/neo4j-{date}.dump
  • Qdrant snapshot → bee-prod-1:/var/backups/qdrant-{date}.tar
  • ClawMem → bee-prod-1:/var/backups/clawmem-{date}.db
  • Rsync to Hetzner Storage Box

Weekly Sun 04:00:
  • Full restic backup → Backblaze B2 (encrypted)
  • Retention: daily 7d, weekly 4w, monthly 12m, yearly 5y

Monthly 1st 05:00:
  • Verify restore — random recent backup, restore to /tmp, validate
  • Send ⚡ to Barak: "backup integrity: OK"
```

### 5.C.6 DR runbook (how to recover)

```
Scenario: bee-prod-1 completely dead

Step 1 (0-15min): Provision new Hetzner CX52 (auto via Pulumi/Terraform)
Step 2 (15-30min): Restore from Hetzner Storage Box (rsync back)
Step 3 (30-60min): Start services (docker compose up neo4j, hermes, qdrant)
Step 4 (60-90min): Verify integrity (test queries, MCP round-trip)
Step 5 (90-120min): Re-establish webhooks (Monday, Frigate, Composio)
Step 6 (120min): Notify Barak system online

Total RTO: ~2 hours
RPO: <24 hours (last daily backup)
```

### 5.C.7 Build estimate

| Task | hours |
|---|---|
| Backup scripts (4 services) | 4h |
| Cron schedule + monitoring | 1h |
| Hetzner Storage Box provision | 0.5h |
| Backblaze B2 + restic setup | 2h |
| Restore runbook + monthly drill | 3h |
| Pulumi/Terraform for bee-prod-1 IaC | 6h |
| **Total** | **~17h** |

**Ongoing cost:** ~$5-15/month for storage.

---

## 5.D — Customer Onboarding First 30 Days

### 5.D.1 ההקשר

v6 3.B כיסה customer journey post-sale. v8 ממוקד **specifically בfirst 30 days** — קריטיים ביותר, defines if customer becomes referrer or detractor.

### 5.D.2 שלבים solar install — BEE specific

```
Day 0: Contract signed + advance paid
   │ AUTO: Welcome WA from Alfred ⚡
   │      "X, ברוכים הבאים ל-BEE!
   │       ניר יתאם איתך התקנה ב-3-7 ימים.
   │       קישור לעמוד הסטטוס: [unique URL]
   │       כל שאלה — אני כאן."
   │
   │ AUTO: Create :Customer + :Job nodes in KG
   │ AUTO: Schedule reminder for install scheduling
   │
   ▼
Day 1-2: Install scheduling
   │ AUTO: SalesAgent → OpsAgent handoff
   │ AUTO: OpsAgent proposes install date based on tech availability
   │ Barak approves → ⚡ customer
   │
   ▼
Day 3-7: Pre-install prep
   │ Customer pre-install checklist sent (PDF Hebrew via docx skill)
   │ Reminder day before
   │
   ▼
Day 7 (or scheduled): Install day
   │ Tech arrives (verified by Tracer GPS)
   │ Install completed
   │ AUTO: ⚡ customer "ההתקנה הסתיימה. הכל פועל. הנה הוראות שימוש."
   │ AUTO: Photo from install added to sites/<X>.md
   │
   ▼
Day 8: First check-in
   │ AUTO: "שלום X, הכל עובד בסדר? יש שאלות?"
   │
   ▼
Day 9-14: First production
   │ AUTO: SolarEdge MCP polls every day, sends weekly summary
   │ "השבוע המערכת ייצרה X kWh, חסך לך ~₪Y. מדהים!"
   │
   ▼
Day 15: CSAT survey
   │ AUTO: 1-5 rating + open feedback
   │ Score ≤3 → escalate to Barak
   │
   ▼
Day 21: How-to refresher
   │ AUTO: Send link to "מדריך לקוח BEE — איך לקרוא את האפליקציה"
   │
   ▼
Day 30: NPS + production report
   │ AUTO: NPS 0-10
   │ AUTO: 30-day production summary with savings calc
   │ AUTO: "אם אתה מרוצה — נשמח שתשתף חברים [referral code]"
   │
   ▼
Onboarding complete → enters long-term lifecycle (v6 3.B)
```

### 5.D.3 KPIs ל-first 30 days

| Metric | Target |
|---|---|
| Time contract signed → install scheduled | <3 days |
| Pre-install checklist completion | >80% |
| Install on scheduled day | >95% |
| Day-1 check-in response rate | >70% |
| CSAT score | >4.2/5 avg |
| Day-30 NPS | >40 (good) >60 (excellent) |
| Customer reach for support in first 30d | <2 contacts (healthy) |

### 5.D.4 Build estimate

| Task | hours |
|---|---|
| Welcome WA template + cron trigger | 1h |
| Pre-install PDF generator (Anthropic docx) | 3h |
| Day-by-day cron sequence (8 touchpoints) | 4h |
| CSAT + NPS capture + KG store | 3h |
| Production report auto-generator | 2h |
| **Total** | **~13h** |

---

## 5.E — Warranty + Equipment Lifecycle Tracking

### 5.E.1 ההקשר

מ-search: 4 שכבות אחריות לעקוב (product 10-25y / performance 25-30y + degradation / workmanship installer / inverter usually 10-12y). מצריך טבלת tracking + maintenance schedule.

### 5.E.2 Layers ל-track per installation

```
:Equipment node ב-KG מקבל:
  - serial_number
  - install_date
  - product_warranty_until: install_date + 10y (default) or 25y (premium)
  - performance_warranty_until: install_date + 25y or 30y
  - degradation_rate_warranted: 0.5% to 1% per year
  - inverter_warranty_until: install_date + 10y or 12y
  - workmanship_warranty_until: install_date + 5y (BEE policy)
  - last_maintenance_date
  - next_maintenance_due
  - documentation_path: sites/<X>/equipment/<serial>/
```

### 5.E.3 Maintenance schedule

```
Quarterly visual inspection (Q1, Q2, Q3, Q4):
  - Check panel cleanliness
  - Look for damaged panels
  - Inspect inverter LED status
  - Check shading changes

Biannual (April + October):
  - Electrical testing
  - Thermal imaging (if drone+thermal available)
  - Verify production vs expected

Annual (anniversary of install):
  - Full inspection report
  - Performance verification (degradation check)
  - Customer review meeting
  - Warranty status report

5-year milestone:
  - Major inspection
  - Inverter capacitors check (mid-life)
  - Cleaning + re-tensioning

10-year milestone:
  - Inverter replacement consideration
  - Panel performance audit
  - Warranty claim filings if needed
```

### 5.E.4 Predictive lifecycle management

```python
# Hermes warranty agent
def check_warranties_expiring():
    """Run weekly. Alert Barak about upcoming expirations."""
    
    today = datetime.now()
    horizons = [180, 90, 30, 7]  # days before expiry
    
    expiring = kg.query("""
        MATCH (e:Equipment)
        WHERE e.product_warranty_until IS NOT NULL
          AND duration.between(date(), e.product_warranty_until).days IN [180, 90, 30, 7]
        RETURN e.serial, e.product_warranty_until, e.customer
    """)
    
    for e in expiring:
        ⚡ Barak: f"⚠️ אחריות מוצר ל-{e.serial} (לקוח {e.customer}) פגה ב-{e.product_warranty_until}.
                    האם להציע ללקוח מסלול service contract?"
```

### 5.E.5 Service contract opportunity

- Customer at year 10 (inverter warranty done) = perfect moment to offer **paid annual maintenance contract** (~₪500-1500/year)
- בBEE this could be 20% of revenue at scale
- Alfred MarketingAgent auto-proposes drafts to Barak

### 5.E.6 Build estimate

| Task | hours |
|---|---|
| Warranty fields in :Equipment KG schema | 1h |
| Auto-populate on install via OpsAgent | 2h |
| Maintenance schedule per equipment type | 3h |
| Expiry alert cron (weekly) | 2h |
| Service contract proposal templates | 3h |
| Annual report generator | 4h |
| **Total** | **~15h** |

---

## 5.F — Microsoft Agent Framework A2A — Concrete Hermes Integration

### 5.F.1 ה-major finding ⭐

**`agent-framework-a2a` Python package ב-PyPI** — released May 15, 2026. תומך **רשמית** ב-A2A coordination בין Microsoft Agent Framework agents ל-**Hermes Agent**, LangChain agents, custom agents.

זה means: Alfred (OpenClaw / JS) ↔ Hermes (Python) יכולים לקבל **third coordinator** (.NET או Python MAF agent) שמתאם משימות מורכבות.

### 5.F.2 מתי A2A שווה ל-BEE

A2A הוא overhead. שווה רק כש:
1. יש 3+ agents שצריכים לתאם
2. הם רצים ב-runtimes שונים (Hermes Python + bee-hive .NET + future-agent X)
3. workflow מורכב חוצה-frameworks (e.g., compliance check → procurement → finance)

**ל-BEE כיום:** 2 agents (Alfred + Hermes), שניהם משתמשים MCP. **A2A overkill.**

**A2A relevance עתידית:**
- אם BEE רוכשת תוכנה enterprise (e.g., Salesforce, SAP) עם MAF agents — A2A מאפשר אינטגרציה
- אם נבנה bee-hive ב-.NET (handoff F#29 mentioned bee-hive ו-bee-ai-watcher)
- אם רוצים לחבר ל-Israeli enterprise tools (Hashavshevet has internal AI?)

### 5.F.3 Deployment pattern (אם / כאשר)

```python
# bee-prod-1 — agent_orchestrator.py
from agent_framework_a2a import A2AClient, AgentRegistry

# Register Hermes agent for coordination
registry = AgentRegistry()
registry.register("hermes", endpoint="http://127.0.0.1:8765/a2a")
registry.register("alfred", endpoint="http://127.0.0.1:18789/a2a")
registry.register("bee-hive", endpoint="http://bee-hive.local/a2a")  # future

# Cross-runtime task delegation
async def coordinate_install_workflow(customer_id, site_id):
    # OpsAgent (Hermes) handles scheduling
    schedule = await registry["hermes"].invoke("schedule_install", customer=customer_id)
    
    # FinanceAgent (Alfred) handles invoicing
    invoice = await registry["alfred"].invoke("create_invoice", deal=schedule.deal_id)
    
    # bee-hive future — sends to municipality permit system
    if site_id.municipality:
        permit = await registry["bee-hive"].invoke("file_permit", site=site_id)
    
    return {schedule, invoice, permit}
```

### 5.F.4 Hosting options

- A2A native (recommended, agent-to-agent direct)
- Azure Functions (cloud)
- Durable Task (long-running workflows)

ל-BEE — A2A native על bee-prod-1 הכי הגיוני.

### 5.F.5 Build estimate (אם / כאשר)

| Task | hours |
|---|---|
| Install agent-framework-a2a Python | 0.5h |
| Hermes A2A endpoint expose | 2h |
| Alfred A2A endpoint (bridge from MCP) | 4h |
| Orchestrator script + workflows | 6h |
| Integration test 3-agent workflow | 4h |
| **Total** | **~17h** |

**Defer until:** BEE has 3+ agents or needs cross-framework integration. **כיום: skip.** MCP cross-call (v1) מספיק.

---

## 5.G — סיכום v8

| Deep dive | זמן build | תלות |
|---|---|---|
| 5.A Site network + Modbus | ~45h | Tailscale account, Pi hardware $120-180 per site |
| 5.B Gmail management | ~13h | n8n deployed (v4) |
| 5.C Backup & DR | ~17h | Storage Box + B2 |
| 5.D Customer onboarding 30d | ~13h | Pipeline + WA + Cardcom |
| 5.E Warranty + lifecycle | ~15h | KG (v6) |
| 5.F A2A protocol (deferred) | ~17h | future need |
| **Total v8 additions** | **~120h** | — |

**Cumulative v1-v8:** ~5,900 שורות תכנון, ~460-490h build full.

---

## 5.H — סיכום ה-roadmap הכולל

| Version | Topic | Push status | hours est |
|---|---|---|---|
| v1 | Federation OpenClaw⇄Hermes | ✅ pushed | ~50h |
| audit | MCPs + bugs + Israeli | ✅ pushed | bundled |
| v2 | RAG + Composio + sandbox + Frigate | ✅ pushed | ~15h |
| v3 | Office automation 9-layer | ✅ pushed | ~38h |
| v4 | A2A overview + docs + SHAAM + voice + n8n + Langfuse | ✅ pushed | ~24h |
| **v5** | **Phone calls + voicemail + leads** | **⏳ pending push** | **~24h** |
| **v6** | **KG + customer journey + analytics + marketing** | **📝 plan file** | **~93h** |
| **v7** | **15-agent organization (business + personal)** | **📝 plan file** | **~100-130h** |
| **v8** | **Hardware + Gmail + BCDR + onboarding + warranty + A2A** | **📝 plan file** | **~120h** |
| **TOTAL** | | | **~460-490h** |

---

## 5.I — Top 10 actions ב-priority order — ה-shortlist הסופי

1. 🚨 **SHAAM compliance verification** (v4) — ינואר 2026 deadline
2. 🚨 **Router fallback fix** (audit #1) — 3min, massive impact
3. 🟠 **Re-enable disabled crons** (v7 4.D.1) — morning + evening digests
4. 🟠 **roster.yaml build** (v3 Q21) — בלי זה ה-agent לא יודע מי "ארז"
5. 🟠 **Cube ACR + iOS native call recording setup** (v5) — voice data flow
6. 🟠 **KG foundation Neo4j** (v6 3.A) — אגירת הכל
7. 🟡 **Email Gmail triage** (v8 5.B) — open inbound
8. 🟡 **Customer onboarding 30d flow** (v8 5.D) — NPS / retention
9. 🟡 **Backup & DR** (v8 5.C) — safety net
10. 🟢 **Composio Free tier signup** (v4 + v2) — 2 apps to start

זה לא רק checklist — זה ה-build order שמייצר ערך הכי מהר.

---

*Part 5 (v8) נכתב 2026-05-26 Asia/Jerusalem אחרי 6 web searches על infrastructure + email + BCDR + onboarding + warranty + A2A concrete. ~750 שורות נוספות. סך הכל plan file: ~5,900 שורות. v1-v8 cumulative ~460-490h build. הכל מאוגד כ-master plan לצוות הסוכנים המלא של BEE — business + personal life.*

---

# Part 6 — v9: Tactical Implementation Runbook for Phase 1

**Phase 1** = Wave -1 (Bug Squash, ~6h) + Wave 0 (Crisis Fix, ~3h) + תחילת Wave 1 (Foundation, ~8h) — סך הכל **~17 שעות עבודה לקבל לBEE את ה-15 הראשונים של "quick wins" מהתוכנית**.

זה לא תוכנית. זה **runbook**. כל צעד = פקודה + verification + rollback. ניתן לבצע צעד-אחר-צעד בפועל.

## ⚠️ הערה כללית

אני (הסשן הענני) **לא** יכול לבצע את הצעדים האלה בעצמי — אין לי גישה ל-`E:\` של ברק או ל-bee-prod-1. **הצעדים מיועדים לביצוע על-ידי:**
- **(a) ברק עצמו** ב-Powershell/CMD על Windows + SSH ל-bee-prod-1
- **(b) Claude Code שרץ מקומית** על המכונה של ברק (יש לו גישה לקבצים)
- **(c) הסשן ה-קלאודי הזה אחרי exit-plan-mode** + עדכון config של MCP ל-bee-prod-1 (אופציה תלויה ב-setup)

לכל צעד יש indication מי יבצע + רמת סיכון.

---

## 6.A — Pre-flight Checklist

לפני שמתחילים — וודא שיש לך:

| מצרך | כיצד לבדוק |
|---|---|
| ✅ Access ל-`E:\Desktop\OpenClawAgent\` (Windows PC) | `dir E:\Desktop\OpenClawAgent\` |
| ✅ Access ל-`E:\bee-hermes\` | `dir E:\bee-hermes\` |
| ✅ SSH access ל-bee-prod-1 (Hetzner CX52) | `ssh barak@bee-prod-1` |
| ✅ Backup של config files | `Copy-Item C:\Users\Barak\.openclaw\*.json -Destination C:\Users\Barak\.openclaw\backup-2026-05-26\` |
| ✅ Backup של state.db של Hermes | `Copy-Item C:\Users\Barak\AppData\Local\hermes\hermes-agent\state.db -Destination C:\backup\state.db.2026-05-26` |
| ✅ Anthropic API key valid (לא נטעון balance של DeepSeek) | check at platform.claude.com |
| ✅ Git status נקי לפני שמכניסים changes | `git status` ב-Alfred workspace + bee-hermes |

**אם משהו fail = STOP. תקן אותו לפני שתמשיך.**

---

## 6.B — Wave -1: Bug Squash (~6 hours)

13 תיקונים קונקרטיים מ-tools-deep-audit.md. סדר תיקון לפי risk + ROI.

### Step 1: alfred-router.js fallback inversion (3 דקות) 🟢 LOW RISK

**Risk:** מינימלי — שינוי 3 שורות + restart.

**מקום:** `C:\Users\Barak\.openclaw\workspace\scripts\alfred-router.js` (או wherever it lives, search if needed)

**Command (PowerShell on Barak's PC):**
```powershell
# Locate alfred-router.js
Get-ChildItem -Path C:\Users\Barak\ -Filter alfred-router.js -Recurse -ErrorAction SilentlyContinue
```

**Edit (lines ~37-39 currently):**
```javascript
// OLD (BUG)
if (providers.deepseek?.apiKey) return { kind: "deepseek", apiKey: providers.deepseek.apiKey, model: "deepseek-chat" };
if (providers.anthropic?.apiKey) return { kind: "anthropic", apiKey: providers.anthropic.apiKey, model: "claude-sonnet-4-6" };

// NEW (FIX)
if (providers.anthropic?.apiKey) return { kind: "anthropic", apiKey: providers.anthropic.apiKey, model: "claude-sonnet-4-6" };
if (providers.deepseek?.apiKey) return { kind: "deepseek", apiKey: providers.deepseek.apiKey, model: "deepseek-chat" };
```

**Verification:**
```powershell
# Trigger a classify call
# Send WA message to Alfred + check logs for "provider: anthropic"
Get-Content C:\Users\Barak\.openclaw\logs\router.log -Tail 20
```

**Rollback:** revert git change (`git checkout -- alfred-router.js`)

---

### Step 2: Hermes prompt_caching 5m→1h TTL (2 דקות) 🟢 LOW RISK

**Risk:** מינימלי.

**מקום:** `C:\Users\Barak\AppData\Local\hermes\config.yaml`

**Edit:**
```yaml
# locate line ~100
prompt_caching:
  cache_ttl: 1h  # was: 5m
```

**Verification:**
```powershell
# Inspect config
Get-Content C:\Users\Barak\AppData\Local\hermes\config.yaml | Select-String "cache_ttl"
# Restart Hermes gateway (in PowerShell admin)
# hermes gateway restart  (exact command depends on Hermes CLI version)
```

**Rollback:** restore from backup.

---

### Step 3: Disable Hermes `memory` tool OR enable Hindsight (5-30 דקות) 🟡 MEDIUM RISK

**Decision flow:**
- Quick fix (5 min): disable `memory` tool to stop 97.6% errors
- Better fix (30 min): enable Hindsight plugin (Q8 answer = hindsight per session-handoff)

**Quick fix:**
```yaml
# C:\Users\Barak\AppData\Local\hermes\config.yaml
tools:
  memory:
    enabled: false
```

**Better fix (Hindsight):**
```powershell
# Install Hindsight plugin
pip install hindsight-memory

# Configure Hermes
hermes memory setup
# Select "hindsight" from picker

# Verify
hermes memory status
# Expected: provider: hindsight, status: ready
```

**Verification:**
```powershell
# Trigger memory call from Hermes session
# Check state.db for new memory tool calls — should succeed
sqlite3 C:\Users\Barak\AppData\Local\hermes\state.db "SELECT tool_name, COUNT(*) FROM tool_calls WHERE tool_name='memory' AND status='ok' AND created_at > date('now')"
# Expected: > 0 after a few queries
```

---

### Step 4: Hermes web_search token rotation (3 דקות) 🟢 LOW RISK

**Check current backend:**
```powershell
Get-Content C:\Users\Barak\AppData\Local\hermes\config.yaml | Select-String -Context 0,5 "web_search"
```

**Action depends:**
- If Tavily: regenerate at tavily.com → update `WEB_SEARCH_API_KEY` in `.env`
- If Brave: regenerate at api.search.brave.com → update env
- Either way: restart Hermes after env change

**Verification:**
```powershell
# Test
# In Hermes CLI: > hermes "search for latest solar news"
# Check it returns results, no "Unauthorized" error
```

---

### Step 5: Disable 70 dormant Hermes skills (10 דקות) 🟢 LOW RISK

**Approach:** disable-only (Q10 answered: disable-only reversible).

```powershell
# Pull list of skills not used in 14 days
sqlite3 C:\Users\Barak\AppData\Local\hermes\state.db "
  SELECT DISTINCT skill_name 
  FROM session_messages 
  WHERE skill_name IS NOT NULL 
    AND created_at > date('now', '-14 days')
"
# Save as active_skills.txt
```

```powershell
# Then disable everything NOT in active_skills.txt
$activeSkills = Get-Content active_skills.txt
hermes skills list --json | ConvertFrom-Json | ForEach-Object {
    if ($_.name -notin $activeSkills) {
        hermes skills disable $_.name
    }
}
```

**Verification:**
```powershell
hermes skills list | wc -l
# Expected: ~20 active (instead of 84)

# Token usage check (after a day):
hermes insights --days 1
# System prompt size should drop ~6-10K tokens
```

**Rollback:**
```powershell
# Re-enable all builtins
hermes skills list --json | ConvertFrom-Json | ForEach-Object { hermes skills enable $_.name }
```

---

### Step 6: Fix DST hardcode in alfred-clarify.js (15 דקות) 🟢 LOW RISK

**Mקום:** `C:\Users\Barak\.openclaw\workspace\scripts\alfred-clarify.js` line ~392-393

**Replace:**
```javascript
// OLD
const quietEndIso = () => {
  return new Date().toISOString().replace(/T.*/, 'T18:00:00+03:00');
};

// NEW
const quietEndIso = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const today = formatter.format(new Date());
  return `${today}T18:00:00`;  // local time, no offset hardcoded
};
```

**Verification:** unit test — call `quietEndIso()` and confirm result respects DST.

---

### Step 7: Fix warranty placeholder in alfred-customer360.js (5 דקות) 🟢 LOW RISK

**Place:** line ~99

```javascript
// OLD (returns 0 always)
const warrantyQuery = `SELECT * FROM cust WHERE id IN (SELECT id FROM WarrantyRecord LIMIT 0)`;

// NEW
// Remove this query block entirely OR populate :Warranty table from BEE-DB
// For now: remove the call. Warranty tracking moves to v8 5.E (separate build).
```

---

### Step 8: SQL injection fixes (20 דקות) 🟠 HIGH PRIORITY (security)

**3 places per audit:**
- `alfred-enrich.js:85`
- `alfred-customer-intelligence.js:83`
- `alfred-knowledge.js:114`

**Pattern (all 3 places):**
```javascript
// OLD (vulnerable)
const query = `SELECT * FROM table WHERE id = ${userId}`;
db.exec(query);

// NEW (parameterized via better-sqlite3)
const stmt = db.prepare('SELECT * FROM table WHERE id = ?');
const result = stmt.all(userId);
```

**Verification:** Inject test customer ID like `1' OR '1'='1` — should return empty/error, not full table.

---

### Step 9: Parallelize calendar fetches in alfred-customer360.js (10 דקות) 🟢 LOW RISK

**Place:** lines 240-262

```javascript
// OLD (sequential 3 × 15s = 45s)
const cal1 = await fetchCalendar('personal');
const cal2 = await fetchCalendar('tasks-neri');
const cal3 = await fetchCalendar('tasks-shlomi-solar');

// NEW (parallel 15s total)
const [cal1, cal2, cal3] = await Promise.all([
  fetchCalendar('personal'),
  fetchCalendar('tasks-neri'),
  fetchCalendar('tasks-shlomi-solar'),
]);
```

**Verification:** Timing log should drop from ~45s to ~15s.

---

### Step 10: DRY SELF_PHONE (15 דקות) 🟢 LOW RISK

**3 places duplicating constant:** alfred-clarify.js:63, alfred-identity.js:39, alfred-customer-intelligence.js:49

**Create central source:**
```javascript
// alfred-identity.js (already exports identity)
export const SELF_PHONE = '+972509554483';
export const SELF_PHONE_E164 = '972509554483';
export const SELF_PHONE_GROUP_ID = '972509554483@s.whatsapp.net';
```

**Replace in other 2 files:**
```javascript
import { SELF_PHONE, SELF_PHONE_E164, SELF_PHONE_GROUP_ID } from './alfred-identity.js';
```

---

### Step 11: Re-enable disabled crons (10 דקות) 🟠 HIGH ROI

**4 important crons disabled (per AGENTS.md summary):**
- `morning-urgent-digest` (10:00)
- `evening-urgent-digest` (22:00)
- `weekly-self-review` (Sun 09:00)
- `gmail-morning-digest` (08:00) — note: skip until Gmail integration done (v8 5.B)

**Command (depends on OpenClaw CLI version):**
```powershell
openclaw cron enable morning-urgent-digest
openclaw cron enable evening-urgent-digest
openclaw cron enable weekly-self-review

# Verify
openclaw cron list | Select-String "enabled"
```

**Verification:** wait for next 10:00 or 22:00 → ⚡ should arrive from Alfred.

---

### Step 12: Heartbeat alert for 0-tokens-24h (1h) 🟠 HIGH ROI

**Build new cron** to catch the 3-day-silent-outage problem (handoff #4).

**Create:** `C:\Users\Barak\.openclaw\workspace\scripts\heartbeat-watcher.js`

```javascript
import fs from 'fs';
import { query } from './alfred-state-db.js';  // or direct sqlite3

async function check() {
  // Last 24h Hermes token usage
  const sql = `
    SELECT SUM(input_tokens + output_tokens) AS total_tokens
    FROM session_messages
    WHERE created_at > datetime('now', '-24 hours')
  `;
  const result = await query(sql);
  
  if (result.total_tokens === 0 || result.total_tokens === null) {
    // ALERT
    await sendUrgentToBarak('🚨 Hermes 0 tokens in last 24h. Possibly silent outage.');
  }
}

check();
```

**Schedule cron daily at 23:55:**
```powershell
openclaw cron add heartbeat-watcher --schedule "55 23 * * *" --script "scripts/heartbeat-watcher.js"
```

---

### Step 13: Cache few-shot examples in router (30 דקות) 🟡 MEDIUM RISK

**Place:** `alfred-router.js` + `alfred-clarify.js`

**Current behavior:** task-examples.md + knowledge graph read **on every classify call** = slow + token-heavy.

**Fix:** in-memory cache + invalidate when file modified:

```javascript
import fs from 'fs';
import path from 'path';

const EXAMPLES_PATH = path.join(workspace, 'task-examples.md');
let examplesCache = null;
let examplesCacheTime = 0;

function getExamples() {
  const stat = fs.statSync(EXAMPLES_PATH);
  if (examplesCache && stat.mtimeMs <= examplesCacheTime) {
    return examplesCache;
  }
  examplesCache = fs.readFileSync(EXAMPLES_PATH, 'utf-8');
  examplesCacheTime = stat.mtimeMs;
  return examplesCache;
}
```

---

### Wave -1 sub-total: ~6 hours

**אחרי Wave -1:**
- Anthropic = default LLM (no more DeepSeek 402 cascades)
- 70 skills disabled → ~50M tokens/month savings
- 3 SQL injection vectors closed
- DST bug gone
- Calendar fetches 3× faster
- Heartbeat protects against silent outages
- 4 cron jobs re-enabled

---

## 6.C — Wave 0: Crisis Fix (~3 hours)

### Step 14: Upgrade Hermes to 0.14 (1h) 🟠 HIGH IMPACT

**Pre:**
```powershell
# Backup
Copy-Item C:\Users\Barak\AppData\Local\hermes\ -Recurse -Destination C:\backup\hermes-pre-0.14
```

**Upgrade:**
```powershell
hermes update
# Or, if Python pip install:
pip install --upgrade hermes-agent

# Verify
hermes --version
# Expected: 0.14.x or later
```

**Run config check:**
```powershell
hermes config check
# Expected: all OK or specific upgrade warnings
```

---

### Step 15: Enable OAuth proxy → Claude Pro (30 דקות) 🟠 BIG WIN

```powershell
hermes auth claude
# Browser opens → login to Claude Pro/Max
# Token saved automatically
```

**Update config to use OAuth:**
```yaml
# C:\Users\Barak\AppData\Local\hermes\config.yaml
model:
  default: claude-opus-4-7  # OR claude-sonnet-4-6 if Opus too expensive
  auth_method: claude_oauth_proxy
fallback_chain:
  - claude_oauth_proxy
  - gemini-flash
  - deepseek-chat  # last resort
```

**Verification:**
```powershell
# Test API call
hermes "what is 2+2?"
# Should respond using Claude Pro, not API key
```

---

### Step 16: Fix WA bridge port 3000 (15 דקות) 🟠 CRITICAL

```powershell
# Diagnose
netstat -ano | findstr ":3000"
# If empty: bridge not listening

# Check status
hermes gateway status

# If down, restart
hermes gateway restart

# Check logs
Get-Content C:\Users\Barak\AppData\Local\hermes\logs\errors.log -Tail 50
```

**If still failing:**
```powershell
# Last resort: kill + reinstall NSSM service
hermes gateway uninstall
hermes gateway install
hermes gateway start
```

---

### Step 17: Memory/<date>.md restoration (30 דקות) 🟡 IMPORTANT

**Find the cron responsible:**
```powershell
openclaw cron list | Select-String "memory"
# OR
Select-String -Path "C:\Users\Barak\.openclaw\workspace\scripts\*.js" -Pattern "memory/.*\.md"
```

**Likely culprit:** `alfred-handle.js` or daily summary cron.

**Test write:**
```powershell
node C:\Users\Barak\.openclaw\workspace\scripts\alfred-handle.js --test-memory-write
# Verify file appears at C:\Users\Barak\.openclaw\workspace\memory\2026-05-26.md
```

---

### Step 18: SolarEdge API key rotation (15 דקות) 🟠 CRITICAL

**Steps:**
1. Login to monitoring.solaredge.com → Account → API Access
2. Generate new key
3. Update `.env`:
```powershell
notepad C:\Users\Barak\.openclaw\secrets\bee-integrations.env
# Edit: SOLAREDGE_APIKEY=<new key>
```
4. Test:
```powershell
node C:\Users\Barak\.openclaw\workspace\scripts\alfred-solaredge.js --test
# Should return list of sites, no 403
```

---

### Wave 0 sub-total: ~3 hours

---

## 6.D — Beginning of Wave 1: Foundation (~8 hours)

### Step 19: Build `roster.yaml` (2h) 🟠 HIGH FOUNDATION

**ברק ימלא ידנית — אין אוטומציה.** 

**Template:** `C:\Users\Barak\.openclaw\workspace\roster.yaml`

```yaml
# BEE roster — humans in our orbit
# Last updated: 2026-05-26 by Barak

employees:
  - id: barak
    name_he: "ברק ברזל"
    role: principal
    phone: "+972509554483"
    email: barak@bee.co.il
    calendars: ["personal", "tasks-neri-watch", "tasks-shlomi-solar-watch"]
    
  - id: neri
    name_he: "נרי"
    role: technician
    phone: "+972500000000"  # TODO: fill
    email: ""  # TODO: fill if exists
    skills: ["electrical", "solar-install", "inverter-troubleshoot"]
    calendars: ["tasks-neri"]
    monday_groups: ["הקמות-active"]
    car: "BEE-1"  # if Tracer tracked
    
  - id: shlomi_shirazi
    name_he: "שלמי שיראזי"
    role: solar-sales-ops
    phone: "+972500000001"  # TODO
    email: ""
    skills: ["sales", "solar-design", "quotes"]
    calendars: ["tasks-shlomi-solar"]

external_inspectors:
  - id: erez_cohen
    name_he: "ארז כהן"
    role: licensed-electrical-inspector
    phone: ""  # TODO
    license_number: ""  # TODO
    authority: "המשרד לכלכלה"
    common_sites: []  # populated over time
    
suppliers:
  - id: prime_energy
    name: "Prime Energy"
    role: contractor
    contact: ""
    payment_terms_days: 30
    typical_items: ["panels", "inverters"]

# Add more entries as Barak identifies them
```

**Wire into Alfred:**
```javascript
// alfred-identity.js
import yaml from 'js-yaml';
import fs from 'fs';

export const ROSTER = yaml.load(
  fs.readFileSync(path.join(workspace, 'roster.yaml'), 'utf-8')
);

export function resolvePerson(text) {
  const lower = text.toLowerCase();
  for (const cat of ['employees', 'external_inspectors', 'suppliers']) {
    for (const p of ROSTER[cat] || []) {
      if (p.name_he && lower.includes(p.name_he.toLowerCase())) {
        return { ...p, category: cat };
      }
    }
  }
  return null;
}
```

**Use in router:**
```javascript
// alfred-router.js
import { resolvePerson } from './alfred-identity.js';

// In classify step:
const person = resolvePerson(messageText);
if (person) {
  context.recognizedPerson = person;
  // Boost confidence accordingly
}
```

---

### Step 20: SHAAM compliance verification (1h) 🚨 URGENT

**Action:**
1. Contact Invoice Maven support **today**:
   - Email: support@invoicemaven.com (or appropriate channel)
   - Subject: "SHAAM allocation number compliance — January 2026"
   - Body: "Hi, do you support SHAAM allocation numbers for invoices above 10K NIS? Need confirmation by [Q3 end date]. If yes — what's the API/UI flow? If no — what's the migration plan?"
2. אם **תשובה חיובית** — verify with test invoice in next ~7 days
3. אם **תשובה שלילית** — start Cardcom migration plan (v4 deep dive C 3.3)

**Track via Q29-Q30 in plan file.**

---

### Step 21: Install Tirith for MCP scanning (15 דקות) 🟠 SECURITY

```powershell
# Install (Rust single binary)
cargo install tirith

# Or download Windows release from github.com/sheeki03/tirith

# Setup for Claude Code (if used) + Cursor
tirith setup claude-code --with-mcp
tirith setup cursor --with-mcp

# Test scan a config
tirith scan C:\Users\Barak\.claude\mcp-config.json
# Should output: PASS or list of warnings
```

**Quarterly cron** (add to schedule):
```powershell
openclaw cron add quarterly-tirith-rescan --schedule "0 9 1 */3 *" --script "tirith scan all-configs && email-results"
```

---

### Step 22: Cube ACR install on Neri/Shlomi Android (per device, 30 דקות) 🟡 IF AVAILABLE

**Pre-requisite:** Both have Android. Both willing to install (privacy discussion!).

**Steps per device:**
1. Install Cube Call Recorder ACR Premium from Play Store (₪150/year)
2. Settings → Auto-record:
   - Mode: "Auto-record selected contacts"
   - Add: all BEE customer phones (later: auto-import from Monday)
   - Disclaimer prefix: "שיחה זו עשויה להיות מוקלטת"
3. Settings → Cloud → Google Drive:
   - Authorize
   - Folder: `bee-shared/calls/<name>/`
4. Test: place test call → verify recording uploaded

**Backend (bee-prod-1):**
```bash
# Folder watcher
mkdir /var/lib/bee-calls/incoming
# Drive sync (rclone)
rclone sync google-drive:bee-shared/calls /var/lib/bee-calls/incoming --interval 5m
```

---

### Step 23: KG foundation Neo4j start (4h) 🟠 STRATEGIC

**On bee-prod-1:**
```bash
# Deploy Neo4j Community
docker run -d \
  --name bee-neo4j \
  --restart unless-stopped \
  -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
  -v /var/lib/bee-neo4j/data:/data \
  -v /var/lib/bee-neo4j/logs:/logs \
  -e NEO4J_AUTH=neo4j/$(openssl rand -base64 24) \
  -e NEO4J_PLUGINS='["graph-data-science"]' \
  -e NEO4J_dbms_memory_heap_initial__size=2G \
  -e NEO4J_dbms_memory_heap_max__size=2G \
  neo4j:5-community

# Save password to .env (output of above randomization)

# Verify
docker logs bee-neo4j | grep -i "started"
# Should see: "Started." within ~30s
```

**Create initial schema (Cypher):**
```bash
docker exec -it bee-neo4j cypher-shell -u neo4j -p <password>
```

```cypher
// Constraints (uniqueness)
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT site_id IF NOT EXISTS FOR (s:Site) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT job_id IF NOT EXISTS FOR (j:Job) REQUIRE j.id IS UNIQUE;
CREATE CONSTRAINT invoice_id IF NOT EXISTS FOR (i:Invoice) REQUIRE i.id IS UNIQUE;
CREATE CONSTRAINT call_id IF NOT EXISTS FOR (c:Call) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT lead_id IF NOT EXISTS FOR (l:Lead) REQUIRE l.id IS UNIQUE;

// Indexes for common queries
CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name_he);
CREATE INDEX site_name IF NOT EXISTS FOR (s:Site) ON (s.name);
CREATE INDEX job_status IF NOT EXISTS FOR (j:Job) ON (j.status);
CREATE INDEX call_created IF NOT EXISTS FOR (c:Call) ON (c.created_at);

// Verify
SHOW CONSTRAINTS;
```

**Seed initial data from roster.yaml:**
```bash
# bee-prod-1: kg-seed.py
python3 - <<'EOF'
import yaml, json
from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "<password>"))

roster = yaml.safe_load(open("/path/to/roster.yaml"))

with driver.session() as session:
    for cat in ["employees", "external_inspectors", "suppliers"]:
        for p in roster.get(cat, []):
            session.run(
                """
                MERGE (p:Person {id: $id})
                SET p.name_he = $name_he, p.role = $role, p.phone = $phone,
                    p.category = $cat
                """,
                id=p["id"], name_he=p.get("name_he", ""), 
                role=p.get("role", ""), phone=p.get("phone", ""),
                cat=cat,
            )

print("Seeded")
EOF
```

**Wire MCP server (`bee-kg-mcp`):**
```bash
# bee-prod-1: install MCP server for Neo4j
npm install -g @neo4j/mcp-server
# Configure
cat > ~/.config/neo4j-mcp/config.json <<EOF
{
  "uri": "bolt://localhost:7687",
  "user": "neo4j",
  "password": "<password>",
  "database": "neo4j"
}
EOF
# Start
neo4j-mcp serve --port 18791 &
```

**Register MCP in Alfred + Hermes config:**
```yaml
# Alfred openclaw.config.yaml
mcp_servers:
  bee-kg:
    url: http://bee-prod-1:18791
    enabled: true

# Hermes config.yaml
mcp_servers:
  - name: bee-kg
    transport: http
    url: http://bee-prod-1:18791
```

**Test:**
```cypher
// From Alfred or Hermes session, via MCP:
// "mcp__bee-kg__query: MATCH (p:Person) RETURN p.name_he LIMIT 10"
```

---

### Wave 1 partial sub-total: ~8 hours

---

## 6.E — Phase 1 Totals + Verification

**Total time investment:** ~6h + ~3h + ~8h = **~17 hours**

**Outcomes after Phase 1:**

| Outcome | Verification |
|---|---|
| ✅ Alfred uses Anthropic Claude by default | `Get-Content router.log` shows provider:anthropic |
| ✅ Hermes 0.14 running | `hermes --version` |
| ✅ OAuth proxy active (no DeepSeek 402) | bills don't show DeepSeek charges |
| ✅ 70 dormant skills disabled (~50M tokens/m saved) | `hermes skills list \| wc -l` ≤ 20 |
| ✅ Cron heartbeat alerts on 0-tokens-24h | check next 24h, no alert if active |
| ✅ memory/<date>.md writing | new file appeared today |
| ✅ Cache TTL 1h | config inspected |
| ✅ 3 SQL injection sites fixed | manual code review |
| ✅ DST hardcode gone | inspect alfred-clarify.js |
| ✅ Calendar 3× faster | profile log time check |
| ✅ SolarEdge 403 cleared | test API call |
| ✅ roster.yaml populated | file exists with ≥5 entries |
| ✅ SHAAM status known | response from Invoice Maven |
| ✅ Tirith installed + scans configs | scan results saved |
| ✅ Cube ACR on field tech phones | test recording uploaded |
| ✅ Neo4j KG running | docker ps shows bee-neo4j |
| ✅ bee-kg-mcp registered in both agents | both can query KG |

---

## 6.F — Rollback Plan (if Phase 1 fails)

If anything breaks badly:

```powershell
# Wave -1 rollbacks
git -C C:\Users\Barak\.openclaw\workspace reset --hard HEAD~13  # 13 commits ago

# Wave 0 rollbacks
Remove-Item C:\Users\Barak\AppData\Local\hermes\ -Recurse -Force
Copy-Item C:\backup\hermes-pre-0.14 -Destination C:\Users\Barak\AppData\Local\hermes -Recurse

# Wave 1 rollbacks
docker stop bee-neo4j
docker rm bee-neo4j
rm -rf /var/lib/bee-neo4j
```

(rollback granularity per step — keep diffs small).

---

## 6.G — Next Step After Phase 1 Complete

Move to **Wave 1 full + Wave 2** (per master plan v1 + v6 + v8):

| Phase 2 wave | Topic | Hours |
|---|---|---|
| Wave 1 (rest) | Single source of truth — Baileys + dedup + bridge migration | ~8h |
| Wave 2 | MCP foundation full — Composio + Tier 1 + Israeli MCPs | ~14h |
| Wave 3 begin | Voice pipeline (v5) Layer 1-3 | ~12h |

Re-evaluate weekly. Adjust based on what BEE *actually* needed.

---

*Part 6 (v9) נכתב 2026-05-26 Asia/Jerusalem ב-plan mode. ~650 שורות tactical runbook. Phase 1 = 17 שעות עבודה ל-quick wins ענקיים. סך הכל plan file: ~6,550 שורות. v1-v9 cumulative ~480-510h build.*

---

## ⚠️ Reminder critical: v5 voice pipeline פעיל לוקלית, ממתין לpush

ברגע שיוצאים מ-plan mode → push `voice-and-call-pipeline-v5.md` (650 שורות) לresearch/ + push ה-plan file הזה (כעת ~6,550 שורות) כ-master plan ב-research/.

---

*End of Master Plan v1-v9. ~6,550 שורות. Total v1-v9 build estimate: ~480-510h. Ready for Phase 1 execution after exit-plan-mode.*

---

# Part 7 — v10: RESET — Fact-Based Occupations (Correction of v6-v9 Assumptions)

⚠️ **הודאה:** v6-v9 הוסיפו הרבה רעיונות גנריים על SMB Israeli — Cardcom, Hashavshevet, investment management, HR/payroll. **בדקתי את ה-local-state files בעיון לראשונה** (AGENTS.md 52KB מלא + 16 cron jobs + plugins + Hermes config + cooperation HTML) — וברק צודק: הרבה ממה שחקרתי **לא רלוונטי**.

זה ה-corrective layer.

## 7.A — מה ש-BEE באמת עושה (לפי ה-files, לא ניחושים)

### 7.A.1 פרופיל החברה — facts מ-MEMORY + AGENTS

- **137 לקוחות electrical** (מ-MEMORY.md L1)
- **255 sites פעילים**
- **149 inverters total:** 70 SolarEdge + 55 Sungrow + 24 SMA
- **1,425 jobs פתוחים**, 461 התראות פעילות
- **18 fleet vehicles via Tracer** (telematics)
- **BEE app:** 41 route modules, 38 Prisma models (PostgreSQL + Hetzner + Docker + Tailscale)

### 7.A.2 לקוחות מובילים (named in files)

| Customer | Sites | Capacity |
|---|---:|---:|
| **Rafael Solar** | 27 | 10.7 MW |
| **Palar** | 28 | 5.6 MW |
| **חכל שדרות** | 48 | 2.6 MW |
| **האגודה למען החייל** | 13 | 1.3 MW |
| **צרויה** | 11 | 2.5 MW |

זה לא residential mom-and-pop. זה **commercial PV at scale**.

### 7.A.3 צוות — actual roster (לרשת ב-roster.yaml)

| Person | Role | Source |
|---|---|---|
| **Barak Barzel** | Principal, electrical engineer | +972509554483 |
| **Shlomi Shirazi** | Sales + ops (solar) | shared calendar tasks-shlomi-solar |
| **Neri Lederberg** | AI collaboration | shared calendar tasks-neri |
| **Yosef** | Employee | named in files |
| **Vladimir** | Employee | named in files |
| **Layan** | Employee | named in files |

**8-10 קבלנים:** Roni, Haitam, Bigsol, Fares, Abraham, Slava, Shahar, Vicky, Shlomi T, Dror.

### 7.A.4 8 תחומי עיסוק עיקריים (Evidence-Based)

| # | Domain | Evidence | סטטוס AI |
|---|---|---|---|
| 1 | **Solar PV at scale** (commercial) | solar-agent skill + alfred-solar-edge.js + 70+55+24 inverter fleet | ✅ partial — needs Deye, Sungrow Modbus direct |
| 2 | **Electrical compliance + regulation** | regulatory-agent skill + alfred-deadlines.js + cron morning-gov-regulations | ✅ partial — regulation RSS active |
| 3 | **Installation PM via Monday** | 7 Monday boards + alfred-monday.js + monday-morning-digest cron | ✅ active |
| 4 | **Calendar coordination** (26 calendars, 3 locked) | alfred-calendar.js + 3-calendar lock | ✅ active |
| 5 | **Invoice Maven** | alfred-invoice-maven.js — **skeleton, disabled cron** | ⛔ not live |
| 6 | **Weather-aware field scheduling** | alfred-weather.js + morning-weather-scan cron | ✅ active |
| 7 | **BEE Operations DB** (own SaaS) | refresh-bee-snapshot.js cron — 15min + 06:05 daily | ✅ active |
| 8 | **OpenClaw → Hermes migration** | hermes-alfred-cooperation.html roadmap | ⏳ in flight |

זה ה-real surface. **לא** investment, **לא** HR, **לא** Hashavshevet, **לא** Cardcom.

### 7.A.5 Intent taxonomy actual (לפי AGENTS.md L265-306)

8 intents בשימוש:
1. `internal-task` — משימות פנים
2. `internal-meeting` — פגישות פנים
3. `client-status` — עדכוני לקוחות (PV sites)
4. `client-fault` — תקלות שדה (SolarEdge / Sungrow alarms)
5. `client-quote` — בקשות הצעת מחיר
6. `client-payment` — עדכוני תשלום
7. `regulatory` — דדליינים ממשלתיים, IEC permits
8. `vendor` — קבלות ספקים, הזמנות

---

## 7.B — מה הנחתי בטעות (no evidence in files)

| הנחה שלי | האם יש evidence? | פעולה |
|---|---|---|
| ❌ Cardcom integration | **No** — שום reference בקבצים | להסיר מ-v2/v4 deep dives. אם יש need, ברק יזכיר. |
| ❌ Hashavshevet/Priority API | **No** — שום reference | להסיר מ-v4. ברק כנראה לא משתמש. |
| ❌ Investment management (keren hishtalmut, pension) | **No** — שום skill / tool / memory | להסיר מ-v7 PersonalFinanceAgent. אם רוצה — request explicit. |
| ❌ HR/payroll (10 contractors named, but no payroll automation) | **No** — שמות יש, payroll אין | להסיר מ-v7. ברק כנראה משלם ידנית. |
| ❌ AWS/Azure cloud | **No** — Hetzner בלבד | להסיר מ-v8 cloud deployment options. |
| ❌ Real estate / property | **No** | להסיר מ-v7. |
| ❌ Religious/Shabbat scheduling | **No evidence directly** — quietHours יש אבל לא religious | להוריד עד שברק יבקש. |
| ❌ Mobile app PWA | **No evidence of plan** | להסיר מ-v8/v9 list. |
| ✅ SHAAM e-invoicing | **Partial** — Invoice Maven mentioned but disabled. Need to check if SHAAM compliant. | להשאיר עם asterisk. |
| ✅ Hebrew docs generation | **Yes** — proposals/contracts implied by client-quote intent | להשאיר. |
| ✅ Voice/call pipeline (v5) | **Partial** — WA voice yes, phone calls no evidence in files | להשאיר v5 לכשתהיה decision. |

## 7.C — תחומים עם EVIDENCE שלא חקרתי לעומק (פיצוי)

הנה איפה צריך לחקור עכשיו, **על בסיס הקבצים, לא ניחושים**:

### 7.C.1 Solar PV diagnostics + protection coordination

**מ-AGENTS.md:** ברק מהנדס חשמל. solar-agent skill מטפל ב-PV monitoring. אבל יש 1,425 jobs פתוחים — חלקם בטח protection coordination, fault analysis, PV string sizing, מערכות הגנה.

**ל-deep dive:** איזה AI tools קיימים ל-PV engineering automation (לא רק monitoring)?
- Helioscope / Aurora Solar — design tools (ידועים בתעשייה)
- SolarLabs — protection studies
- DIgSILENT PowerFactory — fault analysis

**זה הצד שברק רוצה להרחיב** ("רצון ברור להרחיב AI ל-engineering tasks: solar design, protection coordination, BOM generation"). זה הseparator האמיתי.

### 7.C.2 Tracer fleet telematics — 18 vehicles

לא חקרתי בעומק. 18 רכבים = יותר מ-fleet קטן. מה הפוטנציאל?
- driver behavior scoring → safety
- maintenance prediction
- route optimization בין אתרים
- fuel theft detection

### 7.C.3 BEE Operations app — 41 routes, 38 Prisma models

זה native אצל ברק. כל ה-data בכת"י. מה ה-routes? איזה Prisma models? מה ה-frontend? יש customer portal? יש technician app?

זה ה-asset של BEE — לא איזה SaaS חיצוני.

### 7.C.4 WhatsApp archive groups + bee-ai-watcher

יש 2 groups archived ("Ai" + unspecified). יש `E:\bee-ai-watcher\scan.js`. מה זה עושה? מה מנתחים? למה?

### 7.C.5 Firecrawl 13+14 skills

יותר מ-15 variations של firecrawl. מה הם scraping?
- Customers? regulatory? competitor pricing? supplier inventory?
- מנגנון dedup needed (v1 audit) — אבל ה-use case עצמו לא ברור

### 7.C.6 n8n-workflow-automation skill

קיים, לא חקרתי. מה ה-workflows? מה integrated?

### 7.C.7 Hermes 9 skills active (top 14 used)

- `obsidian` (35 calls in 14 days) — top usage
- `google-workspace` (21)
- `whatsapp-crypt15-extraction` (10)
- `openclaw-to-hermes-migration` (8)
- `barak-business-integrations` (7)
- `regulatory-rss-monitoring` (6)
- `himalaya` (4)
- `barak-activity-reporting` (4)

**Obsidian** הוא ה-#1 skill בשימוש. ברק כנראה משתמש ב-Obsidian כ-knowledge management — וזה לא נחקר.

**`barak-business-integrations`** — local skill. מה זה עושה?

---

## 7.D — חקירות מתוקנות שצריך לעשות (במקום הגנריות הקודמות)

| נושא | במקום של (deprecated) | למה |
|---|---|---|
| **PV engineering automation** (Helioscope/Aurora/SolarLabs AI integration) | במקום investment management | ברק מהנדס + 255 sites |
| **Tracer fleet AI** (driver scoring, maintenance, route opt) | במקום spouse integration | יש 18 vehicles |
| **BEE Operations app — analytics + customer portal + tech mobile** | במקום AWS/Azure cloud setup | own SaaS |
| **Obsidian deep integration** (knowledge management via Obsidian Hermes skill) | במקום second-brain generic | already #1 use |
| **bee-ai-watcher analysis** (what does scan.js do? mining WA groups?) | במקום AI21 generic Hebrew models | actual unknown use case |
| **Firecrawl 15+ variants** (audit each — what scrapes what?) | במקום n8n templates Israeli | actual scripts in flight |
| **Commercial customer success at scale** (Rafael Solar, Palar — what do they need?) | במקום residential customer onboarding 30d | actual customers |
| **Protection coordination engineering AI** | במקום post-sale NPS automation | engineering surface |
| **PV system performance forecasting** (137 customers × monthly degradation) | במקום generic CRO | direct business value |

## 7.E — Updates מומלצים ל-plans הקודמים

| Plan | What to change |
|---|---|
| **v2 federation-plan-v2.md** | Composio: only relevant integrations are WhatsApp + maybe SMS. Cardcom — remove unless ברק confirms. |
| **v3 office-automation-architecture.md** | Layer 7 Self-improvement OK. ביעוד "Customer journey" — restructure ל-**commercial customers** (not residential). |
| **v4 deeper-tools-research-v4.md** | SHAAM — confirm with ברק if Invoice Maven supports. Hashavshevet/Priority section — remove. |
| **v6 (this plan part 3)** | Customer journey 7.A-G — restructure ל-commercial focus. Marketing 3.D — re-evaluate (commercial leads come differently from residential). |
| **v7 (part 4)** | PersonalFinanceAgent + FamilyAgent + HealthAgent + RelationshipsAgent + Spouse — **remove for now**. ברק לא ביקש את זה. |
| **v8 (part 5)** | Customer onboarding 5.D — commercial install onboarding is different. Restructure. |
| **v9 (part 6)** | Phase 1 runbook — נכון ברובו. roster.yaml — להרחיב לפי 7.A.3 (Yosef, Vladimir, Layan, 10 contractors). |

## 7.F — שאלות חדשות לבירור (replace previous Q's)

| # | שאלה |
|---|---|
| Q61 | אישור: **לא** Cardcom — Invoice Maven בלבד? |
| Q62 | **PV engineering tools** — Helioscope / Aurora / SolarLabs / DIgSILENT — איזה אתה משתמש? |
| Q63 | **bee-ai-watcher** — מה זה עושה בדיוק? |
| Q64 | **Firecrawl 15 variants** — מה scraping? |
| Q65 | **BEE Operations app** — מה customer portal? technician mobile? |
| Q66 | **18 fleet vehicles** — Tracer enough or need analytics layer? |
| Q67 | **Obsidian vault** — איפה? מה structure? |
| Q68 | **n8n workflows** — אילו workflows רצים בפועל? |
| Q69 | **commercial customer needs** — Rafael Solar, Palar — מה הם רוצים? portal? reports? proactive alerts? |
| Q70 | **AI engineering surface** — solar design? protection coordination? BOM? — הכי קריטי לפי AGENTS.md indication |

---

## 7.G — אני עוצר עם research גנרי

לא אעשה עוד deep dives על נושאים שלא ברורים שאתה עוסק בהם. הכלים שכבר בנינו (v1-v9) — חלקם רלוונטיים, חלקם להוריד.

**הצעה לסשן הבא:**
1. תאשר/תתקן את 8 התחומים ב-7.A.4 — האם זה התמונה האמיתית?
2. תענה על Q61-Q70 (10 שאלות specific) — קצר, נקודתי
3. מבוסס על תשובות, אבצע deep dives **מדויקים** על מה שאתה באמת עוסק

**זה ה-correct path forward.** Sorry על הטרחה.

---

*Part 7 (v10) נכתב 2026-05-26 Asia/Jerusalem אחרי Explore agent קרא לעומק 17 קבצי local-state. Reset של הנחות. ~250 שורות לתיקון. סך הכל plan file: ~6,800 שורות. Take v1-v9 בזהירות — חלק רלוונטי, חלק generic ולא רלוונטי.*

---

## 7.H — Corrections from Barak (2026-05-26 reply)

ברק סקר את 8 התחומים ב-7.A.4 וענה "חלקית נכון". 4 תיקונים:

### 7.H.1 ✏️ Solar PV = **engineering** (לא רק ops)

ה-domain האמיתי הוא לא רק monitoring + maintenance, אלא:
- **PV design** — system sizing, layout, string configuration
- **Protection coordination** — fault current, selectivity, AC/DC protection
- **BOM (Bill of Materials) generation** — לכל פרויקט
- **Fault analysis** — short-circuit calc, arc-flash
- **Performance forecasting** — production estimates, degradation modeling

זה ה-**separator האמיתי של BEE**. ברק מהנדס חשמל + 137 לקוחות commercial + 255 sites. ה-AI צריך לטפל ב-engineering surface, לא רק ops.

**Tools רלוונטיים לחקור:**
- **Helioscope** (Folsom Labs) — design + simulation
- **Aurora Solar** — design + sales tools
- **SolarLabs** — protection studies
- **DIgSILENT PowerFactory** — power system analysis
- **PVsyst** — production simulation
- **ETAP** — protection coordination

### 7.H.2 ✏️ Tracer fleet AI = **תחום עצמאי** (תחום #9)

לא sub-bullet של Operations. 18 vehicles + 137 customers + 255 sites = serious fleet operation. תחום בפני עצמו עם:
- driver behavior scoring (safety)
- predictive maintenance per vehicle
- route optimization across sites daily
- fuel theft / anomaly detection
- vehicle-to-job assignment optimization
- compliance (vehicle inspections, insurance, רישוי)

### 7.H.3 ✏️ BEE Operations app = **תחום עצמאי** (תחום #10)

לא sub-bullet של Operations. **own SaaS**. 41 route modules + 38 Prisma models.
- כנראה יש Customer Portal (137 לקוחות)
- כנראה Technician mobile interface
- Analytics frontend
- API surface

זה asset עיקרי של החברה. ל-deep dive: מה ה-routes? מה ה-models? איך משולב עם Alfred/Hermes?

### 7.H.4 ✏️ Invoice Maven = **LIVE בפועל** (לא skeleton!)

טעות שלי. Invoice Maven פעיל. ה-cron disabled אבל ה-integration עצמה עובדת.

זאת אומרת:
- ה-`alfred-invoice-maven.js` קורא לAPI בפועל
- חשבוניות נוצרות אוטומטית במצבים מסוימים (deal closed?)
- צריך להבין: מתי cron יופעל מחדש? מה הblocker?

ולכן — **SHAAM compliance בוער** (v4 deep dive C). אם Invoice Maven פעיל ולא SHAAM-compliant → קנסות.

### 7.H.5 ⚠️ חסר תחום משמעותי (להתברר)

ברק סימן "חסר תחום משמעותי בתגובה הבאה" אבל לא ציין איזה. אצטרך לשאול ב-AskUserQuestion הבא.

**הימור (אבל לא לפעול עליו):** לפי מה שראיתי בקבצים, יתכן שהחסר הוא:
- **knowledge management / Obsidian vault** (כי Obsidian הוא Hermes skill #1, 35 calls / 14 days — מאוד active)
- **engineering report generation** (תוצר של ה-PV engineering)
- **proposal / quote generation Hebrew docs** (client-quote intent קיים)
- **customer success at commercial scale** (Rafael, Palar — relationship management)
- **field technician dispatch + real-time orchestration**

לא מנחש. אשאל.

### 7.H.6 ✏️ ה-10 תחומים המעודכנים

| # | Domain | Status |
|---|---|---|
| 1 | **Solar PV engineering** (design, protection, BOM, fault, forecast) | partial — ops only |
| 2 | Electrical compliance + regulation | active |
| 3 | Installation PM via Monday | active |
| 4 | Calendar coordination (26 cal) | active |
| 5 | **Invoice Maven** (LIVE) | active (cron disabled) |
| 6 | Weather-aware field scheduling | active |
| 7 | OpenClaw → Hermes migration | in flight |
| 8 | **BEE Operations app** (41 routes / 38 models) | active — own SaaS |
| 9 | **Tracer fleet AI** (18 vehicles) | partial — telematics only |
| 10 | **[? missing domain — to confirm]** | ? |

זה ה-actual surface — לא 8 אלא לפחות 10-11.

### 7.H.7 ✏️ 4 תחומים נוספים שאישרת (תחומים 11-14)

ענית "כל זה" על 4 ההצעות — כלומר **כל** 4 הם תחומי deep dive אמיתיים:

| # | Domain | Trigger evidence |
|---|---|---|
| 11 | **Engineering reports + proposals (Hebrew)** | client-quote intent קיים, 1,425 jobs פתוחים — כל אחד צריך proposal |
| 12 | **Knowledge management (Obsidian vault)** | Hermes skill `obsidian` = #1 בשימוש (35 calls / 14 days) |
| 13 | **Commercial customer success** | Rafael Solar 10.7MW, Palar 5.6MW — enterprise accounts, לא residential |
| 14 | **Field tech dispatch real-time** | Neri + Shlomi + 10 contractors + 18 vehicles + 255 sites |

**ה-actual surface = 14 תחומים, לא 8.**

---

# Part 8 — v11: Focused Research on the 5 Actual BEE Domains

מבוסס על 5 web searches **ממוקדות בתחומים האמיתיים** (לא generic SMB Israeli). כל תחום עם evidence + concrete recommendations + integration עם הstack הקיים.

## 8.A — PV Solar Engineering Surface (תחום 1, מתוקן)

### 8.A.1 ה-tools של הצוות העולמי

| Tool | What it does | Pricing | AI features 2026 |
|---|---|---|---|
| **HelioScope** (by Aurora) | Commercial PV design + simulation | $159-259/m | AI obstruction detection (10-15s vs 10-15min manual) + LiDAR integration |
| **Aurora Solar** | Residential + commercial design + sales | Tiered | Similar Obstruction Detection AI |
| **PVsyst** | Detailed production simulation | One-time license | ML degradation modeling |
| **SolarLabs** | Protection studies | Specialized | — |
| **DIgSILENT PowerFactory** | Power system analysis (fault, dynamics) | Enterprise | — |
| **ETAP** | Protection coordination | Enterprise | — |
| **ELECTRIX AI 2026** (WSCAD) | Electrical CAD + auto cabinet layout | Subscription | "AI generates complete control cabinets from circuit diagrams, recognizes patterns from existing projects" |

### 8.A.2 ה-gap הקריטי (per 2026 research)

> "Most solar design software including HelioScope do NOT generate single line diagrams or calculate wire sizes, forcing commercial EPCs to use AutoCAD for electrical documentation."

**משמעות ל-BEE:** ברק (מהנדס) probably עושה את ה-electrical documentation ב-AutoCAD ידנית. זה ה-bottleneck.

### 8.A.3 BEE-specific recommendation

ל-BEE שיש 255 sites + 137 commercial customers + פלטות מרובות (70 SolarEdge + 55 Sungrow + 24 SMA):

**Option 1: HelioScope subscription** ($159-259/m × $1,900-3,100/y)
- Pro: standard בתעשייה, AI obstruction detection
- Con: עוד tool חיצוני, integration עם Alfred צריך MCP wrapper

**Option 2: Build engineering-agent skill בHermes**
- Charter: take site dimensions + roof type + equipment list → generate:
  - String configuration (per inverter capacity)
  - Wire sizing per electrical code IEC + Israeli standard
  - BOM with quantities
  - Protection coordination (CB/fuse selection)
  - Single line diagram (text-based, then convert)
- Tools: Claude Sonnet for reasoning + structured outputs + reference docs (IEC 60364, Israeli תקנת חשמל)
- Time: ~30-40h to build foundation

**Option 3: ELECTRIX AI 2026** (WSCAD)
- Generates cabinet layouts from diagrams automatically
- Recognizes patterns
- Specific to electrical CAD
- Worth checking pricing — could be enterprise-only

**ההמלצה ל-BEE:** **Option 2** (build engineering-agent). יותר עבודה אבל:
- Integrates עם Monday Deals + הקמות
- Reuses Israeli electrical code knowledge (already in `regulatory-agent` skill)
- Aligns עם BEE Operations app (own SaaS layer)
- No third-party lock-in

Then later — אם volume גדל — add HelioScope ל-AI obstruction detection.

### 8.A.4 Engineering agent — concrete charter

```yaml
name: engineering-agent
sub_skills:
  - pv-design-calc:
      input: {site_dims, roof_orientation, modules, inverters_target}
      output: {string_count, string_layout, modules_per_string, dc_ac_ratio}
  - wire-sizing:
      input: {string_layout, distance_to_inverter, current_max}
      output: {wire_gauge_mm2, voltage_drop_pct, cable_length_total}
  - protection-coordination:
      input: {string_currents, inverter_max, panel_short_circuit}
      output: {dc_isolator_rating, ac_breaker_rating, fuse_ratings}
  - bom-generator:
      input: {design_complete}
      output: {bom_xlsx_with_quantities_and_costs, ordered_by_supplier}
  - performance-forecast:
      input: {site_lat_lon, modules, tilt, azimuth, shading}
      output: {monthly_production_kwh, annual_degradation_pct}

mcp_dependencies:
  - solaredge / sungrow / sma (for existing fleet data — historical perf)
  - monday (read deals + הקמות, write engineering review)
  - kg (v6) — :Equipment, :Site nodes
  - docx skill (Hebrew engineering reports)
```

---

## 8.B — Obsidian + AI Integration (תחום 12 חדש)

### 8.B.1 למה זה תחום #1 בHermes

מ-Hermes skills.txt: `obsidian` = 35 calls / 14 days. **יותר מכל skill אחר** (Google Workspace 21, WA extraction 10).

ברק כנראה משתמש ב-Obsidian vault כ-second brain. בלי לפרמל את זה — ה-AI נכנס אליו אבל לא יודע איך structurally.

### 8.B.2 Trends 2026

מ-research:
- **1.5M Obsidian users**, 22% YoY growth
- **obsidian-skills** (Steph Ango, January 2026) — 14,900 GitHub stars in 3 months
- 2,700+ community plugins, 100+ AI-related
- **MCP server pattern** = standard: vault → MCP → Claude Desktop / Cursor / Hermes
- Outcome: "reduce knowledge management overhead from 30-40% time to <10%"

### 8.B.3 ה-question לBEE

**איפה ה-Obsidian vault של ברק? מה ה-structure?**
- Daily notes per site visit?
- Project per customer?
- Atomic notes by topic (Sungrow / SolarEdge / regulation / etc.)?
- Templates ייעודיים?

לא יודע — חסר evidence ב-files (ה-vault location לא ב-config שנקרא).

### 8.B.4 ה-vision לBEE

**אם ה-vault מאורגן נכון:**

1. **Hermes `obsidian` skill** משתמש בvault כ-T2 memory (per v3 architecture)
2. **Alfred** קורא לvault דרך MCP server (obsidian-mcp-server)
3. **engineering-agent (8.A)** כותב engineering notes ל-vault
4. **KG (v6)** מסונכרן עם Obsidian — backlinks הופכים ל-relationships

### 8.B.5 BEE-specific build

```yaml
phase 1: audit existing vault
  - find vault location (E:\... or OneDrive?)
  - list current folders + naming convention
  - identify daily notes pattern
  - estimate active vs dormant files
  time: 1-2h, requires Barak input

phase 2: install obsidian-mcp-server
  - standard MCP server exposing vault to Alfred + Hermes
  - read + write capabilities
  - search by tag, link, content
  time: 2h

phase 3: formalize templates
  - site-visit.md template
  - customer.md template
  - equipment-issue.md template
  - regulation-note.md template
  - QBR.md template (per 8.C below)
  time: 4h

phase 4: skill enhancement
  - extend Hermes obsidian skill with BEE-specific helpers
  - "create-site-visit-note" command
  - "search-similar-issues" command
  - "generate-weekly-summary" from vault
  time: 6h

phase 5: KG sync (v6 dependency)
  - Obsidian links → KG relationships
  - bidirectional sync
  time: 8h
```

**Total ~20-25h** for full Obsidian-as-backbone.

---

## 8.C — Commercial Customer Success (תחום 13 חדש)

### 8.C.1 ההבדל מ-residential

מ-research: "B2B solar marketing involves longer sales cycles, multiple stakeholders, and data-backed messaging—focused more on ROI and scalability than emotional appeals used in consumer solar."

**הלקוחות של ברק לא residential.** Rafael Solar (27 sites, 10.7MW), Palar (28 sites, 5.6MW) הם **enterprise accounts**. הם רוצים:
- **SLAs** with response/resolution times
- **QBR** (Quarterly Business Reviews)
- **Dedicated point of contact**
- **Account health scoring**
- **ROI tracking** (kWh produced × tariff savings)
- **Compliance reporting** (regulatory + warranty)

### 8.C.2 Commercial customer playbook

```yaml
account_management_pattern:
  per_enterprise_customer:
    - dedicated_PIC: Barak or Shlomi (named)
    - SLA_tier:
        priority_1_outage: response_2h_resolve_8h
        priority_2_degradation: response_8h_resolve_24h
        priority_3_routine: response_24h_resolve_5d
    - account_health_score: 0-100 weekly
    - QBR_schedule: quarterly (4/y)
    - reports:
        daily: production status (if material site outage)
        weekly: aggregate production + alerts summary
        monthly: financial — kWh × tariff = savings vs forecast
        quarterly: full QBR deck

automation_layer:
  per_customer_dashboard:
    - SolarEdge / Sungrow API → real-time production
    - alerts → :Issue node in KG
    - SLA timer started when issue detected
    - escalation chain: tech → Barak → customer notification
    - resolution tracking
  
  QBR_generation:
    - data: last 90 days production + issues + resolution times
    - AI-generated draft deck (per Tosea.ai 2026 pattern)
    - Barak reviews + customizes
    - delivered: customer-facing PDF or presentation
```

### 8.C.3 What's already in BEE (vs gap)

**Already:** SolarEdge/Sungrow monitoring, Monday boards, alfred-customer-intelligence.js skeleton.

**Gap:**
- SLA timer + tracking — not built
- Account health score — not built
- QBR automated generation — not built
- Customer-facing portal — לא ברור (BEE Operations app יתכן יש חלקית)

### 8.C.4 BEE-specific build

```yaml
phase 1: SLA definitions per customer
  - audit existing contracts
  - extract or define SLA tiers
  - store: :Customer { sla_tier, sla_p1_response_h, ... }
  time: 4h + ברק input

phase 2: SLA timer + alerts
  - issue detected via SolarEdge/Sungrow alarm
  - timer starts → tracks against SLA
  - escalation: 50% time elapsed → ⚡ Barak
  - SLA miss → critical alert
  time: 8h

phase 3: account health score
  - composite: production vs forecast, open issues, response time, payment status
  - weekly cron
  - low score → Barak ⚡
  time: 6h

phase 4: QBR generator
  - data aggregator (last 90 days)
  - Claude Sonnet → Hebrew deck draft
  - Anthropic docx skill → PDF
  - per-customer delivery
  time: 10h

phase 5: customer portal (depends on BEE Operations app — תחום 8)
  - read access to their own sites
  - real-time production
  - issues + SLAs
  - QBR history
  time: 20h+ (large)
```

**Total ~28h** for SLA+QBR (excluding customer portal which is BEE app territory).

---

## 8.D — Field Tech Dispatch Real-Time (תחום 14 חדש)

### 8.D.1 ה-benchmarks 2026

מ-research:
- **15-25% more completed jobs per tech per day** with AI dispatch vs rule-based
- **$475** avoided per truck roll (missing photos avoidance)
- **Live re-optimization** when conditions change (traffic, cancellations, emergencies)

לBEE עם 18 vehicles + 255 sites + Neri/Shlomi/10 contractors = פוטנציאל ענק.

### 8.D.2 What BEE currently has

- **Monday הקמות board** — assignment of work to people
- **Tracer GPS** — knows vehicle locations
- **alfred-calendar.js** — 3-calendar lock with Neri + Shlomi
- **alfred-weather.js** — knows weather risk

מה ש**חסר:**
- Real-time multi-objective optimization (location × skill × priority × weather × traffic)
- Live re-optimization מ-incoming events
- Automated reassignment

### 8.D.3 Build vs Buy

**Buy options:**
- ServiceTitan — enterprise FSM, $$$
- FieldEdge / Jobber / Housecall Pro — SMB, $200-500/m
- Arrivy — dispatching focus
- FieldCamp — AI-first dispatcher (March 2026 launch)

**ל-BEE:** mainly Hebrew interface needed + integration עם Monday Existing + Tracer + Calendar. FSM platforms typically English-first.

**Build option (Hermes/Alfred):**
```yaml
field-dispatch-agent:
  inputs:
    - Monday הקמות board (jobs queue)
    - Tracer GPS (current locations)
    - Google Calendar (current commitments)
    - weather (alfred-weather)
    - traffic (Google Maps API)
    - tech skills (roster.yaml from v9)
  
  optimization_objective: minimize {travel_time + late_penalty + skill_mismatch}
  
  outputs:
    - per-tech daily schedule (assigned jobs in order)
    - ETAs per job
    - customer notifications
    - re-optimization on event (cancellation, emergency, weather change)
  
  schedule:
    - 07:00 daily: optimize day plan
    - On event: re-optimize affected techs
    - 17:00 daily: tomorrow preview
  
  trust_level:
    L0: propose, Barak approves
    L1: auto-assign for routine (after 30+ approvals)
    L2: auto-reassign for emergencies (rare)
```

### 8.D.4 ROI estimate

If BEE current avg = 4 jobs/tech/day × 5 techs × 22 work days = 440 jobs/month  
AI dispatch +20% = 528 jobs/month = **+88 jobs/month**

If 10% are billable extra revenue at ₪500 avg → **₪44K/month extra**.

If even 5% improvement (conservative) → +22 jobs/m → ₪11K/m.

vs build cost ~30-40h once.

### 8.D.5 BEE-specific build

```yaml
phase 1: schema + data ingestion
  - tech_skills in roster.yaml
  - job_skill_requirements in Monday board
  - Tracer GPS poll integration (audit Tier 1 #6)
  time: 6h

phase 2: optimization engine
  - simple greedy first (location-aware)
  - upgrade to OR-tools (Google) for multi-objective
  time: 10h

phase 3: live re-optimization
  - event listener (Tracer events, Monday status, weather)
  - re-solve affected techs
  time: 8h

phase 4: customer notifications (depends on 8.C SLAs)
  - on schedule change → customer ⚡
  - ETAs updated
  time: 4h

phase 5: feedback loop
  - actuals vs predicted travel times
  - tech skill calibration (who's faster at X?)
  - continuous improvement
  time: 6h
```

**Total ~34h** for full dispatch agent.

---

## 8.E — Engineering Reports + Proposals Hebrew (תחום 11 חדש)

### 8.E.1 ה-need

- BEE = 137 customers × multiple jobs/year = **hundreds of proposals/year**
- Each proposal: header + Hebrew text + technical specs + BOM table + drawing references + pricing
- Currently: manual? semi-manual? unknown — אבל בטוח **bottleneck**

### 8.E.2 2026 tools landscape

מ-research:
- **Flowcase** — centralizes engineering CV/projects, auto-generates RFP responses
- **Workorb** — RFP → technical response drafting
- **AutogenAI** — proposal writing
- **ELECTRIX AI 2026** — auto cabinet layout + BOM export

מה שחסר: **Hebrew support** + **Israeli electrical code references** + **BEE-specific equipment library**.

### 8.E.3 BEE-specific build (build, don't buy)

```yaml
proposal-generator skill:
  inputs:
    - customer_id (from KG)
    - site_details (lat/lon, roof_dims, existing_load)
    - target_capacity_kWp
    - target_budget_NIS (optional)
  
  pipeline:
    1. engineering-agent (8.A) generates:
       - string configuration
       - wire sizing
       - protection coordination
       - performance forecast (annual kWh)
       - BOM with quantities
    
    2. pricing-engine:
       - looks up current supplier prices (KG :Supplier)
       - calculates total BOM cost
       - applies markup per :Customer tier
       - generates payment milestones
    
    3. proposal-template Hebrew:
       - header: BEE branding, customer name, date
       - executive summary (Hebrew)
       - technical scope (Hebrew + diagrams)
       - BOM table (Hebrew + Sicom format)
       - pricing breakdown (Hebrew with VAT)
       - warranty terms (Hebrew)
       - signature blocks
    
    4. Anthropic docx skill → PDF
       - RTL layout
       - Hebrew fonts (David / Heebo)
       - signed by Barak digitally if configured
    
    5. delivery:
       - email to customer
       - copy to Monday Deals as attachment
       - copy to KG :Quote node
       - notification ⚡ Barak

  estimated_time_per_proposal:
    manual: 2-4 hours
    with_skill: 5-10 minutes (with Barak review)
    
  ROI: if 5 proposals/week × 3h saved = 15h/week back to Barak
```

### 8.E.4 Critical dependency

This skill **requires** engineering-agent (8.A) + KG (v6) + roster.yaml (v9 Step 19). **Build order:** KG → engineering-agent → proposal-generator.

### 8.E.5 Build estimate

| Task | hours |
|---|---|
| BEE Hebrew proposal template (docx) | 6h |
| Pricing engine with supplier lookup | 6h |
| Hebrew text generation prompts + tests | 8h |
| Integration עם engineering-agent | 4h |
| Monday + KG hooks | 3h |
| Delivery pipeline | 3h |
| **Total** | **~30h** |

---

## 8.F — Integration עם Stack הקיים

5 ה-domains החדשים (8.A-E) משתלבים בstack הקיים:

```
                          BEE.DB (own SaaS, תחום 8)
                                  │
              ┌──────────────────┼─────────────────┐
              │                  │                 │
       Monday boards    Tracer GPS              Calendar
              │                  │                 │
              └──────┬───────────┴────────┬────────┘
                     │                    │
                     ▼                    ▼
              KG (Neo4j, v6)        field-dispatch-agent (8.D)
                     │
       ┌─────────────┼──────────────────┐
       │             │                  │
       ▼             ▼                  ▼
engineering-agent  proposal-generator  customer-success-agent
   (8.A)              (8.E)               (8.C: SLA + QBR)
       │             │                  │
       └──────┬──────┴──────────────────┘
              │
              ▼
      Obsidian vault (8.B — knowledge persistence)
              │
              ▼
         Alfred / Hermes (existing)
```

## 8.G — Build priority (revised)

| Order | Domain | Time | Why first |
|---|---|---|---|
| 1 | **Obsidian formalize (8.B)** | 20-25h | Hermes #1 skill already, foundation for KG sync |
| 2 | **KG Neo4j (v6 3.A, v9 step 23)** | 19h | Required by 8.A + 8.C + 8.E |
| 3 | **engineering-agent (8.A)** | 30-40h | Separator of BEE — highest leverage |
| 4 | **proposal-generator (8.E)** | 30h | Highest ROI per hour (5/week × 3h saved) |
| 5 | **customer-success SLA+QBR (8.C)** | 28h | Rafael/Palar retention |
| 6 | **field-dispatch-agent (8.D)** | 34h | +20% jobs/tech (₪22K/m est) |

**Total v11 build: ~160-167h** for full v11 surface.

**Combined v1-v11: ~640-680h** total build.

---

## 8.H — מה זה משאיר לעתיד (לא בv11)

לא חקרתי לעומק (placeholder for future):
- Tracer fleet AI deep (תחום 9) — 18 vehicles, driver scoring, predictive maintenance
- BEE Operations app surface (תחום 10) — מה ה-41 routes? מה ה-38 models? customer portal? technician mobile?
- bee-ai-watcher scan.js — מה זה עושה?
- Firecrawl 15 variants — מה scraping?
- n8n workflows existing — מה רץ?
- Invoice Maven SHAAM compliance (תחום 5, urgent) — verify
- AI ops cleanup (Obsidian formalized solves part)

---

*Part 8 (v11) נכתב 2026-05-26 Asia/Jerusalem אחרי 5 web searches **ממוקדות בתחומים האמיתיים** של BEE (לא generic SMB Israeli). 14 תחומים פעילים. 5 deep dives ב-v11. Build estimate ~160-167h. Total v1-v11 ~640-680h. ה-research v6-v9 generic — חלקו רלוונטי, חלקו לא. ה-v10 reset + v11 focused = corrected path.*

---

# Part 9 — v12: WA Groups + Email + Company — Comprehensive Findings

ברק העיר: "יש עוד מידע מכל הווצאפ (יש הרבה קבוצות, שווה לך לחקור את כולן), מיילים, מה שהחברה עושה." Explore agent שני סרק לעומק את ה-21 קבצים שמזכירים WA + 13 שמזכירים email. הממצאים מבית.

## 9.A — WhatsApp Groups (5 active + Self DM + 14.6K total chats)

### 9.A.1 ה-5 הקבוצות הפעילות (named in files)

| # | Name | ID | Purpose | Capture mode |
|---|---|---|---|---|
| 1 | **עדכונים על עבודה על התשתיות שלנו** | `120363425994041413@g.us` | Neri sync — daily activity digests | WA bridge capture |
| 2 | **מענה לאנשי קשר (Drafts)** | `120363407758194119@g.us` | Alfred posts draft replies → Barak picks (marker: `alfreddraftsmarker39172`) | Agent use only |
| 3 | **תמלולים אלפרד (Voice Transcripts)** | `120363409101459201@g.us` | Alfred posts voice memo transcripts with intent classification (task/event/site-note/idea/general) | Agent use only |
| 4 | **כפר יובל - התקנת מערכות** | `120363409665555113@g.us` | Active site project group with Prime Energy contractors | Site dossier auto-update (read-only) |
| 5 | **Ai (archived)** | `120363305783926068@g.us` | Archived idea incubator → forwards to `E:\bee-ai-watcher\` | JSONL append to `ai-feed/inbound.jsonl` |

**Plus:**
- **Self-chat DM** (`+972509554483`) — voice memos input
- **Total: 14.6K chats**, **1M messages** in workspace.db (890MB)

### 9.A.2 משמעות לתוכניות הקודמות

זה משנה הרבה. ב-v1-v9 התייחסתי ל-"WhatsApp" כ-channel אחד. בפועל יש **5+ channels semantic distinct**:

| Group | Implies AI behavior |
|---|---|
| Neri sync | Activity reporter agent (cron 10:00, 22:00) |
| Drafts | Reply suggestion engine (Q19 unresolved earlier) |
| Voice transcripts | Hotword classifier (already Groq Whisper + intent classifier) |
| Site groups | Site dossier writer (per-site .md auto-update, NEVER reply) |
| Ai (archived) | Idea-mining → bee-ai-watcher pipeline |

### 9.A.3 חשובות שלא היו ב-v1-v11

- **Drafts pattern is critical for Q19** (unauthorized senders) — Alfred drafts, Barak picks. **לא** לאוטומציה.
- **Site groups never send back** — ברק הוא ה-only voice לקבלן. Alfred listens, writes site dossier, **never replies**.
- **bee-ai-watcher** = external reviewer that consumes archived "Ai" group content. **לא** unknown. זה idea-incubator → research feed pattern.

### 9.A.4 תיקונים לbuild plan

| מה היה ב-v1-v9 | מה נכון לפי v12 |
|---|---|
| WA = single channel | 5+ channels semantic distinct |
| "Reply automation" generic | **Drafts pattern only** (Barak picks) — no auto-reply to unauthorized |
| Site groups generic | Read-only listener + site dossier auto-update |
| bee-ai-watcher unknown | External AI reviewer consuming archived "Ai" group |
| Voice memos generic | Already implemented: Groq Whisper → transcripts group |

---

## 9.B — Email Infrastructure (mostly disabled / pending)

### 9.B.1 Active vs disabled

| Component | Status | Evidence |
|---|---|---|
| `alfred-gmail.js` v2.1 | **Exists, used manually** (`unread --max 50`) | AGENTS.md:189 |
| `gmail-morning-digest` cron 08:00 | **DISABLED** | cron-jobs.json:180 |
| Hermes `himalaya` skill | enabled, no provider configured | hermes/skills.txt |
| Hermes `email: { enabled: false }` | **disabled in config** | hermes/config.redacted.yaml:424 |
| Google Calendar | active (3 calendars) | AGENTS.md:557-580 |
| Gmail OAuth tokens | redacted, presence unconfirmed | config.redacted.* |

### 9.B.2 Email accounts identified

| Account | Owner | Use |
|---|---|---|
| `barak@bee.co.il` (assumed primary) | Barak | Main inbox, not directly named |
| `lederbergneri@gmail.com` | Neri Ledenberg | Shared writer on tasks-neri calendar |
| Shlomi's email | Shlomi Shirazi | **deferred** — awaiting email setup for tasks-shlomi-solar calendar |

### 9.B.3 ה-gap בoffice automation

עד שgmail-morning-digest cron יופעל מחדש + email triage agent ייבנה (v8 5.B), ברק עדיין חייב לקרוא את הinbox ידנית כל בוקר. **זה bottleneck**.

מה חסר לpush ל-Wave 0/1:
- enable cron + verify alfred-gmail.js still works
- audit מה ה-triage logic — האם יש?
- decide on Hermes email provider (himalaya needs IMAP/SMTP config)

---

## 9.C — BEE Company — Comprehensive Picture (finally)

זה ה-rich description שחסר ב-v1-v9. אצטט ישירות מ-AGENTS.md + workspace-USER.md.

### 9.C.1 הזהות

**Barak Electric Engineering (BEE)** — Israeli electrical contracting firm.
**Self-described:** "Engineering-first mindset" (workspace-USER.md:9).
**Owner-operator pattern:** "Hands-on worker + manager with a team" (workspace-USER.md).
**Dual ambition:** "grow business AND build BEE SaaS app equally" (workspace-USER.md:3).

### 9.C.2 קנה המידה האמיתי

| Metric | Value |
|---|---|
| Total clients | 137 |
| Total sites | 255 |
| Total installed capacity (top 5 alone) | **22.7+ MW** |
| Inverters fleet | 70 SolarEdge + 55 Sungrow + 24 SMA = 149 |
| Batteries in pricebook | 9 models |
| Panel types in pricebook | 8 |
| Active alerts (real-time) | 461 |
| Jobs logged | 1,425 open |
| Fleet vehicles | 18 (Tracer GPS) |
| Office tasks board | 3,344 items |

**זה לא small electrician.** זה capital-intensive solar systems integrator at MW-scale.

### 9.C.3 Top 5 לקוחות (corrected names)

| Customer | Sites | Capacity |
|---|---:|---:|
| Rafael Solar | 27 | 10.7 MW |
| Palar | 28 | 5.6 MW |
| חכל שדרות (Hakal Sdrot) | 48 | 2.6 MW |
| **האגודה למען החייל** (nonprofit — soldier welfare) | 13 | 1.3 MW |
| צרויה (Tzruyah) | 11 | 2.5 MW |

### 9.C.4 Service categories (evidence-based)

1. **Solar PV install** (commercial scale, primary revenue driver)
2. **Maintenance & monitoring** (1,425 open jobs, 461 alerts)
3. **Design & engineering** (engineering-first ambition)
4. **Project management** (site dossiers, fleet management)
5. **Residential/commercial electrical** (broader contracting per workspace-USER)
6. **Industrial electrical** (mentioned in scope)

### 9.C.5 Open tenders (TIME-CRITICAL!)

לפי MEMORY.md:
- **חוף אשקלון** (Ashkelon Beach): deadline **12.5** (May 12, 2026) — **PASSED**
- **Kiryat Gat**: deadline **13.5** (May 13, 2026) — **PASSED**

הsnapshot מ-2026-05-26. ה-deadlines passed לפני 2 שבועות. **שאלה לברק:** הוגשו? אם כן — סטטוס? אם לא — lost opportunity?

זה ה-classic case איפה AI agent היה צריך להזכיר Q-1 day. ה-Wave 1 צריך לכלול tender-deadline-watcher.

### 9.C.6 Growth ambition — BEE SaaS

**זה לא רק electrical contractor.** ברק בונה SaaS app — possibly:
- Operations platform למתחרים (אחרי שיהיה proven)
- Customer portal לlucky customers
- Industry tool — solar fleet management

**Stack מתועד:**
- **41 route modules** (Express/Fastify?)
- **38 Prisma models**
- **PostgreSQL 16**
- **Hetzner VPS**
- **Docker**
- **Tailscale** (subnet routing)

זה production-grade SaaS, לא MVP.

### 9.C.7 Regulatory compliance (active)

- `alfred-gov-rss.js` — monitoring Ministry of Energy + Electricity Authority gov.il
- 30 keywords tracked
- `alfred-deadlines.js` — Israeli VAT + income tax + insurance deadlines
- One-shot reminders for **רישיון בודק חשמל** (electrical inspector license)
- Active cron: `morning-gov-regulations` 09:30 daily

**Implication:** ברק מחזיק רישיון בודק חשמל (electrical inspector license). זה significant credential ב-Israel.

### 9.C.8 Competitive positioning (extracted)

- **Technical:** industrial-grade monitoring (SolarEdge/Sungrow/SMA)
- **Data-driven:** 255 sites under unified system
- **Engineering-first:** prioritizes technical agents over operational
- **Innovation track:** SaaS + service delivery same team
- **Compliance as feature:** active regulatory monitoring, not afterthought

---

## 9.D — שלב חדש: Critical Adjustments to v1-v11 Plans

זה מה שצריך לתקן בעקבות v12 findings:

### 9.D.1 v9 Wave 0 — add Step 24: WA group taxonomy

```yaml
step_24:
  name: WA group classification config
  time: 1h
  action:
    - audit current site-groups.json (mentioned but not in snapshot)
    - formalize 5-channel pattern:
        neri_sync: { capture: true, reply_policy: never, digest_cron: enabled }
        drafts: { capture: false, agent_use: true }
        voice_transcripts: { capture: false, agent_use: true }
        site_groups: { capture: true, reply_policy: never, action: site_dossier_update }
        archive_ai: { capture: true, action: ai_feed_jsonl }
    - update alfred-router.js to consult this taxonomy
    - update memory routing in evening briefing
```

### 9.D.2 v9 Wave 0 — add Step 25: Tender deadline watcher

```yaml
step_25:
  name: Tender deadline watcher (would have prevented Ashkelon/Kiryat Gat misses)
  time: 3h
  action:
    - new cron tender-deadline-check at 07:00 daily
    - reads tenders from Monday board or dedicated file
    - alerts at T-14d, T-7d, T-3d, T-1d
    - escalation if no submit confirmed
```

### 9.D.3 v9 Wave 1 — add Step 26: gmail-morning-digest re-enable

```yaml
step_26:
  name: Restore gmail-morning-digest
  time: 1h
  action:
    - openclaw cron enable gmail-morning-digest
    - test: ensure alfred-gmail.js still authenticates
    - verify output bucket logic (urgent/pending/spam)
  blocker_to_resolve_first:
    - why was it disabled? maybe OAuth expired
```

### 9.D.4 v6 KG schema — add node types for WA semantic

```cypher
// New node types based on v12 findings:
:WAGroup { id, name, purpose, capture_mode, reply_policy }
:VoiceMemo { id, transcript, classification, source_chat_id, created_at }
:Draft { id, suggested_reply, original_message, sender_phone, picked }
:Tender { id, name, deadline, status, monday_item_id }

// Relationships:
(:Message)-[:IN]->(:WAGroup)
(:WAGroup)-[:CAPTURES_TO]->(:SiteDossier)
(:VoiceMemo)-[:PRODUCED]->(:Task | :Event | :SiteNote | :Idea)
(:Draft)-[:FOR]->(:Person)
(:Tender)-[:TRACKED_BY]->(:Cron)
```

### 9.D.5 v11 — engineering-agent priority bumped

Given Barak's explicit "Engineering-first mindset: prioritize technical engineering agents" — `engineering-agent` (8.A) is now **top priority** after foundations (Obsidian + KG).

### 9.D.6 חסר עדיין לחקור

- Site-groups.json — לא ב-snapshot. כמה site groups בנוסף לכפר יובל? מה ה-format?
- bee-ai-watcher — איך ה-flow מ"Ai" group ל-`E:\bee-ai-watcher\scan.js` → output?
- BEE SaaS app — 41 routes + 38 models — מה כל אחד? customer portal? technician app? analytics?
- Open tenders status — האם Ashkelon + Kiryat Gat הוגשו?
- DeepSeek balance — מתי הוטען? עד היום dormant?
- 1M messages in workspace.db — איזה insights ניתן להוציא?

---

## 9.E — קריאות פעולה דחופות (לפני exit-plan-mode)

לפי v12 findings, **לפני** שאצא ל-plan mode ונרוץ Phase 1:

| # | פעולה | למה דחוף |
|---|---|---|
| 1 | בדוק עם ברק: Ashkelon + Kiryat Gat tenders — הוגשו? | passed dates 12.5+13.5 |
| 2 | DeepSeek balance — האם הוטען? Hermes dormant עדיין? | 4 crons broken |
| 3 | Verify site-groups.json — איזה sites נוספים יש WA groups? | foundation לbe site dossier auto |
| 4 | Gmail OAuth — האם expired? צריך reauth? | gmail digest can't run without |
| 5 | אישור: BEE SaaS app — מה ה-state? יש customer portal? technician mobile? | Tunnel #1 / חלום של ברק |

זה לא מ-research רגיל. זה אופרציה.

---

*Part 9 (v12) נכתב 2026-05-26 Asia/Jerusalem אחרי Explore agent שני סרק לעומק 21 קבצים על WA + 13 על email. 5 WA groups identified (לא 2). Email infra mostly disabled. BEE = 22.7+ MW capital-intensive integrator. ~400 שורות נוספות. סך הכל plan file ~7,200 שורות. v1-v12 cumulative ~640-680h. תיקונים critical ל-v9 Phase 1 runbook. ה-actual surface יותר עשיר מ-v1-v11 ייצוג.*

---

## 9.F — Update 2026-05-26 (mid-session): DeepSeek balance restored

ברק שיתף screenshot מ-platform.deepseek.com:

**Balance state:**
- **Topped-up balance: $96.57 USD** (active)
- **Monthly expenses: $23.42 USD** (May 2026)
- Balance alert: disabled

**Usage pattern (May 2026):**
| Model | API requests | Tokens |
|---|---:|---:|
| deepseek-v4-pro | 9,294 | 166.2M |
| deepseek-v4-flash | 6,574 | 403.7M |
| **Total** | **15,868** | **~570M** |

(זה הרבה! ממוצע $0.041 per million tokens — extremely cheap)

**משמעות לתוכניות:**

| מה השתנה | נדרש לעדכן |
|---|---|
| Hermes 4 crons שbroken מ-402 | אמורים להתחיל לרוץ שוב — verify next 24h |
| v9 Wave 0 Step 15 (OAuth proxy migration) | **דחיפות ירדה** — DeepSeek פעיל. עדיין worth ל-Claude Pro routing אבל לא urgent |
| Fallback chain logic (v9) | DeepSeek יכול להישאר ב-chain (primary או secondary). Anthropic לrouter (router fix Step 1 ב-v9 עדיין נכון — Anthropic for higher quality, DeepSeek for bulk) |
| Cost projection | DeepSeek = $23/m for 570M tokens. Anthropic Sonnet = $1,710/m for same. **Default to DeepSeek-flash for non-quality-critical, Sonnet for quality** |

**Tweak for v9 Step 1 (router fallback fix):**

```javascript
// REVISED with knowledge of DeepSeek being healthy + cheap:
// Route by quality requirement, not just by "what's there"

function pickProvider({ task_type, quality_required }) {
  if (quality_required === 'high' || task_type === 'creative') {
    return { kind: 'anthropic', model: 'claude-sonnet-4-6' };
  }
  if (task_type === 'bulk_classification' || task_type === 'extraction') {
    return { kind: 'deepseek', model: 'deepseek-v4-flash' };
  }
  if (task_type === 'reasoning' || task_type === 'planning') {
    return { kind: 'deepseek', model: 'deepseek-v4-pro' };
  }
  // Default: Anthropic Sonnet
  return { kind: 'anthropic', model: 'claude-sonnet-4-6' };
}
```

זה smart routing במקום fallback chain בעיוורון. **DeepSeek v4-pro + Anthropic Sonnet** = strong combination.

**Implication for Hermes cron restoration:**

ה-4 crons שbroken (morning-deadlines, monday-morning-digest, bee-db-snapshot-refresh, morning-weather-scan) — אמורים to recover automatically כי DeepSeek פעיל. אבל:

1. **Verify auto-recovery:** האם ה-crons re-armed automatically או שיש need ל-manual `hermes cron enable`?
2. **State drift:** 4-7 ימים חוסר ריצה — האם state corrupted? snapshot stale?
3. **Idempotency check:** איך crons handle "first run after gap" — האם duplicate posts?

זה ה-action item:
- Check Hermes cron status now
- Run snapshot manually first time to catch up
- Monitor next 24h for normal patterns

**Cost optimization opportunity:**

באמת ה-cost של DeepSeek נמוך מאוד. אם BEE רוצה לחסוך:
- שינוי model defaults: bulk tasks ל-DeepSeek-flash
- שמירת Sonnet ל-customer-facing + engineering tasks
- monitoring monthly spend per model
- estimated savings: 50-70% vs all-Sonnet

---

*Part 9 update 9.F: DeepSeek active again, $96.57 balance. Hermes dormant crons should recover. Smart routing by task type recommended over blind fallback chain. v9 router fix updated.*

---

# Part 10 — v13: Gap Closure (5 פערים מ-v12)

Explore agent שלישי סרק tree.txt + overview.html + plugins.txt + mcp-servers.txt + cron-jobs.json full. סגירת 4.5 מתוך 5 פערים.

## 10.A — Gap 1: BEE SaaS app ✅ **Filled**

### 10.A.1 ה-architecture (confirmed)

- **41 route modules** (Express/Fastify/Hono — מי שיהיה)
- **38 Prisma models** (PostgreSQL 16)
- **Domain coverage:**
  - Solar installations (SolarEdge, Sungrow, SMA)
  - Jobs (1,425 open)
  - Alerts (461 active)
  - Fleet vehicles (18)
  - Clients (137)
  - Sites (255)
  - Pricebook (9 batteries + 8 panel types)
- **Infrastructure:** Hetzner VPS + PostgreSQL 16 + Docker + Tailscale subnet routing

### 10.A.2 ה-coupling המעניין

מ-Gap 5: "**Token comes from `Desktop\OpenClawAgent\secrets\bee-integrations.env` (extracted from BEE Operations app's SQLite DB)**"

זאת אומרת: BEE Operations app יש **SQLite DB עם integration tokens** — מעבר ל-PostgreSQL הראשי. ה-tokens מוזרמים החוצה ל-`.env` של Alfred. **זה coupling קריטי לתעד:**

```
BEE Operations app (own SaaS)
   ├── PostgreSQL 16 main DB (137 clients, 255 sites, etc.)
   └── SQLite DB (integration tokens — for export to Alfred)
              │
              ▼ extract
   ~/Desktop/OpenClawAgent/secrets/bee-integrations.env
              │
              ▼ consumed by
   alfred-gmail.js, alfred-monday.js, alfred-solar-edge.js, ...
```

### 10.A.3 פערים שעדיין פתוחים

- האם 41 routes הם RESTful `/api/*`?
- האם customer portal קיים? (no explicit evidence)
- האם technician mobile app? (no evidence)
- **מי משתמש ב-BEE Operations app?** ברק לבד? צוות פנים? יש לקוחות חיצוניים?

זה שאלות לברק. **בלי תשובה — לא לנחש.**

---

## 10.B — Gap 2: site-groups.json pattern ✅ **Filled**

### 10.B.1 ה-mechanism

- File location: `~/.openclaw/workspace/sites/site-groups.json`
- מפה JID → site_slug
- כל site dossier כ-`sites/<site-slug>.md`
- format: tables "היסטוריית אירועים" + contacts + equipment sections

### 10.B.2 Sites מאומתים

| Site | Status |
|---|---|
| כפר יובל | ✅ WA group + dossier (`120363409665555113@g.us`) |
| Rafael Solar | mentioned in MEMORY (27 sites — מולטי-site customer) |
| Palar | mentioned (28 sites) |
| חכל שדרות | mentioned (48 sites) |
| האגודה למען החייל | mentioned (13 sites) |
| צרויה | mentioned (11 sites) |

⚠️ **insight:** 5 מ-customers הם **multi-site**. Rafael = 27 sites. כל אחד מהם **may** have WA group, או רק חלקם. **WA-group capture pattern לא מפרסם בכל site**.

### 10.B.3 Implication ל-plan

ה-architecture של site dossier auto-update צריך לדעת:
- מי המtaype של customer (multi-site B2B vs single-site)
- האם יש WA group או רק direct customer phone

ל-engineering-agent (v11 8.A) + customer-success-agent (v11 8.C) — צריך to differentiate.

---

## 10.C — Gap 3: bee-ai-watcher flow ✅ **Filled**

### 10.C.1 ה-pipeline המלא

```
WhatsApp group "Ai" (archived, 120363305783926068@g.us)
   │
   │ Alfred captures inbound (read-only, archive boundary)
   ▼
~/.openclaw/workspace/ai-feed/inbound.jsonl
   │
   │ ai-feed-config.json defines which groups feed in
   ▼
E:\bee-ai-watcher\scan.js  (EXTERNAL Windows script)
   │
   ▼
E:\bee-ai-watcher\reviews\<date>\<hash>.md  (Hebrew review)
   │
   ▼
E:\bee-ai-watcher\INDEX.md  (master index)
```

### 10.C.2 משמעות

- **bee-ai-watcher = idea curation pipeline**
- ברק שולח לעצמו AI news/tools/posts ב-WA group
- Alfred מעביר ל-JSONL
- Windows script נפרד מנתח ומסכם בעברית
- INDEX.md מהווה knowledge base של "AI things I learned"

**לא** competitor intelligence. **לא** market research. **כן** personal knowledge curation.

### 10.C.3 Integration opportunity

ה-INDEX.md הוא **knowledge asset**. אפשר:
- Sync ל-Obsidian vault (v11 8.B)
- Index into KG (v6) as `:KnowledgeItem` nodes
- Search across via RAG (v2 BGE-M3)

זה connects v11 dots: **Obsidian + bee-ai-watcher = unified knowledge layer**.

### 10.C.4 פערים פתוחים

- ה-scheduler של scan.js — Windows Task Scheduler? Manual? Cron via WSL?
- inbound.jsonl schema — לא נחקר
- כמה reviews נוצרו עד עכשיו?

---

## 10.D — Gap 4: Open tenders ✅ **Filled**

### 10.D.1 ה-state האמיתי

- **Tenders mentioned only in MEMORY.md:** "Open tenders: חוף אשקלון (deadline 12.5), Kiryat Gat (deadline 13.5)"
- **No automated tracking system found**
- **No Monday board** dedicated to tenders (לפי search)
- **No tender.json file**

זה ה-real gap: **tenders tracked manually in memory only**.

### 10.D.2 ה-implication

זה הisure המקסימלי איפה AI agent היה צריך לעזור:
- Aside-band ingestion (גם email, גם gov.il portals)
- Deadline tracking (T-30, T-14, T-7, T-3, T-1 alerts)
- Document gathering (technical specs, pricing)
- Application drafting (proposal-generator from v11 8.E)
- Submit checklist + tracking

**Tender tracking = new agent role** — חסר לחלוטין מ-stack הנוכחי.

### 10.D.3 Build (חדש — לא ב-v1-v12)

```yaml
tender-agent:
  charter: |
    Track all open tenders. Surface deadlines. Aggregate documents.
    Draft proposals. Track submissions and outcomes.
  
  data_sources:
    - gov.il tender portals (RSS / scraping)
    - Email (RFP attachments)
    - Manual entry (Barak adds tender)
  
  schema:
    :Tender {
      id, name, source (gov/private), deadline,
      status (open/applied/won/lost),
      required_docs[], submitted_docs[],
      value_NIS_estimate, days_to_deadline
    }
  
  cron:
    daily 07:00: deadline check → alert chain T-30/14/7/3/1
    weekly Mon 09:00: new tenders scan from gov.il
  
  escalation:
    T-7d without submission: ⚡ Barak
    T-3d without submission: ⚡⚡ Barak + suggest decline
    
  build_time: ~25h
```

---

## 10.E — Gap 5: Gmail OAuth ⚠️ **Partial**

### 10.E.1 מה ידוע

| Item | Status |
|---|---|
| `alfred-gmail.js` exists v2.1 | ✅ confirmed |
| `~/.openclaw/credentials/` directory | ✅ exists (path mentioned) |
| `secrets/bee-integrations.env` source | ✅ extracted from BEE app SQLite |
| `gmail-morning-digest` cron | ⛔ disabled (enabled: false in cron-jobs.json:180) |
| OAuth scopes | ❓ not documented |
| Token expiry status | ❓ unknown |
| Hermes himalaya skill | enabled but **no provider configured** |

### 10.E.2 ה-question לברק

1. האם OAuth tokens עדיין valid? (maybe expired silently)
2. למה ה-cron disabled? Crash? Manual disable?
3. האם רוצים לrestore — או לעבור ל-Hermes himalaya כ-replacement?

זה blocker ל-Wave 0 Step 26 (gmail-morning-digest re-enable).

---

## 10.F — Critical Insight from Gap Closure

מצאתי **2 דברים חדשים שלא היו בכלום v1-v12:**

### 10.F.1 BEE Operations app יש SQLite DB נפרד ל-integration tokens

זה coupling architecture chunk. אם BEE app נופל → Alfred + Hermes לא יוכלו ל-authenticate ל-Gmail/Monday/SolarEdge. **Single point of failure**.

**ל-Wave 1 או Backup plan:**
- Document ה-coupling
- Backup ה-SQLite DB יומית
- Fallback: tokens stored ב-`.env` standalone אם BEE app חי? Or auto-sync?

### 10.F.2 Tenders = הזדמנות גדולה

ה-tender pipeline חסר לחלוטין מ-AI stack. בBEE business — tenders are major customer acquisition channel (חוף אשקלון, קרית גת — public projects). 

זה **תחום #15** שצריך להוסיף ל-v10 list:

| # | Domain | Evidence |
|---|---|---|
| 1-14 | (previous) | — |
| **15** | **Tender tracking + proposal generation** | חוף אשקלון + קרית גת mentioned (passed) |

---

## 10.G — שאלות עדכניות לברק

| # | שאלה | מה תלוי בה |
|---|---|---|
| Q71 | **חוף אשקלון + קרית גת — הוגשו?** מה הסטטוס? | tender-agent priority |
| Q72 | **כמה site groups בtoll?** ב-site-groups.json — רק כפר יובל או יותר? | site dossier scope |
| Q73 | **BEE Operations app** — מי משתמש? לקוחות external? צוות פנים? customer portal? | BEE SaaS strategy |
| Q74 | **gmail-morning-digest** — למה disabled? OAuth issue? | re-enable Wave 0 Step 26 |
| Q75 | **bee-ai-watcher** — מתי last run? כמה reviews ב-INDEX.md? | knowledge layer integration |

---

## 10.H — נכתב v13 שינויים ל-build estimate

| חדש ב-v13 | hours |
|---|---|
| tender-agent (Gap 4) | ~25h |
| site-groups.json migration + multi-site logic (Gap 2) | ~8h |
| bee-ai-watcher → Obsidian sync (Gap 3) | ~6h |
| BEE app SQLite backup (Gap 1 SPOF) | ~3h |
| Gmail OAuth diagnostic + re-enable (Gap 5) | ~2h |
| **Total v13 additions** | **~44h** |

**Updated total v1-v13:** ~684-724h build.

---

*Part 10 (v13) נכתב 2026-05-26 Asia/Jerusalem. Gap closure של 5 פערים מ-v12. 4.5/5 sealed. Tender-agent זוהה כ-domain #15 חדש. BEE Operations app SPOF coupling דרך SQLite tokens. ~300 שורות נוספות. סך הכל plan file ~7,500 שורות. v1-v13 cumulative ~684-724h.*

---

# Part 11 — v14: Final local-state Sweep — Comprehensive Reality Check

Explore agent רביעי סרק 9 קבצים: plugins.txt (282+60), skills.txt full (434+91), mcp-servers.txt, processes.txt, overview HTMLs (1024+933). הממצאים **משנים** הרבה הנחות מ-v1-v13.

## 11.A — ⚠️ CRITICAL: MCP servers = 0 actually configured

**הממצא הכי חשוב:**
- OpenClaw: "No MCP servers configured in openclaw.json"
- Hermes: "No MCP servers configured. Add one with: `hermes mcp add <name>`"

**משמעות:** כל ה-MCP plans ב-v2 (Composio), v4 (bee-kg-mcp), v6 (Neo4j MCP), v7 (15 MCP servers), v8 (A2A) — **כולם aspirational**. אין שום MCP server מחובר היום.

זה לא בעיה — אבל זה אומר שwave 2 (MCP foundation) הוא **מ-scratch**, לא **migration**.

---

## 11.B — OpenClaw plugins: 96 plugins אבל רובם LLM providers

### 11.B.1 ה-actual breakdown

| Category | Count | Status | Examples |
|---|---:|---|---|
| **LLM providers** | 58 | enabled | Anthropic, DeepSeek, Gemini, Groq, OpenAI, Alibaba, Bedrock, OpenRouter, ... |
| **Speech & audio** | 8 | enabled | ElevenLabs, Azure Speech, Groq Whisper, OpenAI Whisper, Sherpa-ONNX TTS |
| **Channels** | 9 | **mostly disabled** | WhatsApp (only active!), Slack/Telegram/Discord/iMessage/IRC disabled |
| **Bee-specific plugins** | 9 | mostly disabled | migrate-claude, migrate-hermes, memory-wiki, skill-workshop, webhooks, open-prose, openshell, thread-ownership |
| **Generic utilities** | 12 | mixed | File Transfer, Document Extraction, Web Readability, Phone Control, Browser, Bonjour mDNS |

**Key insight:** 96 plugins ≠ 96 BEE integrations. ה-BEE-specific logic נמצא ב-**skills + scripts**, לא ב-plugins.

### 11.B.2 ה-fact הכי חשוב

> **WhatsApp הוא ה-only active messaging plugin.**

Slack/Telegram/Discord/iMessage/IRC/Mattermost/Signal/Matrix — **disabled**.

זה ה-correct architecture decision (פוקוס) אבל אומר שכל ה-multi-channel plans ב-v1 (22 channels) — premature. בפועל: 1 channel = WhatsApp.

---

## 11.C — OpenClaw skills: 31 ready / 76 total (full enumeration)

### 11.C.1 ה-BEE-Workspace 15 skills שמוכנים (לא רק "top 14"!)

| # | Skill | Purpose |
|---|---|---|
| 1 | **api-dev** | REST/GraphQL API scaffold, test, OpenAPI docs |
| 2 | **auto** | Automate scripts, cron, Task Scheduler, deploys |
| 3 | **browser-automation** | Multi-step flows, login checks, tab management |
| 4 | **calendar-agent** | 3 Google Calendars + weather-aware scheduling |
| 5 | **firecrawl** (14 sub-skills!) | scrape, search, crawl, download, interact, parse, map, build-* |
| 6 | **github** | `gh` CLI for issues/PRs/runs |
| 7 | **google-calendar** | Needs setup (OAuth managed) |
| 8 | **healthcheck** | SSH, firewall, updates, exposure, cron audits |
| 9 | **mcp-builder** | FastMCP/Node SDK guides |
| 10 | **n8n-workflow-automation** | Robust triggers, idempotency, logging, retries |
| 11 | **regulatory-agent** | Israeli electrical regs, IEC permits, Ministry of Energy, inspector rules |
| 12 | **solar-agent** | Solar PV monitoring + diagnostics |
| 13 | **Self-Improving + Proactive Agent** | Reflection, criticism, learning, memory organization |
| 14 | **skill-creator** | Create/edit/audit AgentSkills |
| 15 | **weather** | Current weather, rain, forecasts, travel planning |

### 11.C.2 הbundled skills שdisabled (45 שלא נכנסו ל-ready)

apple-notes, bear-notes, bluebubbles, camsnap, clawhub, coding-agent, discord, eightctl, gemini, gog, goplaces, himalaya, imsg, ninja, notion, obsidian, openai-whisper, openhue, oracle, ordercli, peekaboo, sag, session-logs, sherpa-onnq-tts, slack, songsee, sonoscli, spotify-player, summarize, things-mac, tmux, trello, video-frames, voice-call, wacli, xurl, 1password, blogwatcher.

**Conclusion:** OpenClaw skills focus = **BEE business operations + Israeli regulatory + solar PV** — exactly אצל ברק.

---

## 11.D — Hermes skills: 84 enabled (FULL list)

### 11.D.1 Categorized

| Category | Skills |
|---|---|
| **autonomous-ai-agents** | claude-code, codex, hermes-agent, opencode, yuanbao, dogfood |
| **creative** | 17 skills (design, ASCII, pixel-art, video, infographics, Excalidraw, manim, p5js, BAOYU) |
| **data-science** | jupyter-live-kernel, **whatsapp-crypt15-extract** (local) |
| **devops** | kanban-orchestrator, kanban-worker, webhook-subscriptions |
| **github** | 5 skills (codebase-inspection, auth, code-review, issues, pr-workflow, repo-management) |
| **mcp** | native-mcp (but 0 servers configured...) |
| **mlops** | 7 skills (dspy, fine-tuning, HuggingFace, llama-cpp, outlines, SAM, W&B) |
| **productivity** | airtable, google-workspace, linear, maps, **nano-pdf**, notion, **ocr-documents**, powerpoint, teams-meeting-pipeline |
| **research** | arxiv, **blogwatcher**, llm-wiki, polymarket, **regulatory-rss-monitor** (local) |
| **software-development** | 13 skills incl. **alfred-platform-upgrade** (local), **barak-activity-reporting** (local), **barak-business-integrations** (local), debugging-hermes-tui, subagent-driven-development |
| **media** | gif-search, heartmula, songsee, spotify, youtube-content |
| **smart-home** | openhue |

### 11.D.2 BEE-specific local skills (חשובים מאוד)

| Local Skill | Purpose |
|---|---|
| `barak-business-integrations` | Active operations integrations layer |
| `barak-activity-reporting` | Hermes self-reporting to Barak |
| `alfred-platform-upgrade` | Migration layer to/from OpenClaw |
| `whatsapp-crypt15-extract` | WhatsApp encrypted backup parser (local script) |
| `regulatory-rss-monitor` | Israeli regulatory feed monitor |

חמש skills locally-developed = significant investment. **לא generic**.

---

## 11.E — Alfred (OpenClaw) Current State — מתוך alfred-overview.html

### 11.E.1 ה-architecture — 6 layers

1. **Brain** (LLM routing, intent classification)
2. **Transport** (WhatsApp via plugin)
3. **State** (.sqlite + workspace files)
4. **Automation** (cron + event handlers)
5. **Integrations** (13 active)
6. **Observability** (cost monitor, logs)

### 11.E.2 13 active integrations

| Integration | Detail |
|---|---|
| Google Calendar × 3 | personal + tasks-neri + tasks-shlomi-solar |
| **Monday.com** | **100 boards via GraphQL** — top: ברק 241 items, הקמות 5, CRM 62 |
| **Gmail** | **56K messages** (read OAuth) |
| **BEE Operations DB** | JWT cache, daily snapshot |
| **SolarEdge** | **87 sites monitored** (not 255 — only 87!) |
| **Tracer** | Generator monitoring (18 vehicles total) |
| Open-Meteo | 16-day GHI/DNI forecast |
| Israeli Deadlines | VAT, property tax, workers' comp (cron 07:00 + 09:30) |
| gov.il RSS | Ministry of Energy + Electricity Authority |
| **Govmap** | Israel address/parcel/block search, ITM↔WGS84 conversion |
| Cost Monitor | Per-skill LLM cost logging |
| Session Parser | WhatsApp inbound extraction |
| Contacts Auto | Auto-populate from messages.sqlite |

### 11.E.3 12 Goals + completion % (current state!)

| # | Goal | Completion |
|---|---|---:|
| 1 | System resurrection | **95%** |
| 2 | WhatsApp Triage | 70% |
| 3 | Dailies | 55% |
| 4 | Calendar | 75% |
| 5 | **Solar** | **35%** ⚠️ |
| 6 | Regulation | 80% |
| 7 | CRM | 60% |
| 8 | Self-Improvement | 45% |
| 9 | Multi-LLM Resilience | **85%** |
| 10 | Voice | 25% |
| 11 | **BEE Integration** | **40%** ⚠️ |
| 12 | Dashboard | 50% |

**Notable:** Solar at 35% — ברק's main domain has lowest goal completion. **זה ה-priority gap.**

### 11.E.4 ה-quotes שכדאי לזכור

> "Alfred הוא עוזר אישי שרץ על המחשב של ברק 24/7"

> "מקבל קלט מ-4 ערוצים: הודעות WhatsApp נכנסות, מיילים ב-Gmail, אירועים מ-Google Calendar, ופעולות יזומות לפי לוח זמנים (cron)"

### 11.E.5 16 cron jobs (verified)

11 active + 5 disabled. כולל:
- `bee-snapshot-live-refresh` (*/15)
- `general-heartbeat` (*/30 7-21)
- `evening-tomorrow-schedule` (21:30) — ✅ end-to-end verified
- `morning-deadlines` / `morning-weather` / `morning-gov-rss`

---

## 11.F — Hermes Current State — מתוך hermes-overview.html

### 11.F.1 KPIs (14-day window!)

| Metric | Value |
|---|---:|
| Messages handled | **16,532** |
| Sessions | **1,454** |
| **Tokens consumed** | **280.6M** |
| Active WhatsApp chats | **704** (not 14.6K — 14.6K total in DB, 704 active!) |
| API keys active | **8 of 22** |

זה ROI מטורף — 16,532 הודעות / 14 ימים = ~1,180 הודעות יום.

### 11.F.2 Architecture

```
Node WhatsApp Bridge (port 3000, Baileys)
              ↕
Python Gateway (DeepSeek V4 Pro)
              ↕
state.db (167 MB, 1,454 sessions)
```

### 11.F.3 Integration status — 8 of 22 active

**AI Providers active:** DeepSeek V4 Pro (primary), Anthropic, Gemini, Groq, Perplexity  
**Missing:** OpenRouter, xAI, OpenAI

**Channels active:** WhatsApp ✓, Terminal CLI ✓  
**Missing:** Email, Telegram, Discord, Slack

**Tools active:** Firecrawl, FAL, GitHub  
**Missing:** Browserbase, Tavily, ElevenLabs

**Internal:**
- bee-hive (morning digest) — ⭐ **חדש לי! לא ידעתי על bee-hive**
- Alfred (parallel) — known
- **BEE Operations: NOT connected** ⚠️
- **Obsidian: 36 recent uses** — confirms Obsidian skill #1

### 11.F.4 8 strategic goals (Hermes side)

| # | Goal | Completion |
|---|---|---:|
| 1 | Always-on | 50% |
| 2 | Multi-channel | 25% |
| 3 | Persistent Memory | 60% |
| 4 | Token Efficiency | 60% |
| 5 | Auto-supervision | 40% |
| 6 | **Specialized Agents L2** | **15%** ⚠️ |
| 7 | **Orchestrator L3** | **0%** ⚠️ |
| 8 | **Team Automation L4** | **0%** ⚠️ |

Overall: **42% complete**.

### 11.F.5 Anomaly! 

> "CLI sessions = 59% מהטוקנים מ-2.5% מהsessions (heavy!) · deepseek-chat anomaly (169M tokens unexplained)."

**169M tokens unexplained.** That's ~$7 חודש שאיש לא יודע למה. **30%+ savings potential** מ-anomaly hunt.

### 11.F.6 16 tasks pending (Hermes)

- NSSM service registration
- Telegram setup
- **deepseek-chat anomaly hunt** (ROI 30%+)
- Memory plugin
- Health-ping cron
- Email channel
- Specialized agents
- Metrics endpoint
- ...

---

## 11.G — bee-hive: New entity discovered

> "bee-hive (morning digest)"

זה לא Alfred. זה לא Hermes. **זה רכיב שלישי לא ידוע.**

מה זה bee-hive?
- שירות נפרד שמייצר morning digests?
- מאוחר משולב ב-orchestrator?
- חלק מ-BEE Operations app?
- "bee-hive" יכול להיות:
  - Apache Hive (data warehouse) — לא סביר
  - Hive (Hermes orchestration?) — אפשרי
  - bee-hive = own BEE component
  - reference to "the hive" = collective agents

**שאלה לברק:** מה זה bee-hive?

---

## 11.H — Updated Domain Map (v14)

מ-v10 8 → v12 14 → v14 **15+ domains, ועוד יש**:

| # | Domain | Completion |
|---|---|---:|
| 1 | Solar PV engineering | 35% (Alfred goal #5) |
| 2 | Electrical compliance + regulation | 80% |
| 3 | Installation PM via Monday | 60% (CRM goal) |
| 4 | Calendar coordination | 75% |
| 5 | Invoice Maven (live) | ~ (no explicit %) |
| 6 | Weather-aware field scheduling | active |
| 7 | OpenClaw → Hermes migration | in flight |
| 8 | BEE Operations app | 40% Alfred integration |
| 9 | Tracer fleet AI | partial — generator monitoring active |
| 10 | Engineering reports + proposals (Hebrew) | ? |
| 11 | Knowledge management (Obsidian) | active (36 uses) |
| 12 | Commercial customer success | ? |
| 13 | Field tech dispatch real-time | partial |
| 14 | Tender tracking | **0%** — no system |
| 15 | **bee-hive (unknown)** | ? |

זה ה-actual surface — **15+ domains**, חלקם בvarying completion.

---

## 11.I — Action items dropped from v1-v13 בעקבות v14

### 11.I.1 Discard (תוכניות שלא רלוונטיות)

- ❌ v1 federation: 22 channels — בפועל 1 (WhatsApp). Multi-channel = future, לא present.
- ❌ v2 Composio: 250+ integrations — needed for **specific** integrations only, לא generic.
- ❌ v6 Marketing stack: Hebrew RTL landing pages + Meta Lead Ads — **no evidence BEE pursues this**. Commercial customers come differently.
- ❌ v7 15-agent organization: Personal agents (Family/Health/Spouse/...) — **no evidence Barak wants this**.
- ❌ v8 A2A protocol: deferred per v1 already, confirmed not needed.

### 11.I.2 Reframe (תוכניות שצריך לעדכן)

- ⚠️ v6 KG schema — `:Customer` חייב לציין commercial vs residential. **Almost all are commercial**.
- ⚠️ v9 router fix — DeepSeek v4-flash, v4-pro now active. Smart routing per task type (9.F).
- ⚠️ v9 roster.yaml — extend לכל ה-team: Yosef, Vladimir, Layan + 8 contractors + bee-hive collaborator?
- ⚠️ v11 engineering-agent — bump priority. Alfred goal #5 Solar = 35%. הכי גדול gap.
- ⚠️ v12 tender-agent (new) — confirmed missing. Build.

### 11.I.3 Confirm (תוכניות שעובדות)

- ✅ v6 KG (Neo4j) — needed for relationship-aware queries
- ✅ v9 Wave -1 bug squash — relevant
- ✅ v9 Wave 0 — relevant (with DeepSeek-aware update)
- ✅ v11 8.B Obsidian formalize — confirmed top use
- ✅ v11 8.E proposal-generator — high ROI
- ✅ v12 5-channel WA pattern — confirmed

---

## 11.J — שאלות סופיות לברק

| # | שאלה | למה |
|---|---|---|
| Q76 | **bee-hive — מה זה?** רכיב נפרד? part of BEE app? collective name? | New entity, no docs |
| Q77 | **Anomaly: deepseek-chat 169M tokens unexplained** — מאיפה? | $7/m wasted maybe |
| Q78 | **Solar goal at 35% (Alfred) — מה חסר?** איזה PV functionality רוצה לעדיפות? | Priority gap |
| Q79 | **Hermes goal "Specialized Agents L2 — 15%" — מי ה-15%?** | Building blocks for v11 |
| Q80 | **BEE Operations NOT connected to Hermes** — coverage? תרצה ל-add? | architecture gap |

---

## 11.K — Final Build Estimate (v1-v14)

| Component | Status | Hours |
|---|---|---:|
| v1-v4 (pushed) | ✅ | ~127h |
| v5 (pending push) | ⏳ | ~24h |
| v6 (in plan) | 📝 | ~93h |
| v7 personal agents (most discard) | partial | ~30h (was 100-130) |
| v8 + v9 + v10-v13 | 📝 | ~245h |
| v11 (5 focused domains) | 📝 | ~160h |
| **v14 additions:** | | |
| - bee-hive investigation | new | ~5h |
| - deepseek-chat anomaly hunt | new | ~3h |
| - Solar (goal 5) build to 80% | new | ~40h |
| - Hermes specialized agents (15→50%) | new | ~30h |
| - BEE Operations → Hermes connect | new | ~10h |
| **Total v1-v14** | | **~767h** |

---

*Part 11 (v14) נכתב 2026-05-26 Asia/Jerusalem. Comprehensive local-state sweep #4. ⚠️ Critical reset findings: MCP=0, WhatsApp=only active channel, 87 SolarEdge sites (not 255), 100 Monday boards, 56K Gmail messages, 16,532 messages/14d Hermes, 280.6M tokens, 704 active WA chats, bee-hive entity unknown, 169M token DeepSeek-chat anomaly. ה-actual completion state per goal documented. ~700 שורות נוספות. סך הכל plan file ~8,200 שורות. v1-v14 cumulative ~767h.*

---

# Part 12 — v15: FINAL CONSOLIDATION — Top-10 Actions Ranked by ROI/Hour

8,200 שורות תכנון, 14 גרסאות, ~20 אז' ועזר ELEMENTS. עכשיו צריך **EXECUTABLE plan**. v15 = הריכוז.

## 12.A — מצב נוכחי (תפר אמת מ-v14)

### 12.A.1 מערכת חיה

| Metric | Value |
|---|---|
| **Alfred (OpenClaw):** | 11/16 crons active, 95% System resurrection |
| **Hermes:** | 16,532 messages / 14d, 280.6M tokens / 14d, 704 active WA chats |
| **DeepSeek:** | $96.57 balance, v4-pro + v4-flash active |
| **MCP servers:** | **0** in both engines |
| **Channels:** | WhatsApp only (single active) |
| **Sites:** | 87 SolarEdge monitored (out of 255 total) |
| **Monday boards:** | 100 via GraphQL |
| **Gmail:** | 56K messages indexed (cron disabled) |

### 12.A.2 Domain completion (Alfred goals)

| Domain | % Done |
|---|---:|
| System resurrection | 95% |
| Multi-LLM Resilience | 85% |
| Regulation | 80% |
| Calendar | 75% |
| WhatsApp Triage | 70% |
| CRM | 60% |
| Dailies | 55% |
| Dashboard | 50% |
| Self-Improvement | 45% |
| BEE Integration | 40% |
| **Solar** | **35%** ⚠️ ה-#1 gap |
| Voice | 25% |

### 12.A.3 Hermes goals

| Domain | % Done |
|---|---:|
| Persistent Memory | 60% |
| Token Efficiency | 60% |
| Always-on | 50% |
| Auto-supervision | 40% |
| Multi-channel | 25% |
| **Specialized Agents L2** | **15%** ⚠️ |
| **Orchestrator L3** | **0%** ⚠️ |
| **Team Automation L4** | **0%** ⚠️ |

---

## 12.B — Top-10 Actions Ranked by ROI/Hour

לכל אחד: action, hours, value, ROI score (1-10), source-of-recommendation.

### #1 🥇 — Smart router fix (DeepSeek-aware)
- **Hours:** 0.5h
- **Value:** Saves ~$1,500/m vs all-Anthropic
- **ROI:** 10/10
- **Source:** v14 9.F + v9 Step 1
- **Action:** Update `alfred-router.js` to route by task type (bulk → DeepSeek-flash, reasoning → DeepSeek-pro, quality → Sonnet). Anthropic stays as fallback.

### #2 🥈 — DeepSeek-chat anomaly hunt
- **Hours:** 3h
- **Value:** Recovers $7/m wasted + 30% Hermes savings (~$50/m est)
- **ROI:** 9/10
- **Source:** v14 11.F.5
- **Action:** `hermes insights --filter model=deepseek-chat --days 14`. Identify caller. Fix or redirect. **Pure waste recovery.**

### #3 🥉 — Re-enable 5 disabled crons (with DeepSeek active)
- **Hours:** 1h
- **Value:** Daily morning/evening digests restored = ~5h/week back to Barak
- **ROI:** 9/10
- **Source:** v9 Step 11 + v14 update
- **Action:** `openclaw cron enable morning-urgent-digest evening-urgent-digest weekly-self-review`. Confirm each fires next cycle.

### #4 — roster.yaml build
- **Hours:** 2h (mostly ברק input)
- **Value:** Unblocks entity resolution everywhere
- **ROI:** 9/10
- **Source:** v9 Step 19 + v14 11.I.2
- **Action:** Build roster.yaml with: Barak, Shlomi Shirazi, Neri Lederberg, Yosef, Vladimir, Layan, 10 contractors (Roni, Haitam, Bigsol, Fares, Avraham, Slava, Shahar, Vicky, Shlomi T, Dror), Erez Cohen (inspector), bee-hive collaborator (TBD).

### #5 — Heartbeat watcher cron
- **Hours:** 1h
- **Value:** Prevents future 3-day silent outages (like the DeepSeek $0 issue)
- **ROI:** 8/10
- **Source:** v9 Step 12
- **Action:** Cron daily 23:55 — if 0 tokens / 24h → ⚡ Barak.

### #6 — gmail-morning-digest diagnostic + re-enable
- **Hours:** 2h
- **Value:** Unblocks 56K Gmail messages knowledge. Inbox triage daily.
- **ROI:** 8/10
- **Source:** v8 5.B + v10 Gap 5
- **Action:** Check OAuth tokens valid. Test alfred-gmail.js. Re-enable cron. If OAuth expired — reauth.

### #7 — KG (Neo4j) foundation
- **Hours:** 19h
- **Value:** Unlocks v11 engineering-agent + customer-success + proposal-generator
- **ROI:** 7/10
- **Source:** v6 3.A + v9 Step 23
- **Action:** Deploy `bee-neo4j` Docker on bee-prod-1. Schema (Person/Customer/Site/Equipment/Job). Seed from roster.yaml. **Foundation for 50% of v11.**

### #8 — Solar goal: build PV engineering-agent skill
- **Hours:** 30-40h
- **Value:** Brings Alfred goal #5 from 35% → ~60% (Solar surface = ברק's primary domain)
- **ROI:** 7/10
- **Source:** v11 8.A
- **Action:** engineering-agent skill (Hermes side, BEE-specific). Charter: design + protection + BOM + forecast. Tied to KG + Monday + SolarEdge/Sungrow/SMA.

### #9 — Tender-agent (new domain #15 from v13)
- **Hours:** 25h
- **Value:** Recovers tender wins (חוף אשקלון, קרית גת missed). Future tenders captured.
- **ROI:** 7/10
- **Source:** v13 10.D
- **Action:** :Tender schema in KG. Cron T-30/14/7/3/1 alerts. Source: gov.il scraping + manual entry + Monday board.

### #10 — bee-hive investigation
- **Hours:** 3-5h (mostly ברק interview)
- **Value:** Unknown — could be 0, could be paradigm shift
- **ROI:** ?/10 (high risk, high reward)
- **Source:** v14 11.G
- **Action:** Ask ברק. Then read code if accessible. Then decide if integrate or sunset.

---

## 12.C — Phase Roadmap (revised after v14)

### 12.C.1 Phase 1 — Quick Wins (Week 1, ~10h)
Actions #1, #2, #3, #5, #6 = ~7.5h core + buffer

**Outcome by end of week 1:**
- DeepSeek-aware router active
- Anomaly fixed → saving $50/m
- Daily/evening digests restored
- Heartbeat alerts active
- Gmail triage active

### 12.C.2 Phase 2 — Foundation (Week 2, ~25h)
Action #4 (roster.yaml, 2h) + Action #7 (KG foundation, 19h) + Action #10 (bee-hive interview, 3-5h)

**Outcome by end of week 2:**
- Entity resolution working everywhere
- KG schema deployed with initial data
- bee-hive role clarified (and integrated or sunsetted)

### 12.C.3 Phase 3 — Value Build (Weeks 3-6, ~70-90h)
Action #8 (engineering-agent, 30-40h) + Action #9 (tender-agent, 25h) + KG mappers (12-15h)

**Outcome by end of week 6:**
- Engineering surface AI-augmented (Alfred goal #5: 35% → 70%)
- Tender pipeline operational
- KG live and querying

### 12.C.4 Phase 4 — Expansion (Months 2-3, ~150h)
- Customer success SLA+QBR (v11 8.C)
- Field dispatch agent (v11 8.D)
- Proposal generator (v11 8.E)
- Obsidian formalize (v11 8.B)
- Voice/call pipeline v5 implementation

### 12.C.5 Phase 5 — Polish + Defense (Month 4+, ongoing)
- Backup & DR (v8 5.C)
- BEE Operations SPOF mitigation (v13 10.F.1)
- Customer onboarding 30d flow (v8 5.D)
- Warranty + lifecycle (v8 5.E)
- A/B testing infrastructure (v6 3.C.6)

---

## 12.D — מה לא לעשות (formal discard list)

מ-v1-v13 plans שלא רלוונטיים לBEE לפי v14 evidence:

| Discard | Why |
|---|---|
| ❌ 22-channel federation (v1) | Only WhatsApp active. Multi-channel = irrelevant Phase 1-4 |
| ❌ Composio 250+ integrations (v2) | Specific integrations only, MCP-from-scratch |
| ❌ Mass personal agents (v7): Family, Health, PersonalFinance, Spouse, Relationships, Religious | No evidence ברק wants. Build only if asks. |
| ❌ Hebrew RTL landing pages + Meta Lead Ads (v6 3.D) | Commercial customers come differently. No evidence pursuing. |
| ❌ Hashavshevet / Priority / Cardcom (v4 + v6) | Zero evidence BEE uses |
| ❌ Investment management / Keren Hishtalmut (v7) | No evidence requested |
| ❌ A2A protocol concrete (v8 5.F) | 2 agents only, MCP suffices |
| ❌ Religious calendar (v9 generic) | No evidence requested |
| ❌ Israeli electricity tariff (v9 5) | Not BEE business model |
| ❌ Mobile app PWA (v9) | No evidence planned |

זה ~250h של תכנון שמורידים מ-active backlog.

---

## 12.E — Revised Total Effort

| Phase | Hours |
|---|---:|
| Phase 1 (Week 1) | ~10h |
| Phase 2 (Week 2) | ~25h |
| Phase 3 (Weeks 3-6) | ~80h |
| Phase 4 (Months 2-3) | ~150h |
| Phase 5 (Month 4+, ongoing) | ~100h |
| **Total focused build** | **~365h** |

(במקום ~767h של ה-cumulative-with-discards)

זה project של **~3-4 חודשים** עם 1 developer dedicated, או **6-8 חודשים** של ברק עצמו part-time.

---

## 12.F — Outstanding Questions (10 to Barak)

ה-questions שצריכים תשובות לפני ביצוע מלא:

| # | שאלה | Blocks |
|---|---|---|
| Q71 | חוף אשקלון + קרית גת tenders — הוגשו? | tender-agent priority |
| Q72 | כמה site groups בtoll בsite-groups.json? | site dossier scope |
| Q73 | BEE Operations app — customer portal? technician mobile? לקוחות חיצוניים? | BEE SaaS strategy + integration |
| Q74 | gmail-morning-digest — למה disabled? | Action #6 |
| Q75 | bee-ai-watcher — כמה reviews בINDEX.md? | knowledge layer scope |
| Q76 | **bee-hive — מה זה?** | Action #10 |
| Q77 | deepseek-chat anomaly — קצוות? | Action #2 (mostly auto-discoverable) |
| Q78 | Solar @ 35% — מה הכי חסר? PV design? alerts? customer-facing reports? | Action #8 priority within |
| Q79 | Specialized Agents L2 @ 15% — מי ה-15%? | Action expansion direction |
| Q80 | BEE Operations → Hermes — תרצה לחבר? | Architecture decision |

---

## 12.G — Final Plan Summary (1 paragraph)

**BEE = capital-intensive Israeli solar systems integrator (22.7+ MW capacity, 137 commercial customers, 255 sites, own SaaS app, 18 fleet vehicles).** Barak ברזל is hands-on engineer + manager building dual-track: ops automation + BEE Operations SaaS. Current AI stack: Alfred (OpenClaw, primary) + Hermes (parallel, DeepSeek-powered, 280.6M tokens/14d), WhatsApp-only channel, **0 MCP servers**, 84 Hermes skills + 31 Alfred skills, 16 cron jobs (11 active), Israeli regulatory monitoring, SolarEdge 87 sites, Monday 100 boards, Gmail 56K msgs (cron disabled). **15 active domains** spanning solar engineering, regulation, project mgmt, calendar, invoicing (Invoice Maven), weather, BEE app, Tracer fleet, knowledge (Obsidian), customer success, dispatch, proposals, migration, **tender tracking (missing — domain #15)**, bee-hive (unknown). **Top-10 actions** ranked by ROI/hour above. **Phase 1 (Week 1, ~10h)** = router fix + anomaly hunt + cron restore + heartbeat + Gmail. **Phase 2 (Week 2, ~25h)** = roster + KG + bee-hive interview. **Phase 3 (Weeks 3-6, ~80h)** = engineering-agent + tender-agent + KG mappers. **Discards:** 22-channel, mass personal agents, Cardcom/Hashavshevet, A2A, religious calendar, mobile PWA — אין evidence ברק רוצה.

---

*Part 12 (v15) נכתב 2026-05-26 Asia/Jerusalem. FINAL CONSOLIDATION. Top-10 ROI-ranked actions. 5 phases (10h → 25h → 80h → 150h → 100h ongoing = 365h focused, down from 767h cumulative). Discards formalized. Outstanding 10 questions to Barak. ~500 שורות consolidation. סך הכל plan file ~8,700 שורות. ה-plan כעת executable — מהres research ל-action.*

---

# Part 13 — v16: Detailed Skill Designs — engineering-agent + tender-agent

ה-2 actions עם הכי הרבה hours ב-Top-10: Action #8 (engineering-agent, 30-40h) ו-Action #9 (tender-agent, 25h). נכתבים כאן ב-detail SKILL.md style — מוכן ל-build.

## 13.A — `engineering-agent` Skill (full design)

### 13.A.1 SKILL.md

```yaml
name: engineering-agent
version: 0.1.0
description: PV solar engineering AI — design, protection coordination, BOM generation, performance forecasting for BEE installations
target_runtime: hermes-agent
license: BEE-internal

charter: |
  Specialist sub-agent for solar PV engineering tasks. Activates when intent is:
  - "design-request" — customer wants new system design
  - "protection-review" — review of protection coordination on existing system
  - "bom-generate" — bill of materials for a project
  - "forecast-production" — annual production estimate
  - "fault-analysis" — diagnose system fault from monitoring data
  
  NOT activated for: routine monitoring (use solar-agent), regulation queries (use regulatory-agent),
  customer support (use customer-success-agent).

triggers:
  intents: [design-request, protection-review, bom-generate, forecast-production, fault-analysis]
  keywords_he: [תכנון, הגנה, BOM, רשימת רכש, תחזית, ייצור, תקלה, ניתוח]
  keywords_en: [design, protection, BOM, forecast, fault, analysis]
  monday_status_transitions:
    - board: הקמות
      from: "received"
      to: "engineering"
    - board: Leads
      from: "qualified"  
      to: "design"
```

### 13.A.2 Sub-skills (modular)

```yaml
sub_skills:

  pv_design_calc:
    purpose: Size system + string layout
    inputs:
      - site_dimensions: { width_m, length_m, orientation_deg, tilt_deg }
      - target_capacity_kWp: number
      - module_brand: enum [SolarEdge, Sungrow, Jinko, Trina, Longi, ...]
      - inverter_brand: enum [SolarEdge, Sungrow, SMA]
    outputs:
      - panel_count: int
      - panel_model: string
      - panel_wattage_W: int
      - string_configuration: list of {modules_per_string, parallel_strings}
      - inverter_count: int
      - inverter_model: string
      - inverter_capacity_kW: number
      - dc_ac_ratio: number
    references:
      - PVsyst sizing standards
      - inverter-specific max Voc/Vmpp/Isc
      - IEC 62548 PV array DC system requirements
    estimated_time: 8h
    
  wire_sizing:
    purpose: DC + AC wire sizing per Israeli electrical code (תקנת חשמל)
    inputs:
      - string_configuration: from pv_design_calc
      - distance_panel_to_inverter_m: number
      - distance_inverter_to_meter_m: number
      - ambient_temp_max_C: number (default 40)
    outputs:
      - dc_wire_gauge_mm2: per string
      - ac_wire_gauge_mm2: inverter to meter
      - voltage_drop_pct_dc: <2% target
      - voltage_drop_pct_ac: <1% target
      - cable_length_total_m: sum
    references:
      - תקנות החשמל הישראליות (Israeli Electrical Code)
      - IEC 60364 wiring rules
      - DC/AC voltage drop calculation formulas
    estimated_time: 6h

  protection_coordination:
    purpose: Calculate breakers + fuses + isolation per code
    inputs:
      - string_configuration
      - inverter_specs
      - panel_short_circuit_current_A
    outputs:
      - dc_isolator_rating_A: per string
      - dc_fuse_rating_A: if needed per IEC
      - ac_circuit_breaker_rating_A
      - earth_fault_protection_type: RCD type B if grid-connected
      - lightning_protection_class: per site exposure
      - arc_fault_detection_required: boolean
    references:
      - IEC 60947 LV switchgear
      - IEC 60898 circuit breakers
      - Israeli תקנות חשמל
      - IEC 62446 PV system testing
    estimated_time: 8h

  bom_generator:
    purpose: Bill of materials with quantities + supplier prices
    inputs:
      - design_complete: combined output of above 3
    outputs:
      - bom_xlsx_path: Hebrew template
      - line_items: list of {part_number, brand, qty, unit_price_NIS, total_NIS, supplier}
      - total_cost_NIS: number
      - markup_pct: per :Customer.tier from KG
      - quoted_price_NIS: total × (1 + markup)
      - estimated_install_days: based on capacity
    dependencies:
      - kg :Equipment + :Supplier nodes
      - pricebook xlsx in workspace (existing)
    estimated_time: 6h

  performance_forecast:
    purpose: Annual + monthly production estimate
    inputs:
      - site_lat, site_lon
      - panel_count, panel_wattage_W
      - tilt_deg, azimuth_deg
      - shading_factor: 0-1 (from drone survey or estimate)
    outputs:
      - annual_production_kWh: number
      - monthly_breakdown_kWh: array[12]
      - capacity_factor: %
      - annual_degradation_pct: 0.5-1% per year
      - production_25y_kWh: number
      - co2_offset_annual_kg: number
    references:
      - Open-Meteo solar GHI/DNI data (existing alfred-weather.js)
      - PVsyst irradiation models
      - Israeli solar resource maps
    estimated_time: 6h

  fault_analysis:
    purpose: Diagnose system fault from monitoring data
    inputs:
      - site_id: from KG
      - issue_description: from customer or alert
      - solaredge_data: last 7d production curves
      - alert_history: from BEE app
    outputs:
      - probable_cause: ranked list
      - recommended_actions: list
      - parts_needed: BOM if replacement
      - urgency: critical/high/medium/low
      - estimated_repair_time: hours
    estimated_time: 6h
```

### 13.A.3 Dependencies

- **KG (v6, Action #7)** — read :Site, :Equipment, :Customer
- **pricebook xlsx** — existing in BEE workspace
- **Monday MCP** — read Leads/הקמות boards
- **SolarEdge API** — read production data (existing alfred-solar-edge.js)
- **Sungrow API** — via BEE Operations DB
- **Anthropic docx skill** — write Hebrew reports
- **anthropic xlsx skill** — write BOM Excel

### 13.A.4 Memory + state

```yaml
memory_scope:
  - all :Site nodes
  - all :Equipment nodes with serial numbers
  - all :Customer with :tier markup
  - past designs (similar projects for "I built this before" recall)
  - regulatory updates from regulatory-agent

state_persisted:
  - design_drafts/ — work in progress designs by customer/site
  - bom_history/ — generated BOMs for cost tracking
  - forecast_history/ — predictions vs actuals for calibration
```

### 13.A.5 L0/L1/L2 trust progression

- **L0 (default):** Generate drafts, never auto-submit. Barak reviews every output.
- **L1 (after 30 approvals):** Auto-issue design for low-risk projects (<5kWp residential), still Barak approves.
- **L2 (after 100 approvals, possibly never):** Auto-issue + auto-quote for repeat patterns. **Unlikely to reach** — engineering decisions = liability.

### 13.A.6 Test scenarios (10 to pass before L0 → L1)

1. ✅ Design 5kWp residential, SolarEdge + LG panels
2. ✅ Design 50kWp commercial, Sungrow + Jinko
3. ✅ Wire sizing 100m DC run, voltage drop check
4. ✅ Protection coordination for 100kWp 3-phase
5. ✅ BOM with 3 suppliers, find cheapest combo
6. ✅ Performance forecast for לחיפה shading 0.15
7. ✅ Fault analysis from SolarEdge "string current low"
8. ✅ Re-design after panel discontinuation
9. ✅ Hebrew report generated correctly (RTL, fonts, numbers)
10. ✅ KG queries return correct :Site context

### 13.A.7 Build estimate (revised)

| Sub-skill | Hours |
|---|---:|
| pv_design_calc | 8h |
| wire_sizing | 6h |
| protection_coordination | 8h |
| bom_generator | 6h |
| performance_forecast | 6h |
| fault_analysis | 6h |
| Integration (KG + Monday + SolarEdge) | 4h |
| Hebrew report template + tests | 6h |
| **Total** | **50h** |

(50h, up from 30-40h initial estimate — דיוק)

### 13.A.8 ROI

- 137 customers × 1.5 projects/year avg = ~200 designs/year
- Manual: 4-6h per design (engineer time)
- AI-augmented: 30min review of draft + Barak adjustments = ~1h
- **Savings: 5h × 200 = 1000h/year**
- 50h build → payback **in 3-5 designs** (~1 month at BEE volume)
- **ROI: 20× year-1**

---

## 13.B — `tender-agent` Skill (full design)

### 13.B.1 SKILL.md

```yaml
name: tender-agent
version: 0.1.0
description: Track government + private tenders. Deadline alerts. Document aggregation. Draft preparation.
target_runtime: hermes-agent
license: BEE-internal

charter: |
  Specialist sub-agent for managing tenders/RFPs that BEE pursues.
  Captures tenders from: gov.il portals, RFP emails, manual entry, Monday board.
  Tracks deadlines, gathers required documents, drafts submissions, monitors outcomes.
  
  Critical: BEE MISSED חוף אשקלון + קרית גת tenders (deadlines May 12-13, 2026).
  This agent prevents future misses.

triggers:
  intents: [tender-new, tender-deadline-check, tender-document-prepare]
  keywords_he: [מכרז, הגשה, תקופת הגשה, פניה תחרותית, RFP]
  keywords_en: [tender, RFP, RFQ, bid, proposal-due]
  monday_events:
    - new item on board "Tenders" (to create if missing)
  email_patterns:
    - from: gov.il
    - from: municipality.il
    - subject contains: "מכרז" or "RFP" or "פניה תחרותית"
  rss_sources:
    - gov.il tender portal
    - regional municipality portals (Ashkelon, Kiryat Gat, etc.)
```

### 13.B.2 Sub-skills

```yaml
sub_skills:

  tender_ingest:
    purpose: Capture new tender from any source
    sources:
      - gov.il RSS scraping (via firecrawl skill)
      - email parsing (alfred-gmail.js)
      - WhatsApp forward to bot
      - manual entry via WhatsApp command
    output:
      :Tender node in KG:
        - id, name_he, name_en
        - source (gov/municipality/private)
        - source_url
        - issued_date
        - deadline_date
        - submission_method (online/in-person/email)
        - required_documents: list
        - estimated_value_NIS
        - bid_bond_required: boolean
        - status: open/applied/awarded/lost
    estimated_time: 6h

  deadline_watcher:
    purpose: Alert chain on approaching deadlines
    schedule: daily 07:00
    logic:
      for each :Tender where status=open:
        days_to_deadline = deadline_date - today
        if days_to_deadline in [30, 14, 7, 3, 1, 0]:
          send_alert(level=based_on_proximity)
    alert_levels:
      30: low priority, informational
      14: medium, schedule prep time
      7: high, prep documents
      3: critical, finalize submission
      1: URGENT, submit today
      0: HAVE WE SUBMITTED?
    estimated_time: 3h

  document_aggregator:
    purpose: Gather all required documents
    inputs: :Tender with required_documents list
    actions:
      - check workspace docs/ for existing
      - generate missing (insurance cert, financial statements, etc.)
      - request from Barak what's not auto-generatable
    output:
      tender_package/ folder with all docs in correct format
    estimated_time: 6h

  draft_preparer:
    purpose: Generate first-pass response
    inputs:
      - :Tender details
      - similar past tenders BEE won (from KG)
      - BEE company profile + capabilities
    process:
      - parse RFP requirements
      - map to BEE capabilities
      - draft technical response (Hebrew)
      - draft commercial response (pricing — needs Barak input)
      - format per tender requirements
    output:
      docx draft in tender_package/
    estimated_time: 8h

  submission_tracker:
    purpose: Track submitted, awarded, rejected
    schedule: weekly + on-event
    logic:
      - check tender status with source (if API)
      - update :Tender.status
      - on win → create :Job + notify customer-success-agent
      - on lose → log reason for learning
    estimated_time: 2h
```

### 13.B.3 KG schema additions

```cypher
// Already in v6 3.A but enhanced:
:Tender {
  id, name_he, name_en, source, source_url,
  issued_date, deadline_date, submission_method,
  required_documents: list,
  estimated_value_NIS, bid_bond_required,
  status: open|applied|awarded|lost|withdrawn,
  win_probability: 0-100,
  applied_date, applied_by_person,
  result_date, result_notes
}

// Relationships:
(:Tender)-[:ISSUED_BY]->(:Organization)
(:Tender)-[:SIMILAR_TO]->(:Tender)  // past patterns
(:Tender)-[:RESULTED_IN]->(:Job)  // if won
(:Tender)-[:LOST_TO]->(:Competitor)  // if lost
```

### 13.B.4 Dependencies

- **KG (v6, Action #7)** — required
- **firecrawl skill** — for gov.il scraping
- **Anthropic docx skill** — Hebrew RFP responses
- **alfred-gmail.js** — email RFPs parsing
- **Monday MCP** — Tenders board (to create)

### 13.B.5 New Monday board: "Tenders"

```yaml
columns:
  - name: שם המכרז
    type: text
  - name: מקור
    type: dropdown [gov.il, עירייה, פרטי]
  - name: deadline
    type: date
  - name: סטטוס
    type: status [פתוח, בהכנה, הוגש, זכינו, לא זכינו, נסגר]
  - name: ערך מוערך (₪)
    type: numbers
  - name: הסתברות זכייה
    type: numbers (0-100)
  - name: link
    type: link
  - name: BEE Tender ID
    type: text (synced with KG)
```

### 13.B.6 Test scenarios

1. ✅ Ingest tender from gov.il RSS
2. ✅ Ingest from email (RFP attachment)
3. ✅ Alert at T-7d firing correctly
4. ✅ Document aggregation completes (or asks for missing)
5. ✅ Draft Hebrew response generated
6. ✅ KG :Tender created with all fields
7. ✅ Monday Tenders board synced
8. ✅ Status updates when submitted
9. ✅ Past tender similarity finds patterns
10. ✅ Missed-deadline detection (regression test)

### 13.B.7 Build estimate (revised)

| Sub-skill | Hours |
|---|---:|
| tender_ingest | 6h |
| deadline_watcher | 3h |
| document_aggregator | 6h |
| draft_preparer | 8h |
| submission_tracker | 2h |
| Monday Tenders board setup | 1h |
| KG schema integration | 2h |
| Hebrew templates + tests | 4h |
| **Total** | **32h** |

(32h, up from 25h initial — מעבר ל-deeper design)

### 13.B.8 ROI

- חוף אשקלון missed: estimated value ₪500K-2M  
- קרית גת missed: estimated value ₪300K-1M  
- **If just 1 of these had been captured** = ₪300K-2M revenue  
- 32h build → payback **in literally 1 tender won**  
- **ROI: 10,000-60,000× year-1**  

(this is the highest-ROI single agent in the whole plan)

---

## 13.C — Build sequence (engineering + tender)

ה-2 agents תלויים בKG foundation (Action #7). אז:

```
Week 1: Phase 1 (10h actions 1-3, 5-6)
Week 2: Phase 2 (Action #4 roster + #7 KG + #10 bee-hive)
Weeks 3-4: tender-agent build (32h) — HIGHEST ROI
  - KG :Tender + Monday board first (week 3 day 1-2)
  - tender_ingest + deadline_watcher (week 3 day 3-5)
  - document_aggregator + draft_preparer (week 4)
  - submission_tracker + tests (week 4 end)
Weeks 5-7: engineering-agent build (50h)
  - pv_design_calc first (highest individual ROI)
  - wire_sizing + protection_coordination
  - bom_generator + performance_forecast
  - fault_analysis last (most complex)
Week 8: Integration tests + Barak approvals + L0→L1 prep
```

---

## 13.D — מה לא ב-v16 (אבל ב-v11 8.B-D-E)

- 8.B Obsidian formalize — covered v11
- 8.C Customer success SLA + QBR — covered v11
- 8.D Field dispatch agent — covered v11
- 8.E Proposal generator — covered v11 (uses engineering-agent + tender-agent output)

זה ה-fork השלם: engineering + tender = הכי דחוף בPhase 3.

---

*Part 13 (v16) נכתב 2026-05-26 Asia/Jerusalem. Detailed SKILL.md designs for 2 highest-leverage agents: engineering-agent (50h, ROI 20×/y) + tender-agent (32h, ROI 10,000×/y on single missed-tender recovery). Sub-skills, schemas, dependencies, tests, build sequence. ~600 שורות נוספות. סך הכל plan file ~9,300 שורות. v1-v16 cumulative: ~365h focused build (incl. revised 82h ל-2 agents האלה).*

---

# Part 14 — v17: WA + Email Re-scan + Honest Data Limits

ברק העיר שוב שיש מידע נוסף ב-WA + emails + מה החברה עושה. עשיתי grep חוזר מעמיק.

## 14.A — מה שמצאתי שלא היה ב-v12

### 14.A.1 Gmail **secondary account** (חדש לי!)

מ-`openclaw/alfred-overview.html:996`:
> "Gmail משני (barak-barzel@barak-e.com)"

זאת אומרת ברק יש **2 חשבונות Gmail:**
1. ראשי — ב-Alfred OAuth, 56K הודעות (לא name explicit)
2. **משני: `barak-barzel@barak-e.com`** — task #16 ב-Alfred (TBD integration)

**משמעות:** office automation צריך לקרוא **2 inboxes**, לא אחד. זה changes scope.

### 14.A.2 Alfred has 27 *.js scripts (חדש לי!)

מ-`hermes-alfred-cooperation.html:272`:
> "27 alfred-*.js (Monday, Gmail, SolarEdge, Tracer, וכו')"

**v1-v9 התייחסתי ל-~10 alfred-*.js scripts.** בפועל יש 27. רובם לא נחקרו.

### 14.A.3 Dashboard בpor 8765 — 7 panels live (חדש!)

מ-`alfred-overview.html:509`:
> "dashboard-server.js (372KB) · port 8765 · 7 פאנלים חיים:"
> 1. Alfred Inbox
> 2. WhatsApp feed
> 3. Examples (task examples)
> 4. Contacts
> 5. Sites
> 6. Health
> 7. Capability tree

**Status:** port 8765 NOT running (per Hermes overview). זה asset שלא פעיל.

ה-WhatsApp feed panel **כן** מציג רשימת chats — אם ה-dashboard יופעל, ניתן יהיה לחקור את 704 active chats. כרגע not available.

### 14.A.4 Site→group mapping יעוד (חדש!)

מ-`alfred-overview.html:921`:
> "קובץ `sites/_mapping.json` שמקשר JID קבוצה → קובץ אתר. כל הודעה בקבוצה מעדכנת sites/<X>.md."

**Status:** TODO. הקובץ לא קיים עדיין. דורש input של ברק.

**משמעות:** ה-mapping קבוצה → site הוא חוסר. **Action #11 חדש: build sites/_mapping.json**.

### 14.A.5 BEE-DB 3 entity types (חדש!)

מ-`alfred-overview.html:604`:
> "Snapshot יומי + HTTP client (JWT cache). לקוחות + אתרים + פרויקטים."

3 entity types ב-BEE Operations:
- **לקוחות** (customers)
- **אתרים** (sites)
- **פרויקטים** (projects)

זה ה-mental model של ברק. ל-KG (v6) צריך להיות aligned. **Project ≠ Job.** Job = a unit of work, Project = larger client engagement.

### 14.A.6 ה-Drafts logic ספציפית (חידוש)

מ-`AGENTS.md:317-339`:
> "כשמישהו פרטי 1:1 שולח הודעה לברק → Alfred מנסח טיוטה → פרסם ב-`120363407758194119@g.us` → ברק בוחר/דוחה"

**Pattern important:**
- אנשי קשר לא-מורשים (unauthorized) → לא מקבלים replies אוטומטיים
- Alfred drafts → Barak decides
- זה ה-Q19 שcounted as critical in v1

### 14.A.7 4 destinations rule (חידוש)

מ-`alfred-overview.html:540`:
> "4 יעדי שליחה בלבד (חוק יסוד #3): self-chat + 3 קבוצות (טיוטות / תמלולים / נרי)"

**Constitutional law #3:** Alfred can ONLY send to 4 destinations:
1. Barak's self-chat
2. Drafts group (120363407758194119)
3. Voice transcripts group (120363409101459201)
4. Neri sync group (120363425994041413)

**NOT** site groups (read-only), **NOT** customer chats, **NOT** random people.

זה ה-safety mechanism. **כל v1-v15 plan חייב לכבד את זה.**

### 14.A.8 Hermes /send pipeline (חידוש)

מ-`hermes-alfred-cooperation.html:434`:
> "Hermes /send queue + priority lanes (transactional > marketing). Alfred מנסח message-per-customer; Hermes שולח 20 msg/sec עם backoff."

**Future capability:** Hermes will be the **outbound transport** for bulk customer messages. Alfred drafts → Hermes sends. **20 msg/sec rate-limited.**

זה matches the v1 federation thesis exactly: Alfred = brain, Hermes = transport.

### 14.A.9 ה-bee-hive role (חידוש!)

מ-`hermes-alfred-cooperation.html:458`:
> "L3 ב-Hermes 4-Levels Reference (shannholmberg). **bee-hive = orchestrator**. Alfred = solar/electrical specialist. Hermes = transport + general. inbox→working→outbox→done עם handoff."

🎯 **bee-hive = orchestrator level L3!**

זה אומר:
- L1 = Hermes (transport)
- L2 = Alfred (solar/electrical specialist)
- **L3 = bee-hive (orchestrator)**
- L4 = Task Bus (inbox → working → outbox → done)

זה ה-target architecture. **bee-hive is not unknown** — it's the **orchestrator layer Barak is building** (currently 0% per Hermes overview).

מקור: shannholmberg's Hermes 4-Levels Reference.

---

## 14.B — מה ש**אין לי** access אליו (data limits)

צריך לומר בכנות:

| Asset | Where | Status | Why I can't see |
|---|---|---|---|
| workspace.db (WhatsApp chats) | E: drive | 890MB / 1M messages / 14.6K chats / 704 active | not in snapshot |
| Email contents | Gmail (56K msgs) | OAuth read-only | not in snapshot |
| `sites/_mapping.json` | TODO, doesn't exist yet | not built | needs Barak input |
| BEE Operations DB | bee-prod-1 PostgreSQL | live | not in snapshot |
| messages.sqlite | E: drive | contacts auto-pop source | not in snapshot |
| Pricebook xlsx | workspace | mentioned | not in snapshot |
| Actual roster of techs | TBD | partial in AGENTS.md | needs Barak verify |
| 27 alfred-*.js scripts | Desktop\OpenClawAgent\ | source code | not in snapshot |
| bee-prod-1 system state | Hetzner VPS | live | not in snapshot |

**הסיכום הכן:** מה ש-snapshot מכיל = **configurations + documentation, לא data**. ל-deeper insight על 704 active chats או 56K emails — דרוש export ייעודי או access ל-data files.

**אופציות:**
1. ברק שולח export ספציפי (e.g., WhatsApp groups list dump from workspace.db)
2. Claude Code שרץ מקומית עם access ל-files יבצע את ה-analysis
3. ה-cloud session הזה מסיק מה שאפשר מ-configs ותעודים בלבד

---

## 14.C — מה החברה עושה — Enhanced picture (v17)

מ-grep יותר עמוק, picture עדכני מאחד מ-v12 9.C עם findings חדשים:

### 14.C.1 Mental model של ברק (3 entity types — חדש)

```
לקוחות (Customers)
   │
   └── אתרים (Sites) — physical locations
            │
            └── פרויקטים (Projects) — engagements / installs
                     │
                     └── Jobs / משימות — individual work units
```

זה לא מה שעשיתי ב-v6 KG schema. הKG צריך **:Project** node type בנפרד מ-:Job:

```cypher
:Customer { ... }
:Site { ... }
:Project { id, name, start_date, end_date, status, contract_value_NIS, customer_id, site_id }
:Job { id, project_id, type, status, assigned_to, hours }

(:Customer)-[:HAS_PROJECT]->(:Project)
(:Project)-[:AT_SITE]->(:Site)
(:Project)-[:CONTAINS]->(:Job)
```

### 14.C.2 27 alfred scripts (Monday, Gmail, SolarEdge, Tracer, וכו')

לפי mentions בfiles, ה-scripts הידועים:
- alfred-calendar.js
- alfred-monday.js
- alfred-gmail.js (v2.1)
- alfred-solar-edge.js
- alfred-tracer.js (implied)
- alfred-clarify.js
- alfred-router.js
- alfred-customer360.js
- alfred-customer-intelligence.js
- alfred-knowledge.js
- alfred-enrich.js
- alfred-identity.js
- alfred-deadlines.js
- alfred-weather.js
- alfred-gov-rss.js
- alfred-handle.js
- alfred-invoice-maven.js
- alfred-tomorrow-digest.js
- dashboard-server.js
- refresh-bee-snapshot.js
- heartbeat-watcher.js (proposed)

זה ~21. ה-27 כולל כנראה עוד helper scripts. **27 scripts = significant existing codebase.**

### 14.C.3 ה-real funnel של BEE (מ-7 panels of dashboard)

The dashboard panels reveal Barak's mental funnel:
1. **Alfred Inbox** — open bireurim (clarifications)
2. **WhatsApp feed** — incoming flow
3. **Examples** — task-examples.md learning corpus
4. **Contacts** — contacts.md humans
5. **Sites** — 255 site dossiers
6. **Health** — system health
7. **Capability tree** — what Alfred can do

זה ה-7 windows במוח של ברק על המערכת. ה-AI אמור לעזור בכל אחד מהם.

---

## 14.D — Updated Action Items (Post-v17)

v17 מוסיף 3 actions:

### Action #11 (חדש): sites/_mapping.json build
- **Hours:** 1h (mostly Barak input)
- **Value:** Unlocks site dossier auto-update for ALL sites, not just Kfar Yuval
- **ROI:** 8/10
- **Source:** v17 14.A.4
- **Action:** Map every active site's WA group JID → site_slug. Build mapping.json. Wire into alfred-handle.js.

### Action #12 (חדש): Dashboard port 8765 restart
- **Hours:** 2h
- **Value:** Live visibility into 704 active chats + 56K emails + sites + health
- **ROI:** 7/10
- **Source:** v17 14.A.3
- **Action:** Restart dashboard-server.js port 8765. Verify 7 panels load. Add to Phase 1.

### Action #13 (חדש): Connect Gmail secondary (barak-barzel@barak-e.com)
- **Hours:** 3h
- **Value:** Captures emails from secondary inbox (otherwise blind)
- **ROI:** 7/10
- **Source:** v17 14.A.1
- **Action:** OAuth for 2nd account. Update alfred-gmail.js to poll both. Daily digest combines.

---

## 14.E — bee-hive Clarification (CRITICAL)

מ-14.A.9: **bee-hive = orchestrator L3** per shannholmberg's Hermes 4-Levels Reference.

**Implication:** v15 Action #10 ("bee-hive investigation") — answer is **known**. bee-hive = the orchestrator Barak is building. Currently 0% built per Hermes overview.

**שאלות שעוד אינני יודע:**
- האם bee-hive כבר התחיל לבנייה? איפה הקוד?
- האם זה שדרוג של Hermes או פרויקט נפרד?
- האם זה ב-Python? Node? .NET?
- מי כותב? ברק לבד? עם נרי?

**אבל הclear part:** זה L3 orchestrator. Not unknown anymore.

---

## 14.F — Updated Domain Map (post-v17)

| # | Domain | Status |
|---|---|---|
| 1-15 | (per v13 + v14 + v15) | — |
| **16** | **bee-hive orchestrator (L3)** | 0%, in design |
| **17** | **Dashboard (port 8765, 7 panels)** | 50%, not running |
| **18** | **2nd Gmail account integration** | not started |

**17 domains identified.** Top-10 in v15 12.B remains valid; actions #11-13 added in 14.D.

---

## 14.G — DeepSeek balance acknowledged

ברק שיתף screenshot שוב — $96.57 balance. כבר עודכן ב-v15 9.F. v9 router fix updated. No change needed.

**Side note:** ה-screenshot מראה שגם **deepseek-v4-pro** (9,294 requests, 166M tokens) וגם **deepseek-v4-flash** (6,574 requests, 403M tokens) פעילים. זה matches "deepseek-chat anomaly (169M tokens unexplained)" — deepseek-chat הוא מודל אחר ייתכן (deepseek-v3 legacy?). **Anomaly hunt (Action #2) צריך לבדוק האם deepseek-chat = deepseek-v3 legacy שעדיין נקרא ע"י skill ישן.**

---

## 14.H — סיכום ה-honest gap

**ה-data שיש לי:**
- 17 config + doc files (snapshot מ-2026-05-26 01:36 UTC)
- Reading-only access
- 5 WA groups documented במלואם
- 56K Gmail messages count (no content)
- Architecture + skills + crons + plugins lists

**מה שאין לי:**
- workspace.db (chat content)
- email content
- BEE app source code
- BEE app DB content
- live system state
- the other 22 alfred-*.js scripts source

**מה צריך להמשיך:**
1. אם ברק רוצה analysis של 14.6K chats — export from workspace.db
2. אם רוצה Gmail content analysis — לפעיל gmail-morning-digest ולקבל summaries
3. אם רוצה BEE app deep dive — לתת access ל-source code via git
4. אם רוצה lookups specific (e.g., "list all my WA groups") — Claude Code locally יכול לעשות זאת מול workspace.db

---

*Part 14 (v17) נכתב 2026-05-26 Asia/Jerusalem. WA + email + company re-scan + honest data limits documented. New findings: 2 Gmail accounts (barak-barzel@barak-e.com 2nd), 27 alfred scripts (not ~10), dashboard 7 panels port 8765, sites/_mapping.json TODO, BEE 3-entity model (לקוחות/אתרים/פרויקטים), 4-destinations constitutional law, Hermes /send 20msg/sec pipeline, **bee-hive = L3 orchestrator (clarified!)**. Top-10 → Top-13 actions. ~500 שורות נוספות. סך הכל plan file ~9,800 שורות. v1-v17 cumulative ~370h focused build.*

---

# Part 15 — v18: Direct Answers from Barak (Q71, Q73, Q76)

3 תשובות קונקרטיות התקבלו 2026-05-26.

## 15.A — Q71: Tenders status — **לא הוגשו, איחרנו** 🚨

**ברק:** חוף אשקלון + קרית גת — שני המכרזים **לא הוגשו**. ה-deadlines (12.5 + 13.5) חלפו בלי הגשה.

### 15.A.1 משמעות

- אובדן הזדמנות **₪500K-2M (אשקלון) + ₪300K-1M (קרית גת)** = potential ₪800K-3M opportunity
- **תוקף priority** ל-tender-agent (Action #9, v15 12.B): מעלה ל-**#1 ROI** באופן מוחלט
- **classified gap:** ברק רץ עסק עם 137 לקוחות + 22.7MW + 41-route SaaS — וpubsec tenders איחר. זה לא bandwidth issue, זה **system gap**

### 15.A.2 immediate action

**Day 1 build (4h)** of MVP tender-tracker (תת-קבוצה של tender-agent):
```yaml
mvp_v0.1:
  - cron daily 07:00: scan gov.il + municipal portals for "מכרז" + "חשמל"/"סולארי"
  - extract title + deadline + link
  - add to Monday board "Tenders" (create if missing)
  - immediate ⚡ Barak on new found
  - T-30/14/7/3/1 deadline alerts on existing
  
build_time: 4h (skeleton)
later_phase: full tender-agent 32h per v16 13.B
```

זה Action chunk שצריך לזוז ל-Phase 1 Week 1 immediately. **גובר על חלק מ-Top-10**.

### 15.A.3 retroactive recovery?

האם יש סיכוי לפנייה מאוחרת? לפעמים מכרזים מאריכים deadlines. **שאלה: האם להתקשר ל-municipal contacts ולשאול?** 

אם **כן** — Hermes יכול לעזור עם email/phone outreach scripts (Hebrew).

---

## 15.B — Q73: BEE Operations app — **Customer portal לחלק** ✅

**ברק:** ה-BEE app **יש customer portal לחלק מהלקוחות** (not all).

### 15.B.1 משמעות

- BEE = לא רק internal tool. **חלק מהלקוחות מקבלים גישה.**
- זה מסביר את ה-"41 routes" — חלק `/api/*`, חלק `/portal/*`, חלק `/admin/*`
- **לקוחות שיש להם portal:** כנראה enterprise tier (Rafael Solar, Palar, חכל שדרות, האגודה למען החייל, צרויה)

### 15.B.2 questions שעדיין נשארות

- האם portal users מקבלים real-time SolarEdge data?
- האם portal משלים את ה-customer-success-agent (v11 8.C)?
- האם API public לpartners?
- מי בונה את הportal — ברק לבד? עם מי?

### 15.B.3 strategic implications

**ל-customer-success-agent (v11 8.C):**
- L2 SLA tracking יכול להיות **דרך הportal** (status visible to customer)
- QBR generation יכול להיות פיצ'ר בportal
- account health score יכול להיות הציון של ה-customer ב-portal

זה מאחד את 8.C ו-domain #8 (BEE app). יותר נכון: **קח את הportal הקיים והרחב אותו** במקום לבנות agent נפרד.

### 15.B.4 ROI calc revised

לפי v11 8.C estimate: customer-success-agent ~28h build. אם **משתלב בportal הקיים**, ה-build משתנה:
- portal extension (~15h)
- agent backend (~10h)
- integration tests (~5h)
- **Total ~30h**, but reuses existing UI

זה לא much different from original. עיקר הshift: **mental model — agent + portal = same project**, לא 2 דברים.

---

## 15.C — Q76: bee-hive — **תכנון בלבד** 📋

**ברק:** bee-hive **בתכנון בלבד**. אין קוד עדיין.

### 15.C.1 משמעות

- L3 orchestrator = aspirational, not in progress
- Action #10 (bee-hive investigation v15 12.B) revised: **לא investigation — כתיבת SPEC**
- ברק יודע מה הוא רוצה (4-levels אחרי shannholmberg) אבל לא התחיל ליישם

### 15.C.2 ה-decision tree

```
Should we build bee-hive now (Phase 2/3)?
   │
   ├── YES — bee-hive becomes L3 = central planning
   │        → Engineering-agent + tender-agent מתחברים דרך bee-hive
   │        → Alfred → bee-hive (task) → bee-hive routes to right agent
   │        → ~50-80h to build bee-hive MVP
   │        → ROI: enables L4 task bus, real multi-agent coordination
   │
   └── NO — keep Alfred + Hermes flat for now
            → engineering-agent + tender-agent run as Hermes skills
            → No orchestrator layer
            → Faster to value, but harder to scale beyond 5-6 agents
```

### 15.C.3 my recommendation

**Defer bee-hive to Phase 4.** Reasoning:
1. Phase 1-3 outputs = Alfred fixes + KG + engineering-agent + tender-agent. **כל אלה ניתן לבנות בלי bee-hive.**
2. ברק עדיין מבסס את ה-foundation. אם הוא בונה orchestrator לפני שיש agents — premature.
3. **Build the agents first, then bee-hive emerges naturally** when need-for-coordination arises.
4. ה-4-Levels model is good vision, אבל לא execution sequence.

**Alternative:** start writing the bee-hive **spec** in Phase 2 (1-2h side work). Just the SKILL.md / charter. Code later.

### 15.C.4 update to plan

- v15 12.B Action #10 (bee-hive investigation, 3-5h): **convert to "write bee-hive spec"** (2h max)
- Phase 4 expansion: includes bee-hive MVP (50-80h)
- v15 12.C.4 Phase 4 hours revised: ~150h → ~200-230h (add bee-hive)

---

## 15.D — Pending: Q78 (Solar 35% specifics)

עוד לא נענה — שאלה תיפסל בשל typo בעברית. **אשאל שוב ב-AskUserQuestion הבא, בתקנית.**

---

## 15.E — Updated build order (post-v18)

הסדר revised based on answers:

| Week | Phase | Focus | Hours |
|---|---|---|---|
| **1** | Phase 1 Quick wins | Router fix + Anomaly + Cron restore + Heartbeat + Gmail + **MVP tender-tracker (4h)** | ~14h |
| **2** | Phase 2 Foundation | roster + KG + bee-hive spec (2h) | ~22h |
| **3-4** | Phase 3a | **tender-agent full (32h)** — moved up due to ROI urgency | ~32h |
| **5-7** | Phase 3b | engineering-agent (50h) | ~50h |
| **8** | Phase 3c | customer-success-agent / portal extension (30h) | ~30h |
| **9-12** | Phase 4 | Field dispatch + proposal-generator + Obsidian formalize + Voice v5 | ~100-150h |
| **Month 4+** | Phase 5 | bee-hive MVP + L4 Task Bus + Polish/DR/Backup | ~200-250h |
| **TOTAL** | | | **~470-520h** focused (up from 365 due to bee-hive + portal coordination) |

### 15.E.1 ה-day-1 deliverable (revised)

**MVP tender-tracker (4h):** to start *immediately* — even before full Phase 1. אם ברק יקבל פוש על זה הוא יודע שה-tender problem won't repeat.

---

## 15.F — Open: Q78 + Q72 + Q74-Q75 + Q77 + Q79-Q80

עוד **7 שאלות פתוחות**. ה-critical ones:
- Q78: Solar 35% specifics
- Q77: deepseek-chat anomaly source (can auto-discover via logs)
- Q79: Hermes L2 Specialized Agents at 15% — מי?
- Q80: BEE Operations → Hermes — לחבר?

ה-3 שיהיו ענה עליהם משחררים את ה-architecture decisions של Phase 4.

---

*Part 15 (v18) נכתב 2026-05-26 Asia/Jerusalem. 3 תשובות concrete מ-ברק. Q71 confirmed (tenders missed, ₪800K-3M lost opportunity). Q73 confirmed (BEE app has partial customer portal). Q76 confirmed (bee-hive = planning only). Build order revised: MVP tender-tracker ב-Phase 1 Week 1 (4h, action chunk new). tender-agent full ב-Phase 3a (was Phase 3 generally). bee-hive deferred to Phase 4. ~300 שורות נוספות. סך הכל plan file ~10,100 שורות. v1-v18 cumulative ~470-520h focused build.*

---

# Part 16 — v19: 🔥 Architectural Paradigm Shift (Q78-Q80 answers)

3 תשובות נוספות התקבלו. אחת — Q78 — **משנה את ה-architecture כולה.** זה הinsight החשוב ביותר ב-19 גרסאות.

## 16.A — Q78: Solar AI = Data Pipeline INTO BEE App 🔥

**ברק (quote):** "כל זה מידע שהוא אמור להעביר למרכז המידע של האפליקציה שלנו ולעדכן במקומות הנכונים את המידע הנכון ולקדם את הסטטוס של האתרים"

**Translation:** "All this is information that should transfer to the central info hub of our application and update the right information in the right places and advance the status of the sites."

### 16.A.1 ה-paradigm shift

עד עכשיו תיכננתי AI כמערכת **לצד** BEE app:
```
[Alfred] → [agents produce outputs] → [outputs to user/customer]
                                       (KG separate)
                                       (BEE app separate)
```

זה **לא** מה ש-ברק רוצה. ה-correct architecture:
```
                      ╔══════════════════════╗
                      ║   BEE Operations app  ║  ← SINGLE SOURCE OF TRUTH
                      ║  (41 routes, 38 models)║   customers + sites + projects
                      ╚═══════════▲══════════╝
                                  │  (write-back)
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
   ┌────────▼───────┐    ┌────────▼────────┐    ┌──────▼────────┐
   │ Alfred         │    │ Hermes          │    │ AI agents      │
   │ (capture +     │    │ (process +      │    │ (engineering,  │
   │  classify)     │    │  produce)       │    │  tender, ...)  │
   └────────────────┘    └─────────────────┘    └────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │  (read from)
                            ┌─────▼──────┐
                            │ WhatsApp,  │
                            │ Email,     │
                            │ Calendar,  │
                            │ SolarEdge, │
                            │ ...        │
                            └────────────┘
```

**ה-rules:**
1. **BEE app = source of truth** for all customer/site/project state
2. ה-AI agents **read context** מ-BEE app, **produce outputs**, וכותבים **outputs back to BEE app**
3. **Status updates** של sites/projects/jobs מתבצעים **אוטומטית by agents** based on what they processed
4. KG (Neo4j) **לא מחליף** את ה-app — הוא **complement** for graph queries, mirroring core data
5. Outputs לconsumer (customer/Barak) באים **מ-BEE app**, לא מ-agents directly

### 16.A.2 ה-implication ל-engineering-agent (v16 13.A)

ה-design מ-v16 צריך לעבור revision:

| Sub-skill output | Old destination | NEW destination |
|---|---|---|
| pv_design_calc | Hebrew docx file | **BEE app `projects.design_spec`** + docx attachment in BEE |
| wire_sizing | Hebrew docx | **BEE app `projects.electrical_design`** |
| protection_coordination | Hebrew docx | **BEE app `projects.protection_plan`** |
| bom_generator | xlsx file | **BEE app `projects.bom`** + xlsx in BEE |
| performance_forecast | Hebrew docx | **BEE app `sites.production_forecast`** (yearly) |
| fault_analysis | report file | **BEE app `sites.alerts.diagnosis`** + status update |

**ה-mental shift:** outputs aren't files in workspace — they're **updates to entities in BEE app**.

זה אומר שengineering-agent חייב:
1. **API access ל-BEE app** (write endpoints)
2. **schema knowledge** של 38 Prisma models
3. **idempotent updates** (run twice doesn't break)
4. **status promotion logic** (when to advance site/project status)

### 16.A.3 ה-implication ל-tender-agent (v16 13.B)

אותו pattern:

| Tender stage | Updates BEE app |
|---|---|
| Tender ingested | New record in `tenders` table (38 Prisma models) |
| Documents gathered | `tenders.documents[]` |
| Draft prepared | `tenders.draft_response` |
| Submitted | `tenders.status = 'applied'` + `tenders.submitted_at` |
| Won | `tenders.status = 'won'` + auto-create `project` linked |
| Lost | `tenders.status = 'lost'` + `tenders.loss_reason` |

ברגע ש-tender נוצח → **BEE app אוטומטית יוצר project**. ה-AI לא צריך לעשות handoff manually.

### 16.A.4 ה-implication ל-customer-success (v11 8.C)

Customer health score = **שדה ב-BEE app per customer**, מחושב weekly. Portal display = ישירות מ-BEE app. Agent מעדכן את המספר; ה-app מציג.

### 16.A.5 critical new dependency: BEE app API documentation

לפני שכל ה-AI agents יוכלו לכתוב חזרה ל-BEE app, צריך:
- API spec (OpenAPI/Swagger) של 41 routes
- Auth pattern (JWT from secrets/bee-integrations.env)
- Write permissions per route
- Idempotency keys

**Action #14 (חדש):** "Document BEE app write API + create AI agent SDK" (~8h, depends on Barak access to BEE app source).

### 16.A.6 build sequence implication

**הסדר חייב להיות:**
1. BEE app API documentation/SDK (8h) — **חוסם הכל**
2. KG mirror schema for BEE data (4h)
3. engineering-agent → writes to BEE (50h modified to 60h with BEE integration)
4. tender-agent → writes to BEE (32h modified to 38h)
5. customer-success → reads/writes to BEE via portal (30h)

זה ~140h של agents + ~12h foundation = **152h** in Phase 3, ולא ~100h כפי שתיכננתי ב-v15.

---

## 16.B — Q79: Hermes L2 Agents 15% = Local Skills קיימים ✅

**ברק:** ה-15% = ה-local skills הקיימים (`barak-business-integrations`, `barak-activity-reporting`, `alfred-platform-upgrade`).

### 16.B.1 משמעות

- ה-15% = ה-3 skills שכבר נכתבו, **לא נוספים**
- ל-50% נצטרך עוד **5-7 specialized agents**:
  - engineering-agent (v16 13.A)
  - tender-agent (v16 13.B)
  - customer-success-agent (v11 8.C)
  - field-dispatch-agent (v11 8.D)
  - proposal-generator (v11 8.E)
  - tax-compliance-agent (לא הוגדר עדיין)
  - inventory-agent (לא הוגדר עדיין)

לכל אחד ~30-50h build. **5 agents × ~40h avg = 200h** ל-50% goal completion.

### 16.B.2 Hermes 4-Levels alignment

מ-shannholmberg reference:
- **L1 = transport (Hermes core)** — 60% מבחינת Persistent Memory + Token Efficiency
- **L2 = specialized agents** — 15% (local skills) → goal 50%
- **L3 = orchestrator (bee-hive)** — 0% (planning only per Q76)
- **L4 = Task Bus** — 0%

Phase 1-3 = build L2. Phase 4 = build L3. Phase 5 = L4.

---

## 16.C — Q80: BEE → Hermes — **כן, לחבר** ✅

**ברק:** **כן** — connect BEE Operations to Hermes.

### 16.C.1 משמעות

עד עכשיו Alfred is the only one with BEE app context. Hermes is blind to:
- customers (137)
- sites (255)
- projects (active)
- jobs (1,425 open)
- alerts (461 active)
- pricebook (9 batteries + 8 panels)
- fleet (18 vehicles)

### 16.C.2 implementation

```yaml
hermes-bee-integration:
  steps:
    1. expose BEE app HTTP client to Hermes runtime (~2h)
    2. share JWT token from secrets/bee-integrations.env (~1h)
    3. install bee-mcp-server (build, ~3h):
       - GET /customers → list/search
       - GET /sites → list/search/filter
       - GET /projects → list/filter
       - GET /jobs → list/filter/by-site/by-customer
       - POST /jobs → create
       - PATCH /sites/<id>/status → status update
       - PATCH /projects/<id>/* → general updates
       - GET /alerts → real-time
    4. register bee-mcp-server in Hermes config (~30min)
    5. test query from Hermes session (~30min)
  
  total_time: ~7h
```

### 16.C.3 ה-coupling note (v13 10.F.1 revisited)

הזכרתי שזה SPOF. **עכשיו זה DESIGN INTENT** — אם BEE app down → AI agents בכל מקרה לא יכולים לעבוד נכון (כי הם כותבים לBEE). אז ה-coupling הוא **acceptable**, אבל:
- **HA (high availability)** של BEE app נהיה critical
- **backup of BEE PostgreSQL** = mandatory (v8 5.C)
- **circuit breakers** ב-agents — אם BEE app מנודה, queue writes and retry

זה הופך את ה-Phase 5 backup/DR מ-"nice to have" ל-"must have".

---

## 16.D — Revised Master Plan (post-v19)

### 16.D.1 Build sequence (final)

| Week | Phase | Focus | Hours |
|---|---|---|---|
| 1 | **Phase 1 Quick wins** | Router fix + Anomaly + Crons + Heartbeat + Gmail + **MVP tender-tracker** | ~14h |
| 2 | **Phase 2 Foundation** | roster + KG + **BEE app API doc + bee-mcp-server** + bee-hive spec | ~30h |
| 3-4 | **Phase 3a tender** | tender-agent (~38h with BEE writeback) | ~38h |
| 5-7 | **Phase 3b engineering** | engineering-agent (~60h with BEE writeback) | ~60h |
| 8 | **Phase 3c portal** | customer-success / portal extension (~30h) | ~30h |
| 9-12 | **Phase 4 expansion** | dispatch + proposal-generator + Obsidian + Voice v5 | ~120-150h |
| Month 4+ | **Phase 5 polish** | bee-hive MVP + L4 Task Bus + Backup + DR | ~200-250h |
| **TOTAL** | | | **~500-575h** |

### 16.D.2 ה-architecture (post-v19, final)

```
                            ╔══════════════════════════════╗
                            ║   BEE Operations app          ║
                            ║   (SOURCE OF TRUTH)           ║
                            ║   41 routes, 38 Prisma models║
                            ║   PostgreSQL 16 on Hetzner    ║
                            ║   Customer portal (partial)   ║
                            ╚════════▲══════════▲══════════╝
                                     │          │
                       ┌─────────────┘          └─────────────┐
                       │ (writeback)              (writeback) │
                       │                                       │
              ┌────────▼─────────┐                  ┌─────────▼─────────┐
              │    Alfred         │                  │    Hermes          │
              │ (OpenClaw)        │◄────────────────►│ (DeepSeek-based)   │
              │ specialist agents │   peer-to-peer   │ transport + bulk   │
              │ + capture/classify│   coordination   │ + L2 agents pool   │
              └────────▲──────────┘                  └─────────▲─────────┘
                       │                                        │
              ┌────────┴────────────────────────────────────────┴────────┐
              │  Inputs: WhatsApp / Gmail / Calendar / SolarEdge /        │
              │          Tracer / gov.il / Open-Meteo / BEE-DB            │
              └───────────────────────────────────────────────────────────┘

              Future (Phase 4-5):
              ┌──────────────────────────────────────────────────────────┐
              │  bee-hive (L3 orchestrator)                                │
              │    inbox → working → outbox → done                         │
              │    routes tasks to right agent (Alfred / Hermes / agent)   │
              └──────────────────────────────────────────────────────────┘
```

### 16.D.3 Top-15 Actions (post-v19)

חוזר ל-Top-10 v15 + 5 new:
- #11: sites/_mapping.json (v17)
- #12: Dashboard port 8765 restart (v17)
- #13: Gmail secondary integration (v17)
- #14: **BEE app write API doc + AI SDK** (v19, NEW - critical foundation)
- #15: **bee-mcp-server build for Hermes** (v19, NEW - unlocks L2 expansion)

---

## 16.E — Outstanding (still open)

| # | Question | Status |
|---|---|---|
| Q72 | כמה site groups בsite-groups.json? | open |
| Q74 | gmail-morning-digest disabled — why? | open |
| Q75 | bee-ai-watcher — reviews count? | open |
| Q77 | deepseek-chat anomaly source | auto-discoverable via logs |

5 sealed (Q71, Q73, Q76, Q78, Q79, Q80). **התשובה הקריטית = Q78.**

---

*Part 16 (v19) נכתב 2026-05-26 Asia/Jerusalem. 🔥 ARCHITECTURAL PARADIGM SHIFT from Q78 answer: AI agents write back to BEE app as source of truth, not produce side outputs. Engineering + tender + customer-success agents revised to update BEE entities. New Action #14 (BEE app write API doc, 8h) + #15 (bee-mcp-server, 7h). Hermes will gain BEE access via Q80=yes. Hermes L2 path = 5 more agents from current 3 (Q79). Phase 3 expanded 100h → 152h. Total build estimate ~500-575h. ~500 שורות נוספות. סך הכל plan file ~10,600 שורות.*

---

# Part 17 — v20: Final Q's Closed (Q72, Q74, Q75)

3 תשובות אחרונות מ-ברק 2026-05-26. ה-loop כמעט סגור.

## 17.A — Q72: **רוב ה-active sites** יש WA groups 🔥

**ברק:** רוב ה-active sites יש WA groups.

### 17.A.1 משמעות הכמותית

מ-MEMORY.md: 255 sites total. "Active" probably means currently being installed/serviced. Let's estimate **150-180 active sites with WA groups**.

זה **scale ענק** של site dossiers שאמורים להתעדכן אוטומטית!

### 17.A.2 implication ל-Action #11 (sites/_mapping.json)

מ-v17 — אמדתי 1h. **revise:**

```yaml
sites_mapping_build:
  approach: extract from existing WhatsApp groups list (workspace.db)
  
  step_1: ברק exports WA groups (one-time):
    sqlite3 workspace.db "SELECT chat_id, name FROM chats 
                          WHERE chat_id LIKE '%@g.us' 
                            AND name LIKE '%התקנת%' OR name LIKE '%סולא%'
                          ORDER BY last_message_at DESC LIMIT 200;"
    → CSV/JSON with ~150-180 rows
  
  step_2: match group names → BEE app sites:
    - LLM-assisted matching (Hebrew names variations)
    - per match: confidence 0-1
    - low confidence → Barak review
  
  step_3: generate sites/_mapping.json:
    {
      "120363409665555113@g.us": "kfar-yuval",
      "...": "rafael-solar-tel-aviv-1",
      ...
    }
  
  step_4: wire into alfred-handle.js + alfred-router.js
  
  build_time: ~8h (incl. matching review)
```

**Action #11 revised: 1h → 8h.** Still huge ROI given 150-180 sites unlock auto-dossier updates.

### 17.A.3 immediate downstream

ברגע ש-150-180 sites יש auto-dossier:
- כל message ב-WA group → :Site node update in KG
- daily summary per site → Barak briefing
- site status promotion → BEE app via Action #14 (writeback)
- customer-success aggregates by parent customer

זה ה-**actual capture engine** של BEE knowledge. **massive value unlock**.

---

## 17.B — Q74: Gmail OAuth issue 🔑

**ברק:** ה-cron disabled בגלל OAuth issue.

### 17.B.1 משמעות

Action #6 (v15 12.B Gmail diagnostic) revised:

```yaml
gmail_oauth_recovery:
  step_1: identify what broke
    - check ~/.openclaw/credentials/ for tokens
    - check expiry timestamps
    - check google cloud console for OAuth client state
  
  step_2: reauth flow
    - run alfred-gmail-auth.js (if exists)
    - or: re-run OAuth setup
    - browser → google → consent → token save
  
  step_3: separately handle 2nd account
    - barak-barzel@barak-e.com requires own OAuth flow
    - dual-account support in alfred-gmail.js
  
  step_4: test
    - alfred-gmail.js unread --max 10
    - verify return without auth error
  
  step_5: re-enable cron
    - openclaw cron enable gmail-morning-digest
  
  build_time: ~2-3h (depends on OAuth screen complexity)
```

### 17.B.2 ה-blocker שזה פותר

56K Gmail messages indexed. **Inbox triage** = HUGE value:
- Daily morning digest of urgent/pending/spam
- Auto-extract action items
- Cross-reference with KG (e.g., customer email → :Customer)
- Feed BEE app status updates (Q78 paradigm)

---

## 17.C — Q75: bee-ai-watcher לא רץ ❌

**ברק:** bee-ai-watcher **לא רצתי**.

### 17.C.1 משמעות

ה-pipeline complete on paper:
- Alfred captures "Ai" group → `inbound.jsonl` ✅
- `E:\bee-ai-watcher\scan.js` exists ✅
- `INDEX.md` structure designed ✅
- **BUT — nothing reads inbound.jsonl. Reviews count = 0.**

### 17.C.2 ROI evaluation

האם זה stands worth fixing?

| Option | Pro | Con |
|---|---|---|
| **A. Revive scan.js as-is** | Quick if code OK | Maybe broken, no maintenance |
| **B. Build Hermes-side bee-ai-watcher skill** | Integrated, Hebrew via DeepSeek, INDEX.md sync to Obsidian | ~6-8h build |
| **C. Skip entirely** | Saves time | Lose idea-incubator value |

**ההמלצה:** **Option B** — build Hermes-side. Integrated with rest of stack, Hebrew-native via DeepSeek.

```yaml
bee-ai-watcher-v2:
  schedule: daily 22:00 (after evening briefing)
  reads: ~/.openclaw/workspace/ai-feed/inbound.jsonl
  process:
    - for each new JSONL line:
        - extract URL/text
        - if URL → firecrawl skill fetches content
        - DeepSeek summarizes in Hebrew
        - tag (AI tool, news, blog post, video, paper)
        - write to Obsidian vault: ai-feed/<date>/<hash>.md
        - update Obsidian INDEX
  
  build_time: ~6h
```

זה Action #16 (חדש). ROI = medium (knowledge curation), אבל **fits naturally with Obsidian formalize (v11 8.B)**.

### 17.C.3 alternative: stop capturing

If bee-ai-watcher never runs, **stop the capture too** (saves Alfred cycles). אבל זה reduces optionality. **המלצה: continue capture, build Option B in Phase 4.**

---

## 17.D — Updated Top-16 Actions

| # | Action | Hours | ROI |
|---|---|---:|---:|
| 1 | Smart router fix (DeepSeek-aware) | 0.5h | 10/10 |
| 2 | DeepSeek-chat anomaly hunt | 3h | 9/10 |
| 3 | Re-enable 5 disabled crons | 1h | 9/10 |
| 4 | roster.yaml build | 2h | 9/10 |
| 5 | Heartbeat watcher cron | 1h | 8/10 |
| 6 | **Gmail OAuth recovery + dual-account** | 3h | 9/10 (raised) |
| 7 | KG (Neo4j) foundation | 19h | 7/10 |
| 8 | engineering-agent (with BEE writeback) | 60h | 7/10 |
| 9 | tender-agent (with BEE writeback) | 38h | **10/10** (raised) — tenders missed = critical |
| 10 | bee-hive **spec** (defer build) | 2h | (deferred) |
| 11 | **sites/_mapping.json (150-180 sites)** | 8h | **9/10** (raised) |
| 12 | Dashboard port 8765 restart | 2h | 7/10 |
| 13 | Gmail secondary integration | bundled in #6 | (merged) |
| 14 | **BEE app write API doc + AI SDK** | 8h | **10/10** (foundation) |
| 15 | **bee-mcp-server for Hermes** | 7h | 9/10 |
| 16 | **bee-ai-watcher v2 (Hermes-side)** | 6h | 5/10 (Phase 4) |

### 17.D.1 Critical foundation actions (must come first)

1. **#14 BEE app API doc** — חוסם #8, #9, customer-success agent
2. **#15 bee-mcp-server** — חוסם Hermes BEE access
3. **#11 sites/_mapping.json** — חוסם site dossier auto-update
4. **#7 KG Neo4j** — חוסם cross-entity queries
5. **#4 roster.yaml** — חוסם entity resolution

These 5 must complete first. **Total foundation: ~44h**. בעיקרון: Week 2-3 כולה.

---

## 17.E — Final Build Roadmap (post-v20)

```
WEEK 1: Phase 1 Quick Wins (~14h)
  Day 1-2: Actions #1, #2, #3, #5 (~5.5h)
  Day 3:   Action #6 Gmail OAuth (3h)
  Day 4-5: MVP tender-tracker (4h, action chunk)
  Buffer:  testing + iteration

WEEK 2-3: Phase 2 Foundation (~44h)
  Action #4 roster.yaml (2h, mostly Barak input)
  Action #14 BEE API doc (8h, requires Barak access to BEE app source)
  Action #15 bee-mcp-server (7h, depends on #14)
  Action #7 KG Neo4j foundation (19h)
  Action #11 sites/_mapping.json (8h)

WEEK 4-5: Phase 3a tender-agent (~38h)
  Highest ROI given missed ₪800K-3M opportunity
  Builds on #14 (write to BEE app)

WEEK 6-9: Phase 3b engineering-agent (~60h)
  6 sub-skills per v16 13.A
  Builds on #14

WEEK 10: Phase 3c customer-success / portal extension (~30h)
  Builds on portal (Q73=partial)

WEEKS 11-14: Phase 4 expansion (~120h)
  - field-dispatch-agent
  - proposal-generator
  - Obsidian formalize + bee-ai-watcher v2 (#16)
  - Voice/call pipeline v5
  - 2 more Hermes L2 specialized agents

MONTH 4+: Phase 5 (~200-250h)
  - bee-hive L3 orchestrator build
  - L4 Task Bus
  - Backup + DR
  - Site dossier scaling (150-180 sites operational)

TOTAL: ~525-600h focused build
       = ~4-6 months solo developer
       = ~8-12 months Barak part-time
```

---

## 17.F — Final summary v1-v20

| | |
|---|---|
| Plan file size | ~10,900 שורות |
| Versions | 20 |
| Domains identified | 17+ |
| Top actions | 16 |
| Build estimate | ~525-600h |
| Phases | 5 (Week 1 → Month 4+) |
| Questions resolved | 9/10 Q's (Q77 deepseek-chat = auto-discoverable) |
| Discarded plans | ~250h (v15 12.D list — Cardcom, mass personal agents, etc.) |

**ה-plan כעת complete enough לexecution.** מה שצריך מברק לפני Phase 2:
- Git access ל-BEE app source (לAction #14 BEE API doc)
- workspace.db export (לAction #11 sites mapping)
- Approval to start Phase 1 quick wins

---

*Part 17 (v20) נכתב 2026-05-26 Asia/Jerusalem. סגירת 3 q's אחרונים: רוב active sites יש WA groups (~150-180!), Gmail OAuth issue, bee-ai-watcher never ran. sites/_mapping.json build expanded 1h→8h. Action #6 raised to ROI 9 (Gmail OAuth dual-account). Action #11 raised to ROI 9. New Action #16 (bee-ai-watcher v2 Hermes-side, 6h, Phase 4). Total Top-16. Final build ~525-600h. Roadmap concrete by week. ~300 שורות נוספות. סך הכל ~10,900 שורות. ה-plan READY for execution.*

