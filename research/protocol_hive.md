# `protocol_hive.md` — B.E.E Operations Hive Canonical KB

> **Status:** Canonical. This file is the durable charter for any agent (cloud session, local Claude Code, OpenClaw/Alfred, Hermes, n8n flows, future bee-hive orchestrator) working on the BEE hive. Every architectural change burns a node back here.
>
> **Source:** authored 2026-06-12 by Barak with Gemini drafting assistance (v1 then v2/Singularity refinements). Absorbed into the bee-assets KB.
> **Sync targets:** Obsidian vault (`protocol_hive.md`) · Graphify (`research/graphify-out/`) · this repo (`research/protocol_hive.md`).

---

## 1. Role — Central Cortex / Orchestrator

A working agent at the cortex tier is **an orchestrator, not an executor.** It understands, remembers, syncs, and dispatches with engineering rigor and minimum resource burn.

Scope:
- Plans, develops, updates, and physically delivers **Low-Level Designs (LLD)** for components / agents / n8n automations / plugins / ingestion pipelines.
- Real-time streams in scope:
  - WhatsApp via **Hermes** (~port 3100) and **Alfred** (~port 3000)
  - Gmail IMAP (two accounts — primary + `barak-barzel@barak-e.com`)
  - Phone-call transcripts (`bee-whisper`)
  - Bank receipts → master DB at `E:\bee-build`
  - SolarEdge / Sungrow / SMA (149 inverters, 87+ sites)

## 2. Cost-tier dispatch model (5 tiers — never skip)

| Tier | Where | Cost | What runs here |
|---|---|---|---|
| **0** | Bare code / regex / AST / SQL | $0 | Parsing, Mojibake cleanup, idempotency keys, cursor pagination, deterministic n8n nodes, filtering, ingestion plumbing |
| **1** | DeepSeek v4-flash / Hermes V4 Pro | ~$0.04/M tok | Bulk entity extraction, classification, simple Hebrew/English NLP, doc summarization (n8n batches) |
| **2** | Haiku / Sonnet | mid | Multi-file refactors, document scans, code review, focused reasoning |
| **3** | Sonnet 4.6 / V4 Pro | mid-high | Cognitive judgment in workflows: lead intent, quote drafting, daily synthesis |
| **4** | **Opus (this cortex)** | high | Architecture decisions, atomic briefs for swarm workers, escalations the swarm declined |

**Rule:** the cortex (Tier 4) decomposes every incoming task into atomic sub-tasks and dispatches to the swarm (Open-Claw workers, n8n flows, Hermes skills). Tier 4 NEVER touches raw growing data directly — that's a waste. Reduce → summarize → escalate only when synthesis quality dominates cost.

## 3. Burned-in lessons (anti-loop, anti-spam, anti-cost-spike)

### 3.1 Incremental + idempotent ingestion — **Deterministic Cursor Tuple**

Every ingest job (n8n / agent / cron) MUST:

- Use a **`(updated_at, id)` cursor tuple** as the watermark, persisted per stream.
- Query `WHERE (updated_at, id) > (last_ts, last_id)` — strict deterministic ordering. Single-column timestamp cursors miss rows when two records share a second.
- Apply **5-minute lookback overlap** on the timestamp side to absorb clock skew between source and DB.
- Filter happens at **Tier 0 inside the DB**, not in agent code.
- Resulting rows go through **fuzzy dedup** (§3.4) before any Tier 1+ work touches them.

### 3.2 Distributed locks + transactional writes

Every write to a sensitive entity (`:Customer`, `:Lead`, `:BankReceipt`, `:Job`) by any worker MUST:

- Acquire a **dynamic lock** (Redis `SET NX EX` or a `locks` table row with unique key on `entity_kind:entity_id`).
- Workers that find the lock held enter a **serial retry queue** with exponential backoff (250ms / 500ms / 1s / 2s / 4s, cap 5 attempts, then dead-letter).
- The whole write is a **single transaction (Unit of Work)** — partial failure rolls back fully, the lock releases in `finally`.

### 3.3 Survival mechanics for heavy work

Long whisper transcripts, big PDFs, batch n8n flows MUST include:

- A **lock file or DB row** ("only one runner per pipeline at a time").
- A **retry queue** with capped attempts and dead-letter.
- A **timeout scaled to input size** — never a fixed 60s on potentially 30-min audio.
- A **structured error envelope** — never crash the calling cron; log + ⚡ Barak self-chat on hard failure.

> Live evidence: `Unexpected end of JSON` from a fixed-timeout transcription job. Fix: per-MB timeout floor + structured error envelope + retry-queue dead-letter.

### 3.4 Fuzzy deduplication for entity creation

Before creating any `:Customer` / `:Lead` / `:BankReceipt`:

1. **Normalize** the input string — strip Hebrew connectives (`ה`, `של`, `מ`, `דרך`, `אצל`, `ל`), collapse whitespace, normalize quotes.
2. **Match on a hard key first** — phone in E.164, bank transaction id, JID, message hash.
3. If no hard-key match, run **Levenshtein > 85%** against existing same-kind entities scoped by region/customer.
4. If hit → **append activity to the existing entity**, never open a new one.

> Live evidence preventing this would have prevented: 4 duplicate Telegram self-chat notifications about Yaakov Moskovich / Kadesh Barnea on 2026-06-10 (21:03 → 21:33 → 21:48 → 22:03 → 22:18). Watcher re-emitted on every status sub-change without state-hash gating.

### 3.5 Async audio ingestion (calls)

Large field calls (≥ 11MB):

- ffmpeg **upsample** 8kHz → 16kHz dynamically (Hebrew transcription quality cliffs below 16kHz).
- **Chunk asynchronously** into 60-second slices with 10-second overlap (prevents sentence-boundary truncation).
- Caller receives **HTTP 202 Accepted** + a `task_id`. Final result delivered via **Webhook callback** keyed on `task_id`.
- Reassembly deterministic by `task_id` + chunk index; never time-sort post-hoc.

### 3.6a Don't guess facts already known to the operator

When a deliverable needs a concrete value the operator has already given or could trivially supply (bank name, vendor name, account email, file path, port number) — **ask, or grep the local-state snapshot. Never default to the "most common" Israeli choice.**

> Live evidence 2026-06-15: Wave 53/A Phase A reference impl shipped with `fixture-hapoalim.csv` + `bankCode 12=Hapoalim` examples. Barak's primary bank is **Mercantile Discount (code 17, subsidiary of Discount/11)**. The "Hapoalim is the largest Israeli bank, so default to that" reasoning is exactly the kind of guess this rule forbids. Fix: rename fixture to `fixture-mercantile.csv`, lead BANK_PROVIDERS_JSON example with Mercantile, demote Hapoalim to "other banks" list. The cortex apologized and corrected, but the avoidable round-trip cost ~30 min of attention.

**Rule:** for any field that maps to a specific real-world entity in Barak's life (bank, OS user, project path, customer, supplier, person), the cortex either (a) sources the value from the canonical KB (`PATHS.md`, `roster.yaml`, `local-state/`), or (b) opens an `[OPEN]` placeholder + flags it for Barak. Never invents a plausible-looking default.

### 3.6 Hybrid n8n design + context isolation

- **Deterministic Explicit nodes** for: routing, heavy data pulls (bank/email), DB writes.
- **LLM / Agent nodes** ONLY for: lead-intent analysis, quote drafting, daily synthesis — work that requires cognitive judgment.
- **Postgres Chat Memory Node** with stable `session_uuid` for long-term lead chat memory (one UUID per `:Lead`, persisted forever).
- **Context Garbage Collection** at end of every step — clear payload, reset env, no implicit carry-through.
- **Sandboxed execution** per step — prevents context drift across nodes, prevents token leak.

## 4. Self-improvement circuit (mechanical, not vibes)

### 4.1 `err_manifest.json` — root-cause log

Every bug/crash burns a record:
```json
{
  "id": "err_2026-06-10_dedup_loop_moskovich",
  "ts": "2026-06-10T22:18:00+03:00",
  "stream": "contact_watcher",
  "symptom": "4 duplicate notifications same person 75 min window",
  "root_cause": "status sub-change emitted without content-hash gate",
  "fix": "persist (entity_id, content_hash, state) tuple, emit only on change",
  "commit": "<sha>",
  "test_added": "tests/dedup_status_subchange.test.ts"
}
```
Lives at `E:\bee-build\err_manifest.json` (or wherever the canonical DB lives). The cortex reads this before designing a similar component to avoid repeating mistakes.

### 4.2 State Validation Circuit — never trust API success

After any write, the component MUST:
1. **Read back from the DB** via Prisma / SQL.
2. **Validate against the requested schema** (field types, foreign keys present, computed columns populated).
3. Only then mark the operation complete and release the lock.

API 200 OK is not proof of persistence.

### 4.3 Self-testing before "done"

Every architectural change ships with:
- Syntax check: `node --check`, `bash -n`, `pwsh -NoProfile -Command "&{ Test-Script . }"`, `python -m py_compile`, `tsc --noEmit`.
- Healthcheck: ports + service responses (see §7).
- A unit test exercising the failure mode the bug originally hit.

### 4.4 Lesson burn

Every solved bug updates: `protocol_hive.md` (this file) + Obsidian vault node + Graphify graph. The hive cognitively upgrades; the same mistake does not recur.

## 5. Execution autonomy clause + cloud-session caveat

Plans on paper don't count. Every LLD deliverable bundles:
- Install + config steps as **deterministic scripts** (`.ps1` / `.sh` / hooks). One copy-paste = one outcome.
- **Syntax validation** commands.
- **Healthchecks** for ports/services (§7).
- **Rollback** path in the same delivery.

### Cloud-session caveat (honest scope statement)
A cortex running in a remote container (anthropic.com web Claude / cloud-hosted Claude Code) **authors** scripts but **cannot reach**:
- `E:\`, `~/.openclaw`, `~/AppData/Local/hermes` on Barak's PC
- bee-prod-1 via Tailscale
- any port on local hardware

Hands-on execution belongs to **(a) Claude Code running locally on Barak's machine**, or **(b) Barak running the produced scripts**. The cortex must say so plainly; no theater of execution.

## 6. Continuous knowledge sync (the loop)

```
            ┌──────────────────────┐
            │  this commit / PR    │  (durable text in git)
            └──────┬───────────────┘
                   │
       ┌───────────┼─────────────────┐
       ▼           ▼                 ▼
┌────────────┐  ┌─────────────┐  ┌─────────────────────┐
│  Obsidian  │  │ Graphify    │  │ protocol_hive.md    │
│ vault      │  │ graph.json  │  │ (THIS FILE)         │
│ wikilinks  │  │ KG nodes    │  │ canonical narrative │
└────────────┘  └─────────────┘  └─────────────────────┘
```

- **Obsidian:** Hermes' #1 skill. New components get wikilink nodes (`[[Wave_45_Ingestion]]`, `[[Google_People_API]]`, `[[n8n_Automation_Spine]]`, `[[Bank_Receipts_Ingestion]]`).
- **Graphify:** `git pull && pwsh research/graphify-deployment/scripts/install-windows.ps1` rebuilds. Auto-refresh via `graphify hook install` (active on `E:\Desktop\OpenClawAgent`).
- **protocol_hive.md:** editorial canon. Diff on every architectural drift.

## 7. Standard LLD response shape (the only shape accepted)

Every component design returns **exactly four sections**, in order:

### § 1 — Obsidian node header
- Node name: `[[Component_LLD_Name]]`
- Inbound links: `[[Wave_N_Context]]`, `[[Upstream_Producer]]`
- Outbound links: `[[Downstream_Consumer]]`, `[[Tested_With_Wave_X]]`

### § 2 — Cost / swarm / plugin allocation
- Tier per sub-step (0/1/2/3/4) with one-line justification
- Specific plugins / n8n nodes / libraries needing install (with version pins)
- New env vars or secrets required (referenced by name only — never value in this doc)

### § 3 — Core LLD + data flow
- Interfaces (function/route signatures)
- DB schema diffs (Prisma) if any
- **Mermaid** diagram (token-cheap, render-everywhere)
- Must show: distributed lock acquisition, cursor tuple read, fuzzy dedup gate, validation read-back, async webhook (if audio), and rollback path

### § 4 — Code + run + survive
- Atomic core logic only (no boilerplate filler)
- Install/run scripts (`.ps1` / `.sh`) + syntax check + healthcheck
- Error path: log to `err_manifest.json` + ⚡ Barak on hard fail. No silent eat. No retry-storm. Lock release in `finally`.

## 8. Health endpoints to probe before any wave starts

```powershell
Test-NetConnection 127.0.0.1 -Port 3000 -InformationLevel Quiet  # Alfred
Test-NetConnection 127.0.0.1 -Port 3100 -InformationLevel Quiet  # Hermes
Test-NetConnection 127.0.0.1 -Port 5678 -InformationLevel Quiet  # n8n
Test-NetConnection 127.0.0.1 -Port 7474 -InformationLevel Quiet  # Neo4j (planned)
Test-NetConnection 127.0.0.1 -Port 8090 -InformationLevel Quiet  # graphify-mcp (when up)
Test-NetConnection 127.0.0.1 -Port 6379 -InformationLevel Quiet  # Redis (for distributed locks)
Get-Process syncthing -ErrorAction SilentlyContinue              # Syncthing (sync to bee-prod-1)
```

## 9. Known active waves

| Wave | Topic | Status |
|---|---|---|
| Pre-1 | Federation OpenClaw ⇄ Hermes | shipped (v1) |
| 9 | Langfuse deploy | runbook ready |
| 12 | Voice-action skill | shipped |
| 13 | OpenClaw-alfred sole WhatsApp brain | shipped |
| Graphify deploy | KG index of OpenClawAgent + bee-assets | ✅ -Full live 2026-06-13: OpenClawAgent 2,180/3,468/293 labeled ($0.036) · bee-assets 642/995/51 labeled ($0.056) |
| **NEXT** | bank-receipts ingestion · n8n spine · CRM component | **choosing now** |

---

*Burned 2026-06-12 21:25 Asia/Jerusalem (v2 — Singularity refinements). Update on every architectural drift — diff this file when the truth changes.*
