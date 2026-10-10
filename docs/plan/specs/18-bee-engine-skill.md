# 18 — טיוטת סקיל `bee-engine` ל-Claude Code

| | |
|---|---|
| גרסה | 0.1 — טיוטה (2026-10-10) |
| מטרה | קובץ `SKILL.md` מוכן להעתקה ל-`C:\Users\<user>\.claude\skills\bee-engine\SKILL.md`, שמלמד סשן Claude Code מקומי איך להשתמש בחבילת התכנון של B.E.E Engine |
| מקור | תוכנית האב §2, §3, §4.2, §5, §9.2, §14, §16–§19; `01-lifecycle-stages.json`; `platform/schema/job.schema.json`; מפרטים 16, 17 |
| התקנה | ליצור תיקייה `bee-engine` תחת תיקיית הסקילים, להדביק את הבלוק שלהלן כ-`SKILL.md` (**דרך Write, לא heredoc** — יש backslashes), לפתוח Claude Code מחדש, לוודא עם `/bee-engine` |

> הערה: ה-frontmatter (`name`, `description`) באנגלית כנדרש; הגוף בעברית. נתיב חבילת התכנון מוגדר פעם אחת בראש הסקיל (`PLAN_DIR`) — לעדכן אם העתקתם ל-`E:\bee-live\docs\engine-plan` (מפרט 17 §A.2).

---

## SKILL.md (להעתקה מכאן ועד סוף הבלוק)

````markdown
---
name: bee-engine
description: Use when working on the B.E.E Engine (PV contractor lifecycle CRM, quotes, BOQ, drawing sets, IEC submissions) inside the bee-live repo — reads the planning package (master plan, lifecycle stages S01–S12, specs 10–18), enforces its conventions (trust gate, sourced numbers, rule verification levels, immutable documents), picks one work package (WP-M<n>-<nn>) per session, and answers in Hebrew with STATUS/RESULT/NEXT.
---

# bee-engine — איך עובדים עם חבילת התכנון של B.E.E Engine

## 0. הגדרות

- `PLAN_DIR` = `docs/engine-plan` (עותק בתוך bee-live) — ואם לא קיים: `E:\bee-assets\docs\plan`. אם שניהם קיימים, `docs/engine-plan` גובר (הוא מה שב-PR), אבל אם ה-README שלו מצביע על commit ישן מ-bee-assets — להגיד למשתמש לפני שממשיכים.
- המאגר: `E:\bee-live` (Fastify + Postgres + Vite; Docker + Caddy + Cloudflare; ops ב-`ops/`). המנוע **מתווסף** לקו החי כמודולים; לא מחליף אותו.
- צוות: ברק (בעלים, מהנדס חשמל, מאשר), נרי (מפתח). אתה — סשן Claude Code שמבצע **חבילת עבודה אחת**.

## 1. סדר קריאה (לפני כל קוד)

1. `PLAN_DIR/00-master-plan.md` — §0 (תקציר), §2 (עקרונות), §3 (שלבים), §4.2 (מבנה קוד), §5 (ישויות). את §6–§15 קוראים לפי הצורך של החבילה.
2. `PLAN_DIR/01-lifecycle-stages.json` — מכונת המצבים כנתונים (S01–S12, statuses, profiles, exit, auto_tasks).
3. `PLAN_DIR/specs/16-execution-plan.md` — למצוא את חבילת העבודה (`WP-M<n>-<nn>`) שהמשתמש ביקש: תיאור, קלט, פלט, קבלה, טסטים, תלויות, סיכונים.
4. המפרט שהחבילה מפנה אליו (`PLAN_DIR/specs/10…18`). אם הקובץ/הסעיף לא קיים עדיין — המקור הסמכותי הוא הסעיף בתוכנית האב שצוין לצידו; לציין זאת ב-STATUS.
5. `PLAN_DIR/specs/17-local-setup.md` — סביבה, פורטים, מלכודות (§D), לולאת deploy (§E), בטיחות נתונים (§F).
6. רק כשצריך: `PLAN_DIR/research/0x-*.md` (מקורות ורמות אימות), `platform/schema/job.schema.json` (לדג'ר/שער אמון), `PLAN_DIR/rules/`, `PLAN_DIR/schema/`, `PLAN_DIR/templates/`.
7. בקוד: `CLAUDE.md` של bee-live, `docs/ops-runbook.md`, `docs/dev-local.md`, והמודול הקיים שנוגעים בו.

אל תקרא את כל חבילת התכנון בכל סשן — רק מה שהחבילה דורשת. אם יש סתירה בין מסמכים: `01-lifecycle-stages.json` > מפרט ספציפי > תוכנית האב > דוח מחקר, ומדווחים על הסתירה.

## 2. מוסכמות שמות ומזהים

- **שלבים:** `S01`–`S12` עם `key` באנגלית (`lead, survey, quote, contract, iec_pre_application, engineering, procurement, installation, inspection, grid_connection, handover, om`). לא ממציאים שלב; לא משנים סדר. S05 ‖ S06 מקבילים.
- **סטטוסים:** `open · in_progress · waiting_customer · waiting_iec · waiting_supplier · waiting_engineer · blocked · done`. `blocked` תמיד עם `reason` + `owner`.
- **פרופילי אסדרה:** לפי `01-lifecycle-stages.json.profiles` (`RES_LE_15, COM_LE_100, COM_LE_630, LARGE_GT_630, BESS_ADD, HISTORIC_DIST`). תוכנית האב משתמשת בשמות אחרים (`residential_le15`…) — ה-JSON גובר.
- **ישויות:** Customer, Site, Project, Contact, Task, Milestone, Schedule, Survey, Photo, Design, CalcReport, DrawingSet, BOM, Quote, QuoteVersion, QuoteSection, QuoteLine, Contract, Invoice, Payment, Signature, Submission, SubmissionStep, PurchaseOrder, POLine, Delivery, WorkOrder, Crew, DailyReport, Checklist, ChangeOrder, Inspection, TestResult, Defect, GridConnection, HandoverPack, Warranty, MonitoringLink, MaintenanceContract, ServiceTicket, PeriodicInspection, CommunicationLog, Supplier, Product, PriceList, PriceListEntry, Assembly, PricingRule, DiscountSchedule, ApprovalThreshold, Rule, Document, Job. טבלאות ב-snake_case ברבים (`quote_versions`), Zod ב-`packages/shared-schemas` ב-PascalCase.
- **מודולים:** `server/src/modules/<module>` לפי הטבלה במפרט 16 §2 (`projects, jobs, documents, rules, calendar, auth-roles, surveys, catalog, pricing, quotes, contracts, billing, comms, submissions, design, cad-jobs, scheduling, procurement, field, inspections, handover, om, ai`). אפליקציות: `apps/web`, `apps/field`, `apps/portal`; שירותים: `services/docgen`, `services/cad`; worker: `workers/cad-windows`.
- **כללים:** `R1`–`R24` (מחקר 02), כללי משרד `#1`–`#22` (סקיל `electrical-drawing-sets`), כללי eplan — כולם שורות בטבלת `rules` עם `key` יציב.
- **פערי אימות:** `V1`–`V20` (תוכנית האב §18). **החלטות פתוחות:** §17(1)–(11). **קלטים מברק:** §19(1)–(8).
- **חבילות עבודה:** `WP-M<n>-<nn>` (ועם `a/b/c` לפיצול). ענף: `feat/m<n>-wp<nn>-<slug>`; PR: `M<n>-WP<nn>: <כותרת>`.
- **מסמכים:** `Document.kind` לפי `documents[]` ב-JSON (`survey_pdf, quote_pdf, boq_xlsx, contract_pdf, iec_application_pack, drawing_set_dwg, …`).
- **jobs:** לפי `platform/schema/job.schema.json`: `kind ∈ {collect, edit, dispatch}`, `status ∈ {queued, running, succeeded, failed, blocked_trust, cancelled}`, `trustTier ∈ {L0, L1, L2}`, `outbound{channel, destinationClass, requiresHumanPick}`.

## 3. רמות אימות של כללים ומספרים

כל Rule, סף, אגרה, תעריף, SLA ונתון טכני נושא `verification`:

| רמה | משמעות | מה מותר לקוד |
|---|---|---|
| `unverified` | מתקציר חיפוש/זיכרון; לא נבדק מול מקור ראשוני | להציע שורה/מסמך/תזכורת **עם סימון "לאימות"**; לא להציג ללקוח כעובדה; לא לחסום מעבר שלב על בסיסו בלבד |
| `summary` | אומת מול מקור משני (תקציר רשמי, קוד קהילתי) | כמו unverified, בלי חובת סימון פנימי; עדיין "לאימות" במסמך ללקוח |
| `office` | כלל משרד של ברק (ניסיון, לא תקנה) | אכיפה פנימית מלאה; במסמך ללקוח מוצג כ"דרישת המשרד" |
| `validated` | אומת מול מקור ראשוני על ידי `verified_by` (ברק/עו"ד/חח"י) עם תאריך | אכיפה מלאה, הצגה כעובדה עם מקור |

חוקים:
- **אין קבועים עסקיים בקוד.** מע"מ, 704 ₪, 15/100/630 kW, 7 י"ע — הכל בטבלאות (`rules`, `regulatory_profiles`, `submission_templates`, `products`) עם `source`, `section`, `valid_from`, `verification`, `verified_by`.
- כלל חסר = `HUMAN_INPUT_REQUIRED` (חסימה עם הסבר), לא ניחוש ולא ברירת מחדל שקטה.
- כשאתה כותב seed לכלל חדש: `verification: unverified` + `source` (URL/מסמך/דוח מחקר + סעיף) — ואם אין מקור, לכתוב `source: "assumption by Claude <date>"`.
- `verified_by` יכול להיות רק אדם. אתה לא מאמת.

## 4. שער האמון (Trust Gate)

- **Law #1:** אין שליחה ללקוח/ספק אוטומטית. **Law #2:** `requiresHumanPick: true` על כל outbound (`destinationClass ∈ {customer, supplier, other}`).
- כל יוצא = job `dispatch.*` עם `outbound` → `blocked_trust` עד `approvals.decided_by`. אין נתיב קוד ששולח בלי זה — ואם אתה כותב כזה "לבדיקה", מחק אותו.
- כלי AI שכותבים (`send_customer_message`, `transition_project`, `create_quote`…) מסומנים `_meta["anthropic/requiresUserInteraction"]` ועוברים `canUseTool`.
- מעבר שלב רק דרך `transition(projectId, event, actor, reason)`; לעולם לא `UPDATE projects SET stage`.
- מסמכים לעולם לא נמחקים; QuoteVersion/Contract/DrawingSet שנשלחו/נחתמו — נעולים (DB trigger). שינוי = גרסה חדשה.
- הצעות של AI/משתמש = טיוטות; ולידטורים ומכונת המצבים קובעים ("המודל מציע, הקוד אוכף").

## 5. איפה הדברים חיים

| מה | איפה |
|---|---|
| תוכנית אב, שלבים, מפרטים 10–18, דוחות מחקר | `PLAN_DIR/` (`00-master-plan.md`, `01-lifecycle-stages.json`, `specs/`, `research/`, `rules/`, `schema/`, `templates/`) |
| סכמת jobs/לדג'ר | `platform/schema/job.schema.json`, `loops.json` (ב-bee-assets) |
| קוד המנוע | `E:\bee-live\server\src\modules\*`, `packages\shared-schemas`, `apps\*`, `services\*`, `workers\*` |
| ops | `E:\bee-live\ops\{prod,staging,pc}`, `docs\ops-runbook.md` |
| eplan (מחולל תוכניות) | סקיל `electrical-drawing-sets` (`generator\eplan-generator.zip`) → vendored ב-`services\cad\eplan` מ-M4 |
| ספריית בלוקים | סקיל `bee-block-library` (`blocks\`, `dynamic\`, `index.json`) → `workers\cad-windows\blocks` או `BEE_BLOCK_LIBRARY_DIR` |
| PWA סקר | `E:\bee-assets\apps\bee-solar-survey` → `apps\field` מ-M0 |
| מחולל דוחות שטח (לפורט ב-M5) | `E:\bee-build` ענף `merge/neri-phase1` — **קריאה בלבד** |

## 6. איך בוחרים ומבצעים חבילת עבודה

1. המשתמש נותן `WP-M<n>-<nn>` (או מבקש "מה הבא?" → להציע לפי מפרט 16 §13 לו"ז ו-§12 תלויות, ולאשר איתו).
2. לבדוק **תלויות**: חבילות קודמות ממוזגות? החלטה §17 נדרשת? פער V חוסם (מפרט 16 §15)? קלט §19 חסר? אם משהו חסר — להציע מה אפשר לעשות בלי זה (למשל seed `unverified`) ולבקש אישור.
3. לקרוא את סעיפי המפרט שהחבילה מפנה אליהם (ורק אותם).
4. להציג **תוכנית** לפני קוד: קבצים, טבלאות/migrations, endpoints, מסכים, טסטים, מה **לא** בהיקף, feature flag. לחכות לאישור.
5. לבצע בענף; טסטים קודם או יחד; `npm test`, `npm run build:schemas`, bundle budget; migration up/down על DB מקומי.
6. PR לפי מפרט 17 §C.4; לחכות ל-CI; `gh pr view --json state`.
7. לא להתחיל חבילה נוספת באותו סשן. אם נשאר זמן — לשפר טסטים/תיעוד של אותה חבילה.
8. כל דבר שלא ברור במפרט → **שאלה לברק/נרי**, לא ניחוש. לרשום ב-NEXT.

## 7. הגדרת סיום (DoD) לחבילה ולאבן דרך

**חבילה:** קוד + migrations + Zod + טסטים ירוקים ב-CI + `.env.example` מעודכן + תיעוד (runbook/dev-local אם תפעולי) + PR ממוזג + קריטריוני הקבלה של החבילה מסומנים ב-PR.

**אבן דרך (מפרט 16, לכל M):** כל החבילות ממוזגות → `deploy-staging.sh` ל-bee-lab עם flags דולקים → תרחיש "עובד מקצה לקצה" אמיתי (מוסווה) שברק מריץ → ברק חותם ("M<n> approved") → `deploy.sh` ל-prod עם flag כבוי/role-gated → canary 24–48 שעות → הדלקה. אתה לא מריץ deploy ל-prod בעצמך; אתה מכין את הפקודות ומבקש.

## 8. כללי קוד קצרים

- Hebrew-first: UI RTL, מסמכים עם Rubik ו-`<bdi>`, Excel `rightToLeft`. מזהים/קוד/קומיטים באנגלית.
- סכומים `numeric(14,2)` + decimal.js; מט"ח — לשמור מטבע ושער יום. אין float לכסף.
- `project_events` append-only; `projects.stage` הוא cache.
- pg-boss על אותו Postgres (schema `pgboss`); worker המנוע מאחורי `BEE_ENGINE_WORKERS`.
- feature flag לכל מודול חדש (`BEE_FEATURES`); כבוי כברירת מחדל ב-prod.
- migrations אחורה-תואמות (expand/contract).
- PII: אין בטסטים/fixtures; `pino` redact; לא לשלוח ת"ז/מסמכי זהות ל-LLM.
- אין prod DB מקומית; staging = bee-lab בלבד.
- Windows/Git Bash: קבצים עם backslashes/JSON/עברית דרך Write; פורטים 3011/3021; `JWT_SECRET` ≥ 32 (ראו מפרט 17 §D לרשימה המלאה).

## 9. פורמט תשובה

כל תשובה בעברית, מזהים באנגלית, ומסתיימת ב:

```
STATUS: מה מצב החבילה (WP-M<n>-<nn>): לא התחיל / בתכנון / בקוד / בטסטים / PR פתוח (#) / ממוזג. חסימות (החלטה §17, פער V, קלט §19).
RESULT: מה נעשה בפועל בסשן הזה — קבצים, טבלאות, endpoints, טסטים (מספרים), PR. מה אומת ומה לא.
NEXT:   הצעד הבא המדויק (פקודה/PR/שאלה), מי עושה (Barak/Neri/Claude Code), ומה צריך מברק.
```

- מספרים/ספים/תאריכים שאתה מציין בתשובה — עם מקור או "לאימות".
- הערכות זמן — תמיד "הערכה".
- אי-התאמה שגילית בחבילת התכנון — שורה בסוף התשובה תחת "אי-התאמות", ואם היא מהותית — להציע תיקון למפרט (לא לתקן את תוכנית האב בעצמך בלי אישור).
````

---

## הערות התקנה ובדיקה

1. ליצור `C:\Users\<user>\.claude\skills\bee-engine\` ולשמור את הבלוק כ-`SKILL.md` (Write tool; לא heredoc — יש backslashes בנתיבים).
2. לפתוח Claude Code ב-`E:\bee-live`, להקליד `/` ולוודא ש-`bee-engine` מופיע; לנסות: "השתמש ב-bee-engine. מה חבילת העבודה הבאה לפי מפרט 16?" — תשובה תקינה מסתיימת ב-STATUS/RESULT/NEXT ומפנה ל-WP-M0-01.
3. כש-`docs/engine-plan` קיים ב-bee-live (מפרט 17 §A.2) — לעדכן את `PLAN_DIR` ב-§0 של הסקיל (או להשאיר את שני הנתיבים כפי שכתוב).
4. הסקיל **לא** מחליף את `CLAUDE.md` של bee-live (מפרט 17 §C.1) — הם משלימים: CLAUDE.md = כללי קבע קצרים לכל סשן; הסקיל = הנחיות מלאות כשעובדים על המנוע.
5. לעדכן את ה-`description` ב-frontmatter אם משנים את השם או את ההיקף; הוא מה ש-Claude Code משתמש בו כדי להחליט מתי לטעון את הסקיל.
