/**
 * Quote draft PDF — a compact version of `docs/plan/templates/quote-pdf-sections.md`
 * (cover numbers, system, bill of quantities, price, payment schedule, terms,
 * what's missing). Every unverified value is marked "לאימות"; the document is
 * watermarked as a draft.
 */
import { DEFAULT_COMPANY, companyLine, type CompanyProfile } from './company'
import { ROOF_LABELS_HE, flagLabelHe, formatIls, pct, scheduleAmounts, type QuoteLine, type QuoteVersion } from '@bee/quote-core'
import { MUTED, WARN_RED, Writer, createDoc, safeFilename } from './pdfkit'
import { formatNumber } from './rtl'
import type { SiteSurveyProject } from './types'
import { fmtDate, fmtDay } from './dates'

const KIND_LABEL: Record<QuoteLine['kind'], string> = {
  module: 'מודולים',
  inverter: 'ממירים',
  optimizer: 'אופטימייזרים',
  battery: 'אגירה',
  breaker: 'הגנות',
  meter: 'מונה',
  cable: 'כבלים',
  tray: 'תעלות',
  cabinet: 'לוחות והגנות',
  mounting: 'קונסטרוקציה',
  accessory: 'אביזרים',
  labour: 'עבודה והתקנה',
  service: 'שירותים ואישורים',
  fee: 'אגרות (לפי חשבון בפועל)',
}

const MONTHS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

const UNIT_LABEL: Record<QuoteLine['unit'], string> = {
  unit: 'יח׳',
  m: 'מ׳',
  m2: 'מ״ר',
  set: 'סט',
  komplet: 'קומפלט',
  day: 'יום',
  hour: 'שעה',
  kwp: 'kWp',
  kwh: 'kWh',
  year: 'שנה',
  piece_3m: 'יח׳ (3 מ׳)',
}

export interface QuotePdfResult {
  blob: Blob
  bytes: ArrayBuffer
  meta: { pages: number; bytes: number; hash: string }
}

function money(n: number | null): string {
  return n === null ? 'לאימות *' : formatIls(n)
}

export interface QuotePdfOptions {
  /**
   * internal (default): watermarked draft with the "to complete" list.
   * customer: the copy attached to the public link — no watermark, no internal notes.
   * A customer PDF is only built for a quote that passed publishBlockers().
   */
  audience?: 'internal' | 'customer'
  /** Who we are, for the customer copy's footer (name, ח״פ, license, phone). */
  company?: CompanyProfile | null
}

export async function buildQuotePdf(quote: QuoteVersion, project: SiteSurveyProject, opts: QuotePdfOptions = {}): Promise<QuotePdfResult> {
  const customer = opts.audience === 'customer'
  const d = quote.design
  const t = quote.totals
  const doc = createDoc({
    title: `B.E.E הצעת מחיר ${quote.quote_number} — ${quote.input.projectName}`,
    subject: customer ? 'הצעת מחיר' : 'הצעת מחיר ראשונית · טיוטה',
  })
  const w = new Writer(
    doc,
    customer
      ? {
          title: `הצעת מחיר · ${quote.quote_number} · גרסה ${quote.version_no}`,
          sub: `${quote.input.customerName ? `לכבוד ${quote.input.customerName} · ` : ''}${quote.input.projectName} · ${quote.input.address} · ${fmtDate(quote.created_at)}`,
        }
      : {
          title: `הצעת מחיר ראשונית · ${quote.quote_number} · גרסה ${quote.version_no} · טיוטה`,
          sub: `${quote.input.customerName ? `${quote.input.customerName} · ` : ''}${quote.input.projectName} · ${quote.input.address} · ${fmtDate(quote.created_at)}${project.surveyor ? ` · סקר: ${project.surveyor} ${fmtDay(project.surveyDate)}` : ` · סקר: ${fmtDay(project.surveyDate)}`}`,
        },
    customer
      ? { right: `${(opts.company ?? DEFAULT_COMPANY).brand} · ${companyLine(opts.company ?? DEFAULT_COMPANY)} · * = ייקבע סופית בתכנון המפורט`, left: `${quote.quote_number} v${quote.version_no} · ${quote.snapshot_hash.slice(0, 12)}` }
      : {
          right: 'טיוטה בלבד · Law #2 · לא נשלח ללקוח ללא אישור ברק · * = לאימות',
          left: `${quote.quote_number} v${quote.version_no} · ${quote.snapshot_hash.slice(0, 8)}`,
        },
  )

  // ── Summary cards ───────────────────────────────────────
  w.section('תקציר')
  w.statCards([
    { label: 'הספק DC מתוכנן', value: d.dc_kwp ? `${d.dc_kwp} kWp` : '—' },
    {
      label: 'ייצור שנתי משוער',
      // Same number as the savings section (first year, after initial degradation) when there is one.
      value: quote.roi ? `${formatNumber(quote.roi.kpi.annual_yield_kwh_y1)} kWh *` : d.annual_yield_kwh_estimate ? `${formatNumber(d.annual_yield_kwh_estimate)} kWh *` : 'לאימות *',
    },
    { label: 'סה״כ כולל מע״מ', value: t.total_incl_vat_ils === null ? 'לאימות *' : formatIls(t.total_incl_vat_ils) },
  ])
  const basis: Record<typeof d.kwp_basis, string> = {
    target: 'יעד ה-kWp שנקבע בסקר',
    area: 'השטח השימושי בגג',
    consumption: 'הצריכה השנתית',
    budget: 'התקציב',
    none: 'לא נקבע — חסר יעד/שטח/צריכה',
  }
  if (!customer) w.paragraph(`ההספק נגזר מ${basis[d.kwp_basis]}. ההצעה חושבה אוטומטית מנתוני סקר האתר ומקטלוג B.E.E ומיועדת לעיון פנימי לפני תכנון מפורט.`, 'normal', 10, MUTED)
  w.space()

  // ── System ──────────────────────────────────────────────
  w.section('המערכת המוצעת')
  const moduleLine = quote.lines.find((l) => l.kind === 'module')
  const inverterLine = quote.lines.find((l) => l.kind === 'inverter')
  const batteryLine = quote.lines.find((l) => l.kind === 'battery')
  w.row('מודולים', moduleLine ? `${d.module_count} × ${moduleLine.name_he}${d.module_w ? ` · ${d.module_w}W למודול` : ''}` : '—')
  w.row('ממיר', inverterLine ? `${d.inverter_count} × ${inverterLine.name_he}${d.inverter_ac_kw ? ` · ${d.inverter_ac_kw} kW AC` : ''}` : 'לא נבחר')
  if (d.optimizer_count) w.row('אופטימייזרים', `${d.optimizer_count}`)
  w.row('אגירה', batteryLine ? batteryLine.name_he : 'לא כלול')
  w.row('סוג גג', ROOF_LABELS_HE[quote.input.roofType] ?? quote.input.roofType)
  w.row('שטח נדרש / זמין', d.area_needed_m2 ? `${d.area_needed_m2} / ${quote.input.usableAreaM2 ?? '—'} מ״ר${d.area_ok === false ? ' — השטח אינו מספיק' : ''}` : 'לאימות *')
  if (d.strings_estimate) w.row('מחרוזות (הערכה)', `${d.strings_estimate}`)
  w.space()

  // ── Production and savings (spec 12 §5, quote-pdf-sections §2.4–2.5) ──
  const roi = quote.roi
  if (roi) {
    w.section('תחזית ייצור וחיסכון *')
    w.statCards([
      { label: 'ייצור שנה ראשונה', value: `${formatNumber(roi.kpi.annual_yield_kwh_y1)} kWh` },
      { label: `חיסכון שנה ראשונה${roi.customer_type === 'private' ? ' (כולל מע״מ)' : ''}`, value: formatIls(roi.kpi.savings_y1_ils) },
      { label: 'החזר השקעה', value: roi.kpi.payback_years === null ? `מעל ${roi.series.length} שנה` : `${formatNumber(roi.kpi.payback_years, 1)} שנים` },
    ])
    w.paragraph('ייצור חודשי משוער (kWh)', 'bold', 9.5)
    w.barChart(roi.monthly_kwh, MONTHS_HE, { height: 30, valueLabel: (v, i) => (i % 3 === 0 || i === 6 ? formatNumber(v) : '') })
    w.paragraph(`תזרים מצטבר ל-${roi.series.length} שנה (₪) — מתחת לקו: לפני החזר ההשקעה`, 'bold', 9.5)
    w.barChart(
      roi.series.map((y) => y.cum_cf_ils),
      roi.series.map((y) => (y.year === 1 || y.year % 5 === 0 ? String(y.year) : '')),
      { height: 34, valueLabel: (v, i) => (i === roi.series.length - 1 ? formatIls(v) : '') },
    )
    if (roi.bill.before_y1_ils !== null) w.row('חשבון חשמל שנתי', `היום כ-${formatIls(roi.bill.before_y1_ils)} · אחרי המערכת כ-${formatIls(roi.bill.after_y1_ils)}`)
    if (roi.kpi.offset_pct !== null) w.row('כיסוי הצריכה', `${roi.kpi.offset_pct}%`)
    w.row(`חיסכון נטו ל-${roi.series.length} שנה`, formatIls(roi.kpi.lifetime_net_savings_ils))
    if (!customer) w.row('NPV / IRR (פנימי)', `${formatIls(roi.kpi.npv_ils)} · ${roi.kpi.irr_pct === null ? '—' : `${roi.kpi.irr_pct}%`}`)
    if (roi.kpi.co2_t_year !== null) w.row('הפחתת פליטות', `${formatNumber(roi.kpi.co2_t_year, 1)} טון CO₂ בשנה`)
    w.paragraph('הנחות החישוב:', 'bold', 9.5)
    w.bullets(
      roi.assumptions.map((a) => `${a.label_he}${a.value === '' ? '' : `: ${typeof a.value === 'number' ? formatNumber(a.value, 3) : a.value}`}${a.unit ? ` ${a.unit}` : ''}`),
      MUTED,
    )
    w.paragraph('* הערכה מהירה לפי הספק, כיוון ושיפוע; ייצור בפועל משתנה משנה לשנה. התעריפים לפי יום ההצעה. אינו ייעוץ מס.', 'normal', 8.5, MUTED)
    if (!customer) for (const f of roi.flags) w.paragraph(`· ${flagLabelHe(f)}`, 'normal', 8.5, MUTED)
    w.space()
  }

  // ── Bill of quantities ──────────────────────────────────
  w.section('כתב כמויות (תמצית)')
  const groups = new Map<QuoteLine['kind'], QuoteLine[]>()
  for (const l of quote.lines) groups.set(l.kind, [...(groups.get(l.kind) ?? []), l])
  const rows: string[][] = []
  for (const [kind, list] of groups) {
    rows.push([KIND_LABEL[kind], '', '', '', ''])
    for (const l of list) {
      rows.push([
        `${l.name_he}${l.needs_owner_input ? ' *' : ''}`,
        UNIT_LABEL[l.unit],
        formatNumber(l.qty),
        l.passthrough ? 'לפי חשבון' : money(l.unit_price_ils),
        l.passthrough ? '—' : money(l.line_total_ils),
      ])
    }
  }
  w.table(
    [
      { label: 'פריט', width: 86 },
      { label: 'יח׳', width: 18 },
      { label: 'כמות', width: 18, align: 'left' },
      { label: 'מחיר יח׳', width: 28, align: 'left' },
      { label: 'סה״כ', width: 32, align: 'left' },
    ],
    rows,
    { fontSize: 8.5 },
  )

  // ── Price ───────────────────────────────────────────────
  w.section('מחיר')
  const linesSum = quote.lines.filter((l) => !l.passthrough && l.line_total_ils !== null).reduce((s, l) => s + (l.line_total_ils ?? 0), 0)
  const rounding = t.subtotal_excl_vat_ils === null ? 0 : Math.round((t.subtotal_excl_vat_ils - linesSum) * 100) / 100
  const priceRows: string[][] = [
    ...(rounding ? [['סה״כ שורות', formatIls(Math.round(linesSum * 100) / 100, 2)], ['עיגול', formatIls(rounding, 2)]] : []),
    ['סה״כ לפני מע״מ', money(t.subtotal_excl_vat_ils)],
    [`מע״מ ${t.vat_rate === null ? '(לאימות *)' : pct(t.vat_rate)}`, money(t.vat_ils)],
    ['סה״כ כולל מע״מ', money(t.total_incl_vat_ils)],
  ]
  w.table([{ label: '', width: 120 }, { label: '₪', width: 62, align: 'left' }], priceRows, { fontSize: 10, highlightLast: true })
  if (t.price_per_kwp_excl_vat_ils !== null) w.paragraph(`מחיר ל-kWp (לפני מע״מ): ${formatIls(t.price_per_kwp_excl_vat_ils)}`, 'normal', 9.5, MUTED)
  w.paragraph(
    t.passthrough_estimate_ils !== null
      ? `לא כולל אגרות חח״י — לפי חשבון בפועל (אומדן: ${formatIls(t.passthrough_estimate_ils)}).`
      : 'לא כולל אגרות חח״י — לפי חשבון בפועל.',
    'normal',
    9.5,
    MUTED,
  )
  if (t.unpriced_lines) w.paragraph(`${t.unpriced_lines} שורות ללא מחיר אינן נכללות בסה״כ.`, 'bold', 9.5, WARN_RED)
  w.space()

  // ── Payment schedule ────────────────────────────────────
  w.section('לוח תשלומים')
  const total = t.total_incl_vat_ils
  // Milestones add up to the total exactly (the last one takes the remainder).
  const amounts = scheduleAmounts(total, quote.terms.payment_schedule.map((m) => m.pct))
  w.table(
    [
      { label: 'אבן דרך', width: 110 },
      { label: '%', width: 20, align: 'left' },
      { label: 'סכום', width: 52, align: 'left' },
    ],
    quote.terms.payment_schedule.map((m, i) => [
      m.label_he,
      m.pct === null ? '*' : `${m.pct}%`,
      amounts[i] === null || amounts[i] === undefined ? 'לאימות *' : formatIls(amounts[i]!, 2),
    ]),
    { fontSize: 9 },
  )

  // ── What changed (spec quote-pdf-sections §2.12) ─────────
  const ch = quote.changes
  if (ch && (ch.added.length || ch.removed.length || ch.changed.length)) {
    w.section(`מה השתנה מגרסה ${ch.from_version}`)
    const diffRows: string[][] = [
      ...ch.added.map((l) => [`נוסף: ${l.name_he}`, '—', formatNumber(l.qty), money(l.line_total_ils)]),
      ...ch.removed.map((l) => [`הוסר: ${l.name_he}`, formatNumber(l.qty), '—', l.line_total_ils === null ? '—' : formatIls(-l.line_total_ils)]),
      ...ch.changed.map((c) => [c.name_he, formatNumber(c.before.qty), formatNumber(c.after.qty), c.delta_ils === null ? 'לאימות *' : `${c.delta_ils > 0 ? '+' : ''}${formatIls(c.delta_ils)}`]),
    ]
    const d2 = ch.total_delta_incl_vat_ils
    diffRows.push(['הפרש כולל מע״מ', '', '', d2 === null ? 'לאימות *' : `${d2 > 0 ? '+' : ''}${formatIls(d2)}`])
    w.table(
      [
        { label: 'שורה', width: 96 },
        { label: 'כמות קודם', width: 24, align: 'left' },
        { label: 'כמות עכשיו', width: 24, align: 'left' },
        { label: 'הפרש ₪', width: 38, align: 'left' },
      ],
      diffRows,
      { fontSize: 8.5, highlightLast: true },
    )
  }

  // ── Terms ───────────────────────────────────────────────
  w.section('תוקף ותנאים')
  w.row('תוקף ההצעה', quote.terms.valid_until ? `עד ${quote.terms.valid_until} (${quote.terms.validity_days} ימים)` : 'לאימות *')
  w.row('הצמדה', quote.terms.linkage === 'fx' ? 'מחירי הציוד צמודים לשער המט״ח ביום ההצעה *' : 'המחיר קבוע לתקופת התוקף')
  const texts = quote.terms.texts
  if (!texts?.excluded.length) w.row('לא כלול', 'חיזוקי קונסטרוקציה/שיפוץ גג, הגדלת חיבור ואגרות חח״י, עבודות בנייה, חיבור אינטרנט באתר')
  w.row('הנחות תכנון', 'גג תקין נושא עומס; גישה למנוף; לוח קיים תקין; פריסה סופית תיקבע בתכנון המפורט')
  w.space()

  // ── Company wording (quote-pdf-sections §2.7, §2.9, §2.10) ──
  const textSections: [keyof NonNullable<typeof texts>, string][] = [
    ['included', 'כלול בהצעה'],
    ['excluded', 'לא כלול'],
    ['warranty', 'אחריות'],
    ['customer_obligations', 'באחריות הלקוח'],
  ]
  for (const [k, title] of textSections) {
    const items = texts?.[k] ?? []
    if (!items.length) continue
    w.section(title)
    w.bullets(items)
    w.space()
  }

  // ── What Barak must complete ────────────────────────────
  const missing = [...new Set(quote.flags.map(flagLabelHe))]
  const unpricedSkus = quote.lines.filter((l) => l.needs_owner_input).map((l) => l.sku)
  if (!customer && (missing.length || unpricedSkus.length)) {
    w.section('לפני שימוש מול לקוח — להשלים')
    if (missing.length) w.bullets(missing, WARN_RED)
    if (unpricedSkus.length) w.paragraph(`${unpricedSkus.length} פריטים ללא מחיר או ללא אימות — מסומנים ב-* בכתב הכמויות.`, 'normal', 9.5, MUTED)
  }

  if (!customer) w.watermark('טיוטה')
  const bytes = w.finish()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return { blob, bytes, meta: { pages: doc.getNumberOfPages(), bytes: bytes.byteLength, hash: quote.snapshot_hash.slice(0, 8) } }
}

export function quotePdfFilename(quote: QuoteVersion, project: SiteSurveyProject): string {
  return `bee-quote-${quote.quote_number}-${safeFilename(project.projectName, project.id.slice(0, 8))}.pdf`
}
