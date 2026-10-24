/**
 * "ייצוא לאקסל" on the office screen: the jobs on screen, one row each, with
 * the lifecycle milestones as date columns. The rows are a pure function
 * (tested); the workbook is ExcelJS, loaded only when asked for.
 */
import type ExcelJSNs from 'exceljs'
import { MILESTONES, OFFICE_STATUS_LABEL_HE, PLAN_STAGE, STAGE_LABEL_HE, nextStepHe } from '../stage'
import type { OfficeJob } from './api'
import { attentionHe } from './attention'

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export const JOB_COLUMNS: { header: string; width: number }[] = [
  { header: 'פרויקט', width: 26 },
  { header: 'לקוח', width: 20 },
  { header: 'טלפון', width: 14 },
  { header: 'מייל', width: 24 },
  { header: 'כתובת', width: 26 },
  { header: 'שלב', width: 14 },
  { header: 'קוד שלב', width: 9 },
  { header: 'סטטוס משרד', width: 11 },
  { header: 'הצעד הבא', width: 26 },
  { header: 'דורש טיפול', width: 30 },
  { header: 'סוקר', width: 12 },
  { header: 'מועד סקר', width: 11 },
  { header: 'מועד התקנה', width: 11 },
  { header: 'הצעה', width: 16 },
  { header: 'גרסה', width: 6 },
  { header: 'סה״כ כולל מע״מ (₪)', width: 14 },
  { header: 'kWp', width: 7 },
  { header: 'אושר ע״י הלקוח', width: 12 },
  ...MILESTONES.map((m) => ({ header: m.label_he, width: 12 })),
  { header: 'פעילות אחרונה', width: 12 },
]

export type Cell = string | number | null

export function jobRows(jobs: OfficeJob[], now = new Date()): Cell[][] {
  return jobs.map((j) => {
    const accepted = j.links.map((l) => l.accepted?.accepted_at ?? '').filter(Boolean).sort()[0] ?? ''
    const ms = j.milestones ?? {}
    return [
      j.projectName,
      j.customerName,
      j.customerPhone,
      j.customerEmail,
      j.address,
      STAGE_LABEL_HE[j.stage],
      PLAN_STAGE[j.stage],
      OFFICE_STATUS_LABEL_HE[j.office?.status ?? 'active'],
      nextStepHe(j.stage, ms),
      attentionHe(j, now) ?? '',
      j.office?.assigned_to_name || j.surveyor || '',
      j.office?.planned_date ?? '',
      j.office?.install_date ?? '',
      j.latestQuote?.quote_number ?? '',
      j.latestQuote?.version_no ?? null,
      j.latestQuote?.total_incl_vat_ils ?? null,
      j.latestQuote?.dc_kwp ?? null,
      day(accepted),
      ...MILESTONES.map((m) => ms[m.key]?.date ?? ''),
      day(j.lastActivityAt),
    ]
  })
}

export async function jobsWorkbook(jobs: OfficeJob[], now = new Date()): Promise<Blob> {
  const { default: ExcelJS } = (await import('exceljs')) as { default: typeof ExcelJSNs }
  const wb = new ExcelJS.Workbook()
  wb.creator = 'B.E.E'
  const ws = wb.addWorksheet('עבודות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1, xSplit: 1 }] })
  ws.columns = JOB_COLUMNS.map((c) => ({ header: c.header, width: c.width }))
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7C4' } }
  for (const r of jobRows(jobs, now)) ws.addRow(r)
  ws.getColumn(16).numFmt = '#,##0'
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: JOB_COLUMNS.length } }
  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
