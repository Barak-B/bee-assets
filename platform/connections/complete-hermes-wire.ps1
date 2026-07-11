<#
.SYNOPSIS
  Completes Hermes half of Brain Bus wire (external_dirs + bridge_port 3100).
  Does NOT edit Alfred AGENTS.md (constitutional — Barak only).

.EXAMPLE
  pwsh -File platform\connections\complete-hermes-wire.ps1
  pwsh -File platform\connections\complete-hermes-wire.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$HermesCanonDir = $(if ($env:BEE_HERMES_MEMORY_DIR) { $env:BEE_HERMES_MEMORY_DIR } else { "C:\Users\Barak\.hermes\bee-canon" }),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE Hive Cortex — complete-hermes-wire`n" -ForegroundColor White

$candidates = @(
  "C:\Users\Barak\AppData\Local\hermes\config.yaml",
  "C:\Users\Barak\.hermes\config.yaml"
)
# Also search under Local\hermes for nested configs
Get-ChildItem -Path "C:\Users\Barak\AppData\Local\hermes" -Filter "config.yaml" -Recurse -ErrorAction SilentlyContinue |
  ForEach-Object { $candidates += $_.FullName }
Get-ChildItem -Path "C:\Users\Barak\.hermes" -Filter "config.yaml" -Recurse -ErrorAction SilentlyContinue |
  ForEach-Object { $candidates += $_.FullName }

$candidates = $candidates | Select-Object -Unique
$configPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $configPath) {
  Warn "No config.yaml found. Searched:"
  $candidates | ForEach-Object { Info $_ }
  throw "Locate Hermes config.yaml manually and re-run with path fix"
}

Info "config: $configPath"
$text = Get-Content -Raw -Encoding UTF8 $configPath
$backup = "$configPath.bak-bee-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# external_dirs
$canonEscaped = ($HermesCanonDir -replace '\\', '\\')
if ($text -match 'external_dirs:\s*\[\s*\]') {
  $text2 = $text -replace 'external_dirs:\s*\[\s*\]', ("external_dirs:`r`n    - `"$canonEscaped`"")
  Ok "will set external_dirs → $HermesCanonDir"
} elseif ($text -match [regex]::Escape($HermesCanonDir)) {
  $text2 = $text
  Ok "external_dirs already references canon dir"
} elseif ($text -match 'external_dirs:') {
  Warn "external_dirs present but not empty-list form — inspect manually"
  $text2 = $text
} else {
  Warn "no external_dirs key found — append memory block at end may be needed; inspect manually"
  $text2 = $text
}

# memory_char_limit bump
if ($text2 -match 'memory_char_limit:\s*2200') {
  $text2 = $text2 -replace 'memory_char_limit:\s*2200', 'memory_char_limit: 4096'
  Ok "memory_char_limit 2200 → 4096"
}

# bridge_port
if ($text2 -match 'bridge_port:\s*3000') {
  $text2 = $text2 -replace 'bridge_port:\s*3000', 'bridge_port: 3100'
  Ok "bridge_port 3000 → 3100"
} elseif ($text2 -match 'bridge_port:\s*3100') {
  Ok "bridge_port already 3100"
} else {
  Warn "bridge_port not found as 3000/3100 — check messaging/whatsapp section manually"
}

if ($DryRun) {
  Info "[DryRun] no write. Backup would be: $backup"
  exit 0
}

Copy-Item -Force $configPath $backup
Ok "backup → $backup"
Set-Content -Path $configPath -Value $text2 -Encoding UTF8 -NoNewline
Ok "wrote $configPath"

Write-Host "`nRestart Hermes gateway so config reloads." -ForegroundColor Yellow
Write-Host "Then ask Hermes: what bank does BEE use and VAT cadence?`n" -ForegroundColor Yellow
