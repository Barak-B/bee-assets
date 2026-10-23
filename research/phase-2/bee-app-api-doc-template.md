# BEE Operations App — HTTP API Documentation (Template)

**Phase 2 Action #14** — ~8h to fill (Barak provides actual routes).
**Source of truth:** BEE app source code (E:\bee-ops or wherever — Barak has access).
**Consumed by:** bee-mcp-server (Phase 2 Action #15), KG sync, Phase 3 agents.

## How to use this template

ברק יודע מה ה-41 routes ו-38 Prisma models. אני (סשן הענן) לא. ברק (או Claude Code לוקאלית עם access ל-source) ימלא כל סעיף עם:
- Endpoint exact path + method
- Auth requirements (most: JWT in Authorization header)
- Request shape (JSON schema or example)
- Response shape (example payload)
- Side effects (DB writes? webhook fires? KG sync? notifications?)
- Idempotency behavior

ה-MCP tools ב-bee-mcp-server-skeleton קוראים לroutes האלה. אם name doesn't match — לעדכן שם המקור.

---

## Authentication

**Pattern:** JWT bearer token.

Token source: `~/.openclaw/secrets/bee-integrations.env` → `BEE_JWT`.
Extracted from BEE Operations app's SQLite DB per v13 10.F.1.

Header:
```
Authorization: Bearer <JWT>
```

**TODO Barak:**
- [ ] Document JWT issuance flow (where does the token come from?)
- [ ] Document token lifetime / rotation policy
- [ ] Document per-route ACL (does Alfred token have less access than admin?)

---

## Customers — `/api/customers`

### `GET /api/customers`

**Query params:**
- `sla_tier` (string): tier_1 | tier_2 | tier_3
- `portal_only` (bool)
- `q` (string): substring search on name
- `limit` (int): default 50

**Response (example):**
```json
{
  "customers": [
    {
      "id": "rafael_solar",
      "name_he": "Rafael Solar",
      "type": "enterprise",
      "sites_count": 27,
      "total_capacity_mw": 10.7,
      "portal_access": true,
      "sla_tier": "tier_1",
      "primary_contact_id": "person_xyz",
      "created_at": "2023-...",
      "last_activity_at": "2026-05-...",
      "health_score": 87
    }
  ],
  "total": 137,
  "limit": 50,
  "offset": 0
}
```

**TODO Barak:**
- [ ] Confirm path (is it `/customers` or `/api/v1/customers`?)
- [ ] Confirm field names (camelCase or snake_case?)
- [ ] Confirm pagination (offset/limit or cursor?)

---

### `GET /api/customers/:id`

Full customer record.

**Response:** Include nested `sites: [...]`, `recent_projects: [...]`, `recent_alerts: [...]`, `recent_notes: [...]`.

**TODO Barak:**
- [ ] What nested data is included?
- [ ] Are there separate endpoints for nested resources (`/customers/:id/sites`)?

---

### `PATCH /api/customers/:id/health`

Update customer health score (computed by customer-success-agent).

**Request body:**
```json
{
  "score": 78,
  "reason": "NPS responded 8 + on-time payment last 3 months",
  "calculated_at": "2026-05-26T10:00:00Z"
}
```

**Side effects:**
- Updates `customers.health_score`
- Appends row to `customer_health_history` (audit trail)
- If score drops >15pts in 7d → fires alert

**TODO Barak:**
- [ ] Does the schema have `health_score` column? If not, add migration.
- [ ] Audit trail table name?

---

### `POST /api/customers/:id/notes`

Append a note to customer record.

**Request:**
```json
{
  "note": "Called Barak re. site 3 production — agreed to monthly check",
  "source": "call",
  "author_id": "agent",
  "visible_in_portal": false,
  "created_at": "2026-05-26T..."
}
```

**TODO Barak:**
- [ ] Does the schema have notes? If yes, table name? If no, add migration.
- [ ] Portal visibility flag — does the customer-facing portal respect this?

---

## Sites — `/api/sites`

### `GET /api/sites`

**Query params:**
- `customer_id`
- `city`
- `status`
- `capacity_min_kwp`
- `limit`

**Response:**
```json
{
  "sites": [
    {
      "id": "kfar-yuval",
      "name_he": "כפר יובל",
      "customer_id": "prime_energy_inst",
      "city": "כפר יובל",
      "lat": 33.234,
      "lon": 35.567,
      "capacity_kwp": 50,
      "status": "operational",
      "wa_group_id": "120363409665555113@g.us",
      "install_date": "2026-04-15",
      "last_production_kwh": 187,
      "last_alert_at": "2026-05-25T...",
      "equipment_count": 12
    }
  ],
  "total": 255
}
```

**TODO Barak:**
- [ ] Confirm schema fields
- [ ] Is `wa_group_id` already in BEE app? Or stored elsewhere (`sites/_mapping.json`)?

---

### `PATCH /api/sites/:id/status`

Promote site lifecycle status.

**Request:**
```json
{
  "new_status": "operational",
  "reason": "Final inspection passed by Erez Cohen 2026-05-26",
  "agent_id": "field-dispatch-agent",
  "changed_at": "2026-05-26T15:00:00Z"
}
```

**Side effects:**
- Updates `sites.status`
- Appends to `site_status_history`
- May fire customer notification if SLA-relevant
- KG sync queues `:Site.status` update

**TODO Barak:**
- [ ] Enum values for `new_status`?
- [ ] What triggers customer notification? Tier check?

---

### `POST /api/sites/:id/events`

Append event to site dossier (Hebrew table per AGENTS.md L437).

**Request:**
```json
{
  "event": "ניר התקין inverter נוסף + סנכרן מודולים",
  "event_type": "install",
  "source": "wa",
  "ts": "2026-05-26T..."
}
```

**TODO Barak:**
- [ ] Are site events in BEE app or only in `sites/<slug>.md` files?
- [ ] If only in files, this endpoint creates them. If in DB, schema?

---

### `GET /api/sites/:id/production`

Production data for a site.

**Query:** `?window=30d&granularity=day`

**Response:**
```json
{
  "site_id": "kfar-yuval",
  "window": "30d",
  "granularity": "day",
  "data": [
    {"date": "2026-04-26", "kwh": 234, "expected_kwh": 250},
    {"date": "2026-04-27", "kwh": 189, "expected_kwh": 250},
    ...
  ],
  "summary": {
    "total_kwh": 6987,
    "expected_kwh": 7500,
    "performance_ratio": 0.93,
    "anomaly_days": 2
  }
}
```

**TODO Barak:**
- [ ] Does BEE app aggregate this or proxy to SolarEdge/Sungrow APIs?
- [ ] What granularities are supported?

---

## Projects — `/api/projects`

Per v17 14.C.1: BEE 3-entity model = Customer → Site → **Project** → Job.

### `GET /api/projects` / `:id`

**TODO Barak:**
- [ ] Confirm Project table exists in Prisma
- [ ] Confirm fields: customer_id, site_id, name, type, status, value, dates
- [ ] What statuses?

### `POST /api/projects`

Create new project.

**TODO Barak:**
- [ ] Required fields?
- [ ] Auto-generated IDs (UUID? sequence?)?
- [ ] What fires on create? (e.g., team notification, KG sync, calendar block)

### `PATCH /api/projects/:id/status`, `/design`, `/bom`

Sub-resources for engineering-agent outputs.

**TODO Barak:**
- [ ] Confirm `projects.design_spec` JSONB column exists or add migration
- [ ] Confirm `projects.bom` JSONB column or related table

---

## Jobs — `/api/jobs`

**TODO Barak:**
- [ ] Does the app distinguish Job from Project? (currently MEMORY mentions 1,425 open jobs)
- [ ] Job assignment table schema?
- [ ] Job status enum?

(Endpoints follow same pattern as sites/projects — see `tools/jobs.js` for shape.)

---

## Alerts — `/api/alerts`

461 active alerts per MEMORY.md.

**TODO Barak:**
- [ ] What's the alert source? (SolarEdge webhook? Sungrow pull? both?)
- [ ] Alert table schema
- [ ] Resolution workflow

(Endpoints follow same pattern — see `tools/alerts.js` for shape.)

---

## Cross-cutting: Idempotency

For write operations (PATCH, POST), agents should pass `Idempotency-Key` header.

**TODO Barak:**
- [ ] Does BEE app support idempotency keys today?
- [ ] If not, table to store seen-keys?

---

## Cross-cutting: Webhooks (BEE → external)

When data changes in BEE app, external listeners (KG sync, customer portal) need to know.

**TODO Barak:**
- [ ] Does BEE app fire webhooks on entity changes?
- [ ] If yes, where to register endpoint URLs?
- [ ] Recommended event names: `customer.health_changed`, `site.status_changed`, `project.created`, etc.
- [ ] If no, KG sync uses pull-based hourly snapshot (acceptable for now).

---

## Once filled

1. Send to bee-mcp-server-skeleton author (cloud Claude or local Claude Code) for handler validation
2. Add unit tests to bee-mcp-server (`tools/*.test.js`)
3. Deploy MCP server (~30min, runbook in bee-mcp-server-skeleton/README.md)
4. Smoke test from Alfred + Hermes
5. Phase 3 agents can now build write-back logic
