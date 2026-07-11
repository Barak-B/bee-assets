<#
.SYNOPSIS
  Fixed Hermes wire: ensure bee-canon is in memory.external_dirs; bump char limit; port 3100.

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

Write-Host "`nBEE Hive Cortex — complete-hermes-wire (v2)`n" -ForegroundColor White

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
$canonYaml = ($HermesCanonDir -replace '\\', '/')  # YAML-friendly; Hermes accepts either
$canonWin = $HermesCanonDir
$changed = $false

# Ensure canon dir exists
if (-not (Test-Path $HermesCanonDir)) {
  if (-not $DryRun) { New-Item -ItemType Directory -Force $HermesCanonDir | Out-Null }
  Ok "ensured $HermesCanonDir"
}

# memory_char_limit
if ($text -match 'memory_char_limit:\s*(\d+)') {
  $cur = [int]$Matches[1]
  if ($cur -lt 4096) {
    $text = $text -replace 'memory_char_limit:\s*\d+', 'memory_char_limit: 4096'
    $changed = $true
    Ok "memory_char_limit $cur → 4096"
  } else { Ok "memory_char_limit already $cur" }
}

# bridge_port
if ($text -match 'bridge_port:\s*3000') {
  $text = $text -replace 'bridge_port:\s*3000', 'bridge_port: 3100'
  $changed = $true
  Ok "bridge_port 3000 → 3100"
} elseif ($text -match 'bridge_port:\s*3100') {
  Ok "bridge_port already 3100"
} else {
  Warn "bridge_port not found — check messaging section"
}

# external_dirs — several shapes
$already = ($text -match [regex]::Escape($HermesCanonDir)) -or ($text -match 'bee-canon')
if ($already) {
  Ok "external_dirs already references bee-canon"
} elseif ($text -match 'external_dirs:\s*\[\s*\]') {
  $text = $text -replace 'external_dirs:\s*\[\s*\]', "external_dirs:`r`n    - `"$canonWin`""
  $changed = $true
  Ok "external_dirs [] → bee-canon"
} elseif ($text -match '(?m)^(\s*)external_dirs:\s*$') {
  # block form — insert as first list item under the key
  $text = [regex]::Replace($text, '(?m)^(\s*)external_dirs:\s*$', {
      param($m)
      $pad = $m.Groups[1].Value
      "$pad" + "external_dirs:`r`n$pad  - `"$canonWin`""
    }, 1)
  $changed = $true
  Ok "prepended bee-canon under external_dirs block"
} elseif ($text -match '(?m)^(\s*)external_dirs:\s*\r?\n(\s*)-') {
  # already a list — prepend our entry after the key
  $text = [regex]::Replace($text, '(?m)^(\s*)external_dirs:\s*\r?\n', {
      param($m)
      $pad = $m.Groups[1].Value
      "$pad" + "external_dirs:`r`n$pad  - `"$canonWin`"`r`n"
    }, 1)
  $changed = $true
  Ok "prepended bee-canon to existing external_dirs list"
} elseif ($text -match '(?m)^(\s*)memory:\s*$') {
  $text = [regex]::Replace($text, '(?m)^(\s*)memory:\s*$', {
      param($m)
      $pad = $m.Groups[1].Value
      "$pad" + "memory:`r`n$pad  external_dirs:`r`n$pad    - `"$canonWin`""
    }, 1)
  $changed = $true
  Ok "added external_dirs under memory:"
} else {
  Warn "could not locate external_dirs — appending memory.external_dirs at EOF"
  $text = $text.TrimEnd() + "`r`n`r`nmemory:`r`n  external_dirs:`r`n    - `"$canonWin`"`r`n"
  $changed = $true
}

if ($DryRun) {
  Info "[DryRun] changed=$changed — no write"
  exit 0
}

if (-not $changed) {
  Ok "no file changes needed"
  exit 0
}

$backup = "$ConfigPath.bak-bee-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Force $ConfigPath $backup
Ok "backup → $backup"
Set-Content -Path $ConfigPath -Value $text -Encoding UTF8 -NoNewline
Ok "wrote $ConfigPath"

# Proof
Select-String -Path $ConfigPath -Pattern 'bee-canon|bridge_port|memory_char_limit' | ForEach-Object {
  Info $_.Line.Trim()
}

Write-Host "`nRestart Hermes gateway, then ask: what bank / VAT cadence?`n" -ForegroundColor Yellow
