import type { Verification } from '../catalog/schemas.ts';

export type FilterOp = '==' | '!=' | '>=' | '<=' | '>' | '<' | 'in';

export interface ProductQuery {
  kind: string;
  subkind?: string | string[];
  /** `field` is a product path (`manufacturer`, `tech.phases`); `value` is a DSL expression. */
  filters?: { field: string; op: FilterOp; value: string }[];
  pick: 'preferred' | 'cheapest' | 'exact';
}

export interface AssemblyComponent {
  id: string;
  sort: number;
  /** Exactly one of product_sku / product_ref / product_query / assembly_code. */
  product_sku?: string;
  /** Use the product chosen for the quote (`module`, `inverter`, `optimizer`, `battery`). */
  product_ref?: 'module' | 'inverter' | 'optimizer' | 'battery';
  product_query?: ProductQuery;
  /** Nested assembly, expanded recursively; its quantities are multiplied by this component's qty. */
  assembly_code?: string;
  qty_expr: string;
  unit?: string;
  rounding?: { mode: 'ceil' | 'round' | 'floor'; step: number };
  min_qty?: number;
  optional?: boolean;
  option_group?: string;
  default_on?: boolean;
  boq_section_code: string;
  line_title_he?: string;
  customer_note_he?: string;
  source_he?: string;
  needs_owner_input?: boolean;
}

export interface Assembly {
  id: string;
  code: string;
  name_he: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  applies_to?: {
    roof_types?: string[];
    inverter_brands?: string[];
    phases?: number[];
    kwp_min?: number | null;
    kwp_max?: number | null;
    regulatory_tracks?: string[];
    has_battery?: boolean;
  };
  /** Declared inputs beyond the shared vocabulary, with optional defaults (specs/12 §2.1 inputs_schema). */
  inputs?: { name: string; required?: boolean; default?: unknown }[];
  components: AssemblyComponent[];
  /** Expressions that must be true, otherwise the quote is blocked. */
  validations?: { expr: string; message_he: string }[];
  verification: Verification;
  needs_owner_input?: boolean;
  notes_he?: string;
}

/** Shared AssemblyInputs vocabulary (specs/12 §2.2). */
export const INPUT_VOCABULARY = [
  'kwp', 'kw_ac', 'module_count', 'module_p_w', 'module_w_m', 'string_count', 'max_string_len_m', 'rows', 'modules_per_row',
  'dc_m', 'dc_tray_m', 'ac_tray_m', 'facade_tray_m', 'ac_m', 'pe_m', 'jumpers_m', 'bends', 'tray_runs',
  'roof_type', 'roof_height_m', 'eave_h_m', 'phases', 'connection_a', 'connection_kva',
  'inverter_brand', 'inverter_count', 'inverter_kw', 'has_optimizers', 'optimizer_inputs',
  'has_battery', 'battery_kwh', 'battery_kw', 'battery_count', 'distance_inverter_board_m', 'production_meter',
  'regulatory_track', 'export_limit_kw', 'crane_days', 'scaffold', 'device_count', 'sections_mm', 'din_modules_needed',
  'has_fire_panel', 'customer_type', 'building_use', 'price_mode',
  // chosen products, exposed as objects (`inverter.rcd_type_required`)
  'module', 'inverter', 'optimizer', 'battery',
] as const;
