# 03 — כלי תכנון PV, פריסת גג, סימולציה והצעות מחיר (2025–2026): לשלב או לבנות

תאריך סקירה: 2026-10-06. הקשר: B.E.E (ברק הנדסת חשמל) — מנוע פרויקטים פנימי (Node/TypeScript + Python, מחולל `eplan` על ezdxf+matplotlib, PWA לסקר אתר).

הערת מתודולוגיה: חלק גדול מהאתרים המסחריים (aurorasolar.com, pvsyst.com, solargraf.com, support.opensolar.com, developers.google.com, gov.il, govmap, אתרי חדשות ומתקינים ישראליים) חסומים ברשת שממנה בוצעה הסקירה. לכן נתונים רבים נלקחו מסיכומי חיפוש ומאתרי השוואה של צד שלישי (qbitsenergy, heavengreenenergy, surgepv — חלקם מתחרים של הכלים שהם סוקרים), ומ-GitHub/PyPI שהיו נגישים. כל פריט שלא אומת ממקור ראשוני מסומן ⚠️, וריכוז מלא בסעיף "לא אומת" בסוף.

---

## 0. תקציר המלצות

| תחום | המלצה | נימוק קצר |
|---|---|---|
| (a) פריסת גג (roof layout) | **לבנות** (TypeScript/Python, shapely/turf) | אין API מסחרי שמחזיר פריסה כ-JSON/DXF במחיר סביר לישראל; האלגוריתם (רשת מסובבת + setbacks + מרווח שורות) פשוט ויש repos פתוחים לדוגמה; מתחבר ישירות ל-`eplan`. |
| (b) סימולציית תפוקה | **לשלב ספריות פתוחות**: pvlib-python + PVGIS API (חינם) כברירת מחדל; Meteonorm TMY (CHF 320/שנה) או Solcast לפרויקטים מסחריים; PVsyst רק לדוחות "בנקאיים" | pvlib מכסה את כל שרשרת המודלים (transposition→IAM→temp→single-diode/CEC→inverter→shading); PVGIS מכסה את ישראל (SARAH3/ERA5) ללא עלות. |
| (c) הצעות מחיר | **לבנות** מחולל משלנו (HTML→PDF, RTL) על בסיס מבנה הסעיפים של OpenSolar/Aurora + התאמות ישראליות (מע"מ 18%, מונה נטו, אחריות) | אף פלטפורמה לא תומכת בעברית/RTL ובתעריפי רשות החשמל באופן מאומת; OpenSolar חינמי אך ה-API שלו לא יוצר עיצובים/סימולציות. |
| כלי יצרן (SolarEdge Designer, Huawei SmartDesign) | **להשתמש במקביל** כאימות (validation) ולייצוא DXF/PVsyst, לא כליבה | חינמיים, ללא API, נעולים ליצרן. |

---

## 1. פלטפורמות תכנון/הצעות מסחריות

### טבלת השוואה

| כלי | API? | ייצוא | התאמה לישראל | מחיר (פומבי) | המלצה |
|---|---|---|---|---|---|
| **OpenSolar** | כן — REST ציבורי (developers.opensolar.com), bearer token, "machine user" ללא תפוגה; MCP לא-רשמי קיים | PDF הצעה (דרך API), תמונות מערכת, נתוני עיצוב (summary) — ללא DXF/SLD | גלובלי (דימות לוויין), תעריפים ידניים (flat/tiered/TOU); עברית ⚠️ לא אומת (כנראה אין) | ליבה חינם ללא הגבלת משתמשים/פרויקטים; white-label ו-"API Access plans" בתשלום ⚠️ (מחיר לא פורסם) | **לשלב חלקית** — CRM/הצעה כגיבוי; לא לליבת העיצוב (API לא יוצר עיצוב/סימולציה) |
| **Aurora Solar** | Design API — Enterprise/הצעת מחיר בלבד; Pricing API קיים (docs.aurorasolar.com/changelog/pricing-api) | PDF, DXF (תוסף בתשלום ⚠️ $30–50/משתמש/חודש), SLD | ⚠️ לא אומת; מוצר אמריקאי (NEC, utilities US) | Basic $135–159/משתמש/חודש, Premium $220–259; Sales Mode ~$60 ⚠️ | **להתעלם** (עלות גבוהה, API לא פומבי, ללא התאמה ישראלית) |
| **HelioScope** (Aurora) | Enterprise בלבד | DXF (פריסה 3D), SLD כ-DXF, דוח PDF, CSV 8760 | גלובלי (נתוני מזג אוויר Meteonorm/‏PSM ⚠️); ללא עברית | Basic $159/חודש (10 פרויקטים/חודש, ≤1.25 MW), Pro $259/חודש (LIDAR, AI obstructions, ≤5 MW), Enterprise מותאם | **להתעלם / אופציונלי** לפרויקטים מסחריים גדולים (SLD + DXF טובים) |
| **PVsyst** | **PVsystCLI** — CHF 3,000/שנה: batch מקובץ קלט (מאי 2025), ריצות multi-parameter, פלט CSV | PDF דוח, CSV שעתי, PAN/OND | Meteonorm מובנה (ישראל מכוסה), ללא עברית | רישיון CHF 700/שנה (~$775); הנחות כמות 5–20% | **לשלב רק ל"דוח PVsyst" כשנדרש ע"י בנק/לקוח**; לא כליבה (CLI יקר פי 4 מהרישיון) |
| **PV\*SOL premium 2025/2026** | ⚠️ אין API ידוע | **JSON** (נתוני פרויקט+תוצאות), DXF/XML/PDF/PNG של ה-3D, CSV מוגדר | Meteonorm 9 TMY (2001–2020) לכל מיקום; ממשק גרמני/אנגלי | €845 (רישיון חד-פעמי לגרסה) | **אופציונלי** — ייצוא JSON מאפשר "import" לתוך המנוע שלנו; לא לאוטומציה |
| **SolarEdge Designer** | אין API ציבורי ⚠️ | DXF import/export, PDF דוחות, ייצוא ל-PVsyst, BOM, handoff למוניטורינג | **טוב** — חברה ישראלית, דימות גלובלי, דיוק מאומת DNV (±1% מול PVsyst); AI roof detection, auto-stringing, tree shading | חינם למתקיני SolarEdge | **להשתמש כאימות וייצוא** בפרויקטי SolarEdge; לא ניתן לאוטומציה |
| **Huawei SmartDesign 2.0 (FusionSolar)** | אין API ידוע ⚠️ | PDF (דוח + "Export Electrical Design"), רשימת מערכים, דיאגרמת הפסדים | דימות לוויין גלובלי; פריסה אוטומטית + בחירת ממירים/אופטימייזרים אוטומטית | חינם (Huawei בלבד) | **להשתמש כאימות** בפרויקטי Huawei |
| **Solargraf** | Public API — **$4,000/שנה** (כלול ב-Enterprise) | הצעות, permit plan sets (US), דוחות מדידת גג | אמריקאי/קנדי; ⚠️ ישראל לא אומת | $2,799–$12,999/שנה (מכסת פרויקטים + משתמשים) | **להתעלם** |
| **Pylon** (getpylon.com) | API ב-Enterprise | הצעות PDF, 3D, CRM | אוסטרלי, "בינלאומי" ⚠️ ישראל לא אומת | $4 (Standard) / $10 (Pro) לפרויקט, ללא מינימום; CRM $49/משתמש/חודש | **אופציונלי לבדיקה** — מודל per-project זול; לבדוק אם יש דימות/תעריפים לישראל |
| **Solar Monkey** (+Eturnity, מיזוג 03/2026) | כן, +€95/חודש | הצעות | **אירופה בלבד** (8+ מדינות) | €525/חודש (50 פרויקטים) | **להתעלם** |
| **Enact** | כן (API Integration Support ב-Scale Up) | הצעות, תכנון, תעריפים מקומיים | "35+ מדינות" ⚠️ ישראל לא אומת | Starter $199/משתמש/חודש ($179 שנתי), Scale Up $299/2 משתמשים | **להתעלם / לבדוק** |
| **Scanifly** | Enterprise | מודל 3D מרחפן → CAD, plan sets | אמריקאי, מבוסס רחפן | $150–450/משתמש/חודש ⚠️ | **להתעלם** (אולי רלוונטי רק אם נכנסים לסקר רחפן) |
| **Sunbase / Enerflo / SolarNexus / Scoop** | Enerflo: open API; האחרים: CRM/ops | — | אמריקאי | לא פומבי | **להתעלם** — אלו CRM/ops, לא תכנון |

### הערות מפורטות

**OpenSolar** — התיעוד הרשמי ב-https://developers.opensolar.com/ (חסום לנו). ה-MCP הלא-רשמי https://github.com/Align-Software-Company/opensolar-mcp (npm `@alignco/opensolar-mcp`) מתעד את גבולות ה-API: פרויקטים, אנשי קשר, systems (השוואת אופציות, נתונים טכניים, תמונות), קבצים + **יצירת PDF הצעה**, payment options/pricing schemes/costings, Teams sharing, roof types. **לא ניתן ליצור עיצוב או להריץ סימולציה דרך ה-API**; מדדי הצעה (payback, NPV, IRR, ROI) דורשים "Raw Data API Access". טוקן משתמש רגיל פג אחרי 7 ימים — ליצור machine user. מודל עסקי: חינם למתקין, הכנסות ממפיצים/מממנים; white-label (לוגו/צבעים/תבנית) — תוסף בתשלום.

**PVsystCLI** — https://www.pvsyst.com/en/products/pvsyst-cli/ ו-https://www.pvsyst.com/help-cli/reference/index.html. מתאים ל-pipeline שרתי (Windows). עלות כוללת ≈ CHF 3,700/שנה. שווה רק אם מוכרים "דוח PVsyst" כמוצר.

**HelioScope** — ייצוא CAD: https://help-center.helioscope.com/hc/en-us/articles/8198880711827-Export-CAD-Files (DXF של הפריסה כולל דימות, או SLD). מחירים: https://helioscope.aurorasolar.com/pricing/.

**SolarEdge Designer** — Application note ל-DXF: https://knowledge-center.solaredge.com/sites/kc/files/application-note-dxf-import-in-designer.pdf. רלוונטי: אפשר לייבא DXF שה-`eplan` שלנו מייצר (קווי מתאר גג/מכשולים) ולקבל משם סימולציה + BOM של SolarEdge לאימות.

**Huawei SmartDesign** — https://solar.huawei.com/professionals/SmartDesign; מדריך: https://support.huawei.com/enterprise/en/doc/EDOC1100257167 (פרק "Generating a Report", "Electrical Design").

---

## 2. אבני בניין פתוחות / מקורות נתונים

### 2.1 pvlib-python — ליבת הסימולציה המומלצת
- https://github.com/pvlib/pvlib-python — גרסה **0.16.1 (26.09.2026)**, Python ≥3.11, BSD-3, 1.7k כוכבים, NumFOCUS affiliated.
- מה מדגם: מיקום שמש, clear-sky, decomposition/transposition (Perez, Hay-Davies…), IAM (physical/ASHRAE/SAPM/Martin-Ruiz), טמפרטורת תא (SAPM/PVsyst/Faiman/Fuentes), DC: single-diode (CEC/De Soto/PVsyst), SAPM, PVWatts; AC: Sandia inverter, ADR, PVWatts; `ModelChain` עם קונפיגורציות מוכנות (SAPM_CONFIG, PVWATTS_CONFIG).
- **הצללה** (`pvlib.shading`): `shaded_fraction1d`, `masking_angle`, `masking_angle_passias`, `sky_diffuse_passias`, `ground_angle`, `projected_solar_zenith_angle`, `direct_martinez` (מודל הפסד חשמלי להצללה חלקית עם דיודות מעקף). דו-פני: `bifacial.infinite_sheds`, `pvfactors`.
- **iotools** (מאומת מקובץ `__init__.py`): `get_pvgis_hourly`, `get_pvgis_tmy`, `get_pvgis_horizon`, `get_solcast_*` (forecast/live/historic/tmy), `get_meteonorm_tmy` + forecast/observation, `get_cams` (CAMS Radiation — מכסה את ישראל), `get_nasa_power`, `get_era5`, `get_merra2`, `get_solargis`, `get_solaranywhere`, NSRDB PSM4, **`read_panond`** (קורא PAN/OND של PVsyst למילון).
- `pvsystem.retrieve_sam('CECMod' | 'CECInverter' | 'SandiaMod' | 'ADRInverter')` — מושך את ספריות SAM מ-https://github.com/NREL/SAM/tree/develop/deploy/libraries; **עדכון אחרון: 01.07.2026 "New PV Module and Inverter Libraries for 2026"**.

### 2.2 PVGIS 5.3 (JRC) — נתוני קרינה חינמיים לישראל
- API לא-אינטראקטיבי: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en — endpoints: `PVcalc` (חודשי/שנתי), `SHScalc`, `MRcalc`, `DRcalc`, `seriescalc` (שעתי 8760×שנים), `tmy`, `printhorizon`. פלט JSON/CSV/EPW (TMY).
- מסדי נתונים: **PVGIS-SARAH3** ברירת מחדל לאירופה/אפריקה/אסיה (ישראל בתוך כיסוי SARAH ⚠️ לא אומת במסמך רשמי, אך ממפת הכיסוי המוכרת של SARAH זה כולל את המזרח התיכון), **ERA5** גלובלי; 5.3 כולל נתונים עד 2023.
- מגבלות: **30 קריאות/שנייה ל-IP** (429 מעבר לכך); לעיתים 529 "overloaded" (לממש retry). חינם, גם לשימוש מסחרי (תנאי JRC — ⚠️ לוודא ייחוס).
- Wrappers: pvlib.iotools (לעיל), https://pypi.org/project/pvgis-api/ (עוטף את כל ה-endpoints של 5.3).
- המלצה: להשתמש ב-`seriescalc`/`tmy` לקבלת GHI/DNI/DHI+טמפ'+רוח, ולהריץ את מודל המערכת ב-pvlib (ולא להסתמך על ה-PV calc של PVGIS, שהוא מודל גנרי).

### 2.3 NREL SAM / PySAM
- https://github.com/NREL/pysam — **v7.1.1 (28.04.2026)**, SAM 2025.4.16 r2, SSC 306, BSD-3, Python 3.9–3.14. מודולים: `Pvwattsv8`, `Pvsamv1` (מודל מפורט), ומודלים פיננסיים `Cashloan`, `Utilityrate5`, `Lcoefcr` ועוד.
- קלט מזג אוויר: SAM CSV / EPW; לישראל צריך להמיר PVGIS TMY → SAM CSV (קיימות דוגמאות קוד). ערך מוסף עיקרי מעל pvlib: **המודל הפיננסי** (תזרים 25 שנה, הלוואה, תעריפים) — אך הוא בנוי סביב ארה"ב (ITC, utility rates). לדעתנו עדיף לבנות מודל פיננסי קטן משלנו (סעיף 5).

### 2.4 Google Solar API
- https://developers.google.com/maps/documentation/solar/overview — `buildingInsights` (מקטעי גג: pitch/azimuth/שטח, קונפיגורציות פאנלים, תפוקה), `dataLayers` (GeoTIFF: DSM, RGB, mask, annual/monthly flux, hourly shade).
- מחיר (https://developers.google.com/maps/documentation/solar/usage-and-billing): Building Insights — 10,000 קריאות/חודש חינם, אח"כ $10/1000 (יורד ל-$3.50 בנפח); Data Layers — 1,000/חודש חינם, אח"כ $75/1000 (יורד ל-$26.25).
- **כיסוי ישראל: ⚠️ לא אומת** — דף הכיסוי (https://developers.google.com/maps/documentation/solar/coverage) חסום לנו. ידוע: "40+ מדינות, 472M מבנים" (ינואר 2024) + הרחבות 2025. **חובה לבדוק ידנית** את דף הכיסוי לפני שמסתמכים; אם ישראל מכוסה ב-HIGH quality — זה מקור ה-DSM/הצללה הזול ביותר (≈$0.075 לבניין ל-dataLayers).
- דוגמת קוד רשמית: https://github.com/googlemaps-samples/js-solar-potential.

### 2.5 Solcast
- https://solcast.com/pricing/irradiance-weather — חינם: hobbyist 10 קריאות/יום (לא מסחרי), חוקרים (אימייל אוניברסיטאי). מחירי מסחרי לא פומביים (הצעת מחיר). Historical/TMY 2007–2025. pvlib wrappers. ⚠️ עלות — לבקש הצעה אם נרצה satellite-derived ברזולוציה גבוהה.

### 2.6 Meteonorm 9
- Web App: Basic **CHF 320/שנה** (TMY ללא הגבלה), Pro CHF 980 (+30 AMY), Expert CHF 4,200. API (https://docs.meteonorm.com/api/climate): טוקנים — TMY = 500 טוקנים; חבילות מ-CHF 90/2,000 טוקנים (4 TMY) עד CHF 1,000/100k (200 TMY); מנויים CHF 960–4,800/שנה. pvlib: `get_meteonorm_tmy`. זהו אותו מקור נתונים של PVsyst/PV*SOL — טוב ל"אמינות מול לקוח".

### 2.7 Open-Meteo
- https://open-meteo.com/en/docs/historical-weather-api + Satellite Radiation API (מ-1983): GHI, DNI, DHI, GTI, terrestrial. חינם ללא-מסחרי (<10k/יום, 5k/שעה, 600/דקה); מסחרי $29/חודש (1M קריאות), $99/חודש (5M). קוד AGPLv3, ניתן ל-self-host (https://github.com/open-meteo/open-meteo), נתונים CC BY 4.0. מתאים ל"חישוב מהיר" ב-PWA; לא תחליף ל-TMY.

### 2.8 מקורות גיאוגרפיים לישראל
- **govmap / המרכז למיפוי ישראל**:
  - אריחי XYZ ציבוריים (נמצאו בשימוש ב-repos רבים): `https://cdnil.govmap.gov.il/xyz/heb/{z}/{x}/{y}.png` ו-`/xyz/eng/` (מפת רחובות, max native zoom ≈16). נמצאה גם הפניה ל-`/xyz/ortho/{z}/{x}/{y}.png` (אורתופוטו) בקוד שהוער (commented) — ⚠️ לא אומת שהשירות פעיל/מורשה.
  - GeoServer פתוח: `https://open.govmap.gov.il/geoserver/opendata/wms` ו-`/wfs` (GetCapabilities), שכבות לדוגמה `opendata:PARCEL_ALL`, `opendata:Parcels_ITM`, `opendata:muni_il` — חלקות/גושים/רשויות; ⚠️ לא אומת אם יש שכבת מבנים או אורתופוטו ב-opendata.
  - API מפתחים: `https://api.govmap.gov.il/docs/intro` — 3 רמות (URL params / embed / JS functions, כולל `geocode`), דורש token דרך `createMap(token=...)`; הרשמה דרך הפורטל.
  - **רישוי**: תנאי השימוש של govmap מתירים "fair use" אישי; **הורדה/שימוש מסחרי בשכבות או מפות מרובות מחייב אישור בכתב מהמרכז למיפוי ישראל**. לשימוש באורתופוטו כרקע לציור גגות בכלי מסחרי — ⚠️ לפנות למפ"י לרישיון (או להשתמש ב-MapTiler/Mapbox/Esri).
  - בנט"ל (בסיס נתונים טופוגרפי לאומי, https://www.gov.il/he/departments/general/bntal) — כולל שכבת מבנים; תנאי קבלה ⚠️ לא אומתו.
- **LiDAR/DSM**: תקן איסוף אווירי לאומי (ISPRS 2022, https://isprs-archives.copernicus.org/articles/XLIII-B2-2022/65/2022/) — DTM/DSM ברזולוציה **50 ס"מ** מענני נקודות מסווגים, QC לאומי. **זמינות ציבורית/מסחרית של ה-DSM — ⚠️ לא אומתה** (כנראה דרך מפ"י בתשלום). OpenTopography מכיל רק סטים מקומיים (למשל מצוק החוף 2006, המכון הגיאולוגי).
- **OSM מבנים בישראל**: לא נמצאה הערכת שלמות ספציפית לישראל ⚠️. חלופה: **Overture Maps buildings** (OSM + Microsoft/Google ML footprints, מאוחד) — הורדה לפי bbox עם https://github.com/overturemaps/overturemaps-py (`overturemaps download --bbox=... --type=building -f geoparquet`). לישראל, חלק מהמבנים יהיו ML-derived (דיוק נמוך יותר) — להשתמש רק כ"נקודת פתיחה" לציור ידני.
- **אריחי לוויין לציור גג**:
  - Mapbox Raster Tiles: 750k בקשות/חודש חינם, אח"כ $0.25/1000 (יורד ל-$0.15). https://www.mapbox.com/pricing
  - MapTiler Cloud: Free (לא מסחרי), Flex $25/חודש (500k), Unlimited $295/חודש (5M); לוויין "1–2 מ'/px גלובלי, עד 8 ס"מ מקומית" — ⚠️ רזולוציה בישראל לא אומתה.
  - Google Map Tiles API (2D incl. satellite): 100k אריחים/חודש חינם, אח"כ $0.60/1000. שימו לב: תנאי Google אוסרים שימוש בדימות מחוץ למפות Google (לא ניתן לשמור/להטמיע ב-PDF ללא המפה) — ⚠️ לבדוק ToS.
  - Esri World Imagery נפוץ ב-repos פתוחים, אך דורש רישיון ArcGIS לשימוש מסחרי ⚠️.

---

## 3. מודל גג, פריסת מודולים, הצללה ו-stringing — אלגוריתמים ו-repos

### 3.1 אלגוריתם פריסה מומלץ (לבנייה)
1. פוליגון גג (ITM/EPSG:2039 או מטרי מקומי) + פוליגוני הדרה (מכשולים, setbacks לפי תקן/תקנות בטיחות).
2. סיבוב למערכת ייחוס שבה "מעלה המדרון"/כיוון השורות = ציר y (אזימוט המערך).
3. רשת צירית: pitch שורה = אורך מודול·cos(tilt) + מרווח הצללה (`h·sin(tilt)/tan(α_winter)`, α = גובה שמש ב-21.12 ב-9:00–15:00 לקו רוחב ~32°), pitch עמודה = רוחב מודול + מרווח; שבילי תחזוקה כל N שורות.
4. לכל מלבן מועמד: `polygon.contains(rect)` (לא `intersects`) מול גג ומול הדרה.
5. השוואת portrait/landscape ומספר אזימוטים (0°, ±5°, ±10° ו"מקביל לקצה הארוך") — בחירה לפי מספר מודולים ואז לפי תפוקה (pvlib).
6. קיבוץ ל-strings (לפי MPPT) ופלט: JSON (מודולים עם x,y,rot,string_id) → DXF (ezdxf) + תמונת overlay.

### 3.2 repos קונקרטיים (פריסה/packing)
| repo | מה יש | שפה/רישיון | הערכה |
|---|---|---|---|
| https://github.com/Gireeesh-VAB/Solar-Lead (`panel_packing.py`) | **הכי קרוב למה שצריך**: רשת מסובבת לפי אזימוט, מרווח שורות לפי winter-solstice, `contains()` לוודא התקנה, portrait/landscape, שבילי תחזוקה; shapely+pyproj | Python, ⚠️ רישיון לא נבדק | לקרוא ולשכתב (לא לתלות בו) |
| https://github.com/arthurcasadepedra64/rooftop-pv-placement | QGIS/GRASS r.sun על DSM עירוני → suitability → רשת מסובבת + greedy by density | Python (QGIS), MIT | רעיון טוב ל-DSM; לא ל-production |
| https://github.com/rewiring-nz/nz-solar-potential | pipeline מלא: footprints + LiDAR → roof segmentation/partition → panel fitting → pvlib yield | Python + JS, נתונים CC-BY | הפניה טובה ל-LiDAR→גג; פיילוט |
| https://github.com/amarnath3003/Solar-Roof-AI | React/Leaflet/Turf.js, auto-pack ב-web worker, roof detection דרך Roboflow | TS, CC BY 4.0, 132★ | דוגמה ל-UX בדפדפן (רלוונטי ל-PWA) |
| https://github.com/SzonyiTamas/PVOptimization | GA (tournament/crossover/mutation) לפריסה עם הצללות מעצים | C#/Python, ⚠️ רישיון | אקדמי |
| https://github.com/Cebulva/rooftop-solar-analysis-ml-pvlib | U-Net לזיהוי גג מלוויין + PVGIS | Python, אקדמי | דוגמה |
| https://github.com/secnot/rectpack | packing מלבנים (MaxRects/Skyline/Guillotine) | Python, 564★ | מלבן-בתוך-מלבן בלבד; לא לפוליגון גג |
| https://github.com/Jack000/SVGnest | nesting פוליגונים לא-רגולריים (NFP + GA) | JS, MIT, 2.6k★ | overkill; מודולים הם מלבנים זהים — רשת עדיפה |

### 3.3 הצללה
- **2D/שורות**: `pvlib.shading.shaded_fraction1d` + `direct_martinez` — מספיק לגגות שטוחים עם שורות (רוב המסחרי בישראל).
- **3D/ray-tracing**: https://github.com/NatLabRockies/bifacial_radiance (RADIANCE, 109★) — מדויק אך כבד; https://github.com/SunPower/pvfactors (view-factor, 91★) — דו-פני/דיפוזי. לגגות רעפים עם ארובות/בניינים שכנים: לחשב shade mask מ-DSM (אם Google dataLayers מכסה את ישראל — `hourlyShade` GeoTIFF פותר זאת) או מהורייזון של PVGIS (`printhorizon`) + מכשולים ידניים כפוליגונים עם גובה (מודל "shadow casting" פשוט על DSM — דוגמה: https://github.com/milos-agathon/forge3d `examples/rotterdam_solar_potential_shadow_study.py`).
- LiDAR ישראלי: ראו 2.8 — ⚠️ לא זמין בפתוח.

### 3.4 string sizing / אופטימייזרים / DC-AC
- נוסחאות סטנדרט (IEC 62548 / NEC 690.7): `Voc_cold = Voc_stc·(1+β_Voc·(T_min−25))`; `N_max = floor(V_max_inv / Voc_cold)`; `Vmp_hot = Vmp_stc·(1+β_Vmp·(T_cell_max−25))`, `T_cell_max ≈ T_amb_max+30`; `N_min = ceil(V_mppt_min / Vmp_hot)`; בדיקת `Isc·1.25 ≤ I_max_input`, ו-`I_mpp strings ≤ I_mppt_usable`. לישראל: T_min ≈ −2…+2 °C (הרים: −5), T_amb_max ≈ 42–45 °C.
- מימוש פתוח ב-TypeScript: https://github.com/vraaijmakers/zonzelf (`src/lib/pv-string.ts`, PR #76) — מודל "3 תקרות" (MPPT floor / MPPT top / max input), תיקוני Voc-cold/Vmp-hot, חלוקה בין MPPTs, DC/AC ratio. ⚠️ רישיון לא נבדק.
- מחשבונים לאימות: https://pvtoolbox.eu/pv-string-calculator-free/, https://www.baess.app/tools/solar-string-sizing-calculator (5,000+ מודולים, 1,000+ ממירים, PDF לפי IEC 62109/60364-7-712).
- DC/AC ratio: 1.1–1.3 טיפוסי; SolarEdge מתירה oversizing גבוה (תלוי דגם ⚠️), Huawei עד 1.5 ⚠️ — לקחת מ-datasheet של הממיר (שדה `max DC input power`).
- אופטימייזרים (SolarEdge/Tigo): כללי string שונים (מינ'/מקס' אופטימייזרים ל-string, הספק מקס' ל-string — למשל SolarEdge 3-phase: 16–50 אופטימייזרים, עד ~11.25–13.5 kW ל-string ⚠️ לפי דגם) — לממש כטבלת כללים per-inverter-family.

---

## 4. מסדי נתונים של ציוד (datasheets)

| מקור | מה | פורמט | עלות | הערות |
|---|---|---|---|---|
| **SAM libraries (NREL)** — `CEC Modules.csv`, `CEC Inverters.csv`, `Sandia Modules.csv` | פרמטרי single-diode (CEC) למודולים, מודל Sandia לממירים | CSV (דרך `pvlib.retrieve_sam`) | חינם | עדכון 07/2026; **מבוסס רשימת CEC (קליפורניה)** — דגמי 50 Hz/3-פאזי של Huawei/Sungrow/SAJ/Deye/KStar/Solis שנמכרים בישראל עשויים **להיעדר** ⚠️; מודולי Longi/Jinko/Trina/Canadian/AIKO לרוב קיימים (לוודא לפי SKU) |
| **PAN/OND (PVsyst)** | פרמטרי מודול/ממיר מהיצרן | טקסט; `pvlib.iotools.read_panond` → dict | חינם מהיצרנים (פורטלי הורדה) / מתוך PVsyst | הפורמט לא מתועד רשמית; הפרסר של pvlib מבוסס היוריסטיקה (2 רווחים, `=`), לפעמים צריך `utf-8-sig` |
| **DNV Renewable Component Library (RCL)** | PAN/OND מאומתים דרך API | API | בתשלום ⚠️ | https://mysoftware.dnv.com/download/public/renewables/solarfarmer/manuals/latest/UserGuide/UIChapters/DefineComponents/PVmodules.html |
| **ENF Solar** | 42,105 פאנלים פעילים + 40,612 obsolete, 2,441 יצרנים; קישורי datasheet מקוריים | Excel; "API Access" מוצע | בתשלום ⚠️ (לא פומבי) | https://www.enfsolar.com/industry-directory/product-database |
| **SolarDesignTool** | ⚠️ לא נבדק בסקירה זו | | | |
| **API יצרנים** | SolarEdge monitoring API (לא datasheets); Huawei FusionSolar (ניטור) | | | אין API מאומת ל-datasheets ⚠️ |
| **ספריות שמחזיקות DB משלהן** (baess.app 5k מודולים/1k ממירים) | | web בלבד | | |

מותגים רלוונטיים לישראל (מהחיפוש + ידע כללי, ⚠️ נתחי שוק לא אומתו): ממירים — **SolarEdge** (מקור עברי אחד טוען ~60% נתח שוק ביתי), **Huawei**, **Sungrow** (יבואן: קבוצת כהנא), GoodWe, Growatt, SMA, Fronius; SAJ/Deye/KStar/Solis — נמכרים אך ללא מקור נתח. מודולים — Longi, Jinko, Trina, Canadian, AIKO. אופטימייזרים — SolarEdge (מובנה), Tigo. Huawei ו-Sungrow הם 1–2 בעולם (Wood Mackenzie H1 2025).

**המלצה**: לבנות "catalog service" פנימי (JSON/SQLite): לכל SKU — שדות CEC אם קיימים, אחרת PAN/OND שהורדו מהיצרן (`read_panond`), ואחרת פרמטרי datasheet ידניים (Pmax, Voc, Isc, Vmp, Imp, β_Voc, α_Isc, NOCT, מידות) עם `pvlib.ivtools.sdm.fit_cec_sam` להפקת פרמטרי single-diode. זה 10–20 SKU בפועל.

---

## 5. מודל פיננסי להצעות

### 5.1 שיטות סטנדרט בהצעות
- **Simple payback** = עלות נטו / חיסכון שנה 1; **discounted payback**; **NPV** (r = 5–8%); **IRR**; **LCOE** = Σ(CAPEX+OPEX_t)/(1+r)^t ÷ Σ E_t/(1+r)^t; **25-year cash flow** טבלה+גרף; "חיסכון מצטבר".
- הנחות: דגרדציה 0.4–0.55%/שנה (לפי אחריות ביצועים של המודול: TOPCon ~0.4%, PERC ~0.55%), הסלמת תעריף 1–3%/שנה (בישראל: להצמיד לעדכוני רשות החשמל; ב-2025 נדונה שיטת חישוב חדשה לתעריף 2026 ⚠️), O&M 0.5–1% CAPEX/שנה, החלפת ממיר בשנה 12–15 (מקורות ישראליים: 4,000–8,000 ₪ לביתי), ביטוח.
- ספריות: **numpy-financial** (`npv`, `irr`, `mirr`, `pmt`) — https://numpy.org/numpy-financial/; **pyxirr** (XIRR/XNPV מהיר פי 10) — https://pypi.org/project/pyxirr/; PySAM `Cashloan`/`Utilityrate5`/`Lcoefcr`; ESFEX (NPV/IRR/WACC/DSCR/LCOE) — https://esfex.readthedocs.io/. ב-TypeScript: לממש ישירות (NPV/IRR ~40 שורות) או `financial`/`xirr` מ-npm ⚠️ לא נבדק.

### 5.2 פרטים ישראליים (לקודד כפרמטרים, לא כקבועים)
- **מע"מ 18%** (מ-01.01.2025). אימות עקיף: תעריף ביתי אפריל 2025 — 54.25 אג'/קוט"ש ללא מע"מ = 64.02 כולל (×1.18).
- **תעריף צריכה ביתי** (04/2025): 54.25 אג' לפני מע"מ ⚠️ (מקור משני: volta.solar / kamaze). תעריפי TOU (תעו"ז) לעסקים — לפי לוח רשות החשמל.
- **אסדרת גגות קטנים / מונה נטו**: תעריף הזנה לגגות ביתיים קטנים כיום **48–54 אג'/קוט"ש** (לפי גודל/מסלול), לאורך היממה; רשות החשמל פרסמה ב-2025 כוונה לקצץ ל-**~35 אג'** בביתי לקראת מודל חדש (2026) ⚠️ (Calcalist/Globes, לא נגישים לאימות מלא). מונה נטו: זיכוי על הזרמה עם מגבלות צבירה חודשית. **משך התעריף (25 שנה) והצמדה למדד** — ⚠️ לא אומתו בסקירה זו; לקודד `tariff_term_years`, `indexation` כפרמטרים.
- מדרגות גודל מקובלות: ≤15 kW (ביתי/"מתקן זעיר"), ≤100 kW, ≤630 kW, >630 kW — ⚠️ לאמת מול האסדרה העדכנית (מספרים מהידע הכללי).
- "**ייצור עצמי + מכירת עודפים**" (self-consumption + feed-in) לעומת "מונה נטו" — המודל הפיננסי צריך לתמוך בשני המסלולים: חיסכון = min(ייצור,צריכה)·תעריף צריכה + עודף·תעריף הזנה.

### 5.3 מבנה הצעה "תעשייתי" (OpenSolar/Aurora/SurgePV)
1. כריכה: תמונת לוויין של הגג עם הפאנלים + מספר כותרת (חיסכון/הספק).
2. תקציר מנהלים: 3 מספרים (הספק kWp, ייצור שנתי kWh, חיסכון שנתי/החזר).
3. תכנון המערכת: פריסה, מספר מודולים, ממיר/ים, אופטימייזרים, קונסטרוקציה.
4. תחזית ייצור: שנתי, **גרף חודשי**, kWh/kWp (specific yield), PR, הנחות (מקור קרינה, הפסדים).
5. ניתוח כלכלי: חשבון לפני/אחרי, חיסכון שנה 1, payback, NPV/IRR, גרף תזרים 25 שנה, הנחות.
6. מפרט ציוד (datasheets מקוצרים).
7. אודות החברה/רישיונות/פרויקטים.
8. אחריות (טבלה).
9. מחיר, תנאי תשלום, תוקף, צעד הבא/חתימה דיגיטלית.
(OpenSolar מוסיף: Utility section — חשבון אחרי סולארי + צריכה; System details — עלות, ייצור שנה 1, אחוז כיסוי (offset), ייצור 25 שנה; Cost summary — התקנה, סוללה, עלות נטו, תמריצים, לתשלום.)

---

## 6. הצעת מחיר ישראלית (הצעת מחיר למערכת PV) — מה כוללת

מבוסס על מקורות ישראליים שנסרקו בחיפוש (hi-vision, triplesolar, navitas, kedmasolar, 26solar, midrag — האתרים עצמם חסומים, התוכן מסיכומי חיפוש) + ניסיון תעשייתי. ⚠️ לא נמצא PDF של הצעת מחיר אמיתית לניתוח — מומלץ שהלקוח (B.E.E) יספק 2–3 הצעות קיימות שלו/של מתחרים.

**סעיפים מקובלים:**
1. **פרטי הלקוח והאתר** (שם, ח.פ./ת.ז., כתובת, גוש/חלקה, מס' מונה/חוזה חח"י, סוג חיבור 1Φ/3Φ, גודל חיבור A).
2. **תיאור המערכת**: הספק DC (kWp) ו-AC (kW), מספר מודולים ודגם, ממיר/ים ודגם, אופטימייזרים, סוג גג וקונסטרוקציה (גג שטוח/רעפים/פנלים מבודדים), זווית/אזימוט, אומדן ייצור שנתי (kWh) ו-kWh/kWp (בישראל טיפוסי ~1,550–1,750 ⚠️ תלוי אתר).
3. **כתב כמויות / BOM** (לעיתים מקוצר): מודולים, ממיר, קונסטרוקציה, כבלי DC/AC, לוח AC + מפסקים/מגנים, הארקה, מערכת ניטור, שילוט.
4. **היקף העבודה**: תכנון (מהנדס חשמל), אישור קונסטרוקטור, הגשה לחח"י/רשות החשמל, התקנה, בדיקת בודק חשמל מוסמך, הפעלה וחיבור, הדרכה.
5. **ניתוח כלכלי**: תעריף (מונה נטו / ייצור עצמי), חיסכון שנתי, החזר השקעה (שנים), תשואה, תזרים 25 שנה.
6. **מחיר**: לפני מע"מ, מע"מ 18%, סה"כ; לעיתים ₪/kWp. (טווחים שנמצאו: ביתי 40,000–180,000 ₪ למערכת; דוגמה: 15 kW, 33 פאנלים, גג שטוח — 77,000 ₪ ⚠️ ללא ציון מע"מ.)
7. **תנאי תשלום**: טיפוסי — מקדמה בחתימה (10–30%), תשלום עם אספקת ציוד/תחילת התקנה (40–60%), יתרה בסיום התקנה / בחיבור לחח"י. מקורות ממליצים "תשלום מותנה בהתקדמות ובקבלת אישורים מחברת החשמל".
8. **אחריות**: מודולים — **25 שנה ביצועים (לעיתים 30)** + 12–15 שנה מוצר (AIKO/Longi/Jinko מציעים 15–25 מוצר ⚠️ לפי דגם); ממיר — **12 שנה** (SolarEdge סטנדרט, הרחבה ל-20/25 בתשלום; Huawei 10 שנה ⚠️ בישראל לרוב מורחב), אופטימייזרים 25 שנה; **עבודה/התקנה** — 1–5 שנים (לרוב 2–5); אחריות אטימות גג — לפי מתקין.
9. **לא כולל (exclusions)**: חיזוקי קונסטרוקציה/שיפוץ גג, הגדלת חיבור חשמל ואגרות חח"י, שדרוג לוח חשמל ראשי, מנוף/במת הרמה מעבר למפורט, עבודות איטום/בידוד, פינוי מכשולים (דודי שמש, אנטנות), היתר בנייה אם נדרש, מערכת אגירה (אלא אם הוצעה), חפירות/תשתית ארוכה.
10. **לוח זמנים**: אישורי חח"י ורשות החשמל (שבועות–חודשים), התקנה (ימים), חיבור. **תוקף ההצעה** (14–30 יום), הצמדה למחיר ציוד/מט"ח (לעיתים "המחיר צמוד לשער הדולר/יורו" ⚠️ נפוץ בעסקי).
11. נספחים: תמונת פריסה על הגג, datasheets, רישיונות (חשמלאי מוסמך/הנדסאי, קבלן רשום 160/191), ביטוח.

---

## 7. רשימת ספריות/repos (ריכוז)

| שם | קישור | שימוש אצלנו |
|---|---|---|
| pvlib-python 0.16.1 | https://github.com/pvlib/pvlib-python | סימולציה, הצללה, PAN/OND, PVGIS/Meteonorm/Solcast/CAMS |
| pvgis-api | https://pypi.org/project/pvgis-api/ | wrapper נוסף ל-PVGIS |
| NREL PySAM 7.1.1 | https://github.com/NREL/pysam | Pvsamv1 להשוואה; מודלים פיננסיים (אופציונלי) |
| SAM libraries (CEC/Sandia CSV) | https://github.com/NREL/SAM/tree/develop/deploy/libraries | DB ציוד |
| pvfactors | https://github.com/SunPower/pvfactors | הצללה דיפוזית/דו-פני |
| bifacial_radiance | https://github.com/NatLabRockies/bifacial_radiance | ray-tracing 3D (כבד) |
| RdTools | https://github.com/NREL/rdtools | דגרדציה מנתוני ניטור (שלב O&M) |
| pvanalytics | https://github.com/pvlib/pvanalytics | QC לנתוני ניטור |
| Solar-Lead panel_packing | https://github.com/Gireeesh-VAB/Solar-Lead | רפרנס לאלגוריתם פריסה |
| rooftop-pv-placement | https://github.com/arthurcasadepedra64/rooftop-pv-placement | רפרנס DSM→פריסה |
| nz-solar-potential | https://github.com/rewiring-nz/nz-solar-potential | רפרנס LiDAR→גג→pvlib |
| Solar-Roof-AI | https://github.com/amarnath3003/Solar-Roof-AI | רפרנס UX Leaflet/Turf |
| zonzelf pv-string.ts | https://github.com/vraaijmakers/zonzelf | רפרנס string sizing ב-TS |
| rectpack / SVGnest | https://github.com/secnot/rectpack, https://github.com/Jack000/SVGnest | packing (לא נדרש כנראה) |
| overturemaps-py | https://github.com/overturemaps/overturemaps-py | footprints מבנים לנקודת פתיחה |
| open-meteo | https://github.com/open-meteo/open-meteo | מזג אוויר/קרינה מהיר, self-host |
| numpy-financial / pyxirr | https://numpy.org/numpy-financial/, https://pypi.org/project/pyxirr/ | NPV/IRR |
| opensolar-mcp (לא רשמי) | https://github.com/Align-Software-Company/opensolar-mcp | אם נשלב OpenSolar כ-CRM/הצעה |
| js-solar-potential (Google) | https://github.com/googlemaps-samples/js-solar-potential | אם Solar API מכסה את ישראל |
| ezdxf (כבר בשימוש) | https://github.com/mozman/ezdxf | DXF |

---

## 8. לא אומת (⚠️) — לבדוק ידנית לפני החלטה

1. **Google Solar API — כיסוי ישראל** (buildingInsights/dataLayers ואיכות HIGH/MEDIUM). דף: https://developers.google.com/maps/documentation/solar/coverage — הפריט הכי משמעותי לסעיף הצללה/DSM.
2. PVGIS-SARAH3 — אישור רשמי שישראל בתוך הכיסוי (לבדוק עם קריאה אחת ל-`seriescalc?lat=32&lon=34.8&raddatabase=PVGIS-SARAH3`).
3. OpenSolar: מחיר white-label ו-"API Access plan"; תמיכה בעברית/RTL; האם ניתן להגדיר תעריפי רשות החשמל (TOU תעו"ז).
4. Aurora/HelioScope/Pylon/Enact — תמיכה בישראל (דימות, נתוני קרינה, מטבע ₪, תעריפים). מחירי Aurora/Scanifly/Sales Mode/DXF add-on — ממקורות צד-ג' בלבד.
5. PV*SOL — האם יש API/CLI (לא נמצא; כנראה אין).
6. SolarEdge Designer / Huawei SmartDesign — היעדר API (לא נמצא API; לא הוכח שאין).
7. govmap: האם `cdnil.govmap.gov.il/xyz/ortho/…` פעיל ומורשה; האם ב-open.govmap GeoServer יש שכבת מבנים/אורתופוטו; תנאי רישוי מסחרי של אורתופוטו ו-DSM לאומי (50 ס"מ) ועלותם; תנאי בנט"ל.
8. שלמות OSM/Overture למבנים בישראל (לא נמצא מחקר ספציפי).
9. רזולוציית לוויין בישראל ב-MapTiler/Mapbox (ייתכן 50 ס"מ בלבד בחלק מהאזורים); תנאי Google Map Tiles לשימוש בדימות ב-PDF.
10. נוכחות דגמי ממירים ישראליים (Huawei SUN2000-xxKTL-M1/M2, Sungrow SG-RT, SAJ, Deye, KStar, Solis) ב-CEC Inverters.csv — לבדוק לפי SKU.
11. ENF Solar API — מחיר ופורמט; DNV RCL — מחיר.
12. נתחי שוק ממירים/מודולים בישראל (הטענה "SolarEdge 60%" ממקור שיווקי עברי אחד).
13. אסדרה: תעריפי מונה נטו/הזנה 2025–2026 המדויקים לפי מדרגות (15/100/630 kW), משך (25 שנה?), הצמדה, מגבלות צבירה, והקיצוץ המתוכנן ל-~35 אג' — מקורות: רשות החשמל (pua.gov.il), Calcalist/Globes (חסומים).
14. מחירי שוק ישראליים ל-kWp (₪/kWp ביתי/מסחרי 2025–2026) ותנאי תשלום נפוצים — לא נמצא מסמך הצעת מחיר אמיתי; הסעיפים בפרק 6 מבוססים על סיכומי חיפוש וידע תעשייתי.
15. Solcast — מחירי מסחרי; Meteonorm — ממקורות משניים (datarade/meteonorm.com לא נגיש ישירות).
16. פרטי אחריות ספציפיים בישראל (Huawei 10 מול 12 שנה; SolarEdge הרחבות; AIKO/Longi מוצר 15–25) — לפי מסמכי היבואן.

---

## 9. ארכיטקטורה מוצעת (integrate vs. build)

```
PWA סקר אתר ──► roof.json (פוליגונים, מכשולים, אזימוט, tilt, סוג גג)
                     │
   [BUILD] layout-engine (TS, turf/shapely) ──► layout.json (מודולים, strings) ──► eplan (ezdxf) DXF/PDF
                     │
   [INTEGRATE] pvlib + PVGIS (chinam) / Meteonorm TMY (CHF 320/שנה) ──► yield.json (8760, חודשי, PR, kWh/kWp)
                     │                                                 └─ אופציונלי: Google dataLayers (אם ישראל מכוסה) להצללה
   [BUILD] catalog (CEC CSV + read_panond + ידני) ──► ציוד/BOM/מחירון
                     │
   [BUILD] finance (TS/py: NPV/IRR/payback, מע"מ 18%, מונה נטו/ייצור עצמי, הצמדה) ──► proposal.json
                     │
   [BUILD] proposal renderer (HTML RTL → PDF; WeasyPrint/Playwright) + אימות מול SolarEdge Designer / SmartDesign (ידני)
   [OPTIONAL] PVsyst (ידני, CHF 700) לדוח בנקאי; OpenSolar (חינם) כ-CRM/חתימה דיגיטלית
```
