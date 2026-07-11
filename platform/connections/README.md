# Connections — Hive Cortex

## Cloud (this VM / Cursor Cloud)

```bash
node platform/connections/connect-all.mjs
```

Produces:
- `platform/canon/BEE_CANON.md` — published digest for agents
- `platform/status/connections.json` — MCP + canon checklist
- `platform/status/canon-drift.json` — drift report

## Local (Barak PC) — closes Alfred/Hermes Brain Bus

```powershell
cd E:\bee-assets
git fetch origin
git checkout cursor/hive-cortex-platform-634e   # or pull after merge
pwsh -File platform\connections\connect-local.ps1
```

Then complete the two manual constitutional edits printed by the script (Alfred `AGENTS.md` step 5 + Hermes `external_dirs` + port 3100).

## MCP auth (Cursor Desktop — you must click)

| MCP | Priority | Action |
|---|---|---|
| **Monday** | P0 | Settings → MCP → Authenticate |
| Notion | P1 optional | same |
| GitLab | skip | not needed for spine |
| Cloudflare bindings/builds/obs | P1 if Workers | same |

Cloud agents cannot complete OAuth for you.

## Wire runbook (detail)

See `WIRE_AGENTS_TO_CANON.md` (copied from research PR #2).
