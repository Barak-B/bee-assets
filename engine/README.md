# bee-cad — מנוע ה-CAD של ברק הנדסת חשמל (שלד v0.1)

מודל תכנון אחד (JSON / YAML) → DXF שנפתח ב-AutoCAD / GstarCAD (ומומר ל-DWG במשרד) עם:

- **חד-קווי (E-xx)** — ארון מונה חח"י, מפסק ראשי, פס צבירה, קבוצות פחת ומעגלי קצה, הזנות לממיר / אגירה / לוח חיוני, פסי PE/N, מקרא, הערות, סיכום מאמ"תים לפי מופע.
- **מבנה לוח (E-Pxx)** — חזית דלת פתוחה עם מסילות DIN ורוחבי מודול 18 מ"מ, חתך צד, מידות (ישויות DIMENSION אמיתיות), נתוני הלוח, טבלת ציוד עם מיקום X לכל רכיב.

שני הגיליונות נקראים מאותו מודל, כך שתג / דירוג / מספר מעגלים לא יכולים להיות שונים בין החד-קווי לחזית.

## הרצה

```bash
cd engine
pip install -e ".[dev]"
bee-cad render examples/house_karka.json --out out/house --png
bee-cad check examples/house_karka.json          # בדיקות תכנון, הודעות בעברית (--json לאפליקציה)
bee-cad bom examples/house_karka.json --out bom.csv
python -m pytest -q
```

`render` מריץ את הבדיקות לפני השרטוט ומדפיס אותן; עם `--strict` הוא לא משרטט כשיש שגיאות. מפל מתח שלא הוזן מחושב ומודפס בחד-קווי.

### מה נבדק

| קוד | רמה | מה |
|---|---|---|
| `CABLE_OVERLOAD` | שגיאה | מפסק גדול מכושר ההולכה של הכבל (IEC 60364-5-52 נספח B, נחושת, 30°C, בלי מקדם קיבוץ; B1 למעגלים סופיים, C ליציאות, אלא אם `cable.method`) |
| `DU_HIGH` / `DU_COMPUTED` | אזהרה / מידע | מפל מתח מעל 4%, או חישוב שנכתב לשרטוט (זרם מ-`load_kw`, אחרת דירוג המפסק) |
| `POLES_PHASE`, `NO_PHASE`, `NO_CABLE` | שגיאה / אזהרה | מעגל תלת-פאזי עם מפסק חד-קוטבי, מעגל בלי מופע או בלי כבל |
| `DUP_TAG`, `BAD_REF` | שגיאה | תג כפול בלוח, יציאה ללוח או רכיב שלא קיים |
| `RCD_SOCKETS`, `RCD_UNDERRATED` | שגיאה / אזהרה | שקעים בלי פחת 30mA, פחת קטן מהמעגל אחריו |
| `SELECTIVITY` | אזהרה | יציאה שלא קטנה מהמפסק הראשי (לא כולל הזנה מממיר / מצבר / גנרטור) |
| `PHASE_BALANCE` | אזהרה | פער של יותר מ-35% בין המופעים |

כתב הכמויות מקבץ פריטים זהים ומסמן כל שורה באות IEC 81346-2 (QA מפסק, FB פחת, FC מגן ברקים, PG מונה, כמו ב-Ecodial).

הפלט: `out/house/house_karka.dxf` (R2018, mm) + PNG לכל גיליון. `--mode shx` כותב עברית בסדר ויזואלי (הפוך) לגופני SHX ישנים (`HEBREW.SHX` וכד').

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
| `bee_cad/calc.py` | פענוח כינוי כבל, כושר הולכה, מפל מתח, אותיות IEC 81346 |
| `bee_cad/checks.py` | כללי התכנון וההודעות בעברית |
| `bee_cad/bom.py` | כתב כמויות → CSV שנפתח באקסל |
| `bee_cad/render.py` | בניית המסמך, PNG תצוגה מקדימה (ezdxf → matplotlib, רקע לבן, bidi) |
| `assets/fonts/shx/` | 100 גופני SHX עבריים מהמשרד (HEBREW, SIVAN, NARKIS, MIRYAM, ORON, TECHNO, …) |
| `assets/plot/` | `SARA.ctb` ו-`DWG To PDF.pc3` מה-eTransmit של הקונסטרוקטור |
| `examples/house_karka.json` | דוגמה: בית מגורים — MDB (20 מעגלים, 3 פחתים, SPD, הזנה לממיר) + לוח חיוני BUB |

## מה עדיין לא כאן (ראו `docs/DESIGN_ENGINE_RESEARCH_2026-10-17.md`)

חיבור למנוע החישוב eplan (מחרוזות / כבלים / הגנות), ספריית הבלוקים הדינמיים (186+152), מתח גבוה, DWG ישיר (דורש worker של GstarCAD/AutoCAD בחלונות), Revit, פריסת PV תלת-ממדית, audit חפיפות טקסט.
