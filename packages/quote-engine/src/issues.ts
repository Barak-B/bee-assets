export type IssueCode =
  | 'HUMAN_INPUT_REQUIRED'
  | 'UNRESOLVED_PRODUCT'
  | 'MISSING_COST'
  | 'ASSEMBLY_VALIDATION'
  | 'RULE_BLOCK'
  | 'RULE_WARN'
  | 'CONFIG_ERROR'
  | 'STALE_PRICE'
  | 'VERIFICATION';

export interface Issue {
  code: IssueCode;
  severity: 'block' | 'warn';
  message_he: string;
  /** What raised it: `assembly:ASM-…#7`, `rule:R7.connection_size`, `pricing_rule:PR-001`, `param:vat_rate` … */
  ref: string;
  /** Inputs/parameters a human must provide. */
  missing?: string[];
}
