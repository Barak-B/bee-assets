# bee-cad — מנוע ה-CAD של ברק הנדסת חשמל (שלד v0.1)

מודל תכנון אחד (JSON / YAML) → DXF שנפתח ב-AutoCAD / GstarCAD (ומומר ל-DWG במשרד) עם:

- **חד-קווי (E-xx)** — ארון מונה חח"י, מפסק ראשי, פס צבירה, קבוצות פחת ומעגלי קצה, הזנות לממיר / אגירה / לוח חיוני, פסי PE/N, מקרא, הערות, סיכום מאמ"תים לפי מופע.
- **מבנה לוח (E-Pxx)** — חזית דלת פתוחה עם מסילות DIN ורוחבי מודול 18 מ"מ, חתך צד, מידות (ישויות DIMENSION אמיתיות), נתוני הלוח, טבלת ציוד עם מיקום X לכל רכיב.
- **מתח גבוה (E-xx / E-xxA)** — מסדר תאים (מפסק ואקום, CT, VT, ממסר, מנתק הארקה, VPIS, ראש כבל) ומפרט תאים וציוד.
- **שבלונת קידוח (E-20)** — תושבות Double-T (IPE 200) ועוגנים כימיים לארונות BESS על משטח בטון: מבט על, פרט, טבלת קואורדינטות, בדיקות מרחק/מרווח.
- **דף שער (E-00)** — נתוני הפרויקט, רשימת הגיליונות (נגזרת מהסט שמצויר בפועל), מהדורות, מסמכי מקור ונושאים לאימות מכל חלקי המודל.
- **הערות כלליות (E-01)** — ספריית הערות המשרד (חוק החשמל ותקנותיו, ת"י 61439), מקרא סמלים IEC 60617 מספריית הבלוקים, קיצורים.
- **פריסת תשתיות (E-02)** — מבט על, חזית עם קורות Double-T וחתך צד של חצר BESS מאותו מודל כמו שבלונת הקידוח; תעלות, תוואים, לוחות.
- **הארקות (E-06)** — סכמת פסי הארקה/השוואת פוטנציאלים, טבעת הארקת יסוד במשטח, פרט אלקטרודה, טבלת בדיקות.
- **תקשורת (E-07)** — דיאגרמת חיבור: מונים, לוח תקשורת (EMS, מתג, ראוטר), ארונות PCS, טבלת קישורים.
- **רשימת כבלים (E-30) וטבלת עומסים (E-31)** — מהמודל, עם סיכום לפי לוח; מתפצלות לדפים לפי הצורך.
- **בדיקה עצמית** — `bee-cad check`: כללי מודל (העמסת כבל IEC 60364-5-52, פחת 30mA, איזון מופעים, יעדי הזנה…) וכללי גיליון (אודיט חפיפות, טקסט זעיר, התאמה לתוכנית הסט) → דוח QA עם ציון.

שני הגיליונות נקראים מאותו מודל, כך שתג / דירוג / מספר מעגלים לא יכולים להיות שונים בין החד-קווי לחזית.

## הרצה

```bash
cd engine
pip install -e ".[dev]"
bee-cad render examples/house_karka.json --out out/house --png --pdf
bee-cad render examples/bess_drill_template.json --out out/drill --pdf --archive "L:/האחסון שלי/עבודה/לקוחות חברות ומכרזים" --stage design --job auto
bee-cad from-eplan examples/eplan/example.yaml --calc examples/eplan/example_calc.json --merge examples/house_karka.json --out out/pv_house.json
python -m pytest -q
```

הפלט: `out/house/house_karka.dxf` (R2018, mm, כל הגיליונות זה לצד זה) + PNG/PDF לכל גיליון + `<stem>_SET.pdf` (A3 וקטורי). `--sheets cover,mv,sld,panel,drill` בוחר גיליונות (ברירת מחדל: כולם, דף השער ראשון). `--archive` מעתיק ל-`<לקוח>/<פרויקט>/<שלב>/` עם `manifest.json`; `--job` כותב רשומת Hive לפי `platform/schema/job.schema.json` (loop `edit.cad_render`, תוצאת האודיט, תיקיית הארכיון). `--mode shx` כותב עברית בסדר ויזואלי (הפוך) לגופני SHX ישנים (`HEBREW.SHX` וכד').

כל גיליון עובר אודיט חפיפות (`bee_cad/audit.py`): טקסט/טקסט, טקסט/קו, טקסט מחוץ למסגרת — היעד הוא `0/0/0` בכל הדוגמאות (נבדק ב-`tests/`).

## מבנה

| קובץ | תפקיד |
|---|---|
| `bee_cad/model.py` | המודל: `Design` → `Board` (supply, incomer, busbar, groups → circuits, feeders, enclosure) + `Node` (ממיר, מצבר, PV, גנרטור, שנאי) + `TitleBlock` |
| `bee_cad/symbols.py` | סמלי IEC 60617 כבלוקים (`BEE_MCB_4P`, `BEE_RCD_4P`, `BEE_SPD`, `BEE_METER_KWH`, `BEE_CT`, `BEE_INVERTER`, `BEE_BATTERY`, `BEE_PV`, `BEE_TRANSFORMER`, `BEE_GENERATOR`, …) |
| `bee_cad/sheet.py` | גיליון A3, רשת 12×8, כותרת עליונה, בלוק כותרת וטבלת מהדורות בסגנון המשרד; סגנונות טקסט `BEE-HEB` (Arial), `BEE-LAT` (isocp), `BEE-HEB-SHX` |
| `bee_cad/layers.py` | תקן שכבות `BEE-*` (צבע ACI, עובי קו, סוג קו) |
| `bee_cad/sld.py` | פריסת החד-קווי (עמודות דטרמיניסטיות) |
| `bee_cad/panel.py` | מילוי מסילות DIN לפי סדר החד-קווי, חזית וחתך, טבלאות |
| `bee_cad/text.py` | עברית: סדר לוגי (TTF) / סדר ויזואלי (SHX) בעזרת python-bidi; פיצול שורות עברית/לטינית |
| `bee_cad/mv.py` | מתח גבוה: `MVBoard`/`MVCell` → מסדר תאים + גיליון מפרט (E-xxA) |
| `bee_cad/template.py` | שבלונת קידוח: `DrillTemplate` (משטח, ארונות, קורות, עוגן) → מבט על 1:25/1:50/1:100, פרט 1:10–1:25, טבלאות, `TemplateChecks` |
| `bee_cad/cover.py` | דף שער E-00 מתוך תוכנית הסט (`render.plan_sheets`) |
| `bee_cad/audit.py` | אודיט חפיפות טקסט לכל גיליון |
| `bee_cad/archive.py` | תיק פרויקט: `<לקוח>/<פרויקט>/<שלב>/` + `manifest.json` (מראה של "עבודה/לקוחות חברות ומכרזים") |
| `bee_cad/hive.py` | רשומת משימה (job) לפי סכמת ה-Hive |
| `bee_cad/qa.py` | בדיקה עצמית — כללי מודל וגיליון, דוח `_qa.json/.md`, ציון |
| `bee_cad/site.py`, `earthing.py`, `comm.py`, `schedules.py` | גיליונות פריסת תשתיות, הארקות, תקשורת, טבלאות והערות כלליות |
| `bee_cad/eplan_bridge.py` | eplan spec YAML + CalcReport JSON → `Design` (מיזוג עם לוח קיים) |
| `bee_cad/render.py` | `plan_sheets` → `build` (כל גיליון במודל-ספייס, 30 מ"מ בין גיליונות), PNG (matplotlib) ו-PDF (PyMuPDF) בסדר ויזואלי |
| `assets/fonts/shx/` | 100 גופני SHX עבריים מהמשרד (HEBREW, SIVAN, NARKIS, MIRYAM, ORON, TECHNO, …) |
| `assets/plot/` | `SARA.ctb` ו-`DWG To PDF.pc3` מה-eTransmit של הקונסטרוקטור |
| `examples/house_karka.json` | דוגמה: בית מגורים — MDB (20 מעגלים, 3 פחתים, SPD, הזנה לממיר) + לוח חיוני BUB |
| `examples/eplan/` | ספק YAML + CalcReport של eplan — דוגמת `from-eplan` |
| `examples/mv_bess_site.json` | מתחם אגירה 33kV: 8 תאים (חח"י, VT, AUX, PCS×2, PV-MVS, מנייה) |
| `examples/bess_drill_template.json` | כל גדר (אפקון/Roche): 4 ארונות 261kWh על משטח 5.2×2.1 — לפי G009 של Roche, 32 עוגנים |
| `examples/bess1_drill_template_18.json` | אורי פלסט BESS1: 18 ארונות על משטח 20.5×1.8 (1:100), 144 עוגנים, טבלה לכל ארון |
| `examples/kal_gader_bess.json` | **סט BESS מלא** (כל גדר, לפי G002 של Roche): 15 גיליונות — שער, הערות, פריסת תשתיות, 3 חד-קוויים, הארקות, תקשורת, 4 חזיתות לוחות, שבלונת קידוח, כבלים, עומסים |

## מה עדיין לא כאן (ראו `docs/DESIGN_ENGINE_RESEARCH_2026-10-17.md`)

ספריית הבלוקים הדינמיים (186+152), DWG ישיר (דורש worker של GstarCAD/AutoCAD בחלונות), Revit, פריסת PV תלת-ממדית, העלאה אוטומטית ל-Drive (`tools/drive_upload.py` — ללא הרשאות בסביבה הזו), ארון רצפתי רב-תאי (T4P), גיליון הארקות.
