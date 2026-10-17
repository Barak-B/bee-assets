/**
 * The customer behind a survey: who the quote is for, how to reach them, and
 * the ID that the online approval is checked against. Validation only warns —
 * a surveyor on a roof must never be blocked by a phone format.
 */
import type { SiteSurveyProject } from './types'

/** Digits only, Israeli numbers in local form (0XXXXXXXXX); '' when it does not look like a phone. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+972')) d = `0${d.slice(4)}`
  else if (d.startsWith('972') && d.length >= 11) d = `0${d.slice(3)}`
  d = d.replace(/\+/g, '')
  if (d.startsWith('00')) return '' // other country codes: keep the raw text, no WhatsApp shortcut
  return /^0\d{8,9}$/.test(d) ? d : ''
}

export function isMobile(phone: string): boolean {
  return /^05\d{8}$/.test(normalizePhone(phone))
}

/**
 * wa.me link that opens WhatsApp on the surveyor's phone with the message
 * typed in. The surveyor presses send — nothing is sent automatically (Law #2).
 */
export function whatsappUrl(phone: string, text: string): string | null {
  const local = normalizePhone(phone)
  if (!local) return null
  return `https://wa.me/972${local.slice(1)}?text=${encodeURIComponent(text)}`
}

/** Israeli ID / company number check digit (the same algorithm covers ח״פ). */
export function isValidIsraeliId(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (!d || d.length > 9 || /^0+$/.test(d)) return false
  const padded = d.padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1)
    if (n > 9) n -= 9
    sum += n
  }
  return sum % 10 === 0
}

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())

/** Last 4 digits of the ID, used to check the online approval; '' when there is no usable ID. */
export function idLast4(raw: string | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : ''
}

/** Soft warnings for the customer card (shown under the fields, never blocking). */
export function customerWarnings(p: Pick<SiteSurveyProject, 'customerName' | 'customerPhone' | 'customerEmail' | 'customerIdNumber'>): string[] {
  const out: string[] = []
  if (!p.customerName?.trim()) out.push('חסר שם לקוח — ההצעה תצא בלי "לכבוד"')
  if (!p.customerPhone?.trim()) out.push('חסר טלפון — לא יהיה כפתור וואטסאפ לשליחת הקישור')
  else if (!normalizePhone(p.customerPhone)) out.push('הטלפון לא נראה כמספר ישראלי')
  if (p.customerEmail?.trim() && !isValidEmail(p.customerEmail)) out.push('כתובת המייל לא תקינה')
  if (p.customerIdNumber?.trim() && !isValidIsraeliId(p.customerIdNumber)) out.push('ספרת הביקורת של ת״ז / ח״פ לא תואמת — בדקו את המספר')
  return out
}

/** Text for the WhatsApp message carrying the customer link. */
export function quoteMessage(customerName: string | undefined, url: string, quoteNumber: string): string {
  const hello = customerName?.trim() ? `שלום ${customerName.trim()},` : 'שלום,'
  return `${hello}\nמצורפת הצעת המחיר של B.E.E ברק אלקטריק (${quoteNumber}):\n${url}\nבדף אפשר לעיין, להוריד PDF ולאשר. לכל שאלה אנחנו כאן.`
}
