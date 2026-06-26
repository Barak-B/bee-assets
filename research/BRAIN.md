# `[[BRAIN]]` — BEE Operations: the project's single entry point

> **Read this first.** Whether you're a cloud cortex, local Claude Code, Hermes, Alfred,
> or a future orchestrator — start here. This file is the map of the whole BEE project:
> what exists, where it lives, what's decided, what's built, what's broken, what's next.
> It is the index over everything else in `research/`.
>
> **Maintained as canon.** When a wave's status, a decision, or a defect changes, edit this
> file in the same commit. It is the synthesis node; the detailed docs are its children.
> Last synced: **2026-06-26**.

---

## 0 — What BEE is (for an agent that just woke up)

Barak Barzel runs **B.E.E** — an Israeli solar + electrical contracting business: **137 customers,
255 sites, 18 vehicles, 149 inverters across 87+ monitored sites**, MW-scale commercial PV.
He runs most of it from his head + WhatsApp + Gmail + Monday + Invoice Maven + the Mercantile
bank portal. This project replaces that verbal/manual layer with a coherent, auditable software
spine — **without** Barak losing control (every outbound action is a human-approved draft).

The work is organized as **waves**. Each substantial component ships as an **LLD** (Low-Level
Design) in the mandatory 4-section shape from `protocol_hive.md §7`, then as **phase-a reference
code** (standalone TS+SQL+tests, cloud-verified), then ported into the BEE app by local Claude Code.

---

## 1 — Canonical documents (the source-of-truth tree)

| Doc | Role | Read when |
|---|---|---|
| **`protocol_hive.md`** | The constitution. Tiers 0-4, the burned-in lessons (cursor/lock/dedup/validation), constitutional laws #1/#2, trust tiers L0/L1/L2, the §7 LLD shape. | Before designing anything. |
| **`PATHS.md`** | Canonical machine topology + a known-WRONG paths table. | Before referencing any `E:\` / local path. NEVER guess a path. |
| **`phase-3/decisions-2026-06-16.md`** | The 10 locked architectural decisions (LD-1..5, EA-1..5). | Before touching ledger / engineering design. |
| **`phase-3/mvp-build-plan.md`** | **Authoritative roadmap** — 23 rows, hours, owners, blockers, milestones, calendar. | To know what to build next. |
| **`phase-3/Wave_53_Unified_Data_Spine.md`** | Master map of how 53/A-D + Wave 54/55 connect. | To understand the architecture as a whole. |
| **`knowledge-base/`** | Israeli regulatory/domain facts, every claim tagged VERIFIED/SECONDARY/CONFLICT/OPEN. | Before surfacing any regulatory number. Cite the source line. |
| **`BRAIN.md`** (this file) | Index + status + defect register + changelog. | First. |

**Sync loop (`protocol_hive.md §6`):** every architectural change burns back to three places —
this git repo, the Obsidian vault (wikilink nodes), and Graphify (`research/graphify-out/`).
Re-run `graphify extract . --update --backend=deepseek` after each commit.

---

## 2 — The agent / wave roster (authoritative inventory)

This is the canonical agent set. (Supersedes any partial list in `barak-skills-audit.md`'s
gap-map, which predates Wave 54/55 and omits the ledger + regulatory/tender agents.)

| Wave | Agent / component | What it does | LLD | Code | Runtime tier |
|---|---|---|---|---|---|
| **53/A** | bank-receipts | Idempotent ingest of Mercantile transactions | ✅ | ✅ Phase A (`bank-receipts-ingestion/phase-a/`) | L1 |
| **53/B** | procurement-tracking | Supplier emails/WA/PDF → PO/Invoice + watchlist gate | ✅ | ✅ Phase A (`procurement-tracking/phase-a/`) | L1 |
| **53/C** | proposal-generator | Brief → engineering suite → Hebrew PDF → approve → send | ✅ | ❌ | L1 |
| **53/D** | accounting-ledger | Polymorphic ledger → כרטסות + AR/AP + monthly VAT + exec ⚡ | ✅ | ❌ | L1 |
| **54** | engineering-agent | PV-design brain: 6 sub-skills (pv_design, wire_sizing, protection, bom, forecast, fault) | ✅ | partial (6 sub-skill specs) | L0/L1 |
| **55** | customer-success-agent | Health buckets, QBR, AR nudges | ✅ | ❌ | L1 |
| existing | `regulatory-agent` | Alfred skill — monitors gov.il RSS; grounded by `knowledge-base/` | n/a (exists) | ✅ live | L1 |
| existing | `tender-agent` | Wraps 53/C with the tender template (`phase-3/tender-agent/`) | SKILL | spec | L1 |
| existing | Alfred / Hermes | WhatsApp/Gmail/voice intake; `dispatchSend()` enforces Law #1 | n/a | ✅ live | — |

**Safety rule that overrides everything:** `wire_sizing` + `protection_coordination` (Wave 54)
are **strict Tier 0 — no LLM, ever.** A hallucinated cable size can start a fire. They throw
and escalate to Barak rather than guess.

---

## 3 — The spine in one picture

```
   Mercantile CSV      supplier email/WA/PDF                       lead (WA/Gmail)
        │                      │                                        │
        ▼                      ▼                                        ▼
   ┌─────────┐          ┌─────────────┐      ┌──────────────┐    ┌──────────────┐
   │ 53/A    │          │ 53/B        │      │ Wave 54      │    │ 53/C         │
   │ BANK    │          │ PROCUREMENT │─────▶│ ENGINEERING  │───▶│ PROPOSALS    │
   │ ingest  │          │ ingest      │ price│ (PV brain)   │bom │ emission     │
   └────┬────┘          └──────┬──────┘ bench└──────────────┘    └──────┬───────┘
        │                      │                                         │ accepted
        │  shared primitives   │                                         ▼
        │  (lock/normalize/    │                                  CustomerInvoice
        │   validate/survive)  │                                         │
        └──────────┬───────────┴─────────────────────────────────────────┘
                   ▼
            ┌──────────────┐        reconcile: ±5% amount, postedAt→+90d
            │ 53/D LEDGER  │  ◀── (one canonical tolerance, spine-wide)
            │ כרטסות·AR/AP │
            │ ·monthly VAT │ ──▶ ⚡ Barak (monthly books) · Invoice Maven export pack
            └──────────────┘ ──▶ Wave 55 customer-success (consumes AR/health)
```

**Shared primitives** every wave imports (never forks) — live in `bank-receipts/phase-a/src/`:
`lock.ts` (Redis→PG-fallback distributed lock) · `normalize.ts` (Hebrew-aware) · `validate.ts`
(read-back circuit) · `survive.ts` (err_manifest + alertBarak) · cursor tuple · `pg_trgm`.

---

## 4 — Locked decisions (do not re-litigate)

From `decisions-2026-06-16.md`. These are Barak's calls — treat as operator facts (§3.6a).

| | Decision |
|---|---|
| **LD-1** | Invoice Maven serves invoicing AND accounting. **No** Hashavshevet/Rivhit/Priority bridge. Export = IM CSV import format. |
| **LD-2** | מקדמות מס הכנסה = **0%**. No מקדמות cron, no `income-advance` filing kind. |
| **LD-3** | VAT = **monthly** (`VAT_PERIOD_MONTHS=1`). NOT bi-monthly. |
| **LD-4** | Invoice numbering = **continuous monotonic, no year reset** (`MAX+1`, seed from IM). |
| **LD-5** | Import **opening balances** from Invoice Maven (Phase A0, idempotent `IM-OPENING-${id}`). |
| **EA-1** | Cable tables = **multi-vendor** (`cable-tables/<vendor>/*.json`, `_default` fallback). |
| **EA-2** | DC/AC ratio = **per-inverter-model** (`inverter-specs.json`), not global. |
| **EA-3** | Inverter selection = **try-all + best-fit**, return scored top-3. |
| **EA-4** | Shading = **Vision LLM over real site photos** (Tier 1), not a scalar. ≥1 photo required. |
| **EA-5** | `fault_analysis` grounded by a `FaultCase` table (pg_trgm lookup before DeepSeek). |

---

## 5 — Status + what's next

**Architecture LOCKED.** Build is mechanical execution per `mvp-build-plan.md`.

- **Done:** all 6 LLDs shipped + decision-consistent · 53/A + 53/B Phase A reference code shipped, cloud-verified.
- **Spine MVP:** ~87h focused build (see build-plan rows 1-15). Full parity: +152h.
- **The one thing blocking the next cloud build steps:** the **5 artifact dropoffs** (§6 below).

**Next cloud-buildable rows** (don't need Barak's dropoffs): build-plan **row 8** (Wave 54 engineering
orchestrator skeleton + reference-table layout). Everything bank/procurement-live needs OB-2/OB-4.

### 5b — Open artifacts Barak provides (`bee-handoff/2026-06-16/`)

| # | File | Unblocks |
|---|---|---|
| OB-1 | vendor cable-table PDFs | Wave 54 Phase B (wire_sizing) |
| OB-2 | Invoice Maven export sample (one period) | 53/D Phase A0 (opening balances) + IM export columns |
| OB-3 | 3-5 closed fault cases (json/md) | Wave 54 Phase G1 (FaultCase seeding) |
| OB-4 | real Mercantile CSV header strings | 53/A Phase B (real bank live) |
| OB-5 | per-tier health weights (optional) | Wave 55 (sensible defaults otherwise) |

When ready → `/handoff ready` in self-chat → next cloud session parses + proceeds.

---

## 6 — Defect register (2026-06-26 four-reviewer audit)

A 4-agent parallel review swept the whole corpus line-by-line. Outcome:

**Fixed this pass (commit `dd94654`):**
- 🔴 CRITICAL ×2 — idempotency was broken in BOTH pipelines (cursor gate short-circuited hard-dedup / in-batch cursor drop). Hard-key dedup is now authoritative; both fixture sets ingest + re-run-dedup correctly.
- 🟠 HIGH ×9 — Hebrew normalize bugs (maqaf-only hyphen; over-stripping בית/אל/bare letters); schema↔migration GIN-index drift; npm scripts un-runnable under bare strip-types (→ tsx); accounting-ledger body still showed pre-decision design (bi-monthly VAT, מקדמות, Hashavshevet, ACCOUNTANT_EXPORT_DIR); engineering body missing EA-1..5; signed-amount→ledger-side adapter unspecified; build-plan hour totals wrong (91→87, 125→152).
- 🟡 MED — Redis→PG lock fallback; BigInt-safe line totals; supplier create-race (P2002); guessCategory wired; multi-PO drop logged; reconcile-window unified to ±5%/+90d; CS-2..5 defaulted; VAT cadence reconciled across KB README + cash-flow SKILL + smb-comparison; entity counts + fleet brands corrected in protocol_hive; constitutional laws + trust tiers added to protocol_hive.

**Accepted / deferred (low priority, tracked here so they're not lost):**
- `barak-skills-audit.md` gap-map predates Wave 54/55 — superseded by §2 of this file (not separately edited).
- Repo-root `README.md` is a public-facing stub with no pointer to `research/` — **left intentionally** (repo may be public; do not expose internal strategy from the entry point unless Barak says so).
- `protocol_hive.md` §3.6a physically precedes §3.6 (cosmetic; the `§3.6a` label is referenced spine-wide, so not renumbered).
- phase-1 execution logs contain the stale `\scripts\` path — inoculated via a warning in `PATHS.md` rather than rewriting historical logs.

---

## 7 — Changelog (recent)

| Commit | What |
|---|---|
| `dd94654` | Audit cleanup: 2 CRIT code fixes + propagate locked decisions into LLD bodies + foundational-doc coherence |
| `48bf564` | Wave 53/B Phase A procurement reference impl |
| `3598064` | MVP build plan |
| `e719586` | Decisions doc + 3 LLD patches (10 questions resolved) |
| `990b0fa` / `86898bb` / `01fa805` / `28fdeca` | Wave 55 / 54 / 53-spine / 53-D LLDs |

---

## 8 — How to use this brain (for the next session)

1. Read this file. Then `mvp-build-plan.md` for the next row to build.
2. Consult `protocol_hive.md` for the LLD shape + lessons before writing any design.
3. Consult `PATHS.md` before any local path. Consult `decisions-2026-06-16.md` before ledger/engineering.
4. Never invent an operator fact (bank, path, supplier, threshold) — source it from the KB or open `[OPEN]` + ask (§3.6a).
5. Phase-a code runs via **`tsx`** (not bare `node --experimental-strip-types`); production = `tsc && node dist`.
6. After any architectural change: edit this file + the affected LLD in the same commit; re-extract graphify.

---

*Authored 2026-06-26 by cloud cortex as the project's synthesis node, after the four-reviewer audit.
Burns: Obsidian `[[BRAIN]]` · graphify re-extract · this commit. This is the file a cold-start session reads first.*
