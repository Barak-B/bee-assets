-- =============================================================================
-- B.E.E Engine — Postgres DDL draft (v0.1, 2026-10-10)
-- Companion to docs/plan/specs/10-data-model.md and docs/plan/00-master-plan.md §5.
--
-- STATUS: DRAFT. Parses logically; not every column is final. Anything marked
-- "לאימות" is unverified. Regulatory numbers are NOT encoded here — they live
-- in the `rules` table as data with a verification level.
--
-- Conventions
--   * uuid PKs (gen_random_uuid), timestamptz everywhere, numeric(14,2) money,
--     jsonb for snapshots / vendor payloads.
--   * Stage ids S01..S12 and entity names follow the master plan exactly.
--   * Engine tables are additive to the live bee-live schema (monitoring tables
--     stay where they are; monitoring_links is the bridge).
--   * RLS: every request runs  SELECT set_config('app.user_id', $1, true),
--     set_config('app.role', $2, true);  policies are safety nets, business
--     authorization is enforced in code (Better Auth access control).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraints (price list validity)

CREATE SCHEMA IF NOT EXISTS engine;
SET search_path = engine, public;

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION engine.app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION engine.app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.role', true), ''), 'anonymous')
$$;

CREATE OR REPLACE FUNCTION engine.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------

-- Lifecycle (01-lifecycle-stages.json). S12 is terminal.
CREATE TYPE engine.project_stage AS ENUM (
  'S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12'
);

-- Shared status inside a stage (master plan §3).
CREATE TYPE engine.project_status AS ENUM (
  'open','in_progress','waiting_customer','waiting_iec','waiting_supplier',
  'waiting_engineer','blocked','done'
);

-- Regulatory profile (master plan §3 "פרופיל אסדרה"). Thresholds themselves are
-- rules (R2, V3) — לאימות; the enum only names the buckets.
CREATE TYPE engine.regulatory_track AS ENUM (
  'residential_le15','commercial_15_100','commercial_100_630','mv_gt630',
  'bess_add','historic_distributor'
);

CREATE TYPE engine.project_kind AS ENUM (
  'pv_residential','pv_commercial','pv_agricultural','pv_ground','bess_add','pv_bess','other'
);

CREATE TYPE engine.app_role_t AS ENUM (
  'owner','engineer','pm','technician','surveyor','customer','inspector','supplier','agent'
);

-- Task/generic work status (tasks, tickets, work orders).
CREATE TYPE engine.task_status AS ENUM (
  'todo','in_progress','waiting','blocked','done','cancelled'
);

CREATE TYPE engine.dependency_type AS ENUM ('FS','SS','FF','SF');

-- Document kinds (= 01-lifecycle-stages.json `documents` + attachments).
CREATE TYPE engine.document_kind AS ENUM (
  'survey_pdf','design_lite','quote_pdf','boq_xlsx','contract_pdf','invoice_deposit',
  'iec_application_pack','iec_fee_receipt','drawing_set_dwg','drawing_set_pdf','bom_csv',
  'boq_xlsx_rev','purchase_orders','daily_report_pdf','change_orders','inspector_report_pdf',
  'iec62446_tests','iec_final_pack','as_made_set','handover_pack_pdf','warranty_cards',
  'invoice_final','periodic_inspection_pdf','service_reports',
  -- attachments / inputs (not lifecycle outputs)
  'photo','datasheet','constructor_drawing','electric_bill','receipt','correspondence',
  'price_list_source','signature_certificate','other'
);

CREATE TYPE engine.document_source AS ENUM ('generated','upload','drive','pwa','email','vendor');

-- Catalog
CREATE TYPE engine.product_kind AS ENUM (
  'module','inverter','optimizer','battery','breaker','cable','tray','cabinet',
  'labour','service','fee',
  -- extensions beyond master plan §5 list — לאימות עם ברק
  'structure','meter','spd','connector','other'
);

CREATE TYPE engine.price_list_audience AS ENUM ('retail','b2b','subcontractor','internal');
CREATE TYPE engine.price_list_status  AS ENUM ('draft','pending_review','approved','superseded','rejected');
CREATE TYPE engine.unit_basis AS ENUM ('kWp','module','m','m2','inverter','string','fixed','day','crew_day');
CREATE TYPE engine.pricing_rule_kind AS ENUM ('markup','min_margin','rounding','vat','indexation','validity','auto_line','validation');

-- Quotes
CREATE TYPE engine.quote_status AS ENUM (
  'draft','pending_approval','sent','viewed','accepted','signed','rejected','expired','superseded'
);
CREATE TYPE engine.quote_line_source AS ENUM ('assembly','bom','manual','rule','dekel','change_order');
CREATE TYPE engine.quote_event_type AS ENUM (
  'created','locked','sent','viewed','accepted','signed','rejected','expired','superseded','change_order'
);

-- Finance
CREATE TYPE engine.invoice_kind   AS ENUM ('deposit','milestone','final','service','credit');
CREATE TYPE engine.invoice_status AS ENUM ('draft','issued','paid','partially_paid','cancelled');
CREATE TYPE engine.payment_method AS ENUM ('transfer','card_link','cheque','cash','other');
CREATE TYPE engine.currency AS ENUM ('ILS','USD','EUR');

-- Contracts & signatures
CREATE TYPE engine.contract_status AS ENUM ('draft','sent','signed','cancelled','superseded');
CREATE TYPE engine.signature_method AS ENUM ('click_otp','drawn_otp','pades','wet_ink_scan');

-- Submissions (master plan §5: iec | historic | authority | fire)
CREATE TYPE engine.submission_authority AS ENUM ('iec','historic','authority','fire','municipality','other');
CREATE TYPE engine.submission_kind AS ENUM (
  'iec_pre_application',    -- S05: בקשת שילוב / תיק יצרן
  'iec_inspection_meter',   -- S10: בדיקת מתקן + מונה
  'tariff_registration',    -- S10: פורטל יצרנים
  'operating_permit',       -- S10: היתר הפעלה (04/2026, לאימות)
  'historic_distributor',   -- מחלק היסטורי
  'exemption_report',       -- R18 דיווח פטור
  'fire_safety',            -- R19
  'other'
);
CREATE TYPE engine.submission_status AS ENUM (
  'draft','in_progress','submitted','waiting_authority','answered_positive',
  'answered_negative','completed','not_required','cancelled'
);
CREATE TYPE engine.submission_step_status AS ENUM (
  'not_started','in_progress','waiting_customer','waiting_payment','ready_to_submit',
  'submitted','waiting_authority','answered','rejected','done','skipped'
);
CREATE TYPE engine.correspondence_channel AS ENUM ('email','whatsapp','sms','phone','portal','letter','meeting');
CREATE TYPE engine.direction AS ENUM ('inbound','outbound','internal');

-- Procurement
CREATE TYPE engine.po_status AS ENUM ('draft','sent','confirmed','partially_delivered','delivered','cancelled');

-- Execution
CREATE TYPE engine.work_order_status AS ENUM ('planned','scheduled','in_progress','paused','done','cancelled');
CREATE TYPE engine.checklist_kind AS ENUM ('installation','commissioning','handover','maintenance','safety');
CREATE TYPE engine.change_order_status AS ENUM ('draft','sent','signed','rejected');

-- Inspection (IEC 62446-1)
CREATE TYPE engine.inspection_kind AS ENUM ('inspector','iec','periodic','thermal','re_inspection');
CREATE TYPE engine.inspection_status AS ENUM ('planned','in_progress','report_draft','signed','failed');
CREATE TYPE engine.test_category AS ENUM ('cat1','cat2');
CREATE TYPE engine.test_kind AS ENUM (
  'visual','earth_continuity','polarity','voc','isc','functional','insulation_dc',
  'combiner','iv_curve','thermal','other'
);
CREATE TYPE engine.defect_severity AS ENUM ('blocking','major','minor','note');
CREATE TYPE engine.defect_status AS ENUM ('open','fixed','verified','waived');

-- Monitoring
CREATE TYPE engine.monitoring_vendor AS ENUM (
  'solaredge_v1','solaredge_v2','huawei','sungrow','solis','growatt','solarman','deye',
  'enphase','tigo','goodwe','saj','kstar_modbus','sunspec_modbus','other'
);
CREATE TYPE engine.auth_mode AS ENUM ('fleet_key','site_key','oauth','account_login','modbus_local','none');
CREATE TYPE engine.sharing_status AS ENUM ('not_requested','requested','shared','denied','revoked','not_applicable');
CREATE TYPE engine.monitoring_link_status AS ENUM ('pending','active','degraded','inactive');

-- O&M
CREATE TYPE engine.maintenance_tier AS ENUM ('basic','standard','premium','custom');
CREATE TYPE engine.ticket_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE engine.alert_kind AS ENUM (
  'comm_loss','zero_production','inverter_alarm','underperformance','string_imbalance',
  'riso','curtailment','iec_meter_mismatch','warranty_due','inspection_due','customer_request','other'
);

-- Rules (master plan §5: unverified|summary|office|validated)
CREATE TYPE engine.rule_verification AS ENUM ('unverified','summary','office','validated');
CREATE TYPE engine.rule_scope AS ENUM ('tariff','grid','protection','earthing','dc','licensing','permit','fire','bess','standard','pricing','office','eplan');
CREATE TYPE engine.rule_consequence_kind AS ENUM ('auto_line','document','validation','block','field','info');

-- Jobs (platform/schema/job.schema.json)
CREATE TYPE engine.job_kind   AS ENUM ('collect','edit','dispatch');
CREATE TYPE engine.job_status AS ENUM ('queued','running','succeeded','failed','blocked_trust','cancelled');
CREATE TYPE engine.trust_tier AS ENUM ('L0','L1','L2');
CREATE TYPE engine.outbound_channel AS ENUM ('whatsapp','email','db','none');
CREATE TYPE engine.destination_class AS ENUM (
  'self_chat','neri_group','drafts_group','voice_transcripts','customer','supplier','other'
);
CREATE TYPE engine.approval_status AS ENUM ('pending','approved','rejected','expired');

-- -----------------------------------------------------------------------------
-- 2. Users & assignments (Better Auth owns identity; this mirrors what RLS needs)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  text UNIQUE,                       -- Better Auth user id (text) — לאימות אחרי בחירת adapter
  role          engine.app_role_t NOT NULL,
  display_name  text NOT NULL,
  email         text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Scoped access for technician / inspector / supplier / customer users.
CREATE TABLE engine.project_members (
  project_id  uuid NOT NULL,                       -- FK added after projects
  user_id     uuid NOT NULL REFERENCES engine.app_users(id),
  role        engine.app_role_t NOT NULL,
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,                         -- inspector: time window
  PRIMARY KEY (project_id, user_id, role)
);

-- -----------------------------------------------------------------------------
-- 3. CRM: Customer · Contact · Site · Project · project_events · CommunicationLog
-- -----------------------------------------------------------------------------

CREATE TABLE engine.customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_bee_live_customer_id text,                -- bridge to live bee-live customers (184) — column name לאימות
  monday_item_id  text,                            -- one-off import
  kind            text NOT NULL DEFAULT 'private' CHECK (kind IN ('private','business','kibbutz','moshav','public')),
  name            text NOT NULL,
  national_id_enc bytea,                           -- ת"ז/ח"פ מוצפן (PII, מזעור: לא לשמור צילום)
  vat_number      text,
  billing_address text,
  language        text NOT NULL DEFAULT 'he',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES engine.customers(id),
  full_name     text NOT NULL,
  role_he       text,                              -- בעלים / מנהל / גזבר
  phone_e164    text,
  email         text,
  whatsapp_optin boolean NOT NULL DEFAULT false,
  is_primary    boolean NOT NULL DEFAULT false,
  portal_user_id uuid REFERENCES engine.app_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_customer_idx ON engine.contacts(customer_id);
CREATE UNIQUE INDEX contacts_primary_uq ON engine.contacts(customer_id) WHERE is_primary;

CREATE TABLE engine.sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES engine.customers(id),
  legacy_bee_live_site_id text,                    -- bridge to live bee-live sites — column name לאימות
  name            text,
  address_line    text NOT NULL,
  city            text,
  gush            text,                            -- גוש
  helka           text,                            -- חלקה
  lat             double precision,
  lon             double precision,
  timezone        text NOT NULL DEFAULT 'Asia/Jerusalem',
  iec_contract_number text,                        -- מס' חוזה חח"י (מחשבון חשמל)
  iec_bp_number   text,
  connection_phases smallint CHECK (connection_phases IN (1,3)),
  connection_amps numeric(8,2),                    -- גודל חיבור (A)
  connection_kva  numeric(10,2),
  distributor     text,                            -- NULL = חח"י; אחרת מחלק היסטורי (קיבוץ/מושב)
  roof_type       text,                            -- flat|tile|metal-standing-seam|metal-trapezoidal|ground|other (PWA canonical)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_customer_idx ON engine.sites(customer_id);

CREATE TABLE engine.projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            text NOT NULL UNIQUE,          -- 'P-2026-0142'
  customer_id       uuid NOT NULL REFERENCES engine.customers(id),
  site_id           uuid NOT NULL REFERENCES engine.sites(id),
  kind              engine.project_kind NOT NULL,
  name              text,
  -- state machine cache (source of truth = project_events)
  stage             engine.project_stage NOT NULL DEFAULT 'S01',
  status            engine.project_status NOT NULL DEFAULT 'open',
  stage_entered_at  timestamptz NOT NULL DEFAULT now(),
  sla_due_at        timestamptz,
  blocked_reason    text,
  blocked_owner_id  uuid REFERENCES engine.app_users(id),
  xstate_snapshot   jsonb,                         -- cache only; rebuildable from events
  -- regulatory
  regulatory_track  engine.regulatory_track,       -- S01 guess → S05 confirmed
  regulatory_track_confirmed_at timestamptz,
  distributor       text,                          -- copy of sites.distributor at intake (historic distributor)
  estimated_kwp     numeric(10,3),
  estimated_kwh_year numeric(12,0),
  export_limit_kw   numeric(10,3),                 -- R10
  owner_user_id     uuid REFERENCES engine.app_users(id),
  pm_user_id        uuid REFERENCES engine.app_users(id),
  lead_source       text,                          -- whatsapp|phone|email|form|referral|monday
  monday_item_id    text,
  customer_visible  boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_blocked_needs_reason CHECK (status <> 'blocked' OR (blocked_reason IS NOT NULL AND blocked_owner_id IS NOT NULL))
);
CREATE INDEX projects_customer_idx ON engine.projects(customer_id);
CREATE INDEX projects_site_idx     ON engine.projects(site_id);
CREATE INDEX projects_stage_status_idx ON engine.projects(stage, status);
CREATE INDEX projects_sla_idx      ON engine.projects(sla_due_at) WHERE stage <> 'S12';
CREATE INDEX projects_waiting_idx  ON engine.projects(status, stage_entered_at)
  WHERE status IN ('waiting_customer','waiting_iec','waiting_supplier','waiting_engineer','blocked');

ALTER TABLE engine.project_members ADD FOREIGN KEY (project_id) REFERENCES engine.projects(id);

-- Append-only event log = source of truth for the state machine.
CREATE TABLE engine.project_events (
  id          bigserial PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES engine.projects(id),
  seq         integer NOT NULL,                    -- per-project sequence
  type        text NOT NULL,                       -- 'stage.transition','stage.rollback','status.change','task.done','document.generated',...
  from_stage  engine.project_stage,
  to_stage    engine.project_stage,
  from_status engine.project_status,
  to_status   engine.project_status,
  payload     jsonb NOT NULL DEFAULT '{}',
  reason      text,
  actor_id    uuid REFERENCES engine.app_users(id),
  actor_role  engine.app_role_t,
  job_id      uuid,                                -- FK to jobs added below
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq)
);
CREATE INDEX project_events_project_created_idx ON engine.project_events(project_id, created_at);
CREATE INDEX project_events_type_idx ON engine.project_events(type);

CREATE TABLE engine.communication_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES engine.customers(id),
  project_id    uuid REFERENCES engine.projects(id),
  contact_id    uuid REFERENCES engine.contacts(id),
  channel       engine.correspondence_channel NOT NULL,
  direction     engine.direction NOT NULL,
  template_key  text,                              -- Meta WA approved template name
  subject       text,
  body          text,
  external_id   text,                              -- WA message id / Gmail id
  job_id        uuid,                              -- dispatch job (trust gate) — FK below
  approved_by   uuid REFERENCES engine.app_users(id),
  sent_at       timestamptz,
  received_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX communication_log_customer_idx ON engine.communication_log(customer_id, created_at DESC);
CREATE INDEX communication_log_project_idx  ON engine.communication_log(project_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Workflow: stage defs (data), Task · Milestone · Schedule (CPM), business_calendar
-- -----------------------------------------------------------------------------

-- Mirror of 01-lifecycle-stages.json so stages are editable data.
CREATE TABLE engine.stage_defs (
  stage        engine.project_stage PRIMARY KEY,
  key          text NOT NULL UNIQUE,               -- lead|survey|quote|...
  name_he      text NOT NULL,
  owner_role   text NOT NULL,                      -- sales|surveyor|owner|pm|procurement|foreman|service (לאימות מול §15)
  sla_days     integer,
  sla_source   text,
  parallel_with engine.project_stage[],
  entry        jsonb NOT NULL DEFAULT '[]',
  exit         jsonb NOT NULL DEFAULT '[]',
  documents    engine.document_kind[] NOT NULL DEFAULT '{}',
  auto_tasks   text[] NOT NULL DEFAULT '{}',
  customer_visible boolean NOT NULL DEFAULT true,
  terminal     boolean NOT NULL DEFAULT false
);

CREATE TABLE engine.business_calendar (
  day          date PRIMARY KEY,
  is_workday   boolean NOT NULL,
  holiday_key  text,                               -- hebcal key (e.g. 'Yom Kippur')
  name_he      text,
  half_day     boolean NOT NULL DEFAULT false,     -- ערב חג
  source       text NOT NULL DEFAULT '@hebcal/core il:true',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION engine.add_business_days(p_from date, p_days integer) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT day FROM engine.business_calendar
  WHERE day > p_from AND is_workday
  ORDER BY day OFFSET GREATEST(p_days - 1, 0) LIMIT 1
$$;

CREATE TABLE engine.schedule_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,               -- 'residential_le15_tile'
  regulatory_track engine.regulatory_track,
  name_he      text NOT NULL,
  activities   jsonb NOT NULL,                     -- [{key, stage, duration_days, depends_on[], lag_days, buffer_days, resource}]
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES engine.projects(id),
  template_id    uuid REFERENCES engine.schedule_templates(id),
  baseline_at    timestamptz,                      -- frozen baseline (S04)
  baseline       jsonb,                            -- snapshot of activities at baseline
  computed_at    timestamptz,                      -- last CPM run
  critical_path  uuid[],                           -- task ids
  planned_finish date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX schedules_project_uq ON engine.schedules(project_id);

CREATE TABLE engine.milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES engine.projects(id),
  key          text NOT NULL,                      -- 'contract_signed','iec_answer','installation_done','meter_installed'
  name_he      text NOT NULL,
  stage        engine.project_stage,
  planned_at   date,
  actual_at    date,
  customer_visible boolean NOT NULL DEFAULT true,
  payment_trigger boolean NOT NULL DEFAULT false,  -- תשלום מדורג צמוד לאבן דרך
  UNIQUE (project_id, key)
);

CREATE TABLE engine.tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES engine.projects(id),
  schedule_id    uuid REFERENCES engine.schedules(id),
  stage          engine.project_stage,
  key            text,                             -- auto_task key from stage_defs
  title          text NOT NULL,
  description    text,
  status         engine.task_status NOT NULL DEFAULT 'todo',
  assignee_id    uuid REFERENCES engine.app_users(id),
  crew_id        uuid,                             -- FK after crews
  resource_key   text,                             -- 'crane','inspector','crew_a'
  due_at         timestamptz,
  duration_days  integer,
  -- CPM fields (business days, from business_calendar)
  planned_start  date,
  planned_finish date,
  early_start    date, early_finish date, late_start date, late_finish date,
  slack_days     integer,
  actual_start   date,
  actual_finish  date,
  checklist      jsonb,                            -- [{item, done, by, at}]
  requires       jsonb,                            -- preconditions (documents, rules)
  source_defect_id uuid,                           -- FK after defects (S09 → S08)
  gcal_event_id  text,                             -- extendedProperties.private.bee_event_id mirror
  created_by     uuid REFERENCES engine.app_users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx   ON engine.tasks(project_id, status);
CREATE INDEX tasks_assignee_idx  ON engine.tasks(assignee_id, due_at) WHERE status NOT IN ('done','cancelled');
CREATE INDEX tasks_due_idx       ON engine.tasks(due_at) WHERE status NOT IN ('done','cancelled');

CREATE TABLE engine.task_dependencies (
  pred_task_id uuid NOT NULL REFERENCES engine.tasks(id) ON DELETE CASCADE,
  succ_task_id uuid NOT NULL REFERENCES engine.tasks(id) ON DELETE CASCADE,
  type         engine.dependency_type NOT NULL DEFAULT 'FS',
  lag_days     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pred_task_id, succ_task_id),
  CHECK (pred_task_id <> succ_task_id)
);

-- -----------------------------------------------------------------------------
-- 5. Survey · Photo (S02; mirrors apps/bee-solar-survey SiteSurveyProject)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.surveys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES engine.projects(id),
  pwa_project_id   text,                           -- SiteSurveyProject.id (replaces customer.id=[OPEN])
  survey_date      date,
  surveyor_user_id uuid REFERENCES engine.app_users(id),
  surveyor_name    text,                           -- SiteSurveyProject.surveyor (free text from PWA)
  gps_text         text,                           -- SiteSurveyProject.gps (raw)
  lat              double precision,
  lon              double precision,
  address          text,
  -- electrical intake (PWA strings kept raw + parsed columns)
  main_breaker_a   numeric(8,2),                   -- parsed from mainBreaker ('63A')
  panel_space      text,                           -- כן|לא|דורש בדיקה
  solar_breaker_a  numeric(8,2),
  meter_number     text,
  meter_type       text,                           -- ישיר|ארון מניה
  meter_location   text,
  cable_length_m   numeric(8,2),
  cable_notes      text,
  -- roof / geometry
  roof_type_he     text,                           -- בטון|רעפים|פנל מבודד|איסכורית|קרקע|אחר
  roof_type        text,                           -- canonical (DesignSuiteSitePayload.roofType)
  inverter_location text,
  usable_area_m2   numeric(10,2),
  azimuth_deg      numeric(6,2),
  tilt_deg         numeric(5,2),
  annual_consumption_kwh numeric(12,0),
  -- design target
  target_kwp       numeric(10,3),
  budget_ils       numeric(14,2),
  inverter_brand_pref text,
  include_battery  boolean NOT NULL DEFAULT false,
  general_notes    text,
  custom_fields    jsonb NOT NULL DEFAULT '[]',    -- CustomField[]
  raw_pwa          jsonb NOT NULL,                 -- full SiteSurveyProject as received (immutable copy)
  completeness     jsonb,                          -- CompletenessReport
  completeness_ready boolean NOT NULL DEFAULT false,
  owner_override_by uuid REFERENCES engine.app_users(id),
  owner_override_reason text,
  pwa_created_at   timestamptz,
  pwa_updated_at   timestamptz,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surveys_override_needs_reason CHECK (owner_override_by IS NULL OR owner_override_reason IS NOT NULL)
);
CREATE INDEX surveys_project_idx ON engine.surveys(project_id);
CREATE UNIQUE INDEX surveys_pwa_uq ON engine.surveys(pwa_project_id) WHERE pwa_project_id IS NOT NULL;

CREATE TABLE engine.photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES engine.projects(id),
  survey_id     uuid REFERENCES engine.surveys(id),
  document_id   uuid,                              -- FK to documents (original file) added below
  field         text NOT NULL,                     -- PhotoFieldKey | 'install_before'|'install_after'|'defect'|'thermal'|...
  pwa_photo_id  text,
  sha256        text NOT NULL,
  mime_type     text NOT NULL,
  r2_key_original text NOT NULL,
  r2_key_web    text,
  r2_key_thumb  text,
  taken_at      timestamptz,                       -- EXIF
  exif_lat      double precision,
  exif_lon      double precision,
  exif_heading  numeric(6,2),
  annotated     boolean NOT NULL DEFAULT false,
  caption       text,
  customer_visible boolean NOT NULL DEFAULT false, -- shared copies are EXIF-stripped
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photos_project_idx ON engine.photos(project_id, field);
CREATE UNIQUE INDEX photos_sha_uq ON engine.photos(project_id, sha256);

-- -----------------------------------------------------------------------------
-- 6. Design (spec YAML rev, layout) · CalcReport · DrawingSet · BOM (S03 lite, S06 full)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.designs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES engine.projects(id),
  rev             integer NOT NULL,                -- 1..n ; as-made is a rev with is_as_made
  mode            text NOT NULL CHECK (mode IN ('lite','full','as_made')),  -- S03 lite / S06 full / S10-S11 as-made
  spec_yaml       text NOT NULL,                   -- eplan spec (verbatim)
  spec_sha256     text NOT NULL,
  spec_json       jsonb,                           -- parsed for queries (kWp, strings, inverter)
  layout_geojson  jsonb,                           -- roof polygons, obstacles, module grid (EPSG:4326 + local)
  layout_source   text,                            -- constructor_dxf|constructor_pdf|vision|manual_ortho
  kwp_dc          numeric(10,3),
  kw_ac           numeric(10,3),
  module_product_id   uuid,                        -- FK after products
  inverter_product_id uuid,
  module_count    integer,
  strings         jsonb,                           -- [{inverter, mppt, string, modules, azimuth, tilt}]
  yield_kwh_year  numeric(12,0),                   -- pvlib/PVGIS
  yield_monthly   numeric(12,0)[],                 -- 12 values
  pr_design       numeric(5,3),
  pvgis_cache     jsonb,
  verify_items    jsonb NOT NULL DEFAULT '[]',     -- '# VERIFY' markers → must be empty to exit S06
  all_checks_pass boolean,
  owner_accepted_by uuid REFERENCES engine.app_users(id),
  owner_accepted_at timestamptz,
  owner_accept_reason text,
  rules_snapshot  jsonb,                           -- rule ids + versions used
  superseded_by_id uuid REFERENCES engine.designs(id),
  created_by      uuid REFERENCES engine.app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, rev)
);
CREATE INDEX designs_project_idx ON engine.designs(project_id, rev DESC);

CREATE TABLE engine.calc_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   uuid NOT NULL REFERENCES engine.designs(id),
  job_id      uuid,
  eplan_version text,
  status      text NOT NULL CHECK (status IN ('pass','blocked','failed')),
  summary     jsonb NOT NULL,                      -- STATUS/RESULT/NEXT
  checks      jsonb NOT NULL,                      -- [{check, result, rule_id, value, limit, source}]
  blocks      jsonb NOT NULL DEFAULT '[]',         -- HUMAN_INPUT_REQUIRED items
  document_id uuid,                                -- PDF/MD report
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calc_reports_design_idx ON engine.calc_reports(design_id);

CREATE TABLE engine.drawing_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id     uuid NOT NULL REFERENCES engine.designs(id),
  set_rev       text NOT NULL,                     -- title-block rev ('A','B','As-Made')
  status        text NOT NULL CHECK (status IN ('draft','issued','approved','as_made')),
  sheets        jsonb NOT NULL,                    -- [{code:'E-01', title_he, dxf_doc_id, pdf_doc_id, png_doc_id, svg_doc_id}]
  dwg_document_id uuid,                            -- merged DWG 2018 from Windows worker
  pdf_document_id uuid,                            -- merged official PDF (CTB plot)
  audit_result  jsonb,                             -- ezdxf audit 0/0/0
  cad_worker_job_id uuid,
  approved_by   uuid REFERENCES engine.app_users(id),
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, set_rev)
);

CREATE TABLE engine.boms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   uuid NOT NULL REFERENCES engine.designs(id),
  source      text NOT NULL CHECK (source IN ('assemblies','eplan','manual')),
  csv_document_id uuid,
  diff_vs_quote_version_id uuid,                   -- FK after quote_versions
  diff        jsonb,                               -- lines added/removed/changed vs quote
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.bom_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id      uuid NOT NULL REFERENCES engine.boms(id) ON DELETE CASCADE,
  line_no     integer NOT NULL,
  product_id  uuid,                                -- FK after products
  sku         text,
  description_he text NOT NULL,
  unit        text NOT NULL,
  qty         numeric(12,3) NOT NULL,
  geometry_ref text,                               -- sheet/layer the qty came from
  rule_ids    text[],                              -- R-rules that forced the line (R8, R11, ...)
  UNIQUE (bom_id, line_no)
);

-- -----------------------------------------------------------------------------
-- 7. Catalog: Supplier · Product · PriceList · PriceListEntry · Assembly ·
--    PricingRule · DiscountSchedule · ApprovalThreshold  (M1)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  vat_number   text,
  contact      jsonb,                              -- {name, phone, email}
  lead_time_days_default integer,
  payment_terms text,
  portal_user_id uuid REFERENCES engine.app_users(id),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             text NOT NULL UNIQUE,
  kind            engine.product_kind NOT NULL,
  name_he         text NOT NULL,
  name_en         text,
  manufacturer    text,
  model           text,
  unit            text NOT NULL,                   -- יח'|מ"א|מ"ר|קומפ'|יום|ש"ע
  tech            jsonb NOT NULL DEFAULT '{}',     -- eplan datasheet fields: voc, isc, vmp, imp, temp_coeff, mppt[], i_max, isc_max, p_nom...
  tech_source     jsonb,                           -- {document_id, page, verified_by, verified_at}
  cec_key         text,                            -- SAM CEC row / PAN / OND reference
  datasheet_document_id uuid,
  available_il    boolean NOT NULL DEFAULT true,   -- office rule #4
  preferred_rank  integer,
  default_supplier_id uuid REFERENCES engine.suppliers(id),
  block_library_ref text,                          -- bee-block-library index key (cabinets/symbols)
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_kind_idx ON engine.products(kind) WHERE is_active;

ALTER TABLE engine.designs   ADD FOREIGN KEY (module_product_id)   REFERENCES engine.products(id);
ALTER TABLE engine.designs   ADD FOREIGN KEY (inverter_product_id) REFERENCES engine.products(id);
ALTER TABLE engine.bom_lines ADD FOREIGN KEY (product_id)          REFERENCES engine.products(id);

CREATE TABLE engine.price_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid REFERENCES engine.suppliers(id),   -- NULL = internal (labour/services/fees)
  name            text NOT NULL,
  audience        engine.price_list_audience NOT NULL DEFAULT 'b2b',
  currency        engine.currency NOT NULL DEFAULT 'ILS',
  valid_from      date NOT NULL,
  valid_to        date,
  status          engine.price_list_status NOT NULL DEFAULT 'draft',
  source_document_id uuid,                         -- original Excel/PDF
  source_sha256   text,
  ingest_method   text,                            -- excel|csv|pdfplumber|camelot|claude_structured|manual
  previous_id     uuid REFERENCES engine.price_lists(id),
  diff_vs_previous jsonb,
  approved_by     uuid REFERENCES engine.app_users(id),
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (status <> 'approved' OR approved_by IS NOT NULL)
);
CREATE INDEX price_lists_supplier_valid_idx ON engine.price_lists(supplier_id, valid_from DESC);

CREATE TABLE engine.price_list_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES engine.price_lists(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES engine.products(id),
  supplier_sku  text,
  cost          numeric(14,2) NOT NULL,            -- עלות (לפני מע"מ)
  currency      engine.currency NOT NULL DEFAULT 'ILS',
  fx_rate       numeric(10,4),                     -- שער יום לפריטים צמודי מט"ח
  list_price    numeric(14,2),                     -- מחיר מחירון מומלץ אם קיים
  min_qty       numeric(12,3) NOT NULL DEFAULT 1,
  block_from    numeric(12,3),                     -- block pricing tier
  lead_time_days integer,
  source_ref    text,                              -- 'page 3 row 12'
  UNIQUE (price_list_id, product_id, min_qty)
);
CREATE INDEX price_list_entries_product_idx ON engine.price_list_entries(product_id);

CREATE TABLE engine.assemblies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,                -- 'kwp_tile_solaredge'
  name_he     text NOT NULL,
  description text,
  params      jsonb NOT NULL DEFAULT '{}',         -- applicability: roof_type, inverter_brand, kwp range, phases
  boq_section_code text,                           -- default '08.xx' section
  version     integer NOT NULL DEFAULT 1,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES engine.app_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.assembly_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id   uuid NOT NULL REFERENCES engine.assemblies(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES engine.products(id),
  qty_per_unit  numeric(12,4) NOT NULL,
  unit_basis    engine.unit_basis NOT NULL,        -- qty = qty_per_unit × basis(kWp|modules|m|...)
  qty_formula   text,                              -- optional expression override (CEL/JS subset) — לאימות
  rounding      text NOT NULL DEFAULT 'ceil',
  optional      boolean NOT NULL DEFAULT false,
  sort          integer NOT NULL DEFAULT 0
);
CREATE INDEX assembly_components_assembly_idx ON engine.assembly_components(assembly_id);

CREATE TABLE engine.pricing_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         engine.pricing_rule_kind NOT NULL,
  key          text NOT NULL UNIQUE,               -- 'markup.module', 'vat.standard', 'auto_line.R8'
  applies_to   jsonb NOT NULL DEFAULT '{}',        -- {product_kind, customer_kind, kwp_min, kwp_max, regulatory_track}
  expr         jsonb NOT NULL,                     -- {factor:1.25} | {percent:18} | {rule_id:'R8', product_sku:...}
  rule_ref     text,                               -- regulatory rule key (R7..R24) when auto_line/validation
  priority     integer NOT NULL DEFAULT 100,
  valid_from   date NOT NULL DEFAULT CURRENT_DATE,
  valid_to     date,
  message_he   text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.discount_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he     text NOT NULL,
  basis       text NOT NULL CHECK (basis IN ('kwp','total','qty')),
  tiers       jsonb NOT NULL,                      -- [{from, to, percent}]
  valid_from  date NOT NULL,
  valid_to    date,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE engine.approval_thresholds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL UNIQUE,             -- 'discount_pct_max','margin_pct_min','quote_total_max'
  value          numeric(14,4) NOT NULL,
  approver_role  engine.app_role_t NOT NULL DEFAULT 'owner',
  message_he     text,
  is_active      boolean NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 8. Quote · QuoteVersion (immutable) · QuoteSection · QuoteLine · quote_events · ChangeOrder
-- -----------------------------------------------------------------------------

CREATE TABLE engine.quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES engine.projects(id),
  number             text NOT NULL UNIQUE,         -- 'Q-2026-0142'
  current_version_id uuid,                         -- FK after quote_versions
  status             engine.quote_status NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_project_idx ON engine.quotes(project_id);

CREATE TABLE engine.quote_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         uuid NOT NULL REFERENCES engine.quotes(id),
  version_no       integer NOT NULL,
  status           engine.quote_status NOT NULL DEFAULT 'draft',
  design_id        uuid REFERENCES engine.designs(id),
  bom_id           uuid REFERENCES engine.boms(id),
  inputs           jsonb NOT NULL,                 -- {kWp, roof_type, modules, inverter, phases, regulatory_track,...}
  price_list_ids   uuid[] NOT NULL DEFAULT '{}',   -- מחירונים שהשתתפו
  rules_snapshot   jsonb NOT NULL DEFAULT '{}',    -- {rule_key: {version, verification, value}}
  pricing_rules_snapshot jsonb NOT NULL DEFAULT '{}',
  vat_pct          numeric(5,2) NOT NULL,          -- parameter with validity (18% from 01/2025 — לאימות בזמן הפקה)
  currency         engine.currency NOT NULL DEFAULT 'ILS',
  fx_rates         jsonb,                          -- {USD: 3.7, EUR: ...} שער יום
  subtotal         numeric(14,2) NOT NULL DEFAULT 0,
  discount_total   numeric(14,2) NOT NULL DEFAULT 0,
  total_before_vat numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount       numeric(14,2) NOT NULL DEFAULT 0,
  total_incl_vat   numeric(14,2) NOT NULL DEFAULT 0,
  cost_total       numeric(14,2),                  -- internal view only
  margin_pct       numeric(6,3),
  payment_schedule jsonb,                          -- [{milestone_key, percent, amount, trigger}]
  roi              jsonb,                          -- {yield, savings_y1, payback_years, npv, irr, cashflow[25], tariff_rule_ids}
  validity_days    integer NOT NULL DEFAULT 30,
  valid_until      date,
  indexation       jsonb,                          -- הצמדה
  warranty_terms   jsonb,
  exclusions_he    text,
  notes_he         text,
  needs_approval   boolean NOT NULL DEFAULT false, -- discount/margin threshold hit
  approved_by      uuid REFERENCES engine.app_users(id),
  approved_at      timestamptz,
  -- lock
  sent_at          timestamptz,                    -- NOT NULL ⇒ immutable (trigger)
  sent_via         engine.outbound_channel,
  sent_job_id      uuid,                           -- dispatch job (trust gate)
  pdf_document_id  uuid,                           -- generated quote PDF
  xlsx_document_id uuid,                           -- generated BOQ
  pdf_sha256       text,
  xlsx_sha256      text,
  accepted_at      timestamptz,
  rejected_at      timestamptz,
  rejection_reason text,
  supersedes_id    uuid REFERENCES engine.quote_versions(id),
  created_by       uuid REFERENCES engine.app_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version_no),
  CHECK (sent_at IS NULL OR (pdf_sha256 IS NOT NULL))
);
CREATE INDEX quote_versions_quote_idx ON engine.quote_versions(quote_id, version_no DESC);
ALTER TABLE engine.quotes ADD FOREIGN KEY (current_version_id) REFERENCES engine.quote_versions(id);
ALTER TABLE engine.boms   ADD FOREIGN KEY (diff_vs_quote_version_id) REFERENCES engine.quote_versions(id);

CREATE TABLE engine.quote_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES engine.quote_versions(id) ON DELETE CASCADE,
  code        text NOT NULL,                       -- '08.01' (text, never numeric)
  title_he    text NOT NULL,
  sort        integer NOT NULL DEFAULT 0,
  customer_visible boolean NOT NULL DEFAULT true,
  UNIQUE (version_id, code)
);

CREATE TABLE engine.quote_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES engine.quote_versions(id) ON DELETE CASCADE,
  section_id      uuid NOT NULL REFERENCES engine.quote_sections(id) ON DELETE CASCADE,
  line_no         text NOT NULL,                   -- '08.01.0010'
  product_id      uuid REFERENCES engine.products(id),
  assembly_id     uuid REFERENCES engine.assemblies(id),
  description_he  text NOT NULL,
  unit            text NOT NULL,
  qty             numeric(12,3) NOT NULL,
  unit_cost       numeric(14,2),                   -- internal
  unit_price      numeric(14,2) NOT NULL,
  discount_pct    numeric(5,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL,          -- ROUND_HALF_UP per line
  currency        engine.currency NOT NULL DEFAULT 'ILS',
  fx_rate         numeric(10,4),
  source          engine.quote_line_source NOT NULL,
  rule_ids        text[],                          -- e.g. {'R8'} for מונה ייצור; marks "לאימות" if rule unverified
  verification_flag boolean NOT NULL DEFAULT false, -- line stems from an unverified rule → shown "לאימות"
  price_snapshot  jsonb NOT NULL,                  -- {product_id, price_list_id, price_list_entry_id, cost, fx_rate, pricing_rule_ids[], at}
  optional        boolean NOT NULL DEFAULT false,
  sort            integer NOT NULL DEFAULT 0,
  UNIQUE (version_id, line_no)
);
CREATE INDEX quote_lines_section_idx ON engine.quote_lines(section_id);

-- Append-only audit for quote lifecycle (report 04 §8).
CREATE TABLE engine.quote_events (
  id          bigserial PRIMARY KEY,
  quote_id    uuid NOT NULL REFERENCES engine.quotes(id),
  version_id  uuid REFERENCES engine.quote_versions(id),
  type        engine.quote_event_type NOT NULL,
  actor_id    uuid REFERENCES engine.app_users(id),
  actor_kind  text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','customer','agent','system')),
  ip          inet,
  user_agent  text,
  document_sha256 text,                            -- which exact PDF was sent/viewed/accepted
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_events_quote_idx ON engine.quote_events(quote_id, created_at);

CREATE TABLE engine.change_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES engine.projects(id),
  quote_id         uuid NOT NULL REFERENCES engine.quotes(id),
  number           integer NOT NULL,               -- "צו שינויים מס' N"
  base_version_id  uuid NOT NULL REFERENCES engine.quote_versions(id),
  new_version_id   uuid NOT NULL REFERENCES engine.quote_versions(id),
  reason_he        text NOT NULL,
  origin           text NOT NULL CHECK (origin IN ('field','design','customer','iec','supplier')),
  work_order_id    uuid,                           -- FK after work_orders (S08 origin)
  delta_lines      jsonb NOT NULL,                 -- only changed lines
  delta_total      numeric(14,2) NOT NULL,
  status           engine.change_order_status NOT NULL DEFAULT 'draft',
  document_id      uuid,
  signature_id     uuid,                           -- FK after signatures
  created_by       uuid REFERENCES engine.app_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, number)
);

-- -----------------------------------------------------------------------------
-- 9. Contract · Signature · Invoice · Payment (S04, S11, S12)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.contracts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES engine.projects(id),
  quote_version_id uuid NOT NULL REFERENCES engine.quote_versions(id),
  number           text NOT NULL UNIQUE,
  template_rev     text NOT NULL,                  -- docxtemplater template version
  status           engine.contract_status NOT NULL DEFAULT 'draft',
  document_id      uuid,                           -- PDF (unsigned)
  signed_document_id uuid,                         -- PDF with signature page / PAdES
  total_incl_vat   numeric(14,2) NOT NULL,
  payment_schedule jsonb NOT NULL,                 -- copied from quote version at creation
  sent_at          timestamptz,
  signed_at        timestamptz,
  cancelled_at     timestamptz,
  supersedes_id    uuid REFERENCES engine.contracts(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contracts_project_idx ON engine.contracts(project_id);

CREATE TABLE engine.signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES engine.projects(id),
  subject_table   text NOT NULL,                   -- 'contracts'|'quote_versions'|'change_orders'|'handover_packs'|'inspections'
  subject_id      uuid NOT NULL,
  signer_contact_id uuid REFERENCES engine.contacts(id),
  signer_user_id  uuid REFERENCES engine.app_users(id),
  signer_name     text NOT NULL,
  signer_phone    text,
  method          engine.signature_method NOT NULL,
  document_sha256 text NOT NULL,                   -- hash of the exact PDF presented
  otp_channel     text,                            -- sms|whatsapp
  otp_verified_at timestamptz,
  drawn_signature_r2_key text,
  ip              inet,
  user_agent      text,
  geo             jsonb,
  certificate_document_id uuid,                    -- "דף תעודה" PDF
  pades_provider  text,                            -- documenso|comsign|... (phase 2)
  signed_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signatures_subject_idx ON engine.signatures(subject_table, subject_id);
ALTER TABLE engine.change_orders ADD FOREIGN KEY (signature_id) REFERENCES engine.signatures(id);

CREATE TABLE engine.invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid REFERENCES engine.projects(id),
  customer_id      uuid NOT NULL REFERENCES engine.customers(id),
  maintenance_contract_id uuid,                    -- FK after maintenance_contracts (S12 billing)
  kind             engine.invoice_kind NOT NULL,
  milestone_id     uuid REFERENCES engine.milestones(id),
  quote_version_id uuid REFERENCES engine.quote_versions(id),
  status           engine.invoice_status NOT NULL DEFAULT 'draft',
  amount_before_vat numeric(14,2) NOT NULL,
  vat_amount       numeric(14,2) NOT NULL,
  amount_incl_vat  numeric(14,2) NOT NULL,
  currency         engine.currency NOT NULL DEFAULT 'ILS',
  provider         text NOT NULL DEFAULT 'morning',  -- morning|icount|manual
  provider_doc_id  text,                           -- Morning document id
  provider_doc_number text,                        -- מספר חשבונית
  allocation_number text,                          -- מספר הקצאה (חשבוניות ישראל) — סף לאימות V18
  document_id      uuid,
  issued_at        timestamptz,
  due_at           date,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_project_idx  ON engine.invoices(project_id);
CREATE INDEX invoices_customer_idx ON engine.invoices(customer_id, status);

CREATE TABLE engine.payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid REFERENCES engine.invoices(id),
  project_id      uuid REFERENCES engine.projects(id),
  customer_id     uuid NOT NULL REFERENCES engine.customers(id),
  amount          numeric(14,2) NOT NULL,
  currency        engine.currency NOT NULL DEFAULT 'ILS',
  method          engine.payment_method NOT NULL,
  provider        text,                            -- grow|cardcom|bank
  provider_ref    text,                            -- transaction id / payment link id
  receipt_document_id uuid,
  received_at     timestamptz NOT NULL,
  recorded_by     uuid REFERENCES engine.app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON engine.payments(invoice_id);

-- -----------------------------------------------------------------------------
-- 10. Submission (iec | historic | authority | fire) · SubmissionStep · Form ·
--     Fee/Receipt · Correspondence   (S05, S10; generic per external body)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.submission_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE,           -- 'iec_pre_application.residential_le15'
  kind             engine.submission_kind NOT NULL,
  authority        engine.submission_authority NOT NULL,
  regulatory_track engine.regulatory_track,        -- NULL = all
  name_he          text NOT NULL,
  steps            jsonb NOT NULL,                 -- [{key, name_he, order, required_documents[], fee{product_sku}, sla_business_days, sla_rule_id, signers[], waits_on}]
  rule_ids         text[] NOT NULL DEFAULT '{}',   -- rules that justify steps (R2, R8, R17, R18...)
  verification     engine.rule_verification NOT NULL DEFAULT 'unverified',
  version          integer NOT NULL DEFAULT 1,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES engine.projects(id),
  kind            engine.submission_kind NOT NULL,
  authority       engine.submission_authority NOT NULL,
  template_id     uuid REFERENCES engine.submission_templates(id),
  template_version integer,
  stage           engine.project_stage NOT NULL,   -- S05 or S10 (or S06 for permits)
  status          engine.submission_status NOT NULL DEFAULT 'draft',
  external_ref    text,                            -- מס' תיק / בקשה / הזמנה ב-digitalorders
  portal          text,                            -- digitalorders|hamaagal|producers_portal|email|distributor
  submitted_at    timestamptz,
  submitted_by    uuid REFERENCES engine.app_users(id),
  answered_at     timestamptz,
  answer          jsonb,                           -- {positive:bool, approved_kw, conditions_he, document_id}
  due_at          timestamptz,                     -- SLA (business days) — V1 לאימות
  pack_document_id uuid,                           -- merged PDF pack
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_project_idx ON engine.submissions(project_id);
CREATE INDEX submissions_waiting_idx ON engine.submissions(status, due_at) WHERE status IN ('submitted','waiting_authority');

CREATE TABLE engine.submission_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES engine.submissions(id) ON DELETE CASCADE,
  key            text NOT NULL,
  name_he        text NOT NULL,
  step_order     integer NOT NULL,
  status         engine.submission_step_status NOT NULL DEFAULT 'not_started',
  owner_id       uuid REFERENCES engine.app_users(id),
  required_document_kinds engine.document_kind[] NOT NULL DEFAULT '{}',
  document_ids   uuid[] NOT NULL DEFAULT '{}',
  external_ref   text,
  started_at     timestamptz,
  submitted_at   timestamptz,
  due_at         timestamptz,                      -- engine.add_business_days(submitted_at, sla_business_days)
  sla_business_days integer,
  sla_rule_id    text,                             -- rule key backing the SLA (לאימות V1)
  done_at        timestamptz,
  blocked_reason text,
  verification_flag boolean NOT NULL DEFAULT false, -- step stems from unverified rule
  UNIQUE (submission_id, key)
);
CREATE INDEX submission_steps_due_idx ON engine.submission_steps(due_at) WHERE status IN ('submitted','waiting_authority');

CREATE TABLE engine.forms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES engine.submissions(id) ON DELETE CASCADE,
  step_id        uuid REFERENCES engine.submission_steps(id),
  form_key       text NOT NULL,                    -- 'iec_pv_integration_request' (טופס 22-8-22 — גרסה לאימות V5)
  form_version   text,
  template_document_id uuid,                       -- blank PDF form
  field_values   jsonb NOT NULL DEFAULT '{}',      -- filled values (from Project/Site/Survey/Design)
  filled_document_id uuid,                         -- filled PDF
  filled_at      timestamptz,
  signed_by      jsonb,                            -- [{role: installer|designer|customer, signature_id}]
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Fee/Receipt (master plan §5) — fee{amount, receipt, paidAt} of a step (§9.2)
CREATE TABLE engine.submission_fees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES engine.submissions(id) ON DELETE CASCADE,
  step_id         uuid REFERENCES engine.submission_steps(id),
  fee_product_id  uuid REFERENCES engine.products(id),  -- product kind 'fee' (אגרה)
  description_he  text NOT NULL,
  amount          numeric(14,2),                   -- as billed (e.g. 704.22 — מהות לאימות V2)
  currency        engine.currency NOT NULL DEFAULT 'ILS',
  payment_request_ref text,                        -- 'הצעת חשבון' number
  paid_at         timestamptz,
  paid_by         text,                            -- customer|bee
  receipt_ref     text,                            -- אסמכתא
  receipt_document_id uuid,
  payment_id      uuid REFERENCES engine.payments(id),
  ocr_payload     jsonb,                           -- Claude vision extraction, pending approval
  confirmed_by    uuid REFERENCES engine.app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.correspondence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES engine.submissions(id) ON DELETE CASCADE,
  step_id        uuid REFERENCES engine.submission_steps(id),
  channel        engine.correspondence_channel NOT NULL,
  direction      engine.direction NOT NULL,
  counterpart    text,                             -- 'חח"י מחוז דרום' / 'מחלק קיבוץ X'
  subject        text,
  body           text,
  external_id    text,                             -- Gmail thread id
  document_ids   uuid[] NOT NULL DEFAULT '{}',
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  recorded_by    uuid REFERENCES engine.app_users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX correspondence_submission_idx ON engine.correspondence(submission_id, occurred_at);

-- -----------------------------------------------------------------------------
-- 11. PurchaseOrder · POLine · Delivery (S07)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES engine.projects(id),
  supplier_id   uuid NOT NULL REFERENCES engine.suppliers(id),
  bom_id        uuid REFERENCES engine.boms(id),
  number        text NOT NULL UNIQUE,              -- 'PO-2026-0031'
  status        engine.po_status NOT NULL DEFAULT 'draft',
  price_list_id uuid REFERENCES engine.price_lists(id),
  currency      engine.currency NOT NULL DEFAULT 'ILS',
  total_before_vat numeric(14,2) NOT NULL DEFAULT 0,
  expected_delivery date,
  document_id   uuid,
  sent_at       timestamptz,
  sent_job_id   uuid,
  confirmed_at  timestamptz,
  supplier_ref  text,
  notes         text,
  created_by    uuid REFERENCES engine.app_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_orders_project_idx  ON engine.purchase_orders(project_id);
CREATE INDEX purchase_orders_supplier_idx ON engine.purchase_orders(supplier_id, status);

CREATE TABLE engine.po_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         uuid NOT NULL REFERENCES engine.purchase_orders(id) ON DELETE CASCADE,
  bom_line_id   uuid REFERENCES engine.bom_lines(id),
  product_id    uuid NOT NULL REFERENCES engine.products(id),
  description_he text NOT NULL,
  unit          text NOT NULL,
  qty_ordered   numeric(12,3) NOT NULL,
  qty_delivered numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost     numeric(14,2) NOT NULL,
  price_snapshot jsonb NOT NULL,
  is_critical   boolean NOT NULL DEFAULT false,    -- blocks S08 until delivered/scheduled
  lead_time_days integer,
  line_no       integer NOT NULL,
  UNIQUE (po_id, line_no)
);

CREATE TABLE engine.deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         uuid NOT NULL REFERENCES engine.purchase_orders(id),
  delivery_note_ref text,                          -- תעודת משלוח
  delivered_at  timestamptz,
  scheduled_at  date,
  received_by   uuid REFERENCES engine.app_users(id),
  lines         jsonb NOT NULL,                    -- [{po_line_id, qty, serials[]}]
  serials       text[],                            -- inverters/modules SNs (feeds MonitoringLink equipment)
  document_id   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_po_idx ON engine.deliveries(po_id);

-- -----------------------------------------------------------------------------
-- 12. WorkOrder · Crew · DailyReport · Checklist (S08; ChangeOrder in §8)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.crews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  lead_user_id uuid REFERENCES engine.app_users(id),
  capacity_modules_per_day integer,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE engine.crew_members (
  crew_id   uuid NOT NULL REFERENCES engine.crews(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES engine.app_users(id),
  PRIMARY KEY (crew_id, user_id)
);
ALTER TABLE engine.tasks ADD FOREIGN KEY (crew_id) REFERENCES engine.crews(id);

CREATE TABLE engine.work_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES engine.projects(id),
  design_id     uuid REFERENCES engine.designs(id),
  drawing_set_id uuid REFERENCES engine.drawing_sets(id),
  crew_id       uuid REFERENCES engine.crews(id),
  foreman_id    uuid REFERENCES engine.app_users(id),
  status        engine.work_order_status NOT NULL DEFAULT 'planned',
  scope_he      text,
  planned_start date,
  planned_finish date,
  actual_start  date,
  actual_finish date,
  resources     jsonb,                             -- {crane_days, scaffold_days}
  gcal_event_id text,
  as_made_deltas jsonb NOT NULL DEFAULT '[]',      -- field deviations → as-made design rev
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_orders_project_idx ON engine.work_orders(project_id);
CREATE INDEX work_orders_crew_dates_idx ON engine.work_orders(crew_id, planned_start, planned_finish);
ALTER TABLE engine.change_orders ADD FOREIGN KEY (work_order_id) REFERENCES engine.work_orders(id);

CREATE TABLE engine.checklists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES engine.projects(id),
  work_order_id uuid REFERENCES engine.work_orders(id),
  kind          engine.checklist_kind NOT NULL,
  template_key  text NOT NULL,                     -- 'install.tile.solaredge'
  template_version integer NOT NULL DEFAULT 1,
  items         jsonb NOT NULL,                    -- [{key, label_he, required, done, by, at, photo_ids[], value}]
  completed_at  timestamptz,
  completed_by  uuid REFERENCES engine.app_users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklists_project_idx ON engine.checklists(project_id, kind);

CREATE TABLE engine.daily_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES engine.projects(id),
  work_order_id uuid REFERENCES engine.work_orders(id),
  report_date   date NOT NULL,
  template_key  text NOT NULL,                     -- bee-build DSL template (daily|tour|defects|...)
  template_rev  text,
  content       jsonb NOT NULL,                    -- DSL blocks (9 block types) — offline autosave payload
  crew_id       uuid REFERENCES engine.crews(id),
  author_id     uuid REFERENCES engine.app_users(id),
  photo_ids     uuid[] NOT NULL DEFAULT '{}',
  signature_id  uuid REFERENCES engine.signatures(id),
  document_id   uuid,                              -- PDF
  closed_at     timestamptz,
  pwa_record_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, report_date, template_key, author_id)
);
CREATE INDEX daily_reports_project_idx ON engine.daily_reports(project_id, report_date DESC);

-- -----------------------------------------------------------------------------
-- 13. Inspection · TestResult (IEC 62446-1) · Defect (S09; also S12 periodic)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES engine.projects(id),
  site_id         uuid NOT NULL REFERENCES engine.sites(id),
  kind            engine.inspection_kind NOT NULL,
  status          engine.inspection_status NOT NULL DEFAULT 'planned',
  inspector_type  text,                            -- 'type1'|'type2'|'type3' per Rule R17 — ספים לאימות V7
  inspector_type_rule_id text,
  inspector_user_id uuid REFERENCES engine.app_users(id),
  inspector_name  text,
  inspector_license text,
  scheduled_at    timestamptz,
  performed_at    timestamptz,
  ambient_temp_c  numeric(5,2),
  irradiance_wm2  numeric(7,2),
  category        engine.test_category NOT NULL DEFAULT 'cat1',
  cat2_required   boolean NOT NULL DEFAULT false,
  design_id       uuid REFERENCES engine.designs(id),
  report_document_id uuid,                         -- signed PDF
  signature_id    uuid REFERENCES engine.signatures(id),
  is_baseline     boolean NOT NULL DEFAULT false,  -- feeds MonitoringLink baseline
  next_due_at     date,                            -- periodic (5 שנים — מקור לאימות V20)
  re_inspection_of uuid REFERENCES engine.inspections(id),
  gcal_event_id   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_project_idx ON engine.inspections(project_id);
CREATE INDEX inspections_due_idx ON engine.inspections(next_due_at) WHERE next_due_at IS NOT NULL;

CREATE TABLE engine.test_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  uuid NOT NULL REFERENCES engine.inspections(id) ON DELETE CASCADE,
  category       engine.test_category NOT NULL,
  kind           engine.test_kind NOT NULL,
  scope          text NOT NULL,                    -- 'system'|'inverter:SN'|'mppt:1'|'string:INV1/M1/S2'|'combiner:CB1'
  inverter_serial text,
  mppt_no        integer,
  string_no      integer,
  value_num      numeric(12,4),                    -- Voc (V), Isc (A), Riso (MΩ), continuity (Ω)
  unit           text,
  expected_num   numeric(12,4),                    -- calculated from design at measured temp
  pass           boolean,
  threshold_rule_id text,                          -- rule key for limit (ערכי בידוד — לאימות)
  temp_c         numeric(5,2),
  irradiance_wm2 numeric(7,2),
  instrument     text,
  curve          jsonb,                            -- I-V points (cat2)
  photo_ids      uuid[] NOT NULL DEFAULT '{}',     -- thermal images
  notes          text,
  measured_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_results_inspection_idx ON engine.test_results(inspection_id, kind);

CREATE TABLE engine.defects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES engine.projects(id),
  inspection_id  uuid REFERENCES engine.inspections(id),
  test_result_id uuid REFERENCES engine.test_results(id),
  severity       engine.defect_severity NOT NULL,
  status         engine.defect_status NOT NULL DEFAULT 'open',
  description_he text NOT NULL,
  location       text,
  rule_id        text,                             -- violated rule (R11, R14, R19...)
  photo_ids      uuid[] NOT NULL DEFAULT '{}',
  task_id        uuid REFERENCES engine.tasks(id), -- fix task (S09 → S08 rollback)
  fixed_at       timestamptz,
  verified_at    timestamptz,
  verified_by    uuid REFERENCES engine.app_users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX defects_project_open_idx ON engine.defects(project_id) WHERE status = 'open';
ALTER TABLE engine.tasks ADD FOREIGN KEY (source_defect_id) REFERENCES engine.defects(id);

-- -----------------------------------------------------------------------------
-- 14. GridConnection (S10)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.grid_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES engine.projects(id),
  site_id          uuid NOT NULL REFERENCES engine.sites(id),
  submission_id    uuid REFERENCES engine.submissions(id),  -- iec_inspection_meter
  distributor      text,                           -- NULL = חח"י
  meter_serial     text,
  meter_code       text,
  meter_kind       text,                           -- bidirectional|production|both — לאימות
  contract_number  text,
  bp_number        text,
  approved_kw      numeric(10,3),
  track            engine.regulatory_track,        -- as registered (should equal projects.regulatory_track)
  tariff_track_ref text,                           -- producers portal registration ref
  tariff_registered_at timestamptz,
  iec_inspection_at timestamptz,
  iec_inspection_result text,
  meter_installed_at timestamptz,
  operation_approved_at timestamptz,
  operating_permit_ref text,                       -- היתר הפעלה (04/2026, לאימות V10)
  operating_permit_at timestamptz,
  activated_at     timestamptz,                    -- baseline start for monitoring
  export_limit_kw  numeric(10,3),
  documents        uuid[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX grid_connections_project_uq ON engine.grid_connections(project_id);
CREATE INDEX grid_connections_meter_idx ON engine.grid_connections(meter_serial);

-- -----------------------------------------------------------------------------
-- 15. HandoverPack · Warranty (S11)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.handover_packs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES engine.projects(id),
  design_id       uuid REFERENCES engine.designs(id),   -- as-made rev
  contents        jsonb NOT NULL,                  -- [{section, document_id, bookmark}] (system data, as-made, strings, datasheets, mechanical, O&M, tests)
  system_summary  jsonb NOT NULL,                  -- kWp DC, kW AC, phases, module/inverter models, counts, orientations
  equipment_inventory jsonb NOT NULL DEFAULT '[]', -- [{kind, manufacturer, model, serial, firmware, comm_type, location}]
  string_map      jsonb,                           -- [{inverter_sn, mppt, string, modules, voc, isc, riso, temp, irr}]
  document_id     uuid,                            -- merged PDF with bookmarks + DXF attachments
  training_done_at timestamptz,
  trained_contact_id uuid REFERENCES engine.contacts(id),
  iec_data_consent jsonb,                          -- {consented_at, contact_id, token_ref (vault), scope}
  signed_at       timestamptz,
  signature_id    uuid REFERENCES engine.signatures(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX handover_packs_project_uq ON engine.handover_packs(project_id);

CREATE TABLE engine.warranties (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES engine.projects(id),
  site_id        uuid NOT NULL REFERENCES engine.sites(id),
  scope          text NOT NULL CHECK (scope IN ('module_product','module_performance','inverter','optimizer','battery','structure','workmanship','other')),
  product_id     uuid REFERENCES engine.products(id),
  provider       text NOT NULL,                    -- manufacturer | 'B.E.E'
  serials        text[],
  starts_at      date NOT NULL,
  ends_at        date NOT NULL,
  terms_he       text,
  document_id    uuid,
  registered_ref text,                             -- manufacturer registration id
  reminder_task_id uuid REFERENCES engine.tasks(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX warranties_ends_idx ON engine.warranties(ends_at);

-- -----------------------------------------------------------------------------
-- 16. MonitoringLink — bridge to live bee-live site/integration tables (S11 → S12)
--     bee-live column names are unknown here; see spec §MonitoringLink mapping.
-- -----------------------------------------------------------------------------

CREATE TABLE engine.monitoring_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES engine.projects(id),
  site_id            uuid NOT NULL REFERENCES engine.sites(id),
  bee_live_site_id   text,                         -- FK to existing bee-live sites table — column לאימות
  bee_live_integration_id text,                    -- FK to existing bee-live integration/adapter row — לאימות
  vendor             engine.monitoring_vendor NOT NULL,
  vendor_site_id     text,                         -- SolarEdge siteId / Huawei stationCode / Sungrow ps_id ...
  vendor_site_key    text,                         -- Sungrow ps_key etc.
  region             text,                         -- gateway/region (sungrow eu/hk, huawei prefix, growatt host)
  auth_mode          engine.auth_mode NOT NULL,
  credential_ref     text,                         -- vault/encrypted-secret reference, NEVER the secret
  sharing_status     engine.sharing_status NOT NULL DEFAULT 'not_requested',
  sharing_status_at  timestamptz,
  sharing_owner_contact_id uuid REFERENCES engine.contacts(id),  -- who at the customer owns the vendor account
  expected_latency_minutes integer,                -- 15 SE, 5 Sungrow/Huawei ...
  status             engine.monitoring_link_status NOT NULL DEFAULT 'pending',
  first_sync_at      timestamptz,
  last_sync_at       timestamptz,
  equipment          jsonb NOT NULL DEFAULT '[]',  -- inverters/optimizers/loggers with SN, firmware, comm, modbus/ip
  string_map         jsonb,                        -- baseline Voc/Isc/Riso per string (from inspections)
  arrays             jsonb,                        -- [{azimuth, tilt, kwp, modules}] for PVGIS/pvlib
  expected_kwh_month numeric(12,0)[],              -- 12 values
  pr_design          numeric(5,3),
  alert_thresholds   jsonb,                        -- {zero_production_min, underperf_pct, comm_loss_min}
  alert_contacts     jsonb,                        -- [{contact_id, channels[]}]
  quiet_windows      jsonb,                        -- cleaning/works
  baseline_inspection_id uuid REFERENCES engine.inspections(id),
  grid_connection_id uuid REFERENCES engine.grid_connections(id),
  iec_data_consent_ref text,                       -- token ref for py-iec-api (unofficial) — לאימות
  modbus             jsonb,                        -- {ip, port, unit_id, sunspec_models[]} for KStar/local
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitoring_links_site_idx   ON engine.monitoring_links(site_id);
CREATE INDEX monitoring_links_vendor_idx ON engine.monitoring_links(vendor, vendor_site_id);
CREATE INDEX monitoring_links_sharing_idx ON engine.monitoring_links(sharing_status) WHERE sharing_status IN ('requested','denied');

-- -----------------------------------------------------------------------------
-- 17. O&M (on Site): MaintenanceContract · ServiceTicket · PeriodicInspection (S12)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.maintenance_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES engine.sites(id),
  customer_id     uuid NOT NULL REFERENCES engine.customers(id),
  project_id      uuid REFERENCES engine.projects(id),
  tier            engine.maintenance_tier NOT NULL,
  terms           jsonb NOT NULL,                  -- {cleanings_per_year, inspection_interval_months, response_sla_hours, annual_report}
  price_year      numeric(14,2) NOT NULL,
  currency        engine.currency NOT NULL DEFAULT 'ILS',
  billing_cycle   text NOT NULL DEFAULT 'yearly',
  starts_at       date NOT NULL,
  ends_at         date NOT NULL,
  auto_renew      boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','expired','cancelled')),
  document_id     uuid,
  signature_id    uuid REFERENCES engine.signatures(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_contracts_site_idx ON engine.maintenance_contracts(site_id);
CREATE INDEX maintenance_contracts_renewal_idx ON engine.maintenance_contracts(ends_at) WHERE status = 'active';
ALTER TABLE engine.invoices ADD FOREIGN KEY (maintenance_contract_id) REFERENCES engine.maintenance_contracts(id);

CREATE TABLE engine.service_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES engine.sites(id),
  customer_id     uuid NOT NULL REFERENCES engine.customers(id),
  project_id      uuid REFERENCES engine.projects(id),
  maintenance_contract_id uuid REFERENCES engine.maintenance_contracts(id),
  alert_kind      engine.alert_kind NOT NULL,
  bee_live_alert_id text,                          -- existing bee-live alert row — column לאימות
  priority        engine.ticket_priority NOT NULL DEFAULT 'normal',
  status          engine.task_status NOT NULL DEFAULT 'todo',
  title           text NOT NULL,
  description     text,
  assignee_id     uuid REFERENCES engine.app_users(id),
  crew_id         uuid REFERENCES engine.crews(id),
  scheduled_at    timestamptz,
  sla_due_at      timestamptz,
  resolved_at     timestamptz,
  resolution_he   text,
  report_document_id uuid,                         -- field report PDF
  invoice_id      uuid REFERENCES engine.invoices(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_tickets_site_idx ON engine.service_tickets(site_id, status);
CREATE INDEX service_tickets_open_idx ON engine.service_tickets(sla_due_at) WHERE status NOT IN ('done','cancelled');

CREATE TABLE engine.periodic_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES engine.sites(id),
  maintenance_contract_id uuid REFERENCES engine.maintenance_contracts(id),
  inspection_id   uuid REFERENCES engine.inspections(id),  -- kind='periodic'
  due_at          date NOT NULL,
  performed_at    date,
  kpi_snapshot    jsonb,                           -- PR, specific yield, availability, EPI vs PVGIS (IEC 61724-1)
  compared_to_baseline jsonb,                      -- deltas vs is_baseline inspection
  report_document_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX periodic_inspections_due_idx ON engine.periodic_inspections(due_at) WHERE performed_at IS NULL;

-- -----------------------------------------------------------------------------
-- 18. Document (never deleted; supersedes chain; generated_from provenance)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES engine.projects(id),   -- NULL for catalog-level docs (price lists, datasheets)
  customer_id     uuid REFERENCES engine.customers(id),
  kind            engine.document_kind NOT NULL,
  rev             integer NOT NULL DEFAULT 1,
  title_he        text,
  folder_path     text,                            -- '04-הגשות/חחי'
  r2_key          text NOT NULL,
  r2_version_id   text,
  sha256          text NOT NULL,
  size_bytes      bigint,
  mime_type       text NOT NULL,
  source          engine.document_source NOT NULL,
  generated_from  jsonb,                           -- {design_rev, quote_version_id, template_rev, rules_snapshot_hash, inputs_hash, job_id}
  stale           boolean NOT NULL DEFAULT false,  -- inputs changed since generation
  signed_by       uuid[] NOT NULL DEFAULT '{}',    -- signature ids
  sent_at         timestamptz,
  sent_job_id     uuid,
  supersedes_id   uuid REFERENCES engine.documents(id),
  superseded_by_id uuid REFERENCES engine.documents(id),
  customer_visible boolean NOT NULL DEFAULT false,
  drive_file_id   text,                            -- one-way mirror
  thumbnail_r2_key text,
  created_by      uuid REFERENCES engine.app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_project_kind_idx ON engine.documents(project_id, kind, rev DESC);
CREATE INDEX documents_sha_idx ON engine.documents(sha256);
CREATE INDEX documents_customer_visible_idx ON engine.documents(project_id) WHERE customer_visible;

-- Late FKs to documents
ALTER TABLE engine.photos           ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.calc_reports     ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.drawing_sets     ADD FOREIGN KEY (dwg_document_id)        REFERENCES engine.documents(id);
ALTER TABLE engine.drawing_sets     ADD FOREIGN KEY (pdf_document_id)        REFERENCES engine.documents(id);
ALTER TABLE engine.boms             ADD FOREIGN KEY (csv_document_id)        REFERENCES engine.documents(id);
ALTER TABLE engine.products         ADD FOREIGN KEY (datasheet_document_id)  REFERENCES engine.documents(id);
ALTER TABLE engine.price_lists      ADD FOREIGN KEY (source_document_id)     REFERENCES engine.documents(id);
ALTER TABLE engine.quote_versions   ADD FOREIGN KEY (pdf_document_id)        REFERENCES engine.documents(id);
ALTER TABLE engine.quote_versions   ADD FOREIGN KEY (xlsx_document_id)       REFERENCES engine.documents(id);
ALTER TABLE engine.change_orders    ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.contracts        ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.contracts        ADD FOREIGN KEY (signed_document_id)     REFERENCES engine.documents(id);
ALTER TABLE engine.signatures       ADD FOREIGN KEY (certificate_document_id) REFERENCES engine.documents(id);
ALTER TABLE engine.invoices         ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.payments         ADD FOREIGN KEY (receipt_document_id)    REFERENCES engine.documents(id);
ALTER TABLE engine.submissions      ADD FOREIGN KEY (pack_document_id)       REFERENCES engine.documents(id);
ALTER TABLE engine.forms            ADD FOREIGN KEY (template_document_id)   REFERENCES engine.documents(id);
ALTER TABLE engine.forms            ADD FOREIGN KEY (filled_document_id)     REFERENCES engine.documents(id);
ALTER TABLE engine.submission_fees  ADD FOREIGN KEY (receipt_document_id)    REFERENCES engine.documents(id);
ALTER TABLE engine.purchase_orders  ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.deliveries       ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.daily_reports    ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.inspections      ADD FOREIGN KEY (report_document_id)     REFERENCES engine.documents(id);
ALTER TABLE engine.handover_packs   ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.warranties       ADD FOREIGN KEY (document_id)            REFERENCES engine.documents(id);
ALTER TABLE engine.maintenance_contracts ADD FOREIGN KEY (document_id)       REFERENCES engine.documents(id);
ALTER TABLE engine.service_tickets  ADD FOREIGN KEY (report_document_id)     REFERENCES engine.documents(id);
ALTER TABLE engine.periodic_inspections ADD FOREIGN KEY (report_document_id) REFERENCES engine.documents(id);

-- -----------------------------------------------------------------------------
-- 19. Rules (R1–R24 + office rules + eplan rules) — data, not code
-- -----------------------------------------------------------------------------

CREATE TABLE engine.rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL,                    -- 'R7', 'R17', 'OFFICE-04', 'EPLAN-voc-cold'
  version        integer NOT NULL DEFAULT 1,
  scope          engine.rule_scope NOT NULL,
  title_he       text NOT NULL,
  description_he text,
  applies_to     jsonb NOT NULL DEFAULT '{}',      -- {regulatory_track[], project_kind[], kwp_min, kwp_max, phases, has_bess}
  threshold      jsonb,                            -- {field:'p_kw', op:'>', value:15, unit:'kW'} — VALUES ARE DATA, never hard-coded
  consequence_kind engine.rule_consequence_kind NOT NULL,
  consequence    jsonb NOT NULL,                   -- {product_sku, qty_basis} | {document_kind} | {field, value} | {message_he}
  source         text NOT NULL,                    -- 'אמת מידה 35כ2' | 'הנחיות 24.01.2022 §11' | 'תקנות רישיונות 1985'
  section        text,
  source_url     text,
  source_document_id uuid REFERENCES engine.documents(id),
  valid_from     date,
  valid_to       date,
  verification   engine.rule_verification NOT NULL DEFAULT 'unverified',
  verified_by    uuid REFERENCES engine.app_users(id),
  verified_at    timestamptz,
  verification_note text,
  test_case      jsonb,                            -- every rule has a test case (master plan §15)
  supersedes_id  uuid REFERENCES engine.rules(id),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version),
  CHECK (verification <> 'validated' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX rules_scope_active_idx ON engine.rules(scope) WHERE is_active;

-- Append-only history of verification changes (who validated what, when).
CREATE TABLE engine.rule_reviews (
  id           bigserial PRIMARY KEY,
  rule_id      uuid NOT NULL REFERENCES engine.rules(id),
  from_level   engine.rule_verification,
  to_level     engine.rule_verification NOT NULL,
  reviewer_id  uuid REFERENCES engine.app_users(id),
  note         text,
  evidence_document_id uuid REFERENCES engine.documents(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 20. Jobs ledger (platform/schema/job.schema.json) + approvals (Trust Gate)
-- -----------------------------------------------------------------------------

CREATE TABLE engine.jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          engine.job_kind NOT NULL,
  loop          text NOT NULL CHECK (loop ~ '^(collect|edit|dispatch)\.[a-z0-9_-]+$'),
  status        engine.job_status NOT NULL DEFAULT 'queued',
  trust_tier    engine.trust_tier NOT NULL,
  cost_tier     smallint CHECK (cost_tier BETWEEN 0 AND 4),
  source        text,                              -- gmail|whatsapp|monday|pwa|cron|agent|user
  project_id    uuid REFERENCES engine.projects(id),
  idempotency_key text UNIQUE,
  payload       jsonb NOT NULL DEFAULT '{}',
  result        jsonb,
  error         text,
  outbound_channel engine.outbound_channel,
  outbound_destination_class engine.destination_class,
  requires_human_pick boolean,
  approval_id   uuid,                              -- FK after approvals
  pgboss_job_id uuid,
  agent_name    text,                              -- intake|quote_drafter|price_ingest|design_assistant|submission_assistant|receipt_updater|stuck_monitor
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
-- Law #2: every outbound to customer/supplier must require a human pick.
ALTER TABLE engine.jobs ADD CONSTRAINT jobs_law2_outbound_requires_pick CHECK (
  outbound_destination_class IS NULL
  OR outbound_destination_class NOT IN ('customer','supplier')
  OR requires_human_pick IS TRUE
);
CREATE INDEX jobs_status_idx  ON engine.jobs(status, created_at);
CREATE INDEX jobs_project_idx ON engine.jobs(project_id, created_at DESC);
CREATE INDEX jobs_loop_idx    ON engine.jobs(loop);

ALTER TABLE engine.project_events    ADD FOREIGN KEY (job_id)      REFERENCES engine.jobs(id);
ALTER TABLE engine.communication_log ADD FOREIGN KEY (job_id)      REFERENCES engine.jobs(id);
ALTER TABLE engine.calc_reports      ADD FOREIGN KEY (job_id)      REFERENCES engine.jobs(id);
ALTER TABLE engine.drawing_sets      ADD FOREIGN KEY (cad_worker_job_id) REFERENCES engine.jobs(id);
ALTER TABLE engine.quote_versions    ADD FOREIGN KEY (sent_job_id) REFERENCES engine.jobs(id);
ALTER TABLE engine.purchase_orders   ADD FOREIGN KEY (sent_job_id) REFERENCES engine.jobs(id);
ALTER TABLE engine.documents         ADD FOREIGN KEY (sent_job_id) REFERENCES engine.jobs(id);

CREATE TABLE engine.approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,                     -- outbound_msg|quote_send|price_list|stage_transition|rule_change|...
  job_id        uuid REFERENCES engine.jobs(id),
  project_id    uuid REFERENCES engine.projects(id),
  subject_table text,
  subject_id    uuid,
  payload       jsonb NOT NULL,                    -- what will happen if approved (draft message, proposed transition)
  options       jsonb,                             -- alternatives for human pick
  requested_by  text NOT NULL CHECK (requested_by IN ('agent','user','system')),
  requested_by_user_id uuid REFERENCES engine.app_users(id),
  status        engine.approval_status NOT NULL DEFAULT 'pending',
  decided_by    uuid REFERENCES engine.app_users(id),
  decided_at    timestamptz,
  decision_note text,
  picked_option integer,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_pending_idx ON engine.approvals(created_at) WHERE status = 'pending';
ALTER TABLE engine.jobs ADD FOREIGN KEY (approval_id) REFERENCES engine.approvals(id);

-- -----------------------------------------------------------------------------
-- 21. Triggers
-- -----------------------------------------------------------------------------

-- 21.1 updated_at
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'app_users','customers','contacts','sites','projects','schedules','tasks','surveys',
    'suppliers','products','assemblies','pricing_rules','quotes','contracts','invoices',
    'submissions','purchase_orders','work_orders','checklists','daily_reports','inspections',
    'defects','grid_connections','handover_packs','monitoring_links','maintenance_contracts',
    'service_tickets','rules'])
  LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON engine.%I FOR EACH ROW EXECUTE FUNCTION engine.set_updated_at()', t, t);
  END LOOP;
END $$;

-- 21.2 project_events: insert-only (no UPDATE / DELETE), per-project seq auto-fill
CREATE OR REPLACE FUNCTION engine.project_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'project_events is append-only (attempted %)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER project_events_no_update_delete
  BEFORE UPDATE OR DELETE ON engine.project_events
  FOR EACH ROW EXECUTE FUNCTION engine.project_events_immutable();

CREATE OR REPLACE FUNCTION engine.project_events_fill_seq() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seq IS NULL THEN
    SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
      FROM engine.project_events WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_events_seq BEFORE INSERT ON engine.project_events
  FOR EACH ROW EXECUTE FUNCTION engine.project_events_fill_seq();

-- Same append-only guard for quote_events and rule_reviews.
CREATE TRIGGER quote_events_no_update_delete
  BEFORE UPDATE OR DELETE ON engine.quote_events
  FOR EACH ROW EXECUTE FUNCTION engine.project_events_immutable();
CREATE TRIGGER rule_reviews_no_update_delete
  BEFORE UPDATE OR DELETE ON engine.rule_reviews
  FOR EACH ROW EXECUTE FUNCTION engine.project_events_immutable();

-- 21.3 documents: never deleted (supersede instead)
CREATE OR REPLACE FUNCTION engine.documents_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'documents are never deleted (id=%); create a superseding revision instead', OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END $$;
CREATE TRIGGER documents_prevent_delete
  BEFORE DELETE ON engine.documents
  FOR EACH ROW EXECUTE FUNCTION engine.documents_no_delete();

-- Documents: only lifecycle columns may change after creation (file content is immutable).
CREATE OR REPLACE FUNCTION engine.documents_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.r2_key IS DISTINCT FROM OLD.r2_key
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.rev IS DISTINCT FROM OLD.rev
     OR NEW.generated_from IS DISTINCT FROM OLD.generated_from
     OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'document % content/provenance is immutable', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documents_guard_update BEFORE UPDATE ON engine.documents
  FOR EACH ROW EXECUTE FUNCTION engine.documents_guard_update();

-- 21.4 quote_versions: locked once sent_at IS NOT NULL.
--      Allowed after lock: status, accepted_at, rejected_at, rejection_reason (lifecycle only).
CREATE OR REPLACE FUNCTION engine.quote_versions_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[] := ARRAY['status','accepted_at','rejected_at','rejection_reason'];
  changed text[];
BEGIN
  IF OLD.sent_at IS NULL THEN
    RETURN NEW;                                    -- still a draft: free to edit
  END IF;
  SELECT array_agg(key) INTO changed
  FROM jsonb_each(to_jsonb(NEW)) n
  WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
    AND NOT (n.key = ANY(allowed));
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'quote_version % is locked (sent_at=%); changed columns: %. Create a new version.',
      OLD.id, OLD.sent_at, changed
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_versions_lock_on_sent BEFORE UPDATE ON engine.quote_versions
  FOR EACH ROW EXECUTE FUNCTION engine.quote_versions_lock();

CREATE OR REPLACE FUNCTION engine.quote_versions_no_delete_when_sent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'quote_version % was sent and cannot be deleted', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER quote_versions_prevent_delete BEFORE DELETE ON engine.quote_versions
  FOR EACH ROW EXECUTE FUNCTION engine.quote_versions_no_delete_when_sent();

-- Lines/sections of a sent version are frozen too.
CREATE OR REPLACE FUNCTION engine.quote_children_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_sent timestamptz; v_version uuid;
BEGIN
  v_version := COALESCE(NEW.version_id, OLD.version_id);
  SELECT sent_at INTO v_sent FROM engine.quote_versions WHERE id = v_version;
  IF v_sent IS NOT NULL THEN
    RAISE EXCEPTION '% of locked quote_version % cannot be modified (%)', TG_TABLE_NAME, v_version, TG_OP
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER quote_lines_lock BEFORE INSERT OR UPDATE OR DELETE ON engine.quote_lines
  FOR EACH ROW EXECUTE FUNCTION engine.quote_children_lock();
CREATE TRIGGER quote_sections_lock BEFORE INSERT OR UPDATE OR DELETE ON engine.quote_sections
  FOR EACH ROW EXECUTE FUNCTION engine.quote_children_lock();

-- 21.5 projects: blocked ⇒ reason+owner is a CHECK; stage change must come with an event
--      (enforced in code inside transition(); DB-side we only log a guard event hook).
CREATE OR REPLACE FUNCTION engine.projects_stage_change_requires_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.stage_entered_at := CASE WHEN NEW.stage IS DISTINCT FROM OLD.stage THEN now() ELSE OLD.stage_entered_at END;
    -- Application must insert the matching project_events row in the same transaction.
    -- A deferred constraint trigger could verify it; left as "לאימות" for the implementation.
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_stage_change BEFORE UPDATE ON engine.projects
  FOR EACH ROW EXECUTE FUNCTION engine.projects_stage_change_requires_event();

-- 21.6 rules: validated rules are immutable except is_active/valid_to; changes → new version
CREATE OR REPLACE FUNCTION engine.rules_guard_validated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verification = 'validated' AND (
       NEW.threshold IS DISTINCT FROM OLD.threshold
    OR NEW.consequence IS DISTINCT FROM OLD.consequence
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.applies_to IS DISTINCT FROM OLD.applies_to) THEN
    RAISE EXCEPTION 'rule %/v% is validated; create a new version instead', OLD.key, OLD.version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rules_guard_validated BEFORE UPDATE ON engine.rules
  FOR EACH ROW EXECUTE FUNCTION engine.rules_guard_validated();

-- -----------------------------------------------------------------------------
-- 22. Row-Level Security (safety net; business authorization lives in code)
-- -----------------------------------------------------------------------------

-- Can the current session read a project?
-- SECURITY DEFINER: the helper's own lookups (projects/project_members/contacts) run as the
-- schema owner and bypass RLS — otherwise the projects policy would call this function
-- recursively (stack depth exceeded; found in the smoke test).
CREATE OR REPLACE FUNCTION engine.can_read_project(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = engine, public AS $$
  SELECT CASE engine.app_role()
    WHEN 'owner'    THEN true
    WHEN 'engineer' THEN true
    WHEN 'pm'       THEN true
    WHEN 'agent'    THEN true                      -- read like engineer; writes only via approvals
    WHEN 'surveyor' THEN EXISTS (SELECT 1 FROM engine.projects p WHERE p.id = p_project AND p.stage IN ('S01','S02'))
                         OR EXISTS (SELECT 1 FROM engine.project_members m WHERE m.project_id = p_project AND m.user_id = engine.app_user_id())
    WHEN 'technician' THEN EXISTS (SELECT 1 FROM engine.project_members m WHERE m.project_id = p_project AND m.user_id = engine.app_user_id())
    WHEN 'inspector'  THEN EXISTS (SELECT 1 FROM engine.project_members m WHERE m.project_id = p_project AND m.user_id = engine.app_user_id()
                                     AND now() BETWEEN m.valid_from AND COALESCE(m.valid_to, 'infinity'))
    WHEN 'customer'   THEN EXISTS (SELECT 1 FROM engine.projects p JOIN engine.contacts c ON c.customer_id = p.customer_id
                                     WHERE p.id = p_project AND c.portal_user_id = engine.app_user_id() AND p.customer_visible)
    WHEN 'supplier'   THEN false                   -- suppliers see purchase_orders only (own policy)
    ELSE false END
$$;

ALTER TABLE engine.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.project_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.sites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.quote_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.quote_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.inspections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.test_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.monitoring_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.jobs            ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_read ON engine.projects FOR SELECT USING (engine.can_read_project(id));
CREATE POLICY projects_write ON engine.projects FOR ALL
  USING (engine.app_role() IN ('owner','engineer','pm'))
  WITH CHECK (engine.app_role() IN ('owner','engineer','pm'));

CREATE POLICY project_events_read ON engine.project_events FOR SELECT USING (engine.can_read_project(project_id));
CREATE POLICY project_events_insert ON engine.project_events FOR INSERT
  WITH CHECK (engine.app_role() IN ('owner','engineer','pm','system') OR engine.can_read_project(project_id));

-- Customers/contacts: staff full; customer sees own; n8n_reader (DB role) gets a column-masked view instead.
CREATE POLICY customers_read ON engine.customers FOR SELECT USING (
  engine.app_role() IN ('owner','engineer','pm','agent','surveyor')
  OR EXISTS (SELECT 1 FROM engine.contacts c WHERE c.customer_id = customers.id AND c.portal_user_id = engine.app_user_id())
);
CREATE POLICY contacts_read ON engine.contacts FOR SELECT USING (
  engine.app_role() IN ('owner','engineer','pm','agent','surveyor','technician')
  OR portal_user_id = engine.app_user_id()
);
CREATE POLICY sites_read ON engine.sites FOR SELECT USING (
  engine.app_role() IN ('owner','engineer','pm','agent','surveyor','technician')
  OR EXISTS (SELECT 1 FROM engine.projects p WHERE p.site_id = sites.id AND engine.can_read_project(p.id))
);

-- Documents: customer sees only customer_visible; inspector only inspection kinds in window.
CREATE POLICY documents_read ON engine.documents FOR SELECT USING (
  CASE engine.app_role()
    WHEN 'customer'  THEN customer_visible AND engine.can_read_project(project_id)
    WHEN 'inspector' THEN kind IN ('drawing_set_pdf','as_made_set','inspector_report_pdf','iec62446_tests','datasheet') AND engine.can_read_project(project_id)
    WHEN 'technician' THEN kind IN ('drawing_set_pdf','daily_report_pdf','photo','change_orders') AND engine.can_read_project(project_id)
    WHEN 'supplier'  THEN kind = 'purchase_orders' AND EXISTS (
                            SELECT 1 FROM engine.purchase_orders po JOIN engine.suppliers s ON s.id = po.supplier_id
                            WHERE po.document_id = documents.id AND s.portal_user_id = engine.app_user_id())
    ELSE engine.can_read_project(project_id) OR project_id IS NULL
  END
);

-- Quotes: internal cost columns are hidden from customers via a VIEW (quote_lines_customer_v), not RLS.
CREATE POLICY quote_versions_read ON engine.quote_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM engine.quotes q WHERE q.id = quote_versions.quote_id AND engine.can_read_project(q.project_id))
  AND (engine.app_role() <> 'customer' OR sent_at IS NOT NULL)
);
CREATE POLICY quote_lines_read ON engine.quote_lines FOR SELECT USING (
  EXISTS (SELECT 1 FROM engine.quote_versions v JOIN engine.quotes q ON q.id = v.quote_id
          WHERE v.id = quote_lines.version_id AND engine.can_read_project(q.project_id)
            AND (engine.app_role() <> 'customer' OR v.sent_at IS NOT NULL))
);
CREATE VIEW engine.quote_lines_customer_v AS
  SELECT id, version_id, section_id, line_no, description_he, unit, qty, unit_price, discount_pct, total, currency, optional, sort
  FROM engine.quote_lines WHERE NOT EXISTS (SELECT 1 FROM engine.quote_sections s WHERE s.id = quote_lines.section_id AND NOT s.customer_visible);

CREATE POLICY purchase_orders_read ON engine.purchase_orders FOR SELECT USING (
  engine.app_role() IN ('owner','engineer','pm','agent')
  OR (engine.app_role() = 'supplier' AND EXISTS (SELECT 1 FROM engine.suppliers s WHERE s.id = purchase_orders.supplier_id AND s.portal_user_id = engine.app_user_id()))
);

CREATE POLICY inspections_read ON engine.inspections FOR SELECT USING (engine.can_read_project(project_id));
CREATE POLICY inspections_write ON engine.inspections FOR UPDATE USING (
  engine.app_role() IN ('owner','engineer','pm') OR (engine.app_role() = 'inspector' AND inspector_user_id = engine.app_user_id())
);
CREATE POLICY test_results_read ON engine.test_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM engine.inspections i WHERE i.id = test_results.inspection_id AND engine.can_read_project(i.project_id))
);

-- MonitoringLink: credential_ref is a reference only; still restrict to staff.
CREATE POLICY monitoring_links_read ON engine.monitoring_links FOR SELECT USING (
  engine.app_role() IN ('owner','engineer','pm','technician','agent')
);

-- Rules are readable by everyone internal; writable by owner (reviewer — open decision §17.9).
CREATE POLICY rules_read  ON engine.rules FOR SELECT USING (engine.app_role() <> 'anonymous');
CREATE POLICY rules_write ON engine.rules FOR ALL USING (engine.app_role() = 'owner') WITH CHECK (engine.app_role() = 'owner');

-- Jobs: staff + agent (own jobs); customers never.
CREATE POLICY jobs_read ON engine.jobs FOR SELECT USING (engine.app_role() IN ('owner','engineer','pm','agent'));

-- n8n_reader: a DB role with SELECT on masked views only (no PII), e.g.:
CREATE VIEW engine.projects_n8n_v AS
  SELECT p.id, p.number, p.stage, p.status, p.stage_entered_at, p.sla_due_at, p.regulatory_track, s.city
  FROM engine.projects p JOIN engine.sites s ON s.id = p.site_id;
-- GRANT SELECT ON engine.projects_n8n_v TO n8n_reader;   -- role creation is an ops step

-- -----------------------------------------------------------------------------
-- 23. Views for the morning report ("תקועים")
-- -----------------------------------------------------------------------------

CREATE VIEW engine.stuck_projects_v AS
SELECT p.id, p.number, p.stage, p.status, p.stage_entered_at, p.sla_due_at,
       now() - p.stage_entered_at AS age,
       (p.sla_due_at IS NOT NULL AND p.sla_due_at < now()) AS sla_breached,
       p.blocked_reason, p.blocked_owner_id
FROM engine.projects p
WHERE p.stage <> 'S12'
  AND (p.status IN ('blocked','waiting_customer','waiting_iec','waiting_supplier','waiting_engineer')
       OR (p.sla_due_at IS NOT NULL AND p.sla_due_at < now()));

CREATE VIEW engine.stale_price_lists_v AS
SELECT pl.id, pl.name, s.name AS supplier, pl.valid_from, pl.valid_to,
       CURRENT_DATE - pl.valid_from AS age_days
FROM engine.price_lists pl LEFT JOIN engine.suppliers s ON s.id = pl.supplier_id
WHERE pl.status = 'approved'
  AND (pl.valid_to < CURRENT_DATE OR CURRENT_DATE - pl.valid_from > 180);  -- 180 = parameter, לאימות

-- =============================================================================
-- END OF DRAFT
-- =============================================================================
