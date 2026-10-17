# Decisions — 2026-06-16 session

> Closes all 10 open questions across `accounting-ledger/LLD.md`, `engineering-agent/LLD.md`, and `Wave_53_Unified_Data_Spine.md` §9. Per `protocol_hive.md` §3.6a, decisions here are now `[VERIFIED — operator decision]` and supersede any prior `[OPEN]` in the LLDs. Subsequent LLD patches reference this file as the source.

---

## A. Wave 53/D — accounting ledger

| # | Question | Answer | Impact |
|---|---|---|---|
| **LD-1** | רו"ח software | **Invoice Maven serves BOTH invoicing AND accounting** | The "accountant pack" export adapter (§3.6) targets Invoice Maven's own format — not Hashavshevet / Rivhit / Priority. The Drive-drop ↔ external-accountant workflow still applies (the human רו"ח consumes Invoice Maven's reports) but no third-party software bridge. **Simpler.** |
| **LD-2** | מקדמות rate | **0% (none)** | Drop `mikadmot` cron + `INCOME_TAX_ADVANCE_PCT` env + monthly מקדמות forecast logic. `TaxFiling.kind` enum shrinks: VAT + bituach-leumi only. |
| **LD-3** | VAT cadence | **Monthly** | `VAT_PERIOD_MONTHS=1`. Cron: `0 9 1 * *` (1st of every month) for draft, alert 15 days before due. **Higher cadence → tighter 13-week cashflow forecast** (monthly VAT outflows are bigger near-term load). |
| **LD-4** | Invoice numbering | **Continuous forever (#00142)** | `CustomerInvoice.invoiceNumber` generator = global monotonic. NO yearly reset. NO year prefix. Simpler generator: `SELECT MAX(invoiceNumber::int) + 1 FROM CustomerInvoice`. Historic invoice numbers from Invoice Maven set the starting point. |
| **LD-5** | Opening balances | **Import history from Invoice Maven** | NEW Phase A0 before A: bulk-load all existing customer + supplier balances from Invoice Maven. One-time, idempotent (hash-keyed by external IM ref). Posts to `LedgerEntry` with `manualRefId` carrying the IM identifier + a special `"opening-balance"` description. |

---

## B. Wave 54 — engineering-agent

| # | Question | Answer | Impact |
|---|---|---|---|
| **EA-1** | Cable table source | **Multi-vendor** — Barak uses several manufacturer tables, not one canonical | Schema change: `tables/cable-il.json` becomes `tables/cable-tables/<vendor>/<table-name>.json`. New field `WireSizingReq.preferredCableVendor?` (or auto-resolve from project). `wire_sizing` iterates the vendor's table for the chosen vendor; falls back to a "conservative" default vendor if none picked. **Critical: NO blending — the agent uses ONE vendor's table per design, not max of several.** Source citation on output names the table+vendor. |
| **EA-2** | DC/AC ratio max | **Per-inverter-manufacturer**, individual per model | Move from agent config → into `inverter-specs.json` row: `{model, mppt, voc_max, isc_max, vmpp_range, dcAcRatioMax, dcAcRatioRecommended}`. `pv_design_calc` reads this per inverter being considered. Sanity gate now: `design.dcAcRatio <= invertersSpec.dcAcRatioMax` (per model, not global). |
| **EA-3** | Inverter selection | **Try-all + best fit** | `pv_design_calc` iterates BEE's certified inverter set (KStar, SolarEdge, ABB, Deye), generates a candidate design per inverter, scores each, returns the best + alternatives. Scoring function (Tier 0): weighted (DC/AC ratio fit + string count efficiency + clipping forecast + BOM cost from Wave 53/B + Barak's `preferences.inverterBrand` if set). Returns top-3 with reasons. |
| **EA-4** | Shading model | **Vision LLM from photo** | `performance_forecast` upgrades from Tier 0 to **Tier 1 + Vision** (Claude Sonnet or Gemini vision — pick the cheaper-per-token at decision time). Required input: ≥1 site photo. Output: per-month shading factor (12 numbers) — richer than the original scalar plan. Cost impact: ~$0.05-0.15 per design. Cache per `siteId × season` so re-quotes don't re-burn. |
| **EA-5** | fault_analysis training set | **Yes — Barak has cases to share** | NEW model `FaultCase` (closed past tickets with: symptoms, telemetry pattern, root cause, fix, cost, hours). Phase G1 (before G): Barak shares 3-5 closed cases as fixtures → seed `FaultCase` table. `fault_analysis` looks up `FaultCase` first via similarity (pg_trgm on symptoms) before invoking DeepSeek pro — accelerates AND grounds reasoning. |

---

## C. Cross-cutting implementation notes

### C1. Vision-LLM in `performance_forecast` (EA-4)
- Now requires `siteId` to carry ≥1 photo asset. `engineering-agent` types must allow `site.photos: { sha256, mimeType, path }[]`.
- Cache: `DesignArtifact.requestHash` already includes site photos via their sha256 → identical photo set = cache hit. No re-burn.
- Failure mode: if no photo → throw `EngInputError("performance_forecast requires ≥1 site photo")` per protocol §3.6a. Do NOT silently fall back to scalar.
- Budget: assume 4 photos × 1 vision call = ~$0.05-0.10. Cap at $0.50 per design or alert.

### C2. Multi-vendor cable tables (EA-1)
- Layout:
  ```
  engineering-agent/tables/cable-tables/
    lapp/lapp-pv-2024.json
    prysmian/prysmian-il-2025.json
    israel-rad/rad-2023.json
    israel-teshi/teshi-2024.json
    _default.json    -> conservative blend (highest crosssection per ampacity)
  ```
- Each JSON declares: `vendor`, `source`, `standardRef` (e.g. "ת"י 1004 / IEC 60364-5-52"), `rows[{installMethod, ambientTempC, crossSectionMm2, ampacity, deratingFactor, resistanceOhmPerKm}]`.
- `wire_sizing` requires `req.cableVendor` (or defaults to `_default.json` with a warning). NO LLM fallback if no table covers — throws (protocol §3.4 rule).
- TODO: Barak shares the PDFs of his actual vendor tables → I parse into JSON.

### C3. Try-all inverter scoring (EA-3)
- Scoring function in `pv-design.ts`:
  ```typescript
  function scoreCandidate(c: DesignCandidate): number {
    return (
      (1 - Math.abs(c.dcAcRatio - c.inverterSpec.dcAcRatioRecommended) / 0.3) * 30 +   // DC/AC fit (30 pts)
      (c.stringConfigEfficiency * 25) +                                                  // string-count cleanliness
      (1 - c.clippingLossPct / 5) * 15 +                                                 // clipping (lower = better)
      (1 - c.bomCostCents / maxBomCents) * 20 +                                          // cost-relative
      (c.brand === req.preferences?.inverterBrand ? 10 : 0)                              // brand preference bonus
    );
  }
  ```
- Returns top-3 sorted descending; downstream proposal-generator uses #1 by default, lets Barak swap if he prefers another.

### C4. Invoice Maven export adapter (LD-1)
- Format: `invoice-maven-import.csv` per period — Invoice Maven supports CSV bulk-import for tx adjustments + invoice records.
- Adapter writes:
  - `customers.csv` — id, name, balance
  - `suppliers.csv` — id, name, balance
  - `transactions.csv` — date, side, amount, ref, description
  - Aging snapshots as PDF (read-only, for human reference)
- TODO: I need a real Invoice Maven CSV export sample from Barak to lock the exact columns.

### C5. Opening-balance import (LD-5)
- New CLI command: `ledger:import-opening --source invoice-maven --file <path>`
- Idempotent: each row gets `manualRefId = "IM-OPENING-${imRecordId}"`, hard-deduped on re-run.
- All entries posted with `description = "יתרת פתיחה מ-Invoice Maven (16/6/2026)"` for audit clarity.
- Single transaction — partial failure rolls back, no half-imported state.

---

## D. Patches to apply to existing LLDs

### Wave 53/D `accounting-ledger/LLD.md`
- §2 env vars: remove `INCOME_TAX_ADVANCE_PCT`, change `VAT_PERIOD_MONTHS` default to `1`
- §3.1: drop `'income-advance'` from `TaxFiling.kind` enum
- §3.6: rewrite "Accountant pack" → "Invoice Maven export pack"
- §4.4 crons: remove the מקדמות monthly cron; change VAT cron to monthly
- §5: add Phase A0 (opening-balance import from Invoice Maven, ~3h) before A
- §8: mark all 5 LD questions answered with date stamp pointing here

### Wave 54 `engineering-agent/LLD.md`
- §2 tables list: `cable-il.json` → `cable-tables/<vendor>/*.json`
- §2 `performance_forecast` tier: bump default from 0 to **1 (Vision)**
- §3.1 types: add `site.photos[]` to DesignSuiteReq, add `EngineeringAgent.designSuite` returns `top3InverterCandidates`
- §3.2 schema: extend `inverter-specs.json` row shape (dcAcRatioMax/Recommended per model); add `FaultCase` model
- §3.4 wire_sizing: now requires `req.cableVendor`, errors if no vendor table covers — no LLM escalation (rule unchanged)
- §5 phasing: insert **Phase G1 — FaultCase seeding (~3h, Barak shares closed cases)** before G
- §8: mark all 5 EA questions answered

### Master spine `Wave_53_Unified_Data_Spine.md`
- §9: collapse all 10 question rows to "✅ answered 2026-06-16 — see `decisions-2026-06-16.md`"

---

## E. What's still `[OPEN]` after this session

| # | Item | Who unblocks |
|---|---|---|
| OB-1 | Vendor cable-table PDFs (EA-1) — Barak shares PDFs → I parse JSON | Barak (low priority — Phase B+ of Wave 54) |
| OB-2 | Invoice Maven export sample (LD-1, LD-5) — Barak shares one period's export | Barak (blocks Phase A0 of Wave 53/D + the accountant adapter) |
| OB-3 | 3-5 closed fault cases (EA-5) — Barak shares as JSON fixture | Barak (blocks Phase G of Wave 54) |
| OB-4 | Real Mercantile portal CSV header strings (Z-A1 from spine §9) | Barak (blocks 53/A Phase B real-data run) |
| OB-5 | Per-tier scoring weights for `CustomerHealth` (CS-1 from Wave 55 §8) | Barak (default sensible if not specified) |

These are **artifacts to upload**, not architectural decisions. Single dropoff folder in Drive when Barak gets to it.

---

*Decisions burned 2026-06-16. From this commit forward, treat the answers above as `[VERIFIED]`. LLDs patched in the same commit.*
