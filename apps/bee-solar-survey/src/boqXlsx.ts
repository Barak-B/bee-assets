/**
 * Bill of quantities workbook (docs/plan/templates/boq-xlsx-layout.md, lite):
 * `סיכום` + `פרמטרים` + one sheet per chapter 08.CC, RTL, live formulas with
 * cached results from the engine, two views:
 *  - customer: what is included (description / unit / qty) and one system
 *    price; only add-ons carry their own price (locked). Equipment prices stay
 *    in the office (Barak, 2026-10-25).
 *  - internal: unit price / total / note + unit cost, cost total, profit ₪, profit %, SKU, qty source, verification
 * Works in Node (tests) and the browser (lazy-loaded).
 */
import { BOQ_SECTIONS, boqSectionTitle, customerPriceSplit, type QuoteLine, type QuoteVersion } from '@bee/quote-core'
import type ExcelJSNs from 'exceljs'
import type { SiteSurveyProject } from './types'

export type BoqView = 'customer' | 'internal'

type Workbook = ExcelJSNs.Workbook
type Worksheet = ExcelJSNs.Worksheet

const UNIT_HE: Record<QuoteLine['unit'], string> = {
  unit: "יח'",
  m: "מ'",
  m2: 'מ"ר',
  set: 'סט',
  komplet: "קומפ'",
  day: 'יום',
  hour: 'שעה',
  kwp: 'kWp',
  kwh: 'kWh',
  year: 'שנה',
  piece_3m: "יח' (3 מ')",
}

const MONEY = '#,##0.00 "₪"'
const QTY = '#,##0.##'
const FONT = { name: 'Arial', size: 11 }
const HEAD_FILL: ExcelJSNs.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1C24' } }
const HEAD_FONT = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const FLAG_FILL: ExcelJSNs.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6D5' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFD9DEE3' } }

function chapterName(code: string): string {
  return code // sheet names "08.02" are valid and match the template
}

function definedName(code: string, suffix: 'TOTAL' | 'COST'): string {
  return `CH_${code.replace('.', '_')}_${suffix}`
}

function sectionOf(l: QuoteLine): string {
  return l.boq_section && BOQ_SECTIONS.some((s) => s.code === l.boq_section) ? l.boq_section : '08.08'
}

function setupSheet(ws: Worksheet, quote: QuoteVersion, ySplit: number, landscape = false) {
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit, xSplit: 0 }]
  ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true }
  ws.headerFooter = { oddFooter: `&L${quote.quote_number} v${quote.version_no}&C&P / &N&RB.E.E` }
}

function headerRow(ws: Worksheet, values: string[], rowNo: number) {
  const row = ws.getRow(rowNo)
  values.forEach((v, i) => {
    const c = row.getCell(i + 1)
    c.value = v
    c.font = HEAD_FONT
    c.fill = HEAD_FILL
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  row.height = 22
}

export async function buildBoqWorkbook(quote: QuoteVersion, project: SiteSurveyProject, view: BoqView): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'B.E.E bee-solar-survey'
  wb.created = new Date(quote.created_at)
  wb.title = `כתב כמויות ${quote.quote_number} v${quote.version_no}`
  const internal = view === 'internal'
  if (!internal) return fillCustomerWorkbook(wb, quote, project)

  // ── Chapters ──────────────────────────────────────────────
  const bySection = new Map<string, QuoteLine[]>()
  for (const l of quote.lines) bySection.set(sectionOf(l), [...(bySection.get(sectionOf(l)) ?? []), l])
  const used = BOQ_SECTIONS.filter((s) => bySection.has(s.code))

  // Build summary first so it is the first tab, fill formulas after chapters exist.
  const summary = wb.addWorksheet('סיכום', { properties: { tabColor: { argb: 'FFF0C14B' } } })
  const params = wb.addWorksheet('פרמטרים')

  const chapterTotals: { code: string; total: number; cost: number }[] = []

  for (const s of used) {
    const ws = wb.addWorksheet(chapterName(s.code))
    setupSheet(ws, quote, 2, internal) // 14 internal columns only fit across a landscape page
    const cols = internal
      ? ['מס\' סעיף', 'תיאור', "יח'", 'כמות', "מחיר יח' (₪)", 'סה"כ (₪)', 'הערה', "עלות יח' (₪)", 'עלות סה"כ', 'רווח ₪', 'רווח %', 'מק"ט', 'מקור כמות', 'אימות']
      : ['מס\' סעיף', 'תיאור', "יח'", 'כמות', "מחיר יח' (₪)", 'סה"כ (₪)', 'הערה']
    const widths = [12, 52, 9, 10, 14, 16, 34, 14, 14, 12, 9, 16, 26, 10]
    ws.columns = cols.map((_, i) => ({ width: widths[i] }))

    ws.mergeCells(1, 1, 1, 7)
    const title = ws.getCell(1, 1)
    title.value = `פרק ${s.code} — ${s.title_he}`
    title.font = { name: 'Arial', size: 14, bold: true }
    title.alignment = { horizontal: 'right' }
    headerRow(ws, cols, 2)

    const lines = bySection.get(s.code)!
    let r = 3
    let total = 0
    let cost = 0
    lines.forEach((l, i) => {
      const row = ws.getRow(r)
      const code = `${s.code}.${String((i + 1) * 10).padStart(4, '0')}`
      const flagged = l.needs_owner_input || l.verification === 'unverified'
      row.getCell(1).value = code
      row.getCell(1).numFmt = '@'
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(2).value = l.description_he ? `${l.name_he} — ${l.description_he}` : l.name_he
      row.getCell(2).alignment = { wrapText: true, horizontal: 'right', vertical: 'top' }
      row.getCell(3).value = UNIT_HE[l.unit]
      row.getCell(4).value = l.qty
      row.getCell(4).numFmt = QTY

      if (l.passthrough) {
        row.getCell(5).value = 'לפי חשבון'
        row.getCell(6).value = 'לא כלול'
      } else if (l.unit_price_ils === null) {
        row.getCell(5).value = 'לאימות'
        row.getCell(6).value = 'לאימות'
      } else {
        row.getCell(5).value = l.unit_price_ils
        row.getCell(5).numFmt = MONEY
        row.getCell(6).value = { formula: `ROUND(D${r}*E${r},2)`, result: l.line_total_ils ?? 0 }
        row.getCell(6).numFmt = MONEY
        total += l.line_total_ils ?? 0
      }
      row.getCell(7).value = `${l.qty_note_he}${flagged ? ' *' : ''}`
      row.getCell(7).alignment = { wrapText: true, horizontal: 'right', vertical: 'top' }

      if (internal) {
        if (l.unit_cost_ils !== null && !l.passthrough) {
          const lineCost = Math.round(l.unit_cost_ils * l.qty * 100) / 100
          row.getCell(8).value = l.unit_cost_ils
          row.getCell(8).numFmt = MONEY
          row.getCell(9).value = { formula: `ROUND(D${r}*H${r},2)`, result: lineCost }
          row.getCell(9).numFmt = MONEY
          if (l.line_total_ils !== null) {
            row.getCell(10).value = { formula: `F${r}-I${r}`, result: Math.round(((l.line_total_ils ?? 0) - lineCost) * 100) / 100 }
            row.getCell(10).numFmt = MONEY
            row.getCell(11).value = { formula: `IF(F${r}=0,0,J${r}/F${r})`, result: l.line_total_ils ? ((l.line_total_ils - lineCost) / l.line_total_ils) : 0 }
            row.getCell(11).numFmt = '0.0%'
          }
          cost += lineCost
        }
        row.getCell(12).value = l.sku
        row.getCell(12).numFmt = '@'
        row.getCell(13).value = `${l.qty_source}${l.fx_rate ? ` · ${l.cost_currency}@${l.fx_rate}` : ''}`
        row.getCell(14).value = l.needs_owner_input ? 'לאימות' : l.verification === 'unverified' ? 'לא מאומת' : '✓'
      }

      for (let c = 1; c <= cols.length; c++) {
        const cell = row.getCell(c)
        cell.font = cell.font ?? FONT
        cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN }
        if (flagged && c <= 7) cell.fill = FLAG_FILL
      }
      r++
    })

    const totalRow = ws.getRow(r + 1)
    totalRow.getCell(2).value = `סה"כ פרק ${s.code}`
    totalRow.getCell(2).font = { ...FONT, bold: true }
    totalRow.getCell(6).value = { formula: `SUBTOTAL(9,F3:F${r - 1})`, result: Math.round(total * 100) / 100 }
    totalRow.getCell(6).numFmt = MONEY
    totalRow.getCell(6).font = { ...FONT, bold: true }
    totalRow.getCell(6).border = { top: { style: 'double' } }
    wb.definedNames.add(`'${chapterName(s.code)}'!$F$${r + 1}`, definedName(s.code, 'TOTAL'))
    if (internal) {
      totalRow.getCell(9).value = { formula: `SUBTOTAL(9,I3:I${r - 1})`, result: Math.round(cost * 100) / 100 }
      totalRow.getCell(9).numFmt = MONEY
      totalRow.getCell(9).font = { ...FONT, bold: true }
      wb.definedNames.add(`'${chapterName(s.code)}'!$I$${r + 1}`, definedName(s.code, 'COST'))
    }
    ws.pageSetup.printTitlesRow = '2:2'
    chapterTotals.push({ code: s.code, total: Math.round(total * 100) / 100, cost: Math.round(cost * 100) / 100 })
  }

  // ── Parameters ─────────────────────────────────────────────
  setupSheet(params, quote, 1)
  params.columns = [{ width: 34 }, { width: 18 }, { width: 36 }]
  headerRow(params, ['פרמטר', 'ערך', 'מקור / הערה'], 1)
  const t = quote.totals
  const paramRows: [string, number | string | null, string, string | null, string?][] = [
    ['שיעור מע"מ', t.vat_rate, quote.rules_version, 'VAT_RATE', '0%'],
    ['הספק DC (kWp)', quote.design.dc_kwp, 'תכנון מהיר', 'KWP', '0.00'],
    ['אגרות חח"י — אומדן (לא כלול)', t.passthrough_estimate_ils, 'לפי חשבון בפועל', 'PASSTHROUGH_TOTAL', MONEY],
    ['גרסת קטלוג', quote.catalog_version, '', null],
    ['גרסת כללי תמחור', quote.rules_version, '', null],
    ['Snapshot', quote.snapshot_hash.slice(0, 16), 'sha256 של ההצעה', null],
  ]
  paramRows.forEach(([label, value, note, name, fmt], i) => {
    const row = params.getRow(i + 2)
    row.getCell(1).value = label
    row.getCell(2).value = value ?? 'לאימות'
    if (fmt && typeof value === 'number') row.getCell(2).numFmt = fmt
    row.getCell(3).value = note
    if (name) wb.definedNames.add(`'פרמטרים'!$B$${i + 2}`, name)
  })

  // ── Summary ────────────────────────────────────────────────
  setupSheet(summary, quote, 0)
  summary.columns = [{ width: 14 }, { width: 46 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }]
  summary.mergeCells('A1:D1')
  summary.getCell('A1').value = `כתב כמויות — ${project.projectName || quote.input.projectName}`
  summary.getCell('A1').font = { name: 'Arial', size: 16, bold: true }
  summary.getCell('A2').value = `אתר: ${quote.input.address}`
  summary.getCell('A3').value = `הצעה ${quote.quote_number} · גרסה ${quote.version_no} · תאריך ${quote.created_at.slice(0, 10)}${quote.terms.valid_until ? ` · תוקף עד ${quote.terms.valid_until}` : ''}`
  summary.getCell('A4').value = `מערכת: ${quote.design.dc_kwp} kWp DC · ${quote.design.module_count} מודולים · ${quote.design.inverter_count} ממיר/ים · גג ${quote.input.roofType}`
  summary.getCell('A5').value = 'טיוטה — לא נשלח ללקוח ללא אישור ברק (Law #2)'
  summary.getCell('A5').font = { ...FONT, italic: true, color: { argb: 'FF5C6670' } }

  const head = internal ? ['פרק', 'שם הפרק', 'סה"כ (₪)', 'עלות (₪)', 'רווח (₪)', 'רווח %'] : ['פרק', 'שם הפרק', 'סה"כ (₪)']
  headerRow(summary, head, 7)
  let r = 8
  for (const ch of chapterTotals) {
    const row = summary.getRow(r)
    row.getCell(1).value = ch.code
    row.getCell(1).numFmt = '@'
    row.getCell(2).value = boqSectionTitle(ch.code)
    row.getCell(3).value = { formula: definedName(ch.code, 'TOTAL'), result: ch.total }
    row.getCell(3).numFmt = MONEY
    if (internal) {
      row.getCell(4).value = { formula: definedName(ch.code, 'COST'), result: ch.cost }
      row.getCell(4).numFmt = MONEY
      row.getCell(5).value = { formula: `C${r}-D${r}`, result: Math.round((ch.total - ch.cost) * 100) / 100 }
      row.getCell(5).numFmt = MONEY
      row.getCell(6).value = { formula: `IF(C${r}=0,0,E${r}/C${r})`, result: ch.total ? (ch.total - ch.cost) / ch.total : 0 }
      row.getCell(6).numFmt = '0.0%'
    }
    r++
  }
  const first = 8
  const last = r - 1
  const rawSum = Math.round(chapterTotals.reduce((s, c) => s + c.total, 0) * 100) / 100
  const before = t.subtotal_excl_vat_ils
  const rounding = before === null ? 0 : Math.round((before - rawSum) * 100) / 100
  r++
  const put = (label: string, formula: string | null, result: number | null, name?: string, bold = false) => {
    const row = summary.getRow(r)
    row.getCell(2).value = label
    row.getCell(2).font = { ...FONT, bold }
    const c = row.getCell(3)
    c.value = result === null && formula === null ? 'לאימות' : formula ? { formula, result: result ?? 0 } : result
    c.numFmt = MONEY
    c.font = { ...FONT, bold }
    if (name) wb.definedNames.add(`'סיכום'!$C$${r}`, name)
    r++
  }
  put('סה"כ פרקים', last >= first ? `SUM(C${first}:C${last})` : null, rawSum, 'TOTAL_CHAPTERS')
  if (rounding) put('עיגול', null, rounding, 'ROUNDING')
  put('סה"כ לפני מע"מ', `TOTAL_CHAPTERS${rounding ? '+ROUNDING' : ''}`, before ?? rawSum, 'TOTAL_BEFORE_VAT', true)
  if (t.vat_rate === null) put('מע"מ', null, null)
  else put(`מע"מ (${Math.round(t.vat_rate * 1000) / 10}%)`, 'ROUND(TOTAL_BEFORE_VAT*VAT_RATE,2)', t.vat_ils, 'VAT_AMOUNT')
  if (t.vat_rate === null) put('סה"כ כולל מע"מ', null, null)
  else put('סה"כ כולל מע"מ', 'TOTAL_BEFORE_VAT+VAT_AMOUNT', t.total_incl_vat_ils, 'TOTAL_INCL_VAT', true)
  if (quote.design.dc_kwp) put('מחיר ל-kWp (לפני מע"מ)', 'ROUND(TOTAL_BEFORE_VAT/KWP,0)', t.price_per_kwp_excl_vat_ils === null ? null : Math.round(t.price_per_kwp_excl_vat_ils))

  r++
  const notes = [
    'אגרות חח"י — לפי חשבון בפועל, אינן כלולות בסה"כ.',
    quote.terms.linkage === 'fx' ? 'מחירי הציוד צמודים לשער המט"ח ביום ההצעה.' : 'המחיר קבוע לתקופת התוקף.',
    'סעיפים המסומנים * — נתונים לאימות סופי.',
    t.unpriced_lines ? `${t.unpriced_lines} סעיפים ללא מחיר ("לאימות") אינם כלולים בסה"כ.` : '',
  ].filter(Boolean)
  for (const n of notes) {
    summary.getCell(`B${r}`).value = n
    summary.getCell(`B${r}`).font = { ...FONT, color: { argb: 'FF5C6670' } }
    r++
  }

  if (!internal) {
    // Customer copy: locked against accidental edits (no password — not a security control).
    for (const ws of wb.worksheets) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true })
  }
  return wb
}

/** The customer copy: one sheet, what is included, one system price, add-ons priced apart. */
async function fillCustomerWorkbook(wb: Workbook, quote: QuoteVersion, project: SiteSurveyProject): Promise<Workbook> {
  const t = quote.totals
  const split = customerPriceSplit(quote)
  const ws = wb.addWorksheet('הצעה', { properties: { tabColor: { argb: 'FFF0C14B' } } })
  setupSheet(ws, quote, 0)
  ws.columns = [{ width: 12 }, { width: 56 }, { width: 10 }, { width: 12 }, { width: 18 }]

  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = `הצעת מחיר — ${project.projectName || quote.input.projectName}`
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true }
  ws.getCell('A2').value = `אתר: ${quote.input.address}`
  ws.getCell('A3').value = `הצעה ${quote.quote_number} · גרסה ${quote.version_no} · תאריך ${quote.created_at.slice(0, 10)}${quote.terms.valid_until ? ` · תוקף עד ${quote.terms.valid_until}` : ''}`
  ws.getCell('A4').value = `מערכת: ${quote.design.dc_kwp} kWp DC · ${quote.design.module_count} מודולים · ${quote.design.inverter_count} ממיר/ים`

  let r = 6
  const put = (label: string, value: number | null, bold = false) => {
    const row = ws.getRow(r)
    row.getCell(2).value = label
    row.getCell(2).font = { ...FONT, bold }
    row.getCell(5).value = value === null ? 'לאימות' : value
    row.getCell(5).numFmt = MONEY
    row.getCell(5).font = { ...FONT, bold }
    r++
  }
  headerRow(ws, ['', 'מחיר', '', '', '₪'], r++)
  put('מחיר המערכת, כולל ציוד, התקנה ושירותים', split.systemPrice, true)
  for (const l of split.addonLines) put(`תוספת: ${l.name_he}${l.qty !== 1 ? ` (${l.qty} ${UNIT_HE[l.unit]})` : ''}`, l.line_total_ils)
  put('סה"כ לפני מע"מ', t.subtotal_excl_vat_ils, true)
  put(t.vat_rate === null ? 'מע"מ' : `מע"מ (${Math.round(t.vat_rate * 1000) / 10}%)`, t.vat_ils)
  put('סה"כ כולל מע"מ', t.total_incl_vat_ils, true)
  if (split.pricePerKwp !== null) put(`מחיר ל-kWp לפני מע"מ${split.addonLines.length ? ' (ללא תוספות)' : ''}`, Math.round(split.pricePerKwp))

  r++
  headerRow(ws, ["מס' סעיף", 'מה כלול במערכת', "יח'", 'כמות', 'הערה'], r++)
  const bySection = new Map<string, QuoteLine[]>()
  for (const l of quote.lines) {
    if (split.addonLines.includes(l)) continue
    bySection.set(sectionOf(l), [...(bySection.get(sectionOf(l)) ?? []), l])
  }
  for (const s of BOQ_SECTIONS.filter((x) => bySection.has(x.code))) {
    ws.getRow(r).getCell(2).value = `${s.code} · ${boqSectionTitle(s.code)}`
    ws.getRow(r).getCell(2).font = { ...FONT, bold: true }
    r++
    bySection.get(s.code)!.forEach((l, i) => {
      const row = ws.getRow(r)
      row.getCell(1).value = `${s.code}.${String((i + 1) * 10).padStart(4, '0')}`
      row.getCell(1).numFmt = '@'
      row.getCell(2).value = l.description_he ? `${l.name_he} — ${l.description_he}` : l.name_he
      row.getCell(2).alignment = { wrapText: true, horizontal: 'right', vertical: 'top' }
      row.getCell(3).value = UNIT_HE[l.unit]
      row.getCell(4).value = l.qty
      row.getCell(4).numFmt = QTY
      row.getCell(5).value = l.passthrough ? 'לפי חשבון, לא כלול' : ''
      for (let c = 1; c <= 5; c++) row.getCell(c).border = { top: THIN, bottom: THIN, left: THIN, right: THIN }
      r++
    })
  }

  r++
  for (const n of [
    'אגרות חח"י — לפי חשבון בפועל, אינן כלולות בסה"כ.',
    quote.terms.linkage === 'fx' ? 'המחיר צמוד לשער המט"ח ביום ההצעה.' : 'המחיר קבוע לתקופת התוקף.',
  ]) {
    ws.getCell(`B${r}`).value = n
    ws.getCell(`B${r}`).font = { ...FONT, color: { argb: 'FF5C6670' } }
    r++
  }
  // Locked against accidental edits (no password — not a security control).
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true })
  return wb
}

export async function buildBoqXlsx(quote: QuoteVersion, project: SiteSurveyProject, view: BoqView): Promise<{ blob: Blob; bytes: ArrayBuffer }> {
  const wb = await buildBoqWorkbook(quote, project, view)
  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { blob, bytes }
}

export function boqFilename(quote: QuoteVersion, view: BoqView): string {
  return `BOQ_${quote.quote_number}_v${quote.version_no}_${view}.xlsx`
}
