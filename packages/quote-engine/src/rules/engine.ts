import { evaluateBool, evaluate, toPlain, toValue, type EvalEnv, type Fn, type Value } from '../expr/index.ts';
import type { Rule, RuleLine, RuleRun, RuleTest } from './types.ts';

export interface RuleRunOptions {
  evaluationDate: string;
  scopes?: Rule['scope'][];
  tables?: EvalEnv['tables'];
  params?: EvalEnv['params'];
  functions?: Record<string, Fn>;
  /**
   * Whether a rule whose condition is unknown (missing input) and that carries a `block` blocks the run.
   * specs/13 §f.2 says it does; the pricing engine passes `rule.scope === 'pricing'` so design facts that
   * only exist at S06 turn into warnings on an S03 quote instead of blocking it.
   */
  needsInputBlocks?: (rule: Rule) => boolean;
}

// specs/13 §f.3 step 3: resolver (submission <50) → design → pricing → submission (≥50) → inspection.
function scopeRank(r: Rule): number {
  if (r.scope === 'submission') return r.priority < 50 ? 0 : 3;
  return { design: 1, pricing: 2, inspection: 4 }[r.scope];
}

export function orderRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => scopeRank(a) - scopeRank(b) || a.priority - b.priority || a.key.localeCompare(b.key));
}

export function activeRules(rules: Rule[], date: string): Rule[] {
  const superseded = new Set(rules.map((r) => r.supersedes).filter((k): k is string => !!k));
  return rules.filter((r) => !superseded.has(r.key) && (!r.valid_from || r.valid_from <= date) && (!r.valid_to || r.valid_to >= date));
}

/** Rule-local tables (`params.license_limit_a`) become functions of the same name. */
function ruleFunctions(rule: Rule): Record<string, Fn> {
  const fns: Record<string, Fn> = {};
  for (const [name, table] of Object.entries(rule.params ?? {})) {
    if (table && typeof table === 'object' && !Array.isArray(table)) {
      fns[name] = ([k]) => {
        const key = k === null || k === undefined ? null : String(toPlain(k));
        return key !== null && Object.hasOwn(table, key) ? toValue((table as Record<string, unknown>)[key]) : null;
      };
    }
  }
  return fns;
}

// A set_flag value written as an expression (`inverter.rcmu_integrated`, `tier(p_ac_kw) → tier_le15 | …`)
// is evaluated; anything else (`'IEC 62548'`, `pv_design_limit`, objects) is a literal.
const EXPR_VALUE = /^([A-Za-z_]\w*(?:\.\w+)+|[A-Za-z_]\w*\(.*\))\s*(?:→.*)?$/;

const flagged = (v: Rule['verification']) => v === 'summary' || v === 'unverified';

export function runRules(rules: Rule[], ctx: Record<string, unknown>, opts: RuleRunOptions): RuleRun {
  const run: RuleRun = { evaluation_date: opts.evaluationDate, results: [], blocks: [], warnings: [], lines: [], documents: [], flags: {}, flag_verification: {} };
  const vars: Record<string, unknown> = { ...ctx, flags: run.flags };
  const selected = orderRules(activeRules(rules, opts.evaluationDate).filter((r) => !opts.scopes || opts.scopes.includes(r.scope)));

  for (const rule of selected) {
    const env: EvalEnv = { vars, tables: opts.tables, params: opts.params, functions: { ...opts.functions, ...ruleFunctions(rule) } };
    const unverified = rule.verification === 'unverified';
    try {
      applyRule(rule, env, unverified);
    } catch (e) {
      // A broken rule is never skipped silently: it blocks in the scopes that block, and warns elsewhere.
      const msg = { rule_key: rule.key, message_he: `שגיאה בהערכת הכלל: ${(e as Error).message}`, verification: rule.verification };
      const last = run.results.at(-1);
      if (last?.key === rule.key) last.outcome = 'error';
      else run.results.push({ key: rule.key, outcome: 'error', condition: null, verification: rule.verification, missing: [] });
      ((opts.needsInputBlocks?.(rule) ?? true) ? run.blocks : run.warnings).push(msg);
    }
  }
  return run;

  function applyRule(rule: Rule, env: EvalEnv, unverified: boolean) {
    const cond = evaluateBool(rule.condition, env);

    if (cond.bool === null) {
      run.results.push({ key: rule.key, outcome: 'needs_input', condition: null, verification: rule.verification, missing: cond.missing });
      const hasBlock = rule.consequences.some((c) => c.type === 'block');
      const msg = { rule_key: rule.key, message_he: `חסר נתון: ${cond.missing.join(', ') || rule.condition}`, verification: rule.verification, missing: cond.missing };
      if (hasBlock && !unverified && (opts.needsInputBlocks?.(rule) ?? true)) run.blocks.push(msg);
      else run.warnings.push(msg);
      return;
    }
    if (!cond.bool) {
      run.results.push({ key: rule.key, outcome: 'skipped', condition: false, verification: rule.verification, missing: [] });
      return;
    }
    const result: RuleRun['results'][number] = { key: rule.key, outcome: 'fired', condition: true, verification: rule.verification, missing: [] };
    run.results.push(result);

    for (const c of rule.consequences) {
      const p = c.params;
      if (p.when !== undefined) {
        const w = evaluateBool(p.when, env);
        if (w.bool === null) {
          // An unknown guard on a block means the rule cannot be cleared yet (R21 'missing').
          if (c.type === 'block') { result.outcome = 'needs_input'; result.missing.push(...w.missing); }
          run.warnings.push({ rule_key: rule.key, message_he: `חסר נתון לבדיקה: ${w.missing.join(', ') || p.when}`, verification: rule.verification, missing: w.missing });
          continue;
        }
        if (!w.bool) continue;
      }
      const message_he = String(p.message ?? p.text_he ?? rule.name_he);
      switch (c.type) {
        case 'block':
          // unverified: block is downgraded to a warning (specs/13 §f.3 step 5).
          (unverified ? run.warnings : run.blocks).push({ rule_key: rule.key, message_he, verification: rule.verification });
          break;
        case 'warn':
          run.warnings.push({ rule_key: rule.key, message_he, verification: rule.verification });
          break;
        case 'set_flag': {
          const flag = String(p.flag);
          let value: unknown = p.value;
          if (typeof value === 'string' && EXPR_VALUE.test(value)) {
            value = toPlain(evaluate(value.split('→')[0]!.trim(), env).value as Value);
          }
          // An unknown value never erases a known one (R2's tier() without a tier table vs. the track resolver).
          if ((value === null || value === undefined) && run.flags[flag] !== undefined && run.flags[flag] !== null) break;
          run.flags[flag] = value;
          if (flagged(rule.verification)) run.flag_verification[flag] = rule.verification;
          // Flags are also readable by later rules under their own name (R3 reads `tariff_tier` set by R2).
          if (ctx[flag] === undefined || ctx[flag] === null) vars[flag] = value;
          break;
        }
        case 'require_document': {
          const kind = String(p.kind);
          const existing = run.documents.find((d) => d.kind === kind);
          if (existing) existing.rule_keys.push(rule.key);
          else run.documents.push({ kind, rule_keys: [rule.key], conditional: unverified, note: p.note as string | undefined });
          break;
        }
        case 'add_line': {
          const product_key = (p.product_key as string | undefined) ?? null;
          const existing = product_key ? run.lines.find((l) => l.product_key === product_key) : undefined;
          if (existing) {
            // Same product_key from several rules → one line citing all of them (specs/13 §f.3 step 6).
            existing.rule_keys.push(rule.key);
            existing.verification_flag ||= flagged(rule.verification);
            break;
          }
          const line: RuleLine = {
            rule_key: rule.key,
            rule_keys: [rule.key],
            ref: rule.ref ?? null,
            kind: String(p.kind ?? 'product'),
            product_key,
            qty: p.qty ?? 1,
            text_he: (p.text_he as string | undefined) ?? null,
            section: (p.section as string | undefined) ?? null,
            optional: !!p.optional || p.kind === 'option',
            amount_ils: (p.amount_ils as number | null | undefined) ?? null,
            verification: rule.verification,
            verification_flag: flagged(rule.verification),
          };
          run.lines.push(line);
          break;
        }
      }
    }
  }
}

export interface RuleTestResult {
  rule_key: string;
  test: string;
  pass: boolean;
  detail: string;
}

/** Runs a rule's own `tests[]` (WP-M1-05: data-driven by each rule's test case; specs/13 §f.4 CI). */
export function runRuleTests(rule: Rule, opts: Omit<RuleRunOptions, 'evaluationDate'> & { evaluationDate?: string } = {}): RuleTestResult[] {
  return (rule.tests ?? []).map((t: RuleTest) => {
    const date = opts.evaluationDate ?? rule.valid_from ?? '2026-01-01';
    const run = runRules([{ ...rule, supersedes: null }], t.given, { ...opts, evaluationDate: date });
    const outcome = run.results[0]?.outcome ?? 'skipped';
    if (outcome === 'error') return { rule_key: rule.key, test: t.name, pass: false, detail: [...run.blocks, ...run.warnings][0]?.message_he ?? 'error' };
    const problems: string[] = [];
    // A rule whose condition held but whose block guard is unknown both fired and needs input.
    const fired = run.results[0]?.condition === true;
    if (t.expect.outcome === 'needs_input') {
      if (outcome !== 'needs_input') problems.push(`outcome ${outcome}, expected needs_input`);
    } else if (t.expect.fires !== null && fired !== t.expect.fires) {
      problems.push(`fires=${fired} (${outcome}), expected ${t.expect.fires}`);
    }
    if (t.expect.blocks !== undefined && run.blocks.length > 0 !== t.expect.blocks) problems.push(`blocks=${run.blocks.length > 0}, expected ${t.expect.blocks}`);
    if (t.expect.add_lines !== undefined && run.lines.length !== t.expect.add_lines) problems.push(`add_lines=${run.lines.length}, expected ${t.expect.add_lines}`);
    for (const [k, v] of Object.entries(t.expect.flags ?? {})) {
      if (JSON.stringify(run.flags[k]) !== JSON.stringify(v)) problems.push(`flag ${k}=${JSON.stringify(run.flags[k])}, expected ${JSON.stringify(v)}`);
    }
    return { rule_key: rule.key, test: t.name, pass: problems.length === 0, detail: problems.join('; ') };
  });
}
