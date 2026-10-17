import type { BinaryOp, Node } from './ast.ts';

export class ExprSyntaxError extends Error {
  readonly source: string;
  readonly pos: number;
  constructor(message: string, source: string, pos: number) {
    super(`${message} at ${pos} in "${source}"`);
    this.name = 'ExprSyntaxError';
    this.source = source;
    this.pos = pos;
  }
}

type Tok =
  | { t: 'num'; v: string; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'eof'; pos: number };

const KEYWORD_OPS = new Set(['and', 'or', 'not', 'in', 'is']);
const TWO_CHAR = ['==', '!=', '<=', '>=', '&&', '||'];
const ONE_CHAR = '+-*/()[],.<>!';

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprSyntaxError('unterminated string', src, i);
      out.push({ t: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const w = m[0];
      out.push(KEYWORD_OPS.has(w) ? { t: 'op', v: w, pos: i } : { t: 'id', v: w, pos: i });
      i += w.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.includes(two)) {
      out.push({ t: 'op', v: two === '&&' ? 'and' : two === '||' ? 'or' : two, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR.includes(c)) {
      out.push({ t: 'op', v: c === '!' ? 'not' : c, pos: i });
      i++;
      continue;
    }
    throw new ExprSyntaxError(`unexpected character '${c}'`, src, i);
  }
  out.push({ t: 'eof', pos: src.length });
  return out;
}

/** Parses an expression into an AST. Never evaluates code (no eval / Function). */
export function parse(src: string): Node {
  const toks = tokenize(src);
  let k = 0;
  const peek = () => toks[k]!;
  const isOp = (v: string) => { const t = peek(); return t.t === 'op' && t.v === v; };
  const eat = (v: string) => {
    if (!isOp(v)) throw new ExprSyntaxError(`expected '${v}'`, src, peek().pos);
    k++;
  };

  function orExpr(): Node {
    let left = andExpr();
    while (isOp('or')) { k++; left = { type: 'binary', op: 'or', left, right: andExpr() }; }
    return left;
  }
  function andExpr(): Node {
    let left = notExpr();
    while (isOp('and')) { k++; left = { type: 'binary', op: 'and', left, right: notExpr() }; }
    return left;
  }
  function notExpr(): Node {
    if (isOp('not')) { k++; return { type: 'unary', op: 'not', arg: notExpr() }; }
    return comparison();
  }
  function comparison(): Node {
    const left = additive();
    const t = peek();
    if (t.t !== 'op') return left;
    if (['==', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      k++;
      const right = additive();
      // `x == null` / `x != null` mean `is null` / `is not null` (three-valued logic would make them unknown).
      if (right.type === 'null' && (t.v === '==' || t.v === '!=')) return { type: 'isnull', arg: left, negated: t.v === '!=' };
      if (left.type === 'null' && (t.v === '==' || t.v === '!=')) return { type: 'isnull', arg: right, negated: t.v === '!=' };
      return { type: 'binary', op: t.v as BinaryOp, left, right };
    }
    if (t.v === 'in') { k++; return { type: 'in', left, right: additive(), negated: false }; }
    if (t.v === 'not' && toks[k + 1]?.t === 'op' && (toks[k + 1] as { v: string }).v === 'in') {
      k += 2;
      return { type: 'in', left, right: additive(), negated: true };
    }
    if (t.v === 'is') {
      k++;
      let negated = false;
      if (isOp('not')) { k++; negated = true; }
      const n = peek();
      if (n.t !== 'id' || n.v !== 'null') throw new ExprSyntaxError("expected 'null' after 'is'", src, n.pos);
      k++;
      return { type: 'isnull', arg: left, negated };
    }
    return left;
  }
  function additive(): Node {
    let left = multiplicative();
    while (isOp('+') || isOp('-')) {
      const op = (peek() as { v: string }).v as BinaryOp;
      k++;
      left = { type: 'binary', op, left, right: multiplicative() };
    }
    return left;
  }
  function multiplicative(): Node {
    let left = unary();
    while (isOp('*') || isOp('/')) {
      const op = (peek() as { v: string }).v as BinaryOp;
      k++;
      left = { type: 'binary', op, left, right: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp('-')) { k++; return { type: 'unary', op: '-', arg: unary() }; }
    if (isOp('+')) { k++; return unary(); }
    return postfix();
  }
  function postfix(): Node {
    let node = primary();
    while (isOp('.')) {
      k++;
      const t = peek();
      if (t.t !== 'id') throw new ExprSyntaxError('expected property name', src, t.pos);
      k++;
      node = { type: 'member', object: node, property: t.v };
    }
    return node;
  }
  function primary(): Node {
    const t = peek();
    if (t.t === 'num') { k++; return { type: 'num', value: t.v }; }
    if (t.t === 'str') { k++; return { type: 'str', value: t.v }; }
    if (t.t === 'id') {
      k++;
      if (t.v === 'true' || t.v === 'false') return { type: 'bool', value: t.v === 'true' };
      if (t.v === 'null') return { type: 'null' };
      if (isOp('(')) {
        k++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(orExpr());
          while (isOp(',')) { k++; args.push(orExpr()); }
        }
        eat(')');
        return { type: 'call', callee: t.v, args };
      }
      return { type: 'ident', name: t.v };
    }
    if (isOp('(')) { k++; const e = orExpr(); eat(')'); return e; }
    if (isOp('[')) {
      k++;
      const items: Node[] = [];
      if (!isOp(']')) {
        items.push(orExpr());
        while (isOp(',')) { k++; items.push(orExpr()); }
      }
      eat(']');
      return { type: 'list', items };
    }
    throw new ExprSyntaxError('unexpected token', src, t.pos);
  }

  const node = orExpr();
  if (peek().t !== 'eof') throw new ExprSyntaxError('unexpected trailing input', src, peek().pos);
  return node;
}

/** Root variable names an expression reads (`inverter.phases` → `inverter`), for save-time validation. */
export function freeVariables(node: Node, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'ident': out.add(node.name); break;
    case 'member': freeVariables(node.object, out); break;
    case 'call': node.args.forEach((a) => freeVariables(a, out)); break;
    case 'list': node.items.forEach((a) => freeVariables(a, out)); break;
    case 'unary': freeVariables(node.arg, out); break;
    case 'binary': case 'in': freeVariables(node.left, out); freeVariables(node.right, out); break;
    case 'isnull': freeVariables(node.arg, out); break;
  }
  return out;
}

/** Dotted paths an expression reads (`inverter.phases`), used for snapshots and "missing input" messages. */
export function pathOf(node: Node): string | null {
  if (node.type === 'ident') return node.name;
  if (node.type === 'member') { const p = pathOf(node.object); return p === null ? null : `${p}.${node.property}`; }
  return null;
}

export function calledFunctions(node: Node, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'call': out.add(node.callee); node.args.forEach((a) => calledFunctions(a, out)); break;
    case 'member': calledFunctions(node.object, out); break;
    case 'list': node.items.forEach((a) => calledFunctions(a, out)); break;
    case 'unary': case 'isnull': calledFunctions(node.arg, out); break;
    case 'binary': case 'in': calledFunctions(node.left, out); calledFunctions(node.right, out); break;
  }
  return out;
}
