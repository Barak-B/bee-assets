// Core ingest function — atomic, all PROTOCOL gates applied.
// Reference impl from LLD.md §4.1, hardened.

import { PrismaClient, Prisma } from "@prisma/client";
import type { IngestResult, NormalizedTx, TransactionSource } from "./types.js";
import { cursorAdvances } from "./types.js";
import { cleanCounterparty } from "./normalize.js";
import { acquireLock } from "./lock.js";
import { makeValidator } from "./validate.js";
import { logManifest, alertBarak } from "./survive.js";

const LOCK_TTL_S = 600;
const FUZZY_THRESHOLD = 0.85;   // PROTOCOL §3.4

export interface IngestOpts {
  accountId: string;
  source: TransactionSource;
  dryRun?: boolean;     // run end-to-end, never commit
}

export async function ingestAccount(prisma: PrismaClient, opts: IngestOpts): Promise<IngestResult> {
  const { accountId, source, dryRun = false } = opts;
  const lockKey = `bank-receipts:account:${accountId}`;
  const lock = await acquireLock(prisma, lockKey, LOCK_TTL_S);
  if (!lock) {
    return { runId: "", rowsRead: 0, rowsInserted: 0, rowsDedupedHard: 0, rowsDedupedFuzzy: 0,
             skipped: { reason: "lock_held_elsewhere" } };
  }

  const run = await prisma.ingestRun.create({
    data: { pipeline: "bank-receipts", sourceMode: source.mode, accountId, status: "running" },
  });

  let rowsRead = 0, hardDup = 0, fuzzyDup = 0;
  const insertedIds: string[] = [];

  try {
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    // startCursor is FROZEN for the whole run. It is a *fetch hint* to the source only —
    // it is NOT used to filter rows. Hard-key dedup (§3.4) is the authoritative idempotency
    // guarantee. (Earlier bug: advancing+filtering on the same cursor per-row made every
    // re-run short-circuit before hard-dedup, so re-runs never deduped. Hard-dedup now owns it.)
    const startCursor = { ts: account.cursorTs ?? new Date(0), txId: account.cursorTxId ?? "" };
    const maxSeen = { ts: startCursor.ts, txId: startCursor.txId };

    for await (const batch of source.next(account, startCursor)) {
      rowsRead += batch.length;

      for (const raw of batch) {
        const norm: NormalizedTx = { ...raw, counterpartyNorm: cleanCounterparty(raw.counterpartyRaw) };

        // Track the high-water mark for persistence (used as next run's fetch hint).
        if (cursorAdvances(maxSeen, norm)) { maxSeen.ts = norm.valueDate; maxSeen.txId = norm.externalTxId; }

        // PROTOCOL §3.4 — hard-key dedup (authoritative)
        const hard = await prisma.bankTransaction.findUnique({
          where: { accountId_externalTxId: { accountId, externalTxId: norm.externalTxId } },
          select: { id: true },
        });
        if (hard) { hardDup++; continue; }

        // PROTOCOL §3.4 — fuzzy dedup via pg_trgm.similarity
        const dayMs = 86_400_000;
        const fuzzy = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM "BankTransaction"
          WHERE "accountId" = ${accountId}
            AND "amountCents" = ${norm.amountCents}
            AND "valueDate" BETWEEN ${new Date(+norm.valueDate - dayMs)}::timestamp
                                AND ${new Date(+norm.valueDate + dayMs)}::timestamp
            AND similarity("counterpartyNorm", ${norm.counterpartyNorm}) > ${FUZZY_THRESHOLD}
          LIMIT 1
        `);
        if (fuzzy.length > 0) { fuzzyDup++; continue; }

        if (dryRun) continue;    // dry-run never writes — used by tests + first run

        // PROTOCOL §3.2 — atomic Unit of Work (one row insert; cursor persisted once after loop)
        const created = await prisma.bankTransaction.create({
          data: {
            accountId,
            externalTxId: norm.externalTxId,
            valueDate: norm.valueDate,
            bookingDate: norm.bookingDate ?? null,
            amountCents: norm.amountCents,
            currency: norm.currency || "ILS",
            counterpartyRaw: norm.counterpartyRaw,
            counterpartyNorm: norm.counterpartyNorm,
            memo: norm.memo ?? null,
            sourceMode: source.mode,
            ingestRunId: run.id,
          },
          select: { id: true },
        });
        insertedIds.push(created.id);
      }
    }

    // Persist the high-water mark ONCE (next run's fetch hint). Skipped on dry-run.
    if (!dryRun && (maxSeen.ts.getTime() !== startCursor.ts.getTime() || maxSeen.txId !== startCursor.txId)) {
      await prisma.bankAccount.update({
        where: { id: accountId },
        data: { cursorTs: maxSeen.ts, cursorTxId: maxSeen.txId },
      });
    }

    // PROTOCOL §4.2 — read-back validation
    if (!dryRun && insertedIds.length > 0) {
      const v = await makeValidator(prisma).verify(insertedIds);
      if (!v.ok) {
        await logManifest({
          kind: "validation_fail", runId: run.id, stream: "bank-receipts",
          root_cause: "read-back missing or schema-incomplete rows after insert",
          context: { missing: v.missing, accountId },
        });
        await alertBarak(`bank-receipts run ${run.id}: validation failed for ${v.missing.length} rows`, { urgent: true });
        throw new Error("validation_circuit_failed");
      }
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "ok",   // throws above on any failure path; reaching here = ok
        rowsRead, rowsInserted: insertedIds.length, rowsDedupedHard: hardDup, rowsDedupedFuzzy: fuzzyDup,
      },
    });

    return {
      runId: run.id, rowsRead,
      rowsInserted: insertedIds.length,
      rowsDedupedHard: hardDup, rowsDedupedFuzzy: fuzzyDup,
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(), status: "fail",
        errorCode: err.code ?? "unknown",
        errorMessage: (err.message ?? String(e)).slice(0, 500),
      },
    });
    await logManifest({
      kind: "ingest_throw", runId: run.id, stream: "bank-receipts",
      root_cause: err.message ?? String(e), context: { accountId, rowsRead, insertedSoFar: insertedIds.length },
    });
    await alertBarak(`bank-receipts FAIL run ${run.id}: ${err.message ?? String(e)}`, { urgent: true });
    throw e;
  } finally {
    // PROTOCOL §3.2 invariant — lock always releases (TTL is fail-safe backup)
    await lock.release().catch(() => undefined);
  }
}
