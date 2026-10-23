# Phase 3 — Specialized Agents + Anthropic Skill Ports

**Source:** master-plan-v1-v20.md v20 17.E (Phase 3 = Weeks 4-8, ~152h) +
            anthropic-smb-comparison.md §10
**Pre-req:** Phase 2 complete (KG + bee-mcp-server + roster + sites-mapping)
**Architecture:** Q78 paradigm — agents write back to BEE app

## What's in Phase 3

5 specialized agents + 2 skill ports:

| # | Agent / Skill | Hours | Source | Status |
|---|---|---|---|---|
| 3a | **tender-agent FULL** | 38h | v16 13.B (extends MVP) | scaffolding in `tender-agent/` |
| 3b | **engineering-agent** | 60h | v16 13.A | scaffolding in `engineering-agent/` |
| 3c | **customer-success-agent** | 30h | v11 8.C + Anthropic customer-pulse + quarterly-review | template in `customer-success-agent/` |
| 3d | **proposal-generator** | 30h | v11 8.E + Anthropic price-check | template in `proposal-skill-template/` |
| 3e | **cash-flow-snapshot port** | 10h | Anthropic skill, rewired to Invoice Maven + BEE PG | `cash-flow-snapshot/` |
| 3f | **customer-pulse port** | bundled in 3c | Anthropic skill | `customer-pulse-bee/` |
| 3g | **field-dispatch-agent** | 34h | v11 8.D | Phase 4 — deferred |

Total Phase 3a-f: ~152h.

## Build order

Following v20 17.E:

```
WEEK 4-5: tender-agent FULL (38h)
  - Highest ROI: each tender ≥ ₪500K, we lost ₪800K-3M to Ashkelon+Kiryat Gat
  - Extends Phase 1 MVP with: documents, draft Hebrew RFP, submission tracker
  - Uses: bee-mcp.createProject on win, KG :Tender ↔ :Project link

WEEK 6-7: engineering-agent (60h)
  - Highest leverage: Solar @ 35% goal → 70%
  - 6 sub-skills (design / wire / protection / BOM / forecast / fault)
  - Writes to BEE: project.design_spec, project.bom, alert.diagnosis

WEEK 8: customer-success-agent (30h)
  - Borrows: Anthropic customer-pulse (health score) + quarterly-review (QBR PDF)
  - Writes to BEE: customer.health_score, customer.notes
  - Extends BEE portal (Q73 yes) with health UI
  - One-off /quarterly-review command for top 5 customers
```

Skill ports (cash-flow + proposal-generator) drop in around week 5-7 as utility skills.

## Why Phase 3 needs Phase 2

Every Phase 3 deliverable assumes:
- ✅ bee-mcp-server up — for writeback (Q78)
- ✅ KG Neo4j running — for cross-entity queries
- ✅ roster.yaml applied — for entity resolution
- ✅ sites/_mapping.json populated — for site dossier updates

If any of these missing → Phase 3 agents either crash or fall back to file-only outputs (regression from Q78 paradigm).

## Layout

```
phase-3/
├── README.md (this)
├── tender-agent/                    — Phase 3a, extends Phase 1 MVP
│   ├── README.md
│   ├── SKILL.md                     — full spec following Anthropic pattern
│   └── sub-skills/
│       ├── tender_ingest.js         — already in phase-1/tender-tracker-mvp
│       ├── deadline_watcher.js      — already exists
│       ├── document_aggregator.js   — NEW Phase 3
│       ├── draft_preparer.js        — NEW Phase 3 (Hebrew RFP)
│       └── submission_tracker.js    — NEW Phase 3
├── engineering-agent/               — Phase 3b
│   ├── README.md
│   ├── SKILL.md                     — full spec
│   └── sub-skills/
│       ├── pv_design_calc.md
│       ├── wire_sizing.md
│       ├── protection_coordination.md
│       ├── bom_generator.md
│       ├── performance_forecast.md
│       └── fault_analysis.md
├── customer-success-agent/          — Phase 3c
│   ├── README.md
│   ├── SKILL.md
│   ├── customer-pulse-bee.md        — borrowed from Anthropic
│   └── quarterly-review-bee.md      — borrowed from Anthropic
├── cash-flow-snapshot/              — Phase 3e (Anthropic port)
│   ├── README.md
│   └── SKILL.md                     — full port spec
├── customer-pulse-bee/              — Phase 3f (Anthropic port)
│   ├── README.md
│   └── SKILL.md
└── proposal-skill-template/         — Phase 3d
    ├── README.md
    └── SKILL.md
```

## Reading order

For local execution session:
1. **`tender-agent/SKILL.md`** — start here, most concrete
2. **`engineering-agent/SKILL.md`** — solar surface (engineer-led)
3. **`cash-flow-snapshot/SKILL.md`** — quickest win (10h)
4. Others as you reach them.
