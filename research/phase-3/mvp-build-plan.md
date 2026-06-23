# MVP Build Plan — Wave 53 Spine + Wave 54/55 Specialists

> Concrete roadmap, from "architecture locked 2026-06-16" to "BEE runs on the spine." Each row: hours, owner, gate, blockers. Hours = focused build time, not calendar — calendar depends on Barak's bandwidth + cloud-cortex availability.

---

## § 1 — Status snapshot (today, 2026-06-16)

| Component | LLD | Phase A code |
|---|---|---|
| **Wave 53/A bank-receipts** | ✅ shipped (`bank-receipts-ingestion/LLD.md`) | ✅ shipped — TS+SQL+tests, cloud syntax-verified (`phase-a/` ~1,175 LOC) |
| **Wave 53/B procurement** | ✅ shipped (`procurement-tracking/LLD.md`) | ❌ not started |
| **Wave 53/C proposals** | ✅ shipped (`proposal-skill-template/LLD.md`) | ❌ not started |
| **Wave 53/D ledger** | ✅ shipped + patched per decisions (`accounting-ledger/LLD.md`) | ❌ not started |
| **Wave 54 engineering-agent** | ✅ shipped + patched per decisions (`engineering-agent/LLD.md`) | partial — 6 sub-skill specs exist; no orchestrator code |
| **Wave 55 customer-success-agent** | ✅ shipped (`customer-success-agent/LLD.md`) | ❌ not started |
| **Shared primitives** (lock / normalize / validate / survive) | — | ✅ live in `bank-receipts/phase-a/src/` — every later wave imports |
| **Knowledge base** | ✅ 3 entries authored, queue of 6 OPEN topics | research continues in cloud sessions |
| **Decisions doc** | ✅ all 10 architectural Qs answered | locked 2026-06-16 |

**Architecture LOCKED.** Next move is code + the 5 artifact dropoffs from Barak.

---

## § 2 — Build order (dependency-aware)

```
                                  ┌──────────────────────────┐
                                  │  Wave 53/A Phase A code   │ ✅ done
                                  │  (reference impl shipped) │
                                  └────────────┬─────────────┘
                                               │ port src/ into BEE app
                                               ▼
                                  ┌──────────────────────────┐
                                  │  Wave 53/A Phase B        │  needs OB-4 (real Mercantile CSV)
                                  │  (real bank live)         │
                                  └────────────┬─────────────┘
                                               │
            ┌──────────────────────────────────┼──────────────────────────────────┐
            │                                  │                                  │
            ▼                                  ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────┐               ┌──────────────────┐
   │  Wave 53/B Phase  │              │  Wave 53/D A0     │               │  Wave 54 Phase A  │
   │  A (procurement   │              │  (opening balances │              │  (engineering     │
   │  schema + sources)│              │  from Invoice      │               │  orchestrator +   │
   │  ~13h             │              │  Maven) — needs    │               │  ref tables +     │
   │                   │              │  OB-2              │               │  bom_generator)   │
   └─────────┬────────┘              └─────────┬────────┘               └─────────┬────────┘
             │                                  │                                  │
             └──────────────┬──────────────────┼──────────────────────────────────┘
                            │                  │
                            ▼                  ▼
                  ┌──────────────────────────────────────┐
                  │  Wave 53/D Phase A-D (ledger MVP)     │
                  │  postLedgerEntry + views +            │
                  │  כרטסת API · ~18h                     │
                  └──────────────────┬───────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │  Wave 53/C Phase A-C (proposals MVP)  │
                  │  schema + 1 template + brief struct   │
                  │  + dry-run end-to-end · ~15h          │
                  └──────────────────┬───────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │  COUPLING TESTS — A↔B reconcile +     │
                  │  A↔D AR settle + C→invoice→D · ~5h    │
                  └──────────────────┬───────────────────┘
                                     │
                                     ▼
                            🎯 **SPINE MVP LIVE**
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                        ▼                        ▼
   Wave 55 customer-success    Wave 54 Phases B-I    Wave 53/A-D Phases D-J
   ~19h MVP                    ~50h depth            ~80h depth
   (parallel)                  (parallel)            (parallel)
```

---

## § 3 — Task table (rolled up, dependency-ordered)

| # | Phase / wave | Hours | Owner | Gate | Blocked by |
|---|---|---|---|---|---|
| 0 | **Barak dropoff** — collect 5 artifacts (OB-1..5) to Drive folder `bee-handoff/2026-06-16/` | 1-2h his | **Barak** | All 5 files present | — |
| 1 | **53/A Phase A → port to BEE app** — copy `phase-a/src/` into BEE app; `npx prisma migrate dev --name bank_receipts_v1`; wire to BEE-Ops's PrismaClient singleton | 4h | local-cortex | `npm test` green in BEE app | 53/A Phase A code ✅ done; BEE app source access |
| 2 | **53/A Phase B — Mercantile live** — `BANK_PROVIDERS_JSON` config with real column names; first 30d CSV ingested; ⚡ Barak summary | 4h | local-cortex | Real receipt arrives in Barak's WhatsApp self-chat | (1) + OB-4 |
| 3 | **53/B Phase A0** — schema migration (extends 53/A primitives), `EmailSource` skeleton, `ManualUpload` dir watcher, dry-run | 5h | cloud-cortex | Dry-run on fixture supplier PDF → ExtractedPO correct | (1) — same Prisma instance |
| 4 | **53/B Phase B-C** — Gmail OAuth + watchlist gate + `alertBarak` wiring + new-supplier flow | 8h | local-cortex (OAuth) + cloud-cortex (code) | First Prime Energy email auto-ingested + watchlist ⚡ | (3) |
| 5 | **53/D Phase A0 — opening balances** — `ledger:import-opening --source invoice-maven` CLI; idempotent; transactional rollback | 3h | cloud-cortex | Re-running import = no-op; sample IM export round-trips | OB-2 |
| 6 | **53/D Phase A-C** — `LedgerEntry` polymorphic + `postLedgerEntry` + cron */15 + reconciler | 8h | cloud-cortex | 53/A and 53/B writes auto-post to ledger | (1), (3), (5) |
| 7 | **53/D Phase D — כרטסת API** — `GET /api/ledger/:kind/:id?from=&to=` returns chronological + running balance | 4h | cloud-cortex | One real customer's kartset matches Invoice Maven hand-check | (6) |
| 8 | **Wave 54 Phase A** — engineering orchestrator + reference-table layout (`cable-tables/<vendor>/*.json` + `inverter-specs.json` with per-model dcAcRatio) + bom_generator wired to PriceBenchmark | 6h | cloud-cortex | Cache round-trip works; `bom_generator` returns live prices | (3) — PriceBenchmark exists |
| 9 | **Wave 54 Phase B — wire_sizing (strict Tier 0)** | 5h | cloud-cortex | 10 reference cases match Barak's hand calc | OB-1 (cable PDFs) |
| 10 | **Wave 54 Phase C — pv_design_calc + try-all + sanity** | 6h | cloud-cortex | 5 fixture sites match Barak's SketchUp output | (8) — inverter-specs.json |
| 11 | **Wave 54 Phase D — protection_coordination** | 6h | cloud-cortex | Standard + multi-source topology validated | (10) |
| 12 | **Wave 54 Phase E — bom_generator full + PriceBenchmark integration** | 5h | cloud-cortex | Real proposal end-to-end with current prices | (8) |
| 13 | **Wave 54 Phase F — performance_forecast (Vision)** | 4h | cloud-cortex | 1 real site backtest within ±8% of SolarEdge actual | (10) + site photo |
| 14 | **53/C Phase A-C — proposals MVP** — schema + 1 template + brief structuring + dry-run | 15h | cloud-cortex + Barak (template authoring in MS Word) | Fixture brief → valid PDF with correct totals | (7), (12) |
| 15 | **Coupling tests A↔B + A↔D + C→D** | 5h | cloud-cortex | One closed-loop per coupling demonstrated | (1)-(14) all green |
| 16 | 🎯 **Spine MVP demo** — first real end-to-end run: live bank tx → reconciles to invoice → kartset updates → monthly ⚡ to Barak | — | Barak watches | All gates green | (15) |
| 17 | Wave 55 customer-success MVP (Phases A+B+C+E) | 19h | cloud-cortex | First "Sunday digest" with real customer data | spine MVP (16) |
| 18 | Wave 54 Phase G+G1 — fault_analysis + FaultCase seeding | 9h | cloud-cortex + Barak (3-5 cases) | 3 past faults: agent surfaces same cause | OB-3 |
| 19 | Wave 53/A Phases D-G — full feature parity | ~25h | cloud-cortex | per LLD §5 each | — |
| 20 | Wave 53/B Phases D-H — full | ~25h | cloud-cortex | per LLD §5 | — |
| 21 | Wave 53/C Phases D-H — full | ~30h | cloud-cortex + Barak | per LLD §5 | — |
| 22 | Wave 53/D Phases E-J — full | ~28h | cloud-cortex | per LLD §5 | — |
| 23 | Wave 55 Phases D-J — full | ~16h | cloud-cortex | per LLD §5 | — |

**Spine MVP total:** rows 1-16 ≈ **~91h** focused build + Barak dropoffs (rows 0).
**Full parity:** + rows 17-23 ≈ **~125h** more, parallelizable.

---

## § 4 — The "Spine MVP demo" gate (row 16)

The minimum end-to-end that proves it works:

1. **Real Mercantile CSV ingested** → `BankTransaction` row appears in BEE app
2. **`CustomerInvoice` exists** (either auto-created from accepted Proposal, or manually for early testing)
3. **Auto-reconciler matches them** → both rows `matched=true`, `LedgerEntry` pair posts
4. **`GET /api/ledger/customer/<id>`** → returns chronological kartset with correct running balance
5. **1st of next month** → ⚡ executive summary arrives in Barak's self-chat

When all 5 happen in sequence on real data — the spine is operational.

---

## § 5 — Owner split (who does what from where)

| Role | What | Examples |
|---|---|---|
| **Barak** (~5-8h his time over MVP) | Artifact dropoffs · template authoring · approval gates · real-data validation · seed cases | OB-1..5 collection · QBR template in Word · approve first proposal · sample fault cases |
| **Cloud-cortex** (this session shape) | Architecture, LLDs, reference TS/SQL implementations, syntax verification, KB research, decision capture | Most of rows 3, 5, 6, 7, 8-14 above |
| **Local Claude Code** (Barak's machine) | OAuth dances, real-system integration, ports into BEE app, real-data first runs, anything touching E:\ or Tailscale | Rows 1, 2, parts of 4 (OAuth), final integration runs |
| **bee-prod-1** (production server) | Hosts BEE Operations app + PostgreSQL + soon Redis + Neo4j (if needed) | runtime target |

The split is honest: cloud-cortex produces tested reference code; local Claude Code or Barak deploys it; Barak validates outputs against reality.

---

## § 6 — Artifact dropoff folder (the only thing blocking Phase A0+)

**Single folder on Drive:** `bee-handoff/2026-06-16/`

| File | Source | Used by | Priority |
|---|---|---|---|
| `mercantile-sample.csv` | Export 30 days from Mercantile portal | 53/A Phase B (real CSV columns) | 🟢 high |
| `invoice-maven-export-sample.csv` | Invoice Maven export of one period | 53/D Phase A0 (opening balances) + accountant adapter | 🟢 high |
| `vendor-cable-tables/*.pdf` | Manufacturer cable ampacity tables Barak uses | Wave 54 Phase B (wire_sizing) | 🟡 medium |
| `fault-cases/*.md or *.json` | 3-5 closed past tickets with: symptoms, telemetry, root cause, fix, hours | Wave 54 Phase G1 (FaultCase seeding) | 🟡 medium |
| `customer-tier-weights.json` | Optional — health-score weights per tier | Wave 55 Phase B (defaults if absent) | 🔵 low |

When the folder is ready → ⚡ self-chat: `/handoff ready` → I (or next cloud session) parses and proceeds.

---

## § 7 — Risk + decision points

| Risk | Mitigation |
|---|---|
| Mercantile CSV columns differ from assumed Hebrew names | Phase B starts with a `BANK_PROVIDERS_JSON` dry-run that LOG the raw column names from a real file before any DB write |
| Vendor cable PDFs are scans, not extractable text | OB-1 parse strategy: try `pdf-parse` → if fails, manual transcription (one-time, ~1-2h) → then JSON. Don't escalate to OCR-vision (rule §3.4 — wire_sizing tables are too safety-critical for visual transcription confidence) |
| Invoice Maven has no clean CSV export | Fallback: SHAAM XML / IM API if exists / manual CSV authoring from IM's report UI |
| BEE app's existing Prisma schema conflicts with new models | Migration tested in dev DB first; rollback ready. The new models are additive — should not conflict with the 38 existing |
| Mercantile portal session captcha / 2FA | If automated CSV fetch hits CAPTCHA: stay manual CSV download for now. Phase F (OpenBanking) deferred until decision |
| Vision LLM cost runaway in performance_forecast | Cap at $0.50 per design. Cache aggressive (`siteId × season`). Bypass with scalar fallback only with explicit Barak override + warning |

---

## § 8 — Milestones (the things Barak will feel)

| # | Milestone | Hours-to-here | Felt by Barak as |
|---|---|---|---|
| M1 | First real Mercantile receipt auto-ingested + ⚡ summary | ~8h (rows 1+2) | "OK, the bank is now in the system" |
| M2 | First supplier email auto-classified to PurchaseOrder + watchlist ⚡ | +13h ≈ 21h | "I can stop forgetting which order is from whom" |
| M3 | First real kartset visible via API + matches Invoice Maven | +15h ≈ 36h | "I can see the customer's balance the same way the רו"ח sees it" |
| M4 | First proposal generated end-to-end (brief → PDF → approve → send) | +35h ≈ 71h | "Quote turned around in 90 seconds, not 3 hours" |
| M5 | Spine MVP — full closed loop with monthly executive ⚡ | +20h ≈ 91h | "I trust the books." (the audit Q7 burning layer is offloaded) |
| M6 | Wave 55 customer-success MVP — Sunday digest + AR aging | +19h ≈ 110h | "I know which 137 customers need attention this week without remembering" |
| M7 | Wave 54 engineering depth — `fault_analysis` with FaultCase | +9h ≈ 119h | "When a site under-produces, the diagnosis is ready before I drive there" |
| M8 | Full parity (all phases D-J across all waves) | +125h ≈ 244h | The whole verbal layer is gone |

---

## § 9 — Calendar mapping (suggested cadence)

Assuming Barak ~3-5h/week on this (he's running a business with 137 customers in parallel):

| Block | Weeks | Goal |
|---|---|---|
| **Week 1** | sprint week | Barak: collect 5 OB artifacts to Drive (1-2h his time). Cloud: rows 3, 8 in parallel |
| **Weeks 2-3** | bank live | Local Claude: rows 1+2. M1 hit |
| **Weeks 4-5** | procurement live | Cloud + local: row 4. M2 hit |
| **Weeks 6-8** | ledger live | Cloud: rows 5, 6, 7. M3 hit |
| **Weeks 9-13** | proposals | Cloud + Barak (templates): rows 8-14. M4 hit |
| **Weeks 14-15** | couple + demo | Row 15+16. M5 hit. **🎯 Spine MVP** |
| **Months 4-6** | depth + parallel | Rows 17-23 in parallel sessions |

This is the **calendar Barak can hold**. Not aggressive, not slow.

---

## § 10 — How to track progress

Single source: this file gets `[done]` tags on rows as they ship. Each commit that lands a row updates row + adds a one-line note. Convention:

```
| 1 | 53/A Phase A → BEE app | 4h | local-cortex | ✅ 2026-06-25 — commit a1b2c3d. npm test green, 5 fixture tx round-trip. |
```

Burns to: `[[MVP_Build_Plan]]` Obsidian node · graphify re-extract · this commit log.

---

*Authored 2026-06-16 by cloud cortex after architecture lock. The build is now mechanical execution — every row has hours, owner, gate, blocker. No more design decisions needed for MVP scope. Burns on commit.*
