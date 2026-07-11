<#
.SYNOPSIS
  Verify the dynamic BEE brain sync loop: git ↔ Obsidian ↔ Graphify.

.DESCRIPTION
  Read-only healthcheck for protocol_hive §6. Prints PASS/WARN/FAIL for each
  link in the chain. Exit code = number of FAILs (0 = healthy enough to work).

.EXAMPLE
  pwsh -File E:\bee-assets\research\scripts\verify-brain-sync.ps1
.EXAMPLE
  pwsh -File .\research\scripts\verify-brain-sync.ps1 -VaultBeeDir $env:BEE_VAULT_BEE_DIR
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$VaultBeeDir = $(if ($env:BEE_VAULT_BEE_DIR) { $env:BEE_VAULT_BEE_DIR } else {
    "E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\3-Projects\BEE"
  })
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

$pass = 0; $warn = 0; $fail = 0
function Pass($m){ Write-Host "  PASS  $m" -ForegroundColor Green; $script:pass++ }
function Warn($m){ Write-Host "  WARN  $m" -ForegroundColor Yellow; $script:warn++ }
function Fail($m){ Write-Host "  FAIL  $m" -ForegroundColor Red; $script:fail++ }
function Info($m){ Write-Host "  ----  $m" -ForegroundColor DarkGray }

function Get-FileSha256([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -Path $path).Hash
}

Write-Host ""
Write-Host "BEE brain sync verify — dynamic loop check" -ForegroundColor White
Write-Host ""

# 1) Repo
$research = Join-Path $RepoRoot "research"
$brainRepo = Join-Path $research "BRAIN.md"
if (-not (Test-Path $brainRepo)) { Fail "research/BRAIN.md missing under $RepoRoot" }
else { Pass "repo BRAIN.md present" }

Push-Location $RepoRoot
try {
  $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
  $commit = (git rev-parse --short HEAD 2>$null)
  $hooks = (git config --get core.hooksPath 2>$null)
  Info "branch=$branch  commit=$commit  hooksPath=$hooks"
  if ($branch -match 'brain-obsidian|capability-extensions|main') { Pass "on a known BEE branch ($branch)" }
  else { Warn "unusual branch: $branch (expected brain-obsidian-bridge or capability-extensions)" }

  if ($hooks -eq "research/scripts/git-hooks") { Pass "post-commit hook path installed (core.hooksPath)" }
  else { Fail "core.hooksPath not set to research/scripts/git-hooks — run install-git-hooks.ps1" }

  $hookFile = Join-Path $RepoRoot "research\scripts\git-hooks\post-commit"
  if (Test-Path $hookFile) { Pass "post-commit hook file exists" }
  else { Fail "post-commit hook file missing" }
} finally { Pop-Location }

# 2) Vault mirror — hub files
Info "vault target: $VaultBeeDir"
if (-not (Test-Path $VaultBeeDir)) {
  Fail "vault BEE dir not found — set BEE_VAULT_BEE_DIR or fix PATHS.md path"
} else {
  Pass "vault BEE dir exists"

  $canon = @("BRAIN.md", "PATHS.md", "protocol_hive.md", "AGENT_CANON.md")
  foreach ($name in $canon) {
    $src = Join-Path $research $name
    $dst = Join-Path $VaultBeeDir $name
    if (-not (Test-Path $src)) { Warn "repo missing $name"; continue }
    if (-not (Test-Path $dst)) { Fail "vault missing $name — re-run sync-vault-and-graphify.ps1 -ForceCanon"; continue }
    $hs = Get-FileSha256 $src
    $hd = Get-FileSha256 $dst
    if ($hs -eq $hd) { Pass "vault $name matches git (hash)" }
    else {
      $srcT = (Get-Item $src).LastWriteTime
      $dstT = (Get-Item $dst).LastWriteTime
      if ($dstT -gt $srcT) {
        Warn "vault $name DIFFERS from git and is newer — vault edit kept; reconcile or -ForceCanon"
      } else {
        Fail "vault $name stale vs git — run sync with -ForceCanon"
      }
    }
  }

  # Wikilink targets commonly linked from BRAIN
  $linked = @(
    "phase-3\Wave_53_Unified_Data_Spine.md",
    "phase-3\mvp-build-plan.md",
    "phase-3\decisions-2026-06-16.md",
    "knowledge-base\README.md"
  )
  foreach ($rel in $linked) {
    $p = Join-Path $VaultBeeDir $rel
    if (Test-Path $p) { Pass "vault has $rel" }
    else { Warn "vault missing linked note $rel" }
  }

  $statusNote = Join-Path $VaultBeeDir "SYNC_STATUS.md"
  if (Test-Path $statusNote) {
    Pass "SYNC_STATUS.md present in vault"
    Get-Content $statusNote -TotalCount 12 | ForEach-Object { Info $_ }
  } else {
    Warn "SYNC_STATUS.md not yet written — next sync with upgraded script will create it"
  }
}

# 3) Graphify
$graphify = Get-Command graphify -ErrorAction SilentlyContinue
if ($graphify) {
  Pass "graphify CLI on PATH ($($graphify.Source))"
} else {
  Warn "graphify not on PATH — vault sync works, but §6 graph rebuild is inactive. Install: pip install 'graphifyy[anthropic,openai]'"
}

$graphJson = Join-Path $research "graphify-out\graph.json"
$graphHtml = Join-Path $research "graphify-out\graph.html"
$graphReport = Join-Path $research "graphify-out\GRAPH_REPORT.md"
if (Test-Path $graphJson) {
  $ageHrs = [math]::Round(((Get-Date) - (Get-Item $graphJson).LastWriteTime).TotalHours, 1)
  if ($ageHrs -le 48) { Pass "graphify-out/graph.json present (age ${ageHrs}h)" }
  else { Warn "graphify-out/graph.json is ${ageHrs}h old — run sync WITHOUT -SkipGraphify" }
} else {
  Warn "graphify-out/graph.json missing"
}
if (Test-Path $graphHtml) { Pass "graphify-out/graph.html present" } else { Warn "graph.html missing" }
if (Test-Path $graphReport) { Pass "GRAPH_REPORT.md present" } else { Warn "GRAPH_REPORT.md missing" }

# 4) Hook log + env
$gitDir = Join-Path $RepoRoot ".git"
$log = Join-Path $gitDir "bee-sync.log"
if (Test-Path $log) {
  Pass "bee-sync.log exists (.git/bee-sync.log)"
  Get-Content $log -Tail 5 | ForEach-Object { Info $_ }
} else {
  Warn "no bee-sync.log yet — will appear after the next commit"
}

if ($env:BEE_HOOK_ARGS) {
  Info "BEE_HOOK_ARGS=$($env:BEE_HOOK_ARGS)"
  if ($env:BEE_HOOK_ARGS -match 'SkipGraphify|skip-graphify') {
    Warn "hook skips Graphify — dynamic graph updates OFF. Clear BEE_HOOK_ARGS or remove -SkipGraphify for full §6"
  } else {
    Pass "hook args allow graphify extract"
  }
} else {
  Pass "BEE_HOOK_ARGS unset — default hook runs vault + incremental graphify (-SkipPull -SkipCluster)"
}

if ($env:BEE_ALFRED_WORKSPACE -or $env:BEE_HERMES_MEMORY_DIR) {
  Info "agent canon dirs set (Alfred/Hermes) — use -PushCanonToAgents on sync"
} else {
  Warn "Alfred/Hermes canon push dirs unset — live agents still drift (see WIRE_AGENTS_TO_CANON.md)"
}

Write-Host ""
Write-Host "Summary: $pass PASS · $warn WARN · $fail FAIL" -ForegroundColor $(if ($fail -gt 0) { "Red" } elseif ($warn -gt 0) { "Yellow" } else { "Green" })
Write-Host ""
if ($fail -eq 0 -and $warn -le 3) {
  Write-Host "Dynamic brain: GOOD ENOUGH — open [[BRAIN]] in Obsidian; commits will refresh vault+graph." -ForegroundColor Green
} elseif ($fail -eq 0) {
  Write-Host "Dynamic brain: PARTIAL — vault OK; clear WARNs for full loop (graphify / agents)." -ForegroundColor Yellow
} else {
  Write-Host "Dynamic brain: BROKEN links — fix FAILs, then re-run:" -ForegroundColor Red
  Write-Host "  pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipPull -ForceCanon" -ForegroundColor Cyan
}
Write-Host ""
exit $fail
