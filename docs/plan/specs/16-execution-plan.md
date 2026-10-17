# 16 — תוכנית ביצוע: אבני דרך M0–M7, חבילות עבודה ולו"ז

| | |
|---|---|
| גרסה | 0.1 — טיוטה (2026-10-10) |
| מקור | `docs/plan/00-master-plan.md` §4.2, §16, §17, §18, §19; `01-lifecycle-stages.json`; handoff bee-live (23.09.2026); HANDOFF ספריית בלוקים; `research/05-crm-workflow.md` §8–§9 |
| קהל | ברק, נרי, וסשני Claude Code מקומיים (דרך הסקיל `bee-engine`, מפרט 18) |
| סטטוס | כל ההערכות הן **הערכות גסות** בימי-פיתוח (dev-days) לפני אישור ברק; הן משמשות לסדר עדיפויות ולא להתחייבות |

> **איך לקרוא את המסמך:** לכל אבן דרך יש מטרה, היקף (מודולים/קבצים שנוצרים ב-bee-live), חבילות עבודה ממוספרות (`WP-M<n>-<nn>`), "הגדרת סיום" ו-DoD. סשן Claude Code אחד = חבילת עבודה אחת (ראו מפרט 17 §C). חבילה שלא ניתן לסיים בסשן אחד מפוצלת ל-a/b/c.

---

## 0. תקציר

- **8 אבני דרך, ~235 ימי-פיתוח (הערכה)**, צוות של 2 (נרי ~1 FTE, ברק ~0.3–0.5 FTE כבעלים/מהנדס/מאשר) + Claude Code כמכפיל. לו"ז מוצע: **~40 שבועות** (§13), עם M3 לפני M4 כפי שממליצה תוכנית האב §17(1).
- כל אבן דרך מסתיימת ב"עובד מקצה לקצה" על **bee-lab** (staging), חתימת ברק, ו-deploy ל-prod דרך `ops/prod/deploy.sh` עם feature flag כבוי כברירת מחדל (DoD בכל אבן דרך §4–§11; לולאת deploy במפרט 17 §E).
- **מסלול מקביל מחוץ לאבני הדרך:** סיום אדפטר SolarEdge V2 (דדליין קשיח 01–03.11.2026 לפי ה-handoff) וחיבור Hermes מחדש — לא תלויים במנוע ואסור שהמנוע יעכב אותם (§12–§13).
- **פערי אימות V1–V20** לא חוסמים את M0–M1 כמעט בכלל; הם חוסמים חלקים מוגדרים ב-M2–M6 (§15). כלל: כל מה שנכנס לקוד לפני שהפער נסגר נכנס כ**נתון בטבלה עם `verification: unverified`**, לא כקוד.

### 0.1 מפרטים נלווים

| מס' | קובץ | מה מכסה |
|---|---|---|
| 10 | `10-data-model.md` + `schema/engine.sql` | ישויות ליבה (§5 בתוכנית האב), enums, RLS, triggers, DDL שנבדק על Postgres 16 |
| 11 | `11-projects-workflow-spec.md` | XState v5, `project_events`, משימות/SLA, pg-boss, לו"זים/CPM, יומן Google, תקשורת ושער אמון, פורטל, סוכני AI, הרשאות, דיווח בוקר |
| 12 | `12-cpq-documents-spec.md` | קטלוג, מחירונים, ערכות, מנוע תמחור, שורות רגולטוריות, ROI, services/docgen (XLSX/PDF/DOCX), חתימה, הנה"ח |
| 13 | `13-submissions-regulation-spec.md` | פרופילי אסדרה, Submission steps, חבילות מסמכים, SLA בימי עבודה, מנוע כללים, מחלק היסטורי |
| 14 | `14-cad-design-service-spec.md` | services/cad (eplan, pvlib, layout), גיאומטריה, Windows CAD worker, DWG, רינדור, שערי איכות |
| 15 | `15-inspection-handover-monitoring-spec.md` | ביצוע, בדיקת בודק 62446-1, חיבור מונה, מסירה, MonitoringLink, אדפטרים, KPI, תחזוקה, מיגרציה מ-bee-live |

**הערת מספור:** המפרט נכתב במקביל למפרטים 10–15 עם שמות משוערים; ההפניות "מפרט NN" בגוף המסמך יושרו לקבצים בטבלה. הפניות לנושאי בדיקה/מסירה/ניטור (שלא היו ברשימה המשוערת) שייכות למפרט 15.

## 1. עקרונות הביצוע (חלים על כל חבילה)

1. **ספק → נתונים לפני קוד.** מכונת מצבים, כללים, תבניות לו"ז, פרופילי אסדרה ותבניות Submission הם **טבלאות** עם seed מקבצי ה-JSON/MD בחבילת התכנון. קוד קורא אותם; לא מקודד אותם.
2. **כל מספר עם מקור.** אגרה, תעריף, סף, SLA — נכנסים עם `source`, `section`, `valid_from`, `verification` (`unverified|summary|office|validated`) ו-`verified_by`. כל `unverified` מופיע במסמך ללקוח עם סימון "לאימות" עד שברק מאשר (תוכנית האב §9.2).
3. **שער אמון.** כל outbound ללקוח/ספק = job עם `requiresHumanPick: true` (`platform/schema/job.schema.json`). אין "שליחה אוטומטית" באף חבילה, כולל בדיקות.
4. **מתווספים לקו החי.** אין refactor של bee-live הקיים (ניטור, אדפטרים, ops). כל מודול חדש תחת `server/src/modules/<x>` עם feature flag, ומתחבר לטבלאות הקיימות דרך `MonitoringLink` בלבד (M6).
5. **טסטים לפני push.** כל חבילה מגדירה טסטים מראש; PR בלי טסטים ירוקים לא נפתח (מפרט 17 §C).
6. **staging לפני prod.** `bee-lab` עם DB מרוענן (`refresh-staging-db.sh`) — ללא credentials של אינטגרציות.

---

## 2. מבנה הקוד שנוצר (מפת יעד)

לפי תוכנית האב §4.2. העמודה "אבן דרך" = מתי התיקייה נוצרת לראשונה.

| נתיב | תוכן | אבן דרך |
|---|---|---|
| `server/src/modules/projects` | Customer/Site/Project/Contact, `project_events`, XState, tasks, milestones | M0 |
| `server/src/modules/jobs` | לדג'ר jobs (hive), pg-boss bootstrap, `approvals` (שער אמון), SLA jobs | M0 |
| `server/src/modules/documents` | Document, אחסון R2/MinIO, sha256, presigned, נעילה | M0 |
| `server/src/modules/rules` | טבלת `rules`, seed, reviewer API, "rules snapshot" למסמכים | M0 |
| `server/src/modules/calendar` | `business_calendar` (hebcal), פונקציות ימי עבודה | M0 |
| `server/src/modules/auth-roles` | תפקידים/הרשאות מעל ה-auth הקיים; RLS; (Better Auth לפורטל — M7) | M0 |
| `server/src/modules/surveys` | Survey + Photo, קליטה מה-PWA, קישור ל-Project | M0 |
| `server/src/modules/import-monday` | ייבוא חד-פעמי | M0 |
| `server/src/modules/catalog` | Supplier/Product/PriceList/PriceListEntry/Assembly | M1 |
| `server/src/modules/pricing` | PricingRule/DiscountSchedule/ApprovalThreshold, מנוע תמחור, שורות אוטומטיות מ-rules | M1 |
| `server/src/modules/quotes` | Quote/QuoteVersion/Section/Line, נעילה, diff גרסאות, ROI | M2 |
| `server/src/modules/contracts` | Contract/Signature (OTP, sha256, audit) | M2 |
| `server/src/modules/billing` | Invoice/Payment, Morning, קישורי תשלום | M2 |
| `server/src/modules/comms` | CommunicationLog, תבניות, Meta WA Cloud API, SMS, מייל, `dispatch.draft` | M2 |
| `server/src/modules/submissions` | Submission/Step/Form/Fee/Receipt/Correspondence, פרופילי אסדרה, תבניות | M3 |
| `server/src/modules/design` | Design (spec YAML rev), CalcReport, DrawingSet, BOM; קריאה ל-services/cad | M4 |
| `server/src/modules/cad-jobs` | תור משיכה (pull queue) ל-worker Windows, העלאת תוצרים | M4 |
| `server/src/modules/scheduling` | תבניות לו"ז, CPM, Gantt API, Google Calendar sync | M5 |
| `server/src/modules/procurement` | PurchaseOrder/POLine/Delivery | M5 |
| `server/src/modules/field` | WorkOrder/Crew/DailyReport/Checklist/ChangeOrder + פורט מחולל הדוחות | M5 |
| `server/src/modules/inspections` | Inspection/TestResult/Defect | M6 |
| `server/src/modules/handover` | GridConnection, HandoverPack, Warranty, MonitoringLink | M6 |
| `server/src/modules/om` | MaintenanceContract, ServiceTicket, PeriodicInspection, KPI | M7 |
| `server/src/modules/ai` | Agent SDK + MCP in-process, כלים עם `requiresUserInteraction` | M7 |
| `packages/shared-schemas` | Zod לכל ישות (מועבר מ-bee-build; נבנה ל-`dist`) | M0 |
| `apps/web` | React RTL: pipeline, כרטיס פרויקט, קטלוג, הצעות, תיקי חח"י, Gantt… | M0+ |
| `apps/field` | PWA שטח: סקר (מ-`apps/bee-solar-survey`), דוחות, צ'קליסטים, אופליין | M0 (סקר), M5 (דוחות) |
| `apps/portal` | פורטל לקוח (magic link/OTP) | M2 (מינימלי, אופציונלי) / M7 |
| `services/docgen` | Node + Chromium + ExcelJS + docxtemplater + LibreOffice + pypdf (container) | M2 |
| `services/cad` | Python ≥3.11: eplan + pvlib + shapely + ezdxf + PyMuPDF (container) | M2 (pvlib/ROI בלבד) / M4 (מלא) |
| `workers/cad-windows` | סקריפטי GstarCAD (Python/.NET), poller, התקנה כשירות | M4 |
| `ops/` | הרחבות compose (docgen, cad, minio), GlitchTip/Kuma, WAL-G | M0, M2, M4 |

---

## 3. פורמט חבילת עבודה

```
WP-M0-03 — <שם>
תיאור:      מה בונים, במשפט–שניים.
קלט:        מפרט/סעיף (מספר מפרט + סעיף תוכנית אב).
פלט:        קבצים/טבלאות/endpoints/מסכים.
קבלה:       תנאים ניתנים לבדיקה (checkbox).
טסטים:      מה כותבים (unit / integration / E2E / snapshot).
הערכה:      N ימי-פיתוח (הערכה).
בעלים:      Barak / Neri / Claude Code (מי מוביל; Claude Code = סשן מקומי בהנחיית אחד מהם).
תלויות:     WP אחרות / החלטות §17 / פערי V.
סיכונים:    מה עלול לשבור, ומה עושים.
```

---

## 4. M0 — יסודות

**מטרה:** רשומת פרויקט אחת עם מכונת מצבים, מסמכים עם hash, לדג'ר jobs, תפקידים, כללים כנתונים, לוח שנה עסקי, ייבוא Monday, PWA סקר מקושר — ו"עובד מקצה לקצה": **ליד → סקר מקושר → pipeline**.

**היקף (נוצר):** `packages/shared-schemas`, `server/src/modules/{projects,jobs,documents,rules,calendar,auth-roles,surveys,import-monday}`, `apps/web` (pipeline + כרטיס פרויקט), `apps/field` (סקר), `ops/` (GlitchTip, Uptime Kuma, WAL-G, MinIO ל-dev).

### WP-M0-01 — שלד מונורפו, feature flags, shared-schemas
- **תיאור:** להקים את מבנה היעד (§2) בתוך bee-live בלי לשבור את הקיים: `packages/shared-schemas` (העברה מ-bee-build, נבנה ל-`dist` — לקח מה-handoff), תבנית מודול (`routes.ts`, `service.ts`, `schema.ts`, `index.ts`), רישום מודולים ב-Fastify, מנגנון feature flags (`BEE_FEATURES=projects,documents` או טבלת `feature_flags`; ברירת מחדל כבוי ב-prod).
- **קלט:** תוכנית האב §4.2; handoff §5 (`@bee/shared-schemas`, bundle budget).
- **פלט:** תיקיות, `npm run build:schemas`, `server/src/modules/index.ts`, בדיקת bundle budget ל-`apps/web`.
- **קבלה:** [ ] `npm test` הקיים ירוק (155/155 לפי ה-handoff) · [ ] מודול דוגמה עולה מאחורי flag ולא נטען בלי flag · [ ] `apps/web` מייבא תת-נתיבים ולא barrel.
- **טסטים:** unit ל-feature flags; smoke שה-server עולה עם/בלי flags.
- **הערכה:** 2 ימים (הערכה). **בעלים:** Neri (+Claude Code). **תלויות:** —. **סיכונים:** שבירת ה-build הקיים; `type: module` ב-root (handoff) — לבדוק לפני העברת החבילה.

### WP-M0-02 — טבלאות ליבה ו-migrations
- **תיאור:** `customers`, `sites`, `contacts`, `projects` (`stage`, `status`, `regulatory_track`, `distributor`, `state_entered_at`, `sla_due_at`), `project_events` (append-only, trigger שמונע UPDATE/DELETE), `tasks`, `task_dependencies`, `milestones`. כלי migrations לפי מה שקיים ב-bee-live (אם אין — Drizzle/Kysely לפי מחקר 05 §9).
- **קלט:** מפרט 10 (מודל נתונים); תוכנית האב §5; מחקר 05 §2.3.
- **פלט:** migrations, Zod ב-shared-schemas, repository functions.
- **קבלה:** [ ] migration up/down נקי על DB ריק ועל עותק staging · [ ] `project_events` דוחה UPDATE/DELETE (טסט) · [ ] `numeric(14,2)` לסכומים.
- **טסטים:** integration מול Postgres (docker) — יצירה/קריאה; trigger immutability.
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M0-01. **סיכונים:** התנגשות שמות עם טבלאות bee-live הקיימות (customers/sites קיימים לניטור!) — ראו "אי-התאמות": להחליט אם מרחיבים את הקיימות או מקימים `engine_*` עם קישור.

### WP-M0-03 — מכונת מצבים S01–S12 כנתונים + `transition()`
- **תיאור:** טעינת `01-lifecycle-stages.json` לטבלת `project_stage_defs` (seed), XState v5 שנבנה מהנתונים, פונקציה אחת `transition(projectId, event, actor, reason)` בטרנזקציה: guards מתנאי ה-exit, עדכון `projects.stage/status`, `project_events`, תזמון job SLA. חזרה לאחור = `rollback` event. `blocked` חייב `reason`+`owner`.
- **קלט:** מפרט 11; `01-lifecycle-stages.json`; תוכנית האב §3.
- **פלט:** `modules/projects/state-machine.ts`, endpoints `POST /projects/:id/transition`, `GET /projects/:id/missing-exit`.
- **קבלה:** [ ] מעבר קדימה נדחה עם רשימת תנאים חסרים · [ ] S05‖S06 מקבילים · [ ] S09→S08 נרשם כ-rollback · [ ] שינוי JSON (למשל SLA) משתקף בלי שינוי קוד.
- **טסטים:** unit לכל מעבר (12 שלבים × קדימה/אחורה/חסום); property test: אין מעבר שלא דרך `transition()`.
- **הערכה:** 4 ימים. **בעלים:** Claude Code (בהנחיית Neri). **תלויות:** WP-M0-02. **סיכונים:** XState v5 persistence API לא אומת (מחקר 05 §10.4) — `project_events` הוא האמת, snapshot = cache בלבד.

### WP-M0-04 — לדג'ר jobs (hive) + pg-boss + שער אמון
- **תיאור:** טבלת `jobs` לפי `platform/schema/job.schema.json` (kind/loop/status/trustTier/costTier/outbound), pg-boss על אותו Postgres (schema `pgboss`), טבלת `approvals` (`requested_by`, `kind`, `payload`, `status`, `decided_by`); job עם `outbound.requiresHumanPick` עובר ל-`blocked_trust` עד החלטה. job `stage.sla_check` idempotent.
- **קלט:** מפרט 11; תוכנית האב §2(4), §3 ("הכוורת"); `platform/schema/loops.json`.
- **פלט:** `modules/jobs`, worker bootstrap מאחורי `BEE_BACKGROUND_WORKERS` (קיים), מסך "אישורים ממתינים".
- **קבלה:** [ ] job outbound ללקוח לעולם לא מגיע ל-`succeeded` בלי `approvals.decided_by` · [ ] SLA job יוצר משימה רק אם השלב לא השתנה · [ ] DLQ/retries מוגדרים.
- **טסטים:** integration עם pg-boss אמיתי; טסט "אין דרך לעקוף את השער".
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M0-02. **סיכונים:** workers כבויים ב-prod (`BEE_BACKGROUND_WORKERS=off`) — להפריד worker של המנוע לדגל משלו.

### WP-M0-05 — מודול מסמכים (R2 + hash + נעילה)
- **תיאור:** `documents` (project, kind, rev, file key, sha256, `generated_from` jsonb, `signed_by`, `sent_at`, `supersedes`), העלאה/הורדה presigned, S3-compatible client (R2 ב-prod, MinIO ב-dev/staging), trigger "לעולם לא נמחק" ונעילה אחרי `sent_at`/`signed_by`.
- **קלט:** מפרט 12; תוכנית האב §5 (Document), §2(5).
- **פלט:** `modules/documents`, compose service `minio` ל-dev.
- **קבלה:** [ ] העלאה מחשבת sha256 ומאמתת · [ ] DELETE נדחה · [ ] UPDATE על מסמך שנשלח נדחה · [ ] presigned URL פג תוך זמן מוגדר.
- **טסטים:** integration מול MinIO; טסט trigger.
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M0-02. **סיכונים:** עלות/מגבלות R2 (V16) — לא חוסם, MinIO זהה API.

### WP-M0-06 — תפקידים והרשאות מעל ה-auth הקיים + RLS
- **תיאור:** תפקידים (owner, engineer, pm, technician, surveyor, customer, inspector, supplier, agent) כ-claims מעל ה-JWT הקיים של bee-live; middleware `set_config('app.user_id'/'app.role')`; RLS על טבלאות המנוע; `n8n_reader` ללא PII. **Better Auth** (magic link/OTP/passkey) נדחה לפורטל (M2-מינימלי/M7) כדי לא לגעת ב-login הקיים.
- **קלט:** מחקר 05 §6; תוכנית האב §15.
- **פלט:** `modules/auth-roles`, policies SQL.
- **קבלה:** [ ] משתמש `technician` לא רואה סכומים · [ ] `n8n_reader` לא רואה טלפון/כתובת · [ ] הלוגין הקיים לא השתנה.
- **טסטים:** integration RLS לכל תפקיד (מטריצה).
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M0-02. **סיכונים:** RLS + connection pool — חובה `set_config` per-transaction.

### WP-M0-07 — טבלת `rules` + seed + reviewer
- **תיאור:** `rules` (key, scope, threshold, consequence, source, section, valid_from, verification, verified_by, test_case jsonb). Seed: R1–R24 (מחקר 02), 22 כללי המשרד (סקיל `electrical-drawing-sets`), כללי eplan (`eplan.db`) — הכל `unverified`/`office`. API ל-reviewer (ברק בלבד לפי §17(9), לאישור). "rules snapshot" לצירוף למסמכים.
- **קלט:** `docs/plan/rules/` (אם מולא על ידי סוכן מקביל), תוכנית האב §6.2, §9.2; מחקר 02.
- **פלט:** `modules/rules`, seed script, מסך reviewer מינימלי.
- **קבלה:** [ ] לכל Rule יש `test_case` שרץ · [ ] שינוי `verification` נרשם ב-audit · [ ] snapshot ניתן לשחזור לפי hash.
- **טסטים:** data test: כל rule בסיד עובר את ה-test_case שלו; unit ל-evaluator.
- **הערכה:** 3 ימים. **בעלים:** Claude Code (+Barak מאשר תוכן). **תלויות:** WP-M0-02. **סיכונים:** אין — זה בדיוק המנגנון שמאפשר לעבוד לפני V1–V20.

### WP-M0-08 — `business_calendar` וימי עבודה
- **תיאור:** טבלת חגים/ערבי חג/שבתות מ-`@hebcal/core` (`il: true`), פונקציות `addBusinessDays`, `businessDaysBetween`, seed ל-3 שנים קדימה + job שנתי.
- **קלט:** מחקר 05 §3.4; תוכנית האב §4.1.
- **פלט:** `modules/calendar`.
- **קבלה:** [ ] 7 י"ע מתאריך לפני ראש השנה מחושבים נכון · [ ] יום שישי = לא יום עבודה (לאישור ברק: חצי יום?).
- **טסטים:** unit עם תאריכים ידועים.
- **הערכה:** 1 יום. **בעלים:** Claude Code. **תלויות:** —. **סיכונים:** —.

### WP-M0-09 — ייבוא Monday (חד-פעמי)
- **תיאור:** ייצוא לוחות Monday (Excel/API) → מיפוי עמודות (קובץ YAML) → Customer/Site/Project/stage + `project_events` "imported". מצב dry-run עם דוח.
- **קלט:** תוכנית האב §13; החלטה §17(6).
- **פלט:** `modules/import-monday`, סקריפט CLI, דוח התאמות.
- **קבלה:** [ ] dry-run מציג 100% שורות ממופות/לא ממופות · [ ] הרצה חוזרת idempotent (לפי מזהה Monday).
- **טסטים:** unit על קובץ דוגמה מוסווה (ללא PII אמיתי בריפו).
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** WP-M0-03; החלטה §17(6). **סיכונים:** איכות נתוני Monday; לא להריץ על prod לפני staging.

### WP-M0-10 — חיבור PWA הסקר ל-Project
- **תיאור:** העברת `apps/bee-solar-survey` ל-`apps/field` (או שמירה כאפליקציה נפרדת עם build משותף — החלטת Neri), החלפת `customer.id=[OPEN]` ב-`projectId` מה-URL/QR, endpoint `POST /projects/:id/survey` (payload לפי `SiteSurveyProject`/`DesignSuiteSitePayload`/`electricalIntake`), תמונות ל-documents, `survey_pdf` כ-Document, `completeness.ready` כתנאי יציאה מ-S02.
- **קלט:** תוכנית האב §1 (bee-solar-survey), §3 S02; `docs/BEE_SOLAR_SURVEY_HIVE.md`.
- **פלט:** `modules/surveys`, `apps/field` (סקר), QR/קישור מכרטיס הפרויקט.
- **קבלה:** [ ] סקר שנוצר אופליין מסתנכרן ומתקשר לפרויקט הנכון · [ ] תמונות עם EXIF מנוקה בשיתוף · [ ] S02 יוצא ל-S03 רק כשה-completeness ready או override של ברק.
- **טסטים:** E2E (Playwright) אופליין→אונליין; unit ל-completeness.
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M0-03, WP-M0-05. **סיכונים:** הסכמה של ה-PWA שונה מ-Survey במפרט 10 — ליישר במפרט, לא ב-adapter.

### WP-M0-11 — UI: pipeline, כרטיס פרויקט, משימות, "היום שלי", "תקועים"
- **תיאור:** Kanban לפי שלב, כרטיס פרויקט עם ציר זמן אחד (`project_events` + מסמכים + משימות), יצירת ליד (intake ידני), "היום שלי", "תקועים" (view SQL לפי `sla_due_at`). RTL, Rubik.
- **קלט:** תוכנית האב §13; WP-M0-02…05.
- **פלט:** `apps/web/src/pages/{pipeline,project,tasks,today,stuck}`.
- **קבלה:** [ ] יצירת ליד → S01 → S02 מהמסך · [ ] כל פעולה מופיעה בציר הזמן · [ ] bundle budget לא נשבר.
- **טסטים:** Playwright E2E "ליד → סקר → pipeline"; snapshot למסכים.
- **הערכה:** 5 ימים. **בעלים:** Neri (+Claude Code). **תלויות:** WP-M0-03, 04, 05, 10. **סיכונים:** scope creep — רק 5 מסכים ב-M0.

### WP-M0-12 — ops: GlitchTip, Uptime Kuma, WAL-G, compose dev/staging
- **תיאור:** GlitchTip (SDK תואם Sentry) + Uptime Kuma 2 על ה-VPS (או staging תחילה), WAL-G sidecar → B2, `pg_dump` יומי מוצפן, `docker-compose.dev.yml` (postgres, minio), עדכון `ops/staging/docker-compose.yml`, בדיקת שחזור ראשונה ב-staging.
- **קלט:** מחקר 05 §8; תוכנית האב §15; handoff §3 (ops scripts).
- **פלט:** `ops/prod/compose-observability.yml`, `ops/backup/`, תיעוד ב-`docs/ops-runbook.md` (קיים).
- **קבלה:** [ ] שגיאה מכוונת ב-staging מופיעה ב-GlitchTip · [ ] Kuma מתריע על נפילת tunnel · [ ] שחזור PITR ל-staging הצליח ותועד.
- **טסטים:** תרגול שחזור (ידני, מתועד).
- **הערכה:** 2 ימים. **בעלים:** Barak (+Claude Code). **תלויות:** —. **סיכונים:** RAM ב-VPS; GlitchTip = 4 קונטיינרים.

### WP-M0-13 — E2E ו-DoD של M0
- **תיאור:** תרחיש "ליד → סקר מקושר → pipeline" מקצה לקצה על bee-lab; ייבוא Monday על staging; סקירה של ברק.
- **הערכה:** 1 יום. **בעלים:** Barak + Neri.

**סה"כ M0: ~35 ימי-פיתוח (הערכה).**

### הגדרת סיום M0 (DoD)
- [ ] כל WP-M0 ממוזג ל-`main` עם טסטים ירוקים ב-CI.
- [ ] `deploy-staging.sh` ל-bee-lab; DB מרוענן; flags `projects,documents,jobs,rules,calendar,surveys` דולקים ב-staging.
- [ ] ברק יצר ליד אמיתי (מוסווה), קישר סקר מהטלפון, ראה אותו ב-pipeline — וחתם.
- [ ] `deploy.sh` ל-prod עם flags **כבויים** (קוד בפנים, UI מוסתר); `canary.sh` ירוק 24 שעות.
- [ ] ייבוא Monday רץ dry-run על staging ודווח (הרצה אמיתית לפי §17(6)).

---

## 5. M1 — קטלוג ותמחור

**מטרה:** Product/Supplier/PriceList עם ייבוא ו-diff, ערכות פרמטריות, PricingRule, שורות אוטומטיות מ-rules; "עובד מקצה לקצה": **הצעה מחושבת מערכה** (מספרים בלבד, עדיין בלי מסמך).

**היקף:** `modules/{catalog,pricing}`, `apps/web` (קטלוג, מחירונים, ערכות), ייבוא PDF ב-`services/cad` (python: pdfplumber/camelot) או סקריפט נפרד.

**תלות קלט מברק (§19):** מחירונים (2), ערכות (3), 2–3 הצעות קיימות (1) — **חוסמים את הכיול, לא את הקוד.**

### WP-M1-01 — סכמת קטלוג
- **תיאור:** Supplier, Product (kind: module/inverter/optimizer/battery/breaker/cable/tray/cabinet/labour/service/fee; `tech` jsonb עם Voc/Isc/Vmp/Imp/מקדמי טמפ'/MPPT; `datasheet_src{file,page}`; `available_il`), PriceList (supplier, valid_from, currency, source file key, sha256), PriceListEntry, קישור ל-CEC/PAN/OND.
- **קלט:** מפרט 12; תוכנית האב §6.1. **פלט:** migrations, Zod, CRUD.
- **קבלה:** [ ] מוצר בלי `datasheet_src` מסומן "ללא מקור" · [ ] מחיר תמיד שייך ל-PriceList עם תאריך.
- **טסטים:** integration CRUD; ולידציה Zod. **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** M0. **סיכונים:** —.

### WP-M1-02 — צינור ייבוא מחירונים + diff + אישור
- **תיאור:** Excel/CSV ישיר; PDF דיגיטלי דרך pdfplumber/camelot (python); סרוק/מבולגן דרך Claude (document blocks + structured output, Zod) — תמיד טיוטה; diff מול הגרסה הקודמת (חדש/השתנה/נעלם); אישור אנושי; staleness alert (job חודשי).
- **קלט:** מפרט 12; מחקר 04 (מחירונים); תוכנית האב §4.1. **פלט:** `modules/catalog/import/*`, מסך diff.
- **קבלה:** [ ] מחירון אקסל של ספק אמיתי (מברק) נקלט ב-100% שורות או מדווח על כשלים · [ ] אין מחירון פעיל בלי `approved_by`.
- **טסטים:** fixtures (3 פורמטים); snapshot ל-diff. **הערכה:** 4 ימים. **בעלים:** Claude Code (+Barak מספק קבצים). **תלויות:** WP-M1-01; §19(2); §17(7). **סיכונים:** PDF סרוקים — OCR איכות; fallback ידני.

### WP-M1-03 — ערכות (Assemblies) פרמטריות
- **תיאור:** Assembly עם שורות `qty = f(kWp, modules, m, roofType, inverters)` (ביטויים מוגבלים, מוערכים ב-TS, לא `eval`), גרסאות, "הידע של ברק" מוקלט → טיוטת ערכות ל-אישור.
- **קלט:** מפרט 12; תוכנית האב §6.1. **פלט:** `modules/catalog/assemblies`, evaluator, מסך עריכה.
- **קבלה:** [ ] 3 ערכות של ברק (רעפים/בטון/לוח איסוף) מחזירות כמויות שברק מאשר ב-±5% · [ ] ביטוי לא חוקי נדחה.
- **טסטים:** unit ל-evaluator (גולדן); fuzz לביטויים. **הערכה:** 4 ימים. **בעלים:** Claude Code + Barak. **תלויות:** WP-M1-01; §19(3). **סיכונים:** ללא הערכות מברק — נבנה דוגמאות ומסמנים "placeholder".

### WP-M1-04 — מנוע תמחור
- **תיאור:** PricingRule (עלות×מקדם לפי קטגוריה/לקוח/גודל, מינימום רווח, עיגול), DiscountSchedule, ApprovalThreshold, מע"מ 18% (כנתון בטבלה עם תאריך), הצמדה/מט"ח (שומרים מטבע + שער יום), decimal.js, `numeric(14,2)`.
- **קלט:** מפרט 12; תוכנית האב §6.2. **פלט:** `modules/pricing/engine.ts`, `price(quoteInput) → lines + totals + explanations`.
- **קבלה:** [ ] אותו קלט → אותו פלט (דטרמיניסטי) · [ ] כל שורה מסבירה מאיפה המחיר (price list id + rule id) · [ ] הנחה מעל סף → `approval` דרך שער האמון.
- **טסטים:** גולדן מול הצעה קיימת של ברק (§19(1)); property: סכום שורות = סה"כ. **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** WP-M1-01, 03, M0-04. **סיכונים:** —.

### WP-M1-05 — שורות אוטומטיות מכללים (R7–R23)
- **תיאור:** evaluator שמריץ rules על Project+Design-lite ומוסיף שורות (הגדלת חיבור, ארון מונה ייצור, CT, EMS, RCD B, הארקה…) עם `rule_id` ו-`verification`; `unverified` → שורה מסומנת "לאימות".
- **קלט:** מפרט 12; תוכנית האב §6.2; WP-M0-07. **פלט:** `modules/pricing/rule-lines.ts`.
- **קבלה:** [ ] 50 kWp על חיבור 3×63A מפיק שורת "הגדלת חיבור" (R7) · [ ] >15 kW מפיק ארון מונה ייצור (R8) · [ ] שורה מכלל `unverified` נושאת סימון.
- **טסטים:** data-driven לפי `test_case` של כל rule. **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M0-07, M1-04. **סיכונים:** V3/V7/V9 פתוחים — הכללים נכנסים `unverified`.

### WP-M1-06 — UI קטלוג/מחירונים/ערכות
- **הערכה:** 3 ימים. **בעלים:** Neri. **קבלה:** [ ] ניהול מלא מהמסך, כולל אישור diff.

### WP-M1-07 — כיול וגולדן
- **תיאור:** 2–3 הצעות קיימות → קלט למנוע → השוואת שורות/סכומים; תיעוד פערים כ-PricingRule חדשים.
- **הערכה:** 2 ימים. **בעלים:** Barak + Claude Code. **תלויות:** §19(1).

**סה"כ M1: ~22 ימי-פיתוח (הערכה).**

### DoD M1
- [ ] מחירון אמיתי אחד לפחות מאושר ב-staging; 3 ערכות מאושרות; הצעה מחושבת ל-3 פרויקטים אמיתיים (מוסווים) תואמת ±5% להצעות של ברק (או הפערים מוסברים).
- [ ] staging, חתימת ברק, deploy עם flag `catalog,pricing` כבוי ב-prod.

---

## 6. M2 — הצעה וכתב כמויות (S03–S04)

**מטרה:** QuoteVersion בלתי-ניתן לשינוי, XLSX ו-PDF ממותגים, ROI, רוויזיות, שער אמון ליוצא (WhatsApp Cloud API/מייל), חוזה + חתימה OTP, Morning + קישור תשלום. "עובד מקצה לקצה": **מסקר מוכן להצעה שנשלחה (באישור אדם) ולחוזה חתום עם מקדמה.**

**היקף:** `modules/{quotes,contracts,billing,comms}`, `services/docgen` (חדש), `services/cad` (pvlib/PVGIS בלבד), `apps/web` (הצעות), `apps/portal` (אופציונלי מינימלי לפי §17(8)).

### WP-M2-01 — Quote / QuoteVersion immutable + diff
- **תיאור:** Quote → QuoteVersion (snapshot מלא: שורות, `price_snapshot`, מחירון מקור, rules snapshot, מע"מ, תוקף, הצמדה), נעילה ב-DB trigger אחרי `sent_at`, השוואת שורות בין גרסאות, פקודת שינוי = גרסה + מסמך דלתא.
- **קלט:** מפרט 12; תוכנית האב §5, §6.2. **פלט:** `modules/quotes`.
- **קבלה:** [ ] UPDATE על גרסה שנשלחה נדחה · [ ] diff מציג הוסף/שונה/הוסר עם סכום הפרש · [ ] גרסה חדשה מעתיקה snapshot ולא מצביעה על מחירון חי.
- **טסטים:** integration trigger; unit diff. **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** M1.

### WP-M2-02 — `services/docgen` (container)
- **תיאור:** שירות Node נפרד: Puppeteer/Chromium (או Playwright), גופני Rubik + Noto Sans Hebrew מותקנים, ExcelJS, docxtemplater, LibreOffice headless, pypdf (python slim) למיזוג; API פנימי `POST /render/{pdf,xlsx,docx}`; browser pool עם סגירה נקייה (לקח מה-handoff: `closeBrowserPool()`); compose ב-dev/staging/prod.
- **קלט:** מפרט 12; מחקר 04; תוכנית האב §4.1. **פלט:** `services/docgen/`, `Dockerfile`, compose.
- **קבלה:** [ ] PDF עברי עם `<bdi>` ומספרים מתרנדר נכון (snapshot) · [ ] השירות לא דולף תהליכי Chromium אחרי 100 רינדורים · [ ] לא נגיש מבחוץ (רשת docker בלבד).
- **טסטים:** snapshot (pixelmatch) ל-3 תבניות; load test קצר. **הערכה:** 3 ימים. **בעלים:** Neri (+Claude Code). **תלויות:** —. **סיכונים:** RAM ב-VPS; Chromium בקונטיינר.

### WP-M2-03 — כתב כמויות XLSX (ExcelJS)
- **תיאור:** גיליון סיכום + גיליון לפרק במבנה המפרט הכללי פרק 08 (`08.01.0010` כטקסט) + פרקי PV; נוסחאות חיות + cached values מהמנוע; `rightToLeft`; definedNames; הגנה; שתי תצוגות (לקוח/פנימי); CSV.
- **קלט:** מפרט 12; מחקר 04 §4.6 (דוגמת 50 kWp). **פלט:** `services/docgen/templates/boq`, `Document kind=boq_xlsx`.
- **קבלה:** [ ] פתיחה ב-Excel ללא "תיקון" · [ ] סה"כ בנוסחה = סה"כ המנוע · [ ] תצוגת לקוח ללא עמודות עלות/רווח (נבדק אוטומטית).
- **טסטים:** קריאה חוזרת עם ExcelJS ובדיקת ערכים; snapshot מבני. **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** WP-M2-01, 02; §19(1) לכיול.

### WP-M2-04 — הצעת מחיר PDF (Chromium)
- **תיאור:** תבנית ממותגת RTL לפי תוכנית האב §6.3 (שער עם תמונת גג, 3 מספרים, מערכת, תפוקה, כלכלה, מפרט, היקף, מחיר, תשלומים, אחריות, החרגות, תוקף, חתימה). כל נתון `unverified` מסומן.
- **קלט:** מפרט 12; §6.3. **פלט:** תבנית + `Document kind=quote_pdf`.
- **קבלה:** [ ] ברק מאשר שהתבנית "נראית כמו שלנו" מול 2–3 הצעות קיימות · [ ] header/footer עם מספר גרסה ו-sha256 מקוצר.
- **טסטים:** snapshot; בדיקת bidi עם Claude-vision (מחקר 07) כצעד ידני. **הערכה:** 4 ימים. **בעלים:** Claude Code + Barak. **תלויות:** WP-M2-02, 05.

### WP-M2-05 — ROI: תפוקה + כלכלה
- **תיאור:** `services/cad` (python slim: pvlib + PVGIS client עם cache) → תפוקה שנתית/חודשית, kWh/kWp, PR; TS: NPV/IRR 25 שנה, degradation, החלפת ממיר, פרופיל אסדרה (R1–R6 מטבלת rules, כולם `unverified` עד V4), תזרים.
- **קלט:** מפרט 12; מחקר 03; תוכנית האב §6.2. **פלט:** `services/cad/roi/`, `modules/quotes/roi.ts`.
- **קבלה:** [ ] תפוקה לאתר ידוע של bee-live (עם היסטוריית ניטור) בטווח ±10% מהמדוד (בדיקת סבירות) · [ ] כל תעריף בפלט נושא `source`+`verification`.
- **טסטים:** unit NPV/IRR מול מחשבון ידוע; integration PVGIS עם cache fixture. **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** —. **סיכונים:** V4 (תעריפים 2026) פתוח — ההצעה מציגה "לאימות".

### WP-M2-06 — Design-lite (מצב מהיר)
- **תיאור:** kWp יעד + מודול/ממיר מהקטלוג → מספר מודולים, string sizing (Voc_cold/Vmp_hot/ΣIsc — לוגיקת eplan, מצב מהיר) בלי פריסת גג גרפית (זו M4). שומר `Design` ראשוני (rev 0) שמזין ערכות ו-ROI.
- **קלט:** מפרט 14 (מצב מהיר); תוכנית האב §8.2. **פלט:** `modules/design` (שלד), קריאה ל-`services/cad/quick`.
- **קבלה:** [ ] מחרוזת מחוץ לחלון MPPT נחסמת עם הסבר · [ ] פלט מזין ערכה ו-ROI.
- **טסטים:** unit מול מקרי eplan קיימים. **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** M1. **הערה:** ראו אי-התאמה (פריסת גג ב-S03 מול M4).

### WP-M2-07 — comms + שער אמון ליוצא
- **תיאור:** `CommunicationLog`, תבניות לפי שלב, Meta WhatsApp Cloud API (תבניות Utility מאושרות; webhook דרך n8n → API), מייל טרנזקציוני (Resend/Postmark) ו-Gmail לשיחות, SMS (InforU/019) ל-OTP; כל יוצא = job `dispatch.draft` עם `requiresHumanPick` ומסך "בחר ושלח". Hermes נשאר נכנס/פנימי.
- **קלט:** מפרט 11 (שער), מחקר 05 §4; החלטה §17(2); V16. **פלט:** `modules/comms`, 5 תבניות ראשונות.
- **קבלה:** [ ] אין נתיב קוד ששולח ללקוח בלי `approvals.decided_by` (טסט) · [ ] הודעה נכנסת מתועדת בציר הזמן · [ ] כשלון ספק → retry + DLQ.
- **טסטים:** integration עם mock ספקים; טסט "השער". **הערכה:** 4 ימים. **בעלים:** Neri. **תלויות:** WP-M0-04; §17(2); אישור תבניות Meta (ימים–שבועות!). **סיכונים:** אישור תבניות Meta איטי — להגיש מוקדם (שבוע 9).

### WP-M2-08 — חוזה + חתימה click-to-accept
- **תיאור:** DOCX (docxtemplater) מ-QuoteVersion+Customer → PDF (LibreOffice); דף חתימה: OTP SMS, חתימה מצוירת, sha256 של ה-PDF, IP/UA, חותמת זמן, דף תעודה מצורף; `Signature` + נעילת Document. שלב ב' (Documenso/PAdES) מחוץ ל-M2.
- **קלט:** מפרט 12; מחקר 04 (חתימה); החלטה §17(5); V17. **פלט:** `modules/contracts`, דף חתימה (ב-`apps/portal` מינימלי או route ציבורי עם token).
- **קבלה:** [ ] OTP שגוי ×3 נועל · [ ] PDF חתום = sha256 שנשמר · [ ] audit trail מלא בציר הזמן.
- **טסטים:** E2E חתימה; unit hash. **הערכה:** 5 ימים. **בעלים:** Neri. **תלויות:** WP-M2-02, 07; §19(5) (חוזה Word נוכחי). **סיכונים:** תוקף משפטי (V17) — "לאימות עם עו"ד" לפני שימוש בחוזה אמיתי.

### WP-M2-09 — Morning + קישור תשלום
- **תיאור:** OAuth2 מול `api.morning.co`; חשבונית מקדמה/סופית; מספר הקצאה; קישור תשלום (Grow/Cardcom); webhook תשלום → `Payment` → תנאי יציאה S04.
- **קלט:** מחקר 04 (הנה"ח); החלטה §17(4); V18. **פלט:** `modules/billing`.
- **קבלה:** [ ] חשבונית ב-sandbox של Morning מקושרת ל-Project · [ ] תשלום בדיקה מעדכן `Payment`.
- **טסטים:** integration מול sandbox (אם קיים) / mock. **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** §17(4). **סיכונים:** ללא sandbox — mock + בדיקה ידנית ב-staging.

### WP-M2-10 — פורטל לקוח מינימלי (אופציונלי, §17(8))
- **תיאור:** `apps/portal`: Better Auth magic-link/OTP, סטטוס לפי אבני דרך, מסמכים (presigned), חתימה (WP-M2-08), תשלום.
- **הערכה:** 4 ימים. **בעלים:** Neri. **תלויות:** החלטה §17(8). אם "M7" — רק route חתימה ציבורי עם token.

### WP-M2-11 — E2E S03–S04 ו-DoD
- **הערכה:** 2 ימים. **בעלים:** Barak + Neri.

**סה"כ M2: ~39 ימי-פיתוח (הערכה).**

### DoD M2
- [ ] הצעה אמיתית אחת (לקוח מסכים/מוסווה) יוצאת מהמערכת דרך השער, XLSX+PDF מאושרים על ידי ברק, חוזה נחתם ב-staging-flow, חשבונית ב-sandbox.
- [ ] תבניות Meta מאושרות (לפחות "הצעה נשלחה", "תזכורת").
- [ ] deploy; flags `quotes,docgen` דולקים ב-prod **רק** לברק (role gate) לפיילוט של 2–3 הצעות.

---

## 7. M3 — הגשה לחח"י (S05 + S10 מנוהלים)

**מטרה:** פרופילי אסדרה, תבניות Submission, טפסים ממולאים, קליטת קבלות, SLA בימי עבודה, תזכורות ודיווח בוקר. "עובד מקצה לקצה": **תיק הגשה נוצר, מוגש ידנית, קבלה נקלטת, סטטוס ו-SLA מנוהלים.**

**היקף:** `modules/submissions`, `apps/web` ("תיקי חח"י"), הרחבת `morning-report`.

### WP-M3-01 — פרופילי אסדרה + תבניות Submission כנתונים
- **תיאור:** טבלת `regulatory_profiles` (seed מ-`01-lifecycle-stages.json.profiles`), `submission_templates` (לכל פרופיל: צעדים, מסמכים נדרשים, אגרות, חתומים, SLA בימי עבודה, "ממתין ל"), עם `verification` לכל שדה. שני מסלולים: IEC ו-historic distributor (V11).
- **קלט:** מפרט 13; תוכנית האב §9; מחקר 01. **פלט:** seed YAML/JSON ב-`docs/plan/templates/` → טבלאות; מסך עריכה.
- **קבלה:** [ ] שינוי תבנית לא דורש deploy · [ ] כל SLA נושא מקור (V1 פתוח → `unverified`).
- **טסטים:** data test לשלמות תבניות. **הערכה:** 3 ימים. **בעלים:** Claude Code + Barak (תוכן). **תלויות:** M0. **סיכונים:** V1/V3/V5/V6 פתוחים — התבנית נבנית מהניסיון של ברק (§19(4), (6)) ומסומנת.

### WP-M3-02 — מודול submissions
- **תיאור:** Submission (iec|historic|authority|fire), SubmissionStep (`status`, `owner`, `documents[]`, `fee{amount,receipt,paidAt}`, `externalRef`, `dueAt` בימי עבודה, `correspondence[]`), יצירה אוטומטית מפרופיל ב-S04→S05 וב-S09→S10, job `remind_waiting_iec_business_days`.
- **קלט:** מפרט 13; תוכנית האב §9.2. **פלט:** `modules/submissions`.
- **קבלה:** [ ] `dueAt` מדלג על חגים · [ ] תשובת מחלק חיובית = תנאי יציאה S05 · [ ] "לא נדרש" לפי פרופיל מדלג.
- **טסטים:** integration; unit ל-dueAt. **הערכה:** 4 ימים. **בעלים:** Neri. **תלויות:** WP-M3-01, M0-08.

### WP-M3-03 — מילוי טפסי PDF וחבילת הגשה
- **תיאור:** טופס 22-8-22 (ועתידיים) כ-PDF forms ממולאים מהרשומה (pdf-lib/pypdf ב-docgen), מיזוג לחבילה אחת לפי רשימת המסמכים בתבנית, רשימת חוסרים.
- **קלט:** מפרט 13; §19(4), (6); V5. **פלט:** `services/docgen/forms/`, `Document kind=iec_application_pack`.
- **קבלה:** [ ] טופס ממולא תואם ויזואלית לטופס שברק הגיש · [ ] חוסר מסמך חוסם "מוכן להגשה".
- **טסטים:** snapshot PDF; unit למיפוי שדות. **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M2-02. **סיכונים:** הטופס ישתנה (V5) — מיפוי שדות כנתון.

### WP-M3-04 — קליטת קבלות ואישורים
- **תיאור:** העלאה/מייל (n8n → API) → Claude vision/structured output → הצעה: סכום, אסמכתא, הצעת חשבון, תאריך → אישור אדם → `fee.receipt` + Document. דוגמה: קבלה 28.09.26 (704.22 ₪, הצעת חשבון 52181659).
- **קלט:** תוכנית האב §9.2, §14 (Receipt updater). **פלט:** `modules/submissions/ingest`.
- **קבלה:** [ ] הקבלה לדוגמה נקלטת עם כל 3 המספרים · [ ] אין קישור בלי אישור.
- **טסטים:** fixture קבלה מוסווה. **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M3-02.

### WP-M3-05 — תזכורות + דיווח בוקר מורחב
- **תיאור:** pg-boss cron → "תקועים": SLA חורג, `waiting_iec` ישן, מחירונים ישנים → הרחבת `ops/prod/morning-report.sh`/`.ps1` (קיים; יוצא ל-self-chat דרך Hermes/PC poller).
- **קלט:** תוכנית האב §10; handoff (M4a). **פלט:** endpoint `GET /reports/morning`, שינוי בסקריפטים.
- **קבלה:** [ ] דיווח הבוקר כולל סעיף "תיקי חח"י". **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** WP-M3-02; Hermes bridge מחובר (מחוץ לתוכנית).

### WP-M3-06 — UI "תיקי חח"י"
- **הערכה:** 3 ימים. **בעלים:** Neri. **קבלה:** [ ] רשימה לפי סטטוס/"ממתין ל"/dueAt; כרטיס תיק עם צעדים, מסמכים, קבלות, תכתובת.

### WP-M3-07 — מסלול מחלק היסטורי
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** V11 (או ניסיון ברק). **קבלה:** [ ] פרויקט עם `distributor` מקבל תבנית נפרדת וצ'קליסט כפול (פנימי + חח"י).

### WP-M3-08 — E2E ו-DoD
- **הערכה:** 1 יום.

**סה"כ M3: ~21 ימי-פיתוח (הערכה).**

### DoD M3
- [ ] תיק הגשה אמיתי אחד (פרויקט פעיל) הופק מהמערכת, הוגש ידנית ב-digitalorders, מספר התיק והקבלה נקלטו, SLA רץ.
- [ ] דיווח הבוקר ב-prod כולל תיקי חח"י. flags `submissions` דולק ב-prod לברק/PM.

---

## 8. M4 — תכנון כשירות (S06)

**מטרה:** `services/cad` מלא (eplan + pvlib + layout), spec אוטומטי, קליטת קונסטרוקטור, ציור גג ב-UI, Windows CAD worker, SVG preview, BOM → QuoteVersion rev. "עובד מקצה לקצה": **מפרויקט לסט E-00…E-08 ב-DWG 2018 + PDF + כתב כמויות מדויק.**

**היקף:** `services/cad` (מלא), `modules/{design,cad-jobs}`, `workers/cad-windows`, `apps/web` (עורך גג, תצוגת גיליונות, verify).

### WP-M4-01 — `services/cad` container מלא
- **תיאור:** Python ≥3.11; eplan vendored (מה-zip `electrical-drawing-sets/generator/eplan-generator.zip`, 113 קבצים) כחבילה; pvlib, shapely, ezdxf 1.4.x, PyMuPDF, python-bidi, גופנים (Rubik, heb.shx); API `POST /jobs/eplan`, `POST /jobs/layout`, `POST /jobs/ingest-drawing`; מריץ כ-consumer של pg-boss (או HTTP + polling); תוצרים ל-documents.
- **קלט:** מפרט 14; תוכנית האב §8.1, §8.3; מחקר 07. **פלט:** `services/cad/`, Dockerfile, compose.
- **קבלה:** [ ] `pytest` של eplan ירוק בתוך הקונטיינר · [ ] YAML דוגמה מהסקיל מפיק E-00…E-08 DXF+PDF+PNG+SVG+BOM · [ ] `ezdxf audit` 0/0/0.
- **טסטים:** pytest קיים + smoke API. **הערכה:** 4 ימים. **בעלים:** Claude Code (+Barak מכיר את eplan). **תלויות:** —. **סיכונים:** גודל image; זמן ריצה — להגביל במקביליות.

### WP-M4-02 — Design + spec YAML אוטומטי
- **תיאור:** `Design` (spec YAML rev + hash, layout geometry, status), מחולל spec מ-Project (כתובת, חיבור, פרופיל) + Survey (לוח, מונה, תוואי) + Catalog (נתוני דף נתונים עם מקור) + החלטות ברק; כל לא-מאומת = `# VERIFY`; גרסאות; diff בין revs.
- **קלט:** מפרט 14; תוכנית האב §8.1(1); reference "מפרט YAML" בסקיל. **פלט:** `modules/design`, `spec-builder.ts`.
- **קבלה:** [ ] spec לפרויקט אמיתי עובר את ולידטור ה-eplan · [ ] כל שדה `# VERIFY` מופיע ברשימת verify ב-UI.
- **טסטים:** unit על 3 פרויקטים (ביתי/עסקי/BESS). **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** WP-M4-01, M1, M2-06.

### WP-M4-03 — קליטת תוכנית קונסטרוקטור
- **תיאור:** (א) DWG/DXF (כמו NESPAH-543-05): DWG→DXF דרך ה-worker (WP-M4-06) או קלט DXF ישיר; חילוץ `INSERT`/`LWPOLYLINE` לפי שכבות (ezdxf) → פוליגוני גג/הפרעות/מודולים; (ב) PDF וקטורי: PyMuPDF `get_drawings()`; (ג) רסטר: Claude vision + נקודות בקרה אפיניות → תמיד לאישור. נשמר ב-`roof/layout` של ה-spec.
- **קלט:** מפרט 14; תוכנית האב §8.1(2); מחקר 07. **פלט:** `services/cad/ingest/`, מסך "אשר גיאומטריה".
- **קבלה:** [ ] NESPAH-543-05 נקלט: גג, מודולים, סקאלה · [ ] PDF וקטורי של אותו סט נותן אותה גיאומטריה ±1%.
- **טסטים:** fixtures (DXF, PDF, PNG מוסווים). **הערכה:** 5 ימים. **בעלים:** Claude Code. **תלויות:** WP-M4-01. **סיכונים:** שכבות לא עקביות בין קונסטרוקטורים — מיפוי שכבות כנתון לכל קונסטרוקטור.

### WP-M4-04 — עורך גג על אורתופוטו + אלגוריתם פריסה
- **תיאור:** UI: מפה (govmap XYZ/WMS או MapTiler), ציור פוליגון גג/הפרעות/אזימוט/שיפוע, קליטת תוצאות WP-M4-03; שרת (python): רוטציה לאזימוט, גריד portrait/landscape, pitch משורות מצל חורף, `contains` מול גג והפרעות, קיבוץ למחרוזות לפי פאה, string sizing (eplan). תפוקה מ-WP-M2-05 עם horizon.
- **קלט:** מפרט 14; תוכנית האב §8.2; מחקר 03. **פלט:** `apps/web/src/pages/design/roof-editor`, `services/cad/layout/`.
- **קבלה:** [ ] גג מלבני 10×20 מ' עם הפרעה אחת מניב פריסה שברק מאשר · [ ] מספר מודולים ≤ תיאורטי · [ ] שמירה כ-GeoJSON ב-Design.
- **טסטים:** unit גיאומטריה (shapely) עם מקרי קצה; Playwright לעורך. **הערכה:** 6 ימים. **בעלים:** Neri (UI) + Claude Code (אלגוריתם). **תלויות:** WP-M4-02; V15 (כיסוי Google Solar / רישוי מפ"י — לא חוסם: govmap ציבורי). **סיכונים:** דיוק אורתופוטו; תמיד "לאימות בשטח".

### WP-M4-05 — הרצת eplan כ-job + STATUS/RESULT/NEXT
- **תיאור:** job → `services/cad` → `ALL CHECKS PASS`/חסימות → CalcReport, DrawingSet (DXF+PDF+PNG+SVG), BOM CSV → Documents עם `generated_from{design_rev, rules_snapshot}`; מסך verify עם `owner_accepted`; תנאי יציאה S06.
- **קלט:** מפרט 14; תוכנית האב §8.1(3); `01-lifecycle-stages.json` S06. **פלט:** `modules/design/run.ts`, מסך "סט rev".
- **קבלה:** [ ] חסימת ולידטור מוצגת עם כלל ומקור · [ ] אין יציאה מ-S06 עם verify לא ריק אלא `owner_accepted` מתועד.
- **טסטים:** integration מלא על spec דוגמה; E2E. **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** WP-M4-01, 02, M0-04.

### WP-M4-06 — `workers/cad-windows` (GstarCAD)
- **תיאור:** worker על מחשב המשרד (Windows, GstarCAD 2027): poller שמושך job (`GET /cad-jobs/next`, token, דרך Tailscale כמו `/status`), מוריד DXF + job JSON, מריץ סקריפט GstarCAD (.NET/Python API או cad-pyrx — V19): החלפת placeholder בבלוק דינמי מהספרייה (`bee-block-library/dynamic`) + `DynamicBlockReferenceProperty`, AUDIT, PURGE, SAVEAS DWG 2018, PLOT לפי CTB → PDF רשמי; העלאה; heartbeat ל-Uptime Kuma; לוג. התקנה כמשימה מתוזמנת/שירות של משתמש ייעודי (מפרט 17 §B.6). **Fallback:** שיטוח 152 הבלוקים הדינמיים לווריאנטים סטטיים (ezdxf) — אם V19 נכשל.
- **קלט:** מפרט 14; תוכנית האב §8.3; מחקר 07; HANDOFF ספריית בלוקים (33 בלוקים לבדיקה). **פלט:** `workers/cad-windows/{poller.py, gstar_job.py|.cs, install.ps1, README}`, `modules/cad-jobs`.
- **קבלה:** [ ] DXF מהסקיל → DWG 2018 נפתח ב-GstarCAD עם בלוקים דינמיים פעילים (גריפ visibility) · [ ] PDF מודפס לפי CTB תואם PNG של ezdxf (pixelmatch ≤ סף) · [ ] worker מתאושש אחרי ריסטארט של ה-PC · [ ] job שנכשל 3× → DLQ + התראה.
- **טסטים:** ידני על ה-PC + integration ב-staging עם worker מחובר ל-bee-lab. **הערכה:** 6 ימים (הערכה גסה במיוחד). **בעלים:** Barak (PC, רישיון) + Claude Code מקומי. **תלויות:** WP-M4-05; §17(3); V19; בדיקת 33 הבלוקים ב-CAD מלא. **סיכונים:** הגבוה ביותר בתוכנית — API של GstarCAD לא אומת; לכן ה-fallback מתוכנן מראש והוא WP-M4-06b (3 ימים).

### WP-M4-07 — תצוגת גיליונות בדפדפן
- **תיאור:** SVG per layer / dxf-viewer, בחירת גיליון/rev, השוואת revs (pixelmatch overlay).
- **הערכה:** 2 ימים. **בעלים:** Neri. **תלויות:** WP-M4-05.

### WP-M4-08 — BOM → QuoteVersion rev + diff לברק
- **תיאור:** BOM של eplan מחליף את כמויות הערכות; הפרש מול ההצעה שנשלחה מוצג; גרסה חדשה/פקודת שינוי (WP-M2-01).
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** WP-M4-05, M2-01. **קבלה:** [ ] דלתא לכל שורה; [ ] אין שינוי אוטומטי של גרסה שנשלחה.

### WP-M4-09 — שערי איכות ל-CAD
- **תיאור:** text_size+bbox+STRtree (חפיפות טקסט), pixelmatch/odiff snapshots לכל גיליון, `ezdxf audit`, Claude-vision ל-bidi (צעד ידני/שבועי).
- **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M4-05.

### WP-M4-10 — E2E ו-DoD
- **הערכה:** 2 ימים.

**סה"כ M4: ~38 ימי-פיתוח (הערכה) + 3 ל-fallback.**

### DoD M4
- [ ] פרויקט אמיתי אחד: סקר → spec → eplan → DWG+PDF דרך ה-worker → כתב כמויות rev → ברק חתם "סט אושר, verify ריק".
- [ ] worker רץ שבוע ב-staging בלי התערבות; fallback מתועד.
- [ ] flags `design,cad` דולקים ב-prod לברק.

---

## 9. M5 — ביצוע ולו"זים (S07–S08)

**מטרה:** תבניות לו"ז + CPM, Gantt חוצה-פרויקטים, Calendar sync, PO, פורט מחולל דוחות שטח, צ'קליסטים, פקודות שינוי. "עובד מקצה לקצה": **מסט מאושר לרכש, לו"ז, התקנה עם דוחות יומיים.**

**היקף:** `modules/{scheduling,procurement,field}`, `apps/field` (דוחות), `apps/web` (Gantt, רכש).

### WP-M5-01 — תבניות לו"ז + CPM בימי עבודה
- **תיאור:** `schedule_templates` לפרופיל (משכים, תלויות FS/SS, buffer), יצירה ב-S04, CPM בצד השרת על `business_calendar`, עדכון לפי מציאות (actual dates מאירועים).
- **קלט:** תוכנית האב §10; מחקר 05 §3.2. **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** M0-08. **קבלה:** [ ] נתיב קריטי מחושב ומוצג; [ ] שינוי תבנית ללא deploy.

### WP-M5-02 — Gantt חוצה-פרויקטים + משאבים
- **תיאור:** frappe-gantt/SVAR (MIT) + FullCalendar; משאבים (צוותים, מנוף, בודק), קונפליקטים, drag → events.
- **הערכה:** 5 ימים. **בעלים:** Neri. **תלויות:** WP-M5-01. **קבלה:** [ ] שני פרויקטים על אותו צוות באותו יום = קונפליקט מוצג.

### WP-M5-03 — Google Calendar דו-כיווני
- **תיאור:** `events.watch` + syncToken + `extendedProperties.private.bee_event_id`; DB master; יומנים: התקנות, בדיקות, חח"י.
- **הערכה:** 4 ימים. **בעלים:** Claude Code. **סיכונים:** TTL של watch לא אומת (מחקר 05 §10.5) — חידוש job. **קבלה:** [ ] שינוי ביומן מעדכן DB תוך דקה; [ ] אין לולאת סנכרון.

### WP-M5-04 — רכש
- **תיאור:** BOM → PO לפי ספק (מחירון, lead time), Delivery, חוסרים חוסמים S08 (`po.critical_items.delivered_or_scheduled`); PO XLSX/PDF (docgen).
- **הערכה:** 4 ימים. **בעלים:** Neri. **תלויות:** M4-08, M2-02. **קבלה:** [ ] פריט קריטי חסר חוסם מעבר ל-S08 עם הסבר.

### WP-M5-05 — פורט מחולל דוחות שטח מ-bee-build
- **תיאור:** DSL `report-templates` (9 בלוקים, 7 תבניות) כבר ב-`@bee/shared-schemas` (handoff) → `apps/field` (עורך מובייל, autosave/אופליין/חתימה/מצלמה) + `modules/field/reports` (ראוטים, בעלות/סטטוס/תמונות/חתימות) + PDF דרך docgen (Rubik). איחוד עם `ReportForm`/`Survey` של נרי.
- **קלט:** handoff §4 (bee-build), `docs/superpowers/specs/2026-09-22-m*.md` ב-bee-live. **הערכה:** 6 ימים. **בעלים:** Neri (+Claude Code). **תלויות:** M0-10. **סיכונים:** שתי סכמות Report (bee-build/נרי) — החלטה ב-spec לפני קוד. **קבלה:** [ ] 25/25 E2E של bee-build עוברים בקו החי; [ ] דוח נוצר אופליין ומסתנכרן.

### WP-M5-06 — צ'קליסטים, דוחות יומיים, תמונות, WorkOrder/Crew
- **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M5-05. **קבלה:** [ ] צ'קליסט לפי סוג גג/ממיר; [ ] `checklist.installation.complete` = תנאי יציאה S08.

### WP-M5-07 — פקודות שינוי → QuoteVersion
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** M2-01, M5-06.

### WP-M5-08 — שיבוץ צוות מתשובת WhatsApp (M4b מה-handoff)
- **תיאור:** דיווח הבוקר מציע שיבוץ; תשובת ברק/נרי בקבוצה (Hermes נכנס) → `collect.wa` → אישור → WorkOrder.
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** Hermes מחובר; M2-07.

### WP-M5-09 — E2E ו-DoD
- **הערכה:** 2 ימים.

**סה"כ M5: ~32 ימי-פיתוח (הערכה).**

### DoD M5
- [ ] פרויקט אמיתי: PO יצאו (אחרי אישור), לו"ז ב-Gantt וביומן Google, 3 דוחות יומיים מהשטח, צ'קליסט סגור.
- [ ] flags `scheduling,procurement,field` ב-prod.

---

## 10. M6 — בדיקה, מונה, מסירה (S09–S11)

**מטרה:** דוח 62446-1, חבילת בדיקת חח"י, GridConnection, תיק מתקן, אחריות, MonitoringLink → bee-live, הסכמת נתוני חח"י. "עובד מקצה לקצה": **מהתקנה לאתר שנדלק בניטור.**

**היקף:** `modules/{inspections,handover}`, הרחבת `submissions` (S10), חיבור לטבלאות הניטור הקיימות.

### WP-M6-01 — inspections: Inspection/TestResult/Defect
- **תיאור:** סוג בודק לפי R17 (`unverified` עד V7), הזמנה ביומן, טופס בדיקה (PWA): קטגוריה 1 (ויזואלי, רציפות הארקה, קוטביות, Voc/Isc למחרוזת, RCD, בידוד DC) + קטגוריה 2; Defect → Task → בדיקה חוזרת; S09→S08 rollback.
- **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** M5-05 (DSL דוחות). **קבלה:** [ ] 0 ליקויים פתוחים = תנאי יציאה; [ ] תוצאות מחרוזות נשמרות כ-baseline.

### WP-M6-02 — דוח בודק PDF (תבנית "בודק" מ-bee-build)
- **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** WP-M6-01; §19(4) (דוח בודק אחד לכיול).

### WP-M6-03 — חבילת בדיקת מתקן חח"י (pypdf merge)
- **תיאור:** חד-קו חתום (as-made), טופס בדיקה, הצהרות, דפי נתונים, אישור גודל חיבור → PDF אחד עם bookmarks; צעדי S10 מהתבנית (WP-M3-01).
- **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** M3, M4, M6-02.

### WP-M6-04 — GridConnection + צעדי S10
- **תיאור:** `GridConnection{meterSerial, meterCode, contractNumber, bpNumber, approvedKw, track, activatedAt}`; צעדים: הזמנת בדיקה, תשלום, בדיקה (7 י"ע — `unverified`), מונה, אישור הפעלה, רישום לאסדרה בפורטל יצרנים, היתר הפעלה אם חל (V10).
- **הערכה:** 3 ימים. **בעלים:** Neri. **תלויות:** M3-02. **קבלה:** [ ] שלושת תנאי היציאה של S10 נאכפים.

### WP-M6-05 — סט As-Made
- **תיאור:** Design rev `as-made` מדלתאות ההתקנה; סטטוס בבלוק הכותרת; הפקה דרך M4.
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** M4-05, M5-06.

### WP-M6-06 — תיק מתקן, אחריות, חשבון סופי
- **תיאור:** HandoverPack (pypdf: bookmarks, attachments DXF; נתוני מערכת, as-made, מפת מחרוזות, דפי נתונים, O&M, תוצאות בדיקה), Warranty עם תאריכי סיום + תזכורות, חשבונית סופית (Morning), חתימת לקוח (M2-08), הדרכה.
- **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** M2-08, M2-09, M6-03.

### WP-M6-07 — MonitoringLink → bee-live
- **תיאור:** הגשר לטבלאות הניטור הקיימות (`customers`/`sites`/אינטגרציות): יצירת אתר ניטור מהפרויקט; `MonitoringLink{vendor, vendorSiteId, region, authMode, credentialRef, sharingStatus, latency}`; מלאי ציוד (סריאלים), מפת מחרוזות + baseline Voc/Isc/Riso, אוריינטציה/שיפוע, תפוקה חודשית צפויה (pvlib) וספי התראה; `verify_first_sync`; **שיתוף אתר לא הושלם = משימה** (לקח Sungrow "not in account list").
- **קלט:** תוכנית האב §11, §12; handoff (אדפטרים). **הערכה:** 4 ימים. **בעלים:** Neri (מכיר את הניטור). **תלויות:** M6-01. **קבלה:** [ ] אתר חדש מופיע בניטור עם baseline; [ ] `monitoring.link.active` = תנאי יציאה S11; [ ] אין שינוי בהתנהגות 184 האתרים הקיימים (regression).

### WP-M6-08 — הסכמת לקוח ונתוני חח"י (py-iec-api, לא רשמי)
- **תיאור:** הסכמה במסירה, token (ת"ז+OTP של הלקוח), `backStream` חודשי → התאמה מול מונה; מסומן "לא רשמי".
- **הערכה:** 2 ימים. **בעלים:** Claude Code. **תלויות:** V17 (פרטיות), החלטת ברק. **סיכונים:** API לא רשמי — feature flag נפרד, כבוי כברירת מחדל.

### WP-M6-09 — E2E ו-DoD
- **הערכה:** 2 ימים.

**סה"כ M6: ~27 ימי-פיתוח (הערכה).**

### DoD M6
- [ ] פרויקט אמיתי עבר S09→S11 במערכת; האתר מסנכרן ב-bee-live עם baseline; תיק מתקן נמסר ללקוח דרך השער.
- [ ] regression מלא של הניטור הקיים (155+ טסטים) ירוק; canary 48 שעות.

---

## 11. M7 — O&M + AI + פורטל (S12)

**מטרה:** חוזי תחזוקה, tickets→שיבוץ, KPI/EPI, ספקי ניטור נוספים + Modbus, פורטל לקוח מלא, סוכני AI. "עובד מקצה לקצה": **התראה → קריאה → שיבוץ → דוח → סגירה; סוכנים מציעים, אדם מאשר.**

### WP-M7-01 — חוזי תחזוקה (Basic/Standard/Premium, חידוש, Morning)
- **הערכה:** 3 ימים. **בעלים:** Claude Code. **תלויות:** M2-09.

### WP-M7-02 — ServiceTicket: התראה → קריאה → שיבוץ → דוח שטח → סגירה
- **הערכה:** 4 ימים. **בעלים:** Neri. **תלויות:** M5-05, M5-08, התראות קיימות ב-bee-live.

### WP-M7-03 — KPI/EPI (IEC 61724-1) + טקסונומיית התראות
- **תיאור:** specific/reference yield, PR, PR מתוקן טמפ' (pvlib `faiman`), EPI מול PVGIS, זמינות, יחס עמיתים; התראות: אובדן תקשורת, אפס ייצור, תת-ביצוע, חוסר איזון מחרוזות, Riso, אי-התאמת מונה.
- **הערכה:** 4 ימים. **בעלים:** Claude Code. **תלויות:** M6-07.

### WP-M7-04 — ספקי ניטור נוספים + מתזמן מכסות + Modbus/SunSpec
- **תיאור:** Huawei FusionSolar Northbound, Solis, Growatt/Solarman, Enphase v4, Tigo v3; מתזמן מכסות גלובלי (429 חודשי מול דקתי); Modbus/SunSpec logger ל-KStar (§17(11)).
- **הערכה:** 8 ימים (ספק = 1–2 ימים). **בעלים:** Neri. **תלויות:** V13/V14; החלטה §17(11).

### WP-M7-05 — פורטל לקוח מלא
- **תיאור:** Better Auth (magic-link/OTP/passkey), סטטוס אבני דרך, מסמכים, חתימה, תשלום, תמונות, ניטור בסיסי אחרי מסירה; RLS ל-customer.
- **הערכה:** 5 ימים. **בעלים:** Neri. **תלויות:** M2-10 (אם נבנה), M6.

### WP-M7-06 — סוכני AI (Agent SDK + MCP in-process)
- **תיאור:** 7 סוכנים לפי תוכנית האב §14 (Intake, Quote drafter, Price-list ingest, Design assistant, Submission assistant, Receipt/status updater, Stuck monitor); כלי כתיבה עם `_meta["anthropic/requiresUserInteraction"]` → `canUseTool` תמיד; PreToolUse `defer`; idempotency keys; PostToolUse audit; cost tier לכל job; כל מספר עם מקור או "לאימות".
- **הערכה:** 8 ימים (סוכן ≈ 1 יום + תשתית 2). **בעלים:** Claude Code (+Neri תשתית). **תלויות:** M0-04 (לדג'ר), M2-07 (שער), DPA עם Anthropic (V17). **קבלה:** [ ] אין כלי כתיבה שרץ בלי אישור (טסט); [ ] עלות לכל job נרשמת.

### WP-M7-07 — בדיקה תקופתית (5 שנים — V20) + תזכורות אחריות
- **הערכה:** 1 יום.

### WP-M7-08 — E2E ו-DoD
- **הערכה:** 2 ימים.

**סה"כ M7: ~35 ימי-פיתוח (הערכה).**

### DoD M7
- [ ] קריאת שירות אמיתית נסגרה דרך המערכת; לקוח אחד נכנס לפורטל; סוכן Intake יצר טיוטת ליד שאושרה.
- [ ] כל כלי הכתיבה של הסוכנים עברו ביקורת אבטחה (`/security-review`).

---

## 12. גרף תלויות חוצה-אבני-דרך

```
M0 יסודות
 ├──▶ M1 קטלוג/תמחור ──▶ M2 הצעה/BOQ ──┬──▶ M3 חח"י ──────────┐
 │                                     │                      │
 │                                     └──▶ M4 תכנון (CAD) ───┤
 │                                           ▲ M1 (קטלוג)     │
 ├──────────────────────────────────────────▶ M5 ביצוע/לו"ז ◀─┘ (M4: BOM→PO)
 │                                               │
 │                                               ▼
 │                                   M6 בדיקה/מונה/מסירה ◀── M3 (צעדי S10)
 │                                               │
 └── (bee-live ניטור קיים) ──────────────────────▼
                                              M7 O&M/AI/פורטל

מסלול מקביל (מחוץ לגרף, לא תלוי במנוע):
  SolarEdge V2 (דדליין 01–03.11.2026) · Hermes bridge · 6 אתרים חשוכים · 33 בלוקים דינמיים לבדיקה ב-CAD
```

**תלויות "רכות" שאפשר להקדים:** `services/docgen` (M2-02) ו-`services/cad` (M4-01) אינם תלויים ב-M0/M1 ויכולים להיבנות במקביל על ידי Claude Code; העורך הגרפי (M4-04) יכול להתחיל אחרי M2-06. **תלויות "קשות":** שער האמון (M0-04) לפני כל outbound (M2-07, M3-05, M7); Document immutability (M0-05) לפני QuoteVersion (M2-01).

---

## 13. לו"ז מוצע (שבועות, צוות של 2 + Claude Code) — הערכה

הנחות: שבוע עבודה א'–ה'; נרי ~4.5 ימים/שבוע; ברק ~1.5–2 ימים/שבוע (בעיקר אישורים, תוכן, PC/CAD, ops); Claude Code מכפיל ~×1.5 על חבילות שמסומנות לו. ~235 ימי-פיתוח / ~6 ימי-צוות אפקטיביים לשבוע ≈ **40 שבועות** כולל buffer 15%.

| שבועות | אבן דרך | הערות |
|---|---|---|
| 1–2 | **M0 קיקאוף** (§14) | שלד, טבלאות, מכונת מצבים, לדג'ר; ברק: החלטות §17(2,4,6,9), קלטים §19 |
| 3–6 | M0 המשך + DoD | מסמכים, תפקידים, rules, PWA, UI, ops; Monday dry-run; **במקביל:** SolarEdge V2 (נרי, לפי handoff — דדליין 11/2026) |
| 7–9 | M1 | מחירונים אמיתיים מברק; ערכות מוקלטות; כיול; **להגיש תבניות Meta לאישור כבר בשבוע 7** |
| 10–15 | M2 | docgen, XLSX, PDF, ROI, שער אמון, חוזה/חתימה, Morning; פיילוט 2–3 הצעות אמיתיות |
| 16–18 | M3 | תבניות Submission מניסיון ברק; תיק אמיתי אחד; דיווח בוקר |
| 19–25 | M4 | services/cad (אפשר להתחיל בשבוע 12 ב-Claude Code), worker Windows (ברק + PC), עורך גג; fallback שיטוח בלוקים |
| 26–30 | M5 | לו"ז/Gantt/Calendar, רכש, פורט דוחות שטח |
| 31–34 | M6 | בדיקה/מונה/מסירה; MonitoringLink; regression ניטור |
| 35–40 | M7 | O&M, ספקים, פורטל, סוכני AI |

**נקודות החלטה בלו"ז:** סוף שבוע 2 (M0 בכיוון הנכון?), סוף שבוע 9 (האם M3 לפני M4 — §17(1)), סוף שבוע 18 (V19 — worker או שיטוח), סוף שבוע 25 (פורטל ב-M7 או הוקדם).

---

## 14. שבועיים ראשונים — תוכנית יומית לקיקאוף M0

(ימים א'–ה'; "CC" = סשן Claude Code מקומי עם סקיל `bee-engine`; כל יום נגמר ב-PR או ב-commit על ענף.)

| יום | נרי | ברק | Claude Code (סשנים) |
|---|---|---|---|
| **1 (א')** | קריאת תוכנית האב §0–§5, §16; הקמת `E:\bee-live` לפי מפרט 17 (compose dev, פורטים 3011/3021, MinIO); החלטת migrations tool | קריאת §16–§19; החלטות §17(2),(4),(6),(9); איסוף קלטים §19(1),(2),(5) | התקנת סקיל `bee-engine` + העתקת `docs/plan` ל-bee-live (מפרט 17 §A); CLAUDE.md additions |
| **2 (ב')** | WP-M0-01: shared-schemas → bee-live, תבנית מודול, feature flags | סקירת מפרט 10 (מודל נתונים) — פתרון התנגשות customers/sites (ראו אי-התאמות) | WP-M0-08 (business_calendar) — סשן קצר, PR |
| **3 (ג')** | WP-M0-01 סיום + PR; תחילת WP-M0-02 (טבלאות ליבה) | סקירת PR; איסוף 2–3 הצעות קיימות + כתב כמויות | WP-M0-07a: seed של rules מ-`docs/plan/rules/` (R1–R24 + 22 כללי משרד) כ-JSON, ללא קוד |
| **4 (ד')** | WP-M0-02 המשך; migration up/down על staging copy | אישור תוכן rules (סימון `office`) | WP-M0-03a: XState מהנתונים + `transition()` (unit tests בלבד, ללא DB) |
| **5 (ה')** | WP-M0-02 PR + merge; תכנון WP-M0-04 | סקירה שבועית: STATUS/RESULT/NEXT; החלטה על ops (WP-M0-12) | WP-M0-03b: חיבור ל-DB + endpoints |
| **6 (א')** | WP-M0-04 (jobs + pg-boss + approvals) | WP-M0-12a: GlitchTip + Kuma על staging (עם CC) | WP-M0-07b: מודול rules + reviewer API |
| **7 (ב')** | WP-M0-04 המשך; טסט "אין עקיפה לשער" | WP-M0-12b: WAL-G → B2; תרגול שחזור ל-bee-lab | WP-M0-05 (documents + MinIO) |
| **8 (ג')** | WP-M0-04 PR; תחילת WP-M0-06 (תפקידים/RLS) | סקירת PRs; הכנת ייצוא Monday (dry-run) | WP-M0-09 (ייבוא Monday) — dry-run על הייצוא |
| **9 (ד')** | WP-M0-06 המשך; WP-M0-10 תכנון (PWA↔Project) | בדיקת 33 הבלוקים הדינמיים ב-GstarCAD (HANDOFF §3) — מסלול מקביל | WP-M0-11a: pipeline + כרטיס פרויקט (שלד) |
| **10 (ה')** | `deploy-staging.sh` עם כל מה שמוזג; E2E ראשוני "ליד → S02" | סקירה דו-שבועית: מה עובד ב-bee-lab; החלטת go/no-go להמשך M0; עדכון לו"ז | סיכום STATUS/RESULT/NEXT לשבועיים; רשימת פערים למפרטים 10–15 |

**תוצר סוף השבועיים:** M0 ב-~45%: טבלאות, מכונת מצבים, לדג'ר, מסמכים, rules, calendar — ממוזגים; staging עולה; ייבוא Monday dry-run; ops בסיסי; רשימת החלטות סגורות.

---

## 15. מה אפשר להתחיל לפני סגירת פערי האימות V1–V20

**עיקרון:** כל פער מוצמד למקום אחד בקוד שבו הוא נתון בטבלה (`rules`, `submission_templates`, `regulatory_profiles`, `products.tech`) עם `verification: unverified`. הקוד נבנה; רק **השימוש העסקי במספר מול לקוח/חח"י** מחכה.

| פער | חוסם את… | אפשר להתחיל בלי | חייב לחכות |
|---|---|---|---|
| V1 SLA אמות מידה | M3-02 `dueAt` | כל M3: SLA כנתון `unverified`, תזכורת מסומנת | הצגת "חח"י באיחור" ללקוח; דיווח SLA חיצוני |
| V2 מהות 704 ₪ | M1-05 שורת אגרה, M3-01 | שורה עם `unverified` | הצעה סופית ללקוח עם האגרה כעובדה |
| V3 ספי 15/100/630 | M3-01 פרופילים, M1-05 | פרופילים לפי `01-lifecycle-stages.json` | אוטומציה של בחירת פרופיל ללא אישור ברק |
| V4 תעריפי 2026 | M2-05 ROI | ROI עם תעריפים `unverified` ו"לאימות" בהצעה | הצעה שנשלחת עם ROI ללא סימון |
| V5/V6 מסמכי טופס 22-8-22 | M3-03 | מיפוי מניסיון ברק (§19(4)) | "חבילה מוכנה להגשה" אוטומטית |
| V7 ספי בודק / 62446-1 | M6-01 R17 | הכל, R17 `unverified` | בחירת בודק אוטומטית |
| V8 הנחיית חח"י טכנית | M4-02 spec ממיר | spec עם `# VERIFY` | `ALL CHECKS PASS` על הגדרות הממיר |
| V9 כבאות/rapid-shutdown | M1-05 R19 | שורה מוצעת `unverified` | חובה בהצעה |
| V10 היתר הפעלה | M6-04 | צעד אופציונלי בתבנית | אכיפה כתנאי יציאה S10 |
| V11 מחלק היסטורי | M3-07 | תבנית מניסיון ברק | — |
| V12 החלטה 70104 | M3 SLA | שדה מידע | SLA "מסלול מהיר" |
| V13 SolarEdge V2 | מסלול מקביל | — | הפעלת V2 ב-prod (handoff: probe → parsers) |
| V14 Sungrow gateway | M6-07 | משימת "שיתוף" | — |
| V15 Google Solar / מפ"י | M4-04 | govmap ציבורי + ציור ידני | DSM/צל אוטומטי |
| V16 מחירי Meta/SMS/R2 | M2-07, M0-05 | הכל (עלויות קטנות) | תקצוב |
| V17 פרטיות/חתימה | M2-08, M6-08, M7-06 | פיתוח + staging | **חוזה אמיתי חתום במערכת; שליחת PII ל-LLM; token חח"י** |
| V18 סף מספר הקצאה | M2-09 | Morning מטפל | — |
| V19 GstarCAD API | M4-06 | M4-01…05, 07–09 ו-fallback שיטוח | worker כ"מסלול יחיד" ל-DWG |
| V20 בדיקה 5 שנים | M7-07 | תזכורת `unverified` | — |

**סיכום:** M0 ו-M1 — ללא חסימה. M2 — חסום חלקית ב-V17 (חוזה אמיתי) בלבד. M3 — ניתן לבנות הכל; השימוש מול חח"י נתמך בניסיון ברק עד אימות. M4 — V19 מכריע בין worker לשיטוח; השאר פתוח. M6/M7 — V17 לפני PII ל-LLM ו-token חח"י.

---

## 16. סיכונים חוצי-תוכנית

| סיכון | סבירות | השפעה | מענה |
|---|---|---|---|
| ברק זמין פחות מ-1.5 יום/שבוע לאישורים ותוכן | גבוהה | כל DoD נדחה | סבב STATUS/RESULT/NEXT קבוע (יום ה'); אישורים מרוכזים; Claude Code מכין טיוטות תוכן |
| GstarCAD API (V19) לא מעשי | בינונית | M4 מאבד DWG דינמי | fallback שיטוח בלוקים (WP-M4-06b), מתוכנן מראש |
| אישור תבניות Meta איטי | בינונית | M2-07 נדחה | הגשה בשבוע 7; מייל כערוץ ביניים דרך השער |
| התנגשות טבלאות customers/sites עם הניטור הקיים | גבוהה | M0-02 | החלטת מפרט 10 ביום 2 (הרחבה או `engine_*`) |
| RAM ב-VPS (Chromium, LibreOffice, GlitchTip, cad) | בינונית | prod איטי | docgen/cad עם מגבלות memory; GlitchTip אולי SaaS חינמי |
| SolarEdge V2 דדליין 11/2026 מתנגש עם M0/M1 | גבוהה | אובדן ניטור V1 | מסלול מקביל של נרי; המנוע מתכנן ללא נרי בשבועות 3–5 אם צריך |
| כפילות סכמות Survey/Report (PWA, bee-build, נרי) | בינונית | M0-10, M5-05 | איחוד במפרט 10 לפני קוד |

---

## אי-התאמות שזוהו (לטיפול במפרטים/בתוכנית האב)

1. **customers/sites קיימים ב-bee-live** (ניטור, 184 לקוחות) ותוכנית האב מגדירה Customer/Site חדשים — צריך החלטה: הרחבת הטבלאות הקיימות (עמודות + RLS) או טבלאות `engine_*` עם FK. המלצה: הרחבה, כדי ש-MonitoringLink לא יהפוך לטבלת מיפוי. (מפרט 10)
2. **פריסת גג ב-S03** (תוכנית האב §3, §8.2) מול "ציור גג ב-UI" ב-**M4** (§16): ב-M2 יש רק Design-lite (WP-M2-06); הצעות עד M4 יוצאות עם kWp/מודולים בלי פריסה גרפית. לתעד במפרט 12/14.
3. **Better Auth** מופיע ב-M0 (§16) אבל bee-live כבר עובד עם JWT משלו; כאן נדחה לפורטל (M2-10/M7-05) ו-M0 מוסיף תפקידים בלבד. דורש אישור.
4. **מספור אבני דרך ב-handoff** (M1–M4b של bee-live ops/SolarEdge) מתנגש עם M0–M7 של המנוע; כאן "M" = תמיד המנוע; עבודת ה-handoff מכונה "מסלול מקביל".
5. **דדליין SolarEdge V2 (01–03.11.2026)** נופל בתוך M0 — תוכנית האב אומרת "נבלע ב-M6/M7", אבל הוא חייב להסתיים לפני; מטופל כמסלול מקביל (§12–§13).
6. **שמות המפרטים 10–15** יושרו לקבצים הקיימים (§0.1).
7. `01-lifecycle-stages.json` משתמש ב-`RES_LE_15`… לפרופילים, תוכנית האב §3 ב-`residential_le15`… — לבחור אחד (המלצה: ה-JSON, כי הוא ה-seed).
8. מע"מ 18% מופיע כקבוע בתוכנית האב; כאן כנתון בטבלה עם תאריך תחולה (לפי עקרון §1(2)).
