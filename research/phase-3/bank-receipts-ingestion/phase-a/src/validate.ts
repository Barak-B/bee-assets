// PROTOCOL §4.2 — State Validation Circuit
// After every write, read back from DB and verify schema. API 200 OK ≠ persistence.

import { PrismaClient } from "@prisma/client";
import type { Validator } from "./types.js";

export function makeValidator(prisma: PrismaClient): Validator {
  return {
    async verify(insertedIds: string[]) {
      if (insertedIds.length === 0) return { ok: true, missing: [] };

      // Read back — check core fields + foreign key validity
      const found = await prisma.bankTransaction.findMany({
        where: { id: { in: insertedIds } },
        select: { id: true, accountId: true, externalTxId: true, amountCents: true, valueDate: true },
      });

      const foundIds = new Set(found.map((r) => r.id));
      const missing = insertedIds.filter((id) => !foundIds.has(id));

      // Sanity gates — every row must have required fields populated
      for (const r of found) {
        if (!r.accountId || !r.externalTxId || r.amountCents === undefined || !r.valueDate) {
          missing.push(r.id);
        }
      }

      // Mark validated on success
      if (missing.length === 0) {
        await prisma.bankTransaction.updateMany({
          where: { id: { in: insertedIds } },
          data: { validated: true },
        });
      }

      return { ok: missing.length === 0, missing };
    },
  };
}
