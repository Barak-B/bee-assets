import Decimal from 'decimal.js';
import type { PriceListEntry } from './schemas.ts';

// Diff of a new price list against the previously approved one (specs/12 §1.5.4, WP-M1-02).

export interface PriceListChange {
  supplier_sku: string;
  fields: Partial<Record<'list_price' | 'net_price' | 'unit_raw' | 'discount_pct', [unknown, unknown]>>;
  /** Net-price change in percent (null when either side has no net price). */
  change_pct: number | null;
  /** True when |change_pct| exceeds `price_jump_alert_pct`. */
  alert: boolean;
}

export interface PriceListDiff {
  added: PriceListEntry[];
  removed: PriceListEntry[];
  changed: PriceListChange[];
  unchanged: number;
  stats: { rows: number; mapped: number; unmapped: number; added: number; removed: number; changed: number; max_change_pct: number | null };
}

const effectiveNet = (e: PriceListEntry) =>
  e.net_price ?? (e.list_price === null ? null : new Decimal(e.list_price).times(new Decimal(100).minus(e.discount_pct ?? 0)).div(100).toNumber());

export function diffPriceLists(prev: PriceListEntry[], next: PriceListEntry[], jumpAlertPct: number | null = null): PriceListDiff {
  const before = new Map(prev.map((e) => [e.supplier_sku, e]));
  const after = new Map(next.map((e) => [e.supplier_sku, e]));
  const added = next.filter((e) => !before.has(e.supplier_sku));
  const removed = prev.filter((e) => !after.has(e.supplier_sku));
  const changed: PriceListChange[] = [];
  let unchanged = 0;
  for (const e of next) {
    const old = before.get(e.supplier_sku);
    if (!old) continue;
    const fields: PriceListChange['fields'] = {};
    for (const f of ['list_price', 'net_price', 'unit_raw', 'discount_pct'] as const) {
      if ((old[f] ?? null) !== (e[f] ?? null)) fields[f] = [old[f] ?? null, e[f] ?? null];
    }
    if (Object.keys(fields).length === 0) { unchanged++; continue; }
    const a = effectiveNet(old);
    const b = effectiveNet(e);
    const change_pct = a === null || b === null || a === 0 ? null : new Decimal(b).minus(a).div(a).times(100).toDecimalPlaces(2).toNumber();
    // An unconfigured threshold (null) flags every price change for review.
    const alert = change_pct === null || jumpAlertPct === null ? true : Math.abs(change_pct) > jumpAlertPct;
    changed.push({ supplier_sku: e.supplier_sku, fields, change_pct, alert });
  }
  const pcts = changed.map((c) => c.change_pct).filter((x): x is number => x !== null);
  return {
    added, removed, changed, unchanged,
    stats: {
      rows: next.length,
      mapped: next.filter((e) => !!e.product_id).length,
      unmapped: next.filter((e) => !e.product_id).length,
      added: added.length, removed: removed.length, changed: changed.length,
      max_change_pct: pcts.length ? pcts.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m)) : null,
    },
  };
}
