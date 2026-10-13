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
