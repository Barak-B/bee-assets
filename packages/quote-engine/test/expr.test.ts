import Decimal from 'decimal.js';
import { ExprEvalError, ExprSyntaxError, evaluate, evaluateBool, evaluateNumber, freeVariables, parse, toPlain, type EvalEnv } from '../src/expr/index.ts';

const env = (vars: Record<string, unknown> = {}, extra: Partial<EvalEnv> = {}): EvalEnv => ({ vars, ...extra });
const n = (src: string, vars: Record<string, unknown> = {}, extra: Partial<EvalEnv> = {}) => evaluateNumber(src, env(vars, extra)).number?.toString() ?? null;
const b = (src: string, vars: Record<string, unknown> = {}) => evaluateBool(src, env(vars)).bool;

describe('arithmetic', () => {
  it('is exact decimal arithmetic, never float', () => {
    expect(n('0.1 + 0.2')).toBe('0.3');
    expect(n('up(9 * 0.018 * 1.3, 0.5)')).toBe('0.5');
    expect(n('1.15 * 100')).toBe('115');
  });
  it('respects precedence and unary minus', () => {
    expect(n('2 + 3 * 4')).toBe('14');
    expect(n('(2 + 3) * 4')).toBe('20');
    expect(n('-2 * -3')).toBe('6');
    expect(n('10 / 4')).toBe('2.5');
  });
  it('implements the qty_expr functions of specs/12 §2.3', () => {
    expect(n('ceil(87 / 2)')).toBe('44');
    expect(n('floor(2.9)')).toBe('2');
    expect(n('round(2.5)')).toBe('3');
    expect(n('round(2.345, 2)')).toBe('2.35');
    expect(n('up(30.5, 1)')).toBe('31');
    expect(n('up(40.82, 0.1)')).toBe('40.9');
    expect(n('max(1, 7, 3)')).toBe('7');
    expect(n('min([4, 2, 9])')).toBe('2');
    expect(n('if(optimizer_inputs == 2, ceil(module_count / 2), module_count)', { optimizer_inputs: 2, module_count: 87 })).toBe('44');
  });
  it('broadcasts arithmetic over lists (eplan mids: sum(2*(modules_per_row-1)))', () => {
    expect(n('sum(2 * (modules_per_row - 1))', { modules_per_row: [9, 9, 4] })).toBe('38');
    expect(n('len(sections_mm) - 1', { sections_mm: [800, 600, 300, 800] })).toBe('3');
    expect(n('up(sum(sections_mm) / 1000, 0.1)', { sections_mm: [800, 600, 300, 800] })).toBe('2.5');
  });
  it('reads nested paths and tables', () => {
    expect(n('inverter.ac_power_kw * inverter_count', { inverter: { ac_power_kw: 25 }, inverter_count: 2 })).toBe('50');
    expect(n("lookup('kva_by_amps', '3x63')", {}, { tables: { kva_by_amps: { rows: { '3x63': 43.6 } } } })).toBe('43.6');
    expect(n("lookup('t', a, b)", { a: 1, b: 'x' }, { tables: { t: { '1|x': 5 } } })).toBe('5');
    expect(n("param('hooks_per_module') * 2", {}, { params: { hooks_per_module: { value: 1.5 } } })).toBe('3');
  });
  it('rejects division by zero and unknown functions', () => {
    expect(() => n('1 / 0')).toThrow(ExprEvalError);
    expect(() => n('eval(1)')).toThrow(/unknown function/);
    expect(() => n("lookup('nope', 1)")).toThrow(/unknown table/);
  });
});

describe('three-valued logic (specs/13 §f.2)', () => {
  it('turns missing input into unknown and reports what is missing', () => {
    const r = evaluateNumber('module_count * module_p_w / 1000', env({ module_count: 10 }));
    expect(r.number).toBeNull();
    expect(r.missing).toEqual(['module_p_w']);
  });
  it('follows Kleene tables for and/or/not', () => {
    expect(b('false and x')).toBe(false);
    expect(b('true and x')).toBeNull();
    expect(b('true or x')).toBe(true);
    expect(b('false or x')).toBeNull();
    expect(b('not x')).toBeNull();
    expect(b('not (false and x)')).toBe(true);
  });
  it('treats comparison with null as unknown, but `== null` as an is-null test', () => {
    expect(b('x > 3')).toBeNull();
    expect(b('x == null')).toBe(true);
    expect(b('x != null', { x: 0 })).toBe(true);
    expect(b('x is not null', { x: false })).toBe(true);
    expect(b('x is null')).toBe(true);
    expect(evaluateBool('x is null', env()).missing).toEqual([]);
  });
  it('if() with an unknown condition is unknown, not a guess', () => {
    expect(n('if(roof_height_m > 6, 1, 0)')).toBeNull();
  });
  it('supports in [...] and dates', () => {
    expect(b("site.building_use in ['public', 'commercial']", { site: { building_use: 'public' } })).toBe(true);
    expect(b("regulatory_track not in ['residential_le15']", { regulatory_track: 'mv_gt630' })).toBe(true);
    expect(b("expected_connection_date <= date('2026-12-31')", { expected_connection_date: '2026-11-01' })).toBe(true);
    expect(b("expected_connection_date <= date('2026-12-31')", { expected_connection_date: '2027-02-01' })).toBe(false);
    expect(toPlain(evaluate("add_years('2026-10-17', 5)", env()).value)).toBe('2031-10-17');
  });
});

describe('parser', () => {
  it('reports syntax errors with a position', () => {
    expect(() => parse('1 +')).toThrow(ExprSyntaxError);
    expect(() => parse("'open")).toThrow(/unterminated/);
    expect(() => parse('a ; b')).toThrow(/unexpected character/);
  });
  it('lists free variables for save-time validation', () => {
    expect([...freeVariables(parse('if(a > b.c, ceil(d), lookup("t", e))'))].sort()).toEqual(['a', 'b', 'd', 'e']);
  });
  it('fuzz: arbitrary input never escapes as anything but a DSL error', () => {
    const alphabet = ['a', 'b', '1', '0.5', '+', '-', '*', '/', '(', ')', '[', ']', ',', '.', ' ', 'and', 'or', 'not', 'in', 'is', 'null', '==', '<=', "'x'", 'if', 'ceil', 'sum', 'constructor', '__proto__', 'process'];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 3000; i++) {
      const src = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(' ');
      try {
        evaluate(src, env({ a: 2, b: [1, 2], constructor: 1 }));
      } catch (e) {
        expect(e instanceof ExprSyntaxError || e instanceof ExprEvalError, `${src} → ${(e as Error).message}`).toBe(true);
      }
    }
  });
  it('cannot reach JS prototypes or globals', () => {
    expect(evaluate('__proto__', env({})).value).toBeNull();
    expect(evaluate('constructor.name', env({})).value).toBeNull();
    expect(() => evaluate('process.exit(1)', env({}))).toThrow(ExprSyntaxError);
  });
  it('returns Decimals', () => {
    expect(Decimal.isDecimal(evaluate('1', env()).value)).toBe(true);
  });
});
