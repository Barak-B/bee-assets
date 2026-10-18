/**
 * Dates and times as people in Israel read them: dd.mm.yyyy, 24-hour clock,
 * always on Israel time. Stored values stay ISO/UTC; only display goes
 * through here — `iso.slice(0, 16)` shows UTC, which is 2–3 hours off and,
 * near midnight, the wrong day.
 */

const TZ = 'Asia/Jerusalem'

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)) {
    out[p.type] = p.value
  }
  return out
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "18.10.2026 11:27" (Israel time), or '' for nothing / garbage. */
export function fmtDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v)
  if (!d) return ''
  const p = parts(d)
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}

/** "18.10.2026" — the Israeli calendar day of an instant. */
export function fmtDate(v: string | Date | null | undefined): string {
  const d = toDate(v)
  if (!d) return ''
  const p = parts(d)
  return `${p.day}.${p.month}.${p.year}`
}

/**
 * A calendar date that is already a local date (YYYY-MM-DD, e.g. a survey or
 * validity date) → "19.10.2026", with no time-zone shift. Anything else is
 * returned as typed.
 */
export function fmtDay(v: string | null | undefined): string {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v
}

/** Today's Israeli date as YYYY-MM-DD. */
export function israelToday(now = new Date()): string {
  const p = parts(now)
  return `${p.year}-${p.month}-${p.day}`
}
