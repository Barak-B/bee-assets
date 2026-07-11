// ManualUploadSource — Phase A MVP adapter (LLD.md §3.1, source-mode "manual")
//
// Watches a directory for CSV/PDF dropoffs. Each file becomes one
// RawProcurementEvent keyed by file sha256 (hard-dedup-safe).
//
// File conventions (Phase A — keep dead simple):
//   - *.csv   : assumed PO line-items (header row: po_number,supplier,description,qty,unit,unit_price,date,expected,currency?)
//   - *.pdf   : opaque blob; text extraction deferred to Phase B (pdf-parse pulled in then).
//               For now we emit the event with attachments[] populated; the Tier-1 extractor
//               sees text="" and falls back to filename-derived hint.
//
// The CSV layout is intentionally NOT a supplier-specific format; it's the
// "Barak drops a normalized export" lane. Each supplier's actual portal export
// gets its own adapter once observed (Phase B+).

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import type {
  Cursor,
  ProcurementEventSource,
  ProcurementSource,
  RawProcurementEvent,
} from "../types.js";
import { cursorAdvances } from "../types.js";

export interface ManualUploadConfig {
  /** Directory to watch. Each file = one event keyed by sha256. */
  watchDir: string;
  /** Process at most N files per call (cap to avoid runaway). */
  maxFiles?: number;
  /** Override sha256 with a deterministic id for tests */
  refIdFor?: (file: string, bytes: Buffer) => string;
}

export class ManualUploadSource implements ProcurementEventSource {
  readonly mode: ProcurementSource = "manual";
  private cfg: ManualUploadConfig;
  constructor(cfg: ManualUploadConfig) {
    this.cfg = cfg;
  }

  async *next(cursor: Cursor): AsyncIterable<RawProcurementEvent[]> {
    const files = await this.listFiles();
    const cap = this.cfg.maxFiles ?? 100;
    const batch: RawProcurementEvent[] = [];

    for (const file of files.slice(0, cap)) {
      const st = await stat(file);
      const observedAt = st.mtime;

      const bytes = await readFile(file);
      const sha = this.cfg.refIdFor ? this.cfg.refIdFor(file, bytes) : sha256(bytes);

      // §3.1 — strict cursor check at source level (the orchestrator also checks)
      if (!cursorAdvances(cursor, { observedAt, sourceRefId: sha })) continue;

      const ext = extname(file).toLowerCase();
      const name = basename(file);
      const supplierHint = inferSupplierFromFilename(name);

      if (ext === ".csv") {
        const text = decodeCsv(bytes);
        batch.push({
          source: "manual",
          sourceRefId: sha,
          observedAt,
          supplierHint,
          text,
          attachments: [{ name, sha256: sha, mimeType: "text/csv" }],
        });
      } else if (ext === ".pdf") {
        batch.push({
          source: "manual",
          sourceRefId: sha,
          observedAt,
          supplierHint,
          text: "",  // Tier-1 extractor falls back to filename + attachment
          attachments: [{ name, sha256: sha, mimeType: "application/pdf", data: bytes }],
        });
      }
      // Other extensions: skip (don't crash). Future: image OCR.
    }

    if (batch.length > 0) yield batch;
  }

  private async listFiles(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.cfg.watchDir);
    } catch {
      return [];
    }
    return entries
      .filter((n) => /\.(csv|pdf)$/i.test(n))
      .map((n) => join(this.cfg.watchDir, n))
      .sort();
  }
}

export function sha256(b: Buffer | Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

/** Try UTF-8; fall back to windows-1255 if BOM-less + non-printable bytes detected. */
export function decodeCsv(buf: Buffer): string {
  // Strip UTF-8 BOM if present
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf-8");
  }
  const utf = buf.toString("utf-8");
  // Replacement character → likely mis-decoded; try windows-1255
  if (utf.includes("�")) {
    return new TextDecoder("windows-1255").decode(buf);
  }
  return utf;
}

/**
 * Best-effort supplier hint from filename. Convention:
 *   "prime-energy_PO_2026-06-15.csv"  → "prime-energy"
 *   "KSTAR-invoice-9912.pdf"          → "KSTAR"
 * Falls back to full basename without extension.
 */
export function inferSupplierFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  // Take everything before the first underscore / hyphen-separator if it looks like a name
  const m = /^([\p{L}\p{N}\s.-]+?)[_]/u.exec(base);
  if (m) return m[1].trim();
  return base.split(/[-_]/u)[0] || base;
}

// ===========================================================================
// Minimal CSV parser — same shape as bank-receipts/sources/csv.ts. Exposed
// here so extract.ts can reuse it without circular import gymnastics.
// ===========================================================================

export interface CsvRow {
  [column: string]: string;
}

export function parseCsv(text: string): CsvRow[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const obj: CsvRow = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = cells[j] ?? "";
    rows.push(obj);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  for (const ch of text) {
    if (ch === '"') { inQuote = !inQuote; buf += ch; continue; }
    if (ch === "\n" && !inQuote) { out.push(buf.replace(/\r$/, "")); buf = ""; }
    else { buf += ch; }
  }
  if (buf) out.push(buf);
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { buf += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      out.push(buf);
      buf = "";
    } else { buf += ch; }
  }
  out.push(buf);
  return out;
}
