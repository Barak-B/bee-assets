# healthcheck-windows.ps1 — BEE Hive end-to-end healthcheck (Barak's PC)
#
# Tests everything I cannot verify from a cloud session. Run anytime to get
# a single status report. No mutations — only reads.
#
# Usage:
#   pwsh research\phase-2\healthcheck-windows.ps1
#   pwsh research\phase-2\healthcheck-windows.ps1 -Json > status.json
#
# Sections probed (in order):
#   1. Ports — Alfred :3000 · Hermes :3100 · n8n :5678 · Neo4j :7474 · Redis :6379 · graphify-mcp :8090
#   2. Processes — Syncthing
#   3. Git — bee-assets working tree + origin sync
#   4. Graphify — installed version, graphs present, query round-trip, hook status
#   5. Secrets — DeepSeek key in env or secrets file (presence only, no value printed)
#   6. Crons — count active openclaw crons (best-effort)
#   7. BEE-app snapshot — recency of refresh-bee-snapshot.js output
#   8. Tailscale — connection to bee-prod-1 if configured
#   9. Obsidian vault — protocol_hive.md sync state

param([switch]$Json)

$ErrorActionPreference = "Continue"
$results = @()

function Result($section, $name, $status, $detail = "") {
  $script:results += [pscustomobject]@{
    section = $section
    name    = $name
    status  = $status   # OK | WARN | FAIL | SKIP
    detail  = $detail
  }
}

function Probe-Port($host, $port, $service) {
  $r = Test-NetConnection -ComputerName $host -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue 2>$null
  if ($r) { Result "ports" $service "OK" "$host`:$port reachable" }
  else    { Result "ports" $service "FAIL" "$host`:$port no response" }
}

# 1. Ports
Probe-Port "127.0.0.1" 3000 "alfred"
Probe-Port "127.0.0.1" 3100 "hermes"
Probe-Port "127.0.0.1" 5678 "n8n"
Probe-Port "127.0.0.1" 7474 "neo4j"
Probe-Port "127.0.0.1" 6379 "redis"
Probe-Port "127.0.0.1" 8090 "graphify-mcp"

# 2. Processes
$sync = Get-Process syncthing -ErrorAction SilentlyContinue
if ($sync) { Result "proc" "syncthing" "OK" "PID $($sync.Id)" }
else       { Result "proc" "syncthing" "WARN" "not running" }

# 3. Git
$repo = "E:\bee-assets"
if (Test-Path $repo) {
  Push-Location $repo
  $branch = git rev-parse --abbrev-ref HEAD 2>$null
  $dirty  = (git status --porcelain 2>$null | Measure-Object).Count
  $behind = (git rev-list --count "HEAD..origin/$branch" 2>$null)
  $ahead  = (git rev-list --count "origin/$branch..HEAD" 2>$null)
  Pop-Location
  Result "git" "bee-assets branch" "OK" $branch
  if ($dirty -eq 0) { Result "git" "working tree" "OK" "clean" }
  else              { Result "git" "working tree" "WARN" "$dirty uncommitted file(s)" }
  if ($behind -eq 0 -and $ahead -eq 0) { Result "git" "origin sync" "OK" "in sync" }
  else { Result "git" "origin sync" "WARN" "ahead=$ahead behind=$behind" }
} else {
  Result "git" "bee-assets" "FAIL" "$repo not found"
}

# 4. Graphify
$gfVer = (graphify --version 2>$null) | Select-Object -First 1
if ($gfVer) {
  Result "graphify" "installed" "OK" $gfVer
  # Graphs present?
  $graphs = @{
    "OpenClawAgent" = "E:\Desktop\OpenClawAgent\graphify-out\graph.json"
    "bee-assets"    = "E:\bee-assets\graphify-out\graph.json"
  }
  foreach ($k in $graphs.Keys) {
    $p = $graphs[$k]
    if (Test-Path $p) {
      try {
        $g = Get-Content $p -Raw | ConvertFrom-Json
        $n = $g.nodes.Count
        $e = if ($g.links) { $g.links.Count } else { $g.edges.Count }
        Result "graphify" "graph $k" "OK" "$n nodes / $e edges"
      } catch {
        Result "graphify" "graph $k" "WARN" "exists but JSON parse failed"
      }
    } else {
      Result "graphify" "graph $k" "WARN" "$p missing"
    }
  }
  # Query round-trip on OpenClawAgent graph
  if (Test-Path "E:\Desktop\OpenClawAgent\graphify-out\graph.json") {
    Push-Location "E:\Desktop\OpenClawAgent"
    $out = graphify query "router provider chain" 2>&1 | Select-String "NODE " | Select-Object -First 1
    Pop-Location
    if ($out) { Result "graphify" "query round-trip" "OK" $out.Line.Substring(0, [Math]::Min(80, $out.Line.Length)) }
    else      { Result "graphify" "query round-trip" "WARN" "no NODE in output" }
  }
  # Git hook status
  Push-Location "E:\Desktop\OpenClawAgent" 2>$null
  if (Test-Path .) {
    $hookOut = graphify hook status 2>&1 | Out-String
    if ($hookOut -match "installed|active|enabled") { Result "graphify" "git hook" "OK" ($hookOut.Trim() -split "`n")[0] }
    else { Result "graphify" "git hook" "WARN" "not installed — run: graphify hook install" }
  }
  Pop-Location
} else {
  Result "graphify" "installed" "FAIL" "graphify not on PATH"
}

# 5. Secrets (presence only — DO NOT print value)
$secretsFile = "E:\Desktop\OpenClawAgent\secrets\bee-integrations.env"
if ($env:DEEPSEEK_API_KEY -and $env:DEEPSEEK_API_KEY.StartsWith("sk-")) {
  Result "secrets" "DEEPSEEK_API_KEY (env)" "OK" "process-scope set"
} elseif (Test-Path $secretsFile) {
  $hasKey = (Select-String -Path $secretsFile -Pattern "(?i)deepseek.*[=:]\s*[`"']?sk-" -Quiet)
  if ($hasKey) { Result "secrets" "DEEPSEEK_API_KEY (file)" "OK" "found in secrets file" }
  else         { Result "secrets" "DEEPSEEK_API_KEY (file)" "WARN" "not found in $secretsFile" }
} else {
  Result "secrets" "DEEPSEEK_API_KEY" "WARN" "secrets file missing"
}

# 6. Crons (best effort — openclaw CLI varies)
try {
  $cronOut = openclaw cron list 2>&1 | Out-String
  $active = ([regex]::Matches($cronOut, "enabled|active")).Count
  $total  = ([regex]::Matches($cronOut, "^\s*\w+", "Multiline")).Count
  Result "crons" "openclaw cron list" "OK" "~$active active of ~$total"
} catch {
  Result "crons" "openclaw cron list" "SKIP" "CLI not available or different shape"
}

# 7. BEE app snapshot recency (refresh-bee-snapshot.js runs every 15 min)
$snap = "E:\Desktop\OpenClawAgent\snapshot.db"
if (-not (Test-Path $snap)) { $snap = "E:\Desktop\OpenClawAgent\bee-ops-snapshot.db" }
if (Test-Path $snap) {
  $age = (Get-Date) - (Get-Item $snap).LastWriteTime
  if ($age.TotalMinutes -lt 30) { Result "bee-app" "snapshot recency" "OK" ("{0:N1} min old" -f $age.TotalMinutes) }
  elseif ($age.TotalHours -lt 24) { Result "bee-app" "snapshot recency" "WARN" ("{0:N1} h old — cron may be stalled" -f $age.TotalHours) }
  else { Result "bee-app" "snapshot recency" "FAIL" ("{0:N1} h old — cron broken" -f $age.TotalHours) }
} else {
  Result "bee-app" "snapshot recency" "SKIP" "snapshot file not found at known paths"
}

# 8. Tailscale (if installed)
try {
  $tsOut = tailscale status 2>&1 | Out-String
  if ($tsOut -match "100\.\d+\.\d+\.\d+") { Result "net" "tailscale" "OK" "connected" }
  else { Result "net" "tailscale" "WARN" "no peers detected" }
} catch {
  Result "net" "tailscale" "SKIP" "tailscale CLI not in PATH"
}

# 9. Obsidian vault sync
$vault = "E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian"
if (Test-Path $vault) {
  $protocolInVault = Join-Path $vault "3-Projects\BEE\protocol_hive.md"
  $protocolInRepo  = "E:\bee-assets\research\protocol_hive.md"
  if ((Test-Path $protocolInVault) -and (Test-Path $protocolInRepo)) {
    $vaultHash = (Get-FileHash $protocolInVault -Algorithm MD5).Hash
    $repoHash  = (Get-FileHash $protocolInRepo  -Algorithm MD5).Hash
    if ($vaultHash -eq $repoHash) { Result "obsidian" "protocol_hive.md sync" "OK" "vault == repo" }
    else { Result "obsidian" "protocol_hive.md sync" "WARN" "diverged — re-copy from repo" }
  } else {
    Result "obsidian" "protocol_hive.md sync" "WARN" "missing in vault or repo"
  }
} else {
  Result "obsidian" "vault" "FAIL" "$vault not found"
}

# ============== OUTPUT ==============

if ($Json) {
  $results | ConvertTo-Json -Depth 4
  exit
}

$counts = @{ OK = 0; WARN = 0; FAIL = 0; SKIP = 0 }
foreach ($r in $results) { $counts[$r.status]++ }

Write-Host ""
Write-Host "=== BEE Hive Healthcheck — $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Cyan
Write-Host ""
$grouped = $results | Group-Object section
foreach ($g in $grouped) {
  Write-Host "[$($g.Name)]" -ForegroundColor Yellow
  foreach ($r in $g.Group) {
    $col = switch ($r.status) {
      "OK"   { "Green" }
      "WARN" { "Yellow" }
      "FAIL" { "Red" }
      "SKIP" { "DarkGray" }
    }
    $tag = "[$($r.status)]".PadRight(7)
    Write-Host ("  {0} {1,-32} {2}" -f $tag, $r.name, $r.detail) -ForegroundColor $col
  }
}
Write-Host ""
Write-Host ("Summary: OK={0}  WARN={1}  FAIL={2}  SKIP={3}" -f $counts.OK, $counts.WARN, $counts.FAIL, $counts.SKIP) -ForegroundColor Cyan
Write-Host ""
if ($counts.FAIL -gt 0) { exit 1 }
exit 0
