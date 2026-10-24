/**
 * Messages to the customer from docs/plan/templates/message-templates.json —
 * the same keys and wording the B.E.E Engine will send through Meta later, so
 * moving over is a mapping, not a rewrite.
 *
 * Nothing here sends. A message is filled from the job, a person reads it,
 * and the button only opens WhatsApp / SMS / mail with it ready; the person
 * presses send (Law #2: requires_human_pick).
 */
import plan from '../../../docs/plan/templates/message-templates.json'
import { isMobile, normalizePhone, whatsappUrl } from './customer'
import { MILESTONE_BY_KEY, PLAN_STAGE, type Milestones, type Stage } from './stage'

export type Channel = 'whatsapp' | 'sms' | 'email'

export interface MessageTemplate {
  key: string
  /** Plan stage ids ("S05", "S02|S08", "ALL"). */
  stage: string
  channel: Channel
  subject?: string
  body: string
  placeholders: string[]
  notes_he?: string
}

/** Not for a person to send from here: codes, magic links (no portal yet). */
const NOT_HERE = new Set(['otp', 'portal_magic_link'])

export const CUSTOMER_TEMPLATES: MessageTemplate[] = (plan.templates as (MessageTemplate & { audience: string })[])
  .filter((t) => t.audience === 'customer' && !NOT_HERE.has(t.key))
  .map(({ key, stage, channel, subject, body, placeholders, notes_he }) => ({ key, stage, channel, subject, body, placeholders, notes_he }))

/** Short Hebrew names, from the template's first words where the plan has none. */
export const TEMPLATE_TITLE_HE: Record<string, string> = {
  lead_received: 'קיבלנו את הפנייה',
  survey_proposal: 'הצעת מועדים לסקר',
  survey_scheduled: 'אישור מועד סקר',
  survey_reminder: 'תזכורת לסקר (SMS)',
  bill_request: 'בקשת חשבון חשמל',
  quote_sent: 'הצעת המחיר מוכנה',
  quote_email_cover: 'הצעת מחיר במייל',
  quote_followup: 'מעקב אחרי ההצעה',
  contract_ready_to_sign: 'הסכם לחתימה',
  deposit_payment_link: 'תשלום מקדמה',
  contract_signed_confirmation: 'אישור חתימת הסכם',
  iec_form_sign_request: 'טופס חח״י לחתימה',
  iec_fee_request: 'תשלום לחח״י',
  iec_submitted: 'הבקשה הוגשה לחח״י',
  iec_answer_positive: 'תשובה חיובית מחח״י',
  installation_scheduled: 'מועד התקנה',
  installation_reminder: 'תזכורת להתקנה (SMS)',
  installation_completed: 'ההתקנה הושלמה',
  inspection_scheduled: 'מועד בדיקת בודק',
  iec_inspection_fee_request: 'תשלום בדיקת חח״י',
  iec_inspection_scheduled: 'מועד בדיקת חח״י',
  meter_installed: 'המונה הותקן',
  handover_ready: 'תיק מסירה מוכן',
  handover_pack_email: 'תיק מתקן במייל',
  monitoring_active: 'הניטור פעיל',
  periodic_inspection_reminder: 'בדיקה תקופתית',
  service_ticket_opened: 'נפתחה קריאת שירות',
  service_ticket_closed: 'קריאת שירות נסגרה',
  contract_renewal_offer: 'חידוש חוזה תחזוקה',
  document_ready: 'מסמך מוכן',
  schedule_changed: 'שינוי בלו״ז',
}

export const PLACEHOLDER_LABEL_HE: Record<string, string> = {
  ...(plan.common_placeholders as Record<string, string>),
  customer_first_name: 'שם פרטי',
  customer_name: 'שם הלקוח',
  project_ref: 'מספר תיק',
  site_short: 'כתובת',
  system_kwp: 'הספק (kWp)',
  quote_version: 'גרסת הצעה',
  valid_until: 'תוקף עד',
  portal_link: 'קישור',
  contact_name: 'השם שלנו',
  contact_phone: 'הטלפון שלנו',
  date_he: 'תאריך',
  time_range: 'שעות',
  surveyor_name: 'סוקר',
  slot_1: 'מועד 1',
  slot_2: 'מועד 2',
  amount_ils: 'סכום (₪)',
  payment_link: 'קישור לתשלום',
  iec_request_no: 'מספר בקשה בחח״י',
  iec_quote_no: 'מספר הצעת חשבון',
  iec_payment_url: 'קישור לתשלום בחח״י',
  iec_order_no: 'מספר הזמנה בחח״י',
  expected_bd: 'ימי עבודה משוערים (מספר)',
  approved_kw: 'הספק מאושר (kW)',
  duration_days: 'ימי עבודה',
  crew_lead_name: 'ראש הצוות',
  crew_lead_phone: 'טלפון ראש הצוות',
  start_time: 'שעת התחלה',
  meter_serial: 'מספר מונה',
  invoice_number: 'מספר חשבונית',
  today_kwh: 'ייצור היום (kWh)',
  alert_type_he: 'סוג התקלה',
  detected_at: 'זוהה ב',
  ticket_ref: 'מספר קריאה',
  next_step_he: 'הצעד הבא',
  resolution_he: 'סיכום',
  expires_at: 'תאריך סיום',
  doc_name: 'שם המסמך',
  milestone_he: 'מה זז',
  old_date: 'מתאריך',
  new_date: 'לתאריך',
  reason_he: 'סיבה',
}

const codesOf = (s: string) => s.split(/[|+]/).map((c) => c.trim())

/** The templates for where the job is now, then everything else. */
export function templatesFor(stage: Stage): { now: MessageTemplate[]; other: MessageTemplate[] } {
  const here = new Set(codesOf(PLAN_STAGE[stage]))
  const now = CUSTOMER_TEMPLATES.filter((t) => codesOf(t.stage).some((c) => here.has(c)))
  return { now, other: CUSTOMER_TEMPLATES.filter((t) => !now.includes(t)) }
}

export interface MessageJob {
  id: string
  stage: Stage
  customerName: string
  customerPhone: string
  customerEmail: string
  address: string
  milestones: Milestones
  /** Assigned surveyor. */
  surveyorName: string
  /** Planned survey date, YYYY-MM-DD. */
  plannedDate: string
  latestQuote: { version_no: number; dc_kwp: number | null; valid_until?: string } | null
  /** The customer's live link, absolute. */
  link: string
}

export interface Sender {
  name: string
  phone: string
}

const dayHe = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '')

/** A short, stable reference for the customer: "BEE-0F8FAD". */
export const projectRef = (id: string) => `BEE-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`

/** For templates about one event, the date of that event. */
const EVENT_DATE: Record<string, (j: MessageJob) => string | undefined> = {
  survey_scheduled: (j) => j.plannedDate,
  survey_reminder: (j) => j.plannedDate,
  contract_signed_confirmation: (j) => j.milestones.contract_signed?.date,
  installation_completed: (j) => j.milestones.installation_done?.date,
  meter_installed: (j) => j.milestones.meter_installed?.date,
}

/** What the job already knows, by placeholder. Anything else is typed in. */
export function contextFor(t: MessageTemplate, j: MessageJob, sender: Sender): Record<string, string> {
  const name = j.customerName.trim()
  const kwp = j.latestQuote?.dc_kwp
  const v: Record<string, string> = {
    customer_name: name,
    customer_first_name: name.split(/\s+/)[0] ?? '',
    project_ref: projectRef(j.id),
    site_short: j.address.trim(),
    system_kwp: typeof kwp === 'number' ? kwp.toFixed(1) : '',
    quote_version: j.latestQuote ? String(j.latestQuote.version_no) : '',
    valid_until: dayHe(j.latestQuote?.valid_until),
    portal_link: j.link,
    contact_name: sender.name.trim(),
    contact_phone: sender.phone.trim(),
    surveyor_name: j.surveyorName.trim(),
    iec_request_no: j.milestones.iec_submitted?.ref ?? '',
    invoice_number: j.milestones.final_invoice?.ref ?? '',
    date_he: dayHe(EVENT_DATE[t.key]?.(j)),
  }
  return Object.fromEntries(t.placeholders.map((p) => [p, v[p] ?? '']))
}

export interface Rendered {
  subject: string
  body: string
  /** Placeholders still empty — the message cannot go out like this. */
  missing: string[]
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k]?.trim() || `[${PLACEHOLDER_LABEL_HE[k] ?? k}]`)

export function renderMessage(t: MessageTemplate, values: Record<string, string>): Rendered {
  const used = new Set([...(t.body.match(/\{\{\w+\}\}/g) ?? []), ...(t.subject?.match(/\{\{\w+\}\}/g) ?? [])].map((m) => m.slice(2, -2)))
  return {
    subject: t.subject ? fill(t.subject, values) : '',
    body: fill(t.body, values),
    missing: [...used].filter((k) => !values[k]?.trim()),
  }
}

/** Where the message opens, or null when the customer has no such address. */
export function channelUrl(channel: Channel, to: { phone: string; email: string }, subject: string, body: string): string | null {
  if (channel === 'whatsapp') return whatsappUrl(to.phone, body)
  // "?&body=" is the form both iOS and Android read.
  if (channel === 'sms') return isMobile(to.phone) ? `sms:+972${normalizePhone(to.phone).slice(1)}?&body=${encodeURIComponent(body)}` : null
  const email = to.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const CHANNEL_HE: Record<Channel, string> = { whatsapp: 'וואטסאפ', sms: 'SMS', email: 'מייל' }

/** Which milestone a template is about, for "send the update" hints. */
export const TEMPLATE_MILESTONE: Partial<Record<string, keyof typeof MILESTONE_BY_KEY>> = {
  contract_signed_confirmation: 'contract_signed',
  iec_submitted: 'iec_submitted',
  iec_answer_positive: 'iec_approved',
  installation_completed: 'installation_done',
  meter_installed: 'meter_installed',
}
