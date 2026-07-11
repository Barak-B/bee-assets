<#
.SYNOPSIS
  One-shot: connect BEE BRAIN markdown into the Obsidian vault (Windows).

.DESCRIPTION
  Run this from ANY directory. It finds the bee-assets clone (PATHS.md default
  E:\bee-assets, or -RepoRoot / BEE_ASSETS_ROOT), stashes dirty local edits if
  needed, checks out the bridge branch, mirrors research/**/*.md into the vault,
  and optionally installs the post-commit hook.

  Chicken-and-egg: if this file is NOT on your current branch yet, first run the
  stash+checkout block in obsidian-vault/00-START-HERE.md, then re-run this script.

.EXAMPLE
  pwsh -File E:\bee-assets\research\scripts\connect-brain-to-obsidian.ps1

.EXAMPLE
  pwsh -File .\research\scripts\connect-brain-to-obsidian.ps1 -RepoRoot E:\bee-assets -DryRun
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = $(if ($env:BEE_ASSETS_ROOT) { $env:BEE_ASSETS_ROOT } else { "E:\bee-assets" }),
  [string]$Branch = "cursor/brain-obsidian-bridge-436d",
  [switch]$SkipPull,
  [switch]$SkipHooks,
  [switch]$SkipGraphify = $true,
  [switch]$SkipStash,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }
function Fail($m){ Write-Host "  FAIL  $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "BEE — connect BRAIN to Obsidian" -ForegroundColor White
Write-Host ""

# Resolve repo root: prefer explicit, else walk up from this script, else PATHS default.
$scriptRepo = $null
try {
  $here = Split-Path -Parent $PSScriptRoot   # research/
  $scriptRepo = Split-Path -Parent $here     # repo root
} catch {}

$candidates = @($RepoRoot, $scriptRepo, "E:\bee-assets", "E:\Desktop\bee-assets") | Where-Object { $_ } | Select-Object -Unique
$resolved = $null
foreach ($c in $candidates) {
  if (Test-Path (Join-Path $c "research\BRAIN.md")) { $resolved = (Resolve-Path $c).Path; break }
  if (Test-Path (Join-Path $c "research\scripts\sync-vault-and-graphify.ps1")) { $resolved = (Resolve-Path $c).Path; break }
}

if (-not $resolved) {
  Fail @"
Could not find the bee-assets clone.

You ran from: $((Get-Location).Path)
Tried: $($candidates -join ', ')

Fix:
  1) cd E:\bee-assets
  2) git stash push -u -m "pre-brain-obsidian"
  3) git checkout $Branch
  4) git pull
  5) pwsh -File .\research\scripts\connect-brain-to-obsidian.ps1 -SkipPull
"@
}

$RepoRoot = $resolved
Info "repo: $RepoRoot"
Set-Location $RepoRoot

$sync = Join-Path $RepoRoot "research\scripts\sync-vault-and-graphify.ps1"
$hooks = Join-Path $RepoRoot "research\scripts\install-git-hooks.ps1"
$connectOnBranch = Join-Path $RepoRoot "research\scripts\connect-brain-to-obsidian.ps1"

if (-not $SkipPull) {
  Info "git fetch origin..."
  if (-not $DryRun) {
    git fetch origin 2>&1 | ForEach-Object { "    $_" }
  }

  $current = (git rev-parse --abbrev-ref HEAD 2>$null)
  $dirty = (git status --porcelain 2>$null)
  if ($dirty -and -not $SkipStash -and $current -ne $Branch) {
    $stashMsg = "pre-brain-obsidian $(Get-Date -Format o)"
    Info "local changes detected — stashing as '$stashMsg'"
    Info "  (restore later with: git stash list   then   git stash pop)"
    if (-not $DryRun) {
      git stash push -u -m $stashMsg 2>&1 | ForEach-Object { "    $_" }
    }
    Ok "stashed"
  } elseif ($dirty -and $SkipStash) {
    Warn "dirty tree and -SkipStash set — checkout may fail"
  }

  if ($current -ne $Branch) {
    Info "checkout $Branch ..."
    if (-not $DryRun) {
      git checkout $Branch 2>&1 | ForEach-Object { "    $_" }
      if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Fail @"
checkout failed. Run manually:

  cd E:\bee-assets
  git stash push -u -m "pre-brain-obsidian"
  git checkout $Branch
  git pull
  pwsh -File .\research\scripts\connect-brain-to-obsidian.ps1 -SkipPull
"@
      }
    }
  }

  Info "pull --ff-only origin/$Branch ..."
  if (-not $DryRun) {
    git pull --ff-only origin $Branch 2>&1 | ForEach-Object { "    $_" }
  }
  Ok "on branch $Branch"
} else {
  Info "skipped git pull (current: $(git rev-parse --abbrev-ref HEAD))"
}

if (-not (Test-Path $sync)) {
  Fail "sync script missing after checkout: $sync"
}

$syncArgs = @("-SkipPull")
if ($SkipGraphify) { $syncArgs += "-SkipGraphify" }
if ($DryRun) { $syncArgs += "-DryRun" }

Info "running sync-vault-and-graphify.ps1 $($syncArgs -join ' ')"
& pwsh -NoProfile -File $sync @syncArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Fail "sync exited $LASTEXITCODE" }
Ok "vault mirror finished"

if (-not $SkipHooks -and -not $DryRun) {
  if (-not (Test-Path $hooks)) { Warn "hooks installer missing — skip" }
  else {
    Info "installing post-commit hook..."
    & pwsh -NoProfile -File $hooks
    Ok "hooks installed"
  }
} elseif ($DryRun) {
  Info "skipped hooks (dry-run)"
} else {
  Info "skipped hooks"
}

Write-Host ""
Write-Host "Next in Obsidian:" -ForegroundColor Green
Write-Host "  Open vault → search BRAIN or מוח → Graph view should center on BRAIN"
Write-Host "  If you stashed earlier: git stash list   /   git stash pop  (reconcile carefully)"
Write-Host ""
