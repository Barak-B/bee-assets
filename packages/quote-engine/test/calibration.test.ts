// WP-M1-07 calibration: the engine must reproduce B.E.E's own pricing, to the shekel.
//
// Case A — "תמחור מערכת קומפלט" sheet of BEE_מחירון_ותמחור_2026 (Drive, 8/2026): 100 kWp, construction +
//   electrical scope (no modules/inverters), six ₪/kW cost components, fixed site adders, 20% markup on cost →
//   175,000 cost, 210,000 before VAT, 2,100 ₪/kW, 247,800 incl. VAT.
// Case B — B.E.E live app residential formula (server/src/pricing/solar_residential.ts, Barak 2026-05-27):
//   2,900 ₪/kWp up to 25 kWp, 2,700 above, 18% VAT.
// The numbers here are Barak's, copied from those sources; rules-seed is not loaded (pricing only).
import Decimal from 'decimal.js';
import { lumpPrice, priceQuote, Product, type Assembly, type CatalogSnapshot, type PricingConfig, type PricingRule } from '../src/index.ts';

const P = (p: Record<string, unknown>) => Product.parse(p);
const products = [
  P({ id: 'k-constr-lab', sku: 'BEE-CAL-0001', kind: 'labour', subkind: 'install_modules', name_he: 'קבלן קונסטרוקציה (עבודת התקנה)', unit: 'kwp' }),
  P({ id: 'k-constr-mat', sku: 'BEE-CAL-0002', kind: 'mounting', subkind: 'rail', name_he: 'אספקת קונסטרוקציה (חומר)', unit: 'kwp' }),
  P({ id: 'k-dc', sku: 'BEE-CAL-0003', kind: 'labour', subkind: 'cabling', name_he: 'קבלן חשמל DC', unit: 'kwp' }),
  P({ id: 'k-ac', sku: 'BEE-CAL-0004', kind: 'labour', subkind: 'board_wiring', name_he: 'קבלן חשמל AC', unit: 'kwp' }),
  P({ id: 'k-elec-mat', sku: 'BEE-CAL-0005', kind: 'accessory', subkind: 'support', name_he: 'חומרי חשמל', unit: 'kwp' }),
  P({ id: 'k-black', sku: 'BEE-CAL-0006', kind: 'accessory', subkind: 'bolt_m8', name_he: 'חומר שחור', unit: 'kwp' }),
  P({ id: 'k-crane', sku: 'BEE-CAL-0007', kind: 'labour', subkind: 'crane', name_he: 'מנוף', unit: 'day' }),
  P({ id: 'k-lift', sku: 'BEE-CAL-0008', kind: 'labour', subkind: 'scaffold', name_he: 'במת הרמה כולל הובלה', unit: 'day' }),
  P({ id: 'k-trans', sku: 'BEE-CAL-0009', kind: 'labour', subkind: 'transport', name_he: 'הובלות ציוד', unit: 'komplet' }),
  P({ id: 'k-insp', sku: 'BEE-CAL-0010', kind: 'service', subkind: 'inspector', name_he: 'בדיקת בודק מוסמך', unit: 'komplet' }),
  P({ id: 'k-iec', sku: 'BEE-CAL-0011', kind: 'service', subkind: 'iec_followup', name_he: 'תיאום חח"י, ליווי וחיבור', unit: 'komplet' }),
  P({ id: 'k-design', sku: 'BEE-CAL-0012', kind: 'service', subkind: 'design', name_he: 'תכנון והנדסה', unit: 'komplet' }),
  P({ id: 'k-ac-route', sku: 'BEE-CAL-0013', kind: 'labour', subkind: 'trays', name_he: 'תוואי AC', unit: 'm' }),
  P({ id: 'k-permit', sku: 'BEE-CAL-0014', kind: 'fee', subkind: 'authority', name_he: 'הגשת היתר, אגרות וליווי רישוי', unit: 'komplet', tech: { passthrough: false, vat_treatment: 'standard' } }),
  P({ id: 'k-mod', sku: 'BEE-CAL-0020', kind: 'module', subkind: 'topcon', name_he: 'מודול PV 580Wp', unit: 'unit', tech: { p_max_w: 580 } }),
];
// [sku, cost] — "₪/kW 2026 מומלץ" and "מחיר יח' ₪" columns of the sheet
const costs: [string, number][] = [
  ['k-constr-lab', 200], ['k-constr-mat', 255], ['k-dc', 130], ['k-ac', 120], ['k-elec-mat', 180], ['k-black', 150],
  ['k-crane', 4600], ['k-lift', 2400], ['k-trans', 1900], ['k-insp', 3000], ['k-iec', 3000], ['k-design', 5000],
  ['k-ac-route', 80], ['k-permit', 47000], ['k-mod', 400],
];

const asmTurnkey: Assembly = {
  id: 'c1', code: 'ASM-CAL-TURNKEY', name_he: 'הקמה קומפלט — קונסטרוקציה וחשמל, ללא ציוד', version: 1, status: 'active', verification: 'office',
  inputs: [{ name: 'crane_days', default: 2 }, { name: 'lift_days', default: 1 }, { name: 'ac_route_m', default: 0 }],
  components: [
    { id: '1', sort: 1, product_sku: 'BEE-CAL-0001', qty_expr: 'kwp', boq_section_code: '08.03' },
    { id: '2', sort: 2, product_sku: 'BEE-CAL-0002', qty_expr: 'kwp', boq_section_code: '08.03' },
    { id: '3', sort: 3, product_sku: 'BEE-CAL-0003', qty_expr: 'kwp', boq_section_code: '08.04' },
    { id: '4', sort: 4, product_sku: 'BEE-CAL-0004', qty_expr: 'kwp', boq_section_code: '08.05' },
    { id: '5', sort: 5, product_sku: 'BEE-CAL-0005', qty_expr: 'kwp', boq_section_code: '08.05' },
    { id: '6', sort: 6, product_sku: 'BEE-CAL-0006', qty_expr: 'kwp', boq_section_code: '08.03' },
    { id: '7', sort: 7, product_sku: 'BEE-CAL-0007', qty_expr: 'crane_days', boq_section_code: '08.06' },
    { id: '8', sort: 8, product_sku: 'BEE-CAL-0008', qty_expr: 'lift_days', boq_section_code: '08.06' },
    { id: '9', sort: 9, product_sku: 'BEE-CAL-0009', qty_expr: '1', boq_section_code: '08.06' },
    { id: '10', sort: 10, product_sku: 'BEE-CAL-0010', qty_expr: '1', boq_section_code: '08.07' },
    { id: '11', sort: 11, product_sku: 'BEE-CAL-0011', qty_expr: '1', boq_section_code: '08.07' },
    { id: '12', sort: 12, product_sku: 'BEE-CAL-0012', qty_expr: '1', boq_section_code: '08.01' },
    { id: '13', sort: 13, product_sku: 'BEE-CAL-0013', qty_expr: 'ac_route_m', boq_section_code: '08.05' },
    { id: '14', sort: 14, product_sku: 'BEE-CAL-0014', qty_expr: '1', boq_section_code: '08.01' },
  ],
};
const asmModulesOnly: Assembly = {
  id: 'c2', code: 'ASM-CAL-RES', name_he: 'מערכת ביתית', version: 1, status: 'active', verification: 'office',
  components: [{ id: '1', sort: 1, product_ref: 'module', qty_expr: 'module_count', boq_section_code: '08.02' }],
};

const catalog: CatalogSnapshot = {
  products,
  priceLists: [{ id: 'pl-cal', supplier_id: 'sup-cal', name: 'BEE מחירון ותמחור 2026', list_type: 'cost', currency: 'ILS', valid_from: '2026-08-01', status: 'approved', approved_by: 'barak' }],
  entries: costs.map(([pid, net], i) => ({ id: `ce-${i}`, price_list_id: 'pl-cal', supplier_sku: pid, product_id: pid, net_price: net, list_price: null, pack_qty: 1 })),
  productSuppliers: [],
  ruleProductMap: {},
  assemblies: [asmTurnkey, asmModulesOnly],
};

const rule = (id: string, action: PricingRule['action']): PricingRule =>
  ({ id, name_he: id, priority: 10, scope: {}, when: 'true', action, stack: false, verification: 'office' });
const config = (rules: PricingRule[]): PricingConfig => ({
  parameters: {
    vat_rate: { value: 0.18, valid_from: '2025-01-01' },
    validity_days_default: { value: 30 },
    price_stale_days: { value: 365 },
  },
  pricing_rules: rules,
  lookup_tables: {},
  discount_schedules: [],
  approval_thresholds: [],
});

describe('calibration A: "תמחור מערכת קומפלט", 100 kWp (BEE מחירון 2026)', () => {
  const q = priceQuote(
    { quote_date: '2026-10-17', customer: { type: 'business' }, selections: {}, values: { kwp: 100 }, assemblies: ['ASM-CAL-TURNKEY'] },
    catalog, [], config([rule('CAL-MARKUP', { type: 'markup_pct', value: 20 })]),
  );

  it('matches the sheet: cost 175,000 → 210,000 before VAT → 247,800 incl. VAT, 2,100 ₪/kW', () => {
    expect(q.issues.filter((i) => i.severity === 'block')).toEqual([]);
    expect(q.totals).toMatchObject({ before_vat: '210000.00', vat: '37800.00', incl_vat: '247800.00' });
    expect(q.kpi).toMatchObject({ cost_total: '175000.00', price_per_kwp_excl_vat: '2100.00' });
  });

  it('keeps every sheet row as its own explainable line', () => {
    const crane = q.lines.find((l) => l.title_he === 'מנוף')!;
    expect(crane).toMatchObject({ qty: '2', unit_cost: '4600', unit_price: '5520.00', line_total: '11040.00' });
    expect(crane.price_snapshot.pricing.rule_ids).toEqual(['CAL-MARKUP']);
  });
});

describe('calibration B: B.E.E residential formula, 2,900 ₪/kWp up to 25 kWp, 2,700 above', () => {
  const tiers = [{ upto_kwp: 25, price_per_kwp: 2900 }, { upto_kwp: null, price_per_kwp: 2700 }];
  const quote = (modules: number) => priceQuote(
    { quote_date: '2026-10-17', customer: { type: 'private' }, selections: { module: 'k-mod' }, values: { module_count: modules }, assemblies: ['ASM-CAL-RES'] },
    catalog, [], config([rule('CAL-LUMP', { type: 'price_per_kwp', value: tiers })]),
  );

  it.each([
    // modules × 580 W = kWp → before VAT (= solar_residential.ts subtotal) / incl. 18% VAT
    [18, '10.44', '30276.00', '35725.68'],
    [43, '24.94', '72326.00', '85344.68'],
    [52, '30.16', '86432.00', '101989.76'], // 25 × 2900 + 5.16 × 2700
  ])('%i modules (%s kWp) → %s before VAT', (modules, kwp, beforeVat, inclVat) => {
    const q = quote(modules);
    expect(q.issues.filter((i) => i.severity === 'block')).toEqual([]);
    expect(q.inputs_snapshot.derived).toMatchObject({ kwp });
    expect(q.totals).toMatchObject({ before_vat: beforeVat, incl_vat: inclVat });
    // the module line stays (cost, KPI); the customer price is the one lump-sum line
    expect(q.lines.find((l) => l.title_he === 'מערכת סולארית קומפלט')).toMatchObject({ qty: kwp, line_total: beforeVat });
  });

  it('lumpPrice: flat, banded, and broken tables', () => {
    const k = new Decimal(30);
    expect(lumpPrice(2900, k)!.toString()).toBe('87000');
    expect(lumpPrice(tiers, k)!.toString()).toBe('86000');
    // B.E.E's commercial curve shape (server/src/pricing/solar_commercial.ts, placeholder rates)
    const commercial = [{ upto_kwp: 30, price_per_kwp: 2700 }, { upto_kwp: 50, price_per_kwp: 2300 }, { upto_kwp: 100, price_per_kwp: 1900 }, { upto_kwp: null, price_per_kwp: 1300 }];
    expect(lumpPrice(commercial, new Decimal(120))!.toString()).toBe(String(30 * 2700 + 20 * 2300 + 50 * 1900 + 20 * 1300));
    expect(lumpPrice([{ upto_kwp: 25, price_per_kwp: 2900 }], k)).toBeNull(); // table ends below the system
    expect(lumpPrice([{ upto_kwp: null, price_per_kwp: 1 }, { upto_kwp: 5, price_per_kwp: 2 }], k)).toBeNull();
    expect(lumpPrice([{ upto_kwp: 25, price_per_kwp: null }], k)).toBeNull();
    expect(lumpPrice(null, k)).toBeNull();
  });
});
