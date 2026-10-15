import { describe, expect, it } from 'vitest'
import { buildQuote, cleanTexts } from './engine'
import { SUGGESTED_SIZING, applyPriceList, markRulesFilled, pricingReadiness } from './pricebook'
import { toPublicQuote } from './public'
import { seedCatalog, seedPricingRules } from './index'
import type { Catalog, PricingRules, QuoteInput } from './types'

const input: QuoteInput = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג',
  address: 'הרצל 1',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  includeBattery: false,
  acCableLengthM: 35,
}

function priced(): { catalog: Catalog; rules: PricingRules } {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30 })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  return { catalog, rules: markRulesFilled(rules, catalog) }
}

describe('company texts', () => {
  it('cleanTexts trims, drops empty lines and returns null when nothing is left', () => {
    expect(cleanTexts(undefined)).toBeNull()
    expect(cleanTexts({ included: [' ', ''], excluded: [], warranty: [], customer_obligations: [] })).toBeNull()
    expect(cleanTexts({ included: [' תכנון ', ''], excluded: [], warranty: ['מודולים — 12 שנה'], customer_obligations: [] })).toEqual({
      included: ['תכנון'],
      excluded: [],
      warranty: ['מודולים — 12 שנה'],
      customer_obligations: [],
    })
  })

  it('go into the snapshot and the public quote only when there is wording', async () => {
    const { catalog, rules } = priced()
    const now = new Date('2026-10-15T00:00:00Z')
    const a = await buildQuote(input, catalog, rules, { now })
    expect(a.terms.texts).toBeUndefined()
    expect(pricingReadiness(catalog, rules).recommended.map((r) => r.key)).toEqual(expect.arrayContaining(['texts.warranty', 'texts.excluded']))

    rules.texts = { included: ['תכנון חשמלי'], excluded: ['חיזוק גג'], warranty: ['עבודה — 5 שנים'], customer_obligations: ['גישה לגג'] }
    const b = await buildQuote(input, catalog, rules, { now })
    expect(b.terms.texts?.warranty).toEqual(['עבודה — 5 שנים'])
    expect(b.snapshot_hash).not.toBe(a.snapshot_hash)
    expect(toPublicQuote(b).terms.texts?.excluded).toEqual(['חיזוק גג'])
    expect(pricingReadiness(catalog, rules).recommended.map((r) => r.key)).not.toContain('texts.warranty')
    // Wording is a quote input: changing it makes a new version, not an edit.
    rules.texts.warranty = ['עבודה — 10 שנים']
    expect((await buildQuote(input, catalog, rules, { now })).snapshot_hash).not.toBe(b.snapshot_hash)
  })
})
