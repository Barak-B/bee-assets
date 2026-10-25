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
  /**
   * An add-on the customer sees with its own price (e.g. a battery upgrade, an
   * EV charger). Everything else is folded into one system price: the
   * customer never sees what a single piece of equipment costs.
   */
  customer_addon?: boolean
}

export interface Catalog {
  version: string
  updated_at: string
  /** ILS per 1 unit of foreign currency on the day of the quote. `null` → FX lines flagged. */
  fx_rates: { USD: number | null; EUR: number | null; source?: string; as_of?: string | null }
  products: Product[]
}

export type CustomerType = 'private' | 'business'

/** Spec 12 §5.1 regulatory/tariff track, simplified. */
export type TariffTrack = 'net_metering' | 'self_consumption' | 'feed_in_full'

/** ROI parameters (spec 12 §5.4). All `null` until Barak fills them — nothing is hard-coded. */
export interface RoiRules {
  track: TariffTrack | null
  /** ₪ per kWh, excl. VAT. */
  consumption_tariff_ils_kwh: number | null
  feed_in_tariff_ils_kwh: number | null
  surplus_tariff_ils_kwh: number | null
  /** Fraction 0–1 of production consumed on site (self_consumption track). */
  self_consumption_share: number | null
  tariff_escalation_pct: number | null
  degradation_pct_year: number | null
  first_year_degradation_pct: number | null
  om_cost_pct_capex: number | null
  discount_rate_pct: number | null
  horizon_years: number | null
  co2_kg_per_kwh: number | null
  verification: Verification
}

export interface RoiAssumption {
  key: string
  label_he: string
  value: number | string
  unit: string
}

export interface RoiYear {
  year: number
  kwh: number
  savings_ils: number
  opex_ils: number
  cf_ils: number
  cum_cf_ils: number
}

/** Spec 12 §5.3 outputs (quick mode). Part of the QuoteVersion snapshot when produced. */
export interface RoiResult {
  method: 'quick-il/1'
  track: TariffTrack
  customer_type: CustomerType
  /** What the customer pays (incl. VAT for private, excl. for business). */
  capex_ils: number
  kpi: {
    annual_yield_kwh_y1: number
    specific_yield_kwh_per_kwp: number
    savings_y1_ils: number
    payback_years: number | null
    npv_ils: number
    irr_pct: number | null
    offset_pct: number | null
    lifetime_net_savings_ils: number
    co2_t_year: number | null
  }
  monthly_kwh: number[]
  series: RoiYear[]
  bill: { before_y1_ils: number | null; after_y1_ils: number | null }
  assumptions: RoiAssumption[]
  flags: string[]
  verification: Verification
}

/**
 * Company wording printed on every quote (quote-pdf-sections §2.7, §2.9, §2.10).
 * One item per entry; empty lists are simply not printed.
 */
export interface QuoteTexts {
  /** "כלול בהצעה" — scope of work. */
  included: string[]
  /** "לא כלול" — exclusions. */
  excluded: string[]
  /** "אחריות" — one line per component, e.g. "מודולים — 12 שנות מוצר, 25 שנות תפוקה". */
  warranty: string[]
  /** "באחריות הלקוח" — access, bills, IEC fees, signatures. */
  customer_obligations: string[]
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
  /** Production / savings estimate parameters (optional; absent in price books saved before ROI). */
  roi?: RoiRules
  /** Fixed company wording (optional; absent in older price books). */
  texts?: QuoteTexts
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
  /** Compass bearing of the array (180 = south) and tilt in degrees, from the survey. */
  azimuthDeg?: number | null
  tiltDeg?: number | null
  customerType?: CustomerType
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
  /** Priced separately for the customer (Product.customer_addon). Absent = part of the system price. */
  addon?: true
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

export interface QuoteLineChange {
  sku: string
  name_he: string
  before: { qty: number; unit_price_ils: number | null; line_total_ils: number | null }
  after: { qty: number; unit_price_ils: number | null; line_total_ils: number | null }
  /** after − before (line total, ILS); null when either side is unpriced. */
  delta_ils: number | null
}

/** Spec 12 §3.5 / quote-pdf-sections §2.12 — what changed against the previous version. */
export interface QuoteDiff {
  from_version: number
  to_version: number
  added: QuoteLine[]
  removed: QuoteLine[]
  changed: QuoteLineChange[]
  total_delta_excl_vat_ils: number | null
  total_delta_incl_vat_ils: number | null
}

export interface QuoteVersion {
  quote_number: string
  version_no: number
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
    /** Snapshot of the company wording; absent when the price book has none. */
    texts?: QuoteTexts
  }
  flags: string[]
  needs_owner_input: boolean
  catalog_version: string
  rules_version: string
  /** sha256 (hex) of the canonical JSON of input+design+lines+totals+terms. */
  snapshot_hash: string
  /** snapshot_hash of the version this one replaces (null for v1). */
  supersedes_hash: string | null
  /** Line-level diff against the previous version (null for v1). */
  changes: QuoteDiff | null
  /** Production / savings estimate; absent when the price book has no ROI parameters. */
  roi?: RoiResult
  trust: {
    law2: 'Human picks — no customer auto-send'
    requiresHumanPick: true
    destinationClass: 'drafts_group'
  }
}
