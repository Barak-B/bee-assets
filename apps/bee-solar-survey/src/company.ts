/**
 * The company as customers see it: name, company number, license, address,
 * phone, email, site. Entered once by an admin on the office screen (never
 * guessed here); empty fields are simply not shown.
 */
import { isValidEmail, isValidIsraeliId, normalizePhone } from './customer'

export interface CompanyProfile {
  /** Short brand, e.g. "B.E.E". */
  brand: string
  /** Legal / trading name in Hebrew. */
  name_he: string
  /** ח״פ / עוסק מורשה. */
  company_id: string
  /** Electrical contractor / electrician license, as printed. */
  license: string
  address: string
  phone: string
  email: string
  website: string
}

export const DEFAULT_COMPANY: CompanyProfile = {
  brand: 'B.E.E',
  name_he: 'ברק אלקטריק אנג׳ינירינג',
  company_id: '',
  license: '',
  address: '',
  phone: '',
  email: '',
  website: '',
}

export const COMPANY_FIELDS: { key: keyof CompanyProfile; label_he: string; max: number; ltr?: boolean }[] = [
  { key: 'brand', label_he: 'מותג', max: 30 },
  { key: 'name_he', label_he: 'שם החברה', max: 80 },
  { key: 'company_id', label_he: 'ח״פ / ע״מ', max: 12, ltr: true },
  { key: 'license', label_he: 'רישיון', max: 60 },
  { key: 'address', label_he: 'כתובת', max: 120 },
  { key: 'phone', label_he: 'טלפון', max: 20, ltr: true },
  { key: 'email', label_he: 'מייל', max: 80, ltr: true },
  { key: 'website', label_he: 'אתר', max: 80, ltr: true },
]

/** A profile from anything (stored JSON, a form), each field trimmed and clipped. */
export function normalizeCompany(raw: unknown): CompanyProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_COMPANY }
  for (const f of COMPANY_FIELDS) {
    const v = typeof r[f.key] === 'string' ? (r[f.key] as string).replace(/\s+/g, ' ').trim() : ''
    out[f.key] = Array.from(v).slice(0, f.max).join('') || DEFAULT_COMPANY[f.key]
  }
  return out
}

/** Hebrew problems with a profile; empty when it can be saved. */
export function companyErrors(p: CompanyProfile): string[] {
  const out: string[] = []
  if (!p.name_he) out.push('חסר שם החברה')
  if (p.company_id && !isValidIsraeliId(p.company_id)) out.push('ח״פ לא תקין (ספרת ביקורת)')
  if (p.phone && !normalizePhone(p.phone)) out.push('טלפון לא ישראלי')
  if (p.email && !isValidEmail(p.email)) out.push('מייל לא תקין')
  if (p.website && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(p.website)) out.push('כתובת אתר לא תקינה')
  return out
}

/** "ברק אלקטריק אנג׳ינירינג · ח״פ 51-1234567-8 · 08-1234567" — what fits on a footer line. */
export function companyLine(p: CompanyProfile, opts: { phone?: boolean } = {}): string {
  return [p.name_he, p.company_id && `ח״פ ${p.company_id}`, p.license, opts.phone === false ? '' : p.phone].filter(Boolean).join(' · ')
}
