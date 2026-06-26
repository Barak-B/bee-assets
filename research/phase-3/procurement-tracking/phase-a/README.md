# Phase A — procurement-tracking (schema + lock + ManualUpload + dry-run)

Reference implementation for the first 5h slice from [`../LLD.md`](../LLD.md) §5 Phase A.
**Standalone for migration + testing.** Port `src/` into BEE app once green.

The schema bundles Wave 53/A models so this directory can migrate on a fresh DB without
needing `bank-receipts/phase-a/` applied first. When porting into BEE app's
`schema.prisma`, copy ONLY the `Supplier`/`PurchaseOrder*`/`SupplierInvoice`/`PriceBenchmark`/
`LeadTimeRecord` blocks below the divider — the 53/A blocks are already there.

## What's in here

```
phase-a/
├── README.md                                  ← this file
├── package.json                               ← deps + scripts (mirrors bank-receipts/phase-a)
├── tsconfig.json                              ← strict + ESNext + Node 22 native TS
├── prisma/
│   ├── schema.prisma                          ← 4 (53/A) + 6 (53/B) = 10 models
│   └── migrations/0001_procurement/
│       └── migration.sql                      ← CREATE EXTENSION pg_trgm + all tables + indexes
├── src/
│   ├── types.ts                               ← RawProcurementEvent + ExtractedPO + cursorAdvances
│   ├── normalize.ts                           ← cleanSupplierName (corp-suffix), cleanDescription, parsers
│   ├── lock.ts                                ← Redis primary, IngestionLock-row fallback (parity with 53/A)
│   ├── validate.ts                            ← PROTOCOL §4.2 read-back on inserted POs
│   ├── survive.ts                             ← err_manifest.jsonl + alertBarak shim
│   ├── suppliers.ts                           ← matchOrCreateSupplier + approve/merge/ignore (LLD §3.4 + §3.5)
│   ├── extract.ts                             ← canonical Manual CSV parser (Tier 0); Tier-1 LLM lands in Phase B
│   ├── ingest.ts                              ← atomic ingestProcurement (all gates applied)
│   ├── cli.ts                                 ← selftest | normalize | parse | ingest
│   └── sources/manual.ts                      ← ManualUploadSource (sha256 dedup) + RFC-4180-ish CSV reader
└── tests/
    ├── fixture-prime-energy.csv               ← 3 lines, PO-2026-001, total 12,280.00 ILS
    ├── fixture-electro-tek-bvm.csv            ← 2 lines, Hebrew supplier name with בע"מ
    └── dryrun.test.ts                         ← 6 node:test cases
```

## Quick start (standalone)

```bash
# 1. Install deps
npm install

# 2. Self-test pure functions (no DB needed)
npm run selftest

# 3. Provision a test PostgreSQL (or reuse the one from bank-receipts/phase-a)
docker run -d --name bee-test-pg -p 5432:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bee_procurement_test \
  postgres:16

# 4. Apply migration
export DATABASE_URL="postgresql://test:test@127.0.0.1:5432/bee_procurement_test"
npx prisma migrate deploy

# 5. Dry-run against fixtures (no writes)
npm run dry-run

# 6. Full test suite (requires DB)
export TEST_DATABASE_URL="$DATABASE_URL"
npm test
```

Expected `selftest` output:
```
  PASS cleanSupplierName: corporate suffix + Hebrew prefixes
  PASS cleanDescription: collapse + normalize mm²
  PASS parseAmountCents: signed / thousands / suffix-minus
  PASS parseIsraeliDate: DD/MM/YYYY → Asia/Jerusalem midnight
  PASS tryParseManualCsv: 3-row PO with header → 1 ExtractedPO + 3 lines

selftest: pass=5 fail=0
```

Expected `npm test` summary (6 tests):
```
✔ dry-run never writes any PO rows
✔ first run inserts 2 POs and 2 watchlist suppliers; second run hard-dedups
✔ matchOrCreateSupplier: hard hit reuses; fuzzy hit reuses; miss creates watchlist
✔ approveSupplier promotes watchlist → active
✔ lock contention — second invocation skips when first holds lock
✔ PO lines inserted with normalized descriptions
```

## Canonical Manual CSV format

Phase A processes one CSV layout — the "Barak drops a normalized export" lane.
Each supplier's real portal export gets its own adapter once observed (Phase B+).

```csv
po_number,supplier,description,sku,qty,unit,unit_price,ordered_at,expected_at,currency
PO-2026-001,Prime Energy,Panel 550W Mono,PE-550,12,pcs,650.00,15/06/2026,22/06/2026,ILS
```

Rules:
- `po_number` rows collapse into one `:PurchaseOrder` with `lineTotalCents` summed.
- `ordered_at` / `expected_at` use Israeli DD/MM/YYYY.
- `unit_price` follows the bank-receipts amount parser (suffix-minus, thousands).
- `currency` defaults to ILS.
- File `sha256` is the `sourceRefId` — re-dropping the same file is a hard-dedup no-op.

## Gates covered (per LLD.md §3-4, protocol_hive.md §3)

| Gate | Where |
|---|---|
| Cursor tuple `(observedAt, sourceRefId)` strict ordering | `types.ts::cursorAdvances` + `ingest.ts` filter |
| Distributed lock (Redis primary, PG row fallback) | `lock.ts` factory |
| Hard-key dedup `(source, sourceRefId)` | `ingest.ts` + schema `@@unique` on PurchaseOrder + SupplierInvoice |
| Fuzzy supplier match via pg_trgm > 0.85 | `suppliers.ts::matchOrCreateSupplier` raw SQL |
| Hebrew suffix stripping (`בע"מ` / `ושות'` / `(2007)`) | `normalize.ts::cleanSupplierName` |
| New-supplier watchlist gate (§3.5) | `suppliers.ts` + ⚡ Barak from `ingest.ts` |
| Atomic write transaction (UoW) | `prisma.$transaction` in `ingest.ts` |
| Read-back validation circuit (lines ≥ 1) | `validate.ts::makeValidator` |
| err_manifest + ⚡ Barak on hard fail | `survive.ts::logManifest + alertBarak` |
| Lock release in `finally` | `ingest.ts` |
| Lock TTL fail-safe (600s self-expiry) | `lock.ts` Redis EX / IngestionLock.expiresAt |
| Constitutional §3.6a (don't guess operator facts) | `suppliers.ts` — never `status='active'` without explicit approve |

## Port-into-BEE-app checklist

1. Copy `prisma/schema.prisma` Wave-53/B blocks into BEE app's `schema.prisma`.
   Run `npx prisma migrate dev --name procurement_v1`.
2. Copy `src/` into `bee-ops/src/procurement/`. Replace the local `lock.ts` + `survive.ts`
   with imports from `bee-ops/src/bank-receipts/` (single source of truth).
3. Replace `alertBarak` shim — use Alfred's `dispatchSend()` directly (constitutional law #1
   is enforced inside dispatchSend; don't reimplement here).
4. Cron: every 15 min, OpenClaw tick calls `ingestProcurement` for every configured source.
   First source = ManualUploadSource on `E:\bee-build\procurement-imports\`.
5. `/supplier approve <id>`, `/supplier merge <from> <into>`, `/supplier ignore <id>` —
   wire as Alfred slash commands routing to `suppliers.ts::approveSupplier` etc.

## Out of scope (later phases)

- B: EmailSource (Gmail OAuth) + Tier-1 DeepSeek extraction from unstructured email/WA.
- C: New-supplier alert wiring + `:SupplierInvoice` insert path (extractor stub returns 'other' for invoices in Phase A).
- D: PriceBenchmark + anomaly detection (z-score per line vs 30d rolling avg).
- D: LeadTimeRecord — populated on `status` → `received` transitions.
- E: WaSource extending alfred-inbound-watcher.
- F: Weekly Tier-3 Sonnet supplier health digest.
- G: BankTransaction ↔ SupplierInvoice reconciliation (Wave 53/A↔B link).

## Cloud-session verification status (2026-06-26)

All TypeScript files pass `node --check --experimental-strip-types` AST parse.
SQL migration parens balanced, all referenced columns + indexes consistent.
Runtime selftests + DB tests live require `npm install` + Postgres — local Claude
Code session executes after `git pull`.
