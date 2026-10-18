import { describe, expect, it } from 'vitest'
import type { OfficeJob } from './api'
import { attentionHe } from './attention'

const NOW = new Date('2026-10-20T09:00:00.000Z')
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
const office = (over: Partial<NonNullable<OfficeJob['office']>> = {}) => ({ status: 'active' as const, note: '', updated_at: iso(1), updated_by: 'רונית', assigned_to_id: '', assigned_to_name: '', planned_date: '', milestones: {}, ...over })
const job = (over: Partial<OfficeJob>): OfficeJob =>
  ({ id: 'x', stage: 'survey', receivedAt: iso(0), links: [], reports: [], office: null, milestones: {}, latestQuote: null, ...over }) as OfficeJob
const link = (over: Record<string, unknown>) => ({ token: 't', quote_number: 'Q', version_no: 1, published_at: iso(0), published_by: '', revoked_at: null, views: 0, last_viewed_at: null, accepted: null, ...over })

describe('needs attention', () => {
  it('a new job needs a surveyor, then a date, then the survey on that date', () => {
    expect(attentionHe(job({ stage: 'lead' }), NOW)).toBe('לא שובץ סוקר')
    const assigned = office({ assigned_to_id: 'k1', assigned_to_name: 'דני' })
    expect(attentionHe(job({ stage: 'lead', office: assigned, receivedAt: iso(1) }), NOW)).toBeNull()
    expect(attentionHe(job({ stage: 'lead', office: assigned, receivedAt: iso(3) }), NOW)).toBe('לקבוע מועד סקר (3 ימים)')
    expect(attentionHe(job({ stage: 'lead', office: { ...assigned, planned_date: '2026-10-20' } }), NOW)).toBeNull() // today is fine
    expect(attentionHe(job({ stage: 'lead', office: { ...assigned, planned_date: '2026-10-19' } }), NOW)).toBe('מועד הסקר (19.10.2026) עבר ואין עדיין סקר')
  })

  it('follows the customer link and the approval', () => {
    expect(attentionHe(job({ stage: 'survey', receivedAt: iso(4) }), NOW)).toBe('סקר בלי הצעה 4 ימים')
    expect(attentionHe(job({ stage: 'sent', links: [link({ published_at: iso(3) })] as OfficeJob['links'] }), NOW)).toContain('לא פתח')
    expect(attentionHe(job({ stage: 'sent', links: [link({ views: 2, last_viewed_at: iso(6) })] as OfficeJob['links'] }), NOW)).toContain('נפתח ולא אושר')
    expect(attentionHe(job({ stage: 'sent', links: [link({ views: 2, last_viewed_at: iso(1) })] as OfficeJob['links'] }), NOW)).toBeNull()
    const accepted = link({ accepted: { name: 'x', accepted_at: iso(20), id_verified: true, total_incl_vat_ils: 1 } })
    expect(attentionHe(job({ stage: 'accepted', links: [accepted] as OfficeJob['links'] }), NOW)).toBe('הלקוח אישר לפני 20 ימים — לחתום הסכם')
  })

  it('after the approval, each milestone waits a set time after the one before it', () => {
    const accepted = [link({ accepted: { name: 'x', accepted_at: iso(40), id_verified: true, total_incl_vat_ils: 1 } })] as OfficeJob['links']
    const day = (daysAgo: number) => ({ date: iso(daysAgo).slice(0, 10) })
    const permits = { contract_signed: day(35), deposit_paid: day(34) }
    // Submitted 10 days ago: the IEC gets 30 days to answer.
    expect(attentionHe(job({ stage: 'permits', links: accepted, milestones: { ...permits, iec_submitted: day(10) } }), NOW)).toBeNull()
    expect(attentionHe(job({ stage: 'permits', links: accepted, milestones: { ...permits, iec_submitted: day(31) } }), NOW)).toBe('הוגשה בקשה לחח״י לפני 31 ימים — לקבל תשובה מחח״י')
    expect(attentionHe(job({ stage: 'permits', links: accepted, milestones: permits }), NOW)).toBe('מקדמה התקבלה לפני 34 ימים — להגיש בקשה לחח״י')
    // A paper contract, no online approval: counted from the contract.
    expect(attentionHe(job({ stage: 'accepted', milestones: { contract_signed: day(8) } }), NOW)).toBe('הסכם נחתם לפני 8 ימים — לגבות מקדמה')
    expect(attentionHe(job({ stage: 'handover', milestones: { handover_signed: { ...day(9), auto: 'דוח מסירה נעול' } } }), NOW)).toBe('מסירה נחתמה לפני 9 ימים — להוציא חשבון סופי')
    expect(attentionHe(job({ stage: 'service', milestones: { final_invoice: day(90) } }), NOW)).toBeNull()
  })

  it('stays quiet for jobs the office put aside', () => {
    expect(attentionHe(job({ stage: 'lead', office: office({ status: 'on_hold' }) }), NOW)).toBeNull()
    expect(attentionHe(job({ stage: 'survey', receivedAt: iso(30), office: office({ status: 'lost' }) }), NOW)).toBeNull()
  })
})
