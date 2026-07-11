<#
.SYNOPSIS
  Fix Hermes config.yaml broken by Windows path in double quotes (\U unicode escape).
  Replaces bee-canon path with YAML-safe single-quoted form.

.EXAMPLE
  pwsh -File platform\connections\fix-hermes-yaml.ps1
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

Write-Host "`nBEE Hive Cortex — fix-hermes-yaml`n" -ForegroundColor White

if (-not (Test-Path $ConfigPath)) { throw "Missing $ConfigPath" }

# Prefer restoring a backup that still parsed, then re-apply safe path
$dir = Split-Path $ConfigPath -Parent
$baks = Get-ChildItem -Path $dir -Filter "config.yaml.bak-bee-*" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending

$text = Get-Content -Raw -Encoding UTF8 $ConfigPath
Info "current file length: $($text.Length)"

# Safe YAML form: single quotes (no escape interpretation) OR forward slashes in doubles
$safeLine = "    - '$HermesCanonDir'"

# Remove any existing bee-canon list entries (broken or not)
$cleaned = [regex]::Replace($text, "(?m)^\s*-\s*[""'].*bee-canon[""']\s*\r?\n?", "")
$cleaned = [regex]::Replace($cleaned, '(?m)^\s*-\s*""?C:\\Users\\Barak\\.hermes\\bee-canon""?\s*\r?\n?', "")

# Also remove broken double-quoted Windows paths under external_dirs that contain \U
$cleaned = [regex]::Replace($cleaned, '(?m)^\s*-\s*"C:\\Users[^"]*"\s*\r?\n?', {
  param($m)
  if ($m.Value -match 'bee-canon') { '' } else { $m.Value }
})

if ($cleaned -match '(?m)^(\s*)external_dirs:\s*$') {
  $newText = [regex]::Replace($cleaned, '(?m)^(\s*)external_dirs:\s*$', {
      param($m)
      $pad = $m.Groups[1].Value
      "${pad}external_dirs:`r`n${pad}  - '$HermesCanonDir'"
    }, 1)
  Ok "rewrote external_dirs block with single-quoted path"
} elseif ($cleaned -match '(?m)^(\s*)external_dirs:\s*\r?\n') {
  $newText = [regex]::Replace($cleaned, '(?m)^(\s*)external_dirs:\s*\r?\n', {
      param($m)
      $pad = $m.Groups[1].Value
      "${pad}external_dirs:`r`n${pad}  - '$HermesCanonDir'`r`n"
    }, 1)
  Ok "prepended safe bee-canon under external_dirs"
} else {
  # Try restore oldest bak from BEFORE our wire (first bak), then patch
  if ($baks -and $baks.Count -ge 1) {
    # Use the earliest bak-bee as pre-wire if possible
    $pre = $baks | Sort-Object LastWriteTime | Select-Object -First 1
    Warn "falling back to restore $($pre.Name) then safe patch"
    $cleaned = Get-Content -Raw -Encoding UTF8 $pre.FullName
  }
  if ($cleaned -match 'external_dirs:\s*\[\s*\]') {
    $newText = $cleaned -replace 'external_dirs:\s*\[\s*\]', "external_dirs:`r`n    - '$HermesCanonDir'"
    Ok "from [] to safe list"
  } else {
    $newText = $cleaned.TrimEnd() + "`r`n`r`n# BEE Hive Cortex canon`r`nmemory:`r`n  external_dirs:`r`n    - '$HermesCanonDir'`r`n"
    Warn "appended memory.external_dirs at EOF — review file"
  }
}

# Ensure no remaining double-quoted C:\Users under external_dirs near bee-canon
if ($newText -match 'external_dirs:[\s\S]{0,400}"C:\\Users') {
  Warn "still see double-quoted C:\Users near external_dirs — forcing replace"
  $newText = [regex]::Replace($newText, '"C:\\Users\\Barak\\.hermes\\bee-canon"', "'$HermesCanonDir'")
  $newText = [regex]::Replace($newText, '"C:\\\\Users\\\\Barak\\\\.hermes\\\\bee-canon"', "'$HermesCanonDir'")
}

if ($DryRun) {
  Info "[DryRun] preview external_dirs region:"
  if ($newText -match '(?ms)external_dirs:.{0,200}') { Info $Matches[0] }
  exit 0
}

$backup = "$ConfigPath.bak-bee-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Force $ConfigPath $backup
Ok "backup → $backup"
Set-Content -Path $ConfigPath -Value $newText -Encoding UTF8 -NoNewline
Ok "wrote $ConfigPath"

# Show lines around external_dirs / bee-canon
Select-String -Path $ConfigPath -Pattern 'external_dirs|bee-canon|bridge_port|memory_char' | ForEach-Object {
  Info ("L{0}: {1}" -f $_.LineNumber, $_.Line.Trim())
}

Write-Host "`nTest parse:" -ForegroundColor Yellow
Write-Host "  hermes config  (should NOT print YAML parse error)`n" -ForegroundColor Yellow
