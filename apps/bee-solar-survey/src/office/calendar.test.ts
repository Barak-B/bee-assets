import { describe, expect, it } from 'vitest'
import type { OfficeJob } from './api'
import { calendarItems, shiftWeek, unscheduled, weekOf } from './calendar'

const office = (over: Record<string, unknown> = {}) => ({ status: 'active', note: '', updated_at: '', updated_by: '', assigned_to_id: '', assigned_to_name: 'דני', planned_date: '', install_date: '', milestones: {}, ...over })
const job = (over: Partial<OfficeJob>): OfficeJob => ({ id: Math.random().toString(36), stage: 'lead', office: office(), links: [], reports: [], milestones: {}, ...over }) as OfficeJob

describe('operations week', () => {
  it('Sunday to Saturday, across months and years', () => {
    expect(weekOf('2026-10-21')).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
    expect(weekOf('2026-10-18')[0]).toBe('2026-10-18') // a Sunday is its own week
    expect(weekOf('2027-01-01')[0]).toBe('2026-12-27')
    expect(shiftWeek('2026-10-18', 1)).toBe('2026-10-25')
    expect(shiftWeek('2026-10-18', -3)).toBe('2026-09-27')
  })

  it('surveys until surveyed, installations until installed; not for jobs put aside', () => {
    const days = weekOf('2026-10-21')
    const jobs = [
      job({ stage: 'lead', office: office({ planned_date: '2026-10-22' }) as OfficeJob['office'] }),
      job({ stage: 'survey', office: office({ planned_date: '2026-10-20' }) as OfficeJob['office'] }), // surveyed already
      job({ stage: 'procurement', office: office({ install_date: '2026-10-19' }) as OfficeJob['office'] }),
      job({ stage: 'inspection', office: office({ install_date: '2026-10-19' }) as OfficeJob['office'] }), // installed already
      job({ stage: 'lead', office: office({ planned_date: '2026-10-23', status: 'on_hold' }) as OfficeJob['office'] }),
      job({ stage: 'lead', office: office({ planned_date: '2026-11-02' }) as OfficeJob['office'] }), // next week
    ]
    expect(calendarItems(jobs, days).map((i) => [i.day, i.kind])).toEqual([
      ['2026-10-19', 'install'],
      ['2026-10-22', 'survey'],
    ])
  })

  it('lists what still needs a date', () => {
    const jobs = [job({ stage: 'lead' }), job({ stage: 'installation' }), job({ stage: 'installation', office: office({ install_date: '2026-10-19' }) as OfficeJob['office'] }), job({ stage: 'sent' })]
    expect(unscheduled(jobs).map((u) => [u.job.stage, u.kind])).toEqual([
      ['lead', 'survey'],
      ['installation', 'install'],
    ])
  })
})
