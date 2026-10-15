/**
 * The price book the app actually quotes from: whatever Barak saved in the
 * pricing screen (IndexedDB), else the seed. New seed SKUs are merged in so a
 * saved catalog never hides products added in a later release.
 */
import {
  applyPriceList,
  markRulesFilled,
  parsePriceListCsv,
  rowsFromTable,
  seedCatalog,
  seedPricingRules,
  type ApplyResult,
  type Catalog,
  type PriceRow,
  type PricingRules,
} from '@bee/quote-core'
import { getPricing, savePricing, type StoredPricing } from './db'

export interface Pricing {
  catalog: Catalog
  rules: PricingRules
  /** true when nothing was saved yet (pure seed). */
  isSeed: boolean
  updatedAt?: string
}

export function mergeWithSeed(stored: StoredPricing): Pricing {
  const catalog: Catalog = structuredClone(stored.catalog)
  const known = new Set(catalog.products.map((p) => p.sku))
  for (const p of seedCatalog.products) if (!known.has(p.sku)) catalog.products.push(structuredClone(p))
  const rules: PricingRules = { ...structuredClone(seedPricingRules), ...structuredClone(stored.rules) }
  rules.sizing = { ...seedPricingRules.sizing, ...stored.rules.sizing }
  rules.margins = { ...seedPricingRules.margins, ...stored.rules.margins }
  rules.labour_per_module_ils = { ...seedPricingRules.labour_per_module_ils, ...stored.rules.labour_per_module_ils }
  // Price books saved before the savings estimate existed get the (empty) ROI block.
  rules.roi = { ...structuredClone(seedPricingRules.roi!), ...(stored.rules.roi ?? {}) }
  return { catalog, rules, isSeed: false, updatedAt: stored.updatedAt }
}

export async function loadPricing(): Promise<Pricing> {
  const stored = await getPricing()
  if (!stored) return { catalog: structuredClone(seedCatalog), rules: structuredClone(seedPricingRules), isSeed: true }
  return mergeWithSeed(stored)
}

export async function persistPricing(catalog: Catalog, rules: PricingRules): Promise<Pricing> {
  const finalRules = markRulesFilled(rules, catalog)
  await savePricing({ catalog, rules: finalRules })
  return { catalog, rules: finalRules, isSeed: false, updatedAt: new Date().toISOString() }
}

/** Turn an ExcelJS cell value (rich text, formula, hyperlink, date…) into a plain value. */
export function cellToPlain(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object') return v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const o = v as Record<string, unknown>
  if ('result' in o) return cellToPlain(o.result)
  if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('')
  if ('text' in o) return o.text
  return null
}

/** Read the first worksheet that contains a price header from an XLSX file. */
export async function readXlsxPriceList(buf: ArrayBuffer): Promise<{ rows: PriceRow[]; invalid: { row: number; reason: string }[] }> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  let last: { rows: PriceRow[]; invalid: { row: number; reason: string }[] } = {
    rows: [],
    invalid: [{ row: 1, reason: 'לא נמצא גיליון' }],
  }
  for (const ws of wb.worksheets) {
    const table: unknown[][] = []
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = row.values as unknown[] // 1-based
      table[rowNumber - 1] = values.slice(1).map(cellToPlain)
    })
    for (let i = 0; i < table.length; i++) table[i] ??= []
    const res = rowsFromTable(table)
    if (res.rows.length) return res
    last = res
  }
  return last
}

export async function importPriceListFile(file: File, catalog: Catalog): Promise<ApplyResult> {
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')
  const parsed = isXlsx ? await readXlsxPriceList(await file.arrayBuffer()) : parsePriceListCsv(await file.text())
  const res = applyPriceList(catalog, parsed.rows, `מחירון ${file.name}`)
  return { ...res, invalid: [...parsed.invalid, ...res.invalid] }
}
