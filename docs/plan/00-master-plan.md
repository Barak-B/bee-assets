# B.E.E Engine — תוכנית אב

**מחולל הצעות מחיר, כתבי כמויות, תוכניות חשמל, הגשה לחח"י ו-CRM מחזור-חיים למתקני PV ואגירה**

| | |
|---|---|
| גרסה | 0.2 — טיוטת תכנון אחרי סבב מחקר (2026-10-06) |
| מזמין | ברק (B.E.E — ברק הנדסת חשמל) |
| מטרה | תכנון בלבד. אחרי אישור התוכנית עוברים שלב-שלב וכלי-כלי עד אינטגרציה מלאה |
| מקורות | handoff.md (bee-live / bee-build), HANDOFF.md (ספריית בלוקים), סקיל `electrical-drawing-sets` + מחולל `eplan`, `apps/bee-solar-survey`, `platform/schema`, קבלה חח"י (28.09.26), סט NESPAH-543-05, ושבעה דוחות מחקר ב-`docs/plan/research/` |
| סייג מחקר | סביבת הענן חסמה גישה ישירה לאתרי חח"י, gov.il, nevo, מכון התקנים ורוב אתרי היצרנים; הדוחות נשענים על תקצירי חיפוש, קוד קהילתי שנשכפל (Home Assistant וכד'), ומסמכי המשרד. כל טענה מסומנת לפי רמת אימות, ו-§18 מרכז את מה שחייב אימות אנושי לפני קידוד |

---

## 0. תקציר מנהלים

יש לנו היום חמישה נכסים נפרדים שכל אחד פותר חלק מהבעיה: אפליקציית ניטור חיה עם 184 לקוחות, מחולל דוחות שטח, PWA לסקר אתר, מחולל תוכניות חשמל בפייתון (חישוב + ולידציה + גיליונות + כתב כמויות) וספריית בלוקים ל-CAD. אין ביניהם רצף: הלקוח לא "זורם" מליד להצעה, לתוכנית, להגשה, להתקנה ולניטור. כל מעבר נעשה ידנית, והמידע מועתק בין קבצים.

התוכנית מגדירה **מנוע אחד** ("B.E.E Engine") שבמרכזו **רשומת פרויקט אחת** שעוברת מכונת מצבים של 12 שלבים, ומסביבה **מחוללים** שמייצרים מאותה רשומה את כל המסמכים: הצעת מחיר, כתב כמויות באקסל, הסכם, חבילת הגשה לחח"י, סט תוכניות (DWG+PDF), תיק מתקן, ואז מעבירים את האתר לניטור ותחזוקה. ה-CRM איננו מוצר נפרד אלא **התצוגה** של אותה רשומה: סטטוסים, משימות, לו"זים ותקשורת, לכל הלקוחות ולכל הפרויקטים בביצוע.

**מסקנות המחקר שמעצבות את התוכנית:**

1. **בונים, לא מאמצים.** אין CRM פתוח (Twenty, EspoCRM, Odoo, ERPNext) או פלטפורמת PV מסחרית (OpenSolar, Aurora, HelioScope, Solargraf) שמכסה מחזור חיים ישראלי עם עברית, חח"י ואסדרות; כולם היו דורשים את אותה התאמה שנכתוב ממילא על Fastify+Postgres. שואלים מהם את מבנה השלבים (OpenSolar: Milestones→Stages→Actions) ואת אוצר פעולות ה-workflow (Twenty).
2. **לחח"י אין API.** ההגשה היא דרך `digitalorders.iec.co.il` (הזמנת חיבור/הגדלה/בדיקת מתקן, העלאת קבצים, תשלום, סטטוס), "פורטל יצרנים" (רישום לאסדרה) ואתר המעגל (בדיקות מתקן). המנוע מכין חבילות PDF ועוקב; אדם מגיש. מינהל החשמל מקבל PDF בלבד.
3. **תכנון PV: לבנות פריסת גג משלנו, לשלב pvlib+PVGIS לתפוקה.** אין API שמחזיר פריסת מודולים כ-JSON/DXF במחיר סביר לישראל. SolarEdge Designer / Huawei SmartDesign משמשים לאימות ידני.
4. **DWG אמיתי עם בלוקים דינמיים דורש CAD אמיתי.** ezdxf לא כותב DWG ולא יוצר בלוקים דינמיים; LibreDWG לא כותב R2018; ODA converter אסור לשימוש מסחרי בלי חברות ($3,000/שנה). ההמלצה: worker Windows עם GstarCAD (יש רישיון במשרד/אצל הקונסטרוקטור) שממיר DXF→DWG 2018, מחליף placeholder-ים בבלוקים דינמיים ומדפיס לפי CTB. חלופה: לשטח את 152 הבלוקים הדינמיים לווריאנטים סטטיים.
5. **מסמכים:** Postgres הוא מקור האמת; Excel ו-PDF הם ייצוא בלבד. ExcelJS לכתבי כמויות (RTL, נוסחאות חיות), Chromium (Puppeteer) ל-PDF בעברית (היחיד עם bidi מלא בחינם), docxtemplater+LibreOffice רק כשנדרש Word, pypdf למיזוג סטים.
6. **ניטור:** SolarEdge V2 אומת מקוד קהילתי (base `/v2`, `X-API-Key`, endpoints, 429 חודשי מול דקתי); Huawei/Sungrow/Solis/Growatt/Solarman/Enphase רשמיים; GoodWe/SAJ/Tigo-app הפוכים-הנדסית; ל-KStar (ברשימת ההעדפות שלנו) לא נמצא API ענן → Modbus/logger. "not in account list" ב-Sungrow = כנראה אתר לא שותף לחשבון המתקין → משימת CRM במסירה, לא שגיאת API.
7. **תזמון/workflow:** XState v5 + טבלת `project_events` (append-only) + pg-boss על Postgres (בלי Redis/Temporal). n8n נשאר בקצוות (webhooks).
8. **תקשורת:** WhatsApp Business Cloud API (Meta) לכל הודעה יוצאת ללקוח; Hermes/Baileys רק לנוחות פנימית/נכנס (סיכון חסימה ו-supply-chain). SMS: InforU/019.
9. **חתימה:** שלב א' click-to-accept עם OTP, חתימה מצוירת, sha256 של ה-PDF ו-audit trail (מספיק לפי חוק חתימה אלקטרונית להצעה/הסכם רגיל, לאימות עם עו"ד); שלב ב' Documenso (self-host, PAdES) או ספק מאושר לחוזים גדולים.
10. **רגולציה כנתונים:** 24 כללים (R1–R24) מדוח 02 + 22 כללי המשרד + כללי eplan נכנסים לטבלת `rules` עם מקור, סף, תוצאה, תאריך ורמת אימות; המנוע חוסם במקום לנחש.

הבנייה מתוכננת ב-8 אבני דרך (M0–M7); כל אבן דרך מוסיפה כלי אחד שעובד מקצה לקצה ומשתלב בקודמים (§16).

---

## 1. מה יש לנו היום (מצאי)

| נכס | היכן | מצב | מה נלקח ממנו למנוע |
|---|---|---|---|
| **bee-live** (B.E.E prod) | `E:\bee-live` → `BarakElectric/B.E.E`, שרת bee-prod-1, `app.barak-electric.com` | חי. Fastify + Postgres + Vite, Docker + Caddy + Cloudflare. 184 לקוחות, אדפטרים SolarEdge V1 (+circuit 503) ו-V2 (ledger, שדות `GUESSED`), Sungrow, התראות, canary, staging, deploy/rollback, דיווח בוקר | הבסיס של המנוע. טבלאות לקוחות/אתרים/התראות, מערך ops, אינטגרציות ניטור. המנוע **מתווסף** אליו כמודולים, לא מחליף אותו |
| **bee-build** (קו ישן, SQLite) | `E:\bee-build` ענף `merge/neri-phase1` | מחולל דוחות שטח: DSL תבניות (9 בלוקים), 7 תבניות, עורך מובייל, autosave/אופליין/חתימה/מצלמה, PDF ממותג Rubik, 25/25 E2E. **לא בקו החי** | שכבת "דוחות שטח" (ביצוע יומי, סיור, ליקויים, בודק, מסירה, תחזוקה). הפורט (M3 ב-handoff) נבלע ב-M5 כאן |
| **bee-solar-survey** | `apps/bee-solar-survey` במאגר זה | PWA RTL, IndexedDB, תמונות, GPS, PDF, ייצוא jobs לכוורת. לא מחובר ל-CRM (`customer.id=[OPEN]`) | שלב S02. הסכמה (`SiteSurveyProject`, `DesignSuiteSitePayload`, `electricalIntake`) = בסיס ל-`Survey` |
| **eplan** (מחולל תוכניות) | `electrical-drawing-sets/generator/eplan-generator.zip` (113 קבצים, Python ≥3.11; pydantic, ezdxf, matplotlib, openpyxl, python-bidi) | מנוע חישוב (מחרוזות/כבלים/הגנות) עם ולידטורים בלתי-תלויים, מסד כללים עם מקורות (seed → VALIDATED), גיליונות E-00…E-08 ב-DXF→PDF/PNG, BOM מהגיאומטריה, BESS, אורקסטרטור, בדיקות | שלב S06. רץ כ**שירות/worker**: YAML מופק מ-Project+Survey+Catalog; תוצרים נשמרים כ-Documents; ה-BOM מזין את כתב הכמויות |
| **electrical-drawing-sets** (סקיל) | אותו zip, `SKILL.md` + 8 references | שיטת העבודה, כללי תכנון עם מקורות (מינהל החשמל 24/01/2022 §7/§8/§11/§17/§19/§23–25, אמות מידה 35כ2/35כ3, הארקות 1991), תקן שרטוט, גיליונות, 22 כללי משרד, מפרט YAML | "ספר הכללים". הופך לטבלת `rules` |
| **ספריית בלוקים** | `bee-block-library` (סקיל) | 186 בלוקים DXF/DWG/PNG + 155 variants + 152 בלוקים דינמיים (33 ממתינים לבדיקה ב-AutoCAD), index.json, CATALOG.md | סמלי חד-קו וחזיתות לוחות (T4P); קטלוג ארונות לתמחור. **הגבלה:** ezdxf שומר אבל לא יוצר/משנה בלוקים דינמיים (§8) |
| **platform/schema** | `platform/schema/{job.schema.json,loops.json}` | מודל הכוורת: jobs (collect/edit/dispatch), Trust Gate, Law #1/#2, loops | מודל ה-jobs/ledger ושער האמון. כל פעולה אוטונומית = job |
| **תקשורת** | Hermes bridge (:3000), Alfred, n8n (`n8n_reader`), Monday | Hermes מנותק; Monday שימש CRM | n8n בקצוות; Hermes לנכנס/פנימי בלבד; Monday → ייבוא חד-פעמי |
| **Google Workspace** | Gmail, Calendar, Drive (MCP) | פעיל | מייל, יומן התקנות/בדיקות/חח"י (סנכרון דו-כיווני), Drive כמראה חד-כיוונית |
| **דוגמאות שטח** | NESPAH-543-05 (GstarCAD 2027, "תנוחה ורומים", SHX עבריים, CTB), קבלה חח"י 28.09.26 (704.22 ₪, הצעת חשבון 52181659, אסמכתא 0403063) | — | קלט קונסטרוקטור (DWG) ותשלום בתהליך חח"י שהמנוע חייב לקלוט ולקשר לפרויקט |

**הפערים שהמנוע סוגר:** קטלוג מוצרים ומחירונים, מנוע תמחור והצעות, כתבי כמויות באקסל, ניהול מצב פרויקט ולו"זים חוצי-פרויקטים, מעקב הגשה לחח"י, רכש, חיבור סקר→תכנון→הצעה, מסירה שמזינה את הניטור, פורטל לקוח, חוזים/חתימה, חשבוניות.

---

## 2. עקרונות המנוע

1. **מקור אמת אחד.** כל מסמך, גיליון, שורה וסכום נגזרים מרשומת ה-Project (וממנה: Survey, Design, Catalog, Rules). Excel/PDF/DWG הם ייצוא; שינוי = שינוי ברשומה והפקה מחדש.
2. **המודל מציע, הקוד אוכף** (כמו ב-eplan). AI ומשתמשים מציעים; ולידטורים ומכונת המצבים קובעים. כלל חסר = חסימה (`HUMAN_INPUT_REQUIRED`), לא ניחוש.
3. **כל מספר עם מקור ורמת אימות.** מחיר (מחירון+תאריך+hash קובץ), כלל (תקנה/סעיף/תאריך/`verified_by`), נתון טכני (דף נתונים/עמוד), החלטת מהנדס ("בעלים", תאריך, סיבה).
4. **שער אמון.** Law #1: אין שליחה ללקוח/ספק אוטומטית. Law #2: `requiresHumanPick: true` על כל outbound. ברמת ה-SDK: כלי כתיבה מסומנים `requiresUserInteraction` ועוברים תמיד דרך אישור.
5. **גרסאות בלתי-ניתנות לשינוי.** הצעה שנשלחה, חוזה שנחתם, סט שהוגש — snapshot עם sha256 ונעילה ב-DB (trigger). שינוי = גרסה חדשה או פקודת שינוי.
6. **עברית RTL קודם.** תבניות, אקסל (`rightToLeft`), PDF (Chromium, Rubik, `<bdi>`), UI; כללי ה-bidi של הסקיל חלים על מסמכים.
7. **שטח אופליין.** סקר, דוחות ביצוע ובדיקה עובדים בלי רשת ומסתנכרנים.
8. **מתווספים לקו החי.** מודולים בתוך B.E.E (Fastify/Postgres), אותו ops (deploy/rollback/staging/canary).
9. **פרטיות מתוכננת.** חשבונות חשמל, ת"ז וכתובות = מידע רגיש; רמת אבטחה בינונית לפי תקנות 2017 + תיקון 13 (§15).

---

## 3. מחזור חיים של פרויקט — מכונת מצבים

(הגדרה פורמלית: `01-lifecycle-stages.json`.) כל פרויקט בשלב אחד ובתוכו סטטוס. מעבר שלב רק כשתנאי היציאה מתקיימים; `blocked` תמיד עם סיבה ובעלים.

| # | שלב | תנאי כניסה | מה קורה (כלים) | תוצרים | תנאי יציאה | בעלים | SLA יעד |
|---|---|---|---|---|---|---|---|
| S01 | **ליד** | פנייה (WhatsApp/טלפון/מייל/טופס) | intake → Customer+Site+Project; סיווג; בקשת חשבון חשמל אחרון (מס' חוזה, גודל חיבור, צריכה) | כרטיס לקוח, הערכת kWp | פרטי קשר + כתובת + סוג + **פרופיל אסדרה משוער** | מכירות/ברק | ≤ 1 י"ע |
| S02 | **סקר אתר** | ליד מאושר | PWA סקר מקושר ל-Project; תמונות, GPS, לוח, מונה, גג, תוואי | Survey + PDF | completeness ready / חריגה מאושרת | סוקר | ≤ 7 ימים |
| S03 | **תכנון ראשוני + הצעה** | סקר מוכן | פריסת גג על אורתופוטו (§8.2), מחרוזות (eplan מצב מהיר), תפוקה (pvlib/PVGIS), תמחור מערכות → QuoteVersion; XLSX; PDF; ROI | הצעה PDF, כתב כמויות XLSX | הצעה נשלחה (דרך שער האמון) | ברק | ≤ 3 ימים |
| S04 | **מו"מ / חוזה** | הצעה אצל הלקוח | follow-up, רוויזיות, חוזה, חתימה (OTP+audit), מקדמה (קישור תשלום), חשבונית (Morning) | חוזה חתום, קבלה | חוזה + מקדמה | ברק | תזכורת כל 3 ימים |
| S05 | **הגשה מקדימה לחח"י** | חוזה | "בקשת שילוב מתקן ייצור PV" (טופס 22-8-22) / תיק יצרן; תשלום הצעת חשבון (~704 ₪ ביתי); תשובת מחלק; מעקב SLA | תיק הגשה, קבלה, תשובת מחלק | תשובת מחלק חיובית (או לא נדרש) | מנהל פרויקט | אמות מידה (7/14/30 י"ע, לאימות) |
| S06 | **תכנון מפורט** | חוזה (+ תשובת מחלק כשנדרש) | spec YAML → eplan → E-00…E-08 + BOM; קונסטרוקטור; DWG; סבב STATUS/RESULT/NEXT; "בעלים" | סט rev, BOM, verify | סט אושר, verify ריק | ברק | ≤ 10 ימים |
| S07 | **רכש** | סט מאושר | BOM → PO לפי ספק, lead time, משלוחים | PO | פריטים קריטיים הגיעו/מתוזמנים | רכש | — |
| S08 | **התקנה** | רכש + S05 | Gantt חוצה-פרויקטים, יומן, דוחות יומיים, צ'קליסטים, תמונות, פקודות שינוי | יומן ביצוע, as-made deltas | צ'קליסט הושלם | מנהל עבודה | לפי לו"ז |
| S09 | **בדיקת בודק** | התקנה | בודק (סוג לפי Rule R17), דוח IEC 62446-1 קטגוריה 1 (+2 כשנדרש), הצהרות מתקין/מתכנן, ליקויים→משימות | דוח בודק חתום | 0 ליקויים פתוחים | ברק/בודק | ≤ 7 ימים |
| S10 | **חיבור מונה חח"י** | דוח בודק | הזמנת "בדיקת מתקן PV" ב-digitalorders + חבילת מסמכים + תשלום; בדיקת חח"י (7 י"ע מהתשלום); מונה דו-כיווני/ייצור; אישור הפעלה; **רישום לאסדרה בפורטל יצרנים**; היתר הפעלה מרשות החשמל (04/2026, סף לאימות) | אישור חיבור, מס' מונה, חוזה יצרן | מונה + אישור הפעלה + רישום אסדרה | מנהל פרויקט | 30 י"ע מהתשלום (לאימות) |
| S11 | **הפעלה ומסירה** | מחובר | commissioning, תיק מתקן, אחריות, חשבון סופי, הדרכה; **MonitoringLink** (ספק, site id, שיתוף/credential, סריאלים, מפת מחרוזות, baseline Voc/Isc/Riso, תפוקה צפויה) | תיק מתקן, חשבונית סופית | לקוח חתם; אתר מסנכרן בניטור | ברק | ≤ 14 ימים |
| S12 | **ניטור ותחזוקה** | מסירה | bee-live, חוזה תחזוקה, בדיקות תקופתיות, התראות→קריאות→שיבוץ→דוח | דוחות, קריאות | — | שירות | לפי חוזה |

הערות:

- **פרופיל אסדרה** (`regulatory_track`): `residential_le15` · `commercial_15_100` · `commercial_100_630` · `mv_gt630` · `bess_add` · `historic_distributor`. נקבע ב-S01/S03, מאומת ב-S05, וקובע: צעדי Submission, מסמכים, אגרות, סוג בודק, מניה, שורות הצעה ו-ROI.
- **מחלק היסטורי** (קיבוץ/מושב): הבקשה למחלק ולא לחח"י, שני סקרים (פנימי + חח"י), מונה/תעריף מול המחלק → שדה `distributor` + checklist ו-SLA נפרדים.
- **מסלולים מקבילים**: S05 ‖ S06. חזרה לאחור (S09→S08 על ליקויים) מתועדת כ-rollback event.
- **סטטוסים** אחידים: `open · in_progress · waiting_customer · waiting_iec · waiting_supplier · waiting_engineer · blocked · done`. "ממתין ל-X" מזין את רשימת "תקועים" בדיווח הבוקר.
- **הכוורת**: כל מעבר אוטומטי = job בלדג'ר לפי `job.schema.json`; outbound ללקוח תמיד `requiresHumanPick: true`.

---

## 4. ארכיטקטורה

```
┌──────────────────────────── לקוחות / שטח ────────────────────────────┐
│ Web (React RTL)  │ PWA שטח (סקר, דוחות)  │ פורטל לקוח (magic link) │ WhatsApp/Email/SMS │
└───────┬──────────┴──────────┬─────────────┴──────────┬───────────────┴───────┬───────────┘
        │                     │                        │                       │
┌───────▼─────────────────────▼────────────────────────▼───────────────────────▼───────┐
│                     Core API — Fastify (bee-live)  ·  Postgres (RLS)                  │
│  modules/: crm · projects (XState v5 + project_events) · catalog · pricing · quotes · │
│            documents · submissions (IEC) · procurement · scheduling (CPM, business    │
│            calendar) · inspections · handover · monitoring (קיים) · comms (trust gate)│
│            · rules · jobs ledger (hive)                                               │
└───────┬───────────────┬────────────────┬──────────────┬───────────────┬──────────────┘
        │               │                │              │               │
┌───────▼──────┐ ┌──────▼───────┐ ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────────┐
│ DocGen svc   │ │ CAD svc      │ │ pg-boss     │ │ AI agents  │ │ Integrations    │
│ (Node)       │ │ (Python)     │ │ jobs, cron, │ │ Claude     │ │ SolarEdge V2/   │
│ ExcelJS,     │ │ eplan calc + │ │ RRULE, SLA, │ │ Agent SDK  │ │ Huawei/Sungrow/ │
│ Chromium PDF,│ │ validators,  │ │ retries,DLQ │ │ + MCP in-  │ │ …; Gmail/Cal/   │
│ docxtemplater│ │ ezdxf DXF →  │ │             │ │ process;   │ │ Drive; Meta WA  │
│ + LibreOffice│ │ PDF/PNG/SVG; │ │             │ │ write tools│ │ Cloud API; SMS; │
│ pypdf merge  │ │ pvlib+PVGIS; │ │             │ │ gated      │ │ Morning; Grow/  │
│              │ │ roof layout  │ │             │ │            │ │ Cardcom; n8n    │
└──────────────┘ └──────┬───────┘ └─────────────┘ └────────────┘ └─────────────────┘
                        │ DXF + job
               ┌────────▼─────────┐
               │ CAD Windows      │  GstarCAD/AutoCAD worker: INSERT dynamic blocks,
               │ worker (office   │  AUDIT/PURGE, SAVEAS DWG 2018, PLOT (CTB) → PDF
               │ PC, pull queue)  │
               └──────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Cloudflare R2 (מסמכים, תמונות, DXF/DWG/PDF; versioning + sha256) · Postgres ·        │
│ WAL-G PITR → Backblaze B2 · GlitchTip · Uptime Kuma                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 החלטות טכנולוגיה (סיכום מהדוחות)

| תחום | החלטה | חלופות שנדחו ולמה | דוח |
|---|---|---|---|
| מצב פרויקט | XState v5 (states/guards) + `project_events` append-only כמקור אמת; `projects.state` cache | Temporal (כבד: Postgres+ES+UI), Inngest (SSPL), Trigger.dev | 05 |
| תורים/תזמון | pg-boss (MIT, Postgres, cron+RRULE, retries, DLQ, enqueue טרנזקציוני) | BullMQ (Redis), n8n כבעל מצב | 05 |
| אוטומציה בקצוות | n8n self-hosted ל-webhooks (Meta WA, Gmail) → API שלנו | — | 05 |
| אימות/הרשאות | Better Auth (organization, magic-link, email/phone OTP, passkey, api-key) + Postgres RLS (`set_config('app.user_id')`), כולל הגבלת `n8n_reader` מ-PII | Lucia (הופסק), Keycloak/Zitadel (רק אם SSO) | 05 |
| אקסל | ExcelJS 4.4 (`rightToLeft`, נוסחאות + cached result מהמנוע ב-TS, definedNames, protection, `fullCalcOnLoad`) | SheetJS CE (קריאה בלבד), xlsx-populate רק לעריכת קבצים זרים | 04 |
| PDF עברית | Chromium (Puppeteer 25 / Playwright 1.63) + Rubik inline + `<bdi>` + header/footer templates | react-pdf (אין bidi), pdfmake, WeasyPrint (RTL פתוח מ-2013); Typst — לעקוב | 04 |
| DOCX | docxtemplater 3.71 + LibreOffice headless (Rubik, noto) רק כשנדרש Word; Carbone CE חלופה | — | 04 |
| מיזוג/חתימת PDF | pypdf 6 (bookmarks, attachments) / pdf-lib (מיזוג בלבד); @signpdf PAdES B-B; pyHanko אם נדרש LTV | — | 04 |
| מחירונים | pdfplumber/camelot ל-PDF דיגיטלי; Claude (document blocks, structured outputs) לסרוקים/עבריים; diff מול גרסה קודמת + אישור אנושי | Azure DI (fallback) | 04 |
| חתימה | שלב א' click-to-accept: OTP SMS, חתימה מצוירת, sha256, IP/UA, דף תעודה; שלב ב' Documenso (AGPL, PAdES) / Comsign / DocuSign | PandaDoc וכד' | 04, 05 |
| הנה"ח/תשלום | Morning (חשבונית ירוקה; OAuth2 ב-`api.morning.co`) להנפקה ומספר הקצאה; Grow/Cardcom לקישורי תשלום | iCount (חלופה), Priority (אם נגדל) | 04 |
| WhatsApp ללקוח | Meta WhatsApp Cloud API (תבניות; ≈$0.005 utility, לאימות) | Hermes/Baileys ליוצא — הפרת ToS, חסימות, supply-chain (אירוע 4/2026) | 05 |
| SMS / מייל | InforU או 019; Gmail API לשיחות אנושיות; Resend/Postmark לטרנזקציוני | Twilio IL (יקר) | 05 |
| Gantt/יומן | frappe-gantt או SVAR Gantt (MIT) + FullCalendar ל-MVP; CPM בצד השרת בימי עבודה; שדרוג ל-Syncfusion (Community) / DHTMLX PRO | Bryntum (יקר) | 05 |
| לוח שנה עסקי | טבלת `business_calendar` מ-@hebcal/core (`il:true`) / Hebcal REST | — | 05 |
| Google Calendar | `events.watch` + syncToken + `extendedProperties.private.bee_event_id`; DB master | — | 05 |
| אחסון | Cloudflare R2 (versioning) + B2 לגיבוי; Drive מראה חד-כיוונית; exifr/sharp/heic-convert; pdfium thumbnails | — | 05 |
| תפוקה | pvlib-python 0.16 (CEC single-diode, shading, bifacial, `read_panond`) + PVGIS 5.3 API (SARAH3, TMY, horizon) | PVsyst (CHF 700 + CLI 3,000/שנה) רק לדוחות בנקאיים | 03 |
| פריסת גג | אלגוריתם משלנו: רוטציה לאזימוט, גריד, shapely contains מול גג+הפרעות, portrait/landscape, pitch מצל חורף; רפרנסים: Solar-Lead panel_packing, rooftop-pv-placement | Aurora/HelioScope API (Enterprise), Solargraf ($4k, US) | 03 |
| מפות/אורתופוטו | govmap XYZ/WMS (ציבורי), MapTiler/Mapbox לבסיס לוויין; Google Solar API (זול) — **כיסוי ישראל לאימות**; אורתופוטו/DSM מפ"י דורש אישור בכתב | — | 03 |
| מסד ציוד | SAM CEC CSV דרך pvlib + PAN/OND יצרנים + קטלוג ידני של 10–20 מק"טים ישראליים | ENF/DNV (בתשלום) | 03 |
| CAD | ezdxf 1.4.4 כמקור; PyMuPDF backend ל-PDF; SVG-per-layer / dxf-viewer לתצוגה בדפדפן; Windows worker (GstarCAD .NET/Python API או cad-pyrx LGPL) ל-DWG+בלוקים דינמיים | ODA (לא מסחרי), LibreDWG (לא R2018), APS (מחיר לא ידוע) | 07 |
| חד-קו אוטומטי | elkjs (ports + orthogonal routing) או פריסת עמודות דטרמיניסטית → INSERT של הבלוקים שלנו; סמלים: QElectroTech (CC-BY 3.0) בזהירות; להימנע מסט ה-526 ללא רישיון | schemdraw (אין DXF) | 07 |
| שערי איכות | text_size+bbox+STRtree; pixelmatch/odiff; Playwright snapshots; `ezdxf audit`; Claude-vision לבדיקת bidi | — | 07 |
| AI | Claude Agent SDK + MCP in-process; כלי כתיבה עם `_meta["anthropic/requiresUserInteraction"]`; PreToolUse `defer`; structured outputs (Zod); PostToolUse audit; idempotency keys | wildcard allowedTools | 05 |
| ops | GlitchTip, Uptime Kuma 2, WAL-G PITR → B2, pg_dump יומי מוצפן, תרגול שחזור רבעוני | Sentry self-host (16GB) | 05 |

### 4.2 מבנה הקוד

מונורפו bee-live: `server/src/modules/<module>`, `packages/shared-schemas` (Zod; קיים ב-bee-build), `apps/web`, `apps/field` (PWA), `apps/portal`, `services/cad` (Python: eplan + pvlib + layout), `services/docgen`, `workers/cad-windows` (סקריפטים ל-GstarCAD). מכונת המצבים, כללים, תבניות לו"ז ופרופילי אסדרה — **נתונים** בטבלאות עם UI עריכה ו-reviewer, לא קוד.

---

## 5. מודל הנתונים (ישויות ליבה)

```
Customer ─┬─ Site ─┬─ Project (stage, status, regulatory_track, distributor) ─┬─ project_events (append-only)
          │        │                                                         ├─ Task · Milestone · Schedule (CPM)
          │        │                                                         ├─ Survey · Photo
          │        │                                                         ├─ Design (spec YAML rev, layout geometry) ─ CalcReport · DrawingSet · BOM
          │        │                                                         ├─ Quote ─ QuoteVersion (immutable) ─ QuoteSection ─ QuoteLine{price_snapshot}
          │        │                                                         ├─ Contract · Invoice · Payment · Signature{sha256, otp, ip, ua}
          │        │                                                         ├─ Submission (iec | historic | authority | fire) ─ SubmissionStep · Form · Fee/Receipt · Correspondence
          │        │                                                         ├─ PurchaseOrder ─ POLine · Delivery
          │        │                                                         ├─ WorkOrder · Crew · DailyReport · Checklist · ChangeOrder
          │        │                                                         ├─ Inspection ─ TestResult (62446-1) · Defect
          │        │                                                         ├─ GridConnection {meterSerial, meterCode, contractNumber, bpNumber, approvedKw, track, activatedAt}
          │        │                                                         ├─ HandoverPack · Warranty
          │        │                                                         └─ MonitoringLink {vendor, vendorSiteId, region, authMode, credentialRef, sharingStatus, latency}
          │        └─ MaintenanceContract · ServiceTicket · PeriodicInspection
          └─ Contact · CommunicationLog (channel, direction, template, job id)
Catalog: Supplier · Product (kind: module/inverter/optimizer/battery/breaker/cable/tray/cabinet/labour/service/fee; tech JSON + datasheet src)
         · PriceList (supplier, valid_from, currency, source file, sha256) · PriceListEntry · Assembly (ערכה; qty = f(kWp, modules, m, roofType))
         · PricingRule · DiscountSchedule · ApprovalThreshold
Rules:   Rule (key, scope, threshold, consequence, source, section, valid_from, verification: unverified|summary|office|validated, verified_by)
Document: (project, kind, rev, file, sha256, generated_from{design_rev, quote_rev, template_rev, rules_snapshot}, signed_by, sent_at, supersedes)
Job:     לפי platform/schema/job.schema.json (kind, loop, status, trustTier, outbound)
```

כללי מודל: Project הוא הציר; Survey משמר את סכמת ה-PWA ומחליף `[OPEN]` ב-id אמיתי; Design = YAML של eplan + rev + hash; QuoteVersion מקפיא שורות, מחירים, מחירון מקור, כללים, מע"מ, תוקף; Submission גנרי לכל גוף חיצוני; Document לעולם לא נמחק; MonitoringLink הוא הגשר לטבלאות bee-live; סכומים `numeric(14,2)` + decimal.js; פריטים צמודי מט"ח שומרים מטבע ושער יום.

---

## 6. מנוע הקטלוג והתמחור (CPQ)

### 6.1 קטלוג
- **Product** עם נתוני דף נתונים שה-eplan צריך (Voc, Isc, Vmp, Imp, מקדמי טמפ', MPPT, I max, Isc max…) ומקור (קובץ/עמוד); זמינות בישראל (כלל משרד #4); קישור ל-CEC/PAN/OND כשקיים.
- **PriceList** לכל ספק עם `valid_from`, מטבע, קובץ מקור ו-hash; קליטה: Excel/CSV ישירות; PDF דיגיטלי דרך pdfplumber/camelot; סרוק/מבולגן דרך Claude עם structured output; תמיד diff מול הגרסה הקודמת ואישור אנושי; התראת "מחירון ישן" (staleness). אין בישראל ספק חשמל/PV שמפרסם מחירון מכונה או API — צינור הייבוא הוא הפתרון.
- **Assembly (ערכה)** — הידע של ברק: "1 kWp על רעפים עם SolarEdge", "לוח איסוף 2 ממירים 50 kW", "ארון T4P 800+600+300+800". פרמטרית לפי kWp/מודולים/מטר/סוג גג/קומפלט.
- **Labour / services / fees**: עבודה למודול×סוג גג, יום צוות, מנוף/פיגום ליום, קונסטרוקטור, בודק, אגרות חח"י (סקר, בדיקה, מונה; מעל 50 kW מונה קריאה מרחוק על חשבון הבעלים — לאימות), היתר/דיווח פטור, ביטוח — כולם Products.

### 6.2 תמחור
- **מקור הכמויות**: S03 ערכות; S06 BOM של eplan מחליף, וההפרש מוצג לברק.
- **PricingRule**: עלות×מקדם לפי קטגוריה/לקוח/גודל, מינימום רווח, עיגולים, הנחות עם סף אישור, מע"מ 18%, הצמדה, תוקף.
- **כללים רגולטוריים כשורות אוטומטיות** (R-table, דוח 02): R7 P/0.9 > חיבור → "הגדלת חיבור"; R8 >15 kW → ארון מונה ייצור + 2 מנתקים; R9 >3×100A → מדידה עקיפה/CT; R10 >100 kW → zero-export/EMS; R11 מפסק ראשי PV + שלט; R12 מפסק/מנתק ליד ממיר לפי מרחק; R13 RCD סוג B אלא אם הממיר מצהיר 62109; R14 מוליכי הארקה 10/16/10 mm²; R15 ISO/RCM; R18 ≤700 kW → דיווח פטור מול היתר + קונסטרוקטור; R19 שילוט/מנתקי DC/ניתוק חירום (+אופציית אופטימייזרים); R20 אגירה (מפסק משולט, PCS ≤3 מ', חירום, מעבר 0.6 מ'); R23 לוח בתו תקן 61439.
- **רוויזיות**: QuoteVersion חדשה לכל שינוי; השוואת שורות בין גרסאות; נעילה בשליחה (DB trigger); פקודת שינוי = גרסה עם מסמך דלתא שנחתם באותו flow.
- **ROI**: תפוקה (pvlib/PVGIS, degradation 0.4–0.55%/שנה, החלפת ממיר שנה 12–15), פרופיל אסדרה (R1 מונה נטו עד 31.12.2026; R2–R4 מדרגות תעריף; R5–R6 פטור מס ביתי), NPV/IRR (pyxirr / ~40 שורות TS), 25 שנה.

### 6.3 תוצרים
- **כתב כמויות XLSX**: גיליון סיכום + גיליון לפי פרקים במבנה המפרט הכללי פרק 08 (סעיף כטקסט `08.01.0010`, תיאור, יח', כמות, מחיר יח', סה"כ) + פרקי PV (ציוד ראשי, DC, AC, לוחות, הארקה, תשתית/תעלות, עבודה, שירותים/אגרות); נוסחאות חיות; תצוגת לקוח (בלי עלויות) ותצוגה פנימית (עלות, רווח, ספק, בסיס). דוגמת מבנה ל-50 kWp: דוח 04 §4.6.
- **הצעת מחיר PDF** (Chromium): שער עם תמונת גג ומספר כותרת; תקציר 3 מספרים; תיאור המערכת; תפוקה (שנתית, חודשית, kWh/kWp, PR); כלכלה (חשבון לפני/אחרי, חיסכון שנה 1, החזר, NPV/IRR, תזרים 25 שנה); מפרט ציוד; היקף (כולל חח"י/קונסטרוקטור/בודק); מחיר לפני/כולל מע"מ; תשלומים מדורגים צמודי אישורי חח"י; אחריות (מודולים 25/30 ביצועים + 12–25 מוצר, ממיר 12 SolarEdge / 10 Huawei, עבודה 1–5); החרגות; תוקף/הצמדה; חתימה. **לכיול: 2–3 הצעות קיימות של ברק.**
- **הסכם** (DOCX→PDF) מ-QuoteVersion; חתימה click-to-accept (§4.1).

---

## 7. מחולל המסמכים — מפת מסמכים

| מסמך | שלב | מקור נתונים | מחולל | פורמט | הערות |
|---|---|---|---|---|---|
| סיכום סקר אתר | S02 | Survey | PWA (קיים) | PDF | |
| הצעת מחיר | S03/S04 | QuoteVersion + Design-lite + ROI | Chromium | PDF | תבנית ממותגת RTL |
| כתב כמויות | S03/S06 | QuoteVersion / BOM | ExcelJS | XLSX (+CSV) | 2 תצוגות, נוסחאות |
| הסכם התקנה | S04 | QuoteVersion + Customer | docxtemplater→LibreOffice | PDF (+DOCX) | חתימה דיגיטלית |
| חשבונית/קבלה | S04/S11 | Invoice | Morning API | PDF | מספר הקצאה ע"י הספק |
| חבילת בקשת שילוב | S05 | Project + Survey + טופס 22-8-22 | טפסי PDF ממולאים (pdf-lib/pypdf forms) | PDF | רשימת מסמכים לפי פרופיל (§9) |
| סט תוכניות E-00…E-08 | S06 | Design | eplan → DXF → Windows worker | DWG 2018 + PDF + PNG + BOM CSV | 0/0/0 audit, בדיקות |
| הזמנות רכש | S07 | BOM + PriceList | ExcelJS/Chromium | XLSX/PDF | לפי ספק |
| דוח ביצוע יומי / סיור / ליקויים | S08 | DSL bee-build | מחולל דוחות שטח (פורט) | PDF | קיים |
| דוח בודק 62446-1 | S09 | Inspection + TestResult | תבנית "בודק" | PDF | קטגוריה 1 (+2) |
| חבילת בדיקת מתקן חח"י | S10 | חד-קו חתום, טופס בדיקה, הצהרות, דפי נתונים, אישור גודל חיבור | pypdf merge | PDF | הגשה ידנית ב-digitalorders |
| סט As-Made | S10/S11 | Design rev as-made | CAD svc | DWG + PDF | סטטוס As-Made בבלוק הכותרת |
| תיק מתקן / מסירה | S11 | כל המסמכים | pypdf (bookmarks, attachments DXF) | PDF | נתוני מערכת, as-made, מחרוזות, דפי נתונים, אחריות, בדיקות |
| דוח תחזוקה תקופתי | S12 | PeriodicInspection | מחולל דוחות שטח | PDF | |
| דיווח בוקר / תקועים | — | Projects + SLA | pg-boss cron → self-chat | WhatsApp | הרחבת `morning-report` |

---

## 8. שלב התכנון — eplan כשירות

### 8.1 זרימה
1. **spec אוטומטי** מ-Project (כתובת, חיבור, פרופיל), Survey, Catalog (נתוני דף נתונים עם מקורות) והחלטות ברק; לא-מאומת = `# VERIFY`.
2. **גיאומטריה**: (א) קלט קונסטרוקטור DWG/DXF (כמו NESPAH-543-05): `INSERT`/`LWPOLYLINE` לפי שכבות דרך ezdxf; DWG→DXF דרך ה-worker; (ב) PDF וקטורי: PyMuPDF `get_drawings()` / pdfplumber; (ג) רסטר/תמונה: Claude vision + נקודות בקרה אפיניות; (ד) ציור ידני על אורתופוטו ב-UI (govmap/MapTiler) עם shapely. נשמר ב-`roof`/`layout` של ה-spec.
3. **הרצה**: job → container `services/cad` → `ALL CHECKS PASS`/חסימות → CalcReport, E-00…E-08 (DXF+PDF+PNG+SVG), BOM. סבב STATUS/RESULT/NEXT, `owner_accepted`.
4. **מסד הכללים** (`eplan.db`) → טבלת `rules` משותפת (seed → VALIDATED → reviewer). כללי המשרד ממשיכים לגדול.

### 8.2 פריסת גג ותפוקה (S03)
אלגוריתם משלנו (דוח 03): סיבוב פוליגון הגג לאזימוט, גריד portrait/landscape, pitch משורות מצל חורף, `contains` מול גג והפרעות, קיבוץ למחרוזות לפי פאה, string sizing (Voc_cold, Vmp_hot, Σ Imp/Isc — כבר ב-eplan). תפוקה: pvlib + PVGIS TMY/horizon (cache); Google Solar API לצל/DSM אם ישראל מכוסה (לאימות). SolarEdge Designer / Huawei SmartDesign לאימות ידני.

### 8.3 צינור DWG (דוח 07)
```
spec YAML ─▶ eplan (ezdxf) ─▶ DXF (R2018, placeholders INSERT לבלוקים דינמיים)
     ├─▶ PDF/PNG/SVG (PyMuPDF backend; python-bidi; Rubik/heb.shx) ─▶ תצוגה בדפדפן (SVG per layer / dxf-viewer)
     └─▶ תור ─▶ Windows worker (GstarCAD .NET/Python API או cad-pyrx; AutoCAD accoreconsole אם יש רישיון)
                 ├─ מחליף placeholder בבלוק דינמי מהספרייה + DynamicBlockReferenceProperty (visibility/attrs)
                 ├─ AUDIT, PURGE, SAVEAS DWG 2018
                 └─ PLOT לפי SARA.ctb/משרדי ─▶ PDF רשמי
```
חלופה אם אין worker: לשטח את 152 הבלוקים הדינמיים לווריאנטים סטטיים (DXF/ezdxf). ezdxf עצמו: אין DWG, אין יצירת בלוקים דינמיים (issue #1203; fork `dynblock` ניסיוני, לא מאומת). ODA converter: רישיון לא-מסחרי בלבד. QElectroTech: CC-BY 3.0; סט 526 הסמלים — ללא רישיון, להימנע.

---

## 9. הגשה לחח"י ורגולציה

> פירוט: `research/01-iec-process.md`, `research/02-regulation-tariffs.md`.

### 9.1 מה ידוע (ורמת האימות)
- **טופס**: "בקשת שילוב מתקן ייצור פוטו-וולטאי לרשת חברת החשמל" (גרסה 22-8-22) כולל הצהרת מבקש; נספחים שאומתו מתקציר: חד-קו כולל הארקה, טופס בדיקת מתקן (חתימת בודק חח"י), דפי נתונים ממיר+מודולים, אישור גודל חיבור. **לא אומת**: הצהרת מתקין/מתכנן, קונסטרוקטור, ביטוח, רשות מקומית, ייפוי כוח דיגיטלי.
- **פורטלים**: `digitalorders.iec.co.il` (הזמנת חיבור/הגדלה/בדיקת מתקן, קבצים, תשלום, סטטוס בזמן אמת; הרשמה חד-פעמית), אתר המעגל (`/photovoltaic_installation_2`, `/order_the_test`, `/useful_forms`), פורטל יצרנים (רישום לאסדרה, מדריך 10-10-2023), `iec.co.il/order-payments`. **אין API/intake מובנה.** מינהל החשמל: PDF בלבד.
- **SLA מאמות המידה (תקציר, מס' סעיף לא אומת)**: בדיקת מתקן תוך 7 י"ע מתשלום; השלמת חיבור+בדיקה תוך 30 י"ע; פרסום סקרים 7–14 י"ע; חובת החזר תשלום על תשובת מחלק שלילית כשנתוני הרשת לא עודכנו. מסלול מהיר (החלטה 70104) — "עד 30 יום" לקטנים (שיווקי).
- **אגרה ביתית** ~704 ₪ (2026; 625 ₪ בעבר) — מהותה המדויקת בלוח התעריפים לאימות. הקבלה מ-28.09.26 תואמת.
- **היתר הפעלה** מרשות החשמל (עמוד חדש 04/2026) — לאילו גדלים, לאימות.
- **רגולציה טכנית** (מסמכי המשרד + תקצירים): הנחיות 24.01.2022 §7/§8/§11/§17/§19/§23–25; אמות מידה 35כ2 (P/0.9, ייצוא >100 kW), 35כ3(י) (מונה ייצור >15 kW, מחלק מספק), 35כ3(א1) (אגירה חולקת מונה ייצור); תקנה 24 לתקנות הפטור (גג ≤700 kW, לפי ת"י 62548, דיווח לרשות); ת"י 61439 ללוחות, ת"י 62619 לסוללות; הנחיות אגירה 24.03.2021; תקנות רישיונות 1985 (מוסמך 3×80A, ראשי 3×250A, הנדסאי 3×630A, מהנדס ללא הגבלה; ספי בודק 1/2/3 לאימות).
- **תעריפים (תקצירים)**: מונה נטו פוקע סוף 2026; 15–100 kW: 38.4 אג' (2025) → 35.67 (2026); ביתי ≤15: 48 אג' (ישן) / הצעה ~35 (2026) — לאימות; צריכה ביתית 54.25 אג' + מע"מ (04/2025); פטור מס ביתי 27,000 ₪ (2025), 10% מעל; פטור ניהול ספרים ≤24,000 ₪.

### 9.2 איך המנוע מייצג זאת
- **פרופיל אסדרה** → תבנית Submission: צעדים, מסמכים, אגרות, חתומים, SLA, "ממתין ל".
- **Submission step** עם `status`, `owner`, `documents[]`, `fee{amount, receipt, paidAt}`, `externalRef` (מס' הזמנה/בקשה), `dueAt` (מחושב בימי עבודה מ-`business_calendar`), `correspondence[]`.
- **מילוי טפסים** מהרשומה (PDF forms) → חבילה אחת; אדם מעלה ב-digitalorders ורושם מספר תיק; קבלות (מייל/העלאה) נקלטות ומקושרות (OCR/Claude vision → אישור).
- **טבלת rules**: R1–R24 + כללי משרד + eplan; כל כלל עם `verification` ו-`verified_by`; כלל `unverified` יכול להציע שורה/מסמך אך מסומן "לאימות" בהצעה ובחבילה עד שברק מאשר.
- **מחלק היסטורי**: תבנית נפרדת (בקשה למחלק, סקר פנימי + חח"י, מונה/תעריף מול המחלק).

---

## 10. ביצוע, לו"זים ורכש

- **תבנית לו"ז** לפרופיל: משכי שלבים, תלויות, buffer; CPM בצד השרת בימי עבודה (hebcal); נוצר ב-S04, מתעדכן לפי מציאות.
- **Gantt חוצה-פרויקטים**: כל הפרויקטים בביצוע, לפי צוותים ומשאבים (מנוף, בודק); קונפליקטים; סנכרון דו-כיווני ל-Google Calendar (יומנים: התקנות, בדיקות, חח"י).
- **רכש**: BOM → PO לפי ספק (מחירון, lead time); אספקות; חוסרים חוסמים התקנה.
- **שטח**: הקצאת צוות, צ'קליסט התקנה לפי סוג גג/ממיר, דוח יומי + תמונות, פקודת שינוי → QuoteVersion.
- **דיווח בוקר**: SLA חורג, "ממתין ל" ישן, תיקי חח"י תקועים, מחירונים ישנים.

---

## 11. בדיקה, חיבור מונה ומסירה

- **בודק**: סוג לפי Rule R17 (לאימות), הזמנה ביומן, דוח IEC 62446-1 קטגוריה 1 (ויזואלי, רציפות הארקה, קוטביות, Voc/Isc למחרוזת, RCD/פונקציונלי, בידוד DC) + קטגוריה 2 כשנדרש (I-V, תרמוגרפיה); ליקויים → משימות → בדיקה חוזרת. הדוח הוא גם ה-**baseline** לניטור.
- **חח"י**: הזמנת בדיקת מתקן + חבילה + תשלום; בדיקה; מונה; אישור הפעלה; רישום לאסדרה; היתר הפעלה (אם חל). `GridConnection` רושם meterSerial/meterCode/contractNumber/bpNumber/approvedKw/track/activatedAt.
- **מסירה**: commissioning checklist, תיק מתקן (נתוני מערכת, as-made, מפת מחרוזות, דפי נתונים, מכני, O&M/אחריות, תוצאות בדיקה, דוח אימות), אחריות עם תאריכי סיום, חשבון סופי, הדרכה, חתימה; **הסכמת לקוח ו-token לנתוני חח"י** (§12).
- **הזרעת ניטור** (`MonitoringLink`): ספק, site id, אזור/gateway, מצב אימות, credential ref, `sharingStatus` (+תאריך), latency צפוי; מלאי ציוד (סריאלים, קושחה, תקשורת); מפת מחרוזות עם Voc/Isc/Riso; אוריינטציה/שיפוע למערך (ל-PVGIS); תפוקה חודשית צפויה וספי התראה; תזכורת בדיקה חוזרת (5 שנים — מקור מדריך מתקין, לאימות). שיתוף אתר שלא הושלם = **משימה**, לא שגיאת API.

---

## 12. ניטור ותחזוקה

- **קיים**: SolarEdge V1 (300 קריאות/יום לחשבון ולאתר; bulk נספר פעם אחת; 429 = מגבלה → להוסיף ל-circuit), V2 (base `/v2`, `X-API-Key` Fleet / OAuth2 Site Access; `/sites`, `/overview`, `/power`, `/energy`, `/devices`, `/alerts?only-open=true`, telemetry; 1 credit לקריאה; 429 עם `x-ratelimit-remaining-minute`≠0 = קרדיטים חודשיים נגמרו — **לאמת מול השדות `GUESSED` באדפטר**), Sungrow (OpenAPI: `/openapi/login` + `x-access-key`; `getPowerStationList`, `getDeviceRealTimeData`, minute data; "not in account list" → שיתוף אתר).
- **ספקים להוספה** (סדר לפי ההעדפות שלנו ורמת ה-API): Huawei FusionSolar Northbound (רשמי; חשבון API ע"י המתקין, ~1 קריאה/דקה/endpoint), Solis (רשמי, HMAC), Growatt/Solarman/Deye (רשמי), Enphase v4, Tigo v3 (EI Premium); GoodWe SEMS / SAJ (הפוך-הנדסית, סיכון); **KStar — אין API ענן → Modbus/SunSpec logger** (LTE router + VPN).
- **מתזמן מכסות גלובלי** לכל ספק (להבחין 429 חודשי מדקתי), `sharing_status` כמשימה, Modbus/SunSpec (מודלים 101–103/160/802) לאתרים >100 kWp או ספקים לא יציבים.
- **KPI (IEC 61724-1)**: specific/reference yield, PR, PR מתוקן טמפרטורה (pvlib `faiman`), EPI מול PVGIS/pvlib, זמינות, capacity factor, יחס עמיתים בין אתרים סמוכים. **טקסונומיית התראות**: אובדן תקשורת, אפס ייצור, אזעקות ממיר, תת-ביצוע, חוסר איזון מחרוזות, Riso, curtailment/ripple, אי-התאמה מונה חח"י, אחריות/בדיקה מתקרבת.
- **נתוני חח"י** (py-iec-api, לא רשמי): `iecapi.iec.co.il/api/`, login ת"ז+OTP של הלקוח; `Consumption/RemoteReadingRange/{contract}` עם `backStream` = ייצוא PV → התאמה חודשית ובדיקת חשבון; דיווח 15 דק' במייל. דורש הסכמה ותהליך token במסירה; שיתוף חוזה כאיש קשר — לאימות.
- **חוזי תחזוקה**: Basic/Standard/Premium (ניקוי 2–4/שנה, בדיקה תקופתית, SLA תגובה, דוח שנתי); חידוש אוטומטי; חיוב דרך Morning. התראה → ServiceTicket → שיבוץ (M4b) → דוח שטח → סגירה.

---

## 13. CRM, תקשורת ופורטל לקוח

- **תצוגות**: Pipeline (Kanban לפי שלב), כרטיס פרויקט (ציר זמן אחד), "היום שלי", "תקועים", Gantt, תיקי חח"י.
- **Intake**: WhatsApp (Hermes/Alfred → `collect.wa`, פנימי/נכנס), מייל, טופס אתר; AI מחלץ שדות (Zod) → טיוטת ליד לאישור.
- **Outbound**: תבניות Meta מאושרות לכל שלב (הצעה נשלחה, תזכורת, מועד התקנה, מונה הותקן…), תמיד `dispatch.draft` עם בחירה אנושית; SMS ל-OTP ותזכורות; מייל טרנזקציוני מסאב-דומיין נפרד.
- **פורטל לקוח** (Better Auth magic-link/OTP): סטטוס לפי אבני דרך בלבד, מסמכים (presigned R2), חתימה, תשלום, תמונות; אחרי מסירה — ניטור בסיסי.
- **ייבוא Monday**: חד-פעמי, מיפוי עמודות → Customer/Project/stage.

---

## 14. שכבת ה-AI

| סוכן | קלט | פלט | כלים | שער |
|---|---|---|---|---|
| Intake | הודעה נכנסת | טיוטת Customer/Project (Zod) | read: catalog, rules; write: drafts | אישור אדם |
| Quote drafter | Survey + Catalog + Rules | QuoteVersion טיוטה + הסברים | pricing engine (read), assemblies | ברק מאשר |
| Price-list ingest | PDF/Excel ספק | PriceList טיוטה + diff | document blocks, structured output | אישור אנושי |
| Design assistant | spec + פלט eplan | STATUS/RESULT/NEXT, אופציות מחרוזות, verify | eplan CLI, datasheets | ברק מחליט |
| Submission assistant | Project + פרופיל | חבילת טפסים, רשימת חוסרים, תזכורות | docgen, business calendar | אדם מגיש |
| Receipt/status updater | קבלות, אישורים, תכתובות | הצעת מעבר/קישור מסמך | vision, project events | אישור (או אוטומטי לאירועים חסרי סיכון) |
| Stuck-project monitor | SLA, "ממתין ל" | דיווח בוקר | read-only | self-chat בלבד |

גדרות: Agent SDK + MCP in-process; כלי כתיבה (`send_customer_message`, `transition_project`, `create_quote`) עם `requiresUserInteraction` → תמיד `canUseTool`; PreToolUse `defer` לאישורים בבוקר; idempotency keys; PostToolUse audit; cost tier לכל job; כל מספר/כלל עם מקור או "לאימות".

---

## 15. אבטחה, פרטיות, ops

- תפקידים: owner, engineer, pm, technician, surveyor, customer, inspector, supplier, agent. RLS לפורטל ולסוכנים; `n8n_reader` ללא PII.
- פרטיות: תקנות אבטחת מידע 2017 (רמה בינונית מתוכננת) + תיקון 13 (בתוקף 14.08.2025): מסמך הגדרות מאגר, נוהל אבטחה, הרשאות + audit log, הצפנה, גיבויים, מזעור (לא לשמור צילומי ת"ז), הודעת איסוף, DPA עם Cloudflare/Meta/Google/Anthropic, מדיניות שמירה, נוהל אירוע. ספים/חובת DPO — לאימות עם עו"ד.
- סודות אינטגרציה מוצפנים ב-DB (כמו `apiKeyV2`); credential refs ולא ערכים ברשומות.
- גיבוי: WAL-G PITR → B2, pg_dump יומי מוצפן, תרגול שחזור רבעוני ב-staging.
- בדיקות: snapshot ל-xlsx/pdf/dxf, audit 0/0/0 ל-CAD, E2E למעברי שלבים, בדיקות כללים (כל Rule עם מקרה בדיקה).

---

## 16. מפת דרכים (אבני דרך)

| אבן דרך | תוכן | תלות | "עובד מקצה לקצה" |
|---|---|---|---|
| **M0 — יסודות** | `projects` (Customer/Site/Project, XState + events, tasks), `documents` (R2 + hash), `jobs` ledger, Better Auth + תפקידים, `rules` (seed מהסקיל + R1–R24, הכל `unverified`/`office`), `business_calendar`; ייבוא Monday; חיבור PWA סקר ל-Project; GlitchTip/Uptime Kuma | — | ליד → סקר מקושר, pipeline |
| **M1 — קטלוג ותמחור** | Product/Supplier/PriceList (ייבוא Excel/PDF + diff), Assemblies, PricingRule, שורות אוטומטיות מ-rules | M0 | הצעה מחושבת מערכה |
| **M2 — הצעה וכתב כמויות** | QuoteVersion immutable, XLSX (ExcelJS), PDF (Chromium), ROI (pvlib/PVGIS), רוויזיות, שער אמון (WhatsApp Cloud API/מייל), חוזה + חתימה OTP, Morning + קישור תשלום | M1 | S03–S04 |
| **M3 — הגשה לחח"י** | פרופילי אסדרה, Submission templates, טפסים ממולאים, קליטת קבלות, SLA בימי עבודה, תזכורות, דיווח בוקר | M0, M2 | S05 + S10 מנוהלים |
| **M4 — תכנון כשירות** | `services/cad` container (eplan + pvlib + layout), spec אוטומטי, קליטת קונסטרוקטור (DXF/PDF/vision), ציור גג ב-UI, Windows CAD worker, SVG preview, BOM → QuoteVersion rev | M1, M2 | S06 → סט DWG/PDF + כתב כמויות מדויק |
| **M5 — ביצוע ולו"זים** | תבניות לו"ז + CPM, Gantt, Calendar sync, PO, פורט מחולל דוחות שטח, צ'קליסטים, פקודות שינוי | M0, M4 | S07–S08 |
| **M6 — בדיקה/מונה/מסירה** | דוח 62446-1, חבילת בדיקת חח"י, GridConnection, תיק מתקן, אחריות, MonitoringLink → bee-live, הסכמת נתוני חח"י | M3, M5 | S09–S11, אתר נדלק בניטור |
| **M7 — O&M + AI + פורטל** | חוזי תחזוקה, tickets→שיבוץ, KPI/EPI, ספקי ניטור נוספים + Modbus, פורטל לקוח, סוכני AI | M6 | S12 + אוטומציה |

כל אבן דרך: spec קצר → פיתוח → בדיקות → staging (`bee-lab`) → אישור ברק → deploy. ה-handoff הקיים (SolarEdge V2 עד 01–03.11.2026; M3/M4b) נבלע ב-M6/M7. סדר מומלץ אחרי M2: **M3 לפני M4** (ערך מיידי, סיכון טכני נמוך).

---

## 17. החלטות פתוחות לברק

1. **סדר M3 מול M4** (המלצה: M3 קודם).
2. **WhatsApp**: לעבור ל-Meta Cloud API לתקשורת עם לקוחות (המלצה: כן; Hermes נשאר פנימי).
3. **CAD worker**: GstarCAD על מחשב המשרד כ-worker (המלצה) / AutoCAD / לשטח בלוקים דינמיים. מי מחזיק רישיון GstarCAD?
4. **הנה"ח**: Morning (המלצה) / iCount / אחר.
5. **חתימה**: שלב א' OTP+audit מספיק? (לאמת עם עו"ד) ומתי Documenso/Comsign.
6. **Monday**: תאריך הפסקה וייבוא.
7. **מחירונים**: ספקים ראשונים ומי מתחזק.
8. **פורטל לקוח**: M2 (סטטוס+מסמכים) או M7.
9. **reviewer של rules**: ברק בלבד?
10. **Google Solar API / אורתופוטו מפ"י**: לבדוק כיסוי/רישוי לפני M4.
11. **KStar**: להמשיך להציע ללקוחות למרות היעדר API ענן (→ logger)?

---

## 18. פערי אימות (לפני קידוד כחוק עסקי)

מרוכז מסעיפי "לא אומת" של הדוחות. **צעד ראשון:** לפתוח בסביבת הענן (Network access → Allowed domains) את `iec.co.il`, `ieccontent.iec.co.il`, `iec-hamaagal.co.il`, `digitalorders.iec.co.il`, `gov.il`, `pua.gov.il`, `nevo.co.il`, `sii.org.il`, `he.wikisource.org`, אתרי יצרנים (solaredge, huawei, sungrow, goodwe, sma, enphase) ו-docs (readthedocs, npm, aps.autodesk) ולהריץ סבב אימות על ה-URL-ים שבדוחות.

| # | פער | דוח | משפיע על |
|---|---|---|---|
| V1 | מספרי אמות המידה המדויקים ו-SLA (7/14/30 י"ע) | 01 | Submission dueAt |
| V2 | מהות ה-704 ₪ (סעיף בלוח התעריפים, לפני מע"מ, אחידות לגדלים) | 01 | שורת אגרה |
| V3 | ספי גודל (15/100/630) ומה משתנה בכל סף (היתר הפעלה, בודק, מונה) | 01, 02 | פרופיל אסדרה |
| V4 | תעריפי הזנה 2026 לכל מדרגה; תעריף ביתי בתוקף; תקרות מס 2026 | 02 | ROI |
| V5 | רשימת המסמכים המלאה של טופס 22-8-22 והאם יש טופס חדש 2024–2026; פורמטי קבצים ב-digitalorders; ייפוי כוח | 01 | חבילת הגשה |
| V6 | הצהרות מתקין/מתכנן, קונסטרוקטור, ביטוח, רשות מקומית כדרישת חח"י | 01 | checklist |
| V7 | ספי בודק סוג 1/2/3; האם נדרש דוח לפי 62446-1 | 01, 02 | R17, תבנית דוח |
| V8 | הנחיית חח"י הטכנית (חלונות מתח/תדר, anti-islanding, cos φ, ניתוק מרחוק) | 02 | spec ממיר |
| V9 | הוראת כבאות (543/פרק 500), סף תוכנית בטיחות אש, חובת rapid-shutdown/אופטימייזרים | 02 | R19 |
| V10 | היתר הפעלה 04/2026 — גדלים, קשר לאישור חח"י | 01 | S10 |
| V11 | מחלק היסטורי — תהליך בפועל | 01 | תבנית Submission |
| V12 | תוכן החלטה 70104 (מסלול מהיר) | 01 | SLA |
| V13 | SolarEdge V2 tiers/קרדיטים; שדות `GUESSED` | 06 | אדפטר V2 (דדליין 11/2026) |
| V14 | Sungrow gateway לישראל; "not in account list" = שיתוף | 06 | ניטור |
| V15 | Google Solar API כיסוי ישראל; רישוי אורתופוטו מפ"י; CEC מכסה ממירים תלת-פאזיים ישראליים | 03 | פריסה/תפוקה |
| V16 | מחירי Meta WA בישראל; SMS; R2 | 05 | עלויות |
| V17 | ספי חוק הגנת הפרטיות/DPO; חתימה אלקטרונית רגילה לחוזים | 05, 04 | §15, חתימה |
| V18 | סף מספר הקצאה 2026 (15,000 מול 5,000 ₪) | 04 | חשבוניות |
| V19 | GstarCAD 2027 API/רישיון; Aspose/APS מחירים; heb.shx+bidi ב-GstarCAD | 07 | CAD worker |
| V20 | בדיקה חוזרת כל 5 שנים — מקור רגולטורי? | 06 | תזכורות |

---

## 19. קלטים נדרשים מברק (לפני תחילת M1–M2)

1. 2–3 הצעות מחיר קיימות (PDF) וכתב כמויות קיים (Excel) — לכיול תבניות ומבנה פרקים.
2. מחירוני הספקים העיקריים (Excel/PDF) + מי מעדכן.
3. ה"ערכות" (מה כולל 1 kWp על כל סוג גג; לוחות סטנדרטיים) — אפשר בשיחה מוקלטת, ה-AI יבנה טיוטת Assemblies לאישור.
4. דוגמת תיק הגשה מלא לחח"י שהוגש (כולל קבלות ותשובת מחלק) ודוח בודק אחד.
5. חוזה התקנה נוכחי (Word).
6. גישה ל-digitalorders/פורטל יצרנים (צילומי מסך של השלבים) כדי למפות שדות.
7. הקבצים מהתיקייה `L:\...\חכל שדרות\מנוע` (להעלות לשיחה/Drive).
8. אישור רשימת הדומיינים לפתיחה בסביבה (§18).

---

## נספחים

- `01-lifecycle-stages.json` — מכונת המצבים כנתונים
- `research/01-iec-process.md` — תהליך חח"י מקצה לקצה
- `research/02-regulation-tariffs.md` — רגולציה, אסדרות, תעריפים, רישוי, R1–R24
- `research/03-pv-design-tools.md` — כלי תכנון/סימולציה/הצעות ו-APIs
- `research/04-quote-boq-docs.md` — אקסל/PDF/DOCX, CPQ, חתימה, הנה"ח, מחירונים, BOQ לדוגמה
- `research/05-crm-workflow.md` — CRM, workflow, לו"זים, תקשורת, אחסון, auth, AI, פרטיות
- `research/06-monitoring-om.md` — APIs של ממירים, commissioning, O&M, נתוני חח"י
- `research/07-cad-dxf.md` — ezdxf, DWG, רינדור, קלט קונסטרוקטור, סכמות, שערי איכות
