/**
 * Shared PDF toolkit for B.E.E documents (survey report, quote draft):
 * embedded Heebo, RTL-aware text, header/footer, sections, rows, bullets,
 * tables and photo grids. No DOM/canvas, so it runs in Node for tests.
 */
import { jsPDF } from 'jspdf'
import { HEEBO_BOLD_TTF_BASE64, HEEBO_REGULAR_TTF_BASE64 } from './fonts/heebo'
import { mirrorBrackets } from './rtl'
import type { SurveyPhoto } from './types'

export const PAGE_W = 210
export const PAGE_H = 297
export const MARGIN_X = 14
export const HEADER_H = 20
export const FOOTER_H = 14
export const CONTENT_TOP = HEADER_H + 8
export const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 4
export const CONTENT_W = PAGE_W - MARGIN_X * 2
export const RIGHT = PAGE_W - MARGIN_X
export const LABEL_W = 46
export const LINE_H = 6

export const INK = '#1a1a1a'
export const MUTED = '#5c6670'
export const BRAND_DARK = '#0f1c24'
export const BRAND_YELLOW = '#f0c14b'
export const RULE = '#d9dee3'
export const OK_GREEN = '#1f7a4d'
export const WARN_RED = '#b3261e'

const TOTAL_PAGES = '{total_pages_count_string}'
const HEBREW = /[֐-׿]/

export type FontStyle = 'normal' | 'bold'

const RTL_OPTS = {
  isInputVisual: false,
  isOutputVisual: true,
  isInputRtl: true,
  isOutputRtl: false,
} as const

export function createDoc(props: { title: string; subject: string }): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  // The VFS and font table live on the document instance, so this runs per PDF.
  doc.addFileToVFS('Heebo-Regular.ttf', HEEBO_REGULAR_TTF_BASE64)
  doc.addFileToVFS('Heebo-Bold.ttf', HEEBO_BOLD_TTF_BASE64)
  doc.addFont('Heebo-Regular.ttf', 'Heebo', 'normal')
  doc.addFont('Heebo-Bold.ttf', 'Heebo', 'bold')
  doc.setProperties({
    title: props.title,
    subject: props.subject,
    author: 'B.E.E — ברק אלקטריק אנג׳ינירינג',
    creator: 'bee-solar-survey',
  })
  return doc
}

export interface TableColumn {
  /** Column header (Hebrew). */
  label: string
  /** Width in mm. The last column absorbs rounding. */
  width: number
  /** 'right' (default, RTL text) or 'left' (numbers). */
  align?: 'right' | 'left'
  bold?: boolean
}

export class Writer {
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

  /** Left-aligned text (page numbers, hashes, numeric table cells). Hebrew still goes through bidi. */
  textLeft(s: string, xLeft: number, y: number, style: FontStyle = 'normal', size = 9, color = MUTED) {
    this.setFont(style, size, color)
    if (HEBREW.test(s)) this.doc.text(mirrorBrackets(s), xLeft, y, { align: 'left', ...RTL_OPTS })
    else this.doc.text(s, xLeft, y, { align: 'left' })
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

  /** Three big numbers side by side (RTL: first card at the right). */
  statCards(cards: { label: string; value: string }[]) {
    const gap = 4
    const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length
    const h = 20
    this.ensure(h + 4)
    cards.forEach((c, i) => {
      const x = RIGHT - w - i * (w + gap)
      this.doc.setFillColor('#f4f6f8')
      this.doc.roundedRect(x, this.y, w, h, 1.5, 1.5, 'F')
      this.text(c.value, x + w - 3, this.y + 9.5, 'bold', 14)
      this.text(c.label, x + w - 3, this.y + 16, 'normal', 8.5, MUTED)
    })
    this.y += h + 4
  }

  /**
   * Bar chart, laid out right-to-left (first value at the right, like the text).
   * Negative values hang below the zero line in red. Labels are optional per bar
   * (pass '' to skip); `valueLabel` prints a value above selected bars.
   */
  barChart(values: number[], labels: string[], opts: { height?: number; valueLabel?: (v: number, i: number) => string; caption?: string } = {}) {
    const h = opts.height ?? 42
    const labelH = 6
    this.ensure(h + labelH + (opts.caption ? LINE_H : 0) + 2)
    const d = this.doc
    const top = this.y
    const max = Math.max(0, ...values)
    const min = Math.min(0, ...values)
    const span = max - min || 1
    const zeroY = top + (max / span) * h
    const slot = CONTENT_W / values.length
    const barW = Math.max(1.2, slot * 0.62)
    d.setDrawColor(RULE)
    d.setLineWidth(0.3)
    d.line(MARGIN_X, zeroY, RIGHT, zeroY)
    values.forEach((v, i) => {
      const xRight = RIGHT - i * slot - (slot - barW) / 2
      const bh = (Math.abs(v) / span) * h
      d.setFillColor(v < 0 ? WARN_RED : BRAND_YELLOW)
      d.rect(xRight - barW, v < 0 ? zeroY : zeroY - bh, barW, Math.max(0.2, bh), 'F')
      const lbl = labels[i]
      if (lbl) this.text(lbl, xRight - barW / 2 + this.doc.getTextWidth(lbl) / 2, top + h + 4.5, 'normal', 7.5, MUTED)
      const vl = opts.valueLabel?.(v, i)
      if (vl) {
        this.setFont('normal', 7)
        const tw = this.doc.getTextWidth(vl)
        this.textLeft(vl, xRight - barW / 2 - tw / 2, v < 0 ? zeroY + bh + 3 : zeroY - bh - 1.2, 'normal', 7, INK)
      }
    })
    this.y = top + h + labelH
    if (opts.caption) this.paragraph(opts.caption, 'normal', 8.5, MUTED)
    this.y += 2
  }

  /**
   * Simple table with header row and zebra stripes; columns are laid out
   * right-to-left in array order. Cell text wraps within its column.
   */
  table(columns: TableColumn[], rows: string[][], opts: { fontSize?: number; highlightLast?: boolean } = {}) {
    const size = opts.fontSize ?? 9
    const lineH = size * 0.55
    const pad = 1.8
    const xs: { right: number; left: number }[] = []
    let cursor = RIGHT
    columns.forEach((c, i) => {
      const w = i === columns.length - 1 ? cursor - MARGIN_X : c.width
      xs.push({ right: cursor, left: cursor - w })
      cursor -= w
    })

    const drawHeader = () => {
      this.ensure(lineH + pad * 2 + 2)
      this.doc.setFillColor(BRAND_DARK)
      this.doc.rect(MARGIN_X, this.y, CONTENT_W, lineH + pad * 2, 'F')
      columns.forEach((c, i) => {
        const cell = xs[i]!
        const tx = c.align === 'left' ? cell.left + pad : cell.right - pad
        if (c.align === 'left') this.textLeft(c.label, tx, this.y + pad + lineH * 0.8, 'bold', size, '#ffffff')
        else this.text(c.label, tx, this.y + pad + lineH * 0.8, 'bold', size, '#ffffff')
      })
      this.y += lineH + pad * 2
    }

    drawHeader()
    rows.forEach((r, ri) => {
      const wrapped = r.map((cell, i) => this.wrap(cell ?? '', (xs[i]!.right - xs[i]!.left) - pad * 2, 'normal', size))
      const n = Math.max(...wrapped.map((w) => w.length))
      const rowH = n * lineH + pad * 2
      if (this.y + rowH > CONTENT_BOTTOM) {
        this.doc.addPage()
        this.y = CONTENT_TOP
        this.decoratePage()
        drawHeader()
      }
      const last = opts.highlightLast && ri === rows.length - 1
      if (last) {
        this.doc.setFillColor('#fdf3d0')
        this.doc.rect(MARGIN_X, this.y, CONTENT_W, rowH, 'F')
      } else if (ri % 2 === 1) {
        this.doc.setFillColor('#f7f8fa')
        this.doc.rect(MARGIN_X, this.y, CONTENT_W, rowH, 'F')
      }
      columns.forEach((c, i) => {
        const cell = xs[i]!
        const style: FontStyle = c.bold || last ? 'bold' : 'normal'
        wrapped[i]!.forEach((line, li) => {
          const ty = this.y + pad + lineH * 0.8 + li * lineH
          if (c.align === 'left') this.textLeft(line, cell.left + pad, ty, style, size, INK)
          else this.text(line, cell.right - pad, ty, style, size, INK)
        })
      })
      this.doc.setDrawColor(RULE)
      this.doc.setLineWidth(0.15)
      this.doc.line(MARGIN_X, this.y + rowH, RIGHT, this.y + rowH)
      this.y += rowH
    })
    this.y += 3
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

  /** Diagonal watermark on every page (e.g. "טיוטה"). */
  watermark(word: string) {
    const pages = this.doc.getNumberOfPages()
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p)
      this.setFont('bold', 64, '#e9ecef')
      this.doc.text(word, PAGE_W / 2, PAGE_H / 2 + 20, { align: 'center', angle: 35, ...RTL_OPTS })
    }
    this.doc.setPage(pages)
  }

  finish(): ArrayBuffer {
    this.doc.putTotalPages(TOTAL_PAGES)
    return this.doc.output('arraybuffer')
  }
}

export function fitImage(doc: jsPDF, p: SurveyPhoto, maxW: number, maxH: number): { w: number; h: number; ok: boolean; format: 'JPEG' | 'PNG' } {
  const format: 'JPEG' | 'PNG' = /png/i.test(p.mimeType) || /^data:image\/png/i.test(p.dataUrl) ? 'PNG' : 'JPEG'
  try {
    const props = doc.getImageProperties(p.dataUrl)
    const scale = Math.min(maxW / props.width, maxH / props.height)
    return { w: props.width * scale, h: props.height * scale, ok: true, format }
  } catch {
    return { w: maxW, h: 30, ok: false, format }
  }
}

/**
 * ASCII-only, filesystem-safe file name part. Hebrew is dropped (share sheets and
 * some browsers mangle non-ASCII download names); callers add an id/date so the
 * result is never empty.
 */
export function safeFilename(base: string, fallback = 'survey'): string {
  const ascii = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return ascii || fallback
}
