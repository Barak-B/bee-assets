// TEST FIXTURES ONLY. Every price, margin and rate below is an invented placeholder so the engine can be
// exercised end to end; none of them is a B.E.E business number or a regulatory value. Real values come
// from Barak's price lists and from rules/pricing-rules.json once he fills them (master plan §19).
import pricingSeed from '../../../docs/plan/rules/pricing-rules.json' with { type: 'json' };
import rulesSeed from '../../../docs/plan/rules/rules-seed.json' with { type: 'json' };
import { Product, type Assembly, type CatalogSnapshot, type PricingConfig, type QuoteInputs, type Rule } from '../src/index.ts';

export const seedRules = rulesSeed.rules as unknown as Rule[];

const P = (p: Record<string, unknown>) => Product.parse(p);

export const products: Product[] = [
  P({ id: 'p-mod', sku: 'BEE-MOD-0001', kind: 'module', subkind: 'topcon', name_he: 'מודול PV 580Wp TOPCon', manufacturer: 'TestSolar', model: 'TS-580', unit: 'unit', tech: { p_max_w: 580, dims_mm: { l: 2278, w: 1134, h: 30 }, class_ii: true }, tech_source: { document_id: 'doc-ds-mod', page: 1 } }),
  P({ id: 'p-inv10', sku: 'BEE-INV-0001', kind: 'inverter', subkind: 'string', name_he: 'ממיר SolarEdge 10kW תלת-פאזי', manufacturer: 'SolarEdge', model: 'SE10K', unit: 'unit', tech: { phases: 3, ac_power_kw: 10, rcd_type_required: 'A', galvanic_isolation: false, iec62109_declared: true, iso_monitor_integrated: true, rcmu_integrated: true, needs_dongle: false } }),
  P({ id: 'p-inv25', sku: 'BEE-INV-0002', kind: 'inverter', subkind: 'string', name_he: 'ממיר SolarEdge 25kW תלת-פאזי', manufacturer: 'SolarEdge', model: 'SE25K', unit: 'unit', tech: { phases: 3, ac_power_kw: 25, rcd_type_required: 'B', galvanic_isolation: false, iec62109_declared: false, iso_monitor_integrated: true, rcmu_integrated: true, needs_dongle: true } }),
  P({ id: 'p-opt', sku: 'BEE-OPT-0001', kind: 'optimizer', subkind: 'single', name_he: 'אופטימייזר SolarEdge', manufacturer: 'SolarEdge', unit: 'unit', tech: { inputs: 1, rapid_shutdown: true } }),
  P({ id: 'p-dongle', sku: 'BEE-ACC-0010', kind: 'accessory', subkind: 'comm', name_he: 'דונגל תקשורת', unit: 'unit' }),
  P({ id: 'p-hook', sku: 'BEE-MNT-0001', kind: 'mounting', subkind: 'hook_tile', name_he: 'מתלה רעפים', unit: 'unit', default_boq_section: '08.03' }),
  P({ id: 'p-rail', sku: 'BEE-MNT-0002', kind: 'mounting', subkind: 'rail', name_he: 'מסילת אלומיניום', unit: 'm', default_boq_section: '08.03' }),
  P({ id: 'p-mid', sku: 'BEE-MNT-0003', kind: 'mounting', subkind: 'clamp_mid', name_he: 'תופסן אמצע', unit: 'unit' }),
  P({ id: 'p-end', sku: 'BEE-MNT-0004', kind: 'mounting', subkind: 'clamp_end', name_he: 'תופסן קצה', unit: 'unit' }),
  P({ id: 'p-dc-red', sku: 'BEE-CBL-0001', kind: 'cable', subkind: 'dc_solar', name_he: 'כבל DC 6 ממ"ר אדום', unit: 'm', tech: { section_mm2: 6, colour: 'red' } }),
  P({ id: 'p-dc-blk', sku: 'BEE-CBL-0002', kind: 'cable', subkind: 'dc_solar', name_he: 'כבל DC 6 ממ"ר שחור', unit: 'm', tech: { section_mm2: 6, colour: 'black' } }),
  P({ id: 'p-ac5', sku: 'BEE-CBL-0003', kind: 'cable', subkind: 'ac_power', name_he: 'כבל AC 5×10', unit: 'm', tech: { cores: 5, section_mm2: 10 } }),
  P({ id: 'p-ac3', sku: 'BEE-CBL-0006', kind: 'cable', subkind: 'ac_power', name_he: 'כבל AC 3×6', unit: 'm', tech: { cores: 3, section_mm2: 6 } }),
  P({ id: 'p-pe10', sku: 'BEE-CBL-0004', kind: 'cable', subkind: 'pe', name_he: 'מוליך הארקה 10 ממ"ר', unit: 'm', default_boq_section: '08.05' }),
  P({ id: 'p-pe16', sku: 'BEE-CBL-0005', kind: 'cable', subkind: 'pe', name_he: 'מוליך הארקה 16 ממ"ר', unit: 'm', default_boq_section: '08.05' }),
  P({ id: 'p-mc4', sku: 'BEE-ACC-0001', kind: 'accessory', subkind: 'mc4_pair', name_he: 'מחברי MC4 (זוג)', unit: 'pair' }),
  P({ id: 'p-sign-main', sku: 'BEE-ACC-0002', kind: 'accessory', subkind: 'sign', name_he: 'שלט "מפסק ראשי של מיתקן פוטו-וולטאי"', unit: 'unit', default_boq_section: '08.05' }),
  P({ id: 'p-clamp', sku: 'BEE-ACC-0004', kind: 'accessory', subkind: 'lug', name_he: 'מהדק הארקה מאולגן', unit: 'unit', default_boq_section: '08.05' }),
  P({ id: 'p-sign-entr', sku: 'BEE-ACC-0005', kind: 'accessory', subkind: 'sign', name_he: 'שלט כניסה "מתקן פוטו-וולטאי"', unit: 'unit', default_boq_section: '08.04' }),
  P({ id: 'p-sign-dc', sku: 'BEE-ACC-0003', kind: 'accessory', subkind: 'label', name_he: 'שלט "זהירות מתח DC"', unit: 'unit', default_boq_section: '08.04' }),
  P({ id: 'p-gland', sku: 'BEE-ACC-0006', kind: 'accessory', subkind: 'gland', name_he: 'אנטיגרון M32', unit: 'unit' }),
  P({ id: 'p-rcd-a', sku: 'BEE-BRK-0001', kind: 'breaker', subkind: 'rcd', name_he: 'ממסר פחת סוג A', unit: 'unit', tech: { rcd_type: 'A' } }),
  P({ id: 'p-rcd-b', sku: 'BEE-BRK-0002', kind: 'breaker', subkind: 'rcd', name_he: 'ממסר פחת סוג B', unit: 'unit', tech: { rcd_type: 'B' }, default_boq_section: '08.05' }),
  P({ id: 'p-main-sw', sku: 'BEE-BRK-0003', kind: 'breaker', subkind: 'switch_disconnector', name_he: 'מפסק ראשי PV 4P', unit: 'unit', tech: { poles: '4P' }, default_boq_section: '08.05' }),
  P({ id: 'p-qs', sku: 'BEE-BRK-0005', kind: 'breaker', subkind: 'switch_disconnector', name_he: 'מנתק לפני/אחרי מונה', unit: 'unit', tech: { poles: '4P' } }),
  P({ id: 'p-inv-out', sku: 'BEE-BRK-0006', kind: 'breaker', subkind: 'mcb', name_he: 'מפסק יציאת ממיר', unit: 'unit', default_boq_section: '08.05' }),
  P({ id: 'p-meter-cab', sku: 'BEE-MTR-0001', kind: 'meter', subkind: 'meter_cabinet_window', name_he: 'ארון מונה ייצור עם חלון', unit: 'unit' }),
  P({ id: 'p-lab-mod', sku: 'BEE-LAB-0001', kind: 'labour', subkind: 'install_modules', name_he: 'התקנת מודולים', unit: 'unit' }),
  P({ id: 'p-lab-inv', sku: 'BEE-LAB-0002', kind: 'labour', subkind: 'install_inverter_boards', name_he: 'התקנת ממיר ולוחות', unit: 'komplet' }),
  P({ id: 'p-design', sku: 'BEE-SRV-0001', kind: 'service', subkind: 'design', name_he: 'תכנון חשמלי מפורט', unit: 'komplet' }),
  P({ id: 'p-constr', sku: 'BEE-SRV-0002', kind: 'service', subkind: 'constructor', name_he: 'אישור קונסטרוקטור', unit: 'komplet', default_boq_section: '08.01' }),
  P({ id: 'p-ins', sku: 'BEE-SRV-0004', kind: 'service', subkind: 'insurance_cw', name_he: 'ביטוח עבודות קבלניות', unit: 'komplet' }),
  P({ id: 'p-exempt', sku: 'BEE-SRV-0003', kind: 'service', subkind: 'permit_exempt_report', name_he: 'דיווח פטור מהיתר', unit: 'komplet', default_boq_section: '08.01' }),
  P({ id: 'p-fee-upg', sku: 'BEE-FEE-0001', kind: 'fee', subkind: 'iec_connection_upgrade', name_he: 'הגדלת חיבור חח"י', unit: 'komplet', tech: { passthrough: true, vat_treatment: 'unknown' }, default_boq_section: '08.01' }),
  P({ id: 'p-fee-pre', sku: 'BEE-FEE-0002', kind: 'fee', subkind: 'iec_survey', name_he: 'אגרת בקשת שילוב חח"י', unit: 'komplet', tech: { passthrough: true, vat_treatment: 'unknown' }, default_boq_section: '08.07' }),
];

const entry = (id: string, list: string, sku: string, product: string, net: number) =>
  ({ id, price_list_id: list, supplier_sku: sku, product_id: product, net_price: net, list_price: null, pack_qty: 1 });

export const catalog: CatalogSnapshot = {
  products,
  priceLists: [
    { id: 'pl-imp-old', supplier_id: 'sup-imp', name: 'יבואן 01/2026', list_type: 'cost', currency: 'USD', valid_from: '2026-01-01', status: 'superseded' },
    { id: 'pl-imp', supplier_id: 'sup-imp', name: 'יבואן 09/2026', list_type: 'cost', currency: 'USD', valid_from: '2026-09-01', status: 'approved', approved_by: 'barak', supersedes_id: 'pl-imp-old' },
    { id: 'pl-wh', supplier_id: 'sup-wh', name: 'סיטונאי 08/2026', list_type: 'cost', currency: 'ILS', valid_from: '2026-08-01', status: 'approved', approved_by: 'barak' },
    { id: 'pl-wh2', supplier_id: 'sup-wh2', name: 'סיטונאי ב 09/2026', list_type: 'cost', currency: 'ILS', valid_from: '2026-09-15', status: 'approved', approved_by: 'barak' },
    { id: 'pl-sale-acme', supplier_id: 'sup-bee', name: 'מחיר חוזי לקוח ACME', list_type: 'sale', currency: 'ILS', valid_from: '2026-01-01', status: 'approved', approved_by: 'barak', customer_id: 'cust-acme' },
  ],
  entries: [
    entry('e-mod-old', 'pl-imp-old', 'TS-580', 'p-mod', 90),
    entry('e-mod', 'pl-imp', 'TS-580', 'p-mod', 80),
    entry('e-inv10', 'pl-imp', 'SE10K', 'p-inv10', 1000),
    entry('e-inv25', 'pl-imp', 'SE25K', 'p-inv25', 2000),
    entry('e-opt', 'pl-imp', 'S440', 'p-opt', 40),
    entry('e-dongle', 'pl-wh', 'DNG', 'p-dongle', 150),
    entry('e-hook', 'pl-wh', 'HK', 'p-hook', 12),
    entry('e-rail', 'pl-wh', 'RL', 'p-rail', 25),
    entry('e-mid', 'pl-wh', 'MC', 'p-mid', 4),
    entry('e-end', 'pl-wh', 'EC', 'p-end', 4),
    entry('e-dcr', 'pl-wh', 'DCR', 'p-dc-red', 3.5),
    entry('e-dcb', 'pl-wh', 'DCB', 'p-dc-blk', 3.5),
    entry('e-ac5', 'pl-wh', 'AC5', 'p-ac5', 30),
    entry('e-ac3', 'pl-wh', 'AC3', 'p-ac3', 14),
    entry('e-pe10', 'pl-wh', 'PE10', 'p-pe10', 9),
    entry('e-pe16', 'pl-wh', 'PE16', 'p-pe16', 14),
    entry('e-mc4', 'pl-wh', 'MC4', 'p-mc4', 6),
    entry('e-sign-main', 'pl-wh', 'SGM', 'p-sign-main', 20),
    entry('e-clamp', 'pl-wh', 'CLP', 'p-clamp', 2),
    entry('e-sign-entr', 'pl-wh', 'SGE', 'p-sign-entr', 20),
    entry('e-sign-dc', 'pl-wh', 'SGD', 'p-sign-dc', 5),
    entry('e-gland', 'pl-wh', 'GL', 'p-gland', 3),
    entry('e-rcd-a', 'pl-wh', 'RCDA', 'p-rcd-a', 180),
    entry('e-rcd-b', 'pl-wh', 'RCDB', 'p-rcd-b', 900),
    entry('e-main-sw', 'pl-wh', 'MSW', 'p-main-sw', 250),
    entry('e-qs', 'pl-wh', 'QS', 'p-qs', 200),
    entry('e-inv-out', 'pl-wh', 'IOB', 'p-inv-out', 120),
    entry('e-meter-cab', 'pl-wh', 'MCAB', 'p-meter-cab', 1500),
    entry('e-lab-mod', 'pl-wh', 'LBM', 'p-lab-mod', 60),
    entry('e-lab-inv', 'pl-wh', 'LBI', 'p-lab-inv', 800),
    entry('e-design', 'pl-wh', 'DSG', 'p-design', 1200),
    entry('e-constr', 'pl-wh', 'CNS', 'p-constr', 1500),
    entry('e-ins', 'pl-wh', 'INS', 'p-ins', 900),
    entry('e-exempt', 'pl-wh', 'EXM', 'p-exempt', 400),
    // second wholesaler, newer but not preferred, for the main switch
    entry('e-main-sw2', 'pl-wh2', 'MSW-B', 'p-main-sw', 230),
    entry('e-sale-mod', 'pl-sale-acme', 'BEE-MOD-0001', 'p-mod', 350),
  ],
  productSuppliers: [
    { product_id: 'p-main-sw', supplier_id: 'sup-wh', supplier_sku: 'MSW', preferred: true },
    { product_id: 'p-main-sw', supplier_id: 'sup-wh2', supplier_sku: 'MSW-B', preferred: false },
  ],
  ruleProductMap: {
    pv_main_switch: { sku: 'BEE-BRK-0003' },
    sign_pv_main_switch: { sku: 'BEE-ACC-0002' },
    production_meter_cabinet: { assembly_code: 'ASM-PROD-METER', boq_section: '08.05' },
    iec_connection_upgrade: { sku: 'BEE-FEE-0001' },
    rcd_type_b: { sku: 'BEE-BRK-0002' },
    iec_pre_application_fee: { sku: 'BEE-FEE-0002' },
    pe_cu_10: { sku: 'BEE-CBL-0004', qty_expr: "up(rows * param('pe_per_row_m') + 3, 1)" },
    pe_cu_16_bare: { sku: 'BEE-CBL-0005', qty_expr: 'up(pe_m, 1)' },
    earthing_clamp_anodised: { sku: 'BEE-ACC-0004', qty_expr: 'rows + 8' },
    inverter_output_breaker: { sku: 'BEE-BRK-0006' },
    sign_pv_building_entrance: { sku: 'BEE-ACC-0005' },
    sign_dc_danger: { sku: 'BEE-ACC-0003', qty_expr: 'inverter_count' },
    exemption_report: { sku: 'BEE-SRV-0003' },
    structural_engineer: { sku: 'BEE-SRV-0002' },
    optimizers_rapid_shutdown: { sku: 'BEE-OPT-0001', boq_section: '08.08' },
  },
};

/** A trimmed ASM-RES-TILE-SE (specs/12 §2.4) — placeholders are param(), never literals. */
export const asmResTile: Assembly = {
  id: 'a1', code: 'ASM-RES-TILE-SE', name_he: 'מערכת ביתית על גג רעפים, SolarEdge', version: 3, status: 'active',
  applies_to: { roof_types: ['tile'], inverter_brands: ['solaredge'], phases: [1, 3] },
  inputs: [{ name: 'jumpers_m', default: 0 }],
  verification: 'office',
  validations: [{ expr: 'module_count > 0', message_he: 'מספר מודולים חייב להיות חיובי' }],
  components: [
    { id: '1', sort: 1, product_ref: 'module', qty_expr: 'module_count', boq_section_code: '08.02' },
    { id: '2', sort: 2, product_query: { kind: 'optimizer', filters: [{ field: 'manufacturer', op: '==', value: "'SolarEdge'" }], pick: 'preferred' }, qty_expr: 'if(optimizer_inputs == 2, ceil(module_count / 2), module_count)', boq_section_code: '08.02' },
    { id: '3', sort: 3, product_ref: 'inverter', qty_expr: 'inverter_count', boq_section_code: '08.02' },
    { id: '4', sort: 4, product_sku: 'BEE-ACC-0010', qty_expr: 'if(inverter.needs_dongle, inverter_count, 0)', boq_section_code: '08.02', line_title_he: 'דונגל תקשורת' },
    { id: '5', sort: 5, product_sku: 'BEE-MNT-0001', qty_expr: "ceil(module_count * param('hooks_per_module'))", boq_section_code: '08.03', needs_owner_input: true },
    { id: '6', sort: 6, product_sku: 'BEE-MNT-0002', qty_expr: 'up(sum(modules_per_row) * module_w_m * 2, 0.1)', boq_section_code: '08.03' },
    { id: '7', sort: 7, product_sku: 'BEE-MNT-0003', qty_expr: 'sum(2 * (modules_per_row - 1))', boq_section_code: '08.03' },
    { id: '8', sort: 8, product_sku: 'BEE-MNT-0004', qty_expr: '4 * rows', boq_section_code: '08.03' },
    { id: '9', sort: 9, product_sku: 'BEE-CBL-0001', qty_expr: 'up(dc_m / 2, 1)', boq_section_code: '08.04' },
    { id: '10', sort: 10, product_sku: 'BEE-CBL-0002', qty_expr: 'up(dc_m / 2 + jumpers_m, 1)', boq_section_code: '08.04' },
    { id: '11', sort: 11, product_sku: 'BEE-ACC-0001', qty_expr: 'string_count * 2', boq_section_code: '08.04' },
    { id: '19', sort: 19, product_query: { kind: 'cable', subkind: 'ac_power', filters: [{ field: 'tech.cores', op: '==', value: 'if(phases == 3, 5, 3)' }], pick: 'exact' }, qty_expr: 'up(ac_m, 1)', boq_section_code: '08.05' },
    { id: '22', sort: 22, product_query: { kind: 'breaker', subkind: 'rcd', filters: [{ field: 'tech.rcd_type', op: '==', value: 'inverter.rcd_type_required' }], pick: 'exact' }, qty_expr: "if(inverter.rcd_type_required == 'none', 0, inverter_count)", boq_section_code: '08.05' },
    { id: '24', sort: 24, product_sku: 'BEE-BRK-0003', qty_expr: '1', boq_section_code: '08.05' },
    { id: '31', sort: 31, product_sku: 'BEE-LAB-0001', qty_expr: 'module_count', boq_section_code: '08.06' },
    { id: '32', sort: 32, product_sku: 'BEE-LAB-0002', qty_expr: '1', boq_section_code: '08.06' },
    { id: '36', sort: 36, product_sku: 'BEE-SRV-0001', qty_expr: '1', boq_section_code: '08.01' },
    { id: '43', sort: 43, product_sku: 'BEE-SRV-0004', qty_expr: '1', boq_section_code: '08.08', option_group: 'insurance', default_on: false, line_title_he: 'ביטוח עבודות (אופציה)' },
  ],
};

/** Production-meter kit added by R8 (specs/12 §4 R8): cabinet ×1, QS-M1/QS-M2 ×2, glands ×2. */
export const asmProdMeter: Assembly = {
  id: 'a2', code: 'ASM-PROD-METER', name_he: 'ארון מונה ייצור', version: 1, status: 'active', verification: 'office',
  components: [
    { id: '1', sort: 1, product_sku: 'BEE-MTR-0001', qty_expr: '1', boq_section_code: '08.05' },
    { id: '2', sort: 2, product_sku: 'BEE-BRK-0005', qty_expr: '2', boq_section_code: '08.05', line_title_he: 'מנתקים QS-M1 / QS-M2' },
    { id: '3', sort: 3, product_sku: 'BEE-ACC-0006', qty_expr: '2', boq_section_code: '08.05' },
  ],
};

/** ASM-T4P-CABINET (specs/12 §2.6), trimmed — used to test list functions and nesting. */
export const asmT4p: Assembly = {
  id: 'a3', code: 'ASM-T4P-CABINET', name_he: 'ארון T4P', version: 1, status: 'active', verification: 'unverified',
  inputs: [{ name: 'sections_mm', required: true }, { name: 'device_count', required: true }, { name: 'din_modules_needed', required: true }],
  components: [
    { id: '1', sort: 1, product_sku: 'BEE-ACC-0006', qty_expr: 'device_count + 4', boq_section_code: '08.05' },
    { id: '5', sort: 5, product_sku: 'BEE-MNT-0002', qty_expr: 'up(sum(sections_mm) / 1000, 0.1)', boq_section_code: '08.05', line_title_he: 'סוקל' },
    { id: '6', sort: 6, product_sku: 'BEE-MNT-0002', qty_expr: "up(din_modules_needed * 0.018 * param('din_reserve_factor'), 0.5)", boq_section_code: '08.05', line_title_he: 'מסילת DIN' },
    { id: '2', sort: 2, product_sku: 'BEE-ACC-0006', qty_expr: 'len(sections_mm) - 1', boq_section_code: '08.05', line_title_he: 'פנל חיבור בין תאים' },
  ],
};

catalog.assemblies = [asmResTile, asmProdMeter, asmT4p];

/** pricing-rules.json with its nulls filled by test placeholders (deep copy; the seed itself stays untouched). */
export function testConfig(overrides: (c: PricingConfig) => void = () => {}): PricingConfig {
  const c = structuredClone(pricingSeed) as unknown as PricingConfig;
  const set = (name: string, value: unknown) => { c.parameters[name] = { ...(c.parameters[name] ?? {}), value }; };
  set('vat_rate', 0.18);
  c.parameters.vat_rate!.valid_from = '2025-01-01';
  set('default_margin_pct', 20);
  set('validity_days_default', 30);
  set('price_stale_days', 90);
  set('hooks_per_module', 2);
  set('pe_per_row_m', 2);
  set('din_reserve_factor', 1.3);
  const rule = (id: string) => c.pricing_rules.find((r) => r.id === id)!;
  rule('PR-001').action.value = 25;
  rule('PR-002').action.value = 35;
  c.lookup_tables.labour_price_per_module!.rows.tile = 120;
  rule('PR-004').action.value = 2000;
  rule('PR-005').action.value = 15;
  rule('PR-007').action.value = 15;
  rule('PR-008').action.step = 10;
  c.lookup_tables.price_per_kwp_by_roof!.rows.tile = 3500;
  c.discount_schedules.find((d) => d.id === 'DS-001')!.tiers = [
    { kwp_from: 0, kwp_to: 20, discount_pct: 0 },
    { kwp_from: 20, kwp_to: null, discount_pct: 3 },
  ];
  c.discount_schedules = c.discount_schedules.filter((d) => d.id !== 'DS-004' && d.id !== 'DS-002');
  c.approval_thresholds.find((a) => a.id === 'AT-001')!.threshold!.value = 10;
  c.approval_thresholds.find((a) => a.id === 'AT-003')!.threshold!.value = 500000;
  overrides(c);
  return c;
}

export const fx = { USD: { rate: 3.7, date: '2026-10-15', source: 'manual' as const } };

/** 10.44 kWp private house, tile roof, SolarEdge 10 kW on 3×25A. */
export function residentialInputs(over: Partial<QuoteInputs> = {}): QuoteInputs {
  return {
    quote_date: '2026-10-17',
    customer: { id: 'cust-1', type: 'private' },
    selections: { module: 'p-mod', inverter: 'p-inv10', optimizer: 'p-opt' },
    values: {
      module_count: 18, string_count: 2, rows: 2, modules_per_row: [9, 9],
      dc_m: 61, ac_m: 14.2, pe_m: 18, roof_type: 'tile', connection_a: 25, distance_inverter_board_m: 2,
    },
    ctx: { site: { building_legal: true, ground_mount: false, array_exceeds_roof: false } },
    fx_rates: fx,
    ...over,
  };
}

/** 50.46 kWp business, tile roof, 2 × SolarEdge 25 kW on 3×63A — R7 and R8 both fire. */
export function commercialInputs(over: Partial<QuoteInputs> = {}): QuoteInputs {
  return {
    quote_date: '2026-10-17',
    customer: { id: 'cust-2', type: 'business' },
    selections: { module: 'p-mod', inverter: 'p-inv25', optimizer: 'p-opt' },
    values: {
      module_count: 87, inverter_count: 2, string_count: 6, rows: 3, modules_per_row: [29, 29, 29],
      dc_m: 240, ac_m: 22, pe_m: 40, roof_type: 'tile', connection_a: 63, distance_inverter_board_m: 2,
    },
    ctx: { site: { building_legal: true, ground_mount: false, array_exceeds_roof: false } },
    fx_rates: fx,
    ...over,
  };
}
