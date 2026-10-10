# B.E.E Engine — חבילת התכנון

מנוע אחד לניהול פרויקט PV/אגירה מליד ועד ניטור: הצעות מחיר, כתבי כמויות באקסל, תוכניות חשמל (DWG/PDF), הגשה לחח"י, ביצוע, בדיקה, מונה, מסירה ו-O&M. **תכנון בלבד** — הביצוע מתחיל מהלוקאלי לפי `specs/16-execution-plan.md` ו-`specs/17-local-setup.md`.

## סדר קריאה

| # | קובץ | מה זה | למי |
|---|---|---|---|
| 0 | `00-master-plan.md` | תוכנית האב: מצאי, עקרונות, 12 שלבים, ארכיטקטורה והחלטות טכנולוגיה, מודל נתונים, CPQ, מסמכים, eplan, חח"י, ביצוע, מסירה, ניטור, AI, מפת דרכים M0–M7, החלטות פתוחות (§17), פערי אימות V1–V20 (§18), קלטים נדרשים (§19) | כולם — להתחיל כאן |
| 1 | `01-lifecycle-stages.json` | מכונת המצבים כנתונים (v0.3): שלבים S01–S12, סטטוסים, פרופילי אסדרה (snake_case + legacy), תפקידים, תוויות ללקוח | מפתחים |
| 10 | `specs/10-data-model.md` + `schema/engine.sql` | ישויות, enums, RLS, triggers, DDL (נבדק על Postgres 16) | Neri |
| 11 | `specs/11-projects-workflow-spec.md` | XState, אירועים, משימות/SLA, pg-boss, לו"זים/CPM, יומן, תקשורת ושער אמון, פורטל, סוכני AI, הרשאות, דיווח בוקר | Neri / Claude Code |
| 12 | `specs/12-cpq-documents-spec.md` | קטלוג, מחירונים, ערכות, תמחור, שורות רגולטוריות, ROI, docgen, חתימה, הנה"ח | ברק + Neri |
| 13 | `specs/13-submissions-regulation-spec.md` | פרופילי אסדרה, Submission steps, חבילות, SLA, מנוע כללים, מחלק היסטורי | ברק |
| 14 | `specs/14-cad-design-service-spec.md` | services/cad: spec אוטומטי, גיאומטריה, פריסה, תפוקה, eplan, DWG worker, רינדור, שערי איכות | ברק + Claude Code |
| 15 | `specs/15-inspection-handover-monitoring-spec.md` | ביצוע, בודק 62446-1, חיבור מונה, מסירה, MonitoringLink, אדפטרים, KPI, תחזוקה, מיגרציה | Neri |
| 16 | `specs/16-execution-plan.md` | חבילות עבודה WP-M0..M7 עם קריטריוני קבלה, הערכות, לוח שנה, kickoff של שבועיים | ברק + Neri |
| 17 | `specs/17-local-setup.md` | עבודה מהלוקאלי: תיקיות, env, compose, Windows CAD worker, Claude Code, gotchas | כולם |
| 18 | `specs/18-bee-engine-skill.md` | SKILL.md מוכן להעתקה ל-`.claude/skills/bee-engine/` | Claude Code |

## נתונים מוכנים ל-seed

| קובץ | תוכן |
|---|---|
| `rules/rules-seed.json` | 97 כללים: R1–R24, 22 כללי משרד, 18 מגבלות eplan, כללי תהליך חח"י — כל אחד עם מקור, רמת אימות ומקרה בדיקה |
| `rules/pricing-rules.json` | PricingRule / DiscountSchedule / ApprovalThreshold / פרמטרי ROI — ערכים `null` + `needs_owner_input` |
| `templates/submission-templates.json` | צעדי הגשה ל-6 פרופילים, 44 סוגי מסמכים, פורטלים, פרמטרי SLA, סכימת קליטת קבלה |
| `templates/schedule-templates.json` | תבניות לו"ז (248 פעילויות) בימי עבודה עם תלויות ומשאבים |
| `templates/message-templates.json` | 40 תבניות WhatsApp/SMS/מייל לפי שלב, `requires_human_pick` |
| `templates/boq-xlsx-layout.md` | מבנה כתב הכמויות (גיליונות, עמודות, נוסחאות, named ranges, 2 תצוגות) |
| `templates/quote-pdf-sections.md` | הצעת המחיר עמוד-עמוד + JSON Schema של DocumentModel |
| `templates/design-job.schema.json` | חוזה job לשירות ה-CAD (quick/full/render/bom/yield/geometry/dwg.bind) + גיאומטריית גג |
| `templates/inspection-62446-record.schema.json` | רשומת בדיקה IEC 62446-1 (קטגוריה 1 + 2) וליקויים |
| `templates/handover-checklist.json` | 50 פריטי commissioning / מסירה / הזרעת ניטור |

## מחקר

`research/01..07-*.md` — חח"י, רגולציה/תעריפים, כלי תכנון PV, מסמכים/CPQ, CRM/workflow, ניטור/O&M, CAD/DXF. **סייג:** נכתבו בסביבה שחסמה את אתרי חח"י/gov.il/יצרנים; כל טענה מסומנת לפי רמת אימות.

## מוסכמות

- שלבים `S01–S12`; סטטוסים לפי `01-lifecycle-stages.json`; פרופילי אסדרה snake_case (`residential_le15`…); כללים `R1–R24` (+ `R25` מוצע); פערי אימות `V1–V20`; חבילות עבודה `WP-M<n>-<nn>`.
- רמות אימות לכלל: `unverified` → `summary` → `office` → `validated`. קוד מייצר חסימה רק מכלל `validated`/`office`; `unverified` מייצר אזהרה/שורה מסומנת "לאימות".
- שער אמון: אין שליחה ללקוח/ספק בלי בחירה אנושית (`requiresHumanPick`).
- אי-עקביות ידועות בין המסמכים מרוכזות ב-`00-master-plan.md` §20.
