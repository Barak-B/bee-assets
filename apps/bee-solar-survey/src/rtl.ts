/**
 * Small RTL helpers for PDF text.
 *
 * jsPDF's bidi engine reorders Hebrew/Latin runs correctly when `text()` is
 * called with `isInputRtl: true, isOutputVisual: true`, but it does not mirror
 * bracket glyphs that end up in a right-to-left run — "(Wave 54)" after Hebrew
 * comes out as ")Wave 54(". `mirrorBrackets` swaps those glyphs ahead of time,
 * following the Unicode N1 rule: a neutral between two strong characters of the
 * same type takes that type; otherwise it takes the paragraph direction (RTL).
 * Digits count as R for this purpose, as in UAX #9 (the engine does not apply
 * W7, so neither do we — the glyph must match the level the engine assigns).
 *
 * Known limit, verified against the engine: a Latin word directly followed by a
 * bracketed Latin tail, e.g. "450W (450W)", cannot be placed correctly whatever
 * glyphs we pick — keep such tails next to Hebrew or digits instead.
 */

const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
}

type Strong = 'L' | 'R'

function strongOf(ch: string): Strong | null {
  if (/[֐-׿؀-ۿ]/.test(ch)) return 'R'
  if (/[A-Za-zÀ-ɏ]/.test(ch)) return 'L'
  if (/[0-9]/.test(ch)) return 'R' // UAX #9 N1: numbers act as R for neutrals
  return null
}

function strongBefore(s: string, i: number): Strong {
  for (let k = i - 1; k >= 0; k--) {
    const t = strongOf(s[k]!)
    if (t) return t
  }
  return 'R' // paragraph direction
}

function strongAfter(s: string, i: number): Strong {
  for (let k = i + 1; k < s.length; k++) {
    const t = strongOf(s[k]!)
    if (t) return t
  }
  return 'R'
}

/** Swap bracket glyphs that will be laid out in an RTL run (see module doc). */
export function mirrorBrackets(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    const m = MIRROR[ch]
    if (!m) {
      out += ch
      continue
    }
    const ltr = strongBefore(s, i) === 'L' && strongAfter(s, i) === 'L'
    out += ltr ? ch : m
  }
  return out
}

/** Thousands separators for display (e.g. 120000 → "120,000"). Non-numeric input is returned as-is. */
export function formatNumber(value: string | number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
}
