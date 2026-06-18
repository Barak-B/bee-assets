# `[[Accounting_Ledger_LLD]]` — Wave 53/D · Unified Data Spine §4 (accounting view)

> Fourth LLD under `protocol_hive.md §7`. The viewing/aggregation layer that sits **above** Wave 53/A (bank), 53/B (procurement), 53/C (proposals→invoices) and presents them as Israeli-standard **כרטסות** (ledger cards), AR/AP aging, periodic reports (VAT/מקדמות), job profitability, and cash-flow forecast.
>
> **Why this exists:** Barak handles finance with his רו"ח (audit Q3). The רו"ח works with **כרטסות**, not Prisma JSON. Without this layer, the spine is data without a financial view. With it, both Barak and the רו"ח see the same picture — and ⚡ alerts can fire on AR aging, cash gaps, missing SHAAM compliance, etc.

---

## § 1 — Obsidian node header

- **Node:** `[[Accounting_Ledger_LLD]]`
- **Inbound:**
  - `[[Wave_53_Unified_Data_Spine]]` (parent — aggregation layer)
  - `[[protocol_hive]]` §2 (Tiers), §4.2 (Validation = reconciliation), §3.6a (no inventing numbers)
  - `[[Bank_Receipts_Ingestion_LLD]]` — every `BankTransaction` posts one ledger entry
  - `[[Procurement_Tracking_LLD]]` — every `SupplierInvoice` posts one ledger entry
  - `[[Proposal_Generator_LLD]]` — when `Proposal.status='accepted'` → `CustomerInvoice` → ledger entry
  - `[[Barak_Skills_Audit]]` §A2 + Q3 — "כל המעקב אחרי חשבוניות, תשלומים" is the burning layer
  - `[[knowledge-base/il-einvoicing-shaam]]` — SHAAM compliance gates per ledger entry above threshold
  - `[[knowledge-base/il-self-employed-tax]]` `[OPEN]` — feeds quarterly מקדמות + ביטוח לאומי forecasting
- **Outbound:**
  - `רואה חשבון` (external human) — receives standardized exports
  - `[[Cash_Flow_Snapshot]]` — already-spec'd phase-3 dashboard, this LLD provides the data
  - `[[Customer_Pulse_Bee]]` — already-spec'd, AR aging per customer feeds in
  - `alfred-deadlines.js` (existing cron) — periodic-report ⚡ alerts wired here
  - Hashavshevet / Rivhit / Priority (if Barak's רו"ח uses any) — export format `[OPEN]`

---

## § 2 — Cost / swarm / plugin allocation

### Per-step tier assignment

| Step | Tier | Engine | Justification |
|---|---|---|---|
| 1. Polymorphic ledger-entry writer (every source posts here) | **0** | Prisma triggers + service layer | Pure deterministic |
| 2. Per-entity running balance (כרטסת view) | **0** | SQL materialized view + cron refresh | Server-side aggregation |
| 3. Aging buckets (0-30 / 31-60 / 61-90 / 90+) | **0** | SQL CASE on `dueAt - now()` | Deterministic |
| 4. AR/AP dashboards | **0** | SQL → JSON → existing BEE app frontend | Plumbing |
| 5. Cash position (today + 13-week forecast) | **0** | SQL — known invoices + expected POs + recurring | Tier 0; no LLM |
| 6. Job profitability (P&L per installation) | **0** | JOIN proposal.bom + supplier invoices + labor entries against the job | Deterministic |
| 7. Periodic-report prep (VAT, מקדמות) | **0** | SQL aggregation in legal periods | No LLM |
| 8. Anomaly detection on a כרטסת (sudden balance jump, stale entries) | **0** | SQL z-score | No LLM |
| 9. AR collection nudge text (Hebrew, per customer) | **2** | Sonnet | Cognitive — tone, history, prior excuses |
| 10. Monthly executive ⚡ summary to Barak | **3** | Sonnet | One synthesis/month |
| 11. רו"ח export packaging | **0** | Template-driven | Deterministic |

**No Tier 4 at runtime.** Reasoning here is mostly arithmetic.

### Plugins / packages

```
# REUSED from Wave 53/A+B+C
prisma, @prisma/client, ioredis, zod, date-fns, openai (DeepSeek), anthropic (Sonnet)

# NEW for ledger
exceljs               # xlsx export to רו"ח (or papaparse for CSV)
decimal.js            # parallel-safe decimal arithmetic (BigInt + cents is fine for ILS;
                      #   decimal.js only for ratio/percentage where rounding matters)
pdfkit                # רו"ח-readable PDF statements per כרטסת
```

### Env / secrets

| Name | Source | Used for |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` | shared with 53/A-C | reuse |
| `ACCOUNTANT_EXPORT_DIR` | config | where xlsx/pdf statements land (synced via Drive to רו"ח) |
| `ACCOUNTANT_EMAIL` | secrets/bee-integrations.env | for monthly auto-send `[OPEN]` |
| `VAT_PERIOD_MONTHS` | config | `2` for small biz (default) or `1` for large |
| `INCOME_TAX_ADVANCE_PCT` | config | מקדמות rate set by פקיד שומה (varies per business — `[OPEN]` per Barak) |

---

## § 3 — Core LLD + data flow

### 3.1 Polymorphic ledger — one source of truth

The big move: **every monetary event in the spine posts a `LedgerEntry`**, regardless of whether it came from bank/procurement/proposal. Each entry is tagged with the entity it affects (Customer/Supplier/Employee/Job) and a side (חובה/זכות).

```prisma
// Add to BEE app's schema.prisma

enum LedgerEntityKind {
  CUSTOMER
  SUPPLIER
  EMPLOYEE
  JOB
  TAX_AUTHORITY        // for VAT / מקדמות / ביטוח לאומי
  BANK_INTERNAL        // bank fees, FX, internal transfers
  EQUITY               // owner draw / capital injection
}

enum LedgerSide {
  DEBIT                // חובה
  CREDIT               // זכות
}

model LedgerEntry {
  id              String   @id @default(cuid())
  postedAt        DateTime                                     // accounting date (≠ ingest date)
  ingestedAt      DateTime @default(now())

  entityKind      LedgerEntityKind
  entityId        String                                       // FK polymorphic (Customer.id / Supplier.id / Job.id / system const)

  side            LedgerSide
  amountCents     BigInt                                       // ALWAYS positive — side determines direction
  currency        String   @default("ILS")
  description     String                                       // human-readable (Hebrew where applicable)

  // Source linkage — exactly ONE of these is set
  bankTxId        String?                                      // Wave 53/A
  supplierInvId   String?                                      // Wave 53/B
  customerInvId   String?                                      // 53/C downstream (CustomerInvoice — defined below)
  manualRefId     String?                                      // manual adjustment by Barak/רו"ח
  taxFilingId     String?                                      // VAT/מקדמות filing reference

  // Reconciliation
  matched         Boolean  @default(false)                     // has a counter-entry posted? (e.g. invoice ↔ payment)
  matchedWithId   String?                                      // self-relation: the counter-entry's id

  // Audit
  postedByUser    String?                                      // who created this (system | barak | roeh-cheshbon)
  ingestRunId     String?
  reversedById    String?                                      // if reversed (correction), points to the reversing entry

  @@index([entityKind, entityId, postedAt(sort: Desc)])
  @@index([postedAt, side])
  @@index([matched, side])                                     // unmatched debits/credits = open items
}

// Customer invoices — the missing twin of SupplierInvoice (53/B)
// Generated when Proposal.status='accepted' → CustomerInvoice issued → SHAAM allocation
model CustomerInvoice {
  id              String   @id @default(cuid())
  customerId      String
  proposalId      String?                                      // FK if originated from 53/C

  invoiceNumber   String   @unique                             // sequential per BEE's invoice numbering
  shaamAllocationNumber String?                                // מספר הקצאה — required above threshold (KB)
  invoiceMavenId  String?                                      // foreign id if also in Invoice Maven

  issuedAt        DateTime
  dueAt           DateTime
  totalBeforeVatCents BigInt
  vatCents        BigInt
  totalCents      BigInt
  currency        String   @default("ILS")
  status          String                                       // 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'disputed' | 'cancelled'

  pdfPath         String?
  pdfSha256       String?

  ingestedAt      DateTime @default(now())

  @@index([customerId, issuedAt(sort: Desc)])
  @@index([status, dueAt])
  @@index([shaamAllocationNumber])
}

// Materialized: per-entity running balance, refreshed by cron
model EntityBalance {
  entityKind      LedgerEntityKind
  entityId        String
  totalDebitCents BigInt   @default(0)
  totalCreditCents BigInt  @default(0)
  netCents        BigInt   @default(0)                         // debit - credit
  openItems       Int      @default(0)                         // unmatched entries count
  oldestOpenDate  DateTime?
  lastEntryAt     DateTime?
  recomputedAt    DateTime

  @@id([entityKind, entityId])
}

// AR/AP aging buckets — also materialized
model EntityAging {
  entityKind      LedgerEntityKind
  entityId        String
  bucket0to30Cents    BigInt @default(0)
  bucket31to60Cents   BigInt @default(0)
  bucket61to90Cents   BigInt @default(0)
  bucket90plusCents   BigInt @default(0)
  recomputedAt    DateTime

  @@id([entityKind, entityId])
}

// Periodic tax filings — one row per period
model TaxFiling {
  id              String   @id @default(cuid())
  kind            String                                       // 'vat' | 'income-advance' | 'bituach-leumi'
  periodStart     DateTime
  periodEnd       DateTime
  dueAt           DateTime
  status          String                                       // 'pending' | 'filed' | 'paid'
  amountCents     BigInt?
  filedAt         DateTime?
  filingRefId     String?                                      // gov.il ref
  notes           String?

  @@unique([kind, periodStart])
  @@index([dueAt, status])
}
```

### 3.2 Mermaid — how every source maps to a ledger entry

```mermaid
flowchart TD
  subgraph SOURCES["Source streams (Wave 53/A+B+C)"]
    bt[BankTransaction posted §53/A]
    si[SupplierInvoice issued §53/B]
    ci[CustomerInvoice issued §53/C downstream]
    tf[TaxFiling due §existing crons]
    man[Manual adjustment by Barak / רו""ח]
  end

  subgraph POST["Step 1 — polymorphic post"]
    bt -->|"sign = inflow → CREDIT (Customer/Income)<br/>or DEBIT (Supplier/Expense)"| post
    si -->|"DEBIT Supplier (we owe)"| post
    ci -->|"CREDIT Customer (they owe us)"| post
    tf -->|"DEBIT Tax_Authority"| post
    man -->|"side chosen explicitly"| post
    post["LedgerEntry.create<br/>(entityKind, entityId, side, amount, sourceRef)"]
  end

  post --> match{"Counter-entry exists?<br/>(e.g. CustomerInvoice ↔ BankTransaction by customer + amount ±5% + date ±60d)"}
  match -->|"yes"| pair["Both entries: matched=true<br/>matchedWithId set bidirectionally"]
  match -->|"no"| open["Stays as open item<br/>(future reconciliation candidate)"]

  pair --> refresh
  open --> refresh

  subgraph AGG["Step 2 — materialized views (cron */15min)"]
    refresh["Refresh EntityBalance<br/>+ EntityAging buckets"]
    refresh --> bal["EntityBalance per (kind, id):<br/>totalDebit/Credit/net/openItems"]
    refresh --> age["EntityAging buckets:<br/>0-30 / 31-60 / 61-90 / 90+"]
  end

  subgraph VIEWS["Step 3-4 — emission"]
    bal --> kartset["כרטסת view (per entity)<br/>chronological + running balance"]
    age --> ardash["AR aging dashboard<br/>(who owes us how much, how long)"]
    age --> apdash["AP aging dashboard<br/>(what we owe, when due)"]
  end

  subgraph REPORTS["Step 7, 9-11 — periodic + outbound"]
    vat["Quarterly cron 1st of month:<br/>generate VAT report (דו""ח מע""מ)<br/>aggregate by period boundaries"]
    mkadmot["Monthly cron:<br/>income-tax advance forecast"]
    nudge["Tier 2 (Sonnet):<br/>AR collection nudge text per overdue customer<br/>(uses prior comms tone, balance history)"]
    monthly["Tier 3 (Sonnet) — monthly:<br/>'Barak's books · June 2026' executive ⚡"]
    accexport["Tier 0 — quarterly export pack:<br/>xlsx + PDF statements → ACCOUNTANT_EXPORT_DIR"]
  end

  age -->|"customer overdue >30d"| nudge
  bal --> monthly
  bal --> accexport
  bal --> vat
  bal --> mkadmot
```

### 3.3 כרטסת — the rendered view (this is what the רו"ח actually wants)

A `GET /api/ledger/customer/:id?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a sorted timeline. Format example:

```
כרטסת לקוח · רפאל סולאר · 01/01/2026 — 30/06/2026

תאריך       תיאור                                  חובה          זכות         יתרה רצה
─────────────────────────────────────────────────────────────────────────────────────
01/01/2026  יתרת פתיחה                                                            12,400.00
15/02/2026  חשבונית 2026-0142 (התקנת PV 50kW)    58,500.00                  70,900.00
03/03/2026  תשלום בנק מרכנתיל (ref TX-…91)                       30,000.00     40,900.00
12/04/2026  חשבונית 2026-0188 (תחזוקה Q1)         3,200.00                   44,100.00
05/05/2026  תשלום בנק מרכנתיל (ref TX-…12)                       28,500.00     15,600.00
─────────────────────────────────────────────────────────────────────────────────────
                                סה""כ:       61,700.00     58,500.00      יתרה: 15,600.00 ₪

פתוח >30 ימים: ₪3,200 (חשבונית 2026-0188, נכון להיום 65 ימים)
SHAAM: כל החשבוניות כוללות מספר הקצאה ✓
```

Same shape for `כרטסת ספק`, `כרטסת עובד`, `כרטסת פרויקט`.

### 3.4 Reconciliation — the validation circuit (§4.2 applied)

For every `CustomerInvoice` aging into "overdue", and for every `SupplierInvoice` aging into "due-soon", the reconciler runs:

1. Try fuzzy-match against unmatched bank-tx of opposite side (customer→inflow, supplier→outflow).
2. Match criteria: same entityId · amount ±5% · date window (issuedAt to dueAt+30d) · currency.
3. On match → flip both `LedgerEntry.matched=true`, cross-link `matchedWithId`.
4. On no match after 7 days past dueAt → escalate to `OverdueQueue` for AR/AP nudge step (9).

This is the same shape as Wave 53/A↔B coupling (LLD 53/B §6), generalized.

### 3.5 Job profitability — the "did we actually make money" view

A view that answers: for `:Job` X, what did it cost us vs what we billed?

```sql
-- Pseudo
SELECT
  job.id, job.name,
  SUM(CASE WHEN le.side='CREDIT' AND le.entityKind='JOB' THEN amountCents ELSE 0 END) AS revenue,
  SUM(CASE WHEN le.side='DEBIT'  AND le.entityKind='JOB' THEN amountCents ELSE 0 END) AS cost,
  revenue - cost AS gross_margin_cents
FROM Job job
LEFT JOIN LedgerEntry le ON le.entityKind='JOB' AND le.entityId=job.id
GROUP BY job.id;
```

Plugs into the engineering-agent's proposed `bom` snapshot for budgeted vs actual.

### 3.6 The רו"ח export pack (quarterly cron, configurable monthly)

Lands in `ACCOUNTANT_EXPORT_DIR`:

```
2026-Q2/
  README.md                       — period summary, totals, anomalies flagged
  ledger-customers.xlsx           — all customer kartsoth, one sheet per
  ledger-suppliers.xlsx           — same for suppliers
  ledger-other.xlsx               — employees, jobs, tax authority, equity
  ar-aging.xlsx                   — AR aging snapshot at period end
  ap-aging.xlsx                   — AP aging snapshot at period end
  vat-report.pdf                  — pre-filled דו""ח מע""מ (read-only, רו"ח files)
  income-advance-forecast.pdf     — מקדמות מס הכנסה projection
  pl-by-job.xlsx                  — gross margin per :Job
  cash-flow-13-week.pdf           — forecast
  open-items.xlsx                 — unmatched ledger entries needing manual review
  bank-statements/                — raw Wave 53/A exports, archived
  supplier-invoices/              — raw Wave 53/B PDFs, archived
  customer-invoices/              — raw 53/C PDFs, archived
```

Sent to `ACCOUNTANT_EMAIL` once finalized (Barak presses approve, same shape as `sendProposal`).

### 3.7 Monthly Barak executive ⚡ (Tier 3 — what he actually reads)

```
💰 *הספרים · יוני 2026*

📈 *Top line*
  הכנסות: ₪284,500 (+12% מ-מאי) · הוצאות: ₪196,200 (+8%) · שולי: ₪88,300

📅 *AR — לקוחות חייבים לך*
  סה""כ פתוח: ₪124,800
  🟢 ≤30d: ₪92,400 (רגיל)
  🟡 31-60d: ₪18,200 (4 לקוחות — צריך תזכורת)
  🔴 >60d: ₪14,200 (2 לקוחות — שיחה אישית, ראה למטה)
  הכי בעייתי: "צרויה בע""מ" · ₪9,800 · 78 ימים פתוח

📅 *AP — אנחנו חייבים לספקים*
  סה""כ פתוח: ₪52,300 · קרוב מועד: ₪18,400 ב-7 ימים הקרובים

🧾 *מסים*
  דו""ח מע""מ הבא: 15/8 (תקופה 6-7) · ייצור: ~₪48,000 לתשלום, ניכוי: ~₪33,500 → לתשלום: ~₪14,500
  מקדמת מס הכנסה הבאה: 15/8 · אומדן: ₪12,200

🏆 *רווחיות פרויקטים סגורים החודש*
  רפאל סולאר (פיקיין 7): רווח גולמי 28% · ✓ במסגרת
  פלאר (קלקיליה 3): רווח גולמי 12% · ⚠️ נמוך — חריגות ב-cables
  חכל שדרות (עזתה 2): רווח גולמי 31% · ✓

💵 *תזרים — 13 שבועות קדימה*
  שבועות 1-4: +₪84K נטו · שבועות 5-8: +₪62K · שבועות 9-13: -₪14K (גירעון צפוי, סיבה: מקדמת מע""מ אוגוסט + רכישת ABB Q3)

📌 *פעולות מומלצות השבוע*
  1. לשלוח תזכורת ל-4 הלקוחות ה-31-60d (טיוטות מוכנות, לאישורך)
  2. לקבוע שיחה עם צרויה (78 ימים)
  3. לוודא שמע""מ אוגוסט מתוקצב — מומלץ לדחות ₪10K רכש לא-קריטי לספטמבר
```

This is the doc Barak actually reads. Everything below it is the spine that produces it.

---

## § 4 — Code + run + survive

### 4.1 Atomic ledger post (called from every source)

```typescript
// ledger/post.ts — every Wave 53/A+B+C source calls this; never writes ledger directly
import { PrismaClient, LedgerEntityKind, LedgerSide } from "@prisma/client";
import { acquireLock } from "../bank-receipts/lock.js";
import { logManifest, alertBarak } from "../bank-receipts/survive.js";

export interface PostLedgerArgs {
  postedAt: Date;
  entityKind: LedgerEntityKind;
  entityId: string;
  side: LedgerSide;
  amountCents: bigint;                                          // ALWAYS positive
  currency?: string;
  description: string;
  source: { bankTxId?: string; supplierInvId?: string; customerInvId?: string; manualRefId?: string; taxFilingId?: string };
  postedByUser?: string;
  ingestRunId?: string;
}

export async function postLedgerEntry(prisma: PrismaClient, args: PostLedgerArgs): Promise<string> {
  if (args.amountCents <= 0n) throw new Error("postLedgerEntry: amountCents must be > 0 (use side to indicate direction)");

  // Idempotency: hash of (entityKind, entityId, side, amount, source*) — same source posting twice = dup
  const dedupKey = `${args.entityKind}:${args.entityId}:${args.side}:${args.amountCents}:${Object.values(args.source).filter(Boolean).join("|")}`;
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      entityKind: args.entityKind, entityId: args.entityId,
      side: args.side, amountCents: args.amountCents,
      bankTxId: args.source.bankTxId ?? null,
      supplierInvId: args.source.supplierInvId ?? null,
      customerInvId: args.source.customerInvId ?? null,
      manualRefId: args.source.manualRefId ?? null,
      taxFilingId: args.source.taxFilingId ?? null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;                              // hard idempotency

  const entry = await prisma.ledgerEntry.create({
    data: {
      postedAt: args.postedAt,
      entityKind: args.entityKind, entityId: args.entityId,
      side: args.side, amountCents: args.amountCents,
      currency: args.currency ?? "ILS",
      description: args.description,
      bankTxId: args.source.bankTxId,
      supplierInvId: args.source.supplierInvId,
      customerInvId: args.source.customerInvId,
      manualRefId: args.source.manualRefId,
      taxFilingId: args.source.taxFilingId,
      postedByUser: args.postedByUser ?? "system",
      ingestRunId: args.ingestRunId,
    },
    select: { id: true },
  });

  // Fire-and-forget refresh of EntityBalance/EntityAging — eventual consistency OK
  void refreshEntityViews(prisma, args.entityKind, args.entityId).catch((e) =>
    logManifest({ kind: "ledger_refresh_fail", root_cause: String(e), context: args }),
  );

  return entry.id;
}
```

### 4.2 Reconciliation job (cron */30min)

```typescript
// ledger/reconcile.ts
export async function reconcileOpenItems(prisma: PrismaClient) {
  const lock = await acquireLock(prisma, "ledger:reconcile", 600);
  if (!lock) return { skipped: true };

  try {
    // Find unmatched CREDITs (customer invoices outstanding)
    const openCredits = await prisma.ledgerEntry.findMany({
      where: { matched: false, side: "CREDIT", entityKind: "CUSTOMER" },
      orderBy: { postedAt: "asc" },
      take: 500,
    });

    let matched = 0;
    for (const c of openCredits) {
      // Look for unmatched DEBIT same entity, amount ±5%, date window
      const tol = c.amountCents / 20n;     // 5%
      const debit = await prisma.ledgerEntry.findFirst({
        where: {
          matched: false, side: "DEBIT", entityKind: "CUSTOMER", entityId: c.entityId,
          amountCents: { gte: c.amountCents - tol, lte: c.amountCents + tol },
          postedAt: { gte: c.postedAt, lte: addDays(c.postedAt, 90) },
        },
      });
      if (debit) {
        await prisma.$transaction([
          prisma.ledgerEntry.update({ where: { id: c.id }, data: { matched: true, matchedWithId: debit.id } }),
          prisma.ledgerEntry.update({ where: { id: debit.id }, data: { matched: true, matchedWithId: c.id } }),
        ]);
        matched++;
      }
    }
    return { matched };
  } finally {
    await lock.release().catch(() => undefined);
  }
}
```

### 4.3 Materialized-view refresh (per-entity, fast)

```typescript
export async function refreshEntityViews(prisma: PrismaClient, kind: LedgerEntityKind, entityId: string) {
  await prisma.$transaction(async (tx) => {
    const sums = await tx.ledgerEntry.groupBy({
      by: ["side"],
      where: { entityKind: kind, entityId },
      _sum: { amountCents: true },
    });
    const debit = sums.find((s) => s.side === "DEBIT")?._sum.amountCents ?? 0n;
    const credit = sums.find((s) => s.side === "CREDIT")?._sum.amountCents ?? 0n;
    const openItems = await tx.ledgerEntry.count({ where: { entityKind: kind, entityId, matched: false } });
    const oldest = await tx.ledgerEntry.findFirst({ where: { entityKind: kind, entityId, matched: false }, orderBy: { postedAt: "asc" }, select: { postedAt: true } });
    const last = await tx.ledgerEntry.findFirst({ where: { entityKind: kind, entityId }, orderBy: { postedAt: "desc" }, select: { postedAt: true } });

    await tx.entityBalance.upsert({
      where: { entityKind_entityId: { entityKind: kind, entityId } },
      create: { entityKind: kind, entityId, totalDebitCents: debit, totalCreditCents: credit, netCents: debit - credit, openItems, oldestOpenDate: oldest?.postedAt, lastEntryAt: last?.postedAt, recomputedAt: new Date() },
      update: { totalDebitCents: debit, totalCreditCents: credit, netCents: debit - credit, openItems, oldestOpenDate: oldest?.postedAt, lastEntryAt: last?.postedAt, recomputedAt: new Date() },
    });

    // Aging
    const now = new Date();
    const aging = await tx.ledgerEntry.findMany({ where: { entityKind: kind, entityId, matched: false }, select: { amountCents: true, side: true, postedAt: true } });
    const buckets = { b0_30: 0n, b31_60: 0n, b61_90: 0n, b90p: 0n };
    for (const e of aging) {
      const days = Math.floor((now.getTime() - e.postedAt.getTime()) / 86_400_000);
      const sign = e.side === "DEBIT" ? -1n : 1n;     // Customer perspective: CREDIT means they owe us
      const amt = e.amountCents * sign;
      if (days <= 30) buckets.b0_30 += amt;
      else if (days <= 60) buckets.b31_60 += amt;
      else if (days <= 90) buckets.b61_90 += amt;
      else buckets.b90p += amt;
    }
    await tx.entityAging.upsert({
      where: { entityKind_entityId: { entityKind: kind, entityId } },
      create: { entityKind: kind, entityId, bucket0to30Cents: buckets.b0_30, bucket31to60Cents: buckets.b31_60, bucket61to90Cents: buckets.b61_90, bucket90plusCents: buckets.b90p, recomputedAt: new Date() },
      update: { bucket0to30Cents: buckets.b0_30, bucket31to60Cents: buckets.b31_60, bucket61to90Cents: buckets.b61_90, bucket90plusCents: buckets.b90p, recomputedAt: new Date() },
    });
  });
}
```

### 4.4 Periodic crons (added to alfred-deadlines.js sphere)

```
*/15 * * * *           — reconcile open items
0 3 * * *              — full recompute of EntityBalance + EntityAging (overnight safety net)
0 9 1 * *              — monthly: generate "Barak's books" ⚡ + assemble accountant pack draft
0 9 1 1,3,5,7,9,11 *   — bi-monthly: VAT report draft + alert Barak 15 days before due
0 9 1 *,3,5,7,9,11 *   — bi-monthly: מקדמות forecast
0 10 * * 0             — weekly: AR collection nudge drafts for >30d items (drafts to drafts-group, Barak picks)
```

### 4.5 Error path (PROTOCOL §4.4)

Same shape as A/B/C. Special note for ledger:
- **NEVER auto-reverse a ledger entry.** Reversals are explicit, manual, and create a NEW `LedgerEntry` with opposite side + `reversedById` set. The original stays.
- Validation circuit (§4.2): nightly cron checks SUM(DEBIT) per period vs SUM(source amounts). Drift > 0 → ⚡⚡ Barak + freeze further ledger writes via `IngestionLock` key `ledger:write` until resolved.
- Every ledger write that fails goes to `err_manifest.jsonl` with the full args — so a human can replay.

---

## § 5 — Build phasing

| Phase | Hours | Deliverable | Gate |
|---|---|---|---|
| **A. Schema + postLedgerEntry + idempotency** | 5h | Migration adds LedgerEntry, CustomerInvoice, EntityBalance, EntityAging, TaxFiling. Function + tests | Test: post twice, second is no-op |
| **B. Wave 53/A+B+C hooks** | 5h | Modify 53/A, 53/B, 53/C ingest functions to call postLedgerEntry on relevant events | All historic transactions backfill into ledger |
| **C. View materialization + cron */15** | 4h | refreshEntityViews per-entity + nightly full recompute | EntityBalance matches manual SUM |
| **D. כרטסת API + simple JSON response** | 4h | GET /api/ledger/:kind/:id?from=&to= returns sorted timeline | Match against manual לקוח kartset from Invoice Maven |
| **E. AR/AP aging + cash-flow 13-week** | 6h | Materialized aging + cash-flow projector | Manual reconcile vs known-good month |
| **F. Reconciliation job + Sonnet collection nudges** | 6h | Auto-link CustomerInvoice↔BankTransaction; draft nudges in Hebrew per overdue, send to drafts group | Inject mismatched pair → flagged |
| **G. Monthly executive ⚡** | 4h | Tier-3 synthesis cron, Hebrew RTL | 1st of month ⚡ arrives |
| **H. Accountant export pack** | 6h | xlsx + PDF assembly, drop in ACCOUNTANT_EXPORT_DIR | רו"ח opens, can use without re-keying |
| **I. VAT + מקדמות report drafts** | 5h | Pre-filled forms with period boundaries | רו"ח accepts as starting point |
| **J. Job profitability view** | 3h | Per-:Job P&L | Matches the gross margin Barak computes by hand on 3 known projects |

**MVP = A + B + C + D = ~18h** (כרטסות + AR/AP visible). E-J layer on for the full picture.

---

## § 6 — Israeli accounting conventions enforced

| Convention | How it's enforced here |
|---|---|
| **חובה/זכות (debit/credit)** | `LedgerSide` enum; every entry picks one. NEVER signed amounts. |
| **כרטסת לקוח/ספק** | The `LedgerEntry` model with `entityKind` + chronological + running balance from `EntityBalance`. |
| **מע"מ דו-חודשי (bi-monthly VAT)** | `TaxFiling` model + cron schedule; period boundaries enforced by config `VAT_PERIOD_MONTHS=2`. |
| **מקדמות מס הכנסה** | Same shape, monthly cron; rate configurable per פקיד שומה. |
| **ביטוח לאומי לעצמאי** | Quarterly TaxFiling rows pre-populated. |
| **מספר הקצאה (SHAAM)** | `CustomerInvoice.shaamAllocationNumber`; compliance pre-check fires if invoice > threshold without it (per `il-einvoicing-shaam.md`). |
| **שנת מס = שנה קלנדרית** | All period queries use `Asia/Jerusalem` TZ; year boundaries at 31/12 local. |
| **₪ formatting** | All Hebrew renders: `"1,234.56 ₪"` (currency symbol after number). |

---

## § 7 — Out of scope

- **Double-entry full bookkeeping** (חשבונאות כפולה מלאה with general-ledger accounts). What we have is *subsidiary-ledger* style (per-entity), which is what BEE and רו"ח actually use day-to-day. The general ledger lives in the רו"ח's software (Hashavshevet / Rivhit / Priority).
- **Direct integration with Hashavshevet / Rivhit / Priority.** `[OPEN]` per Barak — which one does the רו"ח use? If any, add an adapter to §3.6 export pack.
- **Foreign-currency accounting** (revaluation). Field exists; deferred.
- **Payroll** (תלוש שכר). Different domain — Israeli payroll has heavy regulatory load; defer.
- **Inventory valuation.** Procurement (53/B) tracks POs/invoices; valuation (LIFO/FIFO/avg) for tax purposes is the רו"ח's job.

---

## § 8 — Open questions for Barak

| # | Question | Blocks |
|---|---|---|
| LD-1 | What software does your רו"ח use? (Hashavshevet / Rivhit / Priority / ספיר / other) | §3.6 export format |
| LD-2 | מקדמות rate (%) set by your פקיד שומה? | §I cron forecast |
| LD-3 | Bi-monthly or monthly VAT? (small biz → 2; some classes → 1) | `VAT_PERIOD_MONTHS` config |
| LD-4 | Customer-invoice numbering scheme — sequential per year (2026-0001) or continuous (#00142)? | `CustomerInvoice.invoiceNumber` generator |
| LD-5 | Are there opening balances per customer/supplier (from before BEE app) that need a one-time import? | Phase A backfill scope |

---

*Authored 2026-06-16 by cloud cortex per `protocol_hive.md` §7. The 4th LLD in the Unified Data Spine — the one that turns data into a financial picture the רו"ח can sign off on. Burns when implemented: Obsidian `[[Accounting_Ledger_LLD]]` · graphify re-extract · this commit. After this, the spine is complete: A+B ingestion · C emission · D financial view.*
