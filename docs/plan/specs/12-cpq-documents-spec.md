# 12 — מפרט CPQ ומחולל מסמכים (קטלוג · ערכות · תמחור · הצעה · כתב כמויות · חתימה · חשבוניות)

| | |
|---|---|
| גרסה | 0.1 — טיוטת מפרט (2026-10-10) |
| אבני דרך | M1 (קטלוג ותמחור) · M2 (הצעה, כתב כמויות, ROI, חתימה, Morning) · נגיעות ב-M4 (BOM מ-eplan) ו-M5 (פקודות שינוי) |
| שלבים | S03 (תכנון ראשוני + הצעה) · S04 (מו"מ/חוזה) · S06 (BOM מחליף ערכות) · S07 (PO) · S08 (ChangeOrder) · S11 (חשבון סופי) |
| מקורות | `00-master-plan.md` §5, §6, §7, §9.2 · `research/04-quote-boq-docs.md` · `research/02-regulation-tariffs.md` §6 (R1–R24) · `research/03-pv-design-tools.md` §5–§6 · `eplan/domain/electrical/{pv,bess}/quantities.py` (אוצר המילים של ה-BOM) |
| נספחים | `templates/boq-xlsx-layout.md` · `templates/quote-pdf-sections.md` · `rules/pricing-rules.json` |
| מוסכמות | פרוזה בעברית, מזהים באנגלית. ישויות לפי תוכנית האב §5. כללים R1–R24 לפי דוח 02 §6. **אין במסמך זה אף מחיר, תעריף או סף חוקי** — כל ערך כזה הוא placeholder (`null` / `{{…}}`) עם "לאימות". |

---

## 0. מטרה, גבולות והנחות

**מטרה.** להגדיר במדויק את המודולים `catalog`, `pricing`, `quotes`, `documents` (ואת נקודות המגע שלהם עם `rules`, `submissions`, `procurement`, `comms`) כך שניתן יהיה לקודד אותם ב-M1–M2 בלי החלטות תכנון נוספות, למעט הקלטים שסומנו "לאימות" / `needs_owner_input`.

**עקרונות מחייבים (מתוכנית האב §2):**
1. Postgres הוא מקור האמת; XLSX/PDF/DOCX הם ייצוא בלבד ונגזרים מ-`QuoteVersion` + `Design` + `Rules`.
2. כל מספר נושא מקור ורמת אימות: מחיר ← `PriceListEntry` (קובץ + sha256 + תאריך); כמות ← ערכה/BOM/כלל/ידני; כלל ← `Rule.verification`.
3. `QuoteVersion` שנשלחה — בלתי ניתנת לשינוי (trigger). שינוי = גרסה חדשה או `ChangeOrder`.
4. שער אמון: שום מסמך לא נשלח ללקוח אוטומטית; `dispatch.draft` + `requiresHumanPick: true`.
5. עברית RTL קודם: ExcelJS `rightToLeft`, Chromium + Rubik + `<bdi>`, DOCX עם `w:bidi`.
6. כלל רגולטורי במצב `unverified` רשאי להציע שורה, אך השורה מסומנת "לאימות" בהצעה ובכתב הכמויות עד אישור ברק.

**מה המסמך לא מכסה:** פריסת הגג ותפוקה (שירות CAD, מפרט נפרד), מכונת המצבים (מפרט `projects`), ממשק eplan (מפרט `services/cad`), תבניות Submission (M3).

---

## 1. (a) קטלוג — Product, Supplier, PriceList, ייבוא מחירונים

### 1.1 Product

טבלה `products` (ישות `Product` מ-§5). פריט = כל דבר שיכול להופיע כשורה בהצעה: ציוד, חומר, עבודה, שירות, אגרה.

| שדה | טיפוס | הערות |
|---|---|---|
| `id` | uuid | |
| `sku` | text unique | מק"ט פנימי `BEE-<KIND>-<NNNN>`; מק"טי ספק נשמרים ב-`product_suppliers` |
| `kind` | enum | ראו 1.2 |
| `subkind` | text | תת-סוג לפי kind (ראו 1.2) |
| `name_he` / `name_en` | text | שם קצר לשורת הצעה. `name_he` הוא מה שהלקוח רואה |
| `description_he` | text | תיאור מלא לכתב הכמויות (סעיף) |
| `manufacturer` / `model` | text | כפי שמופיע בדף הנתונים (לחיפוש CEC/PAN/OND) |
| `unit` | enum | `unit · m · m2 · pair · set · komplet · day · hour · point · kwp · kwh · year · piece_3m` — יחידות eplan (`יח'`, `מ'`, `זוג`, `סט`, `יח' (3 מ')`, `קומפלט`) ממופות ל-enum זה |
| `tech` | jsonb | לפי סכימת ה-kind (1.3). ולידציה ב-Zod בשרת ובלקוח |
| `tech_source` | jsonb | `{document_id, page, sha256, extracted_by: human|claude, verified_by, verified_at}` — חובה לכל שדה מספרי שה-eplan צורך |
| `available_il` | enum | `yes · special_order · no · unknown` — כלל משרד #4 (זמינות בישראל) |
| `datasheet_document_id` | uuid | Document (R2) |
| `external_refs` | jsonb | `{cec_key, pan_file_id, ond_file_id, etim_class, manufacturer_url}` |
| `bom_aliases` | text[] | מחרוזות `item`/`spec` כפי ש-eplan מייצר אותן (למשל `"כבל DC 6 ממ\"ר אדום (+)"`, `"H1Z2Z2-K 1X6mm² 1.5kV DC"`) — לזיהוי אוטומטי BOM→Product (ראו 3.1 צעד 4) |
| `default_boq_section` | text | קוד פרק ברירת מחדל בכתב הכמויות (ראו `templates/boq-xlsx-layout.md`) |
| `rule_ids` | text[] | כללים שהפריט מממש (למשל RCD סוג B → `R13`) |
| `is_active` | bool | |
| `verification` | enum | `unverified · summary · office · validated` (כמו `Rule`) |
| `created_by/at`, `updated_by/at` | | |

### 1.2 סוגי מוצר (`kind`) ותתי-סוגים

תוכנית האב §5 מונה `module/inverter/optimizer/battery/breaker/cable/tray/cabinet/labour/service/fee`. כדי לכסות את אוצר ה-BOM של eplan (נעלי כבל, סופיות, אזיקונים, שלטים, תופסנים, מונה, דונגל) מוצע להוסיף שלושה סוגים: `mounting`, `accessory`, `meter` (ראו §10 — חריגה מ-§5, לאישור).

| kind | subkind (ערכים) | יחידת ברירת מחדל | הערות |
|---|---|---|---|
| `module` | `mono · topcon · hjt · perc · bifacial` | unit | |
| `inverter` | `string · hybrid · micro · central` | unit | |
| `optimizer` | `single · dual` | unit | |
| `battery` | `lv · hv · ac_coupled · cabinet_bess` | unit | BESS (`bess/quantities.py`) |
| `breaker` | `mcb · mccb · rcbo · rcd · spd_ac · spd_dc · switch_disconnector · fuse · shunt_trip · emergency_button · contactor · relay_vf` | unit | "משפחת הגנות" — כולל RCD/SPD כנדרש במשימה |
| `meter` | `production · bidirectional · ct_set · meter_cabinet_window` | unit | מונה חח"י עצמו **מסופק ע"י המחלק** (35כ3(י)) — הפריט בקטלוג הוא ארון/הכנה/CT, לא המונה |
| `cable` | `dc_solar · ac_power · pe · comm · rs485 · cat` | m | |
| `tray` | `mesh · ladder · duct · conduit_flex · conduit_rigid` | piece_3m / m | eplan מונה תעלת רשת ב"יח' (3 מ')" |
| `cabinet` | `dc_box · ac_box · collector_board · meter_cabinet · pe_box · comm_board · t4p · enclosure_section` | unit / komplet | R23 (ת"י 61439) |
| `mounting` | `rail · hook_tile · clamp_mid · clamp_end · ballast · tin_roof_bracket · pergola · facade_bracket` | unit | "קונסטרוקציה *" ב-eplan — לאימות מול קונסטרוקטור |
| `accessory` | `lug · lug_c · ferrule · mc4_pair · din_terminal · gland · tie_uv · label · sign · bolt_m8 · yakir · cover · support` | unit / set | אוצר המילים של רשימות הרכש (נעל כבל, נעל קנדית, סופית, יקיר, אנטיגרון) |
| `labour` | `install_modules · install_inverter_boards · cabling · earthing · trays · board_wiring · crane · scaffold · lifeline · transport · waste · commissioning · training` | unit / day / komplet | |
| `service` | `survey · design · simulation · constructor · inspector · iec_followup · permit_exempt_report · as_made · monitoring_setup · om_year · insurance_cw · extended_warranty` | komplet / year | |
| `fee` | `iec_survey · iec_test · iec_meter · iec_connection_upgrade · authority · distributor_historic` | komplet | `passthrough=true` כברירת מחדל ("על חשבון הלקוח לפי חשבון חח"י בפועל") |

### 1.3 סכימת `tech` לפי kind — השדות ש-eplan והכללים צורכים

הסכימות נכתבות כ-Zod ב-`packages/shared-schemas/catalog/tech/*.ts`; כאן בצורת טבלה. `req` = חובה לפני ש-Product נחשב `validated`. כל שדה מספרי מלווה ב-`tech_source`.

**`module`**
| שדה | טיפוס | req | צרכן |
|---|---|---|---|
| `p_max_w` | number | ✓ | kWp, מחרוזות |
| `voc_v`, `isc_a`, `vmp_v`, `imp_a` | number | ✓ | string sizing (eplan), R24 |
| `temp_coeff_voc_pct_c`, `temp_coeff_isc_pct_c`, `temp_coeff_pmax_pct_c` | number | ✓ | Voc_cold / Vmp_hot |
| `max_system_v` | 1000 \| 1500 | ✓ | ולידציה |
| `max_series_fuse_a` | number | ✓ | הגנות DC |
| `noct_c`, `efficiency_pct` | number | | pvlib |
| `cells`, `technology`, `bifacial`, `bifaciality_pct` | | | ROI, pvlib |
| `dims_mm {l,w,h}`, `weight_kg` | | ✓ | פריסה, קונסטרוקטור |
| `class_ii` | bool | ✓ | R15 (§23 מחלקה II) |
| `certs` | string[] | | ת"י/IEC 61215, 61730 |
| `warranty {product_years, performance_years, first_year_pct, annual_degradation_pct}` | | ✓ | טבלת אחריות בהצעה, ROI (degradation) |
| `pan_file_ref` | string | | pvlib `read_panond` |

**`inverter`**
| שדה | טיפוס | req | צרכן |
|---|---|---|---|
| `phases` | 1 \| 3 | ✓ | R7, R11 (2P/4P) |
| `ac_power_kw`, `ac_max_kva`, `ac_max_current_a`, `ac_voltage_v` | number | ✓ | R7 (P/0.9), R9 (3×100A), גודל מפסק |
| `dc_max_power_kw`, `max_dc_voltage_v`, `start_voltage_v` | number | ✓ | string sizing |
| `mppt_count`, `mppt_v_min`, `mppt_v_max`, `max_input_current_per_mppt_a`, `max_isc_per_mppt_a`, `strings_per_mppt` | number | ✓ | string sizing |
| `galvanic_isolation` | bool | ✓ | R13, R15 |
| `iec62109_declared` | bool | ✓ | R13 (§19) |
| `rcd_type_required` | `none · A · B` | ✓ | R13 — לפי הצהרת היצרן; `unknown` ⇒ חסימה |
| `rcmu_integrated`, `iso_monitor_integrated` | bool | ✓ | R15 (§24–25) |
| `fault_current_a` | number | | R12(ב) — Iz ≥ זרם תקלה כשמותר מנתק |
| `export_limit_capable`, `zero_export_requires {ct, meter_model}` | | | R10 |
| `grid_code_cert` | string[] | | V8 — לאימות (הנחיית חח"י הטכנית) |
| `communication` | `dongle_wifi · lan · 4g · rs485` [] | ✓ | eplan מוסיף "דונגל תקשורת" |
| `monitoring_vendor` | `solaredge · huawei · sungrow · solis · growatt · kstar · saj · goodwe · enphase · other` | ✓ | `MonitoringLink` ב-S11 |
| `mounting_kit_included`, `mounting_note_he` | | | eplan basis ("פלטה אחורית + 4 ברגי התפשטות M6×50 כלולים") |
| `ip`, `dims_mm`, `weight_kg`, `efficiency_max_pct`, `euro_efficiency_pct` | | | |
| `warranty {years, extension_options[]}` | | ✓ | טבלת אחריות; ROI (החלפת ממיר שנה N) |

**`optimizer`**: `p_max_w`, `max_input_v`, `max_input_i_a`, `output_v_range`, `inputs` (1/2), `compatible_module_w_range`, `rapid_shutdown` (bool — R19 אופציה), `warranty_years`.

**`battery`**: `usable_kwh`, `nominal_kwh`, `voltage_v`, `max_charge_kw`, `max_discharge_kw`, `chemistry`, `iec62619_cert` (R22, req), `cycles`, `pcs_integrated`, `emergency_stop_input` (R20), `dims_mm`, `weight_kg`, `warranty {years, throughput_kwh}`, `ip`, `outdoor_rated`.

**`breaker` (משפחת הגנות)**: `poles` (1P/2P/3P/4P), `rating_a`, `curve` (B/C/D), `breaking_capacity_ka`, `rcd_type` (A/B/F), `rcd_sensitivity_ma`, `spd_type` (1 / 2 / 1+2), `spd_uc_v`, `spd_side` (ac/dc), `dc_rated_v`, `din_modules`, `mounting` (din/panel), `standard` (IEC 60898/60947/61008/61643), `shunt_trip_coil_v`, `signage_included` (R11 שלט). ל-`emergency_button`: `nc_contacts`.

**`meter`**: `measurement` (direct/ct), `max_current_a`, `ct_ratio`, `cabinet_ip`, `window`, `lockable`, `two_disconnectors_included` (QS-M1/QS-M2), `distributor_spec_ref` (לאימות — מפרט חח"י לארון מונה).

**`cable`**: `type_code` (H1Z2Z2-K, N2XY, NYY, XLPE), `cores`, `section_mm2`, `conductor` (cu/al), `voltage_rating`, `uv_resistant`, `colour`, `iz_a_by_method` (jsonb — טבלת Iz לפי שיטת התקנה; eplan מחשב בעצמו, השדה למעקב), `weight_kg_per_m`, `reel_m`.

**`tray`**: `tray_kind`, `width_mm`, `height_mm`, `material`, `piece_length_m` (3.0 — `TRAY_PIECE_M`), `cover_sku`, `connector_sku` (יקיר), `support_spacing_m` (מ-`spec.cabling.tray_support_spacing_m`), `uv_rated`.

**`cabinet`**: `ip`, `material`, `dims_mm`, `din_modules`, `door_window`, `lock`, `rated_current_a`, `iec61439_tested` (bool, R23 — תו תקן), `iec61439_cert_ref`, `sections_mm[]` (ל-T4P: `[800,600,300,800]`), `outdoor`, `canopy`.

**`mounting`**: `roof_types[]` (`tile · tin · concrete_flat · pergola · facade · ground`), `per_module_qty`, `per_row_qty`, `constructor_required` (bool), `ballast_kg`, `material`.

**`accessory`**: `for_section_mm2`, `size` (M20/M25/M32, M8×20), `material`, `uv_rated`, `label_text_he`, `pack_qty`.

**`labour`**: `basis` (`module · kwp · day · hour · komplet · point`), `roof_types[]`, `crew_size`, `productivity_per_day` (placeholder — `needs_owner_input`), `requires_crane` (bool), `requires_lifeline` (bool), `subcontractor_ok`.

**`service`**: `provider` (`internal · subcontractor · authority`), `rule_ids[]` (למשל קונסטרוקטור → `R18`; בודק → `R17`), `deliverable_document_kind` (קישור ל-`Document.kind`), `lead_time_days`.

**`fee`**: `payee` (`iec · distributor · authority · insurer`), `passthrough` (bool — אם true: מוצג "לפי חשבון בפועל", לא נכלל בסה"כ או נכלל כאומדן לפי הגדרה), `amount_source_he` (למשל "לוח תעריפים חח"י — לאימות V2"), `vat_treatment` (`standard · exempt · unknown`), `rule_ids[]`, `profile_tracks[]`.

### 1.4 Supplier, PriceList, PriceListEntry, ProductSupplier

```
Supplier        (id, name_he, kind: importer|wholesaler|manufacturer|subcontractor|authority,
                 vat_id, contacts jsonb, default_currency, default_discount_pct, default_lead_time_days,
                 portal_url, price_update_channel: email|portal|manual, is_active)
PriceList       (id, supplier_id, name, list_type: cost|sale, audience: null|retail|b2b|subcontractor,
                 currency, valid_from, valid_to, status: draft|pending_approval|approved|superseded|rejected,
                 supersedes_id, source_document_id → Document, sha256, received_at, received_via,
                 imported_at, imported_by, import_method: xlsx|csv|pdf_tables|claude_structured|manual,
                 fx_rate_at_import jsonb {USD, EUR, date, source},
                 stats jsonb {rows, mapped, unmapped, changed, added, removed, max_change_pct},
                 approved_by, approved_at, notes_he)
PriceListEntry  (id, price_list_id, supplier_sku, description_raw_he, unit_raw, pack_qty,
                 list_price numeric(14,4), discount_pct, net_price numeric(14,4), currency,
                 min_qty, block_from, valid_from, valid_to,
                 product_id nullable, mapping: auto|suggested|human, mapping_confidence 0..1,
                 row_ref jsonb {sheet,row} | {page,table,row}, flags text[],
                 prev_entry_id, change_pct)
ProductSupplier (product_id, supplier_id, supplier_sku, preferred bool, lead_time_days, moq, notes)
product_cost_v  VIEW: לכל product — net_price של הספק המועדף מהמחירון approved האחרון, cost_as_of,
                 currency, fx_rate, price_list_id, entry_id, is_stale (cost_as_of < now() - price_stale_days)
```

כללים:
- מחירון **לעולם לא נערך במקום**; עדכון = `PriceList` חדשה עם `supersedes_id`. `approved` אחת לכל ספק+list_type בכל רגע.
- `product_cost_v` הוא מה ש-`price_snapshot` מצלם (3.4). הצעה שנוצרה מול מחירון שהוחלף ממשיכה להצביע על המחירון הישן דרך ה-snapshot.
- מחירי מט"ח (מודולים/ממירים): נשמר המחיר במטבע המקור + `fx_rate` ביום ההצעה (מקור השער: בנק ישראל — `needs_owner_input` ל-API/ידני).
- מחירוני **מכירה** (`list_type=sale`) הם אופציונליים: מחיר מכירה נגזר בד"כ מעלות × מקדם (PricingRule). מחיר חוזי ללקוח/מכרז (`contracted_price`) נשמר כ-`PriceList sale` עם `audience` ו-`customer_id`.

### 1.5 צינור ייבוא מחירונים

```
קובץ (מייל/פורטל/העלאה) ─▶ Document (R2, sha256) ─▶ זיהוי פורמט
   ├─ XLSX/CSV ─▶ ExcelJS read ─▶ זיהוי גיליון+שורת כותרת ─▶ UI מיפוי עמודות ─▶ rows
   ├─ PDF דיגיטלי ─▶ pdfplumber (text strategy) / camelot lattice ─▶ confidence ─▶ rows | fallback ↓
   └─ PDF סרוק / מבולגן / עברי ─▶ Claude document block + structured output (סכימה 1.5.3) ─▶ rows (+ citations)
rows ─▶ נרמול (יחידות, מטבע, אחוזי הנחה, עברית הפוכה) ─▶ התאמת SKU (ProductSupplier → sku; אחרת fuzzy + LLM suggest)
     ─▶ PriceList(draft) + PriceListEntry[] ─▶ diff מול approved הקודם ─▶ מסך אישור ─▶ approved ─▶ product_cost_v מתעדכן
     ─▶ jobs ledger: price_list.import (loop: collect), price_list.approve (requiresHumanPick)
```

**1.5.1 מיפוי עמודות (XLSX/CSV).** ממשק: תצוגה מקדימה של 20 שורות, בחירת גיליון, שורת כותרת, ולכל עמודת יעד (`supplier_sku · description_raw_he · unit_raw · list_price · discount_pct · net_price · currency · pack_qty · min_qty`) בחירת עמודת מקור או נוסחה קצרה (`=list_price*(1-discount_pct/100)`). המיפוי נשמר כ-`supplier.import_profile` (jsonb) לשימוש חוזר; שינוי במבנה הקובץ → התראה "פרופיל לא תואם".

**1.5.2 PDF דיגיטלי.** `pdfplumber.extract_tables(table_settings)` עם אסטרטגיות `lines` ואז `text`; `camelot` lattice כשיש מסגרות. בדיקת כיוון עברית (אם >50% מהמילים מתהפכות מול מילון — היפוך `[::-1]`). ציון confidence לטבלה; מתחת לסף `import_confidence_min` (פרמטר, `needs_owner_input`) → מסלול Claude.

**1.5.3 Claude structured output (סרוקים).** סכימת Zod קשיחה:
```ts
const PriceRow = z.object({
  supplier_sku: z.string().nullable(), description_he: z.string(), unit: z.string().nullable(),
  list_price: z.number().nullable(), discount_pct: z.number().nullable(), net_price: z.number().nullable(),
  currency: z.enum(["ILS","USD","EUR"]).nullable(), page: z.number(), confidence: z.number().min(0).max(1)
});
const PriceListExtract = z.object({ supplier_name: z.string().nullable(), valid_from: z.string().nullable(),
  rows: z.array(PriceRow), control_totals: z.object({ row_count: z.number() }) });
```
סכומי ביקורת: מספר שורות מול ספירת שורות בטקסט; חובה `page` לכל שורה (citations); ריצה ב-Batch API כשאין דחיפות. הפלט הוא **הצעה** — אף שורה לא נכנסת ל-`approved` בלי אדם (Law #1).

**1.5.4 Diff ואישור.** לכל `supplier_sku`: `added · removed · changed(list_price|net_price|unit) · unchanged`. מסך אישור מציג: סיכום (N שונו, מקס' שינוי %), שורות עם שינוי מעל `price_jump_alert_pct` מודגשות, שורות לא ממופות (`product_id=null`) עם הצעת מיפוי. אישור = `approved` + `supersedes`. דחייה = `rejected` + הערה. כל פעולה → `project_events`-דמוי `catalog_events` (append-only).

**1.5.5 התראות staleness.** pg-boss cron יומי: `product_cost_v.is_stale` (סף `price_stale_days`, placeholder) לפריטים פעילים שהופיעו בהצעה ב-90 הימים האחרונים → רשימת "מחירונים ישנים" בדיווח הבוקר; הצעה חדשה שמשתמשת בפריט ישן מקבלת דגל `stale_prices[]` ב-`QuoteVersion.flags` ומוצגת לברק לפני שליחה (לא חוסם, אלא אם `block_on_stale=true` בפרמטרים).

**1.5.6 ניטור מיילים של ספקים.** n8n → Gmail label "מחירון" → `collect.pricelist` job → אותו צינור. (M7; כאן רק נקודת החיבור.)

---

## 2. (b) ערכות (Assemblies)

### 2.1 מודל

```
Assembly          (id, code 'ASM-…', name_he, description_he, version int, status: draft|active|retired,
                   applies_to jsonb {roof_types[], inverter_brands[], phases[], kwp_min, kwp_max,
                                     regulatory_tracks[], has_battery?},
                   inputs_schema jsonb (Zod → JSON Schema: אילו קלטים הערכה דורשת, עם ברירות מחדל),
                   components[] → AssemblyComponent, validations[] (ביטויים שחייבים להיות אמת, אחרת חסימה),
                   created_by, verification, needs_owner_input bool, notes_he)
AssemblyComponent (id, assembly_id, sort, 
                   product_id | product_query jsonb {kind, subkind, filters{…}, pick: 'cheapest'|'preferred'|'exact'},
                   qty_expr text, unit, rounding {mode: ceil|round|floor, step},
                   min_qty, optional bool, option_group text, default_on bool,
                   boq_section_code, line_title_he (override), customer_note_he,
                   source_he (למשל 'eplan quantities.py — ties every 3 m'), needs_owner_input bool)
```

- **`product_query`** במקום `product_id` כשהבחירה תלויה בקלט (ממיר לפי kWp, RCD לפי R13, כבל AC לפי חתך). ה-query נפתר בזמן הרחבת הערכה מול הקטלוג הפעיל ונשמר ב-`price_snapshot.resolved_by`.
- ערכות **מקוננות**: `product_query.kind = 'assembly'` מאפשר "ערכת לוח" בתוך "ערכת מערכת".
- ערכה היא **הידע של ברק** (§6.1): נבנית מראיון/הקלטה → טיוטה ע"י AI → אישור (`verification=office`).

### 2.2 קלטים (AssemblyInputs) — אוצר השמות המשותף

| מזהה | טיפוס | מקור | הערה |
|---|---|---|---|
| `kwp` | number | Design-lite | הספק DC = `module_count × module_p_w / 1000` |
| `kw_ac` | number | Design-lite | Σ `inverter.ac_power_kw` |
| `module_count` | int | פריסה | |
| `module_p_w` | number | Product | |
| `string_count` | int | eplan מצב מהיר | |
| `rows` | int | פריסה | שורות/שולחנות — לנעלי כבל והארקה |
| `modules_per_row[]` | int[] | פריסה | לתופסנים |
| `dc_m` | number | פריסה/Survey | Σ אורכי מחרוזות (מסלול +/−) |
| `dc_tray_m`, `ac_tray_m`, `facade_tray_m` | number | פריסה/Survey | |
| `ac_m` | number | Survey | ממיר → לוח (דרך ארון מונה אם יש) |
| `pe_m` | number | פריסה | PE-S + PE-I (+PE-E = ac_m) |
| `roof_type` | enum | Survey | `tile · tin · concrete_flat · pergola · facade · ground` |
| `roof_height_m`, `eave_h_m` | number | Survey | מנוף / ירידת חזית |
| `phases` | 1 \| 3 | Survey/חשבון חשמל | |
| `connection_a` | number | חשבון חשמל | גודל חיבור (3×63 → 63) |
| `inverter_brand`, `inverter_count`, `inverter_kw` | | Design-lite | |
| `has_optimizers`, `optimizer_inputs` | bool, 1\|2 | Design-lite | |
| `has_battery`, `battery_kwh`, `battery_kw` | | Design-lite | |
| `distance_inverter_board_m` | number | Survey | R12 (≤3 / ≤25) |
| `production_meter` | bool | מ-R8 | מחושב, לא נבחר |
| `regulatory_track` | enum | Project | `residential_le15 · commercial_15_100 · commercial_100_630 · mv_gt630 · bess_add · historic_distributor` |
| `export_limit_kw` | number\|null | Project | R10 |
| `crane_days`, `scaffold` | number, bool | Survey/ברק | `needs_owner_input` כברירת מחדל |
| `device_count`, `sections_mm[]` | | לערכות לוח | |

### 2.3 DSL של ביטויי כמות (`qty_expr`)

- תחביר: אריתמטיקה (`+ - * /`), השוואות, `and/or/not`, `if(cond, a, b)`, פונקציות `ceil, floor, round, up(x, step)` (= `_up` של eplan), `max, min, sum(list), len(list), lookup(table_name, key)`.
- משתנים: כל קלט מ-2.2 + `inputs.*` נוספים שהערכה מצהירה ב-`inputs_schema`.
- מימוש: פרסור ל-AST (jsep או מקביל) + מעריך משלנו; **ללא `eval`**; אותו מודול רץ בשרת וב-PWA (הצעה טיוטה אופליין, דוח 04 §8.3). כל ביטוי נבדק בזמן שמירה מול `inputs_schema` (משתנים לא מוצהרים = שגיאה).
- `lookup` מפנה לטבלאות קטנות ב-`assembly_tables` (למשל `tray_support_spacing_m` לפי סוג גג) — נתונים, לא קוד.
- תוצאה אחרי `rounding` ואחרי `min_qty`; `qty=0` ⇒ השורה לא נוצרת (כמו `add()` ב-eplan).

### 2.4 דוגמה A — `ASM-RES-TILE-SE` · מערכת ביתית על גג רעפים, SolarEdge (ל-kWp)

`applies_to: {roof_types:[tile], inverter_brands:[solaredge], phases:[1,3], kwp_max: 15 (לאימות מול R2), regulatory_tracks:[residential_le15]}` · קלטים נדרשים: `module_count, module_p_w, string_count, rows, modules_per_row, dc_m, dc_tray_m, ac_tray_m, ac_m, pe_m, roof_height_m, phases, distance_inverter_board_m`.

| # | פריט (product / query) | יחידה | `qty_expr` | פרק BOQ | הערה / מקור |
|---|---|---|---|---|---|
| 1 | `module` — product_id נבחר בהצעה | יח' | `module_count` | 02 | |
| 2 | `optimizer` — query `{kind:optimizer, manufacturer:'SolarEdge', inputs: optimizer_inputs}` | יח' | `if(optimizer_inputs==2, ceil(module_count/2), module_count)` | 02 | SolarEdge: אופטימייזר לכל מודול (כלל בחירה) |
| 3 | `inverter` — query `{kind:inverter, manufacturer:'SolarEdge', phases, ac_power_kw ≥ kwp/ {{dc_ac_ratio_max}} }` pick preferred | יח' | `inverter_count` | 02 | `dc_ac_ratio_max` — `needs_owner_input` |
| 4 | `inverter.communication` דונגל/LAN — query `{kind:accessory, subkind:comm}` | יח' | `if(inverter.needs_dongle, inverter_count, 0)` | 02 | eplan "דונגל תקשורת" |
| 5 | `mounting hook_tile` | יח' | `ceil(module_count * {{hooks_per_module}})` | 03 | `needs_owner_input`, לאימות קונסטרוקטור |
| 6 | `mounting rail` (מ') | מ' | `up(sum(modules_per_row) * module_w_m * 2, 0.1)` | 03 | 2 מסילות לשורה |
| 7 | `mounting clamp_mid` | יח' | `sum(2*(modules_per_row-1))` | 03 | eplan `mids` |
| 8 | `mounting clamp_end` | יח' | `4*rows` | 03 | eplan `ends` |
| 9 | `cable dc_solar 6mm² אדום` | מ' | `up(dc_m/2, 1)` | 04 | S03 אומדן; S06 מוחלף ב-BOM מדויק |
| 10 | `cable dc_solar 6mm² שחור` | מ' | `up(dc_m/2 + jumpers_m, 1)` | 04 | `jumpers_m` אופציונלי, ברירת מחדל 0 |
| 11 | `accessory mc4_pair` | זוג | `string_count*2` | 04 | eplan: `n_str*2 + jumpers` |
| 12 | `breaker spd_dc` + `cabinet dc_box` | יח' | `if(max_string_len_m > {{spd_dc_threshold_m}}, string_count, 0)` ; box `if(qty>0,1,0)` | 04 | eplan: SPD-DC "מחרוזות > 10 מ'" — הסף ככלל משרד, לאימות |
| 13 | `tray mesh` (3 מ') + `cover` | יח' (3 מ') | `ceil((dc_tray_m+ac_tray_m+facade_tray_m)/3)` | 04 | `TRAY_PIECE_M` |
| 14 | `accessory yakir` | יח' | `pieces*2 + bends*2` | 04 | `bends` קלט אופציונלי |
| 15 | `accessory support` (תפס למסילה — גג משופע) | יח' | `ceil((dc_tray_m+ac_tray_m)/lookup('tray_support_spacing_m', roof_type)) + tray_runs` | 04 | |
| 16 | `accessory bolt_m8` | יח' | `pieces*2 + supports*2` | 04 | |
| 17 | `accessory tie_uv` | יח' | `2*ceil(dc_m/3) + ceil(ac_m/3) + ceil(pe_m/3)` | 04 | `tie_spacing_m=3` |
| 18 | `accessory label 'זהירות מתח DC'` | יח' | `ceil(dc_tray_m/3)` | 04 | R19 |
| 19 | `cable ac_power` — query `{kind:cable, subkind:ac_power, cores: if(phases==3,5,3), section_mm2: lookup('ac_section', kw_ac, ac_m)}` | מ' | `up(ac_m,1)` | 05 | S06: eplan קובע חתך |
| 20 | `cabinet ac_box` (JB-AC) | יח' | `1` | 05 | אם הגנות ליד הממיר |
| 21 | `breaker mcb/rcbo Q-INV` — query לפי `kw_ac, phases` | יח' | `1` | 05 | eplan Q-INV |
| 22 | `breaker rcd` — query `{rcd_type: inverter.rcd_type_required}` | יח' | `if(inverter.rcd_type_required=='none',0,1)` | 05 | **R13** |
| 23 | `breaker spd_ac T2` | יח' | `1` | 05 | |
| 24 | `breaker switch_disconnector` ראשי PV + שלט | יח' | `1` | 05 | **R11** (§7) |
| 25 | `breaker` מפסק/מנתק ליד ממיר — query לפי R12 | יח' | `if(distance_inverter_board_m<=3,0,1)` | 05 | **R12** |
| 26 | `accessory sign 'לוח מוזן משני מקורות'` | יח' | `1` | 05 | eplan |
| 27 | `cable pe 10mm²` (מודול→קונסטרוקציה, ממיר) | מ' | `up(rows*{{pe_per_row_m}} + 3, 1)` | 05 | **R14** §17(ד),(ז) |
| 28 | `cable pe 16mm²` (קונסטרוקציה→פס) | מ' | `up(pe_m,1)` | 05 | **R14** §17(ה) |
| 29 | `accessory lug 16` / `lug_c 16` | יח' | `rows+8` / `rows+2` | 05 | eplan |
| 30 | `cabinet pe_box` (JB-PE, פס 30×5) | יח' | `1` | 05 | |
| 31 | `labour install_modules` (רעפים) | יח' | `module_count` | 06 | מחיר לפי מודול × סוג גג — placeholder |
| 32 | `labour install_inverter_boards` | קומפ' | `1` | 06 | |
| 33 | `labour crane` | יום | `if(roof_height_m > {{crane_height_threshold_m}}, crane_days, 0)` | 06 | `needs_owner_input` |
| 34 | `labour lifeline` | קומפ' | `1` | 06 | בטיחות גובה — תמיד בגג משופע |
| 35 | `labour transport` + `waste` | קומפ' | `1` | 06 | |
| 36 | `service design` | קומפ' | `1` | 01 | |
| 37 | `service constructor` | קומפ' | `if(kwp <= 700, 1, 1)` | 01 | **R18** — תמיד (דיווח פטור/היתר) |
| 38 | `service permit_exempt_report` | קומפ' | `if(kwp<=700,1,0)` | 01 | **R18** |
| 39 | `service iec_followup` | קומפ' | `1` | 07 | |
| 40 | `service inspector` — query לפי R17 | קומפ' | `1` | 07 | **R17** ספי סוג בודק לא אומתו → "לאימות" |
| 41 | `fee iec_test/meter` (passthrough) | קומפ' | `1` | 07 | V2 — סכום לפי חשבון חח"י |
| 42 | `service as_made` + `monitoring_setup` + `training` | קומפ' | `1` | 07 | |
| 43 | `service insurance_cw` | קומפ' | `1` | 08 | אופציה `option_group: 'insurance'` |

### 2.5 דוגמה B — `ASM-COLLECTOR-2INV-50` · לוח איסוף ל-2 ממירים × 25 kW (50 kW)

`applies_to: {phases:[3], kwp_min: 30, kwp_max: 100 (לאימות), inverter_count: 2}` · קלטים: `inverter_count=2, inverter_kw=25, kw_ac=50, connection_a, production_meter (R8 ⇒ true), measurement (R9), has_fire_panel`.

| # | פריט | יחידה | `qty_expr` | פרק | הערה |
|---|---|---|---|---|---|
| 1 | `cabinet collector_board` — query `{iec61439_tested:true, rated_current_a ≥ up(kw_ac*1000/(1.732*400)/0.8, 1)}` | קומפ' | `1` | 05 | **R23** ת"י 61439 (תו תקן) |
| 2 | `breaker mccb/mcb 4P` ראשי לוח PV (Q-PV) + שלט אדום | יח' | `1` | 05 | **R11**; דירוג לפי eplan |
| 3 | `breaker shunt_trip` + `emergency_button` + מגע למרכזת אש | יח' | `if(has_fire_panel,1,0)` | 05 | פרקטיקת משרד (Y6/SH) — **לא אסמכתה רגולטורית**, R19 חלקי |
| 4 | `breaker mcb/mccb` יציאה לכל ממיר (Q-INV1..n) | יח' | `inverter_count` | 05 | R12 — אם הלוח ≤3 מ' מהממירים; אחרת מפסק/מנתק נוסף ליד כל ממיר (`if(distance>3, inverter_count, 0)`) |
| 5 | `breaker rcd` לכל ממיר — type לפי R13 | יח' | `if(inverter.rcd_type_required=='none',0,inverter_count)` | 05 | **R13** |
| 6 | `breaker spd_ac T2 (3P+N)` | יח' | `1` | 05 | |
| 7 | `breaker relay_vf` (ממסר מתח/תדר) | יח' | `{{vf_relay_required ? 1 : 0}}` | 05 | V8 — דרישת חח"י לא אומתה → `needs_owner_input` |
| 8 | `meter meter_cabinet_window` + `QS-M1`, `QS-M2` | יח' | `1`, `2` | 05 | **R8** (>15 kW): ארון מונה ייצור + מנתק לפני/אחרי |
| 9 | `meter ct_set` + הכנה למדידה עקיפה | סט | `if(connection_a > 100, 1, 0)` | 05 | **R9** — הנחיית חח"י לא אומתה |
| 10 | `accessory din_terminal`, פסי צבירה, חיווט פנימי | קומפ' | `1` | 05 | כלול ב"לוח קומפלט" |
| 11 | `accessory lug` לכבלי AC | יח' | `inverter_count*5 + 5` | 05 | eplan: 5 גידים × כניסות |
| 12 | `accessory gland M32/M40` | יח' | `inverter_count + 2` | 05 | |
| 13 | פס הארקה + `cable pe 16mm²` פנימי | קומפ' | `1` | 05 | R14 |
| 14 | `accessory sign` "לוח מוזן משני מקורות" + שילוט מעגלים | סט | `1` | 05 | R19 |
| 15 | `labour board_wiring` (הרכבה, חיווט, בדיקה) | קומפ' | `1` | 06 | |
| 16 | `service` תוכנית לוח + תעודת בדיקה 61439 | קומפ' | `1` | 01 | R23 |

### 2.6 דוגמה C — `ASM-T4P-CABINET` · ארון T4P 800+600+300+800

`applies_to: {}` (ערכה גנרית ללוח מודולרי; נקראת מתוך ערכות לוח) · קלטים: `sections_mm=[800,600,300,800], height_mm, depth_mm, device_count, din_modules_needed, outdoor`.

| # | פריט | יחידה | `qty_expr` | פרק | הערה |
|---|---|---|---|---|---|
| 1 | `cabinet enclosure_section` — query `{subkind:'enclosure_section', width_mm: s, height_mm, depth_mm}` לכל `s in sections_mm` | יח' | `len(sections_mm)` (אחד לכל רוחב) | 05 | 4 תאים: 800, 600, 300, 800 |
| 2 | פנל חיבור בין תאים | יח' | `len(sections_mm)-1` | 05 | |
| 3 | דלת + מנעול לכל תא | יח' | `len(sections_mm)` | 05 | |
| 4 | פלטת הרכבה / מסגרת 19" לכל תא | יח' | `len(sections_mm)` | 05 | |
| 5 | סוקל (plinth) | מ' | `up(sum(sections_mm)/1000, 0.1)` | 05 | |
| 6 | `accessory din_rail` (מ') | מ' | `up(din_modules_needed*0.018*1.3, 0.5)` | 05 | 18 מ"מ למודול + 30% רזרבה (`needs_owner_input`) |
| 7 | פסי צבירה Cu לפי זרם ראשי | סט | `1` | 05 | |
| 8 | פס PE / פס N | יח' | `2` | 05 | |
| 9 | `accessory gland` | יח' | `device_count + 4` | 05 | |
| 10 | שילוט חרוט לכל מכשיר + שלט לוח | יח' | `device_count + 1` | 05 | R19 |
| 11 | תעודת 61439 ללוח | קומפ' | `1` | 05 | **R23** |
| 12 | `labour board_wiring` | שעה | `device_count * {{hours_per_device}}` | 06 | `needs_owner_input` |

> **הערת BOM (S06):** כש-eplan מריץ, ה-BOM שלו (`group/item/spec/unit/qty/basis`) מחליף את שורות הערכות מסוג כמות-מהגיאומטריה (DC, AC, הארקה, תעלות, עיגון ושילוט, קונסטרוקציה*), ואילו שורות labour/service/fee נשארות מהערכה. ראו 3.1 צעד 4.

---

## 3. (c) מנוע התמחור

### 3.1 סדר החישוב

פונקציה דטרמיניסטית `priceQuote(inputs, catalogSnapshot, rulesSnapshot, params) → QuoteVersionDraft`. אותו קוד ב-`server/src/modules/pricing` וב-PWA. כל צעד רושם `trace[]` (מה נוצר, מאיזה כלל/ערכה) שנשמר ב-`QuoteVersion.trace` לתצוגת "למה השורה הזו".

| # | צעד | קלט | פלט | הערות |
|---|---|---|---|---|
| 1 | **קלטים** | Project (track, distributor, connection), Survey, Design-lite (module_count, strings, lengths), בחירות ברק (ממיר, מודול, אופציות) | `AssemblyInputs` מנורמלים | חסר קלט חובה → `HUMAN_INPUT_REQUIRED` (לא ניחוש) |
| 2 | **הרחבת ערכות** | Assemblies שנבחרו (אוטומטית לפי `applies_to`, או ידנית) | `lines[] source='assembly'` עם `qty`, `product_id` (query נפתר) | ערכה מקוננת מורחבת רקורסיבית; ולידציות של הערכה חוסמות |
| 3 | **שורות רגולטוריות אוטומטיות** | `rulesSnapshot` (R7–R15, R18–R20, R23 — §4), inputs | `lines[] source='rule'` + `customer_notes[]` + `verification_flags[]` | כלל `unverified` → שורה מסומנת "לאימות"; כלל ללא ערך סף (`threshold=null`) → חסימה |
| 4 | **דריסת BOM (S06 בלבד)** | `BOM` של eplan (rev) | שורות `source='bom'` מחליפות שורות ערכה באותן קבוצות; דוח הפרש (`bom_diff`) לברק | התאמה BOM→Product: `bom_aliases` מדויק → fuzzy (item+spec) → הצעת AI → ידני. פריט ללא התאמה = שורה `product_id=null` עם `unit_cost=null` → חסימה עד מיפוי |
| 5 | **שורות ידניות** | ברק | `source='manual'` (כולל "הנחה מיוחדת", "זיכוי") | |
| 6 | **פתרון עלות** | `product_cost_v` | לכל שורה: `unit_cost`, `currency`, `fx_rate`, `price_list_id`, `entry_id`, `cost_as_of`, `is_stale` | עלות חסרה → `unit_cost=null` → חסימה (אלא אם `kind=fee passthrough`) |
| 7 | **כללי מחיר (PricingRule)** | `pricing_rules` לפי priority | `unit_price` לפני הנחה; `margin_pct` בפועל | ראו 3.2. אין כלל תואם → `default_margin_pct` מהפרמטרים (placeholder) |
| 8 | **הנחות (DiscountSchedule)** | הנחת שורה/פרק/כללית; מדרגות לפי kWp | `discount_pct`/`discount_amount` לשורה ולסיכום | הנחה מצטברת מחושבת על בסיס `sum(line_total_after_line_discount)` |
| 9 | **סף אישור (ApprovalThreshold)** | הנחה כוללת %, מרווח כולל %, סכום | `status='pending_approval'` + `approval_required_by` | ראו `rules/pricing-rules.json` |
| 10 | **מע"מ** | `vat_rate` (פרמטר עם `valid_from`) | `vat_amount`, `total_incl_vat`; פריטי `fee` עם `vat_treatment=exempt` מחוץ לבסיס | ערך המע"מ **פרמטר** (18% לפי הדוחות — לאימות בכל תחילת שנה) |
| 11 | **עיגול** | `rounding` מהפרמטרים | `ROUND_HALF_UP` לשורה (2 ספרות) → סכומים; עיגול סופי אופציונלי (למשל ל-10 ₪) כשורת "עיגול" מפורשת | decimal.js; אף פעם לא float |
| 12 | **הצמדה ותוקף** | `linkage` (מט"ח / מדד / ללא), `validity_days` | `linkage` jsonb + `valid_until` | טקסט ההצמדה בהצעה נגזר מהפרמטר |
| 13 | **KPI** | | `price_per_kwp_excl_vat`, `margin_total_pct`, `cost_total` | פנימי בלבד |
| 14 | **snapshot** | כל הנ"ל | `QuoteVersion{inputs, lines[]{price_snapshot}, totals, flags, trace, rules_snapshot_id, catalog_snapshot_at}` | נשמר כ-draft |

### 3.2 PricingRule DSL

```jsonc
{
  "id": "PR-…", "name_he": "…", "priority": 100,          // נמוך = קודם
  "scope": { "kind": ["module","inverter"], "subkind": null, "boq_section": null,
             "customer_type": ["private","business"], "regulatory_track": null,
             "kwp_min": null, "kwp_max": null, "supplier_id": null, "product_ids": null },
  "when": "unit_cost > 0 and not is_stale",               // אותו DSL של qty_expr; משתנים: line.*, inputs.*, totals.*
  "action": { "type": "margin_pct", "value": null },       // ראו טבלה
  "stack": false,                                          // false = הכלל הראשון התואם לכל type מנצח; true = מצטבר
  "valid_from": "2026-01-01", "valid_to": null,
  "verification": "unverified", "needs_owner_input": true, "source_he": "ברק — שיחה מתאריך …"
}
```

| `action.type` | משמעות | חישוב |
|---|---|---|
| `margin_pct` | מרווח על העלות | `unit_price = unit_cost / (1 - value/100)` |
| `markup_pct` | תוספת על העלות | `unit_price = unit_cost * (1 + value/100)` |
| `price_per_unit` | מחיר קבוע (מחירון מכירה / חוזי) | `unit_price = value` (או מ-`PriceList sale`) |
| `price_per_kwp` | מחיר לשורת "מערכת" מסוכמת | `line_total = value * kwp` — למצב הצעה מקוצרת |
| `min_margin_pct` | רצפה | אם המרווח המחושב < value → `flags.min_margin_breach` (ואז ApprovalThreshold) |
| `round_unit_price` | עיגול מחיר יחידה | `step` |
| `discount_cap_pct` | תקרת הנחה לשורה/פרק | הנחה מעבר → approval |
| `linkage` | הצמדה | `{currency:'USD', base_rate_source:'boi', threshold_pct}` |
| `passthrough` | ללא מרווח (אגרות) | `unit_price = unit_cost`; מוצג "לפי חשבון בפועל" |
| `hide_price` | שורה ללא מחיר ("כלול") | ללקוח: "כלול"; פנימי: עלות |

כללי הכרעה: מיון לפי `priority`; לכל `action.type` כלל ראשון תואם מנצח אלא אם `stack=true`; שני כללים לא-stack עם אותו priority ותואמים = שגיאת קונפיגורציה (חסימה). `DiscountSchedule` ו-`ApprovalThreshold` הם מבנים נפרדים (ראו `rules/pricing-rules.json`).

### 3.3 Quote ו-QuoteVersion — מחזור חיים ו-immutability

```
Quote        (id, number 'Q-YYYY-NNNN', project_id, customer_id, site_id, current_version_id, status)
QuoteVersion (id, quote_id, version_no, status, created_by, created_at,
              inputs jsonb, assemblies_used[], rules_snapshot_id, catalog_snapshot_at, params_snapshot jsonb,
              totals jsonb, flags jsonb, trace jsonb, linkage jsonb, valid_until,
              immutable_at, sent_at, pdf_document_id, xlsx_document_id, pdf_sha256, xlsx_sha256,
              supersedes_version_id, change_order_id, approval {required, by, at, reason})
QuoteSection (id, version_id, code, title_he, sort, subtotal)
QuoteLine    (id, version_id, section_id, line_no '08.02.0010', sort, source: assembly|rule|bom|manual,
              source_ref {assembly_id, component_id | rule_id | bom_item_hash | user_id},
              product_id, title_he, description_he, unit, qty numeric(14,3),
              unit_cost, unit_price, discount_pct, line_total numeric(14,2),
              customer_note_he, verification_flag bool, optional bool, option_group, selected bool,
              price_snapshot jsonb)
```

מצבי `QuoteVersion.status`: `draft → pending_approval → approved → sent → (viewed) → accepted | rejected | expired | superseded`. `sent` קובע `immutable_at` (ה-PDF/XLSX שנשלחו נשמרים כ-Document עם sha256). `accepted` = אירוע חתימה (§7).

Trigger (סקיצה): `BEFORE UPDATE OR DELETE ON quote_lines/quote_sections` — אם `(SELECT immutable_at FROM quote_versions WHERE id = OLD.version_id) IS NOT NULL` → `RAISE EXCEPTION 'quote_version is immutable'`. על `quote_versions`: אחרי `immutable_at` מותר לעדכן רק `status, sent_at, pdf_document_id, xlsx_document_id, *_sha256, approval` (רשימה לבנה בטריגר).

### 3.4 תוכן `price_snapshot` (לכל QuoteLine)

```jsonc
{
  "product": { "id": "…", "sku": "BEE-INV-0012", "name_he": "…", "kind": "inverter", "tech_hash": "sha256(tech)" },
  "cost": { "unit_cost": null, "currency": "USD", "fx_rate": null, "fx_date": null, "fx_source": "boi|manual",
            "price_list_id": "…", "entry_id": "…", "supplier_id": "…", "supplier_sku": "…", "cost_as_of": "…", "is_stale": false },
  "pricing": { "rule_ids": ["PR-…"], "margin_pct": null, "unit_price": null, "discount_pct": null,
               "discount_schedule_id": null, "rounding": "line_2dp_half_up" },
  "qty": { "expr": "module_count", "inputs_used": { "module_count": 0 }, "resolved_by": "assembly:ASM-…#7 | rule:R8 | bom:E-05 | manual" },
  "regulatory": { "rule_id": "R13", "rule_verification": "office", "rule_valid_from": "…", "note_he": "…" },
  "vat": { "rate": null, "treatment": "standard" }
}
```
ה-snapshot הוא מה שמוכיח "על מה הלקוח חתם" גם אחרי שהמחירון, הכלל או המוצר השתנו.

### 3.5 הפרש בין גרסאות (revision diff)

- **מפתח שורה**: `source + product_id + section.code + (source_ref.component_id | rule_id | bom_item_hash | manual uuid)`.
- תוצאה: `{added[], removed[], changed[]{key, fields:{qty:[a,b], unit_price:[a,b], discount_pct:[a,b], title_he:[a,b]}}, totals_delta{before_vat, vat, incl_vat}, inputs_delta}`.
- משמש: מסך "מה השתנה" ב-UI, עמוד "שינויים מהגרסה הקודמת" ב-PDF (כש-`version_no>1`), ודף 1 של צו שינויים.
- נשמר כ-`quote_version_diffs(version_id, base_version_id, diff jsonb)` לחיסכון בחישוב חוזר.

### 3.6 פקודות שינוי (ChangeOrder)

1. מקור: S08 (שטח — דוח יומי/צ'קליסט מסמן "שינוי"), S06 (BOM שונה מהותית מההצעה החתומה), או לקוח.
2. `ChangeOrder(id, project_id, quote_id, base_version_id (חתומה), new_version_id, reason_he, origin: field|design|customer, delta_total_excl_vat, delta_vat, status: draft|sent|signed|rejected, signed_signature_id, document_id)`.
3. הגרסה החדשה = העתק מלא של הגרסה החתומה + שינויים; רק שורות ה-delta מוצגות במסמך "צו שינויים מס' N להצעה Q-… גרסה v".
4. חתימה באותו flow (§7); אחרי חתימה `quote.current_version_id = new_version_id`; לוח התשלומים (`Invoice`) מתעדכן בשורת "צו שינויים N".
5. ללא חתימה — העבודה לא מתבצעת (חסימה בצ'קליסט S08; `blocked` עם סיבה "ממתין לחתימת צו שינויים").

---

## 4. (d) שורות רגולטוריות אוטומטיות (R7–R15, R18–R20, R23)

מקור הכללים: `rules` (seed מדוח 02 §6). עמודת **אימות** משקפת את סטטוס הדוח; כלל שאינו `office`/`validated` → השורה נושאת `verification_flag=true` ומוצגת ללקוח עם כוכבית "* נתון לאימות סופי מול הרשויות". משתנים: `inputs.*` מ-2.2 + `inverter.*` מ-Product.tech.

| כלל | תנאי (`when`) | שורה/ות שנוצרות (`product_query` / ערכה) | יח' | `qty_expr` | הערה ללקוח (`customer_note_he`) | אימות |
|---|---|---|---|---|---|---|
| **R7** גודל חיבור | `kw_ac / 0.9 > connection_kva` (כאשר `connection_kva = lookup('kva_by_amps', connection_a, phases)`) | (א) `fee iec_connection_upgrade` (passthrough) ; (ב) `service iec_followup` "טיפול בהגדלת חיבור" ; (ג) חלופה: `flags.limit_power=true` — הצעה עם `kw_ac` מוקטן | קומפ' | `1` לכל אחת | "הספק המתקן מחייב הגדלת חיבור החשמל ל-{{required_connection}}; דמי חח"י לפי חשבון בפועל." | `office` (35כ2) — טבלת kVA לפי אמפר: אריתמטיקה; סדרת הגדלים של חח"י לאימות |
| **R8** מונה ייצור | `kw_ac > 15` | `meter meter_cabinet_window` ×1 ; `breaker switch_disconnector` QS-M1, QS-M2 ×2 ; `accessory gland` ×2 ; הערה שהמונה עצמו מסופק ע"י המחלק | יח' | `1`, `2`, `2` | "מעל 15 kW חח"י מתקינה מונה ייצור; הארון וההכנה כלולים; המונה מסופק ע"י חח"י." | `office` (35כ3(י)) |
| **R9** סוג מדידה | `connection_a > 100` (זרם חיבור 3×100A) | `meter ct_set` ×1 ; `cabinet` תא מדידה עקיפה ; `labour board_wiring` תוספת | סט / קומפ' | `1` | "חיבור מעל 3×100A נמדד באמצעות משני זרם (מדידה עקיפה)." | **לא אומת** (הנחיית חח"י) → `verification_flag` |
| **R10** מגבלת הזרמה | `kw_ac > 100 and export_limit_kw != null` | `accessory/meter` ערכת zero-export (CT + מונה חכם לפי `inverter.zero_export_requires`) ; `service` הגדרת EMS/הגבלה | קומפ' | `1` | "המתקן יוגבל להזרמה של עד {{export_limit_kw}} kW לרשת בהתאם לאישור חח"י." | `office` (35כ2(ט)(3)) |
| **R11** מפסק ראשי PV | תמיד (`true`) | `breaker switch_disconnector` / `mccb` ראשי PV, קטבים `if(phases==3,'4P','2P')` ; `accessory sign` "מפסק ראשי של מיתקן פוטו-וולטאי" (לבן על אדום) | יח' | `1`, `1` | "מפסק ראשי למתקן הסולארי עם שילוט תקני, לפי הנחיות מינהל החשמל." | `office` (§7) |
| **R12** מפסק/מנתק במוצא ממיר | `distance_inverter_board_m > 3` | אם `distance_inverter_board_m <= 25 and cable_iz_a >= inverter.fault_current_a` → `breaker switch_disconnector` (3P/4P) ליד הממיר ; אחרת → `breaker mcb/mccb` ליד הממיר (+ `cabinet ac_box`) | יח' | `inverter_count` | "מפסק/מנתק בטווח ראייה מהממיר, לפי §11 להנחיות." | `office` (§11); `cable_iz_a` ידוע רק ב-S06 → ב-S03 ברירת מחדל: מפסק (שמרני) |
| **R13** פחת סוג B | `inverter.rcd_type_required == 'B' or (inverter.galvanic_isolation == false and inverter.iec62109_declared == false)` | `breaker rcd` type B (דירוג לפי Q-INV) ; אחרת אם `rcd_type_required=='A'` → type A ; `'none'` → אין שורה ; `unknown` → **חסימה** | יח' | `inverter_count` | "ממסר פחת מסוג B לממיר ללא הפרדה גלוונית (לפי §19) / מסוג A לפי הצהרת יצרן הממיר." | `office` (§19) |
| **R14** הארקות | תמיד | `cable pe 10mm²` (מודולים→קונסטרוקציה + גוף ממיר) ; `cable pe 16mm²` (קונסטרוקציה→פס) ; `accessory lug`, `lug_c` ; `cabinet pe_box` | מ' / יח' | `up(rows*pe_per_row_m + 3,1)` ; `up(pe_m,1)` ; `rows+8` ; `rows+2` ; `1` | "הארקת מסגרות המודולים והקונסטרוקציה במוליכי נחושת 10/16 ממ"ר לפי §17." | `office` (§17) |
| **R15** צד DC >60V | `string_voc_cold_v > 60` (תמיד במערכות מחרוזת) | ולידציה: `module.class_ii == true` ; `inverter.iso_monitor_integrated` ו-(אם `galvanic_isolation==false`) `inverter.rcmu_integrated` — אם אחד מהם false → שורה `breaker`/`accessory` "משגוח בידוד DC" / "משגוח זרם דלף DC" חיצוני ; אם `unknown` → חסימה | יח' | `inverter_count` | "ציוד DC מחלקה II; בקרת בידוד ודלף DC משולבת בממיר (לפי §23–25)." | `office` (§23–25) |
| **R18** פטור מהיתר | `kwp <= 700 and roof_legal == true and not exceeds_roof` → `service permit_exempt_report` + `service constructor` ; אחרת (`kwp > 700 or ground or exceeds_roof`) → `service` "ליווי היתר בנייה" (`needs_owner_input`) + `constructor` | קומפ' | `1` | "המתקן פטור מהיתר בנייה (תקנה 24) בכפוף לדיווח לרשות הרישוי ואישור קונסטרוקטור, הכלולים בהצעה." / "המתקן טעון היתר בנייה — ליווי ההיתר מתומחר בנפרד." | `summary` (לא אומת מול נוסח התקנה) → `verification_flag` |
| **R19** כבאות — שילוט, מנתקי DC, ניתוק חירום | תמיד: `accessory sign` כניסה למבנה ("מתקן פוטו-וולטאי — מתח גבוה"), `accessory label` DC כל 3 מ' ; `breaker switch_disconnector` DC ליד הממיר (אם לא מובנה) ; אם `building_use in (public, commercial)` → `breaker shunt_trip` + `emergency_button` ; אופציה `optimizer.rapid_shutdown` (`option_group='rapid_shutdown'`, `default_on=false`) | יח' | `1` ; `ceil(dc_tray_m/3)` ; `inverter_count` ; `1` | "שילוט ואמצעי ניתוק לפי דרישות כבאות; ניתוק ברמת המודול (אופטימייזרים) מוצע כאופציה." | **חלקי** → `verification_flag` (ספי תוכנית בטיחות אש וחובת rapid-shutdown — V9) |
| **R20** אגירה — הנחיות 2021 | `has_battery` | `breaker mccb` ראשי אגירה משולט + `accessory sign` "מפסק ראשי של מערכת אגירה" ; `breaker` PCS בטווח ראייה ≤3 מ' ; `emergency_button` משולט "מפסק חירום להפסקת מערכת אגירת אנרגיה" ; ולידציה: `clearance_m >= 0.6` (קלט Survey) ; `battery.iec62619_cert` (R22) ; `battery.emergency_stop_input` | יח' | `1`, `battery_count`, `1` | "מערכת האגירה כוללת מפסק ראשי, מפסק PCS, לחצן חירום ושילוט לפי הנחיות מינהל החשמל לאגירה (2021)." | `office` (הנחיות 24.03.2021) |
| **R23** לוחות — ת"י 61439 | כל שורה `cabinet` עם `subkind in (collector_board, ac_box with ≥N devices, meter_cabinet)` | ולידציה `cabinet.iec61439_tested == true` ; אם false → החלפת ה-query ללוח עם תו תקן ; שורת `service` "תעודת בדיקה ללוח לפי ת"י 61439" | קומפ' | `1` לכל לוח | "לוחות החשמל מיוצרים ונבדקים לפי ת"י 61439 (תו תקן)." | `summary` → `verification_flag` (היקף החובה לפי גודל לוח — לאימות) |

נגזרות נוספות (לא שורות, אבל נובעות מהטבלה): R16 — ולידציה שהחשמלאי החותם מורשה לגודל המפסק הראשי; R17 — בחירת `service inspector` לפי סוג בודק (ספים לא אומתו → שורה "בדיקת בודק מוסמך" גנרית עם דגל); R21/R22 — ולידציות אגירה; R24 — ולידציות eplan.

---

## 5. (e) מודול ROI

### 5.1 קלטים

| קלט | מקור | הערה |
|---|---|---|
| `annual_yield_kwh[]` (שנה 1), `monthly_kwh[12]`, `specific_yield_kwh_per_kwp`, `pr` | שירות CAD (pvlib + PVGIS TMY/horizon) | מצב מהיר ב-S03 (PVGIS בלבד) / מלא ב-S06 |
| `kwp`, `kw_ac` | Design-lite | |
| `capex_excl_vat`, `vat_rate`, `capex_incl_vat` | QuoteVersion.totals | |
| `customer_type` | Customer | `private` (מע"מ לא מתקזז, פטור מס R5–R6) / `business` (מע"מ מתקזז) |
| `regulatory_track`, `tariff_track` | Project | `net_metering` (R1, רק אם `expected_connection_date <= net_metering_sunset`) · `feed_in_full` · `self_consumption_surplus` |
| `annual_consumption_kwh`, `consumption_profile` | חשבון חשמל (S01) / ברירת מחדל לפי סוג | פרופיל שעתי/חודשי או `self_consumption_share` ישיר |
| `self_consumption_share` | מחושב מפרופיל או פרמטר | `needs_owner_input` לברירת מחדל ביתי/עסקי |
| `consumption_tariff_ils_kwh` | פרמטר (R4) | ללא מע"מ; TOU לעסקים |
| `feed_in_tariff_ils_kwh` | פרמטר לפי מדרגה (R2–R3) | לפי `kw_ac` ו-`valid_from` |
| `surplus_tariff_ils_kwh` | פרמטר | לא אומת (21.3 אג' במקור צרכני — **לא לקודד**) |
| `tariff_term_years`, `tariff_indexation` | פרמטרים | לא אומתו |
| `degradation_pct_year`, `first_year_degradation_pct` | Product.tech.warranty (מודול) | ברירת מחדל 0.4–0.55 לפי טכנולוגיה |
| `tariff_escalation_pct` | פרמטר | 1–3%/שנה בעולם; בישראל לפי רשות — `needs_owner_input` |
| `om_cost_pct_capex`, `insurance_ils_year`, `monitoring_ils_year` | פרמטרים | |
| `inverter_replacement {year, cost_ils}` | Product.tech.warranty + פרמטר | שנה 12–15 |
| `discount_rate_pct` | פרמטר | 5–8% |
| `horizon_years` | פרמטר | 25 |
| `tax {exemption_ils, reduced_rate_pct, reduced_cap_ils, books_exemption_ils}` | פרמטרים שנתיים (R5–R6) | ערכי 2024–2025 בדוח; 2026 לא אומת |
| `battery {kwh, round_trip_eff, cycles_year, shift_share}` | Design | אופציונלי |

### 5.2 נוסחאות (שנה `t = 1..horizon_years`)

```
E_t          = annual_yield_kwh × (1 − first_year_degradation_pct/100) × (1 − degradation_pct_year/100)^(t−1)
SC_t         = min(E_t × self_consumption_share, annual_consumption_kwh)      // צריכה עצמית
X_t          = E_t − SC_t                                                    // עודף/הזנה
tariff_c_t   = consumption_tariff × (1 + tariff_escalation_pct/100)^(t−1)
tariff_f_t   = feed_in_tariff × index_t    (index_t לפי tariff_indexation; 1 אם ללא)

savings_t (net_metering)        = min(E_t, annual_consumption_kwh) × tariff_c_t    // קיזוז; מגבלות צבירה — לאימות
savings_t (self_consumption)    = SC_t × tariff_c_t + X_t × surplus_tariff_t
savings_t (feed_in_full)        = E_t × tariff_f_t                                 // כל הייצור נמכר דרך מונה ייצור

vat_factor   = customer_type == 'private' ? (1 + vat_rate) : 1      // לפרטי החיסכון כולל מע"מ; לעסק ללא
gross_t      = savings_t × vat_factor
tax_t        = customer_type == 'private' ? tax_private(income_t = X_t × tariff_f_t) : business_tax(…)   // ראו למטה
opex_t       = capex_excl_vat × om_cost_pct_capex/100 + insurance + monitoring + (t == inverter_replacement.year ? inverter_replacement.cost : 0)
cf_0         = −(customer_type == 'private' ? capex_incl_vat : capex_excl_vat)
cf_t         = gross_t − tax_t − opex_t

NPV          = Σ_{t=0..N} cf_t / (1 + r)^t
IRR          = r* : NPV(r*) = 0           (Newton/bisection; pyxirr בפייתון, ~40 שורות TS)
payback      = שנה ראשונה שבה Σ_{0..t} cf_t ≥ 0 (+ אינטרפולציה לינארית)
discounted_payback = כנ"ל עם cf_t/(1+r)^t
LCOE         = Σ (capex + opex_t)/(1+r)^t ÷ Σ E_t/(1+r)^t
offset_pct   = E_1 / annual_consumption_kwh
bill_before  = annual_consumption_kwh × consumption_tariff × vat_factor
bill_after   = bill_before − gross_1 (+ דמי מונה/חיבור קבועים — לאימות)

tax_private(income):   income ≤ exemption_ils → 0 ;  exemption < income ≤ reduced_cap → (income − exemption) × reduced_rate_pct ;
                       מעבר → "מס שולי — יש להתייעץ עם רו"ח" (לא מחושב; דגל)
```
- ROI נשמר כ-`QuoteVersion.roi` (jsonb: קלטים, פרמטרים עם `valid_from`, סדרות שנתיות, KPI) ומחושב באותו מודול TS כמו התמחור (דטרמיניסטי; snapshot).
- כל פרמטר ב-ROI נושא `source` + `valid_from` + `verification`; בהצעה מופיע נספח "הנחות החישוב" עם הערכים בפועל.

### 5.3 פלטים

`{ kpi: {annual_yield_kwh_y1, specific_yield, pr, savings_y1, payback_years, discounted_payback_years, npv, irr_pct, lcoe, offset_pct, co2_t_year (פרמטר גורם פליטה — לאימות)}, series: [{year, E, SC, X, savings, tax, opex, cf, cum_cf, disc_cf}], bill: {before, after}, assumptions: [{key, value, unit, source, valid_from, verification}] }`

### 5.4 טבלת פרמטרים (ערכים — placeholders)

| פרמטר | ערך | תוקף | מקור | סטטוס |
|---|---|---|---|---|
| `vat_rate` | null | מ-2025-01-01 | דוח 04 §4.3 / 03 §5.2 (18%) | **לאימות** שנתי |
| `net_metering_sunset` | null | | R1 (31.12.2026 בתקציר) | **לאימות** |
| `feed_in_tariff.residential_le15` | null | | R2 | **לאימות** (ערך בתוקף לא ידוע) |
| `feed_in_tariff.commercial_15_100[2025|2026]` | null | | R3 (38.4 / 35.67 אג' בתקציר) | **לאימות** מול ספר התעריפים |
| `feed_in_tariff.commercial_100_630` | null | | R2 | **לאימות** |
| `consumption_tariff.residential` | null | | R4 (54.25 אג' 04/2025 בתקציר) | **לאימות** |
| `consumption_tariff.tou_business` | null | | לוח תעריפים | **לאימות** |
| `surplus_tariff` | null | | דוח 02 §1.3 | **לא לקודד** עד אימות |
| `tariff_term_years`, `tariff_indexation` | null | | | **לאימות** |
| `tax.exemption_ils[year]`, `tax.reduced_rate_pct`, `tax.reduced_cap_ils`, `tax.books_exemption_ils` | null | שנתי | R5–R6 | **לאימות** (2026) |
| `degradation_pct_year` לפי טכנולוגיה | null | | דף נתונים | מהמוצר |
| `tariff_escalation_pct` | null | | | `needs_owner_input` |
| `discount_rate_pct` | null | | | `needs_owner_input` |
| `om_cost_pct_capex`, `insurance_ils_year`, `monitoring_ils_year` | null | | | `needs_owner_input` |
| `inverter_replacement_year`, `inverter_replacement_cost_ils` | null | | | `needs_owner_input` |
| `self_consumption_share.default_private/business` | null | | | `needs_owner_input` |
| `co2_factor_kg_kwh` | null | | | **לאימות** (מקור: רשות החשמל/המשרד להגנ"ס) |

---

## 6. (f) שירות הפקת המסמכים (`services/docgen`)

### 6.1 ארכיטקטורה

```
API (Fastify) ── pg-boss job: document.generate {project_id, kind, source_refs, template_rev?, view}
   └─▶ services/docgen (Node, אותו מונורפו; קונטיינר עם Chromium + LibreOffice + גופנים)
         1. build DocumentModel(kind) ← Project/QuoteVersion/Design/ROI/Rules (read-only, snapshot)  → Zod validate
         2. render:  html → Chromium PDF   |  ExcelJS → XLSX   |  docxtemplater → DOCX → LibreOffice → PDF  |  pypdf merge (Python sidecar)
         3. post:    sha256, page count, thumbnails (pdfium), metadata (title/author/subject = project/quote)
         4. store:   R2 key `projects/{project_id}/{kind}/{rev}/{file}`  (versioning on)
         5. record:  Document {project_id, kind, rev, file_key, sha256, mime, size, pages,
                               generated_from {design_rev, quote_version_id, template_rev, rules_snapshot_id, roi_hash, document_model_hash},
                               view: customer|internal, supersedes_id, created_by (job)}
         6. event:   project_events: document.generated
```

- **תבניות מגורסות**: `templates/<kind>/<rev>/` (HTML + CSS + partials; XLSX layout JSON; DOCX). `template_rev` נרשם ב-`Document.generated_from`. שינוי תבנית = rev חדש; הפקה מחדש של מסמך ישן משתמשת ב-rev המקורי (reproducibility).
- **חוזה נתונים**: לכל `Document.kind` יש `DocumentModel` (Zod → JSON Schema ב-`packages/shared-schemas/documents/*.schema.json`). המחולל מקבל **רק** DocumentModel, לא גישה ל-DB → ניתן לבדיקה ב-snapshot. הסכימה של `quote_proposal` ב-`templates/quote-pdf-sections.md`; של `boq_xlsx` ב-`templates/boq-xlsx-layout.md`.
- **סוגי מסמך (M1–M2)**: `quote_proposal` (PDF), `boq_xlsx` (customer/internal), `boq_csv`, `contract_installation` (DOCX→PDF), `change_order` (PDF), `signature_certificate` (PDF, מצורף), `price_list_import_report` (פנימי), `purchase_order` (S07), `roi_appendix` (חלק מההצעה).
- **אידמפוטנטיות**: מפתח `hash(kind, document_model_hash, template_rev, view)` — אותו קלט = אותו Document (לא מפיקים פעמיים).

### 6.2 כללי Chromium PDF לעברית

1. `<html lang="he" dir="rtl">`; גופן Rubik מוטמע `@font-face` כ-base64 woff2 (גם ב-`headerTemplate`/`footerTemplate`, שאינם רואים CSS חיצוני); `await page.evaluateHandle('document.fonts.ready')` לפני `page.pdf()`.
2. מספרים, מק"טים, טלפונים, ח.פ., מזהי הצעה: `<bdi>` או `<span dir="ltr">`; תאי מספרים בטבלאות `td.num { direction:ltr; unicode-bidi:isolate; text-align:left }` (ב-RTL — "left" הוא הצד הפנימי של העמודה; לאמת ויזואלית ב-snapshot).
3. `@page { size: A4; margin: 25mm 15mm 20mm 15mm }` + `preferCSSPageSize: true`; גובה header/footer ≤ margin.
4. `displayHeaderFooter: true`; footer: `<div dir="rtl" style="font-family:Rubik;font-size:9px;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>הצעה <bdi>{{quote_number}}</bdi> · גרסה <bdi>{{version_no}}</bdi></span><span>עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span></div>`; header: לוגו + שם לקוח + תאריך.
5. טבלאות ארוכות: `thead { display: table-header-group }`, `tr { break-inside: avoid }`, `h2 { break-after: avoid }`; עמוד שער ועמוד חתימה: `break-before: page`.
6. `tagged: true`, `outline: true` (סימניות מכותרות h1/h2), metadata: `title = "הצעת מחיר Q-… v…"`.
7. גרפים: SVG inline (ללא JS בזמן הדפסה; Recharts/d3 מרונדרים לפני `page.pdf()` או SVG סטטי שנבנה בשרת) — עם צבעי מותג כ-tokens ב-`:root`, ניגודיות AA.
8. PDF/A: לא מופק ע"י Chromium; אם נדרש — Ghostscript `-dPDFA=2` **לאימות** ששומר טקסט עברי.
9. בדיקות: snapshot PNG של עמוד 1 ושל עמוד הטבלה (Playwright `toHaveScreenshot`, סף pixelmatch), בדיקת bidi ע"י Claude vision על PNG (שער איכות מדוח 07).

### 6.3 כללי ExcelJS (כתב כמויות)

1. כל גיליון: `ws.views = [{ rightToLeft: true, zoomScale: 100, state: 'frozen', ySplit: <header_rows> }]`.
2. נוסחאות עם ערך מחושב: `cell.value = { formula: 'ROUND(D10*E10,2)', result: 1234.56 }` — ה-`result` מגיע ממנוע התמחור (TS) כדי שתצוגות ללא חישוב (תצוגה מקדימה, Google Sheets, PDF) יראו סכומים; `workbook.calcProperties.fullCalcOnLoad = true`.
3. Named ranges: `workbook.definedNames.add('VAT_RATE', "'פרמטרים'!$B$2")` וכן `KWP`, `DISCOUNT_PCT`, `CH_<code>_TOTAL`, `TOTAL_BEFORE_VAT`, `VAT_AMOUNT`, `TOTAL_INCL_VAT`, `PRICE_PER_KWP`.
4. הגנה: `ws.protect(password?, { selectLockedCells:true, selectUnlockedCells:true })`; תאי `כמות`/`מחיר יח'` לא נעולים רק ב-view `fill_form` (יועץ/קבלן משנה); ב-view `customer` הכל נעול; גיליון `_meta` מוסתר (`state:'veryHidden'`).
5. Data validation: יחידות מרשימה, מספר ≥ 0, אחוז 0–100.
6. מספרי סעיף כטקסט (`numFmt: '@'`); סכומים `'#,##0.00 ₪'`; כמויות `'#,##0.##'`; תאריכים `'dd/mm/yyyy'`.
7. **שתי תצוגות** מאותו DocumentModel: `customer` (ללא עלויות/מרווח/ספק/מקור; שורות `hide_price` מוצגות "כלול") ו-`internal` (כל העמודות + גיליון `פנימי`). אין "מחיקת עמודות" אחרי הפקה — התצוגה נבחרת לפני הכתיבה.
8. גופן Arial 11 (Excel לא מטמיע גופנים); כותרות מודגשות עם רקע; גבולות דקים; רוחבי עמודות קבועים; הדפסה: A4 portrait, `printTitlesRow`, `fitToWidth:1`, footer עם מספר הצעה/גרסה/עמוד.
9. `_meta`: `quote_id, version_id, version_no, document_model_hash, exported_at, view, template_rev` — לזיהוי בייבוא חוזר (כתב כמויות שחזר מיועץ עם שינויים → diff בלבד, לעולם לא round-trip).

### 6.4 מסלול DOCX (הסכם התקנה, מפרט טכני מיוחד)

- תבנית Word אחת לכל מסמך, מעוצבת בעברית (פסקאות עם `w:bidi`, טבלאות `w:bidiVisual`); משתנים `{customer.name}`, לולאות `{#lines}…{/lines}` בשורת טבלה, תנאים `{#has_battery}…{/has_battery}` (angular-expressions).
- docxtemplater 3.71 (ליבה MIT בלבד — ללא מודולים בתשלום; תמונות/HTML לא נדרשים בהסכם).
- המרה: קונטיינר LibreOffice headless (`fonts-noto-core`, Rubik, `fonts-crosextra-carlito`), `soffice --headless --convert-to pdf`; timeout 60 ש'; בדיקת באג justify עברי (דוח 04 §2.1) — תבנית ללא יישור לשני הצדדים.
- נשמרים גם DOCX וגם PDF כ-Documents (DOCX לעריכת עו"ד/לקוח; PDF לחתימה).
- מקור הנתונים להסכם: `QuoteVersion` (חתומה/מאושרת) + `Customer` + `Site` + לוח תשלומים + `contract_terms_rev` (תנאים כלליים מגורסים).

### 6.5 חבילות PDF (pypdf)

- sidecar Python (`services/cad` או קונטיינר docgen עם Python): `PdfWriter.append()` לפי סדר, `add_outline_item` לכל מסמך, דף שער מ-Chromium, page labels, `add_attachment()` ל-DXF/CSV כשנדרש, overlay "טיוטה / לא לביצוע" כשהמסמך אינו `approved`.
- חבילות ב-M2: `quote_pack` (הצעה + נספח ROI + סיכום BOQ + דפי נתונים מקוצרים + דף תעודה אחרי חתימה). חבילות S05/S10/S11 — במפרטים הבאים, אותו מנגנון.

### 6.6 אחסון, Document record, בדיקות

- R2 עם versioning; מפתח דטרמיניסטי; `sha256` נשמר גם ב-R2 metadata; `Document` לעולם לא נמחק (`superseded_by`).
- Presigned URL לפורטל/לינק חתימה: TTL קצר; כל גישה נרשמת (`document_access_log` → `quote_events.viewed`).
- בדיקות: (1) snapshot של DocumentModel JSON לכל fixture; (2) snapshot PNG לעמודי PDF; (3) לקובצי XLSX — קריאה חוזרת ב-ExcelJS ובדיקת נוסחאות/ערכים/named ranges/הגנות; (4) בדיקת סכומים: `totals` ב-XLSX == `QuoteVersion.totals`; (5) בדיקת bidi vision על 3 עמודים מייצגים; (6) בדיקת idempotency (אותו קלט → אותו sha256 למעט metadata זמן, שמנוטרל ב-`creationDate` קבוע).

---

## 7. (g) חתימה אלקטרונית

### 7.1 שלב א' — click-to-accept (M2)

```
ברק: "שלח לחתימה" (dispatch.draft → requiresHumanPick) ─▶ קישור ייחודי /sign/{token} (TTL = valid_until; חד-פעמי לכל גרסה)
לקוח: פותח ─▶ quote_events.viewed ─▶ מציג PDF (presigned) + תקציר + תנאים (T&C rev) ─▶ "קראתי ומאשר" ☑ 
      ─▶ OTP ל-SMS (InforU/019) למספר שב-Customer (לא ניתן לשינוי בדף) ─▶ אימות ─▶ חתימה מצוירת (canvas → PNG) + שם מלא + ת"ז/ח.פ. (4 ספרות אחרונות בלבד — מזעור)
      ─▶ Signature {quote_version_id, document_id, sha256_signed_pdf, otp_phone_masked, otp_verified_at, ip, ua, geo?, drawn_signature_key, tc_rev, signed_at}
      ─▶ דף תעודה (certificate page) מופק ב-Chromium ומצורף ל-PDF (pypdf) ─▶ Document kind=signed_quote (sha256 חדש) 
      ─▶ חותמת שרת של B.E.E (@signpdf PAdES-B-B עם תעודה ארגונית; LTV לא נדרש בשלב א') ─▶ עותק ללקוח במייל (דרך שער האמון: תבנית מאושרת)
      ─▶ project_events: quote.accepted ─▶ S03→S04 ; יצירת Invoice מקדמה (§8)
```
- **Audit events** (append-only, `quote_events`): `sent, link_opened, viewed, otp_sent, otp_verified, otp_failed, tc_accepted, signed, declined, expired, resent, certificate_generated, copy_emailed` — כל אחד עם `actor, ip, ua, at, payload`.
- **דף תעודה**: מספר הצעה/גרסה, sha256 של ה-PDF שנחתם (ושל המקור), שם החותם, טלפון ממוסך, זמן OTP, IP/UA, תמונת החתימה, ציר זמן האירועים, T&C rev, הצהרת "חתימה אלקטרונית לפי חוק חתימה אלקטרונית תשס"א-2001" (נוסח — **לאימות עם עו"ד**, V17).
- ביטול לצרכן (חוק הגנת הצרכן, עסקה מרחוק) — נוסח ותקופה **לאימות עם עו"ד**; מופיע בדף החתימה.
- הגרסה החתומה: `QuoteVersion.status=accepted`, `signature_id`; הצעה שפג תוקפה (`valid_until`) — הקישור מציג "פג תוקף, בקש הצעה מעודכנת" ומייצר משימה לברק.

### 7.2 שלב ב' — Documenso (self-host, AGPL) / ספק מאושר

- מתי: חוזים מעל סף (`contract_value_requires_qualified_signature_ils` — `needs_owner_input`), מכרזים, מסמכים לרשויות, דרישת לקוח.
- אינטגרציה: Documenso API — העלאת PDF, הגדרת שדות (חתימה, תאריך, שם), `recipients`, webhook `document.completed` → הורדת PDF חתום (PAdES) + certificate → Document + Signature (`provider='documenso'`, `provider_ref`).
- חלופה: Comsign/WeSign (חתימה מאושרת) דרך API — פרטי API/מחיר לא אומתו.
- אותם `quote_events` ואותו מודל Signature; רק `provider` משתנה. ה-UI של ברק זהה ("שלח לחתימה" → בחירת מסלול לפי כלל).

---

## 8. (h) חשבוניות ותשלומים

### 8.1 Morning (חשבונית ירוקה)

- OAuth2 client-credentials: `POST https://api.morning.co/idp/v1/oauth/token` (sandbox `api.sandbox.morning.dev`); טוקן ב-cache עם רענון; credentials מוצפנים ב-DB (`integration_credentials`).
- מיפוי: `Customer` ↔ לקוח Morning (`morning_client_id`; שדות חובה: שם, ח.פ./ת"ז, כתובת, מייל, `customer.type`); `Invoice` ↔ מסמך Morning (`morning_document_id`, `document_type`: הצעת מחיר/חשבונית עסקה/חשבונית מס/חשבונית מס-קבלה/קבלה/זיכוי — קודי הסוג **לאימות**).
- **מספר הקצאה**: Morning מבקש משע"מ בעת ההפקה; אנחנו שומרים `Invoice.allocation_number`, `allocation_status`, `allocation_requested_at`. סף החובה (15,000 ₪ לפי הלו"ז המקורי / 5,000 ₪ לפי מקורות 2026 — **סתירה, V18**) = פרמטר `allocation_threshold_ils` עם `valid_from`; מתחת לסף לא מבקשים (אלא אם `always_request_allocation=true`).
- לוח תשלומים: `Invoice(id, project_id, quote_version_id, change_order_id?, milestone_key, label_he, pct_or_amount, amount_excl_vat, vat, amount_incl_vat, due_rule {on: event|days_after, event: contract_signed|equipment_delivered|installation_done|iec_connection|handover}, status: planned|issued|sent|paid|partial|cancelled, morning_document_id, allocation_number, issued_at, paid_at)`. אבני הדרך נגזרות מהמסמך `payment_schedule` של ההצעה ומקושרות לאירועי S04/S07/S08/S10/S11.
- Webhooks של Morning (אם קיימים — **לאימות**): `document.paid` → `Payment`; אחרת polling `POST /documents/search` יומי.

### 8.2 קישורי תשלום (Grow / Cardcom)

- אחרי `quote.accepted`: `Invoice` מקדמה → `Payment link` (Grow `createPaymentProcess` → URL + `processId/processToken`; או Cardcom "Low Profile" v11) עם `sum`, `description`, `customer`, `return_url`, `webhook_url` + מזהה `invoice_id` ב-`custom fields`.
- Webhook (n8n → API; אימות חתימה/טוקן של הספק) → `Payment(id, invoice_id, provider, provider_ref, amount, method: card|bit|apple_pay|transfer|cheque, paid_at, raw jsonb)` → `Invoice.status=paid` → Morning: קבלה/חשבונית מס-קבלה (אם Cardcom מפיק בעצמו — לשמור את המסמך שלו במקום) → `project_events: payment.received` → S04 exit (`חוזה + מקדמה`).
- תשלומים ידניים (העברה/צ'ק): ברק מסמן → `Payment{provider:'manual'}` + העלאת אסמכתא.
- Law #1: קישור התשלום נשלח רק דרך `dispatch.draft`.

### 8.3 מה הצעת מחיר אינה

הצעה ≠ חשבונית: אין מספר הקצאה; אך `Customer.vat_id` ו-`Customer.type` נאספים כבר ב-S01/S03 כי הם חובה בהקצאה.

---

## 9. (i) API — מתאר נקודות קצה (Fastify, prefix `/api/v1`, Zod schemas, RLS)

**Catalog**
```
GET    /catalog/products?kind=&q=&active=            רשימה + חיפוש
POST   /catalog/products                              יצירה (tech לפי kind, Zod)
GET    /catalog/products/:id · PATCH · DELETE(soft)
POST   /catalog/products/:id/tech-source              קישור דף נתונים (document_id, page) + verify
GET    /catalog/products/:id/cost                     product_cost_v
GET    /catalog/suppliers · POST · PATCH /:id
GET    /catalog/price-lists?supplier_id=&status=
POST   /catalog/price-lists/import                    multipart (file) → job price_list.import → {price_list_id, status:'draft'}
GET    /catalog/price-lists/:id                        כולל stats, entries (paged), diff מול approved
POST   /catalog/price-lists/:id/map                    שמירת מיפוי עמודות / מיפוי entry→product
POST   /catalog/price-lists/:id/approve · /reject      (requiresUserInteraction)
GET    /catalog/stale                                  פריטים עם מחיר ישן
GET    /catalog/assemblies · POST · GET/PATCH /:id · POST /:id/activate · POST /:id/preview {inputs} → lines
GET    /catalog/pricing-rules · POST · PATCH /:id ;  GET /catalog/discount-schedules ;  GET /catalog/approval-thresholds
GET    /catalog/params?at=                             vat_rate, rounding, linkage, roi params (עם valid_from)
```
**Quotes**
```
POST   /projects/:projectId/quotes                     יצירת Quote + גרסה 1 (draft) {inputs, assemblies?}
GET    /quotes/:quoteId · GET /quotes/:quoteId/versions
POST   /quotes/:quoteId/versions                       גרסה חדשה (מ-current או base_version_id) + אופציונלי bom_rev
GET    /quote-versions/:id                             כולל sections/lines/totals/flags/trace/roi
PATCH  /quote-versions/:id/lines                       עריכת שורות (רק draft) — bulk
POST   /quote-versions/:id/recalculate                 הרצת priceQuote מחדש (draft)
POST   /quote-versions/:id/apply-bom {bom_rev}          צעד 4 → bom_diff
GET    /quote-versions/:id/diff?base=                   3.5
POST   /quote-versions/:id/submit-approval · /approve · /reject
POST   /quote-versions/:id/documents {kind, view}       job document.generate → Document
POST   /quote-versions/:id/send {channel, template}     dispatch.draft (requiresUserInteraction) → sent, immutable_at
POST   /quote-versions/:id/expire · /supersede
POST   /quotes/:quoteId/change-orders {base_version_id, reason, lines_delta}
GET    /quote-versions/:id/events                       quote_events
```
**Signature (ציבורי, token)**
```
GET    /sign/:token                                     DocumentModel חלקי (תקציר, PDF url, T&C) · רושם viewed
POST   /sign/:token/otp · POST /sign/:token/otp/verify
POST   /sign/:token/accept {drawn_signature_png, full_name, id_last4, tc_accepted:true}
GET    /sign/:token/certificate                          אחרי חתימה
```
**Documents**
```
GET    /projects/:projectId/documents?kind=&rev=
GET    /documents/:id · GET /documents/:id/url (presigned, TTL) · GET /documents/:id/versions
POST   /documents/generate {project_id, kind, source_refs, view}   (כללי; ל-M3+ )
POST   /documents/merge {document_ids[], outline, cover}            pypdf pack
GET    /templates?kind=  · GET /templates/:kind/:rev  · POST /templates/:kind (rev חדש, reviewer)
```
**Invoicing / Payments**
```
GET    /projects/:projectId/invoices · POST (מלוח תשלומים) · POST /invoices/:id/issue (Morning) · POST /invoices/:id/payment-link
POST   /webhooks/morning · POST /webhooks/grow · POST /webhooks/cardcom   (n8n → API, חתימה מאומתת)
POST   /invoices/:id/payments {manual}
```
כללים: כל פעולת כתיבה שמייצרת outbound (`send`, `issue`, `payment-link`) מסומנת `requiresUserInteraction` ועוברת דרך jobs ledger; idempotency-key בכותרת לכל POST; RLS לפי `app.user_id` ותפקיד; `agent` role קורא בלבד למעט drafts.

---

## 10. פערים, החלטות פתוחות ואי-עקביות שנמצאו

1. **מפתחות פרופיל אסדרה**: תוכנית האב §3 משתמשת ב-`residential_le15 · commercial_15_100 · commercial_100_630 · mv_gt630 · bess_add · historic_distributor`, ואילו `01-lifecycle-stages.json` ב-`RES_LE_15 · COM_LE_100 · COM_LE_630 · LARGE_GT_630 · BESS_ADD · HISTORIC_DIST`. מפרט זה משתמש בשמות של §3; יש לאחד.
2. **סוגי Product**: §5 מונה 11 kinds; אוצר ה-BOM של eplan (נעלי כבל, סופיות, אזיקונים, שלטים, תופסנים, מונה/ארון מונה, דונגל) מצריך `mounting`, `accessory`, `meter` — הוספה מוצעת (1.2).
3. **שמות טבלאות**: דוח 04 §4.3 (`catalog_item`, `price_list_entry.audience`, `quote_event`) מול §5 (`Product`, `PriceListEntry`, `project_events`). כאן: שמות §5; `quote_events` נשמר כזרם נפרד (append-only) כי הוא ציבורי-חלקית (אירועי לקוח) ונדרש לדף התעודה — החלטה לאישור.
4. **מספור כתב כמויות**: §6.3 מבקש `08.01.0010` + "פרקי PV", דוח 04 §4.6 מדגים פרקים 01–08 עצמאיים. הפתרון המוצע (`templates/boq-xlsx-layout.md`): קוד `08.CC.NNNN` כאשר CC = פרק PV (01–08 מהדוגמה), עם עמודת `dekel_ref` אופציונלית — **לאימות** האם במפרט הכללי/דקל קיים פרק PV ייעודי (דוח 04 §10 פריטים 2–3).
5. **ערכי אחריות** ב-§6.3 (ממיר 12 SolarEdge / 10 Huawei, מודולים 25/30 + 12–25) מגיעים מתקצירים — במפרט הם נגזרים מ-`Product.tech.warranty` ולא מקבועים.
6. **מע"מ 18%** מופיע כעובדה ב-§6.2; כאן — פרמטר `vat_rate` עם `valid_from` ו"לאימות".
7. **"מעל 50 kW מונה קריאה מרחוק על חשבון הבעלים"** (§6.1) אינו ברשימת R1–R24 — מוצע ככלל חדש `R25` (unverified) עם שורת `fee`/`meter` בהתאם, או להסיר.
8. **R12**: תוכנית האב מציינת "מפסק/מנתק לפי מרחק"; ההנחיה (§11(ב)) מתנה מנתק גם ב-`Iz ≥ זרם תקלה` — תנאי שידוע רק ב-S06. ב-S03 ברירת מחדל שמרנית (מפסק).
9. **Signature** ב-§5 הוא ישות נפרדת ב-Project; ב-§7 ההסכם "חתימה דיגיטלית" ובדוח 04 החתימה היא על ההצעה. כאן: Signature מקושר ל-`Document` (הצעה **או** הסכם **או** צו שינויים) — אותו flow לשלושתם.
10. **lifecycle S04 documents** כולל `invoice_deposit` בעוד §7 מציין חשבונית ב-"S04/S11" — עקבי, אך לוח התשלומים המלא (אבני ביניים S07/S08/S10) חסר ב-JSON; מוצע להוסיף `invoice_milestone` ל-S07/S08/S10.
11. **Agent "Quote drafter"** (§14) צריך גישת read ל-`priceQuote` — הפונקציה הטהורה מאפשרת זאת ללא כתיבה; הטיוטה שלו נשמרת תמיד כ-`QuoteVersion.status=draft` עם `created_by=agent`.
12. `needs_owner_input` חובה מברק לפני M1: ערכות (3 דוגמאות כאן הן שלד), מקדמי מרווח, הנחות וספי אישור (`rules/pricing-rules.json`), ברירות מחדל ROI, ספקים ראשונים ופורמט מחירוניהם (§19 בתוכנית האב).
