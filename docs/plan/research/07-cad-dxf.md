# 07 — כלי CAD: יצירת DXF/DWG, המרה, רינדור ובקרת איכות (2025–2026)

**הקשר:** מנוע שרטוט אוטומטי (eplan) של B.E.E — ezdxf + matplotlib + python-bidi, גיליונות A3 (E-01…E-08), ספריית 186 בלוקים + 152 בלוקים דינמיים, קלט מקבלנים ב-GstarCAD 2027 (eTransmit, גופני SHX עבריים, CTB), פלט DWG+PDF לבודקים ולמשתמשי AutoCAD/GstarCAD.
**תאריך סקירה:** 2026-10-06. **מגבלת מחקר:** תקציב החיפוש נגמר באמצע; מספר דומיינים (readthedocs, opendesign.com, aps.autodesk.com, qcad.org, aspose, gstarcad.net, wikipedia) חסומים ב-proxy — פרטים שלא אומתו ישירות מסומנים ב-«לא אומת».

---

## 0. תקציר מנהלים

1. **ezdxf 1.4.4 (14.5.2026, Python ≥3.10)** הוא ליבה טובה ל-DXF: ATTRIB/ATTDEF, פריסות נייר + VIEWPORT, HATCH, IMAGE/IMAGEDEF, xref, CTB (קריאה/כתיבה), GeoData, מדידת טקסט (`text_size`/`mtext_size`), ורינדור PDF/PNG/SVG. **הוא לא כותב DWG** ו**לא מבין בלוקים דינמיים** (רק שומר אותם כ-XRECORD/EVALUATION_GRAPH ללא פענוח; העתקה שלהם שוברת אותם — issue #1203 פתוח).
2. **DWG אמיתי (R2018)** אפשרי בפועל רק דרך (א) ODA File Converter — חינם אך **לשימוש לא-מסחרי בלבד** ללא חברות ב-ODA (Commercial: 3,000$ שנה ראשונה), (ב) **worker ב-Windows עם GstarCAD/AutoCAD** (SCR / .NET / Python API / cad-pyrx), (ג) APS Automation API (ענן, Flex tokens), (ד) ספריות מסחריות (Aspose.CAD ~799$). **LibreDWG לא כותב R2010–R2018 באופן אמין** (שגיאות CRC, לפי README).
3. **בלוקים דינמיים עם מצבי נראות** — אין ספרייה קוד-פתוח יציבה. הפתרון הפרקטי: **עובד GstarCAD בחלון (Windows)** שמכניס את הבלוק מספריית ה-DWG ומגדיר מאפיינים דרך ה-API, או לייצר מראש **וריאנטים סטטיים** (בלוק רגיל לכל מצב נראות) ולהשתמש בהם ב-DXF. ה-fork `pucejuice/ezdxf-fork` (תוסף `ezdxf.addons.dynblock`, קומיטים מ-4.10.2026) מנסה לכתוב בלוקים דינמיים ב-DXF טהור — ניסיוני, לא מתועד, לא אומת ב-CAD.
4. **רינדור:** ezdxf `PyMuPdfBackend` ל-PDF/PNG, `MatplotlibBackend` ל-PNG; SHX נתמך מאז 1.1 (fontTools) אם ה-`support_dirs` מוגדרים. עברית: אין תיעוד bidi ב-ezdxf — להמשיך עם python-bidi (0.6.11, 30.6.2026, מימוש Rust) ולבדוק ויזואלית. תצוגה בדפדפן: `dxf-viewer` (MPL-2.0, three.js, שכבות, worker, TTF+Unicode) או SVG-per-layer מ-`SVGBackend`.
5. **שערי איכות:** `ezdxf.bbox` + `text_size` לזיהוי חפיפות טקסט (הערה: תיבות טקסט "לא מדויקות"), pixelmatch/odiff/Playwright לרגרסיה ויזואלית, `ezdxf audit` ל-lint.

---

## 1. ezdxf — יכולות ומגבלות (גרסה 1.4.4)

| נושא | מצב | הערות / מקור |
|---|---|---|
| **גרסה** | 1.4.4, 14.5.2026, Python ≥3.10, MIT | https://pypi.org/project/ezdxf/ |
| **DWG** | **אין** תמיכה ילידית. "ezdxf is not a CAD file format converter… can not convert DXF files to other CAD formats such as DWG". תוסף `ezdxf.addons.odafc` עוטף את ODA File Converter (R12–R2018): `readfile`, `export_dwg`, `convert`, `is_installed`. | https://ezdxf.readthedocs.io/en/stable/introduction.html , https://ezdxf.readthedocs.io/en/stable/addons/odafc.html |
| **odafc ב-Linux** | נתיב ב-config (`unix_exec_path`, תומך AppImage); ייתכן צורך ב-`xvfb` כדי לדכא את ה-GUI של הממיר; אזהרת אבטחה (הרצת exe חיצוני). | odafc docs (raw rst) |
| **בלוקים דינמיים** | **לא נתמך** — "no support for these features beyond the preservation of these undocumented DXF entities". המתחזק (Discussion #403): "The structure of dynamic blocks is not documented… no active support". Issue #1203 (פתוח): העתקת בלוק דינמי דרך ezdxf מאבדת את הדינמיות. | https://github.com/mozman/ezdxf/discussions/403 , https://github.com/mozman/ezdxf/issues/1203 |
| **הכנסת בלוק דינמי + קביעת מצב נראות** | **לא אפשרי ב-ezdxf הרשמי.** INSERT של בלוק דינמי "כמו שהוא" ייראה במצב ברירת המחדל; שינוי מצב דורש יצירת בלוק אנונימי `*U` + XRECORDs של `AcDbBlockRepresentation` — לא מתועד. | ראו fork בסעיף 1.1 |
| **ATTRIB / ATTDEF** | נתמך מלא: הגדרת ATTDEF בבלוק, `add_auto_blockref`/`add_auto_attribs`, עריכת ערכים, מחיקה. (ידע מתיעוד; הדף חסום — «לא אומת בשליפה זו») | https://ezdxf.readthedocs.io/en/stable/tutorials/blocks.html |
| **Xref** | מודול `ezdxf.xref`: `attach`, `detach`, `embed`, `load_modelspace/paperspace`, `write_block`; xref ל-DWG דורש odafc (AutoCAD מציג רק DWG כ-xref). **תוסף הציור לא מרנדר xref כלל.** ACAD_TABLE/ACIS לא מועתקים. | https://ezdxf.readthedocs.io/en/stable/tutorials/xref_module.html |
| **פריסות נייר / VIEWPORT** | `layout.page_setup()` (גודל, שוליים, יחידות, סיבוב), `add_viewport()` עם `view_center_point`/`view_height` (קנה מידה = יחס), הקפאת שכבות ו-override מאפיינים לכל viewport. **דורש R2000+** (R12 לא מייצא ממדי דף). | https://ezdxf.readthedocs.io/en/stable/tutorials/psp_viewports.html |
| **Plot styles (CTB/STB)** | תוסף `ezdxf.addons.acadctb`: `load`, `new_ctb`, `new_stb`, `save`; מאפייני PlotStyle (עט, screening, linetype, lineweight, end/join/fill). ב-drawing add-on: `RenderContext` מקבל קובץ CTB **כפלטת צבעים** בלבד (לא כל סמנטיקת ההדפסה). | https://ezdxf.readthedocs.io/en/stable/addons/acadctb.html |
| **גופני SHX / עברית** | מאז v1.1 רינדור טקסט ב-fontTools; **SHX/SHP/LFF נתמכים** כגופני-קו (stroke) אם הנתיבים ב-`support_dirs` ובנו מטמון (`ezdxf --fonts` / `build_system_font_cache()`). Fallback: Arial → DejaVuSans → LiberationSans → OpenSans. **אין שום תיעוד ל-bidi/RTL** — ezdxf מצייר את המחרוזת כפי שהיא; לכן ההמרה ל-visual order (python-bidi) לפני כתיבת TEXT היא הנוהג, אך מה ש-AutoCAD/GstarCAD עושים עם מחרוזת visual-order + גופן TTF עברי (שמבצעים bidi בעצמם) **לא אומת** — יש לבדוק שני המסלולים (heb.shx vs. TTF) ב-GstarCAD. | https://ezdxf.readthedocs.io/en/stable/tools/fonts.html |
| **מדידת טקסט** | `ezdxf.tools.text_size.text_size()` → width/cap_height/total_height; `mtext_size()` → total_width/height, עמודות; `fonts.make_font().text_width()`; `FontMeasurements`. `ezdxf.bbox.extents()` — **"Boundary boxes for text entities are not accurate!"**; `text2path` ממיר TEXT/ATTRIB (לא MTEXT) למסלולים — טוב ל-bbox מדויק יותר. | https://ezdxf.readthedocs.io/en/stable/tools/text_size.html , …/bbox.html , …/addons/text2path.html |
| **HATCH** | יצירה ורינדור (מדיניות hatch ב-`Configuration`); גופני-קו לא ניתנים ל-HATCH (text2path). | drawing docs |
| **תמונות (אורתופוטו)** | `doc.add_image_def(filename, size_in_pixel)` + `msp.add_image(...)`; **התמונה לא מוטמעת** (קובץ חיצוני, נתיב יחסי/מוחלט) — R2000+. רינדור IMAGE ב-drawing add-on: יש מדיניות image ב-`Configuration` («רמת התמיכה בפועל לא אומתה»). PDF underlay: ישות UNDERLAY קיימת ב-DXF; רינדור — «לא אומת». | https://ezdxf.readthedocs.io/en/stable/tutorials/image.html |
| **גיאו-רפרנס** | `ezdxf.addons.geo` + `GeoData` (OBJECTS section, מקושר ל-BLOCK_RECORD של הפריסה), EPSG/CRS XML; רק EPSG:3395 ממומש בתוסף — לשאר להשתמש ב-pyproj/GDAL. | https://ezdxf.readthedocs.io/en/stable/addons/geo.html , …/dxfobjects/geodata.html |
| **ACAD_TABLE** | לא נתמך ("very unlikely"); `TablePainter` יוצר טבלה מישויות רגילות. | https://ezdxf.readthedocs.io/en/stable/addons/tablepainter.html |
| **Drawing add-on — backends** | Matplotlib (PNG/PDF/SVG), PyQt/PySide, **PyMuPDF** (`get_pdf_bytes()`, `get_pixmap_bytes(fmt, dpi)` — PDF/PNG/PPM/PBM), SVG, HPGL/2 plotter, DXF, GeoJSON/JSON. `draw_layout()` תומך בפריסות נייר; VIEWPORT מרונדר כ-top view. | https://ezdxf.readthedocs.io/en/stable/addons/drawing.html |
| **מגבלות drawing (ציטוט)** | MTEXT rich-text "close but not pixel perfect"; POINT; ACIS לא; אין 3D; "VIEWPORTS are always rendered as top view"; קו אינסופי, OLE2FRAME, טקסט אנכי, עמודות MTEXT — חלקי. | drawing.rst |
| **CLI** | `ezdxf audit`, `ezdxf draw`, `ezdxf view`, `ezdxf pp`, `ezdxf strip`, `ezdxf --fonts` (ידע; הדף חסום — «לא אומת בשליפה זו»). | https://ezdxf.readthedocs.io/en/stable/usage_for_beginners.html |

### 1.1 ה-fork `pucejuice/ezdxf-fork` — תוסף `dynblock` (ניסיוני)
- מקור: https://github.com/pucejuice/ezdxf-fork (MIT). README לא מזכיר את התוסף; אין docs rst. קומיטים מ-4.10.2026 בחתימת "claude": "Add ezdxf.addons.dynblock: read, copy and write dynamic blocks", "survey", "transplant blocks that use complex linetypes", "Delete dynamic blocks… without dangling objects".
- לפי docstring של `src/ezdxf/addons/dynblock.py`: `read_graph()` קורא `ACAD_EVALUATION_GRAPH`; `define_dynamic_blocks()` משתיל הגדרות בין מסמכים כולל הגרף; `add_dynamic()` כותב INSERT במצב דינמי נתון כבלוק `*U` + `AcDbBlockRepBTag` XDATA + XRECORDs של `AcDbBlockRepresentation`; `survey()` מדווח אילו בלוקים ניתנים להצבה.
- נתמך: linear/stretch, rotation, flip, **visibility states**, lookup. לא נתמך (זורק `NotImplementedError`): XY, polar, point, array, move, scale; טקסט ב-flip; lookups משורשרים; stretch multipliers.
- דרישות: **DXF R2018+**; "representation constants must be captured from CAD seed instances" — כלומר צריך **קובץ seed** עם מופע של כל בלוק בכל מצב, שנשמר מ-CAD אמיתי; בלוק ללא seed לא ניתן להציב.
- **סטטוס: לא אומת** האם AutoCAD/GstarCAD מזהים את הפלט כבלוק דינמי תקין. לשימוש רק אחרי בדיקת קבלה ב-GstarCAD 2027 + AutoCAD.

---

## 2. חלופות לכתיבת DWG

| כלי | כתיבת DWG | בלוקים דינמיים | עברית/SHX | Headless Linux | רישיון / עלות | המלצה |
|---|---|---|---|---|---|---|
| **ezdxf** 1.4.4 | לא (DXF בלבד) | שימור בלבד | SHX ברינדור (fontTools); bidi ידני | כן | MIT | ליבת הגנרטור |
| **ODA File Converter** 27.x | כן, R12–R2018 (DXF↔DWG) | שומר (ממיר קובץ שלם) | לא רלוונטי (המרה) | כן (AppImage + xvfb) | חינם **לשימוש לא-מסחרי בלבד**; מסחרי = חברות ODA: Commercial 3,000$/שנה ראשונה, 2,250$ חידוש (הפצה עד 100 עותקים); Sustaining 7,500$/4,500$; Non-Commercial 375$/150$ (ללא מסחור) | רק עם חברות; אחרת סיכון רישוי |
| **LibreDWG** 0.13.4 (3.2026) | r1.2–r2000 בלבד; "R2010-R2018 writing leads to CRC errors still" | לא | — | כן | GPL-3.0 | **לא** ל-R2018. שימושי לקריאת DWG → DXF (`dwg2dxf`) עם זהירות (issue #1069: DXF שקורס ב-AutoCAD 2025) |
| **Aspose.CAD for Python via .NET** | כן (DXF→DWG, וגם PDF/PNG) | לא מתועד («לא אומת») | «לא אומת» | כן (.NET runtime) | מ-799$ (Developer Small Business, לפי תוצאות חיפוש; דף המחירים חסום) | אופציה מסחרית אם לא רוצים Windows worker; לבדוק איכות DWG ובלוקים דינמיים בניסיון |
| **CAD Exchanger SDK** | DWG (3D-oriented; Python binding) | לא | — | כן | מ-590$ (לפי GetApp; «לא אומת») | פחות מתאים לשרטוט 2D-חשמל |
| **APS Automation API (Design Automation for AutoCAD)** | כן — מריץ AutoCAD אמיתי בענן עם plugin .NET/Script; פלט DWG מלא כולל בלוקים דינמיים (AutoCAD engine) | **כן** (AutoCAD אמיתי) | כן (AutoCAD) | כן (REST) | מודל דו-שכבתי: Free tier עם תקרות חודשיות + Paid (Flex tokens / Pay-as-you-go); Cloud Credits הופסקו (מעבר ל-Flex); **מחירים ספציפיים לא אומתו** (הדף חסום) | הטוב ביותר ל-DWG "אמיתי" בלי שרת Windows, אם העלות לעבודה (job) סבירה — לבדוק בעמוד https://aps.autodesk.com/pricing |
| **AutoCAD `accoreconsole.exe`** | כן (SCR/.NET; גם ב-LT) | כן | כן | Windows בלבד (דורש רישיון AutoCAD/LT) | רישיון AutoCAD; כלי `acadbp` (MIT): `dwgout`, `dxfout`, `script`, `publish` (PDF) | אם יש רישיון AutoCAD במשרד |
| **GstarCAD 2025/2026** | כן (DWG תואם AutoCAD 2.5–2024 לפי המדריך 2025; **2027 לא אומת**) | כן (כעורך DWG מלא) | כן (SHX/heb) | Windows בלבד; SCR scripts, Batch Print/Purge, LISP, .NET (`GStarCad.Net` 20.26.1 NuGet), VBA, COM, **Python** (מאז 2025: ~790 interfaces, Python 3.11.8, Win10+) | רישיון GstarCAD (קיים אצל הקבלנים; למשרד — Standard/Professional) | **המומלץ** ל-worker: אותו מוצר שהקבלנים והבודקים משתמשים בו → תאימות מקסימלית |
| **cad-pyrx (PyRx)** 3.1.13 (1.10.2026) | דרך ה-CAD המארח | כן (ObjectARX-level API) | כן | Windows בלבד; Python 3.14 | LGPL-3.0; תומך AutoCAD 2022–2027, BricsCAD V24–V26, **GstarCAD 2024–2026**, ZWCAD 2024–2027 | Python אחיד לכל CAD מארח — נוח לצוות Python |
| **BricsCAD** | כן | כן (קריאה; יצירה לא — לפי mozman, «לא אומת לגרסאות חדשות») | כן | **יש גרסת Linux**; `/automation` (ללא UI) + `/B script.scr` | רישיון מסחרי (Lite/Pro) | חלופה ל-worker אם רוצים Linux |
| **QCAD Professional** | DWG (דרך רכיב ODA ב-Pro; «לא אומת») | לא | LFF/TTF; SHX «לא אומת» | כן: `dwg2pdf`, `dwg2bmp`, `dwg2svg`, `qcad -no-gui -autostart script.js` | Pro מסחרי (זול, חד-פעמי); Community GPL ללא DWG | רינדור batch זול; לא לכתיבת DWG קריטית |
| **LibreCAD** 2.2.1 | DWG קריאה (libdxfrw) בלבד | לא | LFF | `librecad dxf2pdf/dxf2png/dxf2svg` | GPLv2 | רק אם צריך רינדור חינמי; איכות SHX עברי «לא אומת» |
| **nanoCAD / ZWCAD** | כן (עורכים) | כן | כן | Windows | מסחרי | «לא נחקר» (תקציב חיפוש); ZWCAD נתמך ע"י cad-pyrx |

### 2.1 המלצת צנרת ל-DWG R2018 עם בלוקים דינמיים
- **DXF נשאר מקור האמת** (ezdxf). בלוקים "רגילים" (186) נכנסים כ-INSERT + ATTRIB.
- **152 הבלוקים הדינמיים — שתי אסטרטגיות (אפשר לשלב):**
  1. **"Flatten to variants"** — סקריפט חד-פעמי ב-GstarCAD/AutoCAD (LISP/Python) שמייצא כל מצב נראות לבלוק סטטי `NAME__STATE` (DWG ספרייה). ה-eplan מכניס את הווריאנט הנכון ב-DXF. יתרון: DXF/PDF נכונים בכל כלי, אפילו ב-Linux; חיסרון: המשתמש ב-AutoCAD מאבד את "הגריפ" לשינוי מצב.
  2. **"Late binding" ב-worker Windows** — ה-DXF מכיל INSERT של placeholder (בלוק סטטי + XDATA `BEE_DYN:name;state;params`). ה-worker (GstarCAD + Python/cad-pyrx או .NET) פותח את ה-DXF, מחליף כל placeholder ב-INSERT של הבלוק הדינמי מספריית ה-DWG, מגדיר `DynamicBlockReferenceProperty` (visibility/lookup/distance), מריץ `AUDIT`, `-PURGE`, `SAVEAS 2018`, ו-`PLOT` ל-PDF עם ה-CTB המשרדי. זה נותן DWG שבודק/קבלן פותח ב-GstarCAD/AutoCAD עם בלוקים דינמיים חיים.
- **ODA File Converter** — רק אם תירכש חברות ODA (3,000$); אחרת לשימוש פיתוח פנימי בלבד (לא-מסחרי) ולא ב-SaaS.
- **APS Automation** — חלופה ללא Windows, בעלות לפי שימוש; מתאים אם נפח הגיליונות נמוך ורוצים AutoCAD "אמיתי" בענן.

---

## 3. רינדור DXF → PDF / PNG / web

| אפשרות | איכות | עברית/SHX | headless | הערות |
|---|---|---|---|---|
| ezdxf `MatplotlibBackend` | טובה ל-PNG; PDF וקטורי דרך matplotlib | SHX כקווים, TTF דרך fontTools; bidi ידני | כן | `set_pixel_density`, `set_size_inches`, `set_pixel_size`, `render_limits` (1:100), `ax.margins(0)`; lineweight דרך `Configuration.min_lineweight`/`lineweight_scaling` |
| ezdxf `PyMuPdfBackend` | **מומלץ ל-PDF** (וקטורי, קל) + PNG/PPM מהיר | כנ"ל | כן | `get_pdf_bytes()`, `get_pixmap_bytes(fmt="png", dpi=…)`; `draw_layout()` לפריסת נייר A3 |
| ezdxf `SVGBackend` | וקטורי לרשת | כנ"ל | כן | אפשר לרנדר **כל שכבה ל-SVG נפרד** (filter function) → toggle ב-CSS בדפדפן |
| QCAD Pro `dwg2pdf` / `dwg2bmp` | טובה | LFF/TTF; SHX «לא אומת» | כן (`-no-gui`) | לולאת bash לקובץ-קובץ; אפשרות `-a` auto-fit |
| LibreCAD `dxf2pdf/png/svg` | בסיסית | «לא אומת» | כן | GPLv2 |
| ODA File Converter | אין רינדור (ODA Viewer הוא GUI) | — | — | — |
| APS Viewer | מצוין (SVF 2D, שכבות, מדידה) | AutoCAD-grade | ענן | דורש Model Derivative job לכל DWG (בתשלום); PDF/DWF נטענים ילידית בעזרת `Autodesk.PDF`/`Autodesk.DWF` |
| **CAD worker (GstarCAD/AutoCAD PLOT)** | **הכי נאמן** (CTB, lineweights, SHX עברי, בלוקים דינמיים) | כן | Windows | PDF "רשמי" לבודק; ezdxf ל-preview מהיר |

### 3.1 תצוגה בדפדפן עם toggle שכבות
| ספרייה | גרסה | רישיון | שכבות | גופנים/Unicode | מגבלות |
|---|---|---|---|---|---|
| **dxf-viewer** (vagran) | 1.0.49, 20.1.2025 | MPL-2.0 | כן (batches לפי שכבה, show/hide) | TTF דרך OpenType.js, Unicode + fallback; **"DXF style and font attributes are ignored"** (לא SHX) | אין linetypes, אין paper space/layouts, אין קווים רחבים; worker לפרסינג; three.js |
| **three-dxf-viewer** (ieskudero) | 1.0.44, 4.9.2025 | MIT | `viewer.layers` show/hide | JSON typeface של three.js (לא TTF ישיר) | blocks/text/mtext; `DefaultTextHeight` ידני |
| three-dxf (gdsestimating) | 1.3.1 (≈5 שנים) | MIT | כן | מוגבל | לא מתוחזק |
| **SVG-per-layer מ-ezdxf** | — | MIT | toggle ב-CSS/JS | **אותו רינדור כמו ה-PDF** (עקביות!) | סטטי; קבצים גדולים ברשת צפופה |
| APS Viewer | v7 | מסחרי | כן | AutoCAD | תלות ענן + עלות המרה |
- **המלצה:** ל-web app פנימי — SVG לכל שכבה מ-`SVGBackend` (עקביות מלאה עם ה-PDF, אפס פרסינג בדפדפן, אפשר `<g data-layer>` + checkbox). ל-DXF שמגיעים מבחוץ — `dxf-viewer` (worker, ביצועים). עברית ב-dxf-viewer: Unicode נתמך, אך סדר bidi תלוי במחרוזת (כמו ב-ezdxf) — «לא אומת».

---

## 4. קריאת קלטים מקבלנים

### 4.1 DWG/DXF
1. DWG → DXF: ODA File Converter (רישוי!), או ב-worker GstarCAD (`DXFOUT`/SaveAs DXF 2018 — כולל ב-eTransmit בקשה מהקבלן לשלוח גם DXF). LibreDWG `dwg2dxf` כגיבוי (GPL; יש דיווחי DXF שבור).
2. ב-ezdxf: `msp.query('INSERT[layer=="PV-MODULES"]')`, לכל INSERT: `dxf.insert`, `dxf.xscale/yscale`, `dxf.rotation`, `block()` → גיאומטריה; `insert.virtual_entities()`/`explode()` ל-world coords; `ezdxf.bbox.extents()` למלבן המודול; LWPOLYLINE → `get_points()`; `ezdxf.math.ConstructionPolyline`.
3. זיהוי "מודול" כשהקבלן צייר מלבנים ולא בלוקים: סינון LWPOLYLINE סגורים עם 4 קודקודים ויחס צלעות ≈ 1.13×2.28 (±5%), קיבוץ לפי שכבה/צבע.
4. xref ב-eTransmit: `ezdxf.xref` + נתיבים יחסיים; שכבות עם קידומת `xrefname|layer`.

### 4.2 PDF וקטורי
- **PyMuPDF `page.get_drawings()`** — רשימת paths: `items` (`'l'` קו, `'c'` בזייה, `'re'` מלבן, `'qu'` ריבוע), `color`, `fill`, `width`, `rect`, `closePath`, `lineCap/Join`, `dashes`, opacity. מגבלות מתועדות: מתעלם מ-clipping ("will always return all paths") ו**לא משקף שכבות OCG** של המסמך (maintainer, discussion #2296). `extended=True` לקבוצות/clip («פרטים לא אומתו»). https://pymupdf.readthedocs.io/en/latest/recipes-drawing-and-graphics.html
- **pdfplumber** (MIT): `page.lines/rects/curves/chars` עם `pts`, `linewidth`, `stroking_color`, `non_stroking_color`, `fill`; "works best on machine-generated PDFs". https://github.com/jsvine/pdfplumber
- גישה: PDF של פריסת גג מ-GstarCAD הוא וקטורי → חלץ מלבנים (`'re'` או 4 קווים סגורים) → נרמל קנה מידה לפי סרגל/מידה ידועה (רוחב מודול) → זה מספיק לרוב למיקום מודולים; טקסט (`page.get_text("dict")`) לשיוך מחרוזות.
- רסטר (סריקה/צילום): וקטוריזציה (potrace) חלשה לשרטוטים; עדיף **Claude vision** — ה-API של Anthropic מקבל PDF כ-`document` (base64, עד 32MB/600 עמודים) או תמונה, ומחזיר JSON מובנה (`output_config.format`) של רשימת מחרוזות/מודולים/מספרים — מתאים לטבלאות ו-labels, פחות לקואורדינטות מדויקות (לשלב עם חילוץ וקטורי). מודל ברירת מחדל: `claude-opus-5-5`.

### 4.3 גיאו-רפרנס של פריסה על אורתופוטו
- אם ה-DWG של הקבלן בקואורדינטות רשת ישראל (ITM, EPSG:2039) — `GeoData` ב-DXF + אורתופוטו GeoTIFF: טרנספורמציה אפינית מ-`rasterio.transform` / GDAL, הכנסת IMAGE עם insert/size מחושבים.
- אם לא — 2–3 נקודות בקרה (פינות גג) → `skimage.transform.estimate_transform('affine'|'similarity')` → החלת מטריצה על הישויות (`entity.transform(Matrix44)`). **לא אומת בחיפוש** (תקציב); מבוסס על ידע כללי.

---

## 5. יצירת סכמות חשמל (SLD) ולוחות

### 5.1 פריסה אוטומטית (auto-layout / routing)
| כלי | סוג | רישיון | מתאים ל-SLD? |
|---|---|---|---|
| **elkjs** 0.12.0 (17.7.2026) | Layered (Sugiyama) עם **ports**, edge routing ORTHOGONAL, Web Worker, Node+browser; עוקב אחרי גרסאות ELK | EPL-2.0 OR GPL-3.0 | **כן** — ports = הדקי מפסק/אינוורטר; פלט קואורדינטות → ezdxf. חבילה ~300KB; קונפיגורציה מורכבת |
| dagre | DAG פשוט, ~25KB | MIT | חלקי — אין ports/nesting |
| d3-dag | DAG | MIT | פחות (ללא ports) |
| graphviz (dot, `splines=ortho`) | CLI/Python | EPL | סביר ל-SLD עץ; ניהול ports דרך record shapes |
| **netlistsvg** | yosys-JSON → SVG, skins SVG מותאמים, elkjs | MIT | מדגים בדיוק את המודל "netlist + skin"; אפשר skin עם סמלי IEC |
| D2 | שפת דיאגרמות; dagre/ELK (OSS), TALA מסחרי | MPL-2.0 | פלט SVG/PNG/PDF בלבד; לא DXF |
| Mermaid | flowchart; ELK plugin | MIT | לא לשרטוט הנדסי (אין שליטה גיאומטרית) |
| **schemdraw** | Python, SVG/matplotlib | MIT | סמלים כלליים (לא ספריית IEC 60617 ייעודית; יש `schemdraw.elements` הניתנים להרחבה); **אין ייצוא DXF מתועד** («לא אומת») |
| ng-diagram SLD editor (synergycodes) | Angular 19 עורך SLD, 15 סמלי IEC (מ-QElectroTech), חיווט אורתוגונלי, **ייצוא DXF** | MIT | דוגמה עובדת ל-web editor + DXF |
- **אין כלי קוד-פתוח שמוציא SLD ב-DXF ישירות מ-netlist.** המודל המומלץ: `spec.json` (רכיבים + ports + edges) → elkjs (orthogonal, direction DOWN, port constraints FIXED_SIDE) → קואורדינטות → ezdxf INSERT של הבלוקים הקיימים (ABB/Schneider) + LWPOLYLINE לחיווט. עבור SLD סולארי (עץ: מחרוזות → DC combiner → אינוורטר → AC board → מונה → רשת) אפילו **פריסה דטרמיניסטית ידנית בעמודות** (ללא ELK) מספיקה ויציבה יותר ויזואלית.

### 5.2 ספריות סמלים IEC 60617
| מקור | רישיון | היקף | הערות |
|---|---|---|---|
| **QElectroTech** elements (0.100, 25.1.2026) | **CC-BY 3.0** (ELEMENTS.LICENSE) — שימוש בשרטוטים ללא תנאי; הפצה מחדש של האוסף דורשת ייחוס; **אסור כ-training data ל-ML** | אלפי סמלים XML (כולל IEC 60617); האפליקציה GPL-2 | המרה XML→DXF דורשת ממיר (יש ייצוא DXF מהאפליקציה לפי מקורות שניים — «לא אומת») |
| chille/electricalsymbols | CC BY-SA 3.0 | 33 SVG, גריד 50px, "aiming to be compatible with IEC 60617" | קטן |
| romanmykh/ELECTRICIANSYMBOLS60617 | **לא מצוין** | 526 SVG/PNG שנוצרו ב-trace אוטומטי **מה-PDF של התקן IEC** | סיכון זכויות יוצרים (IEC מסחרי) — לא להשתמש מסחרית |
| basverdoes/ElectricalSymbolLibrary | Public domain | ANSI+IEC נפוצים | Inkscape |
| Cybso/inkscape-elsym, rangerjo/electrical_symbols_library, AcheronProject/electrical_template | שונות (לבדוק) | Inkscape symbol libs | |
- **המלצה:** להישאר עם ספריית ה-DXF המשרדית (ABB/Schneider/T4P) כמקור; להשלים חוסרים מ-QElectroTech (CC-BY → שורת ייחוס בגיליון E-06/E-08 או במסמך README). להימנע מהאוסף שנגזר מ-PDF של IEC.

### 5.3 פריסת חזית לוח (E-05)
- קוד-פתוח ייעודי: אין. **Open BIM Switchboard** (CYPE; חינמי לפי האתר — «לא אומת»), **ABB/Striebel&John Panel Design Configurator** (גרסת Basis חינמית, חזיתות), Paneldes, EPLAN Pro Panel / SEE Electrical (מסחרי כבד).
- מעשי: מודל ארון JSON (רוחב/גובה, מסילות DIN, פסי צבירה, רכיבים ברוחב מודולים 17.5/18mm) → ezdxf מצייר חזית עם ה-T4P blocks. 1 מודול = 18mm (DIN 43880); חישוב "שורות" אוטומטי.

---

## 6. תקנים לכותרת ולגיליון

- **ISO 5457:1999** (Sizes and layout of drawing sheets): A3 = 420×297 (trimmed); מסגרת: שוליים 20mm בצד הכריכה (שמאל) ו-10mm בשאר (A2–A4), סימוני מרכוז (centering marks), רשת ייחוס (grid reference, אותיות/ספרות בשוליים, חלוקה כל 50mm), סימוני חיתוך. **לא אומת מהטקסט המקורי** (דפי התקן חסומים) — מבוסס על ידע; לוודא מול עותק התקן במשרד.
- **ISO 7200:2004** (Title blocks): 19 שדות ב-3 קבוצות, **8 חובה** (לפי תוצאות החיפוש). קבוצות:
  - **זיהוי** (חובה): legal owner (הבעלים החוקי), identification number (מספר שרטוט), date of issue, segment/sheet number; אופציונלי: revision index, number of sheets, language code.
  - **תיאור**: title, supplementary title; document type (חובה).
  - **ניהול**: created by (חובה), approved by (חובה), responsible department, technical reference, document status (למשל preliminary / released / in work — ISO 7200 מגדיר "document status"), sheet size, scale, units, legal notice/copyright.
  - רוחב כותרת מקובל: 180mm (מיושר לפינה ימנית-תחתונה של המסגרת).
- **פרקטיקה ישראלית (לא נחקר ברשת — תקציב; מידע מהתרגול המקצועי):** שדות שמופיעים כמעט תמיד בתוכניות חשמל: שם המזמין/פרויקט, כתובת/גוש-חלקה, שם התוכנית, מס' תוכנית, קנ"מ, תאריך, שורטט/תוכנן/נבדק/אושר (שם + חתימה + מס' רישיון מהנדס), **סטטוס**: "לאישור" / "לביצוע" / "As-Made (עדות)" / "Preliminary", טבלת מהדורות (מס', תאריך, תיאור השינוי, מאת), לוגו המתכנן, מס' חברת החשמל/מס' תיק רישוי אם רלוונטי, הערת "התוכנית תקפה רק עם חתימת המהנדס". לבודק סוג 3 נהוג לצרף: SLD חתום, פריסת גג, הארקה, חישובי מפל מתח — לאימות מול הנוהל המשרדי.
- מקור: https://roymech.org/Useful_Tables/Drawing/Title_blocks.html (חסום לשליפה; מתואר בחיפוש), https://www.evs.ee/en/evs-en-iso-7200-2004

---

## 7. שערי איכות (Quality gates)

| שער | כלי | פרטים |
|---|---|---|
| **חפיפת טקסטים** | `ezdxf.tools.text_size.text_size/mtext_size` + `ezdxf.bbox` + `shapely.STRtree` | בנה מלבן לכל TEXT/MTEXT/ATTRIB (עם rotation → polygon), בדוק חיתוכים O(n log n); לטקסט מדויק יותר `text2path.make_path_from_str` (TEXT/ATTRIB). זכור: "bbox for text entities are not accurate" — להוסיף מרווח 10%. לבדוק גם טקסט מול קווים/בלוקים באותה שכבה |
| **טקסט חורג מהמסגרת/תא טבלה** | bbox ∩ מלבן התא | כנ"ל |
| **רגרסיה ויזואלית (PNG)** | **pixelmatch** (ISC; `threshold` 0.1, `includeAA`, `diffMask`, `windowSize`, `ignoreMask`), **odiff** (MIT, Zig/SIMD, ×6.7 מהיר מ-pixelmatch, `odiff-bin` npm, ignore regions, cross-format), **Playwright `toHaveScreenshot`** (pixelmatch מובנה; `threshold` ברירת מחדל 0.2, `maxDiffPixels`, `maxDiffPixelRatio`, `mask`, `stylePath`) | ב-Python: `pixelmatch` (port ל-PyPI) או `odiff` CLI; לרנדר ב-DPI קבוע (למשל 150) מ-`PyMuPdfBackend` → diff מול baseline לכל גיליון; מסכה לאזור תאריך/מהדורה |
| **DXF lint** | `ezdxf audit <file>` (CLI) / `doc.audit()` → `Auditor.errors/fixes`; `ezdxf.recover.readfile` לקבצים שבורים | לשלב ב-CI: audit חייב להחזיר 0 שגיאות; בנוסף בדיקות משרדיות: שכבות מותרות בלבד, סגנון טקסט + גופן קיים, כל ATTRIB מלא, אין בלוק לא-מוגדר, יחידות `$INSUNITS`=mm, `$DWGCODEPAGE`/UTF-8 |
| **אימות DWG** | ב-worker: `AUDIT` + `-PURGE` + פתיחה חוזרת; השוואת ספירת ישויות DXF↔DWG | ODA/GstarCAD |
| **אימות PDF** | pymupdf: ספירת עמודים, גודל A3 (420×297mm = 1190.55×841.89pt), טקסט עברי ניתן לחיפוש (אם TTF) | |
| **עברית** | בדיקה "סמנטית": OCR חוזר של ה-PNG (Claude vision) ומשווה למחרוזות המקור (logical order) → תופס היפוכי bidi | |

---

## 8. צנרת מומלצת (טקסט)

```
spec.json / YAML (פרויקט, מחרוזות, לוחות, כבלים, כותרת, מהדורה)
        │
        ▼
 eplan (Python, ezdxf 1.4.4)
   ├─ ספריית בלוקים DXF (186) → INSERT + ATTRIB
   ├─ 152 דינמיים → placeholder INSERT + XDATA BEE_DYN  (או וריאנט סטטי NAME__STATE)
   ├─ פריסת נייר A3 (page_setup) + VIEWPORT + מסגרת ISO 5457 + כותרת ISO 7200
   ├─ python-bidi לטקסט עברי, text_size לבדיקות
   └─ שער 1: ezdxf audit + חפיפות טקסט (bbox/STRtree)
        │
        ▼
 DXF R2018 (מקור אמת, ב-git/‏S3)
        │
        ├───────────────► ezdxf PyMuPdfBackend ─► PDF-preview + PNG (150dpi)
        │                        └─► שער 2: pixelmatch/odiff מול baseline
        │
        ├───────────────► ezdxf SVGBackend (לכל שכבה) ─► web preview (toggle שכבות)
        │                        (חלופה: dxf-viewer/three.js לקבצים חיצוניים)
        │
        └───► Windows worker (GstarCAD 2026/27 + Python/cad-pyrx או .NET; תור משימות)
                 ├─ OPEN dxf → החלפת placeholders בבלוקים דינמיים + DynamicBlockReferenceProperty
                 ├─ AUDIT, -PURGE, SAVEAS DWG 2018  ─► DWG "רשמי" (לבודק/לקבלן)
                 └─ PLOT עם CTB משרדי ─► PDF "רשמי" (SHX עברי נאמן, lineweights)
                           └─► שער 3: השוואת PNG(PDF-רשמי) ↔ PNG(preview) + Claude-vision OCR לעברית
        
 (חלופות ל-worker: APS Automation API [AutoCAD בענן, Flex tokens] · ODA File Converter [רק עם חברות ODA] · Aspose.CAD [~799$])

 קלט מקבלנים: DWG(eTransmit) ─► worker: DXFOUT ─► ezdxf (INSERT/LWPOLYLINE לפי שכבה) ─► מודולים/מיקום
                PDF וקטורי ─► pymupdf get_drawings / pdfplumber ─► מלבנים → מודולים
                רסטר/תמונה ─► Claude vision (JSON מובנה) + נקודות בקרה ─► affine ─► DXF + IMAGEDEF(אורתופוטו)
```

---

## 9. מטריצת יכולות מרוכזת

| כלי | כתיבת DWG R2018 | בלוקים דינמיים (הכנסה+מצב) | עברית SHX | Headless Linux | רישיון/עלות | המלצה |
|---|---|---|---|---|---|---|
| ezdxf 1.4.4 | ✗ | ✗ (שימור בלבד) | רינדור ✓ / bidi ידני | ✓ | MIT | ליבה |
| ezdxf-fork dynblock | ✗ | ניסיוני (✓ visibility, דורש seeds, R2018) | — | ✓ | MIT | רק אחרי אימות ב-CAD |
| ODA File Converter | ✓ | שומר | — | ✓ (xvfb) | חינם לא-מסחרי; מסחרי 3,000$/שנה | לא בלי חברות |
| LibreDWG 0.13.4 | ✗ (עד R2000; R2010+ CRC) | ✗ | — | ✓ | GPL-3 | לא |
| Aspose.CAD Python | ✓ | «לא אומת» | «לא אומת» | ✓ | ~799$+ | לבדיקה |
| APS Automation (AutoCAD) | ✓ | ✓ | ✓ | ✓ (ענן) | Free tier + Flex (מחיר «לא אומת») | חלופה ללא Windows |
| AutoCAD accoreconsole / acadbp | ✓ | ✓ | ✓ | ✗ (Windows) | רישיון AutoCAD/LT | אם יש רישיון |
| **GstarCAD + Python/.NET/SCR** | ✓ | ✓ | ✓ | ✗ (Windows) | רישיון GstarCAD | **מומלץ** |
| cad-pyrx 3.1.13 | דרך מארח | ✓ | ✓ | ✗ | LGPL-3 | API Python אחיד |
| BricsCAD (/automation) | ✓ | קריאה ✓ | ✓ | ✓ (Linux build) | מסחרי | חלופת Linux |
| QCAD Pro CLI | «לא אומת» | ✗ | «לא אומת» | ✓ | מסחרי זול | רינדור batch |
| LibreCAD 2.2.1 | ✗ | ✗ | «לא אומת» | ✓ | GPL-2 | רינדור חינמי |
| dxf-viewer 1.0.49 | — | ✗ | Unicode ✓ (לא SHX) | דפדפן | MPL-2.0 | web preview |
| three-dxf-viewer 1.0.44 | — | ✗ | typeface.json | דפדפן | MIT | web preview |
| elkjs 0.12.0 | — | — | — | ✓ | EPL-2/GPL-3 | layout ל-SLD |
| QElectroTech elements | — | — | — | — | CC-BY 3.0 (לא ל-ML) | השלמת סמלים |

---

## 10. «לא אומת» / פערים

1. **GstarCAD 2027** — לא נמצא תיעוד (רק 2025/2026); תאימות DWG של 2026 ל-"AutoCAD 2025/2026 format" — לא אומת.
2. **מחירי APS Automation API** (Flex tokens לשעת AutoCAD engine, תקרות Free tier) — הדף חסום.
3. **Aspose.CAD**: תמיכה בבלוקים דינמיים, עברית/SHX, ומחירון מדויק (799$ מתוצאת חיפוש בלבד).
4. **ezdxf ועברית/bidi** — אין תיעוד; התנהגות AutoCAD/GstarCAD עם מחרוזת visual-order ב-TTF לעומת SHX לא אומתה.
5. **ezdxf-fork dynblock** — האם AutoCAD/GstarCAD/BricsCAD מזהים את הפלט; אין docs/README; קומיטים מ-4.10.2026.
6. **ODA** — נוסח ה-EULA המדויק של File Converter (ציטוט מה-FAQ דרך חיפוש: "If you are not an ODA member, you can use ODA File Converter for non-commercial applications only"); האם "worker פנימי במשרד" נחשב מסחרי — כן לפי הנוסח, אך לא נבדק עם ODA.
7. **QCAD Pro** — כתיבת DWG ותמיכת SHX ב-CLI; **LibreCAD** — SHX עברי.
8. **ISO 5457/7200** — פרטי השוליים/19 השדות מבוססים על תקצירים וידע, לא על טקסט התקן.
9. **פרקטיקה ישראלית לכותרת ולסטטוסים** — לא נחקר ברשת (תקציב חיפוש); מבוסס על ידע מקצועי.
10. **nanoCAD/ZWCAD headless, Mermaid/D2 פרטים, rasterio/GDAL לגיאו-רפרנס** — לא נחקרו.
11. **QElectroTech ייצוא DXF** — נטען במקורות שניים; לא אומת ב-README הרשמי.
12. **PyMuPDF `extended=True` / `cluster_drawings`** — פרטים לא אומתו (docs חסומים; רק raw rst חלקי).

---

## 11. קישורים
- ezdxf: https://pypi.org/project/ezdxf/ · https://github.com/mozman/ezdxf · odafc: https://ezdxf.readthedocs.io/en/stable/addons/odafc.html · drawing: https://ezdxf.readthedocs.io/en/stable/addons/drawing.html · fonts: https://ezdxf.readthedocs.io/en/stable/tools/fonts.html · text_size: https://ezdxf.readthedocs.io/en/stable/tools/text_size.html · bbox: https://ezdxf.readthedocs.io/en/stable/bbox.html · xref: https://ezdxf.readthedocs.io/en/stable/tutorials/xref_module.html · viewports: https://ezdxf.readthedocs.io/en/stable/tutorials/psp_viewports.html · acadctb: https://ezdxf.readthedocs.io/en/stable/addons/acadctb.html · geo: https://ezdxf.readthedocs.io/en/stable/addons/geo.html · text2path: https://ezdxf.readthedocs.io/en/stable/addons/text2path.html
- בלוקים דינמיים: https://github.com/mozman/ezdxf/discussions/403 · https://github.com/mozman/ezdxf/issues/1203 · https://github.com/pucejuice/ezdxf-fork
- ODA: https://www.opendesign.com/faq/question/what-are-oda-viewer-and-oda-file-converter · https://www.opendesign.com/oda-membership · https://www.opendesign.com/faq/membership
- LibreDWG: https://github.com/LibreDWG/libredwg · https://www.gnu.org/software/libredwg/ · https://github.com/LibreDWG/libredwg/issues/1069
- Aspose.CAD: https://products.aspose.com/cad/python-net/ · https://purchase.aspose.com/pricing/cad/python-net/
- CAD Exchanger: https://cadexchanger.com/dwg/
- APS: https://aps.autodesk.com/pricing · https://aps.autodesk.com/blog/aps-business-model-evolution · https://aps.autodesk.com/blog/estimate-design-automation-costs · https://aps.autodesk.com/developer/overview/automation-api
- AutoCAD core console: https://github.com/k-awata/acadbp
- GstarCAD: https://www.gstarcad.net/cad/feature-new/ · https://cdn-sg-gw.gstarcad.net/gstarsoft_pdf/GstarCAD2025_Complete_Features_Guide.pdf · https://www.nuget.org/packages/GStarCad.Net · https://github.com/ch5721032-arch/gstarcad-lisp-scripts
- cad-pyrx: https://pypi.org/project/cad-pyrx/
- BricsCAD startup switches: https://help.bricsys.com/en-us/document/bricscad/customization/startup-options
- QCAD CLI: https://www.qcad.org/en/qcad-command-line-tools · https://gist.github.com/slazav/2c617b8e7ba09ec67e1e633b043f89dd
- LibreCAD: https://github.com/LibreCAD/LibreCAD
- Web viewers: https://github.com/vagran/dxf-viewer · https://github.com/ieskudero/three-dxf-viewer · https://www.npmjs.com/package/three-dxf · APS Viewer: https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/viewer_basics
- PDF extraction: https://pymupdf.readthedocs.io/en/latest/recipes-drawing-and-graphics.html · https://github.com/pymupdf/PyMuPDF/discussions/2296 · https://github.com/jsvine/pdfplumber
- python-bidi: https://pypi.org/project/python-bidi/
- Layout: https://github.com/kieler/elkjs · https://github.com/nturley/netlistsvg · https://github.com/cdelker/schemdraw · https://github.com/synergycodes/ng-diagram-single-line-diagram
- Symbols: https://github.com/qelectrotech/qelectrotech-source-mirror (ELEMENTS.LICENSE) · https://github.com/chille/electricalsymbols · https://github.com/basverdoes/ElectricalSymbolLibrary · https://github.com/Cybso/inkscape-elsym · https://github.com/romanmykh/ELECTRICIANSYMBOLS60617 (ללא רישיון)
- Panel layout: https://info.cype.com/en/product/open-bim-switchboard/ · https://www.controleng.com/control-panel-design-software/
- Title block: https://roymech.org/Useful_Tables/Drawing/Title_blocks.html · https://www.evs.ee/en/evs-en-iso-7200-2004
- Visual regression: https://github.com/mapbox/pixelmatch · https://github.com/dmtrKovalenko/odiff · https://playwright.dev/docs/test-snapshots
