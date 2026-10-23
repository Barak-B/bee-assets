---
name: engineering-agent
version: 0.1.0
description: |
  PV solar engineering AI for BEE. Design, protection coordination, BOM,
  performance forecasting, fault analysis. The separator — Barak is an
  electrical engineer; Solar is Alfred goal #5 at 35% (lowest completion).
  Per Q78: writes design specs + BOM back to BEE app projects.
license: BEE-internal
source: master-plan-v1-v20.md v16 13.A + v19 16.A.2
runtime: hermes-agent
---

# engineering-agent

## Charter

Specialist sub-agent for solar PV **engineering** tasks (not monitoring — that's
solar-agent). Activates when a project needs technical design work, when an alert
needs fault analysis, or when a quote needs a BOM.

**This is BEE's competitive moat.** Generic SMB AI packs (Anthropic etc.) don't
touch trades engineering. BEE's edge is: licensed engineer + 255 sites + 149
inverters + Israeli electrical code knowledge. The engineering-agent encodes
that into a repeatable, auditable skill.

## Activation

```yaml
intents: [design-request, protection-review, bom-generate, forecast-production, fault-analysis]
keywords_he: [תכנון, הגנה, BOM, רשימת רכש, תחזית, ייצור, תקלה, ניתוח, סטרינג, מתח]
monday_transitions:
  - board: הקמות,  from: received,   to: engineering
  - board: Leads,  from: qualified,  to: design
mcp_triggers:
  - bee.getProject status changes to "design"
  - bee.listAlerts returns severity=high without diagnosis
```

## 6 sub-skills

Each is a self-contained module. See `sub-skills/` for detail.

| Sub-skill | Input | Output | Writes to BEE |
|---|---|---|---|
| `pv_design_calc` | site dims + target kWp + brands | string config + inverter selection | project.design_spec.layout |
| `wire_sizing` | string config + distances | DC/AC gauges + voltage drop | project.design_spec.wiring |
| `protection_coordination` | strings + inverter specs | breakers/fuses/RCD per IEC + תקנות | project.design_spec.protection |
| `bom_generator` | complete design | xlsx BOM + supplier pricing | project.bom |
| `performance_forecast` | site lat/lon + panels + tilt | annual kWh + degradation | site.production_forecast |
| `fault_analysis` | alert + SolarEdge data | ranked causes + actions + parts | alert.diagnosis |

## Standard library: Israeli electrical code

The agent references (must be embedded in skill prompt or RAG):
- **תקנות החשמל** (Israeli Electricity Regulations)
- **IEC 60364** (LV electrical installations)
- **IEC 62548** (PV array design requirements)
- **IEC 60947** (LV switchgear — breaker selection)
- **IEC 62446** (PV system testing + commissioning)
- **חברת החשמל** grid connection requirements
- **רשות החשמל** (PUA) tariff + net-metering rules

regulatory-agent (existing skill) already monitors these — engineering-agent
reads the curated rules from regulatory-agent's knowledge base.

## Provider routing

Per Action #1 smart router: engineering = **high-quality tier** → Claude Sonnet
(reasoning-critical, liability-sensitive). NOT DeepSeek-flash (too risky for
protection coordination math).

## Trust progression

- **L0 (default, likely permanent):** Generate drafts. Barak reviews EVERY output.
  Engineering decisions = liability. Never auto-issue.
- **L1 (after 30+ approvals on simple residential):** Auto-issue design for
  <5kWp residential single-phase. Still Barak approves before customer sees.
- **L2:** Unlikely to reach. Engineering judgment stays human-in-loop.

## Memory + KG

```cypher
// engineering-agent queries KG for "have I designed something like this before?"
MATCH (p:Project)-[:AT_SITE]->(s:Site)
WHERE s.roof_type = $roof_type
  AND abs(s.capacity_kwp - $target_kwp) < 10
  AND p.design_spec IS NOT NULL
RETURN p.id, p.design_spec, s.name
ORDER BY abs(s.capacity_kwp - $target_kwp) ASC
LIMIT 3
// Reuse proven designs → faster + consistent
```

## Approval gates (per output)

| Output | Gate |
|---|---|
| Design spec | Barak reviews layout + string config before BOM |
| BOM with pricing | Barak approves supplier choices + markup |
| Protection plan | Barak (licensed) signs off — REQUIRED, never skip |
| Performance forecast | Auto-OK (it's an estimate, clearly labeled) |
| Fault diagnosis | Barak confirms before dispatching tech |

**Critical:** protection_coordination output MUST be reviewed by Barak (licensed
electrical inspector). The agent drafts; the human certifies. This is both legal
(Israeli code requires licensed sign-off) and safety-critical.

## Outputs format

All design outputs → BEE app project record (Q78). Also generates:
- **Hebrew engineering report** (docx → PDF) for customer
- **BOM xlsx** for procurement
- **Single-line diagram** (text description → AutoCAD-importable, Phase 4)

## Build estimate

| Sub-skill | Hours |
|---|---|
| pv_design_calc | 8h |
| wire_sizing | 6h |
| protection_coordination | 8h |
| bom_generator | 6h |
| performance_forecast | 6h |
| fault_analysis | 6h |
| KG integration (similar-design recall) | 4h |
| BEE writeback (project.design_spec etc.) | 4h |
| Hebrew report template | 6h |
| Tests (10 scenarios) | 6h |
| **Total** | **60h** |

## Why 60h (not the v16 50h estimate)

v16 estimated 50h. Revised +10h because Q78 writeback (project.design_spec,
project.bom attachment) + KG similar-design recall weren't in original scope.
The writeback integration is what makes outputs useful (vs files in a folder).

## Test scenarios (must pass before L0→L1)

1. ✅ 5kWp residential, SolarEdge + LG panels, flat roof
2. ✅ 50kWp commercial, Sungrow + Jinko, tilted
3. ✅ Wire sizing 100m DC run, voltage drop <2%
4. ✅ Protection coordination 100kWp 3-phase + RCD type B
5. ✅ BOM finds cheapest supplier combo (Deye vs Solar-Space vs Prime)
6. ✅ Performance forecast for חיפה with 0.15 shading
7. ✅ Fault analysis "string current low" → ranked causes
8. ✅ Re-design after panel model discontinued
9. ✅ Hebrew report RTL + correct ₪ + correct units
10. ✅ KG recall: finds 3 similar past designs
11. ✅ Writeback: project.design_spec populated in BEE app
12. ✅ Protection output flagged "REQUIRES BARAK SIGN-OFF"

## Integration with proposal-generator (Phase 3d)

engineering-agent produces design + BOM → proposal-generator wraps it in
3-scenario pricing + Hebrew prose → customer-facing PDF. The two chain:

```
project status "design"
   → engineering-agent (design + BOM + forecast)
   → proposal-generator (3 scenarios + Hebrew + PDF)
   → bee.attachProposal + status "quoted"
   → customer
```

## ROI

- ~200 designs/year at BEE volume
- Manual: 4-6h engineer time per design
- AI-augmented: ~1h (30min review + Barak adjustments)
- **Savings: ~1000h/year of Barak's engineering time**
- Build: 60h once
- **Payback: ~12 designs (~3 weeks at BEE volume)**
- Raises Alfred Solar goal from 35% → ~70%
