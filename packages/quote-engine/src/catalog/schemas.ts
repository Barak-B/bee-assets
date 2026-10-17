import { z } from 'zod';

// Catalog entities — specs/12 §1. Zod is the single source of validation for server and PWA.

export const Verification = z.enum(['unverified', 'summary', 'office', 'validated']);
export type Verification = z.infer<typeof Verification>;

export const Currency = z.enum(['ILS', 'USD', 'EUR']);
export type Currency = z.infer<typeof Currency>;

export const Unit = z.enum(['unit', 'm', 'm2', 'pair', 'set', 'komplet', 'day', 'hour', 'point', 'kwp', 'kwh', 'year', 'piece_3m']);
export type Unit = z.infer<typeof Unit>;

/** eplan / BOQ unit labels (`יח'`, `מ'`, `זוג` …) mapped onto the Unit enum (specs/12 §1.1). */
export const UNIT_ALIASES_HE: Record<string, Unit> = {
  "יח'": 'unit', 'יח': 'unit', "מ'": 'm', 'מטר': 'm', 'מ"ר': 'm2', 'זוג': 'pair', 'סט': 'set',
  "קומפ'": 'komplet', 'קומפלט': 'komplet', 'יום': 'day', 'שעה': 'hour', 'נקודה': 'point',
  "יח' (3 מ')": 'piece_3m', 'kWp': 'kwp', 'kWh': 'kwh', 'שנה': 'year',
};

export const SUBKINDS = {
  module: ['mono', 'topcon', 'hjt', 'perc', 'bifacial'],
  inverter: ['string', 'hybrid', 'micro', 'central'],
  optimizer: ['single', 'dual'],
  battery: ['lv', 'hv', 'ac_coupled', 'cabinet_bess'],
  breaker: ['mcb', 'mccb', 'rcbo', 'rcd', 'spd_ac', 'spd_dc', 'switch_disconnector', 'fuse', 'shunt_trip', 'emergency_button', 'contactor', 'relay_vf'],
  meter: ['production', 'bidirectional', 'ct_set', 'meter_cabinet_window'],
  cable: ['dc_solar', 'ac_power', 'pe', 'comm', 'rs485', 'cat'],
  tray: ['mesh', 'ladder', 'duct', 'conduit_flex', 'conduit_rigid'],
  cabinet: ['dc_box', 'ac_box', 'collector_board', 'meter_cabinet', 'pe_box', 'comm_board', 't4p', 'enclosure_section'],
  mounting: ['rail', 'hook_tile', 'clamp_mid', 'clamp_end', 'ballast', 'tin_roof_bracket', 'pergola', 'facade_bracket'],
  accessory: ['lug', 'lug_c', 'ferrule', 'mc4_pair', 'din_terminal', 'gland', 'tie_uv', 'label', 'sign', 'bolt_m8', 'yakir', 'cover', 'support', 'comm', 'din_rail'],
  labour: ['install_modules', 'install_inverter_boards', 'cabling', 'earthing', 'trays', 'board_wiring', 'crane', 'scaffold', 'lifeline', 'transport', 'waste', 'commissioning', 'training'],
  service: ['survey', 'design', 'simulation', 'constructor', 'inspector', 'iec_followup', 'permit_exempt_report', 'as_made', 'monitoring_setup', 'om_year', 'insurance_cw', 'extended_warranty'],
  fee: ['iec_survey', 'iec_test', 'iec_meter', 'iec_connection_upgrade', 'authority', 'distributor_historic'],
} as const;

export type ProductKind = keyof typeof SUBKINDS;
export const ProductKind = z.enum(Object.keys(SUBKINDS) as [ProductKind, ...ProductKind[]]);

const n = z.number();
const warrantyModule = z.object({ product_years: n, performance_years: n, first_year_pct: n, annual_degradation_pct: n }).partial();

// `tech` per kind (specs/12 §1.3). Every field is optional at the schema level; REQUIRED_TECH lists
// what must be present before a product may be marked `validated`. Unknown extra fields are kept.
export const TECH_SCHEMAS = {
  module: z.looseObject({
    p_max_w: n, voc_v: n, isc_a: n, vmp_v: n, imp_a: n,
    temp_coeff_voc_pct_c: n, temp_coeff_isc_pct_c: n, temp_coeff_pmax_pct_c: n,
    max_system_v: z.union([z.literal(1000), z.literal(1500)]), max_series_fuse_a: n,
    noct_c: n, efficiency_pct: n, cells: n, technology: z.string(), bifacial: z.boolean(), bifaciality_pct: n,
    dims_mm: z.object({ l: n, w: n, h: n }), weight_kg: n, class_ii: z.boolean(), certs: z.array(z.string()),
    warranty: warrantyModule, pan_file_ref: z.string(),
  }).partial(),
  inverter: z.looseObject({
    phases: z.union([z.literal(1), z.literal(3)]),
    ac_power_kw: n, ac_max_kva: n, ac_max_current_a: n, ac_voltage_v: n,
    dc_max_power_kw: n, max_dc_voltage_v: n, start_voltage_v: n,
    mppt_count: n, mppt_v_min: n, mppt_v_max: n, max_input_current_per_mppt_a: n, max_isc_per_mppt_a: n, strings_per_mppt: n,
    galvanic_isolation: z.boolean(), iec62109_declared: z.boolean(),
    rcd_type_required: z.enum(['none', 'A', 'B', 'unknown']),
    rcmu_integrated: z.boolean(), iso_monitor_integrated: z.boolean(), fault_current_a: n,
    export_limit_capable: z.boolean(), communication: z.array(z.enum(['dongle_wifi', 'lan', '4g', 'rs485'])),
    needs_dongle: z.boolean(),
    monitoring_vendor: z.enum(['solaredge', 'huawei', 'sungrow', 'solis', 'growatt', 'kstar', 'saj', 'goodwe', 'enphase', 'other']),
    warranty: z.object({ years: n, extension_options: z.array(z.unknown()) }).partial(),
  }).partial(),
  optimizer: z.looseObject({ p_max_w: n, max_input_v: n, max_input_i_a: n, inputs: z.union([z.literal(1), z.literal(2)]), rapid_shutdown: z.boolean(), warranty_years: n }).partial(),
  battery: z.looseObject({ usable_kwh: n, nominal_kwh: n, voltage_v: n, max_charge_kw: n, max_discharge_kw: n, chemistry: z.string(), iec62619_cert: z.boolean(), emergency_stop_input: z.boolean() }).partial(),
  breaker: z.looseObject({ poles: z.enum(['1P', '2P', '3P', '4P']), rating_a: n, curve: z.enum(['B', 'C', 'D']), breaking_capacity_ka: n, rcd_type: z.enum(['A', 'B', 'F']), rcd_sensitivity_ma: n, spd_type: z.enum(['1', '2', '1+2']), spd_side: z.enum(['ac', 'dc']), dc_rated_v: n, din_modules: n }).partial(),
  meter: z.looseObject({ measurement: z.enum(['direct', 'ct']), max_current_a: n, ct_ratio: z.string(), two_disconnectors_included: z.boolean() }).partial(),
  cable: z.looseObject({ type_code: z.string(), cores: n, section_mm2: n, conductor: z.enum(['cu', 'al']), uv_resistant: z.boolean(), colour: z.string(), reel_m: n }).partial(),
  tray: z.looseObject({ tray_kind: z.string(), width_mm: n, height_mm: n, material: z.string(), piece_length_m: n, uv_rated: z.boolean() }).partial(),
  cabinet: z.looseObject({ ip: z.string(), din_modules: n, rated_current_a: n, iec61439_tested: z.boolean(), iec61439_cert_ref: z.string(), sections_mm: z.array(n), outdoor: z.boolean() }).partial(),
  mounting: z.looseObject({ roof_types: z.array(z.string()), per_module_qty: n, per_row_qty: n, constructor_required: z.boolean() }).partial(),
  accessory: z.looseObject({ for_section_mm2: n, size: z.string(), material: z.string(), uv_rated: z.boolean(), label_text_he: z.string(), pack_qty: n }).partial(),
  labour: z.looseObject({ basis: z.enum(['module', 'kwp', 'day', 'hour', 'komplet', 'point']), roof_types: z.array(z.string()), crew_size: n, requires_crane: z.boolean() }).partial(),
  service: z.looseObject({ provider: z.enum(['internal', 'subcontractor', 'authority']), rule_ids: z.array(z.string()), lead_time_days: n }).partial(),
  fee: z.looseObject({ payee: z.enum(['iec', 'distributor', 'authority', 'insurer']), passthrough: z.boolean(), amount_source_he: z.string(), vat_treatment: z.enum(['standard', 'exempt', 'unknown']), rule_ids: z.array(z.string()) }).partial(),
} satisfies Record<ProductKind, z.ZodType>;

export const REQUIRED_TECH: Partial<Record<ProductKind, string[]>> = {
  module: ['p_max_w', 'voc_v', 'isc_a', 'vmp_v', 'imp_a', 'temp_coeff_voc_pct_c', 'temp_coeff_isc_pct_c', 'temp_coeff_pmax_pct_c', 'max_system_v', 'max_series_fuse_a', 'dims_mm', 'weight_kg', 'class_ii', 'warranty'],
  inverter: ['phases', 'ac_power_kw', 'ac_max_kva', 'ac_max_current_a', 'ac_voltage_v', 'dc_max_power_kw', 'max_dc_voltage_v', 'start_voltage_v', 'mppt_count', 'mppt_v_min', 'mppt_v_max', 'max_input_current_per_mppt_a', 'max_isc_per_mppt_a', 'strings_per_mppt', 'galvanic_isolation', 'iec62109_declared', 'rcd_type_required', 'rcmu_integrated', 'iso_monitor_integrated', 'communication', 'monitoring_vendor', 'warranty'],
  battery: ['iec62619_cert'],
};

export const TechSource = z.object({
  document_id: z.string(),
  page: z.number().int().nullable().optional(),
  sha256: z.string().optional(),
  extracted_by: z.enum(['human', 'claude']).optional(),
  verified_by: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
});

export const Product = z.object({
  id: z.string(),
  sku: z.string().regex(/^BEE-[A-Z]+-\d{4}$/, 'sku must look like BEE-<KIND>-<NNNN>'),
  kind: ProductKind,
  subkind: z.string().nullable().optional(),
  name_he: z.string().min(1),
  name_en: z.string().optional(),
  description_he: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  unit: Unit,
  tech: z.record(z.string(), z.unknown()).default({}),
  tech_source: TechSource.nullable().optional(),
  available_il: z.enum(['yes', 'special_order', 'no', 'unknown']).default('unknown'),
  datasheet_document_id: z.string().nullable().optional(),
  bom_aliases: z.array(z.string()).default([]),
  default_boq_section: z.string().regex(/^08\.0[1-8]$/).optional(),
  rule_ids: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  verification: Verification.default('unverified'),
}).superRefine((p, ctx) => {
  const sub = SUBKINDS[p.kind] as readonly string[];
  if (p.subkind && !sub.includes(p.subkind)) {
    ctx.addIssue({ code: 'custom', path: ['subkind'], message: `subkind '${p.subkind}' is not valid for kind '${p.kind}'` });
  }
  const tech = TECH_SCHEMAS[p.kind].safeParse(p.tech);
  if (!tech.success) for (const issue of tech.error.issues) ctx.addIssue({ ...issue, path: ['tech', ...issue.path] } as never);
});
export type Product = z.infer<typeof Product>;

export const Supplier = z.object({
  id: z.string(),
  name_he: z.string(),
  kind: z.enum(['importer', 'wholesaler', 'manufacturer', 'subcontractor', 'authority']),
  default_currency: Currency.default('ILS'),
  is_active: z.boolean().default(true),
});
export type Supplier = z.infer<typeof Supplier>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected YYYY-MM-DD');

/** A price never exists outside a dated PriceList (WP-M1-01 acceptance). */
export const PriceList = z.object({
  id: z.string(),
  supplier_id: z.string(),
  name: z.string(),
  list_type: z.enum(['cost', 'sale']),
  audience: z.enum(['retail', 'b2b', 'subcontractor']).nullable().optional(),
  customer_id: z.string().nullable().optional(),
  currency: Currency,
  valid_from: isoDate,
  valid_to: isoDate.nullable().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'superseded', 'rejected']),
  supersedes_id: z.string().nullable().optional(),
  source_document_id: z.string().nullable().optional(),
  sha256: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
}).refine((l) => l.status !== 'approved' || !!l.approved_by, { message: 'an approved price list must have approved_by', path: ['approved_by'] });
export type PriceList = z.infer<typeof PriceList>;

export const PriceListEntry = z.object({
  id: z.string(),
  price_list_id: z.string(),
  supplier_sku: z.string(),
  description_raw_he: z.string().optional(),
  unit_raw: z.string().optional(),
  pack_qty: z.number().positive().default(1),
  list_price: z.number().nonnegative().nullable(),
  discount_pct: z.number().min(0).max(100).nullable().optional(),
  net_price: z.number().nonnegative().nullable(),
  currency: Currency.optional(),
  product_id: z.string().nullable().optional(),
  mapping: z.enum(['auto', 'suggested', 'human']).optional(),
});
export type PriceListEntry = z.infer<typeof PriceListEntry>;

export const ProductSupplier = z.object({
  product_id: z.string(),
  supplier_id: z.string(),
  supplier_sku: z.string(),
  preferred: z.boolean().default(false),
  lead_time_days: z.number().optional(),
});
export type ProductSupplier = z.infer<typeof ProductSupplier>;

export interface ProductReadiness {
  /** Required tech fields that are missing (product cannot be `validated`). */
  missing_tech: string[];
  /** No datasheet / tech_source: shown in the UI as "ללא מקור". */
  no_source: boolean;
  can_validate: boolean;
}

export function productReadiness(p: Product): ProductReadiness {
  const missing_tech = (REQUIRED_TECH[p.kind] ?? []).filter((f) => p.tech[f] === undefined || p.tech[f] === null);
  const no_source = !p.tech_source && !p.datasheet_document_id;
  return { missing_tech, no_source, can_validate: missing_tech.length === 0 && !no_source };
}
