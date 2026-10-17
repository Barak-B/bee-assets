# @bee/quote-engine — ליבת מנוע הצעות המחיר (M1)

הליבה של אבן הדרך M1 ("קטלוג ותמחור", `docs/plan/specs/16-execution-plan.md` §5) לפי `docs/plan/specs/12-cpq-documents-spec.md`: **הצעה מחושבת מערכה — מספרים בלבד, עדיין בלי מסמך**.

קוד טהור ב-TypeScript, בלי DB ובלי רשת: אותו מודול ירוץ בשרת (`server/src/modules/{catalog,pricing}` ב-bee-live) וב-PWA (הצעה טיוטה אופליין). את הנתונים (מוצרים, מחירונים, ערכות, כללים, פרמטרים) מקבלים כארגומנטים; כאן אין אף מחיר, תעריף או סף.

## מה יש

| מודול | חבילת עבודה | מה הוא עושה |
|---|---|---|
| `src/expr` | WP-M1-03, WP-M1-05 | שפת הביטויים המשותפת ל-`qty_expr` (מפרט 12 §2.3) ולתנאי כללים (מפרט 13 §f.2). פרסר ומעריך משלנו, **ללא `eval`**, Decimal בלבד, לוגיקה תלת-ערכית: קלט חסר → `null` → "חסר נתון", לא ניחוש |
| `src/catalog` | WP-M1-01, WP-M1-02 | סכמות Zod ל-Product (15 kinds + `tech` לפי kind), Supplier, PriceList, PriceListEntry; `productReadiness` ("ללא מקור"); `resolveCost` (= `product_cost_v`: ספק מועדף, מחירון מאושר אחרון, שער מט"ח ליום ההצעה, staleness); `diffPriceLists` |
| `src/assemblies` | WP-M1-03 | הרחבת ערכות: `product_sku` / `product_ref` / `product_query` / ערכה מקוננת, עיגול, `min_qty`, אופציות, ולידציות; `validateAssembly` דוחה ביטוי לא חוקי / משתנה לא מוצהר |
| `src/rules` | WP-M1-05 | מנוע הכללים של `rules-seed.json`: סדר scopes, תוקף, `supersedes`, השפעת רמת אימות (`unverified` → block יורד ל-warn, שורה מסומנת "לאימות"), מיזוג שורות כפולות, והרצת `tests[]` של כל כלל |
| `src/pricing` | WP-M1-04, WP-M1-07 | `priceQuote()` — 14 צעדי מפרט 12 §3.1 (חוץ מצעד 4, BOM של eplan, שמגיע ב-M4): ערכות, שורות רגולטוריות, שורות ידניות, עלות, PricingRule, הנחות, ספי אישור, מע"מ, עיגול, תוקף, KPI ו-snapshot לכל שורה |

## עקרונות שהקוד אוכף

- **אין ניחוש.** חסר קלט, עלות, מרווח, שער או מע"מ → `issue` מסוג `HUMAN_INPUT_REQUIRED` / `MISSING_COST` עם שם השדה החסר, וההצעה `blocked`.
- **סף שלא הוגדר לא מאשר.** `ApprovalThreshold` שהסף שלו `null` שולח את ההצעה לאישור בעלים, עם הסיבה.
- **כל שורה מסבירה את עצמה.** `price_snapshot`: מוצר + `tech_hash`, מחירון ושורה, שער, כללי מחיר, ביטוי הכמות והקלטים ששימשו, וכללים רגולטוריים עם רמת האימות.
- **דטרמיניסטי.** אותו קלט → אותו פלט, גם כשסדר הקטלוג משתנה. Decimal בכל מקום, `ROUND_HALF_UP` לשורה ל-2 ספרות.
- **אגרות passthrough** מוצגות "לפי חשבון בפועל" עם האומדן, ולא נכנסות לסה"כ.

## הרצה

```bash
cd packages/quote-engine
npm install
npm test          # vitest
npm run typecheck # tsc
```

הבדיקות קוראות ישירות את `docs/plan/rules/rules-seed.json` ו-`docs/plan/rules/pricing-rules.json`. המחירים, המרווחים והשערים ב-`test/fixtures.ts` **מומצאים לבדיקה בלבד**.

## מה עוד לא כאן

- טבלאות, migrations, CRUD ו-UI (WP-M1-01/06) — שייכים ל-bee-live.
- ייבוא קבצי מחירון XLSX/PDF (WP-M1-02) — כאן רק ה-diff והאישור כפונקציה.
- כיול מלא מול הצעות אמיתיות (WP-M1-07). יש כבר שני מקרי כיול ב-`test/calibration.test.ts`: גיליון "תמחור מערכת קומפלט" מהמחירון 2026 (100 kWp → 210,000 ₪ לפני מע"מ) ונוסחת התמחור הביתית של B.E.E (2,900/2,700 ₪ ל-kWp). חסרים מחירוני ספקים לציוד והצעות שנחתמו כדי לכייל מרווחים לפי קטגוריה.
- `add_business_days()` (תלוי ב-`business_calendar`, WP-M0-08) ו-`tier()` (אין טבלת מדרגות ב-seed).
