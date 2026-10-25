import { describe, expect, it } from 'vitest'
import { CUSTOMER_TEMPLATES, PLACEHOLDER_LABEL_HE, TEMPLATE_TITLE_HE, channelUrl, contextFor, projectRef, renderMessage, templatesFor, type MessageJob } from './messages'

const job: MessageJob = {
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  stage: 'quote',
  customerName: 'משה אברהם',
  customerPhone: '054-111-2233',
  customerEmail: 'moshe@example.com',
  address: 'הזית 7, גדרה',
  milestones: { iec_submitted: { date: '2026-10-12', ref: '7004512' } },
  surveyorName: 'דני',
  plannedDate: '2026-10-22',
  latestQuote: { version_no: 2, dc_kwp: 15.3, valid_until: '2026-11-17' },
  link: 'https://app.barak-e.com/q/AbCdEfGhIjKlMnOpQrStUv',
}
const sender = { name: 'רונית', phone: '08-1234567' }
const tpl = (key: string) => CUSTOMER_TEMPLATES.find((t) => t.key === key)!

describe('customer messages from the plan templates', () => {
  it('only templates a person sends to a customer, every one titled and every placeholder labelled', () => {
    const keys = CUSTOMER_TEMPLATES.map((t) => t.key)
    expect(keys).toContain('quote_sent')
    expect(keys).not.toContain('otp')
    expect(keys).not.toContain('internal_alert')
    expect(keys).not.toContain('po_sent') // supplier
    for (const t of CUSTOMER_TEMPLATES) {
      expect(TEMPLATE_TITLE_HE[t.key], t.key).toBeTruthy()
      for (const p of t.placeholders) expect(PLACEHOLDER_LABEL_HE[p], `${t.key}.${p}`).toBeTruthy()
    }
  })

  it('suggests the templates of the current stage first', () => {
    expect(templatesFor('quote').now.map((t) => t.key)).toEqual(['quote_sent', 'quote_email_cover'])
    expect(templatesFor('permits').now.map((t) => t.key)).toEqual(['iec_form_sign_request', 'iec_fee_request', 'iec_submitted', 'iec_answer_positive'])
    expect(templatesFor('installation').now.map((t) => t.key)).toContain('schedule_changed') // "S02|S08|S09|S10"
    const { now, other } = templatesFor('sent')
    expect(now.length + other.length).toBe(CUSTOMER_TEMPLATES.length)
  })

  it('fills what the job knows and names what is still missing', () => {
    const t = tpl('quote_sent')
    const r = renderMessage(t, contextFor(t, job, sender))
    expect(r.missing).toEqual([])
    expect(r.body).toBe(
      'שלום משה, הצעת המחיר למערכת 15.3 kWp ב-הזית 7, גדרה (גרסה 2) מוכנה: https://app.barak-e.com/q/AbCdEfGhIjKlMnOpQrStUv. תוקף ההצעה עד 17.11.2026. נשמח לענות על שאלות: 08-1234567.',
    )
    const iec = tpl('iec_submitted')
    const ri = renderMessage(iec, contextFor(iec, job, sender))
    expect(ri.body).toContain('מספר בקשה: 7004512')
    expect(ri.missing).toEqual(['expected_bd'])
    expect(ri.body).toContain('[ימי עבודה משוערים (מספר)]')
    const survey = tpl('survey_scheduled')
    expect(contextFor(survey, job, sender)).toMatchObject({ date_he: '22.10.2026', surveyor_name: 'דני' })
    const mail = tpl('quote_email_cover')
    expect(renderMessage(mail, contextFor(mail, job, sender)).subject).toBe(`הצעת מחיר — מערכת סולארית 15.3 kWp — הזית 7, גדרה (${projectRef(job.id)})`)
    expect(projectRef(job.id)).toBe('BEE-0F8FAD')
  })

  it('opens WhatsApp, SMS (mobiles only) or mail with the message, never sends', () => {
    expect(channelUrl('whatsapp', { phone: '054-111-2233', email: '' }, '', 'שלום')).toBe('https://wa.me/972541112233?text=%D7%A9%D7%9C%D7%95%D7%9D')
    expect(channelUrl('sms', { phone: '054-111-2233', email: '' }, '', 'hi')).toBe('sms:+972541112233?&body=hi')
    expect(channelUrl('sms', { phone: '08-1234567', email: '' }, '', 'hi')).toBeNull()
    expect(channelUrl('email', { phone: '', email: 'moshe@example.com' }, 'נושא', 'גוף')).toMatch(/^mailto:moshe%40example\.com\?subject=.+&body=.+/)
    expect(channelUrl('email', { phone: '', email: 'nope' }, '', '')).toBeNull()
  })
})
