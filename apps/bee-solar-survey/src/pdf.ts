/**
 * Survey report PDF — real Hebrew text (embedded Heebo), word wrap, photos with
 * preserved aspect ratio, page numbers and a content hash in the footer.
 *
 * Kept free of DOM/canvas so it runs in Node for tests. Load it lazily from the
 * UI (`await import('./pdf')`) — the embedded font is ~220 KB of base64.
 */
import { jsPDF } from 'jspdf'
import { HEEBO_BOLD_TTF_BASE64, HEEBO_REGULAR_TTF_BASE64 } from './fonts/heebo'
import { formatNumber, mirrorBrackets } from './rtl'
import { mapRoofType, parseGps } from './schema'
import {
  PHOTO_FIELD_LABELS,
  type CompletenessReport,
  type PhotoFieldKey,
  type SiteSurveyProject,
  type SurveyPhoto,
} from './types'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN_X = 14
const HEADER_H = 20
const FOOTER_H = 14
const CONTENT_TOP = HEADER_H + 8
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 4
const CONTENT_W = PAGE_W - MARGIN_X * 2
const RIGHT = PAGE_W - MARGIN_X
const LABEL_W = 46
const LINE_H = 6

const INK = '#1a1a1a'
const MUTED = '#5c6670'
const BRAND_DARK = '#0f1c24'
const BRAND_YELLOW = '#f0c14b'
const RULE = '#d9dee3'
const OK_GREEN = '#1f7a4d'
const WARN_RED = '#b3261e'

const TOTAL_PAGES = '{total_pages_count_string}'
const HEBREW = /[\u0590-\u05FF]/

type FontStyle = 'normal' | 'bold'

const RTL_OPTS = {
  isInputVisual: false,
  isOutputVisual: true,
  isInputRtl: true,
  isOutputRtl: false,
} as const

export interface SurveyPdfMeta {
  /** Short content hash printed in the footer (first 8 hex chars). */
  hash: string
  pages: number
  bytes: number
}

export interface SurveyPdfResult {
  blob: Blob
  bytes: ArrayBuffer
  meta: SurveyPdfMeta
}

function registerFonts(doc: jsPDF): void {
  // The VFS and font table live on the document instance, so this runs per PDF.
  doc.addFileToVFS('Heebo-Regular.ttf', HEEBO_REGULAR_TTF_BASE64)
  doc.addFileToVFS('Heebo-Bold.ttf', HEEBO_BOLD_TTF_BASE64)
  doc.addFont('Heebo-Regular.ttf', 'Heebo', 'normal')
  doc.addFont('Heebo-Bold.ttf', 'Heebo', 'bold')
}

class Writer {
  readonly doc: jsPDF
  y = CONTENT_TOP
  private readonly headerTitle: string
  private readonly headerSub: string
  private readonly footerRight: string
  private readonly footerLeft: string

  constructor(doc: jsPDF, header: { title: string; sub: string }, footer: { right: string; left: string }) {
    this.doc = doc
    this.headerTitle = header.title
    this.headerSub = header.sub
    this.footerRight = footer.right
    this.footerLeft = footer.left
    this.decoratePage()
  }

  private setFont(style: FontStyle, size: number, color = INK) {
    this.doc.setFont('Heebo', style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(color)
  }

  /**
   * Right-aligned text at (xRight, y). Strings containing Hebrew go through the
   * bidi engine; pure Latin/number strings (GPS, timestamps, ids) are laid out
   * LTR as-is so "32.08, 34.78" does not come out as "34.78 ,32.08".
   */
  text(s: string, xRight: number, y: number, style: FontStyle = 'normal', size = 10.5, color = INK) {
    this.setFont(style, size, color)
    if (HEBREW.test(s)) this.doc.text(mirrorBrackets(s), xRight, y, { align: 'right', ...RTL_OPTS })
    else this.doc.text(s, xRight, y, { align: 'right' })
  }

  /** Left-aligned text (for Latin-only strings like page numbers / hashes). */
  textLeft(s: string, xLeft: number, y: number, style: FontStyle = 'normal', size = 9, color = MUTED) {
    this.setFont(style, size, color)
    this.doc.text(s, xLeft, y, { align: 'left' })
  }

  wrap(s: string, width: number, style: FontStyle = 'normal', size = 10.5): string[] {
    this.setFont(style, size)
    const lines = this.doc.splitTextToSize(s, width) as string[]
    return lines.length ? lines : ['']
  }

  private decoratePage() {
    const d = this.doc
    d.setFillColor(BRAND_DARK)
    d.rect(0, 0, PAGE_W, HEADER_H, 'F')
    this.text(this.headerTitle, RIGHT, 9, 'bold', 13, BRAND_YELLOW)
    this.text(this.headerSub, RIGHT, 15.5, 'normal', 9, '#dfe6ec')
    this.textLeft('B.E.E', MARGIN_X, 13, 'bold', 16, BRAND_YELLOW)

    d.setDrawColor(RULE)
    d.setLineWidth(0.3)
    d.line(MARGIN_X, PAGE_H - FOOTER_H, RIGHT, PAGE_H - FOOTER_H)
    this.text(this.footerRight, RIGHT, PAGE_H - FOOTER_H + 5.5, 'normal', 8.5, MUTED)
    this.textLeft(this.footerLeft, MARGIN_X, PAGE_H - FOOTER_H + 5.5, 'normal', 8.5, MUTED)
    // Page counter stays Latin-only so the total-pages placeholder survives the bidi pass.
    this.textLeft(`${d.getNumberOfPages()} / ${TOTAL_PAGES}`, MARGIN_X, PAGE_H - FOOTER_H + 10.5, 'normal', 8.5, MUTED)
    this.text('עמוד', MARGIN_X + 14, PAGE_H - FOOTER_H + 10.5, 'normal', 8.5, MUTED)
  }

  ensure(height: number) {
    if (this.y + height > CONTENT_BOTTOM) {
      this.doc.addPage()
      this.y = CONTENT_TOP
      this.decoratePage()
    }
  }

  section(title: string) {
    this.ensure(14)
    const d = this.doc
    d.setFillColor(BRAND_DARK)
    d.roundedRect(MARGIN_X, this.y, CONTENT_W, 8, 1.2, 1.2, 'F')
    this.text(title, RIGHT - 3, this.y + 5.6, 'bold', 11, BRAND_YELLOW)
    this.y += 11.5
  }

  /** Label (bold, right column) + wrapped value (left of it). */
  row(label: string, value: string | null | undefined) {
    const shown = value && value.trim() ? value.trim() : '—'
    const valueW = CONTENT_W - LABEL_W - 3
    const lines = this.wrap(shown, valueW)
    const h = lines.length * LINE_H
    this.ensure(h + 1)
    this.text(label, RIGHT, this.y + 4.3, 'bold', 10)
    lines.forEach((line, i) => this.text(line, RIGHT - LABEL_W - 3, this.y + 4.3 + i * LINE_H, 'normal', 10.5))
    this.doc.setDrawColor(RULE)
    this.doc.setLineWidth(0.2)
    this.doc.line(MARGIN_X, this.y + h + 0.8, RIGHT, this.y + h + 0.8)
    this.y += h + 2
  }

  paragraph(s: string, style: FontStyle = 'normal', size = 10.5, color = INK) {
    const lines = this.wrap(s, CONTENT_W, style, size)
    for (const line of lines) {
      this.ensure(LINE_H)
      this.text(line, RIGHT, this.y + 4.3, style, size, color)
      this.y += LINE_H
    }
  }

  bullets(items: string[], color = INK) {
    for (const item of items) {
      const lines = this.wrap(item, CONTENT_W - 6)
      lines.forEach((line, i) => {
        this.ensure(LINE_H)
        if (i === 0) this.text('•', RIGHT, this.y + 4.3, 'bold', 10.5, color)
        this.text(line, RIGHT - 5, this.y + 4.3, 'normal', 10.5, color)
        this.y += LINE_H
      })
    }
  }

  space(h = 3) {
    this.y += h
  }

  /** Two photos per row, aspect ratio preserved, caption underneath. */
  photoGrid(list: SurveyPhoto[], caption: (p: SurveyPhoto, i: number) => string) {
    const gap = 4
    const cellW = (CONTENT_W - gap) / 2
    const maxH = 62
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2)
      const dims = pair.map((p) => fitImage(this.doc, p, cellW, maxH))
      const rowH = Math.max(...dims.map((d) => d.h)) + 7
      this.ensure(rowH + 2)
      pair.forEach((p, k) => {
        const d = dims[k]!
        // RTL grid: first photo at the right column.
        const cellX = k === 0 ? RIGHT - cellW : MARGIN_X
        const x = cellX + (cellW - d.w) / 2
        if (d.ok) {
          try {
            this.doc.addImage(p.dataUrl, d.format, x, this.y, d.w, d.h)
          } catch {
            this.placeholder(cellX, cellW, d.h)
          }
        } else {
          this.placeholder(cellX, cellW, d.h)
        }
        this.text(caption(p, i + k), cellX + cellW, this.y + d.h + 4.5, 'normal', 8.5, MUTED)
      })
      this.y += rowH + 2
    }
  }

  private placeholder(x: number, w: number, h: number) {
    this.doc.setFillColor('#eef1f4')
    this.doc.rect(x, this.y, w, h, 'F')
    this.text('תמונה לא זמינה', x + w - 3, this.y + h / 2, 'normal', 9, MUTED)
  }

  finish(): void {
    this.doc.putTotalPages(TOTAL_PAGES)
  }
}

function fitImage(doc: jsPDF, p: SurveyPhoto, maxW: number, maxH: number): { w: number; h: number; ok: boolean; format: 'JPEG' | 'PNG' } {
  const format: 'JPEG' | 'PNG' = /png/i.test(p.mimeType) || /^data:image\/png/i.test(p.dataUrl) ? 'PNG' : 'JPEG'
  try {
    const props = doc.getImageProperties(p.dataUrl)
    const scale = Math.min(maxW / props.width, maxH / props.height)
    return { w: props.width * scale, h: props.height * scale, ok: true, format }
  } catch {
    return { w: maxW, h: 30, ok: false, format }
  }
}

export async function shortContentHash(project: SiteSurveyProject, photos: SurveyPhoto[]): Promise<string> {
  const material = JSON.stringify({
    project,
    photos: photos.map((p) => ({ id: p.id, field: p.field, sha256: p.sha256 ?? null, annotated: !!p.annotated })),
  })
  const bytes = new TextEncoder().encode(material)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const PHOTO_ORDER: PhotoFieldKey[] = [
  'siteOverview',
  'roof',
  'electricalPanel',
  'busbars',
  'cableRoute',
  'inverterLocation',
  'craneAccess',
]

function yesNo(v: boolean): string {
  return v ? 'כן' : 'לא'
}

function withUnit(value: string, unit: string, fraction = 1): string {
  const t = value.trim()
  if (!t) return ''
  const n = formatNumber(t, fraction)
  return `${n} ${unit}`
}

export async function buildSurveyPdfDetailed(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  completeness: CompletenessReport,
): Promise<SurveyPdfResult> {
  const hash = await shortContentHash(project, photos)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  registerFonts(doc)
  doc.setProperties({
    title: `B.E.E סקר אתר — ${project.projectName || project.id}`,
    subject: 'סקר אתר סולארי · Hive Collect',
    author: 'B.E.E — ברק אלקטריק אנג׳ינירינג',
    creator: 'bee-solar-survey',
  })

  const w = new Writer(
    doc,
    {
      title: 'סקר אתר סולארי · טיוטה לאישור',
      sub: `${project.projectName || 'ללא שם'} · ${project.surveyDate || ''}${project.surveyor ? ` · סוקר: ${project.surveyor}` : ''}`,
    },
    {
      right: 'טיוטה בלבד · Law #2 · אין שליחה ללקוח ללא אישור ברק',
      left: `survey ${project.id.slice(0, 8)} · ${hash}`,
    },
  )

  // ── Readiness ───────────────────────────────────────────────
  w.section('מוכנות לכוורת · Wave 54')
  const ready = completeness.readyForWave54
  w.paragraph(
    ready ? `מוכן · ציון ${completeness.score}/100` : `חסר · ציון ${completeness.score}/100`,
    'bold',
    11,
    ready ? OK_GREEN : WARN_RED,
  )
  if (completeness.missingRequired.length) {
    w.paragraph('חובה להשלים:', 'bold', 10)
    w.bullets(completeness.missingRequired, WARN_RED)
  }
  if (completeness.missingRecommended.length) {
    w.paragraph('מומלץ להשלים:', 'bold', 10)
    w.bullets(completeness.missingRecommended, MUTED)
  }
  if (completeness.warnings.length) w.bullets(completeness.warnings, MUTED)
  w.space()

  // ── General ────────────────────────────────────────────────
  w.section('פרטים כלליים')
  const gps = parseGps(project.gps)
  const lat = project.lat ?? gps.lat
  const lon = project.lon ?? gps.lon
  w.row('שם הפרויקט', project.projectName)
  w.row('תאריך סקר', project.surveyDate)
  w.row('סוקר', project.surveyor)
  w.row('כתובת', project.address)
  w.row('GPS', lat != null && lon != null ? `${lat}, ${lon}` : project.gps)
  w.row('מזהה סקר', project.id)
  w.row('עודכן', project.updatedAt ? project.updatedAt.replace('T', ' ').slice(0, 16) : '')
  w.space()

  // ── Electrical ────────────────────────────────────────────
  w.section('חשמל ומונים')
  w.row('מפסק ראשי במתקן', project.mainBreaker)
  w.row('מקום בלוח למפסק סולארי', project.panelSpace)
  w.row('מפסק ראשי סולארי', project.solarBreaker)
  w.row('סוג מונה סולארי', project.meterType)
  w.row('מספר מונה', project.meterNumber)
  w.row('מיקום מונה', project.meterLocation)
  w.row('אורך כבל AC משוער', withUnit(project.cableLengthM, 'מ׳'))
  w.row('מיקום קיר ממירים', project.inverterLocation)
  w.row('תוואי כבילה — הערות', project.cableNotes)
  w.space()

  // ── Roof / design target ──────────────────────────────────
  w.section('גג · גיאומטריה · יעד תכנון (Wave 54)')
  const roofCanon = project.roofTypeHe ? mapRoofType(project.roofTypeHe) : ''
  w.row('סוג גג', project.roofTypeHe ? `${project.roofTypeHe} (${roofCanon})` : '')
  w.row('שטח שימושי', withUnit(project.usableAreaM2, 'מ״ר'))
  w.row('אזימוט', project.azimuthDeg ? `${project.azimuthDeg}° (180 = דרום)` : '')
  w.row('שיפוע', project.tiltDeg ? `${project.tiltDeg}°` : '')
  w.row('צריכה שנתית', withUnit(project.annualConsumptionKwh, 'kWh'))
  w.row('יעד הספק', withUnit(project.targetKwp, 'kWp', 2))
  w.row('תקציב', withUnit(project.budgetIls, '₪'))
  w.row('העדפת ממיר', project.inverterBrandPref)
  w.row('לכלול סוללה בתכנון', yesNo(project.includeBattery))
  w.space()

  // ── Notes ─────────────────────────────────────────────────
  const custom = project.customFields.filter((f) => f.label.trim() || f.value.trim())
  if (project.generalNotes.trim() || custom.length) {
    w.section('הערות ושדות נוספים')
    if (project.generalNotes.trim()) w.paragraph(project.generalNotes.trim())
    if (custom.length) {
      w.space(2)
      for (const f of custom) w.row(f.label.trim() || 'שדה', f.value)
    }
    w.space()
  }

  // ── Photos ────────────────────────────────────────────────
  const byField = new Map<PhotoFieldKey, SurveyPhoto[]>()
  for (const p of photos) byField.set(p.field, [...(byField.get(p.field) ?? []), p])
  const fields = PHOTO_ORDER.filter((f) => byField.has(f))
  if (fields.length) {
    w.section(`צילומים (${photos.length})`)
    for (const field of fields) {
      const list = byField.get(field)!
      w.paragraph(`${PHOTO_FIELD_LABELS[field]} · ${list.length}`, 'bold', 10.5)
      w.photoGrid(list, (p, i) => `${PHOTO_FIELD_LABELS[field]} ${i + 1}${p.annotated ? ' · מסומן' : ''}`)
      w.space(2)
    }
  } else {
    w.section('צילומים')
    w.paragraph('לא צורפו תמונות.', 'normal', 10.5, MUTED)
  }

  w.finish()
  const bytes = doc.output('arraybuffer')
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return { blob, bytes, meta: { hash, pages: doc.getNumberOfPages(), bytes: bytes.byteLength } }
}

export async function buildSurveyPdf(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  completeness: CompletenessReport,
): Promise<Blob> {
  return (await buildSurveyPdfDetailed(project, photos, completeness)).blob
}

export function surveyPdfFilename(project: SiteSurveyProject): string {
  const base = (project.projectName || project.id.slice(0, 8)).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')
  return `bee-survey-${base}-${project.surveyDate || ''}.pdf`
}
