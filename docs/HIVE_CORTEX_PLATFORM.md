# פלטפורמת מוח הכוורת — BEE Hive Cortex Platform

> **מטרה:** מיגרציה של כל ה-AIים למוח משותף אחד, ואז ריצה אוטונומית רציפה — איסוף → עריכה → שיגור — כך שהחברה עובדת בזכות AI, בלי לאבד שליטה.
>
> **זה לא מוצר חדש במקביל ל-spine.** זו שכבת הבקרה שמפעילה את Alfred, Hermes, Wave 53–55, Max ו-Claude על אותו קנון.
>
> **עודכן:** 2026-07-11 · מקס

---

## 1 — מה הבעיה האמיתית

יש לנו כבר חלקים חזקים:

| יש | חסר |
|---|---|
| קנון ב-git (`BRAIN`, `AGENT_CANON`, LLDs) | הקנון לא נטען אוטומטית לכל המוחות החיים |
| Alfred + Hermes חיים | אין מפקד אחד שמעיר סוכנים בלולאה |
| Spine מתוכנן (בנק/רכש/הצעות/הנה״ח) | אין runtime שמחבר איסוף→עריכה→שיגור |
| Sync git→Obsidian→Graphify | חד-כיווני; לא חוזר לסוכנים |
| Work-ledger / intake (Phase 1) | לא הפך לפלטפורמה קבועה |

**התוצאה היום:** מוחות נסחפים, עבודה ידנית, AI עוזר — החברה לא *רצה* על AI.

**היעד:** כל AI מדבר עם אותו מוח · סוכנים רצים 24/7 · ברק מאשר רק מה שנוגע באנשים אמיתיים.

---

## 2 — ההגדרה במשפט

```
Hive Cortex = Brain Bus + Work Runtime + Trust Gate
```

1. **Brain Bus** — מיגרציה: כל AI נרשם, מקבל `BEE_CANON`, ולא מנחש עובדות מפעיל  
2. **Work Runtime** — אוטונומיה: לולאות Collect / Edit / Dispatch על ledger עבודה  
3. **Trust Gate** — שליטה: Law #1/#2 + L0/L1/L2 · אין שליחה ללקוח בלי ברק

---

## 3 — מיגרציית מוחות (Brain Migration)

### 3.1 מי נחשב "AI שלנו"

| ID | Runtime | תפקיד | יעד מיגרציה |
|---|---|---|---|
| `alfred` | OpenClaw | Persona + WhatsApp + drafts | קורא `BEE_CANON.md` ב-startup |
| `hermes` | Hermes | כלים כבדים / memory / kanban | `external_dirs` → bee-canon |
| `max` | Cursor Cloud | Cortex ענן — תכנון + קוד ייחוס | קורא docs + BRAIN מ-git |
| `claude-local` | Claude Code מקומי | Port ל-BEE app / OAuth / E:\ | קורא BRAIN + PATHS |
| `wave-53a` … `wave-55` | Spine agents | בנק/רכש/הצעות/ledger/הנדסה/CS | ייבוא primitives + canon facts |
| `regulatory` / `tender` | Alfred skills | רגולציה / מכרזים | grounded ב-`knowledge-base/` |

### 3.2 מה "מוגר" אומר (Definition of Done למוח)

מוח נחשב **מוגר** רק אם כל אלה ירוקים:

1. רשום ב-`platform/schema/brain-roster.json`
2. מקבל `AGENT_CANON` / `BEE_CANON` בלי מגע יד בכל sync
3. עונה נכון על: בנק=Mercantile 17 · מע״מ חודשי · 4 יעדי WA בלבד
4. לא ממציא נתיבים — מפנה ל-`PATHS` או פותח `[OPEN]`
5. כותב תוצאות ל-work ledger (לא "דיבר ונעלם")

ה-runbook הקיים: `research/scripts/WIRE_AGENTS_TO_CANON.md` (על PR #2) = **שלב המיגרציה הראשון**, לא רעיון חדש.

### 3.3 זרימת המיגרציה

```
git canon (bee-assets)
    │  sync-vault-and-graphify -PushCanonToAgents
    ▼
BEE_CANON.md ──► Alfred workspace
            └──► Hermes bee-canon/
            └──► (עתיד) Max/Claude session bootstrap
    │
    ▼
brain-roster.json מוודא מי עלה / מי נסחף
```

---

## 4 — Runtime אוטונומי (Collect → Edit → Dispatch)

כל עבודה בחברה עוברת שלוש תחנות. סוכן יכול להיות Collect בלבד, או שרשרת מלאה.

### 4.1 Collect — איסוף
מקורות קבועים (לולאות, לא "כשזוכרים"):

| Loop | מקור | פלט |
|---|---|---|
| `collect.bank` | Mercantile CSV / portal | `BankTransaction` candidates |
| `collect.mail` | Gmail ספקים | raw messages / attachments |
| `collect.wa` | Alfred inbound | intake events |
| `collect.monday` | Monday boards | CRM deltas |
| `collect.sites` | SolarEdge / iSolarCloud / … | telemetry digests |
| `collect.regulatory` | gov.il RSS | regulatory items |
| `collect.canon-drift` | השוואת roster vs live agents | drift alerts |

### 4.2 Edit — עריכה / העשרה
| Loop | פעולה | Tier |
|---|---|---|
| `edit.normalize` | עברית, תאריכים, סכומים | 0 |
| `edit.dedup` | hard-key + pg_trgm | 0 |
| `edit.enrich` | קישור ללקוח/אתר/PO | 0–1 |
| `edit.anomaly` | price-anomaly וכו׳ | 0 |
| `edit.kb` | עדכון knowledge-base / הצעת עדכון לקנון | 1–2 |
| `edit.learn` | תיקוני ברק → examples / proposals | 1 |

### 4.3 Dispatch — שיגור
| Loop | פעולה | Trust |
|---|---|---|
| `dispatch.ledger` | `postLedgerEntry` | L1 (DB) |
| `dispatch.draft` | טיוטה לקבוצת drafts / self-chat | L1 |
| `dispatch.digest` | סיכום Neri / Sunday CS | L1 (יעדים מורשים) |
| `dispatch.alert` | ⚡ לברק על חריגה | L1 |
| `dispatch.customer` | **אסור** בלי Law #2 pick | — |

```
[Collect loops] → work-ledger (queued)
       ↓
[Edit loops]    → work-ledger (enriched / validated)
       ↓
[Trust Gate]    → allow DB / draft / block
       ↓
[Dispatch]      → ledger · ⚡ · drafts group · digests
```

---

## 5 — Trust Gate (לא מתפשרים)

| כלל | משמעות בפלטפורמה |
|---|---|
| Law #1 | Dispatch ל-WhatsApp רק ל-4 יעדים |
| Law #2 | כל פעולה מול אדם אמיתי = draft + אישור ברק |
| L0 | קריאה בלבד |
| L1 | כתיבת DB + טיוטות (ברירת מחדל לסוכנים) |
| L2 | auto-send צר ורק ברשימה לבנה מאושרת מראש |
| Tier-0 safety | `wire_sizing` / `protection` — בלי LLM |

הפלטפורמה **מפעילה** סוכנים. היא **לא** עוקפת את החוקה.

---

## 6 — רכיבי הפלטפורמה

| רכיב | תפקיד | מצב |
|---|---|---|
| `brain-roster` | מי המוחות, סטטוס מיגרציה | **מתחיל כאן** (`platform/schema/`) |
| `job-schema` | חוזה Collect/Edit/Dispatch | **מתחיל כאן** |
| `work-ledger` | מעקב input→output לכל בקשה | קיים כעיצוב Phase 1 · לחבר |
| `supervisor` | מעיר loops לפי cron/אירוע | לבנות |
| `canon-publisher` | דוחף BEE_CANON לכל המוחות | סקריפט קיים · להפעיל |
| `drift-monitor` | מזהה מוח שנסחף מהקנון | לבנות |
| `spine adapters` | 53/A–D, 54, 55 כ-workers | LLD+phase-a חלקי |
| `learning bus` | תיקונים→דוגמאות→הצעות קנון | מתוכנן ב-continuous-learning |

---

## 7 — איך זה הופך את החברה ל"עובדת בזכות AI"

לא סלוגן — רצף מדיד:

| שלב | החברה מרגישה | תנאי ירוק |
|---|---|---|
| **P0 Brain Bus חי** | כל ה-AIים עונים אותו דבר על עובדות יסוד | Alfred+Hermes+Max על אותו canon |
| **P1 Collect רץ** | מידע נכנס לבד (בנק/מייל/WA) | ≥3 collect loops על cron |
| **P2 Edit רץ** | רעש הופך לרשומות נקיות | dedup+normalize על הכל |
| **P3 Dispatch L1** | ברק מקבל טיוטות וכרטסות, לא כאוס | digests + drafts יומיים |
| **P4 Spine MVP** | בנק↔חשבונית↔כרטסת נסגר | שער M5 מ-mvp-build-plan |
| **P5 Learning** | המערכת משתפרת מתיקונים | corrections→examples פעיל |

---

## 8 — מה *לא* בונים

- לא WhatsApp bot חדש במקום Alfred  
- לא "סוכן אלוהים" אחד שעושה הכל (cortex = orchestrator, לא executor — protocol §1)  
- לא עקיפת Law #1 בשם אוטונומיה  
- לא אימון על שיחות לקוחות בענן בלי ייעוץ משפטי (תיקון 13)  
- לא לשכפל את ה-spine תחת שם חדש — הפלטפורמה *מפעילה* אותו

---

## 9 — קישור לקנון הקיים

| מסמך (PR #2) | תפקיד מול הפלטפורמה |
|---|---|
| `protocol_hive.md` | חוקה · Tiers · LLD shape |
| `BRAIN.md` | אינדקס סטטוס |
| `AGENT_CANON.md` | מטען המיגרציה |
| `WIRE_AGENTS_TO_CANON.md` | צעדי מיגרציה ראשונים על המכונה |
| `mvp-build-plan.md` | מה ה-spine workers בונים |
| `continuous-learning-plan.md` | שכבות הלמידה אחרי שה-runtime חי |
| `PATHS.md` | איפה רצים ה-loops |

---

## 10 — הצעד הבא המיידי

1. לאשר את האמנה הזו (המסמך)  
2. **P0 על המכונה:** להריץ `WIRE_AGENTS_TO_CANON` (Alfred + Hermes)  
3. **P0 בענן:** roster + job schema (כבר ב-`platform/`)  
4. **P1:** supervisor מינימלי + `collect.canon-drift`  
5. במקביל: dropoffs OB ל-spine (בנק/IM) כדי ש-Collect/Dispatch יהיו על דאטה אמיתי

פירוט ביצוע: [`plans/2026-07-11-hive-cortex-platform.md`](./plans/2026-07-11-hive-cortex-platform.md)
