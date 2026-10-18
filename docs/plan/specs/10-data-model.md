# 10 — מודל הנתונים של B.E.E Engine

| | |
|---|---|
| גרסה | 0.1 — טיוטה (2026-10-10) |
| מקורות | `00-master-plan.md` §3, §5, §6, §9, §11, §12, §15 · `01-lifecycle-stages.json` · דוח 04 §4/§8 · דוח 05 (מודל, RLS) · דוח 06 §5 · `apps/bee-solar-survey/src/types.ts` · `platform/schema/job.schema.json` |
| DDL | `docs/plan/schema/engine.sql` (סכמה `engine`, נטען ונבדק על Postgres 16: טריגרים, CHECK-ים ו-RLS לפי תפקיד) |
| סטטוס | טיוטת תכנון. כל מה שמסומן **לאימות** אינו מאומת. **אין במסמך זה מספרים רגולטוריים** — ספים, אגרות ותעריפים הם נתונים בטבלת `rules` עם רמת אימות |

---

## 0. עקרונות ומוסכמות

1. **Project הוא הציר.** כל ישות עסקית תלויה ב-`projects.id` (ישירות או דרך Site/Customer). `project_events` הוא מקור האמת למכונת המצבים; `projects.stage/status` הם cache.
2. **מקור אמת אחד; מסמכים = ייצוא.** `documents` מחזיקה קובץ + `sha256` + `generated_from` (מאיזה design rev / quote version / template / snapshot כללים נוצר). שינוי בנתונים → מסמך חדש (rev+1, `supersedes_id`), לא עריכה.
3. **גרסאות בלתי-ניתנות לשינוי.** `quote_versions` ננעלת ב-DB ברגע `sent_at IS NOT NULL`; `documents` לעולם לא נמחקים; `project_events`, `quote_events`, `rule_reviews` הם append-only. כולם נאכפים ב-trigger, לא רק בקוד.
4. **כל מספר עם מקור.** מחיר → `price_snapshot` (מחירון, רשומה, שער, כללי תמחור, זמן). כלל → `rules.source/section/verification/verified_by`. נתון טכני → `products.tech_source`. החלטת מהנדס → `designs.owner_accepted_by/at/reason`.
5. **כללים הם נתונים.** R1–R24 (דוח 02), 22 כללי המשרד וכללי eplan יושבים ב-`rules` עם `threshold jsonb`. כלל `unverified` יכול להציע שורה/צעד, והשורה מסומנת `verification_flag=true` ("לאימות") עד שברק מאשר.
6. **שער אמון ב-DB.** `jobs`: CHECK שאוסר יעד `customer`/`supplier` בלי `requires_human_pick=true` (Law #2). כל מעבר אוטומטי הוא job; `project_events.job_id` מקשר.
7. **טיפוסים.** `uuid` PK (`gen_random_uuid()`), `timestamptz`, כסף `numeric(14,2)` (+decimal.js בקוד; עיגול ROUND_HALF_UP לשורה), כמויות `numeric(12,3)`, snapshots/payload-ים `jsonb`, מספרי סעיף (`08.01.0010`) **טקסט**.
8. **PII.** ת"ז/ח"פ מוצפן (`customers.national_id_enc bytea`); אין צילומי ת"ז; EXIF מוסר מעותקי תמונות ללקוח; credential-ים הם reference בלבד (`credential_ref`), לעולם לא ערך.
9. **RLS כרשת ביטחון, הרשאות עסקיות בקוד.** כל request: `set_config('app.user_id', …, true)` + `set_config('app.role', …, true)`. פונקציית `engine.can_read_project(uuid)` (`SECURITY DEFINER` — אחרת רקורסיה) מרכזת את "מי רואה פרויקט". superuser/owner של הסכמה עוקף RLS — האפליקציה מתחברת כ-`app_rw` (לא owner).

**מקרא לטבלאות השדות:** `N` = nullable, `D` = default. "יוצר" = השלב שבו הרשומה נוצרת לראשונה; "מעדכן" = שלבים שמשנים אותה.

---

## 1. Enums (CREATE TYPE)

| enum | ערכים | הערות |
|---|---|---|
| `project_stage` | `S01 … S12` | לפי `01-lifecycle-stages.json`; S12 טרמינלי |
| `project_status` | `open · in_progress · waiting_customer · waiting_iec · waiting_supplier · waiting_engineer · blocked · done` | אחיד לכל שלב (§3) |
| `regulatory_track` | `residential_le15 · commercial_15_100 · commercial_100_630 · mv_gt630 · bess_add · historic_distributor` | שמות מתוכנית האב §3. **אי-התאמה:** ב-JSON השמות הם `RES_LE_15 · COM_LE_100 · COM_LE_630 · LARGE_GT_630 · BESS_ADD · HISTORIC_DIST` — לאחד (ראו §9) |
| `project_kind` | `pv_residential · pv_commercial · pv_agricultural · pv_ground · bess_add · pv_bess · other` | הצעה; `project.kind` נדרש ליציאה מ-S01 |
| `app_role_t` | `owner · engineer · pm · technician · surveyor · customer · inspector · supplier · agent` | §15 |
| `task_status` | `todo · in_progress · waiting · blocked · done · cancelled` | משימות, קריאות שירות |
| `dependency_type` | `FS · SS · FF · SF` | CPM |
| `document_kind` | 24 סוגי ה-`documents` מה-JSON (`survey_pdf … service_reports`) + קלטים: `photo · datasheet · constructor_drawing · electric_bill · receipt · correspondence · price_list_source · signature_certificate · other` | |
| `document_source` | `generated · upload · drive · pwa · email · vendor` | |
| `product_kind` | `module · inverter · optimizer · battery · breaker · cable · tray · cabinet · labour · service · fee` + הרחבות **לאימות עם ברק**: `structure · meter · spd · connector · other` | §5 |
| `price_list_audience` | `retail · b2b · subcontractor · internal` | דוח 04 §4.3 |
| `price_list_status` | `draft · pending_review · approved · superseded · rejected` | diff + אישור אנושי |
| `unit_basis` | `kWp · module · m · m2 · inverter · string · fixed · day · crew_day` | פרמטריזציה של ערכות |
| `pricing_rule_kind` | `markup · min_margin · rounding · vat · indexation · validity · auto_line · validation` | §6.2 |
| `quote_status` | `draft · pending_approval · sent · viewed · accepted · signed · rejected · expired · superseded` | |
| `quote_line_source` | `assembly · bom · manual · rule · dekel · change_order` | מאיפה הגיעה השורה |
| `quote_event_type` | `created · locked · sent · viewed · accepted · signed · rejected · expired · superseded · change_order` | |
| `invoice_kind` / `invoice_status` | `deposit · milestone · final · service · credit` / `draft · issued · paid · partially_paid · cancelled` | Morning מנפיק |
| `payment_method` | `transfer · card_link · cheque · cash · other` | |
| `currency` | `ILS · USD · EUR` | פריטים צמודי מט"ח שומרים `fx_rate` |
| `contract_status` | `draft · sent · signed · cancelled · superseded` | |
| `signature_method` | `click_otp · drawn_otp · pades · wet_ink_scan` | שלב א'/ב' |
| `submission_authority` | `iec · historic · authority · fire · municipality · other` | §5 (`iec \| historic \| authority \| fire`) + הרחבה |
| `submission_kind` | `iec_pre_application · iec_inspection_meter · tariff_registration · operating_permit · historic_distributor · exemption_report · fire_safety · other` | S05/S10/R18/R19 |
| `submission_status` | `draft · in_progress · submitted · waiting_authority · answered_positive · answered_negative · completed · not_required · cancelled` | |
| `submission_step_status` | `not_started · in_progress · waiting_customer · waiting_payment · ready_to_submit · submitted · waiting_authority · answered · rejected · done · skipped` | מזין "ממתין ל-X" |
| `correspondence_channel` / `direction` | `email · whatsapp · sms · phone · portal · letter · meeting` / `inbound · outbound · internal` | |
| `po_status` | `draft · sent · confirmed · partially_delivered · delivered · cancelled` | |
| `work_order_status` | `planned · scheduled · in_progress · paused · done · cancelled` | |
| `checklist_kind` | `installation · commissioning · handover · maintenance · safety` | |
| `change_order_status` | `draft · sent · signed · rejected` | |
| `inspection_kind` / `inspection_status` | `inspector · iec · periodic · thermal · re_inspection` / `planned · in_progress · report_draft · signed · failed` | |
| `test_category` / `test_kind` | `cat1 · cat2` / `visual · earth_continuity · polarity · voc · isc · functional · insulation_dc · combiner · iv_curve · thermal · other` | IEC 62446-1 (דוח 06 §5.1) |
| `defect_severity` / `defect_status` | `blocking · major · minor · note` / `open · fixed · verified · waived` | יציאה מ-S09: 0 `open` |
| `monitoring_vendor` | `solaredge_v1 · solaredge_v2 · huawei · sungrow · solis · growatt · solarman · deye · enphase · tigo · goodwe · saj · kstar_modbus · sunspec_modbus · other` | §12 |
| `auth_mode` | `fleet_key · site_key · oauth · account_login · modbus_local · none` | |
| `sharing_status` | `not_requested · requested · shared · denied · revoked · not_applicable` | "not in account list" → `requested` + משימה |
| `monitoring_link_status` | `pending · active · degraded · inactive` | יציאה מ-S11: `active` |
| `maintenance_tier` | `basic · standard · premium · custom` | |
| `ticket_priority` | `low · normal · high · urgent` | |
| `alert_kind` | `comm_loss · zero_production · inverter_alarm · underperformance · string_imbalance · riso · curtailment · iec_meter_mismatch · warranty_due · inspection_due · customer_request · other` | טקסונומיית §12 |
| `rule_verification` | `unverified · summary · office · validated` | §5 |
| `rule_scope` | `tariff · grid · protection · earthing · dc · licensing · permit · fire · bess · standard · pricing · office · eplan` | |
| `rule_consequence_kind` | `auto_line · document · validation · block · field · info` | מה הכלל עושה |
| `job_kind` / `job_status` / `trust_tier` | `collect · edit · dispatch` / `queued · running · succeeded · failed · blocked_trust · cancelled` / `L0 · L1 · L2` | `job.schema.json` |
| `outbound_channel` / `destination_class` | `whatsapp · email · db · none` / `self_chat · neri_group · drafts_group · voice_transcripts · customer · supplier · other` | `job.schema.json` |
| `approval_status` | `pending · approved · rejected · expired` | Trust Gate |

---

## 2. תפקידים ו-RLS — מודל כללי

| תפקיד | `can_read_project` | כתיבה |
|---|---|---|
| owner (ברק) | הכל | הכל; reviewer של `rules` (החלטה פתוחה §17.9) |
| engineer / pm | הכל | פרויקטים, מסמכים, הגשות, מעברי שלב |
| agent (AI) | קריאה כמו engineer | **רק** דרך `approvals` (Trust Gate); `jobs` משלו |
| surveyor | פרויקטים ב-S01/S02 או ששובץ אליהם (`project_members`) | `surveys`, `photos` |
| technician | רק `project_members` | `checklists`, `daily_reports`, `photos`, סימון משימות |
| inspector | רק `project_members` בחלון `valid_from..valid_to` | `inspections`/`test_results` שלו; קורא רק מסמכי תכנון/בדיקה |
| customer | הפרויקט שלו (`contacts.portal_user_id`) וגם `projects.customer_visible` | חתימה, העלאה, תשלום (דרך API, לא ישירות) |
| supplier | **לא** פרויקטים — רק `purchase_orders` שלו (`suppliers.portal_user_id`) | אישור מועד, תעודת משלוח |
| `n8n_reader` (DB role) | views ממוסכים בלבד (`projects_n8n_v`) — ללא טלפונים/ת"ז/כתובת מלאה | אין |

עלויות פנימיות (`unit_cost`, `cost_total`, `margin_pct`) מוסתרות מלקוח דרך **view** (`quote_lines_customer_v`), לא דרך RLS (RLS היא ברמת שורה). בדיקה בפועל (engine.sql, תפקיד `app_rw`): לקוח רואה 1 פרויקט ו-1 מסמך `customer_visible`; טכנאי רק פרויקט משובץ; engineer הכל; anonymous 0.

---

## 3. ישויות לפי מודול

### 3.1 CRM — `customers` (Customer)

**מטרה:** הלקוח המשפטי/המסחרי. גשר ל-184 לקוחות bee-live ולייבוא Monday.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `id` | uuid | | gen | PK |
| `legacy_bee_live_customer_id` | text | N | | מזהה בטבלת הלקוחות הקיימת — **שם העמודה שם לאימות** |
| `monday_item_id` | text | N | | ייבוא חד-פעמי |
| `kind` | text | | `private` | `private · business · kibbutz · moshav · public` (CHECK) |
| `name` | text | | | |
| `national_id_enc` | bytea | N | | ת"ז/ח"פ מוצפן (PII) |
| `vat_number`, `billing_address`, `notes` | text | N | | |
| `language` | text | | `he` | |
| `created_at`, `updated_at` | timestamptz | | now | trigger `set_updated_at` |

יוצר: **S01** (intake). מעדכן: כל שלב. RLS: צוות + agent + surveyor; לקוח רק את עצמו. אינדקסים: PK בלבד (מעט שורות).

### 3.2 `contacts` (Contact)

**מטרה:** אנשי קשר אצל הלקוח; מי מחזיק משתמש פורטל; opt-in ל-WhatsApp.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `id` | uuid | | gen | |
| `customer_id` | uuid | | | FK customers |
| `full_name` | text | | | |
| `role_he` | text | N | | בעלים / גזבר / מנהל |
| `phone_e164`, `email` | text | N | | |
| `whatsapp_optin` | bool | | false | תבניות Meta דורשות opt-in |
| `is_primary` | bool | | false | **אינווריאנט:** איש קשר ראשי אחד ללקוח (unique partial index) |
| `portal_user_id` | uuid | N | | FK app_users — מפתח ה-RLS ללקוח |

יוצר: S01. אינדקסים: `(customer_id)`, `UNIQUE(customer_id) WHERE is_primary`.

### 3.3 `sites` (Site)

**מטרה:** האתר הפיזי; נתוני חיבור חח"י; `distributor` למחלק היסטורי. אתר חי מעבר לפרויקט (תחזוקה, הרחבות, BESS).

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `id` | uuid | | gen | |
| `customer_id` | uuid | | | FK |
| `legacy_bee_live_site_id` | text | N | | גשר לטבלת האתרים הקיימת — **לאימות** |
| `address_line` | text | | | |
| `city`, `gush`, `helka` | text | N | | גוש/חלקה להיתר/דיווח פטור (R18) |
| `lat`, `lon` | double | N | | |
| `timezone` | text | | `Asia/Jerusalem` | |
| `iec_contract_number`, `iec_bp_number` | text | N | | מחשבון החשמל (S01/S02) |
| `connection_phases` | smallint | N | | 1/3 (CHECK) |
| `connection_amps`, `connection_kva` | numeric | N | | קלט ל-R7 (P/0.9 ≤ S) |
| `distributor` | text | N | | NULL = חח"י; אחרת שם המחלק ההיסטורי |
| `roof_type` | text | N | | קנוני מה-PWA |

יוצר: S01. מעדכן: S02 (סקר), S10 (חיבור). RLS: צוות; לקוח דרך פרויקט. אינדקס `(customer_id)`.

### 3.4 `projects` (Project)

**מטרה:** הציר. מצב (cache), פרופיל אסדרה, בעלים, SLA.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `id` | uuid | | gen | |
| `number` | text | | | `P-2026-0142`, UNIQUE |
| `customer_id`, `site_id` | uuid | | | FK |
| `kind` | project_kind | | | |
| `stage` | project_stage | | `S01` | cache של XState |
| `status` | project_status | | `open` | |
| `stage_entered_at` | timestamptz | | now | מתעדכן אוטומטית ב-trigger כשה-stage משתנה |
| `sla_due_at` | timestamptz | N | | מחושב מ-`stage_defs.sla_days` בימי עבודה |
| `blocked_reason`, `blocked_owner_id` | text/uuid | N | | **CHECK:** `status='blocked'` ⇒ שניהם לא NULL |
| `xstate_snapshot` | jsonb | N | | cache; ניתן לשחזור מ-`project_events` |
| `regulatory_track` | regulatory_track | N | | משוער ב-S01/S03, מאומת ב-S05 (`regulatory_track_confirmed_at`) |
| `distributor` | text | N | | עותק מהאתר ב-intake |
| `estimated_kwp`, `estimated_kwh_year`, `export_limit_kw` | numeric | N | | `export_limit_kw` ← R10 |
| `owner_user_id`, `pm_user_id` | uuid | N | | |
| `lead_source`, `monday_item_id` | text | N | | |
| `customer_visible` | bool | | true | פורטל |

**אינווריאנטים:** מעבר שלב רק דרך `transition()` בטרנזקציה אחת עם INSERT ל-`project_events` (אכיפה ב-DB כ-deferred constraint trigger — **לאימות ביישום**); `blocked` חייב סיבה+בעלים (CHECK); S05‖S06 — ה-`stage` מייצג את השלב הקדמי, ו-`submissions` מחזיק את מצב S05 בנפרד.
יוצר: S01. מעדכן: כל מעבר. RLS: `can_read_project(id)`; כתיבה owner/engineer/pm.
אינדקסים: `(customer_id)`, `(site_id)`, `(stage, status)`, partial `(sla_due_at) WHERE stage<>'S12'`, partial `(status, stage_entered_at) WHERE status IN (waiting_*, blocked)` — מזין "תקועים".

### 3.5 `project_events` — append-only

**מטרה:** מקור האמת של מכונת המצבים; audit של כל מעבר/rollback/שינוי סטטוס/מסמך.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `id` | bigserial | | | |
| `project_id` | uuid | | | FK |
| `seq` | int | | trigger | רץ לכל פרויקט; `UNIQUE(project_id, seq)` |
| `type` | text | | | `stage.transition · stage.rollback · status.change · task.done · document.generated · submission.answered · …` |
| `from_stage/to_stage/from_status/to_status` | enums | N | | |
| `payload` | jsonb | | `{}` | |
| `reason` | text | N | | חובה ב-rollback וב-blocked (אכיפה בקוד) |
| `actor_id`, `actor_role` | uuid/enum | N | | |
| `job_id` | uuid | N | | FK jobs — המעבר האוטומטי שגרם |
| `created_at` | timestamptz | | now | |

**אי-שינוי:** trigger מונע UPDATE/DELETE (`project_events_immutable`). יוצר: S01 ואילך, כל שלב. RLS: קריאה = `can_read_project`. אינדקסים: `(project_id, created_at)`, `(type)`.

### 3.6 `communication_log` (CommunicationLog)

**מטרה:** כל הודעה ללקוח/ממנו (WhatsApp/מייל/SMS/טלפון) עם התבנית, הכיוון, ה-job וה-approval.

שדות עיקריים: `customer_id` (FK), `project_id` N, `contact_id` N, `channel`, `direction`, `template_key` N (שם תבנית Meta), `subject`, `body`, `external_id` (WA msg id/Gmail id), `job_id` N (dispatch job), `approved_by` N, `sent_at`/`received_at` N.
**אינווריאנט:** `direction='outbound'` ל-customer ⇒ `job_id` עם `requires_human_pick=true` ו-`approved_by` (אכיפה בקוד; ב-DB — CHECK על jobs). יוצר: S01–S12. RLS: צוות; לקוח רואה את שלו (דרך API). אינדקסים: `(customer_id, created_at DESC)`, `(project_id, created_at DESC)`.

### 3.7 Workflow — `stage_defs`, `business_calendar`, `schedule_templates`, `schedules` (Schedule), `milestones` (Milestone), `tasks` (Task), `task_dependencies`

**`stage_defs`** — מראה של `01-lifecycle-stages.json` כנתונים (עריכה ב-UI): `stage` PK, `key`, `name_he`, `owner_role` (text — ערכי ה-JSON `sales/foreman/procurement/service` אינם ב-`app_role_t`, ראו §9), `sla_days`, `sla_source`, `parallel_with[]`, `entry/exit jsonb`, `documents document_kind[]`, `auto_tasks text[]`, `customer_visible`, `terminal`.

**`business_calendar`** — `day` PK, `is_workday`, `holiday_key`, `name_he`, `half_day`, `source` (`@hebcal/core il:true`). פונקציה `engine.add_business_days(date, n)` (נבדקה: 1.10.2026 + 7 י"ע = 12.10.2026 בלוח א'–ה' ללא חגים). משרתת `submission_steps.due_at`, `projects.sla_due_at`, CPM.

**`schedule_templates`** — תבנית לו"ז לפרופיל: `key`, `regulatory_track` N, `activities jsonb` `[{key, stage, duration_days, depends_on[], lag_days, buffer_days, resource}]`.

**`schedules`** (Schedule, CPM) — אחד לפרויקט (`UNIQUE(project_id)`): `template_id`, `baseline_at` + `baseline jsonb` (מוקפא ב-S04), `computed_at`, `critical_path uuid[]`, `planned_finish`. יוצר: **S04** (`create_schedule_from_template`). מעדכן: S05–S11 לפי מציאות.

**`milestones`** (Milestone) — `UNIQUE(project_id, key)`: `key` (`contract_signed · iec_answer · installation_done · meter_installed …`), `name_he`, `stage`, `planned_at`, `actual_at`, `customer_visible`, `payment_trigger` (תשלום מדורג צמוד לאבן דרך → `invoices.milestone_id`). יוצר: S04. מעדכן: כל שלב.

**`tasks`** (Task) — `project_id`, `schedule_id` N, `stage`, `key` (auto_task), `title`, `status task_status`, `assignee_id`, `crew_id`, `resource_key` (מנוף/בודק), `due_at`, `duration_days`, שדות CPM (`planned_start/finish`, `early_*`, `late_*`, `slack_days`, `actual_*`), `checklist jsonb`, `requires jsonb`, `source_defect_id` (S09→S08), `gcal_event_id` (סנכרון Google Calendar), `created_by`.
**`task_dependencies`** — `(pred, succ)` PK, `type FS/SS/FF/SF`, `lag_days`, CHECK pred≠succ.
יוצר: S01 ואילך (auto_tasks בכל שלב). RLS: `can_read_project`; טכנאי רואה רק משימות של פרויקטים משובצים. אינדקסים: `(project_id, status)`, partial `(assignee_id, due_at)` ו-`(due_at)` לפתוחות ("היום שלי").

### 3.8 Survey · Photo — `surveys`, `photos` (S02)

**`surveys`** (Survey) — משמר את סכמת ה-PWA: עמודות מנותחות + `raw_pwa jsonb` (עותק מלא, לא משתנה). מיפוי מלא ב-§4.
שדות מפתח: `project_id` FK, `pwa_project_id` (UNIQUE partial — מחליף `customer.id=[OPEN]`), `survey_date`, `surveyor_user_id`/`surveyor_name`, `lat/lon/gps_text/address`, בלוק חשמל (`main_breaker_a`, `panel_space`, `solar_breaker_a`, `meter_number`, `meter_type`, `meter_location`, `cable_length_m`, `cable_notes`), בלוק גג (`roof_type_he`, `roof_type`, `inverter_location`, `usable_area_m2`, `azimuth_deg`, `tilt_deg`, `annual_consumption_kwh`), יעד (`target_kwp`, `budget_ils`, `inverter_brand_pref`, `include_battery`), `general_notes`, `custom_fields jsonb`, `completeness jsonb` + `completeness_ready bool`, `owner_override_by/reason` (**CHECK:** override ⇒ reason), `pwa_created_at/updated_at`, `synced_at`.
**אינווריאנט יציאה מ-S02:** `completeness_ready OR owner_override_by IS NOT NULL`. יוצר: S02 (sync מה-PWA). מעדכן: S02 בלבד; אחרי S03 הסקר קפוא (אכיפה בקוד; סקר חוזר = רשומה חדשה). RLS: סוקר רואה S01/S02 או שיבוץ. אינדקסים: `(project_id)`, `UNIQUE(pwa_project_id)`.

**`photos`** (Photo) — `project_id`, `survey_id` N, `document_id` N (הקובץ המקורי), `field` (`PhotoFieldKey` של ה-PWA או `install_before/after · defect · thermal`), `pwa_photo_id`, `sha256`, `mime_type`, `r2_key_original/web/thumb`, `taken_at`/`exif_lat/lon/heading` (exifr — מאמת שהצילום מהאתר), `annotated`, `caption`, `customer_visible` (עותק ללא EXIF). `UNIQUE(project_id, sha256)` — dedupe בסנכרון אופליין. יוצר: S02, S08, S09, S12. אינדקס `(project_id, field)`.

### 3.9 Design · CalcReport · DrawingSet · BOM — `designs`, `calc_reports`, `drawing_sets`, `boms`, `bom_lines`

**`designs`** (Design) — `UNIQUE(project_id, rev)`; `mode` ∈ `lite` (S03) / `full` (S06) / `as_made` (S10–S11).
שדות: `spec_yaml` (מילולי) + `spec_sha256` + `spec_json` (מפורסר), `layout_geojson` (גג/הפרעות/גריד), `layout_source` (`constructor_dxf · constructor_pdf · vision · manual_ortho`), `kwp_dc`, `kw_ac`, `module_product_id`/`inverter_product_id` (FK products), `module_count`, `strings jsonb`, `yield_kwh_year`, `yield_monthly[12]`, `pr_design`, `pvgis_cache`, `verify_items jsonb` (סימוני `# VERIFY`), `all_checks_pass`, `owner_accepted_by/at/reason`, `rules_snapshot`, `superseded_by_id`.
**אינווריאנט יציאה מ-S06:** `verify_items = []` AND (`all_checks_pass` OR `owner_accepted_by`) AND drawing_set approved. **אי-שינוי:** design rev שממנו הופק מסמך/הצעה לא נערך — rev חדש (אכיפה בקוד; ה-`spec_sha256` מאפשר זיהוי "ישן" ב-`documents.stale`). RLS: `can_read_project`; inspector רואה דרך drawing_sets. אינדקס `(project_id, rev DESC)`.

**`calc_reports`** (CalcReport) — `design_id`, `job_id`, `eplan_version`, `status pass/blocked/failed`, `summary jsonb` (STATUS/RESULT/NEXT), `checks jsonb` `[{check, result, rule_id, value, limit, source}]`, `blocks jsonb` (`HUMAN_INPUT_REQUIRED`), `document_id`. יוצר: S03 (מהיר), S06. append בפועל (הרצה חדשה = רשומה חדשה).

**`drawing_sets`** (DrawingSet) — `UNIQUE(design_id, set_rev)`; `status draft/issued/approved/as_made`; `sheets jsonb` `[{code:'E-01', title_he, dxf_doc_id, pdf_doc_id, png_doc_id, svg_doc_id}]`; `dwg_document_id` (DWG 2018 מה-worker), `pdf_document_id` (PLOT לפי CTB), `audit_result` (0/0/0), `cad_worker_job_id`, `approved_by/at`. יוצר: S06; As-Made ב-S10.

**`boms`** (BOM) + **`bom_lines`** — `source assemblies/eplan/manual`, `csv_document_id`, `diff_vs_quote_version_id` + `diff jsonb` (ההפרש שמוצג לברק, §6.2). שורה: `line_no`, `product_id`, `sku`, `description_he`, `unit`, `qty numeric(12,3)`, `geometry_ref` (גיליון/שכבה), `rule_ids[]` (R8/R11/R14… שכפו את השורה). יוצר: S03 (ערכות), S06 (eplan מחליף). מזין S07 (`po_lines.bom_line_id`).

### 3.10 Catalog — `suppliers`, `products`, `price_lists`, `price_list_entries`, `assemblies`, `assembly_components`, `pricing_rules`, `discount_schedules`, `approval_thresholds` (M1)

**`suppliers`** (Supplier) — `name`, `vat_number`, `contact jsonb`, `lead_time_days_default`, `payment_terms`, `portal_user_id` (RLS לספק), `is_active`.

**`products`** (Product) — `sku` UNIQUE, `kind product_kind`, `name_he/en`, `manufacturer`, `model`, `unit`, **`tech jsonb`** (שדות דף נתונים ל-eplan: `voc, isc, vmp, imp, temp_coeff_voc, temp_coeff_isc, mppt[{v_min,v_max,i_max,isc_max}], p_nom, phases, has_rcmu, iec62109_declared …`), `tech_source jsonb` `{document_id, page, verified_by, verified_at}`, `cec_key`, `datasheet_document_id`, `available_il` (כלל משרד #4), `preferred_rank`, `default_supplier_id`, `block_library_ref` (ארון/סמל בספריית הבלוקים), `is_active`. עבודה/שירותים/אגרות הם גם Products (`labour · service · fee`). RLS: קריאה לכל הצוות; כתיבה owner/engineer. אינדקס partial `(kind) WHERE is_active`.

**`price_lists`** (PriceList) — `supplier_id` N (NULL = פנימי), `name`, `audience`, `currency`, `valid_from`, `valid_to` N, `status`, `source_document_id` + `source_sha256`, `ingest_method` (`excel · csv · pdfplumber · camelot · claude_structured · manual`), `previous_id` + `diff_vs_previous jsonb`, `approved_by/at`. **CHECK:** `approved` ⇒ `approved_by`. **אי-שינוי:** מחירון `approved` לא נערך — מחירון חדש עם `previous_id` (אכיפה בקוד). View `stale_price_lists_v` (>180 יום — פרמטר **לאימות**) מזין דיווח בוקר. אינדקס `(supplier_id, valid_from DESC)`.

**`price_list_entries`** (PriceListEntry) — `UNIQUE(price_list_id, product_id, min_qty)`: `supplier_sku`, `cost numeric(14,2)`, `currency`, `fx_rate`, `list_price` N, `min_qty`, `block_from`, `lead_time_days`, `source_ref` ("עמוד 3 שורה 12"). אינדקס `(product_id)`.

**`assemblies`** (Assembly, "ערכה") — `key` UNIQUE, `name_he`, `params jsonb` (תחולה: roof_type, inverter_brand, kwp range, phases), `boq_section_code`, `version`. **`assembly_components`** — `product_id`, `qty_per_unit numeric(12,4)`, `unit_basis` (qty = qty_per_unit × basis), `qty_formula` N (ביטוי — **לאימות** איזו שפה: CEL/JS-subset), `rounding`, `optional`, `sort`. ערכה בשימוש בהצעה שנשלחה לא נערכת — `version+1` (ה-`price_snapshot` של השורה שומר את הערכה ממילא).

**`pricing_rules`** (PricingRule) — `kind`, `key` UNIQUE, `applies_to jsonb`, `expr jsonb` (`{factor}` / `{percent}` / `{rule_id, product_sku}`), `rule_ref` (R7–R24 כשמדובר ב-`auto_line/validation`), `priority`, `valid_from/to`, `message_he`. מע"מ = `kind='vat'` עם תוקף (לא קבוע בקוד).
**`discount_schedules`** (DiscountSchedule) — `basis kwp/total/qty`, `tiers jsonb [{from,to,percent}]`, תוקף.
**`approval_thresholds`** (ApprovalThreshold) — `key` (`discount_pct_max · margin_pct_min · quote_total_max`), `value`, `approver_role`. חריגה ⇒ `quote_versions.needs_approval=true` ⇒ `approvals`.

### 3.11 Quote · QuoteVersion (immutable) · QuoteSection · QuoteLine · quote_events · ChangeOrder (S03–S04, S06, S08)

**`quotes`** (Quote) — `project_id`, `number` UNIQUE (`Q-2026-0142`), `current_version_id` (FK מאוחר), `status`. מצביע בלבד; התוכן בגרסאות.

**`quote_versions`** (QuoteVersion) — `UNIQUE(quote_id, version_no)`.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `status` | quote_status | | draft | |
| `design_id`, `bom_id` | uuid | N | | S03 lite / S06 BOM |
| `inputs` | jsonb | | | `{kWp, roof_type, modules, inverter, phases, regulatory_track…}` |
| `price_list_ids` | uuid[] | | `{}` | המחירונים שהשתתפו |
| `rules_snapshot`, `pricing_rules_snapshot` | jsonb | | `{}` | הקפאת כללים (גרסה+verification) |
| `vat_pct` | numeric(5,2) | | | פרמטר עם תוקף, נשמר בגרסה |
| `currency`, `fx_rates` | | | ILS | שערי יום |
| `subtotal`, `discount_total`, `total_before_vat`, `vat_amount`, `total_incl_vat` | numeric(14,2) | | 0 | |
| `cost_total`, `margin_pct` | | N | | פנימי בלבד |
| `payment_schedule` | jsonb | N | | `[{milestone_key, percent, amount, trigger}]` צמוד אישורי חח"י |
| `roi` | jsonb | N | | תפוקה, חיסכון, החזר, NPV/IRR, תזרים 25 שנה, `tariff_rule_ids` (R1–R6) |
| `validity_days`, `valid_until`, `indexation`, `warranty_terms`, `exclusions_he`, `notes_he` | | | 30 | |
| `needs_approval`, `approved_by/at` | | | false | סף הנחה/רווח |
| **`sent_at`** | timestamptz | N | | **NOT NULL ⇒ נעול** |
| `sent_via`, `sent_job_id` | | N | | שער אמון |
| `pdf_document_id`, `xlsx_document_id`, `pdf_sha256`, `xlsx_sha256` | | N | | **CHECK:** `sent_at` ⇒ `pdf_sha256` |
| `accepted_at`, `rejected_at`, `rejection_reason` | | N | | מותרים לעדכון אחרי נעילה |
| `supersedes_id` | uuid | N | | שרשרת רוויזיות |

**אי-שינוי (נבדק ב-DB):** trigger `quote_versions_lock_on_sent` — אחרי `sent_at` מותר לשנות רק `status, accepted_at, rejected_at, rejection_reason`; כל עמודה אחרת ⇒ שגיאה עם שם העמודה. `quote_lines`/`quote_sections` של גרסה שנשלחה חסומים ל-INSERT/UPDATE/DELETE. DELETE של גרסה שנשלחה חסום. שינוי = גרסה חדשה (`supersedes_id`) או `change_orders`.
יוצר: **S03** (`price_from_assemblies`). מעדכן: S03 (טיוטה), S04 (רוויזיות = גרסאות), S06 (BOM → גרסה חדשה, `source='bom'`), S08 (פקודת שינוי). RLS: לקוח רואה רק גרסאות עם `sent_at`; עלויות דרך view. אינדקס `(quote_id, version_no DESC)`.

**`quote_sections`** (QuoteSection) — `UNIQUE(version_id, code)`: `code` טקסט (`08.01`), `title_he`, `sort`, `customer_visible` (פרק פנימי, למשל "עלויות"). פרקי ברירת מחדל: מפרט כללי 08 + פרקי PV (§6.3).

**`quote_lines`** (QuoteLine) — `UNIQUE(version_id, line_no)`: `line_no` טקסט (`08.01.0010`), `product_id` N, `assembly_id` N, `description_he`, `unit`, `qty`, `unit_cost` N (פנימי), `unit_price`, `discount_pct`, `total` (ROUND_HALF_UP לשורה), `currency`, `fx_rate`, `source quote_line_source`, `rule_ids[]`, **`verification_flag`** (שורה מכלל `unverified` → "לאימות" בהצעה), **`price_snapshot jsonb`** `{product_id, price_list_id, price_list_entry_id, cost, fx_rate, pricing_rule_ids[], at}`, `optional`, `sort`.

**`quote_events`** — append-only (trigger): `type`, `actor_kind user/customer/agent/system`, `ip inet`, `user_agent`, `document_sha256` (איזה PDF בדיוק נשלח/נצפה/אושר), `payload`. מוכיח "מה הלקוח אישר".

**`change_orders`** (ChangeOrder) — `UNIQUE(quote_id, number)`: `base_version_id` (חתומה), `new_version_id`, `reason_he`, `origin field/design/customer/iec/supplier`, `work_order_id` N (מקור S08), `delta_lines jsonb` (רק שורות שהשתנו), `delta_total`, `status`, `document_id`, `signature_id`. אחרי חתימה `quotes.current_version_id` = החדשה; הישנה נשארת לעד. יוצר: S04–S08.

### 3.12 Contract · Signature · Invoice · Payment — `contracts`, `signatures`, `invoices`, `payments` (S04, S11, S12)

**`contracts`** (Contract) — `project_id`, `quote_version_id` (החתומה), `number` UNIQUE, `template_rev`, `status`, `document_id` (לא חתום) / `signed_document_id`, `total_incl_vat`, `payment_schedule jsonb` (עותק מהגרסה), `sent_at`, `signed_at`, `supersedes_id`. **אינווריאנט יציאה מ-S04:** `signed_at` + תשלום מקדמה (`invoices.kind='deposit'` שולם). חוזה חתום לא נערך — `supersedes_id` (אכיפה בקוד; מסמך חתום מוגן ב-`documents`).

**`signatures`** (Signature) — פולימורפי: `subject_table` + `subject_id` (`contracts · quote_versions · change_orders · handover_packs · inspections · daily_reports · maintenance_contracts`), `signer_contact_id`/`signer_user_id`/`signer_name`/`signer_phone`, `method`, **`document_sha256`** (ה-PDF שהוצג), `otp_channel`, `otp_verified_at`, `drawn_signature_r2_key`, `ip inet`, `user_agent`, `geo jsonb`, `certificate_document_id` ("דף תעודה"), `pades_provider` (שלב ב'), `signed_at`. **אי-שינוי:** אין UPDATE/DELETE (להוסיף trigger כמו events — **לאימות** האם חותמים חוזרים). אינדקס `(subject_table, subject_id)`.

**`invoices`** (Invoice) — `project_id` N, `customer_id`, `maintenance_contract_id` N (S12), `kind`, `milestone_id` N, `quote_version_id` N, `status`, `amount_before_vat/vat_amount/amount_incl_vat`, `currency`, `provider morning/icount/manual`, `provider_doc_id`, `provider_doc_number`, **`allocation_number`** (מספר הקצאה — סף **לאימות V18**), `document_id`, `issued_at`, `due_at`, `paid_at`. יוצר: S04 (`deposit`), S08/S10 (אבני דרך), S11 (`final`), S12 (`service`). אינדקסים `(project_id)`, `(customer_id, status)`.

**`payments`** (Payment) — `invoice_id` N, `project_id` N, `customer_id`, `amount`, `currency`, `method`, `provider grow/cardcom/bank`, `provider_ref`, `receipt_document_id`, `received_at`, `recorded_by`. משמש גם לתשלום אגרות חח"י (`submission_fees.payment_id`).

### 3.13 Submission · SubmissionStep · Form · Fee/Receipt · Correspondence — `submission_templates`, `submissions`, `submission_steps`, `forms`, `submission_fees`, `correspondence` (S05, S10)

**`submission_templates`** — תבנית לפי `kind` × `regulatory_track`: `steps jsonb` `[{key, name_he, order, required_documents[], fee{product_sku}, sla_business_days, sla_rule_id, signers[], waits_on}]`, `rule_ids[]` (R2, R8, R17, R18…), **`verification`** (תבנית שלמה יכולה להיות `unverified` — V5/V6/V11), `version`. מחלק היסטורי = תבנית נפרדת.

**`submissions`** (Submission) — גנרי לכל גוף חיצוני: `project_id`, `kind`, `authority`, `template_id` + `template_version`, `stage` (S05/S10/S06), `status`, `external_ref` (מס' תיק/הזמנה ב-digitalorders), `portal` (`digitalorders · hamaagal · producers_portal · email · distributor`), `submitted_at/by`, `answered_at`, `answer jsonb` `{positive, approved_kw, conditions_he, document_id}`, `due_at` (SLA בימי עבודה — **V1 לאימות**), `pack_document_id` (PDF ממוזג), `notes`.
**אינווריאנט יציאה מ-S05:** `kind='iec_pre_application'` עם `status='answered_positive'` **או** `not_required` לפי פרופיל. **S10:** `iec_inspection_meter` completed + `tariff_registration` completed + (`operating_permit` completed או not_required — **V10**). יוצר: S05, S10 (`build_submission_steps_from_profile`). RLS: צוות; לקוח רואה סטטוס אבן-דרך בלבד (לא את הרשומה). אינדקסים `(project_id)`, partial `(status, due_at)` לממתינים.

**`submission_steps`** (SubmissionStep) — `UNIQUE(submission_id, key)`: `name_he`, `step_order`, `status submission_step_status`, `owner_id`, `required_document_kinds[]`, `document_ids uuid[]`, `external_ref`, `started_at`, `submitted_at`, **`due_at` = `add_business_days(submitted_at, sla_business_days)`**, `sla_rule_id`, `done_at`, `blocked_reason`, `verification_flag`. "ממתין ל-X" לדיווח בוקר = צעדים `submitted/waiting_authority` עם `due_at < now()`.

**`forms`** (Form) — `form_key` (למשל טופס בקשת שילוב — **גרסת הטופס לאימות V5**), `form_version`, `template_document_id` (PDF ריק), `field_values jsonb` (ממולא מ-Project/Site/Survey/Design), `filled_document_id`, `filled_at`, `signed_by jsonb` `[{role: installer|designer|customer, signature_id}]`.

**`submission_fees`** (Fee/Receipt) — `step_id` N, `fee_product_id` (Product `kind='fee'` — הסכום בא מהמחירון, לא מקוד), `description_he`, `amount` (כפי שחויב בפועל; למשל הקבלה מ-28.09.26 — **מהות לאימות V2**), `currency`, `payment_request_ref` ("הצעת חשבון"), `paid_at`, `paid_by customer/bee`, `receipt_ref` (אסמכתא), `receipt_document_id`, `payment_id`, `ocr_payload jsonb` (חילוץ Claude vision, ממתין לאישור), `confirmed_by`. **אינווריאנט:** קבלה שנקלטה ב-OCR לא סוגרת צעד בלי `confirmed_by`.

**`correspondence`** (Correspondence) — `step_id` N, `channel`, `direction`, `counterpart` ("חח"י מחוז דרום"/"מחלק קיבוץ X"), `subject`, `body`, `external_id` (Gmail thread), `document_ids[]`, `occurred_at`, `recorded_by`. אינדקס `(submission_id, occurred_at)`.

### 3.14 PurchaseOrder · POLine · Delivery — `purchase_orders`, `po_lines`, `deliveries` (S07)

**`purchase_orders`** — `project_id`, `supplier_id`, `bom_id`, `number` UNIQUE (`PO-2026-0031`), `status`, `price_list_id`, `currency`, `total_before_vat`, `expected_delivery`, `document_id`, `sent_at` + `sent_job_id` (outbound לספק = Trust Gate), `confirmed_at`, `supplier_ref`. RLS: ספק רואה רק את שלו (`suppliers.portal_user_id`). אינדקסים `(project_id)`, `(supplier_id, status)`.
**`po_lines`** — `UNIQUE(po_id, line_no)`: `bom_line_id`, `product_id`, `description_he`, `unit`, `qty_ordered`, `qty_delivered`, `unit_cost`, `price_snapshot jsonb`, **`is_critical`** (חוסם S08 עד אספקה/תזמון), `lead_time_days`.
**`deliveries`** — `delivery_note_ref` (תעודת משלוח), `delivered_at`/`scheduled_at`, `received_by`, `lines jsonb [{po_line_id, qty, serials[]}]`, **`serials text[]`** (מזין `monitoring_links.equipment`/`handover_packs.equipment_inventory`), `document_id`.
**אינווריאנט יציאה מ-S07:** לכל `po_lines.is_critical`: `qty_delivered ≥ qty_ordered` או `deliveries.scheduled_at` קיים.

### 3.15 WorkOrder · Crew · DailyReport · Checklist — `work_orders`, `crews`, `crew_members`, `checklists`, `daily_reports` (S08)

**`crews`** / **`crew_members`** — צוות, ראש צוות, קיבולת (`capacity_modules_per_day`), חברים (FK app_users). משאבים משותפים חוצי-פרויקטים ל-Gantt.
**`work_orders`** (WorkOrder) — `project_id`, `design_id`, `drawing_set_id`, `crew_id`, `foreman_id`, `status`, `scope_he`, `planned_start/finish`, `actual_start/finish`, `resources jsonb` (מנוף/פיגום), `gcal_event_id`, **`as_made_deltas jsonb`** (סטיות שטח → design rev `as_made`). אינדקס `(crew_id, planned_start, planned_finish)` לקונפליקטים.
**`checklists`** (Checklist) — `kind`, `template_key` (`install.tile.solaredge`), `template_version`, `items jsonb` `[{key, label_he, required, done, by, at, photo_ids[], value}]`, `completed_at/by`. **אינווריאנט יציאה מ-S08:** checklist `installation` עם כל `required` done. S11: `commissioning`/`handover`.
**`daily_reports`** (DailyReport) — `report_date`, `template_key`/`template_rev` (DSL של bee-build, 9 בלוקים), `content jsonb` (autosave אופליין), `crew_id`, `author_id`, `photo_ids[]`, `signature_id`, `document_id` (PDF), `closed_at`, `pwa_record_id`. `UNIQUE(project_id, report_date, template_key, author_id)` — idempotent בסנכרון. RLS: טכנאי כותב בפרויקטים משובצים בלבד. **אינווריאנט יציאה מ-S08:** אין דוחות פתוחים (`closed_at IS NULL`).

### 3.16 Inspection · TestResult · Defect — `inspections`, `test_results`, `defects` (S09; גם S12)

**`inspections`** (Inspection) — `project_id`, `site_id`, `kind`, `status`, **`inspector_type`** (`type1/2/3` לפי **R17 — ספים לאימות V7**) + `inspector_type_rule_id`, `inspector_user_id`/`name`/`license`, `scheduled_at`, `performed_at`, `ambient_temp_c`, `irradiance_wm2`, `category cat1/cat2`, `cat2_required`, `design_id`, `report_document_id` (חתום), `signature_id`, **`is_baseline`** (מזין MonitoringLink), `next_due_at` (בדיקה חוזרת — **5 שנים, מקור לאימות V20**), `re_inspection_of`, `gcal_event_id`. **אינווריאנט יציאה מ-S09:** `status='signed'` AND `count(defects.status='open')=0`. RLS: בודק (inspector) רואה/כותב רק את שלו בחלון הזמן. אינדקסים `(project_id)`, partial `(next_due_at)`.
**`test_results`** (TestResult, IEC 62446-1) — `category`, `kind test_kind`, `scope` (`system · inverter:SN · mppt:n · string:INV1/M1/S2 · combiner:CB1`), `inverter_serial`, `mppt_no`, `string_no`, `value_num` + `unit` (Voc V, Isc A, Riso MΩ, רציפות Ω), `expected_num` (מחושב מה-Design בטמפ' הנמדדת), `pass`, `threshold_rule_id` (ערכי בידוד — **לאימות**), `temp_c`, `irradiance_wm2`, `instrument`, `curve jsonb` (I-V, cat2), `photo_ids[]` (תרמי), `measured_at`. אינדקס `(inspection_id, kind)`.
**`defects`** (Defect) — `inspection_id`, `test_result_id`, `severity`, `status`, `description_he`, `location`, `rule_id` (הכלל שהופר: R11/R14/R19…), `photo_ids[]`, `task_id` (משימת תיקון; S09→S08 = rollback event), `fixed_at`, `verified_at/by`. אינדקס partial `(project_id) WHERE status='open'`.

### 3.17 GridConnection — `grid_connections` (S10)

`UNIQUE(project_id)`. שדות: `site_id`, `submission_id` (הגשת בדיקה/מונה), `distributor` N, **`meter_serial`, `meter_code`, `contract_number`, `bp_number`, `approved_kw`, `track`, `activated_at`** (§5/§11), `meter_kind` (דו-כיווני/ייצור/שניהם — **לאימות**), `tariff_track_ref` + `tariff_registered_at` (פורטל יצרנים), `iec_inspection_at/result`, `meter_installed_at`, `operation_approved_at`, `operating_permit_ref/at` (**V10**), `export_limit_kw`, `documents uuid[]`.
**אינווריאנט יציאה מ-S10:** `meter_installed_at` AND `operation_approved_at` AND `tariff_registered_at` (+ היתר הפעלה אם חל). `track` אמור להיות שווה ל-`projects.regulatory_track` — אי-התאמה = התראה (לא CHECK, כי S05 יכול לאמת פרופיל שונה מההנחה). מעדכן: S11 (`activated_at` = תחילת baseline), S12 (התאמת מונה). אינדקס `(meter_serial)`.

### 3.18 HandoverPack · Warranty — `handover_packs`, `warranties` (S11)

**`handover_packs`** (HandoverPack) — `UNIQUE(project_id)`: `design_id` (as-made), `contents jsonb` `[{section, document_id, bookmark}]` (לפי מבנה 62446-1: נתוני מערכת, חד-קו as-made, מחרוזות, דפי נתונים, מכני, O&M/אחריות, תוצאות בדיקה), `system_summary jsonb`, `equipment_inventory jsonb` `[{kind, manufacturer, model, serial, firmware, comm_type, location}]`, `string_map jsonb` (Voc/Isc/Riso baseline), `document_id` (PDF ממוזג + DXF מצורף), `training_done_at`, `trained_contact_id`, **`iec_data_consent jsonb`** `{consented_at, contact_id, token_ref (vault), scope}` (§12 — לא רשמי, **לאימות**), `signed_at`, `signature_id`. **אינווריאנט יציאה מ-S11:** `signed_at` + `invoices.kind='final'` issued + `monitoring_links.status='active'`.
**`warranties`** (Warranty) — `scope` (`module_product · module_performance · inverter · optimizer · battery · structure · workmanship · other`), `product_id`, `provider` (יצרן / B.E.E), `serials[]`, `starts_at`, `ends_at` (CHECK >), `terms_he`, `document_id`, `registered_ref`, `reminder_task_id`. אינדקס `(ends_at)` → התראת `warranty_due`.

### 3.19 MonitoringLink — `monitoring_links` (S11 → S12)

הגשר לטבלאות bee-live (מיפוי ב-§5). `project_id`, `site_id`, **`bee_live_site_id`**, **`bee_live_integration_id`** (שמות העמודות בצד bee-live — לאימות), `vendor`, `vendor_site_id` (SolarEdge siteId / Huawei stationCode / Sungrow ps_id…), `vendor_site_key` (Sungrow ps_key), `region`, `auth_mode`, **`credential_ref`** (reference ל-vault/סוד מוצפן — לעולם לא הסוד), **`sharing_status`** + `sharing_status_at` + `sharing_owner_contact_id`, `expected_latency_minutes`, `status`, `first_sync_at`, `last_sync_at`, `equipment jsonb`, `string_map jsonb`, `arrays jsonb [{azimuth, tilt, kwp, modules}]` (ל-PVGIS/pvlib), `expected_kwh_month[12]`, `pr_design`, `alert_thresholds jsonb`, `alert_contacts jsonb`, `quiet_windows jsonb`, `baseline_inspection_id`, `grid_connection_id`, `iec_data_consent_ref`, `modbus jsonb` (KStar/SunSpec), `notes`.
**אינווריאנטים:** `sharing_status ∈ {requested, denied}` ⇒ משימה פתוחה (`tasks.key='monitoring_sharing'`), לא שגיאה; `status='active'` ⇒ `first_sync_at IS NOT NULL`. יוצר: S11 (`create_monitoring_link`, `verify_first_sync`). מעדכן: S12. RLS: צוות + agent בלבד (לא לקוח; הלקוח מקבל נתוני ניטור דרך ה-API הקיים). אינדקסים `(site_id)`, `(vendor, vendor_site_id)`, partial `(sharing_status) WHERE requested/denied`.

### 3.20 O&M על Site — `maintenance_contracts`, `service_tickets`, `periodic_inspections` (S12)

**`maintenance_contracts`** (MaintenanceContract) — `site_id`, `customer_id`, `project_id` N, `tier`, `terms jsonb` `{cleanings_per_year, inspection_interval_months, response_sla_hours, annual_report}`, `price_year`, `billing_cycle`, `starts_at/ends_at`, `auto_renew`, `status`, `document_id`, `signature_id`. אינדקס partial `(ends_at) WHERE active` → `contract_renewal_reminder`.
**`service_tickets`** (ServiceTicket) — `site_id`, `customer_id`, `project_id` N, `maintenance_contract_id` N, `alert_kind`, `bee_live_alert_id` (ההתראה הקיימת — **לאימות**), `priority`, `status task_status`, `title`, `description`, `assignee_id`, `crew_id`, `scheduled_at`, `sla_due_at` (מה-tier), `resolved_at`, `resolution_he`, `report_document_id` (דוח שטח), `invoice_id`. זרימה: התראה → ticket → שיבוץ → דוח שטח → סגירה. אינדקסים `(site_id, status)`, partial `(sla_due_at)` לפתוחים.
**`periodic_inspections`** (PeriodicInspection) — `site_id`, `maintenance_contract_id`, `inspection_id` (`kind='periodic'`), `due_at`, `performed_at`, `kpi_snapshot jsonb` (PR, specific yield, availability, EPI מול PVGIS — IEC 61724-1), `compared_to_baseline jsonb`, `report_document_id`. אינדקס partial `(due_at) WHERE performed_at IS NULL`.

### 3.21 Document — `documents`

**מטרה:** כל קובץ (מופק/מועלה/מ-Drive/מ-PWA/מייל/ספק) עם hash, מקור הנתונים וחוליית supersedes.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `project_id` | uuid | N | | NULL למסמכי קטלוג (מחירונים, דפי נתונים) |
| `customer_id` | uuid | N | | |
| `kind` | document_kind | | | |
| `rev` | int | | 1 | |
| `title_he`, `folder_path` | text | N | | מבנה תיקיות אחיד (דוח 05 §5.2) |
| `r2_key`, `r2_version_id` | text | | | R2 versioning כרשת ביטחון |
| `sha256`, `size_bytes`, `mime_type` | | | | |
| `source` | document_source | | | |
| `generated_from` | jsonb | N | | `{design_rev, quote_version_id, template_rev, rules_snapshot_hash, inputs_hash, job_id}` |
| `stale` | bool | | false | הקלט השתנה מאז ההפקה |
| `signed_by` | uuid[] | | `{}` | signature ids |
| `sent_at`, `sent_job_id` | | N | | |
| `supersedes_id`, `superseded_by_id` | uuid | N | | |
| `customer_visible` | bool | | false | פורטל (presigned R2) |
| `drive_file_id`, `thumbnail_r2_key` | text | N | | מראה חד-כיוונית ל-Drive |

**אי-שינוי (נבדק ב-DB):** `documents_prevent_delete` — DELETE נכשל תמיד; `documents_guard_update` — `r2_key/sha256/kind/rev/generated_from/project_id` קפואים, רק שדות מחזור חיים (`sent_at`, `stale`, `signed_by`, `superseded_by_id`, `customer_visible`, `drive_file_id`) משתנים. מחיקה לוגית = `superseded_by_id`. יוצר: כל שלב (S02 `survey_pdf` … S12 `service_reports`). RLS: לקוח → `customer_visible` בלבד; inspector → סוגי תכנון/בדיקה; technician → תוכניות/דוחות/תמונות/פקודות שינוי; supplier → `purchase_orders` שלו. אינדקסים `(project_id, kind, rev DESC)`, `(sha256)`, partial `(project_id) WHERE customer_visible`.

### 3.22 Rule — `rules`, `rule_reviews`

**`rules`** (Rule) — `UNIQUE(key, version)`.

| שדה | טיפוס | N | D | הערות |
|---|---|---|---|---|
| `key` | text | | | `R1 … R24`, `OFFICE-01 … 22`, `EPLAN-…` |
| `version` | int | | 1 | שינוי כלל מאומת = גרסה חדשה |
| `scope` | rule_scope | | | |
| `title_he`, `description_he` | text | | | |
| `applies_to` | jsonb | | `{}` | `{regulatory_track[], project_kind[], kwp_min, kwp_max, phases, has_bess}` |
| `threshold` | jsonb | N | | `{field, op, value, unit}` — **הערכים הם נתונים; לא במסמך זה ולא בקוד** |
| `consequence_kind`, `consequence` | enum/jsonb | | | `{product_sku, qty_basis}` / `{document_kind}` / `{field, value}` / `{message_he}` |
| `source`, `section`, `source_url`, `source_document_id` | | | | "אמת מידה 35כ2", "הנחיות 24.01.2022 §11", "תקנות רישיונות 1985" |
| `valid_from`, `valid_to` | date | N | | תעריפים/פקיעות (R1) |
| `verification` | rule_verification | | unverified | |
| `verified_by`, `verified_at`, `verification_note` | | N | | **CHECK:** `validated` ⇒ שניהם |
| `test_case` | jsonb | N | | כל כלל עם מקרה בדיקה (§15) |
| `supersedes_id`, `is_active` | | | | |

**אי-שינוי (נבדק):** `rules_guard_validated` — כלל `validated` לא משנה `threshold/consequence/source/applies_to`; רק `is_active/valid_to`. **`rule_reviews`** — append-only (trigger): `from_level → to_level`, `reviewer_id`, `note`, `evidence_document_id`. RLS: קריאה לכל מחובר; כתיבה owner (reviewer — §17.9). seed ב-M0: R1–R24 מדוח 02 (רובם `summary`), כללי המשרד (`office`), eplan (`office`/`validated` לפי `eplan.db`).

דוגמאות למיפוי R-table → `consequence_kind`: R7 `validation`/`auto_line` ("הגדלת חיבור"); R8 `auto_line` (ארון מונה ייצור + 2 מנתקים); R9 `auto_line` (CT); R10 `field` (`export_limit_kw`) + `auto_line` (EMS); R11/R12/R13/R14/R15/R19/R20/R23 `auto_line`; R16/R17 `validation` (רישיון/סוג בודק); R18 `document` (דיווח פטור/היתר); R21/R22/R24 `validation`; R1–R6 `info`/`field` ל-ROI.

### 3.23 Job — `jobs`, `approvals`

**`jobs`** (לפי `job.schema.json`) — `kind`, `loop` (CHECK regex `^(collect|edit|dispatch)\.[a-z0-9_-]+$`), `status`, `trust_tier`, `cost_tier 0–4`, `source`, `project_id` N, `idempotency_key` UNIQUE, `payload`, `result`, `error`, `outbound_channel`, `outbound_destination_class`, `requires_human_pick`, `approval_id`, `pgboss_job_id`, `agent_name`, `created_at/started_at/finished_at`.
**Law #2 ב-DB (נבדק):** `CHECK jobs_law2_outbound_requires_pick` — יעד `customer`/`supplier` ⇒ `requires_human_pick = true`. Law #1 (אין שליחה אוטומטית) נאכף בקוד: job עם outbound ל-customer עובר ל-`blocked_trust` עד `approvals.status='approved'`.
**`approvals`** (Trust Gate) — `kind` (`outbound_msg · quote_send · price_list · stage_transition · rule_change`), `job_id`, `project_id`, `subject_table/id`, `payload` (מה יקרה אם יאושר), `options` (חלופות ל-human pick), `requested_by agent/user/system`, `status`, `decided_by/at`, `decision_note`, `picked_option`, `expires_at`. agent כותב **רק** לכאן. אינדקס partial `(created_at) WHERE pending` ("אישורים בבוקר").

---

## 4. מיפוי `SiteSurveyProject` (PWA) → `surveys`

ה-PWA שומר הכל כמחרוזות (קלט מובייל). הכלל: **`raw_pwa` שומר את האובייקט כפי שהגיע**; העמודות המנותחות הן נגזרת (parser בשרת, שגיאת פרסור ⇒ עמודה NULL + אזהרה ב-`completeness`).

| PWA (`SiteSurveyProject`) | `surveys` | המרה / הערות |
|---|---|---|
| `id` | `pwa_project_id` | UNIQUE partial; מחליף `customer.id=[OPEN]` ב-`DesignSuite` payload |
| `projectName` | — | נשמר ב-`raw_pwa`; `projects.name` נקבע ב-S01 |
| `surveyDate` | `survey_date` | ISO → date |
| `surveyor` | `surveyor_name` (+`surveyor_user_id` אם נמצא התאמה) | |
| `gps`, `lat`, `lon` | `gps_text`, `lat`, `lon` | |
| `address` | `address` | אימות מול `sites.address_line`; שוני ⇒ אזהרה |
| `mainBreaker` (`'63A'`) | `main_breaker_a` | strip 'A' → numeric; מזין R7/R16 |
| `panelSpace` | `panel_space` | `כן · לא · דורש בדיקה` |
| `solarBreaker` | `solar_breaker_a` | |
| `meterNumber` | `meter_number` | מועתק גם ל-`sites`/`grid_connections` כהצעה (לא אוטומטית) |
| `meterType` | `meter_type` | `ישיר · ארון מניה` → מזין R9 |
| `meterLocation`, `cableLengthM`, `cableNotes` | `meter_location`, `cable_length_m`, `cable_notes` | אורך → R12 (מרחק ממיר) ו-BOM כבלים |
| `roofTypeHe` | `roof_type_he` | `בטון · רעפים · פנל מבודד · איסכורית · קרקע · אחר` |
| (Edit normalize) `roofType` | `roof_type` | `flat · tile · metal-standing-seam · metal-trapezoidal · ground · other`; **מיפוי "בטון"→flat, "רעפים"→tile, "פנל מבודד"→metal-standing-seam?, "איסכורית"→metal-trapezoidal — לאימות** |
| `inverterLocation` | `inverter_location` | |
| `usableAreaM2`, `azimuthDeg`, `tiltDeg` | `usable_area_m2`, `azimuth_deg`, `tilt_deg` | → `designs.layout_geojson` התחלתי, `arrays` |
| `annualConsumptionKwh` | `annual_consumption_kwh` | → ROI (R4), הערכת kWp |
| `targetKwp`, `budgetIls`, `inverterBrandPref`, `includeBattery` | `target_kwp`, `budget_ils`, `inverter_brand_pref`, `include_battery` | `includeBattery` ⇒ `regulatory_track` מועמד `bess_add`/`pv_bess` + R20–R22 |
| `generalNotes` | `general_notes` | |
| `customFields[]` | `custom_fields jsonb` | `{id, section, label, value}` |
| `createdAt`, `updatedAt` | `pwa_created_at`, `pwa_updated_at` | |
| `hiveReady` | `completeness_ready` (+`completeness jsonb` = `CompletenessReport`) | |
| `SurveyPhoto[]` | `photos` | `field` ← `PhotoFieldKey`; `dataUrl` → R2 (`r2_key_original`), `sha256` מחושב בשרת אם חסר; `mimeType`, `createdAt`→`taken_at`, `annotated` |
| `HiveJob` (ייצוא לכוורת) | `jobs` | `collect.survey` עם `payload.survey_id`; `trustTier`, `costTier`, `source='pwa'` |

סנכרון: idempotent לפי `pwa_project_id` + `pwa_updated_at` (עדכון רק אם חדש יותר); תמונות לפי `(project_id, sha256)`.

---

## 5. מיפוי `MonitoringLink` → טבלאות bee-live הקיימות

הסכמה החיה (`E:\bee-live`, Fastify+Postgres) איננה במאגר זה; **שמות הטבלאות/העמודות להלן אינם ידועים כאן ויש למפות אותם מול הקוד החי** (handoff.md). העיקרון: `monitoring_links` איננה מחליפה את טבלאות הניטור — היא מצביעה עליהן ומזריעה אותן.

| `monitoring_links` | יעד ב-bee-live (לאימות) | הערות |
|---|---|---|
| `bee_live_site_id` | טבלת האתרים הקיימת (184 לקוחות) — `sites.id`? | נוצר ב-S11 (`create_monitoring_link`) דרך ה-API הקיים, לא ב-INSERT ישיר |
| `bee_live_integration_id` | רשומת אדפטר/אינטגרציה לאתר (SolarEdge V1/V2, Sungrow) | |
| `vendor`, `vendor_site_id`, `vendor_site_key`, `region` | שדות ה-site/integration של האדפטר (`siteId`, `ps_id/ps_key`, gateway) | V2: base `/v2`, `X-API-Key` — שדות `GUESSED` לאימות (V13) |
| `auth_mode`, `credential_ref` | סוד מוצפן בצד bee-live (כמו `apiKeyV2`) | **רק reference**; הסוד נשאר במנגנון ההצפנה הקיים |
| `sharing_status` | אין מקביל ידוע — חדש; "not in account list" (Sungrow) → `requested` + task | |
| `expected_latency_minutes`, `alert_thresholds`, `quiet_windows` | הגדרות התראות/canary לאתר | מחליפים ברירות מחדל גלובליות |
| `equipment`, `string_map`, `arrays`, `expected_kwh_month`, `pr_design` | baseline/KPI (חדש ב-M7: EPI מול PVGIS, PR מתוקן טמפ') | מקור: `inspections.is_baseline`, `designs`, `deliveries.serials` |
| `first_sync_at`, `last_sync_at`, `status` | מצב הסנכרון הקיים (ledger/canary) | `verify_first_sync` ב-S11 קורא משם |
| `service_tickets.bee_live_alert_id` | טבלת ההתראות הקיימת | התראה → ticket (M7) |
| `customers.legacy_bee_live_customer_id`, `sites.legacy_bee_live_site_id` | מפתחות הלקוח/אתר הקיימים | ייבוא חד-פעמי של 184 הלקוחות ל-`customers`/`sites` (M0) |

---

## 6. סיכום אכיפה ב-DB (טריגרים/CHECK) — כולם נבדקו על Postgres 16

| כלל | מנגנון | טבלה |
|---|---|---|
| QuoteVersion נעולה בשליחה | `quote_versions_lock_on_sent` (רשימת עמודות מותרות), `quote_versions_prevent_delete`, `quote_lines_lock`, `quote_sections_lock`, CHECK `sent_at ⇒ pdf_sha256` | quotes |
| Document לעולם לא נמחק; תוכן קפוא | `documents_prevent_delete`, `documents_guard_update` | documents |
| project_events / quote_events / rule_reviews append-only | `project_events_immutable` (UPDATE/DELETE ⇒ שגיאה); `project_events_fill_seq` | events |
| blocked ⇒ reason + owner | CHECK `projects_blocked_needs_reason` | projects |
| `stage_entered_at` מתעדכן במעבר | `projects_stage_change` | projects |
| כלל מאומת לא משתנה | `rules_guard_validated` | rules |
| Law #2: outbound ללקוח/ספק ⇒ human pick | CHECK `jobs_law2_outbound_requires_pick`; `loop` regex | jobs |
| `validated` ⇒ `verified_by/at`; `approved` מחירון ⇒ `approved_by` | CHECK | rules, price_lists |
| RLS לפי תפקיד | `can_read_project()` SECURITY DEFINER + policies; views ממוסכים ל-n8n ולקוח | 14 טבלאות |

**לא נאכף ב-DB (בקוד):** מעבר שלב ↔ אירוע באותה טרנזקציה (deferred constraint trigger — לאימות), Law #1 (`blocked_trust` עד approval), הקפאת Survey/Design/Assembly אחרי שימוש, `signatures` ללא עדכון.

---

## 7. אינדקסים — תקציר לפי שאילתות עסקיות

| שאילתה | אינדקס |
|---|---|
| Pipeline (Kanban לפי שלב) | `projects(stage, status)` |
| "תקועים" / דיווח בוקר | `projects(status, stage_entered_at) WHERE waiting_*/blocked`, `projects(sla_due_at) WHERE stage<>'S12'`, `submission_steps(due_at) WHERE submitted/waiting`, view `stuck_projects_v`, `stale_price_lists_v` |
| "היום שלי" | `tasks(assignee_id, due_at) WHERE open`, `tasks(due_at) WHERE open` |
| ציר זמן פרויקט | `project_events(project_id, created_at)`, `documents(project_id, kind, rev DESC)` |
| Gantt חוצה-פרויקטים | `work_orders(crew_id, planned_start, planned_finish)` |
| תיקי חח"י | `submissions(status, due_at)`, `submissions(project_id)` |
| ניטור/שיתוף | `monitoring_links(vendor, vendor_site_id)`, `(sharing_status) WHERE requested/denied` |
| תחזוקה | `maintenance_contracts(ends_at) WHERE active`, `service_tickets(sla_due_at) WHERE open`, `periodic_inspections(due_at) WHERE not performed`, `warranties(ends_at)` |
| dedupe/אופליין | `photos UNIQUE(project_id, sha256)`, `surveys UNIQUE(pwa_project_id)`, `daily_reports UNIQUE(project_id, date, template, author)`, `jobs.idempotency_key` |

---

## 8. מה לא מכוסה בטיוטה (לדיון)

- `document_versions` כטבלה נפרדת (דוח 05 §5.2) **לא** אומצה — תוכנית האב §5 מגדירה `Document(rev, supersedes)`; נבחר מודל שטוח עם `supersedes_id/superseded_by_id`.
- `project_stage_defs.gates` (דוח 05) ממומש כ-`stage_defs.entry/exit jsonb`; ה-guards של XState נגזרים מהם בקוד.
- תבניות הודעות (Meta WA templates) — רק `communication_log.template_key`; טבלת תבניות (M2) לא כאן.
- Better Auth: טבלאות `user/session/organization` משלו; `app_users.auth_user_id text` הוא הגשר (**לאימות** אחרי בחירת adapter — Drizzle/Kysely).
- pg-boss: סכמה `pgboss` משלו; `jobs.pgboss_job_id` מקשר.
- Google Calendar: `gcal_event_id` על tasks/work_orders/inspections; טבלת `syncToken` לכל יומן — ops, לא כאן.

---

## 9. אי-התאמות שנמצאו בתוכנית האב (לתיקון בגרסה 0.3)

1. **שמות פרופילי אסדרה** שונים בין §3 (`residential_le15 …`) לבין `01-lifecycle-stages.json` (`RES_LE_15 …`). ה-DDL משתמש בשמות §3; יש ליישר את ה-JSON (או להיפך).
2. **תפקידי בעלים של שלבים** ב-JSON (`sales · procurement · foreman · service`) אינם ברשימת התפקידים §15 (`owner · engineer · pm · technician · surveyor · customer · inspector · supplier · agent`). `stage_defs.owner_role` הושאר `text`; צריך מיפוי (sales→owner? foreman→technician/pm? service→pm?).
3. **Submission types:** §5 אומר `iec | historic | authority | fire`; דוח 05 מציע `IEC | ELEC_AUTH | MUNI`. ה-DDL: `submission_authority` לפי §5 + `municipality`, וממד נפרד `submission_kind` (מה מגישים). לאשר.
4. **ChangeOrder** מופיע ב-§5 תחת WorkOrder (S08) אך ב-§6.2 הוא "גרסת QuoteVersion עם מסמך דלתא". ה-DDL ממקם אותו תחת quotes עם `work_order_id` אופציונלי ו-`origin`.
5. **Fee/Receipt** ב-§5 הוא ישות; ב-§9.2 הוא שדה מוטמע `fee{amount, receipt, paidAt}` על SubmissionStep. ה-DDL: טבלה `submission_fees` (אגרה אחת יכולה לכסות צעד או הגשה שלמה, ויש לה OCR/אישור).
6. **`GridConnection.track`** משכפל את `projects.regulatory_track`. נשמר (מה שנרשם בפועל מול חח"י יכול להיות שונה מההנחה), אך צריך כלל התראה על אי-התאמה.
7. **MonitoringLink.latency** (§5) מול "latency צפוי" (§11) — `expected_latency_minutes`; הלטנסי בפועל שייך ל-bee-live.
8. **מסמכי S03** ב-JSON כוללים `design_lite` כ-Document, אך ב-§7 אין שורת מסמך כזו — הוסף ל-`document_kind`; לאשר אם זה PDF/PNG של פריסת גג.
9. **S06 exit** ב-JSON: `eplan.all_checks_pass OR owner_accepted` **וגם** `design.verify.empty` — אך `owner_accepted` לא אמור לעקוף `verify` לא ריק? ה-DDL דורש `verify_items=[]` בכל מקרה; לאשר.
10. **`DesignSuiteTargetPayload.budgetCents`** (PWA) מול `budgetIls` מחרוזת — ה-DDL שומר `budget_ils numeric(14,2)`; להחליט על המרה ב-Edit normalize.
11. §5 מציין `Product.kind` עם 11 ערכים; `MonitoringLink`/BOM/handover זקוקים גם ל-`structure`, `meter`, `spd` — הורחב וסומן לאימות.
12. §3 "SLA יעד" ל-S04 הוא "תזכורת כל 3 ימים" אך ב-JSON `sla_days: 21` — שניהם נכונים (SLA שלב + follow-up); `stage_defs.sla_days=21`, ה-follow-up הוא auto_task.
