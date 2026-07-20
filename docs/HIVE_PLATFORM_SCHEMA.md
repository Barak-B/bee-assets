# Hive platform schema

> **Code:** `platform/schema/`  
> **Consumers:** `apps/bee-solar-survey` (export), supervisor / Brain Bus (planned)  
> **Updated:** 2026-07-20

Canonical contracts for autonomous Hive work units. Every Collect / Edit / Dispatch job should match `job.schema.json` and declare its loop in `loops.json`.

## Files

| Path | Role |
|---|---|
| [`platform/schema/job.schema.json`](../platform/schema/job.schema.json) | JSON Schema (draft 2020-12) for a single ledgered job |
| [`platform/schema/loops.json`](../platform/schema/loops.json) | Declared loops: schedule, trust, cost, enablement, blockers |

## Repo scope

On `main`, this repo ships the **schema + survey exporter** only. Loop `entrypoint` paths such as `platform/connections/collect-canon-drift.mjs` are **declared** in `loops.json` for the supervisor roster; those scripts are not present here until the Hive Cortex / Brain Bus trees land. Do not treat a missing entrypoint file as a schema bug — treat it as an enablement gap (same class as `blocker` strings on disabled loops).

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

Built by `apps/bee-solar-survey/src/hive.ts` → `buildHiveExportBundle`:

| # | Loop | When incomplete | When complete | Outbound |
|---|---|---|---|---|
| 1 | `collect.site-survey` | `status: queued` | `status: succeeded` | `channel: none`, `drafts_group`, human pick |
| 2 | `edit.normalize-site-survey` | `status: blocked_trust` + Hebrew `error` | `status: succeeded` + `result.readyFor` | `channel: db`, `drafts_group`, human pick |
| 3 | `dispatch.draft` | **omitted** | `status: queued` | `channel: whatsapp`, `drafts_group`, human pick |

Payload highlights (complete path):

1. **Collect** — `raw` project, `photoMeta[]`, `completeness`
2. **Edit** — `designSuiteReq.site/target/preferences` + `electricalIntake`; `customer.id = "[OPEN]"` (§3.6a)
3. **Dispatch** — Hebrew draft title/body pointing to `wave-54`; never `destinationClass: customer`

**costTier note:** the PWA currently emits `costTier: 0` on all three jobs. `loops.json` lists `dispatch.draft` at registry cost **2** (policy intent for the live supervisor). Prefer the registry when scheduling spend; treat the JSON download as a field artifact until the wire normalizes tiers.

See [`BEE_SOLAR_SURVEY_HIVE.md`](BEE_SOLAR_SURVEY_HIVE.md) and [`apps/bee-solar-survey/README.md`](../apps/bee-solar-survey/README.md).

## Constraints for authors

- Do not invent loop names outside `loops.json` without updating that file.
- Do not set `destinationClass` to `customer` / `supplier` without `requiresHumanPick: true` and an explicit Trust Gate change.
- Job payloads are open objects (`additionalProperties: true`); keep field names stable once a consumer ships.
- Schema `$id` is `https://bee.local/platform/schema/job.schema.json` (local canon URL, not a public host).
- Keep `blocker` text honest when disabling a loop — it is the operator-facing reason in status tables.

## Validation

There is no shared runtime validator in this repo yet. The survey app’s Vitest suite asserts export shape against these contracts:

```bash
cd apps/bee-solar-survey && npm test
```
