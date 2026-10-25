import { round2 } from './money'
import type { QuoteDiff, QuoteLine, QuoteLineChange, QuoteVersion } from './types'

function key(l: QuoteLine): string {
  return l.sku
}

function sameLine(a: QuoteLine, b: QuoteLine): boolean {
  return a.qty === b.qty && a.unit_price_ils === b.unit_price_ils && a.line_total_ils === b.line_total_ils
}

function sub(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : round2(a - b)
}

/** Line-level diff between two versions of the same quote, keyed by SKU. */
export function diffQuotes(prev: QuoteVersion, next: QuoteVersion): QuoteDiff {
  const before = new Map(prev.lines.map((l) => [key(l), l]))
  const after = new Map(next.lines.map((l) => [key(l), l]))

  const added = next.lines.filter((l) => !before.has(key(l)))
  const removed = prev.lines.filter((l) => !after.has(key(l)))
  const changed: QuoteLineChange[] = []
  for (const l of next.lines) {
    const b = before.get(key(l))
    if (!b || sameLine(b, l)) continue
    changed.push({
      sku: l.sku,
      name_he: l.name_he,
      before: { qty: b.qty, unit_price_ils: b.unit_price_ils, line_total_ils: b.line_total_ils },
      after: { qty: l.qty, unit_price_ils: l.unit_price_ils, line_total_ils: l.line_total_ils },
      delta_ils: sub(l.line_total_ils, b.line_total_ils),
    })
  }

  return {
    from_version: prev.version_no,
    to_version: next.version_no,
    added,
    removed,
    changed,
    total_delta_excl_vat_ils: sub(next.totals.subtotal_excl_vat_ils, prev.totals.subtotal_excl_vat_ils),
    total_delta_incl_vat_ils: sub(next.totals.total_incl_vat_ils, prev.totals.total_incl_vat_ils),
  }
}

export function diffIsEmpty(d: QuoteDiff | null): boolean {
  return !d || (d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0)
}
