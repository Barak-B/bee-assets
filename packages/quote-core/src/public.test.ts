import { describe, expect, it } from 'vitest'
import { buildQuote } from './engine'
import { SUGGESTED_SIZING, applyPriceList, markRulesFilled } from './pricebook'
import {
  NotPublishableError,
  QUOTE_TOKEN_RE,
  isPublicBaseUrl,
  isPublicQuote,
  newQuoteToken,
  publishBlockers,
  quoteLink,
  toPublicQuote,
} from './public'
import { seedCatalog, seedPricingRules } from './index'
import type { Catalog, PricingRules, QuoteInput } from './types'

const input: QuoteInput = {
  projectId: '11111111-2222-3333-4444-555555555555',
  projectName: 'גג תל אביב',
  address: 'הרצל 1, תל אביב',
  roofType: 'flat',
  usableAreaM2: 120,
  targetKwp: 15,
  inverterBrand: 'SolarEdge',
  includeBattery: false,
  acCableLengthM: 35,
  phases: 3,
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

describe('toPublicQuote', () => {
  it('keeps what the customer needs and drops every internal field', async () => {
    const { catalog, rules } = priced()
    const q = await buildQuote(input, catalog, rules)
    const pq = toPublicQuote(q)
    expect(isPublicQuote(pq)).toBe(true)
    expect(pq.totals.total_incl_vat_ils).toBe(q.totals.total_incl_vat_ils)
    expect(pq.system.module_count).toBe(q.design.module_count)
    expect(pq.sections.map((s) => s.code)).toEqual([...pq.sections.map((s) => s.code)].sort())
    expect(pq.addons).toEqual([])
    expect(pq.totals.system_price_excl_vat_ils).toBe(q.totals.subtotal_excl_vat_ils)
    expect(pq.totals.price_per_kwp_excl_vat_ils).toBe(q.totals.price_per_kwp_excl_vat_ils)
    expect(pq.payment_schedule.reduce((s, m) => s + (m.amount_ils ?? 0), 0)).toBeCloseTo(q.totals.total_incl_vat_ils!, -1)

    const json = JSON.stringify(pq)
    for (const banned of ['unit_price', 'line_total', 'total_ils', 'unit_cost', 'margin', 'fx_rate', 'sku', 'BEE-', 'flags', 'qty_source', 'snapshot_hash', 'needs_owner_input', 'verification', 'catalog_version']) {
      expect(json).not.toContain(banned)
    }
    expect(pq.reference).toBe(q.snapshot_hash.slice(0, 12))
  })

  it('never shows the price of a single piece of equipment — one system price, add-ons priced apart', async () => {
    const { catalog, rules } = priced()
    const battery = catalog.products.find((p) => p.kind === 'battery')!
    battery.customer_addon = true
    const q = await buildQuote({ ...input, includeBattery: true }, catalog, rules)
    const bat = q.lines.find((l) => l.kind === 'battery')!
    expect(bat.addon).toBe(true)
    const pq = toPublicQuote(q)
    expect(pq.addons).toEqual([expect.objectContaining({ name_he: bat.name_he, qty: bat.qty, unit_price_ils: bat.unit_price_ils, line_total_ils: bat.line_total_ils })])
    expect(pq.sections.flatMap((s) => s.lines).some((l) => l.name_he === bat.name_he)).toBe(false)
    for (const l of pq.sections.flatMap((s) => s.lines)) expect(Object.keys(l).sort()).toEqual(expect.not.arrayContaining(['unit_price_ils', 'line_total_ils']))
    expect(pq.totals.system_price_excl_vat_ils! + pq.totals.addons_total_excl_vat_ils).toBeCloseTo(pq.totals.subtotal_excl_vat_ils!, 2)
    expect(pq.totals.price_per_kwp_excl_vat_ils).toBeCloseTo(pq.totals.system_price_excl_vat_ils! / q.design.dc_kwp, 2)
  })

  it('refuses a quote that still has unpriced lines', async () => {
    const q = await buildQuote(input, seedCatalog, seedPricingRules)
    expect(publishBlockers(q).length).toBeGreaterThan(0)
    expect(() => toPublicQuote(q)).toThrow(NotPublishableError)
  })
})

describe('public links', () => {
  it('accepts only https on a real host', () => {
    expect(isPublicBaseUrl('https://app.barak-e.com')).toBe(true)
    expect(isPublicBaseUrl('https://quotes.barak-e.com/')).toBe(true)
    for (const bad of [
      'http://127.0.0.1:50973',
      'https://127.0.0.1',
      'http://localhost:4173',
      'https://localhost',
      'http://app.barak-e.com',
      'https://192.168.1.10',
      'https://10.0.0.5',
      'https://172.20.1.1',
      'https://bee-prod-1',
      'https://pc.local',
      'not a url',
    ]) {
      expect(isPublicBaseUrl(bad), bad).toBe(false)
    }
  })

  it('builds links and tokens', () => {
    const t = newQuoteToken()
    expect(t).toMatch(QUOTE_TOKEN_RE)
    expect(newQuoteToken()).not.toBe(t)
    expect(quoteLink('https://app.barak-e.com/', t)).toBe(`https://app.barak-e.com/q/${t}`)
  })
})
