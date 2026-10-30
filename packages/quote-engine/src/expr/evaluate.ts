import Decimal from 'decimal.js';
import type { Node } from './ast.ts';
import { parse, pathOf } from './parser.ts';

/**
 * Runtime values. Numbers are always Decimal (never float) so quantities and prices are exact and
 * deterministic. `null` means "unknown": the DSL uses three-valued (Kleene) logic, so a missing input
 * propagates to `null` instead of being guessed (specs/13 §f.2: null in input → needs_input).
 */
export type Value = Decimal | string | boolean | null | Value[] | { [k: string]: Value };

export type Table = Record<string, unknown> | ((...keys: Value[]) => unknown);
export type Fn = (args: Value[], env: EvalEnv) => Value;

export interface EvalEnv {
  vars: Record<string, unknown>;
  /** Small data tables for lookup(name, key) — e.g. kva_by_amps from rules/pricing-rules.json. */
  tables?: Record<string, Table>;
  /** Named parameters for param(name). */
  params?: Record<string, unknown>;
  /** Extra functions (tier(), license_limit_a() …) supplied as data-backed closures. */
  functions?: Record<string, Fn>;
}

export class ExprEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExprEvalError';
  }
}

export interface EvalResult {
  value: Value;
  /** Dotted paths that were read and resolved to null/undefined — what the human must fill in. */
  missing: string[];
  /** Every dotted path read, with the value seen (for price_snapshot.qty.inputs_used). */
  used: Record<string, unknown>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function toValue(x: unknown): Value {
  if (x === undefined || x === null) return null;
  if (Decimal.isDecimal(x)) return x as Decimal;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new ExprEvalError(`non-finite number ${x}`);
    return new Decimal(x);
  }
  if (typeof x === 'string' || typeof x === 'boolean') return x;
  if (Array.isArray(x)) return x.map(toValue);
  if (typeof x === 'object') {
    const o: Record<string, Value> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) o[k] = toValue(v);
    return o;
  }
  throw new ExprEvalError(`unsupported value of type ${typeof x}`);
}

/** Converts a DSL value back to plain JS (Decimal → number) for flags and snapshots. */
export function toPlain(v: Value): unknown {
  if (v === null) return null;
  if (Decimal.isDecimal(v)) return (v as Decimal).toNumber();
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = toPlain(x as Value);
    return o;
  }
  return v;
}

const isDec = (v: Value): v is Decimal => Decimal.isDecimal(v);
const isList = (v: Value): v is Value[] => Array.isArray(v);

function num(v: Value, fn: string): Decimal | null {
  if (v === null) return null;
  if (isDec(v)) return v;
  throw new ExprEvalError(`${fn}: expected a number, got ${JSON.stringify(toPlain(v))}`);
}

function truth(v: Value): boolean | null {
  if (v === null) return null;
  if (typeof v === 'boolean') return v;
  if (isDec(v)) return !v.isZero();
  throw new ExprEvalError(`expected a boolean, got ${JSON.stringify(toPlain(v))}`);
}

function arith(op: string, a: Value, b: Value): Value {
  if (a === null || b === null) return null;
  if (isList(a) && isList(b)) {
    if (a.length !== b.length) throw new ExprEvalError(`list length mismatch in '${op}'`);
    return a.map((x, i) => arith(op, x, b[i]!));
  }
  if (isList(a)) return a.map((x) => arith(op, x, b));
  if (isList(b)) return b.map((x) => arith(op, a, x));
  if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
  const x = num(a, op)!;
  const y = num(b, op)!;
  switch (op) {
    case '+': return x.plus(y);
    case '-': return x.minus(y);
    case '*': return x.times(y);
    case '/':
      if (y.isZero()) throw new ExprEvalError('division by zero');
      return x.div(y);
  }
  throw new ExprEvalError(`unknown operator ${op}`);
}

function equals(a: Value, b: Value): boolean {
  if (isDec(a) && isDec(b)) return a.eq(b);
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]!));
  return a === b;
}

function compare(op: string, a: Value, b: Value): Value {
  if (a === null || b === null) return null;
  if (op === '==') return equals(a, b);
  if (op === '!=') return !equals(a, b);
  let c: number;
  if (isDec(a) && isDec(b)) c = a.comparedTo(b);
  else if (typeof a === 'string' && typeof b === 'string' && ISO_DATE.test(a) && ISO_DATE.test(b)) c = a < b ? -1 : a > b ? 1 : 0;
  else throw new ExprEvalError(`cannot order ${JSON.stringify(toPlain(a))} and ${JSON.stringify(toPlain(b))}`);
  switch (op) {
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    case '>=': return c >= 0;
  }
  throw new ExprEvalError(`unknown comparison ${op}`);
}

/** Comparison with DSL semantics (null → unknown; strings case-sensitive), for product-query filters. */
export function compareValues(op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in', a: Value, b: Value): boolean | null {
  if (op === 'in') {
    if (a === null || b === null) return null;
    if (!isList(b)) throw new ExprEvalError("'in' expects a list on the right");
    return b.some((x) => x !== null && equals(a, x));
  }
  return compare(op, a, b) as boolean | null;
}

function flatNums(args: Value[], fn: string): (Decimal | null)[] {
  const flat = args.length === 1 && isList(args[0]!) ? (args[0] as Value[]) : args;
  return flat.map((v) => num(v, fn));
}

function lookupTable(env: EvalEnv, name: Value, keys: Value[]): Value {
  if (typeof name !== 'string') throw new ExprEvalError('lookup: table name must be a string');
  const table = env.tables?.[name];
  if (table === undefined) throw new ExprEvalError(`lookup: unknown table '${name}'`);
  if (keys.some((k) => k === null)) return null;
  if (typeof table === 'function') return toValue(table(...keys));
  const key = keys.map((k) => String(toPlain(k))).join('|');
  const rows = (table as { rows?: Record<string, unknown> }).rows ?? table;
  return Object.hasOwn(rows, key) ? toValue((rows as Record<string, unknown>)[key]) : null;
}

export const BUILTINS: Record<string, Fn> = {
  ceil: ([x]) => num(x ?? null, 'ceil')?.ceil() ?? null,
  floor: ([x]) => num(x ?? null, 'floor')?.floor() ?? null,
  round: ([x, dp]) => {
    const v = num(x ?? null, 'round');
    if (v === null) return null;
    const d = dp === undefined ? new Decimal(0) : num(dp, 'round');
    return d === null ? null : v.toDecimalPlaces(d.toNumber(), Decimal.ROUND_HALF_UP);
  },
  // up(x, step): round up to the next multiple of step (eplan `_up`).
  up: ([x, step]) => {
    const v = num(x ?? null, 'up');
    const s = num(step ?? null, 'up');
    if (v === null || s === null) return null;
    if (s.lte(0)) throw new ExprEvalError('up: step must be positive');
    return v.div(s).ceil().times(s);
  },
  max: (args) => {
    const xs = flatNums(args, 'max');
    if (xs.length === 0 || xs.some((x) => x === null)) return null;
    return Decimal.max(...(xs as Decimal[]));
  },
  min: (args) => {
    const xs = flatNums(args, 'min');
    if (xs.length === 0 || xs.some((x) => x === null)) return null;
    return Decimal.min(...(xs as Decimal[]));
  },
  sum: ([list]) => {
    if (list === null || list === undefined) return null;
    if (!isList(list)) return num(list, 'sum');
    const xs = list.map((v) => num(v, 'sum'));
    if (xs.some((x) => x === null)) return null;
    return (xs as Decimal[]).reduce((a, b) => a.plus(b), new Decimal(0));
  },
  len: ([list]) => {
    if (list === null || list === undefined) return null;
    if (!isList(list)) throw new ExprEvalError('len: expected a list');
    return new Decimal(list.length);
  },
  date: ([s]) => {
    if (s === null || s === undefined) return null;
    if (typeof s !== 'string' || !ISO_DATE.test(s)) throw new ExprEvalError('date: expected YYYY-MM-DD');
    return s.slice(0, 10);
  },
  add_years: ([d, n]) => {
    if (d === null || d === undefined || n === null || n === undefined) return null;
    if (typeof d !== 'string' || !ISO_DATE.test(d)) throw new ExprEvalError('add_years: expected a date');
    const y = Number(d.slice(0, 4)) + num(n, 'add_years')!.toNumber();
    return `${String(y).padStart(4, '0')}${d.slice(4, 10)}`;
  },
  param: ([name], env) => {
    if (typeof name !== 'string') throw new ExprEvalError('param: name must be a string');
    const p = env.params?.[name];
    // Parameters are stored as {value, verification, …} records in rules/pricing-rules.json.
    if (p !== null && typeof p === 'object' && 'value' in (p as object)) return toValue((p as { value: unknown }).value);
    return toValue(p);
  },
  exists: ([x]) => x !== null && x !== undefined,
};

export function evaluateNode(node: Node, env: EvalEnv, missing: string[], used: Record<string, unknown>): Value {
  const ev = (n: Node) => evaluateNode(n, env, missing, used);
  switch (node.type) {
    case 'num': return new Decimal(node.value);
    case 'str': return node.value;
    case 'bool': return node.value;
    case 'null': return null;
    case 'list': return node.items.map(ev);
    case 'ident':
    case 'member': {
      const path = pathOf(node);
      if (path !== null) {
        const raw = readPath(env.vars, path);
        used[path] = raw ?? null;
        if (raw === undefined || raw === null) { if (!missing.includes(path)) missing.push(path); return null; }
        return toValue(raw);
      }
      const obj = ev((node as { object: Node }).object);
      if (obj === null) return null;
      if (typeof obj !== 'object' || isDec(obj) || isList(obj)) throw new ExprEvalError(`cannot read property '${(node as { property: string }).property}'`);
      const prop = (node as { property: string }).property;
      return Object.hasOwn(obj, prop) ? (obj as Record<string, Value>)[prop] ?? null : null;
    }
    case 'unary': {
      if (node.op === 'not') { const t = truth(ev(node.arg)); return t === null ? null : !t; }
      return arith('*', ev(node.arg), new Decimal(-1));
    }
    case 'isnull': {
      const before = missing.length;
      const v = ev(node.arg);
      missing.length = before; // testing for null is not "missing input"
      return node.negated ? v !== null : v === null;
    }
    case 'in': {
      const l = ev(node.left);
      const r = ev(node.right);
      if (l === null || r === null) return null;
      if (!isList(r)) throw new ExprEvalError("'in' expects a list on the right");
      const hit = r.some((x) => x !== null && equals(l, x));
      return node.negated ? !hit : hit;
    }
    case 'binary': {
      if (node.op === 'and') {
        const a = truth(ev(node.left));
        if (a === false) return false;
        const b = truth(ev(node.right));
        if (b === false) return false;
        return a === null || b === null ? null : true;
      }
      if (node.op === 'or') {
        const a = truth(ev(node.left));
        if (a === true) return true;
        const b = truth(ev(node.right));
        if (b === true) return true;
        return a === null || b === null ? null : false;
      }
      if (['+', '-', '*', '/'].includes(node.op)) return arith(node.op, ev(node.left), ev(node.right));
      return compare(node.op, ev(node.left), ev(node.right));
    }
    case 'call': {
      if (node.callee === 'if') {
        if (node.args.length !== 3) throw new ExprEvalError('if() takes 3 arguments');
        const c = truth(ev(node.args[0]!));
        if (c === null) return null;
        return ev(node.args[c ? 1 : 2]!);
      }
      const args = node.args.map(ev);
      if (node.callee === 'lookup') return lookupTable(env, args[0] ?? null, args.slice(1));
      const fn = env.functions?.[node.callee] ?? BUILTINS[node.callee];
      if (!fn) throw new ExprEvalError(`unknown function '${node.callee}'`);
      return fn(args, env);
    }
  }
}

export function readPath(vars: Record<string, unknown>, path: string): unknown {
  let cur: unknown = vars;
  for (const part of path.split('.')) {
    // Own properties only: expressions must not reach __proto__, constructor or other inherited members.
    if (cur === null || cur === undefined || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const cache = new Map<string, Node>();

export function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = parse(src);
    cache.set(src, n);
  }
  return n;
}

export function evaluate(src: string | Node, env: EvalEnv): EvalResult {
  const node = typeof src === 'string' ? compile(src) : src;
  const missing: string[] = [];
  const used: Record<string, unknown> = {};
  const value = evaluateNode(node, env, missing, used);
  return { value, missing, used };
}

export function evaluateNumber(src: string | Node, env: EvalEnv): EvalResult & { number: Decimal | null } {
  const r = evaluate(src, env);
  if (r.value !== null && typeof r.value === 'boolean') return { ...r, number: new Decimal(r.value ? 1 : 0) };
  return { ...r, number: num(r.value, 'expression') };
}

export function evaluateBool(src: string | Node, env: EvalEnv): EvalResult & { bool: boolean | null } {
  const r = evaluate(src, env);
  return { ...r, bool: truth(r.value) };
}
