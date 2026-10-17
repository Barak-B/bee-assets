---
name: customer-success-agent
version: 0.1.0
description: |
  Manages BEE's commercial customer relationships at scale (137 customers,
  top 5 = 22.7MW). SLA tracking, health scoring, QBR generation, proactive
  outreach. Borrows Anthropic customer-pulse + quarterly-review patterns,
  rewired to WhatsApp + Invoice Maven + BEE app. Per Q78: writes health +
  notes back to BEE app, surfaces in customer portal (Q73 confirmed).
license: BEE-internal
source:
  - master-plan-v1-v20.md v11 8.C
  - anthropic customer-pulse + quarterly-review (patterns)
runtime: hermes-agent
---

# customer-success-agent

## Charter

BEE's customers are **commercial/enterprise** (Rafael Solar 10.7MW, Palar 5.6MW,
חכל שדרות 2.6MW, etc.), not retail. They expect SLAs, QBRs, dedicated contact,
ROI tracking. This agent makes BEE feel like a much larger company to its
biggest accounts — without Barak doing it all manually.

## What it does

| Function | Sub-skill / source |
|---|---|
| Health scoring (0-100 per customer) | `customer-pulse-bee` (Anthropic port) |
| SLA tracking + breach alerts | new — `sla_tracker` |
| QBR generation (quarterly PDF) | `quarterly-review-bee` (Anthropic port) |
| Proactive outreach (low health → check-in) | new — `outreach_planner` |
| Production reporting (monthly savings) | uses engineering-agent performance_forecast |

## SLA tracking (new)

Per customer tier (from roster.yaml + BEE app):

```yaml
tier_1:  # Rafael, Palar, חכל שדרות, צרויה
  p1_outage:     {response_h: 2,  resolve_h: 8}
  p2_degraded:   {response_h: 8,  resolve_h: 24}
  p3_routine:    {response_h: 24, resolve_h: 120}
tier_2:  # האגודה למען החייל + mid-size
  p1_outage:     {response_h: 4,  resolve_h: 24}
  p2_degraded:   {response_h: 24, resolve_h: 72}
tier_3:  # retail / small
  best-effort
```

SLA timer flow:
```
Alert detected (bee.listAlerts)
  → start SLA timer based on customer tier + severity
  → 50% time elapsed without resolution → ⚡ Barak (warning)
  → SLA breach → ⚡⚡ Barak (critical) + log to customer record
  → resolution → stop timer, record actual response/resolve time
```

SLA performance feeds health score + QBR.

## Schedule

```
Daily 02:00  — recompute all health scores (customer-pulse-bee)
Continuous   — SLA timers on open alerts
Weekly Sun   — health trend aggregate → /monday-brief
Quarterly    — auto-generate QBR drafts for tier_1 customers
On-event     — health drop >15pts → propose outreach to Barak
```

## Proactive outreach (new)

```python
def plan_outreach(customer):
    triggers = []
    if customer.health_score < 50:
        triggers.append(("at-risk check-in", "high"))
    if customer.last_contact_days > 60 and customer.tier == "tier_1":
        triggers.append(("relationship maintenance", "medium"))
    if customer.had_complaint_recently:
        triggers.append(("post-resolution follow-up", "high"))
    if customer.anniversary_this_month:
        triggers.append(("anniversary touchpoint", "low"))
    # Agent DRAFTS outreach message, Barak approves + sends
    return draft_outreach_messages(customer, triggers)
```

**Approval gate:** all customer outreach is DRAFTED → posted to Drafts group
(`120363407758194119@g.us`) → Barak picks/edits/sends. Never auto-sends to
customers (4-destinations constitutional law).

## MCP dependencies

- `bee-mcp-server`: getCustomer, listCustomers, updateCustomerHealthScore,
  appendCustomerNote, listAlerts, getSiteProduction
- `invoice-maven-mcp`: payment history for health + QBR financials
- KG: customer relationships, complaint history, project history
- `anthropic-docx-skill`: QBR PDF
- WhatsApp/Hermes: outreach drafts to Drafts group

## Portal integration (Q73)

BEE app has partial customer portal. customer-success-agent feeds it:
- Health score (customer sees their own)
- Production dashboard (their sites)
- QBR history (downloadable PDFs)
- Open issues + SLA status

This makes the portal valuable → differentiator for tier_1 retention.

## Sub-skills

- `customer-pulse-bee.md` → see ../customer-pulse-bee/SKILL.md (already written)
- `quarterly-review-bee.md` → see below in this directory

## Build estimate

| Component | Hours |
|---|---|
| customer-pulse-bee (health scoring) | (30h — separate, see its SKILL.md) |
| sla_tracker | 8h |
| quarterly-review-bee (QBR gen) | 8h |
| outreach_planner | 5h |
| portal integration | 5h |
| tests | 4h |
| **Total (excl. customer-pulse)** | **30h** (matches v11 8.C) |

## ROI

- 5 tier_1 customers × 4 QBRs/year = 20 QBRs
- Manual QBR: ~6h each = 120h/year
- Automated draft + Barak review: ~1h each = 20h/year
- **Savings: 100h/year** just on QBRs
- Plus: SLA tracking prevents churn (1 retained tier_1 = ₪100Ks/year)
- Plus: proactive outreach catches at-risk before they leave

## Test scenarios

1. Health score for Rafael Solar → 70-85 if healthy
2. SLA timer: inject p1 outage tier_1 → 2h response clock starts
3. SLA breach → critical alert + logged to customer record
4. QBR for Palar → 6-section Hebrew PDF generated
5. Outreach: customer health drops to 45 → check-in draft to Drafts group
6. Portal: health score + production visible to customer
7. Anniversary touchpoint → low-priority draft
8. Never auto-sends to customer (verify constitutional compliance)
