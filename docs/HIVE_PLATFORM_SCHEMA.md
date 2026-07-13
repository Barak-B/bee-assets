# Hive platform schema

> **Code:** `platform/schema/`  
> **Consumers:** `apps/bee-solar-survey` (export), supervisor / Brain Bus (planned)  
> **Updated:** 2026-07-13

Canonical contracts for autonomous Hive work units. Every Collect / Edit / Dispatch job should match `job.schema.json` and declare its loop in `loops.json`.

## Files

| Path | Role |
|---|---|
| [`platform/schema/job.schema.json`](../platform/schema/job.schema.json) | JSON Schema (draft 2020-12) for a single ledgered job |
| [`platform/schema/loops.json`](../platform/schema/loops.json) | Declared loops: schedule, trust, cost, enablement, blockers |

## Job model

Required fields: `id`, `kind`, `loop`, `status`, `trustTier`, `createdAt`.

| Field | Constraints |
|---|---|
| `kind` | `collect` \| `edit` \| `dispatch` |
| `loop` | Pattern `^(collect\|edit\|dispatch)\.[a-z0-9_-]+$` |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `blocked_trust` \| `cancelled` |
| `trustTier` | `L0` \| `L1` \| `L2` |
| `costTier` | Integer 0–4 |
| `outbound` | Optional; if set, must pass Trust Gate before send |

### Outbound / Trust Gate

From `loops.json` → `trustGate`:

- **Law #1 destinations:** `self_chat`, `neri_group`, `drafts_group`, `voice_transcripts`
- **Forbidden without human pick:** `customer`, `supplier`, `other`
- Supervisor must refuse dispatch when `destinationClass` is outside Law #1 destinations

`requiresHumanPick: true` is mandatory for any real-world customer/supplier path (Law #2).

### Minimal example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "kind": "collect",
  "loop": "collect.site-survey",
  "status": "succeeded",
  "trustTier": "L1",
  "costTier": 0,
  "source": "bee-solar-survey",
  "payload": { "projectId": "…" },
  "createdAt": "2026-07-13T12:00:00.000Z",
  "outbound": {
    "channel": "none",
    "destinationClass": "drafts_group",
    "requiresHumanPick": true
  }
}
```

## Loop registry

Loops are the supervisor’s wake targets (cron or event). Disabled loops keep a `blocker` string explaining what is missing.

### Collect

| Loop | Enabled | Schedule | Notes |
|---|---|---|---|
| `collect.canon-drift` | ✅ | `0 */6 * * *` | Canon facts + roster drift; entrypoint `platform/connections/collect-canon-drift.mjs` |
| `collect.bank` | ❌ | Weekday 07:00 | Blocker: OB-4 + 53/A port |
| `collect.mail` | ❌ | `*/15 * * * *` | Blocker: Gmail OAuth |
| `collect.wa` | ✅ | `event:alfred-inbound` | Alfred inbound → intake |
| `collect.monday` | ❌ | `*/30 * * * *` | Blocker: Monday MCP auth |
| `collect.site-survey` | ✅ | `event:surveyor-export` | Field PWA → Wave 54 intake; entrypoint `apps/bee-solar-survey` |

### Edit

| Loop | Enabled | Schedule | Notes |
|---|---|---|---|
| `edit.normalize` | ✅ | `event:after-collect` | Hebrew/date/amount normalize |
| `edit.dedup` | ✅ | `event:after-normalize` | Hard-key + fuzzy dedup |
| `edit.anomaly` | ❌ | `event:after-procurement-line` | Blocker: wire into ingest |
| `edit.normalize-site-survey` | ✅ | `event:after-collect.site-survey` | Survey → `DesignSuiteReq.site/target`; blocks if incomplete |

### Dispatch

| Loop | Enabled | Channel / destination | Human pick |
|---|---|---|---|
| `dispatch.alert` | ✅ | WhatsApp → `self_chat` | No (Barak only) |
| `dispatch.draft` | ✅ | WhatsApp → `drafts_group` | **Yes** |
| `dispatch.digest` | ❌ | WhatsApp → `self_chat` | No — blocker: Wave 55 |

## Site-survey job chain (verified in app)

Built by `apps/bee-solar-survey/src/hive.ts`:

1. **`collect.site-survey`** — raw project + photo meta + completeness; `outbound.channel = none`
2. **`edit.normalize-site-survey`** — `designSuiteReq` + `electricalIntake`; status `blocked_trust` when incomplete
3. **`dispatch.draft`** — only if edit succeeded; WhatsApp drafts group, `requiresHumanPick: true`

`customer.id` stays `[OPEN]` until CRM link (§3.6a). See [`BEE_SOLAR_SURVEY_HIVE.md`](BEE_SOLAR_SURVEY_HIVE.md).

## Constraints for authors

- Do not invent loop names outside `loops.json` without updating that file.
- Do not set `destinationClass` to `customer` / `supplier` without `requiresHumanPick: true` and an explicit Trust Gate change.
- Job payloads are open objects (`additionalProperties: true`); keep field names stable once a consumer ships.
- Schema `$id` is `https://bee.local/platform/schema/job.schema.json` (local canon URL, not a public host).

## Validation

There is no shared runtime validator in this repo yet. The survey app’s Vitest suite asserts export shape against these contracts:

```bash
cd apps/bee-solar-survey && npm test
```
