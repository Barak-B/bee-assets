# תבנית — הצעת מחיר PDF (`quote_proposal`) · מפרט עמוד-אחר-עמוד + DocumentModel

| | |
|---|---|
| גרסה | 0.1 (2026-10-10) · `template_rev: quote_proposal/r1` |
| מחולל | Chromium (Puppeteer 25) ב-`services/docgen` · HTML/CSS RTL · Rubik מוטמע · קלט: `DocumentModel<quote_proposal>` (Zod) |
| מקורות | `specs/12-cpq-documents-spec.md` §3, §5, §6.2, §7 · `00-master-plan.md` §6.3 · `research/03-pv-design-tools.md` §5.3, §6 · `research/04-quote-boq-docs.md` §2.2, §5 |
| כיול | **לפני קידוד התבנית: 2–3 הצעות קיימות של ברק** (תוכנית האב §19.1) — סדר הסעיפים, הניסוחים והחרגות יכוילו אליהן |
| מוסכמות | אין במסמך זה מחירים/תעריפים/אחריות כקבועים — הכל שדות ב-DocumentModel; ערכי ברירת מחדל = placeholders "לאימות" |

---

## 0. עקרונות ניסוח ועיצוב

1. **קול**: גוף שני יחיד/רבים לפי `customer.type` (פרטי: "המערכת שלכם"; עסקי: "המתקן"); משפטים קצרים; ללא ז'רגון רגולטורי בגוף הטקסט — המונחים (35כ2, §19) רק בנספח ההנחות.
2. **מספרים**: תמיד עם יחידה (kWp, kW, kWh, ₪); אלפים עם פסיק; מחיר ראשי מוצג **לפני מע"מ וכולל מע"מ** זה לצד זה; `<bdi>` לכל מספר/מזהה.
3. **"לאימות"**: כל נתון שנובע מכלל/פרמטר לא-מאומת מקבל כוכבית `*` והערת שוליים אחידה בעמוד ("* נתון לאימות סופי מול הרשויות; אינו משנה את המחיר המוצע אלא אם צוין").
4. **צבעים**: tokens במותג (`--brand`, `--ink`, `--muted`, `--accent-positive`), ניגודיות AA; גרפים ב-SVG inline, ללא JS.
5. **עימוד**: A4, שוליים 25/15/20/15 מ"מ; כותרת עליונה (לוגו · לקוח · תאריך) ותחתונה (הצעה · גרסה · עמוד X מתוך Y) מ-`headerTemplate/footerTemplate`; טבלאות עם `thead` חוזר; שער ועמוד חתימה בעמוד נפרד.
6. **מצבי הצעה**: `draft` — סימן מים "טיוטה"; `sent` — ללא; `superseded/expired` — סימן מים "לא בתוקף" (מופק מחדש מה-Document המקורי + overlay, לא רינדור מחדש).
7. **אורך יעד**: 8–12 עמודים לביתי; עד 16 לעסקי (נספחים בנפרד ב-`quote_pack`).

---

## 1. מפת עמודים

| # | עמוד/קטע | `section_key` | חובה | הערות |
|---|---|---|---|---|
| 1 | שער | `cover` | ✓ | |
| 2 | תקציר — שלושה מספרים | `summary` | ✓ | |
| 3 | המערכת המוצעת | `system` | ✓ | כולל תמונת פריסה |
| 4 | תחזית ייצור | `production` | ✓ | גרף חודשי |
| 5 | ניתוח כלכלי | `economics` | ✓ (ROI) | 2 עמודים בעסקי |
| 6 | מפרט ציוד | `equipment` | ✓ | |
| 7 | היקף העבודה והאישורים | `scope` | ✓ | כולל הערות רגולטוריות אוטומטיות |
| 8 | מחיר ותנאי תשלום | `pricing` | ✓ | |
| 9 | אחריות | `warranty` | ✓ | |
| 10 | לא כלול / הנחות | `exclusions` | ✓ | |
| 11 | תוקף, הצמדה, לוח זמנים, תנאים | `terms` | ✓ | |
| 12 | מה השתנה מהגרסה הקודמת | `changes` | רק `version_no > 1` | |
| 13 | אישור וחתימה | `signature` | ✓ | |
| 14 | נספח א' — הנחות החישוב | `assumptions` | ✓ כש-ROI | |
| 15 | נספח ב' — תמצית כתב כמויות | `boq_summary` | אופציונלי (`options.include_boq_summary`) | |
| 16 | נספח ג' — אודות / רישיונות / פרויקטים | `about` | אופציונלי | תוכן סטטי מגורסה (`about_rev`) |

---

## 2. פירוט העמודים

### 2.1 שער (`cover`)
- רקע: תמונת הגג עם המודולים (`layout_image` — PNG מהפריסה על אורתופוטו; fallback: תמונת סקר / לוגו גדול).
- "הצעת מחיר למערכת סולארית {{kwp}} kWp" · שם הלקוח · כתובת האתר · תאריך · מספר הצעה `<bdi>Q-…</bdi>` · גרסה.
- **מספר כותרת** (`headline`): ברירת מחדל `savings_y1_ils` ("חיסכון שנתי צפוי"), חלופה `payback_years` או `annual_yield_kwh` לפי `options.headline_metric`. כוכבית אם ROI נשען על פרמטר לא-מאומת.
- לוגו B.E.E, פרטי קשר, רישיון חשמלאי (`company.licenses[]` — מספרים ב-`<bdi>`).

### 2.2 תקציר (`summary`)
- שלושה כרטיסים: `kwp` · `annual_yield_kwh` (שנה 1) · `savings_y1_ils` (או `payback_years`).
- פסקה של 3–4 משפטים: מה מותקן, היכן, מה הלקוח מקבל (תכנון → אישורים → התקנה → בדיקה → חיבור → ניטור), ומה הצעד הבא.
- שורת מחיר מקוצרת: "סה"כ {{total_excl_vat}} ₪ + מע"מ = {{total_incl_vat}} ₪" (עסקי: לפני מע"מ מודגש; פרטי: כולל מע"מ מודגש — `options.price_emphasis`).
- "מחיר ל-kWp" — רק כש-`options.show_price_per_kwp`.

### 2.3 המערכת המוצעת (`system`)
- טבלה: הספק DC/AC, מספר מודולים ודגם, ממיר/ים ודגם, אופטימייזרים (אם יש), סוג גג וקונסטרוקציה, אזימוט/שיפוע לכל מערך, מספר מחרוזות, חיבור קיים (פאזות × אמפר) ו"נדרשת הגדלה" אם R7, פרופיל אסדרה בשפה פשוטה, ניטור (ספק).
- תמונת פריסה (`layout_image`) + מקרא; אם אין — "פריסה סופית תיקבע בתכנון המפורט".
- אגירה (אם `has_battery`): קיבולת, הספק, מיקום, הערת בטיחות (R20).

### 2.4 תחזית ייצור (`production`)
- גרף עמודות 12 חודשים (`monthly_kwh[]`), ציר Y ב-kWh, תוויות חודשים בעברית; קו צריכה חודשית (אם ידועה) באותו גרף.
- KPI: ייצור שנתי, `specific_yield` (kWh/kWp), PR, אחוז כיסוי (`offset_pct`).
- פסקת מקור: "התחזית חושבה ב-pvlib על בסיס נתוני קרינה PVGIS (TMY) לאתר, בהתחשב בכיוון, שיפוע, הצללה והפסדי מערכת" + רשימת הפסדים מרכזיים (מ-`production.losses[]`).
- הערה: "ייצור בפועל משתנה בין שנים (±X%) — `production.uncertainty_pct`".

### 2.5 ניתוח כלכלי (`economics`)
- "החשבון שלכם היום / אחרי" — שתי עמודות: `bill.before`, `bill.after` (שנתי), חיסכון שנה 1.
- כרטיסי KPI: החזר השקעה (שנים), NPV, IRR, LCOE (עסקי בלבד — `options.show_lcoe`).
- גרף תזרים מצטבר 25 שנה (קו, נקודת חציית אפס מסומנת = payback); עמודות חיסכון שנתי ברקע (ביתי: רק הקו).
- טבלה שנתית מקוצרת (שנים 1, 2, 3, 5, 10, 15, 20, 25 — `options.years_in_table`): ייצור, חיסכון, הוצאות, תזרים, מצטבר. בעסקי: טבלה מלאה בנספח.
- מסלול אסדרה בשפה פשוטה (`economics.track_he`): "מונה נטו (בכפוף לחיבור עד {{net_metering_sunset}}*)" / "ייצור עצמי ומכירת עודפים בתעריף {{feed_in_tariff}}*" / "הזנה מלאה". תעריפים מוצגים **רק** מה-DocumentModel עם `*` כשהפרמטר לא מאומת.
- לפרטי: משפט על פטור ממס עד {{tax.exemption_ils}}* (R5) ופטור מניהול ספרים עד {{tax.books_exemption_ils}}* (R6) — "אינו ייעוץ מס".
- הפניה לנספח א'.

### 2.6 מפרט ציוד (`equipment`)
- כרטיס לכל פריט ראשי (`equipment[]`): תמונה קטנה (אופציונלי), יצרן/דגם, 4–6 נתונים (`highlights[]` — למודול: Wp, יעילות, טכנולוגיה, אחריות; לממיר: kW, פאזות, MPPT, יעילות, אחריות; לאופטימייזר; לסוללה), תקנים (`certs[]`), קישור/שם דף נתונים (`datasheet_ref`).
- "דפי נתונים מלאים מצורפים ב-`quote_pack`".

### 2.7 היקף העבודה והאישורים (`scope`)
- רשימת "כלול בהצעה" (`scope.included[]`): תכנון חשמלי ע"י מהנדס, אישור קונסטרוקטור, דיווח/היתר (R18), הגשה לחח"י וליווי עד חיבור, אספקה והתקנה, לוחות בתו תקן (R23), הארקה (R14), בדיקת בודק מוסמך (R17), חיבור מונה ורישום לאסדרה, ניטור, הדרכה, תיק מתקן.
- **הערות רגולטוריות** (`scope.regulatory_notes[]` — מה-`customer_note_he` של השורות האוטומטיות §4 במפרט): כל הערה עם `rule_id` (מוסתר), טקסט, ו-`*` אם `verification_flag`.
- ציר זמן משוער (`timeline[]`): חתימה → הגשה לחח"י ({{d1}} י"ע*) → תכנון ורכש → התקנה ({{install_days}} ימים) → בדיקה → חיבור חח"י ({{d2}} י"ע מהתשלום*) — ימי עבודה, "תלוי בחח"י".
- אחריות הלקוח (`customer_obligations[]`): גישה לגג/לוח, חשבון חשמל, תשלום אגרות חח"י, חתימה על טפסי חח"י.

### 2.8 מחיר ותנאי תשלום (`pricing`)
- טבלת פרקים (`pricing.sections[]`): שם הפרק · סה"כ — או שורה אחת "מערכת סולארית {{kwp}} kWp קומפלט" כש-`options.price_mode = 'lump_sum'`. אופציות (`pricing.options[]`) בטבלה נפרדת עם checkbox לסימון בחתימה.
- סיכום: לפני הנחה / הנחה / לפני מע"מ / מע"מ ({{vat_rate_pct}}%) / **כולל מע"מ**; "לא כולל אגרות חח"י — לפי חשבון בפועל (אומדן: {{passthrough_estimate}}*)".
- **לוח תשלומים צמוד לאבני דרך** (`payment_schedule[]`, ברירת מחדל מהפרמטרים — `needs_owner_input`):

| # | אבן דרך (`milestone_key`) | אירוע מערכת | אחוז/סכום |
|---|---|---|---|
| 1 | חתימה על ההסכם | `contract_signed` (S04) | `{{pct_1}}` |
| 2 | תשובת מחלק חיובית / אישור חח"י לבקשת השילוב | `iec_pre_approval` (S05) | `{{pct_2}}` (אופציונלי) |
| 3 | אספקת ציוד לאתר / תחילת התקנה | `equipment_delivered` (S07/S08) | `{{pct_3}}` |
| 4 | סיום התקנה ובדיקת בודק | `installation_done` (S08/S09) | `{{pct_4}}` |
| 5 | חיבור מונה ואישור הפעלה מחח"י | `iec_connection` (S10) | `{{pct_5}}` |
| 6 | מסירה ותיק מתקן | `handover` (S11) | יתרה |

  כל שורה: תיאור, תנאי (אירוע), אחוז, סכום כולל מע"מ (מחושב), אמצעי תשלום (קישור תשלום / העברה). משפט: "התשלומים מותנים בהתקדמות ובקבלת האישורים מחברת החשמל".

### 2.9 אחריות (`warranty`)
טבלה (`warranty.rows[]` — נגזרת מ-`Product.tech.warranty` + פרמטרי חברה):

| רכיב | אחריות מוצר | אחריות ביצועים | הערות |
|---|---|---|---|
| מודולים {{module.model}} | {{module.warranty.product_years}} שנים | {{performance_years}} שנים, ≥{{pct_end}}% בסוף התקופה | לפי כתב אחריות היצרן |
| ממיר {{inverter.model}} | {{inverter.warranty.years}} שנים | — | הרחבה ל-{{ext}} שנים: אופציה |
| אופטימייזרים | {{optimizer.warranty_years}} שנים | — | |
| סוללה | {{battery.warranty.years}} שנים / {{throughput}} | | |
| קונסטרוקציה | {{mounting_warranty_years}} | — | `needs_owner_input` |
| עבודה והתקנה (B.E.E) | {{labour_warranty_years}} שנים | — | `needs_owner_input`; כולל אטימות חדירות: {{sealing_years}} |
| ניטור | לפי ספק הניטור | | |

+ פסקה: מה האחריות מכסה/לא, מי נותן שירות (B.E.E כקבלן; יצרן דרך היבואן), SLA תגובה (אם יש חוזה O&M).

### 2.10 לא כלול / הנחות (`exclusions`)
רשימה (`exclusions[]`, ברירת מחדל מהתבנית, ניתנת לעריכה ב-draft): חיזוקי קונסטרוקציה/שיפוץ גג; הגדלת חיבור ואגרות חח"י (אלא אם כלול בפרק 08.01); שדרוג לוח ראשי מעבר למפורט; מנוף מעבר ל-{{crane_days}} ימים; איטום/בידוד גג כללי; פינוי מכשולים (דודי שמש, אנטנות); היתר בנייה אם נדרש; אגירה (אלא אם הוצעה); חפירות/תשתית מעבר ל-{{m}} מ'; עבודות לילה/סופ"ש; מע"מ בשינוי שיעור.
"הנחות תכנון" (`assumptions_short[]`): גג תקין נושא עומס; גישה למנוף; חיבור אינטרנט באתר; לוח קיים תקין.

### 2.11 תוקף, הצמדה, לוח זמנים, תנאים (`terms`)
- תוקף: עד {{valid_until}} ({{validity_days}} ימים).
- הצמדה (`linkage`): `none` → "המחיר קבוע לתקופת התוקף"; `fx` → "מחירי הציוד צמודים לשער {{currency}} ({{base_rate}} ביום ההצעה); שינוי מעל {{threshold_pct}}% יעודכן בהתאם"; `cpi` → נוסח מדד. נוסח — **לאימות עו"ד**.
- לוח זמנים משוער (הפניה ל-2.7), כוח עליון/תלות בחח"י.
- תנאים כלליים: הפניה ל-`tc_rev` (מצורף ב-`quote_pack`); ביטול עסקה לצרכן — נוסח **לאימות עו"ד** (V17).
- "ההצעה אינה חשבונית; חשבונית תופק לפי לוח התשלומים".

### 2.12 מה השתנה (`changes`) — רק `version_no > 1`
טבלת diff (§3.5 במפרט): שורה · קודם · עכשיו (כמות/מחיר) · סיבה; סיכום הפרש לפני/כולל מע"מ. ב-`change_order` מסמך זה הוא העמוד הראשי.

### 2.13 אישור וחתימה (`signature`)
- "אני/אנו {{customer.name}} מאשר/ים את ההצעה {{quote_number}} גרסה {{version_no}}, כולל האופציות המסומנות: ☐ …" (`pricing.options[]`).
- בלוק חתימה: שם מלא · ת"ז/ח.פ. (4 ספרות אחרונות בלבד אחרי חתימה) · תאריך · חתימה (תמונה מצוירת לאחר חתימה / שטח ריק להדפסה).
- בלוק B.E.E: שם, רישיון, חתימה/חותמת.
- "חתימה דיגיטלית: סרקו / לחצו על הקישור" + QR ל-`/sign/{token}` (רק ב-`sent`).
- אחרי חתימה: `signed_block` ממולא + "דף תעודה מצורף בסוף המסמך" (ה-PDF החתום = מקור + certificate page, sha256 חדש).

### 2.14 נספח א' — הנחות החישוב (`assumptions`)
טבלה (`roi.assumptions[]`): מפתח · ערך · יחידה · מקור · תוקף · סטטוס (`*` אם לא מאומת). כולל: תעריפים, מע"מ, דגרדציה, הסלמה, O&M, החלפת ממיר, שיעור היוון, אופק, חלק צריכה עצמית, מס (פרטי), מקור קרינה.

### 2.15 נספח ב' — תמצית כתב כמויות (`boq_summary`)
טבלה `סעיף · תיאור · יח' · כמות` (ללא מחירי יחידה כש-`options.boq_summary_prices=false`), לפי פרקים `08.CC` — אותו DocumentModel של `boq_xlsx` (view `customer`).

---

## 3. גרפים — מפרט

| גרף | סוג | נתונים | כללים |
|---|---|---|---|
| ייצור חודשי | עמודות (12) + קו צריכה אופציונלי | `production.monthly_kwh[]`, `consumption.monthly_kwh[]?` | תוויות ערכים מעל עמודות כשיש מקום; ציר Y מ-0; צבע מותג; קו צריכה ב-`--muted` |
| תזרים מצטבר | קו + נקודת payback + עמודות חיסכון (עסקי) | `roi.series[].cum_cf`, `.savings` | ציר X שנים 0–25; אזור שלילי בגוון; תווית "החזר השקעה: שנה N" |
| פילוח צריכה/ייצור (אופציונלי) | עוגה/טבעת 2 פלחים | צריכה עצמית vs. הזנה | רק כש-`options.show_self_consumption_split` |

רינדור: SVG שנבנה בשרת (d3-scale/ד3-shape בלבד, ללא DOM) או תבנית SVG; `<title>` ו-`aria-label` לכל גרף; snapshot PNG בבדיקות.

---

## 4. DocumentModel — `quote_proposal` (JSON Schema, draft 2020-12)

Zod → JSON Schema ב-`packages/shared-schemas/documents/quote_proposal.schema.json`. להלן הסכימה (מקוצרת בשדות טקסט חופשי; כל `number` כספי הוא מחרוזת decimal? — **לא**: במודל המסמך מספרים כבר מעוגלים ל-2 ספרות ומועברים כ-`number`; ה-DB נשאר `numeric`).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bee.local/schemas/documents/quote_proposal.schema.json",
  "title": "DocumentModel<quote_proposal>",
  "type": "object",
  "required": ["meta", "company", "customer", "site", "project", "system", "pricing", "payment_schedule", "warranty", "exclusions", "terms", "signature", "options"],
  "additionalProperties": false,
  "properties": {
    "meta": {
      "type": "object", "required": ["document_kind", "template_rev", "quote_id", "quote_version_id", "quote_number", "version_no", "status", "issued_at", "valid_until", "locale", "document_model_hash"],
      "properties": {
        "document_kind": { "const": "quote_proposal" },
        "template_rev": { "type": "string" },
        "quote_id": { "type": "string", "format": "uuid" },
        "quote_version_id": { "type": "string", "format": "uuid" },
        "quote_number": { "type": "string", "pattern": "^Q-[0-9]{4}-[0-9]{4,}$" },
        "version_no": { "type": "integer", "minimum": 1 },
        "status": { "enum": ["draft", "pending_approval", "approved", "sent", "accepted", "superseded", "expired"] },
        "issued_at": { "type": "string", "format": "date" },
        "valid_until": { "type": "string", "format": "date" },
        "locale": { "const": "he-IL" },
        "rules_snapshot_id": { "type": "string" },
        "catalog_snapshot_at": { "type": "string", "format": "date-time" },
        "document_model_hash": { "type": "string" },
        "watermark": { "enum": ["none", "draft", "void"] }
      }
    },
    "company": {
      "type": "object", "required": ["name", "vat_id", "address", "phone", "email", "licenses", "logo_data_uri"],
      "properties": {
        "name": { "type": "string" }, "vat_id": { "type": "string" }, "address": { "type": "string" },
        "phone": { "type": "string" }, "email": { "type": "string", "format": "email" }, "website": { "type": "string" },
        "licenses": { "type": "array", "items": { "type": "object", "required": ["kind", "number"], "properties": { "kind": { "type": "string" }, "number": { "type": "string" }, "holder": { "type": "string" } } } },
        "logo_data_uri": { "type": "string" }, "signatory": { "type": "object", "properties": { "name": { "type": "string" }, "title": { "type": "string" }, "signature_data_uri": { "type": "string" } } },
        "about_rev": { "type": "string" }
      }
    },
    "customer": {
      "type": "object", "required": ["id", "name", "type"],
      "properties": {
        "id": { "type": "string", "format": "uuid" }, "name": { "type": "string" },
        "type": { "enum": ["private", "business", "public", "agricultural"] },
        "vat_id_masked": { "type": "string" }, "contact_name": { "type": "string" },
        "phone_masked": { "type": "string" }, "email": { "type": "string" }
      }
    },
    "site": {
      "type": "object", "required": ["address"],
      "properties": {
        "address": { "type": "string" }, "city": { "type": "string" }, "block_parcel": { "type": "string" },
        "iec_contract_number": { "type": "string" }, "meter_number": { "type": "string" },
        "connection": { "type": "object", "properties": { "phases": { "enum": [1, 3] }, "amps": { "type": "number" }, "kva": { "type": "number" }, "upgrade_required": { "type": "boolean" }, "required_connection_he": { "type": "string" } } },
        "roof_type": { "enum": ["tile", "tin", "concrete_flat", "pergola", "facade", "ground", "mixed"] },
        "roof_type_he": { "type": "string" },
        "distributor": { "type": "string" }
      }
    },
    "project": {
      "type": "object", "required": ["id", "name", "regulatory_track", "regulatory_track_he"],
      "properties": {
        "id": { "type": "string", "format": "uuid" }, "name": { "type": "string" },
        "regulatory_track": { "enum": ["residential_le15", "commercial_15_100", "commercial_100_630", "mv_gt630", "bess_add", "historic_distributor"] },
        "regulatory_track_he": { "type": "string" },
        "stage": { "enum": ["S03", "S04", "S08"] }
      }
    },
    "system": {
      "type": "object", "required": ["kwp", "kw_ac", "module", "inverters", "module_count", "string_count"],
      "properties": {
        "kwp": { "type": "number" }, "kw_ac": { "type": "number" },
        "module_count": { "type": "integer" }, "string_count": { "type": "integer" },
        "module": { "$ref": "#/$defs/equipment_item" },
        "inverters": { "type": "array", "items": { "$ref": "#/$defs/equipment_item" } },
        "optimizer": { "$ref": "#/$defs/equipment_item" },
        "battery": { "$ref": "#/$defs/equipment_item" },
        "arrays": { "type": "array", "items": { "type": "object", "required": ["name", "modules", "azimuth_deg", "tilt_deg"], "properties": { "name": { "type": "string" }, "modules": { "type": "integer" }, "azimuth_deg": { "type": "number" }, "tilt_deg": { "type": "number" }, "mounting_he": { "type": "string" } } } },
        "mounting_he": { "type": "string" },
        "monitoring_vendor": { "type": "string" },
        "export_limit_kw": { "type": ["number", "null"] },
        "layout_image": { "type": "object", "properties": { "data_uri": { "type": "string" }, "caption": { "type": "string" }, "source": { "enum": ["layout", "survey_photo", "none"] } } },
        "has_battery": { "type": "boolean" }
      }
    },
    "production": {
      "type": "object", "required": ["annual_kwh_y1", "monthly_kwh", "specific_yield_kwh_per_kwp", "source_he"],
      "properties": {
        "annual_kwh_y1": { "type": "number" },
        "monthly_kwh": { "type": "array", "minItems": 12, "maxItems": 12, "items": { "type": "number" } },
        "consumption_monthly_kwh": { "type": "array", "minItems": 12, "maxItems": 12, "items": { "type": "number" } },
        "specific_yield_kwh_per_kwp": { "type": "number" }, "pr": { "type": "number" },
        "offset_pct": { "type": "number" }, "uncertainty_pct": { "type": "number" },
        "losses": { "type": "array", "items": { "type": "object", "properties": { "name_he": { "type": "string" }, "pct": { "type": "number" } } } },
        "source_he": { "type": "string" }, "calc_mode": { "enum": ["quick_pvgis", "full_pvlib"] }, "calc_hash": { "type": "string" }
      }
    },
    "roi": {
      "type": "object", "required": ["kpi", "series", "bill", "track", "track_he", "assumptions"],
      "properties": {
        "track": { "enum": ["net_metering", "self_consumption_surplus", "feed_in_full"] },
        "track_he": { "type": "string" },
        "kpi": { "type": "object", "required": ["savings_y1_ils", "payback_years", "npv_ils", "irr_pct"], "properties": {
          "savings_y1_ils": { "type": "number" }, "payback_years": { "type": ["number", "null"] }, "discounted_payback_years": { "type": ["number", "null"] },
          "npv_ils": { "type": "number" }, "irr_pct": { "type": ["number", "null"] }, "lcoe_ils_kwh": { "type": "number" },
          "savings_25y_ils": { "type": "number" }, "co2_t_year": { "type": ["number", "null"] } } },
        "bill": { "type": "object", "properties": { "before_ils_year": { "type": "number" }, "after_ils_year": { "type": "number" } } },
        "series": { "type": "array", "items": { "type": "object", "required": ["year", "energy_kwh", "savings_ils", "opex_ils", "cf_ils", "cum_cf_ils"], "properties": {
          "year": { "type": "integer" }, "energy_kwh": { "type": "number" }, "self_consumed_kwh": { "type": "number" }, "exported_kwh": { "type": "number" },
          "savings_ils": { "type": "number" }, "tax_ils": { "type": "number" }, "opex_ils": { "type": "number" }, "cf_ils": { "type": "number" }, "cum_cf_ils": { "type": "number" }, "disc_cf_ils": { "type": "number" } } } },
        "assumptions": { "type": "array", "items": { "$ref": "#/$defs/assumption" } },
        "has_unverified": { "type": "boolean" }
      }
    },
    "equipment": { "type": "array", "items": { "$ref": "#/$defs/equipment_item" } },
    "scope": {
      "type": "object", "required": ["included", "regulatory_notes", "customer_obligations"],
      "properties": {
        "included": { "type": "array", "items": { "type": "string" } },
        "regulatory_notes": { "type": "array", "items": { "type": "object", "required": ["rule_id", "text_he", "verification_flag"], "properties": { "rule_id": { "type": "string", "pattern": "^R[0-9]{1,2}$" }, "text_he": { "type": "string" }, "verification_flag": { "type": "boolean" } } } },
        "timeline": { "type": "array", "items": { "type": "object", "properties": { "stage": { "type": "string" }, "label_he": { "type": "string" }, "duration_he": { "type": "string" }, "verification_flag": { "type": "boolean" } } } },
        "customer_obligations": { "type": "array", "items": { "type": "string" } }
      }
    },
    "pricing": {
      "type": "object", "required": ["mode", "sections", "totals", "vat_rate", "currency"],
      "properties": {
        "mode": { "enum": ["by_section", "lump_sum", "by_line"] },
        "currency": { "const": "ILS" },
        "sections": { "type": "array", "items": { "type": "object", "required": ["code", "title_he", "total_excl_vat"], "properties": {
          "code": { "type": "string" }, "title_he": { "type": "string" }, "total_excl_vat": { "type": "number" },
          "lines": { "type": "array", "items": { "$ref": "#/$defs/line" } } } } },
        "options": { "type": "array", "items": { "type": "object", "required": ["option_group", "title_he", "total_excl_vat", "selected"], "properties": { "option_group": { "type": "string" }, "title_he": { "type": "string" }, "total_excl_vat": { "type": "number" }, "total_incl_vat": { "type": "number" }, "selected": { "type": "boolean" } } } },
        "totals": { "type": "object", "required": ["before_discount", "discount_amount", "before_vat", "vat_amount", "incl_vat"], "properties": {
          "before_discount": { "type": "number" }, "discount_pct": { "type": "number" }, "discount_amount": { "type": "number" },
          "before_vat": { "type": "number" }, "vat_amount": { "type": "number" }, "incl_vat": { "type": "number" },
          "price_per_kwp_excl_vat": { "type": "number" }, "passthrough_estimate": { "type": ["number", "null"] }, "rounding_line": { "type": "number" } } },
        "vat_rate": { "type": "number" }, "vat_rate_verification": { "enum": ["unverified", "summary", "office", "validated"] },
        "passthrough_note_he": { "type": "string" }
      }
    },
    "payment_schedule": {
      "type": "array", "minItems": 1,
      "items": { "type": "object", "required": ["seq", "milestone_key", "label_he", "condition_he", "pct", "amount_incl_vat"], "properties": {
        "seq": { "type": "integer" },
        "milestone_key": { "enum": ["contract_signed", "iec_pre_approval", "equipment_delivered", "installation_done", "iec_connection", "handover", "custom"] },
        "stage": { "type": "string" }, "label_he": { "type": "string" }, "condition_he": { "type": "string" },
        "pct": { "type": ["number", "null"] }, "amount_excl_vat": { "type": "number" }, "amount_incl_vat": { "type": "number" },
        "method_he": { "type": "string" } } }
    },
    "warranty": {
      "type": "object", "required": ["rows"],
      "properties": {
        "rows": { "type": "array", "items": { "type": "object", "required": ["component_he", "product_years", "performance_he"], "properties": {
          "component_he": { "type": "string" }, "product_years": { "type": ["number", "null"] }, "performance_he": { "type": "string" },
          "notes_he": { "type": "string" }, "source": { "enum": ["product", "company_param", "manual"] }, "needs_owner_input": { "type": "boolean" } } } },
        "service_he": { "type": "string" }
      }
    },
    "exclusions": { "type": "array", "items": { "type": "string" } },
    "assumptions_short": { "type": "array", "items": { "type": "string" } },
    "terms": {
      "type": "object", "required": ["validity_days", "linkage", "tc_rev"],
      "properties": {
        "validity_days": { "type": "integer" },
        "linkage": { "type": "object", "required": ["kind"], "properties": { "kind": { "enum": ["none", "fx", "cpi"] }, "currency": { "enum": ["USD", "EUR"] }, "base_rate": { "type": "number" }, "base_rate_date": { "type": "string", "format": "date" }, "threshold_pct": { "type": "number" }, "text_he": { "type": "string" } } },
        "tc_rev": { "type": "string" }, "cancellation_text_he": { "type": "string" }, "legal_review_pending": { "type": "boolean" }
      }
    },
    "changes": {
      "type": "object",
      "properties": {
        "base_version_no": { "type": "integer" },
        "rows": { "type": "array", "items": { "type": "object", "properties": { "line_no": { "type": "string" }, "title_he": { "type": "string" }, "change": { "enum": ["added", "removed", "changed"] }, "before": { "type": "object" }, "after": { "type": "object" }, "reason_he": { "type": "string" } } } },
        "totals_delta": { "type": "object", "properties": { "before_vat": { "type": "number" }, "incl_vat": { "type": "number" } } }
      }
    },
    "signature": {
      "type": "object", "required": ["mode"],
      "properties": {
        "mode": { "enum": ["print", "click_to_accept", "documenso"] },
        "sign_url": { "type": "string", "format": "uri" }, "qr_data_uri": { "type": "string" },
        "signed": { "type": "object", "properties": { "signer_name": { "type": "string" }, "id_last4": { "type": "string" }, "signed_at": { "type": "string", "format": "date-time" }, "signature_data_uri": { "type": "string" }, "sha256_source": { "type": "string" }, "certificate_attached": { "type": "boolean" } } }
      }
    },
    "boq_summary": { "type": "array", "items": { "type": "object", "properties": { "code": { "type": "string" }, "title_he": { "type": "string" }, "lines": { "type": "array", "items": { "$ref": "#/$defs/line" } } } } },
    "options": {
      "type": "object",
      "properties": {
        "headline_metric": { "enum": ["savings_y1_ils", "payback_years", "annual_yield_kwh"], "default": "savings_y1_ils" },
        "price_emphasis": { "enum": ["excl_vat", "incl_vat"] },
        "price_mode": { "enum": ["by_section", "lump_sum", "by_line"] },
        "show_price_per_kwp": { "type": "boolean" }, "show_lcoe": { "type": "boolean" },
        "show_self_consumption_split": { "type": "boolean" },
        "years_in_table": { "type": "array", "items": { "type": "integer" } },
        "include_boq_summary": { "type": "boolean" }, "boq_summary_prices": { "type": "boolean" },
        "include_about": { "type": "boolean" }, "include_changes": { "type": "boolean" }
      }
    }
  },
  "$defs": {
    "equipment_item": {
      "type": "object", "required": ["product_id", "kind", "manufacturer", "model", "qty", "highlights"],
      "properties": {
        "product_id": { "type": "string", "format": "uuid" }, "kind": { "type": "string" },
        "manufacturer": { "type": "string" }, "model": { "type": "string" }, "qty": { "type": "number" },
        "highlights": { "type": "array", "items": { "type": "object", "required": ["label_he", "value"], "properties": { "label_he": { "type": "string" }, "value": { "type": "string" }, "unit": { "type": "string" } } } },
        "certs": { "type": "array", "items": { "type": "string" } },
        "warranty": { "type": "object", "properties": { "product_years": { "type": "number" }, "performance_years": { "type": "number" }, "pct_end": { "type": "number" } } },
        "datasheet_ref": { "type": "string" }, "image_data_uri": { "type": "string" },
        "verification": { "enum": ["unverified", "summary", "office", "validated"] }
      }
    },
    "line": {
      "type": "object", "required": ["line_no", "title_he", "unit", "qty"],
      "properties": {
        "line_no": { "type": "string", "pattern": "^[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}$" },
        "title_he": { "type": "string" }, "description_he": { "type": "string" },
        "unit": { "type": "string" }, "qty": { "type": "number" },
        "unit_price": { "type": ["number", "null"] }, "line_total": { "type": ["number", "null"] },
        "included": { "type": "boolean" }, "optional": { "type": "boolean" }, "selected": { "type": "boolean" },
        "note_he": { "type": "string" }, "verification_flag": { "type": "boolean" }, "rule_id": { "type": "string" }
      }
    },
    "assumption": {
      "type": "object", "required": ["key", "value", "source_he", "verification"],
      "properties": {
        "key": { "type": "string" }, "label_he": { "type": "string" }, "value": { "type": ["number", "string", "null"] }, "unit": { "type": "string" },
        "source_he": { "type": "string" }, "valid_from": { "type": "string" },
        "verification": { "enum": ["unverified", "summary", "office", "validated"] }, "rule_id": { "type": "string" }
      }
    }
  }
}
```

כללי בניית המודל (`buildQuoteProposalModel(quoteVersionId, options)`):
1. קורא `QuoteVersion` (immutable או draft), `Project`, `Customer`, `Site`, `Design-lite`, `roi`, `rules_snapshot` — **קריאה בלבד**, בטרנזקציה `REPEATABLE READ`.
2. `customer.vat_id_masked`, `phone_masked` — מזעור; הערכים המלאים לעולם לא נכנסים למודל (פרטיות §15).
3. `pricing.sections[].lines` מסוננים לפי view `customer` (ללא עלויות); `hide_price` → `included:true`, `unit_price:null`.
4. `scope.regulatory_notes` = `distinct(customer_note_he)` משורות `source='rule'`, ממוין לפי `rule_id`.
5. `roi.has_unverified` = קיים `assumption.verification != office|validated` → כוכביות בשער/תקציר/כלכלה.
6. `document_model_hash` = sha256 של המודל ללא `meta.document_model_hash` ו-`signature.qr_data_uri`; נרשם ב-`Document.generated_from`.
7. ולידציה Zod בכניסה למחולל; כשל = job נכשל עם רשימת שדות — לעולם לא "מרנדרים חלקית".

---

## 5. בדיקות קבלה

1. Fixtures: `res_tile_se_8kwp` (פרטי, מונה נטו*), `com_tin_50kwp_2inv` (עסקי, 15–100), `com_100_630_export_limit` (R10), `res_with_battery` (R20), `v2_with_changes` (diff) — כל אחד עם DocumentModel snapshot.
2. Snapshot PNG: שער, תקציר, כלכלה (גרף), מחיר/תשלומים, חתימה.
3. Regex על ה-HTML: אין מחרוזות "עלות"/"רווח"/"ספק" בתצוגת לקוח; כל מספר בתוך `<bdi>`/`.num`.
4. מספר עמודים ≤ `options.max_pages` (ברירת מחדל 16).
5. `footer` מכיל `quote_number` ו-"עמוד X מתוך Y" בכל עמוד (בדיקת טקסט ב-pypdf).
6. Claude-vision על עמוד הכלכלה והמחיר: "האם יש מספרים הפוכים/שבורים?" — שער איכות לא חוסם (אזהרה).
