export function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("'", '&#39;')
}

/** Number → input value ("" for null). */
export function numValue(n: number | null | undefined, scale = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return String(Math.round(n * scale * 10000) / 10000)
}

/** Input value → number (null for empty / invalid). Accepts "1,234.5" and "12,5". */
export function readNum(el: HTMLInputElement | null, scale = 1): number | null {
  const raw = (el?.value ?? '').trim()
  if (!raw) return null
  const cleaned = /,\d{1,2}$/.test(raw) && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n / scale : null
}
