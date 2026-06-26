// CsvSource — Phase A MVP adapter (LLD.md §3.1, source-mode A)
// Reads CSV files from a directory; one file per export. Supports:
//   - Mercantile default format (Hebrew columns, utf-8 or windows-1255)
//   - Generic format via columnMap config
//
// Files older than cursorTs are skipped at the directory level (fast filter).
// Rows are filtered strictly inside ingest via cursorAdvances() (PROTOCOL §3.1).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { BankAccountRef, Cursor, RawTx, SourceMode, TransactionSource } from "../types.js";
import { parseAmountCents, parseIsraeliDate } from "../normalize.js";

export interface CsvSourceConfig {
  /** Directory to watch. Each file is a discrete export from the bank portal. */
  watchDir: string;
  /** File encoding (default utf-8). Mercantile portal exports may ship windows-1255. */
  encoding?: "utf-8" | "windows-1255";
  /** Column-name aliases. Required: date, amount, ref. Optional: memo, bookingDate. */
  columnMap: {
    date: string;        // value date
    amount: string;
    ref: string;         // external_tx_id source
    memo?: string;       // counterparty + description
    bookingDate?: string;
  };
}

export class CsvSource implements TransactionSource {
  readonly mode: SourceMode = "csv";
  private cfg: CsvSourceConfig;
  constructor(cfg: CsvSourceConfig) { this.cfg = cfg; }

  /**
   * One AsyncIterable<RawTx[]> per file. Caller iterates files via cursorAdvances()
   * to skip rows ≤ cursor.
   */
  async *next(_account: BankAccountRef, _cursor: Cursor): AsyncIterable<RawTx[]> {
    // NOTE: we intentionally do NOT skip files by mtime. File mtime and transaction
    // value-date are unrelated (a re-saved old export can contain rows newer than the
    // cursor), so an mtime gate could silently drop legitimate rows. Hard-key dedup
    // (ingest.ts §3.4) makes re-reading every file cheap and correct. For very large
    // histories, add a per-file high-water-mark index later — not needed at MVP volume.
    const files = await this.listFiles();
    for (const file of files) {
      const buf = await readFile(file);
      const text = this.cfg.encoding === "windows-1255"
        ? new TextDecoder("windows-1255").decode(buf)
        : buf.toString("utf-8");
      const rows = parseCsv(text);
      const batch = this.mapRows(rows);
      if (batch.length > 0) yield batch;
    }
  }

  private async listFiles(): Promise<string[]> {
    let entries: string[];
    try { entries = await readdir(this.cfg.watchDir); }
    catch { return []; }
    return entries
      .filter((n) => n.toLowerCase().endsWith(".csv"))
      .map((n) => join(this.cfg.watchDir, n));
  }

  private mapRows(rows: Record<string, string>[]): RawTx[] {
    const { date, amount, ref, memo, bookingDate } = this.cfg.columnMap;
    const out: RawTx[] = [];
    for (const r of rows) {
      const dStr = r[date]; const aStr = r[amount]; const refStr = r[ref];
      if (!dStr || !aStr || !refStr) continue;          // skip incomplete

      try {
        out.push({
          externalTxId: refStr.trim(),
          valueDate: parseIsraeliDate(dStr),
          bookingDate: bookingDate && r[bookingDate] ? parseIsraeliDate(r[bookingDate]) : undefined,
          amountCents: parseAmountCents(aStr),
          currency: "ILS",
          counterpartyRaw: (memo && r[memo]) ? r[memo].trim() : "",
          memo: memo && r[memo] ? r[memo].trim() : undefined,
        });
      } catch {
        // PROTOCOL: skip malformed rows, don't crash the run. Counter exposed via rowsRead - inserted - dedupes
      }
    }
    return out;
  }
}

/** Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded commas/quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = cells[j] ?? "";
    rows.push(obj);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  // Split on \n but only outside of quoted fields
  const out: string[] = [];
  let buf = ""; let inQuote = false;
  for (const ch of text) {
    if (ch === '"') { inQuote = !inQuote; buf += ch; continue; }
    if (ch === "\n" && !inQuote) {
      out.push(buf.replace(/\r$/, "")); buf = "";
    } else { buf += ch; }
  }
  if (buf) out.push(buf);
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { buf += '"'; i++; }   // escaped quote
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      out.push(buf); buf = "";
    } else { buf += ch; }
  }
  out.push(buf);
  return out;
}
