/**
 * "What needs a phone call today" — the office screen's to-do column. Pure, so
 * the thresholds are tested and easy to tune.
 */
import { MILESTONES, MILESTONE_BY_KEY, nextMilestone, type MilestoneKey } from '../stage'
import type { OfficeJob } from './api'

const DAY = 86_400_000

export const ATTENTION_DAYS = {
  /** A new job with no survey date yet. */
  noDate: 2,
  /** Survey done, no quote yet. */
  noQuote: 3,
  /** Link sent, the customer has not opened it. */
  notOpened: 2,
  /** Opened, not approved. */
  notAccepted: 5,
}

/**
 * After the approval: how long the next milestone may wait after the one
 * before it (or after the approval) before someone should pick up the phone.
 */
export const MILESTONE_WAIT_DAYS: Record<MilestoneKey, number> = {
  contract_signed: 7,
  deposit_paid: 7,
  iec_submitted: 7,
  iec_approved: 30,
  design_approved: 14,
  equipment_ordered: 7,
  equipment_delivered: 21,
  installation_done: 14,
  inspector_passed: 7,
  meter_installed: 14,
  grid_approved: 14,
  handover_signed: 7,
  final_invoice: 7,
  monitoring_active: 7,
}

const age = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : 0)

/** One short reason the job needs attention, or null. Only for active jobs. */
export function attentionHe(job: OfficeJob, now = new Date()): string | null {
  if (job.office && job.office.status !== 'active') return null
  const live = job.links.filter((l) => !l.revoked_at)
  switch (job.stage) {
    case 'lead': {
      const o = job.office
      if (!o?.assigned_to_id) return 'לא שובץ סוקר'
      if (o.planned_date) {
        // Planned dates are Israeli calendar days; compare as dates, not instants.
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now)
        return o.planned_date < today ? `מועד הסקר (${o.planned_date.split('-').reverse().join('.')}) עבר ואין עדיין סקר` : null
      }
      const d = age(job.receivedAt, now)
      return d >= ATTENTION_DAYS.noDate ? `לקבוע מועד סקר (${Math.floor(d)} ימים)` : null
    }
    case 'survey': {
      const d = age(job.receivedAt, now)
      return d >= ATTENTION_DAYS.noQuote ? `סקר בלי הצעה ${Math.floor(d)} ימים` : null
    }
    case 'sent': {
      const newest = live[0]
      if (!newest) return null
      if (!newest.views) {
        const d = age(newest.published_at, now)
        return d >= ATTENTION_DAYS.notOpened ? `הלקוח לא פתח את הקישור ${Math.floor(d)} ימים — להתקשר` : null
      }
      const d = age(newest.last_viewed_at, now)
      return d >= ATTENTION_DAYS.notAccepted ? `נפתח ולא אושר ${Math.floor(d)} ימים — לבדוק מה עוצר` : null
    }
    case 'lead':
    case 'survey':
    case 'quote':
    case 'service':
      return null
    default:
      return milestoneWait(job, now)
  }
}

/** "הוגשה בקשה לחח״י לפני 34 ימים — לקבל תשובה מחח״י". */
function milestoneWait(job: OfficeJob, now: Date): string | null {
  const next = nextMilestone(job.stage, job.milestones ?? {})
  if (!next) return null
  // The latest thing that happened before it: a milestone, or the customer's approval.
  let since = job.links.map((l) => l.accepted?.accepted_at ?? '').filter(Boolean).sort().pop() ?? ''
  let what = 'הלקוח אישר'
  for (const d of MILESTONES) {
    const m = job.milestones?.[d.key]
    if (m?.date && m.date >= since.slice(0, 10)) {
      since = m.date
      what = MILESTONE_BY_KEY[d.key].label_he
    }
  }
  if (!since) return null
  const d = Math.floor(age(since, now))
  return d >= MILESTONE_WAIT_DAYS[next.key] ? `${what} לפני ${d} ימים — ${next.action_he}` : null
}
