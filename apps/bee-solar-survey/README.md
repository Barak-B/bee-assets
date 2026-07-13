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

## הרצה

```bash
cd apps/bee-solar-survey
npm install
npm run dev      # מקומי
npm test         # schema + hive export
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
