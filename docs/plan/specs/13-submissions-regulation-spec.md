# 13 — הגשות, רגולציה ומנוע הכללים (Submissions & Rules Engine)

| | |
|---|---|
| גרסה | 0.1 — טיוטת מפרט (2026-10-10) |
| אבן דרך | M3 (הגשה לחח"י) + חלק מ-M0 (`rules`) ו-M6 (S10) |
| שלבים | S05 (הגשה מקדימה), S10 (חיבור מונה), נגיעות ב-S01/S03 (פרופיל), S06 (כללי תכנון), S09 (בודק) |
| קבצים נלווים | `docs/plan/templates/submission-templates.json` (תבניות צעדים לפי מסלול), `docs/plan/rules/rules-seed.json` (seed לטבלת `rules`) |
| מקורות | תוכנית אב §3/§5/§9/§11/§18; `research/01-iec-process.md`; `research/02-regulation-tariffs.md` (§6 R1–R24, §8); `office-rules.md` (22 כללי משרד); `pv-design-rules.md`; `eplan/docs/GENERATOR.md` ("Seeded limits") + `eplan/domain/electrical/pv/rules.py` (`seed_items`); קבלה חח"י 28.09.26 |
| עיקרון | **המנוע מכין ועוקב; אדם מגיש.** לחח"י אין API. כל מספר נושא מקור ורמת אימות; כלל לא מאומת מציע ומסמן "לאימות", לא מכריע. |

מוסכמות: פרוזה בעברית, מזהים באנגלית; מזהי שלבים `S01`–`S12`; שמות ישויות לפי תוכנית אב §5 (`Project`, `Submission`, `SubmissionStep`, `Form`, `Fee/Receipt`, `Correspondence`, `Document`, `GridConnection`, `Inspection`, `Rule`, `Task`, `project_events`). רמות אימות: `unverified | summary | office | validated`. "לאימות" = פריט בטבלת §18 של תוכנית האב (V1–V20) או ב-§8 של דוח 02.

---

## (a) Regulatory track resolver — פותר מסלול האסדרה

### a.1 קלטים

| קלט | מקור ברשומה | הערות |
|---|---|---|
| `p_ac_kw` | `Design.inverters[].p_ac_nominal_kw` (סכום) | **בסיס הסיווג**. האם הרגולציה מודדת kW AC או kWp — לאימות (V3). עד אז: kW AC, ו-`p_dc_kwp` נשמר לצד. |
| `p_dc_kwp` | `Design.modules.count × Pmax` | ל-R18 (700 kW — יחידה לאימות) ולכללי eplan (`bond_structure_threshold_kwp`) |
| `customer_type` | `Customer.type` ∈ `residential · commercial · agricultural · public · kibbutz_member` | |
| `connection_phases`, `connection_amps` | `Project.connection` (מחשבון החשמל / סקר) | `connection_kva` נגזר אריתמטית: תלת-פאזי √3×400×I/1000; חד-פאזי 230×I/1000 (דוח 02 §2 — חישוב, לא רגולציה; סדרת גדלי החיבור לאימות) |
| `distributor_type` | `Project.distributor` ∈ `iec · historic:<name>` | נקבע ב-S01 לפי כתובת/יישוב; מאומת ב-S05 |
| `storage_mode` | `Project.storage_mode` ∈ `none · with_pv · add_to_existing` + `storage_kw/kwh` | |
| `expected_connection_date` | `Schedule` (CPM) או הערכה ידנית | ל-R1 (מונה נטו) |
| `site.*` | `Survey`: `building_legal`, `array_exceeds_roof`, `ground_mount`, `building_use`, `roof_type` | ל-R18/R19 |
| `evaluation_date` | היום / תאריך ההצעה | לבחירת תעריף שנתי (R3/R5) ותחולת כללים (`valid_from/valid_to`) |

### a.2 טבלת החלטה (מסלול)

הסדר מחייב: שורה ראשונה שמתקיימת קובעת את `regulatory_track`; שאר השורות ממשיכות להציב דגלים.

| # | תנאי | `regulatory_track` | אימות | הערות |
|---|---|---|---|---|
| 1 | `distributor_type == 'historic'` | `historic_distributor` | office (pv-design-rules §5) + unverified (תהליך, V11) | `size_tier` נשמר בנפרד לפי `p_ac_kw` לצורך כללי תכנון/תעריף |
| 2 | `storage_mode == 'add_to_existing'` | `bess_add` | office (תוכנית אב §3; 35כ3(א1)) | יורש דגלי מניה מה-`GridConnection` הקיים |
| 3 | `customer_type == 'residential' and p_ac_kw <= 15` | `residential_le15` | summary (ספי 15/100/630 — V3) | כלילות הגבול (≤ או <) לאימות |
| 4 | `15 < p_ac_kw <= 100` | `commercial_15_100` | summary | ≤15 kW לא-ביתי → `commercial_15_100` + warn "לאימות" (`track.warn.small_nonresidential`); ביתי >15 → warn (`track.warn.residential_gt15`) |
| 5 | `100 < p_ac_kw <= 630` | `commercial_100_630` | summary | דורש מסמך `roof_agreement_55406` (תחולה לאימות) |
| 6 | `p_ac_kw > 630` | `mv_gt630` | unverified ([ידע כללי]) | סקר חיבור מורחב, הצעת חיבור, בודק סוג 3, היתר הפעלה — כולם לאימות |

מיפוי למזהי `01-lifecycle-stages.json`: `residential_le15→RES_LE_15`, `commercial_15_100→COM_LE_100`, `commercial_100_630→COM_LE_630`, `mv_gt630→LARGE_GT_630`, `bess_add→BESS_ADD`, `historic_distributor→HISTORIC_DIST` (אי-התאמה בשמות — ראו "אי-עקביות" בסוף; ההמלצה: ליישר את ה-JSON לשמות תוכנית האב).

### a.3 דגלים (flags) — נגזרים מכללים, לא מקוד

| דגל | כלל | תנאי | ערך | אימות |
|---|---|---|---|---|
| `production_meter_required` | R8 | `p_ac_kw > 15` | true | office (35כ3(י)) |
| `ct_metering` | R9 | `connection_phases == 3 and connection_amps > 100` | true | office — הנחיית חח"י לא אותרה |
| `export_limit_possible` | R10 | `p_ac_kw > 100` | true | office (35כ2(ט)(3)) |
| `connection_upgrade_needed` | R7 | `p_ac_kw / 0.9 > connection_kva` | true | office (35כ2) |
| `net_metering_possible` | R1 | `expected_connection_date <= 2026-12-31` | true | summary (V4) |
| `tariff_tier` | R2 | מדרגות | `tier_le15 · tier_15_100 · tier_100_630 · tier_gt630` | summary |
| `permit_exemption_eligible` | R18 | `p_ac_kw <= 700 and not ground_mount and building_legal and not array_exceeds_roof` | true / false / `needs_input` | summary (V6; יחידת 700 לאימות) |
| `operating_permit_required` **[לאימות]** | `pua.operating_permit_04_2026` | `mv_gt630` → true [ידע כללי]; אחרת `null` | null = "לא ידוע; לברר" | unverified (V10) |
| `inspector_type` **[לאימות]** | R17 | ספים לא אומתו | `{proposal, verification: לאימות}` → בחירה ידנית | unverified (V7) |
| `fire_plan_required` | R19b | `building_use in [public, commercial]` → `null`+warn | — | unverified (V9) |
| `fast_track_candidate` | `iec.fast_track_70104` | ביתי | `null`+warn | unverified (V12) |
| `refund_eligible` | `iec.refund.*` | תשובת מחלק שלילית + זמינות רשת + נתונים לא עודכנו | `candidate` | summary (V1) |
| `bess_shared_production_meter` | `track.bess_add` | אגירה | true | office (35כ3(א1)) |

**סמנטיקה של `null`:** דגל `null` מוצג ב-UI כ"לא ידוע — לאימות" ומייצר צעד/משימה מותנה שאינה חוסמת (ראו §c); הוא לעולם לא מתורגם ל-false בשקט.

### a.4 פלט

```ts
type TrackResolution = {
  regulatory_track: 'residential_le15'|'commercial_15_100'|'commercial_100_630'|'mv_gt630'|'bess_add'|'historic_distributor';
  size_tier: 'le15'|'15_100'|'100_630'|'gt630';
  flags: Record<FlagKey, boolean|number|string|null|{value:null, verification:'לאימות'}>;
  rules_fired: { key: string; verification: Verification; outcome: 'fired'|'skipped'|'needs_input' }[];
  rules_snapshot_id: string;   // נשמר על QuoteVersion / Submission (תוכנית אב §5 Document.generated_from.rules_snapshot)
  warnings: string[];          // כל "לאימות" שהופעל
};
```
ההרצה: S01 (`profile_guess`, קלט חלקי → רוב הדגלים `needs_input`), S03 (אחרי Design-lite), S05 צעד `pre.02.resolve_track` (מאומת, נועל `Submission.track`). שינוי מסלול אחרי S05 = `project_events: track.changed` + יצירת Submission חדשה (הישנה נסגרת `superseded`).

---

## (b) מודל ה-Submission

### b.1 ישויות

```
Submission {
  id, project_id, kind: iec_pre | iec_inspection | tariff_registration | operating_permit
                        | historic_distributor | municipality_exemption_report | fire_authority,
  track (snapshot של regulatory_track), distributor (iec | historic:<name>), template_id + template_version,
  status: open | in_progress | waiting | done | blocked | superseded,   // נגזר מהצעדים
  external_ref (מס' תיק/בקשה ראשי), portal, opened_at, closed_at, outcome: positive|negative|conditional|n/a,
  rules_snapshot_id, owner_user, notes
}
SubmissionStep {
  id, submission_id, template_step_id (למשל pre.06.pay_fee), seq, kind, name_he, stage (S05|S10),
  actor: pm|owner|customer|system|iec|distributor|inspector|structural_engineer|fire_consultant|pua|municipality,
  owner_user, status (§b.2), conditional_on (ביטוי) , created_from_rule,
  external_ref, portal_url, submitted_at, answered_at, closed_at,
  sla_business_days, sla_param_key, sla_anchor_field, anchor_at, due_at, due_source, overdue_since,
  fee: { expected_amount_ils, quote_no, quoted_amount_ils, paid_amount_ils, paid_at, receipt_document_id,
         receipt: Receipt, verification },
  documents_required: DocumentKind[], documents_conditional: {kind, when, verification}[],
  documents_attached: Document[] (Document.kind ∈ required ∪ conditional), missing_items: MissingItem[],
  inputs: {field: value|null}, outputs: {field: value}, correspondence: Correspondence[], events: StepEvent[],
  automation: auto|semi|manual, verification
}
Form     { id, kind (iec_22_8_22 | operating_permit_application | tariff_registration | historic_application), version,
           blank_template_document_id, sha256_blank, field_map_version, filled_values JSON, filled_document_id, signed_document_id }
Receipt  { paid_at, amount_ils, card_last4, payment_type, reference (אסמכתא, unique), contract_account_no,
           quotes_paid: [{quote_no, amount_ils}], payer_channel, source (gmail|upload|portal), raw_document_id, confidence, confirmed_by }
Correspondence { id, step_id, direction: in|out, channel: portal|email|phone|whatsapp|letter, at, from, to, subject,
                 body_ref/document_id, external_ref, parsed_fields JSON, linked_job_id }
MissingItem { kind, required_by_step, reason: not_attached|not_signed|wrong_format|expired|superseded|needs_input, verification }
```

### b.2 מכונת מצבים של צעד

```
open ──prepare──▶ prepared ──submit──▶ submitted ──ack──▶ waiting ──answer──▶ answered ──▶ closed
                                                                     ├──approve──▶ approved ──▶ closed
                                                                     └──reject───▶ rejected ──▶ closed | reopen (צעד חדש seq+1, supersedes)
כל מצב ──block/unblock──▶ (blocked_reason, blocked_owner)     // כמו ב-Project: blocked תמיד עם סיבה ובעלים
```

| מעבר | guard (תנאי) | פעולות | אירוע ב-`project_events` |
|---|---|---|---|
| `open → prepared` | `missing_items.filter(blocking).length == 0`; ל-`fill_form`: `Form.filled_document_id` קיים | מחשב `missing_items`, מייצר חבילה (§d) | `submission.step.prepared` |
| `prepared → submitted` | `automation != 'auto'` → דורש `requiresHumanPick` (אדם מגיש בפורטל) ; `external_ref` חובה אם `portal != null` | שומר `submitted_at`, `external_ref` | `submission.step.submitted` |
| `submitted → waiting` | אוטומטי מיד, או אחרי `fee.paid_at` כשהצעד הוא `pay_fee` | `anchor_at` = השדה ב-`sla_anchor_field`; `due_at = add_business_days(anchor_at, sla_business_days ?? param)`; מתזמן pg-boss `step.sla_check` + תזכורות | `submission.step.waiting`, `submission.sla.scheduled` |
| `waiting → answered/approved/rejected` | תכתובת/מסמך נכנס (אישור אדם או אירוע חסר-סיכון) | שומר `answered_at`, `outputs`, מצרף `Document` | `submission.answer.received` (+ `distributor.answer.positive|negative`) |
| `rejected → open(seq+1)` | החלטת בעלים (reopen) | מעתיק inputs; `supersedes` | `submission.step.reopened` |
| `* → closed` | outputs חובה מולאו (למשל `fee.paid_at`, `document:distributor_answer`) | מעדכן `Submission.status`, `GridConnection`, יציאת שלב | `submission.step.closed` |
| `* → blocked` | סיבה + בעלים | | `submission.step.blocked` |

סטטוס ה-`Submission` נגזר: יש צעד `waiting` → `waiting` (ו-`Project.status = waiting_iec` כשה-actor הוא `iec`/`distributor`/`pua`); כל הצעדים `closed` → `done`; צעד `blocked` → `blocked`.

### b.3 אירועים (append-only, `project_events`)

`submission.created`, `submission.step.prepared|submitted|waiting|answered|approved|rejected|reopened|closed|blocked`, `submission.fee.quoted` (הצעת חשבון התקבלה), `submission.fee.paid` (קבלה אושרה — **עוגן SLA**), `submission.receipt.ingested` (לפני אישור), `submission.sla.scheduled|reminder_sent|breached|escalated`, `submission.refund.flagged`, `submission.document.attached|missing|superseded`, `distributor.answer.positive|negative|conditional`, `grid.meter.installed`, `grid.operation_approved`, `grid.tariff_track_registered`, `permit.operating.received`, `track.changed`. כל אירוע: `actor` (user|agent|system), `job_id` (לדג'ר הכוורת), `payload`.

### b.4 מיפוי לשלבים

| kind | שלב | תנאי יציאה של השלב שהוא מזין | נוצר ב- |
|---|---|---|---|
| `iec_pre` | **S05** | `submission.pre.distributor_answer == positive OR profile.pre_application_not_required` | `S04.done` (`build_submission_steps_from_profile`) |
| `municipality_exemption_report` | S05 (במקביל; לא חוסם S05.exit אלא **S08.entry** — לאימות אם חח"י דורשת) | — | `S04.done` |
| `fire_authority` | S05/S06 (מותנה `fire_plan_required`) | — (מזין S08/S09 כ-checklist) | כשהדגל אינו false |
| `historic_distributor` | **S05** (צעדים hd.01–hd.05) + **S10** (hd.06–hd.08) | S05.exit / S10.exit | `S04.done` כש-`distributor_type == historic` |
| `iec_inspection` | **S10** | `grid.meter.installed`, `grid.operation_approved` | `S09.done` |
| `tariff_registration` | **S10** | `grid.tariff_track_registered` | `insp.09.close` |
| `operating_permit` | **S10** (מותנה `operating_permit_required`) | S10.exit אם `== true`; `null` → משימת בירור, לא חוסם (לאימות V10) | `insp.09.close` |

S05 ‖ S06 (תוכנית אב §3): תשובת מחלק עם תנאים (הגדלת חיבור, הגבלת הספק) מייצרת `Task` ל-S06 ו-`QuoteVersion` חדשה אם משתנה ההיקף.

---

## (c) תבניות צעדים לפי מסלול

הגדרה פורמלית: `docs/plan/templates/submission-templates.json` — לכל מסלול רשימת צעדים מסודרת `{id, kind, name_he, stage, actor, inputs[], documents_required[], documents_conditional[], fee, external_portal, sla_business_days, sla_source, reminders[], outputs[], automation, verification, conditional_on}`. ערך `null` + "לאימות" בכל מקום שהמחקר לא נתן מספר. הצעדים משותפים (ספריית צעדים) והמסלולים מרכיבים אותם; הבדלים בין מסלולים = צעדים מותנים ו-`fee`/`flags_defaults`.

### c.1 סקירת הזרימה (כל המסלולים דרך חח"י)

```
S05  pre.01 איסוף נתונים → pre.02 resolver → pre.03 טופס 22-8-22 (חתימת לקוח) → pre.04 חבילה
     → pre.05 הגשה ב-digitalorders [ידני; external_ref + הצעת חשבון] → pre.06 תשלום ~704 ₪ + קליטת קבלה [עוגן SLA]
     → pre.07 תשובת מחלק [waiting; SLA לאימות; תזכורות 7/14/30] → (pre.08 הגדלת חיבור אם R7/תנאי) → pre.09 סגירה
     ‖ mun.01 זכאות פטור (R18) → mun.02 קונסטרוקטור → mun.03 דיווח לרשות הרישוי | mun.04 היתר בנייה
     ‖ fire.01 תחולה (R19) → fire.02 תוכנית בטיחות אש → fire.03 הגשה      [כולם מותנים/לאימות]
S10  insp.01 שער בודק פרטי (S09) → insp.02 חבילת בדיקה → insp.03 הזמנת "בדיקת מתקן PV" ב-digitalorders
     → insp.04 תשלום דמי בדיקה [עוגן] → insp.05 בדיקת חח"י [7 י"ע] → insp.06 תוצאה (→ insp.06b בדיקה חוזרת)
     → insp.07 מונה (דו-כיווני / ייצור / CT) → insp.08 אישור הפעלה [30 י"ע מהתשלום] → insp.09 סגירה
     → tar.01–04 רישום לאסדרה (פורטל יצרנים)   → op.01–04 היתר הפעלה (אם נדרש — לאימות)
```
`bess_add`: `pre.02b` בקשת אישור kW/kWh (R21) בין ה-resolver לטופס; `mv_gt630`: `pre.07a/07b` סקר חיבור מורחב ותשלום הצעת חיבור (לאימות).

### c.2 צעד האגרה (`pre.06.pay_fee`) וקליטת הקבלה

- **סכום צפוי**: `residential_le15` → `704.22 ₪` (`verification: summary`; תקצירי midrag/mako 2026 "~704 ₪"; מקור ישן 625 ₪; **הקבלה מ-28.09.26 תואמת**). מסלולים אחרים → `null` + "לאימות" (V2); הסכום בפועל נלמד מהצעת החשבון ונשמר כפרמטר `fee.expected[track]` לאחר אישור ברק. מהות האגרה (סעיף בלוח התעריפים, מע"מ) — לאימות; ההשערה 704/1.18 ≈ 597 ₪ לפני מע"מ נשארת הערה, לא נתון.
- **שדות הקבלה** (`receipt_ingestion_schemas.iec_receipt_v1`, מהקבלה לדוגמה):

| שדה | תווית בקבלה | דוגמה (28.09.26) |
|---|---|---|
| `paid_at` | תאריך ביצוע התשלום | 28/09/2026 |
| `amount_ils` | הסכום ששולם | 704.22 ₪ |
| `card_last4` | שולם בכ.אשראי המסתיים בספרות | 4910 |
| `payment_type` | סוג התשלום | רגיל |
| `reference` | אסמכתא | 0403063 (ייחודי — מפתח למניעת כפילות) |
| `contract_account_no` | מספר חשבון חוזה | (ריק בקבלה לדוגמה) |
| `quotes_paid[]` | פרטי הצעות החשבון ששולמו: הצעת חשבון / סכום | 52181659 / 704.22 ₪ |
| `payer_channel` | — | iec.co.il/order-payments |
| `service_contact` | מרכז שירות | 103 / Service@iec.co.il |

- **צינור**: קבלה מגיעה במייל (Gmail watch → n8n/pg-boss) או בהעלאה → Claude vision עם structured output (Zod לפי הסכמה) → **אישור אדם** (סוכן "Receipt/status updater", תוכנית אב §14; אירועים חסרי סיכון יכולים לעבור אוטומטית לפי מדיניות) → `Document(kind=fee_receipt_iec, sha256)` → `step.fee.paid_at/paid_amount/receipt` → `event submission.fee.paid` → תזמון SLA.
- **התאמה**: `quotes_paid[].quote_no == step.fee.quote_no` (מספר הצעת החשבון שנרשם ב-`pre.05`); אחרת `amount == quoted_amount` ופרויקט במצב "ממתין לתשלום"; אחרת תור אישור ידני. `reference` כפול → דחייה.
- **פער סכום**: `|paid − expected| > 1 ₪` → warn בצעד ובדיווח הבוקר ("אגרה שונה מהצפוי — לעדכן פרמטר?").
- `card_last4` נשמר (לא PAN); קבלה = מסמך פיננסי של הלקוח → הרשאות `pm/owner/customer` בלבד (RLS).

### c.3 צעד הזמנת בדיקת חח"י (`insp.03.order_inspection`)

ידני ב-`digitalorders.iec.co.il` ("הזמנת בדיקת מתקן" + העלאת קבצים + תשלום + סטטוס בזמן אמת; הרשמה חד-פעמית לשירותים הדיגיטליים); חלופה: אתר המעגל `/order_the_test`. המערכת: מכינה את החבילה (§d), פותחת משימה `requiresHumanPick`, מציגה צ'קליסט "מה להעלות", ואחרי ההגשה דורשת `external_ref` (מספר הזמנה) ו-`fee.quote_no`. פורמטי קבצים/גודל/ייפוי כוח בפורטל — לאימות (V5); עד אז PDF בלבד, ≤ 10 MB לקובץ (**פרמטר משרדי, לא נתון חח"י**). סטטוס: קריאה ידנית של עמוד ההזמנות; scraping בהרשאת הלקוח — רק אחרי בדיקה משפטית (דוח 01 §5).

### c.4 מסלולים — מה שונה (תמצית)

| מסלול | צעדים נוספים/שונים | דגלי ברירת מחדל | אימות |
|---|---|---|---|
| `residential_le15` | אגרה 704.22; `op.*` ו-`fire.*` מותנים (לרוב לא נדרשים — [ידע כללי]) | כל דגלי המניה false | summary/unverified |
| `commercial_15_100` | ארון מונה ייצור (R8), CT אם >100A (R9); `fire.*` פעיל כ-warn | `production_meter_required: true` | office |
| `commercial_100_630` | `pre.07b` הצהרת מגבלת הזרמה/EMS (R10); מסמך `roof_agreement_55406` | `export_limit_possible: true` | office/summary |
| `mv_gt630` | `pre.07a/07b` סקר חיבור והצעת חיבור; `op.*` פעיל (true); בודק סוג 3; >700 kW → היתר בנייה | `operating_permit_required: true` ([ידע כללי]) | unverified |
| `bess_add` | `pre.02b` אישור kW/kWh; דפי נתונים סוללה (62619); מונה ייצור משותף; בדיקת חח"י חוזרת — לאימות | ירושה מה-`GridConnection` | office/unverified |
| `historic_distributor` | `hd.01–08` במקום `pre.*`/`insp.*`/`tar.*`; `mun.*`/`fire.*`/`op.*` ללא שינוי | לפי גודל (אם המחלק מיישם 35כ) | unverified (V11) |

---

## (d) בונה חבילת המסמכים (Document pack builder)

### d.1 סוגי מסמכים

רשימה מלאה עם `name_he`, `signed_by`, `source` ו-`verification`: `submission-templates.json → document_kinds` (44 סוגים). חלוקה: מופקים אוטומטית (`docgen`/`form_fill`/`design_set`/`catalog`), מועלים (`upload`), נכנסים מגוף חיצוני (`inbound`). חותמים: `customer`, `designer` (מתכנן, רישיון לפי R16), `inspector` (סוג לפי R17), `installer`, `structural_engineer`, `iec`, `distributor`, `pua`, `municipality`, `fire_authority`.

### d.2 לכל צעד

- `documents_required[]` — חוסר = `MissingItem` חוסם את `open → prepared`.
- `documents_conditional[]` — `when` ביטוי; `when == 'לאימות'` → מוצג בצ'קליסט כ"לא ידוע אם נדרש", **לא חוסם**, ומדווח בסקירה השבועית עד שברק מכריע (הכרעה = כלל `require_document` חדש ב-`rules`).
- **פורמט**: PDF בלבד (מינהל החשמל — summary; digitalorders — לאימות, מניחים PDF). תמונות (JPEG/HEIC) → PDF דרך sharp + Chromium; DXF/DWG → רק ה-PDF המודפס מה-CAD worker; XLSX → PDF. מסמך שאינו PDF → `MissingItem{reason: wrong_format}` (כלל `iec.docs.pdf_only_electricity_admin`).
- **חתימה**: `signed_by` חובה → `Document.signed_by` (role + license) או `Signature` (click-to-accept/OTP ללקוח; PAdES למסמכי מהנדס בשלב ב'). לא חתום → `reason: not_signed`.
- **תוקף**: `insurance_policy`, `connection_size_approval`, `structural_engineer_approval` עם `valid_until` (פרמטר; לאימות) → `expired`.
- **גרסה**: `Document.supersedes`; רק האחרון נספר; חבילה שהוגשה = snapshot (sha256, נעילה).

### d.3 מוסכמת שמות

```
{project_code}_{submission_kind}_{step_id}_{doc_kind}_r{rev}_{YYYYMMDD}.pdf     // קובץ בודד
{project_code}_{submission_kind}_pack_r{rev}_{YYYYMMDD}.pdf                      // חבילה ממוזגת
דוגמה: BEE-2026-0143_iec_pre_pre.04_iec_form_22_8_22_r1_20261012.pdf
```
`project_code` לפי הקונבנציה של bee-live (להחלטת ברק; כאן `BEE-{year}-{seq}` כהצעה). שמות לטיניים בלבד (פורטלים/מערכות קבצים); הכותרת בעברית בתוך ה-PDF ובמטא-דאטה.

### d.4 סדר מיזוג (pypdf, bookmarks לכל מסמך, עמוד שער+תוכן עניינים מ-Chromium)

1. `pack_cover_index` (פרויקט, לקוח, מס' חוזה, מסלול, רשימת מסמכים + סטטוס אימות)
2. טופס ראשי (`iec_form_22_8_22` / `operating_permit_application_form` / `tariff_registration_request` / `historic_distributor_application`) + `power_of_attorney` (אם B.E.E מגישה)
3. הצהרות (`installer_declaration`, `designer_declaration`) + `iec_inspection_form` / `inspector_report_62446`
4. תוכניות: `sld_signed` → `site_plan` → `control_monitoring_plans` → `as_made_set` (S10)
5. דפי נתונים: `inverter_datasheet`, `module_datasheet`, `battery_datasheet`, `inverter_approved_list_cert`
6. אישורים חיצוניים: `connection_size_approval`, `distributor_answer`, `bess_approval_iec`, `structural_engineer_approval`, `building_permit_or_exemption_report`, `fire_authority_approval`, `insurance_policy`, `roof_agreement_55406`
7. קבלות (`fee_receipt_iec`)

מסמכים ב-`documents_conditional` עם `when == 'לאימות'` נכנסים לנספח "מסמכים נוספים (לא ודאי שנדרשים)" בסוף, כדי לא לחסום הגשה ולא להסתיר. הדף הראשון של כל מסמך מקבל overlay (pypdf `merge_page`) עם שם הפרויקט, kind, rev ו-sha256 מקוצר.

### d.5 צ'קליסט ו"חוסרים"

```
missing(step) = for kind in required ∪ conditional(when==true):
                  latest = Document.where(project, kind, superseded=false)
                  if !latest → not_attached
                  elif latest.format != pdf → wrong_format
                  elif kind.signed_by && !latest.signed → not_signed
                  elif latest.valid_until < today → expired
                  elif latest.generated_from.design_rev < Design.current_rev && kind.source == design_set → superseded (warn)
                blocking = reason in {not_attached, wrong_format, not_signed, expired} && kind ∈ required
```
UI: טבלה לכל צעד — מסמך · מי חותם · מקור (אוטומטי/העלאה/נכנס) · סטטוס (חסר/מצורף/חתום/פג) · תג אימות (`summary`/`unverified` = "לאימות") · פעולה (הפק / העלה / בקש מהלקוח — outbound תמיד `requiresHumanPick`). כפתור "בנה חבילה" פעיל רק כש-`blocking == 0`; "הגש בכל זאת" דורש סיבה ובעלים (נרשם כ-override).

### d.6 מילוי טופס 22-8-22

**גישה**: (1) טוענים את ה-PDF הריק (`Form.blank_template_document_id`, sha256) ומגלים שדות: `pypdf PdfReader.get_fields()` / `pdf-lib getForm().getFields()`. (2) אם יש AcroForm → מילוי שדות (pdf-lib `setText/check`), **אבל** pdf-lib לא עושה bidi/shaping לעברית (דוח 04) → ערכים עבריים ממולאים דרך pypdf `update_page_form_field_values` עם `NeedAppearances` או, בטוח יותר, (3) **overlay**: עמוד שקוף מ-Chromium (Rubik, `<bdi>`) עם הטקסט במיקום השדה, ממוזג ב-pypdf `merge_page`. הטופס המקורי כנראה שטוח (לא אומת) → ברירת המחדל היא (3) עם `field_map` של קואורדינטות לכל שדה, שנכויל פעם אחת על הטופס האמיתי (קלט נדרש מברק — תוכנית אב §19.4/§19.6). (4) הצהרת המבקש וחתימה — נשארות ידניות/חתימת לקוח (OTP + ציור) → `signed_document_id`.

**טבלת מיפוי שדות** (`form_templates.iec_22_8_22.v1`; שמות שדות ה-PDF ומיקומם — **לאימות** עד שהטופס ייקרא; V5):

| # | שדה לוגי | ערך מהרשומה | שם שדה PDF | עמוד/מיקום | הערה |
|---|---|---|---|---|---|
| 1 | שם המבקש / בעל החוזה | `Customer.legal_name` | לאימות | לאימות | |
| 2 | ת"ז / ח"פ | `Customer.id_number` | לאימות | לאימות | מוצג פעם אחת; לא שומרים צילום ת"ז (§15) |
| 3 | כתובת למשלוח | `Customer.address` | לאימות | לאימות | |
| 4 | טלפון / נייד / דוא"ל | `Contact.*` | לאימות | לאימות | |
| 5 | מספר חוזה חח"י | `Project.contract_number` | לאימות | לאימות | מחשבון החשמל |
| 6 | מספר צרכן / מספר מונה | `GridConnection.meterSerial` (קיים) | לאימות | לאימות | |
| 7 | כתובת האתר / גוש-חלקה | `Site.address`, `Site.parcel` | לאימות | לאימות | גוש/חלקה — האם נדרש, לאימות |
| 8 | גודל חיבור קיים (פאזות × אמפר) | `Project.connection_phases/amps` | לאימות | לאימות | |
| 9 | הספק מתקן מבוקש kW AC / kWp | `Design.p_ac_kw`, `Design.p_dc_kwp` | לאימות | לאימות | איזה מהם הטופס שואל — לאימות (V3) |
| 10 | ממירים: יצרן/דגם/כמות | `Design.inverters[]` | לאימות | לאימות | |
| 11 | מודולים: יצרן/דגם/הספק/כמות | `Design.modules` | לאימות | לאימות | |
| 12 | אגירה: הספק/קיבולת | `Project.storage_kw/kwh` | לאימות | לאימות | האם קיים בגרסה 22-8-22 — לאימות |
| 13 | מסלול/אסדרה מבוקשת | `flags.tariff_tier`, `net_metering_possible` | לאימות | לאימות | |
| 14 | מתכנן: שם/רישיון | `Design.designer` | לאימות | לאימות | |
| 15 | הצהרת מבקש — קרבה לעובדי חח"י (כן/לא + פרטים) | `Customer.iec_employee_relation` (שאלה ב-S04) | לאימות | לאימות | מאומת מתקציר שהשדה קיים |
| 16 | תאריך + חתימת המבקש | `Signature` | לאימות | לאימות | ידני/OTP |
| 17 | מיופה כוח (אם קיים) | `Organization.B.E.E` | לאימות | לאימות | קיום השדה לאימות |

`Form.filled_values` נשמר כ-JSON; שינוי ברשומה אחרי המילוי → `superseded` + הפקה מחדש. בדיקת איכות: רינדור לעמוד PNG + Claude-vision "כל השדות קריאים ובמקום" (שער איכות של דוח 07).

---

## (e) SLA, תזכורות והסלמה

### e.1 ימי עבודה

`business_calendar` (דוח 05: @hebcal/core `il:true` או Hebcal REST → טבלה שנתית נערכת ידנית; א'–ה' עבודה; שישי/ערבי חג/חוה"מ לפי מדיניות המשרד — פרמטר). `add_business_days(anchor, n)` בצד השרת (אותה פונקציה של ה-CPM). **הנחה לאימות**: אמות המידה סופרות "ימי עבודה" כמו המשרד (האם שישי נספר אצל חח"י — V1).

### e.2 פרמטרים (`sla_params`, ניתנים לעריכה ב-UI, עם מקור ואימות)

| key | ברירת מחדל | מקור | אימות | שימוש |
|---|---|---|---|---|
| `sla.iec_inspection_bd` | 7 | אמות מידה (תקציר) — בדיקה תוך 7 י"ע מהתשלום | summary | `insp.05` due |
| `sla.connection_complete_bd` | 30 | אמות מידה (תקציר) — חיבור+בדיקה תוך 30 י"ע מהתשלום | summary | `insp.08` due |
| `sla.survey_publication_min/max_bd` | 7 / 14 | אמות מידה (תקציר) — פרסום סקרים | summary | `pre.07` חלון צפוי |
| `sla.distributor_answer_bd` | `null` | לא אומת (V1); שיווקי "עד 30 יום" קלנדריים | unverified | `pre.07` — רק תזכורות |
| `sla.reminder_1/2/3_bd` | 7 / 14 / 30 | תוכנית אב §3 S05 ("7/14/30 י"ע, לאימות") | unverified | כל צעד `waiting` ללא SLA |
| `sla.customer_nudge_bd` | 3 | תוכנית אב §3 S04 | office | צעדים ש-`actor == customer` |

### e.3 מנגנון

- בכניסה ל-`waiting`: `due_at` (אם יש SLA) + jobs ב-pg-boss: `step.reminder` ב-anchor+7/14/30 י"ע (או due−2, due, due+3 כשיש due), `step.sla_check` ב-due. ה-job idempotent: בודק שהצעד עדיין `waiting`.
- **תזכורת** → `Task` לבעלים (`to: owner_user`) ובצעד השני/שלישי → **דיווח הבוקר** (pg-boss cron → self-chat WhatsApp, הרחבת `morning-report`): רשימת "תיקי חח"י תקועים": פרויקט, צעד, ימי עבודה בהמתנה, due, external_ref, מה הפעולה הבאה. צעד שעבר due → `overdue_since`, `event submission.sla.breached`, ו-`Project.status` נשאר `waiting_iec` עם דגל `overdue` ב-"תקועים".
- **הסלמה**: `reminder_3` או `breached` → `escalate: true` → פריט בראש דיווח הבוקר + הצעת טיוטת פנייה לחח"י (`dispatch.draft`, `requiresHumanPick`, מרכז שירות 103 / Service@iec.co.il מהקבלה). ללקוח: תזכורת תשלום אחרי `customer_nudge_bd` (תבנית Meta מאושרת; אנושי בוחר).
- **זכאות להחזר** (`iec.refund.negative_answer_stale_grid_data`): תשובת מחלק `negative` עם `reason == network_availability` ו-`grid_data_stale != false` → `flags.refund_eligible = 'candidate'`, `Task` "לבדוק עדכון נתוני רשת + להגיש דרישת החזר", שורת זיכוי מותנית ב-`QuoteVersion` (לא נשלחת ללקוח עד אישור). נוסח אמת המידה ותדירות העדכון — לאימות (V1).
- **חופשות חח"י/שביתות**: שדה `pause_reason` בצעד עוצר את השעון (נרשם כאירוע; לא מחושב אוטומטית).

---

## (f) מנוע הכללים (`rules`)

### f.1 סכמת Rule

```ts
type Rule = {
  key: string;                       // 'R7.connection_size' | 'office.design.one_face_per_string' | 'eplan.dc_cable_min_mm2' | 'iec.sla.*'
  ref?: string;                      // 'R7' | 'OFFICE-5' | 'EPLAN-dc_cable_min_mm2'
  scope: 'pricing'|'design'|'submission'|'inspection';
  name_he: string;
  condition: string;                 // ביטוי (§f.2); 'true' = תמיד
  consequences: Array<{ type: 'add_line'|'require_document'|'block'|'warn'|'set_flag'; params: Record<string, unknown> & { when?: string } }>;
  source: { doc: string; section?: string; url?: string; date?: string; research_ref?: string };
  verification: 'unverified'|'summary'|'office'|'validated';
  verified_by?: string; verified_at?: string;
  supersedes?: string; valid_from?: string; valid_to?: string;
  priority: number;                  // סדר בתוך scope
  tests: Array<{ name: string; given: Ctx; expect: { fires: boolean|null; blocks?: boolean; flags?: {}; add_lines?: number; outcome?: 'needs_input' } }>;
  eplan?: { knowledge_status: 'CANDIDATE'|'VALIDATED'; level: 'LEVEL_0'|'LEVEL_2'; authority_level: string; mandatory: boolean; origin: string };
  value?: number; unit?: string;     // לכללי-גבול (eplan)
  notes?: string;
};
```
טבלת Postgres `rules` (jsonb ל-`consequences/source/tests/eplan`), `rules_history` (trigger על כל UPDATE — גרסה קודמת נשמרת), `rules_snapshots` (set של {key, version, verification} שנשמר על `QuoteVersion`, `Submission`, `Design`). `supersedes` יוצר כלל חדש ומסמן את הישן `valid_to = now`.

### f.2 שפת הביטויים

תת-שפה קטנה, **ללא eval**: השוואות `> >= < <= == !=`, `and or not`, `in [..]`, `is null / is not null`, אריתמטיקה `+ - * /`, קריאות מותרות: `date()`, `min()`, `max()`, `add_business_days()`, `add_years()`, `param()`, `license_limit_a()`, `tier()`. מימוש: `jsep` (MIT) לפירסור + מעריך משלנו עם לוגיקה תלת-ערכית (`true/false/unknown`). **`null` בקלט → `unknown`** → outcome `needs_input`: לכלל עם `block` → חסימה `HUMAN_INPUT_REQUIRED` (כמו eplan); אחרת → warn "חסר נתון: <שדה>". שדות ה-Ctx (רשימה מלאה בבדיקות של ה-seed): `p_ac_kw, p_dc_kwp, customer_type, distributor_type, storage_mode, storage_kw/kwh, connection_phases/amps/kva, expected_connection_date, site.*, inverter.*, dc.*, ac.*, rcd.*, earthing.*, strings.*, mppt.*, cable.*, device.*, battery.*, board.*, signer.*, inspector.*, main_breaker_amps, roi.*, design.*, set.*, sheet.*, qa.*, submission.*, step.*, fee.*, distributor_answer.*, grid_data_stale, gridconnection.*, document.*, bess_approval.*`.

### f.3 סדר הערכה

1. בניית Ctx (snapshot של Project/Survey/Design/Catalog/GridConnection) + `evaluation_date`.
2. סינון: `valid_from <= evaluation_date <= valid_to`, לא superseded.
3. לפי scope: **submission (resolver, priority 5–40)** → **design (50–199)** → **pricing (200–299)** → **submission (300+)** → **inspection**. בתוך scope לפי `priority` ואז `key`. דגלים שהוצבו זמינים לכללים הבאים (`flags.*`).
4. לכל כלל: `condition` → `fired | skipped | needs_input`; ואז `consequences` בסדר, כל אחת עם `when` משני.
5. **שינוי תוצאה לפי אימות** (תוכנית אב §9.2): `validated`/`office` — אפקט מלא; `summary` — אפקט מלא + תג "לאימות" על השורה/המסמך/הדגל; `unverified` — `block` מוריד ל-`warn`, `add_line` נכנס כשורה מסומנת "לאימות" (לא נשלחת ללקוח בלי אישור), `require_document` → `documents_conditional(when='לאימות')`, `set_flag` → `{value, verification:'לאימות'}`.
6. איחוד: `block` גובר על `warn`; שורות `add_line` כפולות (אותו `product_key`) מתמזגות עם ציון כל הכללים; `require_document` מתמזג לפי `kind`.
7. פלט: `RuleRun {rules_snapshot_id, results[], blocks[], warnings[], lines[], documents[], flags}` נשמר; שינוי ב-Ctx → הרצה מחדש (דטרמיניסטית).

### f.4 UI לסקירת כללים (ברק = reviewer, החלטה פתוחה §17.9)

- רשימה לפי scope/verification עם מסננים "לא מאומת", "פג תוקף", "ללא מקור URL", "נכשל בבדיקה".
- כרטיס כלל: תנאי, תוצאות, מקור (קישור, סעיף, תאריך), היסטוריה (`supersedes`), **טבלת הבדיקות עם תוצאה חיה** (רץ בדפדפן ובשרת), "הפעל על פרויקט לדוגמה".
- פעולות: `approve` → `validated` + `verified_by/at` (job בלדג'ר); `edit` → כלל חדש עם `supersedes` (הישן נשאר בהיסטוריה ובסנאפשוטים); `downgrade` (למשל כש-URL מת); `add test`.
- "דיווח אימות" שבועי: כללים `summary/unverified` שהופעלו בהצעות שנשלחו — כדי שהאימות יקדים את הפרויקטים.
- CI: כל כלל חייב ≥1 test; `pnpm rules:test` מריץ את `tests[]` של ה-seed ושל ה-DB.

### f.5 הגירת `eplan.db`

| eplan (KnowledgeItem) | `rules` |
|---|---|
| `key` | `eplan.<key>`; `ref = EPLAN-<key>` |
| `value`, יחידה | `value`, `unit`; תוצאה `set_flag limit.<key>` + `block` (mandatory) / `warn` (לא mandatory) — **הצעה**: היום eplan מכשיל על כל גבול; ההורדה ל-warn היא החלטת ברק בסקירה |
| `text` | `name_he` (תרגום) |
| `source`, `source_location`, `authority_level` | `source.doc/section`, `eplan.authority_level` |
| `status CANDIDATE / LEVEL_0` | `verification: office` + `eplan.knowledge_status: CANDIDATE` |
| `status VALIDATED / LEVEL_2`, `reviewer` | `verification: validated`, `verified_by = reviewer` |
| `supersedes` | `supersedes` |

כיוון הסנכרון: **`rules` הוא המאסטר**. בזמן job של `services/cad`, המנוע מייצא את כללי `eplan.*` שב-`validated` (ו-`office` רק עם `--allow-candidates` → תוצאה PROVISIONAL) לתוך ה-knowledge store של eplan באותם ids; `eplan pv correct` (תיקון מהנדס) מחזיר מועמדים לתור הסקירה ב-UI. אין יותר `eplan pv seed --approve` מחוץ למנוע.

### f.6 תוכן ה-seed (`rules-seed.json`, 97 כללים)

- 9 כללי resolver (`track.*`), 29 רשומות ל-R1–R24 (R12 ו-R19 מפוצלים ל-a/b/c, R15 ל-a/b), 22 כללי משרד (`office.*`, scope design, `office`, `verified_by: Barak`), 18 גבולות eplan (`eplan.*`, `office` + CANDIDATE), 19 כללי תהליך/SLA חח"י (`iec.*`, `pua.*`, `inspection.*`). ספירה: pricing 14 · design 54 · submission 25 · inspection 4; unverified 14 · summary 27 · office 56 · validated 0.
- כל כלל עם `tests[]` (given/expect) שמהווים גם תיעוד של סמנטיקת הסף (למשל גבול 15 kW כולל).

---

## (g) זרימת מחלק היסטורי

- **זיהוי** (S01): כתובת ביישוב עם רשת מ"נ עצמאית → `Project.distributor = historic:<שם>`; `hd.01` רושם איש קשר, חברת ניהול (דוגמאות מהמחקר: "מירם"/"משקי רם" — [ידע כללי]) ו-`distributor.procedure_notes` (הנהלים של אותו מחלק נלמדים פעם אחת ונשמרים כתבנית-בת).
- **הגשה** (S05): `hd.02` בקשה **למחלק** (לא לחח"י) עם חד-קו, דפי נתונים ומסמכים לפי `procedure_notes`; `hd.03` סקר פנימי (רשת מ"נ של הקיבוץ); `hd.04` סקר חח"י לקיבולת המ"ג של המחלק (מוגש ע"י המחלק); `hd.05` תשובת המחלק → `S05.exit`. **אין SLA ידוע** → תזכורות 7/14/30 בלבד; `sla_source: לאימות (V11)`.
- **חיבור** (S10): `hd.06` בדיקת חיבור ע"י בודק/חשמלאי המחלק (בנוסף לבודק הפרטי של S09); `hd.07` מונה ותעריף מול המחלק (ההסדר מול חח"י ברמת המחלק); `hd.08` סגירה → `GridConnection{track: historic, distributor}`.
- **מה לא חל**: `digitalorders`, פורטל יצרנים, אגרת 704 ₪ — אלא אם המחלק מעביר לחח"י (לאימות). **מה כן חל**: `mun.*` (פטור/היתר), `fire.*`, כללי תכנון (R11–R15, eplan), `op.*` (אם הסף חל).
- **כללי מניה**: `production_meter_required`/`ct_metering` מחושבים כרגיל אך מסומנים "לאימות אם המחלק מיישם 35כ3".
- **ROI**: תעריף רכישה/הזנה מול המחלק — שדה חופשי עם מקור (הסכם), לא מטבלת R2–R4.

---

## (h) מצליבת פערי אימות (V1–V20)

| # | פער (תוכנית אב §18) | כללים חסומים/מסומנים | צעדים מושפעים | מה קורה עד האימות |
|---|---|---|---|---|
| V1 | מספרי אמות המידה ו-SLA 7/14/30 | `iec.sla.inspection_after_payment`, `iec.sla.connection_complete`, `iec.sla.survey_publication`, `iec.sla.distributor_answer`, `iec.refund.*` | `pre.07`, `insp.05`, `insp.08` | due לפי summary (7/30); תשובת מחלק ללא due — תזכורות בלבד; החזר = `candidate` |
| V2 | מהות ה-704 ₪ | `iec.fee.residential_pre_application`, `iec.fee.other_tracks_unknown` | `pre.06`, `insp.04`, `pre.07b` (mv) | 704.22 לביתי (תג לאימות); אחרים null → נלמד מהצעת חשבון |
| V3 | ספי 15/100/630, kW AC מול kWp | `track.basis_kw_ac`, `track.*`, R2, R8, R10, R18 (יחידת 700) | `pre.02`, `mun.01` | סיווג לפי kW AC; גבולות כוללים; warn בגבולות |
| V4 | תעריפי 2026, תעריף ביתי, תקרות מס | R1, R3, R4, R5, R6 | `tar.01` + ROI (S03) | ערכי תקציר עם תג לאימות בהצעה; מונה נטו עד 2026-12-31 כפרמטר |
| V5 | מסמכי טופס 22-8-22, טופס חדש, פורמטים, ייפוי כוח | `iec.form.22_8_22_required`, `iec.docs.pdf_only_*`, `iec.inspection.pack_contents` | `pre.03`, `pre.04`, `pre.05`, `insp.02`, `insp.03` | מפת שדות עם placeholders; PDF בלבד; POA מותנה |
| V6 | הצהרות מתקין/מתכנן, קונסטרוקטור, ביטוח, רשות מקומית | R18 (קונסטרוקטור), `iec.inspection.pack_contents` | `mun.02`, `insp.02` (`documents_conditional`) | בצ'קליסט כ"לא ידוע אם נדרש", לא חוסם |
| V7 | ספי בודק 1/2/3; חובת 62446-1 | R16 (טכנאי), R17, `inspection.report_62446_category1`, `iec.inspection.private_before_iec` | `insp.01` (שער), S09 | בחירת בודק ידנית; דוח 62446 כתבנית המשרד (אופציונלי בחבילה) |
| V8 | הנחיית חח"י הטכנית (מתח/תדר, anti-islanding, cos φ, ניתוק מרחוק, CT) | R9, R20, R21 (מקורות משרדיים); ללא כלל לערכי ממשק (**לא מקודדים**) | `insp.07`, spec ממיר ב-S06 | CT לפי >3×100A (office); הגדרות ממיר = פריט "לאימות" ב-verify של eplan |
| V9 | כבאות: הוראה 543/500, סף תוכנית אש, rapid shutdown | R19a/b/c | `fire.01–03` | שילוט/מנתקים תמיד; תוכנית אש = `null`+warn; אופטימייזרים כאופציה |
| V10 | היתר הפעלה 04/2026 — גדלים | `pua.operating_permit_04_2026` | `op.01–04` | רק `mv_gt630` → true; אחרים `null` → משימת בירור, לא חוסם S10 |
| V11 | מחלק היסטורי — תהליך | `track.historic_distributor` (תהליך), כל `hd.*` | `hd.01–08` | צעדים unverified; `procedure_notes` לכל מחלק |
| V12 | החלטה 70104 (מסלול מהיר) | `iec.fast_track_70104`, `iec.sla.small_system_marketing_30d` | `pre.07` | ציפייה 30 יום קלנדריים (שיווקי), לא due |
| V13–V16, V19 | ניטור/SolarEdge/Sungrow/Google Solar/WhatsApp/CAD | — | — | לא נוגעים למודול זה |
| V17 | פרטיות/DPO; חתימה אלקטרונית | חתימת לקוח על `iec_form_22_8_22` / `power_of_attorney` (OTP click-to-accept) | `pre.03`, `op.02` | חתימה מצוירת+OTP; לאמת עם עו"ד אם חח"י מקבלת |
| V18 | מספר הקצאה | — (חשבוניות) | — | לא נוגע |
| V20 | בדיקה חוזרת 5 שנים | `inspection.periodic_5y` | S12 תזכורת | תזכורת עם תג לאימות |

פערים נוספים מדוח 02 §8 שאינם ב-V1–V20 ומופיעים ב-seed: §8.3 תעריף משלים לאגירה (`tar.01` ל-`bess_add` — null), §8.8 ניסוח 35כ (R7/R8/R10 — office), §8.12 תנאי תקנה 24 (R18), §8.16 פטור מרישיון ייצור (אין כלל; להוסיף כשיאומת), 01 §11.9 בדיקה חוזרת בתשלום (`insp.06b`).

---

## אי-עקביות שנמצאו (לתיקון במסמכים האחרים)

1. **שמות פרופילי אסדרה**: `01-lifecycle-stages.json` → `RES_LE_15/COM_LE_100/COM_LE_630/LARGE_GT_630/BESS_ADD/HISTORIC_DIST`; תוכנית אב §3 ודוח 01 §12 → `residential_le15/…/mv_gt630/historic_distributor`. כאן נבחרו שמות תוכנית האב; ה-JSON נושא `lifecycle_profile_alias`.
2. **חתך הארקת קונסטרוקציה**: eplan `bond_structure_mm2_small = 10 mm²` עד 15 kWp (מקור "תקנות החשמל (PV) / IEC 62548 §7.4") מול R14/§17(ה) ו-`pv-design-rules.md §6` (קונסטרוקציה→פס ≥16 mm² ללא תלות בגודל; המשרד משתמש ב-16). שני הכללים ב-seed עם הערה; הכרעה לברק.
3. **תעריף ≤15 kW**: דוח 01 §3 "48 אג'" (midrag) מול דוח 02 "הצעה ~35 אג'" ו"ערך בתוקף לא אומת" — R4 נושא רק את תעריף הצריכה; תעריף ההזנה הביתי לא מקודד.
4. **R9**: בדוח 02 מסומן "[משרד] — לא אומת" — כאן `office` עם הערה (הנחיית חח"י לא אותרה).
5. **S05.exit**: תוכנית אב — "תשובת מחלק חיובית (או לא נדרש)"; ה-JSON — `profile.pre_application_not_required`; אין פרופיל שבו ההגשה המקדימה לא נדרשת (גם `bess_add` דורש אישור) — להגדיר מתי הדגל true או להסיר.
6. **מספר כללי eplan**: תוכנית אב/GENERATOR מדברים על "16 שורות"; `seed_items` מכיל 18 (שלושת מפתחות ה-bond נפרדים).
7. **יחידת סף הפטור (700)**: דוח 02 אומר "kW"; תוכנית אב §6.2 R18 "≤700 kW"; במסמכים אחרים מופיע kWp בהקשרים דומים — נקבע `p_ac_kw` עם הערת לאימות.
8. **"מונה קריאה מרחוק מעל 50 kW"** מופיע רק בתוכנית אב §6.1 (לאימות) ולא בדוחות — נכנס כ-`unverified`.
9. **`Submission.kind` בתוכנית אב §5** (`iec | historic | authority | fire`) מול שבעת הסוגים כאן — להרחיב את §5.
