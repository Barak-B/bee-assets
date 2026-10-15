import { describe, expect, it } from 'vitest'
import { buildQuote } from './engine'
import { ceilSafe, israelDate, scheduleAmounts } from './money'
import { SUGGESTED_SIZING, applyPriceList, markRulesFilled, parseNumber, pricingReadiness } from './pricebook'
import { toPublicQuote } from './public'
import { EMPTY_ROI_RULES, SUGGESTED_ROI, computeRoi, roiReadiness } from './roi'
import { seedCatalog, seedPricingRules } from './index'
import type { Catalog, PricingRules, QuoteDesign, QuoteInput, QuoteTotals } from './types'

const input: QuoteInput = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג',
  address: 'הרצל 1',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  inverterBrand: 'SolarEdge',
  includeBattery: false,
  acCableLengthM: 50,
  phases: 3,
}

function priced(step: number | null = null): { catalog: Catalog; rules: PricingRules } {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30, final_round_step_ils: step })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 30, 20, 10, 10][i] ?? null }))
  return { catalog, rules: markRulesFilled(rules, catalog) }
}

describe('review fixes — quote engine', () => {
  it('the same quote rebuilt on another day has the same hash (no empty new version)', async () => {
    const { catalog, rules } = priced()
    const a = await buildQuote(input, catalog, rules, { now: new Date('2026-10-15T10:00:00Z') })
    const b = await buildQuote(input, catalog, rules, { now: new Date('2026-10-16T10:00:00Z') })
    expect(b.snapshot_hash).toBe(a.snapshot_hash)
    expect(b.terms.valid_until).not.toBe(a.terms.valid_until) // still shown, just not hashed
  })

  it('validity and issue date are Israeli calendar dates', async () => {
    const { catalog, rules } = priced()
    // 23:30 UTC on the 15th is already the 16th in Israel.
    const q = await buildQuote(input, catalog, rules, { now: new Date('2026-10-15T23:30:00Z') })
    expect(israelDate(new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16')
    expect(q.terms.valid_until).toBe('2026-11-15')
    expect(toPublicQuote(q).issued_at).toBe('2026-10-16')
  })

  it('reads EU, US and Israeli number formats from supplier price lists', () => {
    expect(parseNumber('1.234,50')).toBe(1234.5)
    expect(parseNumber('1,234.50')).toBe(1234.5)
    expect(parseNumber('1.050,00')).toBe(1050)
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('1,234')).toBe(1234)
    expect(parseNumber('1.234.567')).toBe(1234567)
    expect(parseNumber('€ 99,90')).toBe(99.9)
    expect(parseNumber('0.48')).toBe(0.48)
  })

  it('payment milestones add up to the total exactly', async () => {
    expect(scheduleAmounts(47865.48, [30, 30, 20, 10, 10]).reduce<number>((s, a) => s + (a ?? 0), 0)).toBeCloseTo(47865.48, 2)
    const { catalog, rules } = priced()
    const pq = toPublicQuote(await buildQuote(input, catalog, rules))
    const sum = pq.payment_schedule.reduce((s, m) => s + (m.amount_ils ?? 0), 0)
    expect(sum).toBeCloseTo(pq.totals.total_incl_vat_ils!, 2)
  })

  it('sections + rounding = subtotal on the customer quote', async () => {
    const { catalog, rules } = priced(100)
    const pq = toPublicQuote(await buildQuote(input, catalog, rules))
    const sections = pq.sections.reduce((s, x) => s + x.total_ils, 0)
    expect(pq.totals.rounding_ils).not.toBe(0)
    expect(sections + pq.totals.rounding_ils).toBeCloseTo(pq.totals.subtotal_excl_vat_ils!, 2)
  })

  it('binary-float noise does not add a unit (50 m + 10% = 55 m)', async () => {
    expect(ceilSafe(50 * 1.1)).toBe(55)
    const { catalog, rules } = priced()
    const q = await buildQuote(input, catalog, rules)
    expect(q.lines.find((l) => l.sku === 'BEE-CBL-AC')?.qty).toBe(55)
  })

  it('no construction product for the roof is a blocking gap, not a silent omission', async () => {
    const { catalog, rules } = priced()
    for (const p of catalog.products) if (p.kind === 'mounting') p.is_active = false
    const q = await buildQuote(input, catalog, rules)
    expect(q.flags).toContain('catalog:no_mounting:flat')
    expect(q.needs_owner_input).toBe(true)
  })

  it('roof type "other" needs a labour price before the price book is ready', () => {
    const { catalog, rules } = priced()
    rules.labour_per_module_ils.other = null
    expect(pricingReadiness(catalog, rules).missing.map((m) => m.key)).toContain('rules.labour')
  })

  it('a zero or negative horizon is "missing", never a crash', () => {
    const roi = { ...EMPTY_ROI_RULES, ...SUGGESTED_ROI, track: 'net_metering' as const, consumption_tariff_ils_kwh: 0.5, horizon_years: 0 }
    expect(roiReadiness(roi, 1600).map((m) => m.key)).toContain('roi.horizon_years')
    const design = { dc_kwp: 10 } as QuoteDesign
    const totals = { subtotal_excl_vat_ils: 40000, total_incl_vat_ils: 47200 } as QuoteTotals
    expect(computeRoi(roi, { input, design, totals, vatRate: 0.18, specificYield: 1600 })).toBeNull()
  })
})
