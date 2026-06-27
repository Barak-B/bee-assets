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

.EXAMPLE
  pwsh research/scripts/sync-vault-and-graphify.ps1
.EXAMPLE
  pwsh research/scripts/sync-vault-and-graphify.ps1 -SkipPull -DryRun
#>
[CmdletBinding()]
param(
  [string]$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$VaultBeeDir = "E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\3-Projects\BEE",
  [switch]$SkipPull,
  [switch]$SkipVault,
  [switch]$SkipGraphify,
  [switch]$SkipCluster,
  [string]$Backend = "deepseek",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

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
if (-not $SkipVault) {
  Info "mirroring research/**/*.md -> $VaultBeeDir"
  $vaultParent = Split-Path $VaultBeeDir -Parent
  if (-not (Test-Path $vaultParent)) {
    Warn "vault parent '$vaultParent' not found — is the Obsidian vault path correct? (see PATHS.md). Skipping vault mirror."
  } else {
    $mdFiles = Get-ChildItem -Path $researchDir -Recurse -Filter *.md -File
    $copied = 0
    foreach ($f in $mdFiles) {
      $rel = $f.FullName.Substring($researchDir.Length).TrimStart('\','/')
      $dest = Join-Path $VaultBeeDir $rel
      $destDir = Split-Path $dest -Parent
      if ($DryRun) { Write-Host "    would copy $rel" }
      else {
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -Path $f.FullName -Destination $dest -Force
        $copied++
      }
    }
    $status = if ($DryRun) { "(dry-run)" } else { "($copied copied)" }
    Ok "$($mdFiles.Count) markdown files $status"
  }
} else { Warn "skipped vault mirror" }

# ── Step 3: graphify extract ───────────────────────────────────────────────
if (-not $SkipGraphify) {
  $graphify = Get-Command graphify -ErrorAction SilentlyContinue
  if (-not $graphify) {
    Warn "graphify not on PATH. Install: pip install 'graphifyy[anthropic,openai]'  (PyPI pkg is 'graphifyy' — double y; CLI is 'graphify')."
  } else {
    # ALWAYS the equals form — '--backend $Backend' (space) is silently ignored by 0.8.38.
    Info "graphify extract . --update --backend=$Backend   (output -> research/graphify-out/)"
    if (-not $DryRun) {
      Push-Location $researchDir
      try {
        & graphify extract . --update "--backend=$Backend" 2>&1 | ForEach-Object { "    $_" }
        if ($LASTEXITCODE -ne 0) { Warn "graphify exited $LASTEXITCODE — check the [anthropic]+[openai] extras + DEEPSEEK_API_KEY env." }
        else { Ok "graphify graph rebuilt" }

        # cluster-only regenerates GRAPH_REPORT.md + names communities (a separate LLM pass
        # that `extract` does NOT do). Pricier than incremental extract, so the per-commit
        # hook skips it (-SkipCluster) and it runs on manual syncs. ALWAYS the '=' form.
        if (-not $SkipCluster) {
          Info "graphify cluster-only . --backend=$Backend   (regenerates GRAPH_REPORT.md + community names)"
          & graphify cluster-only . "--backend=$Backend" 2>&1 | ForEach-Object { "    $_" }
          if ($LASTEXITCODE -ne 0) { Warn "graphify cluster-only exited $LASTEXITCODE" }
          else { Ok "GRAPH_REPORT.md + communities named" }
        } else { Warn "skipped graphify cluster-only (run manually for a fresh GRAPH_REPORT.md)" }
      } finally { Pop-Location }
    }
  }
} else { Warn "skipped graphify extract" }

Write-Host ""
Write-Host "Done. Commit research/graphify-out/ if it changed, so the graph stays in git too (§6 loop)." -ForegroundColor White
