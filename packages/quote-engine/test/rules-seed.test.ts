import { runRuleTests, runRules, toValue, type Fn } from '../src/index.ts';
import { seedRules } from './fixtures.ts';

// tier() needs a tier table that is not in the seed yet; for R2's own test it is built from the same
// boundaries the track.* resolver rules use (≤15, ≤100, ≤630 kW AC).
const tier: Fn = ([kw]) => {
  if (kw === null) return null;
  const v = Number(kw.toString());
  return toValue(v <= 15 ? 'tier_le15' : v <= 100 ? 'tier_15_100' : v <= 630 ? 'tier_100_630' : 'tier_gt630');
};

/**
 * Seed tests that cannot pass with this PR, each for a reason outside the quote engine. They are asserted
 * to still fail, so fixing the seed (or landing the dependency) makes this test point at the list.
 */
const KNOWN: Record<string, string> = {
  'iec.sla.inspection_after_payment/paid': 'add_business_days() needs business_calendar (WP-M0-08)',
  'iec.sla.connection_complete/paid': 'add_business_days() needs business_calendar (WP-M0-08)',
  'iec.sla.survey_publication/sent': 'add_business_days() needs business_calendar (WP-M0-08)',
  'iec.sla.distributor_answer/step': 'add_business_days() needs business_calendar (WP-M0-08)',
  'iec.refund.negative_answer_stale_grid_data/negative_stale': "seed expects `grid_data_stale != false` to hold when null; §f.2 makes null unknown",
  'pua.operating_permit_04_2026/mv': 'seed flag value uses a `? :` ternary, which the DSL does not have (use if())',
  'pua.operating_permit_04_2026/home': 'seed flag value uses a `? :` ternary, which the DSL does not have (use if())',
};

describe('rules-seed.json tests[] (WP-M1-05, specs/13 §f.4)', () => {
  const results = seedRules.flatMap((r) => runRuleTests(r, { functions: { tier } }));

  it('every rule carries at least one test', () => {
    expect(seedRules.filter((r) => !r.tests?.length).map((r) => r.key)).toEqual([]);
  });

  it.each(results.map((r) => [`${r.rule_key}/${r.test}`, r] as const))('%s', (id, r) => {
    if (KNOWN[id]) expect(r.pass, `now passes — remove from KNOWN: ${KNOWN[id]}`).toBe(false);
    else expect(r.pass, r.detail).toBe(true);
  });

  it('covers the whole seed', () => {
    expect(results.length).toBe(134);
    expect(results.filter((r) => !r.pass).length).toBe(Object.keys(KNOWN).length);
  });
});

describe('runRules semantics (specs/13 §f.3)', () => {
  const byKey = (k: string) => seedRules.find((r) => r.key === k)!;

  it('evaluates the resolver before pricing rules and exposes flags to later rules', () => {
    const run = runRules([byKey('R3.feed_in_tariff_15_100'), byKey('track.commercial_15_100')], { distributor_type: 'iec', storage_mode: 'none', p_ac_kw: 50 }, { evaluationDate: '2026-10-17' });
    expect(run.flags.regulatory_track).toBe('commercial_15_100');
    expect(run.results.map((r) => [r.key, r.outcome])).toEqual([['track.commercial_15_100', 'fired'], ['R3.feed_in_tariff_15_100', 'fired']]);
    expect(run.flag_verification.feed_in_tariff_agorot).toBe('summary');
  });

  it('downgrades a block from an unverified rule to a warning', () => {
    const rule = { ...byKey('R12c.inverter_output_too_far'), verification: 'unverified' as const };
    const run = runRules([rule], { ac: { inverter_to_board_m: 30 }, design: { breaker_near_inverter: false } }, { evaluationDate: '2026-10-17' });
    expect(run.blocks).toEqual([]);
    expect(run.warnings[0]!.rule_key).toBe('R12c.inverter_output_too_far');
  });

  it('flags add_line from summary/unverified rules and merges duplicates by product_key', () => {
    const a = byKey('iec.fee.residential_pre_application');
    const b = { ...a, key: 'test.dup', verification: 'office' as const };
    const run = runRules([a, b], { regulatory_track: 'residential_le15' }, { evaluationDate: '2026-10-17' });
    expect(run.lines).toHaveLength(1);
    expect(run.lines[0]!.rule_keys).toEqual(['iec.fee.residential_pre_application', 'test.dup']);
    expect(run.lines[0]!.verification_flag).toBe(true);
  });

  it('a block whose condition is unknown blocks (HUMAN_INPUT_REQUIRED) unless the caller says otherwise', () => {
    const r = byKey('R22.battery_standard_62619');
    const ctx = { storage_mode: 'with_pv', battery: { iec62619_cert: null } };
    expect(runRules([r], ctx, { evaluationDate: '2026-10-17' }).blocks[0]!.missing).toEqual(['battery.iec62619_cert']);
    expect(runRules([r], ctx, { evaluationDate: '2026-10-17', needsInputBlocks: () => false }).blocks).toEqual([]);
  });

  it('skips superseded rules and rules outside their validity dates', () => {
    const old = byKey('R10.export_limit');
    const repl = { ...old, key: 'R10.v2', supersedes: 'R10.export_limit' };
    const run = runRules([old, repl], { p_ac_kw: 200 }, { evaluationDate: '2026-10-17' });
    expect(run.results.map((r) => r.key)).toEqual(['R10.v2']);
    expect(runRules([{ ...old, valid_to: '2026-01-01' }], { p_ac_kw: 200 }, { evaluationDate: '2026-10-17' }).results).toEqual([]);
  });

  it('a rule that throws is reported, never skipped silently', () => {
    const broken = { ...byKey('R10.export_limit'), condition: 'nope(p_ac_kw)' };
    const run = runRules([broken], { p_ac_kw: 200 }, { evaluationDate: '2026-10-17' });
    expect(run.results[0]!.outcome).toBe('error');
    expect(run.blocks[0]!.message_he).toMatch(/nope/);
  });
});
