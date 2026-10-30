import type { Verification } from '../catalog/schemas.ts';

// Rule as stored in the `rules` table and seeded from docs/plan/rules/rules-seed.json (specs/13 §f.1).

export type RuleScope = 'pricing' | 'design' | 'submission' | 'inspection';

export interface Consequence {
  type: 'add_line' | 'require_document' | 'block' | 'warn' | 'set_flag';
  params: Record<string, unknown> & { when?: string };
}

export interface RuleTest {
  name: string;
  given: Record<string, unknown>;
  expect: { fires: boolean | null; blocks?: boolean; flags?: Record<string, unknown>; add_lines?: number; outcome?: 'needs_input' };
}

export interface Rule {
  key: string;
  ref?: string | null;
  scope: RuleScope;
  name_he: string;
  condition: string;
  consequences: Consequence[];
  source?: { doc?: string; section?: string | null; url?: string | null; date?: string | null; research_ref?: string | null };
  verification: Verification;
  verified_by?: string | null;
  verified_at?: string | null;
  supersedes?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  priority: number;
  tests?: RuleTest[];
  /** Rule-local data tables, callable from the condition by name (`license_limit_a(signer.license_class)`). */
  params?: Record<string, unknown>;
  notes?: string | null;
}

export type RuleOutcome = 'fired' | 'skipped' | 'needs_input' | 'error';

export interface RuleLine {
  rule_key: string;
  rule_keys: string[];
  ref: string | null;
  kind: string;
  product_key: string | null;
  /** Number, or the seed's symbolic quantity (`per_inverter`, `f(module_rows)` …) resolved by the pricing engine. */
  qty: unknown;
  text_he: string | null;
  section: string | null;
  optional: boolean;
  amount_ils: number | null;
  verification: Verification;
  /** Shown to the customer as "* לאימות" until the rule is office/validated. */
  verification_flag: boolean;
}

export interface RuleMessage {
  rule_key: string;
  message_he: string;
  verification: Verification;
  missing?: string[];
}

export interface RuleRun {
  evaluation_date: string;
  results: { key: string; outcome: RuleOutcome; condition: boolean | null; verification: Verification; missing: string[] }[];
  blocks: RuleMessage[];
  warnings: RuleMessage[];
  lines: RuleLine[];
  documents: { kind: string; rule_keys: string[]; conditional: boolean; note?: string }[];
  flags: Record<string, unknown>;
  /** Flags set by summary/unverified rules carry a "לאימות" tag. */
  flag_verification: Record<string, Verification>;
}
