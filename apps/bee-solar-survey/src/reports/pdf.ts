/**
 * One PDF renderer for every field-report template (spec 15 §b.6: the
 * template only formats; the data comes from the record). Same toolkit as the
 * survey report and the quote: embedded Heebo, RTL, page numbers, and the
 * content hash in the footer of a locked report.
 */
import { CONTENT_W, MUTED, OK_GREEN, WARN_RED, Writer, createDoc, safeFilename, type TableColumn } from '../pdfkit'
import { formatNumber } from '../rtl'
import type { SurveyPhoto } from '../types'
import { template, visibleSections } from './model'
import type { ColumnDef, ItemResult, Option, ReportInstance } from './types'
import { fmtDateTime } from '../dates'

export interface ReportPdfResult {
  blob: Blob
  bytes: ArrayBuffer
  meta: { pages: number; bytes: number }
}

const RESULT_HE: Record<ItemResult, string> = { ok: 'תקין', fail: 'לא תקין', na: 'לא רלוונטי', '': '—' }

function optionLabel(options: Option[] | undefined, v: string): string {
  return options?.find((o) => o.value === v)?.label_he ?? v
}

function cellText(c: ColumnDef, row: Record<string, string>, r: ReportInstance): string {
  if (c.kind === 'computed') return c.compute?.(row, r) ?? ''
  const v = (row[c.key] ?? '').trim()
  if (!v) return ''
  if (c.kind === 'yesno') return v === 'yes' ? 'כן' : v === 'no' ? 'לא' : v
  if (c.kind === 'select') return optionLabel(c.options, v)
  return v
}

/** Heebo has no Ω glyph — spell the unit out in the PDF. */
const pdfUnit = (u: string | undefined) => (u ?? '').replace(/MΩ/g, 'MOhm').replace(/Ω/g, 'Ohm')

function dt(iso: string | null | undefined): string {
  if (!iso) return ''
  return fmtDateTime(iso)
}

export async function buildReportPdf(r: ReportInstance): Promise<ReportPdfResult> {
  const t = template(r)
  const draft = r.status !== 'final'
  const doc = createDoc({ title: `B.E.E ${t.title_he} — ${r.context.projectName}`, subject: t.title_he })
  const w = new Writer(
    doc,
    {
      title: `${t.title_he} · גרסה ${r.revision}${draft ? ' · טיוטה' : ''}`,
      sub: `${r.context.projectName} · ${r.context.address}${r.context.quoteNumber ? ` · הצעה ${r.context.quoteNumber}` : ''}`,
    },
    {
      right: draft ? 'טיוטה — לא נחתם סופית' : `נעול ${dt(r.finalizedAt)} · B.E.E ברק אלקטריק אנג׳ינירינג`,
      left: r.contentHash ? `${r.contentHash.slice(0, 16)}` : `${r.id.slice(0, 8)} · draft`,
    },
  )

  const outcome = t.outcome?.(r)
  if (outcome) {
    w.paragraph(outcome.label_he, 'bold', 12, outcome.tone === 'ok' ? OK_GREEN : outcome.tone === 'fail' ? WARN_RED : '#8a5a00')
    w.space(2)
  }

  for (const s of visibleSections(t, r)) {
    if (s.kind === 'fields') {
      const filled = s.fields.filter((f) => (r.fields[s.key]?.[f.key] ?? '').trim())
      if (!filled.length) continue
      w.section(s.title_he)
      for (const f of filled) {
        const raw = r.fields[s.key]![f.key]!.trim()
        const v = f.kind === 'yesno' ? (raw === 'yes' ? 'כן' : raw === 'no' ? 'לא' : raw) : f.kind === 'select' ? optionLabel(f.options, raw) : f.kind === 'number' ? formatNumber(raw, 3) : raw
        w.row(`${f.label_he}${f.unverified ? ' *' : ''}`, `${pdfUnit(v)}${f.unit && f.kind === 'number' ? ` ${pdfUnit(f.unit)}` : ''}`)
      }
      if (s.fields.some((f) => f.unverified && (r.fields[s.key]?.[f.key] ?? '').trim())) w.paragraph('* פרמטר — הערך בתקן לא אומת.', 'normal', 8.5, MUTED)
      w.space()
    }

    if (s.kind === 'checklist') {
      w.section(s.title_he)
      const rows = s.items.map((i) => {
        const e = r.checklists[s.key]?.[i.code]
        const extra = [e?.value ? `${e.value}${i.unit ? ` ${pdfUnit(i.unit)}` : ''}` : '', e?.note ?? ''].filter(Boolean).join(' · ')
        const photos = r.photos.filter((p) => p.sectionKey === s.key && p.itemCode === i.code).length
        return [i.code, `${i.label_he}${i.ruleRef ? ` (${i.ruleRef})` : ''}`, RESULT_HE[e?.result ?? ''], `${pdfUnit(extra)}${photos ? `${extra ? ' · ' : ''}${photos} תמונות` : ''}`]
      })
      const cols: TableColumn[] = [
        { label: 'קוד', width: 22 },
        { label: 'פריט', width: 78 },
        { label: 'תוצאה', width: 22, bold: true },
        { label: 'ערך / הערה', width: CONTENT_W - 122 },
      ]
      w.table(cols, rows, { fontSize: 8.5 })
      const failed = s.items.filter((i) => r.checklists[s.key]?.[i.code]?.result === 'fail')
      if (failed.length) w.paragraph(`לא תקין: ${failed.map((i) => i.code).join(', ')}`, 'bold', 9, WARN_RED)
      w.space()
    }

    if (s.kind === 'table') {
      const rows = (r.tables[s.key] ?? []).filter((row) => Object.values(row).some((v) => (v ?? '').trim()))
      if (!rows.length) continue
      w.section(s.title_he)
      const total = s.columns.reduce((sum, c) => sum + (c.w ?? 1), 0)
      const cols: TableColumn[] = s.columns.map((c) => ({
        label: `${c.label_he}${c.unit ? ` (${pdfUnit(c.unit)})` : ''}`,
        width: (CONTENT_W * (c.w ?? 1)) / total,
        align: c.kind === 'number' || c.kind === 'computed' ? 'left' : 'right',
      }))
      w.table(cols, rows.map((row) => s.columns.map((c) => pdfUnit(cellText(c, row, r)))), { fontSize: s.columns.length > 8 ? 7.5 : 8.5 })
      w.space()
    }

    if (s.kind === 'photos' || s.kind === 'checklist') {
      const list = r.photos.filter((p) => p.sectionKey === s.key)
      if (!list.length) continue
      if (s.kind === 'photos') w.section(s.title_he)
      else w.paragraph(`תמונות — ${s.title_he}`, 'bold', 9.5)
      w.photoGrid(
        list.map((p) => ({ ...p, field: 'siteOverview' }) as SurveyPhoto),
        (_p, i) => (list[i]!.itemCode ? `${list[i]!.itemCode} · ${dt(list[i]!.createdAt)}` : dt(list[i]!.createdAt)),
      )
    }

    if (s.kind === 'signatures') {
      w.section(s.title_he)
      if (s.hint_he) w.paragraph(s.hint_he, 'normal', 9.5, MUTED)
      w.signatures(s.signers.map((g) => ({ role: g.label_he, name: r.signatures[g.key]?.name ?? '', at: dt(r.signatures[g.key]?.signedAt), dataUrl: r.signatures[g.key]?.dataUrl ?? null })))
    }
  }

  if (r.contentHash) w.paragraph(`טביעת תוכן sha256: ${r.contentHash}`, 'normal', 7.5, MUTED)
  if (draft) w.watermark('טיוטה')
  const bytes = w.finish()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), bytes, meta: { pages: doc.getNumberOfPages(), bytes: bytes.byteLength } }
}

export function reportPdfFilename(r: ReportInstance): string {
  return `bee-${r.templateKey.replace(/_/g, '-')}-r${r.revision}-${safeFilename(r.context.projectName, r.projectId.slice(0, 8))}.pdf`
}
