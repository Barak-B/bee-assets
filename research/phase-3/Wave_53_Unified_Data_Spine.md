# `[[Wave_53_Unified_Data_Spine]]` — The Master Map

> The single doc that explains how the 4 sub-LLDs (A/B/C/D) fit into one coherent operational + financial backbone for BEE. All four LLDs name this file as their **parent** node; this is where the synthesis lives.
>
> **Status:** all 4 sub-LLDs shipped (15/6–16/6 2026). Phase A reference impl of 53/A is in repo. Phases B-onward are spec-only until Barak ports into BEE app + answers the open questions.

---

## TL;DR — one sentence each

| Wave | One sentence | LLD | Phase A code |
|---|---|---|---|
| **53/A — Bank** | Idempotent, locked, validated ingestion of Mercantile bank transactions. | [`bank-receipts-ingestion/LLD.md`](bank-receipts-ingestion/LLD.md) | ✅ [`bank-receipts-ingestion/phase-a/`](bank-receipts-ingestion/phase-a/) (~1,175 LOC, TS+SQL+tests, cloud-verified) |
| **53/B — Procurement** | Same pattern for supplier emails/WA/PDF → `Supplier`/`PurchaseOrder`/`SupplierInvoice` with a watchlist gate for new suppliers. | [`procurement-tracking/LLD.md`](procurement-tracking/LLD.md) | `[OPEN]` — reuses 53/A `lock.ts`/`normalize.ts`/`survive.ts` |
| **53/C — Proposals** | Brief → `engineering-agent` suite → Hebrew RTL PDF → Barak approves → customer. Emission side. | [`proposal-skill-template/LLD.md`](proposal-skill-template/LLD.md) | `[OPEN]` |
| **53/D — Ledger** | Polymorphic `LedgerEntry` per entity → `כרטסות` + AR/AP aging + tax filings + monthly executive ⚡. The רו"ח-facing view. | [`accounting-ledger/LLD.md`](accounting-ledger/LLD.md) | `[OPEN]` |

**The spine is complete on paper.** What's missing is the BEE-app port + the 5 open questions answered (most are in 53/D § 8).

---

## § 1 — Why "spine"

Before this work, the operational picture in Barak's life looks like this:

```
WhatsApp threads · Gmail · Monday boards · Invoice Maven · Mercantile portal · supplier PDFs
all of it floating · most of it נשמר בעל-פה · the roeh-cheshbon receives screenshots
```

After this work:

```
                          ┌────────────────────────┐
                          │   BEE Operations app    │
                          │  (source of truth · 38  │
                          │  Prisma models extended)│
                          └───────────▲────────────┘
                                      │
            ┌───────────┬─────────────┼────────────┬────────────┐
            ▼           ▼             ▼            ▼            ▼
       Wave 53/A    Wave 53/B    Engineering   Wave 53/C    Wave 53/D
       BANK         PROCUREMENT  AGENT         PROPOSALS    LEDGER
       (ingest)     (ingest)     (internal)    (emission)   (view + alerts)
            ▲           ▲             ▲            ▲            │
            │           │             │            │            │
        Mercantile  Email/WA/PDF  (existing      (Barak picks  AR/AP, kartsoth,
        CSV/PSD2    supplier comms phase-3)      WA/Gmail send) tax, roeh export
                                                                ▼
                                                          ⚡ Barak (monthly)
                                                          📎 roeh-cheshbon (qly)
```

The 4 waves form one **spine**: data enters via A/B, gets shaped by engineering-agent, exits as proposals/invoices via C, and is viewed financially via D. Every wave shares the same primitives — lock provider, fuzzy normalizer, validation circuit, alert pipeline — so adding the 5th wave (CRM, n8n, whatever next) is incremental, not greenfield.

---

## § 2 — Shared primitives (the contract every wave honors)

These are concrete modules in `bank-receipts-ingestion/phase-a/src/` that every later wave imports rather than reimplements. Encoded in `protocol_hive.md` §3.

| Primitive | File | Used by |
|---|---|---|
| **Distributed lock** (Redis primary, PG-row fallback) | `lock.ts` — `acquireLock(prisma, key, ttlSeconds)` | 53/A, 53/B, 53/C, 53/D |
| **Hebrew text normalizer** (strip ה/של/מ/אצל/ל + Hebrew quotes/dashes) | `normalize.ts` — `cleanCounterparty()` | 53/A (counterparties), 53/B (suppliers + items), 53/C (customer names), 53/D (description fields) |
| **Cursor tuple `(updated_at, id)`** | `types.ts` — `cursorAdvances()` | every ingestion stream |
| **Read-back validation circuit** | `validate.ts` — `makeValidator(prisma).verify(insertedIds)` | every write path, mandatory before declaring success |
| **`err_manifest.jsonl` + `alertBarak`** | `survive.ts` — `logManifest()`, `alertBarak()` | every failure path |
| **`IngestRun`** model (group rows for rollback + audit) | shared Prisma model | every wave |
| **`pg_trgm`** extension | one-time CREATE in 53/A migration | 53/B fuzzy supplier match, 53/D `descriptionNorm` lookups |

**Rule:** if a wave needs new behavior, it extends these primitives in place (e.g. 53/B added "strip 'בע"מ' / 'ושות'" to `cleanCounterparty`); it does NOT fork. This keeps the spine coherent — one bug fix lands in one place.

---

## § 3 — How the 4 waves connect (concrete couplings)

### 3.1 Bank ↔ Procurement (incoming side reconciliation)

- Wave 53/A posts a `BankTransaction` outflow.
- Wave 53/B reconciler scans open `SupplierInvoice` rows for that supplier, ±5% amount, ±60d date.
- On match → both rows update; ledger entry pair posts (53/D).
- Documented: `procurement-tracking/LLD.md` §6.

### 3.2 Bank ↔ Customer-side AR (incoming inflow → invoice settled)

- Wave 53/A posts a `BankTransaction` **inflow**.
- Wave 53/D reconciler scans open `CustomerInvoice` for that customer, ±5% amount, ±90d date.
- On match → invoice flips to `paid`, both `LedgerEntry` rows flip `matched=true`, cross-linked.
- Documented: `accounting-ledger/LLD.md` §3.4.

### 3.3 Proposals → Invoices → Ledger

- `Proposal.status='accepted'` → fires a creator that issues `CustomerInvoice` (with SHAAM allocation if above threshold per `il-einvoicing-shaam.md`).
- `CustomerInvoice` posts a `LedgerEntry` CREDIT to the customer.
- Now the customer's כרטסת shows the pending balance immediately.

### 3.4 Procurement → engineering-agent → Proposals (the loop)

- 53/B feeds `PriceBenchmark` (rolling supplier-price averages per `descriptionNorm`).
- `engineering-agent.bom_generator` reads `PriceBenchmark` when costing a new proposal → quotes are based on **live** prices, not stale lookup tables.
- Proposal goes out → if accepted → invoice issued → eventually paid → cycle closes.

### 3.5 Tax authority as a first-class entity

- `LedgerEntityKind.TAX_AUTHORITY` lets VAT and מקדמות filings appear in the ledger like any supplier.
- `alfred-deadlines.js` (already cron) generates `TaxFiling` rows for upcoming periods.
- Pre-fill drafts are produced by 53/D §3.6 and dropped in the accountant pack.

---

## § 4 — The 4 constitutional gates the spine enforces

These come from `protocol_hive.md`. Each wave applies them; the spine collectively guarantees them.

1. **§3.1 Deterministic cursor tuple** — no row is ever re-emitted; no row is ever lost in a clock-skew gap.
2. **§3.2 Distributed lock + atomic UoW** — no parallel runner can corrupt a stream; failures roll back cleanly; lock TTL is the fail-safe.
3. **§3.4 Hard-key + fuzzy dedup** — no duplicate `:Supplier` / `:Customer` / `:LedgerEntry`. Hebrew-aware normalization is shared.
4. **§4.2 Validation circuit** — every write is read back. 200 OK is not proof of persistence. Drift → freeze + ⚡⚡.
5. **§3.6a Don't invent operator facts** — every new supplier/customer/bank/etc. goes through a Barak-confirm watchlist gate. Never auto-promotes.
6. **Constitutional law #1 (4 destinations)** — Wave 53/C's `sendProposal()` cannot fire without `approvedByBarakAt`. Wave 53/B's supplier comms never reply back. Wave 53/D's accountant export never auto-sends until Barak approves the pack.

If a future wave breaks any of these — it's not part of the spine yet.

---

## § 5 — Operator's-eye view ("what you actually see")

A normal week with the spine live (post-MVP, A+B+C+D Phase A-D each):

**Sunday 19:00.** `⚡ Supplier health · week of …` arrives. 30 seconds to skim.

**Monday morning.** Email from Prime Energy. 15 min later it's a `:PurchaseOrder` in DB; you see nothing. If a price is anomalous: `⚡ Cable 6mm² black — supplier "X" — ₪4.20/m vs avg ₪3.65 (+15%)`. You decide.

**Tuesday.** Lead via WhatsApp: "80 m² גג בגבעתיים, חשבון 1,200." Alfred drafts an intake; you approve; 90 seconds later: `⚡ הצעה v1 ל-יוסי כהן · ₪52,400 · PDF: …` — review, approve, send. Used to be 3 hours, now 30 seconds of your time.

**Wednesday.** A supplier you don't recognize emails. `⚡ ספק חדש: 'אלקטרו-טק חיפה' — לאשר/למזג/להתעלם?` You answer with `/supplier approve <id>`. Done.

**Friday.** Customer pays. Mercantile transaction posts. Wave 53/A picks it up. Wave 53/D reconciler matches it against the open invoice. כרטסת הלקוח updates. You don't see it — but if a payment was *expected* and didn't arrive: `⚡ ההצעה ל-יוסי תוקעה ב-'sent' 14 ימים, אין תזכורת — לטיוטה?`

**1st of next month, 09:00.** `💰 הספרים · יוני 2026` arrives. 3 minutes to read. Top line, AR aging, AP aging, VAT due, מקדמות, רווחיות פר-פרויקט, תזרים 13 שבועות, 3 פעולות מומלצות.

**Quarterly, when you press the button.** Accountant pack drops in Drive, mail goes to ROEH_EMAIL. He responds with adjustments. You apply or push back.

Everything that **isn't** in that week — supplier follow-ups, manual aging review, weekly Monday spreadsheets — got absorbed.

---

## § 6 — Build phasing across the spine

What "MVP" means at the spine level: the minimum that ends the בעל-פה layer + the manual proposal layer + the monthly aging-by-memory layer.

| Spine MVP step | Owns | Hours | Gate |
|---|---|---|---|
| **53/A Phase A** ✅ shipped | reference impl in repo | done | TS files all parse, fixture round-trips |
| **53/A Phases B-C** | port to BEE app, first real Mercantile CSV, validation+alert | ~7h | First real receipt ⚡ Barak |
| **53/B Phases A-C** | schema + EmailSource + watchlist gate | ~13h | First supplier email auto-ingested + new-supplier ⚡ |
| **53/C Phases A-C** | schema + 1 template + dry-run + brief structuring | ~15h | Fixture brief → valid PDF with correct totals |
| **53/D Phases A-D** | LedgerEntry + 53/A-C hooks + materialized views + כרטסת API | ~18h | Real customer's כרטסת matches Invoice Maven hand-check |
| **Coupling tests** | A↔B reconcile · A↔D AR settle · C→CustomerInvoice→D | ~5h | One closed-loop per coupling |
| **Spine MVP total** | | **~58h** | |
| --- | --- | --- | --- |
| 53/A D-G, 53/B D-H, 53/C D-H, 53/D E-J | full feature parity | ~120h | per-wave gates in each LLD §5 |

These are spec hours, not calendar. Calendar depends on Barak's bandwidth + whether sessions push code locally vs in cloud.

---

## § 7 — What this spine **doesn't** do (intentional)

- **It is not double-entry general-ledger accounting.** Wave 53/D is subsidiary-ledger style (per-entity). The general ledger lives in the רו"ח's software.
- **It is not a CRM.** Customer pulse, NPS, follow-up cadences belong to `customer-success-agent` (sibling phase-3 spec) — it consumes spine data, doesn't replace it.
- **It is not a project management system.** Monday boards keep their place; the spine reads from them, doesn't replace them.
- **It is not an installation scheduler.** That's a future wave (e.g. `field-dispatch-agent` from earlier master-plan).
- **It is not a tax compliance authority.** The spine pre-fills filings as drafts; the human files them. רו"ח signs off.

---

## § 8 — Where this lives in the wider Hive

- `[[protocol_hive]]` — the constitution. Defines the primitives the spine must use.
- `[[Barak_Skills_Audit]]` — explains *why* this spine exists: it offloads the audit's "burning layer" (audit §A2 + Q7).
- `[[knowledge-base/]]` — feeds the spine ground truth: SHAAM thresholds (53/D + 53/B), regulatory deadlines (53/D crons), Israeli accounting conventions (53/D §6).
- `[[engineering-agent]]` (phase-3 SKILL.md + 6 sub-skills) — feeds 53/C and 53/B with the PV-engineering depth that only Barak has today.
- `[[customer-success-agent]]` (phase-3 SKILL.md) — consumes 53/C+D outputs.
- `[[tender-agent]]` (phase-3) — wraps 53/C with the tender template.
- `[[Alfred]]` — WhatsApp/Gmail/voice intake stays where it is; the spine attaches to its event stream.
- `[[Graphify]]` — the live code-knowledge graph; re-extracting after each spine commit keeps the agent-side discoverability fresh.
- `[[BEE Operations app]]` — the source of truth; the spine's Prisma diffs land in its schema.

---

## § 9 — Open questions that block real builds

**Status (2026-06-16):** the 10 architectural questions (LD-1..5 + EA-1..5) are **answered → see [`decisions-2026-06-16.md`](decisions-2026-06-16.md)**. Affected LLDs patched in the same commit.

Remaining items are **artifacts Barak shares** (not architectural decisions):

| # | Item | Who unblocks |
|---|---|---|
| OB-1 | Vendor cable-table PDFs (EA-1 follow-up) → I parse into JSON | Barak |
| OB-2 | Invoice Maven export sample (LD-1, LD-5) — one real period | Barak (blocks 53/D Phase A0) |
| OB-3 | 3-5 closed fault cases (EA-5 follow-up) as JSON fixture | Barak (blocks Wave 54 Phase G) |
| OB-4 | Real Mercantile portal CSV header strings (Z-A1) | Barak (blocks 53/A Phase B) |
| OB-5 | Per-tier scoring weights for `CustomerHealth` (Wave 55 CS-1) | Barak (sensible defaults if not specified) |
| Z-B1 | Watchlist approval UX — reply with `/supplier approve <id>` or drafts-group picker? | minor — Barak picks |
| Z-B2 | Inventory tracking — leaning skip (project-based) | confirm |
| Z-C1 | Template authoring — MS Word hand-off to engine? | confirm |
| Z-C2 | Fixture customer brief | Barak picks one past project |
| Z-D1 | Next wave after A+B+C+D MVP | open — likely customer-success-agent (already speced) |

**These are dropoffs, not blockers.** MVP architecture is locked.

---

*Authored 2026-06-16 by cloud cortex, anchoring the 4 sub-LLDs. Edit this file when a wave's contract changes — it is the canonical single-source for the spine's shape. Burns: Obsidian `[[Wave_53_Unified_Data_Spine]]`, graphify re-extract, this commit.*
