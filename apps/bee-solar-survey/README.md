# B.E.E Solar Site Survey — Hive Collect

סקר אתר סולארי לשטח, מבוסס על אפליקציית תמיר (`solar-survey.pages.dev`) ומותאם ל**מודל הכוורת** של ברק אלקטריק אנג׳ינירינג.

## מודל הכוורת

```
שטח (סוקר)
   │
   ▼
collect.site-survey     ← האפליקציה הזו (IndexedDB + תמונות + PDF)
   │
   ▼
edit.normalize-site-survey  ← DesignSuiteReq.site/target ל־Wave 54
   │
   ▼
dispatch.draft          ← טיוטה ל־drafts group / ברק בלבד (Law #2)
   │
   ▼
wave-54.designSuite     ← pv_design / wire_sizing / protection / BOM / forecast
```

- **Law #1:** אין שליחה ללקוח/ספק מתוך האפליקציה.
- **Law #2:** ייצוא הכוורת הוא תמיד `requiresHumanPick: true`.
- **§3.6a:** `customer.id` נשאר `[OPEN]` עד קישור CRM — לא ממציאים מזהה.

## מה נלקח מתמיר

- RTL עברית, פרויקטים מקומיים, גיבוי/שחזור
- צילום מצלמה/גלריה, סימון על תמונה, GPS
- שדות חשמל/מונים/גג/ממירים + PDF

## מה נוסף ל־B.E.E / Wave 54

- מיפוי סוג גג עברית → enum קנוני (`flat` / `tile` / …)
- שטח שימושי, אזימוט, שיפוע, צריכה שנתית, יעד kWp/תקציב, העדפת ממיר (SolarEdge/KStar/ABB/Deye)
- ציון מוכנות ל־Wave 54 + ייצוא חבילת jobs לכוורת
- מיתוג B.E.E

## דוחות והצעת מחיר ראשונית

- **PDF סקר** (`src/pdf.ts` על `src/pdfkit.ts`): טקסט עברי אמיתי עם Heebo מוטמע (jsPDF + bidi), גלישת שורות, תמונות ביחס נכון, מספרי עמודים ו-hash תוכן בכותרת התחתונה. ~35 KB לדוח של 2 עמודים.
- **מחירון** (`src/pricingScreen.ts`, `src/pricing.ts`): כפתור "מחירון" ברשימה. עלויות לכל מק"ט, מרווחים, מע"מ, שערי מט"ח, עבודה למודול לפי גג, פרמטרי תכנון ולוח תשלומים — נשמר ב-IndexedDB ועובד אופליין. ייבוא מחירון ספק מ-CSV או Excel (שורת כותרת עם מק"ט + עלות, כולל כותרות בעברית), הורדת תבנית, גיבוי/שחזור. מד מוכנות מראה בדיוק מה חסר.
- **הצעות מחיר** (`src/quotesDialog.ts`, `src/quote.ts`, `src/quotePdf.ts` + `packages/quote-core`): כפתור "הצעות מחיר" ברשימה ובטופס פותח חלון לסקר: חישוב גרסה חדשה מהסקר + המחירון, רשימת גרסאות שמורות (אינן משתנות; אותו תוכן = אין גרסה חדשה), ולכל גרסה PDF, Excel ללקוח, Excel פנימי ו-JSON. מגרסה 2 ה-PDF כולל "מה השתנה". כל זה טיוטה בלבד (`dispatch.draft`, `requiresHumanPick`).
- **כתב כמויות Excel** (`src/boqXlsx.ts`, ExcelJS): גיליונות `סיכום`, `פרמטרים` ופרק לכל `08.CC` לפי `docs/plan/templates/boq-xlsx-layout.md`; RTL, נוסחאות חיות עם ערכים מחושבים, שמות מוגדרים (`CH_08_02_TOTAL`, `TOTAL_INCL_VAT`…). תצוגת לקוח נעולה וללא עלויות; תצוגה פנימית עם עלות, רווח ₪/%, מק"ט, מקור כמות ואימות.
- **שיתוף** (`src/share.ts`): Web Share API (WhatsApp/קבצים) → לשונית חדשה ב-iOS מותקן → הורדה רגילה. זה מחליף `a.click()` שלא עבד ב-iOS.
- **אופליין**: service worker (`vite-plugin-pwa`) מקאש את האפליקציה, הגופנים (`public/fonts`, OFL) ואת מודול ה-PDF. אין בקשות ל-Google Fonts.

## הרצה

```bash
cd apps/bee-solar-survey
npm install
npm run dev      # מקומי
npm test         # schema, hive export, RTL, PDF, quote adapter, BOQ Excel, price-list import
npm run build && npm run e2e   # Playwright: דוח, מחירון → הצעה מתומחרת, Excel, גרסאות, אופליין
npm run build    # dist/ ל־Cloudflare Pages
```

## פריסה (Cloudflare Pages)

- Root: `apps/bee-solar-survey`
- Build: `npm run build`
- Output: `dist`

## ייצוא כוורת

כפתור **ייצוא כוורת** מוריד JSON:

```json
{
  "hiveModel": "Collect → Edit → Dispatch",
  "trust": { "tier": "L1", "law2": "Human picks — no customer auto-send" },
  "jobs": [/* collect, edit, optional dispatch.draft */]
}
```
