# 04 – מנוע הצעות מחיר / כתב כמויות / תמחור / הפקת מסמכים (CPQ ל-PV) – מחקר טכנולוגי 2025–2026

**הקשר:** B.E.E (ברק הנדסת חשמל). סטאק קיים: Fastify + Postgres + Vite (TypeScript), Docker/Caddy/Cloudflare Tunnel, PWA סקר-אתר (IndexedDB), מחולל Python (ezdxf/matplotlib/openpyxl), דוחות PDF קיימים ב-Puppeteer עם גופן Rubik.
**תאריך:** 2026-10-06.
**שיטה:** WebSearch + WebFetch + בדיקת גרסאות ישירה מול registry.npmjs.org ו-PyPI. **הערה חשובה:** הרבה אתרים ישראליים (gov.il, dekel.co.il, greeninvoice.co.il, icount, midrag, ynet וכו') ואתרי תיעוד (sheetjs, pptr.dev, readthedocs) היו חסומים ב-egress proxy של הסשן, ותקציב ה-WebSearch נגמר באמצע. כל מה שלא אומת ממקור ראשוני מסומן ב-**[לא אומת]** ומרוכז בסעיף 10.

---

## 0. תקציר החלטות (TL;DR)

| נושא | המלצה | למה |
|---|---|---|
| מקור האמת לכתב הכמויות | **Postgres** (quote → quote_version → quote_line), לא Excel | Excel הוא פורמט ייצוא/ייבוא, לא DB. מאפשר snapshot, גרסאות, חתימה, API. |
| ייצוא Excel ללקוח/יועץ | **ExcelJS 4.4.0** (כבר TypeScript) עם `views:[{rightToLeft:true}]`, נוסחאות חיות ל-סה"כ/מע"מ, `definedNames`, data validation | חינמי, סגנונות + נוסחאות + RTL נתמכים; לא צריך round-trip. |
| ייבוא Excel (כתב כמויות של יועץ / מחירון ספק) | **ExcelJS (read)** או **SheetJS CE** לקריאה בלבד; לעריכת קובץ-של-מישהו-אחר "בלי לשבור" – **xlsx-populate 1.21.0** | xlsx-populate עורך XML במקום ולכן שומר מה שהוא לא מכיר. |
| צד Python (מחולל קיים) | **openpyxl 3.1.5** לקריאה/עריכה (`ws.sheet_view.rightToLeft=True`), **XlsxWriter 3.2.9** לכתיבה-בלבד מהירה ויפה | שניהם לא מחשבים נוסחאות – LibreOffice headless לריענון cached values אם צריך. |
| חילוץ טבלאות ממחירוני PDF | **pdfplumber 0.11** / **camelot 2.0** (lattice) ל-PDF דיגיטלי; **Claude (Opus 5.5 / Sonnet 5.5) עם PDF input + structured outputs** ל-PDF סרוק/מבולגן; Azure Document Intelligence כגיבוי | שילוב דטרמיניסטי + LLM לאימות. |
| PDF הצעת מחיר / חוזה | **להישאר על Chromium (Puppeteer 25 / Playwright 1.63) HTML→PDF** עם Rubik, `displayHeaderFooter`, `pageNumber/totalPages`, `dir="rtl"`, `<bdi>`/`unicode-bidi: isolate` למספרים | המנוע היחיד עם bidi מלא "בחינם"; כבר קיים אצלכם. |
| סט שרטוטים (DXF/PDF) | Python: ezdxf → PDF דרך matplotlib (קיים), **pypdf 6.x** למיזוג + bookmarks + דף שער; ב-Node: **pdf-lib 1.17** | מיזוג דטרמיניסטי, metadata, bookmarks. |
| DOCX | רק אם הלקוח/יועץ דורש Word לעריכה: **docxtemplater 3.71** (MIT, לולאות בטבלאות בחינם) + LibreOffice headless ל-PDF. Carbone 3.8 CE כאופציה (CCL). | HTML מנצח כמעט תמיד להצעות מחיר. |
| חתימה | שלב 1: **click-to-accept עם audit trail + OTP ל-SMS** (חתימה אלקטרונית "רגילה" לפי חוק חתימה אלקטרונית); שלב 2 (חוזים גדולים / ממשל): ספק ישראלי מוכר (Comsign/WeSign) או DocuSign. PAdES ב-Node: `@signpdf` 3.3 (B-B בלבד). | הצעת מחיר נכרתת בקיבול; חתימה מאושרת נדרשת רק במסמכים ספציפיים בחוק. |
| חשבונאות | **Morning (חשבונית ירוקה)** API – שימו לב: עבר ל-OAuth2 ב-`api.morning.co` (ה-`/v1/account/token` הישן מת) ; iCount כאלטרנטיבה; מספרי הקצאה ("חשבוניות ישראל") – לתת לספק החשבוניות לטפל, לא לממש מול שע"מ ישירות. | |
| תשלום | **Grow (לשעבר משולם)** / Cardcom – דף תשלום + Bit + Apple/Google Pay + חשבונית אוטומטית | |
| גרסאות | `quote_version` immutable + `price_snapshot` JSONB לכל שורה + hash של ה-PDF שנחתם + change order כ-version חדש עם delta | |

---

## 1. Excel – הפקה ו-round-trip

### 1.1 טבלת החלטה – ספריות JS

| ספרייה | גרסה (נבדק 2026-10-06) | נוסחאות | סגנונות | RTL sheet view | Data validation / Named ranges | Round-trip (שימור מה שלא מוכר) | תחזוקה | עלות | המלצה |
|---|---|---|---|---|---|---|---|---|---|
| **ExcelJS** | 4.4.0 (npm) | כן: `cell.value = {formula, result}`, shared + array formulas; לא מחשב | כן, מלא | **כן** – `worksheet.views = [{rightToLeft: true}]` (README) | כן / כן (`workbook.definedNames`) | חלקי: שומר ערכים, נוסחאות, סגנונות, merged; ידוע שמאבד charts/pivot/VBA בשמירה מחדש | שחרור אחרון 2023, פורקים פתוחים | MIT | **ברירת מחדל לייצוא** |
| **SheetJS CE (`xlsx`)** | 0.18.5 ב-npm (קפוא מ-2022; גרסאות 0.20.x רק ב-CDN של sheetjs) | קריאה/כתיבה של מחרוזת נוסחה; לא מחשב | **לא** ב-CE (styles ו-data validation רק ב-Pro) | ב-CE מוגבל/לא חשוף היטב [לא אומת במלואו] | DV נזרקים ב-CE | חלש; ExcelBench: 9/21 read, 8/21 write | פעיל אבל מחוץ ל-npm | CE: Apache-2.0; Pro: מחיר לפי פנייה [לא אומת] | רק לקריאת CSV/XLS/ODS |
| **SheetJS Pro** | — | כולל Formula Calculator | כן | כן | כן | טוב יותר | מסחרי | לפי הצעת מחיר | לא נחוץ לכם |
| **xlsx-populate** | 1.21.0 | `cell.formula()`; cached values לא מתעדכנים ולא נכתבים | כן (fonts, fills, borders, numFmt) | דרך `textDirection` style; **אין** דגל sheet-level ידוע (0 issues) | כן / defined names לקריאה | **הכי טוב ב-JS** – עורך XML במקום; שומר DV, drawings, cross-sheet refs | איטי (2019–) | MIT | לעריכת קבצים "זרים" (כתב כמויות של יועץ) בלי לשבור |
| **ExcelForge / WolfXL** (חדשים) | — | — | — | — | — | מבטיחים round-trip מלא | צעירים | — | לעקוב, לא לאמץ עכשיו |

### 1.2 טבלת החלטה – Python

| ספרייה | גרסה | קריאה | כתיבה | נוסחאות | RTL | Round-trip | הערות |
|---|---|---|---|---|---|---|---|
| **openpyxl** | 3.1.5 | כן | כן | כותב מחרוזת; `data_only=True` קורא cached values; **לא מחשב** | `ws.sheet_view.rightToLeft = True` | ExcelBench 2026-10: 21/21 read & write על הפיצ'רים הנמדדים, אבל **מוחק VBA/pivot/slicers/sparklines** ועלול לפגוע ב-charts קיימים | הכלי הנכון למחולל Python הקיים |
| **XlsxWriter** | 3.2.9 | **לא** | כן | כן + אפשרות לכתוב cached value | `worksheet.right_to_left()` | N/A (write-only) | הכי מהיר ויפה ל-charts; לא לעריכה |
| **pandas** | — | כן | כן | לא | לא | לא | רק לנתונים |

### 1.3 "מי שומר נוסחאות ב-round-trip?"
- **כולם שומרים את מחרוזת הנוסחה** (ExcelJS, xlsx-populate, openpyxl). **אף אחד לא מחשב** – ה-cached `<v>` יהיה ריק/ישן. Excel מחשב בפתיחה (אפשר לכפות `workbook.calcProperties.fullCalcOnLoad = true` ב-ExcelJS; ב-openpyxl `wb.calculation.fullCalcOnLoad = True`).
- מי שצריך ערכים מחושבים בשרת (למשל כדי להציג סה"כ ב-PDF): **לא** לסמוך על Excel – לחשב ב-TypeScript (מנוע התמחור שלכם הוא מקור האמת) ולכתוב גם `result`. אופציה ב': LibreOffice headless `--convert-to xlsx` מרענן cached values.
- **מה נשבר ב-round-trip:** charts, pivot caches, macros, slicers, חלקי OOXML חדשים – בכל הספריות למעט xlsx-populate (ובמידה פחותה openpyxl). לכן: **אל תבנו את התהליך על "לפתוח את ה-Excel של הלקוח, לשנות ולהחזיר"**. בנו: ייבוא → DB → ייצוא חדש מתבנית שלכם.

### 1.4 פרקטיקות ל-Excel עברי של כתב כמויות
1. `views: [{rightToLeft: true, zoomScale: 100}]` לכל גיליון; עמודות מימין: מס' סעיף | תיאור | יח' | כמות | מחיר יח' | סה"כ.
2. נוסחאות חיות: `סה"כ = כמות*מחיר`, סיכום פרק `SUBTOTAL(9, ...)`, מע"מ כ-named range (`VAT_RATE`), `=ROUND(x,2)`; הגנת גיליון עם unlock רק לעמודות "כמות"/"מחיר יח'" כשמייצאים טופס למילוי ע"י יועץ/קבלן משנה.
3. Data validation: רשימת יחידות (יח', מ"א, מ"ר, קומפ', ק"ג, שעה), מספר ≥ 0.
4. Named ranges לכל פרק + טבלת metadata מוסתרת (quote_id, version, hash, exported_at) כדי שייבוא חוזר יזהה את הגרסה.
5. מספרי סעיפים כטקסט (`08.01.0010`) כדי ש-Excel לא יהפוך למספר.
6. גופן: Arial/Rubik – Excel לא מטמיע גופנים, לכן להישאר עם גופן נפוץ.

### 1.5 קריאת מחירוני ספקים (Excel/PDF)
| כלי | גרסה | מתאים ל | חוזקות | חולשות | עלות |
|---|---|---|---|---|---|
| **pdfplumber** | 0.11.10 | PDF דיגיטלי עם/בלי קווים | גישה לכל primitive; `extract_tables(table_settings)` עם אסטרטגיות lines/text | לא OCR; עברית ב-PDF לעיתים הפוכה (לוגי/ויזואלי) – צריך `[::-1]` לפי מקרה | חינם |
| **camelot-py** | 2.0.0 | טבלאות עם מסגרת (lattice) | ICDAR-2013 F1 0.778; מטפל ב-merged cells, כותרות רב-שורתיות; דוח confidence לטבלה | תלוי ב-ghostscript/opencv; stream פחות טוב | MIT |
| **PyMuPDF** | — | מהירות | מהיר מאוד | AGPL | AGPL/מסחרי |
| **Azure Document Intelligence (Layout)** | — | PDF סרוק, תמונות | OCR + טבלאות; ~82.7% table precision בבנצ'מרק Reducto | עלות לדף, עברית – לבדוק [לא אומת] | ~$10/1000 עמודים (Layout) [לא אומת] |
| **Claude (vision/PDF)** | `claude-opus-5-5` ($4/$20 ל-MTok), `claude-sonnet-5-5` ($2/$10), `claude-haiku-4-5` ($1/$5) | מחירון מבולגן, סרוק, עברי, עם הערות | PDF כ-`document` block (base64 או Files API; עד 32MB/600 עמודים), **structured outputs** (`output_config.format` / `messages.parse()`), citations לפי עמוד; Batch API ב-50% | לא דטרמיניסטי → חובה אימות (סכומי ביקורת, השוואה לגרסה קודמת) | לפי טוקנים; עמוד PDF ≈ 1.5–3K טוקנים |

**מתכון מומלץ:** (1) ניסיון דטרמיניסטי (openpyxl למחירון xlsx; pdfplumber/camelot ל-PDF) → (2) אם ה-confidence נמוך או PDF סרוק → Claude Sonnet 5.5 עם סכימה קשיחה `{sku, description_he, unit, price, currency, valid_from}` → (3) diff מול המחירון הקודם ב-DB, הצגת שינויים > X% לאישור אנושי → (4) שמירה כ-`price_list_version`.

---

## 2. PDF עם עברית/RTL

### 2.1 טבלת החלטה

| מסלול | גרסה | Bidi/עברית | כותרות עליונות/תחתונות + מספרי עמודים | טבלאות ארוכות / page-break | חתימה/attachments | עלות | המלצה |
|---|---|---|---|---|---|---|---|
| **Puppeteer / Playwright (Chromium) HTML→PDF** | puppeteer 25.12.0 / playwright 1.63.0 | **מלא** (Unicode Bidi של Blink, `dir`, `unicode-bidi: isolate`, `<bdi>`) | `displayHeaderFooter`, `headerTemplate/footerTemplate` עם מחלקות `pageNumber`, `totalPages`, `date`, `title`; **חובה inline CSS + margin**; גופנים ב-header template – להטמיע כ-base64 `@font-face` בתוך התבנית [לא אומת מול תיעוד] | `thead {display: table-header-group}`, `break-inside: avoid`, `@page {size: A4; margin}` עם `preferCSSPageSize` | `tagged: true` (ברירת מחדל), `outline: true`; חתימה בנפרד | חינם; Chromium בדוקר (~400MB) | **הצעות מחיר, חוזים, כתב כמויות, דוחות** – כבר קיים אצלכם |
| **Typst** | 0.13+ (חבילות `auto-bidi`, `bidi-flow`) | טוב: `set text(lang:"he", dir: rtl)`; באג טבלאות RTL (#3373) נסגר 2024; עדיין צריך wrap לכל פסקה או חבילת auto-bidi | כן (`page(header:, footer:, numbering:)`) | מצוין | — | חינם, בינארי יחיד, מהיר (ms) | **מועמד לדור הבא** של דוחות הנדסיים; לא להחליף עכשיו |
| **WeasyPrint** | 70.0 | **חלקי** – issue #106 "RTL support" פתוח מ-2013, 22 issues פתוחים על RTL | כן (CSS Paged Media מלא, `@page` margin boxes, `counter(page)`) | מצוין | — | חינם (Python) | לא לעברית פרודקשן |
| **react-pdf (`@react-pdf/renderer`)** | 4.9.0 | **אין bidi** (#3076 פתוח, #2900) | ידני | ידני | — | חינם | **לא** |
| **pdfmake** | 0.3.11 (+`pdfmake-rtl` fork) | אין native; ה-fork עושה היפוך ידני | כן | כן | — | חינם | **לא** |
| **XeLaTeX/LuaLaTeX + polyglossia** | polyglossia 2.4 (ינו' 2025) + bidi/luabidi | מעולה טיפוגרפית | כן | כן | — | TeX Live ~GB | רק אם יש מומחיות TeX; לא כאן |
| **DOCX → LibreOffice headless → PDF** | LO 24/25 בדוקר | טוב, אבל באג ידוע ב-justify עם מספרים+פיסוק בסוף שורה עברית | כן (מהתבנית) | כן | — | חינם; תהליך ~1–3 ש' למסמך | רק כש-DOCX נדרש ממילא |

### 2.2 פרקטיקות Chromium לעברית (ליישם בתבניות הקיימות)
- `<html lang="he" dir="rtl">`; בטבלאות מספריות `td.num {direction: ltr; unicode-bidi: isolate; text-align: left/right}`; מספרי טלפון/ח.פ./מק"ט בתוך `<bdi>` או `<span dir="ltr">`.
- Rubik: להטמיע `@font-face` עם `src: url(data:font/woff2;base64,...)` (גם ב-headerTemplate, שאינו רואה CSS חיצוני); `await page.evaluateHandle('document.fonts.ready')` או `waitForFonts` (Puppeteer).
- `@page { size: A4; margin: 25mm 15mm 20mm }` + `preferCSSPageSize: true`; גובה header/footer ≤ margin.
- "עמוד X מתוך Y" ב-footerTemplate: `<div dir="rtl" style="font-family:Rubik;font-size:9px;width:100%;padding:0 15mm">עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span> · הצעה {{quote_no}} גרסה {{v}}</div>`.
- לקבוע `PDF/A`? Chromium לא מפיק PDF/A; אם לקוח ממשלתי דורש – להמיר ב-Ghostscript (`-dPDFA=2`) [לא אומת שהמרת Ghostscript שומרת bidi/טקסט בעברית – לבדוק].
- בדיקת רגרסיה ויזואלית: לרנדר PNG של עמוד 1 ולשמור snapshot (Playwright `toHaveScreenshot`).

### 2.3 סט שרטוטים (DXF/PDF) – מסלול מומלץ
1. Python (קיים): ezdxf → matplotlib backend → PDF לכל גיליון (או ODA File Converter / LibreCAD headless אם צריך נאמנות DWG).
2. **pypdf 6.19** (`PdfWriter.append`, `add_outline_item`, metadata, page labels) למיזוג: דף שער (מ-Chromium) + רשימת שרטוטים + גיליונות A3/A1 + נספחים (דאטה-שיטים של ספקים כ-PDF).
3. ב-Node, אם המיזוג קורה בשרת ה-Fastify: **pdf-lib 1.17.1** (`PDFDocument.copyPages`) – בלי רינדור טקסט עברי ב-pdf-lib (אין bidi/shaping), רק מיזוג/חותמות גרפיות.
4. קובץ DXF מקורי כ-attachment: pypdf `add_attachment()` / pdf-lib `attach()`; או פשוט ZIP.
5. חותמת "מהדורה/תאריך/לא לביצוע" כ-overlay (pypdf `merge_page` עם PDF שקוף שנוצר ב-Chromium).

### 2.4 חתימה דיגיטלית על PDF (PAdES)
- **@signpdf/signpdf 3.3.0** (+ `@signpdf/placeholder-pdf-lib`, `@signpdf/signer-p12`): PAdES-B-B בלבד (`SUBFILTER_ETSI_CADES_DETACHED`); **אין** RFC-3161 timestamp ואין LTV/DSS מובנה.
- pdf-lib: אותו דבר, בסיסי.
- LTV מלא ב-Node: ATick (מסחרי) או Java `jsignpdf`/DSS של האיחוד האירופי. ב-Python: `pyHanko` (PAdES B-LT/LTA, timestamp) [לא אומת גרסה].
- **המלצה:** חתימת-שרת (seal) של B.E.E על ה-PDF הסופי עם תעודה ארגונית + timestamp = "חותמת חברה" אלקטרונית; חתימת הלקוח – ראו סעיף 5.

---

## 3. DOCX ותבניות

| ספרייה | גרסה | סוג | לולאות בטבלאות | תנאים | תמונות/HTML | PDF | רישיון/עלות |
|---|---|---|---|---|---|---|---|
| **docxtemplater** | 3.71.0 | תבנית DOCX/PPTX שמישהו לא-מתכנת עורך ב-Word | כן, בחינם (`{#items}…{/items}` בתוך שורת טבלה) | כן (angular-expressions) | מודולים בתשלום: Image, HTML, XLSX, Chart, Table, Subtemplate… (~500€/מודול/שנה; Pro 1,250€/שנה ל-4 מודולים; Enterprise 3,000€/שנה; perpetual 12,250€) | דרך LibreOffice | ליבה MIT |
| **Carbone** | 3.8.2 (npm, CE; Enterprise v5) | תבנית בכל פורמט XML (docx/odt/xlsx/pptx/html) + המרה ל-PDF ב-LibreOffice מובנה (worker pool) | כן (`{d.items[i].name}`) + nested | כן | formatters JS | **מובנה** (LO) | CCL – חינם on-prem כל עוד לא מוכרים כשירות; Cloud מ-29€/חודש |
| **docx (dolanmiu)** | 9.8.1 | בניית DOCX מקוד (TS) | קוד | קוד | כן | חיצוני | MIT |
| **python-docx** | 1.2.0 | עריכה מקוד | ידני | ידני | כן | חיצוני | MIT |

**RTL ב-DOCX:** הטקסט עצמו בסדר (Word עושה bidi), אבל צריך `w:bidi` בפסקה ו-`w:rtl` ב-run; ב-docxtemplater זה יורש מהתבנית (הכי קל – מעצבים את התבנית ב-Word עברי). ב-`docx` npm: `Paragraph({bidirectional:true})`, `TextRun({rightToLeft:true})` [לא אומת מול README – מהזיכרון]. טבלאות RTL: `w:bidiVisual` ברמת הטבלה.

**מתי DOCX מנצח HTML:**
1. הלקוח/יועץ/עו"ד חייב לערוך (חוזה, מפרט טכני מיוחד, נספח מסחרי).
2. מכרזים ציבוריים שדורשים "להגיש בפורמט Word".
3. מסמך ארוך עם תוכן עניינים, הערות שוליים, מספור סעיפים אוטומטי – Word עושה את זה טוב יותר מ-CSS.
בכל שאר המקרים (הצעת מחיר, כתב כמויות, דוח שדה, אישור ביצוע) – HTML→PDF עם תבנית אחת שאתם שולטים בה.

**המלצה:** תבנית DOCX אחת ל"הסכם התקשרות" + "מפרט טכני מיוחד" ב-docxtemplater (ליבה חינמית מספיקה: טבלת פריטים בלולאה, תנאים, ללא תמונות), המרה ל-PDF בקונטיינר LibreOffice (image ייעודי, `fonts-noto-core` + Rubik + `fonts-crosextra-carlito`), ולאחר מכן מיזוג עם ה-PDF של ההצעה.

---

## 4. CPQ / מנוע תמחור – דפוסים ומודל נתונים

### 4.1 מושגים מ-Salesforce CPQ (כמודל ייחוס, לא כמוצר)
- **Product / Product Option / Configuration Attribute** – מוצר-אב ("מערכת PV גג רעפים") עם אופציות (ממיר, אופטימייזרים, קונסטרוקציה) ותכונות (kWp, סוג גג, מרחק מלוח).
- **Product Rules** – validation / selection / filter / alert: "אם ממיר > 50 kW → חובה מונה ייצור של חח"י ובודק מוסמך", "SolarEdge → חובה אופטימייזר לכל פאנל".
- **Price Book / Price Book Entry** – מחירון לפי קהל (פרטי / עסקי / קבלן משנה) ותוקף.
- **Price Rules** (sort order) – מחשבות מחיר שורה לפי תנאים (כמות, גג, מרחק).
- **Discount Schedule / Block Price / Contracted Price** – הנחות מדורגות לפי kWp, מחיר לבלוק, מחיר חוזי ללקוח.
- **Quote / Quote Line / Quote Line Group** – ההצעה, השורות, קיבוץ לפרקים (= פרקי כתב הכמויות).
- **Approvals** – הנחה מעל סף → אישור מנהל.
- **Quote Template** – תבנית מסמך.

### 4.2 Odoo / ERPNext – מה ללמוד
- **ERPNext Quotation** (`SAL-QTN-.YYYY.-`): סטטוסים Draft/Open/Replied/Partially Ordered/Ordered/Lost/Cancelled/Expired; `valid_till`; `amended_from` + `is_latest_revision` (ביטול → amend יוצר `-1`, `-2`); `selling_price_list` חובה; `taxes` table; `additional_discount_percentage` / `discount_amount` / `apply_discount_on`; `payment_schedule`. **BOM ≠ מחיר מכירה** – ב-ERPNext עלות BOM ומחיר מכירה מנותקים (דיון בפורום) – אצלכם כן לקשר (cost+margin).
- **Odoo sale.order** שומר רק את המצב האחרון; מודולי "Quotation Revision" מוסיפים snapshot לכל גרסה (`RSO1_S00021`). מסקנה: גרסאות הן פיצ'ר ליבה, לא תוספת.

### 4.3 מודל נתונים מוצע (Postgres)
```
catalog_item        (id, sku, name_he, unit, category, manufacturer, spec jsonb, is_active)
price_list          (id, name, audience: 'retail'|'b2b'|'subcontractor', currency, valid_from, valid_to)
price_list_entry    (price_list_id, catalog_item_id, cost, cost_source: 'supplier:arca:2026-09', price, margin_pct, min_qty, block_from)
assembly            (id, name "מערכת 1 kWp על גג רעפים") ; assembly_component (assembly_id, item_id, qty_per_unit, unit_basis: 'kWp'|'module'|'m'|'fixed')
rule                (id, kind: 'validation'|'selection'|'price', expr jsonb/CEL, message_he)
quote               (id, number 'Q-2026-0142', customer_id, site_id, status, current_version_id)
quote_version       (id, quote_id, version_no, created_by, created_at, immutable_at, inputs jsonb {kWp, roof_type, modules, inverter…}, totals jsonb, pdf_sha256, excel_sha256)
quote_section       (id, version_id, code '08.01', title_he, sort)
quote_line          (id, version_id, section_id, line_no '08.01.0010', item_id?, description_he, unit, qty, unit_price, unit_cost, discount_pct, total, price_snapshot jsonb, source: 'assembly'|'manual'|'dekel')
quote_event         (quote_id, version_id, type: 'sent'|'viewed'|'accepted'|'signed'|'rejected', actor, ip, ua, at, payload jsonb)
change_order        (id, quote_id, base_version_id, new_version_id, reason_he, delta_total, signed_event_id)
```
- **מנוע חישוב** ב-TypeScript טהור (פונקציה דטרמיניסטית `price(inputs, priceListVersion, rules) → lines`), ניתן לבדיקה ביחידה ולהרצה גם בדפדפן (PWA אופליין לסקר-אתר → הצעה ראשונית בשטח).
- כסף: `numeric(14,2)` ב-DB, `decimal.js`/`big.js` בקוד; עיגול לפי שורה (ROUND_HALF_UP) ולא רק בסוף; מע"מ 18% (מינואר 2025) כ-parameter עם תוקף.

### 4.4 מבנה כתב כמויות בישראל
- פורמט סטנדרטי (מכרזים/יועצים): **מס' סעיף | תיאור | יח' | כמות | מחיר יח' | סה"כ**, מקובץ לפרקים/תתי-פרקים לפי **המפרט הכללי הבין-משרדי ("הספר הכחול")** – חשמל = **פרק 08 "מתקני חשמל"**; פרק 08 נמצא בתחזוקה של הוועדה הבין-משרדית (משהב"ט/בינוי/תחבורה). מסמכי מכרז מקומיים (מועצות, אוניברסיטאות) מפנים ל"מפרט כללי 08" + "מפרט טכני מיוחד" + כתב כמויות.
- **מחירון דקל** (dekel.co.il, חיפה) – מחירון בנייה ותשתיות מסחרי; מכרזים רבים קובעים "המחירון העדכני של דקל בניכוי X%". למחירון יש פרק 08 חשמל עם תתי-פרקים (צנרת ותעלות, כבלים, לוחות, גופי תאורה, הארקות, ...). **האם יש תת-פרק PV ייעודי ב-08 או פרק נפרד למערכות סולאריות – [לא אומת]** (האתר חסום לסשן). מנוי דקל בתשלום; **אין API ציבורי ידוע [לא אומת]** – לרוב מייצאים מ"תוכנת דקל" ל-Excel.
- מספור מקובל: `08.01.0010` (פרק.תת-פרק.סעיף) – לשמור כטקסט; יחידות: יח', מ"א, מ"ר, קומפ' (קומפלט), ק"ג, שעה, נק' (נקודה), ש"ע.
- "קומפלט" משמש ללוחות/מערכות שלמות; "נקודה" לנקודות חשמל; PV בפועל מתומחר "לפי kWp" כשורה אחת, או מפורק – ראו 4.6.

### 4.5 איך מתקינים מתמחרים PV (ישראל + ייחוס בינ"ל)
- **ישראל (מקורות צרכניים, לא מקצועיים):** ביתי "מ-3,500 ₪/kW", מסחרי "מ-2,200 ₪/kW" (bizportal/midrag, 2025); דוגמאות: 15 kW גג שטוח ≈ 56,000 ₪; 22.3 kW רעפים 72,000 ₪; 23 kW פרגולה+רעפים ≈ 89,000 ₪; 10 kW ≈ 72,000 ₪ [טווחים צרכניים – לא מחירון].
- **פירוק מקובל (ייחוס NREL/בנצ'מרקים US ל-500 kW מסחרי, $/Wdc):** מודולים 0.34, קונסטרוקציה 0.15, ממירים 0.12, BOS חשמלי 0.20, עבודה 0.40. כלומר **עבודה + BOS ≈ 40–45%** – זה מה שמשתנה לפי גג, מרחק ולוח, ולכן זה מה שצריך פרמטריזציה.
- **ברירות המחדל שכדאי להגדיר כ-assembly rules:**
  - לפי **kWp**: מודולים, אופטימייזרים (אם SolarEdge), ממיר (בלוקים לפי kW), ניטור, מבנה קונסטרוקציה בסיסי.
  - לפי **מודול × סוג גג**: עבודת התקנה (רעפים / איסכורית / בטון שטוח עם משקולות / פרגולה), אביזרי חיבור.
  - לפי **מטר**: כבל DC (סולארי 4/6 ממ"ר), כבל AC לפי חתך, תעלות/צנרת, הארקה.
  - **קומפלט**: לוח AC/DC, מפסק ראשי, ממסר הגנה (RCD type B / ממסר מתח-תדר לפי דרישת חח"י), מערכת כיבוי/ניתוק מהיר, שילוט.
  - **תנאי אתר**: מנוף/במת הרמה (יום), פיגומים/קו חיים, שינוע, ביטוח עבודות קבלניות.
  - **רגולציה**: אישור קונסטרוקטור, בודק חשמל מוסמך (בדיקת מתקן), ליווי חח"י (סקר חיבור, אגרת בדיקה/חיבור, מונה ייצור/דו-כיווני; מעל 50 kW – מונה קריאה מרחוק על חשבון היזם), רישום ברשות החשמל (תעריף), היתר/פטור מהיתר (מעל 700 קילו / גודל), תיק מתקן As-Made.
  - **אופציות**: אגירה (סוללה + PCS), עמדת טעינה, הרחבת לוח, החלפת חיבור ל-3 פאזות.

### 4.6 כתב כמויות לדוגמה – 50 kWp על גג מסחרי (קטגוריות וסעיפים טיפוסיים, **ללא מחירים**)
| מס' | תיאור | יח' |
|---|---|---|
| **01** | **מקדמות ותכנון** | |
| 01.01 | סקר אתר, מדידה וצילום רחפן | קומפ' |
| 01.02 | תכנון חשמלי + סימולציית תפוקה (PVsyst/SolarEdge Designer) | קומפ' |
| 01.03 | אישור קונסטרוקטור לגג + תוכנית עיגון | קומפ' |
| 01.04 | טיפול בסקר חיבור חח"י / רשות החשמל | קומפ' |
| **02** | **מודולים ואלקטרוניקה** | |
| 02.01 | מודול PV ~580–620 Wp bifacial/TOPCon, כולל אספקה | יח' (≈ 84–90) |
| 02.02 | ממיר מחרוזות 3-פאזי 50 kW (או 2×25) כולל Wi-Fi/LAN | יח' |
| 02.03 | אופטימייזרים (אם SolarEdge) | יח' |
| 02.04 | מערכת ניטור + חיבור לאינטרנט | קומפ' |
| **03** | **קונסטרוקציה** | |
| 03.01 | מערכת עיגון לגג איסכורית/רעפים/שטוח (לפי סוג) | kWp או מ"ר |
| 03.02 | משקולות/בלסט לגג שטוח | יח' |
| 03.03 | איטום חדירות גג | יח' |
| **04** | **חשמל DC** | |
| 04.01 | כבל סולארי 6 ממ"ר H1Z2Z2-K | מ"א |
| 04.02 | מחברי MC4 | זוג |
| 04.03 | לוח DC / מפסקי מחרוזת + מגני ברק DC (SPD) | קומפ' |
| 04.04 | תעלות/צנרת UV על גג | מ"א |
| **05** | **חשמל AC** | |
| 05.01 | כבל AC N2XY 5×35 (לפי מרחק/חתך) | מ"א |
| 05.02 | לוח AC למתקן PV כולל מפסק ראשי, SPD, מונה ייצור | קומפ' |
| 05.03 | ממסר הגנה/ניתוק (מתח-תדר) לפי דרישת חח"י | יח' |
| 05.04 | הרחבה/שינוי בלוח ראשי קיים, שדה ייצור | קומפ' |
| 05.05 | הארקה: פס השוואת פוטנציאלים, חיבור קונסטרוקציה | קומפ' |
| 05.06 | שילוט ותיוג לפי תקן 61439/חח"י | קומפ' |
| **06** | **עבודות התקנה** | |
| 06.01 | התקנת מודולים (לפי סוג גג) | יח' |
| 06.02 | התקנה וחיווט ממיר ולוחות | קומפ' |
| 06.03 | הנפה/מנוף/במת הרמה | יום |
| 06.04 | פיגום / קו חיים / בטיחות גובה | קומפ' |
| 06.05 | שינוע ופינוי פסולת | קומפ' |
| **07** | **בדיקות, אישורים והפעלה** | |
| 07.01 | בדיקת מתקן ע"י בודק חשמל מוסמך + דוח | קומפ' |
| 07.02 | אגרות חח"י (בדיקה/חיבור/מונה) – **על חשבון הלקוח, לפי חשבון חח"י בפועל** | קומפ' |
| 07.03 | ליווי בדיקת חח"י והפעלה מסחרית | קומפ' |
| 07.04 | תיק מתקן As-Made (שרטוטים, בדיקות IV/IR, אישורים) | קומפ' |
| **08** | **שונות ואופציות** | |
| 08.01 | ביטוח עבודות קבלניות | קומפ' |
| 08.02 | אחריות מורחבת / שירות ותחזוקה שנתי (O&M) | שנה |
| 08.03 | אופציה: אגירה X kWh | קומפ' |
| **סיכומים** | סה"כ לפני הנחה / הנחה / סה"כ לפני מע"מ / מע"מ 18% / סה"כ כולל מע"מ; **מחיר ל-kWp** (KPI) | |

---

## 5. חתימה אלקטרונית וקיבול משפטי בישראל

### 5.1 מסגרת משפטית (עיקרי הדברים)
- **חוק חתימה אלקטרונית, תשס"א-2001** (תוקן 2018): שלוש דרגות – **חתימה אלקטרונית** (כל מידע/סימן אלקטרוני המצורף למסר, כולל סריקה, לחיצה, עט דיגיטלי), **חתימה אלקטרונית מאובטחת** (אמצעי בשליטה בלעדית של החותם, מאפשר זיהוי וגילוי שינוי), **חתימה אלקטרונית מאושרת** (מאובטחת + תעודה מגורם מאשר רשום במשרד המשפטים – Comsign, PersonalID ועוד).
- חוזה (והצעת מחיר שהתקבלה) **לא דורש חתימה בכלל** לפי חוק החוזים (הצעה + קיבול, גם במייל/וואטסאפ) – חתימה מאובטחת/מאושרת נדרשת רק היכן שחוק ספציפי דורש "חתימה" או מסמכים רגולטוריים (מקרקעין, בנקים, דיווחים לרשויות) [סעיף זה נכתב מידע כללי – **לא אומת** מול נוסח החוק בסשן].
- Click-wrap: הפסיקה הישראלית מכירה בהסכמה בלחיצה (Globes 2003 ועוד), עם דגש על **הוכחת הסכמה מודעת** – לכן ה-audit trail הוא העיקר.
- ראיה: לחתימה מאושרת חזקת תקפות; לחתימה "רגילה" – נטל ההוכחה על הטוען לה → שומרים ראיות.

### 5.2 טבלת אפשרויות
| אפשרות | עלות (2025–26) | דרגה לפי החוק | התאמה ל-B.E.E | הערות |
|---|---|---|---|---|
| **Click-to-accept בפורטל שלכם** (קישור ייחודי, OTP ל-SMS, checkbox "קראתי ומאשר", חתימה בציור, hash של ה-PDF, IP/UA/זמן, שליחת עותק חתום במייל) | פיתוח פנימי + SMS (~0.1 ₪/הודעה) | חתימה אלקטרונית "רגילה" עם ראיות חזקות | **שלב 1 – מומלץ** | מספיק ל-95% מהצעות המחיר; לשמור `quote_event` + PDF חתום + certificate page |
| **Comsign / WeSign** (ישראלי, גורם מאשר) | לפי הצעת מחיר; גם תעודות אישיות (כרטיס/טוקן/ענן) [לא אומת] | מאושרת / מאובטחת | חוזים גדולים, מכרזים, מסמכים לרשויות | API קיים (Signer-1/WeSign) [לא אומת] |
| **DocuSign** | Standard ~$30/משתמש/חודש (שנתי), 100 envelopes/משתמש/שנה; Personal $10 | "רגילה" + certificate; eIDAS AES בתוספת | עובד בעברית; יקר לנפח | API טוב |
| **Dropbox Sign** | Essentials ~$15/משתמש/חודש | רגילה | זול; API פשוט | |
| **PandaDoc** | $19 → $65/משתמש/חודש | רגילה | כולל בניית הצעות מחיר – חופף למה שאתם בונים | |
| **Signit** (ערבי-מזרח תיכון, לא ישראלי) / ספקים ישראלים נוספים (Doc2Sign, "חתימה חכמה") | [לא אומת] | | | |

**חובה בכל מסלול:** המסמך שנחתם = קובץ immutable (sha256 ב-`quote_version.pdf_sha256`), "דף תעודה" (certificate page) שמצורף ל-PDF עם ה-trail, ושמירת גרסת תנאים כלליים (T&C) שנחתמה.

---

## 6. חשבוניות/הנה"ח ותשלומים בישראל

### 6.1 "חשבוניות ישראל" – מספרי הקצאה
- הוראת שעה מ-1.4.2024 עד 31.12.2028: חשבונית מס מעל סף → חובה **מספר הקצאה** מרשות המסים, אחרת הלקוח לא יוכל לקזז מע"מ. 2024 = פיילוט (כל בקשה אושרה).
- **ספים לפי המקור המקורי:** 25,000 ₪ (2024) → 20,000 (2025) → 15,000 (2026) → 10,000 (2027) → 5,000 (2028).
- **אבל** מקורות מ-2026 (kipa, מסמך איגוד הרוקחים "חשבונית ישראל יוני 2026") מדברים על **5,000 ₪ החל מיוני 2026** – כלומר נראה שהלו"ז הואץ. **[לא אומת – סתירה בין מקורות; לוודא מול rsot.gov.il/פורטל רשות המסים לפני יישום]**.
- יישום: ספקי התוכנה (Morning, iCount, EZcount, SUMIT, Priority, חשבשבת) מבקשים את המספר אוטומטית דרך API של שע"מ בעת הפקת החשבונית. **אל תממשו מול שע"מ ישירות** – דרוש רישום מפתח, OAuth, סביבת בדיקות; לתת לספק החשבוניות לעשות זאת ולשמור אצלכם `allocation_number` + סטטוס.
- השלכה על CPQ: הצעת מחיר אינה חשבונית ולא צריכה הקצאה; אבל לשמור `customer.vat_id (ח.פ./עוסק)` ו-`customer.type` כי זה שדה חובה בבקשת ההקצאה, ולהפיק חשבונית עסקה/מס דרך ספק.

### 6.2 טבלת ספקי חשבוניות
| ספק | API | הערות | מתאים? |
|---|---|---|---|
| **Morning (חשבונית ירוקה)** | REST JSON; **חדש:** OAuth2 client-credentials ב-`https://api.morning.co/idp/v1/oauth/token` (sandbox: `api.sandbox.morning.dev`); ה-flow הישן `api.greeninvoice.co.il/api/v1/account/token` **הוצא משימוש** (pypi green-invoice ≥2.0.0) | מסמכים: הצעת מחיר, הזמנה, חשבונית עסקה, חשבונית מס, חשבונית מס-קבלה, קבלה, זיכוי; חיפוש `POST /documents/search`; מפתחות ב-Settings → Developer Tools; API זמין בחבילות בתשלום [רמת חבילה – לא אומת] | **כן – ברירת מחדל** (הכי פופולרי אצל קבלנים קטנים) |
| **iCount** | REST `api.icount.co.il/api_v3_php/` (`doc/create`, clients, items) [פרטי endpoints – לא אומת, האתר חסום]; מודולי Make/Zapier | מלאי, CRM; ותיק | כן, חלופה |
| **EZcount** (חברת-בת של Hyp) | API ("createDoc"), תיעוד ב-developers.hyp.co.il | משולב עם סליקה של Hyp | אם סולקים ב-Hyp |
| **SUMIT** | REST API [לא אומת] | הנה"ח מלאה + שכר | לרו"ח |
| **Priority** | OData REST (`prioritysoftware.github.io`), Basic/OAuth2/PAT, 100 קריאות/דקה בענן, `$since` ל-sync | ERP מלא – ייעשה רלוונטי רק אם B.E.E תצמח ל-ERP | לא כעת |
| **חשבשבת (H-ERP)** | API/ייבוא קבצים [לא אומת] | נפוץ אצל רו"ח | אולי דרך רו"ח |

### 6.3 תשלומים / קישורי תשלום
| ספק | API | Bit | Apple/Google Pay | חשבונית אוטומטית | הערות |
|---|---|---|---|---|---|
| **Grow (לשעבר משולם)** | `createPaymentProcess` → URL + processId/processToken; webhooks; tokenization; recurring; 3DS ("Grow Light API") | כן | כן | כן (אינטגרציות) | פופולרי לעסקים קטנים; דמי סליקה לפי הסכם |
| **Cardcom** | API v11 "Low Profile" (דף תשלום), tokens, recurring, הפקת חשבונית/קבלה בעת החיוב | כן | כן | **מובנה** | טוב ל"מקדמה 30% בלחיצה" |
| **Tranzila** | iframe/hosted + token API; Masav הו"ק | כן | כן | דרך שותפים | ותיק |
| **Bit לעסקים (פועלים)** | אין API ישיר ציבורי – נגיש דרך Grow/Cardcom/Tranzila [לא אומת] | — | — | — | |

**מתכון:** לאחר קיבול הצעה → יצירת חשבונית עסקה ב-Morning (`document type: proforma/ חשבונית עסקה`) + קישור תשלום Grow/Cardcom למקדמה → webhook → קבלה/חשבונית מס-קבלה אוטומטית עם מספר הקצאה.

---

## 7. קטלוגים ומחירוני ספקים בישראל (חשמל/PV)

**ממצא מרכזי:** לא נמצא (בחיפושים שהספיקו) אף יבואן/סיטונאי ישראלי בחשמל או PV שמפרסם מחירון **machine-readable פומבי** או API. בישראל הנוהג: מחירון Excel/PDF ש"נשלח לקבלנים רשומים", הנחת קבלן אישית, ועדכוני מחיר במייל. באירופה הסטנדרט הוא **ETIM + BMEcat** (Weidmüller, Hager, Schneider, ABB מספקים קטלוגי BMEcat ליבואנים) – ייתכן שיבואנים ישראלים (ארכה, א.ד. אלקטריק, אלקטרה, סולאר-אדג' ומפיצים כמו יוניברסל סולאר / ס.י.מ) מחזיקים נתוני ETIM פנימית, אבל **[לא אומת]**.

| מקור | מה זמין | גישה | שיטת עדכון מומלצת |
|---|---|---|---|
| **ארכה** (סיטונאי/יבואן ציוד חשמל ותאורה) | מחירון לקבלנים (Excel/PDF) [לא אומת פורמט] | סוכן/פורטל לקוחות | ייבוא Excel חודשי → `price_list_version` |
| **א.ד. אלקטריק**, אלקטרה, Schneider/ABB/Hager Israel (יבואנים) | מחירוני יצרן + הנחה | PDF/Excel | כנ"ל; ליצרנים גלובליים – לבקש BMEcat/ETIM מהיבואן |
| **SolarEdge** (ישראל) / מפיצים (יוניברסל סולאר ועוד) | מחירון מפיץ, מק"טים גלובליים (SExxK-RWS…) | מייל/פורטל | ייבוא + מיפוי SKU יצרן ↔ SKU פנימי |
| **מחירון דקל** | סעיפי "מחיר שוק" כולל עבודה | מנוי, תוכנת דקל, ייצוא Excel | שימוש כ-benchmark/למכרזים, לא כעלות |
| **מחירון משכ"ל / משהב"ט** | מחירוני ציבור | PDF | ייחוס במכרזים |

**ארכיטקטורה לשמירת מחירים עדכניים:**
1. `supplier` + `supplier_price_list_version` (file hash, received_at, valid_from) → ייבוא (סעיף 1.5) → `supplier_item` (SKU ספק, תיאור, מחיר מחירון, הנחת קבלן, מחיר נטו, מטבע, תאריך).
2. מיפוי `supplier_item ↔ catalog_item` (many-to-one, ספק מועדף + חלופות).
3. `catalog_item.cost` = מינימום/מועדף נטו, עם `cost_as_of`; התראה ב-UI על פריט שעלותו ישנה מ-90 יום או שעלתה > 5%.
4. **צמוד מט"ח:** למודולים/ממירים – לשמור מחיר ב-USD/EUR + שער יציג ביום ההצעה (שער בנק ישראל – API ציבורי `boi.org.il` [לא אומת URL]); בהצעה: "המחיר צמוד לשער X; תוקף 14 יום".
5. רכיב LLM: ניטור מיילים מספקים ("עדכון מחירון") → חילוץ אוטומטי → תור לאישור.

---

## 8. גרסאות, Audit ו-Change Orders

### 8.1 עקרונות
- **Immutable versions:** `quote_version` נסגרת (`immutable_at`) ברגע שליחה ללקוח; כל עריכה = גרסה חדשה (v1, v2…), `quote.current_version_id` מצביע. אין UPDATE על שורות גרסה סגורה (trigger ב-Postgres שמונע).
- **Price snapshot:** כל `quote_line` שומרת `price_snapshot jsonb` – {item_id, price_list_id, price_list_version, unit_cost, unit_price, fx_rate, rule_ids}. כך "מה הלקוח חתם" לא משתנה כשהמחירון משתנה.
- **Document fingerprint:** PDF/Excel שנשלחו נשמרים ב-object storage (R2/S3/דיסק) עם sha256 ב-DB; `quote_event` רושם sent/viewed/accepted עם ה-hash – מוכיח איזו גרסה בדיוק אושרה.
- **Diff בין גרסאות:** חישוב delta ברמת שורה (נוסף/הוסר/שונה: qty, unit_price) לתצוגת "מה השתנה" ולעמוד ראשון של צו שינויים.
- **Approvals:** הנחה כוללת > X% או מרווח < Y% → סטטוס `pending_approval` לפני שליחה.
- **Event sourcing light:** טבלת `quote_event` append-only מספיקה; לא צריך event store מלא.

### 8.2 Change Order (צו שינויים)
1. נוצר מגרסה חתומה (`base_version_id`) → גרסה חדשה עם כל השורות + שינויים → `change_order` עם `delta_total`, סיבה, שורות delta בלבד להצגה.
2. מסמך "צו שינויים מס' N להצעה Q-… גרסה v" – טבלה של שורות שהשתנו בלבד + סיכום חדש + חתימה (אותו מסלול כמו ההצעה).
3. לאחר חתימה – `quote.current_version_id` = הגרסה החדשה; הגרסה החתומה הקודמת נשארת לעד.
4. חשבוניות חלקיות (אבני דרך) מפנות ל-version מסוים.

### 8.3 תאימות ל-PWA (סקר-אתר אופליין)
- הצעה "טיוטה" יכולה להיווצר אופליין ב-IndexedDB עם snapshot של `price_list_version` שסונכרן; בסנכרון – השרת מאמת שה-price_list_version עדיין בתוקף, אחרת מחשב מחדש ומסמן.

---

## 9. גרסאות ספריות (נבדק 2026-10-06 מול npm/PyPI)
| npm | גרסה | | PyPI | גרסה |
|---|---|---|---|---|
| exceljs | 4.4.0 | | openpyxl | 3.1.5 |
| xlsx-populate | 1.21.0 | | XlsxWriter | 3.2.9 |
| xlsx (SheetJS CE on npm) | 0.18.5 | | pdfplumber | 0.11.10 |
| docx | 9.8.1 | | camelot-py | 2.0.0 |
| docxtemplater | 3.71.0 | | pypdf | 6.19.0 |
| carbone (CE) | 3.8.2 | | weasyprint | 70.0 |
| pdf-lib | 1.17.1 | | python-docx | 1.2.0 |
| @signpdf/signpdf | 3.3.0 | | | |
| puppeteer | 25.12.0 | | | |
| playwright | 1.63.0 | | | |
| @react-pdf/renderer | 4.9.0 | | | |
| pdfmake | 0.3.11 | | | |
| pdf-merger-js | 5.1.2 | | | |

Claude (לחילוץ): `claude-opus-5-5` $4/$20, `claude-sonnet-5-5` $2/$10, `claude-haiku-4-5` $1/$5 ל-MTok; PDF input עד 32MB/600 עמודים; Batch API −50%; structured outputs דרך `output_config.format`.

---

## 10. לא אומת / פערים (לבדוק לפני יישום)
1. **ספי מספרי ההקצאה 2026:** סתירה בין "15,000 ₪ ב-2026" (לו"ז מקורי) ל"5,000 ₪ מיוני 2026" (מקורות 2026). לאמת מול רשות המסים.
2. **מחירון דקל:** האם קיים תת-פרק/פרק ייעודי למערכות PV; מחיר מנוי; אפשרות ייצוא/API. (dekel.co.il חסום בסשן.)
3. **המפרט הכללי 08:** מהדורה עדכנית (2024/2025?) והאם יש פרק PV נפרד (הוזכר "פרק 08 – 2001" במסמכי מכרז ישנים).
4. **ExcelJS `rightToLeft`** – מופיע ב-README/typings; לא הורץ בפועל. SheetJS CE – מצב תמיכה ב-RTL view (issue #927) לא נקרא.
5. **xlsx-populate** – אין דגל `rightToLeft` ברמת גיליון (0 issues) – ייתכן שאפשר דרך XML ישיר.
6. **openpyxl `sheet_view.rightToLeft`** – מהזיכרון (issue #184 חסום).
7. **Puppeteer headerTemplate + גופן מוטמע base64** – פרקטיקה מקובלת, לא אומתה בתיעוד בסשן.
8. **Typst** – מצב RTL בגרסה הנוכחית (0.13/0.14?) וחבילות `auto-bidi`/`bidi-flow` – לא נקראו.
9. **docx npm** `bidirectional`/`rightToLeft` – מהזיכרון.
10. **pyHanko** ל-PAdES LTV ב-Python – לא נבדק.
11. **Morning API:** פרטי document type codes, אילו חבילות כוללות API, תמיכת webhooks, ואופן טיפול במספר הקצאה. ה-OAuth החדש ב-api.morning.co אומת רק דרך pypi `green-invoice` 2.0.0.
12. **iCount / EZcount / SUMIT / חשבשבת** – endpoints ותנאי API.
13. **Comsign/WeSign, Signit, Doc2Sign** – מחירים ו-API.
14. **מחירי DocuSign/Dropbox Sign/PandaDoc** – ממקורות משניים (2025–26), לא מדפי המחיר הרשמיים.
15. **Azure Document Intelligence** – מחיר ואיכות עברית.
16. **Bit לעסקים API** – הנחה שאין API ציבורי ישיר.
17. **יבואנים ישראלים (ארכה, א.ד. אלקטריק, יוניברסל סולאר)** – פורמט מחירונים, קיום ETIM/BMEcat.
18. **עלויות ישראליות ל-PV** (₪/kW, אגרות חח"י, בודק) – רק ממקורות צרכניים (midrag/bizportal/ynet) ולא ממחירון מקצועי; לא לשלב במנוע כמספרים.
19. **חוק חתימה אלקטרונית** – הסיכום המשפטי נכתב מידע כללי; PDF החוק ב-gov.il ו-law.co.il היו חסומים. להתייעץ עם עו"ד לגבי ניסוח "אישור הצעה" ותנאי ביטול לצרכן (חוק הגנת הצרכן – עסקה מרחוק).
20. ה-WebSearch נגמר לפני חיפושים על: Typst RTL עדכני, הצעת מחיר מחייבת לפי חוק החוזים, מחירי WeSign, מפיצי SolarEdge, EZcount/SUMIT/חשבשבת API, מחירון דקל PV, Change-order patterns.

---

## 11. מקורות (URLs)
**Excel**
- https://www.pkgpulse.com/guides/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026
- https://github.com/SynthGL/ExcelBench (בנצ'מרק round-trip, snapshot 2026-10-03)
- https://raw.githubusercontent.com/exceljs/exceljs/master/README.md (views.rightToLeft, formulas, definedNames, DV)
- https://raw.githubusercontent.com/dtjohnson/xlsx-populate/master/README.md
- https://www.npmjs.com/package/xlsx-populate · https://npmjs.org/package/exceljs-rtl
- https://xlsxwriter.readthedocs.io/example_right_to_left.html · https://foss.heptapod.net/openpyxl/openpyxl/-/issues/184
- https://sheetjs.com/pro · https://git.sheetjs.com/sheetjs/sheetjs/issues/927
- https://dev.to/pavkode/addressing-javascript-excel-library-flaws-a-new-approach-to-prevent-data-loss-and-ensure-2e5d
- https://cdn.jsdelivr.net/npm/@node-projects/excelforge@3.6.0/FEATURES.md
- https://stackshare.io/stackups/pypi-openpyxl-vs-pypi-xlsxwriter

**חילוץ טבלאות**
- https://raw.githubusercontent.com/camelot-dev/camelot/master/docs/user/comparison.rst
- https://raw.githubusercontent.com/jsvine/pdfplumber/stable/README.md
- https://reducto.ai/blog/evaluating-azure-document-intelligence-for-pdf-parsing
- https://www.llamaindex.ai/insights/table-extraction-benchmark

**PDF / RTL**
- https://raw.githubusercontent.com/puppeteer/puppeteer/main/docs/api/puppeteer.pdfoptions.md
- https://cloud.browserless.io/blog/puppeteer-pdf-generator
- https://www.checklyhq.com/learn/headless/generating-pdfs/
- https://developers.cloudflare.com/browser-rendering/quick-actions/pdf-endpoint
- https://typst.app/universe/package/auto-bidi · https://typst.app/universe/package/bidi-flow · https://github.com/typst/typst/issues/3373
- https://github.com/Kozea/WeasyPrint/issues?q=is%3Aissue+rtl+direction
- https://github.com/diegomura/react-pdf/issues?q=is%3Aissue+rtl+hebrew
- https://github.com/bpampuch/pdfmake/issues?q=is%3Aissue+rtl+hebrew · https://cdn.jsdelivr.net/npm/pdfmake-rtl@2.1.2/README.md
- https://ctan.org/tex-archive/macros/unicodetex/latex/polyglossia
- https://ask.libreoffice.org/t/bidi-justify-issue-in-headless-libreoffice-docker-trailing-punctuation-drops-to-a-new-line-after-numbers/135250
- https://hub.docker.com/r/ofthemachine/libreoffice · https://oneuptime.com/blog/post/2026-02-08-how-to-run-libreoffice-in-docker-for-document-conversion/markdown
- https://www.w3.org/TR/hebr-gap/ · https://unicodefyi.com/guide/unicode-text-direction
- https://github.com/vbuch/node-signpdf · https://npmjs.com/package/@signpdf/signpdf · https://atick-node.readthedocs.io/ · https://eideasy.com/how-to-create-pades-ltv-with-dss-vri

**DOCX**
- https://raw.githubusercontent.com/open-xml-templating/docxtemplater/master/README.md · https://docxtemplater.com/pricing
- https://raw.githubusercontent.com/carboneio/carbone/master/README.md · https://carbone.io/pricing.md · https://carbone.io/on-premise.html
- https://raw.githubusercontent.com/dolanmiu/docx/master/README.md

**CPQ**
- https://atrium.ai/resources/a-complete-guide-to-salesforce-cpq-objects/ · https://www.sikich.com/insight/all-the-salesforce-cpq-technical-info-you-need-to-know/
- https://github.com/frappe/erpnext/blob/develop/erpnext/selling/doctype/quotation/quotation.json · https://docs.frappe.io/erpnext/quotation.md · https://discuss.frappe.io/t/bom-cost-vs-item-cost/138970
- https://apps.odoo.com/apps/modules/19.0/quotation_revision
- https://docs.infrahub.app/immutable-history/overview · https://ayende.com/blog/164897/versioned-collections

**BOQ / PV ישראל**
- https://dsharon.org.il/uploads/n/1658822876.9832.docx (אומדן מתוכנת דקל, פרק 08)
- https://hof-ashkelon.org.il/uploads/n/1746702870.4154.pdf · https://nzc.org.il/uploads/n/1598253200.8157.pdf (מפרט כללי 08)
- https://tenders.huji.ac.il/wp-content/uploads/2026/06/מפרט-טכני-מיוחד-חשמל-ותקשורת.pdf
- https://www.bizportal.co.il/energy/news/article/20024869 · https://www.midrag.co.il/content/price/30545 · https://www.midrag.co.il/Content/Tip/14680 · https://www.ynet.co.il/economy/article/4928285
- https://mr.gov.il/ilgstorefront/he/p/attachment/005056BF19AF1EDA95A4AD0FD073A121/מסמכי הליך (מכרז PV – דרישות חח"י/מונה)
- https://www.sii.org.il/lobby/lab-tests-search/laboratory-test/pv/
- https://nrel.gov/docs/fy21osti/77324.pdf · https://www.surgepv.com/blog/solar-installation-cost-breakdown · https://muhammed.portlandiaelectric.supply/blogs/news/module-prices-34-cents-commercial-bos-inflation-q2-2026

**חתימה אלקטרונית**
- https://www.gov.il/BlobFolder/generalpage/electronic_signature_law2/he/ELECTRONIC_law%203%202018.pdf
- https://www.hamichlol.org.il/חוק_חתימה_אלקטרונית · https://law.co.il/knowledge-centers/e-sig/e-sig-links
- https://www.globes.co.il/news/article.aspx?did=729035 (click-wrap)
- https://www.comda.co.il/wp-content/uploads/2024/09/Wesign.heb_.pdf · https://helpx.adobe.com/document-cloud/digital-identity/comsign.html
- https://costbench.com/compare/docusign-vs-pandadoc/ · https://blog.signnow.com/docusign-pricing/ · https://www.esign.ai/blog/pandadoc-pricing-per-user

**חשבוניות / תשלומים**
- https://pypi.org/project/green-invoice/ (OAuth חדש api.morning.co)
- https://www.greeninvoice.co.il/magazine/israel-invoice/ · https://www.efraty.com/?p=3061 · https://ae-cpa.co.il/wp-content/uploads/2025/09/הקצאת-מספרי-חשבוניות-ע_י-רשות-המיסים-–-כל-מה-שצריך-לדעת-במקום-אחד.pdf · https://www.kipa.co.il/כדאי-לדעת/1232040-0/ · https://pharmacy.org.il/images/מס-2014-חשבונית-ישראל-יוני-2026.pdf
- https://apps.make.com/icount · https://developers.hyp.co.il/documents-and-invoicing/overview
- https://prioritysoftware.github.io/ · https://cdn.priority-software.com/docs/Priority_OData_API_H.pdf
- https://grow-il.readme.io/reference/overview-6 · https://secure.cardcom.solutions/Api/v11/Docs · https://docs.bill.run/en/payment-gateway/tranzila

**קטלוגים**
- https://www.itek.de/en/knowledge/industry-standards-directory/etim-bmecat · https://www.weidmueller.com/int/service/electronics_catalogue_in_bmecat_and_other_formats.jsp
