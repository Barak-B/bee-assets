# בסיס ידע למקס — התמונה הברורה

> **תפקיד:** נקודת כניסה לסשן. לא מחליף את `research/BRAIN.md` על branch Claude — מסכם אותו מדויק.
> **עודכן:** 2026-07-11 · אחרי סקירה מחדש של PR #2, MVP plan, decisions, protocol, Cloud agents.

---

## א. במשפט אחד

אנחנו בונים **פלטפורמת מוח הכוורת (Hive Cortex)** שממגרת את כל ה-AIים למוח משותף אחד, ומריצה לולאות אוטונומיות Collect → Edit → Dispatch — על גבי **עמוד השדרה התפעולי-פיננסי** — כך שהחברה עובדת בזכות AI, בלי לאבד שליטה.

**אמנת הפלטפורמה:** [`HIVE_CORTEX_PLATFORM.md`](./HIVE_CORTEX_PLATFORM.md) · **תוכנית:** [`plans/2026-07-11-hive-cortex-platform.md`](./plans/2026-07-11-hive-cortex-platform.md) · **שלד:** `platform/`

הארכיטקטורה העסקית נעולה (2026-06-16). הפלטפורמה היא שכבת הבקרה שמפעילה אותה.

---

## ב. מי ומה

| | עובדה |
|---|---|
| ברק ברזל | בעלים · `barak-barzel@barak-e.com` |
| B.E.E | קבלנות חשמל + סולאר · ~137 לקוחות · 255 אתרים · 18 רכבים · 149 ממירים |
| בנק | Mercantile Discount **קוד 17** (לא הפועלים) |
| חשבוניות/הנה״ח | Invoice Maven בלבד |
| מע״מ | חודשי · מקדמות מס = 0% |
| צי ניטור | SolarEdge / iSolarCloud / Deye / KStar / ABB |
| מקס | Cursor Cloud cortex (הריצה הזו) |
| Claude (מקומי/ענן) | כתב את רוב הקנון ב-PR #2 |
| Alfred | OpenClaw — persona + WhatsApp + חוקה |
| Hermes | כלים כבדים (browser/code/memory/kanban) |

---

## ג. שלושה עידנים של עבודה (מה היה → מה נשאר)

### עידן 1 — פדרציה Alfred↔Hermes (מאי 2026)
**מטרה:** לבטל כפילויות (2 Baileys, 2 cron, firecrawl כפול) ולחלק עבודה.

**מה נשאר רלוונטי:**
- Alfred = WhatsApp voice + `dispatchSend()` (Law #1)
- Hermes = tools · memory · MoA
- תיקוני באגים שזוהו (router fallback הפוך, memory 97% err, 70 skills רדומים)
- Phase 1 patches / tender MVP / bridge recovery — חומר ייחוס, לא מוצר סופי

**מה לא המיקוד עכשיו:** מחקר federation רחב, 55-capability matrix, רשימות MCP להתקנה. זה היה שלב מיפוי.

### עידן 2 — חוקה + Graphify + נתיבים (יוני מוקדם)
**מטרה:** להפסיק לנחש. לכתוב חוקה. לבנות גרף ידע.

| תוצר | סטטוס |
|---|---|
| `protocol_hive.md` v2 | ✅ חוקה חיה |
| `PATHS.md` | ✅ נתיבים קנוניים (אחרי PathNotFound חי) |
| Graphify על מכונת ברק | ✅ אלפי nodes; DeepSeek backend |
| Obsidian vault path (Q67) | ✅ נפתר · `3-Projects\BEE\` |
| Sync git→vault→graphify | ✅ סקריפטים + hooks · מקומי בלבד |
| Canon → Alfred/Hermes runtime | ⏳ payload מוכן · wiring ממתין לאישור ברק |

### עידן 3 — Unified Data Spine (יוני אמצע–סוף) ← **כאן אנחנו**
**מטרה:** עמוד שדרה אחד: בנק → רכש → הצעות → הנה״ח + מוח הנדסי + CS.

| רכיב | LLD | קוד ייחוס | ב-BEE app חי? |
|---|---|---|---|
| 53/A bank-receipts | ✅ | ✅ Phase A (~1,175 LOC) | ❌ עדיין לא port |
| 53/B procurement + price-anomaly | ✅ | ✅ Phase A (~1,780 LOC) + benchmark | ❌ |
| 53/C proposals | ✅ | ❌ | ❌ |
| 53/D ledger | ✅ | ❌ | ❌ |
| 54 engineering (PV) | ✅ + 6 sub-skills | skeleton חסר | ❌ |
| 55 customer-success | ✅ | ❌ | ❌ |
| Shared primitives (lock/normalize/validate/survive) | — | ✅ ב-53/A | — |

**אודיט 2026-06-26:** 2 באגים CRITICAL ב-idempotency תוקנו · 9 HIGH · החלטות הוזרמו לגופי ה-LLD.

---

## ד. התמונה התפעולית (איך זה אמור לזרום)

```
Mercantile CSV          ספק (מייל/WA/PDF)              ליד (WA/Gmail)
      │                        │                            │
      ▼                        ▼                            ▼
   53/A BANK              53/B PROCUREMENT ──▶ 54 ENGINEERING ──▶ 53/C PROPOSALS
      │                        │                 (PV brain)           │
      │                        │                                      ▼
      └────────────┬───────────┘                              CustomerInvoice
                   ▼                                              │
              53/D LEDGER ◀───────────────────────────────────────┘
           כרטסות · AR/AP · מע״מ חודשי · ⚡ לברק
                   │
                   ▼
              55 CUSTOMER-SUCCESS (digest / AR nudges)
```

**חוקים שמחזיקים את הכל:**
1. רק 4 יעדי WhatsApp מורשים · אף לקוח/ספק ישירות
2. אדם בוחר — טיוטות, לא auto-send
3. לא ממציאים עובדות מפעיל (§3.6a)
4. `wire_sizing` + `protection` = Tier-0 בלי LLM לעולם

---

## ה. קו הכנות — מה אמיתי היום

**✅ אמיתי (קוד/מערכת שעובדים):**
- Importer + normalizer + validator + locks + dedup (53/A, 53/B Phase A)
- Price-anomaly detector (z-score, 7/7 pure tests)
- Demo bank CSV (read-only)
- Alfred + Hermes חיים על Windows
- Graphify + Obsidian sync על המכונה של ברק
- כל 6 ה-LLDs + 10 החלטות נעולות

**🟡 מתוכנן / schema בלבד (אל תמכור כעובד):**
- LLM extraction מאימייל/WA/PDF
- err_manifest read-back
- Lead-time learning
- FaultCase grounding
- 53/C, 53/D, 55 בקוד
- Port של phase-a לתוך BEE Operations app

**המשפט הנכון:** היום יש לנו **מנוע ייבוא דטרמיניסטי מוקפד + תחילת שכבה חכמה**. לא "מערכת AI שרצה על העסק".

---

## ו. איפה האמת יושבת ב-git

| מקום | תפקיד |
|---|---|
| `main` | נכסים ציבוריים בלבד (לוגואים, דוח מלאי) — **לא** הקנון |
| **PR #2** `claude/capability-extensions-collection-JjV2s` | **הקנון** · ~69K שורות · 221 קבצים · OPEN |
| PR #5 `cursor/brain-obsidian-bridge-436d` | חיזוק sync BRAIN↔Obsidian + `CLOUD_CORTEX_TOOLING` |
| PR #7 `cursor/max-knowledge-base-634e` | המסמך הזה |
| PR #1 | master-plan.html scaffold (צדדי) |
| PR #4/#6 | inventory HTML / AGENTS.md (תשתיות קלות) |

**קריאה חובה בסשן חדש (מה-branch הקנוני):**
1. `research/BRAIN.md`
2. `research/AGENT_CANON.md`
3. `research/PATHS.md`
4. `research/phase-3/mvp-build-plan.md` — השורה הבאה לבנות

---

## ז. מה חוסם ומה פתוח עכשיו

### חוסמים מברק (`bee-handoff/2026-06-16/`)
| קובץ | עדיפות | משחרר |
|---|---|---|
| `mercantile-sample.csv` | גבוה | 53/A חי |
| `invoice-maven-export-sample.csv` | גבוה | 53/D opening balances |
| `vendor-cable-tables/*.pdf` | בינוני | wire_sizing |
| `fault-cases/*` (3–5) | בינוני | fault_analysis |
| `customer-tier-weights.json` | נמוך | Wave 55 (יש defaults) |

### מה cloud יכול לבנות בלי dropoffs
- **Row 8:** Wave 54 engineering orchestrator skeleton + מבנה טבלאות ייחוס  
  (דורש Prisma instance של BEE app — או להמשיך כ-reference כמו 53/A)

### מה דורש מכונה מקומית
- Port phase-a → BEE app (row 1)
- Mercantile live (row 2)
- Gmail OAuth (row 4)
- כל דבר שנוגע ב-`E:\` / Obsidian / Tailscale

### כלי Cloud שחסרים (P0)
- Monday MCP — needsAuth
- Graphify HTTP MCP — לא רשום כאן
- Cursor Environment שמור — לא קיים (`environment: null` בעבר; עכשיו Personal env בסיסי)

---

## ח. מפת אבני דרך (מה ברק אמור להרגיש)

| # | אבן דרך | תחושה |
|---|---|---|
| M1 | בנק נכנס למערכת | "הבנק בפנים" |
| M2 | מייל ספק → PO | "אני מפסיק לשכוח הזמנות" |
| M3 | כרטסת תואמת IM | "אני רואה יתרה כמו הרו״ח" |
| M4 | הצעה E2E | "הצעה ב-90 שניות במקום 3 שעות" |
| M5 | Spine MVP | "אני סומך על הספרים" |
| M6 | Sunday digest | "יודע מי מתוך 137 צריך תשומת לב" |
| M7 | fault_analysis | "אבחון לפני הנסיעה לאתר" |

Spine MVP ≈ **87h** build ממוקד · Full parity ≈ **+152h**.

---

## ט. חלוקת אחריות

| מי | מה |
|---|---|
| **ברק** | dropoffs · אישורים · ולידציה על דאטה אמיתי · תבניות Word |
| **Cloud cortex (מקס/קלוד)** | LLDs · קוד ייחוס · בדיקות · KB · החלטות |
| **Local Claude Code** | OAuth · port ל-BEE app · ריצות על `E:\` |
| **bee-prod-1** | runtime: app + Postgres (+ Redis) |

---

## י. נתיבים קנוניים (תמצית — פרטים ב-PATHS.md)

| מה | איפה |
|---|---|
| Alfred scripts | `E:\Desktop\OpenClawAgent\` (שורש!) |
| OpenClaw workspace | `C:\Users\Barak\.openclaw\workspace\` |
| Hermes | `E:\bee-hermes\` |
| Secrets | `E:\Desktop\OpenClawAgent\secrets\bee-integrations.env` |
| Obsidian | `E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\` |
| bee-assets מקומי | `E:\bee-assets` |
| פורטים | Alfred≈3000 · Hermes≈3100 · n8n 5678 · Redis 6379 |

**אסור:** `OpenClawAgent\workspace\` או `\scripts\` — לא קיימים.

---

## יא. מסלולים צדדיים (לא לערבב עם ה-spine בלי בקשה)

| מסלול | מצב |
|---|---|
| מידול תלת־ממדי מרחפן | ריצת Cloud IDLE · design-first · אין קוד |
| Folder inventory HTML | ב-`main` (PR #3 merged) |
| master-plan.html (bee-build) | PR #1 draft |

---

## יב. כלל הפעלה למקס

1. קרא את הקובץ הזה → `HIVE_CORTEX_PLATFORM.md` → `BRAIN.md` מה-branch הקנוני.
2. דבר על המציאות לפי §ה (קו הכנות).
3. לפני נתיב → `PATHS.md`. לפני ledger/הנדסה → decisions.
4. לפני עיצוב רכיב → `protocol_hive` §7.
5. אל תפתח מחדש החלטות נעולות (LD/EA).
6. העדפת ברק: **הנדסה** לפני ניטור עסקי — אבל **P0 Brain Bus** קודם לכל (מיגרציית מוחות).
7. שינוי ארכיטקטורה → עדכון `BRAIN` + LLD באותו commit.
8. אוטונומיה ≠ שליחה ללקוחות. Collect/Edit חופשיים יותר; Dispatch תמיד דרך Trust Gate.

---

*סקירה מחודשת 2026-07-11. מקור הסטטוס המפורט נשאר `research/BRAIN.md` על PR #2.*
