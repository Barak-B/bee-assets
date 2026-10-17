import { parseNumber } from '@bee/quote-core'

export function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("'", '&#39;')
}

/**
 * An image data URL safe to put in src="…": only base64 PNG / JPEG / WebP.
 * Anything else (a crafted backup file, a tampered server record) renders as no image.
 */
export function safeImageSrc(dataUrl: unknown): string {
  const s = String(dataUrl ?? '')
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : ''
}

/** Number → input value ("" for null). */
export function numValue(n: number | null | undefined, scale = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return String(Math.round(n * scale * 10000) / 10000)
}

/** Input value → number (null for empty / invalid). Same parser as supplier price lists: "1,234.5", "1.234,5", "12,5". */
export function readNum(el: HTMLInputElement | null, scale = 1): number | null {
  const n = parseNumber((el?.value ?? '').trim())
  return n === null ? null : n / scale
}
