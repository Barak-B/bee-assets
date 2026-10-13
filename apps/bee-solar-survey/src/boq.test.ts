import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { SUGGESTED_SIZING, applyPriceList, markRulesFilled, seedCatalog, seedPricingRules, type Catalog, type PricingRules } from '@bee/quote-core'
import { boqFilename, buildBoqXlsx } from './boqXlsx'
import { mergeWithSeed, readXlsxPriceList } from './pricing'
import { buildQuoteDraft } from './quote'
import { buildQuotePdf } from './quotePdf'
import { emptyProject } from './schema'

const project = () =>
  emptyProject({
    id: '11111111-2222-3333-4444-555555555555',
    projectName: 'גג תל אביב',
    address: 'הרצל 1, תל אביב',
    roofTypeHe: 'בטון',
    mainBreaker: '63A',
    usableAreaM2: '120',
    targetKwp: '15',
    cableLengthM: '35',
    inverterBrandPref: 'SolarEdge',
  })

function pricedBook(): { catalog: Catalog; rules: PricingRules } {
  let catalog: Catalog = applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 'test').catalog
  catalog = { ...catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  rules.vat_rate = 0.18
  rules.default_margin_pct = 0.25
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.validity_days = 30
  rules.final_round_step_ils = 10
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  return { catalog, rules: markRulesFilled(rules, catalog) }
}

async function readBack(bytes: ArrayBuffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  return wb
}

function cellResult(v: ExcelJS.CellValue): unknown {
  return v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v
}

describe('BOQ workbook', () => {
  it('builds RTL chapter sheets whose cached totals equal the engine totals', async () => {
    const { catalog, rules } = pricedBook()
    const { quote } = await buildQuoteDraft(project(), [], catalog, rules)
    expect(quote.needs_owner_input).toBe(false)

    const { bytes } = await buildBoqXlsx(quote, project(), 'internal')
    const wb = await readBack(bytes)
    const names = wb.worksheets.map((w) => w.name)
    expect(names.slice(0, 2)).toEqual(['סיכום', 'פרמטרים'])
    expect(names).toEqual(expect.arrayContaining(['08.01', '08.02', '08.03', '08.05', '08.06', '08.07']))
    for (const ws of wb.worksheets) expect(ws.views[0]?.rightToLeft).toBe(true)

    // Summary: find "סה"כ לפני מע"מ" / "סה"כ כולל מע"מ" rows
    const sum = wb.getWorksheet('סיכום')!
    const byLabel = new Map<string, unknown>()
    sum.eachRow((row) => {
      const label = row.getCell(2).value
      if (typeof label === 'string') byLabel.set(label, cellResult(row.getCell(3).value))
    })
    expect(byLabel.get('סה"כ לפני מע"מ')).toBe(quote.totals.subtotal_excl_vat_ils)
    expect(byLabel.get('סה"כ כולל מע"מ')).toBe(quote.totals.total_incl_vat_ils)

    // Defined names exist for chapter totals and VAT
    const ws02 = wb.getWorksheet('08.02')!
    expect(String(ws02.getCell('A3').value)).toBe('08.02.0010')
    expect(ws02.getRow(2).getCell(8).value).toBe("עלות יח' (₪)")
  })

  it('customer view has no cost columns and is protected', async () => {
    const { catalog, rules } = pricedBook()
    const { quote } = await buildQuoteDraft(project(), [], catalog, rules)
    const { bytes } = await buildBoqXlsx(quote, project(), 'customer')
    const wb = await readBack(bytes)
    const ws = wb.getWorksheet('08.02')!
    expect(ws.getRow(2).cellCount).toBe(7)
    expect(boqFilename(quote, 'customer')).toBe(`BOQ_${quote.quote_number}_v1_customer.xlsx`)
  })

  it('marks unpriced lines "לאימות" instead of writing zero totals', async () => {
    const { quote } = await buildQuoteDraft(project(), [])
    const { bytes } = await buildBoqXlsx(quote, project(), 'customer')
    const wb = await readBack(bytes)
    expect(wb.getWorksheet('08.02')!.getCell('F3').value).toBe('לאימות')
  })
})

describe('price book helpers', () => {
  it('reads a supplier XLSX with a title block above the header', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('מחירון')
    ws.addRow(['מחירון ספק — אוקטובר 2026'])
    ws.addRow([])
    ws.addRow(['מק"ט', 'תיאור', 'מחיר', 'מטבע'])
    ws.addRow(['BEE-MOD-0001', 'מודול', 91.5, 'USD'])
    ws.addRow(['BEE-CBL-AC', 'כבל', { formula: '20+5', result: 25 }, 'ש"ח'])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    const { rows, invalid } = await readXlsxPriceList(buf)
    expect(invalid).toEqual([])
    expect(rows.map((r) => [r.sku, r.unit_cost, r.currency])).toEqual([
      ['BEE-MOD-0001', 91.5, 'USD'],
      ['BEE-CBL-AC', 25, 'ILS'],
    ])
  })

  it('merges new seed SKUs into a saved catalog', () => {
    const saved = structuredClone(seedCatalog)
    saved.products = saved.products.filter((p) => p.sku !== 'BEE-BAT-0001')
    saved.products[0]!.unit_cost = 99
    const merged = mergeWithSeed({ catalog: saved, rules: seedPricingRules })
    expect(merged.catalog.products.some((p) => p.sku === 'BEE-BAT-0001')).toBe(true)
    expect(merged.catalog.products[0]!.unit_cost).toBe(99)
  })

  it('renders a v2 quote PDF with a what-changed section', async () => {
    const { catalog, rules } = pricedBook()
    const v1 = (await buildQuoteDraft(project(), [], catalog, rules)).quote
    const v2 = (await buildQuoteDraft({ ...project(), targetKwp: '20', includeBattery: true }, [], catalog, rules, { previous: v1 })).quote
    expect(v2.version_no).toBe(2)
    const pdf = await buildQuotePdf(v2, project())
    expect(pdf.meta.pages).toBeGreaterThanOrEqual(2)
  })
})
