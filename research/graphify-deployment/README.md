# Graphify Deployment Kit — BEE Knowledge Graph Layer

**Source:** [safishamsi/graphify](https://github.com/safishamsi/graphify) · PyPI package `graphifyy` (double-y!) · v0.8.36 · MIT · actively maintained (last commit 2026-06-08)
**Verified in-session:** 2026-06-09 — installed, extracted 19 BEE phase-1 scripts → 236 nodes / 432 edges / 19 communities, query round-trip works. See [`demo/phase1-code-GRAPH_REPORT.md`](demo/phase1-code-GRAPH_REPORT.md).

---

## 1. What graphify is

`/graphify .` in any AI assistant maps a folder — **code + docs + PDFs + xlsx + images + video** — into a queryable knowledge graph. Then instead of grepping, the agent runs `graphify query "..."` and gets a scoped subgraph with source locations.

Pipeline: `detect → extract → build_graph → cluster (Leiden communities) → analyze → report → export`.

Three output files: `graph.html` (interactive browser viz), `GRAPH_REPORT.md` (god nodes, surprising connections, suggested questions), `graph.json` (full graph, queryable forever).

## 2. Why this maps onto BEE exactly

| Graphify capability | BEE need it answers | Master-plan ref |
|---|---|---|
| **Native installs for Claude Code, OpenClaw, Hermes** | All 3 of our platforms — one tool, `graphify install` / `graphify claw install` / `graphify hermes install` | v1 federation |
| **Code extraction 100% local (tree-sitter), $0, no egress** | Index BEE app (41 routes, 38 Prisma models), Alfred's 27 scripts, bee-hermes — without code leaving the machine | privacy boundary v7 4.F |
| **`--postgres DSN` live schema introspection** | BEE Operations PostgreSQL 16 → 38-model schema graph, no manual doc | Action #14 (BEE API doc) — partially automated |
| **`--neo4j-push bolt://`** | Bootstraps Action #7 (Neo4j KG foundation) with code/doc entities — complements business entities (Customer/Site/Job) | v6 3.A, v9 Step 23 |
| **`--obsidian` vault export** | Feeds Barak's Obsidian vault — Hermes skill #1 (35 calls/14d) | v11 8.B |
| **DeepSeek backend** (`DEEPSEEK_API_KEY`) | Docs/PDF/xlsx semantic extraction at DeepSeek prices (~$0.04/M tok), balance $96 active | v15 Action #1 smart routing |
| **`--backend ollama`** | Fully-local option for sensitive docs (no cloud) | privacy v7 4.F |
| **MCP server — stdio or HTTP+API-key** | One shared graph server on bee-prod-1 over Tailscale; Alfred + Hermes + Claude Code all query it | Wave 2 MCP foundation |
| **docx / xlsx / PDF extraction** | Proposals, pricebook xlsx, regulatory PDFs, engineering reports → graph nodes | v11 8.E proposals |
| **Git hook auto-rebuild (AST-only, $0)** | Graph never goes stale on BEE app / Alfred workspace commits | — |
| **`graphify global`** | Cross-project graph: Alfred + Hermes + BEE app + bee-assets research in ONE queryable graph | v14 11.H domain map |
| **`graphify prs` dashboard + triage** | PR review queue ranking once BEE app development accelerates | — |
| **Video/audio transcription local (faster-whisper)** | Offline fallback for voice memos (primary stays Groq Whisper per v5) | v5 voice pipeline |

## 3. Graphify vs GitNexus — do we need both?

We already audited + built a deployment kit for GitNexus (`../gitnexus-audit.md`, `../gitnexus-deployment/`). Honest comparison:

| | GitNexus | Graphify |
|---|---|---|
| Language | TypeScript/Node | Python |
| Install | fork + sanitize + build (~40 min, we removed @scarf/scarf) | `pip install graphifyy` (~1 min, no telemetry to strip) |
| Corpus | **code only** | code + docs + PDF + xlsx + images + video + live PG schema |
| Strengths | `impact` / `api_impact` / `route_map` / `shape_check` — change-impact analysis | breadth, Neo4j/Obsidian export, multi-backend LLM, MCP HTTP server |
| MCP | stdio | stdio **+ HTTP with API key** (shared server) |
| Write-risk tools | `rename` (mass rewrite), `cypher`, `group_sync` — we whitelisted them out | none — read-only by design |
| Maintenance | needs our internal fork discipline | straight PyPI upgrades |

**Recommendation: start with graphify, keep GitNexus deferred.**
- Graphify covers ~80% of what GitNexus gives us (code graph + query) PLUS the entire knowledge layer (docs/PDF/xlsx/PG/Obsidian/Neo4j) that GitNexus has nothing for.
- GitNexus's unique value is impact analysis (`impact`, `api_impact`). Revisit it when BEE app development volume makes "what breaks if I change X" a daily question. The deployment kit stays ready in `../gitnexus-deployment/`.
- Running both is fine later (different MCP server names, zero conflict) — but one new moving part at a time.

## 4. Security review (condensed)

- **License/supply chain:** MIT, no telemetry, no analytics (verified README + ARCHITECTURE). PyPI name is `graphifyy` — **double-y**; other `graphify*` packages are NOT affiliated (typosquat risk — pin the exact name in scripts).
- **Egress:** code extraction = zero egress (tree-sitter local). Docs/PDF/images go to whichever LLM backend you choose — use DeepSeek (cheap) or Ollama (zero egress) for sensitive content. Video/audio = local faster-whisper.
- **Query logging:** every query is logged to `~/.cache/graphify-queries.log` (JSONL, no responses by default). Our scripts set `GRAPHIFY_QUERY_LOG_DISABLE=1` on bee-prod-1 — one less file with business questions in it.
- **MCP HTTP server:** binds `127.0.0.1` by default. Our systemd unit binds the **Tailscale IP only** + requires `GRAPHIFY_API_KEY` (Bearer). Never `0.0.0.0` without a key.
- **Input validation:** `graphify/security.py` — URL allowlist (http/https), file:// redirect blocking, size caps, graph paths must resolve inside `graphify-out/`, label sanitization. Reviewed, reasonable.
- **MCP tools exposed:** `query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `list_prs`, `get_pr_impact`, `triage_prs` — **all read-only**. No whitelist gymnastics needed (unlike GitNexus).

## 5. Deployment plan — 4 stages

### Stage 1 — Barak's PC (3 min) · `scripts/install-windows.ps1`

**One-shot, end-to-end.** Open a regular PowerShell (not admin, not in `system32`) and run:

```powershell
cd <path-to-this-repo>\research\graphify-deployment\scripts
pwsh .\install-windows.ps1                  # default: code-only graph
# or:
pwsh .\install-windows.ps1 -Full            # also extract docs/PDFs/images (~$1-3 via DeepSeek)
pwsh .\install-windows.ps1 -SkipLabel       # faster, no community names
```

What it does (all the gotchas baked in — see commit history for live-test evidence):
1. Installs `graphifyy[office,pdf,neo4j,mcp,anthropic,openai]` (both backend extras — DeepSeek = OpenAI-compatible)
2. Registers skill on Claude Code (global), Alfred/OpenClaw (`C:\Users\Barak\.openclaw\workspace`), Hermes (`E:\bee-hermes` + global `~/.hermes/skills`)
3. Writes `.graphifyignore` with every known trap: `backups/`, `**/document_cache/`, `secrets/`, `**/credentials/`, `**/state.db`, and (in default mode) all doc/image extensions
4. Wipes stale output and extracts a fresh code-only graph (~1874 nodes / 3280 edges / 104 communities)
5. Labels communities via DeepSeek (auto-reads key from `secrets\bee-integrations.env`) using the **`--backend=X` workaround** (graphify 0.8.38 bug: space-separated `--backend X` is silently ignored in `cluster-only`/`label`)
6. Installs the git post-commit hook (auto-refresh, $0)
7. Verifies the graph and prints sample queries

If a step fails, the script keeps going where it can — labeling gracefully falls back to `--no-label` when no API key is found.

**Live-test lessons (2026-06-13, local run):**
- **Bare `graphify` CLI reads the key ONLY from `DEEPSEEK_API_KEY` env var** — the secrets-file parsing is installer-only. For manual `extract`/`cluster-only` runs, set it process-scoped first (PowerShell): `$m = Select-String -Path E:\Desktop\OpenClawAgent\secrets\bee-integrations.env -Pattern '(?i)deepseek.*[=:]\s*["'']?(sk-[A-Za-z0-9_-]+)'; $env:DEEPSEEK_API_KEY = $m.Matches[0].Groups[1].Value`. ⚠️ Do NOT set it User-scope — provider env vars override `openclaw.json` (documented OpenClaw trap).
- **`-Full` is silently neutralized by a code-only `.graphifyignore`** — step 4 leaves a user-managed ignore file as-is, so doc/image extension blocks from a previous code-only run survive and `-Full` finds `0 docs, 0 images`. Remove the `*.md`/`*.pdf`/`*.png`/etc. lines first, keep the safety excludes (`secrets/`, `backups/`, `**/document_cache/`, `**/credentials/`, `**/state.db`).
- **After a full extract, communities fragment** (104 → 293 on OpenClawAgent — doc/image nodes form many small clusters); always re-run `graphify cluster-only . --backend=deepseek` to re-label.
- Measured costs: OpenClawAgent docs+images pass (205 files) = **$0.036** · bee-assets full graph (151 files) = **$0.056** · DeepSeek's truncation auto-bisect handled one hollow chunk without intervention.

### Stage 2 — BEE app index (30 min) · `scripts/index-bee-app.sh`
On bee-prod-1 (or wherever BEE app source lives):
1. Code pass: `graphify extract /opt/bee-ops --no-viz` — 41 routes + 38 Prisma models, local, $0
2. Schema pass: `graphify extract --postgres "$BEE_DB_DSN"` — live 38-model introspection
3. Docs pass (optional, costs ~$1-3 at DeepSeek rates): `DEEPSEEK_API_KEY=... graphify extract ./docs --backend deepseek`
4. `graphify hook install` — auto-rebuild per commit (AST-only, $0)

### Stage 3 — Shared MCP server on bee-prod-1 (15 min) · `scripts/serve-mcp.sh` + `configs/graphify-mcp.service`
1. systemd unit serves `graph.json` over HTTP on the Tailscale IP + API key
2. Register in Alfred: `configs/alfred-openclaw.snippet.json`
3. Register in Hermes: `configs/hermes-mcp.snippet.yaml`
4. Smoke test: `scripts/smoke-test.sh`

### Stage 4 — Knowledge layer hookups (when ready)
- **Neo4j (Action #7):** once `bee-neo4j` Docker is up → `graphify extract . --neo4j-push bolt://localhost:7687` — code/doc entities land next to business entities
- **Obsidian (v11 8.B):** `graphify extract . --obsidian` → vault folder; merge into Barak's vault
- **Global graph:** `graphify global add <each>/graphify-out/graph.json <name>` — alfred + hermes + bee-app + bee-assets in one graph
- **Research corpus:** run `/graphify research/` from a local Claude Code session (90 md docs go through the session model, no API key needed) — the whole master plan becomes queryable

## 6. Cost

| Item | Cost |
|---|---|
| graphify itself | $0 (MIT) |
| Code + PG schema extraction | $0 (local) |
| Docs/PDF extraction via DeepSeek | ~$0.04/M tokens → BEE app docs ≈ $1-3 one-time |
| Re-index on commit (git hook) | $0 (AST-only) |
| MCP server on bee-prod-1 | $0 (existing box, <100MB RAM) |

## 7. Rollback

`graphify uninstall --purge` removes skills/hooks/configs from ALL platforms + deletes `graphify-out/`. Per-platform: `graphify claude uninstall`, `graphify claw uninstall`, `graphify hermes uninstall`. systemd: `systemctl disable --now graphify-mcp`. No state outside `graphify-out/` + `~/.graphify/` + `~/.cache/graphify-queries.log`.

## 8. Files in this kit

```
graphify-deployment/
├── README.md                        — this file
├── demo/
│   └── phase1-code-GRAPH_REPORT.md  — actual output from in-session verification run
├── scripts/
│   ├── install-windows.ps1          — Stage 1: Barak's PC (3 platforms)
│   ├── index-bee-app.sh             — Stage 2: BEE app code + PG + docs
│   ├── serve-mcp.sh                 — Stage 3: HTTP MCP server setup
│   └── smoke-test.sh                — post-deploy verification
└── configs/
    ├── graphify-mcp.service         — systemd unit (Tailscale-bound + API key)
    ├── alfred-openclaw.snippet.json — MCP registration for Alfred
    └── hermes-mcp.snippet.yaml      — MCP registration for Hermes
```
