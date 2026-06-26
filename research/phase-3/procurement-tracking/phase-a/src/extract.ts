// Procurement Phase A — deterministic extractor.
//
// Phase A scope: parse the **canonical Manual CSV format**. Real Tier-1
// DeepSeek extraction (unstructured email/WA body → ExtractedPO/Invoice)
// lands in Phase B; this stub returns null for unstructured inputs so the
// orchestrator can keep them as `other` and stash raw text for audit.
//
// Canonical Manual CSV (Phase A only — Barak's normalized dropoffs):
//   po_number,supplier,description,sku,qty,unit,unit_price,ordered_at,expected_at,currency
//
// Every row → one PurchaseOrderLine. Rows sharing po_number collapse into
// one ExtractedPO with summed totalCents. Currency defaults to ILS.

import type {
  ExtractedPO,
  ExtractedPOLine,
  ExtractionResult,
  RawProcurementEvent,
} from "./types.js";
import { parseAmountCents, parseIsraeliDate } from "./normalize.js";
import { parseCsv } from "./sources/manual.js";

const REQUIRED_COLS = ["po_number", "supplier", "description", "qty", "unit", "unit_price", "ordered_at"];

export interface ExtractResult {
  /**
   * One event may contain multiple PO documents (CSV grouped by po_number).
   * Phase A returns at most one for the orchestrator path, but the parser
   * itself returns the full set so callers/tests can inspect.
   */
  pos: ExtractedPO[];
  /** Rows we couldn't parse — exposed for visibility, never crashes the run. */
  errors: { row: number; reason: string }[];
}

/** Single entry point used by `ingest.ts`. */
export async function extractEvent(raw: RawProcurementEvent): Promise<ExtractionResult> {
  // PDF / no-text — defer to Phase B (Tier-1 LLM with vision). Return 'other'.
  if (!raw.text || raw.text.trim().length === 0) {
    return { kind: "other", note: "non-textual or empty event; Phase A extractor stub" };
  }

  // Try canonical CSV parse first (the manual lane)
  const csvResult = tryParseManualCsv(raw.text);
  if (csvResult.pos.length === 0) {
    return { kind: "other", note: `no PO rows extracted (errors: ${csvResult.errors.length})` };
  }

  // Phase A: take the first/only PO (most manual dropoffs are single-PO CSVs).
  // Multi-PO files are handled in Phase B (loop over .pos and emit N events).
  return { kind: "po", po: csvResult.pos[0] };
}

/** Exposed for tests + multi-PO handling in later phases. */
export function tryParseManualCsv(text: string): ExtractResult {
  const errors: ExtractResult["errors"] = [];
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { pos: [], errors: [{ row: 0, reason: String(e) }] };
  }

  if (rows.length === 0) return { pos: [], errors: [] };

  const header = Object.keys(rows[0]);
  const missing = REQUIRED_COLS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { pos: [], errors: [{ row: 0, reason: `missing columns: ${missing.join(", ")}` }] };
  }

  // Group by po_number (empty po_number rows get a synthetic key)
  type Group = { poNumber: string; rows: { idx: number; row: Record<string, string> }[] };
  const groups = new Map<string, Group>();

  rows.forEach((r, idx) => {
    const key = (r.po_number || "").trim() || `__synthetic_${idx}`;
    let g = groups.get(key);
    if (!g) {
      g = { poNumber: (r.po_number || "").trim(), rows: [] };
      groups.set(key, g);
    }
    g.rows.push({ idx, row: r });
  });

  const pos: ExtractedPO[] = [];

  for (const g of groups.values()) {
    const lines: ExtractedPOLine[] = [];
    let orderedAt: Date | null = null;
    let expectedAt: Date | undefined;
    let currency = "ILS";
    let totalCents = 0n;

    for (const { idx, row } of g.rows) {
      try {
        const qty = parseFloat(row.qty);
        if (!isFinite(qty) || qty <= 0) throw new Error(`bad qty: ${row.qty}`);
        const unitPriceCents = parseAmountCents(row.unit_price);
        if (unitPriceCents < 0n) throw new Error(`negative unit_price`);
        const lineTotalCents = BigInt(Math.round(Number(unitPriceCents) * qty));

        lines.push({
          sku: row.sku?.trim() || undefined,
          description: row.description.trim(),
          qty,
          unit: row.unit.trim() || "pcs",
          unitPriceCents,
        });
        totalCents += lineTotalCents;

        if (orderedAt === null) orderedAt = parseIsraeliDate(row.ordered_at);
        if (expectedAt === undefined && row.expected_at?.trim()) {
          expectedAt = parseIsraeliDate(row.expected_at);
        }
        if (row.currency?.trim()) currency = row.currency.trim().toUpperCase();
      } catch (e) {
        errors.push({ row: idx + 2, reason: String(e) }); // +2 = header row + 1-based
      }
    }

    if (lines.length === 0 || orderedAt === null) continue;

    pos.push({
      poNumber: g.poNumber || undefined,
      orderedAt,
      expectedAt,
      currency,
      totalCents,
      lines,
    });
  }

  return { pos, errors };
}
