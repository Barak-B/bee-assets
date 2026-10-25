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
python -m pytest -q
```

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
| `bee_cad/render.py` | בניית המסמך, PNG תצוגה מקדימה (ezdxf → matplotlib, רקע לבן, bidi) |
| `assets/fonts/shx/` | 100 גופני SHX עבריים מהמשרד (HEBREW, SIVAN, NARKIS, MIRYAM, ORON, TECHNO, …) |
| `assets/plot/` | `SARA.ctb` ו-`DWG To PDF.pc3` מה-eTransmit של הקונסטרוקטור |
| `examples/house_karka.json` | דוגמה: בית מגורים — MDB (20 מעגלים, 3 פחתים, SPD, הזנה לממיר) + לוח חיוני BUB |

## מה עדיין לא כאן (ראו `docs/DESIGN_ENGINE_RESEARCH_2026-10-17.md`)

חיבור למנוע החישוב eplan (מחרוזות / כבלים / הגנות), ספריית הבלוקים הדינמיים (186+152), מתח גבוה, DWG ישיר (דורש worker של GstarCAD/AutoCAD בחלונות), Revit, פריסת PV תלת-ממדית, audit חפיפות טקסט.
