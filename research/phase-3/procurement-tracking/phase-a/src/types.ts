// Procurement Phase A — shared types (LLD.md §3.4)
//
// Mirrors the bank-receipts/types.ts shape: sources emit Raw events, the
// orchestrator normalizes + extracts + persists. Cursor tuple per source
// is (observedAt, sourceRefId) per PROTOCOL §3.1.

export type ProcurementSource = "email" | "wa" | "manual" | "bee-app";
export type ProcurementEventKind = "po" | "invoice" | "shipping" | "quote" | "other";

export interface RawProcurementEvent {
  source: ProcurementSource;
  /** gmail msg id / wa msg id / file sha256 / bee-app po id — drives hard dedup */
  sourceRefId: string;
  observedAt: Date;
  /** Best-guess supplier name from sender / subject / chat title / filename */
  supplierHint: string;
  /** Full text — markdown if rich, plain otherwise. Always retained for audit. */
  text: string;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  sha256: string;
  mimeType: string;
  /** Raw bytes — populated only by sources that fetch attachments inline */
  data?: Uint8Array;
}

export interface ExtractedPO {
  poNumber?: string;
  orderedAt: Date;
  expectedAt?: Date;
  totalCents: bigint;
  currency: string;
  lines: ExtractedPOLine[];
}

export interface ExtractedPOLine {
  sku?: string;
  description: string;
  qty: number;            // up to 3 decimal places (DB column is DECIMAL(10,3))
  unit: string;
  unitPriceCents: bigint;
}

export interface ExtractedInvoice {
  invoiceNumber: string;
  shaamAllocationNumber?: string;
  issuedAt: Date;
  dueAt: Date;
  totalCents: bigint;
  currency: string;
  /** PO numbers mentioned in invoice text — best-effort linkage */
  linkedPoHints?: string[];
}

export type ExtractionResult =
  | { kind: "po"; po: ExtractedPO }
  | { kind: "invoice"; invoice: ExtractedInvoice }
  | { kind: "shipping" | "quote" | "other"; note?: string };

export interface Cursor {
  ts: Date;
  refId: string;
}

/** §3.1 strict tuple ordering — no same-second collisions */
export function cursorAdvances(c: Cursor, e: { observedAt: Date; sourceRefId: string }): boolean {
  if (e.observedAt.getTime() > c.ts.getTime()) return true;
  if (e.observedAt.getTime() === c.ts.getTime() && e.sourceRefId > c.refId) return true;
  return false;
}

export interface ProcurementEventSource {
  readonly mode: ProcurementSource;
  next(cursor: Cursor): AsyncIterable<RawProcurementEvent[]>;
}

export interface IngestResult {
  runId: string;
  rowsRead: number;
  rowsInserted: number;
  rowsDedupedHard: number;
  newSuppliers: number;
  anomalies: number;
  skipped?: { reason: string };
}
