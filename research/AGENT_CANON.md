# `[[AGENT_CANON]]` — the minimal shared truth every BEE brain must hold

> **Purpose:** the ONE short file every brain (Alfred/OpenClaw, Hermes, local Claude Code,
> cloud cortex) reads to stay synchronized. The full detail lives in `[[BRAIN]]` →
> `[[protocol_hive]]` → the LLDs. This is the digest an agent loads at session start so it
> never drifts from the canon. Keep it under one screen. Edit only when a locked fact changes.
>
> **Synced from:** `research/AGENT_CANON.md` (git is source of truth). Last: 2026-06-26.

## Identity + control (constitutional — never override)
- **Law #1 — 4 authorized WhatsApp outbound destinations ONLY:** Barak's self-chat (`+972509554483`), the Neri group (scheduled summaries only), the drafts group (suggestions to pick), the voice-transcripts group. **Never send to a customer/supplier/third party.** No "more efficient workflow" overrides this.
- **Law #2 — Human picks.** Anything touching a real relationship (send proposal, approve supplier, reply to a person) is a *draft Barak approves*, never auto-fired.
- **§3.6a — Don't invent operator facts.** Bank, path, supplier, threshold, port — source it from canon (`PATHS.md`/`roster.yaml`/`local-state/`) or open `[OPEN]` and ask. Never default to the "common Israeli" guess.
- **Trust tiers:** L0 read-only · L1 write-DB + draft (every outbound is human-picked) · L2 narrow pre-approved auto-send. Most agents are L1.

## Locked business facts (do not re-derive)
- **Bank:** Mercantile Discount, **code 17** (subsidiary of Discount/11). NOT Hapoalim.
- **VAT:** **monthly** (`VAT_PERIOD_MONTHS=1`). NOT bi-monthly.
- **מקדמות מס הכנסה:** **0%** — no advance filings.
- **Invoice numbering:** continuous monotonic, no year reset.
- **Accounting/invoicing platform:** Invoice Maven (both). No Hashavshevet/Rivhit/Priority bridge.
- **Scale:** 137 customers · 255 sites · 18 vehicles · 149 inverters across 87+ monitored sites.
- **Inverter/monitoring fleet:** SolarEdge / iSolarCloud / Deye / KStar / ABB. (NOT Sungrow/SMA.)

## The agents (Wave 53 Unified Data Spine + specialists)
- 53/A bank-receipts · 53/B procurement · 53/C proposals · 53/D ledger (כרטסות/AR-AP/VAT)
- Wave 54 engineering-agent (PV brain; `wire_sizing`/`protection` are **strict Tier-0, no LLM** — safety)
- Wave 55 customer-success · existing: regulatory-agent, tender-agent, Alfred, Hermes

## Cost tiers (never skip down)
0 = code/regex/SQL ($0) · 1 = DeepSeek flash · 2 = Haiku/Sonnet · 3 = Sonnet synthesis · 4 = Opus (design-time only).
Reduce → summarize → escalate only when synthesis quality dominates cost.

## Where things live
- Source of truth: this git repo (`bee-assets/research/`). Topology + paths: `PATHS.md` (never guess).
- Sync loop: git → Obsidian vault + graphify (one-way; run locally via `research/scripts/sync-vault-and-graphify.ps1`).
- Ports: Alfred ≈3000 · Hermes ≈3100 · n8n 5678 · Redis 6379.

## Honest capability line (don't oversell)
Today the spine is a **deterministic importer/normalizer/validator** (dedup, locks, validation, Tier-0 — all REAL in code). The **smart layer** (price-anomaly z-scores, lead-time learning, fault grounding, err_manifest read-back, LLM extraction of email/WA/PDF) is **designed + schema'd but NOT yet coded** — it lands in later build-plan phases. See `[[BRAIN]]` §4b.
