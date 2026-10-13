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
- **הצעה ראשונית** (`src/quote.ts`, `src/quotePdf.ts` + `packages/quote-core`): כפתור "הצעה ראשונית" ברשימה ובטופס → `QuoteVersion` (JSON, עטוף כ-job `dispatch.draft`) + PDF עם סימן מים "טיוטה". כל מחיר הוא "לאימות" עד שממלאים את `packages/quote-core/src/seed/*.json`.
- **שיתוף** (`src/share.ts`): Web Share API (WhatsApp/קבצים) → לשונית חדשה ב-iOS מותקן → הורדה רגילה. זה מחליף `a.click()` שלא עבד ב-iOS.
- **אופליין**: service worker (`vite-plugin-pwa`) מקאש את האפליקציה, הגופנים (`public/fonts`, OFL) ואת מודול ה-PDF. אין בקשות ל-Google Fonts.

## הרצה

```bash
cd apps/bee-solar-survey
npm install
npm run dev      # מקומי
npm test         # schema, hive export, RTL, PDF, quote adapter
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
