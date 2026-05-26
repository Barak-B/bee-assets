---
name: tender-agent
version: 0.2.0
description: |
  FULL tender lifecycle agent. Extends the Phase 1 MVP (tender-tracker-mvp)
  with document aggregation, Hebrew RFP draft preparation, and submission
  tracking. Highest single-agent ROI — we lost ₪800K-3M to missed Ashkelon +
  Kiryat Gat tenders. Per Q78: creates :Project in BEE app on win.
license: BEE-internal
source: master-plan-v1-v20.md v16 13.B + v18 15.A
runtime: hermes-agent
extends: phase-1/tender-tracker-mvp
---

# tender-agent (FULL)

## What's new vs Phase 1 MVP

The MVP (already built + capturing real tenders) does: ingest + dedup + Monday
sync + deadline alerts. The FULL agent adds 3 sub-skills:

| Sub-skill | New in FULL | Purpose |
|---|---|---|
| `tender_ingest` | ✅ from MVP | gov.il + municipal scrape (+ Firecrawl from Phase 1.5) |
| `deadline_watcher` | ✅ from MVP | T-30/14/7/3/1/0 alert chain |
| **`document_aggregator`** | 🆕 Phase 3 | Gather required docs (insurance, financials, licenses) |
| **`draft_preparer`** | 🆕 Phase 3 | Draft Hebrew RFP response from BEE capabilities |
| **`submission_tracker`** | 🆕 Phase 3 | Track applied/won/lost + create :Project on win |

## Full lifecycle

```
1. INGEST (MVP) — daily scan → :Tender in BEE app + Monday board
2. TRIAGE — score fit: is this a BEE-type project? capacity? location? value?
3. DEADLINE WATCH (MVP) — alert chain
4. DOCUMENT AGGREGATE (new) — checklist + gather what's available
5. DRAFT PREPARE (new) — Hebrew technical + commercial response draft
6. BARAK REVIEW — always; Barak finalizes pricing + signs
7. SUBMIT — Barak submits (agent tracks)
8. TRACK (new) — won → create :Project; lost → log reason for learning
```

## Triage scoring (new — decides pursue/skip)

```python
def score_tender_fit(t):
    score = 0
    # Type fit
    if any(kw in t.name_he for kw in ["סולא", "פוטו-וולט", "חשמל", "אנרגיה", "טעינה"]):
        score += 40
    # Capacity fit (BEE sweet spot 10kWp-500kWp)
    if t.estimated_capacity_kwp and 10 <= t.estimated_capacity_kwp <= 500:
        score += 20
    # Geographic fit (BEE service area — Negev + south + center)
    if t.city in BEE_SERVICE_CITIES:
        score += 15
    # Value fit (worth the bid effort)
    if t.estimated_value_nis and t.estimated_value_nis >= 200000:
        score += 15
    # Past win on similar (KG)
    if kg_similar_tender_won(t):
        score += 10
    return score   # >60 = pursue, 40-60 = Barak decides, <40 = skip
```

## MCP dependencies

- `bee-mcp-server`: `bee.createProject` (on win), `bee.getCustomer` (if known)
- `firecrawl` (Phase 1.5): scrape SPA/Cloudflare municipal sites
- KG: `:Tender` nodes, similar-tender recall, `:Tender-[:RESULTED_IN]->:Project`
- `anthropic-docx-skill`: Hebrew RFP response generation
- `proposal-generator` (Phase 3d): reuse pricing engine for bid pricing

## Sub-skills detail

See `sub-skills/`:
- `document_aggregator.md`
- `draft_preparer.md`
- `submission_tracker.md`

(ingest + deadline_watcher already in `phase-1/tender-tracker-mvp/`)

## Approval gates

- ❌ NEVER submits a tender (Barak submits — legal commitment)
- ❌ NEVER commits pricing without Barak (binding offer)
- ✅ Drafts everything, Barak reviews + finalizes
- ✅ Triage proposes pursue/skip, Barak confirms
- ✅ Auto-tracks deadlines + status (read-only monitoring OK)

## ROI — the headline

- חוף אשקלון missed: est ₪500K-2M
- קרית גת missed: est ₪300K-1M
- **1 captured tender ≥ build cost ×1000s**
- The MVP already caught Kiryat Gat 02/2026 + 15/2025 in dry-run
- FULL agent makes capture → submission → win a tracked pipeline

## Build estimate

| Sub-skill | Hours |
|---|---|
| triage scoring | 4h |
| document_aggregator | 6h |
| draft_preparer (Hebrew RFP) | 8h |
| submission_tracker + KG :Project link | 4h |
| Firecrawl integration (from Phase 1.5) | 3h |
| BEE writeback (createProject on win) | 3h |
| Tests | 4h |
| **Total (FULL, beyond MVP)** | **32h** |

(MVP was ~4h Phase 1. FULL adds 32h in Phase 3a.)

## Test scenarios

1. Ingest Kiryat Gat tender → triage score >60 → pursue
2. Out-of-area tender (Eilat, far) → triage <40 → skip suggestion
3. Document aggregator → checklist, finds insurance cert + license, flags missing financials
4. Draft preparer → Hebrew RFP technical section from BEE capabilities
5. Submission tracker → mark submitted → on win, :Project auto-created
6. Lost tender → reason logged → learning loop
7. Deadline T-3 → urgent alert → Barak finalizes
8. Firecrawl captures Ashkelon SPA tender (was previously broken)
