# `[[Bank_Receipts_Ingestion_LLD]]` — Wave 53/A · Unified Data Spine §1

> First LLD authored under `protocol_hive.md` §7 mandatory shape. Sandbox for ALL protocol mechanisms (cursor tuple, distributed lock, fuzzy dedup, validation circuit, async survival). ROI: immediate cash visibility + reconciliation against `Invoice Maven` outflows.

---

## § 1 — Obsidian node header

- **Node:** `[[Bank_Receipts_Ingestion_LLD]]`
- **Inbound:**
  - `[[Wave_53_Unified_Data_Spine]]` (parent)
  - `[[protocol_hive]]` §2 (Tiers), §3.1 (Cursor), §3.2 (Locks), §3.4 (Fuzzy dedup), §4.2 (Validation)
  - `[[Invoice_Maven]]` (the outflow side — receipts are the inflow counterpart)
  - `[[BEE_Operations_App_Schema]]` (38 Prisma models, target DB)
- **Outbound:**
  - `[[Cash_Flow_Snapshot]]` (downstream — already speced in phase-3)
  - `[[CRM_Receipt_Reconciliation]]` (downstream — matches receipts → customer invoices)
  - `[[Tender_Bid_Bond_Tracker]]` (specific use: tracking refundable deposits)
  - `[[Wave_45_Ingestion]]` (sibling — pattern reuse for Gmail/WhatsApp ingestion)

---

## § 2 — Cost / swarm / plugin allocation

### Per-step tier assignment

| Step | Tier | Engine | Justification |
|---|---|---|---|
| 1. Fetch raw transactions | **0** | Node `https.get` / Playwright / CSV reader | Pure I/O — no model needed |
| 2. Normalize columns (KW1) | **0** | Regex + locale-aware date parser | Deterministic — Hebrew/English column names |
| 3. Cursor filter `(value_date, tx_id) > (last, last)` | **0** | SQL in PG | Server-side, $0 |
| 4. Counterparty name cleanup (strip ה, של, מ, אצל...) | **0** | Bare regex per protocol §3.4 | NO model — these are deterministic stripping rules |
| 5. Hard-key dedup `(account_iban, external_tx_id)` | **0** | SQL `EXISTS` | $0 |
| 6. Fuzzy-key dedup `(amount, value_date ±1d, fuzzy(counterparty))` | **0** | Levenshtein > 85% via PG `pg_trgm` extension | Deterministic, no LLM |
| 7. Entity link (which `:Customer` is this counterparty?) | **1** | DeepSeek flash | ONLY when no fuzzy match and counterparty is ambiguous — escalation tier |
| 8. Tagging (rent / payroll / customer-payment / vendor) | **1** | DeepSeek flash | Bulk classification |
| 9. Anomaly flagging (unusual amount / new counterparty) | **1** | DeepSeek flash | Rule-based + light judgment |
| 10. ⚡ Daily summary to Barak | **3** | Claude Sonnet | One synthesis per day — quality matters |

**No Tier 4 (Opus) in this pipeline.** Architecture-time decisions are Tier 4; every running ingestion is ≤ Tier 1.

### Plugins / packages to install

```
# Node side (BEE app stack)
prisma                          # already there
@prisma/client                  # already there
ioredis                         # NEW — distributed lock provider (alt: pg row lock)
zod                             # schema validation (matches BEE app convention)
date-fns + date-fns-tz          # Asia/Jerusalem TZ math
openai (via DeepSeek base URL)  # already in graphify's [openai] extra path; reuse
node-fetch (built-in fetch 18+) # source A & C

# PostgreSQL side
pg_trgm extension               # CREATE EXTENSION IF NOT EXISTS pg_trgm — for fuzzy match

# OS side
ffmpeg                          # NOT needed here (audio-only requirement)
```

### Env vars / secrets required

Per protocol §3 — referenced by name, never value in this doc.

| Name | Source | Used for |
|---|---|---|
| `DATABASE_URL` | BEE app .env | Prisma client |
| `REDIS_URL` | `redis://localhost:6379` default | Distributed lock |
| `DEEPSEEK_API_KEY` | `E:\Desktop\OpenClawAgent\secrets\bee-integrations.env` | Tier-1 enrichment (steps 7-9) |
| `BANK_PROVIDERS_JSON` | secrets file | per-bank config (see § 3.5 below) |
| `BANK_RECEIPTS_HEARTBEAT_WEBHOOK` | optional | If unset, hard-fail ⚡s Barak self-chat via Alfred |

---

## § 3 — Core LLD + data flow

### 3.1 Source-mode adapters (3 plug-replaceable)

```
                           ┌─────────────────────────┐
                           │  TransactionSource       │  <-- interface
                           │  next(cursor) → batch    │
                           └──┬─────────┬─────────┬──┘
                              │         │         │
                  ┌───────────┘         │         └─────────────┐
                  ▼                     ▼                       ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
        │ CsvSource        │  │ ScrapeSource     │  │ OpenBankingSource    │
        │ (fallback, MVP)  │  │ Playwright login │  │ il-bank-mcp / direct │
        │ ~5 min/manual    │  │ + PSD2 fail-back │  │ PSD2 OAuth2 (BoI reg)│
        │ Mercantile/Discount/Hapoalim/Leumi   │  │ ~10 min/auto     │  │ ~5 min/auto-refresh  │
        └──────────────────┘  └──────────────────┘  └──────────────────────┘
                              fragility   ↑              cleanliness ↑
                              risk        ↑
```

**MVP path: CsvSource.** Manual export from each bank portal (every Sun / on demand) → drop in `E:\Desktop\OpenClawAgent\bank-imports\<bank>\YYYY-MM-DD.csv`. File watcher triggers ingest. Zero auth complexity, immediate value.

**Phase 2: OpenBankingSource.** Once a Bank-of-Israel-registered Open Banking aggregator is selected (candidates: Open Finance Israel, FinAPI, or direct bank API where available — Discount Group (incl. Mercantile) Open Banking endpoints — verify per-bank registration).

**Phase 3 (defer):** ScrapeSource as last-resort fallback. Fragile.

### 3.2 Schema diff (Prisma)

```prisma
// Add to BEE app's schema.prisma — diff only

model BankAccount {
  id              String   @id @default(cuid())
  iban            String   @unique
  bankCode        String   // 17=Mercantile (Discount subsidiary) 11=Discount 12=Hapoalim 10=Leumi 20=Mizrahi ...
  accountNumber   String
  alias           String?
  currency        String   @default("ILS")
  createdAt       DateTime @default(now())
  cursorTs        DateTime?  // last value_date seen
  cursorTxId      String?    // last external_tx_id at cursorTs
  transactions    BankTransaction[]
}

model BankTransaction {
  id                String   @id @default(cuid())
  accountId         String
  account           BankAccount @relation(fields: [accountId], references: [id])

  // Hard keys for idempotency (PROTOCOL §3.1)
  externalTxId      String                          // bank-issued unique id
  valueDate         DateTime                        // settlement date
  bookingDate       DateTime?                       // when bank booked it
  amountCents       BigInt                          // signed; positive = inflow
  currency          String   @default("ILS")
  counterpartyRaw   String                          // as it appeared
  counterpartyNorm  String                          // post-cleanup (PROTOCOL §3.4)
  memo              String?                         // reference / description

  // Enrichment (Tier 1)
  customerId        String?                         // linked :Customer if resolved
  invoiceMavenId    String?                         // matched Invoice Maven receipt
  category          String?                         // rent | payroll | customer-payment | vendor | other
  anomalyScore      Float?                          // 0-1, only set if flagged

  // Provenance + state
  sourceMode        String                          // "csv" | "scrape" | "openbanking"
  ingestedAt        DateTime @default(now())
  ingestRunId       String                          // group transactions per run for rollback
  validated         Boolean  @default(false)        // PROTOCOL §4.2 read-back result

  // PROTOCOL §3.1: deterministic dedup
  @@unique([accountId, externalTxId])
  // Speed up cursor query (PROTOCOL §3.1)
  @@index([accountId, valueDate, externalTxId])
  // Speed up reconciliation lookups
  @@index([counterpartyNorm])
  @@index([customerId])
}

model IngestRun {
  id              String   @id @default(cuid())
  pipeline        String   // "bank-receipts"
  sourceMode      String
  accountId       String?
  startedAt       DateTime @default(now())
  finishedAt      DateTime?
  status          String   // "running" | "ok" | "fail" | "partial"
  rowsRead        Int      @default(0)
  rowsInserted    Int      @default(0)
  rowsDedupedHard Int      @default(0)
  rowsDedupedFuzzy Int     @default(0)
  errorCode       String?
  errorMessage    String?
}

// Generic distributed-lock table (fallback when Redis unavailable; PROTOCOL §3.2)
model IngestionLock {
  key         String   @id   // e.g. "bank-receipts:account:<accountId>"
  holderPid   String                  // who holds it
  acquiredAt  DateTime @default(now())
  expiresAt   DateTime                // TTL — auto-expires for crash recovery
}
```

### 3.3 Mermaid — full data flow with all protocol gates

```mermaid
flowchart TD
  cron["Cron */15 min<br/>(or file watcher / webhook)"] -->|trigger| acquire
  acquire["Acquire distributed lock<br/><b>§3.2</b>: Redis SET NX EX 600s<br/>(or IngestionLock row, TTL=600s)"]
  acquire -->|locked → retry q| backoff["Backoff queue<br/>250→500→1s→2s→4s, cap 5<br/>then dead-letter"]
  acquire -->|acquired| openrun
  openrun["IngestRun.create status=running<br/>(rollback anchor)"]

  openrun --> cursor["Read BankAccount cursor:<br/>(cursorTs, cursorTxId)<br/><b>§3.1 cursor tuple</b>"]
  cursor --> fetch["TransactionSource.next:<br/>WHERE value_date >= cursorTs - 5min<br/>AND (value_date, ext_id) > (cursorTs, cursorTxId)"]
  fetch -->|batch[]| normalize["Tier 0: normalize<br/>- date/timezone (Asia/Jerusalem)<br/>- amount_cents<br/>- counterparty_norm = strip(ה,של,מ,אצל,ל)<br/>+ collapse ws + lowercase"]

  normalize --> hardkey{"<b>§3.4 Hard key dedup</b><br/>EXISTS (account_id, ext_tx_id)?"}
  hardkey -->|hit| skip1["count rowsDedupedHard++<br/>(drop, no LLM)"]
  hardkey -->|miss| fuzzy{"<b>§3.4 Fuzzy dedup</b><br/>pg_trgm > 0.85 on<br/>(amount, value_date ±1d, counterparty_norm)?"}
  fuzzy -->|hit| appendact["Append activity to existing :Customer<br/>(NEVER create duplicate entity)<br/>count rowsDedupedFuzzy++"]
  fuzzy -->|miss| t1["Tier 1 enrichment (DeepSeek flash)<br/>- customer link (if counterparty ambiguous)<br/>- category tag<br/>- anomaly score"]

  t1 --> tx["BEGIN TRANSACTION (Unit of Work)<br/><b>§3.2</b>"]
  tx --> insert["INSERT BankTransaction<br/>+ update BankAccount cursor<br/>+ IngestRun counters"]
  insert --> validate["<b>§4.2 Validation Circuit</b><br/>SELECT back the row<br/>verify schema (amount, account, ext_id)"]
  validate -->|fail| rollback["ROLLBACK<br/>+ err_manifest.append<br/>+ ⚡ Barak"]
  validate -->|ok| commit["COMMIT"]

  commit --> close["IngestRun.finish status=ok<br/>release lock"]
  rollback --> close

  close --> daily["Tier 3 daily synthesis (Sonnet)<br/>21:30 — yesterday's receipts ⚡ Barak<br/>(only IF rowsInserted > 0)"]

  skip1 --> close
  appendact --> commit
  backoff -->|exhausted| dead["Dead-letter row<br/>err_manifest.append<br/>⚡ Barak"]
```

### 3.4 Critical interfaces (TypeScript)

```typescript
// bank-receipts/types.ts

export interface RawTx {
  externalTxId: string;
  valueDate: Date;          // Asia/Jerusalem-aware
  bookingDate?: Date;
  amountCents: bigint;      // signed
  currency: string;         // ISO
  counterpartyRaw: string;
  memo?: string;
}

export interface Cursor {
  ts: Date;
  txId: string;
}

export interface TransactionSource {
  readonly mode: "csv" | "scrape" | "openbanking";
  next(account: BankAccount, cursor: Cursor): AsyncIterable<RawTx[]>;
}

export interface LockProvider {
  acquire(key: string, ttlSeconds: number): Promise<LockHandle | null>;
}
export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface Validator {
  /** PROTOCOL §4.2 — read back from DB after write, fail loudly on mismatch */
  verify(insertedIds: string[]): Promise<{ok: boolean; missing: string[]}>;
}
```

### 3.5 Per-bank config (referenced by name, value in secrets)

```jsonc
// BANK_PROVIDERS_JSON — secrets only, NEVER in repo
{
  "mercantile": {
    "mode": "csv",
    "watchDir": "E:\\Desktop\\OpenClawAgent\\bank-imports\\mercantile",
    "encoding": "utf-8",
    "columnMap": { "date": "תאריך ערך", "amount": "סכום", "memo": "תיאור", "ref": "אסמכתא" },
    "_note": "Barak's primary account. Verify column names from a real Mercantile portal export — names may be 'תאריך', 'חובה/זכות', 'פרטים', 'אסמכתא' depending on portal version."
  },
  "discount": { "mode": "csv", "watchDir": "...\\discount", "encoding": "utf-8", "columnMap": {} },
  "leumi":    { "mode": "csv", "watchDir": "...\\leumi",    "encoding": "utf-8", "columnMap": {} },
  "hapoalim": { "mode": "csv", "watchDir": "...\\hapoalim", "encoding": "windows-1255", "columnMap": {} }
}
```

---

## § 4 — Code + run + survive

### 4.1 Core ingest function (atomic, ~80 lines)

```typescript
// bank-receipts/ingest.ts
import { PrismaClient } from "@prisma/client";
import { acquireLock } from "./lock";
import { normalize, cleanCounterparty } from "./normalize";
import { verifyInserted } from "./validate";
import { logManifest, alertBarak } from "./survive";

const prisma = new PrismaClient();
const LOCK_TTL_S = 600;

export async function ingestAccount(accountId: string, source: TransactionSource) {
  const lockKey = `bank-receipts:account:${accountId}`;
  const lock = await acquireLock(lockKey, LOCK_TTL_S);
  if (!lock) { return { skipped: true, reason: "locked" }; }

  const run = await prisma.ingestRun.create({
    data: { pipeline: "bank-receipts", sourceMode: source.mode, accountId, status: "running" },
  });

  try {
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    const cursor = { ts: account.cursorTs ?? new Date(0), txId: account.cursorTxId ?? "" };

    let rowsRead = 0, hardDup = 0, fuzzyDup = 0, inserted: string[] = [];

    for await (const batch of source.next(account, cursor)) {
      rowsRead += batch.length;
      for (const raw of batch) {
        const norm = { ...raw, counterpartyNorm: cleanCounterparty(raw.counterpartyRaw) };

        // PROTOCOL §3.1 — strict tuple comparison (handles same-second collisions)
        if (norm.valueDate < cursor.ts ||
            (norm.valueDate.getTime() === cursor.ts.getTime() && norm.externalTxId <= cursor.txId)) continue;

        // PROTOCOL §3.4 — hard key
        const hard = await prisma.bankTransaction.findUnique({
          where: { accountId_externalTxId: { accountId, externalTxId: norm.externalTxId } },
        });
        if (hard) { hardDup++; continue; }

        // PROTOCOL §3.4 — fuzzy key (pg_trgm)
        const dayMs = 86_400_000;
        const fuzzy = await prisma.$queryRaw<{id: string}[]>`
          SELECT id FROM "BankTransaction"
          WHERE "accountId" = ${accountId}
            AND "amountCents" = ${norm.amountCents}
            AND "valueDate" BETWEEN ${new Date(+norm.valueDate - dayMs)} AND ${new Date(+norm.valueDate + dayMs)}
            AND similarity("counterpartyNorm", ${norm.counterpartyNorm}) > 0.85
          LIMIT 1`;
        if (fuzzy.length) { fuzzyDup++; continue; }

        // PROTOCOL §3.2 — atomic write inside transaction
        const result = await prisma.$transaction(async (tx) => {
          const created = await tx.bankTransaction.create({
            data: { accountId, ...norm, ingestRunId: run.id, sourceMode: source.mode },
          });
          await tx.bankAccount.update({
            where: { id: accountId },
            data: { cursorTs: norm.valueDate, cursorTxId: norm.externalTxId },
          });
          return created.id;
        });
        inserted.push(result);
      }
    }

    // PROTOCOL §4.2 — read-back validation
    const v = await verifyInserted(inserted);
    if (!v.ok) {
      await logManifest({ runId: run.id, missing: v.missing, kind: "validation_fail" });
      await alertBarak(`bank-receipts run ${run.id}: validation failed for ${v.missing.length} rows`);
      throw new Error("validation_circuit_failed");
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "ok",
              rowsRead, rowsInserted: inserted.length, rowsDedupedHard: hardDup, rowsDedupedFuzzy: fuzzyDup },
    });
    return { inserted: inserted.length, hardDup, fuzzyDup, rowsRead };

  } catch (e: any) {
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "fail", errorCode: e.code ?? "unknown", errorMessage: String(e).slice(0, 500) },
    });
    await logManifest({ runId: run.id, kind: "ingest_throw", error: String(e) });
    await alertBarak(`bank-receipts FAIL run ${run.id}: ${e.message}`);
    throw e;
  } finally {
    await lock.release();   // always — PROTOCOL §3.2 invariant
  }
}
```

### 4.2 Install + run scripts

```bash
# bank-receipts/install.sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm install ioredis zod date-fns date-fns-tz

# PG extension
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Schema diff
npx prisma migrate dev --name bank_receipts_v1

# Verify
node -e "
  require('@prisma/client');
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.bankAccount.count().then(c => { console.log('BankAccount table OK, count=' + c); process.exit(0); });
"
```

```powershell
# bank-receipts/run-once.ps1 — manual invocation
$env:DATABASE_URL = (Get-Content E:\Desktop\OpenClawAgent\secrets\bee-integrations.env |
                    Select-String "^DATABASE_URL=(.*)").Matches[0].Groups[1].Value
node bank-receipts/cli.js ingest --account mercantile-main
```

### 4.3 Self-test + healthcheck

```bash
# Syntax checks
node --check bank-receipts/ingest.ts || npx tsc --noEmit -p bank-receipts/
npx prisma validate
bash -n bank-receipts/install.sh

# Smoke test (uses a CSV fixture)
node bank-receipts/cli.js ingest --account TEST --dry-run
# Expected output:
#   rowsRead=3 inserted=0 hardDup=0 fuzzyDup=0  (dry-run never writes)

# Live healthcheck (read-only)
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const lastRun = await p.ingestRun.findFirst({
    where: { pipeline: 'bank-receipts' }, orderBy: { startedAt: 'desc' }
  });
  if (!lastRun) { console.log('NO_RUN_YET'); return; }
  const ageH = (Date.now() - lastRun.startedAt) / 3600_000;
  console.log(JSON.stringify({
    status: lastRun.status, ageHours: ageH.toFixed(1),
    rowsInserted: lastRun.rowsInserted, dedupes: lastRun.rowsDedupedHard + lastRun.rowsDedupedFuzzy
  }));
})();"
```

### 4.4 Error path — never silent

Every catchable failure:
1. `ingestRun.status = 'fail'` + structured `errorCode` + `errorMessage`
2. Append to `err_manifest.json` (per protocol §4.1) with `{kind, runId, ts, root_cause?, context}`
3. `alertBarak(text)` — sends to Alfred self-chat ⚡ (uses `dispatchSend()` from `alfred-inbound-watcher.js`)
4. `lock.release()` in `finally` — invariant; lock TTL is fail-safe (600s)
5. NO retry-storm in code — operator decides via run-once script; cron next cycle picks up where cursor stopped (idempotent)

---

## § 5 — Build phasing

| Phase | Hours | Deliverable | Gate |
|---|---|---|---|
| **A. Schema + lock + dry-run** | 6h | Prisma migration, Redis lock, CsvSource against fixture CSV, all syntax-checks green | Barak `npm test` shows 100% dry-run idempotency |
| **B. Mercantile CSV live** | 4h | Watch dir + first real ingest of last 30 days CSV from Mercantile (Barak's primary, code 17) | First ⚡ Barak with summary |
| **C. Validation circuit + err_manifest** | 3h | Read-back, alertBarak wiring | Inject fault — alert arrives |
| **D. Tier-1 enrichment** | 6h | DeepSeek classification + customer linking + anomaly | First daily summary at 21:30 |
| **E. Leumi + Discount adapters** | 4h | CSV format diff per bank | All 3 accounts ingesting |
| **F. OpenBanking adapter (defer)** | 12h | PSD2 OAuth + token refresh | Mercantile live |
| **G. Reconciliation against Invoice Maven** | 6h | Match receipts → invoices, flag mismatches | Reconciliation report ⚡ Barak |

**MVP = A + B + C = ~13h.** Phases D-G layer in once MVP is live.

---

## § 6 — What this LLD intentionally does NOT cover

- **CRM ingestion** (lead WhatsApp messages → :Lead) — sibling LLD, same protocol pattern, different source
- **n8n spine** — covered by a separate LLD; this pipeline doesn't need n8n (deterministic enough to live in pure Node)
- **Long-term storage of raw CSVs** — kept in `bank-imports/<bank>/archive/YYYY-MM/` for 24 months, GC cron
- **Foreign-currency accounts** — currency field exists, FX conversion to ILS deferred

---

*Authored 2026-06-13 by cloud cortex per `protocol_hive.md` §7. Burns when implemented: Obsidian node `[[Bank_Receipts_Ingestion_LLD]]`, Graphify re-extract bee-assets, this commit.*
