import { describe, expect, it } from 'vitest'
import { buildQuote } from './engine'
import { SUGGESTED_SIZING, applyPriceList, markRulesFilled, pricingReadiness } from './pricebook'
import { toPublicQuote } from './public'
import { EMPTY_ROI_RULES, MONTHLY_SHARE_IL, SUGGESTED_ROI, computeRoi, irrPct, orientationFactor, roiReadiness } from './roi'
import { seedCatalog, seedPricingRules } from './index'
import type { Catalog, PricingRules, QuoteDesign, QuoteInput, QuoteTotals, RoiRules } from './types'

const input: QuoteInput = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג תל אביב',
  address: 'הרצל 1, תל אביב',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  annualConsumptionKwh: 30000,
  inverterBrand: 'SolarEdge',
  includeBattery: false,
  acCableLengthM: 35,
  phases: 3,
}

function priced(roi?: RoiRules): { catalog: Catalog; rules: PricingRules } {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30 })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  if (roi) rules.roi = roi
  return { catalog, rules: markRulesFilled(rules, catalog) }
}

/** Test tariffs — not real ones. */
const netMetering = (): RoiRules => ({ ...EMPTY_ROI_RULES, ...SUGGESTED_ROI, track: 'net_metering', consumption_tariff_ils_kwh: 0.5 })

describe('orientationFactor', () => {
  it('is 1 at the optimum and lower for flat, east/west, north and vertical', () => {
    expect(orientationFactor(180, 28)).toBe(1)
    expect(orientationFactor(180, 0)).toBeCloseTo(0.88, 1)
    expect(orientationFactor(90, 20)!).toBeGreaterThan(0.85)
    expect(orientationFactor(90, 20)!).toBeLessThan(0.95)
    expect(orientationFactor(0, 20)!).toBeLessThan(orientationFactor(90, 20)!)
    expect(orientationFactor(180, 90)!).toBeCloseTo(0.57, 1)
    expect(orientationFactor(-90, 20)).toBe(orientationFactor(270, 20)) // west either way
    expect(orientationFactor(180, null)).toBeNull()
  })
})

describe('irrPct', () => {
  it('finds the rate where NPV is zero', () => {
    expect(irrPct([-1000, 1100])).toBeCloseTo(10, 1)
    expect(irrPct([-1000, 100, 100])!).toBeLessThan(0) // loses money → negative IRR
    expect(irrPct([-1000, -10])).toBeNull() // no sign change → no IRR
  })
})

describe('computeRoi', () => {
  const design = { dc_kwp: 10 } as QuoteDesign
  const totals = { subtotal_excl_vat_ils: 40000, total_incl_vat_ils: 47200 } as QuoteTotals
  const ctx = (over: Partial<QuoteInput> = {}) => ({ input: { ...input, tiltDeg: 28, azimuthDeg: 180, ...over }, design, totals, vatRate: 0.18, specificYield: 1600 })

  it('net metering, private: hand-checked year 1 and payback', () => {
    const r = computeRoi(netMetering(), ctx())!
    // E1 = 10 × 1600 × 1 × (1 − 1%) = 15,840 kWh ; savings = 15,840 × 0.5 × 1.18 = 9,345.6
    expect(r.kpi.annual_yield_kwh_y1).toBe(15840)
    expect(r.kpi.savings_y1_ils).toBe(9346)
    // opex = 40,000 × 0.5% × 1.18 = 236 ; cf1 ≈ 9,110 → payback a little over 5 years on 47,200
    expect(r.series[0]!.opex_ils).toBe(236)
    expect(r.kpi.payback_years).toBeGreaterThan(5)
    expect(r.kpi.payback_years).toBeLessThan(5.5)
    expect(r.capex_ils).toBe(47200)
    expect(r.series).toHaveLength(25)
    expect(r.kpi.offset_pct).toBe(53) // 15,840 / 30,000
    expect(r.monthly_kwh.reduce((s, x) => s + x, 0)).toBeCloseTo(15840, -1)
    expect(r.monthly_kwh[6]!).toBeGreaterThan(r.monthly_kwh[0]!) // July > January
    expect(r.flags).toContain('roi:tax_not_included')
    expect(r.series[24]!.cum_cf_ils).toBe(r.kpi.lifetime_net_savings_ils)
  })

  it('caps net-metering savings at the annual consumption', () => {
    const r = computeRoi(netMetering(), ctx({ annualConsumptionKwh: 5000 }))!
    expect(r.kpi.savings_y1_ils).toBe(Math.round(5000 * 0.5 * 1.18))
  })

  it('business customers work without VAT', () => {
    const r = computeRoi(netMetering(), ctx({ customerType: 'business' }))!
    expect(r.capex_ils).toBe(40000)
    expect(r.kpi.savings_y1_ils).toBe(Math.round(15840 * 0.5))
  })

  it('self consumption splits on-site use and surplus', () => {
    const roi: RoiRules = { ...netMetering(), track: 'self_consumption', self_consumption_share: 0.4, surplus_tariff_ils_kwh: 0.2 }
    const r = computeRoi(roi, ctx())!
    // VAT only on the avoided consumption; sale income has none for a private customer.
    expect(r.kpi.savings_y1_ils).toBe(Math.round(15840 * 0.4 * 0.5 * 1.18 + 15840 * 0.6 * 0.2))
  })

  it('feed-in sells everything at the feed-in tariff', () => {
    const roi: RoiRules = { ...netMetering(), track: 'feed_in_full', consumption_tariff_ils_kwh: null, feed_in_tariff_ils_kwh: 0.3 }
    expect(computeRoi(roi, ctx())!.kpi.savings_y1_ils).toBe(Math.round(15840 * 0.3))
  })

  it('is not produced until the track and its parameters are filled', () => {
    expect(computeRoi(EMPTY_ROI_RULES, ctx())).toBeNull()
    expect(roiReadiness(EMPTY_ROI_RULES, 1600).map((m) => m.key)).toEqual(['roi.track'])
    const noTariff = { ...netMetering(), consumption_tariff_ils_kwh: null }
    expect(computeRoi(noTariff, ctx())).toBeNull()
    expect(roiReadiness(noTariff, 1600).map((m) => m.key)).toEqual(['roi.consumption_tariff_ils_kwh'])
    expect(roiReadiness(netMetering(), null).map((m) => m.key)).toEqual(['roi.specific_yield'])
    expect(SUGGESTED_ROI).not.toHaveProperty('consumption_tariff_ils_kwh') // tariffs are never suggested
  })

  it('monthly shares sum to 1', () => {
    expect(MONTHLY_SHARE_IL.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10)
  })
})

describe('ROI in the quote', () => {
  it('is part of the snapshot only when produced; without it hashes stay as before', async () => {
    const { catalog, rules } = priced()
    const a = await buildQuote(input, catalog, rules, { now: new Date('2026-10-15T00:00:00Z') })
    expect(a.roi).toBeUndefined()
    const { rules: withRoi } = priced(netMetering())
    const b = await buildQuote(input, catalog, withRoi, { now: new Date('2026-10-15T00:00:00Z') })
    expect(b.roi?.track).toBe('net_metering')
    expect(b.snapshot_hash).not.toBe(a.snapshot_hash)
    // ROI parameters are recommended, never blocking
    expect(pricingReadiness(catalog, rules).ready).toBe(true)
    expect(pricingReadiness(catalog, rules).recommended.map((r) => r.key)).toContain('roi.track')
    expect(pricingReadiness(catalog, withRoi).recommended.filter((r) => r.key.startsWith('roi.'))).toEqual([])
    expect(b.needs_owner_input).toBe(false)
  })

  it('the public model carries the estimate and no internal numbers', async () => {
    const { catalog, rules } = priced(netMetering())
    const q = await buildQuote({ ...input, tiltDeg: 15, azimuthDeg: 200 }, catalog, rules)
    const pq = toPublicQuote(q)
    expect(pq.roi?.savings_y1_ils).toBe(q.roi!.kpi.savings_y1_ils)
    expect(pq.roi?.cumulative).toHaveLength(25)
    expect(pq.roi?.notes_he.join(' ')).toContain('אינו ייעוץ מס')
    expect(JSON.stringify(pq)).not.toMatch(/unit_cost|margin_pct|fx_rate|BEE-[A-Z]{3}-|npv|irr/)
    expect(toPublicQuote(await buildQuote(input, catalog, priced().rules)).roi).toBeUndefined()
  })
})
