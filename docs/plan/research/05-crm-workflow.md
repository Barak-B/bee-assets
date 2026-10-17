# 05 — Smart CRM / Project-Lifecycle Engine ל-B.E.E: ארכיטקטורה, ספריות ומוצרים (2025–2026)

**תאריך:** 2026-10-06 · **קהל:** ברק (בעלים/מהנדס) + נרי (מפתח) · **הקשר:** Fastify + Postgres + Vite/React ב-Docker מאחורי Caddy + Cloudflare Tunnel, workers לסנכרון, גשר WhatsApp (Hermes/Alfred), n8n (תפקיד DB לקריאה בלבד), Google Workspace, Monday.com כ-CRM קודם.

> **איך לקרוא:** כל פרק = סקירה קצרה → טבלת החלטה (אפשרויות / יתרונות / חסרונות / עלות / המלצה לצוות של 2 מפתחים) → קישורים. בסוף: Feature Benchmark, מודל נתונים מוצע, Stack מומלץ, ורשימת "לא אומת".
>
> **מגבלת מחקר:** חלק גדול מאתרי הספקים (Meta, Twilio, Trigger.dev, Stately, Bryntum, SVAR, hebcal, gov.il, אתרי עו"ד ישראליים) חסומים ב-egress של סביבת המחקר. מה שלא אומת ממקור ראשוני מסומן ⚠️ ומרוכז בפרק "לא אומת".

---

## 0. תמצית מנהלים (TL;DR)

1. **לבנות, לא לאמץ.** אף CRM פתוח (Twenty / EspoCRM / Odoo / ERPNext) לא מגיע עם "מחזור חיים של פרויקט סולארי" (סקר → הצעה → חוזה → הגשה לחח"י → רכש → התקנה → בדיקה → מונה → תחזוקה). לכולם צריך להוסיף את זה כ-customization, ואז אתם מתחזקים גם את ה-CRM וגם את ההתאמות. עם Fastify+Postgres קיימים, ליבת ה-lifecycle צריכה להיות **טבלאות + מכונת מצבים שלכם**.
2. **מה כן לאמץ:** ספריות, לא פלטפורמות: `pg-boss` (תורים/תזכורות/SLAs ב-Postgres, בלי Redis), `XState v5` (הגדרת מצבי פרויקט ומעברים מותרים), `Better Auth` (הרשאות, magic-link ללקוחות), Postgres RLS (בידוד שורות לפי תפקיד), `Documenso` (חתימה) ו-`GlitchTip`+`Uptime Kuma` (תפעול). n8n נשאר **רק** לאינטגרציות קצה, לא למצב הפרויקט.
3. **תקשורת:** כל הודעה יוצאת ללקוח → **WhatsApp Cloud API רשמי** (תבניות Utility בישראל ≈ $0.005/הודעה, Marketing ≈ $0.035 ⚠️). גשר לא-רשמי (Baileys/Hermes) = סיכון חסימה ואספקת-שרשרת; להשאיר אותו לקריאה/נוחות פנימית בלבד.
4. **AI:** Claude Agent SDK עם `canUseTool` + אנוטציית `_meta["anthropic/requiresUserInteraction"]` על כלי "שלח הודעה" — זה בדיוק Trust Gate / Law #2 (`requiresHumanPick`) ברמת ה-SDK.
5. **פרטיות:** תיקון 13 בתוקף מ-14.8.2025. מאגר הלקוחות שלכם (ת"ז, כתובת, חשבונות חשמל, תמונות בית, GPS) צריך לפחות: מסמך הגדרות מאגר, נוהל אבטחה, הרשאות לפי תפקיד, לוג גישה, הצפנה, גיבויים, ומינימיזציה (לא לשמור צילום ת"ז אם לא חייבים).

---

## 1. Build vs Adopt — CRM/PM פתוחים ו-CRM סולאריים

### 1.1 CRM / PM פתוחים (self-hosted)

| מוצר | סטאק | רישיון | מה טוב | מה חסר לנו | עלות | התאמה ל-B.E.E |
|---|---|---|---|---|---|---|
| **Twenty CRM** | TypeScript, NestJS + BullMQ, Postgres 16 + Redis, React | ⚠️ AGPL-3.0 (לפי ידיעתי; לא אומת בעמוד הריפו) | סטאק זהה לשלכם; REST+GraphQL; custom objects; מנוע workflow עם actions אמיתיים (אומת בריפו): `ai-agent, classify, code, create-calendar-event, delay, filter, form, http-request, if-else, iterator, logic-function, mail-sender, record-crud, send-chat-message, tool-backed, wait-for-event`; 58k⭐ | אין Gantt/לו"ז, אין checklists לפי שלב, אין portal ללקוח, אין WhatsApp action; מינימום 2GB RAM + Redis | חינם (self-host) | **לא כליבה.** אפשרי כ"ספריית רעיונות" למודל workflow (trigger→steps). אם רוצים UI-CRM מוכן לאנשי מכירות — Twenty הוא ההימור הכי קרוב לסטאק שלכם. |
| **EspoCRM** | PHP 8.3+, MySQL | GPLv3 + הרחבות בתשלום | ~90% קונפיגורציה מה-admin בלי קוד; Advanced Pack ($395 חד-פעמי) = Workflows + BPM (flowcharts עם user-tasks/timers) + Reports | PHP/MySQL זר לצוות; שני DBs; UI בעברית/RTL חלקי ⚠️ | $0 + $395 | לא. מוסיף סטאק שלישי. |
| **SuiteCRM** | PHP | AGPL | הכי "feature-complete" (quotes, territories, email marketing) | כבד, PHP, UI מיושן | $0 | לא. |
| **Odoo (CRM+Project+Sales+Inventory)** | Python | LGPL (Community) / Enterprise | הכי קרוב ל-"ERP לקבלן": CRM, הצעות מחיר, חתימה, רכש/מלאי, פרויקטים, Gantt (Enterprise בלבד), תמיכת RTL/עברית קיימת ⚠️ | $24.90/משתמש/חודש ב-Enterprise; customization = מודולי Python; "הכל-בכל" ששורף זמן של 2 מפתחים | ~$300–600/חודש ל-10–20 משתמשים | **רק אם** תחליטו לוותר על בניית הליבה ולהפוך ל"מתאימי Odoo". לא ממליץ בשלב הזה. |
| **ERPNext / Frappe** | Python (Frappe) | GPLv3 | חינם לגמרי self-host; CRM בסיסי + Project + Stock + Accounting; Frappe Cloud $50/site/חודש | DevOps לא טריוויאלי; PM בסיסי; Gantt בסיסי | $0 | לא (אותה סיבה כמו Odoo, עם פחות ליטוש). |
| **Plane** | Python/Next | AGPL-3.0 | PM מודרני (issues, cycles, pages), 48k⭐, API | כלי ניהול משימות של מפתחים, לא lifecycle לקוח | $0 | לא כליבה; אולי לניהול המשימות הפנימיות של הצוות. |
| **Vikunja** | Go | AGPL-3.0 | קל, Kanban/Gantt בסיסי, CalDAV | קטן (4k⭐) | $0 | לא. |

**מסקנה 1.1:** אין מועמד שחוסך עבודה נטו. ה-CRM-ים נותנים "אנשי קשר + עסקאות + מייל", ואתם צריכים "פרויקט עם 10 שלבים, לו"ז, מסמכים, רגולציה, צוות שטח ולקוח". **בונים את הליבה; שואלים מ-Twenty את צורת ה-workflow ומ-OpenSolar את ההיררכיה Milestones→Stages→Actions.**

### 1.2 CRM-ים סולאריים (מה השוק מצפה)

| מוצר | מודל | מה מלמד אותנו |
|---|---|---|
| **OpenSolar** (חינם) | Workflow = **Milestones → Stages → Actions**; Kanban לפי שלבים; מסמכים לפרויקט | ההיררכיה הנכונה: אבן-דרך (ציבורית ללקוח) ← שלבים פנימיים ← פעולות/צ'קליסט. |
| **Enerflo** (Install Tracker) | אבני דרך מותאמות, **action groups**, התראות אוטומטיות ללקוח ולנציג, **change orders**, פורטל לקוח white-label | שינויים בהיקף (change orders) הם ישות; הלקוח רואה אבני דרך, לא משימות. |
| **Scoop Solar** | Mobile-first: **צ'קליסטים מודרכים, תמונות, חתימות, offline**, work orders, O&M | הצד של הטכנאי: צ'קליסט פר-שלב עם תמונות חובה, עובד בלי קליטה (גג/חדר חשמל). |
| **Bodhi** (נרכשה ע"י OneEthos, 3/2026) | רק חוויית לקוח: עדכוני אבני-דרך ב-SMS/מייל/אפליקציה, מאגר מסמכים, סקרים, הפניות, **התראות ממערכות ניטור** (Enphase/SolarEdge/SMA) | "סטטוס-פייג'" ללקוח + פעולות אחרי החיבור (ניטור→תחזוקה) = מקור הכנסה חוזר. |
| **Solargraf** | היתרים כמוצר: סטטוס היתר **ordered/received/rejected**, DB של 16k רשויות, חתימה אלקטרונית, BOM | מעקב הגשה רגולטורית = ישות עם סטטוסים משלה (אצלכם: חח"י/רשות החשמל/רשות מקומית). |
| **SolarNexus** | **צ'קליסטים לפי שלב מקושרים ל-deliverables/מסמכים**; ישות פרויקט אחת מהליד עד ההתקנה | מעבר שלב = תנאי "מסמכים X,Y קיימים". |
| **Sunbase** | "מערכת הפעלה" מליד ועד חיבור; proposal + CRM + PM | כולל הכל, מרגיש מיושן; לא רלוונטי לישראל. |
| **Aurora Solar** | תכנון + Sales Mode; **אין CRM**; סנכרון דו-כיווני ל-Salesforce/HubSpot | כלי תכנון נפרד מה-CRM, מקושר דרך `project_id` — כמו ה-Python generator שלכם. |
| **SolarSuccess** (Blu Banyan) | ERP על NetSuite | רלוונטי רק לחברות גדולות. |

**נתון שימושי לשיווק פנימי:** לפי Energyscape, ~2/3 מפרויקטי הסולאר מתעכבים בשלב ההיתר/חיבור לרשת, ו-CRM גנרי לא יודע לעקוב אחרי זה → זה בדיוק הערך של ה-engine שלכם.

### 1.3 Feature Benchmark — מה CRM-lifecycle סולארי "אמור" לעשות

סימון: ✅ קיים · ◐ חלקי · ✗ אין · (B.E.E) = עדיפות מומלצת: **P0** חובה ל-MVP, **P1** רבעון שני, **P2** אחר כך.

| # | יכולת | OpenSolar | Enerflo | Scoop | Bodhi | Solargraf | Twenty | Odoo | **B.E.E** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Pipeline לידים (מקור, ניקוד, SLA לתגובה) | ✅ | ✅ | ◐ | ✗ | ✅ | ✅ | ✅ | P0 |
| 2 | היררכיית Milestones→Stages→Actions מותאמת | ✅ | ✅ | ✅ | ✗ | ◐ | ◐ (workflows) | ◐ | P0 |
| 3 | תנאי מעבר שלב (gates: מסמך/חתימה/תשלום) | ◐ | ✅ | ✅ | ✗ | ◐ | ✗ | ✗ | P0 |
| 4 | צ'קליסט פר-שלב עם תמונות חובה + offline | ✗ | ◐ | ✅ | ✗ | ✗ | ✗ | ✗ | P1 |
| 5 | מעקב הגשות רגולטוריות (חח"י/רשות/עירייה) כסטטוס נפרד | ◐ | ✅ | ◐ | ✗ | ✅ | ✗ | ✗ | P0 |
| 6 | לו"ז פר-פרויקט + Gantt רב-פרויקטי + שיבוץ צוותים | ◐ | ✅ | ✅ | ✗ | ◐ | ✗ | ✅ (Ent.) | P1 |
| 7 | תזכורות/SLAs/"פרויקט תקוע" | ◐ | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ | P0 |
| 8 | מסמכים: תיקייה לפרויקט, גרסאות, תצוגת PDF | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | P0 |
| 9 | הצעת מחיר/BOM → חוזה → חתימה אלקטרונית | ✅ | ✅ | ✗ | ✗ | ✅ | ✗ | ✅ | P1 |
| 10 | פורטל לקוח (סטטוס, מסמכים, חתימה, תשלום) | ◐ | ✅ | ✗ | ✅ | ◐ | ✗ | ✅ | P1 |
| 11 | הודעות אוטומטיות ללקוח במעבר אבן-דרך (WA/SMS/מייל) | ◐ | ✅ | ◐ | ✅ | ◐ | ◐ | ◐ | P0 |
| 12 | Change orders (שינוי היקף/מחיר) | ✗ | ✅ | ◐ | ✗ | ✗ | ✗ | ✅ | P2 |
| 13 | רכש/מלאי/ספקים לפרויקט | ✗ | ◐ | ◐ | ✗ | ◐ | ✗ | ✅ | P2 |
| 14 | O&M: ניטור → תקלה → קריאת שירות | ✗ | ✗ | ✅ | ✅ | ✗ | ✗ | ◐ | P2 |
| 15 | יומן תקשורת מאוחד (WA/מייל/שיחות) על הפרויקט | ◐ | ✅ | ◐ | ✅ | ◐ | ✅ | ✅ | P0 |
| 16 | תפקידים: בעלים/מהנדס/טכנאי/לקוח/בודק/ספק | ◐ | ✅ | ✅ | ◐ | ◐ | ◐ | ✅ | P0 |
| 17 | API/Webhooks לאינטגרציה (n8n, generator) | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | P0 |
| 18 | AI: intake מהודעות, סיכומי שרשורים, טיוטות | ✗ | ✗ | ✗ | ✅ (AI assistant) | ✗ | ✅ | ◐ | P1 |
| 19 | דוחות: זמן בכל שלב, צוואר בקבוק, תחזית הכנסה | ◐ | ✅ | ✅ | ◐ | ✅ | ◐ | ✅ | P1 |
| 20 | התאמה לישראל: עברית/RTL, חגים, חח"י, ת"ז, ח.פ., מע"מ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | P0 |

**קישורים:** OpenSolar workflows: https://support.opensolar.com/hc/en-us/articles/13277670208271 · Enerflo PM: https://enerflo.com/features/project-management · Scoop: https://www.scoop.solar/blog/best-solar-project-management-software-features/ · Bodhi: https://www.bodhi.solar/solar-project-management-software · Solargraf permits: https://get.solargraf.com/permits · SolarNexus: https://solarnexus.com/solutions/ · Energyscape (אבני דרך + 2/3 עיכובים): https://energyscaperenewables.com/post/solar-crm-pipeline-visibility-lead-to-pto-2026/ · Sunbase 10 features: https://www.sunbasedata.com/blog/must-have-features-for-your-solar-crm-the-top-10-to-ensure-success · Twenty: https://github.com/twentyhq/twenty · Twenty workflow actions (אומת): https://github.com/twentyhq/twenty/tree/main/packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions · EspoCRM Advanced Pack: https://docs.espocrm.com/extensions/advanced-pack/overview/ · השוואת CRM פתוחים: https://www.getmunin.com/en/journal/best-open-source-crm/ , https://github.com/macro-inc/work-tool-comparisons/blob/main/rankings/best-open-source-crm.md · Odoo vs ERPNext: https://www.erpresearch.com/compare/erpnext-vs-odoo · Plane vs Vikunja: https://openalternative.co/compare/plane/vs/vikunja

---

## 2. מנועי Workflow / State

### 2.1 שני דברים שונים שמתבלבלים

- **מכונת מצבים (איפה הפרויקט):** אילו מעברים מותרים, אילו תנאים (guards), מה קורה במעבר. → **XState v5** או מכונה ידנית בטבלה.
- **ביצוע עמיד לאורך זמן (מה צריך לקרות ומתי):** "אם לא הייתה תשובה מחח"י 14 יום → תזכורת", "3 ימים אחרי התקנה → שאלון", retries, cron. → **תור ב-Postgres** (`pg-boss`) או מנוע durable execution.

פרויקט סולארי חי חודשים, עם המתנות לבני-אדם (לקוח חותם, חח"י מאשרת, עירייה). זה **לא** workflow קוד-ארוך (Temporal-style) אלא **ישות עם סטטוס + אירועים + טיימרים**. לכן: event-sourcing קל בטבלה + טיימרים בתור, לא "workflow function שרץ 4 חודשים".

### 2.2 טבלת החלטה

| אפשרות | מה זה | יתרונות | חסרונות | עלות/משאבים | המלצה |
|---|---|---|---|---|---|
| **XState v5** | statecharts ב-TS; actors; persistence דרך `getPersistedSnapshot()` / `createActor(machine,{snapshot})` ⚠️ (docs חסומים) | מודל מצבים מפורש וניתן לציור (Stately); guards; hierarchical states (למשל `submission.iec.waiting`); אותו קוד בשרת ובלקוח (להציג כפתורים מותרים) | רק מודל, לא scheduler; צריך לשמור snapshot/אירועים ב-DB בעצמכם; actions עם side-effects לא רצים מחדש בשחזור (זה טוב) | $0 | **כן, כ"ספק אמת" למעברים.** לשמור `projects.state` + טבלת `project_events` (event sourcing). |
| **pg-boss** | תור משימות ב-Postgres (SKIP LOCKED); Node ≥22.12, PG ≥13; MIT | cron + RRULE, retries עם backoff, DLQ, priority, pub/sub, OTel, **adapters ל-Drizzle/Kysely/Prisma להכנסת job באותה טרנזקציה**, multi-master | מתוחזק ע"י אדם אחד; לא "durable workflow" (אין step memoization) | $0, אין Redis | **כן. הבסיס לכל התזכורות/SLAs/sync jobs.** |
| **pg-workflows** | durable steps על pg-boss (`step.run/waitFor/delay/waitUntil/poll`, child workflows, cron); MIT | ה-API של Inngest בלי שרת; אפס תשתית | 63⭐ — מוקדם; סיכון נטישה | $0 | אופציה ל"רצפי הודעות" (drip) אם לא רוצים לכתוב state machine לכל רצף. לא לליבה. |
| **BullMQ** | תור על Redis (Twenty משתמש) | בוגר, מהיר | מוסיף Redis; אין טרנזקציה עם ה-DB | Redis | לא, pg-boss מספיק. |
| **Temporal** | durable execution enterprise | הכי חזק | Postgres+ES+UI+server; מדריכים ממליצים 4 vCPU/16GB ⚠️; ריפו docker-compose בארכיון; דטרמיניזם; יותר מדי לצוות של 2 | כבד | **לא.** |
| **Inngest** | event-driven steps; self-host binary (SQLite), SSPL + DOSP→Apache | DX מצוין (`step.waitForEvent`) | SSPL; self-host חד-צומתי, "community supported"; עוד שירות | $0 self-host | לא (pg-workflows נותן 80% בלי שרת). |
| **Trigger.dev v4** | TS durable tasks; Apache-2.0 | אין דטרמיניזם; טוב ל-AI tasks ארוכים | self-host = postgres+redis+clickhouse+registry+supervisor, ~4GB RAM מינימום ⚠️ | $0 self-host | לא לליבה; אולי מאוחר יותר ל-AI batch jobs. |
| **n8n** | low-code; Sustainable Use License; WhatsApp Cloud node + WhatsApp Trigger (אומת בריפו) + Gmail nodes; queue mode | אינטגרציות מהירות; כבר אצלכם | לא מקור אמת למצב; קשה לבדוק (tests); fair-code (אסור למכור כ-SaaS) | VPS | **כן, לקצוות בלבד:** webhooks נכנסים מ-Meta/Gmail → POST ל-API שלכם; לא לוגיקת שלבים. |
| **Windmill** | code-first flows (TS/Python/Go/SQL), AGPL + EE; יש approval/suspend steps ⚠️ | מהיר, scripts כ-UI אוטומטי, approvals | עוד פלטפורמה ללמוד; כפילות עם n8n | $0 self-host | לא (יש לכם n8n). |
| **Node-RED** | flows, Apache-2.0 | IoT | מיושן לעסקי | $0 | לא (אולי לניטור אינוורטרים בעתיד). |

### 2.3 תבנית ארכיטקטונית מומלצת (Fastify + Postgres)

```
projects(id, customer_id, state text, state_entered_at, sla_due_at, ...)
project_events(id, project_id, type, payload jsonb, actor_id, created_at)      -- event sourcing (append-only)
project_stage_defs(code, milestone, order, gates jsonb, customer_visible bool)   -- מההגדרה של OpenSolar
tasks(id, project_id, stage_code, title, assignee_id, due_at, status, checklist jsonb, requires jsonb)
task_dependencies(pred_task_id, succ_task_id, type 'FS'|'SS', lag_days)
submissions(id, project_id, authority 'IEC'|'ELEC_AUTH'|'MUNI', status, submitted_at, due_at, ref_no)  -- כמו Solargraf
reminders/jobs -> pg-boss (schema pgboss)
approvals(id, kind 'outbound_msg'|'quote'|..., payload, requested_by 'agent'|'user', status, decided_by)  -- Trust Gate
```

- **מעבר שלב = פונקציה אחת:** `transition(projectId, event)` → XState מחשב מצב חדש + guards (למשל "חוזה חתום קיים") → בטרנזקציה: עדכון `projects.state`, הוספת `project_events`, `pgboss.send()` לטיימרים (SLA, follow-up), פרסום webhook פנימי (n8n/AI).
- **SLAs:** בכל כניסה לשלב מתזמנים job `stage.sla_check` ל-`sla_due_at`; ה-job בודק אם המצב עדיין זהה (idempotent) ואם כן — יוצר התראה/משימה.
- **"פרויקט תקוע":** view SQL (`now() - state_entered_at > expected_duration`) + job יומי.
- **שחזור:** לעולם לא שומרים רק snapshot של XState; `project_events` הוא מקור האמת, ה-snapshot הוא cache.

**קישורים:** XState v5: https://stately.ai/blog/2023-12-01-xstate-v5 · pg-boss: https://github.com/timgit/pg-boss · pg-workflows: https://github.com/SokratisVidros/pg-workflows · Temporal compose (archived): https://github.com/temporalio/docker-compose · Inngest: https://github.com/inngest/inngest · Trigger.dev self-host: https://trigger.dev/docs/self-hosting/docker · n8n WhatsApp nodes (קוד): https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes/WhatsApp · n8n WhatsApp credentials: https://docs.n8n.io/integrations/builtin/credentials/whatsapp · Windmill: https://github.com/windmill-labs/windmill · השוואות 2026: https://apiscout.dev/guides/inngest-vs-triggerdev-vs-temporal-2026 , https://www.buildmvpfast.com/blog/inngest-vs-trigger-dev-vs-bullmq-background-jobs-nextjs-2026 , https://automationatlas.io/guides/n8n-vs-windmill-2026-comparison/

---

## 3. לו"זים / Gantt / יומן

### 3.1 ספריות Gantt ויומן

| ספרייה | רישיון/מחיר | מה כלול | מה חסר | המלצה |
|---|---|---|---|---|
| **Bryntum Gantt** | מסחרי: $940/מפתח, **מינימום 3 מפתחים** (~$2,820) + OEM לשימוש SaaS | הכי יפה; מנוע scheduling, critical path, resources, dependencies UI | יקר ל-2 מפתחים; OEM | לא בשלב זה. |
| **DHTMLX Gantt** | Community = MIT (אומת בריפו, v10.0.3); PRO: Individual $799 / Commercial $1,399 (5 devs) / Enterprise $2,999 | Community: dependencies (4 סוגים), drag, milestones, summary tasks, lightbox, 32 locales, export | **PRO בלבד:** auto-scheduling, critical path, resources, baselines, undo, working calendars, constraints | **מועמד #1 לתשלום** (Individual $799 מספיק ל-OEM פנימי ⚠️ לבדוק תנאי שימוש SaaS). |
| **Syncfusion Gantt (React)** | **Community License חינם** אם הכנסה < $1M, ≤5 מפתחים, ≤10 עובדים — B.E.E עומדת בזה ⚠️ (לבדוק מול תנאי הרישיון) | critical path, resources, baselines, dependency editing UI, RTL | ספרייה כבדה; תלות ב-ecosystem של Syncfusion | **מועמד #1 בחינם.** |
| **SVAR Gantt** | MIT (React + Svelte, v2.4+); PRO perpetual (מחיר ⚠️) | חינם: drag&drop, links, zoom, editing, virtualization, TS; **PRO:** critical path, resources/workload, auto-scheduling, work calendars, baselines, undo, export | — | אלטרנטיבה קלה ומודרנית ל-React. |
| **frappe-gantt** | MIT | פשוט, dependencies, holidays/ignore days, view modes | אין critical path/resources/virtualization | ל-MVP של "לו"ז פרויקט בודד" — מספיק. |
| **vis-timeline** | Apache/MIT | timeline/groups | ספריית `vis` המקורית מסומנת discontinued; פיתוח איטי | לא. |
| **FullCalendar** | Core MIT; Premium (timeline/resource views) מ-$480/שנה, חידוש -50% | יומן יומי/שבועי/חודשי, drag, Google Calendar plugin | Resource/Timeline בתשלום | **כן ל-"יומן צוותים"**; Premium אם צריך שורת-משאב לכל צוות. |
| **Schedule-X** | MIT (React/Vue/Svelte); תוספים premium ⚠️ | מודרני, i18n, קל | פחות בוגר מ-FullCalendar; resource view ⚠️ premium | חלופה חינמית. |
| **react-big-schedule** | MIT ⚠️ | resource scheduler פשוט | תחזוקה משתנה | ל-"מי עובד איפה היום". |

**המלצה:** MVP — `frappe-gantt` (או SVAR MIT) ללו"ז פרויקט + `FullCalendar` ליומן צוות. כשצריך critical path/שיבוץ משאבים — Syncfusion (אם זכאים ל-Community) או DHTMLX PRO Individual.

### 3.2 Critical path ותלויות — לממש בשרת, לא בספרייה

ל-20–60 משימות לפרויקט, CPM זה 50 שורות: טופולוגי sort → forward pass (ES/EF) → backward pass (LS/LF) → slack=0 ⇒ קריטי. חשבו בימי עבודה בלבד (א'–ה' + חגים). זה נותן לכם: "מועד חיבור צפוי", "אילו משימות מזיזות את התאריך", ו"שלב X מאחר ב-N ימים" — בלי תלות בספריית UI. ספריית ה-Gantt רק מציירת.

### 3.3 Google Calendar — סנכרון דו-כיווני

דפוס (מהתיעוד של Google, כפי שסוכם במקורות משניים — הדף הרשמי חסום):
1. **Push:** `events.watch` על כל יומן (צוות/טכנאי) → webhook HTTPS מאומת-דומיין (Cloudflare Tunnel עובד). ה-token שאתם מעבירים חוזר ב-`X-Goog-Channel-Token` → לאמת.
2. **Pull:** ההודעה לא מכילה את השינוי; מריצים `events.list` עם `syncToken` (incremental). אם 410 Gone → full sync.
3. **חידוש ערוצים** לפני expiry (job ב-pg-boss). ⚠️ TTL מקסימלי של ערוץ Calendar — לא אומת.
4. **מניעת לולאות:** שומרים `extendedProperties.private.bee_event_id` על אירועים שיצרתם; מתעלמים משינויים ש-`updated` שלהם שווה ל-etag ששמרתם.
5. **מי בעל האמת:** המערכת שלכם לזמני משימות; Google רק תצוגה + עריכה ידנית שמייצרת אירוע `schedule.changed_externally` לאישור.

### 3.4 חגים ישראליים

- **`@hebcal/core`** — TypeScript, offline (בלי API), `il: true` לחגי ישראל, כולל חגים מודרניים (יום הזיכרון/העצמאות). **רישיון GPL-2.0** — שימוש פנימי ללא הפצה בסדר; אם תפיצו קוד ללקוחות — זהירות. חלופה: **Hebcal REST API** (ללא מפתח, 90 בקשות/10 שניות, CC-BY 4.0) — לקרוא פעם בשנה ולשמור טבלת `holidays(date, name, is_work_day, is_half_day)`.
- המלצה: טבלת `business_calendar` ב-Postgres (שישי חצי יום/לא, ערבי חג, חוה"מ לפי מדיניות החברה) שמוזנת מ-hebcal פעם בשנה ונערכת ידנית. CPM ותזכורות משתמשים רק בה.

**קישורים:** Bryntum: https://bryntum.com/blog/top-5-javascript-gantt-chart-libraries/ · DHTMLX: https://github.com/DHTMLX/gantt , https://dhtmlx.com/blog/top-8-javascript-gantt-chart-libraries-2026/ · Syncfusion: https://www.syncfusion.com/blogs/post/top-5-javascript-gantt-chart-libraries · SVAR: https://svar.dev/blog/react-gantt-pro-2-4-released/ , https://github.com/svar-widgets/gantt · frappe-gantt: https://github.com/frappe/gantt · FullCalendar pricing: https://fullcalendar.io/pricing · Schedule-X: https://github.com/schedule-x/schedule-x · Google push: https://developers.google.com/workspace/calendar/v3/push · Google Calendar webhooks guide: https://codewords.ai/blog/google-calendar-webhooks · hebcal-es6: https://github.com/hebcal/hebcal-es6 · Hebcal API: https://www.hebcal.com/home/developer-apis

---

## 4. תקשורת עם לקוחות

### 4.1 WhatsApp — רשמי מול לא-רשמי

| | **Meta WhatsApp Business Cloud API** (ישירות או דרך BSP) | **גשר לא-רשמי** (Baileys / whatsapp-web.js / Hermes) |
|---|---|---|
| חוקיות | מותר; חוזה עם Meta; תבניות מאושרות | מפר ToS; המתחזקים של Baileys עצמם: "We discourage any bulk or automated messaging usage" |
| סיכון | נמוך; quality rating יכול לרדת ולחסום תבניות שיווק | **חסימת מספר** (מקורות מדווחים על חסימה תוך שבועות בדפוסים אוטומטיים ⚠️), אובדן היסטוריה, **סיכון שרשרת-אספקה** (חבילת "anti-ban" lotusbail נתפסה גונבת sessions, 4/2026) |
| תמחור ישראל (⚠️ ממקורות משניים, בתוקף 1.10.2026) | Marketing ≈ **$0.0353**/הודעה; Utility ≈ **$0.0053**; Authentication ≈ $0.0053; מענה בחלון 24h = חינם; utility בתוך חלון 24h = חינם; ~1,000 שיחות service חינם/חודש למספר | "חינם" |
| יכולות | תבניות עם כפתורים, Flows (טפסים), webhooks, מדיה, קריאה/כתיבה מכל שרת | הכל, כולל קבוצות |
| תפעול | צריך Business Verification, מספר ייעודי (לא המספר האישי בלי migration), תבנית לכל הודעה יזומה | QR + session |

**חישוב עלות:** 300 פרויקטים/שנה × ~15 הודעות utility (עדכוני אבני-דרך, תזכורות) × $0.0053 ≈ **$24/שנה**. כלומר העלות אפסית; הסיכון הוא הכל. **כל הודעה יזומה ללקוח → Cloud API.** את Hermes להשאיר לקריאת הודעות נכנסות של המספר הישן/האישי ולניהול פנימי של הצוות — או להעביר גם אותו ל-webhooks של Cloud API.

**BSP ישראלי או ישיר?** ישיר (Meta Cloud API) = בלי עמלת BSP, צריך לבנות inbox בעצמכם (יש לכם). BSP ישראלי (CommBox, Glassix, Pulseem, Lynxbe, InforU) = inbox מוכן, בוטים, תמיכה בעברית, אבל דמי מנוי. **360dialog** = BSP גלובלי בעלות קבועה נמוכה ⚠️. המלצה: **ישיר דרך n8n WhatsApp Trigger → API שלכם**, או ישירות ל-Fastify webhook.

**תבניות:** קטגוריות Utility (עדכון סטטוס/תזכורת תור) / Marketing / Authentication; Meta מאשרת (בד"כ דקות–שעות) ועלולה לסווג מחדש utility→marketing אם יש שפה שיווקית ⚠️. לכתוב תבניות "יבשות": `שלום {{1}}, פרויקט {{2}}: {{3}}. לפרטים: {{4}}`.

### 4.2 SMS (גיבוי/OTP/ללקוחות בלי WhatsApp)

| ספק | מה | הערות |
|---|---|---|
| **InforU (InforUMobile)** | מוביל שוק בישראל; REST API, Zapier/Make, גם WhatsApp | חבילות; מחיר להודעה יורד עם הנפח (מחיר מדויק ⚠️); שימו לב: **עברית = 70 תווים לסגמנט** (UCS-2) |
| **019 SMS (Telzar)** | API ב-HTTP POST JSON/XML ל-`https://019sms.co.il/api`; יש client ב-Go | זול יחסית ⚠️; תיעוד חסום בבדיקה |
| **Twilio** | ⚠️ ~$0.2575 לסגמנט יוצא לישראל (מספר/alphanumeric) לפי מקור משני | יקר פי 5–10 מספק מקומי; רק אם רוצים API אחד גלובלי |
| **Telnyx** | בסיס $0.004 + עמלות carrier (ישראל ⚠️ לא אומת) | דורש בדיקת מחיר בפועל לישראל |

**רגולציה:** חוק הספאם (תיקון 40 לחוק התקשורת) — הודעות שיווקיות דורשות הסכמה מפורשת והסרה; הודעות תפעוליות (סטטוס פרויקט, תור) מותרות. לשמור `consent_marketing` על הלקוח.

### 4.3 מייל

- **Gmail API** דרך Workspace הקיים — נכון למיילים "אנושיים" (מהנדס ↔ לקוח, שרשורים), כי זה נשאר ב-Sent של ברק. מגבלת שליחה יומית של Workspace (~2,000/משתמש/יום ⚠️).
- **טרנזקציוני** (magic links, "המסמך מוכן"): **Resend** (3,000/חודש חינם, $20 ל-50k) או **Postmark** ($15 ל-10k, המוניטין הטוב ביותר ב-deliverability). דומיין נפרד/תת-דומיין (`mail.bee.co.il`) עם SPF/DKIM/DMARC כדי לא לפגוע ב-Gmail הראשי.

### 4.4 פורטל לקוח — דפוסים

1. **כניסה:** magic link (Better Auth `magic-link`) או OTP ב-WhatsApp/SMS (`email-otp`/`phone-number` plugins). בלי סיסמאות. קישור לפרויקט ספציפי, תוקף 15 דק', חד-פעמי; session ארוך על המכשיר.
2. **דף סטטוס** = אבני-דרך בלבד (customer_visible=true), "השלב הבא ומה אנחנו צריכים ממך", איש קשר, תאריך צפוי (מה-CPM, מעוגל לשבוע).
3. **מסמכים:** URL חתום (S3 presigned, 10 דק') מ-R2/B2; לא לחשוף מפתחות; לוג הורדות.
4. **חתימה:** **Documenso** (AGPL, self-host, API tRPC/REST, חתימת PAdES עם P12) — או שירות ישראלי. לפי חוק חתימה אלקטרונית תשס"א-2001: חתימה אלקטרונית "רגילה" תקפה לחוזה כשאין דרישת חוק לחתימה מאושרת; לחוזי התקנה זה מספיק, בצירוף לוג (IP, זמן, OTP). ⚠️ לאשר עם עו"ד.
5. **תשלום:** קישור תשלום — **Grow (Meshulam)** דרך Green Invoice (עמלה 0.95–1.6% + 1.2 ₪ ⚠️), **Cardcom** (REST JSON, ~1.2–1.4% + ~59 ₪/חודש למודול חשבוניות ⚠️), **Tranzila** (ותיק, Bit/Apple Pay/מס"ב), **PayPlus**. לבחור את מי שכבר מפיק לכם חשבוניות (חשבונית ירוקה/iCount) כדי שהקבלה תיווצר אוטומטית.
6. **עברית/RTL** כברירת מחדל; אנגלית/רוסית/ערבית כ-i18n אם יש לקוחות כאלה.

**קישורים:** תמחור WA (משני): https://sleekflow.io/en-us/blog/whatsapp-business-price , https://flowcall.co/blog/whatsapp-business-api-pricing-2026 , https://setsmart.io/blog/whatsapp-business-api-pricing · Meta (חסום בבדיקה): https://developers.facebook.com/docs/whatsapp/pricing · Baileys: https://github.com/WhiskeySockets/Baileys · סיכוני חסימה: https://www.adviseai.in/blog/whatsapp-automation-ban-risk , https://whatsapp.checkleaked.cc/blog/whatsapp-cloud-api-vs-unofficial · BSP ישראליים: https://www.commbox.io/he/whatsapp-business-2/ , https://www.glassix.com/whatsapp-business , https://site.pulseem.com/services/whatsapp-4/ , https://www.lynxbe.co.il/en/lynxbe-platform-whatsapp , https://360dialog.com/whatsapp-api · InforU API: https://www.inforu.co.il/api-%D7%9C%D7%A9%D7%9C%D7%99%D7%97%D7%AA-%D7%94%D7%95%D7%93%D7%A2%D7%95%D7%AA-sms/ , מדריך: https://yehonatandev.com/blog/inforu-sms-api-integration · 019: https://docs.019sms.co.il/sms/ , https://github.com/multi-sms-api/telzar_sms · השוואת SMS ישראל: https://textme.co.il/%D7%9B%D7%9C%D7%9C%D7%99/sms-platforms-comparison-israel-2026/ · Twilio IL: https://www.twilio.com/en-us/sms/pricing/il · Telnyx: https://telnyx.com/pricing/messaging · Resend vs Postmark: https://automationatlas.io/guides/resend-vs-sendgrid-vs-postmark-2026-comparison/ · Documenso: https://github.com/documenso/documenso , השוואת חתימה פתוחה: https://www.esign.ai/blog/open-source-e-signature-api · חוק חתימה אלקטרונית: https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7_%D7%97%D7%AA%D7%99%D7%9E%D7%94_%D7%90%D7%9C%D7%A7%D7%98%D7%A8%D7%95%D7%A0%D7%99%D7%AA , https://easydo.co.il/%D7%91%D7%9C%D7%95%D7%92/ · תשלומים: https://www.greeninvoice.co.il/market/clearing/meshulam , https://www.greeninvoice.co.il/payment-links , https://www.tranzila.com/llms.txt , https://docs.base44.com/he/Setting-up-your-app/accepting-payments-israel

---

## 5. מסמכים ואחסון

### 5.1 אחסון אובייקטים

| אפשרות | מחיר (⚠️ ממקורות משניים 2026) | יתרונות | חסרונות | המלצה |
|---|---|---|---|---|
| **Cloudflare R2** | $0.015/GB-חודש; **egress $0**; Class A $4.50/M; Class B $0.36/M; 10GB חינם | כבר על Cloudflare; אפס עלות הורדה (לקוחות מורידים PDF/תמונות); S3-compatible; location hint EU | יקר פי 2 מ-B2 לאחסון טהור | **ראשי** למסמכים "חיים" |
| **Backblaze B2** | $0.00695/GB-חודש (~$6/TB); egress חינם עד 3× האחסון | הכי זול; S3 API | מהירות/נקודת נוכחות רחוקה יותר | **גיבויים** (DB + replica של R2) |
| **MinIO** (self-host) | חומרה + זמן | שליטה מלאה, data residency בישראל | עוד שירות לתחזק; ⚠️ שינויי רישוי/קהילה ב-2025 | רק אם לקוח/רגולציה דורשים "בישראל" |
| **Google Drive** בלבד | כלול ב-Workspace | ברק כבר עובד שם | API איטי, אין presigned URLs, הרשאות מסורבלות, לא "DB של מסמכים" | **מראה** (mirror), לא מקור אמת |

### 5.2 מודל מסמכים
- `documents(id, project_id, kind 'quote'|'contract'|'iec_form'|'photo'|..., current_version_id, folder_path)` + `document_versions(id, document_id, s3_key, sha256, size, mime, created_by, created_at, source 'upload'|'generated'|'drive')`. Versioning גם ברמת bucket (S3 versioning) כרשת ביטחון.
- **מבנה תיקיות אחיד לפרויקט** (מוכפל ל-R2 ול-Drive): `01-ליד-וסקר / 02-הצעה-וחוזה / 03-תכנון / 04-הגשות (חח"י, רשות, עירייה) / 05-רכש / 06-התקנה (תמונות לפני/אחרי) / 07-בדיקה-ומונה / 08-תחזוקה`.
- **Drive sync חד-כיווני** (אפליקציה → Drive) עם `changes.getStartPageToken/list/watch` רק כדי לזהות שמישהו הוסיף קובץ ידנית ב-Drive ולייבא אותו (עם תיוג "מקור: Drive"). להימנע מדו-כיווני אמיתי (קונפליקטים).
- **תמונות:** `exifr` ל-GPS/כיוון/זמן צילום (מאמת שהצילום מהאתר ומהיום הנכון); **HEIC** → JPEG ב-`sharp` (build עם libheif) או `heic-convert`; יוצרים 3 גדלים (thumb/web/original); **מוחקים EXIF** בעותקים שמשותפים ללקוח/ספק (פרטיות).
- **PDF:** תצוגה בדפדפן עם pdf.js; thumbnails בשרת עם `pdfium-node` (Linux x64 נתמך) — להימנע מ-pdf2pic (דורש GraphicsMagick).
- **מסמכים שנוצרים** (הצעה, טופסי חח"י, שרטוטים מה-Python generator) → נשמרים כגרסה חדשה של אותו `document` עם `source='generated'` ו-hash של הקלט, כדי לדעת אם הם "ישנים" ביחס לנתוני הפרויקט.

**קישורים:** R2 vs B2: https://tech-insider.org/cloudflare-r2-vs-s3-vs-backblaze-b2-2026/ , https://speedtesthq.com/compare/cloudflare-r2-vs-backblaze-b2 · R2 pricing (רשמי, חסום בבדיקה): https://developers.cloudflare.com/r2/pricing/ · Drive changes API: https://developers.google.com/workspace/drive/api/v3/reference/changes · exifr: https://github.com/MikeKovarik/exifr · heic-convert: https://npmjs.com/package/heic-convert · pdfium-node: https://github.com/hyzyla/pdfium · pdf thumbnails: https://www.nutrient.io/blog/pdfjs-generating-pdf-thumbnails-pdf2pic/

---

## 6. אימות, הרשאות ותפקידים

### 6.1 ספריית Auth

| אפשרות | מצב 2026 | המלצה |
|---|---|---|
| **Better Auth** | MIT; framework-agnostic (Fastify דרך node handler); plugins רשמיים: `organization` (roles + custom access control), `admin`, `magic-link`, `email-otp`, `phone-number`, `passkey`, `two-factor`, `api-key`, `sso`; adapters Drizzle/Kysely/Prisma; type inference של session | **כן.** מכסה צוות + לקוחות + API keys ל-n8n/generator. |
| **Auth.js** | מכוון Next.js; magic link יש; אין organizations | לא (אתם Fastify+Vite). |
| **Lucia** | הפסיק להיות ספרייה; המתחזק ממליץ לעבור | לא. |
| **Keycloak / Zitadel / Authentik** | IdP מלאים. Zitadel קל (Go, ~100MB idle, AGPL), Authentik ~300MB + forward-auth, Keycloak JVM | לא עכשיו. רלוונטי רק אם תרצו SSO לכלים חיצוניים (n8n, Grafana, GlitchTip) — ואז Zitadel/Authentik. |

### 6.2 תפקידים (RBAC + ABAC קל)

| תפקיד | רואה | עושה |
|---|---|---|
| owner (ברק) | הכל | הכל, כולל אישור הודעות יוצאות ומחירים |
| engineer | כל הפרויקטים | מעבר שלבים, מסמכים, הגשות |
| technician | פרויקטים שמשובץ להם, רק שלבי שטח | צ'קליסטים, תמונות, סימון "הושלם" |
| customer | הפרויקט שלו בלבד, רק `customer_visible` | חתימה, העלאת מסמכים, תשלום, אישור תור |
| inspector (בודק/חח"י) | פרויקט ספציפי, חלון זמן, מסמכי בדיקה בלבד | העלאת דוח/אישור |
| supplier | הזמנות רכש שלו בלבד | אישור מועד אספקה, תעודת משלוח |
| agent (AI) | כמו engineer לקריאה | כתיבה **רק דרך `approvals`** (Trust Gate) |

### 6.3 Postgres RLS
- הפעלה: `ALTER TABLE projects ENABLE ROW LEVEL SECURITY;` + policy לפי `current_setting('app.user_id', true)` ו-`current_setting('app.role', true)`; בכל request: `BEGIN; SELECT set_config('app.user_id', $1, true); ...` (ה-`true` = מקומי לטרנזקציה — חובה עם connection pool).
- Drizzle תומך הצהרתית (`pgPolicy`, `.enableRLS()`); Kysely — SQL גולמי במיגרציות.
- **יתרונות:** שכבת הגנה שנייה אם route שכח `WHERE`; **ה-role של n8n** (קריאה בלבד) מקבל policy מצומצמת (בלי ת"ז/טלפונים) — פתרון אלגנטי ל"לא לחשוף PII ל-n8n".
- **חסרונות:** ביצועים ב-JOIN-ים כבדים; policies נפרדות ל-SELECT/UPDATE; superuser/owner עוקף; קשה לדבג. **לכן:** RLS כרשת ביטחון, הרשאות עסקיות בקוד (Better Auth access control).

**קישורים:** Better Auth: https://github.com/better-auth/better-auth , השוואות: https://www.better-stack.ai/p/blog/open-source-auth-libraries-in-2026 , https://www.pkgpulse.com/guides/better-auth-vs-lucia-vs-nextauth-2026 · IdPs: https://www.ssdnodes.com/learn/keycloak-vs-authentik-vs-zitadel · RLS: https://oneuptime.com/blog/post/2026-01-21-postgresql-row-level-security/markdown , footguns: https://www.bytebase.com/blog/postgres-row-level-security-footguns.md , Drizzle RLS: https://neon.com/docs/guides/rls-drizzle

---

## 7. AI בתוך ה-CRM

### 7.1 דפוסים (מהבטוח לפחות-בטוח)

| דפוס | קלט → פלט | סיכון | שער |
|---|---|---|---|
| **Intake מובנה** | הודעת WA/מייל חדשה → `{customer, address, phone, roof_type, bill_kwh, urgency, intent}` (structured output עם Zod/JSON schema) → **הצעה** ליצירת ליד | נמוך (רק הצעה) | אישור בלחיצה אחת ב-UI |
| **סיכום שרשור** | כל ההודעות/מיילים של פרויקט → "מה סוכם, מה פתוח, מי חייב מה" | נמוך | ללא |
| **זיהוי תקועים** | SQL של `state_entered_at` + אירועים אחרונים → "למה תקוע + צעד מוצע" | נמוך | ללא; יוצר משימה |
| **טיוטת הודעה ללקוח** | אבן-דרך + תבנית מאושרת → טקסט פרמטרים | **בינוני** (יוצא ללקוח) | **requiresHumanPick** — תמיד |
| **טיוטת הצעת מחיר** | סקר + מחירון → שורות הצעה | **גבוה** (כסף) | אישור מהנדס + diff מול המחירון |
| **עדכון סטטוס אוטומטי** | "חח"י אישרה" במייל → `transition(IEC_APPROVED)` | **גבוה** (מצב אמת) | רק אם מקור = מייל מדומיין חח"י + מספר בקשה תואם; אחרת → approval |

### 7.2 מימוש עם Claude Agent SDK (אומת בתיעוד הרשמי)
- **סדר הערכת הרשאות:** Hooks → deny rules → ask rules → permission mode → allow rules → `canUseTool`. **כלי שאושר ב-allow rule לא מגיע ל-canUseTool** — אז לא לשים `mcp__bee__*` ב-allowedTools אם יש בו כלי כתיבה.
- **Trust Gate / Law #2 ב-SDK:** שרת MCP in-process (`createSdkMcpServer` + `tool()` עם Zod) שחושף `send_customer_message`, `transition_project`, `create_quote`. על הכלים האלה לסמן `_meta["anthropic/requiresUserInteraction"]` → **תמיד** מגיע ל-`canUseTool` גם אם יש allow rule (דורש Claude Code ≥ v2.1.199). ה-callback שלכם: כותב שורה ל-`approvals`, שולח התראה (PermissionRequest hook → WhatsApp לברק), ומחזיר `{behavior:'allow', updatedInput}` / `{behavior:'deny', message}`.
- **המתנה ארוכה (ברק עונה מחר):** לא להחזיק תהליך פתוח — `PreToolUse` hook שמחזיר `defer`, ה-session נשמר ומתחדש כשהאישור מגיע.
- **כלי קריאה בלבד** (`get_project`, `search_messages`, Gmail/Calendar/Drive MCP שכבר קיימים) → `allowedTools` ספציפיים (`mcp__bee__get_*`), לא wildcard.
- **Structured outputs:** `outputFormat` עם JSON schema/Zod לכל intake/classification; לשמור `confidence` ו-`source_message_id` על כל שדה שנחלץ.
- **Idempotency:** כל כלי כתיבה מקבל `idempotency_key` (hash של project_id + action + payload) כדי שחזרה על tool call לא תשלח פעמיים.
- **Audit:** `PostToolUse` hook → `audit_log(actor='agent', tool, input, output, approval_id)`.

**קישורים:** Permissions: https://code.claude.com/docs/en/agent-sdk/permissions · canUseTool & defer: https://code.claude.com/docs/en/agent-sdk/user-input · MCP בתוך ה-SDK: https://code.claude.com/docs/en/agent-sdk/mcp · Approval gates (קהילה): https://dev.to/sekeraradim/human-approval-gates-in-the-claude-agent-sdk-1epe , https://nerdleveltech.com/human-in-the-loop-claude-agent-sdk-typescript-tutorial · Google Workspace MCP: https://www.mindstudio.ai/blog/google-workspace-mcp-server-claude-code-codex

---

## 8. תפעול, גיבויים ופרטיות

### 8.1 Observability לצוות של 2

| רכיב | בחירה | למה |
|---|---|---|
| שגיאות | **GlitchTip** (Sentry-SDK compatible, 4 קונטיינרים, ~0.5–2GB RAM) | Sentry self-host = ~16GB RAM ו-40+ קונטיינרים; GlitchTip נותן 80% ב-10% מהמשאבים. Sentry SaaS חינמי (5k events) גם אופציה. |
| זמינות | **Uptime Kuma 2.x** (MIT, 90+ ערוצי התראה, status pages) | מנטר גם את ה-tunnel, n8n, webhook של Meta, ו-cron "heartbeat" של pg-boss (push monitor). |
| לוגים/מטריקות | pino → Docker logs; Grafana+Loki רק אם תרגישו צורך; pg-boss מייצא OTel | לא להתחיל מ-Grafana stack. |
| בריאות תהליכים | טבלת `pgboss.job` + view "jobs failed last 24h" בדשבורד שלכם | חינם, בלי כלי נוסף. |

### 8.2 גיבויים
- **PITR:** **WAL-G** (Apache-2.0; S3/B2/R2; base backups + WAL archiving; delta; הצפנה) — קל ב-Docker (sidecar עם `archive_command`). חלופה: **pgBackRest** (MIT, v2.59.3 10/2026, block-incremental, מקבילי) — חזק יותר, מורכב יותר להרכבה ב-Docker.
- **רשת ביטחון:** `pg_dump` יומי מוצפן ל-B2 (restic) — שחזור פשוט ובלתי-תלוי.
- **R2 → B2 replication** שבועית (rclone) + S3 versioning.
- **תרגול שחזור** רבעוני עם timer. זה גם דרישה רגולטורית (ראו 8.3).

### 8.3 הדין הישראלי: תקנות אבטחת מידע 2017 + תיקון 13

**עובדות מאומתות ממקורות משניים (ראו ⚠️ בסוף):**
- תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017 — בתוקף מ-5/2018; ארבע רמות: **מאגר המנוהל בידי יחיד / בסיסית / בינונית / גבוהה**, לפי סוגי המידע, מספר נושאי המידע ומספר בעלי ההרשאה.
- **תיקון 13** נכנס לתוקף **14.8.2025**: חובת **הודעה** על מאגרים במקום רישום (ברוב המקרים), הרחבת סמכויות אכיפה ועיצומים כספיים לרשות להגנת הפרטיות, חובת מינוי **ממונה הגנת פרטיות** לארגונים העומדים בקריטריונים (אי-אכיפה זמנית עד 31.10.2025), הגדרות מחודשות של "מידע" ו"מידע בעל רגישות מיוחדת".

**מה זה אומר ל-B.E.E (ניתוח, לא ייעוץ משפטי):**

| מה אתם שומרים | סיווג סביר | השלכה |
|---|---|---|
| שם, טלפון, כתובת, מייל | מידע אישי | בסיס |
| **ת"ז** / ח.פ., צילום ת"ז | מזהה ייחודי; צילום = מסמך רגיש | **מינימיזציה:** לשמור מספר רק אם חח"י/חוזה דורשים; לא לשמור צילום, או למחוק אחרי ההגשה |
| חשבונות חשמל, צריכה, תעריף | ⚠️ "מצב כלכלי / הרגלי צריכה" — ייתכן מידע בעל רגישות מיוחדת | עלול להעלות ל**רמה בינונית** (תלוי במספר בעלי הרשאה ⚠️) |
| תמונות הבית/הגג, GPS | מידע על רכוש ומיקום | הרשאות לפי פרויקט, מחיקת EXIF בשיתוף |
| הקלטות/תמלולי WhatsApp | תקשורת | שמירה לזמן מוגדר; לא לתת ל-LLM חיצוני בלי DPA |

**רשימת חובות מעשית (מכסה בסיסית/בינונית):**
1. **מסמך הגדרות מאגר** (מטרות, סוגי מידע, מקור, העברות לצד ג' — Cloudflare, Meta, Google, Anthropic, ספק SMS, סליקה) + **נוהל אבטחה**.
2. **ניהול הרשאות** לפי תפקיד (פרק 6), הסרה בעזיבה, 2FA לצוות (Better Auth `two-factor`/passkey).
3. **תיעוד גישה (audit log)** — מי ראה/שינה רשומת לקוח; שמירה ≥ 24 חודשים ⚠️ (לפי התקנות לרמה בינונית).
4. **הצפנה:** TLS (Caddy/Cloudflare), דיסק/DB מוצפן, SSE ב-R2/B2, מפתחות ב-secret store; **אין PII בלוגים** (pino redact).
5. **גיבוי ושחזור** מתועדים ונבדקים (8.2).
6. **סקר סיכונים ומבדק חדירה** תקופתיים (ברמה בינונית/גבוהה ⚠️ תדירות 18/24 חודשים לפי התקנות).
7. **הודעה לנושא המידע בעת האיסוף** (סעיף 11 לחוק): בטופס הליד/פורטל — למה אוספים, למי מעבירים, זכות עיון.
8. **הסכמי עיבוד (DPA)** עם כל ספק ענן; העדפת אזור EU (R2 location hint, Anthropic/Google data processing terms).
9. **שמירה ומחיקה:** מדיניות retention (למשל לידים שלא נסגרו — 12 חודשים; פרויקטים — 7 שנים לצרכי מס/אחריות).
10. **דיווח על אירוע אבטחה חמור** לרשות (ולנושאי המידע אם נדרש) — נוהל + איש קשר.
11. **ממונה הגנת פרטיות:** ⚠️ לבדוק אם הקריטריונים חלים (סביר שלא לעסק קטן שאינו עוסק בעיבוד מידע כעיקר עיסוקו — לאמת מול הרשות/עו"ד).
12. **AI:** לא לשלוח ת"ז/מסמכי זהות ל-LLM; להעביר רק שדות נחוצים; לתעד שימוש ב-AI במסמך ההגדרות.

**קישורים:** תיקון 13 — iCount: https://www.icount.co.il/blog/amendment-13/ , law.co.il (עדכון הנחיות הרשות 14.8.2025): https://www.law.co.il/news/2025/08/14/ppa-is-updating-its-guidelines-following-amendment-13/ , Goldfarb: https://www.goldfarb.com/he/%D7%9B%D7%A0%D7%99%D7%A1%D7%AA-%D7%AA%D7%99%D7%A7%D7%95%D7%9F-13-%D7%9C%D7%97%D7%95%D7%A7-%D7%94%D7%92%D7%A0%D7%AA-%D7%94%D7%A4%D7%A8%D7%98%D7%99%D7%95%D7%AA-%D7%9C%D7%AA%D7%95%D7%A7%D7%A3/ , SEC-IT FAQ: https://sec-it.co.il/tikun-13-faq/ , מדריך לעסקים: https://varnoxx.com/privacy-law-amendment-13.html · תקנות 2017: https://www.goldfarb.com/ip-client-update-october-2017/ , נוסח החוק (ויקיטקסט): https://he.wikisource.org/wiki/%D7%AA%D7%A7%D7%A0%D7%95%D7%AA_%D7%94%D7%92%D7%A0%D7%AA_%D7%94%D7%A4%D7%A8%D7%98%D7%99%D7%95%D7%AA_(%D7%90%D7%91%D7%98%D7%97%D7%AA_%D7%9E%D7%99%D7%93%D7%A2) · GlitchTip vs Sentry: https://selfhosting.sh/compare/glitchtip-vs-sentry/ , https://ossalt.com/guides/glitchtip-vs-sentry-community-2026 · Uptime Kuma: https://github.com/louislam/uptime-kuma · WAL-G: https://github.com/wal-g/wal-g · pgBackRest: https://github.com/pgbackrest/pgbackrest · השוואת גיבוי: https://www.netdata.cloud/guides/postgres/postgres-backup-strategy/ , https://ossalt.com/guides/litestream-vs-wal-g-vs-pgbackrest-postgres-backup-2026

---

## 9. ה-Stack המומלץ (צוות של 2, self-hosted)

| שכבה | בחירה | חלופה אם… |
|---|---|---|
| ליבה | Fastify + Postgres (קיים) + Drizzle/Kysely | — |
| מצבי פרויקט | **XState v5** (הגדרה) + `project_events` (אמת) | מכונה ידנית בטבלת `transitions` אם XState מרגיש כבד |
| תורים/תזכורות/SLA/sync | **pg-boss** | pg-workflows לרצפי drip |
| אינטגרציות קצה | **n8n** (webhooks של Meta/Gmail → API) | Windmill אם תרצו code-first |
| Gantt/יומן | frappe-gantt או SVAR (MIT) + FullCalendar | Syncfusion Community / DHTMLX PRO לקריטיקל-פאת' ומשאבים |
| חגים/ימי עבודה | טבלת `business_calendar` מוזנת מ-hebcal | — |
| WhatsApp | **Meta Cloud API** ישיר (תבניות Utility) | BSP ישראלי אם רוצים inbox מוכן |
| SMS | InforU או 019 | Twilio רק לגלובלי |
| מייל | Gmail API (אנושי) + Resend/Postmark (טרנזקציוני) | — |
| אחסון | **R2** (חי) + **B2** (גיבוי) ; Drive = מראה | MinIO לדרישת "בישראל" |
| חתימה | **Documenso** self-host | שירות ישראלי |
| תשלום | הספק שמפיק לכם חשבוניות (Grow/Cardcom/Tranzila) | — |
| Auth | **Better Auth** (org roles, magic-link, OTP, passkeys) + **RLS** | Zitadel ל-SSO לכלים |
| AI | **Claude Agent SDK** + MCP in-process + `requiresUserInteraction` על כלי כתיבה | — |
| Ops | **GlitchTip** + **Uptime Kuma** + **WAL-G→B2** + pg_dump יומי | Sentry SaaS |

**סדר בנייה מוצע (רבעונים):**
- **Q1:** מודל נתונים + XState + pg-boss + API; מסכי פרויקט/שלבים/משימות; ייבוא מ-Monday; WhatsApp Cloud API עם 5 תבניות utility; מסמכים ל-R2; Better Auth לצוות.
- **Q2:** פורטל לקוח (magic link, סטטוס, מסמכים, חתימה), Gantt + יומן + Google Calendar, Intake AI (הצעות בלבד), GlitchTip/Kuma/WAL-G, מסמך הגדרות מאגר + נוהל.
- **Q3:** CPM/שיבוץ צוותים, צ'קליסט שטח offline (PWA), הצעות מחיר/BOM, תשלומים, דוחות צוואר-בקבוק.
- **Q4:** O&M (ניטור → קריאת שירות), change orders, ספקים, AI לסיכומים/תקועים.

---

## 10. לא אומת (⚠️) — לבדוק לפני החלטה

1. **תמחור WhatsApp לישראל** ($0.0353 marketing / $0.0053 utility; 1,000 service חינם) — ממקורות משניים (SleekFlow, Flowcall, SetSmart); דף Meta חסום בבדיקה. לאמת ב-https://developers.facebook.com/docs/whatsapp/pricing.
2. **מדיניות סיווג-מחדש של תבניות** (utility→marketing) ותהליך האישור — מידע כללי, לא נבדק מול התיעוד העדכני.
3. **רישיון Twenty CRM** (AGPL-3.0 לפי ידיעתי) ו**פרטי הטריגרים** שלו (database-event/manual/cron/webhook) — הריפו הראה רק את תיקיית `automated-trigger`; רשימת ה-actions כן אומתה.
4. **XState v5 persistence API** (`getPersistedSnapshot`, `snapshot` option) — מידע מהיכרות; stately.ai חסום.
5. **TTL מקסימלי של ערוץ Google Calendar watch** ודרישות אימות דומיין — developers.google.com חסום.
6. **מחירי SMS:** Twilio IL $0.2575 (נראה גבוה; לבדוק), Telnyx לישראל, InforU/019 למעשה — כולם לא אומתו ממקור ראשוני.
7. **עמלות סליקה** (Grow/Cardcom/Tranzila) — ממקורות משניים ומשתנים לפי מו"מ.
8. **Syncfusion Community License** — תנאי הזכאות ($1M/5 devs/10 employees) ממקור משני; לקרוא את הרישיון. **DHTMLX Individual** — האם מותר שימוש ב-SaaS/פורטל לקוחות.
9. **SVAR PRO מחיר**, **Schedule-X premium** (resource view) — לא אומת.
10. **Temporal "4 vCPU/16GB"** ו-**Trigger.dev "4GB"** — ממדריכים חיצוניים, לא מהתיעוד הרשמי.
11. **MinIO** שינויי רישוי/UI ב-2025 — מידע כללי.
12. **תקנות 2017 — ספים מדויקים** (מספר בעלי הרשאה/נושאי מידע לכל רמה, האם "הרגלי צריכה/מצב כלכלי" מכניס חשבונות חשמל ל"מידע בעל רגישות מיוחדת", תדירות סקרי סיכונים ומבדקי חדירה, תקופת שמירת לוגים) — הנוסח הרשמי חסום; **חובה לאמת עם עו"ד פרטיות**. כנ"ל קריטריוני **מינוי ממונה** בתיקון 13 וגובה העיצומים.
13. **חוק חתימה אלקטרונית** — מספיקות "חתימה רגילה" לחוזי התקנה: סביר, אך לאשר משפטית; הדף הרשמי חסום.
14. **שלבי חח"י/רשות החשמל** (שמות הסטטוסים הרשמיים של בקשת חיבור, סקר, אישור עקרוני, בדיקה, מונה) — לא נחקרו כאן (תקציב חיפוש נגמר); לקחת מקובץ המחקר הרגולטורי/מהניסיון של ברק ולמפות ל-`submissions.status`.
15. **Gmail API מגבלת שליחה** (~2,000/יום/משתמש ב-Workspace) — מזיכרון.
16. **Odoo עברית/RTL ולוקליזציה ישראלית** — לא נבדק.
17. **Bodhi** אחרי הרכישה ע"י OneEthos (3/2026) — עתיד הטיר החינמי לא ברור.
