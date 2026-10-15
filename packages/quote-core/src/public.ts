/**
 * Customer-facing view of a quote — what the public link (/q/<token>) and the
 * customer PDF may show. Everything internal (costs, margins, FX, SKUs, flags,
 * hashes of the input, quantity sources) is dropped here, in one place, so no
 * renderer can leak it by accident.
 */
import { boqSectionTitle } from './pricebook'
import { israelDate, round2, scheduleAmounts } from './money'
import { TRACK_LABELS_HE } from './roi'
import type { QuoteLine, QuoteTexts, QuoteVersion, RoiAssumption } from './types'

export interface PublicQuoteLine {
  name_he: string
  description_he?: string
  unit: QuoteLine['unit']
  qty: number
  unit_price_ils: number | null
  line_total_ils: number | null
  passthrough: boolean
}

export interface PublicQuoteSection {
  code: string
  title_he: string
  lines: PublicQuoteLine[]
  total_ils: number
}

export interface PublicQuote {
  schema: 'bee.public-quote/1'
  quote_number: string
  version_no: number
  issued_at: string
  valid_until: string | null
  project: { name: string; address: string; customer_name?: string }
  system: {
    dc_kwp: number
    module_count: number
    module_w: number | null
    inverter_count: number
    inverter_ac_kw: number | null
    has_battery: boolean
    roof_type: string
    annual_yield_kwh_estimate: number | null
  }
  sections: PublicQuoteSection[]
  totals: {
    subtotal_excl_vat_ils: number | null
    vat_rate: number | null
    vat_ils: number | null
    total_incl_vat_ils: number | null
    price_per_kwp_excl_vat_ils: number | null
    passthrough_note_he: string
    /** Subtotal minus the sum of the sections (the "round to N ₪" step); 0 when none. */
    rounding_ils: number
  }
  payment_schedule: { label_he: string; pct: number | null; amount_ils: number | null }[]
  terms: { linkage: 'none' | 'fx'; validity_days: number | null; texts?: QuoteTexts }
  /** Production and savings estimate — only when the quote carries one. */
  roi?: PublicRoi
  /** Short, non-reversible fingerprint the customer can quote back (first 12 hex of the snapshot hash). */
  reference: string
}

export interface PublicRoi {
  track_he: string
  customer_type: 'private' | 'business'
  annual_yield_kwh_y1: number
  monthly_kwh: number[]
  savings_y1_ils: number
  payback_years: number | null
  lifetime_net_savings_ils: number
  horizon_years: number
  offset_pct: number | null
  co2_t_year: number | null
  bill: { before_y1_ils: number | null; after_y1_ils: number | null }
  cumulative: { year: number; cum_cf_ils: number }[]
  assumptions: RoiAssumption[]
  notes_he: string[]
}

export class NotPublishableError extends Error {
  readonly reasons: string[]
  constructor(reasons: string[]) {
    super(`quote is not publishable: ${reasons.join('; ')}`)
    this.reasons = reasons
  }
}

/** Why a quote must not go to a customer yet (empty = OK). */
export function publishBlockers(q: QuoteVersion): string[] {
  const out: string[] = []
  if (q.needs_owner_input) out.push('ההצעה עדיין מסומנת "לאימות" — השלם את המחירון וחשב גרסה חדשה')
  if (q.totals.total_incl_vat_ils === null) out.push('אין סה״כ כולל מע״מ')
  if (q.totals.unpriced_lines > 0) out.push(`${q.totals.unpriced_lines} שורות ללא מחיר`)
  if (!q.design.module_count) out.push('אין מערכת מתוכננת (0 מודולים)')
  return out
}

export function toPublicQuote(q: QuoteVersion, opts: { customerName?: string } = {}): PublicQuote {
  const blockers = publishBlockers(q)
  if (blockers.length) throw new NotPublishableError(blockers)

  const bySection = new Map<string, QuoteLine[]>()
  for (const l of q.lines) {
    const code = l.boq_section ?? '08.08'
    bySection.set(code, [...(bySection.get(code) ?? []), l])
  }
  const sections: PublicQuoteSection[] = [...bySection.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, lines]) => ({
      code,
      title_he: boqSectionTitle(code),
      lines: lines.map((l) => ({
        name_he: l.name_he,
        ...(l.description_he ? { description_he: l.description_he } : {}),
        unit: l.unit,
        qty: l.qty,
        unit_price_ils: l.passthrough ? null : l.unit_price_ils,
        line_total_ils: l.passthrough ? null : l.line_total_ils,
        passthrough: l.passthrough,
      })),
      total_ils: round2(lines.filter((l) => !l.passthrough).reduce((s, l) => s + (l.line_total_ils ?? 0), 0)),
    }))

  const total = q.totals.total_incl_vat_ils
  const sectionsSum = round2(sections.reduce((s, x) => s + x.total_ils, 0))
  const amounts = scheduleAmounts(total, q.terms.payment_schedule.map((m) => m.pct))
  return {
    schema: 'bee.public-quote/1',
    quote_number: q.quote_number,
    version_no: q.version_no,
    issued_at: israelDate(new Date(q.created_at)),
    valid_until: q.terms.valid_until,
    project: {
      name: q.input.projectName,
      address: q.input.address,
      ...(opts.customerName ?? q.input.customerName ? { customer_name: opts.customerName ?? q.input.customerName } : {}),
    },
    system: {
      dc_kwp: q.design.dc_kwp,
      module_count: q.design.module_count,
      module_w: q.design.module_w,
      inverter_count: q.design.inverter_count,
      inverter_ac_kw: q.design.inverter_ac_kw,
      has_battery: q.lines.some((l) => l.kind === 'battery'),
      roof_type: q.input.roofType,
      annual_yield_kwh_estimate: q.design.annual_yield_kwh_estimate,
    },
    sections,
    totals: {
      subtotal_excl_vat_ils: q.totals.subtotal_excl_vat_ils,
      vat_rate: q.totals.vat_rate,
      vat_ils: q.totals.vat_ils,
      total_incl_vat_ils: total,
      price_per_kwp_excl_vat_ils: q.totals.price_per_kwp_excl_vat_ils,
      passthrough_note_he: 'אגרות חברת החשמל — לפי חשבון בפועל, אינן כלולות במחיר.',
      rounding_ils: q.totals.subtotal_excl_vat_ils === null ? 0 : round2(q.totals.subtotal_excl_vat_ils - sectionsSum),
    },
    payment_schedule: q.terms.payment_schedule.map((m, i) => ({
      label_he: m.label_he,
      pct: m.pct,
      amount_ils: amounts[i] ?? null,
    })),
    terms: { linkage: q.terms.linkage, validity_days: q.terms.validity_days, ...(q.terms.texts ? { texts: q.terms.texts } : {}) },
    ...(q.roi
      ? {
          roi: {
            track_he: TRACK_LABELS_HE[q.roi.track],
            customer_type: q.roi.customer_type,
            annual_yield_kwh_y1: q.roi.kpi.annual_yield_kwh_y1,
            monthly_kwh: q.roi.monthly_kwh,
            savings_y1_ils: q.roi.kpi.savings_y1_ils,
            payback_years: q.roi.kpi.payback_years,
            lifetime_net_savings_ils: q.roi.kpi.lifetime_net_savings_ils,
            horizon_years: q.roi.series.length,
            offset_pct: q.roi.kpi.offset_pct,
            co2_t_year: q.roi.kpi.co2_t_year,
            bill: q.roi.bill,
            cumulative: q.roi.series.map((y) => ({ year: y.year, cum_cf_ils: y.cum_cf_ils })),
            assumptions: q.roi.assumptions,
            notes_he: [
              'הערכה מהירה לפי הספק המערכת, כיוון ושיפוע. ייצור בפועל משתנה משנה לשנה.',
              'התעריפים לפי המחירון ביום ההצעה; שינוי תעריפים ישנה את החיסכון.',
              'אינו ייעוץ מס.',
            ],
          },
        }
      : {}),
    reference: q.snapshot_hash.slice(0, 12),
  }
}

/** Light structural check for a PublicQuote received over the network. */
export function isPublicQuote(x: unknown): x is PublicQuote {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  const obj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
  // Everything the customer page dereferences must be there, or the link would crash for the customer.
  return (
    o.schema === 'bee.public-quote/1' &&
    typeof o.quote_number === 'string' &&
    typeof o.version_no === 'number' &&
    typeof o.issued_at === 'string' &&
    typeof o.reference === 'string' &&
    obj(o.project) &&
    obj(o.system) &&
    obj(o.totals) &&
    obj(o.terms) &&
    Array.isArray(o.sections) &&
    (o.sections as unknown[]).every((s) => obj(s) && Array.isArray((s as { lines?: unknown }).lines)) &&
    Array.isArray(o.payment_schedule)
  )
}

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local|[^.]+)$/i

/**
 * A customer link must be https on a real public host. Rejects localhost,
 * 127.x, private ranges, *.local and bare hostnames — the class of bug where a
 * link was built from the local server address (http://127.0.0.1:50973/q/…).
 */
export function isPublicBaseUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  return !LOCAL_HOSTS.test(u.hostname)
}

export function quoteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/q/${token}`
}

/** 128-bit random token, base64url, 22 chars. */
export function newQuoteToken(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const QUOTE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/
