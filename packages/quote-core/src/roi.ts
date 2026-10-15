/**
 * ROI — production and savings estimate (spec 12 §5), quick mode.
 *
 * Production = kWp × specific yield (rules.sizing, for an optimal south-facing
 * array) × an orientation factor from the survey's azimuth/tilt. That is a
 * rough approximation for Israel (~31–33°N), not a PVGIS/pvlib run (spec 14).
 *
 * Every tariff and economic parameter comes from the price book. None of them
 * is hard-coded: `null` means "Barak fills it" and the ROI is simply not
 * produced until the parameters its track needs are there.
 *
 * Tax on feed-in income is NOT computed (spec 12 §5.2 tax_private needs
 * yearly thresholds that are not verified) — the result says so.
 */
import { round2 } from './money'
import type { ReadinessItem } from './pricebook'
import type { CustomerType, QuoteDesign, QuoteInput, QuoteTotals, RoiAssumption, RoiResult, RoiRules, TariffTrack } from './types'

export const TRACK_LABELS_HE: Record<TariffTrack, string> = {
  net_metering: 'מונה נטו — הייצור מקוזז מהצריכה',
  self_consumption: 'צריכה עצמית ומכירת עודפים',
  feed_in_full: 'הזנה מלאה — כל הייצור נמכר לרשת',
}

/** Share of annual production per month (Jan–Dec), typical for central Israel. Sums to 1. */
export const MONTHLY_SHARE_IL: readonly number[] = (() => {
  const raw = [5.6, 6.3, 8.3, 9.1, 10.2, 10.4, 10.6, 10.3, 9.0, 7.8, 6.4, 5.9]
  const sum = raw.reduce((s, x) => s + x, 0)
  return raw.map((x) => x / sum)
})()

/** Suggested starting points — only the generic ones. Tariffs and shares are Barak's call. */
export const SUGGESTED_ROI: Partial<RoiRules> = {
  degradation_pct_year: 0.4,
  first_year_degradation_pct: 1,
  horizon_years: 25,
  discount_rate_pct: 6,
  om_cost_pct_capex: 0.5,
  tariff_escalation_pct: 0,
}

export const EMPTY_ROI_RULES: RoiRules = {
  track: null,
  consumption_tariff_ils_kwh: null,
  feed_in_tariff_ils_kwh: null,
  surplus_tariff_ils_kwh: null,
  self_consumption_share: null,
  tariff_escalation_pct: null,
  degradation_pct_year: null,
  first_year_degradation_pct: null,
  om_cost_pct_capex: null,
  discount_rate_pct: null,
  horizon_years: null,
  co2_kg_per_kwh: null,
  verification: 'unverified',
}

/**
 * Orientation factor relative to the optimum (south, ~28°). Fitted by hand to
 * PVGIS figures for central Israel: horizontal ≈ 0.88, south wall ≈ 0.57,
 * east/west at 20° ≈ 0.91, north at 20° ≈ 0.82. Clamped to [0.3, 1].
 * `azimuthDeg` is a compass bearing (180 = south).
 */
export function orientationFactor(azimuthDeg: number | null | undefined, tiltDeg: number | null | undefined): number | null {
  if (tiltDeg === null || tiltDeg === undefined || !Number.isFinite(tiltDeg)) return null
  const tilt = Math.min(90, Math.max(0, tiltDeg))
  const az = azimuthDeg !== null && azimuthDeg !== undefined && Number.isFinite(azimuthDeg) ? azimuthDeg : 180
  const dev = Math.abs((((az - 180) % 360) + 540) % 360 - 180) // 0 = south … 180 = north
  const fTilt = 1 - 5.8e-4 * Math.pow(Math.abs(tilt - 28), 1.6)
  const fAz = 1 - 0.26 * (1 - Math.cos((dev * Math.PI) / 180)) * Math.sin((tilt * Math.PI) / 180)
  return Math.round(Math.min(1, Math.max(0.3, fTilt * fAz)) * 1000) / 1000
}

function requiredFor(track: TariffTrack): (keyof RoiRules)[] {
  const common: (keyof RoiRules)[] = ['degradation_pct_year', 'first_year_degradation_pct', 'horizon_years', 'discount_rate_pct', 'om_cost_pct_capex', 'tariff_escalation_pct']
  if (track === 'net_metering') return ['consumption_tariff_ils_kwh', ...common]
  if (track === 'self_consumption') return ['consumption_tariff_ils_kwh', 'surplus_tariff_ils_kwh', 'self_consumption_share', ...common]
  return ['feed_in_tariff_ils_kwh', ...common]
}

export const ROI_FIELD_LABELS_HE: Record<keyof Omit<RoiRules, 'verification'>, string> = {
  track: 'מסלול (מונה נטו / צריכה עצמית / הזנה)',
  consumption_tariff_ils_kwh: 'תעריף צריכה (₪ לקוט״ש, לפני מע״מ)',
  feed_in_tariff_ils_kwh: 'תעריף הזנה (₪ לקוט״ש)',
  surplus_tariff_ils_kwh: 'תעריף עודפים (₪ לקוט״ש)',
  self_consumption_share: 'חלק הצריכה העצמית (%)',
  tariff_escalation_pct: 'עליית תעריף שנתית (%)',
  degradation_pct_year: 'דעיכה שנתית (%)',
  first_year_degradation_pct: 'דעיכת שנה ראשונה (%)',
  om_cost_pct_capex: 'אחזקה שנתית (% מהעלות)',
  discount_rate_pct: 'שיעור היוון (%)',
  horizon_years: 'אופק (שנים)',
  co2_kg_per_kwh: 'מקדם פליטה (ק״ג CO₂ לקוט״ש)',
}

/** What the ROI still needs (empty = it will be produced). Never blocks a quote. */
export function roiReadiness(roi: RoiRules | undefined, specificYield: number | null): ReadinessItem[] {
  const r = roi ?? EMPTY_ROI_RULES
  if (!r.track) return [{ key: 'roi.track', label_he: `תחזית חיסכון: ${ROI_FIELD_LABELS_HE.track}` }]
  const missing = requiredFor(r.track).filter((k) => r[k] === null || r[k] === undefined)
  const out = missing.map((k) => ({ key: `roi.${k}`, label_he: `תחזית חיסכון: ${ROI_FIELD_LABELS_HE[k as keyof typeof ROI_FIELD_LABELS_HE]}` }))
  if (!specificYield) out.push({ key: 'roi.specific_yield', label_he: 'תחזית חיסכון: תפוקה סגולית (פרמטרי תכנון)' })
  return out
}

function npv(cfs: number[], ratePct: number): number {
  const r = ratePct / 100
  return cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0)
}

/** IRR by bisection on [-90%, 100%]; null when the cash flows never turn positive. */
export function irrPct(cfs: number[]): number | null {
  let lo = -0.9
  let hi = 1
  const f = (r: number) => cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0)
  if (f(lo) * f(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
  }
  return Math.round(((lo + hi) / 2) * 10000) / 100
}

export interface RoiContext {
  input: QuoteInput
  design: QuoteDesign
  totals: QuoteTotals
  vatRate: number | null
  specificYield: number | null
}

export function computeRoi(roi: RoiRules | undefined, ctx: RoiContext): RoiResult | null {
  if (!roi || roiReadiness(roi, ctx.specificYield).length) return null
  const { input, design, totals } = ctx
  const track = roi.track!
  const customerType: CustomerType = input.customerType ?? 'private'
  if (!design.dc_kwp || totals.subtotal_excl_vat_ils === null) return null
  const vat = ctx.vatRate ?? 0
  const vatFactor = customerType === 'private' ? 1 + vat : 1
  const capex = customerType === 'private' ? totals.total_incl_vat_ils ?? totals.subtotal_excl_vat_ils * (1 + vat) : totals.subtotal_excl_vat_ils
  const flags: string[] = []

  const orient = orientationFactor(input.azimuthDeg, input.tiltDeg)
  if (orient === null) flags.push('roi:orientation_assumed_optimal')
  const e1Base = design.dc_kwp * ctx.specificYield! * (orient ?? 1)
  const consumption = input.annualConsumptionKwh && input.annualConsumptionKwh > 0 ? input.annualConsumptionKwh : null
  if (!consumption && track !== 'feed_in_full') flags.push('roi:consumption_unknown')
  flags.push('roi:tax_not_included')

  const N = Math.round(roi.horizon_years!)
  const series: RoiResult['series'] = []
  const cfs = [-capex]
  let cum = -capex
  let payback: number | null = null
  let lifetimeSavings = 0
  for (let t = 1; t <= N; t++) {
    const E = e1Base * (1 - roi.first_year_degradation_pct! / 100) * Math.pow(1 - roi.degradation_pct_year! / 100, t - 1)
    const esc = Math.pow(1 + roi.tariff_escalation_pct! / 100, t - 1)
    let savings: number
    if (track === 'net_metering') {
      savings = Math.min(E, consumption ?? E) * roi.consumption_tariff_ils_kwh! * esc
    } else if (track === 'self_consumption') {
      const sc = Math.min(E * roi.self_consumption_share!, consumption ?? Infinity)
      savings = sc * roi.consumption_tariff_ils_kwh! * esc + (E - sc) * roi.surplus_tariff_ils_kwh!
    } else {
      savings = E * roi.feed_in_tariff_ils_kwh!
    }
    const gross = savings * vatFactor
    const opex = totals.subtotal_excl_vat_ils * (roi.om_cost_pct_capex! / 100) * (customerType === 'private' ? 1 + vat : 1)
    const cf = gross - opex
    const prevCum = cum
    cum += cf
    lifetimeSavings += cf
    if (payback === null && cum >= 0 && cf > 0) payback = round2(t - 1 + -prevCum / cf)
    cfs.push(cf)
    series.push({ year: t, kwh: Math.round(E), savings_ils: Math.round(gross), opex_ils: Math.round(opex), cf_ils: Math.round(cf), cum_cf_ils: Math.round(cum) })
  }

  const y1 = series[0]!
  const billBefore = consumption && roi.consumption_tariff_ils_kwh !== null ? Math.round(consumption * roi.consumption_tariff_ils_kwh * vatFactor) : null
  const assumptions: RoiAssumption[] = [
    { key: 'track', label_he: 'מסלול', value: TRACK_LABELS_HE[track], unit: '' },
    { key: 'specific_yield', label_he: 'תפוקה סגולית (כיוון אופטימלי)', value: ctx.specificYield!, unit: 'קוט״ש ל-kWp לשנה' },
    { key: 'orientation', label_he: 'מקדם כיוון ושיפוע', value: orient ?? 1, unit: orient === null ? '(לא נמדד — הונח אופטימלי)' : '' },
    ...(track !== 'feed_in_full' ? [{ key: 'consumption_tariff', label_he: 'תעריף צריכה', value: roi.consumption_tariff_ils_kwh!, unit: '₪ לקוט״ש לפני מע״מ' }] : []),
    ...(track === 'self_consumption'
      ? [
          { key: 'self_consumption_share', label_he: 'חלק הצריכה העצמית', value: Math.round(roi.self_consumption_share! * 100), unit: '%' },
          { key: 'surplus_tariff', label_he: 'תעריף עודפים', value: roi.surplus_tariff_ils_kwh!, unit: '₪ לקוט״ש' },
        ]
      : []),
    ...(track === 'feed_in_full' ? [{ key: 'feed_in_tariff', label_he: 'תעריף הזנה', value: roi.feed_in_tariff_ils_kwh!, unit: '₪ לקוט״ש' }] : []),
    { key: 'escalation', label_he: 'עליית תעריף שנתית', value: roi.tariff_escalation_pct!, unit: '%' },
    { key: 'degradation', label_he: 'דעיכת פאנלים', value: `${roi.first_year_degradation_pct}% בשנה הראשונה, ${roi.degradation_pct_year}% לשנה אחר כך`, unit: '' },
    { key: 'om', label_he: 'אחזקה שנתית', value: roi.om_cost_pct_capex!, unit: '% מעלות המערכת' },
    { key: 'horizon', label_he: 'אופק החישוב', value: N, unit: 'שנים' },
    { key: 'discount', label_he: 'שיעור היוון (לערך נוכחי)', value: roi.discount_rate_pct!, unit: '%' },
    { key: 'vat', label_he: customerType === 'private' ? 'לקוח פרטי — חיסכון ועלות כוללים מע״מ' : 'לקוח עסקי — לפני מע״מ', value: '', unit: '' },
    { key: 'tax', label_he: 'מס על הכנסה ממכירת חשמל', value: 'לא נכלל — אינו ייעוץ מס', unit: '' },
  ]

  return {
    method: 'quick-il/1',
    track,
    customer_type: customerType,
    capex_ils: Math.round(capex),
    kpi: {
      annual_yield_kwh_y1: y1.kwh,
      specific_yield_kwh_per_kwp: Math.round(y1.kwh / design.dc_kwp),
      savings_y1_ils: y1.savings_ils,
      payback_years: payback,
      npv_ils: Math.round(npv(cfs, roi.discount_rate_pct!)),
      irr_pct: irrPct(cfs),
      offset_pct: consumption ? Math.round((y1.kwh / consumption) * 100) : null,
      lifetime_net_savings_ils: Math.round(lifetimeSavings - capex),
      co2_t_year: roi.co2_kg_per_kwh ? round2((y1.kwh * roi.co2_kg_per_kwh) / 1000) : null,
    },
    monthly_kwh: MONTHLY_SHARE_IL.map((s) => Math.round(y1.kwh * s)),
    series,
    bill: { before_y1_ils: billBefore, after_y1_ils: billBefore === null ? null : Math.max(0, billBefore - y1.savings_ils) },
    assumptions,
    flags,
    verification: roi.verification,
  }
}
