import Decimal from 'decimal.js';
import type { Product } from '../catalog/schemas.ts';
import { resolveCost, type CatalogSnapshot, type CostOptions, type CostResolution } from '../catalog/cost.ts';
import { expandAssembly, selectAssemblies, type ExpandedLine } from '../assemblies/expand.ts';
import { evaluateBool, evaluateNumber, readPath, toValue, type EvalEnv, type Fn } from '../expr/index.ts';
import { canonicalJson, sha256Hex } from '../hash.ts';
import { normalizeInputs, productVars, type QuoteInputs } from '../inputs.ts';
import type { Issue } from '../issues.ts';
import { runRules, type Rule, type RuleLine } from '../rules/index.ts';
import type {
  PriceActionType, PricingConfig, PricingRule, PriceSnapshot, QuoteLine, QuoteTotals, QuoteVersionDraft, TraceEntry,
} from './types.ts';

/** BOQ chapters (templates/boq-xlsx-layout.md §5). */
export const BOQ_SECTIONS: Record<string, string> = {
  '08.01': 'מקדמות ותכנון',
  '08.02': 'מודולים ואלקטרוניקה',
  '08.03': 'קונסטרוקציה',
  '08.04': 'חשמל DC ותשתית גג',
  '08.05': 'חשמל AC, לוחות והארקה',
  '08.06': 'עבודות התקנה',
  '08.07': 'בדיקות, אישורים והפעלה',
  '08.08': 'שונות ואופציות',
};

/** Pricing-rules customer types → the rules seed vocabulary (rules-seed.json uses residential/commercial). */
const RULE_CUSTOMER_TYPE: Record<string, string> = { private: 'residential', business: 'commercial' };

const PRICE_ACTIONS: PriceActionType[] = ['margin_pct', 'markup_pct', 'price_per_unit', 'passthrough'];
const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
const money = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const s = (d: Decimal | null) => (d === null ? null : d.toString());

interface WorkLine {
  key: string;
  order: number;
  source: 'assembly' | 'rule' | 'manual';
  source_ref: Record<string, unknown>;
  product: Product | null;
  kind: string | null;
  subkind: string | null;
  section: string;
  title_he: string;
  unit: string | null;
  qty: Decimal;
  qty_expr: string | null;
  inputs_used: Record<string, unknown>;
  resolved_by: string;
  customer_note_he: string | null;
  verification_flag: boolean;
  optional: boolean;
  option_group: string | null;
  selected: boolean;
  regulatory: PriceSnapshot['regulatory'];
  cost: CostResolution | null;
  unit_cost: Decimal | null;
  unit_price: Decimal | null;
  manual_price: boolean;
  rule_ids: string[];
  margin_pct: Decimal | null;
  passthrough: boolean;
  hide_price: boolean;
  in_lump: string | null;
  flags: string[];
  discount_pct: Decimal;
  discount_schedule_id: string | null;
  vat_treatment: 'standard' | 'exempt' | 'unknown';
  line_total: Decimal | null;
}

const EMPTY_COST: CostResolution = {
  unit_cost: null, source_unit_cost: null, currency: null, fx_rate: null, fx_date: null, fx_source: null,
  price_list_id: null, entry_id: null, supplier_id: null, supplier_sku: null, cost_as_of: null, is_stale: null, reason: null,
};

function paramValue(config: PricingConfig, name: string): unknown {
  return config.parameters[name]?.value ?? null;
}

function inDates(r: { valid_from?: string | null; valid_to?: string | null }, date: string): boolean {
  return (!r.valid_from || r.valid_from <= date) && (!r.valid_to || r.valid_to >= date);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rule context (specs/13 §f.2 names) built from AssemblyInputs, then overridden by `inputs.ctx`. */
export function buildRuleCtx(vars: Record<string, unknown>, inputs: QuoteInputs): Record<string, unknown> {
  const base: Record<string, unknown> = {
    p_ac_kw: vars.kw_ac,
    p_dc_kwp: vars.kwp,
    customer_type: RULE_CUSTOMER_TYPE[inputs.customer.type] ?? inputs.customer.type,
    distributor_type: 'iec',
    storage_mode: vars.has_battery ? 'with_pv' : 'none',
    connection_phases: vars.phases,
    connection_amps: vars.connection_a,
    connection_kva: vars.connection_kva,
    regulatory_track: vars.regulatory_track,
    inverter: vars.inverter,
    battery: vars.battery,
    inverter_count: vars.inverter_count,
    module_count: vars.module_count,
    ac: { inverter_to_board_m: vars.distance_inverter_board_m },
    site: { building_use: vars.building_use },
  };
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined && v !== null));
  for (const [k, v] of Object.entries(inputs.ctx ?? {})) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' ? { ...(b as object), ...(v as object) } : v;
  }
  return out;
}

/** Symbolic quantities used by add_line in the rules seed. */
function ruleQtyExpr(qty: unknown): string | null {
  if (typeof qty === 'number') return String(qty);
  switch (qty) {
    case 'per_inverter': return 'inverter_count';
    case 'per_module': return 'module_count';
    case 'per_pcs': return 'battery_count';
    default: return null;
  }
}

/**
 * priceQuote — the deterministic pricing order of specs/12 §3.1 (steps 1–14; step 4, the eplan BOM
 * override, arrives with M4). Same inputs + catalog + rules + config → same draft, byte for byte.
 * No number is invented: a missing input, cost, margin or VAT rate becomes a block issue
 * (HUMAN_INPUT_REQUIRED / MISSING_COST) instead of a guess.
 */
export function priceQuote(
  inputs: QuoteInputs,
  catalog: CatalogSnapshot,
  rules: Rule[],
  config: PricingConfig,
  opts: { functions?: Record<string, Fn> } = {},
): QuoteVersionDraft {
  const date = inputs.quote_date;
  const trace: TraceEntry[] = [];
  const issues: Issue[] = [];
  const flags: Record<string, unknown> = {};
  const costOpts: CostOptions = { asOf: date, fxRates: inputs.fx_rates, staleDays: paramValue(config, 'price_stale_days') as number | null };

  // ── 1. inputs ───────────────────────────────────────────────────────────────────────────────────
  const vars = normalizeInputs(inputs, catalog, config.lookup_tables);
  trace.push({ step: 1, what: 'inputs normalised', detail: { kwp: vars.kwp?.toString(), kw_ac: vars.kw_ac?.toString(), connection_kva: vars.connection_kva } });

  // ── 3 (evaluated first: the track resolver feeds assembly selection). Regulatory rules ───────────
  const ruleCtx = buildRuleCtx(vars, inputs);
  // specs/12 §3.1 step 3: pricing rules, the track resolver (submission <50), and design/submission rules
  // that add quote lines (R11–R15, R18–R20 …). Drawing/QA rules belong to S06 and stay out of the quote.
  const addsLines = (r: Rule) => r.consequences.some((c) => c.type === 'add_line' && c.params.kind !== 'task');
  const quoteRules = rules.filter((r) => r.scope === 'pricing' || (r.scope === 'submission' && r.priority < 50) || ((r.scope === 'design' || r.scope === 'submission') && addsLines(r)));
  const run = runRules(quoteRules, ruleCtx, {
    evaluationDate: date,
    scopes: ['submission', 'design', 'pricing'],
    tables: config.lookup_tables,
    params: config.parameters,
    // tier() needs a tier table that is not in the seed yet; unknown keeps the resolver's tariff_tier.
    functions: { tier: () => null, ...opts.functions },
    needsInputBlocks: (r) => r.scope === 'pricing',
  });
  Object.assign(flags, run.flags);
  if (vars.regulatory_track === undefined && run.flags.regulatory_track !== undefined) vars.regulatory_track = run.flags.regulatory_track;
  for (const b of run.blocks) issues.push({ code: b.missing ? 'HUMAN_INPUT_REQUIRED' : 'RULE_BLOCK', severity: 'block', ref: `rule:${b.rule_key}`, message_he: b.message_he, missing: b.missing });
  for (const w of run.warnings) issues.push({ code: 'RULE_WARN', severity: 'warn', ref: `rule:${w.rule_key}`, message_he: w.message_he, missing: w.missing });
  trace.push({ step: 3, what: 'rules evaluated', detail: run.results.filter((r) => r.outcome !== 'skipped').map((r) => `${r.key}:${r.outcome}`) });

  const salePrice: Fn = ([customerId, productId]) => {
    const list = catalog.priceLists.find((l) => l.list_type === 'sale' && l.status === 'approved' && l.customer_id === customerId && inDates(l, date));
    if (!list) return null;
    const e = catalog.entries.find((x) => x.price_list_id === list.id && x.product_id === productId);
    return e?.net_price === null || e?.net_price === undefined ? null : toValue(e.net_price);
  };
  const tables = { ...config.lookup_tables };
  const baseEnv: EvalEnv = { vars, tables, params: config.parameters, functions: { ...opts.functions, sale_price_list: salePrice } };

  // ── 2. assemblies ───────────────────────────────────────────────────────────────────────────────
  const assemblies = inputs.assemblies
    ? inputs.assemblies.map((code) => {
        const a = catalog.assemblies?.find((x) => x.code === code && x.status === 'active');
        if (!a) issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref: `assembly:${code}`, message_he: `ערכה ${code} לא נמצאה או לא פעילה` });
        return a;
      }).filter((a) => !!a)
    : selectAssemblies(catalog.assemblies ?? [], vars);
  const lines: WorkLine[] = [];
  let order = 0;
  const fromExpanded = (l: ExpandedLine, source: WorkLine['source'] = 'assembly', extra: Partial<WorkLine> = {}): WorkLine => ({
    key: l.key, order: order++, source, source_ref: { ...l.source_ref }, product: l.product, kind: l.product?.kind ?? null, subkind: l.product?.subkind ?? null,
    section: l.boq_section_code, title_he: l.title_he, unit: l.unit, qty: l.qty, qty_expr: l.qty_expr, inputs_used: l.inputs_used,
    resolved_by: l.resolved_by, customer_note_he: l.customer_note_he, verification_flag: l.verification_flag, optional: l.optional,
    option_group: l.option_group, selected: l.selected, regulatory: [], cost: null, unit_cost: null, unit_price: null, manual_price: false,
    rule_ids: [], margin_pct: null, passthrough: false, hide_price: false, in_lump: null, flags: [], discount_pct: ZERO,
    discount_schedule_id: null, vat_treatment: 'standard', line_total: null, ...extra,
  });
  for (const a of assemblies) {
    const r = expandAssembly(a, { env: baseEnv, catalog, cost: costOpts, options: inputs.options });
    lines.push(...r.lines.map((l) => fromExpanded(l)));
    issues.push(...r.issues);
  }
  trace.push({ step: 2, what: 'assemblies expanded', detail: assemblies.map((a) => `${a.code}@${a.version}`) });

  // ── 3 (cont.). rule lines → quote lines ───────────────────────────────────────────────────────────
  const customer_notes: QuoteVersionDraft['customer_notes'] = [];
  for (const rl of run.lines) addRuleLine(rl);

  function addRuleLine(rl: RuleLine) {
    const ref = `rule:${rl.rule_key}`;
    const reg = rl.rule_keys.map((k) => ({ rule_id: k, rule_verification: rl.verification, note_he: rl.text_he }));
    if (rl.kind === 'note') {
      if (rl.text_he) customer_notes.push({ rule_key: rl.rule_key, text_he: rl.text_he, verification_flag: rl.verification_flag });
      return;
    }
    if (rl.kind === 'task') return; // submission tasks belong to the workflow, not to the quote
    const map = rl.product_key ? catalog.ruleProductMap?.[rl.product_key] : undefined;
    const qtyExpr = map?.qty_expr ?? ruleQtyExpr(rl.qty);
    if (qtyExpr === null) {
      issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `כמות סימבולית '${String(rl.qty)}' עבור ${rl.product_key} — חסר qty_expr במיפוי`, missing: [`ruleProductMap.${rl.product_key}.qty_expr`] });
      return;
    }
    const q = evaluateNumber(qtyExpr, baseEnv);
    if (q.number === null) {
      issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `חסר נתון לכמות של ${rl.product_key}`, missing: q.missing });
      return;
    }
    if (q.number.lte(0)) return;

    if (map?.assembly_code) {
      const a = catalog.assemblies?.find((x) => x.code === map.assembly_code && x.status === 'active');
      if (!a) {
        issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref, message_he: `ערכה ${map.assembly_code} (מכלל ${rl.rule_key}) לא נמצאה` });
        return;
      }
      const r = expandAssembly(a, { env: baseEnv, catalog, cost: costOpts, options: inputs.options }, q.number);
      issues.push(...r.issues);
      for (const l of r.lines) {
        lines.push(fromExpanded(l, 'rule', { key: `rule:${rl.rule_key}/${l.key}`, source_ref: { rule_id: rl.rule_key, ...l.source_ref }, regulatory: reg, verification_flag: l.verification_flag || rl.verification_flag }));
      }
      return;
    }

    const product = map?.sku ? catalog.products.find((p) => p.sku === map.sku) ?? null : null;
    // A product the quote already carries (selected, not an option) is not added twice: a required rule
    // line cites the rule on the existing line; an optional one (R19c) is simply already included.
    const existing = product ? lines.filter((l) => l.product?.id === product.id && l.selected && !l.optional) : [];
    if (existing.length > 0) {
      if (!rl.optional) {
        for (const l of existing) {
          l.regulatory.push(...reg);
          l.verification_flag ||= rl.verification_flag;
        }
      }
      trace.push({ step: 3, what: 'rule satisfied by existing line', ref, detail: existing.map((l) => l.key) });
      return;
    }
    if (rl.product_key && !map) {
      issues.push({ code: 'UNRESOLVED_PRODUCT', severity: rl.optional ? 'warn' : 'block', ref, message_he: `לכלל ${rl.rule_key} אין מיפוי מוצר עבור '${rl.product_key}'` });
    }
    const isFee = rl.kind === 'fee' || product?.kind === 'fee';
    lines.push({
      key: `rule:${rl.rule_key}#${rl.product_key ?? 'line'}`, order: order++, source: 'rule', source_ref: { rule_id: rl.rule_key, rule_ids: rl.rule_keys, product_key: rl.product_key },
      product, kind: product?.kind ?? rl.kind, subkind: product?.subkind ?? null,
      section: map?.boq_section ?? product?.default_boq_section ?? (isFee ? '08.07' : '08.08'),
      title_he: rl.text_he ?? product?.name_he ?? rl.product_key ?? rl.rule_key, unit: product?.unit ?? 'komplet',
      qty: q.number, qty_expr: qtyExpr, inputs_used: q.used, resolved_by: ref, customer_note_he: null,
      verification_flag: rl.verification_flag, optional: rl.optional, option_group: rl.optional ? (rl.product_key ?? rl.rule_key) : null,
      selected: rl.optional ? !!inputs.options?.[rl.product_key ?? rl.rule_key] : true,
      regulatory: reg,
      // Fee amounts the seed itself carries (amount_ils) are an estimate for a passthrough line.
      cost: rl.amount_ils !== null ? { ...EMPTY_COST, unit_cost: new Decimal(rl.amount_ils), source_unit_cost: new Decimal(rl.amount_ils), currency: 'ILS', reason: `amount_ils מכלל ${rl.rule_key}` } : null,
      unit_cost: null, unit_price: null, manual_price: false, rule_ids: [], margin_pct: null, passthrough: false, hide_price: false,
      in_lump: null, flags: [], discount_pct: ZERO, discount_schedule_id: null, vat_treatment: 'standard', line_total: null,
    });
  }

  // ── 5. manual lines ──────────────────────────────────────────────────────────────────────────────
  for (const m of inputs.manual_lines ?? []) {
    const product = m.product_sku ? catalog.products.find((p) => p.sku === m.product_sku) ?? null : null;
    lines.push({
      key: `manual:${m.id}`, order: order++, source: 'manual', source_ref: { manual_id: m.id }, product, kind: product?.kind ?? null, subkind: product?.subkind ?? null,
      section: m.boq_section_code, title_he: m.title_he, unit: m.unit ?? product?.unit ?? 'komplet', qty: new Decimal(m.qty), qty_expr: null,
      inputs_used: {}, resolved_by: 'manual', customer_note_he: m.customer_note_he ?? null, verification_flag: false, optional: false, option_group: null,
      selected: true, regulatory: [],
      cost: m.unit_cost !== undefined ? { ...EMPTY_COST, unit_cost: new Decimal(m.unit_cost), source_unit_cost: new Decimal(m.unit_cost), currency: 'ILS', reason: 'manual' } : null,
      unit_cost: null, unit_price: m.unit_price !== undefined ? new Decimal(m.unit_price) : null, manual_price: m.unit_price !== undefined,
      rule_ids: [], margin_pct: null, passthrough: false, hide_price: false, in_lump: null, flags: [], discount_pct: ZERO,
      discount_schedule_id: null, vat_treatment: 'standard', line_total: null,
    });
  }

  // ── 6. cost ──────────────────────────────────────────────────────────────────────────────────────
  for (const l of lines) {
    if (!l.cost) l.cost = l.product ? resolveCost(l.product.id, catalog, costOpts) : { ...EMPTY_COST, reason: 'שורה ללא מוצר' };
    l.unit_cost = l.cost.unit_cost;
    const tech = (l.product?.tech ?? {}) as Record<string, unknown>;
    if (l.kind === 'fee') {
      l.vat_treatment = (tech.vat_treatment as WorkLine['vat_treatment'] | undefined) ?? 'unknown';
      if (tech.passthrough !== false) l.passthrough = true;
    }
    if (l.cost.is_stale) l.flags.push('stale_price');
  }
  trace.push({ step: 6, what: 'costs resolved', detail: lines.map((l) => [l.key, s(l.unit_cost), l.cost?.price_list_id ?? l.cost?.reason]) });

  // ── 7. pricing rules ─────────────────────────────────────────────────────────────────────────────
  const prules = config.pricing_rules.filter((r) => inDates(r, date)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const kwp = vars.kwp === undefined || vars.kwp === null ? null : new Decimal(vars.kwp as Decimal.Value);
  const lumpRules = new Map<string, PricingRule>();
  let linkage: Record<string, unknown> | null = null;
  const warnedOnce = new Set<string>();
  const warnOnce = (id: string, msg: string, code: Issue['code'] = 'HUMAN_INPUT_REQUIRED') => {
    if (warnedOnce.has(id)) return;
    warnedOnce.add(id);
    issues.push({ code, severity: 'warn', ref: `pricing_rule:${id}`, message_he: msg });
  };

  const lineEnv = (l: WorkLine): EvalEnv => ({
    ...baseEnv,
    vars: {
      ...vars,
      inputs: vars,
      customer: inputs.customer,
      product: l.product ? { ...productVars(l.product), tech: l.product.tech } : null,
      line: {
        unit_cost: l.unit_cost, qty: l.qty, kind: l.kind, subkind: l.subkind, boq_section: l.section, product_id: l.product?.id ?? null,
        price_snapshot: { cost: { currency: l.cost?.currency ?? null, is_stale: l.cost?.is_stale ?? null } },
      },
    },
  });

  const scopeMatches = (r: PricingRule, l: WorkLine): boolean => {
    const sc = r.scope ?? {};
    if (sc.kind && !sc.kind.includes(l.kind ?? '')) return false;
    if (sc.subkind && !sc.subkind.includes(l.subkind ?? '')) return false;
    if (sc.boq_section && !sc.boq_section.includes(l.section)) return false;
    if (sc.customer_type && !sc.customer_type.includes(inputs.customer.type)) return false;
    if (sc.regulatory_track && !sc.regulatory_track.includes(String(vars.regulatory_track))) return false;
    if (sc.kwp_min !== undefined && sc.kwp_min !== null && (kwp === null || kwp.lt(sc.kwp_min))) return false;
    if (sc.kwp_max !== undefined && sc.kwp_max !== null && (kwp === null || kwp.gt(sc.kwp_max))) return false;
    if (sc.supplier_id && l.cost?.supplier_id !== sc.supplier_id) return false;
    if (sc.product_ids && !sc.product_ids.includes(l.product?.id ?? '')) return false;
    return true;
  };

  for (const l of lines) {
    const env = lineEnv(l);
    const matching = prules.filter((r) => scopeMatches(r, l) && evaluateBool(r.when, env).bool === true);
    const priceRules = matching.filter((r) => PRICE_ACTIONS.includes(r.action.type as PriceActionType));
    const ref = `line:${l.key}`;

    if (!l.manual_price) {
      const winner = priceRules[0];
      const tie = priceRules.find((r) => r !== winner && !r.stack && !winner?.stack && r.priority === winner?.priority);
      if (winner && tie) {
        issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref: `pricing_rule:${winner.id}`, message_he: `שני כללי מחיר באותה עדיפות תואמים לשורה ${l.key}: ${winner.id}, ${tie.id}` });
      }
      if (winner) {
        l.rule_ids.push(winner.id);
        priceWith(l, winner, env);
      } else if (l.passthrough) {
        l.unit_price = l.unit_cost; // a fee nobody priced stays at cost ("לפי חשבון בפועל")
      } else {
        const dm = paramValue(config, 'default_margin_pct');
        if (dm === null) {
          if (l.unit_cost !== null) issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `אין כלל מחיר תואם ו-default_margin_pct לא הוגדר (${l.title_he})`, missing: ['parameters.default_margin_pct'] });
        } else if (l.unit_cost !== null) {
          l.margin_pct = new Decimal(dm as number);
          l.unit_price = marginPrice(l.unit_cost, l.margin_pct, 'param:default_margin_pct');
          l.rule_ids.push('param:default_margin_pct');
        }
      }
    }

    // Modifiers: per action type the first matching non-stacking rule wins; stacking rules all apply.
    const seenTypes = new Set<string>();
    for (const r of matching) {
      const t = r.action.type;
      if (PRICE_ACTIONS.includes(t as PriceActionType)) continue;
      if (!r.stack && seenTypes.has(t)) continue;
      seenTypes.add(t);
      switch (t) {
        case 'round_unit_price': {
          if (r.action.step === null || r.action.step === undefined) { warnOnce(r.id, `${r.name_he}: צעד העיגול לא הוגדר — המחיר לא עוגל`); break; }
          if (l.unit_price !== null) l.unit_price = l.unit_price.div(r.action.step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(r.action.step);
          l.rule_ids.push(r.id);
          break;
        }
        case 'hide_price': l.hide_price = true; l.rule_ids.push(r.id); break;
        case 'flag': l.flags.push(String(r.action.flag)); l.rule_ids.push(r.id); break;
        case 'linkage':
          linkage = { kind: 'fx', currency: r.action.currency, base_rate_source: r.action.base_rate_source, threshold_pct: r.action.threshold_pct ?? null, rule_id: r.id };
          l.rule_ids.push(r.id);
          break;
        case 'price_per_kwp': lumpRules.set(r.id, r); l.in_lump = r.id; l.rule_ids.push(r.id); break;
        case 'discount_cap_pct': l.rule_ids.push(r.id); break; // checked after discounts
        case 'min_margin_pct': break; // quote level, below
      }
    }
    if (l.unit_cost === null && !l.passthrough && !l.manual_price && l.unit_price === null) {
      issues.push({ code: 'MISSING_COST', severity: l.selected ? 'block' : 'warn', ref, message_he: `אין עלות לשורה "${l.title_he}": ${l.cost?.reason ?? ''}`.trim() });
      flags.missing_cost = true;
    }
  }

  function marginPrice(cost: Decimal, m: Decimal, ref: string): Decimal | null {
    if (m.gte(100)) {
      issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref, message_he: 'מרווח של 100% או יותר אינו אפשרי' });
      return null;
    }
    return cost.div(HUNDRED.minus(m).div(HUNDRED));
  }

  function priceWith(l: WorkLine, r: PricingRule, env: EvalEnv) {
    const ref = `pricing_rule:${r.id}`;
    const need = (what: string) =>
      issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref, message_he: `${r.name_he}: ${what} לא הוגדר`, missing: [`pricing_rules.${r.id}.action.value`] });
    switch (r.action.type) {
      case 'passthrough':
        l.passthrough = true;
        l.unit_price = l.unit_cost;
        return;
      case 'margin_pct':
      case 'markup_pct': {
        if (r.action.value === null || r.action.value === undefined) { need('אחוז'); return; }
        if (l.unit_cost === null) return;
        const v = new Decimal(r.action.value as number);
        if (r.action.type === 'margin_pct') {
          l.margin_pct = v;
          l.unit_price = marginPrice(l.unit_cost, v, ref);
        } else {
          l.unit_price = l.unit_cost.times(HUNDRED.plus(v).div(HUNDRED));
        }
        return;
      }
      case 'price_per_unit': {
        let v: unknown = r.action.value;
        if (v === 'from_sale_price_list') {
          v = salePrice([toValue(inputs.customer.id ?? null), toValue(l.product?.id ?? null)], baseEnv);
          v = v === null ? null : (v as Decimal).toNumber();
        } else if (r.action.lookup) {
          const key = readPath(env.vars, r.action.lookup.key);
          const rows = config.lookup_tables[r.action.lookup.table]?.rows ?? {};
          v = key === undefined || key === null || !Object.hasOwn(rows, String(key)) ? null : rows[String(key)] ?? null;
          if (v === null) { need(`ערך בטבלה ${r.action.lookup.table}[${String(key)}]`); return; }
        }
        if (v === null || v === undefined) { need('מחיר'); return; }
        l.unit_price = new Decimal(v as number);
        return;
      }
    }
  }
  trace.push({ step: 7, what: 'pricing rules applied', detail: lines.map((l) => [l.key, l.rule_ids]) });

  // ── 8. discounts ─────────────────────────────────────────────────────────────────────────────────
  for (const l of lines) {
    const d = inputs.line_discounts?.[l.key];
    if (d !== undefined) l.discount_pct = new Decimal(d);
  }
  for (const ds of config.discount_schedules.filter((x) => x.basis === 'line.qty')) {
    for (const l of lines) {
      if (ds.applies_to.kind && !ds.applies_to.kind.includes(l.kind ?? '')) continue;
      const tier = ds.tiers.find((t) => t.qty_from !== null && t.qty_from !== undefined && l.qty.gte(t.qty_from) && (t.qty_to === null || t.qty_to === undefined || l.qty.lt(t.qty_to)));
      if (!tier || tier.unit_price_adjust_pct === null || tier.unit_price_adjust_pct === undefined) {
        if (ds.tiers.some((t) => t.unit_price_adjust_pct === null)) warnOnce(ds.id, `${ds.name_he}: מדרגות לא הוגדרו — לא הוחל`);
        continue;
      }
      if (l.unit_price !== null) l.unit_price = l.unit_price.times(HUNDRED.plus(tier.unit_price_adjust_pct).div(HUNDRED));
      l.discount_schedule_id = ds.id;
    }
  }

  // Line totals (step 11 rounding: ROUND_HALF_UP to 2dp per line, sums from rounded lines).
  for (const l of lines) {
    l.line_total = l.unit_price === null ? null : money(l.unit_price.times(HUNDRED.minus(l.discount_pct).div(HUNDRED)).times(l.qty));
  }

  const counted = (l: WorkLine) => l.selected && !l.passthrough;
  const sum = (xs: (Decimal | null)[]) => xs.reduce<Decimal>((a, b) => a.plus(b ?? 0), ZERO);
  const lumpLines: WorkLine[] = [];
  for (const r of lumpRules.values()) {
    const v = r.action.lookup ? (config.lookup_tables[r.action.lookup.table]?.rows ?? {})[String(readPath({ inputs: vars }, r.action.lookup.key))] : r.action.value;
    if (v === null || v === undefined || kwp === null) {
      issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref: `pricing_rule:${r.id}`, message_he: `${r.name_he}: מחיר ל-kWp לא הוגדר`, missing: [`pricing_rules.${r.id}`] });
      continue;
    }
    const folded = lines.filter((l) => l.in_lump === r.id && counted(l));
    lumpLines.push({
      ...folded[0]!, key: `lump:${r.id}`, order: order++, source: 'manual', source_ref: { pricing_rule_id: r.id, folded: folded.map((l) => l.key) },
      product: null, kind: null, subkind: null, title_he: 'מערכת סולארית קומפלט', unit: 'kwp', qty: kwp, qty_expr: 'kwp', inputs_used: { kwp: kwp.toString() },
      resolved_by: `pricing_rule:${r.id}`, customer_note_he: null, verification_flag: false, optional: false, option_group: null, selected: true,
      regulatory: [], cost: null, unit_cost: sum(folded.map((l) => (l.unit_cost ? l.unit_cost.times(l.qty) : null))).div(kwp),
      unit_price: new Decimal(v as number), manual_price: true, rule_ids: [r.id], margin_pct: null, passthrough: false, hide_price: false,
      in_lump: null, flags: [], discount_pct: ZERO, discount_schedule_id: null, vat_treatment: 'standard', line_total: money(new Decimal(v as number).times(kwp)),
    });
  }
  // Lines folded into a priced lump-sum line stay internal (cost, KPI) but leave the customer totals.
  const lumped = new Set(lumpLines.map((x) => x.rule_ids[0]));
  const customerLines = [...lines.filter((l) => !l.in_lump || !lumped.has(l.in_lump)), ...lumpLines];

  const gross = sum(customerLines.filter(counted).map((l) => (l.unit_price === null ? null : money(l.unit_price.times(l.qty)))));
  const afterLine = sum(customerLines.filter(counted).map((l) => l.line_total));
  const lineDiscounts = gross.minus(afterLine);

  let overallPct = ZERO;
  const manualPct = inputs.discount_pct ?? null;
  for (const ds of config.discount_schedules.filter((x) => x.basis === 'totals.before_discount')) {
    const at = ds.applies_to;
    if (at.customer_type && !at.customer_type.includes(inputs.customer.type)) continue;
    if (at.regulatory_track && !at.regulatory_track.includes(String(vars.regulatory_track))) continue;
    if (at.when && evaluateBool(at.when, { ...baseEnv, vars: { ...vars, customer: inputs.customer } }).bool !== true) continue;
    for (const tier of ds.tiers) {
      if (tier.discount_pct === 'manual') {
        if (manualPct !== null) { overallPct = overallPct.plus(manualPct); trace.push({ step: 8, what: 'manual discount', ref: ds.id, detail: manualPct }); }
        continue;
      }
      if (!ds.stack_with_manual && manualPct !== null) continue; // a manual discount replaces non-stacking schedules
      const inTier = tier.kwp_from === undefined || (tier.kwp_from !== null && kwp !== null && kwp.gte(tier.kwp_from) && (tier.kwp_to === null || tier.kwp_to === undefined || kwp.lt(tier.kwp_to)));
      if (tier.discount_pct === null || tier.discount_pct === undefined || tier.kwp_from === null) {
        warnOnce(ds.id, `${ds.name_he}: מדרגות לא הוגדרו — לא הוחל`);
        continue;
      }
      if (inTier) { overallPct = overallPct.plus(tier.discount_pct); trace.push({ step: 8, what: 'discount schedule', ref: ds.id, detail: tier.discount_pct }); }
    }
  }
  if (manualPct !== null && !config.discount_schedules.some((d) => d.tiers.some((t) => t.discount_pct === 'manual'))) overallPct = overallPct.plus(manualPct);

  const overallDiscount = money(afterLine.times(overallPct).div(HUNDRED));
  for (const l of lines) {
    const cap = prules.find((r) => r.action.type === 'discount_cap_pct' && l.rule_ids.includes(r.id));
    if (cap && cap.action.value !== null && cap.action.value !== undefined && l.discount_pct.plus(overallPct).gt(cap.action.value as number)) {
      flags.discount_cap_breach = true;
    }
  }

  // ── 11. final rounding as an explicit line ───────────────────────────────────────────────────────
  let beforeVat = afterLine.minus(overallDiscount);
  const rounding = config.parameters.rounding as unknown as { final_round_step_ils?: number | null } | undefined;
  let roundingDelta = ZERO;
  if (rounding?.final_round_step_ils) {
    const step = new Decimal(rounding.final_round_step_ils);
    roundingDelta = beforeVat.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(step).minus(beforeVat);
    beforeVat = beforeVat.plus(roundingDelta);
  }

  // ── 10. VAT ──────────────────────────────────────────────────────────────────────────────────────
  const vatParam = config.parameters.vat_rate;
  let vatRate: Decimal | null = null;
  if (!vatParam || vatParam.value === null || vatParam.value === undefined) {
    issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref: 'param:vat_rate', message_he: 'שיעור המע"מ לא הוגדר בפרמטרים', missing: ['parameters.vat_rate.value'] });
  } else if (vatParam.valid_from && vatParam.valid_from > date) {
    issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'block', ref: 'param:vat_rate', message_he: `שיעור המע"מ בתוקף רק מ-${vatParam.valid_from}`, missing: ['parameters.vat_rate'] });
  } else {
    vatRate = new Decimal(vatParam.value as number);
    if (vatParam.verification !== 'office' && vatParam.verification !== 'validated') {
      issues.push({ code: 'VERIFICATION', severity: 'warn', ref: 'param:vat_rate', message_he: 'שיעור המע"מ מסומן לאימות' });
    }
  }
  const exempt = sum(customerLines.filter((l) => counted(l) && l.vat_treatment === 'exempt').map((l) => l.line_total));
  const vatBase = beforeVat.minus(afterLine.isZero() ? ZERO : money(exempt.times(afterLine.minus(overallDiscount)).div(afterLine)));
  const vat = vatRate === null ? null : money(vatBase.times(vatRate));
  if (customerLines.some((l) => counted(l) && l.vat_treatment === 'unknown')) {
    issues.push({ code: 'VERIFICATION', severity: 'warn', ref: 'vat', message_he: 'יש שורת אגרה שמעמד המע"מ שלה לא ידוע — חויבה במע"מ רגיל' });
  }

  // ── 9. approval thresholds ───────────────────────────────────────────────────────────────────────
  const costTotal = money(sum(lines.filter(counted).map((l) => (l.unit_cost === null ? null : l.unit_cost.times(l.qty)))));
  const marginTotal = beforeVat.isZero() ? null : beforeVat.minus(costTotal).div(beforeVat).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const minMargin = prules.find((r) => r.action.type === 'min_margin_pct');
  if (minMargin) {
    if (minMargin.action.value === null || minMargin.action.value === undefined) warnOnce(minMargin.id, `${minMargin.name_he}: הרצפה לא הוגדרה`);
    else if (marginTotal !== null) flags.min_margin_breach = marginTotal.lt(minMargin.action.value as number);
  }
  const effectivePct = gross.isZero() ? ZERO : gross.minus(afterLine.minus(overallDiscount)).div(gross).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const stale = lines.filter((l) => l.flags.includes('stale_price')).map((l) => l.key);
  flags.stale_prices = stale;
  flags.unmapped_bom = false;
  flags.rule_without_threshold = false;
  flags.missing_cost = !!flags.missing_cost;

  const approvalReasons: QuoteVersionDraft['approval']['reasons'] = [];
  const blocked = () => issues.some((i) => i.severity === 'block');
  for (const at of config.approval_thresholds) {
    const env: EvalEnv = {
      ...baseEnv,
      vars: {
        totals: { discount_pct_effective: effectivePct, before_vat: beforeVat },
        flags,
        version: { created_by: { role: inputs.created_by_role ?? 'human' } },
        threshold: at.threshold ? at.threshold.value : null,
      },
    };
    const r = evaluateBool(at.when, env);
    if (r.bool === false) continue;
    const unknown = r.bool === null;
    if (at.effect === 'blocked') {
      if (!unknown) issues.push({ code: 'CONFIG_ERROR', severity: 'block', ref: `approval:${at.id}`, message_he: at.name_he });
      continue;
    }
    if (at.effect === 'warn_or_block_by_param') {
      if (unknown) continue;
      const block = paramValue(config, 'block_on_stale') === true;
      issues.push({ code: 'STALE_PRICE', severity: block ? 'block' : 'warn', ref: `approval:${at.id}`, message_he: `${at.name_he}: ${stale.join(', ')}` });
      continue;
    }
    // An unset threshold cannot clear the quote: it goes to the owner (Law #1), with the reason named.
    approvalReasons.push({ id: at.id, name_he: unknown ? `${at.name_he} (הסף לא הוגדר)` : at.name_he, approver_role: at.approver_role });
  }

  // ── 12. validity and linkage ─────────────────────────────────────────────────────────────────────
  const validity = paramValue(config, 'validity_days_default');
  if (validity === null) issues.push({ code: 'HUMAN_INPUT_REQUIRED', severity: 'warn', ref: 'param:validity_days_default', message_he: 'תוקף ההצעה (ימים) לא הוגדר', missing: ['parameters.validity_days_default.value'] });
  const valid_until = validity === null ? null : addDays(date, Number(validity));

  // ── 13–14. KPI and snapshot ──────────────────────────────────────────────────────────────────────
  const allLines = [...lines, ...lumpLines].sort((a, b) => a.section.localeCompare(b.section) || a.order - b.order);
  const perSection = new Map<string, number>();
  const outLines: QuoteLine[] = allLines.map((l) => {
    const n = (perSection.get(l.section) ?? 0) + 10;
    perSection.set(l.section, n);
    return toQuoteLine(l, `${l.section}.${String(n).padStart(4, '0')}`, vatRate);
  });
  const sections = [...new Set(allLines.map((l) => l.section))].map((code) => ({
    code,
    title_he: BOQ_SECTIONS[code] ?? code,
    subtotal: sum(customerLines.filter((l) => l.section === code && counted(l)).map((l) => l.line_total)).toFixed(2),
  }));

  const totals: QuoteTotals = {
    gross_before_discount: gross.toFixed(2),
    line_discounts: lineDiscounts.toFixed(2),
    overall_discount_pct: overallPct.toString(),
    overall_discount: overallDiscount.toFixed(2),
    discount_pct_effective: effectivePct.toString(),
    rounding: roundingDelta.toFixed(2),
    before_vat: beforeVat.toFixed(2),
    vat_base: vatBase.toFixed(2),
    vat_rate: s(vatRate),
    vat: vat === null ? null : vat.toFixed(2),
    incl_vat: vat === null ? null : beforeVat.plus(vat).toFixed(2),
    passthrough_estimate: sum(lines.filter((l) => l.selected && l.passthrough).map((l) => (l.unit_cost ? money(l.unit_cost.times(l.qty)) : null))).toFixed(2),
    options_total: sum(customerLines.filter((l) => !l.selected && !l.passthrough).map((l) => l.line_total)).toFixed(2),
  };

  const status: QuoteVersionDraft['status'] = approvalReasons.length > 0 ? 'pending_approval' : 'draft';
  trace.push({ step: 14, what: 'snapshot', detail: { status, blocked: blocked(), lines: outLines.length } });

  return {
    status,
    blocked: blocked(),
    quote_date: date,
    valid_until,
    inputs_snapshot: JSON.parse(canonicalJson({ ...inputs, derived: { kwp: s(kwp), kw_ac: vars.kw_ac?.toString() ?? null, connection_kva: vars.connection_kva ?? null, regulatory_track: vars.regulatory_track ?? null } })),
    assemblies_used: assemblies.map((a) => ({ code: a.code, version: a.version })),
    rules_snapshot: run.results.map((r) => ({ key: r.key, verification: r.verification })),
    params_snapshot: JSON.parse(canonicalJson(config.parameters)),
    sections,
    lines: outLines,
    totals,
    kpi: {
      cost_total: costTotal.toFixed(2),
      margin_total_pct: marginTotal === null ? null : marginTotal.toString(),
      price_per_kwp_excl_vat: kwp === null || kwp.isZero() ? null : money(beforeVat.div(kwp)).toFixed(2),
    },
    approval: { required: approvalReasons.length > 0, reasons: approvalReasons },
    linkage,
    flags,
    customer_notes,
    documents: run.documents.map((d) => ({ kind: d.kind, rule_keys: d.rule_keys, conditional: d.conditional })),
    issues,
    trace,
  };
}

function toQuoteLine(l: WorkLine, line_no: string, vatRate: Decimal | null): QuoteLine {
  const c = l.cost ?? EMPTY_COST;
  return {
    key: l.key,
    line_no,
    section_code: l.section,
    source: l.source,
    source_ref: l.source_ref,
    product_id: l.product?.id ?? null,
    kind: l.kind,
    title_he: l.title_he,
    unit: l.unit,
    qty: l.qty.toString(),
    unit_cost: s(l.unit_cost),
    unit_price: l.unit_price === null ? null : money(l.unit_price).toFixed(2),
    discount_pct: l.discount_pct.toString(),
    line_total: l.line_total === null ? null : l.line_total.toFixed(2),
    customer_note_he: l.customer_note_he,
    verification_flag: l.verification_flag,
    optional: l.optional,
    option_group: l.option_group,
    selected: l.selected,
    passthrough: l.passthrough,
    hide_price: l.hide_price,
    in_lump: l.in_lump,
    flags: l.flags,
    price_snapshot: {
      product: l.product ? { id: l.product.id, sku: l.product.sku, name_he: l.product.name_he, kind: l.product.kind, tech_hash: sha256Hex(canonicalJson(l.product.tech)) } : null,
      cost: { ...c, unit_cost: s(c.unit_cost), source_unit_cost: s(c.source_unit_cost) },
      pricing: {
        rule_ids: l.rule_ids, margin_pct: s(l.margin_pct), unit_price: s(l.unit_price), discount_pct: l.discount_pct.toString(),
        discount_schedule_id: l.discount_schedule_id, rounding: 'line_2dp_half_up',
      },
      qty: { expr: l.qty_expr, inputs_used: JSON.parse(canonicalJson(Object.fromEntries(Object.entries(l.inputs_used).map(([k, v]) => [k, Decimal.isDecimal(v) ? (v as Decimal).toString() : v])))), resolved_by: l.resolved_by },
      regulatory: l.regulatory,
      vat: { rate: s(vatRate), treatment: l.vat_treatment },
    },
  };
}
