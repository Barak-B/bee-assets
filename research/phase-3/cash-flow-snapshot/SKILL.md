---
name: cash-flow-snapshot
version: 0.1.0
description: |
  30/60/90-day cash flow forecast with confidence bands and risk flags.
  Adapted from Anthropic SMB pack to BEE's stack: Invoice Maven (AR) +
  BEE Operations PostgreSQL (AP + recurring costs) instead of QuickBooks/PayPal.
source: anthropic/knowledge-work-plugins/small-business/skills/cash-flow-snapshot
license: BEE-internal
---

# cash-flow-snapshot — BEE port

## What it does

Generates 3 forecast windows:
- **30-day** — high-confidence (rolling avg of last 90 days)
- **60-day** — medium-confidence (rolling avg + seasonality factor)
- **90-day** — low-confidence (with explicit warning labels)

Each window produces:
- Expected cash in (AR collections)
- Expected cash out (AP + payroll + fixed costs)
- Net position end-of-window
- Confidence band ±X% based on variance in historical lag
- Risk flags (low-band negative? payroll shortfall? supplier overdue?)

## Inputs

User invocation patterns:
- `/cash` or `/cash-flow` — full 30/60/90
- `/cash 60` — just 60-day
- "מה התזרים שלי?" — natural language

## Outputs

1. **Chat summary** (Hebrew):
   ```
   💰 *תזרים מזומנים*
   
   30 ימים: צפי +₪347K (טווח: +₪289K עד +₪405K)
   60 ימים: צפי +₪692K (טווח: +₪520K עד +₪864K)
   90 ימים: צפי +₪1.04M (טווח: +₪780K עד +₪1.30M) ⚠️ ביטחון נמוך
   
   🚩 סיכונים:
   • Rafael Solar payment ₪80K — איחור 18 ימים (היסטוריה: 7-12 ימים)
   • Prime Energy חיוב נכנס ₪65K ב-15.6 — לבדוק תזרים
   • payroll ₪52K ב-25.6 — לוודא יתרה
   
   _פירוט: cash-flow-2026-05-26.xlsx_
   ```

2. **XLSX workbook** (saved to ~/.openclaw/workspace/reports/):
   - Sheet 1: Summary — 3 windows + risks
   - Sheet 2: Detail — transactions by window
   - Sheet 3: Customers — payment lag per customer (Rafael, Palar, etc.)
   - Sheet 4: Risks — full risk list with severity

## MCP Dependencies (Phase 2 pre-reqs)

- `invoice-maven-mcp` (or fallback: alfred-invoice-maven.js direct call)
  - `listOpenInvoices()` → AR aging
  - `listPaymentHistory(customer_id)` → lag analysis per customer
- `bee-mcp-server`
  - `bee.listCustomers(sla_tier=tier_1)` → enterprise weighting
  - `bee.listProjects(status=in-progress)` → expected milestone billings
  - `bee.listJobs(status=scheduled)` → labor cost estimate
- BEE Operations PostgreSQL (direct read for):
  - Fixed costs (rent, utilities, software subscriptions)
  - Payroll schedule
  - Supplier payment terms

## Approval Gates

- ❌ **Never** auto-takes financial action (no transfer, no invoice issue)
- ✅ Draft only — outputs report, Barak reviews + decides
- ✅ "Risk flags" alert but don't trigger anything beyond the brief
- ✅ Forecast IS a forecast — explicit ±band disclaimer

## Core algorithm

```
1. Pull AR aging from Invoice Maven (open invoices, days outstanding)
2. For each customer with ≥3 payments in history:
   - mean_lag_days = avg(paid_date - issued_date) over last 12 months
   - std_lag_days = stddev(...)
3. For customers with <3 payments:
   - default mean_lag_days = 30 (industry standard)
   - default std_lag_days = ±50% (wide band)
4. Project AR collections:
   - For each open invoice: expected_collected_at = issued_at + mean_lag_days
   - Falls in window? Add to that window's cash in
   - Confidence: lower bound = -1 std, upper bound = +1 std
5. Pull AP from BEE PG:
   - Supplier invoices not yet paid + payment_terms_days
   - Recurring fixed (rent, software, etc.)
   - Payroll schedule
6. Compute net per window = cash_in - cash_out
7. Flag risks:
   - Customers with lag > 2 std deviation (i.e., late)
   - Windows where lower-bound (cash_in - 1σ) - cash_out < 0
   - Single-customer concentration > 30% of inflows
8. Render Hebrew summary + xlsx
```

## Time-to-build

| Sub-step | Hours |
|---|---|
| Wire invoice-maven calls (or direct) | 2h |
| Wire bee-mcp calls | 2h |
| Variance + confidence math | 2h |
| Risk flag logic | 1h |
| Hebrew chat formatter | 1h |
| XLSX writer (use Anthropic xlsx skill) | 1h |
| Tests + edge cases | 1h |
| **Total** | **10h** |

## Test cases

1. Customer with rich payment history (≥10 payments) — narrow band
2. New customer with 1 payment — wide ±50% band, flagged "thin data"
3. All-customer concentration test — Rafael Solar = >30% inflows → concentration risk
4. Payroll-day stress — does cash drop below 0 day before payroll? alert
5. Hebrew rendering — RTL number formatting, ₪ symbol position
6. Edge: zero open invoices → "no forecast, all paid up" message
7. Edge: invoice-maven down → graceful fallback to direct BEE PG query

## Integration with briefs

`/monday-brief` calls `gatherCash()` which calls this skill in lightweight mode
(summary section only, no xlsx). Full report via explicit `/cash` command.

## Differences from Anthropic original

| Anthropic | BEE port |
|---|---|
| QuickBooks AR aging | Invoice Maven |
| PayPal/Stripe settlement | BEE PG payment_received events |
| US tax handling | N/A (Israeli VAT — monthly for BEE per LD-3, `VAT_PERIOD_MONTHS=1`; owned by 53/D, not here) |
| English output | Hebrew RTL output |
| Confidence ±50% default | Same |
| `--save-to files/desktop/both` | `--save-to drive/local/both` (Israeli cloud) |
| HubSpot deal pipeline weight | Monday Deals weight |

## Approval workflow

This skill outputs a brief + xlsx. Barak reviews and:
- If concerning → adjusts collection pressure (call overdue customer, etc.)
- If on track → no action
- If anomalous → opens issue: data corruption? customer churn? supplier issue?

Skill never auto-emails customers or auto-applies finance changes.
