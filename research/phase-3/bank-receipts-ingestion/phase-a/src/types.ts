// Shared types — interfaces from LLD.md §3.4

export type SourceMode = "csv" | "scrape" | "openbanking";

export interface RawTx {
  externalTxId: string;
  valueDate: Date;          // Asia/Jerusalem-aware Date object
  bookingDate?: Date;
  amountCents: bigint;      // signed; positive = inflow
  currency: string;         // ISO 4217
  counterpartyRaw: string;
  memo?: string;
}

export interface NormalizedTx extends RawTx {
  counterpartyNorm: string; // post-PROTOCOL-§3.4 cleanup
}

export interface Cursor {
  ts: Date;
  txId: string;
}

/** PROTOCOL §3.1 — strict tuple ordering, no same-second collisions */
export function cursorAdvances(c: Cursor, t: { valueDate: Date; externalTxId: string }): boolean {
  if (t.valueDate.getTime() > c.ts.getTime()) return true;
  if (t.valueDate.getTime() === c.ts.getTime() && t.externalTxId > c.txId) return true;
  return false;
}

/** Source adapter contract — implemented by csv/scrape/openbanking */
export interface BankAccountRef {
  id: string;
  iban: string;
  bankCode: string;
  cursorTs: Date | null;
  cursorTxId: string | null;
}

export interface TransactionSource {
  readonly mode: SourceMode;
  next(account: BankAccountRef, cursor: Cursor): AsyncIterable<RawTx[]>;
}

/** PROTOCOL §3.2 — lock provider */
export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface LockProvider {
  acquire(key: string, ttlSeconds: number): Promise<LockHandle | null>;
}

/** PROTOCOL §4.2 — validation circuit */
export interface Validator {
  verify(insertedIds: string[]): Promise<{ ok: boolean; missing: string[] }>;
}

/** Result envelope for ingest runs */
export interface IngestResult {
  runId: string;
  rowsRead: number;
  rowsInserted: number;
  rowsDedupedHard: number;
  rowsDedupedFuzzy: number;
  skipped?: { reason: string };
}
