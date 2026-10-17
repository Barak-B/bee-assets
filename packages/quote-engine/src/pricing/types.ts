import type { Verification } from '../catalog/schemas.ts';
import type { CostResolution } from '../catalog/cost.ts';
import type { Issue } from '../issues.ts';

// Pricing configuration as seeded in docs/plan/rules/pricing-rules.json (specs/12 §3.2).

export interface ParamRecord {
  value: unknown;
  valid_from?: string | null;
  verification?: Verification;
  needs_owner_input?: boolean;
  [k: string]: unknown;
}

export type PriceActionType = 'margin_pct' | 'markup_pct' | 'price_per_unit' | 'passthrough';
export type ActionType = PriceActionType | 'price_per_kwp' | 'min_margin_pct' | 'round_unit_price' | 'discount_cap_pct' | 'linkage' | 'hide_price' | 'flag';

export interface PricingRule {
  id: string;
  name_he: string;
  priority: number;
  scope: {
    kind?: string[] | null;
    subkind?: string[] | null;
    boq_section?: string[] | null;
    customer_type?: string[] | null;
    regulatory_track?: string[] | null;
    kwp_min?: number | null;
    kwp_max?: number | null;
    supplier_id?: string | null;
    product_ids?: string[] | null;
  };
  when: string;
  action: { type: ActionType; value?: unknown; step?: number | null; lookup?: { table: string; key: string }; flag?: string; level?: string; [k: string]: unknown };
  stack: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  verification: Verification;
  needs_owner_input?: boolean;
}

export interface DiscountSchedule {
  id: string;
  name_he: string;
  applies_to: { customer_type?: string[]; regulatory_track?: string[] | null; kind?: string[]; when?: string };
  basis: 'totals.before_discount' | 'line.qty';
  tiers: { kwp_from?: number | null; kwp_to?: number | null; qty_from?: number | null; qty_to?: number | null; discount_pct?: number | 'manual' | null; unit_price_adjust_pct?: number | null }[];
  stack_with_manual: boolean;
  verification: Verification;
}

export interface ApprovalThreshold {
  id: string;
  name_he: string;
  when: string;
  threshold: { value: number | null; unit: string } | null;
  approver_role: string | null;
  effect: 'pending_approval' | 'blocked' | 'warn_or_block_by_param';
  verification: Verification;
}

export interface PricingConfig {
  parameters: Record<string, ParamRecord>;
  pricing_rules: PricingRule[];
  lookup_tables: Record<string, { rows: Record<string, unknown>; [k: string]: unknown }>;
  discount_schedules: DiscountSchedule[];
  approval_thresholds: ApprovalThreshold[];
}

export interface PriceSnapshot {
  product: { id: string; sku: string; name_he: string; kind: string; tech_hash: string } | null;
  cost: Omit<CostResolution, 'unit_cost' | 'source_unit_cost'> & { unit_cost: string | null; source_unit_cost: string | null };
  pricing: { rule_ids: string[]; margin_pct: string | null; unit_price: string | null; discount_pct: string | null; discount_schedule_id: string | null; rounding: string };
  qty: { expr: string | null; inputs_used: Record<string, unknown>; resolved_by: string };
  regulatory: { rule_id: string; rule_verification: Verification; note_he: string | null }[];
  vat: { rate: string | null; treatment: 'standard' | 'exempt' | 'unknown' };
}

export interface QuoteLine {
  key: string;
  line_no: string;
  section_code: string;
  source: 'assembly' | 'rule' | 'manual';
  source_ref: Record<string, unknown>;
  product_id: string | null;
  kind: string | null;
  title_he: string;
  unit: string | null;
  qty: string;
  unit_cost: string | null;
  unit_price: string | null;
  discount_pct: string;
  line_total: string | null;
  customer_note_he: string | null;
  /** "* נתון לאימות סופי מול הרשויות" — rule or assembly not yet office/validated. */
  verification_flag: boolean;
  optional: boolean;
  option_group: string | null;
  selected: boolean;
  /** Fee shown "לפי חשבון בפועל" and kept out of the totals. */
  passthrough: boolean;
  /** Customer view shows "כלול" instead of a price. */
  hide_price: boolean;
  /** Folded into a lump-sum "price per kWp" line (PR-011). */
  in_lump: string | null;
  flags: string[];
  price_snapshot: PriceSnapshot;
}

export interface QuoteTotals {
  gross_before_discount: string;
  line_discounts: string;
  overall_discount_pct: string;
  overall_discount: string;
  discount_pct_effective: string;
  rounding: string;
  before_vat: string;
  vat_base: string;
  vat_rate: string | null;
  vat: string | null;
  incl_vat: string | null;
  passthrough_estimate: string;
  options_total: string;
}

export interface TraceEntry {
  step: number;
  what: string;
  ref?: string;
  detail?: unknown;
}

export interface QuoteVersionDraft {
  status: 'draft' | 'pending_approval';
  /** Cannot be approved or sent until every block issue is resolved (HUMAN_INPUT_REQUIRED, missing cost …). */
  blocked: boolean;
  quote_date: string;
  valid_until: string | null;
  inputs_snapshot: Record<string, unknown>;
  assemblies_used: { code: string; version: number }[];
  rules_snapshot: { key: string; verification: Verification }[];
  params_snapshot: Record<string, unknown>;
  sections: { code: string; title_he: string; subtotal: string }[];
  lines: QuoteLine[];
  totals: QuoteTotals;
  kpi: { cost_total: string; margin_total_pct: string | null; price_per_kwp_excl_vat: string | null };
  approval: { required: boolean; reasons: { id: string; name_he: string; approver_role: string | null }[] };
  linkage: Record<string, unknown> | null;
  flags: Record<string, unknown>;
  customer_notes: { rule_key: string; text_he: string; verification_flag: boolean }[];
  documents: { kind: string; rule_keys: string[]; conditional: boolean }[];
  issues: Issue[];
  trace: TraceEntry[];
}
