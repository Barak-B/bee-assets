// Idempotency test — PROTOCOL §3.1 + §3.4
//
// Requires a live test PostgreSQL with pg_trgm extension. Set TEST_DATABASE_URL.
//
//   export TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:5432/bee_phase_a_test"
//   npx prisma migrate deploy --schema prisma/schema.prisma
//   node --test --experimental-strip-types tests/idempotency.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { CsvSource } from "../src/sources/csv.js";
import { ingestAccount } from "../src/ingest.js";

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const SKIP = !dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl ?? "" } } });

async function clean(accountId: string) {
  await prisma.bankTransaction.deleteMany({ where: { accountId } });
  await prisma.ingestRun.deleteMany({ where: { accountId } });
  await prisma.bankAccount.deleteMany({ where: { id: accountId } });
  await prisma.ingestionLock.deleteMany({});
}

async function seedAccount(accountId: string) {
  await prisma.bankAccount.create({
    data: {
      id: accountId, iban: `IL00${accountId.padStart(20, "0")}`,
      bankCode: "12", accountNumber: "000-test",
    },
  });
}

const src = new CsvSource({
  watchDir: fileURLToPath(new URL("./", import.meta.url)),   // Windows-safe (no leading-slash /C:/...)
  columnMap: { date: "value_date", amount: "amount", ref: "ref", memo: "memo" },
});

test("idempotency — second run inserts 0, hard-dedups all 5", { skip: SKIP }, async () => {
  const accountId = "TEST-IDEMP-001";
  await clean(accountId);
  await seedAccount(accountId);

  const r1 = await ingestAccount(prisma, { accountId, source: src });
  // Fixture has 6 rows; rows 3+4 should fuzzy-dedup against each other (same amount/date,
  // counterparty "אצל פלאר..." vs "פלאר..." normalize to "פלאר תשלום חודשי")
  assert.ok(r1.rowsRead >= 5, `rowsRead=${r1.rowsRead} (expected >=5)`);
  assert.equal(r1.rowsDedupedHard, 0, "first run has no hard dups");
  assert.ok(r1.rowsInserted >= 4, `inserted=${r1.rowsInserted} (expected >=4 after fuzzy dedup)`);
  assert.ok(r1.rowsDedupedFuzzy >= 1, `fuzzy=${r1.rowsDedupedFuzzy} (expected >=1)`);

  const r2 = await ingestAccount(prisma, { accountId, source: src });
  assert.equal(r2.rowsInserted, 0, "second run inserts nothing");
  assert.equal(r2.rowsDedupedHard, r1.rowsInserted, "all r1 inserts are hard-dups in r2");

  await clean(accountId);
});

test("lock contention — second invocation skips when first holds lock", { skip: SKIP }, async () => {
  const accountId = "TEST-LOCK-001";
  await clean(accountId);
  await seedAccount(accountId);

  // Hold a synthetic lock first
  await prisma.ingestionLock.create({
    data: {
      key: `bank-receipts:account:${accountId}`,
      holderPid: "test-holder",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const result = await ingestAccount(prisma, { accountId, source: src });
  assert.equal(result.skipped?.reason, "lock_held_elsewhere");

  await clean(accountId);
});

test("dry-run never writes", { skip: SKIP }, async () => {
  const accountId = "TEST-DRY-001";
  await clean(accountId);
  await seedAccount(accountId);

  const r = await ingestAccount(prisma, { accountId, source: src, dryRun: true });
  assert.ok(r.rowsRead > 0);

  const count = await prisma.bankTransaction.count({ where: { accountId } });
  assert.equal(count, 0, "dry-run produced 0 persisted rows");

  await clean(accountId);
});
