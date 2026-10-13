# @bee/quote-core — quote-lite

מנוע הצעת מחיר ראשונית ב-TypeScript טהור (ללא DOM, ללא שרת). קלט: נתוני סקר האתר; פלט: `QuoteVersion` — טיוטה בלתי-משתנה עם כמויות, מחירים, סה"כ, תנאים ו-hash.

תת-קבוצה של `docs/plan/specs/12-cpq-documents-spec.md` שנועדה לעבור כמו שהיא ל-`bee-live` (`modules/quotes`) ב-M1–M2.

## שימוש

```ts
import { buildQuote, seedCatalog, seedPricingRules } from '@bee/quote-core'

const quote = await buildQuote(
  { projectId, projectName, address, roofType: 'flat', usableAreaM2: 120, targetKwp: 15,
    inverterBrand: 'SolarEdge', includeBattery: false, acCableLengthM: 35, phases: 3 },
  seedCatalog,        // או קטלוג אמיתי עם מחירים
  seedPricingRules,   // או כללים אמיתיים
)
quote.design.module_count   // 34
quote.lines                 // כתב כמויות: ציוד, קונסטרוקציה, כבלים, הגנות, עבודה, שירותים, אגרות
quote.totals                // null כל עוד חסרים מחירים
quote.flags                 // מה ברק צריך להשלים
quote.snapshot_hash         // sha256 של ההצעה
```

## מה המנוע עושה

1. **תכנון מהיר** (`sizeSystem`): kWp מהיעד → מהשטח → מהצריכה; מספר מודולים; ממיר קטן ביותר מהמותג המועדף שעומד ב-`dc_ac_ratio_max`; אופטימייזרים כשנדרש; סוללה לפי בקשה; בדיקת שטח.
2. **ערכות** (`buildAssemblies`): מודולים, ממירים, אופטימייזרים, קונסטרוקציה לפי סוג גג, כבל DC/AC, הגנות AC/DC לכל ממיר, הארקות, הכנה למונה, עבודה (למודול לפי סוג גג, לממיר, מנוף), שירותים (תכנון, קונסטרוקטור, בודק, ליווי חח"י), אגרות (passthrough).
3. **תמחור** (`priceLines`): עלות → ₪ לפי שער → מרווח לפי סוג → מחיר יחידה; עבודה ממחירון מכירה; אגרות ללא מרווח ומחוץ לסה"כ.
4. **סה"כ** (`computeTotals`): עיגול לצעד, מע"מ, ₪/kWp; שורות ללא מחיר נספרות ולא נכללות.
5. **snapshot**: JSON קנוני + sha256; `requiresHumanPick: true` — אין שליחה ללקוח.

## מחירון, גרסאות ושינויים

- `pricingReadiness(catalog, rules)` — מה עוד חסר כדי שהצעה תצא עם מחירים (עלויות, מט"ח, מע"מ, מרווחים, עבודה לפי גג, תוקף, לוח תשלומים שמסתכם ל-100%, פרמטרי תכנון).
- `parsePriceListCsv` / `rowsFromTable` / `applyPriceList` — ייבוא מחירון ספק (כותרות בעברית או באנגלית, `;`/`,`/טאב, מטבעות `₪`/`$`/`€`), דיווח מק"טים לא מוכרים ושורות פסולות. `priceListTemplateCsv` מייצא תבנית למילוי.
- `buildQuote(..., { previous })` — גרסה N+1 עם אותו מספר הצעה, `supersedes_hash` ו-`changes` (נוסף/הוסר/השתנה + הפרש בסה"כ). `diffQuotes` זמין גם בנפרד.
- `BOQ_SECTIONS` — פרקי כתב הכמויות `08.01`–`08.08` לפי התבנית.
- `SUGGESTED_SIZING` — נקודת פתיחה הנדסית לישראל (לא מחירים), תמיד "לא מאומת" עד כיול.

באפליקציה ממלאים את כל אלה במסך "מחירון" — אין צורך לערוך את קובצי הזרע.

## מה חסר כדי שההצעה תהיה אמיתית (`needs_owner_input`)

| קובץ | מה למלא |
|---|---|
| `src/seed/catalog.seed.json` | `unit_cost` + `currency` לכל פריט ממחירון ספק; דגמים אמיתיים; `fx_rates` |
| `src/seed/pricing-rules.seed.json` | `vat_rate`, מרווחים לפי סוג, `labour_per_module_ils` לפי גג, `sizing.*`, תוקף, עיגול, לוח תשלומים |

**כיול:** אחרי מילוי — להריץ מול 2–3 הצעות אמיתיות מהעבר ולהוסיף אותן כבדיקות זהב ב-`engine.test.ts` (יעד: ±5%).

## פיתוח

```bash
npm install --legacy-peer-deps   # npm 10 נכשל ב-peer resolution של vitest בלי הדגל
npm test
npm run typecheck
```
