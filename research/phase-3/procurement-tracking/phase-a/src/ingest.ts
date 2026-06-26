// Core ingest function — atomic, all PROTOCOL gates applied (LLD.md §4.1).
// Mirrors bank-receipts/ingest.ts shape.

import { PrismaClient } from "@prisma/client";
import type {
  Cursor,
  IngestResult,
  ProcurementEventSource,
  RawProcurementEvent,
} from "./types.js";
import { cursorAdvances } from "./types.js";
import { cleanDescription } from "./normalize.js";
import { acquireLock } from "./lock.js";
import { makeValidator } from "./validate.js";
import { logManifest, alertBarak } from "./survive.js";
import { matchOrCreateSupplier } from "./suppliers.js";
import { extractEvent } from "./extract.js";

const LOCK_TTL_S = 600;

export interface IngestOpts {
  /** Logical source name (e.g. 'manual:E:/bee-build/procurement-imports') */
  sourceName: string;
  source: ProcurementEventSource;
  /** Run end-to-end but never commit — used by tests + first runs */
  dryRun?: boolean;
}

export async function ingestProcurement(prisma: PrismaClient, opts: IngestOpts): Promise<IngestResult> {
  const { sourceName, source, dryRun = false } = opts;
  const lockKey = `procurement:source:${sourceName}`;
  const lock = await acquireLock(prisma, lockKey, LOCK_TTL_S);
  if (!lock) {
    return {
      runId: "",
      rowsRead: 0,
      rowsInserted: 0,
      rowsDedupedHard: 0,
      newSuppliers: 0,
      anomalies: 0,
      skipped: { reason: "lock_held_elsewhere" },
    };
  }

  const run = await prisma.ingestRun.create({
    data: { pipeline: "procurement", sourceMode: source.mode, status: "running" },
  });

  let rowsRead = 0;
  let hardDup = 0;
  let newSuppliers = 0;
  const insertedPoIds: string[] = [];

  try {
    const cursor: Cursor = { ts: new Date(0), refId: "" };

    for await (const batch of source.next(cursor)) {
      rowsRead += batch.length;

      for (const raw of batch) {
        if (!cursorAdvances(cursor, raw)) continue;

        // §3.4 hard-key dedup
        const exists = await prisma.purchaseOrder.findUnique({
          where: { source_sourceRefId: { source: raw.source, sourceRefId: raw.sourceRefId } },
          select: { id: true },
        });
        if (exists) {
          hardDup++;
          continue;
        }

        // §3.4 fuzzy supplier resolution + §3.5 watchlist
        const supplier = await matchOrCreateSupplier(prisma, raw.supplierHint);
        if (supplier.justCreated) {
          newSuppliers++;
          await alertBarak(
            `New supplier seen: '${supplier.nameRaw}' via ${raw.source}. Approve? merge? ignore?`,
          );
        }

        const extracted = await extractEvent(raw);
        if (extracted.kind === "other") {
          // Phase A: skip non-PO events but keep raw text for audit
          await logManifest({
            kind: "extract_skip",
            runId: run.id,
            stream: "procurement",
            context: {
              sourceRefId: raw.sourceRefId,
              note: extracted.note,
              supplierId: supplier.id,
            },
          });
          continue;
        }

        if (dryRun) continue;

        if (extracted.kind === "po") {
          // §3.2 atomic UoW
          const id = await prisma.$transaction(async (tx) => {
            const po = await tx.purchaseOrder.create({
              data: {
                poNumber: extracted.po.poNumber,
                supplierId: supplier.id,
                source: raw.source,
                sourceRefId: raw.sourceRefId,
                orderedAt: extracted.po.orderedAt,
                expectedAt: extracted.po.expectedAt,
                totalCents: extracted.po.totalCents,
                currency: extracted.po.currency,
                status: "open",
                rawText: raw.text,
                ingestRunId: run.id,
                lines: {
                  create: extracted.po.lines.map((l) => ({
                    sku: l.sku,
                    description: l.description,
                    descriptionNorm: cleanDescription(l.description),
                    qty: l.qty,
                    unit: l.unit,
                    unitPriceCents: l.unitPriceCents,
                    lineTotalCents: BigInt(Math.round(Number(l.unitPriceCents) * l.qty)),
                  })),
                },
              },
              select: { id: true },
            });
            return po.id;
          });
          insertedPoIds.push(id);
        }
        // extracted.kind === "invoice" is wired in Phase B (parser stub doesn't emit it yet)

        // Advance local cursor
        cursor.ts = raw.observedAt;
        cursor.refId = raw.sourceRefId;
      }
    }

    // §4.2 read-back validation
    if (!dryRun && insertedPoIds.length > 0) {
      const v = await makeValidator(prisma).verify(insertedPoIds);
      if (!v.ok) {
        await logManifest({
          kind: "validation_fail",
          runId: run.id,
          stream: "procurement",
          root_cause: "read-back missing or schema-incomplete POs after insert",
          context: { missing: v.missing },
        });
        await alertBarak(
          `procurement run ${run.id}: validation failed for ${v.missing.length} POs`,
          { urgent: true },
        );
        throw new Error("validation_circuit_failed");
      }
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "ok",
        rowsRead,
        rowsInserted: insertedPoIds.length,
        rowsDedupedHard: hardDup,
        rowsDedupedFuzzy: 0,  // Phase A: no fuzzy dedup at PO level (each sourceRefId is unique by sha256)
      },
    });

    return {
      runId: run.id,
      rowsRead,
      rowsInserted: insertedPoIds.length,
      rowsDedupedHard: hardDup,
      newSuppliers,
      anomalies: 0,           // Phase D wires PriceBenchmark
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "fail",
        errorCode: err.code ?? "unknown",
        errorMessage: (err.message ?? String(e)).slice(0, 500),
      },
    });
    await logManifest({
      kind: "ingest_throw",
      runId: run.id,
      stream: "procurement",
      root_cause: err.message ?? String(e),
      context: { sourceName, rowsRead, insertedSoFar: insertedPoIds.length },
    });
    await alertBarak(
      `procurement FAIL run ${run.id}: ${err.message ?? String(e)}`,
      { urgent: true },
    );
    throw e;
  } finally {
    await lock.release().catch(() => undefined);
  }
}

/**
 * Convenience overload — accepts a `RawProcurementEvent[]` array directly,
 * bypassing the source interface. Used by tests and the CLI `ingest --inline`.
 */
export async function ingestEvents(
  prisma: PrismaClient,
  events: RawProcurementEvent[],
  opts: { sourceName: string; sourceMode?: "manual" | "email" | "wa" | "bee-app"; dryRun?: boolean },
): Promise<IngestResult> {
  const inline: ProcurementEventSource = {
    mode: opts.sourceMode ?? "manual",
    async *next() {
      if (events.length > 0) yield events;
    },
  };
  return ingestProcurement(prisma, { sourceName: opts.sourceName, source: inline, dryRun: opts.dryRun });
}
