# sub-skill: submission_tracker

**Parent:** tender-agent (FULL)
**Purpose:** Track tender outcomes. On win → create :Project in BEE app (Q78). On loss → log reason for learning.

## States

```
open → applying → submitted → [awarded | rejected | withdrawn]
                                  │
                                  ├── awarded → create :Project + notify
                                  └── rejected → log reason → learning loop
```

## Inputs (events)

```json
// Barak confirms submission
{"action": "submitted", "tender_id": "...", "submitted_at": "...", "bid_value_nis": 890000}

// Outcome arrives (Barak relays, or portal scrape)
{"action": "result", "tender_id": "...", "outcome": "awarded" | "rejected",
 "reason": "price too high" | "won on quality", "winner_competitor": "..."}
```

## On WIN — create Project (Q78 paradigm)

```javascript
async function onTenderWon(tender) {
  // 1. Create customer if new (municipality/gov entity)
  let customer = await bee.getCustomer(tender.issuer_id).catch(() => null);
  if (!customer) {
    customer = await bee.createCustomer({
      name_he: tender.issuer_name,
      type: "government",
      sla_tier: "tier_1",  // public sector = high priority
    });
  }

  // 2. Create project linked to tender
  const project = await bee.createProject({
    customer_id: customer.id,
    site_id: tender.site_id || "TBD",  // may need site creation
    name_he: tender.name_he,
    type: "new-install",
    contract_value_nis: tender.bid_value_nis,
    source: "tender",
    source_ref_id: tender.id,
  });

  // 3. Link in KG
  await kg.run(`
    MATCH (t:Tender {id: $tid}), (p:Project {id: $pid})
    MERGE (t)-[:RESULTED_IN]->(p)
  `, { tid: tender.id, pid: project.id });

  // 4. Update tender status
  await bee.updateTender(tender.id, { status: "awarded", project_id: project.id });

  // 5. Notify Barak — kickoff
  await notifyBarak(`🏆 *זכינו במכרז!*\n${tender.name_he}\n` +
    `ערך: ₪${tender.bid_value_nis.toLocaleString()}\n` +
    `Project ${project.id} נוצר. להתחיל engineering + scheduling.`);

  // 6. Trigger engineering-agent for the design
  // (if site known — else field visit first)
}
```

## On LOSS — learning loop

```javascript
async function onTenderLost(tender, reason) {
  await bee.updateTender(tender.id, { status: "rejected", loss_reason: reason });

  // Store for learning
  await kg.run(`
    MATCH (t:Tender {id: $tid})
    SET t.loss_reason = $reason, t.winner = $winner
  `, { tid: tender.id, reason, winner: tender.winner_competitor });

  // Analyze pattern (monthly)
  // - Losing on price repeatedly? → margin too high, or cost too high
  // - Losing on quality/experience? → capability gap
  // - Losing to same competitor? → competitive intel needed
  await notifyBarak(`מכרז ${tender.name_he} לא זכינו (${reason}).\n` +
    `מתועד ל-learning. ${await lossPatternSummary()}`);
}
```

## Win-rate analytics (feeds /quarterly-review + /monday-brief)

```javascript
{
  period: "2026-Q2",
  tenders_tracked: 24,
  submitted: 8,
  won: 3,
  lost: 4,
  pending: 1,
  win_rate_pct: 43,   // won / (won + lost)
  total_won_value_nis: 2300000,
  loss_reasons: {"price": 2, "experience": 1, "incomplete-docs": 1},
  top_competitor: "SolarCo Ltd (won 2 we lost)"
}
```

## Approval gate

- ✅ Tracking is read-only monitoring — auto-OK
- ✅ createProject on win — but notify Barak immediately (he kicks off work)
- ❌ Never auto-commits resources before Barak confirms the win is real

## Tests
1. Submitted → status tracked, deadline-watcher stops alerting
2. Won → :Project created + KG link + Barak notified
3. Won + new gov customer → :Customer created (tier_1)
4. Lost → reason logged + learning analysis
5. Win-rate calc → feeds quarterly-review
6. Loss pattern → "losing on price 2×" surfaced
