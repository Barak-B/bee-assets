# install-windows.ps1 — Stage 1: graphify on Barak's PC (Claude Code + Alfred + Hermes)
#
# Run in REGULAR PowerShell (not admin, not from system32). Time: ~15 min.
# Rollback: graphify uninstall --purge
#
# Machine topology (ground truth — research/PATHS.md):
#   Alfred scripts (30+ alfred-*.js):  E:\Desktop\OpenClawAgent\          <- graph target
#   OpenClaw workspace (AGENTS.md):    C:\Users\Barak\.openclaw\workspace <- claw install here
#   Hermes project:                    E:\bee-hermes                      <- hermes install here
#
# NOTE: package is graphifyy (DOUBLE-Y). Other graphify* packages on PyPI are
#       NOT affiliated — typosquat risk. Do not "fix" the spelling.

$ErrorActionPreference = "Stop"

Write-Host "=== Graphify install — BEE Stage 1 ===" -ForegroundColor Cyan

# --- 0. Resolve real paths (auto-discovery, env overrides win) ---
function Find-FirstPath([string[]]$candidates, [string]$label) {
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { Write-Host "  $label -> $p"; return $p }
  }
  Write-Host "  $label -> NOT FOUND (tried: $($candidates -join ', '))" -ForegroundColor Yellow
  return $null
}

$alfredScripts = Find-FirstPath @(
  $env:OPENCLAW_SCRIPTS,
  "E:\Desktop\OpenClawAgent",
  "$env:USERPROFILE\Desktop\OpenClawAgent"
) "Alfred scripts"

$openclawWorkspace = Find-FirstPath @(
  "$env:USERPROFILE\.openclaw\workspace"
) "OpenClaw workspace"

$hermesDir = Find-FirstPath @(
  "E:\bee-hermes"
) "Hermes project"

# --- 1. uv (if missing) ---
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host "[1/5] Installing uv..."
  winget install astral-sh.uv
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
  Write-Host "[1/5] uv present: $(uv --version)"
}

# --- 2. graphify + extras we actually use ---
Write-Host "[2/5] Installing graphifyy[office,pdf,neo4j,mcp]..."
uv tool install --force "graphifyy[office,pdf,neo4j,mcp]"
graphify --version

# --- 3. Register skill on all 3 BEE platforms ---
# claw/hermes installs are PROJECT-SCOPED — they write AGENTS.md into the
# CURRENT directory. Running from C:\WINDOWS\system32 fails with PermissionError.
Write-Host "[3/5] Registering on Claude Code + OpenClaw (Alfred) + Hermes..."
graphify install                  # Claude Code (user-profile scoped, cwd-safe)

if ($openclawWorkspace) {
  Push-Location $openclawWorkspace
  graphify claw install           # OpenClaw reads AGENTS.md from its workspace
  Pop-Location
}

if ($hermesDir) {
  Push-Location $hermesDir
  graphify hermes install         # AGENTS.md section in E:\bee-hermes
  Pop-Location
}
# Verified in graphify 0.8.36 source: per-platform 'hermes install' writes ONLY
# AGENTS.md. The skill file (~/.hermes/skills/graphify/SKILL.md) comes from the
# global install path (cwd-independent):
graphify install --platform hermes

# --- 4. First graph: Alfred's scripts at repo ROOT (local AST, free, ~1 min) ---
if ($alfredScripts) {
  Write-Host "[4/5] Indexing Alfred scripts (local AST, no API)..."
  graphify extract $alfredScripts --no-viz
  Write-Host "  -> graph at $alfredScripts\graphify-out\graph.json"
} else {
  Write-Host "[4/5] SKIP indexing — set OPENCLAW_SCRIPTS env var to the alfred-*.js dir and rerun"
}

# --- 5. Verify ---
Write-Host "[5/5] Verification:"
graphify --version
if ($alfredScripts -and (Test-Path "$alfredScripts\graphify-out\graph.json")) {
  Write-Host "  graph.json OK" -ForegroundColor Green
  Write-Host ""
  Write-Host "Try it:" -ForegroundColor Green
  Write-Host "  graphify query `"how does the router pick a provider?`" --graph `"$alfredScripts\graphify-out\graph.json`""
}
Write-Host ""
Write-Host "Next: Stage 2 (BEE app) — scripts/index-bee-app.sh on the machine with BEE app source"
