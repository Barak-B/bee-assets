# install-windows.ps1 — One-shot graphify deployment for BEE (Claude Code + Alfred + Hermes)
#
# What this does (end-to-end, ~3 min on a warm machine):
#   1. Installs uv + graphifyy with ALL required extras (anthropic + openai)
#   2. Registers skill on Claude Code, Alfred/OpenClaw, Hermes (path-correct)
#   3. Writes a battle-tested .graphifyignore (backups, document_cache, secrets, ...)
#   4. Extracts a code-only graph of E:\Desktop\OpenClawAgent (fast, $0, no API key)
#   5. Labels communities — tries DeepSeek (from secrets file), falls back gracefully
#   6. Installs the git post-commit hook (auto-refresh on every commit, $0)
#   7. Runs verification queries and prints the result
#
# Usage:
#   pwsh install-windows.ps1            # default: code-only graph
#   pwsh install-windows.ps1 -Full      # also extract docs/PDFs/images (~$1-3 via DeepSeek)
#   pwsh install-windows.ps1 -SkipLabel # skip community naming (faster, no API cost)
#
# Run in REGULAR PowerShell — NOT admin, NOT from C:\WINDOWS\system32.
# Rollback: graphify uninstall --purge
#
# Machine topology (ground truth — research/PATHS.md):
#   Alfred scripts (30+ alfred-*.js):  E:\Desktop\OpenClawAgent\          <- graph target
#   OpenClaw workspace (AGENTS.md):    C:\Users\Barak\.openclaw\workspace <- claw install here
#   Hermes project:                    E:\bee-hermes                      <- hermes install here
#
# NOTE: package is graphifyy (DOUBLE-Y). Other graphify* packages are typosquats.

param(
  [switch]$Full,        # include docs/PDFs/images in extraction
  [switch]$SkipLabel,   # skip community labeling
  [switch]$SkipHook     # skip git hook install
)

$ErrorActionPreference = "Stop"
Write-Host "=== Graphify install — BEE end-to-end ===" -ForegroundColor Cyan

# ============================================================
# Helpers
# ============================================================

function Find-FirstPath([string[]]$candidates, [string]$label) {
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { Write-Host "  $label -> $p"; return $p }
  }
  Write-Host "  $label -> NOT FOUND" -ForegroundColor Yellow
  return $null
}

function Get-DeepSeekKey([string]$secretsFile) {
  # In env wins
  if ($env:DEEPSEEK_API_KEY -and $env:DEEPSEEK_API_KEY -notmatch "^<.*>$" -and $env:DEEPSEEK_API_KEY.Length -gt 10) {
    return $env:DEEPSEEK_API_KEY
  }
  # Else parse the secrets file: matches KEY=value or "KEY"="value" with optional spaces/quotes
  if (Test-Path $secretsFile) {
    $match = Get-Content $secretsFile -ErrorAction SilentlyContinue |
      Select-String -Pattern '(?i)deepseek.*[=:]\s*["'']?(sk-[A-Za-z0-9_-]+)' |
      Select-Object -First 1
    if ($match -and $match.Matches[0].Groups[1].Value) {
      return $match.Matches[0].Groups[1].Value
    }
  }
  return $null
}

function Test-AnthropicKey() {
  if ($env:ANTHROPIC_API_KEY -and $env:ANTHROPIC_API_KEY -notmatch "^<.*>$" -and $env:ANTHROPIC_API_KEY.Length -gt 10) {
    return $env:ANTHROPIC_API_KEY
  }
  return $null
}

# ============================================================
# 0. Resolve real paths (auto-discovery, env overrides win)
# ============================================================

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

if (-not $alfredScripts) {
  Write-Host "ERROR: cannot find Alfred scripts dir. Set `$env:OPENCLAW_SCRIPTS and rerun." -ForegroundColor Red
  exit 1
}

# ============================================================
# 1. uv (if missing)
# ============================================================

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host "[1/7] Installing uv via winget..."
  winget install astral-sh.uv
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
  Write-Host "[1/7] uv present: $(uv --version)"
}

# ============================================================
# 2. graphify + extras (all known requirements)
# ============================================================
#
# [anthropic] — default 'claude' backend during extract
# [openai]    — 'deepseek'/'openai'/'azure' backends (DeepSeek = OpenAI-compatible)
# Without these: "the 'X' package is required for this backend" (live failures 2026-06-10/12).

Write-Host "[2/7] Installing graphifyy[office,pdf,neo4j,mcp,anthropic,openai]..."
uv tool install --force "graphifyy[office,pdf,neo4j,mcp,anthropic,openai]" | Out-Null
$gfVer = (graphify --version 2>&1) | Select-Object -First 1
Write-Host "  $gfVer"

# ============================================================
# 3. Register skill on all 3 BEE platforms
# ============================================================
#
# claw/hermes installs are PROJECT-SCOPED — Push-Location into each project first.

Write-Host "[3/7] Registering skill on Claude Code + Alfred + Hermes..."
graphify install 2>&1 | Select-String "skill installed|already registered" | ForEach-Object { Write-Host "  $_" }

if ($openclawWorkspace) {
  Push-Location $openclawWorkspace
  graphify claw install 2>&1 | Select-String "graphify section|no change" | ForEach-Object { Write-Host "  $_" }
  Pop-Location
}

if ($hermesDir) {
  Push-Location $hermesDir
  graphify hermes install 2>&1 | Select-String "graphify section|no change" | ForEach-Object { Write-Host "  $_" }
  Pop-Location
}

# Hermes skill file (cwd-independent — different code path from 'graphify hermes install')
graphify install --platform hermes 2>&1 | Select-String "skill installed|already registered" | ForEach-Object { Write-Host "  $_" }

# ============================================================
# 4. .graphifyignore (every gotcha we've hit, baked in)
# ============================================================

$ignoreFile = Join-Path $alfredScripts ".graphifyignore"
$desiredIgnore = @"
# Auto-managed by install-windows.ps1 — edit freely (script won't overwrite if you add stuff below)
node_modules/
secrets/
logs/
*.log
**/credentials/
**/state.db
**/cost.json
graphify-out/cache/

# Backup snapshots (e.g. backups/wave12-voice-action-...). Without this, every
# alfred-*.js shows up 2x in the graph (community of current + community of backup).
backups/

# document_cache contains binary PDFs + tilde-named files that confuse path
# resolution (E:\...\~\.hermes\document_cache\...). Index the originals instead.
**/document_cache/
"@

if (-not $Full) {
  $desiredIgnore += @"

# Code-only pass (default). Docs/PDFs/images need a paid LLM backend.
# To include them, re-run with '-Full' flag — costs ~$1-3 via DeepSeek.
*.md
*.html
*.pdf
*.docx
*.xlsx
*.png
*.jpg
*.jpeg
*.gif
*.txt
*.csv
"@
}

# Write if missing OR if our auto-managed header is present (safe to overwrite our own).
$shouldWrite = (-not (Test-Path $ignoreFile)) -or
               ((Get-Content $ignoreFile -TotalCount 1) -match "Auto-managed by install-windows.ps1")
if ($shouldWrite) {
  $desiredIgnore | Out-File -Encoding utf8 -NoNewline $ignoreFile
  Write-Host "[4/7] Wrote $ignoreFile ($(if ($Full) {'full'} else {'code-only'}) mode)"
} else {
  Write-Host "[4/7] $ignoreFile is user-managed — leaving as-is"
}

# ============================================================
# 5. Extract the graph
# ============================================================

$graphPath = Join-Path $alfredScripts "graphify-out\graph.json"
$extractBackend = "claude-cli"  # default: uses Claude subscription, $0

if ($Full) {
  Write-Host "[5/7] Full extract (code + docs/PDFs/images) via claude-cli..."
} else {
  Write-Host "[5/7] Code-only extract (fast, $0, no semantic LLM)..."
  $extractBackend = $null  # AST-only when no docs to process
}

# Wipe stale output (the 2390-node graph from before backups/ was ignored)
if (Test-Path "$alfredScripts\graphify-out") {
  Remove-Item -Recurse -Force "$alfredScripts\graphify-out"
}

Push-Location $alfredScripts
if ($extractBackend) {
  graphify extract . --no-viz --backend $extractBackend
} else {
  graphify extract . --no-viz
}
Pop-Location

if (-not (Test-Path $graphPath)) {
  Write-Host "ERROR: extract failed — no graph.json produced" -ForegroundColor Red
  exit 1
}

# ============================================================
# 6. Cluster + label communities (smart backend pick)
# ============================================================
#
# GRAPHIFY BUG (v0.8.38): 'cluster-only' and 'label' commands parse --backend
# ONLY with equals sign (--backend=X). Space-separated '--backend X' is silently
# ignored and falls back to anthropic. See /tmp/graphify/graphify/__main__.py:3122.
# We use '--backend=X' explicitly here.

if ($SkipLabel) {
  Write-Host "[6/7] Skipping label (--SkipLabel). Running cluster-only --no-label..."
  Push-Location $alfredScripts
  graphify cluster-only . --no-label
  Pop-Location
} else {
  # Try keys in priority order: DeepSeek (cheap, Barak has $96 balance) > Anthropic API > skip
  $secretsFile = Join-Path $alfredScripts "secrets\bee-integrations.env"
  $deepseekKey = Get-DeepSeekKey $secretsFile
  $anthropicKey = Test-AnthropicKey

  $labelBackend = $null
  if ($deepseekKey) {
    $env:DEEPSEEK_API_KEY = $deepseekKey
    $labelBackend = "deepseek"
    Write-Host "[6/7] Labeling with DeepSeek (key from $(if ($env:DEEPSEEK_API_KEY -eq $deepseekKey -and -not $deepseekKey) {'env'} else {'secrets/bee-integrations.env'}))..."
  } elseif ($anthropicKey) {
    $labelBackend = "anthropic"
    Write-Host "[6/7] Labeling with Anthropic API (DEEPSEEK_API_KEY not found)..."
  } else {
    Write-Host "[6/7] No DeepSeek/Anthropic key found — skipping labels (Community N placeholders)" -ForegroundColor Yellow
    Push-Location $alfredScripts
    graphify cluster-only . --no-label
    Pop-Location
  }

  if ($labelBackend) {
    Push-Location $alfredScripts
    # CRITICAL: --backend=X with equals (graphify 0.8.38 bug — see comment above)
    graphify label . --backend=$labelBackend 2>&1 | ForEach-Object {
      if ($_ -match "credit balance|invalid_request") {
        Write-Host "  $_" -ForegroundColor Yellow
      } else {
        Write-Host "  $_"
      }
    }
    Pop-Location
  }
}

# ============================================================
# 7. Git hook + verification
# ============================================================

if (-not $SkipHook -and (Test-Path "$alfredScripts\.git")) {
  Push-Location $alfredScripts
  Write-Host "[7/7] Installing git post-commit hook (auto-refresh graph, $0)..."
  graphify hook install 2>&1 | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }
  Pop-Location
} else {
  Write-Host "[7/7] Skipping git hook"
}

Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
$nodes = (Get-Content $graphPath | ConvertFrom-Json).nodes.Count
$edges = (Get-Content $graphPath | ConvertFrom-Json).links.Count
Write-Host "  Graph: $nodes nodes / $edges edges" -ForegroundColor Green
Write-Host "  Report: $alfredScripts\graphify-out\GRAPH_REPORT.md"
Write-Host ""
Write-Host "Try queries:" -ForegroundColor Green
Write-Host "  cd $alfredScripts"
Write-Host "  graphify query `"how does the router pick a provider?`""
Write-Host "  graphify query `"what writes to the work ledger and what reads from it?`""
Write-Host "  graphify path `"alfred-router.js`" `"alfred-handle.js`""
Write-Host "  graphify explain `"PROVIDER_PRIORITY`""
Write-Host ""
Write-Host "Done." -ForegroundColor Green
