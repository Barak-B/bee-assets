---
name: customer-pulse-bee
version: 0.1.0
description: |
  Customer health score (0-100) per customer, with sentiment + activity +
  payment + SLA signals. Adapted from Anthropic SMB pack to BEE's WhatsApp +
  Gmail + Invoice Maven + BEE PG instead of Slack + HubSpot.
source: anthropic/knowledge-work-plugins/small-business/skills/customer-pulse
license: BEE-internal
---

# customer-pulse-bee — BEE port

## What it does

For each customer, computes a **health score 0-100** based on weighted signals.
Writes back to BEE app via `bee.updateCustomerHealthScore` (Q78 paradigm).

Used by:
- `/monday-brief` "Health alerts" section (auto-flags <50)
- `/quarterly-review` (one of the inputs to QBR narrative)
- customer-success-agent — triggers outreach when score drops
- BEE app portal — displays per-customer (Q73 confirmed partial portal)

## Inputs (per customer)

Pulled from multiple sources via MCP:

### Engagement signals (positive)
- `last_message_at` from WA — recent contact = healthy
- `response_rate_30d` — % of our messages they replied to
- `messages_count_30d` — volume of two-way conversation
- `met_in_person_30d` — site visits, formal meetings (from calendar)

### Payment signals
- `invoice_payment_lag_avg_days` — vs their tier_1/tier_2/tier_3 baseline
- `overdue_invoices_count` — currently outstanding past due
- `paid_on_time_rate_90d` — % of invoices paid on/before due date

### Activity signals (positive)
- `nps_last_score` — if NPS was sent recently
- `referrals_made_count` — referred new customer in past 12m
- `repeat_purchase_count` — projects bought beyond initial install

### Risk signals (negative)
- `complaints_count_30d` — formal complaint via `client-fault` intent
- `escalations_to_barak_count_30d` — issues that required Barak's direct attention
- `production_anomaly_count_30d` — sites underperforming forecast (engineering-agent flag)
- `competitor_mentions_count` — heard "we're looking at X" or similar
- `last_quote_outcome` — won/lost/no-response (lost lately = risk)

## Scoring formula

```python
def calc_health(c):
    score = 50  # neutral baseline
    
    # Engagement (+)
    if c.last_message_days < 14: score += 10
    elif c.last_message_days < 30: score += 5
    if c.response_rate_30d > 0.7: score += 8
    if c.met_in_person_30d > 0: score += 5
    
    # Payment (+/-)
    if c.paid_on_time_rate_90d > 0.9: score += 12
    elif c.paid_on_time_rate_90d > 0.7: score += 5
    elif c.paid_on_time_rate_90d < 0.5: score -= 15
    
    if c.overdue_invoices_count > 0: score -= 5 * c.overdue_invoices_count
    if c.invoice_payment_lag_avg_days > c.tier_baseline_lag * 1.5: score -= 10
    
    # Activity (+)
    if c.nps_last_score >= 9: score += 15
    elif c.nps_last_score >= 7: score += 5
    elif c.nps_last_score <= 6: score -= 20
    
    if c.referrals_made_count >= 1: score += 10
    if c.repeat_purchase_count >= 1: score += 8
    
    # Risk (-)
    score -= 8 * c.complaints_count_30d
    score -= 5 * c.escalations_to_barak_count_30d
    score -= 3 * c.production_anomaly_count_30d
    score -= 15 if c.competitor_mentions_count > 0 else 0
    score -= 10 if c.last_quote_outcome == "lost" else 0
    
    # Long silence override
    if c.last_message_days > 180:
        score = min(score, 30)  # dormant cap
    
    return max(0, min(100, score))
```

## Outputs

### 1. Per-customer record (writes to BEE app)

```javascript
await bee.updateCustomerHealthScore({
  id: customer.id,
  score: 78,
  reason: "On-time payments + 2 referrals; one complaint Apr 12 resolved",
  calculated_at: new Date().toISOString(),
});
```

### 2. Roll-up (used by /monday-brief)

```javascript
{
  total_customers: 137,
  scored: 132,
  unscored_thin_data: 5,
  distribution: {
    healthy_80_plus: 87,
    ok_50_to_79: 34,
    at_risk_30_to_49: 8,
    critical_under_30: 3,
  },
  newly_at_risk: [
    { id, name_he, score, prev_score, delta, top_reasons },
    ...
  ],
  newly_recovered: [...],
}
```

### 3. Per-customer detail (for QBR + portal)

```javascript
{
  customer_id,
  name_he,
  current_score: 78,
  trend_90d: "stable" | "improving" | "declining",
  history_points: [...],
  positive_signals: ["paid_on_time", "referral_2026_04", ...],
  risk_signals: ["lag_45_days_vs_baseline_30", ...],
  recommended_actions: [
    "Schedule check-in call (last contact 22 days ago)",
    "Send month-end production summary (high-value account)",
  ],
}
```

## MCP Dependencies

- `bee-mcp-server`:
  - `bee.listCustomers` — all 137
  - `bee.getCustomer(id)` — for nested data
  - `bee.updateCustomerHealthScore` — writeback (Q78)
- `invoice-maven-mcp`:
  - `listInvoices(customer_id, period=90d)` — payment lag
- WhatsApp / Hermes:
  - direct sqlite read of workspace.db for last_message_at + response rates
- KG (Neo4j):
  - Query for complaint count, escalations (from :Message :MENTIONS chains)

## Approval Gates

- ❌ Never sends to customer
- ❌ Never auto-emails Barak (briefs do that, controlled cadence)
- ✅ Writeback to BEE app is logged + reversible
- ✅ Per-customer detail surfaces only when score change > 15pts in 7d or drops below 50

## Schedule

```
Daily 02:00 — compute all health scores (off-peak)
On event — recompute when relevant signal changes (new complaint, paid invoice)
Weekly Sun — aggregate trend for /monday-brief
```

## Differences from Anthropic original

| Anthropic | BEE port |
|---|---|
| Slack + email sentiment | WhatsApp + WA reactions + Gmail thread analysis |
| HubSpot deal stage signals | Monday Deals board signals |
| English NLP for complaints | Hebrew DictaBERT for sentiment + intent classification |
| Stripe payment history | Invoice Maven payment lag |
| US enterprise account model | Israeli SLA tiers (tier_1 = Rafael / Palar) |
| Generic "engagement" metric | BEE-specific: site visits weight + production anomalies weight |

## Privacy

Reads customer message metadata + content. Per PPL Amendment 13 (Aug 2025):
- Health scoring is **internal use** — fine
- Do NOT export scores externally without customer consent
- Customer portal display (Q73) — only shows customer their own score
- Aggregate stats can be shared with partners (not individual scores)

## Time-to-build

| Sub-step | Hours |
|---|---|
| Score formula tuning | 4h (Barak input on weights) |
| Signal pullers (WA, invoices, KG) | 6h |
| MCP integrations | 3h |
| Schedule + scoring cron | 2h |
| BEE app portal UI integration | 5h |
| Tests with real customer data | 4h |
| QBR integration | 6h |
| **Total** | **30h** (matches v11 8.C estimate) |

## Integration with /quarterly-review

When generating QBR for a customer:
1. customer-pulse-bee runs in detail mode for that customer
2. Health history points feed the "Customer Health" section of QBR narrative
3. Risk signals become "Risks discussed" in the QBR
4. Recommended actions become "Next quarter focus" items

This **eliminates 6 hours of manual QBR prep** per customer per quarter.
For 5 enterprise customers: 30h saved per quarter = 120h/year.

## Test data

Use Rafael Solar (largest customer, 27 sites, 10.7MW) as primary test case:
- Should score 70-85 if relationship healthy
- Inject test complaint → score drops 8 points
- Inject delayed invoice → score drops 5 points
- Inject NPS=9 → score rises 15 points

Verify writeback in BEE app + portal display + KG `:Customer.health_score`.
