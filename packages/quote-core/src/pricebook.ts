/**
 * Price book maintenance: readiness check, supplier price-list import (CSV),
 * template export and suggested sizing defaults. Pure functions — the app
 * stores the result; nothing here touches the network.
 */
import { roiReadiness } from './roi'
import type { Catalog, Currency, PricingRules, Product, ProductKind, RoofType } from './types'

// ──────────────────────────────────────────────────────────────────────────
// BOQ chapters (docs/plan/templates/boq-xlsx-layout.md §2)
// ──────────────────────────────────────────────────────────────────────────

export const BOQ_SECTIONS: { code: string; title_he: string }[] = [
  { code: '08.01', title_he: 'מקדמות ותכנון' },
  { code: '08.02', title_he: 'מודולים ואלקטרוניקה' },
  { code: '08.03', title_he: 'קונסטרוקציה' },
  { code: '08.04', title_he: 'חשמל DC ותשתית גג' },
  { code: '08.05', title_he: 'חשמל AC, לוחות והארקה' },
  { code: '08.06', title_he: 'עבודות התקנה' },
  { code: '08.07', title_he: 'בדיקות, אישורים והפעלה' },
  { code: '08.08', title_he: 'שונות ואופציות' },
]

export function boqSectionTitle(code: string | undefined): string {
  return BOQ_SECTIONS.find((s) => s.code === code)?.title_he ?? 'שונות ואופציות'
}

// ──────────────────────────────────────────────────────────────────────────
// Readiness
// ──────────────────────────────────────────────────────────────────────────

export const ROOF_LABELS_HE: Record<RoofType, string> = {
  flat: 'בטון שטוח',
  tile: 'רעפים',
  'metal-standing-seam': 'פנל מבודד',
  'metal-trapezoidal': 'איסכורית',
  ground: 'קרקע',
  other: 'אחר',
}

export const KIND_LABELS_HE: Record<ProductKind, string> = {
  module: 'מודולים',
  inverter: 'ממירים',
  optimizer: 'אופטימייזרים',
  battery: 'סוללות',
  breaker: 'הגנות',
  meter: 'מונה',
  cable: 'כבלים',
  tray: 'תעלות',
  cabinet: 'לוחות',
  mounting: 'קונסטרוקציה',
  accessory: 'אביזרים',
  labour: 'עבודה',
  service: 'שירותים',
  fee: 'אגרות',
}

export interface ReadinessItem {
  key: string
  label_he: string
}

export interface PricingReadiness {
  ready: boolean
  missing: ReadinessItem[]
  /** Not blocking: without these the quote goes out without the matching section (e.g. savings estimate). */
  recommended: ReadinessItem[]
  pricedCount: number
  totalCount: number
  unpricedSkus: string[]
}

// 'other' included: a survey without a roof type quotes as 'other' and needs a labour price too.
const REQUIRED_ROOFS: RoofType[] = ['flat', 'tile', 'metal-standing-seam', 'metal-trapezoidal', 'ground', 'other']

/**
 * What still blocks a real (non-"לאימות") quote. Labour sold from the per-roof
 * table (install_modules) does not need a cost; fees are passthrough and only
 * need a cost if Barak wants an estimate, so they never block.
 */
export function pricingReadiness(catalog: Catalog, rules: PricingRules): PricingReadiness {
  const missing: ReadinessItem[] = []
  const products = catalog.products.filter((p) => p.is_active !== false)
  const needsCost = (p: Product) => p.kind !== 'fee' && !(p.kind === 'labour' && p.subkind === 'install_modules')
  const unpriced = products.filter((p) => needsCost(p) && (p.unit_cost === null || p.unit_cost === undefined))
  const priced = products.filter((p) => needsCost(p)).length - unpriced.length

  if (unpriced.length) missing.push({ key: 'catalog.costs', label_he: `${unpriced.length} פריטים ללא מחיר עלות` })

  const currencies = new Set(products.filter((p) => p.unit_cost !== null).map((p) => p.currency))
  for (const c of ['USD', 'EUR'] as const) {
    if (currencies.has(c) && !catalog.fx_rates[c]) missing.push({ key: `fx.${c}`, label_he: `שער ${c}` })
  }

  if (rules.vat_rate === null) missing.push({ key: 'rules.vat_rate', label_he: 'שיעור מע״מ' })

  const kinds = new Set(products.filter((p) => needsCost(p)).map((p) => p.kind))
  if (rules.default_margin_pct === null) {
    const noMargin = [...kinds].filter((k) => rules.margins[k] === null || rules.margins[k] === undefined)
    if (noMargin.length) {
      missing.push({ key: 'rules.margins', label_he: `מרווח ל: ${noMargin.map((k) => KIND_LABELS_HE[k]).join(', ')}` })
    }
  }

  const noLabour = REQUIRED_ROOFS.filter((r) => rules.labour_per_module_ils[r] === null || rules.labour_per_module_ils[r] === undefined)
  if (noLabour.length) {
    missing.push({ key: 'rules.labour', label_he: `מחיר עבודה למודול: ${noLabour.map((r) => ROOF_LABELS_HE[r]).join(', ')}` })
  }

  if (rules.validity_days === null) missing.push({ key: 'rules.validity_days', label_he: 'תוקף הצעה (ימים)' })

  const pcts = rules.payment_schedule.map((m) => m.pct)
  if (pcts.some((p) => p === null)) missing.push({ key: 'rules.payment_schedule', label_he: 'אחוזי לוח תשלומים' })
  else {
    const sum = pcts.reduce<number>((s, p) => s + (p ?? 0), 0)
    if (Math.abs(sum - 100) > 0.01) missing.push({ key: 'rules.payment_schedule_sum', label_he: `לוח התשלומים מסתכם ל-${sum}% ולא 100%` })
  }

  const s = rules.sizing
  if (s.area_m2_per_kwp === null || s.specific_yield_kwh_per_kwp === null || s.dc_ac_ratio_max === null) {
    missing.push({ key: 'rules.sizing', label_he: 'פרמטרי תכנון (שטח ל-kWp, תפוקה סגולית, יחס DC/AC)' })
  }

  return {
    ready: missing.length === 0,
    missing,
    recommended: [
      ...(rules.texts?.warranty?.some((x) => x.trim()) ? [] : [{ key: 'texts.warranty', label_he: 'נוסח אחריות (יופיע בהצעה)' }]),
      ...(rules.texts?.excluded?.some((x) => x.trim()) ? [] : [{ key: 'texts.excluded', label_he: 'רשימת "לא כלול" (אחרת תופיע רשימת ברירת מחדל קצרה)' }]),
      ...roiReadiness(rules.roi, s.specific_yield_kwh_per_kwp),
    ],
    pricedCount: priced,
    totalCount: products.filter((p) => needsCost(p)).length,
    unpricedSkus: unpriced.map((p) => p.sku),
  }
}

/**
 * Rough engineering starting points for Israel. Offered in the UI as a
 * one-click fill, always stored as `unverified` until calibrated against real jobs.
 */
export const SUGGESTED_SIZING: PricingRules['sizing'] = {
  area_m2_per_kwp: 6.5,
  specific_yield_kwh_per_kwp: 1650,
  dc_ac_ratio_max: 1.2,
  dc_cable_m_per_module: 2.5,
  default_ac_cable_m: 25,
  strings_modules_per_string: 14,
}

// ──────────────────────────────────────────────────────────────────────────
// Price-list import (CSV / rows from XLSX)
// ──────────────────────────────────────────────────────────────────────────

export interface PriceRow {
  sku: string
  unit_cost: number | null
  currency?: Currency
  /** 1-based source row, for error messages. */
  row?: number
}

/** Price changes above this percentage are highlighted for review (spec 12 §1.5.4 price_jump_alert_pct). */
export const PRICE_JUMP_ALERT_PCT = 15

/** One cost change the import would make — shown for approval before anything is saved. */
export interface PriceChange {
  sku: string
  name_he: string
  /** `new` = had no cost before; `changed` = cost or currency changed. */
  type: 'new' | 'changed'
  before: { unit_cost: number | null; currency: Currency }
  after: { unit_cost: number; currency: Currency }
  /** Relative change in %, when comparable (same currency, both known). */
  pct: number | null
  /** Above PRICE_JUMP_ALERT_PCT, or the currency changed. */
  alert: boolean
}

export interface ApplyResult {
  catalog: Catalog
  applied: number
  unchanged: number
  unknownSkus: string[]
  invalid: { row: number; reason: string }[]
  /** Every change, alerts first, then by size of change. */
  changes: PriceChange[]
  /** Active, already-priced items the file did not mention (their cost stays as is). */
  notInFile: string[]
}

const SKU_HEADERS = ['sku', 'מקט', 'מק"ט', 'מק״ט', 'קוד', 'code', 'item']
const COST_HEADERS = ['unit_cost', 'cost', 'price', 'net_price', 'עלות', 'מחיר', 'מחיר נטו', 'מחיר יחידה', 'עלות יחידה']
const CURRENCY_HEADERS = ['currency', 'מטבע', 'cur']

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/[‏‎﻿]/g, '').replace(/\s+/g, ' ')
}

export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const t = String(raw).replace(/[₪$€\s]/g, '').replace(/[‏‎]/g, '')
  if (!t) return null
  // Locale-tolerant: "1,234.50" and "1.234,50" (EU suppliers) → 1234.5 ; "12,5" → 12.5 ;
  // "1,234" / "1.234.567" → thousands. A lone "1.234" stays a decimal (English convention).
  const lastDot = t.lastIndexOf('.')
  const lastComma = t.lastIndexOf(',')
  let cleaned: string
  if (lastDot >= 0 && lastComma >= 0) cleaned = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (lastComma >= 0) cleaned = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.split(',').length === 2 ? t.replace(',', '.') : t.replace(/,/g, '')
  else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(t)) cleaned = t.replace(/\./g, '')
  else cleaned = t
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseCurrency(raw: unknown): Currency | undefined {
  const t = String(raw ?? '').trim().toUpperCase()
  if (!t) return undefined
  if (t === 'ILS' || t === 'NIS' || t === '₪' || t === 'ש"ח' || t === 'ש״ח' || t === 'שח') return 'ILS'
  if (t === 'USD' || t === '$' || t === 'דולר') return 'USD'
  if (t === 'EUR' || t === '€' || t === 'יורו') return 'EUR'
  return undefined
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"' && cur === '') q = true // quotes only open a field (RFC 4180); מק"ט stays literal
    else if (ch === delim) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** Find the header row and column indexes in a table of cells. */
export function rowsFromTable(table: unknown[][]): { rows: PriceRow[]; invalid: { row: number; reason: string }[] } {
  const invalid: { row: number; reason: string }[] = []
  let headerIdx = -1
  let skuCol = -1
  let costCol = -1
  let curCol = -1
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const cells = (table[r] ?? []).map((c) => norm(String(c ?? '')))
    const s = cells.findIndex((c) => SKU_HEADERS.includes(c))
    const c = cells.findIndex((c2) => COST_HEADERS.includes(c2))
    if (s >= 0 && c >= 0) {
      headerIdx = r
      skuCol = s
      costCol = c
      curCol = cells.findIndex((c3) => CURRENCY_HEADERS.includes(c3))
      break
    }
  }
  if (headerIdx < 0) {
    invalid.push({ row: 1, reason: 'לא נמצאה שורת כותרת עם עמודות מק״ט ועלות (sku, unit_cost)' })
    return { rows: [], invalid }
  }
  const rows: PriceRow[] = []
  for (let r = headerIdx + 1; r < table.length; r++) {
    const cells = table[r] ?? []
    const sku = String(cells[skuCol] ?? '').trim()
    if (!sku) continue
    const rawCost = cells[costCol]
    const cost = parseNumber(rawCost)
    if (cost === null && String(rawCost ?? '').trim() !== '') {
      invalid.push({ row: r + 1, reason: `עלות לא מספרית: "${String(rawCost)}"` })
      continue
    }
    if (cost !== null && cost < 0) {
      invalid.push({ row: r + 1, reason: 'עלות שלילית' })
      continue
    }
    const currency = curCol >= 0 ? parseCurrency(cells[curCol]) : undefined
    if (curCol >= 0 && String(cells[curCol] ?? '').trim() && !currency) {
      invalid.push({ row: r + 1, reason: `מטבע לא מוכר: "${String(cells[curCol])}"` })
      continue
    }
    rows.push({ sku, unit_cost: cost, currency, row: r + 1 })
  }
  return { rows, invalid }
}

export function parsePriceListCsv(text: string): { rows: PriceRow[]; invalid: { row: number; reason: string }[] } {
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return { rows: [], invalid: [{ row: 1, reason: 'הקובץ ריק' }] }
  const first = lines[0]!
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0]!
  return rowsFromTable(lines.map((l) => splitCsvLine(l, delim)))
}

export function applyPriceList(catalog: Catalog, rows: PriceRow[], source: string, today = new Date().toISOString().slice(0, 10)): ApplyResult {
  const next: Catalog = structuredClone(catalog)
  const bySku = new Map(next.products.map((p) => [p.sku.toUpperCase(), p]))
  const unknownSkus: string[] = []
  const invalid: { row: number; reason: string }[] = []
  let applied = 0
  let unchanged = 0
  const changes: PriceChange[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    seen.add(r.sku.toUpperCase())
    const p = bySku.get(r.sku.toUpperCase())
    if (!p) {
      unknownSkus.push(r.sku)
      continue
    }
    if (r.unit_cost === null) continue
    const currency = r.currency ?? p.currency
    if (p.unit_cost === r.unit_cost && p.currency === currency) {
      unchanged++
      continue
    }
    const before = { unit_cost: p.unit_cost ?? null, currency: p.currency }
    const pct = before.unit_cost && before.currency === currency ? Math.round(((r.unit_cost - before.unit_cost) / before.unit_cost) * 1000) / 10 : null
    changes.push({
      sku: p.sku,
      name_he: p.name_he,
      type: before.unit_cost === null ? 'new' : 'changed',
      before,
      after: { unit_cost: r.unit_cost, currency },
      pct,
      alert: before.unit_cost !== null && (before.currency !== currency || (pct !== null && Math.abs(pct) > PRICE_JUMP_ALERT_PCT)),
    })
    p.unit_cost = r.unit_cost
    p.currency = currency
    p.cost_source = `${source} · ${today}`
    p.needs_owner_input = false
    if (p.verification === 'unverified') p.verification = 'office'
    applied++
  }
  next.updated_at = today
  changes.sort((a, b) => Number(b.alert) - Number(a.alert) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))
  const notInFile = catalog.products.filter((p) => p.is_active !== false && p.unit_cost !== null && p.unit_cost !== undefined && !seen.has(p.sku.toUpperCase())).map((p) => p.sku)
  return { catalog: next, applied, unchanged, unknownSkus, invalid, changes, notInFile }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV the supplier/Barak can fill and re-import (UTF-8 BOM so Excel opens Hebrew correctly). */
export function priceListTemplateCsv(catalog: Catalog): string {
  const header = ['sku', 'name_he', 'kind', 'unit', 'currency', 'unit_cost', 'cost_source']
  const lines = catalog.products.map((p) =>
    [p.sku, p.name_he, p.kind, p.unit, p.currency, p.unit_cost ?? '', p.cost_source ?? ''].map(csvCell).join(','),
  )
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n'
}

/** Rules are "owner-filled" once nothing in readiness points at them. */
export function markRulesFilled(rules: PricingRules, catalog: Catalog): PricingRules {
  const r = structuredClone(rules)
  const rd = pricingReadiness(catalog, r)
  const rulesMissing = rd.missing.filter((m) => m.key.startsWith('rules.'))
  r.needs_owner_input = rulesMissing.length > 0
  if (!r.needs_owner_input && r.verification === 'unverified') r.verification = 'office'
  return r
}
