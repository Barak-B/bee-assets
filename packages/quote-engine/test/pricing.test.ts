import Decimal from 'decimal.js';
import { priceQuote, type QuoteVersionDraft } from '../src/index.ts';
import pricingSeed from '../../../docs/plan/rules/pricing-rules.json' with { type: 'json' };
import type { PricingConfig } from '../src/index.ts';
import { catalog, commercialInputs, residentialInputs, seedRules, testConfig } from './fixtures.ts';

const price = (inputs = residentialInputs(), config = testConfig(), cat = catalog) => priceQuote(inputs, cat, seedRules, config);
const line = (q: QuoteVersionDraft, title: string) => {
  const l = q.lines.find((x) => x.title_he.startsWith(title));
  if (!l) throw new Error(`no line "${title}" in ${q.lines.map((x) => x.title_he).join(' | ')}`);
  return l;
};
const blockRefs = (q: QuoteVersionDraft) => q.issues.filter((i) => i.severity === 'block').map((i) => i.ref);
const D = (x: string | null) => new Decimal(x ?? 0);

describe('residential 10.44 kWp golden quote (fixture prices)', () => {
  const q = price();

  it('is a clean draft: nothing blocks, nothing needs approval', () => {
    expect(blockRefs(q)).toEqual([]);
    expect(q.blocked).toBe(false);
    expect(q.status).toBe('draft');
    expect(q.inputs_snapshot.derived).toMatchObject({ kwp: '10.44', kw_ac: '10', regulatory_track: 'residential_le15' });
  });

  it('prices lines by the pricing rules, with exact decimals', () => {
    // module: 80 USD × 3.7 = 296 ₪; margin 25% → 394.67; PR-008 rounds to 10 → 390
    expect(line(q, 'מודול PV')).toMatchObject({ qty: '18', unit_cost: '296', unit_price: '390.00', line_total: '7020.00' });
    expect(line(q, 'מודול PV').price_snapshot.pricing.rule_ids).toEqual(['PR-001', 'PR-008', 'PR-009']);
    // BOS margin 35%: 12 / 0.65 × 36 = 664.615… → 664.62 (rounded per line, half-up)
    expect(line(q, 'מתלה רעפים')).toMatchObject({ qty: '36', unit_price: '18.46', line_total: '664.62', verification_flag: true });
    // labour by lookup table (tile → 120 per module), internal services fixed, subcontractor +15%
    expect(line(q, 'התקנת מודולים')).toMatchObject({ unit_price: '120.00', line_total: '2160.00' });
    expect(line(q, 'תכנון חשמלי')).toMatchObject({ unit_price: '2000.00' });
    expect(line(q, 'אישור קונסטרוקטור')).toMatchObject({ unit_price: '1725.00', source: 'rule' });
    // no pricing rule → default_margin_pct, and the line says so
    expect(line(q, 'התקנת ממיר').price_snapshot.pricing.rule_ids).toEqual(['param:default_margin_pct']);
  });

  it('adds regulatory lines from the rules and cites the rule on lines the assembly already has', () => {
    expect(line(q, 'מוליך הארקה 10').price_snapshot.regulatory[0]!.rule_id).toBe('R14.earthing_conductors');
    expect(line(q, 'מוליך הארקה 10').qty).toBe('7'); // up(2 rows × 2 m + 3, 1)
    expect(line(q, 'מפסק ראשי PV').source).toBe('assembly');
    expect(line(q, 'מפסק ראשי PV').price_snapshot.regulatory.map((r) => r.rule_id)).toEqual(['R11.pv_main_switch']);
    expect(q.lines.filter((l) => l.title_he.startsWith('מפסק ראשי PV'))).toHaveLength(1);
    expect(line(q, 'דיווח פטור מהיתר')).toMatchObject({ verification_flag: true }); // R18 is `summary`
    expect(q.customer_notes).toEqual([{ rule_key: 'R23.boards_61439', text_he: 'לוח בתו תקן ת"י 61439-2', verification_flag: true }]);
    expect(q.documents.map((d) => d.kind)).toContain('structural_engineer_approval');
  });

  it('keeps the IEC fee as passthrough: shown with its estimate, outside the totals', () => {
    const fee = line(q, 'אגרת חח"י');
    expect(fee).toMatchObject({ passthrough: true, unit_cost: '704.22', verification_flag: true });
    expect(q.totals.passthrough_estimate).toBe('704.22');
  });

  it('totals add up: lines → sections → before VAT → VAT', () => {
    const counted = q.lines.filter((l) => l.selected && !l.passthrough);
    const sumLines = counted.reduce((a, l) => a.plus(D(l.line_total)), new Decimal(0));
    const sumSections = q.sections.reduce((a, s) => a.plus(s.subtotal), new Decimal(0));
    expect(sumLines.toFixed(2)).toBe(q.totals.gross_before_discount);
    expect(sumSections.toFixed(2)).toBe(q.totals.before_vat);
    expect(q.totals).toMatchObject({ before_vat: '29412.69', vat_rate: '0.18', vat: '5294.28', incl_vat: '34706.97', options_total: '1035.00' });
    expect(q.kpi).toEqual({ cost_total: '19907.50', margin_total_pct: '32.32', price_per_kwp_excl_vat: '2817.31' });
  });

  it('every priced line explains its price: price list + rule (WP-M1-04)', () => {
    for (const l of q.lines.filter((x) => !x.passthrough)) {
      expect(l.price_snapshot.cost.price_list_id, l.title_he).not.toBeNull();
      expect(l.price_snapshot.pricing.rule_ids.length, l.title_he).toBeGreaterThan(0);
      expect(l.price_snapshot.product?.tech_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('numbers lines per BOQ chapter and sets validity from the parameter', () => {
    expect(q.lines.filter((l) => l.section_code === '08.05').map((l) => l.line_no).slice(0, 3)).toEqual(['08.05.0010', '08.05.0020', '08.05.0030']);
    expect(q.valid_until).toBe('2026-11-16');
  });
});

describe('commercial 50.46 kWp on 3×63A (WP-M1-05 acceptance)', () => {
  const q = price(commercialInputs());

  it('R7: connection 3×63A (43.6 kVA) is too small for 50 kW → upgrade line + flag', () => {
    expect(q.flags.connection_upgrade_needed).toBe(true);
    expect(line(q, 'הגדלת חיבור')).toMatchObject({ passthrough: true, source: 'rule', line_total: null });
    expect(q.issues.find((i) => i.ref === 'rule:R7.connection_size')!.message_he).toMatch(/הגבלת הספק/);
  });

  it('R8: above 15 kW the production-meter cabinet kit is added', () => {
    expect(line(q, 'ארון מונה ייצור')).toMatchObject({ qty: '1', source: 'rule' });
    expect(line(q, 'מנתקים QS-M1')).toMatchObject({ qty: '2' });
    expect(q.documents.map((d) => d.kind)).toContain('sld_signed');
  });

  it('an inverter that requires RCD type B gets type B through the assembly query', () => {
    expect(line(q, 'ממסר פחת סוג B')).toMatchObject({ qty: '2' });
  });

  it('a line from an unverified rule carries the "לאימות" mark', () => {
    expect(line(q, 'אגרת חח"י — לפי הצעת חשבון')).toMatchObject({ verification_flag: true, passthrough: true });
  });

  it('applies the kWp tier discount on the total', () => {
    expect(q.totals).toMatchObject({ gross_before_discount: '110579.62', overall_discount_pct: '3', overall_discount: '3317.39', before_vat: '107262.23' });
  });
});

describe('determinism', () => {
  it('same inputs → identical draft, regardless of catalog order', () => {
    const a = price(commercialInputs());
    const shuffled = { ...catalog, products: [...catalog.products].reverse(), entries: [...catalog.entries].reverse(), priceLists: [...catalog.priceLists].reverse() };
    expect(JSON.stringify(price(commercialInputs()))).toBe(JSON.stringify(a));
    expect(JSON.stringify(price(commercialInputs(), testConfig(), shuffled))).toBe(JSON.stringify(a));
  });
});

describe('HUMAN_INPUT_REQUIRED instead of guesses', () => {
  it('no VAT rate → blocked', () => {
    const q = price(residentialInputs(), testConfig((c) => { c.parameters.vat_rate!.value = null; }));
    expect(q.blocked).toBe(true);
    expect(blockRefs(q)).toContain('param:vat_rate');
    expect(q.totals.vat).toBeNull();
  });
  it('a pricing rule without a value → blocked, naming the rule', () => {
    const q = price(residentialInputs(), testConfig((c) => { c.pricing_rules.find((r) => r.id === 'PR-001')!.action.value = null; }));
    expect(blockRefs(q)).toContain('pricing_rule:PR-001');
    expect(line(q, 'מודול PV').unit_price).toBeNull();
  });
  it('the untouched seed blocks on every owner number it is missing', () => {
    const q = price(residentialInputs(), testConfig((c) => { c.parameters.default_margin_pct!.value = null; c.parameters.vat_rate!.value = null; c.pricing_rules.forEach((r) => { if (r.action.type === 'margin_pct') r.action.value = null; }); }));
    expect(q.blocked).toBe(true);
    expect(new Set(blockRefs(q))).toEqual(new Set(['pricing_rule:PR-001', 'pricing_rule:PR-002', 'line:assembly:ASM-RES-TILE-SE#32', 'param:vat_rate']));
  });
  it('runs on pricing-rules.json exactly as seeded (all nulls) without crashing, and blocks', () => {
    const q = price(residentialInputs(), pricingSeed as unknown as PricingConfig);
    expect(q.blocked).toBe(true);
    expect(q.status).toBe('pending_approval'); // unset thresholds go to the owner
    expect(blockRefs(q)).toContain('param:vat_rate');
  });
  it('a missing survey input → blocked with the input name', () => {
    const inputs = residentialInputs();
    delete inputs.values.dc_m;
    const q = price(inputs);
    expect(q.issues.find((i) => i.ref === 'assembly:ASM-RES-TILE-SE#9')).toMatchObject({ code: 'HUMAN_INPUT_REQUIRED', missing: ['dc_m'] });
  });
  it('no exchange rate → the imported items have no cost → blocked', () => {
    const q = price(residentialInputs({ fx_rates: {} }));
    expect(q.issues.filter((i) => i.code === 'MISSING_COST').map((i) => i.ref)).toEqual([
      'line:assembly:ASM-RES-TILE-SE#1', 'line:assembly:ASM-RES-TILE-SE#2', 'line:assembly:ASM-RES-TILE-SE#3',
    ]);
  });
});

describe('approvals (ApprovalThreshold, Law #1)', () => {
  it('a manual discount above AT-001 → pending_approval', () => {
    const q = price(residentialInputs({ discount_pct: 12 }));
    expect(q.totals).toMatchObject({ overall_discount_pct: '12', discount_pct_effective: '12' });
    expect(q.status).toBe('pending_approval');
    expect(q.approval.reasons.map((r) => r.id)).toEqual(['AT-001']);
  });
  it('an unset threshold sends the quote to the owner, saying why', () => {
    const q = price(residentialInputs(), testConfig((c) => { c.approval_thresholds.find((a) => a.id === 'AT-003')!.threshold!.value = null; }));
    expect(q.approval.reasons).toEqual([{ id: 'AT-003', name_he: expect.stringContaining('הסף לא הוגדר'), approver_role: 'owner' }]);
  });
  it('a quote drafted by an agent always needs a human', () => {
    expect(price(residentialInputs({ created_by_role: 'agent' })).approval.reasons.map((r) => r.id)).toEqual(['AT-004']);
  });
  it('margin under the floor (PR-007) → AT-002', () => {
    const q = price(residentialInputs(), testConfig((c) => { c.pricing_rules.find((r) => r.id === 'PR-007')!.action.value = 40; }));
    expect(q.flags.min_margin_breach).toBe(true);
    expect(q.approval.reasons.map((r) => r.id)).toEqual(['AT-002']);
  });
  it('stale prices warn, and block only when block_on_stale is set', () => {
    const late = residentialInputs({ quote_date: '2027-01-15' });
    expect(price(late).issues.find((i) => i.code === 'STALE_PRICE')?.severity).toBe('warn');
    expect(price(late, testConfig((c) => { c.parameters.block_on_stale!.value = true; })).blocked).toBe(true);
  });
});

describe('other pricing modes', () => {
  it('lump sum per kWp (PR-011) folds chapters 08.02–08.06 into one line', () => {
    const inputs = residentialInputs();
    inputs.values.price_mode = 'lump_sum';
    const q = price(inputs);
    const lump = line(q, 'מערכת סולארית קומפלט');
    expect(lump).toMatchObject({ qty: '10.44', unit_price: '3500.00', line_total: '36540.00' });
    expect(q.lines.filter((l) => l.in_lump === 'PR-011').every((l) => ['08.02', '08.03', '08.04', '08.05', '08.06'].includes(l.section_code))).toBe(true);
    // 08.01 (5725) stays itemised; everything else is the lump line
    expect(q.totals.before_vat).toBe('42265.00');
  });
  it('a contracted sale price list overrides the margin for that customer (PR-010)', () => {
    const q = price(residentialInputs({ customer: { id: 'cust-acme', type: 'private' } }));
    expect(line(q, 'מודול PV')).toMatchObject({ unit_price: '350.00' });
    expect(line(q, 'מודול PV').price_snapshot.pricing.rule_ids[0]).toBe('PR-010');
  });
  it('manual lines, line discounts and options', () => {
    const q = price(residentialInputs({
      manual_lines: [{ id: 'm1', title_he: 'זיכוי לקוח חוזר', boq_section_code: '08.08', qty: 1, unit_price: -500 }],
      line_discounts: { 'assembly:ASM-RES-TILE-SE#3': 10 },
      options: { insurance: true },
    }));
    expect(line(q, 'זיכוי')).toMatchObject({ source: 'manual', line_total: '-500.00' });
    expect(line(q, 'ממיר SolarEdge')).toMatchObject({ discount_pct: '10', line_total: '4437.00' });
    expect(line(q, 'ביטוח עבודות')).toMatchObject({ selected: true });
    // 29412.69 − 500 − 493 (10% of 4930) + 1035
    expect(q.totals.before_vat).toBe('29454.69');
  });
  it('final rounding is an explicit amount, never hidden in a line', () => {
    const q = price(residentialInputs(), testConfig((c) => { (c.parameters.rounding as Record<string, unknown>).final_round_step_ils = 10; }));
    expect(q.totals).toMatchObject({ rounding: '-2.69', before_vat: '29410.00' });
  });
});
