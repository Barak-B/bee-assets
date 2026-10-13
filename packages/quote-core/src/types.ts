/**
 * quote-lite data model — a deliberately small subset of
 * `docs/plan/specs/12-cpq-documents-spec.md` (Product / PricingRule / QuoteVersion)
 * that can run in the browser today and move into `bee-live` `modules/quotes`
 * later without changing shape.
 *
 * Principles kept from the spec:
 *  - every number carries a source and a verification level;
 *  - a QuoteVersion is an immutable snapshot (prices, rules, catalog version, hash);
 *  - nothing here sends anything — the output is a draft for a human to pick (Law #2).
 */

export type RoofType = 'flat' | 'tile' | 'metal-standing-seam' | 'metal-trapezoidal' | 'ground' | 'other'

export type ProductKind =
  | 'module'
  | 'inverter'
  | 'optimizer'
  | 'battery'
  | 'breaker'
  | 'meter'
  | 'cable'
  | 'tray'
  | 'cabinet'
  | 'mounting'
  | 'accessory'
  | 'labour'
  | 'service'
  | 'fee'

export type Unit = 'unit' | 'm' | 'm2' | 'set' | 'komplet' | 'day' | 'hour' | 'kwp' | 'kwh' | 'year' | 'piece_3m'

export type Verification = 'unverified' | 'summary' | 'office' | 'validated'

export type Currency = 'ILS' | 'USD' | 'EUR'

export type InverterBrand = 'SolarEdge' | 'KStar' | 'ABB' | 'Deye' | 'Huawei' | 'Sungrow' | 'other'

/** Technical fields the engine actually reads. Anything else lives in `extra`. */
export interface ProductTech {
  // module
  p_max_w?: number
  // inverter
  brand?: InverterBrand
  phases?: 1 | 3
  ac_power_kw?: number
  requires_optimizers?: boolean
  // optimizer
  inputs?: 1 | 2
  // battery
  usable_kwh?: number
  // mounting
  roof_types?: RoofType[]
  per_module_qty?: number
  // fee
  passthrough?: boolean
  // labour
  basis?: 'module' | 'kwp' | 'day' | 'hour' | 'komplet' | 'inverter'
  extra?: Record<string, unknown>
}

export interface Product {
  sku: string
  kind: ProductKind
  subkind?: string
  name_he: string
  description_he?: string
  manufacturer?: string
  model?: string
  unit: Unit
  /** Net cost per unit in `currency`. `null` = unknown → line is flagged `needs_owner_input`. */
  unit_cost: number | null
  currency: Currency
  cost_source?: string
  verification: Verification
  needs_owner_input?: boolean
  boq_section?: string
  tech?: ProductTech
  is_active?: boolean
}

export interface Catalog {
  version: string
  updated_at: string
  /** ILS per 1 unit of foreign currency on the day of the quote. `null` → FX lines flagged. */
  fx_rates: { USD: number | null; EUR: number | null; source?: string; as_of?: string | null }
  products: Product[]
}

export interface PaymentMilestone {
  milestone_key: string
  label_he: string
  /** Percentage of total incl. VAT; `null` = owner must decide. */
  pct: number | null
}

/** Flat pricing parameters — the subset of `docs/plan/rules/pricing-rules.json` the lite engine uses. */
export interface PricingRules {
  version: string
  /** 0.18 for 18%; `null` → VAT shown as "לאימות". */
  vat_rate: number | null
  /** Margin on cost, per product kind, as a fraction (0.25 = 25%). `null` → default_margin_pct. */
  margins: Partial<Record<ProductKind, number | null>>
  default_margin_pct: number | null
  /** Labour price per module by roof type (sale price, ILS). */
  labour_per_module_ils: Partial<Record<RoofType, number | null>>
  /** Sizing parameters (placeholders until calibrated — see README). */
  sizing: {
    area_m2_per_kwp: number | null
    specific_yield_kwh_per_kwp: number | null
    dc_ac_ratio_max: number | null
    dc_cable_m_per_module: number | null
    default_ac_cable_m: number | null
    strings_modules_per_string: number | null
  }
  validity_days: number | null
  /** Round the final total (excl. VAT) to this step, e.g. 100 ₪. `null` = no rounding. */
  final_round_step_ils: number | null
  payment_schedule: PaymentMilestone[]
  verification: Verification
  needs_owner_input: boolean
}

export interface QuoteInput {
  projectId: string
  projectName: string
  customerName?: string
  address: string
  roofType: RoofType
  usableAreaM2: number | null
  /** Target DC size; when null the engine derives it from area / consumption. */
  targetKwp: number | null
  budgetIls?: number | null
  annualConsumptionKwh?: number | null
  inverterBrand?: InverterBrand | ''
  includeBattery: boolean
  acCableLengthM: number | null
  mainBreaker?: string
  phases?: 1 | 3
  craneAccess?: boolean | null
  /** Optional overrides (e.g. from a manual pick in the UI). */
  moduleSku?: string
  inverterSku?: string
}

export type QtySource = 'assembly' | 'rule' | 'manual' | 'input'

export interface QuoteLine {
  line_no: number
  sku: string
  kind: ProductKind
  name_he: string
  description_he?: string
  unit: Unit
  qty: number
  qty_source: QtySource
  /** Human-readable reason for the quantity, e.g. "23 מודולים × 1 יח׳". */
  qty_note_he: string
  unit_cost_ils: number | null
  cost_currency: Currency
  fx_rate: number | null
  margin_pct: number | null
  unit_price_ils: number | null
  line_total_ils: number | null
  passthrough: boolean
  verification: Verification
  needs_owner_input: boolean
  flags: string[]
  boq_section?: string
}

export interface QuoteDesign {
  module_sku: string | null
  module_w: number | null
  module_count: number
  dc_kwp: number
  kwp_basis: 'target' | 'area' | 'consumption' | 'budget' | 'none'
  inverter_sku: string | null
  inverter_ac_kw: number | null
  inverter_count: number
  optimizer_count: number
  battery_sku: string | null
  strings_estimate: number | null
  area_needed_m2: number | null
  /** null when usable area unknown */
  area_ok: boolean | null
  annual_yield_kwh_estimate: number | null
}

export interface QuoteTotals {
  subtotal_excl_vat_ils: number | null
  vat_rate: number | null
  vat_ils: number | null
  total_incl_vat_ils: number | null
  passthrough_estimate_ils: number | null
  price_per_kwp_excl_vat_ils: number | null
  /** Lines whose price is unknown; the totals exclude them. */
  unpriced_lines: number
}

export interface QuoteVersion {
  quote_number: string
  version_no: 1
  status: 'draft'
  created_at: string
  input: QuoteInput
  design: QuoteDesign
  lines: QuoteLine[]
  totals: QuoteTotals
  terms: {
    validity_days: number | null
    valid_until: string | null
    linkage: 'none' | 'fx'
    payment_schedule: PaymentMilestone[]
  }
  flags: string[]
  needs_owner_input: boolean
  catalog_version: string
  rules_version: string
  /** sha256 (hex) of the canonical JSON of input+design+lines+totals+terms. */
  snapshot_hash: string
  trust: {
    law2: 'Human picks — no customer auto-send'
    requiresHumanPick: true
    destinationClass: 'drafts_group'
  }
}
