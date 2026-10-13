import { canonicalJson, round2, roundToStep, sha256Hex } from './money'
import type {
  Catalog,
  PricingRules,
  Product,
  ProductKind,
  QuoteDesign,
  QuoteInput,
  QuoteLine,
  QuoteTotals,
  QuoteVersion,
  RoofType,
} from './types'

// ──────────────────────────────────────────────────────────────────────────
// Catalog helpers
// ──────────────────────────────────────────────────────────────────────────

function active(catalog: Catalog, kind: ProductKind, subkind?: string): Product[] {
  return catalog.products.filter(
    (p) => p.kind === kind && p.is_active !== false && (subkind === undefined || p.subkind === subkind),
  )
}

function bySku(catalog: Catalog, sku: string | undefined): Product | undefined {
  return sku ? catalog.products.find((p) => p.sku === sku) : undefined
}

// ──────────────────────────────────────────────────────────────────────────
// Sizing (quick mode — no roof layout, no string sizing; that is spec 14 / M4)
// ──────────────────────────────────────────────────────────────────────────

export interface SizingResult {
  design: QuoteDesign
  module: Product | null
  inverter: Product | null
  optimizer: Product | null
  battery: Product | null
  flags: string[]
}

export function sizeSystem(input: QuoteInput, catalog: Catalog, rules: PricingRules): SizingResult {
  const flags: string[] = []
  const s = rules.sizing

  // 1. Module
  const module = bySku(catalog, input.moduleSku) ?? active(catalog, 'module')[0] ?? null
  const moduleW = module?.tech?.p_max_w ?? null
  if (!module) flags.push('catalog:no_module')
  if (module && !moduleW) flags.push(`catalog:module_without_p_max_w:${module.sku}`)

  // 2. Target kWp — explicit target, else area, else consumption, else budget-less fallback
  let kwp: number | null = null
  let basis: QuoteDesign['kwp_basis'] = 'none'
  if (input.targetKwp && input.targetKwp > 0) {
    kwp = input.targetKwp
    basis = 'target'
  } else if (input.usableAreaM2 && s.area_m2_per_kwp) {
    kwp = input.usableAreaM2 / s.area_m2_per_kwp
    basis = 'area'
  } else if (input.annualConsumptionKwh && s.specific_yield_kwh_per_kwp) {
    kwp = input.annualConsumptionKwh / s.specific_yield_kwh_per_kwp
    basis = 'consumption'
  }
  if (kwp === null) flags.push('sizing:no_kwp_basis')

  // 3. Module count
  const moduleCount = kwp !== null && moduleW ? Math.max(1, Math.ceil((kwp * 1000) / moduleW)) : 0
  const dcKwp = moduleW ? round2((moduleCount * moduleW) / 1000) : 0

  // 4. Area sanity
  const areaNeeded = s.area_m2_per_kwp && dcKwp ? round2(dcKwp * s.area_m2_per_kwp) : null
  const areaOk = areaNeeded !== null && input.usableAreaM2 ? input.usableAreaM2 >= areaNeeded : null
  if (areaOk === false) flags.push('sizing:area_insufficient')

  // 5. Inverter — brand preference, phases, smallest unit with ac_kw ≥ dc/ratio; else stack
  const ratio = s.dc_ac_ratio_max ?? 1.2
  const needAcKw = dcKwp / ratio
  let inverterPool = active(catalog, 'inverter')
  if (input.inverterBrand) {
    const branded = inverterPool.filter((p) => p.tech?.brand === input.inverterBrand)
    if (branded.length) inverterPool = branded
    else flags.push(`catalog:no_inverter_for_brand:${input.inverterBrand}`)
  }
  if (input.phases) {
    const phased = inverterPool.filter((p) => !p.tech?.phases || p.tech.phases === input.phases)
    if (phased.length) inverterPool = phased
  }
  let inverter = bySku(catalog, input.inverterSku) ?? null
  let inverterCount = 0
  if (!inverter && inverterPool.length && dcKwp > 0) {
    const sorted = [...inverterPool].sort((a, b) => (a.tech?.ac_power_kw ?? 0) - (b.tech?.ac_power_kw ?? 0))
    inverter = sorted.find((p) => (p.tech?.ac_power_kw ?? 0) >= needAcKw) ?? sorted[sorted.length - 1] ?? null
  }
  if (inverter) {
    const acKw = inverter.tech?.ac_power_kw ?? 0
    inverterCount = acKw > 0 ? Math.max(1, Math.ceil(needAcKw / acKw)) : 1
    if (inverterCount > 1) flags.push('sizing:multiple_inverters')
  } else if (dcKwp > 0) {
    flags.push('catalog:no_inverter')
  }

  // 6. Optimizers (SolarEdge-style)
  let optimizer: Product | null = null
  let optimizerCount = 0
  if (inverter?.tech?.requires_optimizers && moduleCount) {
    optimizer =
      active(catalog, 'optimizer').find((p) => !p.tech?.brand || p.tech.brand === inverter?.tech?.brand) ?? null
    const inputs = optimizer?.tech?.inputs ?? 1
    optimizerCount = Math.ceil(moduleCount / inputs)
    if (!optimizer) flags.push('catalog:no_optimizer')
  }

  // 7. Battery
  let battery: Product | null = null
  if (input.includeBattery) {
    const pool = active(catalog, 'battery')
    battery = pool.find((p) => !p.tech?.brand || p.tech.brand === inverter?.tech?.brand) ?? pool[0] ?? null
    if (!battery) flags.push('catalog:no_battery')
  }

  const perString = s.strings_modules_per_string
  const yieldKwh = s.specific_yield_kwh_per_kwp && dcKwp ? Math.round(dcKwp * s.specific_yield_kwh_per_kwp) : null

  return {
    design: {
      module_sku: module?.sku ?? null,
      module_w: moduleW,
      module_count: moduleCount,
      dc_kwp: dcKwp,
      kwp_basis: basis,
      inverter_sku: inverter?.sku ?? null,
      inverter_ac_kw: inverter?.tech?.ac_power_kw ?? null,
      inverter_count: inverterCount,
      optimizer_count: optimizerCount,
      battery_sku: battery?.sku ?? null,
      strings_estimate: perString && moduleCount ? Math.ceil(moduleCount / perString) : null,
      area_needed_m2: areaNeeded,
      area_ok: areaOk,
      annual_yield_kwh_estimate: yieldKwh,
    },
    module,
    inverter,
    optimizer,
    battery,
    flags,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Assemblies → lines
// ──────────────────────────────────────────────────────────────────────────

interface DraftLine {
  product: Product
  qty: number
  qty_source: QuoteLine['qty_source']
  qty_note_he: string
  /** Sale price override (e.g. labour lookup table) — skips cost×margin. */
  unit_price_ils?: number | null
  flags?: string[]
}

function constructorRequired(roof: RoofType): boolean {
  return roof !== 'ground'
}

export function buildAssemblies(input: QuoteInput, sizing: SizingResult, catalog: Catalog, rules: PricingRules): DraftLine[] {
  const d = sizing.design
  const lines: DraftLine[] = []
  const s = rules.sizing
  const n = d.module_count
  const push = (product: Product | undefined | null, qty: number, note: string, source: QuoteLine['qty_source'] = 'assembly', extra?: Partial<DraftLine>) => {
    if (!product || qty <= 0) return
    lines.push({ product, qty, qty_source: source, qty_note_he: note, ...extra })
  }

  // Main equipment
  push(sizing.module, n, `${n} מודולים ל-${d.dc_kwp} kWp`)
  push(sizing.inverter, d.inverter_count, d.inverter_count > 1 ? `${d.inverter_count} ממירים` : 'ממיר אחד לפי הספק DC/AC')
  push(sizing.optimizer, d.optimizer_count, `${d.optimizer_count} אופטימייזרים ל-${n} מודולים`)
  push(sizing.battery, 1, 'לפי בקשת הלקוח בסקר')

  // Mounting by roof type
  const mounting = active(catalog, 'mounting').find((p) => p.tech?.roof_types?.includes(input.roofType))
  if (mounting) {
    const per = mounting.tech?.per_module_qty ?? 1
    push(mounting, Math.ceil(n * per), `${n} מודולים × ${per}`)
  } else if (n) {
    lines.push(...[]) // keep order
  }

  // Cables
  const dcCable = active(catalog, 'cable', 'dc_solar')[0]
  if (dcCable && s.dc_cable_m_per_module) {
    const m = Math.ceil(n * s.dc_cable_m_per_module)
    push(dcCable, m, `${n} מודולים × ${s.dc_cable_m_per_module} מ׳`, 'rule')
  }
  const acCable = active(catalog, 'cable', 'ac_power')[0]
  const acLen = input.acCableLengthM ?? s.default_ac_cable_m
  if (acCable && acLen) {
    push(acCable, Math.ceil(acLen * 1.1), input.acCableLengthM ? `אורך מהסקר ${input.acCableLengthM} מ׳ + 10%` : `ברירת מחדל ${acLen} מ׳ + 10%`, input.acCableLengthM ? 'input' : 'rule')
  }

  // Protection / cabinets — one AC protection set and one DC box per inverter
  push(active(catalog, 'cabinet', 'ac_box')[0], d.inverter_count, 'סט הגנות AC לכל ממיר', 'rule')
  push(active(catalog, 'cabinet', 'dc_box')[0], d.inverter_count, 'קופסת DC לכל ממיר', 'rule')
  push(active(catalog, 'accessory', 'earthing_set')[0], d.inverter_count ? 1 : 0, 'סט הארקות למערך', 'rule')
  push(active(catalog, 'meter', 'production')[0], d.inverter_count ? 1 : 0, 'הכנה למונה ייצור', 'rule')

  // Labour
  const labourModules = active(catalog, 'labour', 'install_modules')[0]
  if (labourModules && n) {
    const price = rules.labour_per_module_ils[input.roofType] ?? null
    push(labourModules, n, `${n} מודולים · גג ${input.roofType}`, 'rule', {
      unit_price_ils: price,
      flags: price === null ? ['pricing:labour_per_module_missing'] : [],
    })
  }
  push(active(catalog, 'labour', 'install_inverter_boards')[0], d.inverter_count, 'התקנת ממיר ולוחות', 'rule')
  const craneNeeded = input.roofType !== 'ground' && input.craneAccess !== false
  push(active(catalog, 'labour', 'crane')[0], craneNeeded ? 1 : 0, 'יום מנוף (ניתן להסרה אם יש גישה)', 'rule')

  // Services
  push(active(catalog, 'service', 'design')[0], 1, 'תכנון חשמלי ע״י מהנדס', 'rule')
  push(active(catalog, 'service', 'constructor')[0], constructorRequired(input.roofType) ? 1 : 0, 'אישור קונסטרוקטור לגג', 'rule')
  push(active(catalog, 'service', 'inspector')[0], 1, 'בודק מוסמך', 'rule')
  push(active(catalog, 'service', 'iec_followup')[0], 1, 'הגשה וליווי מול חח״י', 'rule')

  // Fees (passthrough)
  for (const fee of active(catalog, 'fee')) push(fee, 1, 'לפי חשבון חח״י בפועל', 'rule')

  return lines
}

// ──────────────────────────────────────────────────────────────────────────
// Pricing
// ──────────────────────────────────────────────────────────────────────────

function costInIls(p: Product, catalog: Catalog): { cost: number | null; fx: number | null; flags: string[] } {
  if (p.unit_cost === null || p.unit_cost === undefined) return { cost: null, fx: null, flags: ['pricing:cost_missing'] }
  if (p.currency === 'ILS') return { cost: p.unit_cost, fx: null, flags: [] }
  const fx = catalog.fx_rates[p.currency]
  if (!fx) return { cost: null, fx: null, flags: [`pricing:fx_missing:${p.currency}`] }
  return { cost: round2(p.unit_cost * fx), fx, flags: [] }
}

export function priceLines(drafts: DraftLine[], catalog: Catalog, rules: PricingRules): QuoteLine[] {
  return drafts.map((d, i) => {
    const p = d.product
    const flags = [...(d.flags ?? [])]
    const passthrough = p.kind === 'fee' && (p.tech?.passthrough ?? true)
    const { cost, fx, flags: costFlags } = costInIls(p, catalog)
    flags.push(...costFlags)

    let margin: number | null = null
    let unitPrice: number | null
    if (d.unit_price_ils !== undefined) {
      unitPrice = d.unit_price_ils
    } else if (passthrough) {
      unitPrice = cost
      margin = 0
    } else if (cost === null) {
      unitPrice = null
    } else {
      margin = rules.margins[p.kind] ?? rules.default_margin_pct
      if (margin === null) {
        flags.push('pricing:margin_missing')
        unitPrice = null
      } else {
        unitPrice = round2(cost * (1 + margin))
      }
    }
    if (p.needs_owner_input) flags.push('catalog:needs_owner_input')
    if (p.verification === 'unverified') flags.push('verification:unverified')

    return {
      line_no: i + 1,
      sku: p.sku,
      kind: p.kind,
      name_he: p.name_he,
      description_he: p.description_he,
      unit: p.unit,
      qty: d.qty,
      qty_source: d.qty_source,
      qty_note_he: d.qty_note_he,
      unit_cost_ils: cost,
      cost_currency: p.currency,
      fx_rate: fx,
      margin_pct: margin,
      unit_price_ils: unitPrice,
      line_total_ils: unitPrice === null ? null : round2(unitPrice * d.qty),
      passthrough,
      verification: p.verification,
      needs_owner_input: unitPrice === null || !!p.needs_owner_input,
      flags,
      boq_section: p.boq_section,
    }
  })
}

export function computeTotals(lines: QuoteLine[], rules: PricingRules, dcKwp: number): QuoteTotals {
  const priced = lines.filter((l) => !l.passthrough && l.line_total_ils !== null)
  const unpriced = lines.filter((l) => !l.passthrough && l.line_total_ils === null).length
  const rawSubtotal = priced.reduce((s, l) => s + (l.line_total_ils ?? 0), 0)
  const subtotal = priced.length ? roundToStep(rawSubtotal, rules.final_round_step_ils) : null
  const vat = subtotal !== null && rules.vat_rate !== null ? round2(subtotal * rules.vat_rate) : null
  const total = subtotal !== null && vat !== null ? round2(subtotal + vat) : null
  const passthroughEstimate = lines.filter((l) => l.passthrough && l.line_total_ils !== null).reduce((s, l) => s + (l.line_total_ils ?? 0), 0)
  return {
    subtotal_excl_vat_ils: subtotal,
    vat_rate: rules.vat_rate,
    vat_ils: vat,
    total_incl_vat_ils: total,
    passthrough_estimate_ils: lines.some((l) => l.passthrough && l.line_total_ils !== null) ? round2(passthroughEstimate) : null,
    price_per_kwp_excl_vat_ils: subtotal !== null && dcKwp > 0 ? round2(subtotal / dcKwp) : null,
    unpriced_lines: unpriced,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Quote
// ──────────────────────────────────────────────────────────────────────────

export interface BuildQuoteOptions {
  now?: Date
  quoteNumber?: string
}

export function quoteNumberFor(projectId: string, now: Date): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `Q-${y}${m}-${projectId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export async function buildQuote(
  input: QuoteInput,
  catalog: Catalog,
  rules: PricingRules,
  opts: BuildQuoteOptions = {},
): Promise<QuoteVersion> {
  const now = opts.now ?? new Date()
  const sizing = sizeSystem(input, catalog, rules)
  const drafts = buildAssemblies(input, sizing, catalog, rules)
  const lines = priceLines(drafts, catalog, rules)
  const totals = computeTotals(lines, rules, sizing.design.dc_kwp)

  const flags = [...sizing.flags]
  if (rules.vat_rate === null) flags.push('rules:vat_missing')
  if (rules.needs_owner_input) flags.push('rules:needs_owner_input')
  if (totals.unpriced_lines) flags.push(`pricing:unpriced_lines:${totals.unpriced_lines}`)
  if (input.budgetIls && totals.total_incl_vat_ils && totals.total_incl_vat_ils > input.budgetIls) flags.push('budget:exceeded')
  const hasFx = lines.some((l) => l.cost_currency !== 'ILS')

  const validUntil = rules.validity_days ? new Date(now.getTime() + rules.validity_days * 86_400_000).toISOString().slice(0, 10) : null
  const terms: QuoteVersion['terms'] = {
    validity_days: rules.validity_days,
    valid_until: validUntil,
    linkage: hasFx ? 'fx' : 'none',
    payment_schedule: rules.payment_schedule,
  }

  const body = { input, design: sizing.design, lines, totals, terms, catalog_version: catalog.version, rules_version: rules.version }
  const snapshot_hash = await sha256Hex(canonicalJson(body))

  return {
    quote_number: opts.quoteNumber ?? quoteNumberFor(input.projectId, now),
    version_no: 1,
    status: 'draft',
    created_at: now.toISOString(),
    ...body,
    flags,
    needs_owner_input: flags.length > 0 || lines.some((l) => l.needs_owner_input),
    snapshot_hash,
    trust: {
      law2: 'Human picks — no customer auto-send',
      requiresHumanPick: true,
      destinationClass: 'drafts_group',
    },
  }
}
