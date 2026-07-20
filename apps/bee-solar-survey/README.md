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

חוזי jobs/loops: [`docs/HIVE_PLATFORM_SCHEMA.md`](../../docs/HIVE_PLATFORM_SCHEMA.md) · זרימת כוורת: [`docs/BEE_SOLAR_SURVEY_HIVE.md`](../../docs/BEE_SOLAR_SURVEY_HIVE.md)

## מה נלקח מתמיר

- RTL עברית, פרויקטים מקומיים, גיבוי/שחזור
- צילום מצלמה/גלריה, סימון על תמונה, GPS
- שדות חשמל/מונים/גג/ממירים + PDF

## מה נוסף ל־B.E.E / Wave 54

- מיפוי סוג גג עברית → enum קנוני (`flat` / `tile` / …)
- שטח שימושי, אזימוט (ברירת מחדל UI: **180** דרום), שיפוע, צריכה שנתית, יעד kWp/תקציב, העדפת ממיר (SolarEdge/KStar/ABB/Deye)
- ציון מוכנות ל־Wave 54 + ייצוא חבילת jobs לכוורת
- מיתוג B.E.E

### מיפוי גג (`ROOF_HE_TO_CANONICAL`)

| עברית (UI) | Wave 54 `roofType` |
|---|---|
| בטון | `flat` |
| רעפים | `tile` |
| פנל מבודד | `metal-standing-seam` |
| איסכורית | `metal-trapezoidal` |
| קרקע | `ground` |
| אחר / לא מוכר | `other` |

## הרצה

```bash
cd apps/bee-solar-survey
npm install
npm run dev      # מקומי (Vite)
npm test         # schema + hive export
npm run build    # dist/ ל־Cloudflare Pages
npm run preview  # בדיקת build מקומית
```

דרישות: Node 20+ (נבדק עם Node 22).

## פריסה (Cloudflare Pages)

| הגדרה | ערך |
|---|---|
| Root | `apps/bee-solar-survey` |
| Build | `npm run build` |
| Output | `dist` |
| `vite` base | `./` (נתיבים יחסיים — מתאים ל־Pages subdirectory אם יידרש) |

PWA: `public/manifest.json` · אייקון `icon.svg` · `display: standalone`.

## מפת מודולים

| קובץ | תפקיד |
|---|---|
| `src/main.ts` | UI (רשימה/טופס), שמירה אוטומטית, כפתורי ייצוא |
| `src/schema.ts` | מיפוי גג, GPS, completeness, `toDesignSuitePayload` |
| `src/hive.ts` | בניית jobs Collect → Edit → Dispatch + הורדת JSON |
| `src/db.ts` | IndexedDB (`bee-solar-survey` v1) |
| `src/photos.ts` | דחיסת תמונות + GPS |
| `src/pdf.ts` | PDF טיוטה (עברית דרך canvas — jsPDF בלי גופן עברי) |
| `src/types.ts` | טיפוסים משותפים + תוויות שדות תמונה |

## מוכנות ל־Wave 54 (completeness)

מ־`assessCompleteness` ב־`schema.ts`. **חובה** ל־`readyForWave54`:

1. שם פרויקט
2. כתובת
3. סוג גג
4. לפחות תמונה אחת בשדה `roof` או `siteOverview`
5. שטח שימושי **או** יעד kWp / תקציב

מומלץ (משפיע על הציון, לא חוסם): סוקר, מפסק ראשי, צילום לוח חשמל, GPS, אזימוט, שיפוע.

ציון: עד **70** מ־5 חובה + עד **30** מ־6 מומלץ (`score` 0–100).

אזהרה: אם ממלאים גם kWp וגם תקציב — Wave 54 מצפה לאחד מהם; הייצוא מעביר את שניהם עם warning.

ייצוא חלקי כשחסרים שדות חובה: collect (`queued`) + edit (`blocked_trust`) — **בלי** `dispatch.draft`.

## אחסון מקומי

IndexedDB name: `bee-solar-survey` (version 1)

| Store | Key | הערות |
|---|---|---|
| `projects` | `id` | רשומת סקר |
| `photos` | `id` | index `byProject` → `projectId`; data URL + sha256 |
| `meta` | `key` | רשימת סוקרים אחרונים (עד 20) |

- שמירה אוטומטית ~800ms אחרי שינוי (רק אם יש שם פרויקט)
- **גיבוי / שחזור** מורידים/טוענים JSON עם `projects` + `photos`
- מחיקת פרויקט מוחקת גם את תמונותיו

## תמונות

- דחיסה: מקסימום צלע 1600px, JPEG quality 0.72
- מקסימום **10 תמונות לשדה** (`PhotoFieldKey`)
- sha256 מחושב על ה־data URL אחרי דחיסה
- שדות: לוח חשמל, פסי צבירה, תוואי כבילה, גג, ממירים, מנוף, מבט אתר

## ייצוא כוורת

כפתור **ייצוא כוורת** מוריד `hive-site-survey-{8-char-id}.json`:

```json
{
  "exportedAt": "…",
  "app": "bee-solar-survey",
  "hiveModel": "Collect → Edit → Dispatch",
  "trust": { "tier": "L1", "law2": "Human picks — no customer auto-send" },
  "jobs": [/* collect, edit, optional dispatch.draft */]
}
```

| Toast | משמעות |
|---|---|
| «ייצוא כוורת מלא» | 3 jobs כולל `dispatch.draft` |
| «ייצוא חלקי» | 2 jobs — edit ב־`blocked_trust` |

גיבוי מלא: `bee-survey-backup-YYYY-MM-DD.json` (`projects` + `photos`).

חוזה job: [`platform/schema/job.schema.json`](../../platform/schema/job.schema.json) · פירוט לולאות: [`docs/HIVE_PLATFORM_SCHEMA.md`](../../docs/HIVE_PLATFORM_SCHEMA.md).

## פתרון תקלות

| תסמין | סיבה / פעולה |
|---|---|
| Toast «ייצוא חלקי» | חסרים שדות חובה — בדוק ציון מוכנות בראש הטופס |
| GPS נכשל | דרוש HTTPS (או localhost) + הרשאת מיקום; timeout 15s |
| נתונים נעלמו בדפדפן אחר | IndexedDB מקומי למכשיר — השתמש בגיבוי/שחזור |
| PDF עם עברית «שבור» | הצפוי: טקסט עברי מצויר ל־PNG; גופני מערכת (Heebo/Arial) |
| `npm run build` נכשל ב־`tsc` | תקן שגיאות TypeScript לפני Vite |
| PWA לא מתקין | ודא manifest + אייקון נגישים מ־`dist/` אחרי build |

## סטטוס חיבורים

| פריט | מצב |
|---|---|
| PWA שטח | ✅ בקוד |
| ייצוא hive JSON | ✅ |
| בדיקות | ✅ `npm test` |
| Supervisor / Alfred drafts | ⏳ אחרי wire Brain Bus |
| Cloudflare Pages | ⏳ לחבר פרויקט ל־`apps/bee-solar-survey` |
