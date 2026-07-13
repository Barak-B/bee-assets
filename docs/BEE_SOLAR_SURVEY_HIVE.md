# סקר אתר סולארי בכוורת B.E.E

> **מקור UX:** אפליקציית תמיר — https://solar-survey.pages.dev/  
> **יעד:** Collect לשטח → Edit ל־Wave 54 DesignSuite → Dispatch טיוטה (Law #2)  
> **קוד:** `apps/bee-solar-survey/`  
> **חוזי jobs/loops:** [`HIVE_PLATFORM_SCHEMA.md`](HIVE_PLATFORM_SCHEMA.md) · [`platform/schema/`](../platform/schema/)  
> **עודכן:** 2026-07-13

## למה זה חלק מהכוורת

סקר אתר הוא צוואר הבקבוק לפני `engineering-agent.designSuite`. בלי קלט שטח מנורמל (גג, GPS, תמונות, שטח, יעד) — Wave 54 נעצר ב־§3.6a.

האפליקציה היא לולאת **`collect.site-survey`**: סוקר בשטח ממלא כמו אצל תמיר, והמערכת מייצאת jobs במבנה `platform/schema/job.schema.json`.

## זרימה

| שלב | Loop | Trust | פלט |
|---|---|---|---|
| Collect | `collect.site-survey` | L1 / cost 0 | raw project + photo meta + completeness |
| Edit | `edit.normalize-site-survey` | L1 | `designSuiteReq.site/target` + `electricalIntake` |
| Dispatch | `dispatch.draft` | L1 · human pick | טיוטה ל־drafts / ברק — **לא** customer |

`wire_sizing` / `protection` נשארים Tier-0 ב־Wave 54; הסקר רק מספק קלט.

## שדות קנוניים (מעבר לתמיר)

| שדה סקר | Wave 54 |
|---|---|
| סוג גג (בטון/רעפים/…) | `roofType` flat/tile/metal-*/ground |
| שטח שימושי מ״ר | `usableAreaM2` |
| אזימוט / שיפוע | `azimuthDeg` / `tiltDeg` |
| צילום גג/אתר | `photos[]` (sha256) — חובה ל־performance_forecast |
| יעד kWp / תקציב ₪ | `target.sizeKwp` / `budgetCents` |
| העדפת ממיר | SolarEdge / KStar / ABB / Deye |
| מפסקים / כבל AC | `electricalIntake` (עזר ל־wire/protection) |

## חוקה

- Law #1 — אין WA ללקוח מהאפליקציה
- Law #2 — `requiresHumanPick: true` על כל outbound
- `customer.id = [OPEN]` עד קישור Monday/CRM

## מוכנות לשטח (completeness)

נבדק ב־`apps/bee-solar-survey/src/schema.ts` → `assessCompleteness`:

| חובה ל־`readyForWave54` | מומלץ |
|---|---|
| שם פרויקט, כתובת, סוג גג | שם סוקר, מפסק ראשי |
| ≥1 צילום `roof` / `siteOverview` | צילום לוח חשמל, GPS |
| שטח שימושי **או** יעד kWp / תקציב | אזימוט (ברירת מחדל UI: 180), שיפוע |

אם edit חסום — הייצוא מחזיר רק collect + edit (`blocked_trust`), בלי `dispatch.draft`.

## סטטוס

| פריט | מצב |
|---|---|
| PWA שטח (RTL, תמונות, PDF, IndexedDB) | ✅ בקוד |
| ייצוא hive JSON | ✅ |
| בדיקות schema/export | ✅ `npm test` |
| חיבור חי ל־supervisor / Alfred drafts | ⏳ מקומי — אחרי wire Brain Bus |
| פריסת Pages | ⏳ לחבר פרויקט CF ל־`apps/bee-solar-survey` |
