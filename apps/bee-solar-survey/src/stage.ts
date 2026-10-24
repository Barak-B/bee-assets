/**
 * Where a job stands, from the first phone call to service — the S01–S12
 * lifecycle of docs/plan/01-lifecycle-stages.json.
 *
 * The stage is derived, never moved by hand:
 *   - up to the customer's approval, from what the app and the customer page
 *     already know (survey, quote versions, links, approval);
 *   - after it, from milestones the office marks with a date (contract
 *     signed, IEC answer, equipment delivered, meter installed…) and from
 *     locked field reports.
 * The furthest evidence wins, then every stage whose exit is met is passed.
 * The office can put a status on top (on hold / lost / closed) that the data
 * cannot know.
 *
 * Shared by the field app (list chip) and the server (office screen).
 */

export type Stage =
  | 'lead'
  | 'survey'
  | 'quote'
  | 'sent'
  | 'accepted'
  | 'permits'
  | 'procurement'
  | 'installation'
  | 'inspection'
  | 'grid'
  | 'handover'
  | 'service'

export const STAGES: Stage[] = ['lead', 'survey', 'quote', 'sent', 'accepted', 'permits', 'procurement', 'installation', 'inspection', 'grid', 'handover', 'service']

export const STAGE_LABEL_HE: Record<Stage, string> = {
  lead: 'ממתין לסקר',
  survey: 'סקר',
  quote: 'הצעה',
  sent: 'נשלח ללקוח',
  accepted: 'הלקוח אישר',
  permits: 'חח״י ותכנון',
  procurement: 'רכש',
  installation: 'בהתקנה',
  inspection: 'בדיקת בודק',
  grid: 'חיבור מונה',
  handover: 'מסירה',
  service: 'נמסר · שירות',
}

/** The stage ids of docs/plan (S05 and S06 run in parallel, so they share one stage here). */
export const PLAN_STAGE: Record<Stage, string> = {
  lead: 'S01',
  survey: 'S02',
  quote: 'S03',
  sent: 'S04',
  accepted: 'S04',
  permits: 'S05+S06',
  procurement: 'S07',
  installation: 'S08',
  inspection: 'S09',
  grid: 'S10',
  handover: 'S11',
  service: 'S12',
}

/** What the customer is told (customer_visible_label_he in the plan). */
export const CUSTOMER_LABEL_HE: Record<Stage, string> = {
  lead: 'קיבלנו את פנייתך',
  survey: 'סקר אתר',
  quote: 'הצעת מחיר בהכנה',
  sent: 'הצעה לאישורך',
  accepted: 'הסכם ומקדמה',
  permits: 'בקשה לחברת החשמל ותכנון הנדסי',
  procurement: 'הזמנת ציוד',
  installation: 'התקנה',
  inspection: 'בדיקת בודק',
  grid: 'חיבור מונה חברת החשמל',
  handover: 'מסירה והפעלה',
  service: 'ניטור ותחזוקה',
}

/**
 * What is happening now, for the customer: plain, no promised dates (the
 * IEC's times are not ours to promise).
 */
export const CUSTOMER_NOW_HE: Partial<Record<Stage, string>> = {
  accepted: 'קיבלנו את אישורך. ניצור קשר לחתימה על ההסכם ולתשלום המקדמה.',
  permits: 'אנחנו מטפלים בבקשה לחברת החשמל ובתכנון ההנדסי. נעדכן כשתתקבל תשובה.',
  procurement: 'הבקשה אושרה והציוד בהזמנה. נתאם איתך מועד התקנה.',
  installation: 'שלב ההתקנה: הצוות מתואם איתך לגבי ימי העבודה.',
  inspection: 'ההתקנה הסתיימה. בודק חשמל מוסמך יבדוק את המערכת.',
  grid: 'ממתינים לחברת החשמל: בדיקה, התקנת מונה ואישור הפעלה.',
  handover: 'המערכת מחוברת. נתאם איתך מסירה, הדרכה ותיק מתקן.',
  service: 'המערכת פועלת ונמסרה. אנחנו כאן לשירות ולתחזוקה.',
}

export type MilestoneKey =
  | 'contract_signed'
  | 'deposit_paid'
  | 'iec_submitted'
  | 'iec_approved'
  | 'design_approved'
  | 'equipment_ordered'
  | 'equipment_delivered'
  | 'installation_done'
  | 'inspector_passed'
  | 'meter_installed'
  | 'grid_approved'
  | 'handover_signed'
  | 'final_invoice'
  | 'monitoring_active'

export interface MilestoneDef {
  key: MilestoneKey
  /** Two letters in storage (R2 metadata is small). Never reuse one. */
  code: string
  stage: Stage
  label_he: string
  /** The next step while it is missing. */
  action_he: string
  /** What the optional reference field holds, if it has one. */
  ref_he?: string
  /** Marking this one means the other happened too (an answer implies a submission). */
  implies?: MilestoneKey
}

/** In the order they happen; every milestone of a stage is needed to leave it. */
export const MILESTONES: MilestoneDef[] = [
  { key: 'contract_signed', code: 'cs', stage: 'accepted', label_he: 'הסכם נחתם', action_he: 'לחתום הסכם' },
  { key: 'deposit_paid', code: 'dp', stage: 'accepted', label_he: 'מקדמה התקבלה', action_he: 'לגבות מקדמה', ref_he: 'קבלה' },
  { key: 'iec_submitted', code: 'is', stage: 'permits', label_he: 'הוגשה בקשה לחח״י', action_he: 'להגיש בקשה לחח״י', ref_he: 'מספר פנייה' },
  { key: 'iec_approved', code: 'ia', stage: 'permits', label_he: 'תשובה חיובית מחח״י', action_he: 'לקבל תשובה מחח״י', implies: 'iec_submitted' },
  { key: 'design_approved', code: 'da', stage: 'permits', label_he: 'תכנון מפורט אושר', action_he: 'לאשר תכנון מפורט' },
  { key: 'equipment_ordered', code: 'eo', stage: 'procurement', label_he: 'ציוד הוזמן', action_he: 'להזמין ציוד', ref_he: 'הזמנה' },
  { key: 'equipment_delivered', code: 'ed', stage: 'procurement', label_he: 'ציוד הגיע / תואם', action_he: 'לוודא הגעת ציוד', implies: 'equipment_ordered' },
  { key: 'installation_done', code: 'in', stage: 'installation', label_he: 'ההתקנה הסתיימה', action_he: 'לסיים התקנה' },
  { key: 'inspector_passed', code: 'ip', stage: 'inspection', label_he: 'בודק אישר', action_he: 'לתאם בודק חשמל' },
  { key: 'meter_installed', code: 'mi', stage: 'grid', label_he: 'מונה הותקן', action_he: 'לתאם התקנת מונה' },
  { key: 'grid_approved', code: 'ga', stage: 'grid', label_he: 'אישור הפעלה מחח״י', action_he: 'לקבל אישור הפעלה' },
  { key: 'handover_signed', code: 'hs', stage: 'handover', label_he: 'מסירה נחתמה', action_he: 'לחתום מסירה מול הלקוח' },
  { key: 'final_invoice', code: 'fi', stage: 'handover', label_he: 'חשבון סופי יצא', action_he: 'להוציא חשבון סופי', ref_he: 'מספר חשבונית' },
  { key: 'monitoring_active', code: 'ma', stage: 'handover', label_he: 'ניטור פעיל ללקוח', action_he: 'לחבר את הלקוח לניטור' },
]

export const MILESTONE_BY_KEY = Object.fromEntries(MILESTONES.map((m) => [m.key, m])) as Record<MilestoneKey, MilestoneDef>

export interface Milestone {
  /** YYYY-MM-DD, Israeli calendar day. */
  date: string
  ref?: string
  /** Set by the system from a locked report, not by the office. */
  auto?: string
}

export type Milestones = Partial<Record<MilestoneKey, Milestone>>

export function isMilestoneKey(v: unknown): v is MilestoneKey {
  return typeof v === 'string' && v in MILESTONE_BY_KEY
}

/** References are numbers from other systems: ASCII only, short. */
export const MILESTONE_REF_RE = /^[A-Za-z0-9./-]{0,24}$/

/** "cs=20261020,is=20261022~1234567" — compact enough for R2 metadata. */
export function encodeMilestones(ms: Milestones): string {
  return MILESTONES.filter((d) => ms[d.key] && !ms[d.key]!.auto)
    .map((d) => {
      const m = ms[d.key]!
      return `${d.code}=${m.date.replaceAll('-', '')}${m.ref ? `~${m.ref}` : ''}`
    })
    .join(',')
}

export function decodeMilestones(s: string | undefined): Milestones {
  const out: Milestones = {}
  for (const part of (s ?? '').split(',')) {
    const m = /^([a-z]{2})=(\d{4})(\d{2})(\d{2})(?:~([A-Za-z0-9./-]{1,24}))?$/.exec(part)
    const def = m && MILESTONES.find((d) => d.code === m[1])
    if (!m || !def) continue
    out[def.key] = { date: `${m[2]}-${m[3]}-${m[4]}`, ...(m[5] ? { ref: m[5] } : {}) }
  }
  return out
}

export type OfficeStatus = 'active' | 'on_hold' | 'lost' | 'closed'
export const OFFICE_STATUSES: OfficeStatus[] = ['active', 'on_hold', 'lost', 'closed']
export const OFFICE_STATUS_LABEL_HE: Record<OfficeStatus, string> = {
  active: 'פעיל',
  on_hold: 'מוקפא',
  lost: 'לא רלוונטי',
  closed: 'סגור',
}

export interface StageFacts {
  /** The site was actually surveyed: photos taken, or the survey is complete enough for design. */
  surveyed: boolean
  quoteVersions: number
  /** Customer links that are still up. */
  liveLinks: number
  /** Any version approved by the customer (kept even if its link was later taken down). */
  accepted: boolean
  /** Installation-side reports of any status: daily report, installation checklist, 62446 inspection, defects. */
  installationReports: number
  /** A locked handover report. */
  handoverFinal: boolean
  /** A locked installation checklist (with its date). */
  installationChecklistFinalAt?: string
  /** When the handover report was locked. */
  handoverFinalAt?: string
  /** What the office marked. */
  milestones?: Milestones
}

const INSTALLATION_TEMPLATES = new Set(['daily_report', 'installation_checklist', 'inspection_62446', 'defects'])

export function isInstallationTemplate(templateKey: string): boolean {
  return INSTALLATION_TEMPLATES.has(templateKey)
}

const day = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '')

/**
 * The office's milestones plus what locked reports prove, and what marking a
 * milestone implies. The office's own entry wins over a derived one.
 */
export function effectiveMilestones(f: StageFacts): Milestones {
  const ms: Milestones = { ...(f.milestones ?? {}) }
  if (f.handoverFinal && !ms.handover_signed) ms.handover_signed = { date: day(f.handoverFinalAt), auto: 'דוח מסירה נעול' }
  if (f.installationChecklistFinalAt && !ms.installation_done) ms.installation_done = { date: day(f.installationChecklistFinalAt), auto: 'צ׳קליסט התקנה נעול' }
  for (const d of MILESTONES) {
    const m = ms[d.key]
    if (m && d.implies && !ms[d.implies]) ms[d.implies] = { date: m.date, auto: `נגזר מ"${d.label_he}"` }
  }
  return ms
}

export function stageMilestones(stage: Stage): MilestoneDef[] {
  return MILESTONES.filter((m) => m.stage === stage)
}

/** A stage with milestones is left once all of them are in; the others are left by evidence only. */
function exitMet(stage: Stage, ms: Milestones): boolean {
  const need = stageMilestones(stage)
  return need.length > 0 && need.every((m) => !!ms[m.key])
}

/** The stage the job is in now. */
export function deriveStage(f: StageFacts): Stage {
  const ms = effectiveMilestones(f)
  let floor: Stage = f.surveyed ? 'survey' : 'lead'
  if (f.quoteVersions > 0) floor = 'quote'
  if (f.liveLinks > 0) floor = 'sent'
  if (f.accepted) floor = 'accepted'
  let i = STAGES.indexOf(floor)
  // Evidence of a later stage: a milestone the office marked (a paper contract
  // signed without the online approval counts), field reports from the roof.
  for (const d of MILESTONES) if (ms[d.key]) i = Math.max(i, STAGES.indexOf(d.stage))
  if (f.installationReports > 0) i = Math.max(i, STAGES.indexOf('installation'))
  while (i < STAGES.length - 1 && exitMet(STAGES[i]!, ms)) i++
  return STAGES[i]!
}

/** Milestones of earlier stages that were never marked — the job moved on without them. */
export function skippedMilestones(stage: Stage, ms: Milestones): MilestoneDef[] {
  const at = STAGES.indexOf(stage)
  return MILESTONES.filter((d) => STAGES.indexOf(d.stage) < at && !ms[d.key])
}

/** The next milestone to mark in the current stage. */
export function nextMilestone(stage: Stage, ms: Milestones): MilestoneDef | null {
  return stageMilestones(stage).find((d) => !ms[d.key]) ?? null
}

/** What the next step is, in the office's words — one line under the stage. */
export function nextStepHe(stage: Stage, ms: Milestones = {}): string {
  const next = nextMilestone(stage, ms)
  if (next) return next.action_he
  switch (stage) {
    case 'lead':
      return 'לשבץ סוקר ולקבוע מועד'
    case 'survey':
      return 'להפיק הצעת מחיר'
    case 'quote':
      return 'לשלוח קישור ללקוח'
    case 'sent':
      return 'לחכות לאישור / להתקשר ללקוח'
    case 'service':
      return 'ניטור ותחזוקה שוטפים'
    default:
      return 'לסמן את אבני הדרך שהושלמו'
  }
}

export function isOfficeStatus(v: unknown): v is OfficeStatus {
  return typeof v === 'string' && (OFFICE_STATUSES as string[]).includes(v)
}
