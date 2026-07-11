# platform/ — BEE Hive Cortex

Control plane for **brain migration** + **autonomous Collect → Edit → Dispatch**.

| Path | Purpose |
|---|---|
| `schema/brain-roster.json` | Every AI + migration status |
| `schema/job.schema.json` | Job contract |
| `schema/loops.json` | Declared loops + Trust Gate |
| `loops/supervisor-stub.mjs` | Dry-run supervisor (no side effects) |

## Quick check

```bash
node platform/loops/supervisor-stub.mjs
node platform/loops/supervisor-stub.mjs --json
```

## Canon

- Charter: `docs/HIVE_CORTEX_PLATFORM.md`
- Plan: `docs/plans/2026-07-11-hive-cortex-platform.md`
- Full research brain: PR #2 `research/BRAIN.md`
- Wire live agents: PR #2 `research/scripts/WIRE_AGENTS_TO_CANON.md`

Law #1 / Law #2 are enforced in `loops.json` trustGate and in the stub — real dispatch must use the same rules inside Alfred `dispatchSend()`.
