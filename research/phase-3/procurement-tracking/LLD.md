# `[[Procurement_Tracking_LLD]]` — Wave 53/B · Unified Data Spine §2

> Second LLD authored under `protocol_hive.md` §7. The burning gap identified in `barak-skills-audit.md` §A2: supplier tracking is 100% verbal today. This LLD turns it into a structured stream that mirrors bank-receipts' shape (idempotent, locked, validated) and snaps into the same Unified Data Spine.

---

## § 1 — Obsidian node header

- **Node:** `[[Procurement_Tracking_LLD]]`
- **Inbound:**
  - `[[Wave_53_Unified_Data_Spine]]` (parent)
  - `[[protocol_hive]]` §2 (Tiers), §3.1 (Cursor), §3.2 (Locks), §3.4 (Fuzzy dedup), §4.2 (Validation), §3.6a (don't guess operator facts)
  - `[[Bank_Receipts_Ingestion_LLD]]` (sibling — bank outflows reconcile against POs created here)
  - `[[Barak_Skills_Audit]]` §A2 — "supplier tracking 100% verbal" is the gap this closes
  - `[[Invoice_Maven]]` (supplier *invoices* go through here on their way to bank reconciliation)
- **Outbound:**
  - `[[Engineering_Agent_LLD]]` `bom_generator` — pulls live supplier prices from this stream
  - `[[Proposal_Generator_LLD]]` — quotes pull current BOM costs from here
  - `[[Cash_Flow_Snapshot]]` — payables/AP aging feeds this
  - `[[Tender_Bid_Bond_Tracker]]` — refundable supplier deposits tracked here
  - `[[Supplier_Health_Digest]]` (weekly ⚡ Barak — see §3.6)

---

## § 2 — Cost / swarm / plugin allocation

### Per-step tier assignment

| Step | Tier | Engine | Justification |
|---|---|---|---|
| 1. Ingest source streams (Gmail/WA/manual upload/Tracer/BEE-app) | **0** | Node I/O · existing Alfred watchers | Plumbing |
| 2. Cursor filter per stream `(updated_at, src_id)` | **0** | SQL | §3.1 deterministic |
| 3. Normalize supplier name (strip Hebrew connectives, suffix words "בע"מ", "ושות'") | **0** | Regex extending `normalize.ts::cleanCounterparty` | Deterministic |
| 4. Hard-key dedup `(source, externalRefId)` | **0** | SQL `EXISTS` | §3.4 |
| 5. Fuzzy match against `:Supplier` registry | **0** | pg_trgm > 0.85 on `nameNorm` | Deterministic |
| 6. Hard match against open POs (vendor + amount ±5% + date ±30d) | **0** | SQL | Deterministic |
| 7. Extract PO structure from unstructured email/WA | **1** | DeepSeek flash + Zod schema | LLM ONLY when structured parsers (CSV/EDI/PDF tables) fail |
| 8. Classify spend category (PV-modules / inverters / cables / labor / רכב / משרד / other) | **1** | DeepSeek flash | Bulk classification |
| 9. Price anomaly flag (this PO price vs `PriceBenchmark` rolling avg ± 2σ) | **0** | SQL z-score | No LLM — pure stats |
| 10. New-supplier detection (no fuzzy match against any existing :Supplier) | **0** | SQL count | Flag for Barak's review |
| 11. Lead-time learning (PO created → goods received delta, per supplier) | **0** | SQL aggregation | Updates `Supplier.avgLeadTimeDays` rolling |
| 12. Weekly supplier health digest ⚡ Barak (Sunday evening) | **3** | Claude Sonnet | One synthesis/week — quality > cost |
| 13. Stockout prediction (for tracked parts) | **2** | DeepSeek pro | Reasoning over usage history + open jobs (optional, defer to phase D) |

**No Tier 4.** Architecture-time only.

### Plugins / packages

```
# Same as bank-receipts — reuse the lock/normalize/validate libs
prisma, @prisma/client, ioredis, zod, date-fns, date-fns-tz, openai (DeepSeek)

# NEW for procurement
pdf-parse              # supplier invoice PDFs (KStar, Prime Energy etc. send PDF)
mailparser             # IMAP raw MIME -> structured msg (Gmail OAuth still primary)
@whiskeysockets/baileys # already in Alfred — reuse for WhatsApp ingest from supplier groups

# PostgreSQL
pg_trgm                # already enabled in Wave 53/A migration — reused
```

### Env / secrets (referenced by name, never value)

| Name | Source | Used for |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL`, `DEEPSEEK_API_KEY` | shared with Wave 53/A | reused |
| `GMAIL_OAUTH_*` | `secrets/bee-integrations.env` | supplier emails |
| `WA_BAILEYS_SESSION` | Alfred's existing session | supplier WhatsApp groups |
| `PROCUREMENT_SOURCE_MAP_JSON` | secrets | per-supplier source config (which inbox / WA JIDs / portal CSV dirs) |

---

## § 3 — Core LLD + data flow

### 3.1 Source-mode adapters (4 plug-replaceable, same shape as bank-receipts)

```
                              ┌────────────────────────────┐
                              │  ProcurementEventSource     │ <-- interface
                              │  next(cursor) → batch       │
                              └──┬──────┬───────┬─────┬─────┘
                                 │      │       │     │
                  ┌──────────────┘      │       │     └───────────────┐
                  ▼                     ▼       ▼                     ▼
        ┌──────────────────┐  ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐
        │ EmailSource      │  │ WaSource     │ │ ManualUpload   │ │ BeeAppSource     │
        │ Gmail OAuth IMAP │  │ Baileys feed │ │ Drop PDFs/CSVs │ │ BEE-app POs (if  │
        │ — supplier emails│  │ — supplier   │ │ in watch dir   │ │ Barak creates    │
        │ Prime / KStar /  │  │ groups       │ │                │ │ POs in the SaaS) │
        │ ABB / Deye etc.  │  │              │ │                │ │                  │
        └──────────────────┘  └──────────────┘ └────────────────┘ └──────────────────┘
```

**MVP path: EmailSource + ManualUpload.** Real supplier traffic in 2026 is overwhelmingly email-based (POs, invoices, shipping notices) plus the WhatsApp group with Prime Energy that Alfred already captures. WaSource extends `alfred-inbound-watcher.js` (don't rebuild). BeeAppSource = future once POs originate in the SaaS.

### 3.2 Schema diff (Prisma) — extends Wave 53/A models

```prisma
// Add to BEE app's schema.prisma — diff only.
// Reuses BankAccount + BankTransaction from Wave 53/A — every supplier
// PAYMENT is a BankTransaction that links back to a SupplierInvoice.

model Supplier {
  id              String   @id @default(cuid())
  nameRaw         String                                       // first observed name
  nameNorm        String   @unique                             // post-cleanup (§3.4)
  taxId           String?                                      // ח.פ / ע.מ — IL business id
  contactEmail    String?
  contactPhone    String?
  waGroupJid      String?                                      // if there's a dedicated WA group
  paymentTermsDays Int     @default(30)                        // net-N
  avgLeadTimeDays  Float?                                      // rolling, updated by step 11
  category        String?                                      // 'pv-modules' | 'inverters' | 'cables' | 'labor' | ...
  status          String   @default("active")                  // active | inactive | watchlist
  notes           String?                                      // free-form
  createdAt       DateTime @default(now())

  purchaseOrders  PurchaseOrder[]
  invoices        SupplierInvoice[]

  @@index([category])
  @@index([status])
}

model PurchaseOrder {
  id              String   @id @default(cuid())
  poNumber        String?                                      // supplier-issued PO/order number if any
  supplierId      String
  supplier        Supplier @relation(fields: [supplierId], references: [id])

  // Hard-key idempotency
  source          String                                       // 'email' | 'wa' | 'manual' | 'bee-app'
  sourceRefId     String                                       // gmail msg id / wa msg id / file hash / bee-app po id

  orderedAt       DateTime
  expectedAt      DateTime?
  receivedAt      DateTime?                                    // set when goods arrive
  totalCents      BigInt
  currency        String   @default("ILS")
  status          String                                       // 'open' | 'partial' | 'received' | 'paid' | 'cancelled'

  // Linkage
  invoiceId       String?                                      // SupplierInvoice this PO was billed under
  jobId           String?                                      // BEE app Job this PO supports (if known)

  rawText         String   @db.Text                            // full extracted text — for audit + re-extraction
  ingestRunId     String
  ingestedAt      DateTime @default(now())
  validated       Boolean  @default(false)

  lines           PurchaseOrderLine[]

  @@unique([source, sourceRefId])
  @@index([supplierId, orderedAt(sort: Desc)])
  @@index([status])
  @@index([expectedAt])
}

model PurchaseOrderLine {
  id              String   @id @default(cuid())
  poId            String
  po              PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
  sku             String?
  description     String                                       // raw item description
  descriptionNorm String                                       // for grouping / benchmarking
  qty             Decimal  @db.Decimal(10, 3)
  unit            String                                       // 'pcs' | 'm' | 'kg'
  unitPriceCents  BigInt
  lineTotalCents  BigInt

  @@index([descriptionNorm])
}

model SupplierInvoice {
  id              String   @id @default(cuid())
  supplierId      String
  supplier        Supplier @relation(fields: [supplierId], references: [id])

  invoiceNumber   String                                       // supplier-issued invoice #
  shaamAllocationNumber String?                                // מספר הקצאה — pulled when threshold-relevant (per KB)
  issuedAt        DateTime
  dueAt           DateTime
  totalCents      BigInt
  currency        String   @default("ILS")
  status          String                                       // 'open' | 'paid' | 'partial' | 'disputed'

  // Linkage
  poIds           String[]                                     // can cover multiple POs
  bankTxId        String?                                      // FK to BankTransaction (Wave 53/A) when paid

  source          String
  sourceRefId     String
  ingestedAt      DateTime @default(now())

  @@unique([supplierId, invoiceNumber])
  @@index([status, dueAt])
}

model PriceBenchmark {
  id              String   @id @default(cuid())
  descriptionNorm String                                       // matches PurchaseOrderLine.descriptionNorm
  category        String
  unit            String
  windowStart     DateTime
  windowEnd       DateTime
  count           Int                                          // sample size
  avgUnitPriceCents BigInt
  stdDevCents     BigInt

  @@unique([descriptionNorm, windowStart])
  @@index([category])
}

model LeadTimeRecord {
  id              String   @id @default(cuid())
  supplierId      String
  poId            String   @unique
  orderedAt       DateTime
  receivedAt      DateTime
  leadDays        Float

  @@index([supplierId, orderedAt(sort: Desc)])
}
```

### 3.3 Mermaid — full data flow with all protocol gates

```mermaid
flowchart TD
  email[Gmail OAuth IMAP — supplier inboxes]
  wa[Alfred inbound-watcher — supplier WA groups]
  manual[Drop PDFs/CSVs in watch dir]
  cron[Cron */15 — orchestrator tick]

  cron --> lock["Acquire lock<br/>(§3.2) Redis SET NX EX 600s<br/>key='procurement:source:<name>'"]
  email --> ingest
  wa --> ingest
  manual --> ingest

  lock -->|locked| backoff[Retry queue · 250→500→1s→2s→4s · DLQ]
  lock -->|acquired| openrun[IngestRun status=running]

  openrun --> cursor[Read source cursor<br/>§3.1 tuple]
  cursor --> fetch[Fetch new events since cursor<br/>5min lookback overlap]
  fetch -->|batch[]| ingest

  ingest --> normsup[Tier 0: normalize supplier name<br/>strip ה/של/מ/אצל + 'בע''מ' + 'ושות'']
  normsup --> hardkey{§3.4 Hard-key<br/>EXISTS source,sourceRefId?}
  hardkey -->|hit| skip[rowsDedupedHard++]
  hardkey -->|miss| fuzzysup{§3.4 Fuzzy match<br/>pg_trgm > 0.85 on nameNorm?}

  fuzzysup -->|hit| linksup[Link to existing :Supplier<br/>append observed nameRaw if new]
  fuzzysup -->|miss| newsup[⚡ ALERT Barak:<br/>'New supplier seen: X — confirm?'<br/>create draft :Supplier in 'watchlist']

  linksup --> classify[Tier 1: classify event<br/>PO / Invoice / Shipping notice / Price quote / Other]
  newsup --> classify

  classify -->|PO| extract_po[Tier 1: extract PO structure<br/>orderedAt, lines, expectedAt, total]
  classify -->|Invoice| extract_inv[Tier 1: extract invoice<br/>+ SHAAM number if present per KB]
  classify -->|Other| skip2[skip — keep in rawText for audit]

  extract_po --> matchopen{Match against open POs<br/>vendor + amount ±5% + date ±30d}
  matchopen -->|hit| append[Append to existing PO<br/>update lines/total]
  matchopen -->|miss| newpo[Insert new :PurchaseOrder]

  extract_inv --> matchpo[Match invoice → :PurchaseOrder<br/>by total + supplier + date]
  matchpo --> insertinv[Insert :SupplierInvoice]

  newpo --> bench[Tier 0: PriceBenchmark check<br/>z-score per line vs rolling avg]
  append --> bench
  bench -->|>2σ| anomaly[⚡ ALERT Barak: price anomaly]
  bench -->|ok| commit

  insertinv --> shaamcheck{Above SHAAM threshold?<br/>per knowledge-base/il-einvoicing-shaam.md}
  shaamcheck -->|yes, no allocation #| flag[⚡ ALERT Barak:<br/>'Supplier invoice missing מספר הקצאה — VAT deduction at risk']
  shaamcheck -->|ok| commit

  commit[BEGIN TX § 3.2<br/>insert + update cursor + counters]
  commit --> validate["§4.2 Validation Circuit<br/>SELECT back ids, verify schema"]
  validate -->|fail| rollback[ROLLBACK + err_manifest + ⚡⚡]
  validate -->|ok| done["IngestRun status=ok<br/>release lock in finally"]

  done --> recon[Wave 53/A: match :SupplierInvoice ↔ BankTransaction<br/>by supplier + amount + date]
  done --> leadtime[On status='received': insert :LeadTimeRecord<br/>update Supplier.avgLeadTimeDays rolling]

  weekly[Cron Sun 19:00] --> digest["Tier 3: weekly supplier health digest<br/>Sonnet synthesis · ⚡ Barak"]
```

### 3.4 Critical interfaces (TypeScript)

```typescript
// procurement/types.ts

export type ProcurementSource = "email" | "wa" | "manual" | "bee-app";
export type ProcurementEventKind = "po" | "invoice" | "shipping" | "quote" | "other";

export interface RawProcurementEvent {
  source: ProcurementSource;
  sourceRefId: string;                  // gmail msg id / wa msg id / file sha256 / bee-app po id
  observedAt: Date;
  supplierHint: string;                 // best-guess from sender / subject / WA chat name
  text: string;                         // full text — markdown if rich, plain otherwise
  attachments?: { name: string; sha256: string; mimeType: string }[];
}

export interface ExtractedPO {
  poNumber?: string;
  orderedAt: Date;
  expectedAt?: Date;
  totalCents: bigint;
  currency: string;
  lines: ExtractedPOLine[];
}
export interface ExtractedPOLine {
  sku?: string;
  description: string;
  qty: number;
  unit: string;
  unitPriceCents: bigint;
}

export interface ExtractedInvoice {
  invoiceNumber: string;
  shaamAllocationNumber?: string;
  issuedAt: Date;
  dueAt: Date;
  totalCents: bigint;
  currency: string;
  linkedPoHints?: string[];             // PO numbers mentioned in invoice
}

export interface ProcurementEventSource {
  readonly mode: ProcurementSource;
  next(cursor: Cursor): AsyncIterable<RawProcurementEvent[]>;
}
```

### 3.5 New-supplier flow (the policy gate)

Per `protocol_hive §3.6a` (don't invent operator facts): **any new supplier the system has never seen MUST be confirmed by Barak before going to `active` status.** Workflow:

1. Step 5 in the flow misses fuzzy match → create `:Supplier` in `watchlist` (not `active`)
2. ⚡ Barak in his self-chat: `"New supplier seen on <date>: 'NameRaw' — first seen via <source> from <hint>. Approve? [y / merge with existing / ignore]"`
3. Until approved: subsequent events from same nameNorm pile up under the watchlist supplier; nothing escalates anywhere.
4. On approval: status → `active`, all queued events re-processed.
5. On merge: nameNorm aliased to an existing Supplier; events re-keyed.
6. On ignore: status → `inactive`, future events from this name are dropped at fuzzy step.

This is the same shape as Alfred's drafts gate (constitutional law #2: human picks).

### 3.6 Weekly supplier health digest (Tier 3 — the one synthesis Barak actually reads)

Cron Sunday 19:00. Generates one ⚡ to Barak, structured:

```
🐝 *Supplier health · week of YYYY-MM-DD*

🟢 *Healthy*
  Prime Energy   · 4 POs · avg lead 6.2d (target ≤7) · ₪48,200 paid · 0 anomalies
  KStar IL       · 2 POs · avg lead 9.1d (was 7.4 — slowing!) · ₪12,400 paid

🟡 *Attention*
  Deye distrib   · PO #DY-2026-0418 expected 6/8, still open (8 days overdue)
  ABB SACE       · invoice #ABB-26-9912 due in 3 days, ₪7,500, no מספר הקצאה — VAT risk

🔴 *Action needed*
  NEW SUPPLIER · 'אלקטרו-טק חיפה' first seen Tue from Gmail invoice attachment.
                Approve? merge? ignore? Reply with: /supplier approve <id>

📊 *Spend by category (this week)*
  PV modules: ₪31,200 · Inverters: ₪14,800 · Cables: ₪3,400 · Labor: ₪9,200

📈 *Price anomalies*
  Cable 6mm² black — supplier "חשמל פלוס" — ₪4.20/m vs 30d avg ₪3.65 (+15%, p99)
```

---

## § 4 — Code + run + survive

### 4.1 Core ingest (atomic — same shape as bank-receipts)

```typescript
// procurement/ingest.ts
import { PrismaClient } from "@prisma/client";
import { acquireLock } from "../bank-receipts/lock.js";              // REUSED
import { cleanCounterparty } from "../bank-receipts/normalize.js";   // REUSED
import { alertBarak, logManifest } from "../bank-receipts/survive.js"; // REUSED
import { extractWithDeepSeek } from "./extract.js";                  // NEW
import { matchOrCreateSupplier } from "./suppliers.js";              // NEW
import { applyBenchmarkAndAnomaly } from "./benchmark.js";           // NEW

const LOCK_TTL_S = 600;
const FUZZY = 0.85;

export async function ingestProcurement(prisma: PrismaClient, opts: { sourceName: string; source: ProcurementEventSource; dryRun?: boolean }) {
  const lockKey = `procurement:source:${opts.sourceName}`;
  const lock = await acquireLock(prisma, lockKey, LOCK_TTL_S);
  if (!lock) return { skipped: { reason: "lock_held_elsewhere" } };

  const run = await prisma.ingestRun.create({
    data: { pipeline: "procurement", sourceMode: opts.source.mode, status: "running" },
  });

  const stats = { rowsRead: 0, hardDup: 0, fuzzyDup: 0, newSuppliers: 0, anomalies: 0, insertedIds: [] as string[] };

  try {
    const cursor = await readCursor(prisma, opts.sourceName);

    for await (const batch of opts.source.next(cursor)) {
      stats.rowsRead += batch.length;

      for (const raw of batch) {
        // §3.4 hard-key
        const exists = await prisma.purchaseOrder.findUnique({
          where: { source_sourceRefId: { source: raw.source, sourceRefId: raw.sourceRefId } },
        });
        if (exists) { stats.hardDup++; continue; }

        // §3.4 fuzzy supplier resolution
        const supplier = await matchOrCreateSupplier(prisma, raw.supplierHint, { fuzzy: FUZZY });
        if (supplier.justCreated) {
          stats.newSuppliers++;
          await alertBarak(`New supplier seen: '${supplier.nameRaw}' via ${raw.source}. Approve? /supplier approve ${supplier.id}`);
        }

        // Tier 1: classify + extract — only if a structured parser fails
        const extracted = await extractWithDeepSeek(raw);  // returns { kind, po?, invoice? }

        if (opts.dryRun) continue;

        // §3.2 atomic Unit-of-Work
        const id = await prisma.$transaction(async (tx) => {
          if (extracted.kind === "po") {
            const po = await tx.purchaseOrder.create({
              data: {
                supplierId: supplier.id, source: raw.source, sourceRefId: raw.sourceRefId,
                orderedAt: extracted.po!.orderedAt,
                expectedAt: extracted.po!.expectedAt,
                totalCents: extracted.po!.totalCents,
                currency: extracted.po!.currency,
                status: "open",
                rawText: raw.text, ingestRunId: run.id,
                lines: { create: extracted.po!.lines.map((l) => ({
                  description: l.description,
                  descriptionNorm: cleanCounterparty(l.description),
                  qty: l.qty, unit: l.unit,
                  unitPriceCents: l.unitPriceCents,
                  lineTotalCents: BigInt(Math.round(Number(l.unitPriceCents) * l.qty)),
                })) },
              },
              select: { id: true, lines: { select: { id: true, descriptionNorm: true, unitPriceCents: true } } },
            });
            // Tier-0 anomaly check
            const anomalies = await applyBenchmarkAndAnomaly(tx, po.lines);
            if (anomalies.length > 0) {
              stats.anomalies += anomalies.length;
              for (const a of anomalies) {
                await alertBarak(`Price anomaly: '${a.descriptionNorm}' = ₪${a.priceShekel}/${a.unit} vs 30d avg ₪${a.avgShekel} (+${a.deltaPct}%)`);
              }
            }
            return po.id;
          } else if (extracted.kind === "invoice") {
            const inv = await tx.supplierInvoice.create({
              data: { /* … similar — omitted for brevity, full in repo */ } as any,
              select: { id: true },
            });
            return inv.id;
          }
          return null;
        });
        if (id) stats.insertedIds.push(id);
        await advanceCursor(prisma, opts.sourceName, raw);
      }
    }

    // §4.2 read-back validation
    if (!opts.dryRun && stats.insertedIds.length > 0) {
      const v = await verifyInserted(prisma, stats.insertedIds);
      if (!v.ok) {
        await logManifest({ kind: "validation_fail", runId: run.id, stream: "procurement", context: { missing: v.missing } });
        await alertBarak(`procurement run ${run.id}: validation failed for ${v.missing.length} rows`, { urgent: true });
        throw new Error("validation_circuit_failed");
      }
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "ok", rowsRead: stats.rowsRead, rowsInserted: stats.insertedIds.length, rowsDedupedHard: stats.hardDup, rowsDedupedFuzzy: stats.fuzzyDup },
    });
    return { runId: run.id, ...stats };

  } catch (e: any) {
    await prisma.ingestRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status: "fail", errorCode: e.code ?? "unknown", errorMessage: String(e).slice(0, 500) } });
    await logManifest({ kind: "ingest_throw", runId: run.id, stream: "procurement", root_cause: e.message ?? String(e) });
    await alertBarak(`procurement FAIL run ${run.id}: ${e.message ?? String(e)}`, { urgent: true });
    throw e;
  } finally {
    await lock.release().catch(() => undefined);
  }
}
```

### 4.2 Install + healthcheck

```bash
# procurement/install.sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm install pdf-parse mailparser   # Wave-53/A deps already installed
npx prisma migrate dev --name procurement_v1
node -e "require('@prisma/client'); const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.supplier.count().then(c => { console.log('Supplier table OK, count=' + c); process.exit(0); });"
```

```typescript
// procurement/cli.ts — selftest exposes pure normalizers without DB
// Same shape as bank-receipts/cli.ts — Prisma lazy-loaded
```

```typescript
// healthcheck.ts — read-only DB probe
const lastRun = await p.ingestRun.findFirst({ where: { pipeline: "procurement" }, orderBy: { startedAt: "desc" } });
const watchlistCount = await p.supplier.count({ where: { status: "watchlist" } });
console.log(JSON.stringify({
  lastRun: { status: lastRun?.status, ageH: ((Date.now() - lastRun!.startedAt.getTime())/3600_000).toFixed(1) },
  watchlistSuppliers: watchlistCount,
}));
```

### 4.3 Error path (PROTOCOL §4.4)

Every failure path:
1. `IngestRun.status='fail'` + `errorCode` + `errorMessage`
2. `err_manifest.jsonl` append (root cause + context)
3. `alertBarak(text, { urgent })` — to self-chat ⚡, never to a supplier
4. `lock.release()` in `finally` — invariant
5. NO auto-retry storm. Operator decides via `cli.ts ingest --source <name> --since <ts>`. Cron next cycle continues from cursor.

---

## § 5 — Build phasing

| Phase | Hours | Deliverable | Gate |
|---|---|---|---|
| **A. Schema + lock-reuse + ManualUpload + dry-run** | 5h | Prisma migration extending Wave 53/A, file-watch CsvSource analog for PDFs/CSVs in `procurement-imports/`, all syntax checks green | Dry-run on fixture PDF/CSV → ExtractedPO shape correct |
| **B. EmailSource live (Gmail OAuth)** | 5h | Pull last 30d supplier emails (filter by domain whitelist), extract POs/invoices, dry-run first | First real PO ingested + ⚡ Barak with summary |
| **C. Validation + new-supplier alert + ⚡ wiring** | 3h | §4.2 read-back, §3.5 watchlist flow live | Inject unknown supplier → ⚡ arrives, status='watchlist' |
| **D. PriceBenchmark + anomaly + LeadTime** | 4h | Tier-0 stats + alerts | Inject price 30% above avg → anomaly alert |
| **E. WaSource hookup (extend alfred-inbound-watcher)** | 4h | Supplier WA groups feed in via existing Alfred listener | Prime Energy WA group ingests |
| **F. Weekly supplier health digest (Tier 3)** | 4h | Sonnet synthesis cron, Hebrew RTL ⚡ | Sunday 19:00 ⚡ arrives |
| **G. Bank reconciliation (Wave 53/A ↔ B link)** | 3h | Match `:SupplierInvoice` ↔ `BankTransaction` by amount+supplier+date | Run shows ≥80% of supplier payments auto-linked |
| **H. BeeAppSource (defer)** | 6h | POs originated in BEE SaaS feed in via API | Once BEE app exposes /api/purchase-orders |

**MVP = A + B + C = ~13h** (mirror Wave 53/A). Phases D-H layer on.

---

## § 6 — Coupling with `[[Bank_Receipts_Ingestion_LLD]]`

| Wave 53/A (bank) | ↔ | Wave 53/B (procurement) |
|---|---|---|
| `BankTransaction` (outflow) | matched against | `SupplierInvoice` (open, by supplier + amount + date ±5d) |
| `BankAccount.cursor*` pattern | reused for | `IngestRun.cursor*` per procurement source |
| `acquireLock` from `lock.ts` | reused | identical pattern |
| `cleanCounterparty` from `normalize.ts` | extended to | `cleanSupplierName` (adds "בע"מ", "ושות'", "(2007)" suffix stripping) |
| `alertBarak`, `logManifest` from `survive.ts` | reused | identical |
| `pg_trgm` extension | reused | identical for supplier name fuzzy |

**The two pipelines are siblings, not separate systems.** When `BankTransaction` posts and there's an open `SupplierInvoice` that matches, the link fires automatically (Phase G).

---

## § 7 — Out of scope (intentional)

- **Customer-side AR.** Mirror Wave 53/A handles inbound payments; that's not procurement.
- **Inventory / stock levels.** Optional Phase D+ via `StockItem` model. Most BEE installs are project-based (parts ordered per job, not stocked), so this is genuinely lower priority. Open question: confirm with Barak.
- **Subcontractor labor invoices.** Treated as a supplier category for now; if Barak wants split tracking (hours vs materials), separate LLD.
- **Multi-currency.** `currency` field exists; FX → ILS deferred.

---

*Authored 2026-06-15 by cloud cortex per `protocol_hive.md` §7. Burns when implemented: Obsidian `[[Procurement_Tracking_LLD]]`, graphify re-extract, this commit.*
