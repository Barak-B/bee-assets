# 🧠 Continuous Learning Architecture — Alfred + Hermes

**נכתב:** 2026-05-26 06:30 Asia/Jerusalem
**מבוסס על:** 4 חוקרי-משנה מקבילים (audit פנימי · SOTA 2026 patterns · eval frameworks · local fine-tuning)
**שאלת המקור:** *"יש לנו דרך לגרום להם להיות חכמים וללמוד כל הזמן? עד כמה?"*

## 📌 התשובה הקצרה

**כן, ב-6 שכבות שונות. עד כדי כך שהמודל המקומי שלך יוכל להחליף 70% מקריאות הענן תוך 2-3 חודשים.**

הנה הסיפור: יש לך כבר ~70% מהתשתית — אבל **לא הפעלת אותה**. ה-clarify loop קיים אבל ריק. self-improving skill מותקן אבל templates ריקים. Hermes Curator קיים אבל לא רץ. אז ה-"learning loop" שלך עובד היום ב-**"first attempt mode"** — כל הודעה מקבלת ניחוש ראשון בלי ללמוד מהקודמים.

לפני שמדברים על fine-tuning קסום — **קודם נסגור 4 לולאות שכבר חצי-קיימות**. אחר כך, ב-Phase 2+, הוסף DSPy + KTO על DictaLM 12B מקומי.

---

## 🚨 דגל משפטי קריטי לפני שמתחילים

**תיקון 13 לחוק הגנת הפרטיות נכנס לתוקף 14/8/2025.** הדרישות החדשות:
- **הסכמה מפורשת, נפרדת, גרנולרית** לאימון AI על נתוני לקוחות
- **ToS כללי לא מספיק יותר**
- **חציית גבולות (Replicate/Together/Modal/Lambda — כולם US)** דורשת הגנות נוספות
- **PPA יכול להטיל קנסות של מיליוני ש"ח** על הפרות governance

**מה זה אומר עבורנו:**
- ✅ **מותר:** אימון על תיקונים של ברק (תוכן שלו, הסכמתו)
- ✅ **מותר:** הסרת PII (טלפונים/שמות/כתובות) דרך DictaBERT NER לפני אימון
- ✅ **מותר:** אימון מקומי על RTX 4090 (לא חוצה גבולות)
- ❌ **לא מומלץ בלי משפטן:** אימון על שיחות לקוחות שלמות בענן
- ❌ **לא מומלץ:** העלאת WhatsApp history ל-Replicate/Together בלי הסכמת לקוחות

**לפני production deployment של LoRA — לדבר עם משפטנית.** עד אז: אימון רק על תיקוני ברק + PII-stripped corpus.

---

## 🏗️ 6 שכבות learning — ארכיטקטורה מלאה

| שכבה | מה לומדים | קלט | פלט | סטטוס היום |
|---|---|---|---|---|
| 1️⃣ **Active learning** (clarify) | מה הוא ה-intent הנכון | תיקון של ברק | row ב-task-examples.md | 🟡 wired, **0 דוגמאות** |
| 2️⃣ **Self-improvement** (proposals) | מה לשנות בהתנהגות | תיקון 3× חוזר → memory.md | proposal ל-weekly review | 🔴 **templates ריקים** |
| 3️⃣ **Memory curation** | מה לזכור לטווח-ארוך | sessions + interactions | knowledge graph + facts | 🔴 **0 plugins פעילים** |
| 4️⃣ **Prompt optimization** (DSPy) | איך לנסח טוב יותר | dataset + judge | compiled prompt | 🔴 לא קיים |
| 5️⃣ **Continuous eval** | האם זה היה טוב | next message + judge | scores + alerts | 🟡 logging חלקי |
| 6️⃣ **Weight updates** (DPO/KTO) | התנהגות עמוקה יותר | preference pairs | LoRA adapter | 🔴 לא קיים |

כל שכבה — מה היא לומדת, מאיפה, איך מטמיעים.

---

## שכבה 1 — Active Learning (Clarification Loop)

### מה זה
כל פעם שברק מסווג מחדש משימה אחרי שAlfred ניחש לא נכון — הזוג (הודעה מקורית, תיוג נכון) נכנס ל-corpus של few-shot examples. הבא ש-router רואה הודעה דומה — הוא רואה את הדוגמא ויסווג נכון.

### מצב נוכחי
- `alfred-clarify.js` (641 שורות) — קוד מלא, ירוק
- `task-examples.md` — **ריק** (0 examples, רק template)
- `loadFewShotExamples()` ב-router (שורה 122-143) — קורא את הקובץ, פותח ל-12 הראשונים
- prompt caching עם 1h TTL — דוגמאות חדשות יחולו תוך שעה ב-cache
- `decisions.sqlite` — קיים, יש 2 רשומות test, אין `override` column מאוכלס

### למה ריק?
ה-confidence-gate של clarify רץ רק כשconfidence<0.85 (לDM) או <0.6 (לself-chat). כי DeepSeek-chat היה ה-default ההיסטורי וגם הוא הוחלף עכשיו ל-router החדש — confidence עולה כשעוברים ל-Anthropic. **רוב ההודעות לא מטוסעות לclarify כי confidence גבוה מספיק.**

### תיקון מומלץ
**הוסף "passive correction detector":** אם ברק עונה אחרי הודעת Alfred (תוך 30 דק') עם מילה שנשמעת תיקון — `/(לא|תקן|שגוי|אחרת|במקום|שכחת|פספסת)/i` — תרשום preference pair אוטומטית:
- `rejected` = הודעת Alfred הקודמת
- `chosen` = הודעת ברק (התיקון)
- שמור ב-`decisions.sqlite` עם `override=true`

**ROI:** מ-0 דוגמאות → מאות בשבוע. אין שינוי UX לברק.

**זמן:** 2-3 שעות לקודד + 1 שעה לבדוק.

---

## שכבה 2 — Self-Improvement Skill

### מה זה
ב-`~/.openclaw/workspace/skills/self-improving/` יש מנגנון שלם של:
- **3× rule:** אם ברק תיקן אותו דבר 3 פעמים בשבוע → מוצע ל-`memory.md`
- **Tiered memory:** HOT (≤100 שורות) · WARM (project-specific) · COLD (archive)
- **Weekly review cron:** ראשון 09:00 — סוקר 7 ימים, מציע 0-3 שיפורים
- **Constitutional protection:** לא יכול לערוך AGENTS.md ללא אישור מפורש

### מצב נוכחי
- כל הקבצים = templates ריקים
- weekly cron `739d1444` היה disabled (Phase 1 הפעלנו אותו!)
- `corrections.md` ריק
- `proposals-pending.md` לא קיים

### תיקון מומלץ
**אחרי שPhase 1 השאיר את ה-cron `weekly-self-review` פעיל, יחל לרוץ. אבל הוא צריך FOOD — תיקונים תועדו.** הדרך הזולה ביותר:

**Wire the Passive Correction Detector to corrections.md:**
- כל פעם שזוהה תיקון פסיבי (שכבה 1) → append ל-`corrections.md`
- weekly-self-review cron יקרא + יציע

**הפעל מיידית את:**
1. **memory.md hot tier** — 5 העדפות שכבר ידועות (להזין ידנית מ-MEMORY.md): "ברק עובד ב-E:\, לא C:\", "פלט עברי רק ב-⚡ *...*", "DM של ארכיון = drop", "DeepSeek היה default, עכשיו anthropic ראשי", "4 outbound destinations only"
2. **Heartbeat ה-30-דק' של alfred-heartbeat.js** — שיוסיף "found patterns" ל-reflections.md

**זמן:** 3-4 שעות (כולל הזנת memory.md ראשונית)

---

## שכבה 3 — Memory Curation

### מה זה
שני סוגים:
- **Hermes Curator** — בודק skills שנוצרו אוטומטית, מוחק stale (>30 ימים), מאחד duplicates. רץ כל 7 ימים.
- **Memory backend plugins** — 8 אפשרויות על דיסק. אף אחד לא פעיל.

### מצב נוכחי
- Hermes Curator: **קוד מוכן, אף פעם לא רץ** (אין skills agent-created עדיין)
- 8 memory plugins: byterover, hindsight, holographic, honcho, mem0, openviking, retaindb, supermemory — **0 פעילים**
- Hermes `state.db` (172MB) = פולל לסשנים, אין `feedback` table

### תיקון מומלץ
**הפעל Hermes Curator עם trigger נמוך יותר:**
```yaml
# config.yaml addition
curator:
  enabled: true
  interval_days: 7
  stale_after_days: 30
  archive_after_days: 90
```

**בחר memory backend (Q8 הבטחת — אבל לא הופעל):**
- **המלצה: Letta** (formerly MemGPT) — agent מחליט מה לזכור, paging core/recall/archival. מתאים ל-personal AI במקום knowledge graph כבד.
- אלטרנטיבה: **Honcho** — modeling של ה-user (איך ברק חושב, לא רק מה הוא אומר)
- לא מומלץ: byterover/hindsight/mem0 — אלה storage טהור, לא learning

**זמן:** 2 שעות להפעלת Curator + 4 שעות לwiring Letta/Honcho

---

## שכבה 4 — Prompt Optimization (DSPy MIPROv2)

### מה זה
**DSPy** (Stanford, v3.2.1) — declarative framework שמכניסים לו:
1. **Program:** הסכמה של ה-pipeline (router → classify → enrich → compose)
2. **Dataset:** 100-300 דוגמאות (intent, message, ground_truth_response)
3. **Metric:** judge prompt שמדרג

ויוצא: prompt מקומפל אופטימלי + few-shot demos. גרסה חדשה כל שבוע על traffic חי.

### מצב נוכחי
**לא קיים.** Alfred משתמש ב-system prompt קבוע + manual few-shot.

### תיקון מומלץ
**שלב 1:** התקן DSPy על bee-prod-1 או על Windows הראשי:
```bash
pip install dspy-ai
```

**שלב 2:** הגדר Alfred כ-DSPy program. דוגמת skeleton:
```python
import dspy

class AlfredRouter(dspy.Module):
    def __init__(self):
        self.classify = dspy.ChainOfThought("message -> intent, urgency, language")
        self.enrich = dspy.Predict("intent, message -> entity_hints")
        self.compose = dspy.Predict("intent, entities, message -> hebrew_reply")
    
    def forward(self, message):
        intent = self.classify(message=message)
        entities = self.enrich(intent=intent.intent, message=message)
        return self.compose(intent=intent.intent, entities=entities, message=message)
```

**שלב 3:** Dataset מ-task-examples.md + decisions.sqlite (ברגע שיש מספיק).

**שלב 4:** Compile עם MIPROv2 כל שבוע:
```bash
dspy compile --program alfred_router.py --dataset task-examples.md --optimizer mipro_v2 --auto light
# ~$2, ~20 דקות
```

**זמן:** 4-6 שעות לסשן ראשון + 30 דקות/שבוע אחרי.

### חלופה — GEPA
**GEPA (ICLR 2026 Oral)** = 35× פחות rollouts מGRPO, מצליח ב-100 דוגמאות. אם MIPROv2 יקר מדי — לעבור ל-GEPA.

---

## שכבה 5 — Continuous Eval

### מה זה
לא רק לוג, אלא **judging + auto-rollback:**
1. **Langfuse v3** — observability + datasets + experiments (self-host על bee-prod-1)
2. **Inspect AI** (UK AISI, v0.3.225) — nightly Hebrew regression suite
3. **Promptfoo** — CI gate: לא משחררים prompt חדש אם רגרסיה על 50 cases קבועות

### Judge חינמי (חכם!)
**"next user message = correction" detector:**
- אם ההודעה הבאה של ברק מכילה תיקון → ה-previous response קיבל "bad"
- 70% מהcases נפתרים ככה ב-regex עברית פשוט
- ה-30% הנותרים → Haiku 4.5 ($1/$5 per MT)

### Shadow A/B pattern (השלב המעניין)
- 10% מ-traffic → candidate prompt רץ **async** (אחרי שתגובת המקור כבר נשלחה)
- Judge מדרג שניהם
- Auto-graduate: 1% → 5% → 20% → 50% → 100% — paired bootstrap p<0.05
- אם רגרסיה → auto-rollback דרך Langfuse prompt label

### מצב נוכחי
- `decisions.sqlite` — 2 records, אין dashboard
- `alfred-cost-monitor` — 1 record מ-7/5, ואז עצר
- אין judge, אין experiments

### תיקון מומלץ
**Langfuse על bee-prod-1 (CX52 — מספיק):**
```bash
git clone https://github.com/langfuse/langfuse
docker compose up -d  # postgres + clickhouse + redis + minio + web
# UI על :3000, OTLP על :3000/api/public/otel
```

**Instrument Alfred:**
```bash
pip install openllmetry traceloop-sdk
# ב-alfred-router.js: add traceloop instrumentation
```

**Inspect AI nightly:**
```python
# 100 hebrew test cases → score Alfred replies
inspect eval alfred_hebrew.py --model anthropic/claude-haiku-4-5
```

**Wire next-msg-correction detector:**
```javascript
// in alfred-handle.js — after each WA send, watch 30 min for next inbound
if (next_msg.match(/(לא|תקן|שגוי|אחרת)/i)) {
  langfuse.score({ traceId: prev.traceId, name: "correction", value: 0 });
}
```

**עלות:** $32/חודש לכל ה-stack (Haiku judge + Inspect nightly + DSPy weekly compile).

**זמן:** 1 יום setup ראשוני + שעות ספורות לwire כל source.

---

## שכבה 6 — Weight Updates (DPO/KTO local)

### מה זה
LoRA adapter על DictaLM 3.0 12B שמתעדכן שבועי על base ה-preference pairs שאסף ב-clarify loop.

### למה דווקא DictaLM 3.0 12B?
- **Hebrew-native** — 200B Hebrew tokens trained
- **Tool calling שמור** — לא נשבר ב-LoRA
- **65K context** — מספיק ל-Alfred
- **Apache 2.0**
- **על RTX 4090 24GB** — נכנס ב-QLoRA via Unsloth (60% פחות זיכרון)
- **שוחרר Dec 2025** — מודרני, נתמך

### מצב נוכחי
**לא קיים בכלל ב-Alfred.** ברק רץ על Anthropic/DeepSeek cloud בלבד.

### תיקון מומלץ — בגלים

**Wave A (כשיש 100 preference pairs):**
- **KTO** במקום DPO (90% פחות "desirable" examples נדרשים — נתון binary, לא pairs)
- Unsloth + Mistral Nemo 12B base + QLoRA r=16
- אימון 1-2 שעות על RTX 4090 (~$0.50 חשמל) או RunPod H100 Community $1.99/hr × 2hr = $4

**Wave B (כשיש 500+ pairs):**
- DPO על DictaLM 12B
- שילוב 10-20% generic tool-call examples כדי למנוע catastrophic forgetting
- Held-out 50 hebrew pairs כ-golden set
- Promote רק אם ≥55% win rate vs current

**Wave C (חצי שנה+):**
- Workflow שבועי אוטומטי:
  1. Collect → format → train → eval → deploy → monitor
  2. אם new LoRA underperforms → rollback אוטומטי
  3. Ollama serve GGUF (Q4_K_M quantized)
- ROI break-even: אם cloud Hebrew LLM spend > $30/חודש (סביר)

### תיקון מומלץ — Quick win
**Phase 1 (תוך שבוע):** DictaLM 3.0 **1.7B** מקומית כ-intent classifier בלבד.
- מתאמן ב-30 דקות על RTX 4090 (חינם)
- מחליף את `alfred-router.js classify()` ב-70% מהמקרים (bulk intent)
- חוסך הרבה cloud calls
- אם confidence < 0.6 → fall back ל-Claude Sonnet ב-cloud

**עלות:** ~$0 marginal אם RTX 4090 קיים, אחרת RunPod $4-15/run.

---

## 🎯 סדר ביצוע מומלץ (אחרי Phase 1)

### Wave 8 — Activate dormant scaffolding (~10 שעות, שבוע 1)
1. **Passive correction detector** ב-alfred-handle.js (2-3h) → מאכלס task-examples.md אוטומטית
2. **memory.md hot tier ראשוני** (1h) → 5 העדפות ידועות
3. **Hermes Curator הפעלה** (30 min) → config.yaml + restart
4. **Letta-style memory plugin** ל-Hermes (4h) → activate `memory.provider: letta`

### Wave 9 — Eval foundation (~12 שעות, שבוע 2)
5. **Langfuse self-host** על bee-prod-1 (4h) → docker-compose
6. **OpenLLMetry instrumentation** ב-Alfred (3h) → spans ל-Langfuse
7. **Next-msg-correction judge** (2h) → רגקס + Langfuse score()
8. **Inspect AI 100-case Hebrew suite** (3h) → nightly cron

### Wave 10 — Prompt optimization (~16 שעות, שבוע 3-4)
9. **DSPy program** ל-alfred-router (6h)
10. **Dataset** מtask-examples.md + decisions.sqlite (2h)
11. **MIPROv2 weekly compile cron** (2h setup)
12. **Shadow A/B** infrastructure (6h) → 10% traffic to candidate

### Wave 11 — Local DictaLM (~20 שעות, חודש 2)
13. **Setup Unsloth + DictaLM 1.7B** מקומית (4h)
14. **Replace intent classifier** עם local DictaLM (6h)
15. **Hardening + monitoring** (4h)
16. **Wave A — KTO על 100 pairs** (6h)

### Wave 12+ — Continuous fine-tuning (ongoing)
17. **Wave B — DPO על 500+ pairs** (חודש 3)
18. **Wave C — Weekly auto-retrain workflow** (חודש 4-5)
19. **Eval gate על kayak deploy** (חודש 4-5)

**סה"כ:** ~60 שעות מפוצלות לגלים. ROI:
- אחרי Wave 8 — לולאות הtask-learning מתחילות להתאכל
- אחרי Wave 9 — יש visibility מלא + יכולת A/B
- אחרי Wave 10 — prompts מתאופטמים אוטומטית שבועי
- אחרי Wave 11 — 70% מ-intent classification מקומי = חיסכון $20-50/חודש cloud
- אחרי Wave 12 — Alfred ילמד התנהגות עמוקה יותר (formats, נימוסים, decision patterns)

---

## 💰 סיכום עלויות

| שכבה | Setup | תפעול חודשי | הערות |
|---|---|---|---|
| 1️⃣ Passive correction | 3h dev | $0 | רגקס, חינם |
| 2️⃣ Self-improvement | 3h dev | $0 | weekly review cron כבר פעיל |
| 3️⃣ Memory curation (Letta) | 4h dev | $0-5 (Letta OSS) | Hermes Curator חינם |
| 4️⃣ Prompt opt (DSPy MIPROv2) | 6h dev | ~$8/חודש | weekly compile × $2 |
| 5️⃣ Continuous eval (Langfuse) | 10h dev | ~$5 (Haiku judge) + €0 infra | Langfuse על CX52 הקיים |
| 6️⃣ Local LoRA (DictaLM 12B) | 20h dev | ~$0 (RTX 4090) או $4-15/run | תלוי בhardware |
| **סה"כ** | **~60h** | **~$13-50/חודש overhead** | חיסכון פוטנציאלי $20-50/חודש |

---

## 🚨 מה אסור לעשות

1. **❌ אימון על שיחות לקוחות שלמות בלי הסכמה.** PPL Amendment 13 — קנסות PPA. אופציה: לעבוד עם משפטנית למסמך הסכמה לכל לקוח, או רק על תוכן ברק.

2. **❌ העלאת raw data ל-Replicate/Together/Modal.** Cross-border = exposure. אופציה: train locally only.

3. **❌ TextGrad / Trace OptoPrime ל-production.** 3-12 LLM calls per instance = יקר מדי לטראפיק יומיומי. שמור לpipeline batches.

4. **❌ Helicone.** הוא ב-maintenance mode מאז ש-Mintlify קנה אותם במרץ 2026. השרת לא יעודכן.

5. **❌ DictaLM 24B local.** דורש 48GB GPU. אם 12B לא מספיק → cloud H100 ($15-50/run).

6. **❌ Constitutional AI RLAIF end-user library.** Anthropic שחררו את ה-2026 Constitution כ-CC0, אבל אין lib סופי. תצטרך לממש מקצה ב-TRL.

7. **❌ הסכל על clarify confidence threshold הנמוך מ-0.6.** ייצור הצפת questions ל-self-chat.

---

## 🔬 איך נדע שזה עובד?

KPIs לעקוב:
1. **`correction_rate`** — % מהtasks שברק מתקן (אמור לרדת מ-X% ל-Y%)
2. **`few_shot_corpus_size`** — מספר דוגמאות ב-task-examples.md (אמור לעלות מ-0 ל-200+)
3. **`router_accuracy`** — % intent classifications שלא קיבלו override
4. **`cloud_cost_per_msg`** — צריך לרדת ב-30-50% אחרי local DictaLM
5. **`avg_judge_score`** — שכבה 5 — אמור לעלות עם DSPy compile
6. **`time_to_action`** — latency מinbound עד reply — לא להתדרדר

---

## 🤖 איפה אנחנו "חכמים"?

טבלת "extent" — עד כמה Alfred יכול ללמוד באמת:

| יכולת | היום | אחרי Wave 8-9 | אחרי Wave 10 | אחרי Wave 11-12 |
|---|---|---|---|---|
| לזכור פעם אחת | ✅ workspace files | ✅ + indexed in memory backend | ✅ | ✅ + LoRA weights |
| ללמוד מתיקון | 🟡 wired, 0 examples | ✅ passive detector | ✅ + DSPy auto-compile | ✅ + weight updates |
| לזהות דפוס חוזר | ❌ | ✅ 3× rule באלפרד | ✅ judge מציין | ✅ KTO learns |
| לשפר ניסוח עברי | ❌ | 🟡 manual review | ✅ DSPy + judge | ✅ KTO + local model |
| להציע שיפורים | 🔴 cron מובטל | ✅ weekly proposals | ✅ data-driven | ✅ |
| להחליף משימות routine | ❌ | ❌ | 🟡 prompt-level | ✅ local model decisions |

**שורת התחתון:** עד Wave 11-12 (4-5 חודשים), Alfred יוכל ללמוד מתיקונים, להציע שיפורים מבוססי-נתונים, לעדכן את ה-prompts שלו אוטומטית, ולהריץ אינטליגנציה עברית מקומית במחיר אפס. **זה הדבר הכי קרוב ל-"continuous learning" שאפשר בלי שנמצא בארגון של גוגל.**

---

## 📚 קישורי המחקר (4 sub-agent reports)

מקורות מלאים זמינים ב-task-notification logs. עיקריים:

- **DSPy MIPROv2:** https://github.com/stanfordnlp/dspy
- **GEPA (ICLR 2026):** https://arxiv.org/pdf/2507.19457
- **Hermes Curator v0.12:** https://hermes-agent.nousresearch.com/docs/user-guide/features/curator
- **Letta (formerly MemGPT):** https://www.letta.com/
- **Langfuse v3:** https://langfuse.com/self-hosting
- **Inspect AI:** https://inspect.aisi.org.uk/
- **DictaLM 3.0:** https://arxiv.org/pdf/2602.02104
- **Unsloth:** https://unsloth.ai/
- **TRL (DPO/KTO):** https://huggingface.co/docs/trl
- **Israel Amendment 13 PPL:** https://iapp.org/news/a/israel-marks-a-new-era-in-privacy-law-amendment-13-ushers-in-sweeping-reform

---

## 🤝 מה השלב הבא?

**אם תאמר "yes":**
- אכין HTML visualization (כמו agent-architecture.html) שמראה את 6 השכבות חזותית עם progress bars
- אכין execution playbook לWave 8 ספציפית (10 שעות, מקצף-זה)
- אספאן 1-2 agents שיתחילו עכשיו לעבוד על Wave 8 quick wins (passive correction detector + memory.md hot tier)

**אם תאמר "review first":**
- אעצור פה, אתן לך לקרוא ולהחליט
- אחרי שתחליט אילו waves להתחיל, אגדיר ביצוע

**אם תאמר "skip to 12 (fine-tuning)":**
- אזהיר על PPL Amendment 13 שוב
- אבדוק שיש לך RTX 4090 או אלטרנטיבה
- נתחיל מאיסוף 100 preference pairs ראשון

הבחירה שלך.
