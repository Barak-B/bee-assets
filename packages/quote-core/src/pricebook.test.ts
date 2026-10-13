import { describe, expect, it } from 'vitest'
import { buildQuote } from './engine'
import { diffIsEmpty } from './diff'
import {
  SUGGESTED_SIZING,
  applyPriceList,
  markRulesFilled,
  parseNumber,
  parsePriceListCsv,
  priceListTemplateCsv,
  pricingReadiness,
  rowsFromTable,
} from './pricebook'
import { seedCatalog, seedPricingRules } from './index'
import type { Catalog, PricingRules, QuoteInput } from './types'

const input: QuoteInput = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג',
  address: 'הרצל 1',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  inverterBrand: 'SolarEdge',
  includeBattery: false,
  acCableLengthM: 35,
  phases: 3,
}

function filledRules(): PricingRules {
  const r: PricingRules = structuredClone(seedPricingRules)
  r.vat_rate = 0.18
  r.default_margin_pct = 0.2
  r.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: null }
  r.sizing = { ...SUGGESTED_SIZING }
  r.validity_days = 30
  r.payment_schedule = r.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  return r
}

function allCosts(c: Catalog): Catalog {
  const rows = c.products.map((p, i) => ({ sku: p.sku, unit_cost: 100 + i }))
  return applyPriceList(c, rows, 'test').catalog
}

describe('parsing', () => {
  it('parses numbers in common supplier formats', () => {
    expect(parseNumber('1,234.50')).toBe(1234.5)
    expect(parseNumber('1234,50')).toBe(1234.5)
    expect(parseNumber('₪ 980')).toBe(980)
    expect(parseNumber('$90')).toBe(90)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber(42)).toBe(42)
  })

  it('reads a Hebrew-header CSV with quotes, semicolons and a BOM', () => {
    const csv = '﻿מק"ט;תיאור;עלות;מטבע\r\nBEE-MOD-0001;"מודול; 450W";92.5;USD\r\nBEE-CBL-AC;כבל;"25,5";₪\r\nBEE-XXX;לא קיים;10;ILS\r\nBEE-CAB-AC;לוח;abc;ILS\r\n'
    const { rows, invalid } = parsePriceListCsv(csv)
    expect(rows).toEqual([
      { sku: 'BEE-MOD-0001', unit_cost: 92.5, currency: 'USD', row: 2 },
      { sku: 'BEE-CBL-AC', unit_cost: 25.5, currency: 'ILS', row: 3 },
      { sku: 'BEE-XXX', unit_cost: 10, currency: 'ILS', row: 4 },
    ])
    expect(invalid).toEqual([{ row: 5, reason: 'עלות לא מספרית: "abc"' }])
  })

  it('finds the header row below a title block', () => {
    const { rows } = rowsFromTable([['מחירון ספק X'], [], ['SKU', 'Price'], ['BEE-CBL-DC6', 6]])
    expect(rows).toEqual([{ sku: 'BEE-CBL-DC6', unit_cost: 6, currency: undefined, row: 4 }])
  })

  it('reports a missing header', () => {
    expect(parsePriceListCsv('a,b\n1,2').invalid[0]!.reason).toMatch(/כותרת/)
  })
})

describe('applyPriceList', () => {
  it('applies known SKUs, keeps the original, and reports unknown ones', () => {
    const res = applyPriceList(seedCatalog, [
      { sku: 'bee-mod-0001', unit_cost: 92 },
      { sku: 'BEE-NOPE', unit_cost: 1 },
      { sku: 'BEE-CBL-AC', unit_cost: null },
    ], 'ספק X', '2026-10-13')
    expect(res.applied).toBe(1)
    expect(res.unknownSkus).toEqual(['BEE-NOPE'])
    const mod = res.catalog.products.find((p) => p.sku === 'BEE-MOD-0001')!
    expect(mod.unit_cost).toBe(92)
    expect(mod.currency).toBe('USD')
    expect(mod.needs_owner_input).toBe(false)
    expect(mod.verification).toBe('office')
    expect(mod.cost_source).toBe('ספק X · 2026-10-13')
    expect(seedCatalog.products.find((p) => p.sku === 'BEE-MOD-0001')!.unit_cost).toBeNull()
  })

  it('round-trips through the CSV template', () => {
    const priced = allCosts(seedCatalog)
    const { rows, invalid } = parsePriceListCsv(priceListTemplateCsv(priced))
    expect(invalid).toEqual([])
    expect(rows).toHaveLength(priced.products.length)
    const again = applyPriceList(priced, rows, 'roundtrip')
    expect(again.applied).toBe(0)
    expect(again.unchanged).toBe(priced.products.filter((p) => p.unit_cost !== null).length)
  })
})

describe('pricingReadiness', () => {
  it('lists everything missing for the seed', () => {
    const r = pricingReadiness(seedCatalog, seedPricingRules)
    expect(r.ready).toBe(false)
    const keys = r.missing.map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(['catalog.costs', 'rules.vat_rate', 'rules.margins', 'rules.labour', 'rules.validity_days', 'rules.payment_schedule', 'rules.sizing']))
    expect(r.pricedCount).toBe(0)
  })

  it('is ready once costs, FX and rules are filled', () => {
    const c = allCosts(seedCatalog)
    c.fx_rates = { USD: 3.7, EUR: 4 }
    const r = pricingReadiness(c, filledRules())
    expect(r.missing).toEqual([])
    expect(r.ready).toBe(true)
    expect(markRulesFilled(filledRules(), c).needs_owner_input).toBe(false)
  })

  it('catches a payment schedule that does not sum to 100%', () => {
    const rules = filledRules()
    rules.payment_schedule[0]!.pct = 50
    const c = allCosts(seedCatalog)
    c.fx_rates = { USD: 3.7, EUR: 4 }
    expect(pricingReadiness(c, rules).missing.map((m) => m.key)).toEqual(['rules.payment_schedule_sum'])
  })
})

describe('end to end: filled price book → real quote, then a revision', () => {
  it('produces totals with no owner-input flags, then v2 with a diff', async () => {
    const c = allCosts(seedCatalog)
    c.fx_rates = { USD: 3.7, EUR: 4 }
    const rules = markRulesFilled(filledRules(), c)
    const now = new Date('2026-10-13T12:00:00Z')
    const v1 = await buildQuote(input, c, rules, { now })
    expect(v1.needs_owner_input).toBe(false)
    expect(v1.totals.total_incl_vat_ils).toBeGreaterThan(0)
    expect(v1.version_no).toBe(1)
    expect(v1.supersedes_hash).toBeNull()
    expect(v1.changes).toBeNull()

    const v2 = await buildQuote({ ...input, targetKwp: 20, includeBattery: true }, c, rules, { now, previous: v1 })
    expect(v2.version_no).toBe(2)
    expect(v2.quote_number).toBe(v1.quote_number)
    expect(v2.supersedes_hash).toBe(v1.snapshot_hash)
    expect(diffIsEmpty(v2.changes)).toBe(false)
    expect(v2.changes!.added.map((l) => l.kind)).toContain('battery')
    expect(v2.changes!.changed.some((ch) => ch.sku === 'BEE-MOD-0001' && ch.after.qty > ch.before.qty)).toBe(true)
    expect(v2.changes!.total_delta_incl_vat_ils).toBeCloseTo(v2.totals.total_incl_vat_ils! - v1.totals.total_incl_vat_ils!, 2)
  })
})
