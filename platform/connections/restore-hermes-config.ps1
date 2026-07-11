<#
.SYNOPSIS
  Restore Hermes config.yaml from last known-good bak-bee backup, then insert
  bee-canon under memory.external_dirs with CORRECT indentation (line-based, no Regex.Replace evaluator).

.EXAMPLE
  pwsh -File platform\connections\restore-hermes-config.ps1
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = "C:\Users\Barak\AppData\Local\hermes\config.yaml",
  [string]$HermesCanonDir = $(if ($env:BEE_HERMES_MEMORY_DIR) { $env:BEE_HERMES_MEMORY_DIR } else { "C:\Users\Barak\.hermes\bee-canon" }),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE Hive Cortex — restore-hermes-config`n" -ForegroundColor White

$dir = Split-Path $ConfigPath -Parent

# Prefer earliest bak-bee (pre-corruption). Skip *fix* and *corrupt* names.
$bak = Get-ChildItem -Path $dir -Filter "config.yaml.bak-bee-*" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch 'fix|corrupt' } |
  Sort-Object LastWriteTime |
  Select-Object -First 1

if (-not $bak) {
  # fall back: any bak-bee
  $bak = Get-ChildItem -Path $dir -Filter "config.yaml.bak-bee-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime | Select-Object -First 1
}
if (-not $bak) { throw "No config.yaml.bak-bee-* found in $dir — cannot restore safely" }

Info "restoring from: $($bak.FullName) ($($bak.LastWriteTime))"

# Save current wreck
$wreck = "$ConfigPath.wreck-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
if (Test-Path $ConfigPath) {
  if (-not $DryRun) { Copy-Item -Force $ConfigPath $wreck; Ok "current wreck saved → $wreck" }
}

$lines = Get-Content -Encoding UTF8 $bak.FullName

# Remove any prior bee-canon lines
$lines = $lines | Where-Object { $_ -notmatch 'bee-canon' }

# Find external_dirs line
$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^(\s*)external_dirs:\s*(.*)$') {
    $idx = $i
    $pad = $Matches[1]
    $rest = $Matches[2]
    break
  }
}

if ($idx -lt 0) {
  # append under a new memory block at EOF
  Warn "no external_dirs key in backup — appending"
  $lines += ""
  $lines += "# BEE Hive Cortex — canon"
  $lines += "memory:"
  $lines += "  external_dirs:"
  $lines += "    - '$HermesCanonDir'"
} else {
  $itemPad = $pad + "  "
  $item = "$itemPad- '$HermesCanonDir'"

  if ($rest -match '\[\s*\]') {
    # external_dirs: []  → expand to block
    $lines[$idx] = "${pad}external_dirs:"
    $newLines = @()
    $newLines += $lines[0..$idx]
    $newLines += $item
    if ($idx + 1 -le $lines.Count - 1) { $newLines += $lines[($idx+1)..($lines.Count-1)] }
    $lines = $newLines
    Ok "expanded external_dirs: [] → block + bee-canon"
  } else {
    # Insert item immediately after external_dirs key
    $newLines = @()
    $newLines += $lines[0..$idx]
    $newLines += $item
    if ($idx + 1 -le $lines.Count - 1) { $newLines += $lines[($idx+1)..($lines.Count-1)] }
    $lines = $newLines
    Ok "inserted bee-canon under external_dirs (indent='$itemPad')"
  }
}

# Ensure memory_char_limit >= 4096
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^(\s*)memory_char_limit:\s*(\d+)') {
    $n = [int]$Matches[2]
    if ($n -lt 4096) {
      $lines[$i] = $Matches[1] + "memory_char_limit: 4096"
      Ok "memory_char_limit $n → 4096"
    }
  }
}

# Ensure bridge_port 3100 if present as 3000
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^(\s*)bridge_port:\s*3000\s*$') {
    $lines[$i] = $Matches[1] + "bridge_port: 3100"
    Ok "bridge_port 3000 → 3100"
  }
}

# Show the region we care about
Info "preview around external_dirs:"
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match 'external_dirs|bee-canon') {
    $raw = $lines[$i]
    $vis = $raw -replace ' ', '·'
    Info ("L{0}: [{1}]" -f ($i+1), $vis)
  }
}

if ($DryRun) { Info "[DryRun] no write"; exit 0 }

# Write UTF-8 no BOM preferred for YAML
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($ConfigPath, $lines, $utf8NoBom)
Ok "wrote $ConfigPath"

Write-Host "`nValidate (must show NO parse error):`n  hermes config`n" -ForegroundColor Yellow
Write-Host "If still broken, restore pure backup manually:`n  Copy-Item -Force '$($bak.FullName)' '$ConfigPath'`n" -ForegroundColor Yellow
