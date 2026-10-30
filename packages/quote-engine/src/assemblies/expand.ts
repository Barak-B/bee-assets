import Decimal from 'decimal.js';
import type { Product } from '../catalog/schemas.ts';
import { resolveCost, type CatalogSnapshot, type CostOptions } from '../catalog/cost.ts';
import { calledFunctions, compareValues, compile, evaluate, evaluateBool, evaluateNumber, freeVariables, readPath, toValue, BUILTINS, type EvalEnv } from '../expr/index.ts';
import type { Issue } from '../issues.ts';
import { INPUT_VOCABULARY, type Assembly, type AssemblyComponent, type ProductQuery } from './types.ts';

export interface ExpandedLine {
  key: string;
  source: 'assembly';
  source_ref: { assembly_code: string; assembly_version: number; component_id: string; path: string };
  product: Product | null;
  resolved_by: string;
  qty: Decimal;
  qty_expr: string;
  inputs_used: Record<string, unknown>;
  unit: string | null;
  boq_section_code: string;
  title_he: string;
  customer_note_he: string | null;
  optional: boolean;
  option_group: string | null;
  selected: boolean;
  verification_flag: boolean;
  needs_owner_input: boolean;
}

export interface ExpandResult {
  lines: ExpandedLine[];
  issues: Issue[];
}

export interface ExpandOptions {
  env: EvalEnv;
  catalog: CatalogSnapshot;
  cost: CostOptions;
  options?: Record<string, boolean>;
}

function roundQty(q: Decimal, r: AssemblyComponent['rounding']): Decimal {
  if (!r) return q;
  const step = new Decimal(r.step);
  const k = q.div(step);
  const n = r.mode === 'ceil' ? k.ceil() : r.mode === 'floor' ? k.floor() : k.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return n.times(step);
}

function matchesFilter(p: Product, f: NonNullable<ProductQuery['filters']>[number], env: EvalEnv): boolean | null {
  const want = evaluate(f.value, env).value;
  if (want === null) return null;
  const have = toValue(readPath(p as unknown as Record<string, unknown>, f.field));
  if (have === null) return false;
  return compareValues(f.op, have, want);
}

/** Resolves a product_query against the active catalog (specs/12 §2.1); the result is recorded as resolved_by. */
export function resolveQuery(q: ProductQuery, opts: ExpandOptions): { product: Product | null; reason: string | null; missing: boolean } {
  const subs = q.subkind === undefined ? null : Array.isArray(q.subkind) ? q.subkind : [q.subkind];
  let unknown = false;
  const candidates = opts.catalog.products.filter((p) => {
    if (!p.is_active || p.kind !== q.kind) return false;
    if (subs && !subs.includes(p.subkind ?? '')) return false;
    for (const f of q.filters ?? []) {
      const m = matchesFilter(p, f, opts.env);
      if (m === null) { unknown = true; return false; }
      if (!m) return false;
    }
    return true;
  });
  if (unknown) return { product: null, reason: 'חסר קלט לסינון המוצר', missing: true };
  if (candidates.length === 0) return { product: null, reason: 'אין מוצר פעיל בקטלוג שתואם לשאילתה', missing: false };
  if (q.pick === 'exact') {
    if (candidates.length > 1) return { product: null, reason: `השאילתה תואמת ${candidates.length} מוצרים (נדרש בדיוק אחד)`, missing: false };
    return { product: candidates[0]!, reason: null, missing: false };
  }
  if (q.pick === 'cheapest') {
    const priced = candidates
      .map((p) => ({ p, c: resolveCost(p.id, opts.catalog, opts.cost).unit_cost }))
      .filter((x) => x.c !== null)
      .sort((a, b) => a.c!.comparedTo(b.c!) || a.p.sku.localeCompare(b.p.sku));
    if (priced.length === 0) return { product: null, reason: 'לאף מוצר תואם אין מחיר עלות', missing: false };
    return { product: priced[0]!.p, reason: null, missing: false };
  }
  const preferred = new Set(opts.catalog.productSuppliers.filter((ps) => ps.preferred).map((ps) => ps.product_id));
  candidates.sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)) || a.sku.localeCompare(b.sku));
  return { product: candidates[0]!, reason: null, missing: false };
}

export function expandAssembly(assembly: Assembly, opts: ExpandOptions, multiplier = new Decimal(1), path: string[] = []): ExpandResult {
  const lines: ExpandedLine[] = [];
  const issues: Issue[] = [];
  const chain = [...path, assembly.code];
  if (path.includes(assembly.code)) {
    return { lines, issues: [{ code: 'CONFIG_ERROR', severity: 'block', ref: `assembly:${assembly.code}`, message_he: `ערכה מקוננת מעגלית: ${chain.join(' → ')}` }] };
  }

  const vars = { ...opts.env.vars };
  for (const i of assembly.inputs ?? []) {
    if ((vars[i.name] === undefined || vars[i.name] === null) && i.default !== undefined) vars[i.name] = i.default;
  }
  const env: EvalEnv = { ...opts.env, vars };
  const flagged = assembly.verification === 'unverified' || assembly.verification === 'summary';

  for (const v of assembly.validations ?? []) {
    const r = evaluateBool(v.expr, env);
    if (r.bool === false) issues.push({ code: 'ASSEMBLY_VALIDATION', severity: 'block', ref: `assembly:${assembly.code}`, message_he: v.message_he });
    if (r.bool === null) issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref: `assembly:${assembly.code}`, message_he: `חסר נתון לבדיקת הערכה: ${v.message_he}`, missing: r.missing });
  }

  for (const c of [...assembly.components].sort((a, b) => a.sort - b.sort)) {
    const ref = `assembly:${assembly.code}#${c.id}`;
    const q = evaluateNumber(c.qty_expr, env);
    if (q.number === null) {
      issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `חסר נתון לחישוב כמות "${c.line_title_he ?? c.id}"`, missing: q.missing });
      continue;
    }
    let qty = roundQty(q.number, c.rounding);
    if (qty.gt(0) && c.min_qty !== undefined) qty = Decimal.max(qty, c.min_qty);
    qty = qty.times(multiplier);
    if (qty.lte(0)) continue; // qty=0 ⇒ no line (like eplan add())

    if (c.assembly_code) {
      const child = opts.catalog.assemblies?.find((a) => a.code === c.assembly_code && a.status === 'active');
      if (!child) {
        issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref, message_he: `ערכה מקוננת ${c.assembly_code} לא נמצאה או לא פעילה` });
        continue;
      }
      const sub = expandAssembly(child, { ...opts, env }, qty, chain);
      lines.push(...sub.lines);
      issues.push(...sub.issues);
      continue;
    }

    let product: Product | null = null;
    let resolved_by = ref;
    if (c.product_sku) {
      product = opts.catalog.products.find((p) => p.sku === c.product_sku) ?? null;
      if (!product) issues.push({ code: 'UNRESOLVED_PRODUCT', severity: 'block', ref, message_he: `מק"ט ${c.product_sku} לא קיים בקטלוג` });
    } else if (c.product_ref) {
      const id = (env.vars[c.product_ref] as { id?: string } | undefined)?.id;
      product = opts.catalog.products.find((p) => p.id === id) ?? null;
      resolved_by = `${ref} (selection:${c.product_ref})`;
      if (!product) issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `לא נבחר ${c.product_ref} להצעה`, missing: [`selections.${c.product_ref}`] });
    } else if (c.product_query) {
      const r = resolveQuery(c.product_query, { ...opts, env });
      product = r.product;
      resolved_by = `${ref} (query)`;
      if (!product) issues.push({ code: r.missing ? 'HUMAN_INPUT_REQUIRED' : 'UNRESOLVED_PRODUCT', severity: 'block', ref, message_he: `${c.line_title_he ?? c.id}: ${r.reason}` });
    }

    const optional = !!c.optional || !!c.option_group;
    const selected = !optional ? true : c.option_group && opts.options?.[c.option_group] !== undefined ? opts.options[c.option_group]! : !!c.default_on;
    lines.push({
      key: `assembly:${chain.join('/')}#${c.id}`,
      source: 'assembly',
      source_ref: { assembly_code: assembly.code, assembly_version: assembly.version, component_id: c.id, path: chain.join('/') },
      product,
      resolved_by,
      qty,
      qty_expr: c.qty_expr,
      inputs_used: q.used,
      unit: c.unit ?? product?.unit ?? null,
      boq_section_code: c.boq_section_code,
      title_he: c.line_title_he ?? product?.name_he ?? c.id,
      customer_note_he: c.customer_note_he ?? null,
      optional,
      option_group: c.option_group ?? null,
      selected,
      verification_flag: flagged || !!c.needs_owner_input,
      needs_owner_input: !!c.needs_owner_input,
    });
  }
  return { lines, issues };
}

/** Picks active assemblies whose `applies_to` matches the inputs (step 2 when none were chosen by hand). */
export function selectAssemblies(assemblies: Assembly[], vars: Record<string, unknown>): Assembly[] {
  const num = (x: unknown) => (x === undefined || x === null ? null : Number(x));
  return assemblies.filter((a) => {
    if (a.status !== 'active' || !a.applies_to) return false;
    const t = a.applies_to;
    const kwp = num(vars.kwp);
    if (t.roof_types && !t.roof_types.includes(String(vars.roof_type))) return false;
    if (t.inverter_brands && !t.inverter_brands.includes(String(vars.inverter_brand ?? '').toLowerCase())) return false;
    if (t.phases && !t.phases.includes(num(vars.phases) ?? -1)) return false;
    if (t.regulatory_tracks && !t.regulatory_tracks.includes(String(vars.regulatory_track))) return false;
    if (t.has_battery !== undefined && t.has_battery !== !!vars.has_battery) return false;
    if (t.kwp_min !== undefined && t.kwp_min !== null && (kwp === null || kwp < t.kwp_min)) return false;
    if (t.kwp_max !== undefined && t.kwp_max !== null && (kwp === null || kwp > t.kwp_max)) return false;
    return true;
  });
}

/**
 * Save-time check of an assembly (WP-M1-03: an invalid expression is rejected): every expression must
 * parse, read only declared inputs, and call only known functions.
 */
export function validateAssembly(a: Assembly, extraFunctions: string[] = []): string[] {
  const declared = new Set<string>([...INPUT_VOCABULARY, ...(a.inputs ?? []).map((i) => i.name)]);
  const fns = new Set([...Object.keys(BUILTINS), 'if', 'lookup', ...extraFunctions]);
  const errors: string[] = [];
  const check = (where: string, src: string) => {
    try {
      const node = compile(src);
      for (const v of freeVariables(node)) if (!declared.has(v)) errors.push(`${where}: משתנה לא מוצהר '${v}'`);
      for (const f of calledFunctions(node)) if (!fns.has(f)) errors.push(`${where}: פונקציה לא מוכרת '${f}'`);
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  };
  const ids = new Set<string>();
  for (const c of a.components) {
    if (ids.has(c.id)) errors.push(`${c.id}: מזהה רכיב כפול`);
    ids.add(c.id);
    const sources = [c.product_sku, c.product_ref, c.product_query, c.assembly_code].filter((x) => x !== undefined).length;
    if (sources !== 1) errors.push(`${c.id}: נדרש בדיוק מקור מוצר אחד (sku / ref / query / assembly)`);
    check(`${c.id}.qty_expr`, c.qty_expr);
    for (const f of c.product_query?.filters ?? []) check(`${c.id}.filter(${f.field})`, f.value);
  }
  for (const v of a.validations ?? []) check(`validation "${v.message_he}"`, v.expr);
  return errors;
}
