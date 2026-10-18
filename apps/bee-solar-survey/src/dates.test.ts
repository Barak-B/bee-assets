import { describe, expect, it } from 'vitest'
import { fmtDate, fmtDateTime, fmtDay, israelToday } from './dates'

describe('dates on Israel time', () => {
  it('shows an instant as dd.mm.yyyy HH:MM in Israel, summer and winter', () => {
    expect(fmtDateTime('2026-07-01T09:05:00Z')).toBe('01.07.2026 12:05') // UTC+3
    expect(fmtDateTime('2026-12-01T09:05:00Z')).toBe('01.12.2026 11:05') // UTC+2
  })

  it('late UTC evening is already the next day in Israel', () => {
    expect(fmtDate('2026-10-18T22:30:00Z')).toBe('19.10.2026')
    expect(israelToday(new Date('2026-10-18T22:30:00Z'))).toBe('2026-10-19')
    expect(israelToday(new Date('2026-10-18T10:00:00Z'))).toBe('2026-10-18')
  })

  it('a calendar date is never shifted', () => {
    expect(fmtDay('2026-10-19')).toBe('19.10.2026')
    expect(fmtDay('אחרי החגים')).toBe('אחרי החגים')
  })

  it('nothing or garbage shows as empty', () => {
    for (const v of ['', null, undefined, 'not a date']) {
      expect(fmtDateTime(v)).toBe('')
      expect(fmtDate(v)).toBe('')
    }
    expect(fmtDay('')).toBe('')
  })
})
