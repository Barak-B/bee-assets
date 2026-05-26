# bee-mcp-server — Phase 2 Action #15

**Source:** master-plan-v1-v20.md v19 16.A (Q78 paradigm)
**Time:** ~7h
**Host:** bee-prod-1 (same VPS as BEE app, internal-only)
**Port:** 18791 (Bind 127.0.0.1 or Tailscale IP)

## Purpose

Per **Q78 paradigm**: AI agents (engineering, tender, customer-success, etc.)
write outputs **back to BEE app** rather than producing side files. This MCP
server is the bridge — exposes BEE's HTTP API as MCP tools to Alfred + Hermes.

```
Alfred / Hermes
       │
       │ MCP call: bee.updateSiteStatus(id="kfar-yuval", new_status="operational")
       ▼
bee-mcp-server (port 18791)
       │
       │ HTTP PATCH /api/sites/kfar-yuval/status (JWT auth)
       ▼
BEE Operations app (port 3001 internal)
       │
       │ Updates PostgreSQL
       ▼
[ Optional: webhook out → KG sync ]
```

## Tools provided (20 total across 5 modules)

| Module | Tools | Purpose |
|---|---|---|
| **customers** | listCustomers, getCustomer, updateCustomerHealthScore, appendCustomerNote | Customer record CRUD + health |
| **sites** | listSites, getSite, updateSiteStatus, appendSiteEvent, getSiteProduction | Site lifecycle + dossier |
| **projects** | listProjects, getProject, createProject, updateProjectStatus, attachDesignSpec, attachBom | Project lifecycle |
| **jobs** | listJobs, getJob, createJob, assignJob, updateJobStatus | Job dispatch + status |
| **alerts** | listAlerts, getAlert, diagnoseAlert, acknowledgeAlert, resolveAlert | Alert triage + AI diagnosis |

Each tool follows MCP-standard shape and is documented in its source file.

## Install + run

```bash
# On bee-prod-1
cd ~/bee-mcp-server
npm install

# Set env
cp ../.env.example .env
# Edit .env:
#   BEE_API_BASE=http://localhost:3001/api
#   BEE_JWT=<from secrets/bee-integrations.env>
#   BEE_MCP_PORT=18791
#   BEE_MCP_BIND=127.0.0.1   (or 100.x.y.z for Tailscale)

# Start
npm start

# Or as a service (recommended)
# /etc/systemd/system/bee-mcp-server.service ↓
```

### Systemd service (recommended)

```ini
[Unit]
Description=BEE MCP Server
After=network.target

[Service]
Type=simple
User=barak
WorkingDirectory=/home/barak/bee-mcp-server
EnvironmentFile=/home/barak/bee-mcp-server/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now bee-mcp-server
sudo systemctl status bee-mcp-server
```

## Register in Alfred + Hermes

### Alfred (~/.openclaw/openclaw.json)

```json
{
  "mcpServers": {
    "bee": {
      "type": "http",
      "url": "http://bee-prod-1:18791/mcp",
      "_note": "Access via Tailscale subnet route or SSH tunnel"
    }
  }
}
```

### Hermes

```bash
hermes mcp add bee http://bee-prod-1:18791/mcp
hermes mcp list   # verify
```

### Claude Code locally

Add to `.claude.json` for Barak's local sessions:

```json
{
  "mcpServers": {
    "bee": {
      "type": "http",
      "url": "http://localhost:18791/mcp",
      "_setup": "Run: ssh -L 18791:127.0.0.1:18791 barak@bee-prod-1"
    }
  }
}
```

## Verify

```bash
# Health
curl http://localhost:18791/health
# Expected: {"ok": true, "tools": 20, "uptime": ...}

# List tools via MCP
curl -X POST http://localhost:18791/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'

# Call a tool
curl -X POST http://localhost:18791/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "bee.listCustomers",
      "arguments": {"sla_tier": "tier_1", "limit": 5}
    }
  }'
```

## Status: ⚠️ skeleton only

The handlers call BEE app routes that **Barak must define + implement** in the
BEE app itself. This MCP server assumes the API surface documented in
`../bee-app-api-doc-template.md`. Until that surface exists, the MCP tools
will return 404.

**Order of implementation:**
1. Barak fills `bee-app-api-doc-template.md` with actual routes (~3h)
2. Barak adds missing endpoints to BEE app (likely most exist; this gap-fills)
3. Deploy bee-mcp-server (~1h)
4. Register in Alfred + Hermes (~1h)
5. Smoke test with `curl` (~30min)

Total: ~6-7h end-to-end.

## Hardening (Phase 5 polish)

Phase 2 ships with basic security. Phase 5 adds:
- Rate limiting (avoid agent runaway DOS-ing own app)
- Per-tool ACLs (which agent can call what?)
- Request audit log (every tool call → bee-prod-1:/var/log/bee-mcp-audit.log)
- Circuit breaker (if BEE app returns 5xx 3× → pause writes for 5min)
- Idempotency keys for write operations (avoid double-submit on retry)

Not blocking for Phase 2 launch.
