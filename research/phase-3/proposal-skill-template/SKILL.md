---
name: proposal-generator
version: 0.1.0
description: |
  Generate Hebrew RTL PDF proposals for BEE customers. Pulls design specs +
  BOM + pricing from BEE app (writes back via Q78 paradigm). Adapted from
  Anthropic price-check pattern (3-scenario pricing) for solar B2B contracts.
source:
  - master-plan-v1-v20.md v11 8.E
  - anthropic/knowledge-work-plugins/small-business/skills/price-check (pattern)
license: BEE-internal
---

# proposal-generator

## What it does

Given a project ID, generates a customer-facing proposal PDF (Hebrew RTL) with:
1. Cover page (BEE branding, customer name, project title, date)
2. Executive summary (Hebrew, 1 page)
3. Technical scope (system size, equipment list, install plan)
4. **3 pricing scenarios** (Anthropic price-check pattern):
   - **Essential** — minimum viable system
   - **Recommended** — what BEE thinks is right
   - **Premium** — with batteries, monitoring, extended warranty
5. BOM table (Hebrew, supplier-anonymized)
6. Production forecast (annual kWh + savings calculation)
7. Warranty terms (Hebrew per Israeli electrical code)
8. Timeline + milestones
9. Payment schedule
10. Signature blocks

## Inputs

```javascript
{
  project_id: "proj_xyz",                // from BEE app
  template: "commercial" | "residential",
  scenarios: ["essential", "recommended", "premium"],  // optional, default all 3
  output_format: "pdf" | "docx" | "both",
  delivery: "email" | "wa" | "both" | "draft-only",
}
```

## Pipeline

```
1. Fetch project from bee-mcp:
   - bee.getProject(project_id) → customer, site, design_spec, bom
   
2. If design_spec missing → call engineering-agent first
   - pv_design_calc + wire_sizing + protection + bom_generator

3. Generate 3 pricing scenarios:
   - essential = bom × 0.85 (smaller inverter, no battery)
   - recommended = bom × 1.0 (as-designed)
   - premium = bom × 1.25 (battery + extended warranty + premium panels)
   
   For each: compute total_cost_nis, markup, quoted_price, milestone schedule

4. Generate Hebrew prose sections:
   - Use Claude Sonnet (quality routing per Action #1)
   - Executive summary in 4 paragraphs (problem, solution, ROI, next step)
   - Technical scope in 2 sub-sections
   - Warranty in legalese-Hebrew (template-driven, not LLM-generated)

5. Render PDF:
   - Anthropic docx skill → convert to PDF
   - RTL layout, Heebo or David font, ₪ symbol convention
   - Embed BEE logo, customer's company logo if available

6. Write back to BEE app:
   - bee.attachProposal(project_id, pdf_url, scenarios_summary)
   - Increment project.proposal_count
   - Update status: "design" → "quoted"

7. Deliver:
   - email: Gmail send to customer.primary_contact_email + cc Barak
   - WA: send link + summary via Hermes /send (constitutional law:
         customer chat = approved customers in roster.yaml only)
   - draft-only: save to drive, notify Barak
```

## Approval gates

- ❌ NEVER auto-sends to customer without Barak approval
- ✅ Draft mode generates PDF + notifies Barak for review
- ✅ "Send" mode requires explicit `--approved-by barak` flag from /proposal command
- ✅ Audit log: every proposal generated tagged with version + reviewer

## MCP Dependencies

- `bee-mcp-server`:
  - `bee.getProject(id)` → full project context
  - `bee.attachProposal(project_id, ...)` → writeback
  - `bee.updateProjectStatus` → move to "quoted"
- `engineering-agent` (Phase 3b):
  - Provides design_spec + BOM if not already attached
- `anthropic-docx-skill`:
  - PDF generation with RTL Hebrew
- `anthropic-xlsx-skill`:
  - BOM table generation if separate doc needed

## Pricing logic (Anthropic price-check pattern, adapted)

Anthropic's `price-check` produces 3-scenario pricing for any product. BEE adaptation:

```
Essential:
  - Smallest inverter that meets target capacity
  - String inverter (not optimizers per panel)
  - No battery, no monitoring app
  - Standard 10y panel warranty
  - 12-month workmanship
  Markup: 25% (tighter margin to win price-sensitive)

Recommended:
  - Optimizers per panel (SolarEdge style)
  - WiFi monitoring app
  - 25y panel warranty (premium line)
  - 18-month workmanship
  - Markup: 35%

Premium:
  - Battery storage (5-10kWh)
  - 30y panel warranty
  - 24-month workmanship + extended SLA
  - Monthly performance report (delivered by customer-success-agent)
  - Quarterly site visit
  - Markup: 45%
```

Markup % is per :Customer.tier (tier_1 enterprise = lower markup, tier_3 retail = higher).

## Hebrew template anchors

The PDF template uses these Hebrew phrases (fixed, not LLM-generated):

```
"ברק אלקטריק אנג'ינירינג בע"מ"
"הצעת מחיר למערכת סולארית"
"לקוח/ה: {customer.name_he}"
"אתר: {site.name_he}, {site.city}"
"תאריך הצעה: {date_he}"
"תוקף ההצעה: 30 יום"
"הערכה לייצור שנתי: {annual_kwh} kWh"
"חיסכון מוערך: ₪{annual_savings_nis}/שנה"
"תקופת החזר השקעה: {payback_years} שנים"
"הסכם בעת חתימה: {milestone_1_amount} ₪"
"בעת אישור חיבור: {milestone_2_amount} ₪"
"בעת השלמת התקנה: {milestone_3_amount} ₪"
```

The dynamic parts (numbers, dates, customer details) are filled by the LLM
based on project data + engineering output.

## Time-to-build

| Sub-step | Hours |
|---|---|
| Hebrew RTL PDF template (BEE branding) | 6h |
| 3-scenario pricing engine | 4h |
| LLM prose generation prompts (Hebrew) | 6h |
| BOM table formatter | 3h |
| BEE app writeback integration | 3h |
| Email/WA delivery handlers | 3h |
| Tests with real project data | 3h |
| Approval workflow + audit log | 2h |
| **Total** | **30h** (matches v11 8.E estimate) |

## Test scenarios

1. **Small commercial** (10kWp Rafael Solar branch) — basic 3-scenario, no battery in Essential
2. **Large commercial** (200kWp חכל שדרות) — all 3 scenarios include monitoring + multi-string design
3. **Edge: customer has no email** — WA-only delivery
4. **Edge: design spec missing** — auto-trigger engineering-agent
5. **Edge: customer is new (no tier yet)** — default tier_3 markup
6. **Edge: existing project re-quote** — diff vs previous proposal highlighted

## Integration with QBR

When customer-success-agent generates QBR for a customer, it includes:
- Number of proposals sent in quarter
- Win rate (proposals → projects)
- Avg time to acceptance
- Lost proposals reasons (if customer told us)

This requires proposal-generator to log outcomes back to BEE app.

## ROI

- Manual proposal generation: 2-4h per proposal (Barak's time)
- Automated draft + Barak review: ~30 min per proposal
- Volume: ~30-50 proposals/year for BEE
- **Time saved: 60-150h/year**
- Build cost: 30h once
- Payback: **3-6 proposals** (~1 month at BEE volume)

## What this skill DOES NOT do

- Does not negotiate (negotiation is Barak-only, post-proposal)
- Does not send contracts (separate skill — contract-generator, Phase 4)
- Does not handle change orders (Phase 4)
- Does not auto-discount (per Israeli pricing law, discounts require manual approval)
