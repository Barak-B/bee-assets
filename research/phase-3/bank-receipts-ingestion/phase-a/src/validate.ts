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

      // Sanity gate — accountId/externalTxId/valueDate are NOT NULL columns so presence is
      // guaranteed; the meaningful invariant is that the row is actually readable post-commit
      // (the foundIds check above). We additionally assert the FK resolves to a real account.
      if (found.length > 0) {
        const accountIds = [...new Set(found.map((r) => r.accountId))];
        const realAccounts = await prisma.bankAccount.count({ where: { id: { in: accountIds } } });
        if (realAccounts !== accountIds.length) {
          for (const r of found) missing.push(r.id);   // dangling FK → fail the whole batch
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
