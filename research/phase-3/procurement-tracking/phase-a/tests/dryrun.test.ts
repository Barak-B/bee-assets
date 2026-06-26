// Procurement Phase A — dryrun + idempotency + new-supplier tests.
//
// Requires a live test PostgreSQL with pg_trgm extension. Set TEST_DATABASE_URL.
//
//   export TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:5432/bee_phase_a_test"
//   npx prisma migrate deploy --schema prisma/schema.prisma
//   node --test --experimental-strip-types tests/dryrun.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { ManualUploadSource } from "../src/sources/manual.js";
import { ingestProcurement } from "../src/ingest.js";
import { matchOrCreateSupplier, approveSupplier } from "../src/suppliers.js";

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const SKIP = !dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl ?? "" } } });
const fixtureDir = new URL("./", import.meta.url).pathname;

async function clean() {
  await prisma.purchaseOrderLine.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.supplierInvoice.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.ingestRun.deleteMany({ where: { pipeline: "procurement" } });
  await prisma.ingestionLock.deleteMany({});
}

test("dry-run never writes any PO rows", { skip: SKIP }, async () => {
  await clean();
  const src = new ManualUploadSource({ watchDir: fixtureDir });
  const r = await ingestProcurement(prisma, {
    sourceName: "test:dry",
    source: src,
    dryRun: true,
  });
  assert.ok(r.rowsRead >= 2, `rowsRead=${r.rowsRead}`);
  const poCount = await prisma.purchaseOrder.count();
  assert.equal(poCount, 0, "dry-run produced 0 persisted POs");
  // But suppliers MAY have been auto-created in watchlist — that's policy
  await clean();
});

test("first run inserts 2 POs and 2 watchlist suppliers; second run hard-dedups", { skip: SKIP }, async () => {
  await clean();
  const src = new ManualUploadSource({ watchDir: fixtureDir });

  const r1 = await ingestProcurement(prisma, { sourceName: "test:idemp", source: src });
  assert.equal(r1.rowsInserted, 2, `r1.inserted=${r1.rowsInserted} (expected 2)`);
  assert.equal(r1.newSuppliers, 2, `r1.newSuppliers=${r1.newSuppliers}`);

  // Reset cursor by using a fresh source instance but same files — sha256 stays
  const src2 = new ManualUploadSource({ watchDir: fixtureDir });
  const r2 = await ingestProcurement(prisma, { sourceName: "test:idemp", source: src2 });
  assert.equal(r2.rowsInserted, 0, "second run inserts nothing (hard-key dedup)");
  assert.equal(r2.rowsDedupedHard, 2, "all hard-deduped");
  await clean();
});

test("matchOrCreateSupplier: hard hit reuses; fuzzy hit reuses; miss creates watchlist", { skip: SKIP }, async () => {
  await clean();

  const a = await matchOrCreateSupplier(prisma, "Prime Energy");
  assert.equal(a.justCreated, true, "first call creates");
  assert.equal(a.status, "watchlist");

  // Exact hard hit
  const b = await matchOrCreateSupplier(prisma, "Prime Energy");
  assert.equal(b.justCreated, false);
  assert.equal(b.id, a.id);

  // Fuzzy hit ("PRIME ENERGY LTD" → normalizes to "prime energy")
  const c = await matchOrCreateSupplier(prisma, "PRIME ENERGY LTD");
  assert.equal(c.justCreated, false);
  assert.equal(c.id, a.id);

  // Distinct supplier → new watchlist row
  const d = await matchOrCreateSupplier(prisma, "KStar IL");
  assert.equal(d.justCreated, true);
  assert.notEqual(d.id, a.id);

  await clean();
});

test("approveSupplier promotes watchlist → active", { skip: SKIP }, async () => {
  await clean();
  const a = await matchOrCreateSupplier(prisma, "Deye Distrib");
  assert.equal(a.status, "watchlist");
  await approveSupplier(prisma, a.id, { category: "inverters", paymentTermsDays: 45 });
  const after = await prisma.supplier.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(after.status, "active");
  assert.equal(after.category, "inverters");
  assert.equal(after.paymentTermsDays, 45);
  await clean();
});

test("lock contention — second invocation skips when first holds lock", { skip: SKIP }, async () => {
  await clean();
  await prisma.ingestionLock.create({
    data: {
      key: "procurement:source:test:lock",
      holderPid: "test-holder",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const src = new ManualUploadSource({ watchDir: fixtureDir });
  const r = await ingestProcurement(prisma, { sourceName: "test:lock", source: src });
  assert.equal(r.skipped?.reason, "lock_held_elsewhere");
  await clean();
});

test("PO lines inserted with normalized descriptions", { skip: SKIP }, async () => {
  await clean();
  const src = new ManualUploadSource({ watchDir: fixtureDir });
  await ingestProcurement(prisma, { sourceName: "test:lines", source: src });
  const lines = await prisma.purchaseOrderLine.findMany({});
  assert.ok(lines.length >= 5, `lines=${lines.length}`);
  // Cable 6mm² should normalize to "cable 6mm2 black" (or similar)
  const cable = lines.find((l) => /cable.*6mm2/.test(l.descriptionNorm));
  assert.ok(cable, `expected a normalized 6mm2 cable line, got: ${lines.map((l) => l.descriptionNorm).join(" | ")}`);
  await clean();
});
