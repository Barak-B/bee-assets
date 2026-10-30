import { PriceList, Product, diffPriceLists, productReadiness, resolveCost, type PriceListEntry } from '../src/index.ts';
import { catalog, fx } from './fixtures.ts';

describe('Product schema (WP-M1-01)', () => {
  const base = { id: 'x', sku: 'BEE-INV-0099', kind: 'inverter', name_he: 'ממיר', unit: 'unit' };
  it('accepts a valid product and keeps unknown tech fields', () => {
    const p = Product.parse({ ...base, subkind: 'hybrid', tech: { phases: 3, ac_power_kw: 10, vendor_extra: 'x' } });
    expect(p.tech.vendor_extra).toBe('x');
    expect(p.available_il).toBe('unknown');
  });
  it('rejects a subkind that does not belong to the kind', () => {
    expect(Product.safeParse({ ...base, subkind: 'topcon' }).success).toBe(false);
  });
  it('validates tech by kind', () => {
    const r = Product.safeParse({ ...base, tech: { phases: 2 } });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(['tech', 'phases']);
  });
  it('enforces the internal SKU format', () => {
    expect(Product.safeParse({ ...base, sku: 'INV-1' }).success).toBe(false);
  });
  it('flags a product without datasheet source as "ללא מקור" and lists missing required tech', () => {
    const r = productReadiness(Product.parse({ ...base, tech: { phases: 3 } }));
    expect(r.no_source).toBe(true);
    expect(r.missing_tech).toContain('ac_power_kw');
    expect(r.can_validate).toBe(false);
  });
});

describe('PriceList schema', () => {
  it('requires approved_by on an approved list and a dated valid_from', () => {
    const l = { id: 'l', supplier_id: 's', name: 'n', list_type: 'cost', currency: 'ILS', valid_from: '2026-01-01', status: 'approved' };
    expect(PriceList.safeParse(l).success).toBe(false);
    expect(PriceList.safeParse({ ...l, approved_by: 'barak' }).success).toBe(true);
    expect(PriceList.safeParse({ ...l, approved_by: 'barak', valid_from: 'יום ראשון' }).success).toBe(false);
  });
});

describe('resolveCost (product_cost_v)', () => {
  const opts = { asOf: '2026-10-17', fxRates: fx, staleDays: 90 };
  it('uses the latest approved list and converts foreign currency at the quote-day rate', () => {
    const c = resolveCost('p-mod', catalog, opts);
    expect(c.price_list_id).toBe('pl-imp'); // the superseded 01/2026 list is ignored
    expect(c.currency).toBe('USD');
    expect(c.source_unit_cost!.toString()).toBe('80');
    expect(c.unit_cost!.toString()).toBe('296');
    expect(c.fx_rate).toBe(3.7);
  });
  it('prefers the preferred supplier over a newer, cheaper one', () => {
    const c = resolveCost('p-main-sw', catalog, opts);
    expect(c.supplier_id).toBe('sup-wh');
    expect(c.unit_cost!.toString()).toBe('250');
  });
  it('returns null with a reason instead of guessing', () => {
    expect(resolveCost('p-mod', catalog, { asOf: '2026-10-17' }).unit_cost).toBeNull();
    expect(resolveCost('p-mod', catalog, { asOf: '2026-10-17' }).reason).toMatch(/USD/);
    expect(resolveCost('p-fee-upg', catalog, opts).reason).toMatch(/אין מחיר/);
    expect(resolveCost('p-mod', catalog, { ...opts, asOf: '2025-06-01' }).unit_cost).toBeNull();
  });
  it('marks stale prices and leaves staleness unknown when the parameter is unset', () => {
    expect(resolveCost('p-hook', catalog, { ...opts, asOf: '2027-01-15' }).is_stale).toBe(true);
    expect(resolveCost('p-hook', catalog, opts).is_stale).toBe(false);
    expect(resolveCost('p-hook', catalog, { ...opts, staleDays: null }).is_stale).toBeNull();
  });
  it('derives net from list price and discount, per pack', () => {
    const cat = {
      ...catalog,
      entries: [{ id: 'e', price_list_id: 'pl-wh', supplier_sku: 'X', product_id: 'p-gland', list_price: 100, discount_pct: 25, net_price: null, pack_qty: 10 }],
    };
    expect(resolveCost('p-gland', cat, opts).unit_cost!.toString()).toBe('7.5');
  });
});

describe('diffPriceLists (WP-M1-02)', () => {
  const e = (sku: string, net: number | null, extra: Partial<PriceListEntry> = {}): PriceListEntry =>
    ({ id: sku, price_list_id: 'l', supplier_sku: sku, list_price: null, net_price: net, pack_qty: 1, product_id: 'p', ...extra });
  it('reports added, removed, changed and the biggest jump', () => {
    const d = diffPriceLists([e('A', 100), e('B', 50), e('C', 10)], [e('A', 100), e('B', 60), e('D', 5, { product_id: null })], 15);
    expect(d.added.map((x) => x.supplier_sku)).toEqual(['D']);
    expect(d.removed.map((x) => x.supplier_sku)).toEqual(['C']);
    expect(d.changed).toEqual([{ supplier_sku: 'B', fields: { net_price: [50, 60] }, change_pct: 20, alert: true }]);
    expect(d.unchanged).toBe(1);
    expect(d.stats).toMatchObject({ rows: 3, mapped: 2, unmapped: 1, max_change_pct: 20 });
  });
  it('alerts on every change while price_jump_alert_pct is unset', () => {
    expect(diffPriceLists([e('A', 100)], [e('A', 101)]).changed[0]!.alert).toBe(true);
    expect(diffPriceLists([e('A', 100)], [e('A', 101)], 5).changed[0]!.alert).toBe(false);
  });
});
