/**
 * Field-report model: create from the job's data, validate, lock with a hash,
 * revise, and turn a failed inspection into a defects list. Pure functions —
 * storage and UI live elsewhere.
 */
import { canonicalJson, sha256Hex, type QuoteVersion } from '@bee/quote-core'
import { mapRoofType, sha256OfDataUrl } from '../schema'
import type { SiteSurveyProject } from '../types'
import { TEMPLATES, inspectionVerdict, num, readRiso, stringResult } from './templates'
import type { Applies, ChecklistEntry, ReportContext, ReportInstance, ReportTemplate, Row, SectionDef, TemplateKey } from './types'

export function buildContext(project: SiteSurveyProject, quote: QuoteVersion | null, warrantyLines: string[] = []): ReportContext {
  const line = (kind: string) => quote?.lines.find((l) => l.kind === kind)
  const d = quote?.design
  return {
    projectName: project.projectName,
    address: project.address,
    customerName: project.customerName?.trim() || quote?.input.customerName || '',
    surveyor: project.surveyor,
    roofType: project.roofTypeHe ? mapRoofType(project.roofTypeHe) : 'other',
    hasBattery: !!line('battery') || project.includeBattery,
    hasOptimizers: (d?.optimizer_count ?? 0) > 0 || project.inverterBrandPref === 'SolarEdge',
    inverterBrand: project.inverterBrandPref || '',
    mainBreaker: project.mainBreaker,
    meterNumber: project.meterNumber,
    dcKwp: d?.dc_kwp || null,
    acKw: d?.inverter_ac_kw ? d.inverter_ac_kw * (d.inverter_count || 1) : null,
    moduleCount: d?.module_count || null,
    moduleModel: line('module')?.name_he ?? '',
    inverterModel: line('inverter')?.name_he ?? '',
    inverterCount: d?.inverter_count || null,
    optimizerCount: d?.optimizer_count || null,
    batteryModel: line('battery')?.name_he ?? '',
    warrantyLines,
    quoteNumber: quote ? `${quote.quote_number} v${quote.version_no}` : '',
  }
}

export function applies(a: Applies | undefined, c: ReportContext): boolean {
  if (!a) return true
  if (a.roofTypes && !a.roofTypes.includes(c.roofType)) return false
  if (a.hasBattery !== undefined && a.hasBattery !== c.hasBattery) return false
  if (a.hasOptimizers !== undefined && a.hasOptimizers !== c.hasOptimizers) return false
  return true
}

/** Sections (and, for checklists, items) that apply to this job. */
export function visibleSections(t: ReportTemplate, r: ReportInstance): SectionDef[] {
  return t.sections
    .filter((s) => applies(s.applies, r.context))
    .map((s) => (s.kind === 'checklist' ? { ...s, items: s.items.filter((i) => applies(i.applies, r.context)) } : s))
    .filter((s) => s.kind !== 'checklist' || s.items.length > 0)
}

export function template(r: ReportInstance | TemplateKey): ReportTemplate {
  return TEMPLATES[typeof r === 'string' ? r : r.templateKey]
}

export function newReport(key: TemplateKey, projectId: string, context: ReportContext, existing: ReportInstance[] = [], now = new Date()): ReportInstance {
  const t = TEMPLATES[key]
  const r: ReportInstance = {
    id: crypto.randomUUID(),
    projectId,
    templateKey: key,
    templateVersion: t.version,
    revision: 1 + existing.filter((x) => x.templateKey === key).reduce((m, x) => Math.max(m, x.revision), 0),
    supersedes: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: 'draft',
    finalizedAt: null,
    contentHash: null,
    context,
    fields: {},
    checklists: {},
    tables: {},
    photos: [],
    signatures: {},
  }
  for (const s of visibleSections(t, r)) {
    if (s.kind === 'fields') r.fields[s.key] = Object.fromEntries(s.fields.map((f) => [f.key, f.prefill?.(context) ?? '']))
    if (s.kind === 'checklist') r.checklists[s.key] = Object.fromEntries(s.items.map((i) => [i.code, { result: '', value: '', note: '' } as ChecklistEntry]))
    if (s.kind === 'table') {
      const pre = s.prefillRows?.(context) ?? []
      const blank = () => Object.fromEntries(s.columns.filter((c) => c.kind !== 'computed').map((c) => [c.key, ''])) as Row
      r.tables[s.key] = pre.length ? pre.map((p) => ({ ...blank(), ...p })) : Array.from({ length: s.minRows ?? 0 }, blank)
    }
  }
  return r
}

export function blankRow(r: ReportInstance, sectionKey: string): Row {
  const s = template(r).sections.find((x) => x.key === sectionKey)
  if (!s || s.kind !== 'table') return {}
  return Object.fromEntries(s.columns.filter((c) => c.kind !== 'computed').map((c) => [c.key, '']))
}

export interface Validation {
  /** Blocks locking the report. */
  missing: string[]
  /** Worth a look, never blocks (missing photo evidence, unverified thresholds…). */
  warnings: string[]
}

const rowFilled = (row: Row) => Object.values(row).some((v) => (v ?? '').trim())

export function validateReport(r: ReportInstance, others: ReportInstance[] = []): Validation {
  const t = template(r)
  const missing: string[] = []
  const warnings: string[] = []
  for (const s of visibleSections(t, r)) {
    if (s.kind === 'fields') {
      for (const f of s.fields) {
        const v = (r.fields[s.key]?.[f.key] ?? '').trim()
        if (f.required && !v) missing.push(`${s.title_he}: ${f.label_he}`)
        else if (v && f.kind === 'number' && num(v) === null) missing.push(`${s.title_he}: ${f.label_he} — "${v}" אינו מספר`)
      }
    }
    if (s.kind === 'checklist') {
      for (const i of s.items) {
        const e = r.checklists[s.key]?.[i.code]
        if (i.required && (!e || !e.result)) missing.push(`${s.title_he}: ${i.code} ${i.label_he}`)
        else if (e?.result === 'ok' && i.evidence === 'value' && i.required && !e.value.trim()) missing.push(`${s.title_he}: ${i.code} — חסר ערך${i.unit ? ` (${i.unit})` : ''}`)
        if (e?.result === 'fail' && !e.note.trim()) warnings.push(`${i.code}: מומלץ לתאר את הליקוי`)
        if (e?.result === 'ok' && i.evidence === 'photo' && !r.photos.some((p) => p.sectionKey === s.key && p.itemCode === i.code)) warnings.push(`${i.code}: אין תמונה`)
      }
    }
    if (s.kind === 'table') {
      const rows = (r.tables[s.key] ?? []).filter(rowFilled)
      if ((s.minRows ?? 0) > rows.length) missing.push(`${s.title_he}: נדרשת לפחות שורה אחת`)
      rows.forEach((row, i) => {
        for (const c of s.columns) {
          const v = (row[c.key] ?? '').trim()
          if (c.required && c.kind !== 'computed' && !v) missing.push(`${s.title_he} · שורה ${i + 1}: ${c.label_he}`)
          // A number nobody can read ("451V") would silently leave the row unevaluated.
          else if (v && c.kind === 'number' && num(v) === null && !(c.key === 'riso' && readRiso(v) !== null)) missing.push(`${s.title_he} · שורה ${i + 1}: ${c.label_he} — "${v}" אינו מספר`)
        }
      })
    }
    if (s.kind === 'photos') {
      const n = r.photos.filter((p) => p.sectionKey === s.key).length
      if ((s.min ?? 0) > n) missing.push(`${s.title_he}: נדרשת לפחות ${s.min} תמונה`)
    }
    if (s.kind === 'signatures') {
      for (const g of s.signers) if (g.required && !r.signatures[g.key]) missing.push(`חתימה: ${g.label_he}`)
    }
  }
  warnings.push(...(t.validate?.(r, others.filter((o) => o.id !== r.id)) ?? []))
  return { missing, warnings }
}

/**
 * What the hash covers: everything a reader of the PDF sees. Photos and the
 * drawn signatures are covered by the sha256 of their bytes (recomputed at
 * lock time, never trusted from storage), plus their timestamps.
 */
export function canonicalContent(r: ReportInstance): unknown {
  return {
    template: `${r.templateKey}@${r.templateVersion}`,
    projectId: r.projectId,
    revision: r.revision,
    supersedes: r.supersedes,
    context: r.context,
    fields: r.fields,
    checklists: r.checklists,
    tables: Object.fromEntries(Object.entries(r.tables).map(([k, rows]) => [k, rows.filter(rowFilled)])),
    photos: r.photos.map((p) => ({ sectionKey: p.sectionKey, itemCode: p.itemCode ?? null, sha256: p.sha256, createdAt: p.createdAt })),
    signatures: Object.fromEntries(Object.entries(r.signatures).map(([k, s]) => [k, { name: s.name, signedAt: s.signedAt, sha256: s.sha256 ?? null }])),
    finalizedAt: r.finalizedAt,
    sourceReportId: r.sourceReportId ?? null,
  }
}

export class ReportLockedError extends Error {}

/** Lock a report. Throws when something required is missing. A locked report is never edited again. */
export async function finalizeReport(r: ReportInstance, others: ReportInstance[] = [], now = new Date()): Promise<ReportInstance> {
  if (r.status === 'final') throw new ReportLockedError('הדוח כבר נעול')
  const v = validateReport(r, others)
  if (v.missing.length) throw new ReportLockedError(`חסרים ${v.missing.length} פריטים`)
  // A deep copy: the locked report shares nothing with the draft still on screen.
  const f: ReportInstance = structuredClone(r)
  for (const p of f.photos) p.sha256 = await sha256OfDataUrl(p.dataUrl)
  for (const s of Object.values(f.signatures)) s.sha256 = await sha256Hex(s.dataUrl)
  f.status = 'final'
  f.finalizedAt = now.toISOString()
  f.updatedAt = f.finalizedAt
  f.contentHash = await sha256Hex(canonicalJson(canonicalContent(f)))
  return f
}

/** A change after locking is a new revision (same idea as quote versions). Signatures do not carry over. */
export function reviseReport(r: ReportInstance, existing: ReportInstance[] = [], now = new Date()): ReportInstance {
  const copy = structuredClone(r)
  return {
    ...copy,
    id: crypto.randomUUID(),
    revision: 1 + existing.filter((x) => x.templateKey === r.templateKey).reduce((m, x) => Math.max(m, x.revision), r.revision),
    supersedes: r.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: 'draft',
    finalizedAt: null,
    contentHash: null,
    signatures: {},
  }
}

/** Spec 15 §b.5: every failed item of an inspection becomes an open defect. */
export function defectsFromInspection(insp: ReportInstance, existing: ReportInstance[] = [], now = new Date()): ReportInstance {
  const d = newReport('defects', insp.projectId, insp.context, existing, now)
  const rows: Row[] = []
  const t = template(insp)
  for (const s of visibleSections(t, insp)) {
    if (s.kind === 'checklist') {
      for (const i of s.items) {
        const e = insp.checklists[s.key]?.[i.code]
        if (e?.result === 'fail') rows.push({ code: i.code, severity: 'major', blocks: '', location: s.title_he, description: [i.label_he, e.note].filter(Boolean).join(' — '), status: 'open', fix: '' })
      }
    }
  }
  for (const row of insp.tables.strings ?? []) {
    const res = stringResult(insp, row)
    const where = `מחרוזת ${row.label || ''} ${row.inverter || ''}`.trim()
    if (res === 'fail') {
      const why = row.polarity === 'no' ? 'קוטביות הפוכה' : `Riso ${row.riso} MΩ מתחת לסף`
      rows.push({ code: `STR-${row.label || '?'}`, severity: 'critical', blocks: 'yes', location: where, description: why, status: 'open', fix: '' })
    } else if (res === 'warn') {
      // A warning is worth a look, not a blocker: listed as minor so the list is never empty.
      rows.push({ code: `STR-${row.label || '?'}`, severity: 'minor', blocks: '', location: where, description: 'סטיית Voc / Isc מעל הסבולת — לבדוק', status: 'open', fix: '' })
    }
  }
  for (const row of insp.tables.earthing ?? []) if (row.result === 'fail') rows.push({ code: 'EAR', severity: 'critical', blocks: 'yes', location: `${row.from} → ${row.to}`, description: `רציפות הארקה נכשלה (${row.ohm} Ω)`, status: 'open', fix: '' })
  for (const row of insp.tables.rcd ?? []) if (row.result === 'fail') rows.push({ code: 'RCD', severity: 'critical', blocks: 'yes', location: row.board, description: 'ממסר פחת נכשל', status: 'open', fix: '' })
  for (const row of insp.tables.inverters ?? []) {
    if (row.start === 'no' || row.anti_islanding === 'no') rows.push({ code: 'INV', severity: 'critical', blocks: 'yes', location: `ממיר ${row.sn}`, description: row.start === 'no' ? 'הפעלה לא תקינה' : 'אינו מתנתק בהפסקת רשת', status: 'open', fix: '' })
  }
  if (rows.length) d.tables.defects = rows
  d.fields.general = { ...d.fields.general, source: 'inspector', ref: `בדיקה 62446 גרסה ${insp.revision}${insp.contentHash ? ` · ${insp.contentHash.slice(0, 12)}` : ''}` }
  d.sourceReportId = insp.id
  return d
}

export { inspectionVerdict }
