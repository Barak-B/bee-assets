# Phase 2 — Foundation (Week 2-3, ~44h)

**Source:** master-plan-v1-v20.md v15 12.B + v19 16.A + v20 17.E
**Blocker for:** Phase 3+ agents (engineering, tender-agent full, customer-success)
**Pre-req:** Phase 1 done (currently: 5/7 actions complete per `phase-1-final-status.md`)

## 🎯 5 actions in Phase 2

| # | Action | Hours | File |
|---|---|---|---|
| 4 | roster.yaml apply (extend Phase 1 #4) | 1h | (manual edits to `alfred-identity.js` per `phase-1/alfred-identity-roster-patch.js`) |
| 7 | KG (Neo4j) foundation | 19h | `neo4j/` directory below |
| 11 | sites/_mapping.json (~150-180 entries) | 8h | `sites-mapping/` directory |
| 14 | BEE app write API doc + AI SDK | 8h | `bee-app-api-doc-template.md` (skeleton, Barak fills with actual route list) |
| 15 | bee-mcp-server build | 7h | `bee-mcp-server-skeleton/` |

## 🚧 Pre-conditions (from local session)

Per `phase-1-final-status.md`:
- ✅ Gateway restarted (DEEPSEEK trap fixed)
- ✅ Gmail OAuth done
- ✅ roster.yaml.populated applied
- ✅ Phase 1.5 Firecrawl + detail-fetcher functional

Phase 2 cannot proceed until:
- 🔒 BEE app source code accessible (for Action #14) — Barak provides git clone OR live session
- 🔒 workspace.db export complete (for Action #11) — `wa-contacts-export.md` produced CSV
- 🔒 bee-prod-1 SSH access (for Action #7) — Neo4j docker container deployment

## 🎯 The architecture goal

After Phase 2 complete, the stack looks like:

```
                  ┌─────────────────────────────┐
                  │   BEE Operations app        │  ← SOURCE OF TRUTH
                  │   (PostgreSQL on bee-prod-1)│     41 routes, 38 models
                  └────────────▲────────────────┘
                               │ writes back (Q78 paradigm)
                  ┌────────────┴────────────┐
                  │                          │
            ┌─────▼──────┐           ┌──────▼─────┐
            │  Alfred     │  ←─MCP→  │ Hermes     │
            │ (OpenClaw)  │           │ (DeepSeek) │
            └─────┬───────┘           └──────┬─────┘
                  │                           │
                  │  bee-mcp-server (Phase 2 #15)
                  │   ↓
              ┌───┴───────────────────────┴───┐
              │  Neo4j KG (Phase 2 #7)        │
              │   :Person, :Customer, :Site,  │
              │   :Project, :Job, :Equipment, │
              │   :Tender, :Quote, :Invoice   │
              └────────────▲──────────────────┘
                           │ populated by
                  ┌────────┴───────┐
              ┌───▼────┐       ┌───▼────┐
              │ roster │       │  sites │
              │  .yaml │       │_mapping│
              │        │       │  .json │
              └────────┘       └────────┘
                  ↑                ↑
              Phase 2 #4      Phase 2 #11
              (Phase 1.5 WA   (workspace.db
               contacts export) chat export)
```

## 📁 Files in this directory

```
phase-2/
├── README.md (this)
├── neo4j/
│   ├── README.md                     — deployment guide
│   ├── docker-compose.yml            — Neo4j 5 Community
│   ├── .env.example                  — env vars template
│   ├── schema.cypher                 — constraints, indexes, initial nodes
│   ├── seed-from-roster.py           — populate from roster.yaml
│   ├── seed-from-bee-snapshot.py     — populate from BEE app PostgreSQL snapshot
│   └── verify.cypher                 — smoke tests
├── sites-mapping/
│   ├── README.md
│   ├── generate-mapping.js           — match WA groups → BEE site IDs
│   └── _mapping.example.json
├── bee-mcp-server-skeleton/
│   ├── README.md
│   ├── package.json
│   ├── server.js                     — MCP server scaffolding
│   ├── tools/
│   │   ├── customers.js              — listCustomers, getCustomer
│   │   ├── sites.js                  — listSites, getSite, updateSite
│   │   ├── projects.js               — listProjects, createProject, updateProject
│   │   ├── jobs.js                   — listJobs, createJob, updateJob
│   │   └── alerts.js                 — listAlerts
│   └── auth.js                       — JWT from secrets/bee-integrations.env
└── bee-app-api-doc-template.md       — Barak fills with actual BEE app route list
```

## 🚀 Execution order

```
WEEK 2:
  Day 1: Neo4j deployment           (neo4j/, ~5h)
  Day 2: Schema + seed from roster  (neo4j/seed-*.py, ~6h)
  Day 3: BEE API doc draft           (Barak fills bee-app-api-doc-template.md, ~3h)
  Day 4: bee-mcp-server skeleton     (~4h)
  Day 5: sites/_mapping.json gen     (~6h)

WEEK 3:
  Day 1: BEE writeback wiring        (Q78 paradigm, ~6h)
  Day 2: KG mirror sync (BEE→KG)     (~5h)
  Day 3: Integration tests           (~3h)
  Day 4-5: Buffer + Phase 3 kickoff
```

Total: ~44h (per master-plan).

## 🔗 Next: Phase 3 agents (Weeks 4-8)

Once Phase 2 done, build:
- tender-agent FULL (v16 13.B, 38h)
- engineering-agent (v16 13.A, 60h)
- customer-success-agent (v11 8.C, 30h — adopts Anthropic `quarterly-review` + `customer-pulse`)
- proposal-generator (v11 8.E, 30h)

See `anthropic-smb-comparison.md` for template borrowing strategy.
