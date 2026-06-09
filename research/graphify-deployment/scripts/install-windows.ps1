# install-windows.ps1 — Stage 1: graphify on Barak's PC (Claude Code + Alfred + Hermes)
#
# Run in PowerShell (regular user, no admin needed if uv is installed).
# Time: ~15 min. Rollback: graphify uninstall --purge
#
# NOTE: package is graphifyy (DOUBLE-Y). Other graphify* packages on PyPI are
#       NOT affiliated — typosquat risk. Do not "fix" the spelling.

$ErrorActionPreference = "Stop"

Write-Host "=== Graphify install — BEE Stage 1 ===" -ForegroundColor Cyan

# --- 1. uv (if missing) ---
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host "[1/5] Installing uv..."
  winget install astral-sh.uv
  # refresh PATH for this session
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
  Write-Host "[1/5] uv present: $(uv --version)"
}

# --- 2. graphify + extras we actually use ---
Write-Host "[2/5] Installing graphifyy[office,pdf,neo4j,mcp]..."
uv tool install --force "graphifyy[office,pdf,neo4j,mcp]"
graphify --version

# --- 3. Register skill on all 3 BEE platforms ---
Write-Host "[3/5] Registering on Claude Code + OpenClaw (Alfred) + Hermes..."
graphify install                  # Claude Code (auto-detects Windows)
graphify claw install             # OpenClaw — writes AGENTS.md guidance
graphify hermes install           # Hermes — AGENTS.md + ~/.hermes/skills/

# --- 4. First graph: Alfred's scripts (code-only = local, free, ~1 min) ---
$alfredScripts = "E:\Desktop\OpenClawAgent\workspace\scripts"
if (Test-Path $alfredScripts) {
  Write-Host "[4/5] Indexing Alfred workspace scripts (local AST, no API)..."
  graphify extract $alfredScripts --no-viz
  Write-Host "  -> graph at $alfredScripts\graphify-out\graph.json"
} else {
  Write-Host "[4/5] SKIP: $alfredScripts not found — adjust path and run:"
  Write-Host "       graphify extract <path-to-alfred-scripts> --no-viz"
}

# --- 5. Verify ---
Write-Host "[5/5] Verification:"
graphify --version
Write-Host ""
Write-Host "Done. Next:" -ForegroundColor Green
Write-Host "  * In Claude Code:  /graphify .          (any project)"
Write-Host "  * Query:           graphify query `"how does the router pick a provider?`" --graph $alfredScripts\graphify-out\graph.json"
Write-Host "  * Stage 2 (BEE app): run scripts/index-bee-app.sh on the machine with BEE app source"
