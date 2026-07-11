# Implementation Plan — Hive Cortex Platform

> **Goal:** Migrate every BEE AI onto one shared brain, then run autonomous Collect → Edit → Dispatch loops so the company operates on AI under Law #1/#2.
>
> **Branch:** `cursor/hive-cortex-platform-634e`  
> **Charter:** [`../HIVE_CORTEX_PLATFORM.md`](../HIVE_CORTEX_PLATFORM.md)

---

## Phase P0 — Brain Bus (migration)

**Outcome:** Every listed brain reads the same locked facts.

| # | Task | Owner | Done when |
|---|---|---|---|
| P0.1 | Keep `platform/schema/brain-roster.json` as source of migration status | cloud | roster committed + Max updates it after checks |
| P0.2 | Run `WIRE_AGENTS_TO_CANON.md` on Barak PC (setx + PushCanonToAgents) | Barak / local | `BEE_CANON.md` exists in Alfred workspace + Hermes bee-canon |
| P0.3 | Alfred AGENTS.md Session Startup step 5 (constitutional) | Barak | Alfred cites Mercantile 17 + monthly VAT from canon |
| P0.4 | Hermes `memory.external_dirs` + bridge_port 3100 | Barak / local | Hermes loads canon; port collision fixed |
| P0.5 | Max/Claude bootstrap: always open `HIVE_CORTEX_PLATFORM` + `BRAIN` / `AGENT_CANON` | cloud | documented in MAX_KNOWLEDGE_BASE + AGENTS notes |
| P0.6 | Enable `-PushCanonToAgents` on local git hook when P0.2–4 verified | local | every bee-assets commit refreshes agent canon |

**Gate:** Ask Alfred and Hermes "what bank / VAT cadence / outbound rules?" — both match `AGENT_CANON`.

---

## Phase P1 — Work Runtime skeleton

**Outcome:** A supervisor can enqueue and complete jobs of type collect/edit/dispatch without touching customers.

| # | Task | Owner | Done when |
|---|---|---|---|
| P1.1 | Freeze `platform/schema/job.schema.json` (this PR) | cloud | schema valid; examples pass |
| P1.2 | Implement `platform/loops/supervisor.md` contract → thin Node runner (reference) | cloud | `node platform/loops/supervisor-stub.mjs --dry-run` lists due loops |
| P1.3 | `collect.canon-drift` loop: compare roster expected facts vs agent answers (manual checklist first) | cloud + Barak | drift file or ⚡ when mismatch |
| P1.4 | Wire work-ledger path (reuse Phase 1 `alfred-work-ledger` design) | local | every supervised job has ledger row |
| P1.5 | Cron map: which loops run when (local OpenClaw cron + optional n8n) | local | ≥3 collect loops scheduled |

**Gate:** Dry-run supervisor shows bank/mail/wa/canon-drift loops; one drift check logged.

---

## Phase P2 — Real Collect + Edit on spine primitives

**Outcome:** Autonomous intake into normalized records (still L1 drafts only outbound).

| # | Task | Depends | Done when |
|---|---|---|---|
| P2.1 | Port 53/A phase-a into BEE app | mvp row 1 + local | tests green in app |
| P2.2 | `collect.bank` live (needs OB-4 CSV) | OB-4 | real Mercantile rows ingested |
| P2.3 | `collect.mail` + edit.normalize/dedup via 53/B | mvp rows 3–4 | supplier email → PO candidate |
| P2.4 | `edit.anomaly` already coded — call from ingest | small cloud patch | anomalies ≠ hardcoded 0 |
| P2.5 | `dispatch.alert` + `dispatch.draft` only to authorized WA surfaces | Alfred | Barak gets ⚡ / drafts, never customers |

**Gate:** M1 + M2 from mvp-build-plan felt by Barak.

---

## Phase P3 — Dispatch that runs the company (still gated)

| # | Task | Done when |
|---|---|---|
| P3.1 | Ledger post + כרטסת (53/D) on schedule | M3 |
| P3.2 | Proposals pipeline drafts (53/C + 54) | M4 |
| P3.3 | Spine coupling + monthly exec ⚡ | M5 Spine MVP |
| P3.4 | Wave 55 Sunday digest loop | M6 |

---

## Phase P4 — Learning bus (autonomy improves itself)

From `continuous-learning-plan.md` — only after P1–P2 stable:

1. Passive correction detector → `corrections.md`  
2. Weekly self-review cron feeds proposals  
3. Canon change proposals → git PR (never silent rewrite of Law #1/#2)  
4. No cloud training on raw customer WA without legal review

---

## Parallel tracks (do not block P0)

| Track | Why parallel |
|---|---|
| Barak OB-1..5 dropoffs | Unlocks P2 bank/ledger/engineering depth |
| Monday MCP auth in Cursor Environment | Unlocks `collect.monday` from cloud |
| PR #2 research merge strategy | Canon stays one repo story |
| Drone 3D (separate) | Not part of Hive Cortex unless Barak says so |

---

## Execution order for *this* cloud session / next

1. ✅ Charter + plan + schemas (this commit)  
2. Next cloud: supervisor stub + drift checklist automation  
3. Barak local: P0.2–P0.4 (30–60 min) — **highest ROI for "migration"**  
4. Then P2 with real data

---

## Success metrics (company running on AI)

| Metric | Target after P3 |
|---|---|
| Brains on roster with `migrated=true` | 100% of alfred/hermes/max/claude-local |
| Canon drift incidents / week | 0 unresolved >24h |
| Collect jobs succeeding / day | ≥1 bank or mail or WA path |
| Outbound policy violations | **0** (hard fail) |
| Barak approvals on drafts | Happening; not bypassed |
| Hours/week Barak spends on copy-paste intake | Measurably down (M1–M3) |
