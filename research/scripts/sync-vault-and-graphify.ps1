<#
.SYNOPSIS
  Close the protocol_hive.md §6 sync loop on the LOCAL machine:
    git → Obsidian vault → Graphify graph.

  The cloud cortex authors docs but CANNOT reach E:\ or the vault (protocol §5).
  Run this on Barak's machine (or via local Claude Code) after pulling a commit
  that changed research/*.md.

.DESCRIPTION
  Three steps, each skippable:
    1. git pull        — fast-forward the bee-assets clone
    2. vault mirror    — copy research/**/*.md into the Obsidian vault's BEE folder,
                         preserving subdirectory structure (so [[wikilinks]] resolve)
    3. graphify extract — rebuild the code-knowledge graph into research/graphify-out/

  All paths default to the canonical values in research/PATHS.md. VERIFY them against
  PATHS.md if the machine layout changed — never guess a path (protocol §3.6a).

.PARAMETER RepoRoot
  The bee-assets clone root. Defaults to two levels up from this script
  (research/scripts/ -> repo root).

.PARAMETER VaultBeeDir
  Target folder inside the Obsidian vault for BEE notes.
  Canonical vault (PATHS.md): E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\
  Default target: <vault>\3-Projects\BEE\

.PARAMETER SkipPull
  Skip step 1 (git pull).
.PARAMETER SkipVault
  Skip step 2 (vault mirror).
.PARAMETER SkipGraphify
  Skip step 3 (graphify extract).
.PARAMETER Backend
  Graphify LLM backend. Default 'deepseek'. NOTE: graphify 0.8.38 silently ignores
  '--backend X' (space form) in cluster-only/label — this script ALWAYS uses the
  '--backend=X' equals form, which is the only one that works.
.PARAMETER DryRun
  Show what would happen without copying or extracting.
.PARAMETER ForceCanon
  Always overwrite hub canon files in the vault even if vault copy is newer:
  BRAIN.md, PATHS.md, protocol_hive.md, AGENT_CANON.md, SYNC_STATUS.md.
  Use this to keep the dynamic brain authoritative from git.
.PARAMETER ForceAll
  Overwrite EVERY vault markdown from git (destructive to Obsidian hand-edits).

.EXAMPLE
  pwsh research/scripts/sync-vault-and-graphify.ps1
.EXAMPLE
  pwsh research/scripts/sync-vault-and-graphify.ps1 -SkipPull -DryRun
.EXAMPLE
  pwsh research/scripts/sync-vault-and-graphify.ps1 -SkipPull -ForceCanon
#>
[CmdletBinding()]
param(
  [string]$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$VaultBeeDir = "E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\3-Projects\BEE",
  [switch]$SkipPull,
  [switch]$SkipVault,
  [switch]$SkipGraphify,
  [switch]$SkipCluster,
  [switch]$PushCanonToAgents,   # OPT-IN: also push AGENT_CANON.md into the live agents' memory dirs
  [switch]$ForceCanon,
  [switch]$ForceAll,
  [string]$Backend = "deepseek",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

# Encoding hardening — the vault path contains Hebrew; make sure the console + pipes are UTF-8
# (matters under Windows PowerShell 5.1, which the hook may invoke as a fallback).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

# Env override for the (Hebrew) vault path — lets Barak set an ASCII-safe path that avoids any
# source-encoding fragility: setx BEE_VAULT_BEE_DIR "E:\...\3-Projects\BEE"
if ($env:BEE_VAULT_BEE_DIR) { $VaultBeeDir = $env:BEE_VAULT_BEE_DIR }

# Load DEEPSEEK_API_KEY for graphify without User-scope pollution (OpenClaw trap).
# Canonical secrets file: PATHS.md → E:\Desktop\OpenClawAgent\secrets\bee-integrations.env
function Ensure-DeepSeekKey {
  if ($env:DEEPSEEK_API_KEY -and $env:DEEPSEEK_API_KEY.StartsWith("sk-")) {
    Info "DEEPSEEK_API_KEY already set (process scope)"
    return $true
  }
  $candidates = @(
    $env:BEE_SECRETS_ENV,
    "E:\Desktop\OpenClawAgent\secrets\bee-integrations.env",
    (Join-Path $env:USERPROFILE ".openclaw\secrets\bee-integrations.env")
  ) | Where-Object { $_ } | Select-Object -Unique
  foreach ($sf in $candidates) {
    if (-not (Test-Path $sf)) { continue }
    $m = Select-String -Path $sf -Pattern '(?i)(?:DEEPSEEK[_-]?API[_-]?KEY)\s*[=:]\s*["'']?(sk-[A-Za-z0-9_-]+)' -ErrorAction SilentlyContinue
    if ($m -and $m.Matches.Count -gt 0) {
      $env:DEEPSEEK_API_KEY = $m.Matches[0].Groups[1].Value
      Ok "loaded DEEPSEEK_API_KEY from secrets file (process scope only)"
      return $true
    }
  }
  Warn "DEEPSEEK_API_KEY not set and not found in secrets — graphify docs pass will fail"
  return $false
}

# Single-runner lock (§3.2 — the sync pipeline must obey the same rule it mandates elsewhere).
# Two commits in quick succession would otherwise race on graphify-out/ + the vault copy.
$lockFile = Join-Path ([System.IO.Path]::GetTempPath()) "bee-sync.lock"
if (-not $DryRun) {
  if (Test-Path $lockFile) {
    $age = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    if ($age.TotalMinutes -lt 30) { Warn "another sync is running (lock < 30min old) — exiting to avoid a race."; exit 0 }
    Warn "stale lock (> 30min) — taking over."
  }
  Set-Content -Path $lockFile -Value "$PID $(Get-Date -Format o)" -Encoding utf8
}

$researchDir = Join-Path $RepoRoot "research"
if (-not (Test-Path $researchDir)) {
  throw "research/ not found under RepoRoot='$RepoRoot'. Pass -RepoRoot explicitly (see PATHS.md)."
}
Write-Host "BEE sync — repo: $RepoRoot" -ForegroundColor White
if ($DryRun) { Warn "DRY RUN — no files copied, no extract run." }

# ── Step 1: git pull ───────────────────────────────────────────────────────
if (-not $SkipPull) {
  Info "git pull (origin, current branch)..."
  if (-not $DryRun) {
    Push-Location $RepoRoot
    try { git pull --ff-only 2>&1 | ForEach-Object { "    $_" } }
    finally { Pop-Location }
  }
  Ok "pull done"
} else { Warn "skipped git pull" }

# ── Step 2: mirror research/**/*.md into the vault ─────────────────────────
$canonNames = @("BRAIN.md", "PATHS.md", "protocol_hive.md", "AGENT_CANON.md", "SYNC_STATUS.md")
$copied = 0; $kept = 0; $identical = 0; $forced = 0
$graphifyStatus = "skipped"
$branch = ""; $commit = ""
try {
  Push-Location $RepoRoot
  $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
  $commit = (git rev-parse --short HEAD 2>$null)
} finally { Pop-Location }

function Get-Sha([string]$p) {
  if (-not (Test-Path $p)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -Path $p).Hash
}

if (-not $SkipVault) {
  Info "mirroring research/**/*.md -> $VaultBeeDir"
  $vaultParent = Split-Path $VaultBeeDir -Parent
  if (-not (Test-Path $vaultParent)) {
    Warn "vault parent '$vaultParent' not found — is the Obsidian vault path correct? (see PATHS.md). Skipping vault mirror."
  } else {
    $mdFiles = Get-ChildItem -Path $researchDir -Recurse -Filter *.md -File
    foreach ($f in $mdFiles) {
      $rel = $f.FullName.Substring($researchDir.Length).TrimStart('\','/')
      $dest = Join-Path $VaultBeeDir $rel
      $destDir = Split-Path $dest -Parent
      $base = Split-Path $rel -Leaf
      $isCanon = $canonNames -contains $base
      if ($DryRun) { Write-Host "    would copy $rel"; continue }

      # Content-hash: if identical, skip (Obsidian often bumps mtime without edits).
      if ((Test-Path $dest) -and ((Get-Sha $dest) -eq (Get-Sha $f.FullName))) {
        $identical++; continue
      }

      $forceThis = $ForceAll -or ($ForceCanon -and $isCanon)
      if (-not $forceThis -and (Test-Path $dest) -and ((Get-Item $dest).LastWriteTime -gt $f.LastWriteTime)) {
        # Conflict: different content AND vault newer — keep vault (non-destructive),
        # except ForceCanon hubs which stay under git authority.
        Warn "vault copy newer + different — KEEPING vault edit: $rel"
        $kept++; continue
      }

      if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
      Copy-Item -Path $f.FullName -Destination $dest -Force
      if ($forceThis) { $forced++ } else { $copied++ }
    }
    $status = if ($DryRun) { "(dry-run)" } else { "($copied copied, $forced forced, $identical identical, $kept vault-newer kept)" }
    Ok "$($mdFiles.Count) markdown files $status"
    if ($kept -gt 0) { Warn "$kept vault file(s) were newer and preserved — reconcile those edits back into git (or -ForceAll)." }
  }
} else { Warn "skipped vault mirror" }

# ── Step 3: graphify extract ───────────────────────────────────────────────
if (-not $SkipGraphify) {
  $null = Ensure-DeepSeekKey
  $graphify = Get-Command graphify -ErrorAction SilentlyContinue
  if (-not $graphify) {
    Warn "graphify not on PATH. Install: pip install 'graphifyy[anthropic,openai]'  (PyPI pkg is 'graphifyy' — double y; CLI is 'graphify')."
    $graphifyStatus = "missing-cli"
  } else {
    # ALWAYS the equals form — '--backend $Backend' (space) is silently ignored by 0.8.38.
    Info "graphify extract . --update --backend=$Backend   (output -> research/graphify-out/)"
    if (-not $DryRun) {
      Push-Location $researchDir
      try {
        & graphify extract . --update "--backend=$Backend" 2>&1 | ForEach-Object { "    $_" }
        if ($LASTEXITCODE -ne 0) {
          Warn "graphify exited $LASTEXITCODE — need process-scoped DEEPSEEK_API_KEY (script auto-loads from bee-integrations.env when present)."
          $graphifyStatus = "extract-failed"
        } else {
          Ok "graphify graph rebuilt"
          $graphifyStatus = "extract-ok"
        }

        # cluster-only regenerates GRAPH_REPORT.md + names communities (a separate LLM pass
        # that `extract` does NOT do). Pricier than incremental extract, so the per-commit
        # hook skips it (-SkipCluster) and it runs on manual syncs. ALWAYS the '=' form.
        if (-not $SkipCluster) {
          Info "graphify cluster-only . --backend=$Backend   (regenerates GRAPH_REPORT.md + community names)"
          & graphify cluster-only . "--backend=$Backend" 2>&1 | ForEach-Object { "    $_" }
          if ($LASTEXITCODE -ne 0) { Warn "graphify cluster-only exited $LASTEXITCODE"; $graphifyStatus = "cluster-failed" }
          else { Ok "GRAPH_REPORT.md + communities named"; $graphifyStatus = "extract+cluster-ok" }
        } else { Warn "skipped graphify cluster-only (run manually for a fresh GRAPH_REPORT.md)" }
      } finally { Pop-Location }
    } else {
      $graphifyStatus = "dry-run"
    }
  }
} else { Warn "skipped graphify extract"; $graphifyStatus = "skipped" }

# ── Step 4 (OPT-IN): push AGENT_CANON.md into the live agents' memory dirs ──────────────
# The §6 loop is otherwise one-way (git -> vault/graph) and never reaches Alfred/Hermes, so
# they drift. This is the return-edge: keep a fresh copy of the canon digest where each agent
# already reads at startup. OFF by default (touches live agents). Set the dirs via env:
#   $env:BEE_ALFRED_WORKSPACE  = "C:\Users\Barak\.openclaw\workspace"
#   $env:BEE_HERMES_MEMORY_DIR = "C:\Users\Barak\AppData\Local\hermes\...\memories"
# NOTE: copying the file is only HALF the edge — each agent must also be told to READ
# BEE_CANON.md at session start (a constitutional AGENTS.md change for Alfred / a Hermes
# startup hook). See BRAIN.md §10 for the exact wiring to approve.
if ($PushCanonToAgents) {
  $canon = Join-Path $researchDir "AGENT_CANON.md"
  if (-not (Test-Path $canon)) { Warn "AGENT_CANON.md not found — skipping canon push." }
  else {
    foreach ($pair in @(@{n="Alfred"; d=$env:BEE_ALFRED_WORKSPACE}, @{n="Hermes"; d=$env:BEE_HERMES_MEMORY_DIR})) {
      if (-not $pair.d) { Warn "$($pair.n) dir env not set — skipping (set BEE_ALFRED_WORKSPACE / BEE_HERMES_MEMORY_DIR)."; continue }
      if (-not (Test-Path $pair.d)) { Warn "$($pair.n) dir '$($pair.d)' not found — skipping."; continue }
      $target = Join-Path $pair.d "BEE_CANON.md"
      if ($DryRun) { Write-Host "    would push canon -> $target"; continue }
      Copy-Item -Path $canon -Destination $target -Force
      Ok "canon pushed to $($pair.n): $target"
    }
  }
} elseif (-not $DryRun) { Info "canon push to agents: OFF (use -PushCanonToAgents once the agent-side read is wired — BRAIN §10)" }

# ── Step 5: write SYNC_STATUS.md into the vault (dynamic brain heartbeat) ──
if (-not $SkipVault -and -not $DryRun -and (Test-Path $VaultBeeDir)) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $graphAge = "n/a"
  $gj = Join-Path $researchDir "graphify-out\graph.json"
  if (Test-Path $gj) {
    $graphAge = "{0:N1}h" -f (((Get-Date) - (Get-Item $gj).LastWriteTime).TotalHours)
  }
  $hooks = ""
  try { Push-Location $RepoRoot; $hooks = (git config --get core.hooksPath 2>$null) } finally { Pop-Location }
  $statusBody = @"
---
aliases:
  - SYNC_STATUS
  - סטטוס סנכרון
tags:
  - bee
  - sync
  - status
---

# ``[[SYNC_STATUS]]`` — dynamic brain heartbeat

> Auto-written by ``sync-vault-and-graphify.ps1``. Do not hand-edit (next sync overwrites).
> Hub: ``[[BRAIN]]``

| Field | Value |
|---|---|
| **Last sync** | $now |
| **Branch** | ``$branch`` |
| **Commit** | ``$commit`` |
| **Vault target** | ``$VaultBeeDir`` |
| **Copied / forced / identical / kept** | $copied / $forced / $identical / $kept |
| **Graphify** | $graphifyStatus (graph.json age: $graphAge) |
| **Hooks path** | ``$hooks`` |
| **ForceCanon** | $ForceCanon |
| **PushCanonToAgents** | $PushCanonToAgents |

## Loop

``````
git (research/**/*.md)  →  Obsidian vault (wikilinks)  →  Graphify (research/graphify-out/)
``````

Verify: ``pwsh -File research/scripts/verify-brain-sync.ps1``
"@
  # Use single backticks in the written file — fix the double-backtick escaping above
  $statusBody = $statusBody -replace '``', '`'
  $statusPath = Join-Path $VaultBeeDir "SYNC_STATUS.md"
  Set-Content -Path $statusPath -Value $statusBody -Encoding utf8
  Ok "wrote vault SYNC_STATUS.md (heartbeat)"
}

# Release the single-runner lock (stale locks self-heal after 30min if the script crashed).
if (-not $DryRun -and (Test-Path $lockFile)) { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "Done. Commit research/graphify-out/ if it changed, so the graph stays in git too (§6 loop)." -ForegroundColor White
Write-Host "Verify: pwsh -File research/scripts/verify-brain-sync.ps1" -ForegroundColor Cyan
