import { expandAssembly, normalizeInputs, selectAssemblies, validateAssembly, type Assembly, type EvalEnv } from '../src/index.ts';
import { asmResTile, asmT4p, catalog, fx, residentialInputs, testConfig } from './fixtures.ts';

const config = testConfig();
const cost = { asOf: '2026-10-17', fxRates: fx, staleDays: 90 };
function envFor(values: Record<string, unknown> = {}): EvalEnv {
  const inputs = residentialInputs();
  inputs.values = { ...inputs.values, ...values };
  return { vars: normalizeInputs(inputs, catalog, config.lookup_tables), tables: config.lookup_tables, params: config.parameters };
}
const qtyBySku = (lines: ReturnType<typeof expandAssembly>['lines']) =>
  Object.fromEntries(lines.map((l) => [`${l.product?.sku}#${l.source_ref.component_id}`, l.qty.toString()]));

describe('ASM-RES-TILE-SE golden quantities (specs/12 §2.4)', () => {
  const r = expandAssembly(asmResTile, { env: envFor(), catalog, cost });
  it('expands without issues', () => {
    expect(r.issues).toEqual([]);
  });
  it('matches hand-computed quantities for 18 × 580 Wp on two rows of 9', () => {
    expect(qtyBySku(r.lines)).toEqual({
      'BEE-MOD-0001#1': '18',
      'BEE-OPT-0001#2': '18', // one optimizer per module
      'BEE-INV-0001#3': '1',
      // dongle: inverter.needs_dongle=false ⇒ qty 0 ⇒ no line
      'BEE-MNT-0001#5': '36', // ceil(18 × hooks_per_module=2)
      'BEE-MNT-0002#6': '40.9', // up(18 × 1.134 × 2, 0.1)
      'BEE-MNT-0003#7': '32', // 2 × (9−1) × 2 rows
      'BEE-MNT-0004#8': '8', // 4 × rows
      'BEE-CBL-0001#9': '31', // up(61/2, 1)
      'BEE-CBL-0002#10': '31', // jumpers_m default 0
      'BEE-ACC-0001#11': '4',
      'BEE-CBL-0003#19': '15', // 3-phase ⇒ 5-core cable, up(14.2, 1)
      'BEE-BRK-0001#22': '1', // inverter declares RCD type A
      'BEE-BRK-0003#24': '1',
      'BEE-LAB-0001#31': '18',
      'BEE-LAB-0002#32': '1',
      'BEE-SRV-0001#36': '1',
      'BEE-SRV-0004#43': '1',
    });
  });
  it('resolves queries by input and records how', () => {
    const rcd = r.lines.find((l) => l.source_ref.component_id === '22')!;
    expect(rcd.product!.tech.rcd_type).toBe('A');
    expect(rcd.resolved_by).toBe('assembly:ASM-RES-TILE-SE#22 (query)');
    expect(rcd.inputs_used).toEqual({ 'inverter.rcd_type_required': 'A', inverter_count: 1 });
  });
  it('marks option groups unselected unless switched on, and owner-input components as "לאימות"', () => {
    expect(r.lines.find((l) => l.option_group === 'insurance')!.selected).toBe(false);
    expect(expandAssembly(asmResTile, { env: envFor(), catalog, cost, options: { insurance: true } }).lines.find((l) => l.option_group === 'insurance')!.selected).toBe(true);
    expect(r.lines.find((l) => l.source_ref.component_id === '5')!.verification_flag).toBe(true);
  });
});

describe('missing input is never guessed', () => {
  it('reports HUMAN_INPUT_REQUIRED with the missing names and drops the line', () => {
    const env = envFor({ dc_m: undefined });
    const r = expandAssembly(asmResTile, { env, catalog, cost });
    const issue = r.issues.find((i) => i.ref === 'assembly:ASM-RES-TILE-SE#9')!;
    expect(issue.code).toBe('HUMAN_INPUT_REQUIRED');
    expect(issue.missing).toEqual(['dc_m']);
    expect(r.lines.some((l) => l.source_ref.component_id === '9')).toBe(false);
  });
  it('an unset owner parameter blocks its line', () => {
    const env = { ...envFor(), params: testConfig((c) => { c.parameters.hooks_per_module = { value: null }; }).parameters };
    const r = expandAssembly(asmResTile, { env, catalog, cost });
    expect(r.issues.find((i) => i.ref.endsWith('#5'))?.code).toBe('HUMAN_INPUT_REQUIRED');
  });
  it('validations block when false', () => {
    const r = expandAssembly(asmResTile, { env: envFor({ module_count: 0 }), catalog, cost });
    expect(r.issues.some((i) => i.code === 'ASSEMBLY_VALIDATION')).toBe(true);
  });
  it('an exact query with no match is an unresolved product, not a silent substitute', () => {
    const env = envFor();
    (env.vars.inverter as Record<string, unknown>).rcd_type_required = 'F';
    const r = expandAssembly(asmResTile, { env, catalog, cost });
    expect(r.issues.find((i) => i.ref.endsWith('#22'))?.code).toBe('UNRESOLVED_PRODUCT');
  });
});

describe('list inputs and nesting (ASM-T4P-CABINET, specs/12 §2.6)', () => {
  const env = envFor({ sections_mm: [800, 600, 300, 800], device_count: 12, din_modules_needed: 40 });
  it('computes plinth, DIN rail and joining panels from the section list', () => {
    const r = expandAssembly(asmT4p, { env, catalog, cost });
    expect(r.issues).toEqual([]);
    expect(r.lines.map((l) => [l.title_he, l.qty.toString()])).toEqual([
      ['אנטיגרון M32', '16'],
      ['פנל חיבור בין תאים', '3'],
      ['סוקל', '2.5'],
      ['מסילת DIN', '1'], // up(40 × 0.018 × 1.3, 0.5)
    ]);
    expect(r.lines.every((l) => l.verification_flag)).toBe(true); // unverified assembly
  });
  it('multiplies nested assembly quantities and detects cycles', () => {
    const outer: Assembly = { ...asmT4p, id: 'o', code: 'ASM-OUTER', components: [{ id: 'n', sort: 1, assembly_code: 'ASM-T4P-CABINET', qty_expr: '2', boq_section_code: '08.05' }] };
    const r = expandAssembly(outer, { env, catalog: { ...catalog, assemblies: [...catalog.assemblies!, outer] }, cost });
    expect(r.lines.find((l) => l.title_he === 'סוקל')!.qty.toString()).toBe('5');
    expect(r.lines[0]!.key).toBe('assembly:ASM-OUTER/ASM-T4P-CABINET#1');
    const loop: Assembly = { ...outer, code: 'ASM-LOOP', components: [{ id: 'n', sort: 1, assembly_code: 'ASM-LOOP', qty_expr: '1', boq_section_code: '08.05' }] };
    const r2 = expandAssembly(loop, { env, catalog: { ...catalog, assemblies: [loop] }, cost });
    expect(r2.issues[0]!.message_he).toMatch(/מעגלית/);
  });
});

describe('validateAssembly (WP-M1-03: an invalid expression is rejected)', () => {
  it('accepts the fixture assemblies', () => {
    expect(validateAssembly(asmResTile)).toEqual([]);
    expect(validateAssembly(asmT4p)).toEqual([]);
  });
  it('rejects syntax errors, undeclared variables, unknown functions and ambiguous sources', () => {
    const bad: Assembly = {
      ...asmT4p,
      components: [
        { id: 'a', sort: 1, product_sku: 'BEE-ACC-0006', qty_expr: 'device_count +', boq_section_code: '08.05' },
        { id: 'b', sort: 2, product_sku: 'BEE-ACC-0006', qty_expr: 'modules_count * 2', boq_section_code: '08.05' },
        { id: 'c', sort: 3, product_sku: 'BEE-ACC-0006', qty_expr: 'exec(1)', boq_section_code: '08.05' },
        { id: 'd', sort: 4, product_sku: 'BEE-ACC-0006', product_ref: 'module', qty_expr: '1', boq_section_code: '08.05' },
      ],
    };
    const errs = validateAssembly(bad);
    expect(errs).toHaveLength(4);
    expect(errs[1]).toMatch(/modules_count/);
    expect(errs[2]).toMatch(/exec/);
  });
});

describe('selectAssemblies by applies_to', () => {
  it('picks the tile/SolarEdge assembly for a tile roof and not for a concrete one', () => {
    expect(selectAssemblies(catalog.assemblies!, envFor().vars).map((a) => a.code)).toEqual(['ASM-RES-TILE-SE']);
    expect(selectAssemblies(catalog.assemblies!, envFor({ roof_type: 'concrete_flat' }).vars)).toEqual([]);
  });
});
