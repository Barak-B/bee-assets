/** Money helpers: ROUND_HALF_UP to 2 dp, as spec 12 §2 (`rounding.line = ROUND_HALF_UP_2DP`). */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function roundToStep(n: number, step: number | null): number {
  if (!step || step <= 0) return round2(n)
  return Math.round(n / step) * step
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${Math.round(n * 1000) / 10}%`
}

/** Canonical JSON: keys sorted recursively, so hashes do not depend on property order. */
/**
 * Payment-schedule amounts that add up to the total exactly: each milestone is
 * rounded to whole shekels and the last one takes the remainder (incl. agorot).
 */
export function scheduleAmounts(total: number | null, pcts: (number | null)[]): (number | null)[] {
  const amounts = pcts.map((p) => (p === null || total === null ? null : Math.round((total * p) / 100)))
  const sum = pcts.reduce<number>((s, p) => s + (p ?? 0), 0)
  if (total === null || pcts.some((p) => p === null) || Math.abs(sum - 100) > 0.01 || !amounts.length) return amounts
  const last = amounts.length - 1
  const others = amounts.slice(0, last).reduce<number>((s, a) => s + (a ?? 0), 0)
  amounts[last] = round2(total - others)
  return amounts
}

/** Ceil that ignores binary-float noise: 55.00000000000001 → 55, not 56. */
export function ceilSafe(x: number): number {
  return Math.ceil(x - 1e-9)
}

/** Calendar date (YYYY-MM-DD) in Israel — quote dates and validity are local, not UTC. */
export function israelDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
