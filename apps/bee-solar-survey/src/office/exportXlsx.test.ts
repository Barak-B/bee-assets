import { describe, expect, it } from 'vitest'
import type { OfficeJob } from './api'
import { JOB_COLUMNS, jobRows, jobsWorkbook } from './exportXlsx'

const j = {
  id: 'x',
  projectName: 'גג אברהם',
  customerName: 'משה אברהם',
  customerPhone: '054-1112233',
  customerEmail: 'm@example.com',
  address: 'הזית 7, גדרה',
  surveyor: 'דני',
  receivedAt: '2026-10-01T08:00:00Z',
  stage: 'permits',
  office: { status: 'active', note: '', updated_at: '', updated_by: '', assigned_to_id: 'k', assigned_to_name: 'דני', planned_date: '2026-10-05', install_date: '2026-11-10', milestones: {} },
  milestones: { contract_signed: { date: '2026-10-08' }, deposit_paid: { date: '2026-10-09' }, iec_submitted: { date: '2026-10-10', ref: '7004512' } },
  latestQuote: { version_no: 2, quote_number: 'Q-1', created_at: '', total_incl_vat_ils: 121705, dc_kwp: 15.3, needs_owner_input: false },
  links: [{ accepted: { name: 'משה', accepted_at: '2026-10-07T10:00:00Z', id_verified: true, total_incl_vat_ils: 121705 } }],
  reports: [],
  lastActivityAt: '2026-10-10T09:00:00Z',
} as unknown as OfficeJob

describe('jobs to Excel', () => {
  it('one row per job, every column filled from the job', () => {
    const [row] = jobRows([j], new Date('2026-10-12T09:00:00Z'))
    expect(row).toHaveLength(JOB_COLUMNS.length)
    const col = (h: string) => row![JOB_COLUMNS.findIndex((c) => c.header === h)]
    expect(col('שלב')).toBe('חח״י ותכנון')
    expect(col('קוד שלב')).toBe('S05+S06')
    expect(col('הצעד הבא')).toBe('לקבל תשובה מחח״י')
    expect(col('סוקר')).toBe('דני')
    expect(col('מועד התקנה')).toBe('2026-11-10')
    expect(col('סה״כ כולל מע״מ (₪)')).toBe(121705)
    expect(col('אושר ע״י הלקוח')).toBe('2026-10-07')
    expect(col('הוגשה בקשה לחח״י')).toBe('2026-10-10')
    expect(col('מונה הותקן')).toBe('')
  })

  it('builds a real workbook', async () => {
    const blob = await jobsWorkbook([j])
    expect(blob.size).toBeGreaterThan(4000)
    // xlsx = zip: "PK" first
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]))
  })
})
