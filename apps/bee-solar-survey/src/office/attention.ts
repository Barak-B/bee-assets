/**
 * "What needs a phone call today" — the office screen's to-do column. Pure, so
 * the thresholds are tested and easy to tune.
 */
import type { OfficeJob } from './api'

const DAY = 86_400_000

export const ATTENTION_DAYS = {
  /** Survey done, no quote yet. */
  noQuote: 3,
  /** Link sent, the customer has not opened it. */
  notOpened: 2,
  /** Opened, not approved. */
  notAccepted: 5,
  /** Approved, no installation report yet. */
  notStarted: 14,
}

const age = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : 0)

/** One short reason the job needs attention, or null. Only for active jobs. */
export function attentionHe(job: OfficeJob, now = new Date()): string | null {
  if (job.office && job.office.status !== 'active') return null
  const live = job.links.filter((l) => !l.revoked_at)
  switch (job.stage) {
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
    case 'accepted': {
      const at = job.links.map((l) => l.accepted?.accepted_at ?? '').filter(Boolean).sort().pop()
      const d = age(at, now)
      return d >= ATTENTION_DAYS.notStarted ? `אושר לפני ${Math.floor(d)} ימים ועדיין לא התחילה התקנה` : null
    }
    default:
      return null
  }
}
