# 11 — מפרט מודול Projects & Workflow: מכונת מצבים, משימות, לו"זים, תקשורת, פורטל, AI

| | |
|---|---|
| גרסה | 0.1 — טיוטת מפרט (2026-10-10) |
| חלק מ- | `docs/plan/00-master-plan.md` §3, §4, §10, §13, §14, §15 · `01-lifecycle-stages.json` · `research/05-crm-workflow.md` |
| נספחים | `docs/plan/templates/schedule-templates.json` · `docs/plan/templates/message-templates.json` |
| אבני דרך | M0 (מכונה, משימות, לוח שנה עסקי), M2 (שער אמון, הודעות), M3 (SLA חח"י, דיווח בוקר), M5 (לו"ז, Gantt, יומן), M7 (פורטל, סוכנים) |
| סטטוס אימות | כל מספר/סף שסומן "לאימות" נלקח מתקציר ולא ממקור ראשוני; ראו §18 בתוכנית האב |

> **מוסכמות במסמך:** מזהי שלבים `S01`–`S12` כמו ב-`01-lifecycle-stages.json`. שמות ישויות באנגלית לפי §5 בתוכנית האב (`Project`, `Task`, `Submission`, `CommunicationLog`…). קוד ומזהים באנגלית, הסבר בעברית. "י"ע" = ימי עבודה לפי `business_calendar`. כל job בכוורת מציית ל-`platform/schema/job.schema.json`; שמות loops בתבנית `^(collect|edit|dispatch)\.[a-z0-9_-]+$`.

---

## 0. תמצית

1. **מכונת המצבים היא נתונים + XState v5.** ההגדרה הפורמלית נשארת ב-`01-lifecycle-stages.json`; קוד TypeScript קטן בונה ממנה מכונת XState (`buildProjectMachine(stagesJson)`), כך שעריכת תנאי יציאה או auto_task לא דורשת שינוי קוד. **מקור האמת הוא `project_events`** (append-only); `projects.stage/status/state_snapshot` הם cache.
2. **מעבר קדימה = אירוע `ADVANCE` אחד**, שעובר guard הנגזר מרשימת `exit` של השלב. הנחיה בתוכנית האב: "המנוע מציג את הרשימה החסרה" → ה-API מחזיר `missing[]` במקום לזרוק.
3. **S05 ‖ S06** ממומשים כ-parallel state עם שני אזורים; S08 נפתח רק כששניהם ב-`done` (או S05 ב-`not_required`).
4. **משימות, SLA ותזכורות** רצים על pg-boss בלבד (בלי Redis). ימי עבודה מחושבים מטבלת `business_calendar` (זריעה מ-hebcal פעם בשנה + עריכה ידנית).
5. **שער האמון (Law #1/#2)** ממומש פעם אחת, בשכבת `comms`: כל הודעה לנמען שאינו ב-`law1Destinations` נוצרת כ-`dispatch.draft` עם `requiresHumanPick: true`, נשלחת רק אחרי שורת `approvals` שנחתמה על-ידי אדם, ומתועדת ב-`CommunicationLog`.
6. **סוכני AI** (Claude Agent SDK, MCP in-process) מקבלים כלי קריאה ב-`allowedTools` מפורשים; כל כלי כתיבה מסומן `requiresUserInteraction` ועובר `canUseTool` → שורת `approvals` → `PreToolUse defer` עד שברק מחליט.
7. **פורטל לקוח** מציג אבני דרך בלבד (`customer_visible`), מסמכים ב-presigned URL קצר, חתימה click-to-accept עם OTP, וקישור תשלום של ספק הסליקה.
8. **דיווח בוקר v2** מורכב מ-`stuck_projects` (כללי R-STUCK), SLA, חח"י, שטח היום, אישורים ממתינים, ו-jobs שנכשלו; יוצא ל-`self_chat` (Law #1, ללא pick).

---

## (a) מכונת המצבים — XState v5

### a.1 עקרונות מימוש

| עיקרון | מימוש |
|---|---|
| הגדרה כנתונים | `01-lifecycle-stages.json` נטען בעליית השרת ל-`StageDef[]`; `buildProjectMachine(defs)` מייצר `setup({...}).createMachine({...})`. שינוי בתנאי יציאה = שינוי JSON + בדיקות, לא קוד. |
| מקור אמת | `project_events` (append-only, `seq` רץ לכל פרויקט). `projects.state_snapshot jsonb` = `actor.getPersistedSnapshot()` (⚠️ שם ה-API לאימות מול stately.ai — דוח 05 §10.4). שחזור: `createActor(machine, { snapshot })`; אם ה-snapshot חסר/לא תואם גרסה → replay של כל האירועים דרך `machine.transition`. |
| ללא side-effects במכונה | actions של XState **לא** פונות ל-DB/רשת. הן רק מוסיפות ל-`context.outbox[]` רשומות (`emit_event`, `create_tasks`, `enqueue_job`, `schedule_sla`); השירות `transition()` מריץ את ה-outbox בתוך אותה טרנזקציית Postgres. כך replay בשחזור לא שולח הודעות פעמיים. |
| אטומיות | `transition(projectId, event, actor)` = `BEGIN; SELECT … FROM projects WHERE id=$1 FOR UPDATE; ` טעינת `facts` → `actor.send(event)` → אם המצב לא השתנה ואין outbox → `409 TRANSITION_NOT_ALLOWED { missing[] }`; אחרת: INSERT `project_events`, UPDATE cache, `boss.send()` דרך adapter באותה טרנזקציה, `NOTIFY project_changed`; `COMMIT`. |
| אותו קוד בלקוח | ה-UI טוען את אותה מכונה (ללא outbox) כדי להציג אילו כפתורים/מעברים מותרים ומה חסר (`explainExit`). |
| גרסאות | `machine_version` נשמר על כל אירוע ועל ה-snapshot; שינוי ב-JSON מעלה גרסה; מיגרציה = replay. |

### a.2 מצבים ותת-סטטוסים

מבנה היררכי: `S0x` (שלב) ⊃ סטטוס. רשימת הסטטוסים אחידה לכל שלב (מה-JSON): `open · in_progress · waiting_customer · waiting_iec · waiting_supplier · waiting_engineer · blocked · done`. `done` הוא `type: 'final'` בתוך השלב — כניסה אליו מותרת רק דרך guard היציאה; `onDone` של השלב מעביר לשלב הבא.

| שלב | key | סטטוסי "המתנה" רלוונטיים (האחרים מותרים אך לא מוצעים ב-UI) | SLA (`sla_days`) | הערות |
|---|---|---|---|---|
| S01 | lead | waiting_customer | 1 | כניסה מ-intake (AI-draft או ידני) |
| S02 | survey | waiting_customer, waiting_engineer | 7 | יציאה: `survey.completeness.ready` **או** `owner.override` |
| S03 | quote | waiting_engineer, waiting_customer | 3 | יציאה: `quote.version.sent` (נרשם רק אחרי שליחה דרך שער האמון) |
| S04 | contract | waiting_customer | 21 | יציאה: `contract.signed` ∧ `payment.deposit.received` |
| S05 | iec_pre_application | waiting_iec, waiting_customer | `sla_source` (פרמטר IEC) | אזור מקביל; יש מצב `not_required` |
| S06 | engineering | waiting_engineer, waiting_supplier (קונסטרוקטור) | 10 | אזור מקביל |
| S07 | procurement | waiting_supplier | 14 | |
| S08 | installation | waiting_customer, waiting_supplier, blocked | לפי לו"ז | כניסה דורשת S07.done ∧ (S05.done ∨ S05.not_required) |
| S09 | inspection | waiting_engineer (בודק) | 7 | rollback ל-S08 על ליקויים |
| S10 | grid_connection | waiting_iec, waiting_customer | פרמטר IEC | |
| S11 | handover | waiting_customer | 14 | |
| S12 | om | — | — | terminal: אין `done`; תת-מצבים `active · ticket_open · contract_expired` |

### a.3 Guards — נגזרים מ-`exit`

כל ביטוי ב-`exit[]` הופך ל-**fact key** שמחושב ב-`loadFacts(projectId)` (שאילתת SQL אחת לכל fact, ממומשת ב-`facts/registry.ts`). ה-guard של השלב הוא `AND` על כל ה-facts, עם תמיכה ב-`OR` ו-`==`:

| fact key (מה-JSON) | שאילתה / מקור | שלב |
|---|---|---|
| `customer.name` | `customers.name IS NOT NULL` | S01 |
| `site.address` | `sites.address_text IS NOT NULL` (גאוקוד לא חובה) | S01 |
| `project.kind` | `projects.kind IN ('pv','pv_bess','bess_add','ev',…)` | S01 |
| `project.profile_guess` | `projects.regulatory_track IS NOT NULL` | S01 |
| `survey.completeness.ready` | `surveys.completeness_score >= threshold` מה-PWA (`collect.site-survey` → `edit.normalize-site-survey`) | S02 |
| `owner.override` | קיים `project_events.type='fact.overridden'` עם `payload.fact='survey.completeness.ready'` ו-actor role=owner | S02 |
| `quote.version.sent` | `quote_versions.sent_at IS NOT NULL` ∧ `communication_log.status IN ('sent','delivered','read')` לאותה גרסה | S03 |
| `contract.signed` | `signatures.entity='contract' AND sha256 = contract.pdf_sha256` | S04 |
| `payment.deposit.received` | `payments.kind='deposit' AND status='settled'` | S04 |
| `submission.pre.distributor_answer == positive` | `submission_steps.key='distributor_answer' AND result='positive'` | S05 |
| `profile.pre_application_not_required` | `track_params[track].pre_application_required = false` — **לאימות לכל מסלול** (ברירת מחדל: נדרש) | S05 |
| `design.set.approved_by_owner` | `designs.approved_by IS NOT NULL` (role owner) לרוויזיה הנוכחית | S06 |
| `design.verify.empty` | `calc_reports.verify_items = '[]'` | S06 |
| `eplan.all_checks_pass OR owner_accepted` | `calc_reports.status='ALL_CHECKS_PASS'` ∨ `designs.owner_accepted=true` | S06 |
| `po.critical_items.delivered_or_scheduled` | כל `po_lines.is_critical` עם `deliveries.status IN ('delivered')` או `expected_at <= schedule.install_start` | S07 |
| `checklist.installation.complete` | `checklists.kind='installation' AND status='complete'` | S08 |
| `daily_reports.closed` | אין `daily_reports.status='open'` | S08 |
| `inspection.report.signed` | `documents.kind='inspector_report_pdf' AND signed_by IS NOT NULL` | S09 |
| `inspection.defects.open == 0` | `COUNT(defects WHERE status<>'closed') = 0` | S09 |
| `grid.meter.installed` | `grid_connections.meter_serial IS NOT NULL` | S10 |
| `grid.operation_approved` | `grid_connections.activated_at IS NOT NULL` | S10 |
| `grid.tariff_track_registered` | `submission_steps.key='tariff_registration' AND status='done'` | S10 |
| `handover.signed_by_customer` | `signatures.entity='handover_pack'` | S11 |
| `invoice.final.issued` | `invoices.kind='final' AND provider_doc_id IS NOT NULL` | S11 |
| `monitoring.link.active` | `monitoring_links.sharing_status='active' AND last_sync_at > now()-interval '48h'` | S11 |

כללים: (1) fact חסר ברישום = שגיאת קונפיגורציה בעליית שרת, לא ניחוש. (2) `explainExit(stage, facts)` מחזיר `{ ok, missing: [{key, label_he, how_to_fix, task_key?}] }` ל-UI ולסוכנים. (3) `owner.override` ו-`owner_accepted` הם facts שנוצרים **רק** מאירוע `OVERRIDE` של role=owner עם `reason` חובה.

### a.4 אירועים (events) ו-payload

| אירוע | payload | מי שולח | הערות |
|---|---|---|---|
| `ADVANCE` | `{ reason?: string }` | משתמש (UI), סוכן דרך `transition_project` (גייט), job אוטומטי רק לשלבים חסרי סיכון (ראו a.7) | המעבר היחיד קדימה. guard = `canExit(stage)` |
| `SET_STATUS` | `{ status: Status, reason?: string, waiting_for?: {kind, ref} , owner_user_id? }` | משתמש/סוכן/job | `blocked` דורש `reason` ו-`owner_user_id` (כלל מה-JSON) |
| `BLOCK` / `UNBLOCK` | `{ reason, owner_user_id }` / `{ resolution }` | משתמש | סוכר תחבירי ל-`SET_STATUS` עם אירוע נפרד ב-`project_events` |
| `ROLLBACK` | `{ to_stage: StageId, reason: string, defects?: DefectRef[] }` | משתמש (owner/engineer/pm) | רק זוגות מורשים (a.6); נרשם כ-`stage.rolled_back` |
| `OVERRIDE` | `{ fact: FactKey, reason: string }` | owner בלבד | יוצר fact מלאכותי; נרשם `fact.overridden` |
| `FACTS_UPDATED` | `{ facts: Partial<Facts> }` | שירות `transition()` לפני כל אירוע | טוען facts ל-context; לא נרשם ב-events |
| `S05_NOT_REQUIRED` | `{ rule_id, reason }` | job `edit.rule-eval` או owner | מעביר אזור S05 ל-`not_required` |
| `IEC_ANSWER` | `{ result: 'positive'\|'negative'\|'conditional', conditions?: string, approved_kw?: number, document_id }` | Receipt/status updater (דרך approval) או משתמש | `negative` → `blocked` עם סיבה; לא מתקדם אוטומטית |
| `SCHEDULE_CHANGED` | `{ activity_id, planned_start, planned_end, source: 'ui'\|'cpm'\|'calendar' }` | scheduling | לא משנה שלב; נרשם לצורך ציר הזמן |
| `REOPEN_OM` | `{ ticket_id }` | monitoring | בתוך S12 בלבד |

### a.5 Actions (רק רישום ל-outbox)

| action | מתי | מה נכנס ל-outbox |
|---|---|---|
| `recordEvent(type)` | כל מעבר | `{ kind:'emit_event', type, from, to, payload }` |
| `enterStage(stage)` | `entry` של כל שלב | `create_tasks` מ-`auto_tasks[]` (b.2), `schedule_sla` (b.4), `notify_portal_milestone` (אם `customer_visible`), `enqueue_job` לכל auto_task שממופה ל-loop |
| `exitStage(stage)` | `exit` | `cancel_sla`, `close_open_auto_tasks` (משימות auto שלא `blocks_exit`) |
| `draftOutbound(template_key)` | שלבים עם הודעה ללקוח (ראו d.1) | `enqueue_job { loop:'dispatch.draft', outbound:{channel:'whatsapp', destinationClass:'customer', requiresHumanPick:true} }` |
| `openRollbackTasks` | `ROLLBACK` | משימות `kind:'defect'` מ-`defects[]` |

### a.6 Rollback — זוגות מותרים

| מ- | אל | סיבה אופיינית | מה קורה |
|---|---|---|---|
| S03 | S02 | סקר חסר/שגוי | `survey.completeness` מאופס ל-`needs_update`; QuoteVersion נשארת (לא נמחקת) |
| S04 | S03 | לקוח ביקש שינוי → QuoteVersion חדשה | `quote.version.sent` מתייחס לגרסה החדשה בלבד |
| S06 | S03 | BOM שונה מהותית מההצעה (diff > סף שמוגדר ב-`ApprovalThreshold`) | ChangeOrder → QuoteVersion חדשה; S05 ממשיך (לא נסוג) |
| S08 | S07 | חוסר ציוד קריטי | `po.critical_items` נבדק מחדש |
| S09 | S08 | ליקויים בדוח הבודק | `defects_to_tasks`; חזרה ל-S09 דרך `ADVANCE` כשהצ'קליסט סגור |
| S10 | S09 | ליקויים בבדיקת חח"י | כנ"ל; שומר `submission_steps` של S10 |
| S11 | S10 | מונה/אישור הפעלה בוטל | נדיר; owner בלבד |

כל rollback: אירוע `stage.rolled_back {from,to,reason}`, משימות הביניים נשארות היסטוריה, `state_entered_at` מתאפס, SLA מתוזמן מחדש. אין rollback מ-S12 (terminal) — תקלות מטופלות כ-`ServiceTicket`.

### a.7 מעברים אוטומטיים (ללא אדם)

מותרים רק כשה-`exit` כולו נגזר מעובדות שנכתבו על-ידי המערכת עצמה ואין סיכון כספי/חיצוני: S01→S02 אחרי אישור ליד (אירוע אנושי כבר קיים), S07→S08 **לא** (שיבוץ צוות = החלטה), S10 facts מ-`IEC_ANSWER` **תמיד** דרך approval אלא אם המקור הוא מייל מדומיין חח"י עם מספר בקשה תואם (דוח 05 §7.1). רשימת המעברים האוטומטיים היא קונפיגורציה: `auto_advance: ['S01']` — כל השאר דורשים לחיצה.

### a.8 סקיצת TypeScript של המכונה

```ts
// server/src/modules/projects/machine.ts  (sketch, XState v5)
import { setup, assign } from 'xstate';
import type { StagesFile, StageDef, Facts, OutboxItem } from './types';

type Ctx = { projectId: string; track: string; facts: Facts; outbox: OutboxItem[]; blocked?: { reason: string; owner: string } };
type Ev =
  | { type: 'ADVANCE'; reason?: string }
  | { type: 'SET_STATUS'; status: Status; reason?: string; owner_user_id?: string }
  | { type: 'ROLLBACK'; to_stage: StageId; reason: string; defects?: string[] }
  | { type: 'OVERRIDE'; fact: string; reason: string }
  | { type: 'FACTS_UPDATED'; facts: Partial<Facts> }
  | { type: 'S05_NOT_REQUIRED'; rule_id: string; reason: string }
  | { type: 'IEC_ANSWER'; result: 'positive' | 'negative' | 'conditional'; document_id: string };

const STATUSES = ['open','in_progress','waiting_customer','waiting_iec','waiting_supplier','waiting_engineer','blocked'] as const;
const ROLLBACK_PAIRS: Record<string, StageId[]> = { S03:['S02'], S04:['S03'], S06:['S03'], S08:['S07'], S09:['S08'], S10:['S09'], S11:['S10'] };

/** evaluates the stage's exit[] against loaded facts; returns missing keys */
export function explainExit(def: StageDef, facts: Facts): { ok: boolean; missing: string[] } {
  const missing = def.exit.filter(expr => !evalExpr(expr, facts)); // supports "a", "a OR b", "a == v"
  return { ok: missing.length === 0, missing };
}

const push = (item: (ctx: Ctx, ev: Ev) => OutboxItem) =>
  assign({ outbox: ({ context, event }) => [...context.outbox, item(context, event)] });

/** one stage = compound state with the shared status sub-states + final 'done' */
function stageState(def: StageDef) {
  const statusStates = Object.fromEntries(STATUSES.map(s => [s, {
    on: {
      SET_STATUS: [
        { guard: 'blockedHasReasonAndOwner', target: 'blocked', actions: ['recordStatus'] },
        { guard: ({ event }) => event.type === 'SET_STATUS' && event.status !== 'blocked', target: '#project.' + def.id + '.hist', actions: ['recordStatus'] },
      ],
      ADVANCE: { guard: { type: 'canExit', params: { stage: def.id } }, target: 'done', actions: ['recordAdvance'] },
      ROLLBACK: { guard: { type: 'rollbackAllowed', params: { from: def.id } }, target: '#project.rollback', actions: ['recordRollback'] },
      OVERRIDE: { guard: 'isOwner', actions: ['recordOverride'] },
    },
  }]));
  return {
    id: def.id, initial: 'open',
    entry: [{ type: 'enterStage', params: { stage: def.id } }],
    exit:  [{ type: 'exitStage',  params: { stage: def.id } }],
    states: { ...statusStates, hist: { type: 'history' }, done: { type: 'final' } },
  };
}

export function buildProjectMachine(file: StagesFile) {
  const byId = Object.fromEntries(file.stages.map(s => [s.id, s]));
  return setup({
    types: {} as { context: Ctx; events: Ev },
    guards: {
      canExit: ({ context }, p: { stage: StageId }) => explainExit(byId[p.stage], context.facts).ok,
      rollbackAllowed: ({ event }, p: { from: StageId }) => event.type === 'ROLLBACK' && (ROLLBACK_PAIRS[p.from] ?? []).includes(event.to_stage),
      blockedHasReasonAndOwner: ({ event }) => event.type === 'SET_STATUS' && event.status === 'blocked' && !!event.reason && !!event.owner_user_id,
      isOwner: ({ event }) => (event as any).actorRole === 'owner',
      s08Entry: ({ context }) => context.facts['S07.done'] && (context.facts['S05.done'] || context.facts['S05.not_required']),
    },
    actions: {
      enterStage: push((c, _e) => ({ kind: 'enter_stage', stage: (_e as any).stage })),
      exitStage:  push((c, _e) => ({ kind: 'exit_stage' })),
      recordAdvance:  push((c, e) => ({ kind: 'emit_event', type: 'stage.advanced', payload: e })),
      recordStatus:   push((c, e) => ({ kind: 'emit_event', type: 'status.changed', payload: e })),
      recordRollback: push((c, e) => ({ kind: 'emit_event', type: 'stage.rolled_back', payload: e })),
      recordOverride: push((c, e) => ({ kind: 'emit_event', type: 'fact.overridden', payload: e })),
      loadFacts: assign({ facts: ({ context, event }) => event.type === 'FACTS_UPDATED' ? { ...context.facts, ...event.facts } : context.facts }),
    },
  }).createMachine({
    id: 'project', initial: 'S01',
    context: ({ input }) => ({ projectId: input.projectId, track: input.track, facts: {}, outbox: [] }),
    on: { FACTS_UPDATED: { actions: 'loadFacts' } },
    states: {
      S01: { ...stageState(byId.S01), onDone: 'S02' },
      S02: { ...stageState(byId.S02), onDone: 'S03' },
      S03: { ...stageState(byId.S03), onDone: 'S04' },
      S04: { ...stageState(byId.S04), onDone: 'S05_S06' },
      // parallel region: both children must reach a final state
      S05_S06: {
        type: 'parallel',
        states: {
          S05: { ...stageState(byId.S05),
                 on: { S05_NOT_REQUIRED: { target: '.not_required', actions: ['recordStatus'] },
                       IEC_ANSWER: [{ guard: ({ event }) => event.result === 'positive', actions: ['recordStatus'] },
                                    { target: '.blocked', actions: ['recordStatus'] }] },
                 states: { ...stageState(byId.S05).states, not_required: { type: 'final' } } },
          S06: stageState(byId.S06),
        },
        onDone: 'S07',
      },
      S07: { ...stageState(byId.S07), onDone: [{ guard: 's08Entry', target: 'S08' }, { target: 'S07.hist' }] },
      S08: { ...stageState(byId.S08), onDone: 'S09' },
      S09: { ...stageState(byId.S09), onDone: 'S10' },
      S10: { ...stageState(byId.S10), onDone: 'S11' },
      S11: { ...stageState(byId.S11), onDone: 'S12' },
      S12: { initial: 'active', states: { active: {}, ticket_open: {}, contract_expired: {} },
             on: { REOPEN_OM: '.ticket_open' } },
      rollback: { always: [ /* one transition per pair; target resolved from event.to_stage at build time */ ] },
    },
  });
}
```

הערות למימוש: (1) ב-XState v5 אין `target` דינמי — ה-`rollback` state מתורגם בבנייה ל-`always` עם guard לכל זוג (`ROLLBACK_PAIRS`). (2) הכניסה ל-S08 מ-S07 נבדקת ב-`onDone` של S07; אם S05 עדיין ממתין, S07 נשאר ב-`done` והמעבר מתבצע כש-`FACTS_UPDATED` מביא `S05.done` (ה-service שולח `ADVANCE` חוזר). (3) `actorRole` מצורף לאירוע על-ידי ה-service, לא על-ידי הלקוח.

### a.9 מעטפת `project_events`

```ts
// packages/shared-schemas/src/project-event.ts
export const ProjectEvent = z.object({
  id: z.string().ulid(),
  project_id: z.string().uuid(),
  seq: z.number().int().positive(),            // monotonic per project (unique(project_id, seq))
  machine_version: z.string(),                 // e.g. "stages@0.2"
  type: z.enum([
    'stage.advanced', 'status.changed', 'stage.blocked', 'stage.unblocked', 'stage.rolled_back',
    'fact.overridden', 'fact.changed',
    'task.created', 'task.completed', 'task.cancelled', 'task.overdue',
    'sla.scheduled', 'sla.breached',
    'submission.step.changed', 'submission.fee.paid', 'submission.answer.received',
    'comm.drafted', 'comm.picked', 'comm.sent', 'comm.delivered', 'comm.failed', 'comm.received',
    'doc.generated', 'doc.signed', 'doc.sent',
    'schedule.created', 'schedule.changed', 'schedule.changed_externally', 'schedule.conflict',
    'payment.received', 'invoice.issued',
    'agent.proposal', 'approval.decided',
  ]),
  from: z.object({ stage: StageId, status: Status }).nullable(),
  to:   z.object({ stage: StageId, status: Status }).nullable(),
  payload: z.record(z.unknown()),              // event-specific, validated per type
  actor: z.object({
    kind: z.enum(['user', 'agent', 'system', 'job', 'customer', 'webhook']),
    id: z.string().nullable(),                 // user id / agent name / job id
    role: z.string().nullable(),
    approval_id: z.string().uuid().nullable(), // required when kind='agent' and the event is a write
  }),
  reason: z.string().max(2000).nullable(),
  idempotency_key: z.string().max(200),        // unique index; sha256(project_id|type|payload-hash|source id)
  correlation_id: z.string().nullable(),       // ties job → event → comm → approval
  job_id: z.string().nullable(),               // hive ledger job (job.schema.json)
  created_at: z.string().datetime(),
});
```

SQL: `CREATE TABLE project_events (... , UNIQUE (project_id, seq), UNIQUE (idempotency_key)); REVOKE UPDATE, DELETE ON project_events FROM app_rw;` + trigger שמונע עדכון. `projects` מחזיק: `stage, status, state_snapshot jsonb, state_entered_at, status_entered_at, sla_due_at, last_event_seq, machine_version`.

---

## (b) משימות ומנוע SLA

### b.1 מודל `Task`

```
tasks(
  id uuid, project_id uuid, stage_id text,            -- S01..S12 (null = חוצה-שלבים)
  key text,                                           -- auto_task key או 'manual'
  kind text,                                          -- auto | manual | checklist | defect | followup | approval
  title_he text, description_he text,
  assignee_role text, assignee_user_id uuid,
  status text,                                        -- open | in_progress | waiting | done | cancelled
  priority smallint,                                  -- 1 (critical) .. 4
  due_at timestamptz, due_basis jsonb,                -- {business_days:3, from:'stage_entered'|'event:<type>'|'activity:<id>'}
  requires jsonb,                                     -- [{fact:'survey.completeness.ready'}] / [{document:'quote_pdf'}]
  blocks_exit bool,                                   -- משימה שחייבת להיסגר לפני ADVANCE (בנוסף ל-exit facts)
  checklist jsonb,                                    -- [{id,label_he,required,photo_required,done_at,by}]
  source jsonb,                                       -- {event_id, job_id, agent, template}
  linked jsonb,                                       -- {submission_step_id, defect_id, po_id, activity_id, comm_log_id}
  idempotency_key text unique,                        -- '{project_id}:{stage}:{key}:{entered_seq}'
  completed_at, completed_by, created_at, updated_at
)
task_dependencies(pred_task_id, succ_task_id, type 'FS'|'SS', lag_business_days int)
```

כללים: משימת `auto` נוצרת פעם אחת לכל כניסה לשלב (idempotency על `entered_seq`); rollback וחזרה יוצרים סט חדש. משימה `manual` נפתחת מה-UI/סוכן. `blocks_exit=true` מתווסף ל-`explainExit` כ-`missing` מסוג `task`.

### b.2 `auto_tasks` מה-JSON → משימות/jobs

| שלב | auto_task | סוג | בעלים | due (י"ע) | job / loop | blocks_exit |
|---|---|---|---|---|---|---|
| S01 | `schedule_survey` | manual-task + draft | sales/owner | 1 | `dispatch.draft` (תבנית `survey_proposal`) | לא |
| S02 | `link_survey_to_project` | job | system | — | `collect.site-survey` → `edit.normalize-site-survey` (קיימים ב-loops.json); מחליף `customer.id=[OPEN]` | כן (fact) |
| S02 | `request_electric_bill` | task + draft | surveyor | 2 | `dispatch.draft` (`bill_request`) | לא |
| S03 | `build_design_lite` | job | system | — | `edit.design-lite` (layout + strings מהיר + pvlib/PVGIS) | לא |
| S03 | `price_from_assemblies` | job | system | — | `edit.price-assemblies` | לא |
| S03 | `generate_boq` | job | system | — | `edit.docgen-boq` | לא |
| S03 | `generate_quote` | job | system | — | `edit.docgen-quote` | לא |
| S03 | `draft_outbound_quote` | draft | owner | 1 | `dispatch.draft` (`quote_sent`) — pick → fact `quote.version.sent` | כן (fact) |
| S04 | `followup_every_3_days` | followup | owner | כל 3 י"ע | `task.followup-cycle` (pg-boss schedule לפרויקט) → `dispatch.draft` (`quote_followup`) עד `contract.signed` | לא |
| S04 | `generate_contract` | job | system | — | `edit.docgen-contract` | לא |
| S04 | `create_schedule_from_template` | job | system | — | `edit.schedule-from-template` (ראו c.1) | לא |
| S05 | `build_submission_steps_from_profile` | job | system | — | `edit.submission-steps` (תבנית לפי `regulatory_track`/`distributor`) | לא |
| S05 | `fill_forms` | job + task | pm | 2 | `edit.docgen-iec-forms` → משימה "להגיש ב-digitalorders ולרשום מספר בקשה" | כן |
| S05 | `track_fee_payment` | task | pm/customer | 3 | `sla.waiting-check` + draft `iec_fee_request` | לא |
| S05 | `ingest_receipt` | job | system | — | `collect.receipt` (מייל/העלאה) → `edit.receipt-link` (vision, approval) | לא |
| S05 | `remind_waiting_iec_business_days` | job | system | פרמטר IEC | `iec.sla-check` (b.4) | לא |
| S06 | `generate_spec_yaml` | job | system | — | `edit.spec-yaml` | לא |
| S06 | `ingest_constructor_drawing` | task + job | engineer | 5 | `collect.constructor-dwg` (DWG/DXF/PDF) | לא |
| S06 | `run_eplan` | job | system | — | `edit.eplan-run` (services/cad) | לא |
| S06 | `convert_dwg` | job | system | — | `edit.cad-dwg` (Windows worker, pull queue) | לא |
| S06 | `diff_bom_vs_quote` | job + task | owner | 1 | `edit.bom-diff` → אם diff > סף: משימה "לאשר ChangeOrder" | לא |
| S07 | `split_bom_by_supplier` | job | system | — | `edit.bom-split` | לא |
| S07 | `create_po` | task + job | procurement(pm) | 2 | `edit.docgen-po` → `dispatch.draft` לספק (`po_sent`, destinationClass=supplier) | לא |
| S07 | `track_deliveries` | task | pm | לפי lead time | `collect.delivery` (מייל ספק/העלאה) + `sla.waiting-check` | לא |
| S08 | `assign_crew` | task | pm | 3 לפני התחלה | — (UI Gantt) | כן |
| S08 | `sync_calendar` | job | system | — | `edit.calendar-push` (c.4) | לא |
| S08 | `open_checklist` | job | system | — | `edit.checklist-open` (לפי סוג גג/ממיר) | כן (fact) |
| S08 | `collect_photos` | checklist | technician | יומי | `collect.field-photos` (PWA) | לא |
| S09 | `select_inspector_type_by_rule` | job | system | — | `edit.rule-eval` (R17 — **לאימות**; אם `unverified` → משימה לברק) | לא |
| S09 | `book_inspector` | task | owner | 3 | יומן `inspections` + draft `inspection_scheduled` | כן |
| S09 | `generate_test_report` | job | system | — | `edit.docgen-62446` | לא |
| S09 | `defects_to_tasks` | job | system | — | `edit.defects-to-tasks` (kind=defect, blocks_exit) | — |
| S10 | `fill_final_forms` | job | system | — | `edit.docgen-iec-final` | לא |
| S10 | `generate_as_made` | job | system | — | `edit.cad-as-made` | לא |
| S10 | `order_iec_inspection_pack` | job + task | pm | 1 | `edit.docgen-iec-pack` → משימה "להזמין בדיקה ב-digitalorders + תשלום" | כן |
| S10 | `schedule_iec_inspection` | task | pm | פרמטר IEC | `iec.sla-check` (7 י"ע מהתשלום — לאימות) | לא |
| S10 | `record_meter` | task | pm | — | UI: `GridConnection{meterSerial, meterCode, contractNumber, bpNumber, approvedKw, track, activatedAt}` | כן (fact) |
| S10 | `register_tariff_track_portal` | task | pm | 5 | משימה ידנית ב"פורטל יצרנים" | כן (fact) |
| S10 | `operating_permit_if_required` | job + task | pm | — | `edit.rule-eval` (V10 — **לאימות**); אם נדרש: משימה + SubmissionStep | תלוי |
| S11 | `commissioning_checklist` | checklist | engineer | 2 | `edit.checklist-open` | לא |
| S11 | `merge_handover_pack` | job | system | — | `edit.docgen-handover` | לא |
| S11 | `register_warranties` | job | system | — | `edit.warranty-register` | לא |
| S11 | `create_monitoring_link` | task + job | engineer | 2 | `edit.monitoring-link` → bee-live | כן (fact) |
| S11 | `verify_first_sync` | job | system | 48h | `collect.monitoring-first-sync` (אם אין נתונים → משימה "שיתוף אתר") | כן (fact) |
| S11 | `collect_iec_data_consent` | task | owner | — | פורטל: הסכמה + token (לאימות תהליך) | לא |
| S12 | `alerts_to_tickets` | job | system | — | `collect.monitoring-alerts` → `edit.alert-to-ticket` | — |
| S12 | `periodic_inspection_schedule` | job | service | לפי חוזה | `om.periodic-inspection` (cron לפרויקט) | — |
| S12 | `contract_renewal_reminder` | job | service | 30 י"ע לפני פקיעה | `om.contract-renewal` | — |

> שמות loops חדשים (`edit.docgen-*`, `collect.receipt`, …) מתווספים ל-`platform/schema/loops.json` עם `trustTier`, `costTier` ו-`enabled:false` עד מימוש; כולם `kind` לפי הקידומת.

### b.3 לוח שנה עסקי (`business_calendar`)

```
business_calendar(
  date date primary key,
  is_work_day bool, is_half_day bool,
  name_he text,                       -- "ראש השנה א'", "ערב יום כיפור", "חוה"מ סוכות"
  source text,                        -- 'hebcal' | 'manual' | 'policy'
  policy_version int
)
calendar_policy(key, value)  -- week: Sun–Thu work days; fri: configurable (ברירת מחדל: לא יום עבודה לצורכי SLA/CPM); erev_chag: half_day→לא נספר; chol_hamoed: configurable
```

- **זריעה:** job שנתי `hebcal.seed-year` (loop `collect.hebcal-year`, costTier 0) מריץ `@hebcal/core` עם `il: true` לשנה הבאה, או Hebcal REST (CC-BY 4.0). ⚠️ `@hebcal/core` הוא GPL-2.0 — להריץ כסקריפט זריעה נפרד (לא לקשר לקוד המוצר) או להשתמש ב-REST. מועדים לאומיים (יום הזיכרון/העצמאות) נכנסים; שבתון/חצי יום לפי מדיניות המשרד — עריכה ידנית ב-UI "לוח שנה".
- **פונקציות:** `add_business_days(from date, n int) → date` (SQL, immutable, משתמשת בטבלה), `business_days_between(a, b) → int`, `next_business_day(d)`. מימוש TS מקביל ב-`packages/shared-schemas/calendar.ts` עם אותה טבלה (נטענת ל-cache) — בדיקות שמוודאות שוויון בין SQL ל-TS.
- **IEC:** `iec_sla_params(key, business_days int, source, verification, verified_by, valid_from)` — `DISTRIBUTOR_ANSWER_BD` (לאימות), `INSPECTION_AFTER_PAYMENT_BD=7` (לאימות), `CONNECTION_COMPLETE_BD=30` (לאימות), `SURVEY_PUBLISH_BD=7–14` (לאימות). כל חישוב `dueAt` של SubmissionStep קורא מהטבלה, לא מקבוע בקוד.

### b.4 pg-boss — שמות jobs, תזמון, retry, idempotency

| job name (queue) | טריגר / cron | payload | retry | `singletonKey` / idempotency | expireIn | DLQ |
|---|---|---|---|---|---|---|
| `sla.stage-check` | `startAfter = sla_due_at` בכניסה לשלב | `{project_id, stage, entered_seq}` | 3, backoff 1m→15m | `sla:{project_id}:{stage}:{entered_seq}` | 1h | `dlq.sla` |
| `sla.waiting-check` | בכניסה ל-`waiting_*`; `startAfter = add_business_days(now, N)` (`waiting_customer` 3, `waiting_engineer` 2, `waiting_supplier` 5, `waiting_iec` → פרמטר IEC) | `{project_id, status, status_seq}` | 3 | `wait:{project_id}:{status_seq}` | 1h | `dlq.sla` |
| `iec.sla-check` | בכניסה ל-`submission_steps.status='waiting'`; `startAfter = dueAt` | `{submission_step_id}` | 3 | `iec:{step_id}:{version}` | 1h | `dlq.sla` |
| `task.due-reminder` | `startAfter = due_at - 1 י"ע` ו-`due_at` | `{task_id}` | 2 | `task:{task_id}:{due_at}` | 1h | — |
| `task.followup-cycle` | `schedule` לפרויקט: `*/3 י"ע` ממומש כ-`startAfter = add_business_days(now,3)` רקורסיבי | `{project_id, cycle_no}` | 1 | `fu:{project_id}:{cycle_no}` | 1d | — |
| `comm.dispatch-draft` (= loop `dispatch.draft`) | אירוע (`enterStage`, task, agent) | `{template_key, params, project_id, destination_class, comm_log_id}` | 3 | `draft:{comm_log_id}` | 7d (טיוטה שלא נבחרה פגה) | `dlq.comm` |
| `comm.send-approved` | אחרי `approvals.status='approved'` | `{comm_log_id, approval_id, provider}` | 5, backoff 30s→10m (429/5xx) | `send:{comm_log_id}` + בדיקת `status<>'sent'` לפני שליחה | 30m | `dlq.comm` (→ התראה self_chat) |
| `comm.inbound-intake` (= `collect.wa` / `collect.mail`) | webhook / poll 15m | `{provider, provider_message_id, raw}` | 3 | `in:{provider}:{provider_message_id}` | 10m | `dlq.comm` |
| `calendar.push` | `schedule.changed`, `assign_crew` | `{activity_id, hash}` | 5, backoff | `calpush:{activity_id}` (debounce, `singletonSeconds: 10`) | 10m | `dlq.calendar` |
| `calendar.sync-pull` | webhook `X-Goog-Resource-State` / cron `*/30 * * * *` גיבוי | `{calendar_id}` | 3 | `calpull:{calendar_id}` (`singletonSeconds: 30`) | 10m | `dlq.calendar` |
| `calendar.watch-renew` | cron יומי 03:00; מחדש ערוצים שפגים תוך 48h | `{calendar_id}` | 5 | `watch:{calendar_id}` | 10m | `dlq.calendar` |
| `schedule.recompute` | כל `schedule.changed`, `stage.advanced`, עדכון actuals | `{project_id}` | 2 | `cpm:{project_id}` (`singletonSeconds: 5`) | 5m | — |
| `report.stuck-scan` | cron `0 6 * * 0-4` (לפני דיווח הבוקר; רק י"ע — ה-job בודק `is_work_day`) | `{date}` | 2 | `stuck:{date}` | 30m | — |
| `report.morning` (= `dispatch.alert`, destinationClass `self_chat`) | cron `0 7 * * 0-4` + `is_work_day` | `{date}` | 3 | `morning:{date}` | 1h | `dlq.report` |
| `docgen.*` / `cad.*` (= `edit.docgen-*`, `edit.eplan-run`, `edit.cad-dwg`) | auto_task | `{project_id, entity_id, rev, input_hash}` | 2 (docgen) / 1 (cad) | `{job}:{entity_id}:{rev}:{input_hash}` | 15m / 2h | `dlq.docgen` |
| `monitoring.first-sync-verify` | 48h אחרי `create_monitoring_link` | `{monitoring_link_id}` | 3 | `msync:{link_id}` | 10m | — |
| `om.periodic-inspection` | cron לפי `MaintenanceContract` (RRULE) | `{contract_id}` | 2 | `pi:{contract_id}:{period}` | 1d | — |
| `om.contract-renewal` | `startAfter = add_business_days(expires_at, -30)` | `{contract_id}` | 2 | `renew:{contract_id}:{expires_at}` | 1d | — |
| `hebcal.seed-year` | cron `0 4 1 9 *` (ספטמבר) | `{year}` | 3 | `hebcal:{year}` | 1h | — |
| `agent.run` | אירוע / cron לפי סוכן (f) | `{agent, project_id?, input_ref, session_id?}` | 1 (אין retry אוטומטי ל-LLM; כישלון → משימה) | `agent:{agent}:{input_ref}` | 30m | `dlq.agent` |

כללים כלליים: (1) כל handler **אידמפוטנטי** — בודק שהמצב שה-job נולד בו עדיין תקף (`entered_seq`/`version`) ואחרת מסיים בשקט. (2) `boss.send()` תמיד דרך ה-adapter הטרנזקציוני של Drizzle/Kysely באותה טרנזקציה של `project_events`. (3) jobs שנכשלו סופית → DLQ queue + שורה ב-`jobs` ledger עם `status='failed'` + ספירה ב"דיווח בוקר". (4) heartbeat ל-Uptime Kuma מתוך `report.morning` ו-`calendar.watch-renew`. (5) `pgboss.job` נחשף כ-view `ops_failed_jobs_24h`.

### b.5 כללי "תקוע" (מזינים `stuck_projects`)

| קוד | כלל | חומרה | צעד מוצע (טקסט לדיווח) |
|---|---|---|---|
| `R-STUCK-01` | `business_days_between(state_entered_at, today) > sla_days × 1.5` (לשלבים עם `sla_days`) | high | "שלב {stage} חורג מ-SLA ב-{n} י"ע — לפתוח את הכרטיס" |
| `R-STUCK-02` | `status='waiting_customer'` > 3 י"ע ואין `comm.received` מאז | medium | "לשלוח תזכורת ({template}) / להתקשר" |
| `R-STUCK-03` | `status='waiting_iec'` או SubmissionStep `waiting` > `iec_sla_params[key] + 2` | high | "לבדוק סטטוס ב-digitalorders / לפנות למוקד" |
| `R-STUCK-04` | `status='blocked'` > 2 י"ע ללא אירוע חדש | high | "{reason} — בעלים: {owner}" |
| `R-STUCK-05` | משימה `blocks_exit=true` באיחור > 2 י"ע | medium | "משימה {title} ({assignee})" |
| `R-STUCK-06` | אין `project_events` 7 י"ע בשלבים S02–S11 | low | "פרויקט שקט — לעדכן סטטוס או להעביר ל-blocked עם סיבה" |
| `R-STUCK-07` | S07: `deliveries.expected_at < today` ולא `delivered` | high | "ספק {supplier} מאחר — חוסם התקנה ב-{date}" |
| `R-STUCK-08` | S05/S10: `fee.quoted_at` קיים ו-`fee.paid_at` ריק > 5 י"ע | medium | "אגרת חח"י לא שולמה — תזכורת ללקוח ({template})" |
| `R-STUCK-09` | S03/S04: `quote.sent_at` > 7 י"ע ללא `comm.received` וללא משימת followup פתוחה | medium | "הצעה ללא מענה — follow-up" |
| `R-STUCK-10` | S08: `activity.planned_start < today` ללא `actual_start` | high | "התקנה לא התחילה בזמן — לעדכן לו"ז" |
| `R-STUCK-11` | S11: `monitoring_links.sharing_status<>'active'` > 5 י"ע | medium | "שיתוף אתר ניטור לא הושלם ({vendor})" |
| `R-STUCK-12` | טיוטה ב-`dispatch.draft` ממתינה ל-pick > 1 י"ע | medium | "{n} הודעות ממתינות לבחירה" |

מימוש: view `stuck_projects(project_id, rule, severity, since, detail_he, suggested_action_he, link)` + job `report.stuck-scan` שכותב snapshot ל-`stuck_snapshots(date, payload)` (לצורך מגמות ו"מה השתנה מאתמול"). הסוכן Stuck-project monitor (f) קורא את ה-view בלבד.

---

## (c) לו"זים: תבניות, CPM, Gantt, יומן Google

### c.1 תבניות לו"ז (`schedule-templates.json`)

- קובץ: `docs/plan/templates/schedule-templates.json` → בייצור: טבלה `schedule_templates(track, version, json)` עם UI עריכה.
- מבנה פעילות: `{ id, name_he, stage, duration_business_days | duration_param, estimate, depends_on[], dependency_type ('FS' ברירת מחדל | 'SS'), lag_business_days, resource, buffer_days, milestone, customer_visible }`.
- `duration_param` מפנה ל-`iec_sla_params` (7/14/30 י"ע — לאימות, §9.1 בתוכנית האב). כל משך אחר מסומן `estimate: true` עד שייכויל מפרויקטים אמיתיים (job `schedule.calibrate` רבעוני: ממוצע/חציון actuals לכל `template_activity_id`).
- **יצירה (S04 `create_schedule_from_template`):** anchor = `contract.signed` (או `payment.deposit.received`, המאוחר). פעילויות של S01–S04 מקבלות actuals מהאירועים; שאר הפעילויות מתוכננות קדימה. נוצרות שורות `schedule_activities(project_id, template_activity_id, name_he, stage, planned_start, planned_end, duration_bd, buffer_bd, resource_type, resource_id, status, actual_start, actual_end, es, ef, ls, lf, slack_bd, is_critical, calendar_event_ref, version)`.
- **עדכון לפי מציאות:** `stage.advanced`/`task.completed` → `actual_*`; `schedule.recompute` מחשב מחדש מהיום קדימה (actuals נעולים).

### c.2 CPM (צד שרת, ימי עבודה)

```
1. טען פעילויות + תלויות (DAG; זיהוי מעגל → שגיאה "SCHEDULE_CYCLE").
2. סדר טופולוגי (Kahn).
3. forward pass:  ES(a) = max over preds p of ( EF(p) + buffer(p) + lag(p→a) )  [FS]   |  ES(p) + lag  [SS]
                  EF(a) = add_business_days(ES(a), duration(a))     (actual_start נעול אם קיים; actual_end נעול)
4. backward pass: LF(a) = min over succs s of ( LS(s) - buffer(a) - lag )  ;  LS(a) = sub_business_days(LF(a), duration(a))
5. slack(a) = business_days_between(ES, LS); is_critical = slack == 0.
6. milestones (customer_visible) → expected_dates: {milestone_key, date, confidence: 'estimate'|'param'|'actual'}; לפורטל מעוגל לשבוע.
7. השוואה לגרסה קודמת → אם שינוי בתאריך אבן-דרך > 5 י"ע: אירוע schedule.changed + הצעת הודעה ללקוח (draft, pick).
```

משכים שאינם ידועים (`duration_param` ללא ערך מאומת) מחושבים לפי הערך בטבלה **ומסומנים** `confidence:'param'` בכל פלט; ה-UI מציג "לאימות".

### c.3 Gantt חוצה-פרויקטים — חוזה נתונים

```ts
// GET /api/scheduling/gantt?from=2026-10-01&to=2026-12-31&resource=crew:*
type GanttResponse = {
  range: { from: ISODate; to: ISODate };
  calendar: { non_work_days: ISODate[]; half_days: ISODate[] };
  resources: Array<{ id: string; kind: 'crew'|'crane'|'inspector'|'iec'|'customer'|'engineer'|'supplier'; name_he: string; capacity_per_day: number }>;
  projects: Array<{
    id: string; name_he: string; stage: StageId; status: Status; track: string; customer_visible_milestones: Array<{ key: string; date: ISODate; confidence: 'actual'|'estimate'|'param' }>;
    activities: Array<{
      id: string; template_activity_id: string; name_he: string; stage: StageId;
      start: ISODate; end: ISODate; baseline_start?: ISODate; baseline_end?: ISODate;
      actual_start?: ISODate; actual_end?: ISODate; progress: number;        // 0..1 מצ'קליסט/דוחות יומיים
      is_critical: boolean; slack_bd: number; estimate: boolean;
      resources: string[];                                                   // resource ids
      deps: Array<{ pred: string; type: 'FS'|'SS'; lag_bd: number }>;
      status: 'planned'|'in_progress'|'done'|'late'|'blocked';
      calendar: { calendar_id: string; google_event_id: string; sync: 'ok'|'pending'|'conflict'|'error' } | null;
      conflicts: string[];                                                   // conflict ids
    }>;
  }>;
  conflicts: Array<{ id: string; resource_id: string; from: ISODate; to: ISODate; activity_ids: string[]; kind: 'overbooked'|'unavailable'|'external_event'; detail_he: string }>;
  generated_at: ISODateTime;
};
```

- הספרייה (frappe-gantt / SVAR ל-MVP) רק מציירת; drag ב-UI → `PATCH /activities/:id {planned_start, planned_end}` → `schedule.recompute` → תגובה עם ה-GanttResponse המעודכן.
- **משאבים וקונפליקטים:** `crews(id, name, members[], capacity_per_day=1)`, `resources(kind: crane|inspector|…)`, `resource_unavailability(resource_id, from, to, reason)` (חופשות, אירועי Google "זרים"). קונפליקט = בכל יום עבודה, `Σ allocations(resource, day) > capacity` או חפיפה ל-`unavailability`. בודקים ב-`schedule.recompute` לכל הפרויקטים הפעילים (N קטן). פתרון תמיד אנושי: ה-UI מציע "להזיז פעילות X ב-n י"ע"; **אין הזזה אוטומטית** כי מועד התקנה הוא הודעה ללקוח (שער אמון).

### c.4 Google Calendar — פרוטוקול סנכרון דו-כיווני

| רכיב | מימוש |
|---|---|
| יומנים | `installations`, `inspections`, `iec` (+ אופציונלי יומן לטכנאי). מיפוי ב-`calendars(id, google_calendar_id, kind, watch_channel_id, watch_resource_id, watch_expiration, sync_token)`. |
| מיפוי אירועים | `calendar_links(entity_type 'activity'|'task'|'inspection', entity_id, calendar_id, google_event_id, etag, google_updated, last_pushed_hash, status)`. |
| Push (DB → Google) | job `calendar.push`: בונה אירוע `{summary: "{project.short} · {activity.name_he}", location: site.address, description: קישור לכרטיס + צוות (ללא ת"ז/טלפון לקוח — פרטיות), start/end (תאריכים שלמים לימי עבודה או שעות אם ידועות), attendees: אנשי הצוות, extendedProperties.private: { bee_event_id, bee_project_id, bee_entity, bee_hash }}`. `insert` אם אין קישור, אחרת `patch` עם `If-Match: etag`; 412 → pull ואז החלטה. שומר `etag`, `updated`, `last_pushed_hash`. |
| Watch | `events.watch` לכל יומן: `id = uuid`, `token = HMAC(calendar_id, secret)`, `address = https://<tunnel>/webhooks/gcal`. TTL מקסימלי ⚠️ לאימות (דוח 05 §10.5) — `calendar.watch-renew` מחדש כש-`expiration - now < 48h`. |
| Webhook | מאמת `X-Goog-Channel-Token` (HMAC) ו-`X-Goog-Channel-ID` מול `calendars`; `X-Goog-Resource-State: sync` → 200 בלבד; `exists`/`not_exists` → `boss.send('calendar.sync-pull', {calendar_id}, {singletonKey, singletonSeconds: 30})` (debounce). תמיד 200 מהר; עבודה ב-job. |
| Pull (Google → DB) | `events.list(calendarId, syncToken, showDeleted: true)`; `410 Gone` → full sync (`timeMin = today-30d`) ושמירת `nextSyncToken`. לכל אירוע: (א) יש `bee_event_id` ו-`updated == google_updated` ששמרנו → דילוג (שינוי שלנו). (ב) יש `bee_event_id` ו-`updated` חדש → השוואת `start/end/attendees` ל-DB; אם שונה → **לא** מעדכנים את הלו"ז; יוצרים `approvals(kind:'schedule_external_change', payload:{activity_id, google:{start,end}, db:{start,end}})` + אירוע `schedule.changed_externally` + התראה ל-self_chat. אישור → `PATCH activity` → `schedule.recompute` → push חוזר. דחייה → push של הערכים מה-DB (DB master). (ג) `status: cancelled` על אירוע שלנו → approval "לבטל שיבוץ?". (ד) אירוע **ללא** `bee_event_id` ביומן צוות → `resource_unavailability` (busy) לצורך קונפליקטים בלבד; לא נכנס ללו"ז. |
| מניעת לולאות | כל push כותב `bee_hash`; pull מתעלם כש-`extendedProperties.private.bee_hash == last_pushed_hash` ו-`updated` תואם. |
| מדיניות קונפליקט | **DB הוא המאסטר** לזמני פעילויות. עריכה ב-Google = הצעה לאישור (לא כתיבה ישירה). אירוע שנמחק ב-DB → `delete` ב-Google. אירוע שנמחק ב-Google → הצעה. |
| כשלים | 401 → רענון OAuth (credential ref ב-DB מוצפן); 403 `rateLimitExceeded`/429 → backoff; 404 על event → מסמנים `calendar_links.status='orphan'` וממשיכים. כל כישלון סופי → DLQ + דיווח בוקר. |

---

## (d) תקשורת

### d.1 מטריצת ערוצים לפי שלב/אירוע

ברירת מחדל ללקוח: **WhatsApp Cloud API (Utility)** → נפילה ל-**SMS** (אם אין WA / כישלון מסירה 24h) → **מייל טרנזקציוני** למסמכים/קישורים. מייל "אנושי" (Gmail API, בשרשור של ברק) להצעות, מו"מ ותכתובת עם חח"י/קונסטרוקטור. תבניות מלאות: `message-templates.json`.

| שלב | אירוע מפעיל (`project_events.type` / task) | נמען | ערוץ ראשי | תבנית (key) | קטגוריה |
|---|---|---|---|---|---|
| S01 | ליד אושר (`stage.advanced S01→S02`) | לקוח | WA | `lead_received` | utility |
| S01/S02 | `schedule_survey` | לקוח | WA | `survey_proposal` | utility |
| S02 | סקר נקבע (calendar) | לקוח | WA + SMS גיבוי | `survey_scheduled`, `survey_reminder` (יום לפני) | utility |
| S02 | `request_electric_bill` | לקוח | WA (+ קישור פורטל להעלאה) | `bill_request` | utility |
| S03 | `draft_outbound_quote` | לקוח | WA (קישור פורטל) + Gmail (PDF) | `quote_sent`, `quote_email_cover` | utility |
| S04 | `followup_every_3_days` | לקוח | WA | `quote_followup` | utility (⚠️ ניסוח "יבש"; שיווקי → marketing) |
| S04 | חוזה מוכן | לקוח | WA + email | `contract_ready_to_sign` | utility |
| S04 | חשבונית מקדמה | לקוח | WA + email | `deposit_payment_link` | utility |
| S04 | `contract.signed` | לקוח | WA | `contract_signed_confirmation` | utility |
| S05 | טופס מוכן לחתימה / ייפוי כוח | לקוח | WA (פורטל) | `iec_form_sign_request` | utility |
| S05 | הבקשה הוגשה (מספר בקשה) | לקוח | WA | `iec_submitted` | utility |
| S05 | הצעת חשבון חח"י | לקוח | WA | `iec_fee_request` | utility |
| S05 | תשובת מחלק חיובית | לקוח | WA | `iec_answer_positive` | utility |
| S05 | תשובת מחלק שלילית/מותנית | לקוח | טלפון + Gmail (ידני) | — (אין תבנית אוטומטית; שיחה) | — |
| S06 | בקשת שרטוט | קונסטרוקטור | Gmail | `constructor_request` (other) | — |
| S07 | PO | ספק | Gmail/WA | `po_sent`, `delivery_confirm_request` (supplier) | — |
| S08 | `assign_crew` + calendar | לקוח | WA + SMS | `installation_scheduled`, `installation_reminder` (יום לפני, SMS) | utility |
| S08 | צ'קליסט הושלם | לקוח | WA | `installation_completed` | utility |
| S09 | `book_inspector` | לקוח / בודק | WA / Gmail | `inspection_scheduled`, `inspector_booking` (other) | utility |
| S10 | הזמנת בדיקת חח"י + תשלום | לקוח | WA | `iec_inspection_fee_request` | utility |
| S10 | בדיקת חח"י נקבעה | לקוח | WA | `iec_inspection_scheduled` | utility |
| S10 | `grid.meter.installed` | לקוח | WA | `meter_installed` | utility |
| S11 | מסירה / תיק מתקן | לקוח | WA + email | `handover_ready`, `handover_pack_email` | utility |
| S11 | `monitoring.link.active` | לקוח | WA | `monitoring_active` | utility |
| S12 | בדיקה תקופתית | לקוח | WA | `periodic_inspection_reminder` | utility |
| S12 | קריאת שירות נפתחה/נסגרה | לקוח | WA | `service_ticket_opened`, `service_ticket_closed` | utility |
| S12 | חידוש חוזה / הפניות | לקוח | WA | `contract_renewal_offer` | **marketing** (consent חובה) |
| S02/S08/S09/S10 | `schedule.changed` (אבן-דרך זזה > 5 י"ע) | לקוח | WA | `schedule_changed` | utility |
| כל שלב | OTP (פורטל/חתימה) | לקוח | SMS (ראשי) / WA authentication | `otp` | authentication (חריג ל-pick: תגובה לפעולת לקוח — ראו הערה בתבנית) |
| כל שלב | magic link / "מסמך מוכן" | לקוח | email טרנזקציוני | `portal_magic_link`, `document_ready` | — |
| פנימי | דיווח בוקר, התראות | ברק | WA self_chat | `morning_report`, `internal_alert` | — (Law #1) |

### d.2 מודל `CommunicationLog`

```
communication_log(
  id uuid, project_id uuid null, customer_id uuid null, contact_id uuid null,
  channel text,            -- whatsapp | sms | email | phone | portal | in_person
  direction text,          -- in | out
  provider text,           -- meta | inforu | sms019 | gmail | resend | hermes | manual
  provider_message_id text, thread_id text,          -- gmail threadId / WA conversation
  destination_class text,  -- self_chat | neri_group | drafts_group | voice_transcripts | customer | supplier | other
  template_key text, template_version int, params jsonb,
  body_rendered text,      -- הטקסט כפי שנשלח/התקבל (PII — RLS)
  attachments jsonb,       -- [{document_id, mime, name}]
  status text,             -- draft | pending_pick | approved | queued | sent | delivered | read | failed | received | cancelled | expired
  job_id text, approval_id uuid, picked_by uuid, picked_at timestamptz,
  sent_at, delivered_at, read_at, failed_at, error jsonb,
  reply_to_log_id uuid, event_id ulid,                -- האירוע שהפעיל
  ai_extraction jsonb,     -- {schema, data, confidence, model_tier, source_message_id}
  consent_basis text,      -- operational | marketing_consent | authentication
  created_at, updated_at,
  unique (provider, provider_message_id)
)
```

סטטוסי Meta (`sent/delivered/read/failed`) מתעדכנים מ-webhook `statuses[]`; `failed` עם קוד 131047/131049 (מחוץ לחלון/לא נמסר) → fallback SMS מוצע (draft חדש, לא אוטומטי). כל שורה יוצאת מצביעה על `approval_id` (חוץ מ-`destination_class` ב-Law #1).

### d.3 מימוש שער האמון (Law #1 / Law #2)

```
[trigger] enterStage / task / agent tool  ──▶ comms.createDraft({template_key, params, project_id, destination})
   │  1. resolve destination_class (customer/supplier/other ⇐ contact.kind; self_chat/… ⇐ internal)
   │  2. render body from message-templates (versioned); validate params (Zod per template)
   │  3. INSERT communication_log(status='draft')
   │  4. INSERT jobs(kind='dispatch', loop='dispatch.draft', trustTier='L1', costTier=2,
   │        outbound={channel, destinationClass, requiresHumanPick: destinationClass ∉ law1Destinations})
   ▼
[supervisor / trust check]  (platform/schema/loops.json → trustGate)
   │  if destinationClass ∈ law1Destinations      → may send directly (self_chat / drafts_group …)
   │  if destinationClass ∈ forbiddenWithoutPick  → MUST have requiresHumanPick=true, else job.status='blocked_trust'
   ▼
[human pick]  UI "ממתינות לבחירה" + כרטיס ל-drafts_group (תבנית `drafts_group_card`, Law #1)  — כפתורים: שלח / ערוך פרמטרים / בטל / דחה ל-
   │  approvals(id, kind='outbound_msg', payload={comm_log_id, body_hash}, requested_by, status, decided_by, decided_at, edited_params)
   │  pick ⇒ communication_log.status='approved', picked_by/at  ⇒ boss.send('comm.send-approved')
   ▼
[send]  comm.send-approved: re-verify approval(status='approved' ∧ body_hash matches) → provider API → status='sent' → provider id
   │  loops.json: loop 'dispatch.send-customer' {outbound:{destinationClass:'customer', requiresHumanPick:true}} — job carries approval_id
   ▼
[audit]  project_events comm.picked / comm.sent  ·  audit_log(actor, approval_id, comm_log_id)
```

- **מחלקות יעד** (מ-`job.schema.json`): `self_chat` (ברק), `neri_group` (dev), `drafts_group` (טיוטות ל-pick), `voice_transcripts` — Law #1, ללא pick. `customer`, `supplier`, `other` (בודק, קונסטרוקטור, חח"י, רשות) — Law #2, pick חובה. הסיווג נגזר מ-`contacts.kind`, לא מהמבקש.
- **עריכה לפני שליחה:** תבנית Meta קבועה — ניתן לערוך פרמטרים בלבד; טקסט חופשי מותר רק בתוך חלון 24h של שיחה פתוחה (ואז `template_key='freeform'`, עדיין pick).
- **תוקף טיוטה:** 7 ימים → `expired`; טיוטה שהתיישנה כי השלב השתנה → `cancelled` אוטומטית (ה-job בודק `entered_seq`).
- **הודעות פנימיות:** `dispatch.alert` ל-`self_chat` בלבד; שום job לא יכול לשנות `destinationClass` אחרי יצירה (עמודה immutable ב-trigger).
- **סוכן AI:** הכלי `send_customer_message` **לא שולח** — הוא קורא ל-`comms.createDraft` בלבד; השליחה תמיד אחרי pick אנושי. כך גם `canUseTool` וגם Trust Gate חייבים להסכים.

### d.4 צינור קליטת הודעות נכנסות (Intake)

```
Meta Cloud API webhook ──┐
Hermes/Alfred (מספר ישן) ─┼─▶ n8n (WhatsApp Trigger / Gmail Trigger) ──▶ POST /api/comms/inbound   (או ישירות ל-Fastify)
Gmail (collect.mail poll) ─┘        (n8n = צינור בלבד; API key של Better Auth עם scope inbound:write)
        │
        ▼
1. verify  — Meta: X-Hub-Signature-256 (HMAC app secret); Hermes: shared token; Gmail: OAuth של ברק.
2. dedup   — unique(provider, provider_message_id); חזרה שקטה על כפילות.
3. log     — INSERT communication_log(direction='in', status='received', body, attachments → R2 (collect media), ai_extraction=null)
4. job     — boss.send('comm.inbound-intake')  ⇐ loop collect.wa / collect.mail (L1, costTier 1)
5. edit.normalize — טלפון ל-E.164 (05x → +9725x), עברית/תאריכים/סכומים (spine primitives), הסרת חתימות מייל.
6. match   — contacts.phone_e164 / email → customer → פרויקט פעיל (האחרון שאינו S12, אחרת S12).
   ├─ נמצא: attach to project; project_events comm.received; אם status='waiting_customer' → הצעת SET_STATUS(in_progress) (אוטומטי: כן, חסר סיכון);
   │          התראה לבעל המשימה הפתוחה; אם יש קובץ (חשבון חשמל/קבלה) → Receipt/status updater (f.6).
   └─ לא נמצא: edit.intake-extract → סוכן Intake (f.1) → Zod {customer, site, bill, intent, confidence[]}
              → INSERT lead_drafts(payload, source_log_id, confidence) → UI "ליד חדש לאישור" + dispatch.alert (self_chat).
              אישור בלחיצה אחת ⇒ Customer+Site+Project(S01) ; דחייה ⇒ lead_drafts.status='rejected' (נשמר ללמידה).
7. privacy — לפני LLM: redact ת"ז (9 ספרות עם ספרת ביקורת), מספרי כרטיס; לא שולחים תמונות ת"ז; רק טקסט + מטא-דאטה נחוצה.
8. reply   — אין מענה אוטומטי ללקוח (Law #1). החלטה פתוחה לברק: "קיבלנו, נחזור אליך" כתבנית ש-pick שלה מרוכז בבוקר.
```

---

## (e) פורטל לקוח

### e.1 עמודים

| נתיב | תוכן | זמין מ- |
|---|---|---|
| `/p/login` | magic link (מייל) / OTP (SMS או WA authentication); ללא סיסמה | תמיד |
| `/p` (בית) | ציר אבני-דרך (`customer_visible`), "השלב הבא ומה אנחנו צריכים ממך", איש קשר, תאריך צפוי (CPM מעוגל לשבוע, "משוער") | S01+ |
| `/p/actions` | משימות ללקוח: העלאת חשבון חשמל, חתימה, תשלום, אישור מועד, הסכמות | S02+ |
| `/p/documents` | מסמכים ששוחררו ללקוח (presigned) + לוג הורדות | S03+ |
| `/p/quote/:version` | צפייה בהצעה, השוואת גרסאות, "אשר הצעה" (click-to-accept) | S03+ |
| `/p/sign/:document` | חתימה click-to-accept: תצוגת PDF + sha256, OTP, חתימה מצוירת, אישור | S04, S05 (טפסים), S11 |
| `/p/payments` | חשבוניות, קישורי תשלום (Grow/Cardcom דרך ספק החשבוניות), קבלות | S04+ |
| `/p/appointments` | סקר/התקנה/בדיקה: מועד, צוות, "אשר"/"בקש שינוי" (בקשה = משימה ל-pm, לא שינוי ישיר) | S02+ |
| `/p/photos` | תמונות לפני/אחרי (EXIF מנוקה) | S08+ |
| `/p/monitoring` | KPI בסיסי מ-bee-live (ייצור היום/חודש, סטטוס תקשורת) | S11+ |
| `/p/service` | פתיחת קריאת שירות, חוזה תחזוקה, היסטוריה | S12 |
| `/p/privacy` | הודעת איסוף (סעיף 11), הסכמות (שיווק, נתוני חח"י), בקשת עיון | תמיד |

### e.2 אימות (Better Auth)

- plugins: `magic-link` (מייל טרנזקציוני מסאב-דומיין), `phone-number` + `email-otp` (OTP 6 ספרות, תוקף 10 דק', 5 ניסיונות/שעה, `otp` SMS ראשי; WA authentication template חלופה).
- קישור: `https://portal.<domain>/p/login?token=…` — חד-פעמי, 15 דק', קשור ל-`customer_id` (לא לפרויקט; הלקוח רואה את כל הפרויקטים שלו). session ארוך (90 יום) על המכשיר, `secure`/`httpOnly`/`sameSite=lax`.
- `customer_users(user_id, customer_id, contact_id, role 'primary'|'viewer')` — איש קשר נוסף (בן/בת זוג, מנהל נכס) דרך הזמנה של ברק.
- בכל request: `set_config('app.role','customer')`, `set_config('app.customer_id', …)` → RLS (g.2).
- rate limit על `/p/login`, לוג כניסות (`auth_log`), אין PII ב-URL.

### e.3 מה גלוי ללקוח לפי שלב

| שלב | אבן-דרך (תווית) | מסמכים | פעולות |
|---|---|---|---|
| S01 | "קיבלנו את הפנייה" | — | אימות פרטים |
| S02 | "סקר אתר" | סיכום סקר (אחרי אישור ברק) | העלאת חשבון חשמל, אישור מועד סקר |
| S03 | "הצעת מחיר" | הצעה PDF (גרסאות שנשלחו בלבד) | אישור הצעה / בקשת שינוי |
| S04 | "הסכם ומקדמה" | הסכם, חשבונית מקדמה, קבלה | חתימה, תשלום |
| S05 | "הגשה לחברת החשמל" | טופס בקשה לחתימה, קבלה, תשובת מחלק (אחרי שחרור) | חתימת טופס/ייפוי כוח, תשלום אגרה (אם הלקוח משלם) |
| S06 | "תכנון מפורט" | — (סט תוכניות רק אחרי אישור ברק; `customer_visible=false` כברירת מחדל) | — |
| S07 | "הזמנת ציוד" | — | — |
| S08 | "התקנה" | דוח התקנה מסכם, תמונות | אישור מועד, חתימה על דוח יומי (אופציונלי) |
| S09 | "בדיקת בודק" | דוח בודק (אחרי שחרור) | — |
| S10 | "חיבור לרשת" | אישור חיבור | תשלום אגרת בדיקה (אם רלוונטי), הרשמה לפורטל יצרנים (הנחיות) |
| S11 | "מסירה" | תיק מתקן, אחריות, חשבונית סופית | חתימת מסירה, תשלום סופי, הסכמת נתוני חח"י |
| S12 | "ניטור ותחזוקה" | דוחות תקופתיים | קריאת שירות, חידוש חוזה |

שחרור מסמך ללקוח = דגל `documents.customer_visible` שמסומן ידנית או על-ידי auto_task (הצעה שנשלחה, חוזה, קבלה, תיק מתקן); ברירת מחדל `false`.

### e.4 גישה למסמכים

`GET /portal/documents/:id/url` → בדיקת RLS (customer_id) + `customer_visible` → R2 presigned GET (10 דק', `Content-Disposition` עם שם עברי מקודד) → `document_access_log(document_id, user_id, ip, ua, at)` → redirect. תמונות: גרסת `web` ללא EXIF. אין ל-bucket גישה ציבורית; המפתחות בשרת בלבד.

### e.5 חתימה ותשלום — נקודות כניסה

- **חתימה (שלב א'):** `POST /portal/sign/:document/start` → OTP SMS → `POST /portal/sign/:document/confirm {otp, signature_png, accepted: true}` → `signatures(entity, document_id, sha256, otp_ref, ip, ua, signed_at, signature_image_ref)` → דף תעודה PDF מצורף למסמך → אירוע `doc.signed` → fact (`contract.signed` / `handover.signed_by_customer`). שלב ב' (Documenso) מחליף את הצעד האמצעי בלבד. ⚠️ תקפות משפטית לאימות עם עו"ד (V17).
- **תשלום:** `Invoice` (Morning) → קישור תשלום מספק הסליקה (`payment_links(invoice_id, provider, url, expires_at)`) → webhook ספק (חתום) → `payments(kind, amount, settled_at, provider_ref)` → fact `payment.deposit.received`. אין שמירת פרטי כרטיס. הפורטל רק מפנה ל-URL של הספק.

---

## (f) סוכני AI (Claude Agent SDK)

### f.1 גדרות משותפות

- **Runtime:** job `agent.run` (pg-boss) מריץ `query()` של ה-Agent SDK עם `mcpServers: { bee: createSdkMcpServer(...) }`, `allowedTools` = רשימה מפורשת של כלי קריאה (`mcp__bee__get_*`, `mcp__bee__search_*`), **ללא wildcard**. כלי כתיבה מסומנים `_meta["anthropic/requiresUserInteraction"]` → מגיעים תמיד ל-`canUseTool` (דוח 05 §7.2; דורש גרסת SDK תואמת — לאימות בזמן מימוש).
- **`canUseTool`:** כותב `approvals(kind, payload, requested_by='agent:<name>', session_id, tool, input_hash)`; שולח `dispatch.alert` ל-self_chat; מחזיר `deny` עם הודעה "ממתין לאישור #id" **או** — כשמוגדר `PreToolUse` hook עם `defer` — ה-session נשמר (`resume`) ומתחדש כשהאישור מגיע (job `agent.resume`). ברירת המחדל: defer לכל כלי כתיבה; האישורים מרוכזים בדיווח הבוקר.
- **Hooks:** `PreToolUse` — חסימת PII (ת"ז, מסמכי זהות) בקלט לכלים חיצוניים; `defer` לכלי כתיבה. `PostToolUse` — `audit_log(actor='agent', agent, session_id, tool, input, output_hash, approval_id, cost)`. `PermissionRequest` → WhatsApp self_chat.
- **Idempotency:** כל כלי כתיבה מקבל `idempotency_key = sha256(project_id|tool|canonical(input))`; חזרה על קריאה מחזירה את התוצאה הקודמת.
- **Structured output:** `outputFormat` עם Zod לכל סוכן; כל שדה שנחלץ נושא `confidence` ו-`source_ref` (message id / page).
- **Cost tier** (מ-`job.schema.json`, 0–4): 0 = ללא LLM; 1 = חילוץ/סיווג קצר; 2 = ניסוח/סיכום; 3 = הסקה הנדסית/תכנון; 4 = session ארוך עם כלים. מיפוי tier → מודל ו-effort הוא קונפיגורציה (`agent_config`), לא קוד; מחירי מודלים ומזהים — לפי הקטלוג העדכני בזמן מימוש, לא במסמך זה.
- **פרטיות:** אין שליחת ת"ז/צילומי זהות/פרטי כרטיס ל-LLM; חשבונות חשמל — רק שדות נחוצים (צריכה, גודל חיבור, מס' חוזה מוסווה); DPA עם Anthropic (§15).

### f.2 מפרט לכל סוכן

| סוכן | טריגר | קלט | כלים (read) | כלים (write, gated) | פלט (Zod) | מסלול אישור | audit | cost |
|---|---|---|---|---|---|---|---|---|
| **Intake** | `comm.inbound-intake` ללא התאמה; טופס אתר | טקסט הודעה (מנוקה), מטא (טלפון, שעה), קבצים (סוג בלבד) | `get_catalog_summary`, `get_rules(scope='track')`, `search_contacts` | `create_draft_lead` | `IntakeDraft` | UI אישור בלחיצה (lead_drafts) — לא `defer`, כי הכלי כותב רק טיוטה | log + lead_drafts.source_log_id | 1 |
| **Quote drafter** | S03 אחרי `build_design_lite` + `price_from_assemblies` (או ידני) | Survey (מנורמל), Design-lite, Catalog/Assemblies, PricingRule, Rules (R7–R23) | `get_project`, `get_survey`, `get_design`, `get_assemblies`, `price_lines` (מנוע תמחור — read), `get_rules` | `create_quote_draft` | `QuoteDraft` | `requiresUserInteraction` → approval 'quote_draft' → ברק מאשר ב-UI עם diff מול מחירון; `defer` | audit + `quote_versions.generated_by` | 2 |
| **Price-list ingest** | העלאת PDF/Excel ספק | קובץ (document block), מחירון קודם | `get_price_list(prev)`, `get_products` | `create_price_list_draft` | `PriceListDraft` (שורות + diff) | אישור אנושי ב-UI (diff) | audit + sha256 קובץ | 2 |
| **Design assistant** | S06 אחרי `run_eplan` (STATUS/RESULT/NEXT) או שאלת ברק | spec YAML, CalcReport, verify[], BOM, דפי נתונים | `get_design`, `get_calc_report`, `get_datasheet`, `run_eplan_dry` (read: הרצה ללא שמירה) | `propose_spec_change` | `DesignProposal` | ברק מחליט (`owner_accepted`) — `defer` | audit + `designs.rev` | 3 |
| **Submission assistant** | S05/S10 `build_submission_steps_from_profile`; שאלת pm | Project, track, Submission steps, Documents, `iec_sla_params`, business_calendar | `get_project`, `get_submission`, `get_documents`, `get_business_calendar`, `get_rules` | `create_task`, `link_document`, `draft_customer_message` (→ dispatch.draft) | `SubmissionPlan` | משימות/קישור מסמך: approval קל (batch בבוקר); הודעות: pick | audit | 2 |
| **Receipt/status updater** | `comm.inbound-intake` עם קובץ; מייל מדומיין חח"י; העלאה ידנית | תמונה/PDF של קבלה/אישור/תשובת מחלק, Submission פתוחה | `get_submission`, `search_comms`, vision על המסמך | `propose_submission_update` (fee paid / answer / inspection date), `propose_transition` | `StatusProposal` | approval 'status_update'; **אוטומטי** רק כש-`source.domain ∈ iec_domains ∧ request_no match ∧ event ∈ low_risk` (קבלה, מועד) — לעולם לא `ADVANCE` | audit + `submission_steps.evidence_document_id` | 1 |
| **Stuck-project monitor** | cron `report.stuck-scan` | `stuck_projects` view, 5 אירועים אחרונים לפרויקט | `get_stuck_projects`, `get_project_timeline` | — (אין כלי כתיבה; ממליץ בלבד) | `StuckDigest` | ללא; הפלט נכנס לדיווח בוקר (self_chat, Law #1) | log | 1 |

### f.3 סכמות Zod (סקיצה)

```ts
export const Confidence = z.object({ value: z.number().min(0).max(1), source_ref: z.string() });

export const IntakeDraft = z.object({
  customer: z.object({ name: z.string(), phone_e164: z.string(), email: z.string().email().nullable(), kind: z.enum(['private','business','agri','kibbutz']) }),
  site: z.object({ address_text: z.string().nullable(), city: z.string().nullable(), roof_type: z.enum(['tiles','concrete','metal','ground','unknown']) }),
  bill: z.object({ monthly_kwh: z.number().nullable(), connection: z.enum(['1x25','1x40','3x25','3x40','3x63','3x80','3x100','3x160','3x250','other','unknown']).nullable(), contract_no_masked: z.string().nullable() }),
  intent: z.enum(['pv','pv_bess','bess_add','ev','service','other']),
  urgency: z.enum(['low','normal','high']),
  profile_guess: z.enum(['RES_LE_15','COM_LE_100','COM_LE_630','LARGE_GT_630','BESS_ADD','HISTORIC_DIST']).nullable(),
  summary_he: z.string().max(400),
  confidence: z.record(Confidence),        // per field
  source_log_ids: z.array(z.string().uuid()),
});

export const QuoteDraft = z.object({
  design_lite_rev: z.string(),
  sections: z.array(z.object({
    key: z.string(), title_he: z.string(),
    lines: z.array(z.object({ product_id: z.string().nullable(), assembly_id: z.string().nullable(), description_he: z.string(),
      qty: z.number(), unit: z.string(), price_list_entry_id: z.string().nullable(), rule_id: z.string().nullable(),
      verification: z.enum(['validated','office','summary','unverified']), rationale_he: z.string().max(300) })),
  })),
  assumptions_he: z.array(z.string()),
  open_questions_he: z.array(z.string()),  // "HUMAN_INPUT_REQUIRED" items
  confidence: z.record(Confidence),
});

export const StatusProposal = z.object({
  submission_id: z.string().uuid(), step_key: z.string(),
  kind: z.enum(['fee_paid','answer_received','inspection_scheduled','meter_installed','document_link_only']),
  fields: z.object({ amount: z.number().nullable(), paid_at: z.string().date().nullable(), request_no: z.string().nullable(),
    result: z.enum(['positive','negative','conditional']).nullable(), scheduled_at: z.string().date().nullable(), meter_serial: z.string().nullable() }),
  evidence_document_id: z.string().uuid(),
  source: z.object({ channel: z.string(), from_domain: z.string().nullable(), message_id: z.string() }),
  auto_apply_eligible: z.boolean(),         // computed by code, not by the model
  confidence: z.record(Confidence),
});

export const StuckDigest = z.object({
  date: z.string().date(),
  items: z.array(z.object({ project_id: z.string().uuid(), rules: z.array(z.string()), why_he: z.string().max(200), next_step_he: z.string().max(160), severity: z.enum(['low','medium','high']) })).max(30),
  changed_since_yesterday: z.array(z.string().uuid()),
});
```

(`PriceListDraft`, `DesignProposal`, `SubmissionPlan` באותו דפוס: רשימות + `confidence` + `open_questions_he`.)

### f.4 פריסת שרת MCP (in-process)

```
server/src/modules/ai/
  mcp/
    server.ts            createSdkMcpServer({ name: 'bee', tools: [...read, ...write] })
    tools/read/          get_project · get_facts · get_project_timeline · get_survey · get_design · get_calc_report ·
                         get_quote_version · get_submission · get_documents · get_schedule · get_business_calendar ·
                         get_rules · get_catalog_summary · get_assemblies · price_lines · get_price_list · get_products ·
                         search_contacts · search_comms · get_stuck_projects · run_eplan_dry
    tools/write/         create_draft_lead · create_quote_draft · create_price_list_draft · propose_spec_change ·
                         create_task · link_document · draft_customer_message · propose_submission_update ·
                         propose_transition · transition_project
                         (all: _meta['anthropic/requiresUserInteraction']=true, input includes idempotency_key, actor=agent)
  agents/<name>/         prompt.md · schema.ts (Zod) · config.ts (cost_tier, allowedTools, effort) · tests/
  hooks/                 preToolUse.ts (PII guard, defer) · postToolUse.ts (audit) · permissionRequest.ts (self_chat)
  approvals/             service.ts (create/decide/resume) · routes.ts
```

- כלי קריאה פועלים תחת RLS של role `agent` (קריאה כמו engineer, ללא PII רגיש: ת"ז, צילומי מסמכים).
- `transition_project` קיים לצורך "ADVANCE" מוצע בלבד: הקריאה יוצרת approval; ה-service מריץ `transition()` רק אחרי החלטה אנושית.
- בדיקות: לכל סוכן סט דוגמאות (הודעות נכנסות, קבלות, מחירונים) עם פלט צפוי; eval רץ ב-CI בלי רשת (recorded).

---

## (g) תפקידים, הרשאות ו-RLS

### g.1 מטריצה תפקיד × ישות

סימון: **W** כתיבה מלאה · **w** כתיבה מוגבלת (שדות/תנאי) · **R** קריאה · **r** קריאה חלקית (ללא PII / רק `customer_visible` / רק שלו) · — אין.

| ישות | owner | engineer | pm | technician | surveyor | customer | inspector | supplier | agent | n8n_reader |
|---|---|---|---|---|---|---|---|---|---|---|
| Customer / Contact | W | W | W | r (שם+טלפון של הפרויקטים שלו) | r | r (עצמו) | r (שם) | — | r (ללא ת"ז) | r (ללא ת"ז/טלפון/מייל) |
| Site | W | W | W | r | W (שלו) | r | r | — | R | r |
| Project (stage/status) | W | W | W | r | r | r (אבני דרך) | r | — | R | r |
| project_events | W (append) | W | W | w (שלו) | w | — | — | — | w (דרך approvals) | R |
| Task | W | W | W | w (משובץ) | w | w (משימות לקוח) | w (שלו) | — | w (create via approval) | R |
| Schedule / Gantt | W | W | W | r | — | r (מועדים שלו) | r (מועד שלו) | r (אספקות) | R | R |
| Survey / Photo | W | W | R | R | W | r (סיכום) | — | — | R | r |
| Design / DrawingSet / CalcReport | W | W | R | r (PDF) | — | r (אם שוחרר) | R | — | R | — |
| Quote / QuoteVersion | W | w (טיוטה; שליחה = owner) | r | — | — | r (שנשלחו) | — | — | w (draft) | r (ללא עלויות) |
| Contract / Signature | W | R | R | — | — | w (חתימה) | — | — | — | — |
| Invoice / Payment | W | R | R | — | — | r + תשלום | — | — | — | — |
| Submission / Steps / Fee | W | W | W | — | — | r (סטטוס) | — | — | w (proposal) | r |
| PurchaseOrder / Delivery | W | R | W | — | — | — | — | w (שלו: אישור מועד, תעודת משלוח) | R | r |
| WorkOrder / DailyReport / Checklist | W | W | W | W (משובץ) | — | r (דוח מסכם) | — | — | R | r |
| Inspection / TestResult / Defect | W | W | R | w (תיקון ליקוי) | — | r (דוח) | W (שלו, בחלון זמן) | — | R | — |
| GridConnection | W | W | W | — | — | r | — | — | R | r |
| HandoverPack / Warranty | W | W | R | — | — | r | — | — | R | r |
| MonitoringLink | W | W | R | — | — | r (KPI) | — | — | R | — (credentials לעולם לא) |
| Document | W | W | W | w (העלאה) | w | r (customer_visible) | w (העלאת דוח) | w (תעודת משלוח) | w (link via approval) | r (מטא בלבד) |
| CommunicationLog | W | W | W | r (שלו) | — | r (ההודעות אליו) | — | — | R (ללא PII) | — |
| approvals | W (decide) | w (decide בתחומו) | w | — | — | — | — | — | w (request only) | — |
| Catalog / PriceList / Assembly / PricingRule | W | R | R | — | — | — | — | — | R | r (ללא עלות) |
| Rule | W (reviewer) | R | R | — | — | — | — | — | R | R |
| Jobs ledger | W | R | R | — | — | — | — | — | r | R |
| business_calendar | W | W | W | R | R | — | — | — | R | R |
| MaintenanceContract / ServiceTicket | W | W | W | w | — | w (פתיחה) | — | — | R | r |

מיפוי `owner_role` מה-JSON לתפקידי המערכת: `sales`→owner/pm (אין תפקיד sales ב-§15 — ראו אי-התאמות), `procurement`→pm, `foreman`→technician עם `crew_lead=true`, `service`→engineer/technician.

### g.2 סקיצת RLS

```sql
-- per request (pool-safe: local to the transaction)
BEGIN;
SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true), set_config('app.customer_id', $3, true);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_staff ON projects FOR ALL
  USING (current_setting('app.role', true) IN ('owner','engineer','pm'));
CREATE POLICY projects_customer ON projects FOR SELECT
  USING (current_setting('app.role', true) = 'customer'
         AND customer_id = current_setting('app.customer_id', true)::uuid);
CREATE POLICY projects_technician ON projects FOR SELECT
  USING (current_setting('app.role', true) = 'technician'
         AND EXISTS (SELECT 1 FROM work_orders w JOIN crew_members cm ON cm.crew_id = w.crew_id
                     WHERE w.project_id = projects.id AND cm.user_id = current_setting('app.user_id', true)::uuid));
CREATE POLICY projects_inspector ON projects FOR SELECT
  USING (current_setting('app.role', true) = 'inspector'
         AND EXISTS (SELECT 1 FROM inspections i WHERE i.project_id = projects.id
                     AND i.inspector_user_id = current_setting('app.user_id', true)::uuid
                     AND now() BETWEEN i.access_from AND i.access_to));
CREATE POLICY projects_agent ON projects FOR SELECT
  USING (current_setting('app.role', true) = 'agent');          -- agent: read-only; writes only via approvals

-- documents: customers see only released docs of their projects
CREATE POLICY documents_customer ON documents FOR SELECT
  USING (current_setting('app.role', true) = 'customer' AND customer_visible
         AND project_id IN (SELECT id FROM projects));           -- projects already filtered by RLS

-- append-only events
CREATE POLICY events_insert ON project_events FOR INSERT
  WITH CHECK (current_setting('app.role', true) IN ('owner','engineer','pm','technician','surveyor','system'));
REVOKE UPDATE, DELETE ON project_events FROM PUBLIC;

-- approvals: agents may insert requests, never decide
CREATE POLICY approvals_agent_insert ON approvals FOR INSERT
  WITH CHECK (current_setting('app.role', true) = 'agent' AND requested_by LIKE 'agent:%' AND status = 'pending');
CREATE POLICY approvals_decide ON approvals FOR UPDATE
  USING (current_setting('app.role', true) IN ('owner','engineer','pm'));

-- n8n_reader: separate DB role + PII-free views (no table grants)
CREATE VIEW v_customers_public WITH (security_barrier) AS
  SELECT id, name, city, created_at FROM customers;             -- no id_number, phone, email
GRANT SELECT ON v_customers_public, v_projects_public, v_project_events TO n8n_reader;
```

כללים: (1) RLS = רשת ביטחון; ההרשאות העסקיות נאכפות ב-Better Auth access control (organization plugin) בשכבת ה-API. (2) policies נפרדות ל-SELECT/INSERT/UPDATE; superuser/owner של ה-DB אינו משמש את האפליקציה. (3) בדיקות: לכל תפקיד סט שאילתות שחייבות להחזיר/לא להחזיר שורות (E2E ב-staging). (4) `audit_log` לכל קריאה של PII על-ידי agent/n8n (trigger על ה-views).

---

## (h) דיווח בוקר v2 — מפרט תוכן

- **מתי:** `report.morning` 07:00 בימי עבודה בלבד (`business_calendar`); בערב חג — גרסה מקוצרת ב-12:00 (החלטה פתוחה). **לאן:** WhatsApp `self_chat` (Law #1, `dispatch.alert`, `requiresHumanPick:false`); עותק HTML ב-`/reports/morning/:date` עם קישורים לכרטיסים; JSON ב-`morning_reports(date, payload, sent_at, sections_count)`.
- **מקורות:** `stuck_projects` (b.5), `projects.sla_due_at`, `tasks.due_at`, `submission_steps`, `schedule_activities`, `communication_log`, `approvals`, `pgboss.job`, `calendar_links.status`, טבלאות הניטור הקיימות של bee-live (ה-`morning-report` הקיים נבלע כסעיף 10).
- **כללי עריכה:** סעיף ריק מושמט; עד 8 פריטים לסעיף + "ועוד N"; שורה אחת לפריט: `• {לקוח קצר} · {שלב} · {מה} → {צעד}`; הודעת WhatsApp עד 4,000 תווים — פיצול לפי סעיפים; עברית RTL עם `‏` בתחילת שורות שמתחילות במספר/לטינית; כל פריט עם קישור קצר לכרטיס (`/p/…` לא; פנימי בלבד).

| # | סעיף | תוכן | מקור / כלל |
|---|---|---|---|
| 1 | כותרת | תאריך (לועזי + עברי), "י"ע/חג", מספר פרויקטים פעילים לפי שלב (S01…S12 כשורה אחת), מה השתנה מאתמול (±) | `projects`, `stuck_snapshots` |
| 2 | ממתין לאישורך | טיוטות הודעות ל-pick (`R-STUCK-12`), approvals של סוכנים (הצעות מחיר, סטטוס חח"י, שינויי לו"ז מ-Google), ChangeOrders | `approvals`, `communication_log.status='pending_pick'` |
| 3 | תקועים | מ-`stuck_projects` לפי חומרה; "למה" + "צעד מוצע"; פרויקטים שנוספו/יצאו מאתמול | b.5, סוכן Stuck monitor (ניסוח בלבד) |
| 4 | SLA היום ומחר | שלבים ש-`sla_due_at` נופל היום/מחר; משימות `blocks_exit` באיחור | `projects`, `tasks` |
| 5 | חח"י / מחלקים | לכל Submission פתוחה: צעד, מספר בקשה, י"ע שחלפו מול הפרמטר (עם "לאימות"), אגרות שלא שולמו, בדיקות חח"י שנקבעו השבוע | `submission_steps`, `iec_sla_params` |
| 6 | היום בשטח | התקנות/בדיקות/סקרים היום ומחר: לקוח, כתובת (קצר), צוות, מנוף, קונפליקטים; שינויים חיצוניים ביומן שלא אושרו | `schedule_activities`, `conflicts`, `calendar_links` |
| 7 | לקוחות שמחכים לנו | `waiting_engineer`/משימות של owner באיחור; הודעות נכנסות ללא מענה > 1 י"ע | `tasks`, `communication_log` |
| 8 | כסף | מקדמות ממתינות, חשבוניות סופיות שלא הונפקו/לא שולמו (מספר ימים), תשלומי חח"י שהלקוח חייב | `invoices`, `payments`, `submission_steps.fee` |
| 9 | נתונים ישנים | מחירונים > N ימים (`PriceList.valid_from`), כללים `unverified` שנגעו בהצעות שנשלחו השבוע, פרמטרי IEC ללא `verified_by` | `price_lists`, `rules`, `iec_sla_params` |
| 10 | ניטור (v1) | תוכן הדיווח הקיים: אתרים ללא תקשורת, אפס ייצור, התראות ממיר, 429/קרדיטים, קריאות שירות פתוחות | bee-live (קיים) |
| 11 | מערכת | jobs שנכשלו ב-24h (לפי queue), DLQ, שגיאות סנכרון יומן, ערוצי watch שפגים, גיבוי אחרון (WAL-G), heartbeat | `pgboss.job`, `calendar_links`, ops |
| 12 | כותרת תחתונה | "נוצר ב-{hh:mm}; נתוני ניטור עד {ts}; {n} סעיפים הושמטו (ריקים)" | — |

גרסת ערב (אופציונלי, 17:00): סעיפים 2, 6 (מחר) בלבד.

---

## אי-התאמות שזוהו בין מסמכי התכנון (לטיפול)

1. **שמות מסלולי אסדרה:** `01-lifecycle-stages.json` משתמש ב-`RES_LE_15 / COM_LE_100 / COM_LE_630 / LARGE_GT_630 / BESS_ADD / HISTORIC_DIST`; תוכנית האב §3 ודוח 01 משתמשים ב-`residential_le15 / commercial_15_100 / commercial_100_630 / mv_gt630 / bess_add / historic_distributor`. מפרט זה והתבניות משתמשים במזהי ה-JSON; לקבוע מיפוי אחד ב-`regulatory_tracks(code, legacy_code)`.
2. **תפקידים:** ה-JSON מגדיר `owner_role: sales | surveyor | owner | pm | procurement | foreman | service`; §15 מגדיר `owner, engineer, pm, technician, surveyor, customer, inspector, supplier, agent`. אין `sales/procurement/foreman/service` ב-§15 ואין `engineer` ב-JSON — מוצע מיפוי (g.1) ואיחוד.
3. **SLA של S04:** ה-JSON `sla_days: 21`; תוכנית האב §3 "תזכורת כל 3 ימים" — שניהם מיושמים (SLA שלב + מחזור followup), אך כדאי לציין במפורש.
4. **S08 `sla_source: "schedule"`** מול `sla_days: null` — המפרט מפרש: SLA = `planned_end` של הפעילות האחרונה בשלב מהלו"ז.
5. **`profile.pre_application_not_required`:** ה-JSON מניח שיש פרופילים בלי הגשה מקדימה; דוח 01 אינו מזהה כזה. סומן "לאימות לכל מסלול" עם ברירת מחדל "נדרש".
6. **`customer_visible` על שלבים:** דוח 05 §2.3 מציע `project_stage_defs.customer_visible`; ה-JSON לא כולל שדה כזה — מוצע להוסיף (`customer_visible`, `milestone_label_he`) לגרסה 0.3 של ה-JSON.
7. **`sla_days: 7` ב-S02 ו-`≤ 7 ימים` בטבלה** — לא ברור אם קלנדריים או י"ע; המפרט מניח י"ע לכל `sla_days`.
8. **שם הדיווח:** תוכנית האב §7 "הרחבת `morning-report`" (קיים ב-bee-live) — יש לוודא שם ה-job/מודול הקיים לפני מיזוג.
9. **מחיר WhatsApp/SMS, TTL של watch channel, API ה-persistence של XState, סף R17, היתר הפעלה (V10)** — כולם "לאימות" וממשיכים להיות מסומנים כך כאן.
