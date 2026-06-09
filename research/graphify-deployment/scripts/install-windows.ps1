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
# NOTE: claw/hermes installs are PROJECT-SCOPED — they write AGENTS.md into the
#       CURRENT directory. Running them from C:\WINDOWS\system32 (admin shell)
#       fails with PermissionError. We cd into each project first.
Write-Host "[3/5] Registering on Claude Code + OpenClaw (Alfred) + Hermes..."
graphify install                  # Claude Code (user-profile scoped, cwd-safe)

$alfredWorkspace = "E:\Desktop\OpenClawAgent\workspace"
if (Test-Path $alfredWorkspace) {
  Push-Location $alfredWorkspace
  graphify claw install           # OpenClaw — writes AGENTS.md here
  Pop-Location
} else {
  Write-Host "  SKIP claw install: $alfredWorkspace not found"
}

$hermesDir = "E:\bee-hermes"
if (Test-Path $hermesDir) {
  Push-Location $hermesDir
  graphify hermes install         # Hermes — AGENTS.md here + ~/.hermes/skills/
  Pop-Location
} else {
  Write-Host "  SKIP hermes install: $hermesDir not found"
}

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
