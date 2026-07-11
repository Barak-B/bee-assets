---
aliases:
  - CLOUD_CORTEX_TOOLING
  - כלי קורטקס
  - Permanent Tools
tags:
  - bee
  - canon
  - tooling
  - mcp
---

# `[[CLOUD_CORTEX_TOOLING]]` — permanent tools the cloud cortex must hold

> Audit date: **2026-07-11**. Source: live MCP catalog on cloud run + `[[BRAIN]]` / `[[PATHS]]` / protocol §6.
> Goal: every future Cursor Cloud / Desktop agent for BEE starts with this toolkit **already auth'd**,
> not rediscovered mid-session.

## 0 — What this cloud run actually has RIGHT NOW

| Connection | Status | Notes |
|---|---|---|
| GitHub `Barak-B/bee-assets` | ✅ live | push/PR via token |
| Workspace disk (`research/`, vault kit, scripts) | ✅ live | Linux cloud VM — **not** `E:\` |
| `cursor-cloud` MCP | ✅ ready | run-info, environment-info, list agents |
| Cloudflare-docs MCP | ✅ ready | docs search only |
| **Monday MCP** | ❌ needsAuth | CRM / boards — required for BEE ops |
| **Notion MCP** | ❌ needsAuth | optional knowledge mirror |
| **Canva MCP** | ❌ needsAuth | design — optional |
| **HuggingFace-skills MCP** | ❌ needsAuth | ML — optional for BEE ops |
| **Cloudflare-bindings / builds / observability** | ❌ needsAuth | infra — needed if shipping Workers |
| Obsidian vault (`E:\...\Barak-v-obsidian`) | ❌ unreachable | local Windows only; sync via scripts |
| Graphify MCP (`bee-graph`) | ❌ not registered here | exists as kit for Alfred/Hermes/prod |
| Alfred / Hermes / OpenClaw | ❌ unreachable | local agents; canon push still opt-in |
| Invoice Maven / Mercantile / WhatsApp | ❌ no MCP | by design (Law #1 / L1 drafts) |
| Saved Cursor **Environment** | ❌ `environment: null` | no permanent MCP/secrets snapshot for this run |

## 1 — Permanent toolkit (priority order)

### P0 — must be permanent for BEE cloud cortex

| Tool | Why | How to make permanent |
|---|---|---|
| **Monday MCP** | Customers, sites, tenders, ops boards live there | Cursor → Settings → MCP → authenticate **Monday**; save into a Cursor Environment attached to `bee-assets` |
| **GitHub** (already) | Canon + PRs | Keep; ensure Environment pins this repo |
| **Graphify MCP (`bee-graph`)** | Query the knowledge graph the sync builds | Deploy Stage 3 HTTP MCP on bee-prod-1 (`research/graphify-deployment/`), then register URL+Bearer in Cursor Environment MCP config (see §2) |
| **Brain sync scripts** (repo) | git→Obsidian→graphify | Already in repo; Environment install script should run `verify-brain-sync.ps1` locally / document cloud limits |

### P1 — strongly recommended

| Tool | Why | How |
|---|---|---|
| **Cloudflare bindings + builds + observability** | bee Workers / Pages / deploys | Auth the three Cloudflare MCP servers; attach API token via Environment secrets |
| **Notion MCP** | If Barak keeps parallel docs in Notion | Auth Notion; otherwise skip (Obsidian is canon hub) |

### P2 — optional / not blocking BEE spine

| Tool | Why | How |
|---|---|---|
| Canva | Marketing creatives | Auth only if actively used |
| HuggingFace-skills | Model eval / demos | Auth only for ML waves |
| GitNexus MCP | Impact analysis | Deferred per graphify-deployment README |

### Explicitly NOT permanent cloud tools (local-only / constitutional)

| Tool | Reason |
|---|---|
| Direct Obsidian write MCP | Vault is on `E:\`; cloud cannot reach it (protocol §5). Sync stays local. |
| WhatsApp send / Gmail send | Law #1 — drafts only via Alfred |
| Raw bank / Invoice Maven credentials in cloud | Secrets stay on Barak PC / bee-prod-1 |

## 2 — Graphify MCP registration (missing today)

Use the existing kit — do **not** invent a new path:

1. On bee-prod-1 (or local PC): follow `research/graphify-deployment/README.md` Stage 2–3.
2. Confirm HTTP MCP: `http://<TAILSCALE_IP>:8090/mcp` + key from `/etc/graphify-mcp.key`.
3. Add to Cursor Environment MCP (cloud-capable because it's HTTP over Tailscale):

```json
{
  "mcpServers": {
    "bee-graph": {
      "type": "http",
      "url": "http://<TAILSCALE_IP>:8090/mcp",
      "headers": {
        "Authorization": "Bearer <API_KEY>"
      }
    }
  }
}
```

Snippets already exist for Alfred/Hermes:
- `research/graphify-deployment/configs/alfred-openclaw.snippet.json`
- `research/graphify-deployment/configs/hermes-mcp.snippet.yaml`

## 3 — Barak checklist (one-time → permanent)

Do this in **Cursor Desktop** (MCP auth UI), then bind to a saved Environment:

1. **Auth P0/P1 MCPs**
   - [ ] Monday
   - [ ] Cloudflare-bindings
   - [ ] Cloudflare-builds
   - [ ] Cloudflare-observability
   - [ ] Notion (if used)
2. **Create / update Cursor Environment** for BEE
   - [ ] Pin repo `Barak-B/bee-assets`
   - [ ] Attach authenticated MCP servers
   - [ ] Add secret names only: `DEEPSEEK_API_KEY`, `GRAPHIFY_API_KEY`, `MONDAY_API_KEY` (values in secret store — never commit)
   - [ ] Optional install script note: local Windows still runs `connect-brain-to-obsidian.ps1`
3. **Stand up `bee-graph` HTTP MCP** (Tailscale) and register as above
4. **Re-launch cloud agents from that Environment** (not JIT null-env) so tools persist

## 4 — Acceptance test (next cloud session)

After Environment is attached, a cold cloud agent should report:

```
Monday          ready
Cloudflare-*    ready (docs already; bindings/builds/obs after auth)
bee-graph       ready  (query_graph works)
Notion          ready OR intentionally absent
Obsidian E:\    still unreachable (expected)
verify-brain    scripts present in research/scripts/
```

Command for Barak after any sync:  
`pwsh -File E:\bee-assets\research\scripts\verify-brain-sync.ps1`

## 5 — Gap this document does NOT close alone

Cloud agents **cannot** click Cursor MCP OAuth for you. Auth + Environment save are operator actions.
This file is the canon checklist so every session asks for the same permanent set instead of improvising.
