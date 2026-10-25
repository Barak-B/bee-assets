/**
 * The operations week: planned surveys and installations, by day. Pure, so
 * the week arithmetic is tested (Israeli week: Sunday to Saturday).
 */
import { STAGES } from '../stage'
import type { OfficeJob } from './api'

export type CalendarKind = 'survey' | 'install'

export interface CalendarItem {
  day: string
  kind: CalendarKind
  job: OfficeJob
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The seven days (Sunday first) of the week holding `iso`. */
export function weekOf(iso: string): string[] {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const sunday = addDays(iso, -dow)
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i))
}

export const shiftWeek = (iso: string, weeks: number) => addDays(iso, weeks * 7)

const active = (j: OfficeJob) => !j.office || j.office.status === 'active'
const at = (j: OfficeJob) => STAGES.indexOf(j.stage)

/**
 * What is planned on these days. A survey date counts until the site is
 * surveyed; an installation date until the installation is done.
 */
export function calendarItems(jobs: OfficeJob[], days: string[]): CalendarItem[] {
  const want = new Set(days)
  const out: CalendarItem[] = []
  for (const j of jobs.filter(active)) {
    const survey = j.office?.planned_date ?? ''
    if (survey && want.has(survey) && j.stage === 'lead') out.push({ day: survey, kind: 'survey', job: j })
    const install = j.office?.install_date ?? ''
    if (install && want.has(install) && at(j) <= STAGES.indexOf('installation')) out.push({ day: install, kind: 'install', job: j })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind))
}

/** Active jobs that should have a date and do not: to schedule. */
export function unscheduled(jobs: OfficeJob[]): { kind: CalendarKind; job: OfficeJob }[] {
  const out: { kind: CalendarKind; job: OfficeJob }[] = []
  for (const j of jobs.filter(active)) {
    if (j.stage === 'lead' && !j.office?.planned_date) out.push({ kind: 'survey', job: j })
    if ((j.stage === 'procurement' || j.stage === 'installation') && !j.office?.install_date) out.push({ kind: 'install', job: j })
  }
  return out
}
