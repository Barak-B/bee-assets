<#
.SYNOPSIS
  Hermes wire v3: bee-canon in external_dirs with YAML-safe SINGLE-QUOTED Windows paths.
  (Double-quoted "C:\Users\..." breaks YAML — \U is a unicode escape.)

.EXAMPLE
  pwsh -File platform\connections\complete-hermes-wire.ps1
#>
[CmdletBinding()]
param(
  [string]$HermesCanonDir = $(if ($env:BEE_HERMES_MEMORY_DIR) { $env:BEE_HERMES_MEMORY_DIR } else { "C:\Users\Barak\.hermes\bee-canon" }),
  [string]$ConfigPath = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE Hive Cortex — complete-hermes-wire (v3 — YAML-safe paths)`n" -ForegroundColor White

# If config already broken, route through fix script first
$fix = Join-Path $PSScriptRoot "fix-hermes-yaml.ps1"
$defaultCfg = "C:\Users\Barak\AppData\Local\hermes\config.yaml"
if ((Test-Path $defaultCfg) -and (Test-Path $fix)) {
  $probe = Get-Content -Raw -Encoding UTF8 $defaultCfg
  if ($probe -match 'external_dirs:[\s\S]{0,300}"C:\\Users') {
    Warn "detected double-quoted C:\Users under external_dirs — running fix-hermes-yaml first"
    if (-not $DryRun) { & $fix }
  }
}

if (-not $ConfigPath) {
  $candidates = @(
    "C:\Users\Barak\AppData\Local\hermes\config.yaml",
    "C:\Users\Barak\.hermes\config.yaml"
  )
  Get-ChildItem -Path "C:\Users\Barak\AppData\Local\hermes","C:\Users\Barak\.hermes" -Filter "config.yaml" -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { $candidates += $_.FullName }
  $ConfigPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ConfigPath) { throw "Hermes config.yaml not found" }
Info "config: $ConfigPath"

$text = Get-Content -Raw -Encoding UTF8 $ConfigPath
$entry = "    - '$HermesCanonDir'"   # SINGLE quotes — required
$changed = $false

if (-not (Test-Path $HermesCanonDir)) {
  if (-not $DryRun) { New-Item -ItemType Directory -Force $HermesCanonDir | Out-Null }
  Ok "ensured $HermesCanonDir"
}

if ($text -match 'memory_char_limit:\s*(\d+)') {
  $cur = [int]$Matches[1]
  if ($cur -lt 4096) {
    $text = $text -replace 'memory_char_limit:\s*\d+', 'memory_char_limit: 4096'
    $changed = $true
    Ok "memory_char_limit $cur → 4096"
  } else { Ok "memory_char_limit already $cur" }
}

if ($text -match 'bridge_port:\s*3000') {
  $text = $text -replace 'bridge_port:\s*3000', 'bridge_port: 3100'
  $changed = $true
  Ok "bridge_port 3000 → 3100"
} elseif ($text -match 'bridge_port:\s*3100') {
  Ok "bridge_port already 3100"
} else {
  Warn "bridge_port not found — check messaging section"
}

# Safe presence check: single-quoted entry
$safePresent = $text -match [regex]::Escape("'$HermesCanonDir'")
$unsafePresent = $text -match 'bee-canon' -and $text -match '"C:\\Users'

if ($unsafePresent) {
  Warn "unsafe double-quoted bee-canon still present — use fix-hermes-yaml.ps1"
}
if ($safePresent) {
  Ok "external_dirs already has safe single-quoted bee-canon"
} elseif ($text -match 'external_dirs:\s*\[\s*\]') {
  $text = $text -replace 'external_dirs:\s*\[\s*\]', "external_dirs:`r`n$entry"
  $changed = $true
  Ok "external_dirs [] → safe bee-canon"
} elseif ($text -match '(?m)^(\s*)external_dirs:\s*$') {
  $text = [regex]::Replace($text, '(?m)^(\s*)external_dirs:\s*$', {
      param($m)
      $pad = $m.Groups[1].Value
      "${pad}external_dirs:`r`n${pad}  - '$HermesCanonDir'"
    }, 1)
  $changed = $true
  Ok "wrote safe bee-canon under empty external_dirs key"
} elseif ($text -match '(?m)^(\s*)external_dirs:\s*\r?\n') {
  $text = [regex]::Replace($text, '(?m)^(\s*)external_dirs:\s*\r?\n', {
      param($m)
      $pad = $m.Groups[1].Value
      "${pad}external_dirs:`r`n${pad}  - '$HermesCanonDir'`r`n"
    }, 1)
  $changed = $true
  Ok "prepended safe bee-canon to external_dirs list"
} else {
  $text = $text.TrimEnd() + "`r`n`r`n# BEE Hive Cortex`r`nmemory:`r`n  external_dirs:`r`n    - '$HermesCanonDir'`r`n"
  $changed = $true
  Warn "appended memory.external_dirs at EOF"
}

if ($DryRun) { Info "[DryRun] changed=$changed"; exit 0 }
if (-not $changed) { Ok "no file changes needed"; exit 0 }

$backup = "$ConfigPath.bak-bee-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Force $ConfigPath $backup
Ok "backup → $backup"
Set-Content -Path $ConfigPath -Value $text -Encoding UTF8 -NoNewline
Ok "wrote $ConfigPath"

Select-String -Path $ConfigPath -Pattern 'bee-canon|bridge_port|memory_char_limit' | ForEach-Object {
  Info $_.Line.Trim()
}

Write-Host "`nNext: fix YAML if needed, then in a NORMAL PowerShell (not hermes chat):`n  hermes gateway run`n" -ForegroundColor Yellow
