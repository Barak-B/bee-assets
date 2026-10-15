/**
 * Field reports (plan step 6): one engine, many templates.
 * "דוח אחד = תבנית אחת + נתונים" — a template is plain data (sections of
 * fields, checklists, tables, photos and signatures); one generic editor and
 * one PDF renderer serve every template (spec 15 §a.2, §b.6).
 */
import type { RoofTypeCanonical } from '../types'

export type ItemResult = 'ok' | 'fail' | 'na' | ''

/** Facts about the job that decide which checklist items apply and what is prefilled. Snapshotted into the report. */
export interface ReportContext {
  projectName: string
  address: string
  customerName: string
  surveyor: string
  roofType: RoofTypeCanonical
  hasBattery: boolean
  hasOptimizers: boolean
  inverterBrand: string
  mainBreaker: string
  meterNumber: string
  dcKwp: number | null
  acKw: number | null
  moduleCount: number | null
  moduleModel: string
  inverterModel: string
  inverterCount: number | null
  optimizerCount: number | null
  batteryModel: string
  /** Company warranty wording from the price book (one line per component). */
  warrantyLines: string[]
  /** From the quote this job is built on, when there is one. */
  quoteNumber: string
}

export interface Applies {
  roofTypes?: RoofTypeCanonical[]
  hasBattery?: boolean
  hasOptimizers?: boolean
}

export interface Option {
  value: string
  label_he: string
}

export interface FieldDef {
  key: string
  label_he: string
  kind: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'yesno'
  unit?: string
  options?: Option[]
  required?: boolean
  hint_he?: string
  /** A threshold/parameter that is not verified against the standard — shown with "לאימות". */
  unverified?: boolean
  prefill?: (c: ReportContext) => string
}

export interface ChecklistItemDef {
  code: string
  label_he: string
  /** What proves the item: a photo, a measured value, a document in the file, or nothing. */
  evidence: 'photo' | 'value' | 'document' | 'none'
  required?: boolean
  unit?: string
  ruleRef?: string
  applies?: Applies
}

export interface ColumnDef {
  key: string
  label_he: string
  kind: 'text' | 'number' | 'select' | 'yesno' | 'computed'
  unit?: string
  options?: Option[]
  required?: boolean
  /** Relative column width in the PDF. */
  w?: number
  /** For `computed` columns: derived from the row and the rest of the report. */
  compute?: (row: Row, r: ReportInstance) => string
}

export type Row = Record<string, string>

interface SectionBase {
  key: string
  title_he: string
  hint_he?: string
  applies?: Applies
}

export type SectionDef =
  | (SectionBase & { kind: 'fields'; fields: FieldDef[] })
  | (SectionBase & { kind: 'checklist'; items: ChecklistItemDef[] })
  | (SectionBase & { kind: 'table'; columns: ColumnDef[]; minRows?: number; addLabel_he?: string; prefillRows?: (c: ReportContext) => Row[] })
  | (SectionBase & { kind: 'photos'; min?: number })
  | (SectionBase & { kind: 'signatures'; signers: { key: string; label_he: string; required?: boolean }[] })

export interface Outcome {
  tone: 'ok' | 'warn' | 'fail'
  label_he: string
}

export interface ReportTemplate {
  key: TemplateKey
  version: number
  title_he: string
  description_he: string
  sections: SectionDef[]
  /** Extra checks on top of "required" (cross-field rules, other reports of the job). */
  validate?: (r: ReportInstance, others: ReportInstance[]) => string[]
  /** One-line verdict shown in the list and on the PDF. */
  outcome?: (r: ReportInstance) => Outcome | null
}

export type TemplateKey = 'daily_report' | 'installation_checklist' | 'inspection_62446' | 'defects' | 'handover'

export interface ChecklistEntry {
  result: ItemResult
  value: string
  note: string
}

export interface ReportPhoto {
  id: string
  /** Section, and checklist item code when the photo is evidence for one item. */
  sectionKey: string
  itemCode?: string
  dataUrl: string
  mimeType: string
  sha256: string
  createdAt: string
}

export interface Signature {
  name: string
  /** PNG of the drawn signature. */
  dataUrl: string
  signedAt: string
}

export interface ReportInstance {
  id: string
  projectId: string
  templateKey: TemplateKey
  templateVersion: number
  /** 1 for the first report of its kind on a job; a new revision supersedes a final one. */
  revision: number
  supersedes: string | null
  createdAt: string
  updatedAt: string
  status: 'draft' | 'final'
  finalizedAt: string | null
  /** sha256 of the canonical content at finalization — printed on the PDF. */
  contentHash: string | null
  context: ReportContext
  fields: Record<string, Record<string, string>>
  checklists: Record<string, Record<string, ChecklistEntry>>
  tables: Record<string, Row[]>
  photos: ReportPhoto[]
  signatures: Record<string, Signature>
  /** Report this one was generated from (e.g. defects from an inspection). */
  sourceReportId?: string | null
}
