import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPANY, companyErrors, companyLine, normalizeCompany } from './company'

describe('company profile', () => {
  it('starts from what the company quotes print, and it is valid', () => {
    expect(normalizeCompany(null)).toEqual(DEFAULT_COMPANY)
    expect(DEFAULT_COMPANY).toMatchObject({ name_he: 'ברק הנדסת חשמל בע״מ', company_id: '515839090', phone: '050-955-4483' })
    expect(companyErrors(DEFAULT_COMPANY)).toEqual([])
  })

  it('trims, clips and checks what is typed', () => {
    const p = normalizeCompany({ name_he: '  ברק   אלקטריק ', phone: '08-1234567', company_id: '123456782', email: 'office@barak-e.com', website: 'barak-e.com', extra: 'x' })
    expect(p.name_he).toBe('ברק אלקטריק')
    expect(p).not.toHaveProperty('extra')
    expect(companyErrors(p)).toEqual([])
    expect(companyErrors(normalizeCompany({ company_id: '123456789', phone: '12', email: 'no', website: 'not a site' }))).toEqual(['ח״פ לא תקין (ספרת ביקורת)', 'טלפון לא ישראלי', 'מייל לא תקין', 'כתובת אתר לא תקינה'])
    expect(companyLine(p)).toBe('ברק אלקטריק · ח״פ 123456782 · 08-1234567')
    expect(companyLine(p, { phone: false })).toBe('ברק אלקטריק · ח״פ 123456782')
  })
})
