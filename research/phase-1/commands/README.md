# Phase 1 Additions — Commands Layer (Anthropic-borrowed)

**Source:** anthropic-smb-comparison.md §10 (Phase 1 additions Action #17, #18)
**Hours:** ~6h total (3h each)
**ROI:** 8/10
**Pattern:** Anthropic's `/monday-brief` and `/friday-brief` cadence triplet

## ה-pattern החדש

Anthropic's SMB pack uses **3-layer architecture**:
1. Atomic skills (e.g., `lead-triage`, `cash-flow-snapshot`)
2. **Commands** (e.g., `/sales-brief`, `/monday-brief`) — multi-step workflows
3. Router (`smb-router`)

BEE היום יש (1) atomic skills + (3) intent router (alfred-router.js), אבל **חסר (2) commands layer**.

`/monday-brief` ו-`/friday-brief` הם **הraod ה-ראשון** ל-commands layer. אחרי שהם עובדים → patterning יחזור לעוד commands (`/customer-checkup`, `/tender-review`, `/quarterly-review`).

## ה-2 commands

### `/monday-brief` — Start of Israeli work week (Sunday)

**Trigger:** WhatsApp message to self `/monday-brief` (or auto-cron Sun 07:00).

**Output:** Single message to self-chat with this week's plan:
1. **Pipeline pulse** — open quotes + their age, deals close-to-close
2. **Job schedule** — top 5 jobs for the week from Monday הקמות
3. **Tender deadlines** — anything due this week (from tender-tracker)
4. **Health alerts** — any customer health score <50? open critical alerts?
5. **Cash position** — AR aging snapshot (if Invoice Maven integration up)
6. **Tomorrow's calendar** — call-out for next-day commitments

**Atomic skills called:**
- `lead-triage` (Anthropic pattern adapted to Monday Leads)
- `alfred-monday.js` (existing)
- `alfred-deadlines.js` (existing — extends with tender deadlines)
- `alfred-calendar.js` (existing — 3-calendar lock)
- `bee-mcp/customers.listCustomers(health < 50)` (Phase 2 dep)

**Note:** Sunday is start-of-week in Israel, not Monday. The command name uses `monday-` for compatibility with Anthropic pattern, but cron is Sun 07:00 Asia/Jerusalem.

### `/friday-brief` — End of Israeli work week (Thursday eve)

**Trigger:** `/friday-brief` or auto-cron Thu 17:00 Asia/Jerusalem.

**Output:**
1. **What got done this week** — Monday Activities + completed jobs
2. **What slipped** — overdue items + reasons
3. **Wins** — closed deals + delivered installations
4. **Cash collected this week** — invoices paid + outstanding
5. **Top 3 things for next week** — auto-generated from open priority items
6. **Tickets needing Barak attention over weekend** — if any (rare)

**Atomic skills called:**
- `alfred-monday.js` (Activities board)
- `alfred-invoice-maven.js` (paid invoices this week)
- `alfred-customer360.js` (open items)
- `bee-mcp/projects.listProjects(updated_this_week)` (Phase 2 dep)

## Files

```
commands/
├── README.md (this)
├── monday-brief.js         — full implementation (~150 LOC)
├── friday-brief.js         — full implementation (~150 LOC)
├── shared/
│   ├── format-brief.js     — Hebrew formatter for self-chat output
│   └── data-aggregator.js  — fan-out to atomic skills + collect
└── tests/
    ├── monday-brief.test.js
    └── friday-brief.test.js
```

## Deploy

```bash
# 1. Copy to Alfred workspace
cp -r commands ~/.openclaw/workspace/commands/

# 2. Register router hook in alfred-router.js
# Add intent: { match: /^\/monday-brief/, handler: "commands/monday-brief.js" }
# Add intent: { match: /^\/friday-brief/, handler: "commands/friday-brief.js" }

# 3. Register crons
openclaw cron add monday-brief --schedule "0 7 * * 0" --script "commands/monday-brief.js" --tz "Asia/Jerusalem"
openclaw cron add friday-brief --schedule "0 17 * * 4" --script "commands/friday-brief.js" --tz "Asia/Jerusalem"

# 4. Test manually
node ~/.openclaw/workspace/commands/monday-brief.js --dry-run
node ~/.openclaw/workspace/commands/friday-brief.js --dry-run
```

## After deploy

Watch for the first Sun 07:00 brief in self-chat. If something's missing
or format is awkward → easy iteration (single file edit). After 1-2 weeks
of refinement, this becomes the template for:
- `/customer-checkup` — per-customer health drill-down
- `/tender-review` — weekly tender pipeline review
- `/quarterly-review` — QBR for enterprise customer (Phase 3+)

This is **the commands layer** Anthropic pack uses; we're building it
BEE-shaped, on BEE's own data.
