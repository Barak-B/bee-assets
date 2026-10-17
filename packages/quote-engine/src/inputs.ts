import Decimal from 'decimal.js';
import type { Product } from './catalog/schemas.ts';
import type { CatalogSnapshot, FxRate } from './catalog/cost.ts';

export interface ManualLine {
  id: string;
  title_he: string;
  boq_section_code: string;
  qty: number;
  unit?: string;
  product_sku?: string;
  /** Price set by hand (overrides pricing rules). Negative = credit / special discount line. */
  unit_price?: number;
  unit_cost?: number;
  customer_note_he?: string;
}

export interface QuoteInputs {
  /** Quote date (YYYY-MM-DD): selects price lists, rules and parameters valid on that day. */
  quote_date: string;
  customer: { id?: string; type: string; is_returning?: boolean; referral_id?: string | null };
  /** Products Barak picked for the quote, by product id. */
  selections: Partial<Record<'module' | 'inverter' | 'optimizer' | 'battery', string>>;
  /** AssemblyInputs (specs/12 §2.2): module_count, dc_m, roof_type, connection_a … */
  values: Record<string, unknown>;
  /** Extra rule context not covered by `values` (design.*, site.*, ac.*, rcd.* …; specs/13 §f.2). */
  ctx?: Record<string, unknown>;
  /** Assembly codes to expand; when absent, active assemblies are picked by `applies_to`. */
  assemblies?: string[];
  manual_lines?: ManualLine[];
  /** Manual overall discount in percent (DS-003). */
  discount_pct?: number | null;
  /** Line discount in percent, by line key. */
  line_discounts?: Record<string, number>;
  /** Option groups switched on/off (`insurance`, `rapid_shutdown` …); otherwise component.default_on. */
  options?: Record<string, boolean>;
  fx_rates?: Partial<Record<'USD' | 'EUR', FxRate>>;
  created_by_role?: 'human' | 'agent';
}

/** A product as seen by expressions: identity fields plus its tech sheet (`inverter.phases`). */
export function productVars(p: Product | undefined): Record<string, unknown> | undefined {
  if (!p) return undefined;
  return { ...p.tech, id: p.id, sku: p.sku, kind: p.kind, subkind: p.subkind ?? null, manufacturer: p.manufacturer ?? null, model: p.model ?? null, name_he: p.name_he };
}

const dec = (x: unknown) => (x === null || x === undefined ? null : new Decimal(x as Decimal.Value));

/**
 * Step 1 of the pricing order (specs/12 §3.1): AssemblyInputs normalised, with the derived values
 * (kWp, kW AC, connection kVA) computed from the chosen products instead of being typed twice.
 */
export function normalizeInputs(inputs: QuoteInputs, catalog: CatalogSnapshot, tables: Record<string, unknown> = {}): Record<string, unknown> {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const sel = Object.fromEntries(Object.entries(inputs.selections).map(([k, id]) => [k, byId.get(id!)]));
  const v: Record<string, unknown> = { ...inputs.values };
  const module = sel.module;
  const inverter = sel.inverter;

  if (v.module_p_w === undefined && module?.tech.p_max_w !== undefined) v.module_p_w = module.tech.p_max_w;
  if (v.module_w_m === undefined && (module?.tech.dims_mm as { w?: number } | undefined)?.w !== undefined) {
    v.module_w_m = new Decimal((module!.tech.dims_mm as { w: number }).w).div(1000);
  }
  if (v.kwp === undefined && v.module_count !== undefined && v.module_p_w !== undefined) {
    v.kwp = dec(v.module_count)!.times(dec(v.module_p_w)!).div(1000);
  }
  if (v.inverter_kw === undefined && inverter?.tech.ac_power_kw !== undefined) v.inverter_kw = inverter.tech.ac_power_kw;
  if (v.inverter_count === undefined && inverter) v.inverter_count = 1;
  if (v.kw_ac === undefined && v.inverter_kw !== undefined && v.inverter_count !== undefined) {
    v.kw_ac = dec(v.inverter_kw)!.times(dec(v.inverter_count)!);
  }
  if (v.inverter_brand === undefined && inverter?.manufacturer) v.inverter_brand = inverter.manufacturer.toLowerCase();
  if (v.phases === undefined && inverter?.tech.phases !== undefined) v.phases = inverter.tech.phases;
  if (v.has_optimizers === undefined) v.has_optimizers = !!sel.optimizer;
  if (v.optimizer_inputs === undefined && sel.optimizer?.tech.inputs !== undefined) v.optimizer_inputs = sel.optimizer.tech.inputs;
  if (v.has_battery === undefined) v.has_battery = !!sel.battery;
  if (v.customer_type === undefined) v.customer_type = inputs.customer.type;
  // connection_kva = lookup('kva_by_amps', '<phases>x<amps>') — the table is data (rules/pricing-rules.json).
  const kva = tables.kva_by_amps as { rows?: Record<string, number> } | undefined;
  if (v.connection_kva === undefined && v.connection_a !== undefined && v.phases !== undefined && kva?.rows) {
    const key = `${v.phases}x${v.connection_a}`;
    if (Object.hasOwn(kva.rows, key) && kva.rows[key] !== null) v.connection_kva = kva.rows[key];
  }

  for (const k of ['module', 'inverter', 'optimizer', 'battery'] as const) {
    const pv = productVars(sel[k]);
    if (pv) v[k] = pv;
  }
  return v;
}
