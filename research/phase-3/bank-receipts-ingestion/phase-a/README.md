# Phase A — bank-receipts ingestion (schema + lock + CsvSource + dry-run)

Reference implementation for the first 6h slice from [`../LLD.md`](../LLD.md) §5 Phase A.
**Standalone for testing.** Port `src/` into BEE app once green. Migration ships as both
`prisma/schema.prisma` (Prisma format) and `prisma/migrations/0001_bank_receipts/migration.sql`
(raw SQL — for non-Prisma callers or sanity diff).

## What's in here

```
phase-a/
├── README.md                                  ← this file
├── package.json                               ← deps + scripts (npm/pnpm/bun all fine)
├── tsconfig.json                              ← strict + ESNext + Node 22 native TS
├── prisma/
│   ├── schema.prisma                          ← 4 models: BankAccount/BankTransaction/IngestRun/IngestionLock
│   └── migrations/0001_bank_receipts/
│       └── migration.sql                      ← CREATE EXTENSION pg_trgm + 4 tables + indexes
├── src/
│   ├── types.ts                               ← interfaces from LLD §3.4 + cursorAdvances()
│   ├── normalize.ts                           ← cleanCounterparty (Hebrew prefix strip) + amount + date
│   ├── lock.ts                                ← Redis primary, IngestionLock-row fallback
│   ├── validate.ts                            ← PROTOCOL §4.2 read-back
│   ├── survive.ts                             ← err_manifest.jsonl + alertBarak shim
│   ├── ingest.ts                              ← atomic ingestAccount (all gates applied)
│   ├── cli.ts                                 ← ingest | selftest | normalize
│   └── sources/csv.ts                         ← CsvSource (RFC-4180-ish, BOM/windows-1255-safe)
└── tests/
    ├── fixture-hapoalim.csv                   ← 6 rows incl. 1 fuzzy-dup pair (rows 3+4)
    └── idempotency.test.ts                    ← 3 tests: idempotency · lock contention · dry-run
```

## Quick start (standalone)

```bash
# 1. Install deps
npm install

# 2. Self-test pure functions (no DB needed) — use tsx because Node's native
#    --experimental-strip-types doesn't rewrite '.js' imports to '.ts' source files
npx tsx src/cli.ts selftest
# OR build first, then run compiled output:
#   npm run build && node dist/cli.js selftest

# 3. Provision a test PostgreSQL (or use a throwaway docker)
docker run -d --name bee-test-pg -p 5432:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bee_phase_a_test \
  postgres:16

# 4. Apply migration
export DATABASE_URL="postgresql://test:test@127.0.0.1:5432/bee_phase_a_test"
npx prisma migrate deploy

# 5. Dry-run against the fixture (no writes, idempotent)
npx tsx src/cli.ts ingest --account TEST --source tests/fixture-hapoalim.csv --dry-run

# 6. Idempotency test (requires DB)
export TEST_DATABASE_URL="$DATABASE_URL"
npx tsx --test tests/idempotency.test.ts
```

> **Cloud-session verification status (2026-06-14):** all 9 TypeScript files
> pass `node --check --experimental-strip-types` AST parse. SQL migration
> parens balanced (28/28). JSON configs valid. Runtime selftests live require
> `npm install` (Prisma + date-fns + ioredis) which the local Claude Code
> session executes after `git pull`.

Expected `selftest` output:
```
  PASS cleanCounterparty: Hebrew prefixes stripped
  PASS parseAmountCents: signed + thousands + suffix-minus
  PASS parseIsraeliDate: DD/MM/YYYY

selftest: pass=3 fail=0
```

Expected `npm test` summary (3 tests):
```
✔ idempotency — second run inserts 0, hard-dedups all 5
✔ lock contention — second invocation skips when first holds lock
✔ dry-run never writes
```

## Port-into-BEE-app checklist

1. Copy `prisma/schema.prisma` model blocks into BEE app's `schema.prisma`. Run `npx prisma migrate dev --name bank_receipts_v1` in BEE app.
2. Copy `src/` into `bee-ops/src/bank-receipts/`. Adjust the Prisma import to BEE app's existing client singleton.
3. Replace `src/survive.ts` `alertBarak` shim — import `dispatchSend()` from `alfred-inbound-watcher.js` directly. Constitutional law #1 (4 destinations) is enforced inside dispatchSend; don't reimplement here.
4. Wire a cron entry into OpenClaw — every 15 min: `cd E:\Desktop\OpenClawAgent && node bee-receipts-tick.js`. Tick script just calls `ingestAccount` for every active `BankAccount` row.
5. Per-bank `CsvSource` config goes into `BANK_PROVIDERS_JSON` env var (referenced in `bee-integrations.env`).

## Gates covered (per LLD.md §3, protocol_hive.md §3)

| Gate | Where |
|---|---|
| Cursor tuple `(updated_at, id)` strict ordering | `types.ts::cursorAdvances` + `ingest.ts` filter |
| 5-min lookback for clock skew | CsvSource file filter + ingest cursor comparison |
| Distributed lock (Redis primary, PG row fallback) | `lock.ts` factory |
| Hard-key dedup `(accountId, externalTxId)` | `ingest.ts` + schema `@@unique` |
| Fuzzy dedup pg_trgm > 0.85 on (amount, ±1d, counterparty) | `ingest.ts` raw SQL |
| Hebrew connective stripping before fuzzy | `normalize.ts::cleanCounterparty` |
| Atomic write transaction (UoW) | `prisma.$transaction` in `ingest.ts` |
| Read-back validation circuit | `validate.ts::makeValidator` |
| err_manifest + ⚡ Barak on hard fail | `survive.ts::logManifest + alertBarak` |
| Lock release in `finally` | `ingest.ts` |
| Lock TTL fail-safe (600s self-expiry) | `lock.ts` Redis EX / IngestionLock.expiresAt |

## Out of scope (later phases)

- D: Tier-1 enrichment (DeepSeek customer-link + category + anomaly)
- D: 21:30 daily summary ⚡ to Barak
- E: Leumi + Discount adapters
- F: OpenBanking PSD2 OAuth adapter
- G: Reconciliation against Invoice Maven

## Burns on this commit

- Obsidian node: `[[Bank_Receipts_Ingestion_LLD]]` — Phase A reference impl shipped
- Graphify: next `git pull && graphify extract . --update --backend=deepseek` picks up these files
- protocol_hive.md: still §6 NEXT — bump to "in progress" when first BEE-app port lands
