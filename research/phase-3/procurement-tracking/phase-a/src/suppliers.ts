// Procurement Phase A — matchOrCreateSupplier (LLD.md §3.4 + §3.5)
//
// Resolution order:
//   1. Hard hit: exact nameNorm match → reuse
//   2. Fuzzy hit: pg_trgm.similarity(nameNorm, hint) > 0.85 → reuse
//   3. Miss: create as status='watchlist' — caller fires ⚡ to Barak
//
// PROTOCOL §3.6a (don't invent operator facts): any newly seen supplier MUST
// land in watchlist. The system never promotes a supplier to 'active' without
// Barak's explicit approval (the BEE-app port wires the approve/merge/ignore
// commands; in standalone Phase A we expose the helper functions).

import { PrismaClient, Prisma } from "@prisma/client";
import { cleanSupplierName, guessCategory } from "./normalize.js";

const FUZZY_THRESHOLD = 0.85;

export interface SupplierResolution {
  id: string;
  nameRaw: string;
  nameNorm: string;
  status: string;        // 'watchlist' | 'active' | 'inactive'
  justCreated: boolean;  // true → caller should ⚡ Barak
}

export interface ResolveOpts {
  /** Override default 0.85; lower in test envs with tiny data sets */
  fuzzy?: number;
  /** Skip the fuzzy step (purely-exact mode for deterministic tests) */
  exactOnly?: boolean;
}

/**
 * Resolve a supplier hint to a `:Supplier` row. Always returns — never throws
 * on miss (creates a watchlist row). Throws on DB failure only.
 */
export async function matchOrCreateSupplier(
  prisma: Pick<PrismaClient, "supplier" | "$queryRaw">,
  rawHint: string,
  opts: ResolveOpts = {},
): Promise<SupplierResolution> {
  if (!rawHint || !rawHint.trim()) {
    throw new Error("supplier hint is empty — source adapter must populate supplierHint");
  }

  const nameRaw = rawHint.trim();
  const nameNorm = cleanSupplierName(nameRaw);
  if (!nameNorm) {
    throw new Error(`supplier hint normalizes to empty: '${rawHint}'`);
  }

  // 1. Hard hit
  const hard = await prisma.supplier.findUnique({ where: { nameNorm } });
  if (hard) {
    return { id: hard.id, nameRaw: hard.nameRaw, nameNorm: hard.nameNorm, status: hard.status, justCreated: false };
  }

  // 2. Fuzzy hit (optional)
  if (!opts.exactOnly) {
    const threshold = opts.fuzzy ?? FUZZY_THRESHOLD;
    const fuzzy = await prisma.$queryRaw<{ id: string; nameRaw: string; nameNorm: string; status: string; sim: number }[]>(
      Prisma.sql`
        SELECT "id", "nameRaw", "nameNorm", "status",
               similarity("nameNorm", ${nameNorm}) AS sim
          FROM "Supplier"
         WHERE similarity("nameNorm", ${nameNorm}) > ${threshold}
         ORDER BY sim DESC
         LIMIT 1
      `,
    );
    if (fuzzy.length > 0) {
      const f = fuzzy[0];
      return { id: f.id, nameRaw: f.nameRaw, nameNorm: f.nameNorm, status: f.status, justCreated: false };
    }
  }

  // 3. Miss — create in watchlist. Guard against a same-batch race: two events for the
  // same brand-new supplier both miss above, then both try to create → unique violation on
  // nameNorm. The loser catches P2002 and re-reads, so only the winner reports justCreated
  // (and only one ⚡ fires). guessCategory pre-fills a best-guess category (Tier 0).
  try {
    const created = await prisma.supplier.create({
      data: {
        nameRaw,
        nameNorm,
        status: "watchlist",
        category: guessCategory(nameRaw) ?? undefined,
      },
    });
    return { id: created.id, nameRaw, nameNorm, status: "watchlist", justCreated: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await prisma.supplier.findUnique({ where: { nameNorm } });
      if (winner) {
        return { id: winner.id, nameRaw: winner.nameRaw, nameNorm: winner.nameNorm, status: winner.status, justCreated: false };
      }
    }
    throw e;
  }
}

/**
 * Operator command — approve a watchlist supplier.
 * Used by `cli.ts supplier approve <id>` and by the BEE-app slash command.
 */
export async function approveSupplier(
  prisma: Pick<PrismaClient, "supplier">,
  id: string,
  patch?: { category?: string; paymentTermsDays?: number; taxId?: string },
): Promise<void> {
  await prisma.supplier.update({
    where: { id },
    data: {
      status: "active",
      ...(patch ?? {}),
    },
  });
}

/**
 * Operator command — merge a watchlist supplier into an existing :Supplier.
 * Re-key downstream POs/invoices, then delete the watchlist row.
 * Caller-supplied tx (Prisma transaction client) ensures atomicity.
 */
export async function mergeSupplier(
  tx: Prisma.TransactionClient,
  fromId: string,
  intoId: string,
): Promise<void> {
  if (fromId === intoId) return;
  await tx.purchaseOrder.updateMany({ where: { supplierId: fromId }, data: { supplierId: intoId } });
  await tx.supplierInvoice.updateMany({ where: { supplierId: fromId }, data: { supplierId: intoId } });
  await tx.supplier.delete({ where: { id: fromId } });
}

/** Operator command — drop future events from a supplier hint (status='inactive'). */
export async function ignoreSupplier(
  prisma: Pick<PrismaClient, "supplier">,
  id: string,
): Promise<void> {
  await prisma.supplier.update({ where: { id }, data: { status: "inactive" } });
}
