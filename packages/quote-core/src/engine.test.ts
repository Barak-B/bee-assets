import { describe, expect, it } from 'vitest'
import { buildQuote, computeTotals, sizeSystem } from './engine'
import { canonicalJson } from './money'
import { seedCatalog, seedPricingRules as seedRules } from './index'
import type { Catalog, PricingRules, QuoteInput } from './types'

// ── Fixtures: the seed catalog with *test* prices (not real B.E.E prices) ──

function pricedCatalog(): Catalog {
  const c: Catalog = structuredClone(seedCatalog)
  c.fx_rates = { USD: 3.7, EUR: 4.0, source: 'test', as_of: '2026-10-13' }
  const cost: Record<string, number> = {
    'BEE-MOD-0001': 90, // USD
    'BEE-INV-SE05': 1000,
    'BEE-INV-SE10': 1500,
    'BEE-INV-SE17': 2200,
    'BEE-INV-SE27': 3000,
    'BEE-INV-KS10': 900,
    'BEE-INV-KS20': 1500,
    'BEE-INV-DY12': 1700,
    'BEE-OPT-SE01': 45,
    'BEE-BAT-0001': 3000,
    'BEE-MNT-TILE': 120, // ILS from here on
    'BEE-MNT-FLAT': 150,
    'BEE-MNT-TIN': 100,
    'BEE-MNT-GND': 200,
    'BEE-CBL-DC6': 6,
    'BEE-CBL-AC': 25,
    'BEE-CAB-AC': 1800,
    'BEE-CAB-DC': 900,
    'BEE-ACC-PE': 600,
    'BEE-MTR-PROD': 1200,
    'BEE-LAB-MOD': 0,
    'BEE-LAB-INV': 2500,
    'BEE-LAB-CRANE': 2200,
    'BEE-SRV-DESIGN': 4000,
    'BEE-SRV-CONST': 2500,
    'BEE-SRV-INSP': 1800,
    'BEE-SRV-IEC': 3000,
    'BEE-FEE-IEC': 1200,
  }
  for (const p of c.products) {
    if (p.sku in cost) {
      p.unit_cost = cost[p.sku]!
      p.needs_owner_input = false
      p.verification = 'office'
    }
  }
  return c
}

function rules(): PricingRules {
  const r: PricingRules = structuredClone(seedRules)
  r.vat_rate = 0.18
  r.default_margin_pct = 0.2
  r.margins = { module: 0.25, inverter: 0.25, optimizer: 0.25, battery: 0.2, fee: 0 }
  r.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: null }
  r.sizing = {
    area_m2_per_kwp: 5.5,
    specific_yield_kwh_per_kwp: 1650,
    dc_ac_ratio_max: 1.2,
    dc_cable_m_per_module: 2.5,
    default_ac_cable_m: 30,
    strings_modules_per_string: 12,
  }
  r.validity_days = 30
  r.final_round_step_ils = 10
  r.payment_schedule = r.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  r.needs_owner_input = false
  r.verification = 'office'
  return r
}

const baseInput = (): QuoteInput => ({
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג תל אביב',
  address: 'הרצל 1, תל אביב',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  annualConsumptionKwh: 18000,
  inverterBrand: 'SolarEdge',
  includeBattery: false,
  acCableLengthM: 35,
  phases: 3,
  craneAccess: true,
})

describe('sizeSystem', () => {
  it('sizes modules and picks the smallest fitting inverter of the preferred brand', () => {
    const s = sizeSystem(baseInput(), pricedCatalog(), rules())
    expect(s.design.module_count).toBe(34) // ceil(15000/450)
    expect(s.design.dc_kwp).toBe(15.3)
    expect(s.design.kwp_basis).toBe('target')
    // need AC ≥ 15.3/1.2 = 12.75 → SE17
    expect(s.design.inverter_sku).toBe('BEE-INV-SE17')
    expect(s.design.inverter_count).toBe(1)
    expect(s.design.optimizer_count).toBe(34)
    expect(s.design.strings_estimate).toBe(3)
    expect(s.design.area_needed_m2).toBe(84.15)
    expect(s.design.area_ok).toBe(true)
    expect(s.design.annual_yield_kwh_estimate).toBe(25245)
    expect(s.flags).toEqual([])
  })

  it('derives kWp from area when no target is given, and from consumption as a last resort', () => {
    const byArea = sizeSystem({ ...baseInput(), targetKwp: null }, pricedCatalog(), rules())
    expect(byArea.design.kwp_basis).toBe('area')
    expect(byArea.design.module_count).toBe(49) // 120/5.5 = 21.8 kWp → ceil(21818/450)

    const byConsumption = sizeSystem({ ...baseInput(), targetKwp: null, usableAreaM2: null }, pricedCatalog(), rules())
    expect(byConsumption.design.kwp_basis).toBe('consumption')
    expect(byConsumption.design.module_count).toBe(25) // 18000/1650 = 10.9 kWp
  })

  it('stacks inverters when the largest unit is too small and flags it', () => {
    const s = sizeSystem({ ...baseInput(), targetKwp: 60 }, pricedCatalog(), rules())
    expect(s.design.inverter_sku).toBe('BEE-INV-SE27')
    expect(s.design.inverter_count).toBe(2) // 60.3/1.2 = 50.25 → 2 × 27.6
    expect(s.flags).toContain('sizing:multiple_inverters')
  })

  it('flags insufficient area and missing kWp basis', () => {
    const tight = sizeSystem({ ...baseInput(), usableAreaM2: 40 }, pricedCatalog(), rules())
    expect(tight.design.area_ok).toBe(false)
    expect(tight.flags).toContain('sizing:area_insufficient')

    const none = sizeSystem({ ...baseInput(), targetKwp: null, usableAreaM2: null, annualConsumptionKwh: null }, pricedCatalog(), rules())
    expect(none.design.module_count).toBe(0)
    expect(none.flags).toContain('sizing:no_kwp_basis')
  })

  it('skips optimizers for brands that do not need them', () => {
    const s = sizeSystem({ ...baseInput(), inverterBrand: 'KStar' }, pricedCatalog(), rules())
    expect(s.design.inverter_sku).toBe('BEE-INV-KS20')
    expect(s.design.optimizer_count).toBe(0)
  })
})

describe('buildQuote (golden)', () => {
  it('produces a fully priced draft with the expected totals', async () => {
    const q = await buildQuote(baseInput(), pricedCatalog(), rules(), { now: new Date('2026-10-13T12:00:00Z') })

    expect(q.quote_number).toBe('Q-202610-111111')
    expect(q.status).toBe('draft')
    expect(q.trust.requiresHumanPick).toBe(true)
    expect(q.terms.valid_until).toBe('2026-11-12')
    expect(q.terms.linkage).toBe('fx')

    const by = (sku: string) => q.lines.find((l) => l.sku === sku)!
    // modules: 90 USD × 3.7 = 333 → ×1.25 = 416.25 → × 34
    expect(by('BEE-MOD-0001').unit_cost_ils).toBe(333)
    expect(by('BEE-MOD-0001').unit_price_ils).toBe(416.25)
    expect(by('BEE-MOD-0001').line_total_ils).toBe(14152.5)
    // labour from roof lookup, not cost×margin
    expect(by('BEE-LAB-MOD').unit_price_ils).toBe(300)
    expect(by('BEE-LAB-MOD').qty).toBe(34)
    // mounting by roof type
    expect(by('BEE-MNT-FLAT').qty).toBe(34)
    expect(q.lines.find((l) => l.sku === 'BEE-MNT-TILE')).toBeUndefined()
    // AC cable from survey + 10%
    expect(by('BEE-CBL-AC').qty).toBe(39)
    expect(by('BEE-CBL-AC').qty_source).toBe('input')
    // fee is passthrough and excluded from totals
    expect(by('BEE-FEE-IEC').passthrough).toBe(true)
    expect(q.totals.passthrough_estimate_ils).toBe(1200)

    const expectedSubtotal = q.lines
      .filter((l) => !l.passthrough)
      .reduce((s, l) => s + (l.line_total_ils ?? 0), 0)
    expect(q.totals.unpriced_lines).toBe(0)
    expect(q.totals.subtotal_excl_vat_ils).toBe(Math.round(expectedSubtotal / 10) * 10)
    expect(q.totals.vat_ils).toBe(Math.round(q.totals.subtotal_excl_vat_ils! * 0.18 * 100) / 100)
    expect(q.totals.total_incl_vat_ils).toBe(q.totals.subtotal_excl_vat_ils! + q.totals.vat_ils!)
    expect(q.totals.price_per_kwp_excl_vat_ils).toBeGreaterThan(0)
    expect(q.needs_owner_input).toBe(false)
    expect(q.flags).toEqual([])
    expect(q.snapshot_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic: same input → same hash; any change → different hash', async () => {
    const now = new Date('2026-10-13T12:00:00Z')
    const a = await buildQuote(baseInput(), pricedCatalog(), rules(), { now })
    const b = await buildQuote(baseInput(), pricedCatalog(), rules(), { now })
    const c = await buildQuote({ ...baseInput(), acCableLengthM: 36 }, pricedCatalog(), rules(), { now })
    expect(a.snapshot_hash).toBe(b.snapshot_hash)
    expect(a.snapshot_hash).not.toBe(c.snapshot_hash)
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
  })

  it('still builds a complete bill of quantities from the unpriced seed, flagging everything for Barak', async () => {
    const q = await buildQuote(baseInput(), seedCatalog, seedRules)
    expect(q.design.module_count).toBe(34)
    expect(q.lines.length).toBeGreaterThan(10)
    expect(q.totals.subtotal_excl_vat_ils).toBeNull()
    expect(q.totals.unpriced_lines).toBeGreaterThan(0)
    expect(q.needs_owner_input).toBe(true)
    expect(q.flags).toContain('rules:vat_missing')
    expect(q.flags).toContain('rules:needs_owner_input')
    for (const l of q.lines) expect(l.needs_owner_input).toBe(!l.passthrough)
    // passthrough fees without an estimate are not a gap
    expect(q.lines.find((l) => l.kind === 'fee')!.flags).not.toContain('pricing:cost_missing')
    // seed sizing parameters are null → no area/yield estimates, but target kWp still works
    expect(q.design.area_needed_m2).toBeNull()
    expect(q.lines.find((l) => l.sku === 'BEE-CBL-DC6')).toBeUndefined()
  })

  it('flags budget overruns and includes a battery on request', async () => {
    const q = await buildQuote({ ...baseInput(), includeBattery: true, budgetIls: 50_000 }, pricedCatalog(), rules())
    expect(q.lines.some((l) => l.kind === 'battery')).toBe(true)
    expect(q.flags).toContain('budget:exceeded')
  })

  it('computeTotals handles the all-unpriced case', () => {
    const t = computeTotals([], rules(), 10)
    expect(t.subtotal_excl_vat_ils).toBeNull()
    expect(t.total_incl_vat_ils).toBeNull()
  })
})
