// PROTOCOL §4.2 — State Validation Circuit for procurement.
// After every PO insert, read back from DB + verify core fields. Then mark
// `validated=true`. Same shape as bank-receipts/validate.ts.

import { PrismaClient } from "@prisma/client";

export interface Validator {
  verify(insertedPoIds: string[]): Promise<{ ok: boolean; missing: string[] }>;
}

export function makeValidator(prisma: PrismaClient): Validator {
  return {
    async verify(insertedPoIds) {
      if (insertedPoIds.length === 0) return { ok: true, missing: [] };

      const found = await prisma.purchaseOrder.findMany({
        where: { id: { in: insertedPoIds } },
        select: {
          id: true,
          supplierId: true,
          source: true,
          sourceRefId: true,
          totalCents: true,
          orderedAt: true,
          lines: { select: { id: true } },
        },
      });

      const foundIds = new Set(found.map((r) => r.id));
      const missing = insertedPoIds.filter((id) => !foundIds.has(id));

      for (const r of found) {
        // NOT-NULL columns are guaranteed present; the meaningful invariants are a
        // positive total and at least one line (a zero/empty PO is structurally invalid).
        if (!r.supplierId || !r.source || !r.sourceRefId || !r.orderedAt || r.totalCents <= 0n) {
          missing.push(r.id);
        }
        if (r.lines.length === 0) {
          missing.push(r.id);
        }
      }

      if (missing.length === 0) {
        await prisma.purchaseOrder.updateMany({
          where: { id: { in: insertedPoIds } },
          data: { validated: true },
        });
      }

      return { ok: missing.length === 0, missing };
    },
  };
}
