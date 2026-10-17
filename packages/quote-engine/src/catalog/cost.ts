import Decimal from 'decimal.js';
import type { Currency, PriceList, PriceListEntry, Product, ProductSupplier, Supplier } from './schemas.ts';
import type { Assembly } from '../assemblies/types.ts';

export interface CatalogSnapshot {
  products: Product[];
  suppliers?: Supplier[];
  priceLists: PriceList[];
  entries: PriceListEntry[];
  productSuppliers: ProductSupplier[];
  assemblies?: Assembly[];
  /** Rule `add_line.product_key` → product SKU or assembly code (data, maintained next to the catalog). */
  ruleProductMap?: Record<string, RuleProductMapping>;
}

export interface RuleProductMapping {
  sku?: string;
  assembly_code?: string;
  /** Overrides the rule's symbolic qty (`per_inverter`, `f(module_rows)` …) with a qty_expr. */
  qty_expr?: string;
  boq_section?: string;
}

export interface FxRate {
  rate: number;
  date: string;
  source: 'boi' | 'manual';
}

export interface CostOptions {
  /** Quote date (YYYY-MM-DD) — price lists are chosen as of this date. */
  asOf: string;
  fxRates?: Partial<Record<Currency, FxRate>>;
  /** `price_stale_days` parameter; null = not configured, staleness unknown. */
  staleDays?: number | null;
}

/** The `price_snapshot.cost` block (specs/12 §3.4); unit_cost is in ILS. */
export interface CostResolution {
  unit_cost: Decimal | null;
  source_unit_cost: Decimal | null;
  currency: Currency | null;
  fx_rate: number | null;
  fx_date: string | null;
  fx_source: string | null;
  price_list_id: string | null;
  entry_id: string | null;
  supplier_id: string | null;
  supplier_sku: string | null;
  cost_as_of: string | null;
  is_stale: boolean | null;
  reason: string | null;
}

const EMPTY: Omit<CostResolution, 'reason'> = {
  unit_cost: null, source_unit_cost: null, currency: null, fx_rate: null, fx_date: null, fx_source: null,
  price_list_id: null, entry_id: null, supplier_id: null, supplier_sku: null, cost_as_of: null, is_stale: null,
};

function validAt(list: PriceList, asOf: string): boolean {
  return list.valid_from <= asOf && (!list.valid_to || list.valid_to >= asOf);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}

/**
 * The `product_cost_v` view as a function: net price of the preferred supplier from the latest approved
 * cost price list valid at `asOf`. Never guesses — no approved price → unit_cost null with a reason.
 */
export function resolveCost(productId: string, catalog: CatalogSnapshot, opts: CostOptions): CostResolution {
  const lists = new Map(catalog.priceLists.map((l) => [l.id, l]));
  const links = catalog.productSuppliers.filter((ps) => ps.product_id === productId);
  const candidates = catalog.entries
    .map((e) => ({ e, list: lists.get(e.price_list_id) }))
    .filter((x): x is { e: PriceListEntry; list: PriceList } =>
      !!x.list && x.list.list_type === 'cost' && x.list.status === 'approved' && validAt(x.list, opts.asOf) &&
      (x.e.product_id === productId || links.some((ps) => ps.supplier_id === x.list!.supplier_id && ps.supplier_sku === x.e.supplier_sku)));

  if (candidates.length === 0) return { ...EMPTY, reason: 'אין מחיר עלות במחירון מאושר בתוקף' };

  const preferred = new Set(links.filter((l) => l.preferred).map((l) => l.supplier_id));
  candidates.sort((a, b) =>
    Number(preferred.has(b.list.supplier_id)) - Number(preferred.has(a.list.supplier_id)) ||
    b.list.valid_from.localeCompare(a.list.valid_from) ||
    a.list.id.localeCompare(b.list.id) ||
    a.e.id.localeCompare(b.e.id));
  const { e, list } = candidates[0]!;

  let src: Decimal | null = null;
  if (e.net_price !== null) src = new Decimal(e.net_price);
  else if (e.list_price !== null) src = new Decimal(e.list_price).times(new Decimal(100).minus(e.discount_pct ?? 0)).div(100);
  if (src !== null) src = src.div(e.pack_qty ?? 1);

  const currency = e.currency ?? list.currency;
  const base = {
    ...EMPTY,
    source_unit_cost: src, currency, price_list_id: list.id, entry_id: e.id, supplier_id: list.supplier_id,
    supplier_sku: e.supplier_sku, cost_as_of: list.valid_from,
    is_stale: opts.staleDays === null || opts.staleDays === undefined ? null : daysBetween(list.valid_from, opts.asOf) > opts.staleDays,
  };
  if (src === null) return { ...base, reason: 'שורת המחירון ללא מחיר' };
  if (currency === 'ILS') return { ...base, unit_cost: src, reason: null };
  const fx = opts.fxRates?.[currency];
  if (!fx) return { ...base, reason: `חסר שער ${currency} ליום ההצעה` };
  return { ...base, unit_cost: src.times(fx.rate), fx_rate: fx.rate, fx_date: fx.date, fx_source: fx.source, reason: null };
}
