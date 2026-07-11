<#
.SYNOPSIS
  One-shot LOCAL connection: push BEE_CANON into Alfred + Hermes and print verify checklist.

.DESCRIPTION
  Cloud cannot reach E:\ (protocol §5). Run this on Barak's Windows PC after:
    git pull origin cursor/hive-cortex-platform-634e
    (or merge PR, then pull main)

  Steps:
    1. Ensure Hermes bee-canon dir exists
    2. setx env vars for sync script (new shells pick them up)
    3. Copy platform/canon/BEE_CANON.md (or AGENT_CANON.md) into both agent dirs
    4. Print the TWO manual constitutional edits still required (Alfred AGENTS.md + Hermes config)

.EXAMPLE
  pwsh -File platform\connections\connect-local.ps1
  pwsh -File platform\connections\connect-local.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$AlfredWorkspace = $(if ($env:BEE_ALFRED_WORKSPACE) { $env:BEE_ALFRED_WORKSPACE } else { "C:\Users\Barak\.openclaw\workspace" }),
  [string]$HermesCanonDir = $(if ($env:BEE_HERMES_MEMORY_DIR) { $env:BEE_HERMES_MEMORY_DIR } else { "C:\Users\Barak\.hermes\bee-canon" }),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE Hive Cortex — connect-local`n" -ForegroundColor White

$canonCandidates = @(
  (Join-Path $RepoRoot "platform\canon\BEE_CANON.md"),
  (Join-Path $RepoRoot "platform\canon\AGENT_CANON.md"),
  (Join-Path $RepoRoot "research\AGENT_CANON.md")
)
$canonSrc = $canonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $canonSrc) { throw "No AGENT_CANON/BEE_CANON found under $RepoRoot" }
Info "canon source: $canonSrc"

# 1) Hermes dir
if (-not $DryRun) {
  New-Item -ItemType Directory -Force $HermesCanonDir | Out-Null
  Ok "Hermes canon dir: $HermesCanonDir"
} else {
  Info "[DryRun] would ensure $HermesCanonDir"
}

# 2) Persist env for future sync scripts
if (-not $DryRun) {
  setx BEE_ALFRED_WORKSPACE $AlfredWorkspace | Out-Null
  setx BEE_HERMES_MEMORY_DIR $HermesCanonDir | Out-Null
  Ok "setx BEE_ALFRED_WORKSPACE + BEE_HERMES_MEMORY_DIR (new shells)"
} else {
  Info "[DryRun] would setx agent dirs"
}

# 3) Copy canon
$targets = @(
  (Join-Path $AlfredWorkspace "BEE_CANON.md"),
  (Join-Path $HermesCanonDir "BEE_CANON.md")
)
foreach ($t in $targets) {
  $parent = Split-Path $t -Parent
  if (-not (Test-Path $parent)) {
    Warn "missing dir $parent — create/fix path, then re-run"
    continue
  }
  if ($DryRun) {
    Info "[DryRun] would copy → $t"
  } else {
    Copy-Item -Force $canonSrc $t
    Ok "copied → $t"
  }
}

# 4) If research sync script exists, optionally invoke PushCanonToAgents
$sync = Join-Path $RepoRoot "research\scripts\sync-vault-and-graphify.ps1"
if (Test-Path $sync) {
  Info "found research sync script — running -SkipGraphify -PushCanonToAgents"
  if (-not $DryRun) {
    pwsh -File $sync -SkipPull -SkipGraphify -PushCanonToAgents
  }
} else {
  Warn "research/scripts/sync-vault-and-graphify.ps1 not on this branch — file copy above is enough for P0"
}

Write-Host "`n=== MANUAL STEPS STILL REQUIRED (constitutional) ===`n" -ForegroundColor Yellow
Write-Host @"
1) Alfred — edit AGENTS.md Session Startup (ONLY Barak):
   File: usually C:\Users\Barak\.openclaw\workspace\AGENTS.md
         (or OpenClawAgent copy — follow PATHS.md; workspace is the one Alfred reads)
   Add step 5: Read BEE_CANON.md — locked facts are AUTHORITATIVE over MEMORY.md.

2) Hermes — config.yaml memory.external_dirs:
   - "$($HermesCanonDir -replace '\\','\\')"
   Raise memory_char_limit to 4096 if needed.
   Set bridge_port: 3100 (Alfred keeps ~3000).

3) Verify:
   Ask Alfred + Hermes: "what bank does BEE use and VAT cadence?"
   Expect: Mercantile code 17 / monthly.

4) Cursor Desktop MCP (for cloud collect.monday):
   Settings → MCP → authenticate Monday (P0) · Notion optional.

Full runbook: platform\connections\WIRE_AGENTS_TO_CANON.md
"@

Write-Host "`nDone. Re-run cloud suite after verify: node platform/connections/connect-cloud.mjs`n" -ForegroundColor Green
