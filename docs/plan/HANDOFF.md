# Handoff — B.E.E Engine: חבילת תכנון (bee-assets → ביצוע מהלוקאלי) — 2026-10-17

## 1) Goal
לתת לברק מנוע אחד שמנהל פרויקט PV/אגירה מליד ועד ניטור: מחולל הצעות מחיר, כתבי כמויות באקסל, תוכניות חשמל (DWG+PDF), הגשה לחח"י, רכש, התקנה, בודק, חיבור מונה, מסירה ו-O&M — כ-CRM מחזור-חיים שמתווסף לאפליקציה החיה (bee-live). הסשן הזה היה **תכנון בלבד** (בענן); הביצוע מתחיל מהלוקאלי על `E:\bee-live` לפי חבילת התכנון. החלטת ברק: "תבצע את כל התכנון, את השאר נבצע מהלוקאלי".

## 2) Current State
**מאומת (17.10):**
- ענף `claude/gracious-feynman-l8z1r0` במאגר `Barak-B/bee-assets`, PR טיוטה [#17](https://github.com/Barak-B/bee-assets/pull/17) מול `main`. 8 קומיטים, 31 קבצים, ~31,000 שורות, עץ עבודה נקי, HEAD `174116f`. ה-PR **לא ממוזג** (ברק מחליט מתי).
- `docs/plan/` מכיל: `README.md` (אינדקס וסדר קריאה), `00-master-plan.md` v0.3 (20 סעיפים), `01-lifecycle-stages.json` v0.3, `specs/10–18` (9 מפרטים, ~7,300 שורות כולל המחקר), `templates/` (10 קבצים), `rules/` (2), `schema/engine.sql` (DDL שנבדק על Postgres 16 בסשן הסוכן: 55 types, 70 tables, 13 triggers, 18 RLS policies), `research/01–07`.
- כל קבצי ה-JSON עוברים `json.load`; `design-job.schema.json` ו-`inspection-62446-record.schema.json` עברו `jsonschema.check_schema`; `schedule-templates.json` ו-`message-templates.json` עברו בדיקות עקביות (ids ייחודיים, תלויות, placeholders).
- מספרים רגולטוריים (אגרות, SLA, תעריפים, ספי בודק): **אף אחד לא מקודד כקבוע**; כולם ב-`rules-seed.json` / `submission-templates.json` עם רמת אימות (`unverified` 14 · `summary` 27 · `office` 56 · `validated` 0).
- סשן הענן עוקב אחרי PR #17 (subscribe); אין CI במאגר הזה.

**לא מאומת / ידוע כפער:**
- דוחות המחקר נכתבו כשה-proxy של סביבת הענן חסם את `iec.co.il`, `ieccontent.iec.co.il`, `iec-hamaagal.co.il`, `digitalorders.iec.co.il`, `gov.il`, `pua.gov.il`, `nevo.co.il`, `sii.org.il`, `he.wikisource.org`, אתרי יצרנים (solaredge, huawei, sungrow, goodwe, sma, enphase) ו-docs (readthedocs, aps.autodesk, opendesign); מכסת חיפושי הרשת נגמרה אחרי ~17–30 חיפושים לסוכן. התוצאה: 20 פערי אימות (`00-master-plan.md` §18, V1–V20).
- הקבצים מ-`L:\האחסון שלי\עבודה\לקוחות חברות ומכרזים\חכל שדרות\מנוע` **לא נקראו** (כונן מקומי, לא צורפו לשיחה).
- סכמת הטבלאות הקיימות ב-bee-live (`customers`, `sites`, integrations, alerts) לא הייתה נגישה (המאגר `BarakElectric/B.E.E` לא בהיקף הסשן) → כל מיפוי אליהן במפרטים 10/15 מסומן "לאימות"/"to be mapped locally".
- ה-DWG של NESPAH-543-05 לא נפתח (DWG בלבד, אין ezdxf/ODA בסביבה); 13 גופני SHX חסרים ב-eTransmit.

## 3) Active Files
מאגר: `Barak-B/bee-assets`, ענף `claude/gracious-feynman-l8z1r0`. נתיבים יחסית ל-`docs/plan/`:
- `README.md` — אינדקס, סדר קריאה, מוסכמות (S01–S12, snake_case profiles, R1–R24, V1–V20, WP-M<n>-<nn>, רמות אימות).
- `00-master-plan.md` — §0 תקציר · §1 מצאי · §2 עקרונות · §3 מחזור חיים · §4 ארכיטקטורה + §4.1 טבלת החלטות טכנולוגיה · §5 מודל נתונים · §6 CPQ · §7 מפת מסמכים · §8 eplan כשירות + צינור DWG · §9 חח"י ורגולציה · §10 ביצוע · §11 בדיקה/מונה/מסירה · §12 ניטור · §13 CRM · §14 AI · §15 אבטחה · §16 מפת דרכים M0–M7 · §17 החלטות פתוחות · §18 פערי אימות · §19 קלטים מברק · §20 החלטות איחוד I1–I20.
- `01-lifecycle-stages.json` — שלבים, סטטוסים, `profiles` (snake_case + `legacy_code`), `roles` (→ canonical), `sla_unit: business_days`, `customer_visible_label_he`.
- `specs/10-data-model.md` + `schema/engine.sql` — ישויות, enums, RLS, triggers (נעילת quote_version בשליחה, documents ללא מחיקה, events insert-only, Law #2 כ-CHECK על jobs).
- `specs/11-projects-workflow-spec.md` — XState v5 + `project_events` + outbox, fact registry לתנאי יציאה, pg-boss (18 queues), לו"זים/CPM, Google Calendar, שער אמון, intake, פורטל, 7 סוכני AI, הרשאות, דיווח בוקר v2.
- `specs/12-cpq-documents-spec.md` — Product kinds + `tech` schemas, מחירונים וייבוא, ערכות + `qty_expr` DSL, מנוע תמחור 14 צעדים, שורות רגולטוריות R7–R23, ROI, docgen, חתימה, Morning/Grow.
- `specs/13-submissions-regulation-spec.md` — track resolver, 7 סוגי Submission, step machine, pack builder, טופס 22-8-22, SLA, מנוע כללים, מחלק היסטורי, V1–V20 cross-ref.
- `specs/14-cad-design-service-spec.md` — `services/cad` (:3041), מיפוי ProjectSpec, 4 נתיבי גיאומטריה, פריסה מהירה (S03), pvlib+PVGIS, eplan מלא (S06), DWG worker (Windows, GstarCAD, placeholders `BEE_PH_*`), רינדור, בלוקים, שערי איכות.
- `specs/15-inspection-handover-monitoring-spec.md` — S08–S12, 62446-1, GridConnection, מסירה, MonitoringLink, `MonitoringAdapter` interface, מתזמן מכסות, KPI 61724-1, התראות, תחזוקה, מיגרציה מ-bee-live (184 אתרים, feature flags).
- `specs/16-execution-plan.md` — WP-M0..M7 (≈235 ימי פיתוח, הערכה), DoD, גרף תלויות, לוח שנה ~40 שבועות, kickoff יום-יום לשבועיים, "מה יכול להתחיל לפני סגירת V1–V20".
- `specs/17-local-setup.md` — תיקיות, env (שמות בלבד), פורטים (3011/3021 קיימים; 3031/3041/5433/9000 חדשים), compose services, Windows CAD worker, CLAUDE.md block, gotchas D.1–D.16.
- `specs/18-bee-engine-skill.md` — SKILL.md מוכן ל-`.claude/skills/bee-engine/`.
- `templates/` — `submission-templates.json` (6 מסלולים, 44 סוגי מסמכים, `iec_receipt_v1`), `schedule-templates.json` (248 פעילויות), `message-templates.json` (40), `boq-xlsx-layout.md`, `quote-pdf-sections.md`, `design-job.schema.json`, `inspection-62446-record.schema.json`, `handover-checklist.json` (50).
- `rules/rules-seed.json` (97 כללים), `rules/pricing-rules.json` (41 שדות `needs_owner_input`).
- `research/01–07` — חח"י, רגולציה, כלי PV, מסמכים/CPQ, CRM/workflow, ניטור/O&M, CAD/DXF.
- מחוץ למאגר (קלט לסשן, לא מחויב): `handoff.md` של bee-live (23.09), `HANDOFF.md` של ספריית הבלוקים, `electrical-drawing-sets.zip` (סקיל + `eplan-generator.zip`), `NESPAH-543-05-…-STANDARD.zip`, קבלת חח"י 28.09.26 (704.22 ₪, הצעת חשבון 52181659, אסמכתא 0403063).

## 4) Changes Log
- **06.10** — קריאת כל החומר; 7 סוכני מחקר במקביל; `00-master-plan.md` v0.1 → v0.2 (שילוב הדוחות); `01-lifecycle-stages.json`; PR #17 נפתח כטיוטה + subscribe. קומיטים `76fd166`, `a610958`, `5a6812a`.
- **10.10** — 7 סוכני כתיבת מפרטים במקביל (10–18 + templates + rules + DDL); סבב איחוד: יישור שמות קבצים במפרט 16/17 (נכתבו עם שמות משוערים), `01-lifecycle-stages.json` v0.3 (profiles snake_case + legacy, roles → canonical, business days, תוויות ללקוח), `00-master-plan.md` v0.3 (§20 החלטות איחוד I1–I20, Submission kinds הורחבו ל-7, נספחים), `README.md`. קומיטים `8d05980` … `174116f`. PR body עודכן.
- **17.10** — handoff זה.
- **זיכרון/סקילים**: לא נכתב זיכרון בסשן הענן. הסקיל `bee-engine` קיים כטיוטה ב-`specs/18` בלבד (לא מותקן).

## 5) Failed Attempts
- `add_repo`/`list_repos` ל-`BarakElectric/B.E.E` (bee-live): המאגר לא זמין להיקף הסשן (רק `Barak-B/bee-assets`) → מיפוי לטבלאות הקיימות נשאר "לאימות".
- WebFetch/curl לאתרי חח"י, gov.il, nevo, SII, יצרנים, readthedocs: `403 CONNECT` מה-proxy (`EGRESS_BLOCKED`) → הסוכנים עבדו מתקצירי חיפוש + קוד קהילתי (Home Assistant, pysolarcloud, py-iec-api) + מסמכי המשרד. תיקון: Allowed domains בהגדרות הסביבה (ראו Next Steps 2).
- מכסת WebSearch (200 לסשן, משותפת) נגמרה באמצע המחקר → נושאים שלא נסקרו: פורומים/סיבות כישלון בבדיקת חח"י, מסלול ירוק 2025, ספי בודק 1/2/3, Google Solar API כיסוי ישראל, מחירי Meta/SMS.
- שלב המפרטים נקטע פעם אחת ע"י ברק ("מה קורה?") לפני שהסוכנים יצאו — הופעל מחדש; בינתיים ה-stop hook דרש commit על כל עצירה → 5 קומיטי WIP חלקיים בענף (לא מזיק; אפשר לסחוט ב-merge).
- סוכני המפרטים כתבו במקביל ולכן: מפרט 16/17 הפנו ל-`11-state-machine-jobs.md`, `13-documents-docgen.md`, `14-submissions-iec.md`, `15-cad-service.md` (לא קיימים) → יושר בסבב האיחוד; נותרו אי-עקביות enums בין מפרט 10 (DDL) ל-15 (`sharing_status`, `defects.status`, `service_tickets.status`) ול-14 (`designs.mode`, `rules.key`) — מתועד ב-§20 (I16, I17), לתקן ב-WP-M0.
- הסוכן של מפרט 10 הריץ Postgres 16 זמני בסקראצ'פד כדי לבדוק את ה-DDL; תפס ותיקן 2 באגים (`LIKE` על enum; רקורסיה ב-`can_read_project()` → `SECURITY DEFINER`). הסביבה הזו נמחקת עם הסשן — להריץ שוב מקומית.
- `pip install ezdxf` לא בוצע ו-DWG לא נפתח בסביבה (אין ODA/libredwg) → NESPAH לא נותח; מפרט 14 מתאר את הנתיב (worker ממיר DWG→DXF).

## 6) Next Steps
1. **ברק — הכרעות לפני יום 2 של ה-kickoff** (מפרט 16 §14; `00-master-plan.md` §17 + §20): I6 הרחבת `customers`/`sites` הקיימים (מומלץ) מול טבלאות `engine_*`; I11 הארקת קונסטרוקציה 10 מול 16 מ"מ²; I19 חריג OTP/magic-link בשער האמון; §17: סדר M3 לפני M4 (מומלץ), Meta WhatsApp Cloud API ללקוחות, GstarCAD worker (מי מחזיק רישיון), Morning להנה"ח, Monday תאריך הפסקה, מחירונים ראשונים, reviewer של rules.
2. **סביבת ענן (אם ירצה סבב אימות)**: להוסיף ל-Allowed domains: `iec.co.il`, `ieccontent.iec.co.il`, `iec-hamaagal.co.il`, `digitalorders.iec.co.il`, `gov.il`, `pua.gov.il`, `nevo.co.il`, `sii.org.il`, `he.wikisource.org`, `solaredge.com`, `huawei.com`, `isolarcloud.com`, `readthedocs.io`, `aps.autodesk.com` — ואז להריץ סוכן על ה-URL-ים בסעיפי "מקורות" של `research/01`, `02`, `06`, `07` לסגירת V1–V20. לחלופין לאמת מהלוקאלי בדפדפן.
3. **קלטים מברק** (§19): 2–3 הצעות מחיר קיימות + כתב כמויות באקסל (לכיול `boq-xlsx-layout.md` ו-`quote-pdf-sections.md`), מחירוני ספקים, תיק הגשה אחד שהוגש לחח"י (כולל תשובת מחלק וקבלות), דוח בודק אחד, חוזה התקנה (Word), צילומי מסך של digitalorders/פורטל יצרנים, והקבצים מ-`L:\…\חכל שדרות\מנוע`.
4. **מעבר ללוקאלי** (מפרט 17): `robocopy` של `docs\plan` → `E:\bee-live\docs\engine-plan`; `specs\18-bee-engine-skill.md` → `C:\Users\<user>\.claude\skills\bee-engine\SKILL.md`; להדביק את בלוק ה-CLAUDE.md ממפרט 17 §C.1 ל-`E:\bee-live\CLAUDE.md`; לוודא שסקילי `electrical-drawing-sets` ו-`bee-block-library` מותקנים; eplan ל-`services/cad/eplan`.
5. **M0 (יסודות)** לפי מפרט 16 §3 + §14: WP-M0-01 מבנה מונורפו/pnpm; WP-M0-02 להריץ `schema/engine.sql` על Postgres מקומי ולהשוות לטבלאות bee-live הקיימות (I6); seed מ-`01-lifecycle-stages.json`, `rules-seed.json`, `submission-templates.json`, `schedule-templates.json`; תיקון enums (I16/I17); חיבור PWA הסקר ל-Project; ייבוא Monday. יעד: ליד → סקר מקושר על `bee-lab`.
6. **מסלול מקביל שלא לשכוח**: SolarEdge V2 (handoff של bee-live, דדליין **01–03.11.2026**) — מפרט 15 §f מכיל את ה-endpoints/429 שאומתו מקוד קהילתי להשוואה מול השדות `GUESSED` באדפטר; Hermes bridge עדיין מנותק (התראות ודיווח בוקר לא נשלחים).
7. **PR #17**: למזג ל-`main` כשברק מאשר (אפשר squash); אחרי המיזוג כל עבודה חדשה על bee-assets = ענף חדש מ-`main`.
