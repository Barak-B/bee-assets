# תבנית — כתב כמויות XLSX (`boq_xlsx`) · פריסת חוברת עבודה

| | |
|---|---|
| גרסה | 0.1 (2026-10-10) · `template_rev: boq_xlsx/r1` |
| מחולל | ExcelJS 4.4 ב-`services/docgen` · קלט: `DocumentModel<boq_xlsx>` (Zod) · פלט: XLSX (+CSV של גיליון הסעיפים) |
| מקורות | `specs/12-cpq-documents-spec.md` §3, §6.3 · `research/04-quote-boq-docs.md` §1.4, §4.4, §4.6 · `00-master-plan.md` §6.3 |
| מוסכמות | RTL בכל גיליון; מספרי סעיף כטקסט; נוסחאות חיות **עם** `result` ממנוע התמחור; אין מחירים בדוגמה (placeholders) |

---

## 1. שתי תצוגות (views) — אותו DocumentModel

| | `customer` (ללקוח / יועץ) | `internal` (ברק / רכש) |
|---|---|---|
| גיליונות | `סיכום`, `פרמטרים`, פרק לכל פרק (`08.01`…`08.08`), `_meta` (veryHidden) | כנ"ל + `פנימי` + `BOM-eplan` (כשיש) + `מקורות` |
| עמודות בפרקים | A–F (סעיף, תיאור, יח', כמות, מחיר יח', סה"כ) + G הערה | A–G + H–P (עלות יח', עלות סה"כ, רווח ₪, רווח %, ספק, מק"ט ספק, מקור כמות, כלל, דגל אימות) |
| שורות `hide_price` | מוצגות עם "כלול" בעמודות E–F | מחיר/עלות מלאים |
| שורות `optional && !selected` | לא מוצגות (או בפרק "אופציות" כשה-DocumentModel מבקש) | מוצגות באפור |
| הגנה | כל התאים נעולים; `fill_form` משחרר D (כמות) ו-E (מחיר יח') | ללא הגנה |
| שם קובץ | `BOQ_{quote_number}_v{version_no}_customer.xlsx` | `BOQ_{quote_number}_v{version_no}_internal.xlsx` |

ה-view נבחר **לפני** הכתיבה (אין מחיקת עמודות לאחר מעשה). שני הקבצים נרשמים כ-`Document` נפרדים (`view` בשדה), אותו `document_model_hash`.

---

## 2. מספור סעיפים ופרקים

פורמט: `PP.CC.NNNN` כטקסט (`numFmt '@'`), כאשר:
- `PP` = פרק במפרט הכללי הבין-משרדי — **08** (מתקני חשמל) לכל סעיפי החשמל; לפרקים שאינם חשמל (קונסטרוקציה, איטום, ביטוח) אפשר `PP` אחר — **לאימות** מול מהדורת המפרט/דקל (דוח 04 §10 פריטים 2–3). ברירת מחדל: הכל תחת `08` עם פרקי PV פנימיים.
- `CC` = פרק PV פנימי (01–08) לפי דוח 04 §4.6.
- `NNNN` = סעיף בצעדים של 10 (`0010, 0020, …`) כדי לאפשר הוספת סעיפים ברוויזיות בלי למספר מחדש; סעיפים שנוספו בגרסה מאוחרת מקבלים מספר ביניים (`0015`).
- עמודה אופציונלית `dekel_ref` (internal) לסעיף דקל/מפרט מקביל כשקיים.

| `CC` | פרק (שם גיליון) | מקביל ב-eplan BOM (`group`) | סוגי Product טיפוסיים |
|---|---|---|---|
| 01 | מקדמות ותכנון | — | service (survey, design, simulation, constructor, permit_exempt_report, iec_followup — סקר חיבור) |
| 02 | מודולים ואלקטרוניקה | ציוד ראשי | module, inverter, optimizer, accessory(comm), service(monitoring_setup) |
| 03 | קונסטרוקציה | קונסטרוקציה * | mounting (rail, hook, clamp, ballast), איטום חדירות |
| 04 | חשמל DC ותשתית גג | DC, תעלות, עיגון ושילוט | cable dc, mc4, spd_dc, dc_box, tray, yakir, cover, support, bolt, tie, label |
| 05 | חשמל AC, לוחות והארקה | AC, הארקה, לוחות | cable ac, breaker*, cabinet*, meter*, cable pe, lug, pe_box, sign |
| 06 | עבודות התקנה | — | labour* |
| 07 | בדיקות, אישורים והפעלה | — | service(inspector, iec_followup, as_made, training), fee(iec_*) |
| 08 | שונות ואופציות | בטיחות, תקשורת (BESS) | service(insurance_cw, om_year, extended_warranty), battery + ערכת BESS, אופציות |

`QuoteSection.code` = `08.CC`; `QuoteLine.line_no` = `08.CC.NNNN`. ה-`default_boq_section` של כל Product וה-`boq_section_code` של כל רכיב ערכה קובעים את הפרק; ברק יכול להעביר שורה בין פרקים ב-draft.

---

## 3. גיליון `סיכום`

RTL, `ySplit: 0`, רוחב עמודות: A 14, B 46, C 16, D 16.

| שורה | תוכן | הערות |
|---|---|---|
| 1–2 | לוגו (תמונה PNG מוטמעת), "כתב כמויות — {{project.name}}" | `mergeCells('B1:D2')`, גופן 16 מודגש |
| 3 | לקוח: {{customer.name}} · אתר: {{site.address}} | |
| 4 | הצעה <bdi>{{quote_number}}</bdi> · גרסה {{version_no}} · תאריך {{issued_at}} · תוקף עד {{valid_until}} | |
| 5 | מערכת: {{kwp}} kWp DC / {{kw_ac}} kW AC · {{module_count}} מודולים · {{roof_type_he}} · פרופיל: {{regulatory_track_he}} | |
| 7 | **פרק** · **שם הפרק** · **סה"כ (₪)** | כותרת טבלה (מילוי, מודגש) |
| 8–15 | `08.01` … `08.08` · שם · `=CH_08_01_TOTAL` … | נוסחה = named range של סיכום הפרק; `result` מה-DocumentModel |
| 17 | סה"כ לפני הנחה | `=SUM(D8:D15)` → `TOTAL_BEFORE_DISCOUNT` |
| 18 | הנחה ({{discount_pct}}%) | `=-ROUND(TOTAL_BEFORE_DISCOUNT*DISCOUNT_PCT,2)` → `DISCOUNT_AMOUNT` (שורה מוסתרת אם 0) |
| 19 | סה"כ לפני מע"מ | `=TOTAL_BEFORE_DISCOUNT+DISCOUNT_AMOUNT` → `TOTAL_BEFORE_VAT` |
| 20 | מע"מ ({{vat_rate_pct}}%) | `=ROUND((TOTAL_BEFORE_VAT-VAT_EXEMPT_BASE)*VAT_RATE,2)` → `VAT_AMOUNT` |
| 21 | **סה"כ כולל מע"מ** | `=TOTAL_BEFORE_VAT+VAT_AMOUNT` → `TOTAL_INCL_VAT` (מודגש, גבול כפול) |
| 23 | מחיר ל-kWp (לפני מע"מ) | `=ROUND(TOTAL_BEFORE_VAT/KWP,0)` → `PRICE_PER_KWP` |
| 24 | אגרות חח"י (passthrough, לפי חשבון בפועל — לא כלול בסה"כ) | `=PASSTHROUGH_TOTAL` — אומדן/`null`; הערה "לאימות" |
| 26–30 | הערות: הצמדה ({{linkage_text}}), תוקף, "סעיפים המסומנים * נתונים לאימות סופי מול הרשויות", "המחירים אינם כוללים …" (exclusions קצר) | טקסט חופשי מה-DocumentModel |

`internal` מוסיף בעמודות F–H: עלות כוללת (`=COST_TOTAL`), רווח ₪ (`=TOTAL_BEFORE_VAT-COST_TOTAL`), רווח % (`=IF(TOTAL_BEFORE_VAT=0,0,(TOTAL_BEFORE_VAT-COST_TOTAL)/TOTAL_BEFORE_VAT)`), וסטטוס אישור.

---

## 4. גיליון `פרמטרים`

| A (שם) | B (ערך) | C (מקור / תוקף) | named range |
|---|---|---|---|
| שיעור מע"מ | `{{vat_rate}}` (placeholder, לאימות) | `valid_from` | `VAT_RATE` |
| הספק DC (kWp) | `{{kwp}}` | Design | `KWP` |
| הנחה כללית | `{{discount_pct}}` | QuoteVersion | `DISCOUNT_PCT` |
| בסיס פטור ממע"מ | `{{vat_exempt_base}}` | fee exempt | `VAT_EXEMPT_BASE` |
| שער USD / EUR (ליום ההצעה) | `{{fx.USD}}` / `{{fx.EUR}}` | boi / ידני | `FX_USD`, `FX_EUR` |
| מטבע | ILS | | |
| (internal) מרווח יעד | `{{target_margin_pct}}` | PricingRule | `TARGET_MARGIN` |

ב-`customer` הגיליון גלוי אך נעול; ערכים פנימיים מושמטים.

---

## 5. גיליונות הפרקים (`08.01` … `08.08`)

### 5.1 עמודות (RTL — A היא הימנית)

| עמודה | כותרת | רוחב | פורמט | view |
|---|---|---|---|---|
| A | מס' סעיף | 12 | `@` (טקסט), יישור מרכז | both |
| B | תיאור | 52 | wrap, יישור ימין | both |
| C | יח' | 8 | DV: רשימה `יח',מ',מ"ר,זוג,סט,קומפ',יום,שעה,נק',ש"ע,kWp,kWh,שנה,יח' (3 מ')` | both |
| D | כמות | 10 | `#,##0.##`, DV ≥ 0 | both (unlocked ב-`fill_form`) |
| E | מחיר יח' (₪) | 14 | `#,##0.00` | both ("כלול" לשורות hide_price) |
| F | סה"כ (₪) | 16 | `#,##0.00`; נוסחה `=ROUND(D{r}*E{r},2)` + `result` | both |
| G | הערה | 30 | `customer_note_he` + "*" אם `verification_flag` | both |
| H | עלות יח' (₪) | 14 | `#,##0.00` | internal |
| I | עלות סה"כ | 14 | `=ROUND(D{r}*H{r},2)` | internal |
| J | רווח ₪ | 12 | `=F{r}-I{r}` | internal |
| K | רווח % | 9 | `=IF(F{r}=0,0,J{r}/F{r})`, `0.0%` | internal |
| L | ספק | 16 | | internal |
| M | מק"ט ספק / SKU | 16 | `<bdi>` לא רלוונטי באקסל; תא `@` | internal |
| N | מקור כמות | 14 | `assembly:ASM-…#7` / `rule:R8` / `bom:E-05` / `manual` | internal |
| O | כלל / בסיס | 18 | `rule_id` או `bom.basis` | internal |
| P | אימות | 8 | `✓` / `לאימות` / `stale` | internal |

### 5.2 מבנה שורות בכל גיליון פרק

| שורה | תוכן |
|---|---|
| 1 | כותרת: "פרק 08.CC — {{section.title_he}}" (merge A1:G1), הצעה/גרסה בצד |
| 2 | כותרות עמודות (מילוי אפור, מודגש, גבול תחתון) — `printTitlesRow = '2:2'`, `ySplit: 2` |
| 3…n | שורות סעיפים ממוינות לפי `line_no`; שורת תת-פרק (אם יש `QuoteSection.children`) — מודגשת, ללא כמות |
| n+1 | ריקה |
| n+2 | "סה"כ פרק 08.CC" · F: `=SUBTOTAL(9,F3:F{n})` → named range `CH_08_CC_TOTAL`; internal: I: `=SUBTOTAL(9,I3:I{n})` → `CH_08_CC_COST` |

כל גיליון: `views:[{rightToLeft:true, state:'frozen', ySplit:2}]`, הדפסה A4 portrait, `fitToPage`, `fitToWidth:1`, `fitToHeight:0`, footer `&R הצעה {{quote_number}} v{{version_no}} &C עמוד &P מתוך &N &L B.E.E`, `horizontalCentered:true`.

### 5.3 סגנונות

- גופן Arial 11 (כותרות 12 מודגש); כותרת גיליון 14.
- שורת סעיף עם `verification_flag` — רקע צהוב בהיר + "*" בעמודה G.
- שורה `optional` (internal) — טקסט אפור, נטוי.
- שורה `source='bom'` (internal) — סימון כחלחל בעמודה N.
- `stale` (internal) — עמודה P ברקע כתום.
- גבולות: דק לכל התאים בטבלה; כפול מעל "סה"כ פרק".

---

## 6. גיליון `פנימי` (internal בלבד)

| בלוק | תוכן |
|---|---|
| A | סיכום כלכלי: עלות, מחיר, רווח ₪/%, מחיר ל-kWp, עלות ל-kWp, הנחה, סטטוס אישור (`pending_approval` + הסף שהופעל) |
| B | פירוט לפי פרק: `CH_08_CC_TOTAL`, `CH_08_CC_COST`, רווח, רווח % |
| C | פירוט לפי ספק: `SUMIF` על עמודת L בכל הגיליונות (נוסחאות + `result`) — בסיס להזמנות רכש (S07) |
| D | דגלים: שורות ללא עלות, מחירים ישנים (`stale`), שורות "לאימות", הפרש BOM↔ערכות (אם `bom_diff` קיים) |
| E | פרמטרי תמחור בפועל: PricingRule ids שהופעלו, DiscountSchedule, FX, `rules_snapshot_id`, `catalog_snapshot_at` |

## 7. גיליון `BOM-eplan` (internal, רק כש-`bom_rev` קיים)

העתק של `bom_csv` (`קטגוריה, פריט, מפרט, יחידה, כמות, בסיס`) + עמודות `product_id` (מיפוי), `line_no` שאליו נכנס, `status: matched|unmatched|replaced_assembly_line`. משמש לביקורת ה-diff בצעד 4 של מנוע התמחור.

## 8. גיליון `מקורות` (internal)

לכל Product בהצעה: מחירון (ספק, `valid_from`, sha256 קצר), `cost_as_of`, דף נתונים (document id, עמוד), `verification`.

## 9. גיליון `_meta` (veryHidden)

| A | B |
|---|---|
| quote_id | uuid |
| quote_version_id | uuid |
| version_no | int |
| view | customer / internal / fill_form |
| template_rev | boq_xlsx/r1 |
| document_model_hash | sha256 |
| exported_at | ISO |
| vat_rate, kwp | (כפילות לבקרה) |

ייבוא חוזר (כתב כמויות שחזר מיועץ): קוראים `_meta`, משווים `document_model_hash` לגרסה ב-DB, ומייצרים diff של עמודות D/E בלבד — לעולם לא round-trip של הקובץ.

---

## 10. Named ranges — רשימה מלאה

`VAT_RATE · KWP · DISCOUNT_PCT · VAT_EXEMPT_BASE · FX_USD · FX_EUR · CH_08_01_TOTAL … CH_08_08_TOTAL · TOTAL_BEFORE_DISCOUNT · DISCOUNT_AMOUNT · TOTAL_BEFORE_VAT · VAT_AMOUNT · TOTAL_INCL_VAT · PRICE_PER_KWP · PASSTHROUGH_TOTAL` ; internal בנוסף: `CH_08_01_COST … CH_08_08_COST · COST_TOTAL · TARGET_MARGIN`.

## 11. בדיקות קבלה (snapshot)

1. קריאה חוזרת ב-ExcelJS: כל `F` = `ROUND(D*E,2)` לפי `result`; `Σ CH_*_TOTAL == TOTAL_BEFORE_DISCOUNT`; `TOTAL_INCL_VAT == QuoteVersion.totals.incl_vat` (decimal, 2 ספרות).
2. `rightToLeft === true` בכל גיליון; `_meta.state === 'veryHidden'`.
3. `customer` view: אין עמודות H–P, אין גיליונות `פנימי`/`BOM-eplan`/`מקורות`, אין מחרוזות "עלות"/"רווח" בשום תא (בדיקת regex).
4. `fill_form`: רק D ו-E לא נעולים.
5. DV: ערך יחידה מחוץ לרשימה נדחה.
6. פתיחה ב-LibreOffice headless → המרה ל-PDF → PNG snapshot של גיליון `סיכום` (בדיקת RTL ויזואלית).

---

## 12. דוגמה עבודה — 50 kWp על גג מסחרי (מבנה בלבד, ללא מחירים)

מקור: דוח 04 §4.6; ממופה לקידוד `08.CC.NNNN`. כמויות = ביטויים/placeholders; `E`/`F` ריקים (`{{…}}`). עמודת "מקור" מציינת מאיפה השורה תגיע במנוע (ערכה / כלל / BOM).

### `סיכום` (תמצית)
| פרק | שם | סה"כ |
|---|---|---|
| 08.01 | מקדמות ותכנון | `=CH_08_01_TOTAL` |
| 08.02 | מודולים ואלקטרוניקה | `=CH_08_02_TOTAL` |
| 08.03 | קונסטרוקציה | `=CH_08_03_TOTAL` |
| 08.04 | חשמל DC ותשתית גג | `=CH_08_04_TOTAL` |
| 08.05 | חשמל AC, לוחות והארקה | `=CH_08_05_TOTAL` |
| 08.06 | עבודות התקנה | `=CH_08_06_TOTAL` |
| 08.07 | בדיקות, אישורים והפעלה | `=CH_08_07_TOTAL` |
| 08.08 | שונות ואופציות | `=CH_08_08_TOTAL` |
| | סה"כ לפני הנחה / הנחה / לפני מע"מ / מע"מ / כולל מע"מ / ₪ ל-kWp | נוסחאות §3 |

### `08.01` מקדמות ותכנון
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.01.0010 | סקר אתר, מדידה וצילום רחפן | קומפ' | 1 | assembly (service survey) |
| 08.01.0020 | תכנון חשמלי מפורט (סט E-00…E-08) + סימולציית תפוקה | קומפ' | 1 | assembly (service design/simulation) |
| 08.01.0030 | אישור קונסטרוקטור לגג + תוכנית עיגון | קומפ' | 1 | rule R18 |
| 08.01.0040 | דיווח פטור מהיתר לרשות הרישוי (תקנה 24) * | קומפ' | 1 | rule R18 (`verification_flag`) |
| 08.01.0050 | טיפול בסקר חיבור / בקשת שילוב מול חח"י | קומפ' | 1 | assembly (service iec_followup) |
| 08.01.0060 | טיפול בהגדלת חיבור (אם נדרש לפי P/0.9) * | קומפ' | `if(kw_ac/0.9 > connection_kva,1,0)` | rule R7 |

### `08.02` מודולים ואלקטרוניקה
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.02.0010 | מודול PV {{module.model}} {{module.p_max_w}} Wp bifacial/TOPCon, כולל אספקה | יח' | `module_count` (≈84–90 ל-50 kWp ב-580–620 Wp) | assembly |
| 08.02.0020 | ממיר מחרוזות 3-פאזי {{inverter.model}} {{inverter.ac_power_kw}} kW כולל תקשורת | יח' | `inverter_count` (1×50 או 2×25) | assembly |
| 08.02.0030 | אופטימייזרים {{optimizer.model}} (אם SolarEdge) | יח' | `if(has_optimizers, module_count, 0)` | assembly |
| 08.02.0040 | מערכת ניטור + חיבור לאינטרנט (דונגל/LAN/4G) | קומפ' | 1 | assembly |

### `08.03` קונסטרוקציה
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.03.0010 | מערכת עיגון לגג {{roof_type_he}} (מסילות, מתלים/ברקטים, תופסני אמצע וקצה) | kWp | `kwp` | assembly (mounting) * לאימות קונסטרוקטור |
| 08.03.0020 | משקולות/בלסט לגג שטוח | יח' | `if(roof_type=='concrete_flat', ballast_count, 0)` | assembly |
| 08.03.0030 | איטום חדירות גג | יח' | `penetrations` | assembly |

### `08.04` חשמל DC ותשתית גג
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.04.0010 | כבל סולארי H1Z2Z2-K 1×6 ממ"ר 1.5kV DC אדום (+) | מ' | `up(dc_m/2,1)` | assembly → S06: bom (DC) |
| 08.04.0020 | כבל סולארי H1Z2Z2-K 1×6 ממ"ר 1.5kV DC שחור (−) כולל מגשרים | מ' | `up(dc_m/2 + jumpers_m,1)` | assembly → bom |
| 08.04.0030 | מחברי MC4 (זוג) | זוג | `string_count*2 + jumpers` | bom |
| 08.04.0040 | קופסת מגיני ברק DC (JB-SPD) IP65 + SPD DC T2 1000V 2P | קומפ' | `if(max_string_len_m>{{spd_dc_threshold_m}}, 1, 0)` | bom (SPD-DC-A) |
| 08.04.0050 | קופסת חיבורי DC (JB-DC) IP65 כולל מהדקי DIN וסופיות | קומפ' | `if(has_jb_dc,1,0)` | bom |
| 08.04.0060 | תעלת רשת מגולוונת {{tray.spec}} כולל מכסה (יח' 3 מ') | יח' (3 מ') | `ceil((dc_tray_m+ac_tray_m+facade_tray_m)/3)` | bom (תעלות) |
| 08.04.0070 | מחברי תעלה (יקיר), נקודות עיגון, ברגי M8 נירוסטה | קומפ' | 1 (פירוט בשורות משנה internal) | bom |
| 08.04.0080 | אזיקוני UV, שילוט "זהירות מתח DC" כל 3 מ', סימון מחרוזות | קומפ' | 1 | bom (עיגון ושילוט) · R19 |

### `08.05` חשמל AC, לוחות והארקה
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.05.0010 | כבל AC N2XY {{ac.cores}}×{{ac.section_mm2}} ממ"ר 0.6/1kV (ממיר → ארון מונה ייצור → לוח) | מ' | `up(ac_m,1)` | assembly → bom (AC) |
| 08.05.0020 | לוח איסוף PV בתו תקן ת"י 61439 כולל מפסק ראשי PV 4P + שלט, מפסקי ממירים, SPD AC T2, פסי צבירה, שילוט | קומפ' | 1 | assembly `ASM-COLLECTOR-2INV-50` · R11, R23 |
| 08.05.0030 | ממסר פחת {{rcd_type}} ({{rating}}) לכל ממיר | יח' | `inverter_count` | rule R13 |
| 08.05.0040 | מפסק/מנתק בטווח ראייה ליד כל ממיר (אם >3 מ' מהלוח) | יח' | `if(distance_inverter_board_m>3, inverter_count, 0)` | rule R12 |
| 08.05.0050 | ארון מונה ייצור IP65 עם חלון, כולל מנתק לפני ואחרי המונה (QS-M1/QS-M2); המונה מסופק ע"י חח"י | קומפ' | 1 | rule R8 (kw_ac>15) |
| 08.05.0060 | הכנה למדידה עקיפה — משני זרם (אם החיבור >3×100A) * | סט | `if(connection_a>100,1,0)` | rule R9 (`verification_flag`) |
| 08.05.0070 | ממסר הגנה/ניתוק (מתח-תדר) לפי דרישת חח"י * | יח' | `{{vf_relay_required}}` | needs_owner_input (V8) |
| 08.05.0080 | הרחבה/שינוי בלוח ראשי קיים, שדה ייצור, שלט "לוח מוזן משני מקורות" | קומפ' | 1 | assembly |
| 08.05.0090 | הארקה: מוליך 16 ממ"ר קונסטרוקציה→פס, 10 ממ"ר מודולים/ממיר, נעלי כבל ונעלי C, קופסת הארקה עם פס נחושת | קומפ' | 1 (פירוט מ"א/יח' internal) | rule R14 → bom (הארקה) |
| 08.05.0100 | שילוט ותיוג לפי ת"י 61439 / הנחיות חח"י / כבאות | קומפ' | 1 | rule R19 |

### `08.06` עבודות התקנה
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.06.0010 | התקנת מודולים על {{roof_type_he}} | יח' | `module_count` | assembly (labour) |
| 08.06.0020 | התקנה וחיווט ממירים, לוחות, ארון מונה | קומפ' | 1 | assembly |
| 08.06.0030 | הנפה / מנוף / במת הרמה | יום | `crane_days` | assembly (`needs_owner_input`) |
| 08.06.0040 | פיגום / קו חיים / בטיחות גובה | קומפ' | 1 | assembly |
| 08.06.0050 | שינוע ופינוי פסולת | קומפ' | 1 | assembly |

### `08.07` בדיקות, אישורים והפעלה
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.07.0010 | בדיקת מתקן ע"י בודק חשמל מוסמך (סוג לפי R17 *) + דוח לפי IEC 62446-1 | קומפ' | 1 | rule R17 (`verification_flag`) |
| 08.07.0020 | אגרות חח"י (בדיקה/חיבור/מונה) — **על חשבון הלקוח לפי חשבון חח"י בפועל** (לא כלול בסה"כ) | קומפ' | 1 | fee passthrough (V2) |
| 08.07.0030 | ליווי בדיקת חח"י, חיבור מונה, רישום לאסדרה והפעלה מסחרית | קומפ' | 1 | assembly (service) |
| 08.07.0040 | תיק מתקן As-Made (שרטוטים, בדיקות IV/IR, אישורים, אחריות) + הדרכה | קומפ' | 1 | assembly (service) |

### `08.08` שונות ואופציות
| סעיף | תיאור | יח' | כמות | מקור |
|---|---|---|---|---|
| 08.08.0010 | ביטוח עבודות קבלניות | קומפ' | 1 | assembly (optional, default_on) |
| 08.08.0020 | אופציה: שירות ותחזוקה שנתי (O&M) — חבילה {{om_tier}} | שנה | 1 | optional |
| 08.08.0030 | אופציה: אגירה {{battery_kwh}} kWh כולל לוח BESS, מפסק ראשי משולט, לחצן חירום ושילוט (הנחיות 2021) | קומפ' | `if(has_battery,1,0)` | rule R20 + ערכת BESS |
| 08.08.0040 | אופציה: ניתוק ברמת המודול (אופטימייזרים / rapid shutdown) | קומפ' | 1 | rule R19 option |

> סימון `*` בעמודת ההערה: "נתון לאימות סופי מול הרשויות / חח"י" — נובע מ-`verification_flag` של הכלל (R7 חישוב kVA לאימות, R9, R17, R18, R19, R23) או מ-`needs_owner_input`.
