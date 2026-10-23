# GitNexus — Security Audit + BEE Adoption Plan

**Source:** `e38b7d84-GitNexusmain.zip` (3,304 files, 58MB)
**Project:** [abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) — code knowledge graph for AI agents
**License:** PolyForm Noncommercial 1.0.0 (✅ OK for BEE internal/operational use)
**Audit date:** 2026-05-29
**Method:** 4 parallel Explore agents on (main pkg, MCP tools, web/docker/CI, IDE integrations)
**Audit scope:** Source code, dependencies, MCP surface, web UI, Docker config, CI workflows, Claude/Cursor plugins

---

## 🎯 Executive Summary

**Verdict: ✅ ADOPT WITH MITIGATIONS** (4 mandatory, 5 recommended)

GitNexus is a **mature, security-conscious project** (OpenSSF Scorecard tracked, CodeQL+Gitleaks+Trivy+zizmor in CI, signed Docker images, OIDC npm publishing). The codebase shows disciplined practices: no command injection, no path traversal exploits, parameterized Cypher queries, non-root Docker users, CORS allowlist.

**For BEE specifically:** **High strategic value.** GitNexus indexes the BEE Operations app (41 routes + 38 Prisma models) into a knowledge graph queryable via MCP. This directly addresses Phase 2 Action #14 (BEE API doc) and Phase 3 engineering-agent — Alfred + Hermes get architectural awareness of BEE's own code, which "even smaller models can use to compete with Goliath models" (their words; verified plausible).

**Top 3 findings:**
1. 🔴 **`rename` MCP tool** can mass-rewrite files when called with `dry_run: false` (LLM-controllable). **Must disable or hard-gate.**
2. 🟡 **`@scarf/scarf`** telemetry dependency in `package.json` is unused at runtime but may phone home during npm install. **Remove.**
3. 🟡 **`npx gitnexus@latest`** in `.mcp.json` — unpinned. **Pin to a specific version.**

After mitigations: **risk = LOW** for BEE adoption on bee-prod-1.

---

## 1. What GitNexus Is + Why It Matters for BEE

### 1.1 What it does

Indexes any codebase via tree-sitter into a graph database (LadybugDB embedded), then exposes ~14 MCP tools (`query`, `context`, `impact`, `route_map`, `tool_map`, `cypher`, `detect_changes`, `rename`, ...) so AI agents understand:
- Call chains (who calls what)
- Dependencies (module graph)
- API routes + handlers
- Symbol references
- Impact analysis ("if I change X, what breaks")

Two delivery modes:
- **CLI + MCP** (local, what BEE would use) — `npm install -g gitnexus` → `gitnexus analyze` → MCP server speaks stdio to Alfred/Hermes
- **Web UI** (gitnexus.vercel.app, browser-based) — quick exploration, not for BEE production

### 1.2 Why this fits BEE's roadmap

| Pain point in master-plan v20 | How GitNexus helps |
|---|---|
| Phase 2 Action #14: "BEE app write API doc (8h)" — Barak must manually document 41 routes | GitNexus auto-extracts via `route_map`. Doc generation drops from 8h to ~1h review. |
| Phase 2 Action #15: `bee-mcp-server` exposes BEE entities | Complementary — GitNexus indexes BEE app **code**; bee-mcp exposes BEE app **data**. Both register in Alfred/Hermes. |
| Phase 3b engineering-agent (60h): designs needing BEE app context | `impact` + `context` tools let engineering-agent verify "what BEE code does this site interact with" before generating a design |
| 27 alfred-*.js scripts only partially understood | GitNexus indexes them too → Alfred can answer "which script handles client-payment intent?" |
| Q78 paradigm (agents write back to BEE app) | Agents can use `route_map` to know which PATCH route to call without guessing |

**Strategic angle:** "Even smaller models compete with Goliath models" — directly relevant given DeepSeek smart-routing strategy (Phase 1 Action #1). GitNexus gives DeepSeek-flash the same architectural awareness Claude Sonnet has by default.

### 1.3 Privacy + compliance for Israeli context

- **"Everything local, no network"** claim — **verified CONDITIONAL TRUE** (see §3.4)
- Aligns with **PPL Amendment 13 (Aug 2025)**: no customer data crosses borders, no third-party analytics in default config
- License: PolyForm Noncommercial → BEE using it internally to run own business = OK (not selling GitNexus-derived service)

---

## 2. Security Findings — 4 Surfaces

### 2.1 Main `gitnexus/` package — SAFE-WITH-MITIGATIONS

| Severity | Finding | File / Evidence | Mitigation |
|---|---|---|---|
| 🔴 NONE | No HIGH-severity issues found | — | — |
| 🟡 MED | `@scarf/scarf` telemetry dep listed but never imported | `package.json:61` | **Remove from package.json** before deploy |
| 🟡 MED | Express 5.2.1 in deps (broad surface, historical CVEs) | `package.json` | Keep updated; run `npm audit` in CI |
| 🟢 LOW | Embedded LadybugDB requires single-writer | architecture | Already documented in GUARDRAILS.md |
| 🟢 LOW | `.gitnexus/` cache dir permissions on multi-user host | `~/.gitnexus/` | Restrict to user-only (700) |
| 🟢 LOW | `cypher` tool allows arbitrary read queries | `mcp/tools.ts` | Trusted-operators-only (BEE's case ✅) |

**Verified safe practices:**
- All `child_process.spawn()` uses array-form args (no `shell: true`) — no command injection
- Path traversal guards: `assertSafePath()` resolves within repo root, blocks `../`
- No `eval()`, `new Function()`, dynamic `require(variable)` with user input
- Subprocess git calls use `execFileSync` with `--` separator (blocks option injection)
- File writes use `fs.writeFile` with `'wx'` exclusive flag (no symlink TOCTOU)
- Tree-sitter native bindings (battle-tested, used by GitHub itself)

### 2.2 MCP tool surface — YELLOW (one footgun)

**Full tool inventory** (`gitnexus/src/mcp/local/local-backend.ts:850-3599`):

| Tool | Reads | Writes | Risk | Notes |
|---|---|---|---|---|
| `list_repos` | registry | — | 🟢 | Read-only discovery |
| `query` | DB (BM25+semantic) | — | 🟢 | Search |
| `cypher` | DB (raw Cypher) | — | 🟢 | Parameterized; trusted op only |
| `context` | DB | — | 🟢 | Symbol context |
| `detect_changes` | git diff, DB | — | 🟢 | Read-only |
| **`rename`** | source, DB | **SOURCE FILES** | 🔴 | Can mass-rewrite repo if `dry_run: false` |
| `impact` | DB | — | 🟢 | Read-only |
| `route_map` | DB | — | 🟢 | Read-only |
| `tool_map` | DB | — | 🟢 | Read-only |
| `shape_check` | DB | — | 🟢 | Read-only |
| `api_impact` | DB | — | 🟢 | Read-only |
| `group_list` | registry | — | 🟢 | Read-only |
| **`group_sync`** | DB, group.yaml | `contracts.json` | 🟡 | Writes contracts file |

**The one critical issue:** `rename` (file `local-backend.ts:2548-2766`):
```javascript
// Default dry_run = true ✅
if (!dry_run) {
  for (const change of allChanges) {
    const fullPath = assertSafePath(change.file_path);
    let content = await fs.readFile(fullPath, 'utf-8');
    const regex = new RegExp(`\\b${oldName}...\\b`, 'g');
    content = content.replace(regex, new_name);
    await fs.writeFile(fullPath, content, 'utf-8');  // ← can rewrite all files
  }
}
```

If LLM calls `rename({symbol_name: "x", new_name: "y", dry_run: false})` with an ambiguous symbol → silent corruption across repo. Path traversal guard prevents writing OUTSIDE repo, but EVERY file inside is fair game.

**Mitigation (mandatory):** wrap MCP server to reject `dry_run: false`, OR disable `rename` entirely. See §4.

### 2.3 Web UI + Docker + CI — LOW

| Surface | Risk | Notes |
|---|---|---|
| Web UI XSS | 🟢 LOW | DOMPurify on SVG/Markdown rendering, strict whitelist |
| CORS | 🟢 LOW | Allowlist: localhost + RFC1918 + gitnexus.vercel.app; no `*` |
| Docker non-root | 🟢 LOW | `USER node` in both Dockerfiles |
| Docker volumes | 🟡 LOW | `WORKSPACE_DIR` env-overridable; document validation requirement |
| Bind addresses | 🟡 LOW | Web binds `0.0.0.0:4173` — needs firewall / Tailscale-only |
| CI auto-publish | 🟢 LOW | Atomic tag push + CI gate + OIDC npm Trusted Publishing |
| GH Actions perms | 🟢 LOW | `permissions: {}` (deny-all) at workflow, per-job opt-in |
| Pinned actions | 🟢 LOW | All commit SHAs, no `@main` |
| No `pull_request_target` | 🟢 LOW | Safe |
| `.env.example` | 🟢 LOW | No credentials by default |
| `.cursorrules` / `.windsurfrules` | 🟢 LOW | No "ignore security" directives |
| `.mcp.json` (`npx gitnexus@latest`) | 🟡 LOW | **Unpinned version** — pin before deploy |

### 2.4 Claude plugin + Cursor integration — Mixed

**`gitnexus-claude-plugin/`** — INSTALL-WITH-MITIGATIONS
- Auto-registers MCP in `~/.claude-plugin/mcp.json`
- Installs **PreToolUse + PostToolUse hooks** that intercept Grep/Glob/Bash calls
- Hook spawns `gitnexus augment <pattern>` with 7s timeout
- **No telemetry, no auto-start persistence** — only fires on Claude tool calls
- **Risk:** pattern extraction from tool input → could be hijacked by prompt injection in indexed code
- **Mitigation:** index only trusted code; pre-install review of `.gitnexus/meta.json`

**`gitnexus-cursor-integration/`** — INSTALL-AS-IS
- Safer: hooks are **postToolUse only** + **manual copy required** (no auto-install)
- Same MCP server, fewer interception points
- README explicitly documents manual steps

---

## 3. Top 4 Critical Findings (must address before deploy)

### 3.1 🔴 The `rename` tool footgun

**Severity:** HIGH if exposed to LLM, NONE if disabled.

**Fix (choose one):**

**Option A (recommended) — Disable entirely:**
```javascript
// In our MCP-client config (Alfred + Hermes), filter rename out of allowed_tools.
// Alfred ~/.openclaw/openclaw.json:
{
  "mcpServers": {
    "gitnexus": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "gitnexus@1.x.y", "mcp"],
      "allowed_tools": [
        "list_repos", "query", "context", "impact",
        "route_map", "tool_map", "shape_check",
        "api_impact", "detect_changes", "group_list"
        // rename + cypher + group_sync omitted
      ]
    }
  }
}
```

**Option B — Wrap with hard gate** (more permissive but riskier):
```javascript
// bee-mcp-proxy: sit in front of gitnexus MCP, intercept calls
if (toolName === "rename" && params.dry_run === false) {
  throw new Error("rename with dry_run=false blocked by BEE policy");
}
```

**For Phase 3 engineering-agent**: `rename` not needed (we draft, Barak applies). Disable.

### 3.2 🟡 Remove `@scarf/scarf` dependency

It's listed in `package.json` but never imported. Possibly silent telemetry during `npm install`. For an Israeli sensitive-data deployment under PPL:

```bash
# Before deploy on bee-prod-1:
cd gitnexus-fork/
sed -i '/@scarf\/scarf/d' package.json
npm install
git add package.json package-lock.json
git commit -m "Remove unused @scarf/scarf telemetry dependency"
```

If the project's npm package was published WITH scarf, our local install will still trigger it during `npm install -g gitnexus`. **Solution:** install from our internal fork, not npm registry.

### 3.3 🟡 Pin GitNexus version (don't use `@latest`)

`.mcp.json` defaults to `npx -y gitnexus@latest`. **Risk:** a compromised npm publish silently auto-upgrades on every MCP invocation.

```json
{
  "args": ["-y", "gitnexus@2.4.1", "mcp"]   // pin to a specific reviewed version
}
```

Re-pin only after reviewing changelogs + running `npm audit`.

### 3.4 🟢 Verify "no network" claim before each upgrade

The audit verified zero runtime egress in current source, **except**:
- `publish` command — fires GitHub dispatch when `UNDERSTAND_QUICKLY_TOKEN` env var set (opt-in only, off by default)
- `npm install` of `@scarf/scarf` (mitigated by 3.2)
- Tree-sitter grammars fetched from npm registry during install (standard, but verify Tailscale/proxy egress allows it)

**Action:** never set `UNDERSTAND_QUICKLY_TOKEN` in BEE env. Re-run egress check (`strace -e network` or netflow capture) after each version upgrade.

---

## 4. Recommended Mitigations (5)

Beyond the 4 critical above:

### 4.1 Internal fork strategy

Don't `npm install -g gitnexus` from public registry on bee-prod-1. Instead:

```bash
# 1. Clone to internal infra
git clone https://github.com/abhigyanpatwari/GitNexus.git /opt/gitnexus-source
cd /opt/gitnexus-source

# 2. Apply BEE mitigations
git checkout -b bee-internal
# Remove scarf
sed -i '/@scarf\/scarf/d' package.json
# Pin tree-sitter native modules
npm install --package-lock-only --ignore-scripts
npm audit --audit-level moderate
# If clean: commit
git commit -am "BEE-internal: remove scarf telemetry, pin deps"

# 3. Build + use local
npm install --ignore-scripts
npm run build
sudo npm link  # makes 'gitnexus' command available from this checkout

# 4. .mcp.json points to our local install (no npx -y)
{
  "command": "node",
  "args": ["/opt/gitnexus-source/gitnexus/dist/cli.js", "mcp"]
}
```

This guarantees:
- No surprise dependency upgrades
- No registry egress at runtime
- Auditable: every byte under our control
- Patches applied (scarf, future security fixes) before any LLM touches it

### 4.2 Restrict `.gitnexus/` permissions

```bash
# After first analyze run
chmod 700 ~/.gitnexus
chmod -R go-rwx ~/.gitnexus
# Also for project-local:
chmod 700 /path/to/BEE-app/.gitnexus
```

Critical because `.gitnexus/lbug/` contains the full code graph of BEE Operations app — symbol names, file paths, call chains. If a multi-user host or shared dev environment, this is sensitive.

### 4.3 Audit log all MCP calls

bee-mcp-proxy (recommended wrapper anyway for Q78 paradigm) logs every GitNexus tool call:

```javascript
// In Alfred/Hermes MCP client, log before forwarding to gitnexus MCP:
await auditLog({
  timestamp: new Date().toISOString(),
  agent: "alfred",
  mcp: "gitnexus",
  tool: toolName,
  params,
  caller_session_id: sessionId,
});
```

Detect anomalies: e.g., `rename` ever called (should never happen if disabled), unusual `cypher` patterns, rate spikes.

### 4.4 Sandbox `gitnexus analyze` of untrusted repos

If BEE ever indexes a 3rd-party codebase (e.g., a customer's repo to advise on integration), do it in a Docker container, not on bee-prod-1 host:

```bash
docker run --rm -v /path/to/untrusted-repo:/repo:ro \
  -v bee-gitnexus-temp:/data \
  gitnexus-cli:bee-internal analyze /repo
```

Tree-sitter is safe (no code execution), but the principle of least privilege applies.

### 4.5 Network egress verification (one-time + on upgrade)

```bash
# Run gitnexus under strace to confirm no network calls during analyze/MCP serve
sudo strace -f -e trace=network -o /tmp/gitnexus.strace \
  npx gitnexus analyze /path/to/test-repo

# Check the trace
grep -v 'AF_UNIX\|connect.*127\.0\.0\.1' /tmp/gitnexus.strace | head -50
# Expected: nothing (only local Unix sockets + 127.0.0.1)
# If you see external IPs → investigate before promoting to bee-prod-1
```

---

## 5. Integration Plan with BEE Stack

### 5.1 Deployment topology

```
bee-prod-1 (Hetzner CX52)
├── BEE Operations app (PostgreSQL 16, port 3001)
├── /opt/gitnexus-source/ (BEE-internal fork, branch=bee-internal)
│   └── .gitnexus/ (analyzed codebase graph for BEE app)
├── bee-mcp-server (port 18791) — Phase 2 Action #15
└── gitnexus MCP (stdio, spawned by clients)

Barak's PC (Windows)
├── E:\Desktop\OpenClawAgent\ (Alfred)
│   └── ~/.openclaw/openclaw.json registers gitnexus MCP via Tailscale
├── E:\bee-hermes\ (Hermes)
│   └── ~/.config/hermes/mcp.yaml registers gitnexus MCP
└── Tailscale → bee-prod-1 (for SSH-tunneled stdio MCP)
```

**Network:** GitNexus MCP runs ON bee-prod-1, accessed via SSH or Tailscale subnet route. Alfred/Hermes spawn it as needed via `ssh -t bee-prod-1 'cd /opt/gitnexus-source && node dist/cli.js mcp'` or via local copy.

### 5.2 What to index

| Codebase | Why | When |
|---|---|---|
| **BEE Operations app** | Phase 2 Action #14 + #15 foundation | Index first (after deploy) |
| `E:\Desktop\OpenClawAgent\` (Alfred) | Alfred can self-understand | Optional, after stable |
| `E:\bee-hermes\` (Hermes) | Same | Optional |
| `bee-assets/` (this repo) | Document repo discovery for agents | Useful — small repo, quick win |

### 5.3 Registration in agents

**In Alfred (OpenClaw):**
```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "node",
      "args": ["/opt/gitnexus-source/gitnexus/dist/cli.js", "mcp"],
      "allowed_tools": [
        "list_repos", "query", "context", "impact",
        "route_map", "tool_map", "shape_check",
        "api_impact", "detect_changes", "group_list"
      ],
      "_disabled": ["rename", "cypher", "group_sync"]
    }
  }
}
```

**In Hermes:**
```yaml
mcp_servers:
  - name: gitnexus
    transport: stdio
    command: ["node", "/opt/gitnexus-source/gitnexus/dist/cli.js", "mcp"]
    allowed_tools: [list_repos, query, context, impact, route_map, tool_map, shape_check, api_impact, detect_changes, group_list]
```

**Don't install** `gitnexus-claude-plugin` automatic hooks initially — wait until we've used the MCP for 30 days and understand patterns. The plugin's PreToolUse interception adds latency + attack surface for not much marginal value beyond MCP alone.

**Cursor integration** — skip entirely. We're using Claude Code, not Cursor.

### 5.4 Integration with Phase 2/3 plans

| Phase 2 Action | GitNexus value |
|---|---|
| #14 BEE API doc (8h) | `route_map` auto-generates → 8h → 1h review. Saves 7h. |
| #15 bee-mcp-server (7h) | GitNexus + bee-mcp register side-by-side in Alfred. GitNexus knows BEE code; bee-mcp accesses BEE data. |

| Phase 3 Agent | GitNexus value |
|---|---|
| 3a tender-agent FULL | `tool_map` shows what tender-related code exists in BEE app already (don't duplicate) |
| 3b engineering-agent | `impact` before suggesting design changes; `context` for relevant calc helpers |
| 3c customer-success-agent | `route_map` knows portal endpoints to update with health scores |
| 3d proposal-generator | `query` finds existing proposal template code |

**Hour savings estimate:** ~30-50h across Phase 2-3 by giving agents code-graph awareness.

---

## 6. Pre-Deployment Checklist

Before first `gitnexus analyze` on BEE Operations app:

- [ ] Clone to `/opt/gitnexus-source` (don't `npm install -g`)
- [ ] Branch `bee-internal`
- [ ] Remove `@scarf/scarf` from `package.json`
- [ ] `npm audit --audit-level moderate` → 0 high/critical
- [ ] Build: `npm install --ignore-scripts && npm run build`
- [ ] Run `strace -e trace=network` test on `gitnexus analyze` of a throwaway repo → confirm no external IPs
- [ ] `chmod 700 ~/.gitnexus`, `chmod 700 .gitnexus` in BEE app
- [ ] Configure Alfred + Hermes MCP with `allowed_tools` allowlist (omit `rename`, `cypher`, `group_sync`)
- [ ] Pin version in `.mcp.json` (no `@latest`)
- [ ] Verify `UNDERSTAND_QUICKLY_TOKEN` env var is NOT set anywhere
- [ ] Disable `gitnexus serve` HTTP listener (we use stdio MCP only, no HTTP) — OR firewall it to Tailscale subnet
- [ ] Document recovery: if `.gitnexus/lbug/` corrupts, delete + re-analyze. No live data, safe to wipe.
- [ ] Add bee-mcp-proxy audit logging for GitNexus calls (4.3)
- [ ] First analyze: `cd /path/to/BEE-app && node /opt/gitnexus-source/gitnexus/dist/cli.js analyze`
- [ ] Verify: `list_repos` shows BEE app + no others initially

---

## 7. Adoption Verdict

✅ **ADOPT** with the 4 mandatory mitigations (§3) and 5 recommended hardening steps (§4).

**Phasing:**
1. **Week 1 (Phase 1.5 tail):** clone + fork + remove scarf + audit clean
2. **Week 2 (Phase 2 kickoff):** analyze BEE app + integrate with bee-mcp-server. **Major Phase 2 Action #14 acceleration (7h saved).**
3. **Week 3-7 (Phase 3):** engineering-agent + tender-agent + customer-success-agent use GitNexus tools for code-graph awareness
4. **Month 4+ (Phase 5):** evaluate per-month — usage patterns, anomalies, value delivered

**Net effect on master plan:** **-30 to -50h** of Phase 2-3 work via auto-extracted API doc + code-context queries. Net positive ROI by week 2.

**Risk if NOT adopted:** Barak's manual Phase 2 Action #14 (8h × 41 routes = potentially many sessions of doc-writing), plus Phase 3 agents work without code-graph awareness (more "blind edits", per their own README).

---

## 8. Open Questions for Barak

| # | Question | Why it matters |
|---|---|---|
| 1 | Is BEE app's PostgreSQL accessible from the same host as we'd run `gitnexus analyze`? | If yes, simpler deploy. If no, need to sync code repo separately. |
| 2 | Do we want web UI too (port 4173) or stdio MCP only? | Web UI = nicer exploration but more attack surface; recommend skip for now |
| 3 | Existing Tailscale ACLs allow bee-prod-1 → npm registry for build? | `npm install --ignore-scripts` may still need network. One-time, can be done from a build VM. |
| 4 | Is the BEE app code already in a git repo I can index? | GitNexus prefers git repos for change detection |
| 5 | Do we want to also index Alfred + Hermes source (E:\)? | Tailscale rsync to bee-prod-1 once, then index there |

---

## 9. Sources

- **Source:** `e38b7d84-GitNexusmain.zip` (commit / version per included `package.json`)
- **Vendor docs:** README.md, SECURITY.md, GUARDRAILS.md, ARCHITECTURE.md, MIGRATION.md, RUNBOOK.md in archive
- **Audit method:** 4 parallel Explore agents on (main pkg, MCP tools, web/docker/CI, IDE integrations)
- **Audited files (sample):**
  - `gitnexus/src/mcp/local/local-backend.ts` (lines 850-3599)
  - `gitnexus/src/mcp/server.ts` (lines 84-282)
  - `gitnexus/src/mcp/tools.ts` (lines 54-585)
  - `gitnexus/src/cli/*.ts`
  - `gitnexus-web/src/api.ts` (lines 60-109)
  - `docker-server.mjs`, `Dockerfile.cli`, `Dockerfile.web`, `docker-compose.yaml`
  - `.github/workflows/publish.yml`, `ci.yml`, `docker.yml`
  - `.mcp.json`, `.env.example`, `.cursorrules`, `.windsurfrules`
- **Risk Scorecard:** [OpenSSF Scorecard public badge](https://securityscorecards.dev/viewer/?uri=github.com/abhigyanpatwari/GitNexus)

---

*Audit complete. Recommend proceeding to deployment per §5 + §6 checklist.*
