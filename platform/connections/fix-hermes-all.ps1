<#
.SYNOPSIS
  ONE-SHOT: abort stuck merge, pull, restore Hermes YAML from bak-bee,
  insert bee-canon safely, validate parse, report PASS/FAIL.

  Cloud cortex cannot reach E:\ or AppData — you run this once locally.

.EXAMPLE
  pwsh -File platform\connections\fix-hermes-all.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$ConfigPath = "C:\Users\Barak\AppData\Local\hermes\config.yaml",
  [string]$HermesCanonDir = $(if ($env:BEE_HERMES_MEMORY_DIR) { $env:BEE_HERMES_MEMORY_DIR } else { "C:\Users\Barak\.hermes\bee-canon" })
)

$ErrorActionPreference = "Stop"
$fail = @()
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Bad($m){ Write-Host "  FAIL  $m" -ForegroundColor Red; $script:fail += $m }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`n========== BEE fix-hermes-all (one-shot) ==========`n" -ForegroundColor White

# --- 0) locate repo ---
if (-not $RepoRoot) {
  if (Test-Path "E:\bee-assets\platform\connections") { $RepoRoot = "E:\bee-assets" }
  elseif ($PSScriptRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
  else { $RepoRoot = (Get-Location).Path }
}
Info "repo: $RepoRoot"
Set-Location $RepoRoot

# --- 1) git: abort merge + pull ---
Write-Host "`n[1/5] git`n" -ForegroundColor White
if (Test-Path ".git\MERGE_HEAD") {
  Warn "unfinished merge — aborting"
  git merge --abort
  if ($LASTEXITCODE -ne 0) { Bad "git merge --abort failed" } else { Ok "merge aborted" }
} else { Ok "no MERGE_HEAD" }

git fetch origin 2>&1 | Out-Null
git checkout cursor/hive-cortex-platform-634e 2>&1 | Out-Host
git pull origin cursor/hive-cortex-platform-634e 2>&1 | Out-Host
Ok "on branch $(git branch --show-current)"

# --- 2) ensure canon file on disk ---
Write-Host "`n[2/5] canon file`n" -ForegroundColor White
if (-not (Test-Path $HermesCanonDir)) { New-Item -ItemType Directory -Force $HermesCanonDir | Out-Null }
$canonSrc = @(
  (Join-Path $RepoRoot "platform\canon\BEE_CANON.md"),
  (Join-Path $RepoRoot "platform\canon\AGENT_CANON.md")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($canonSrc) {
  Copy-Item -Force $canonSrc (Join-Path $HermesCanonDir "BEE_CANON.md")
  Ok "BEE_CANON.md → $HermesCanonDir"
} else { Bad "no BEE_CANON.md in repo" }

# --- 3) restore YAML from earliest good bak + safe insert ---
Write-Host "`n[3/5] restore config.yaml`n" -ForegroundColor White
$configDir = Split-Path $ConfigPath -Parent
$bak = Get-ChildItem -Path $configDir -Filter "config.yaml.bak-bee-*" -EA SilentlyContinue |
  Where-Object { $_.Name -notmatch 'fix|corrupt|wreck' } |
  Sort-Object LastWriteTime |
  Select-Object -First 1

if (-not $bak) {
  Bad "no bak-bee backup found in $configDir"
} else {
  Info "backup: $($bak.Name) @ $($bak.LastWriteTime)"
  $wreck = "$ConfigPath.wreck-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  if (Test-Path $ConfigPath) { Copy-Item -Force $ConfigPath $wreck; Ok "wreck → $wreck" }

  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($ln in (Get-Content -Encoding UTF8 $bak.FullName)) {
    if ($ln -notmatch 'bee-canon') { $lines.Add($ln) }
  }

  $idx = -1
  $pad = ""
  $rest = ""
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^(\s*)external_dirs:\s*(.*)$') {
      $idx = $i; $pad = $Matches[1]; $rest = $Matches[2]; break
    }
  }

  $item = ($pad + "  ") + "- '" + $HermesCanonDir + "'"

  if ($idx -lt 0) {
    $lines.Add("")
    $lines.Add("# BEE Hive Cortex")
    $lines.Add("memory:")
    $lines.Add("  external_dirs:")
    $lines.Add("    - '" + $HermesCanonDir + "'")
    Warn "appended new memory.external_dirs"
  } else {
    if ($rest -match '\[\s*\]') { $lines[$idx] = $pad + "external_dirs:" }
    $lines.Insert($idx + 1, $item)
    Ok "inserted: $item"
  }

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^(\s*)memory_char_limit:\s*(\d+)' -and [int]$Matches[2] -lt 4096) {
      $lines[$i] = $Matches[1] + "memory_char_limit: 4096"
      Ok "memory_char_limit → 4096"
    }
    if ($lines[$i] -match '^(\s*)bridge_port:\s*3000\s*$') {
      $lines[$i] = $Matches[1] + "bridge_port: 3100"
      Ok "bridge_port → 3100"
    }
  }

  # show indent visually
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'external_dirs|bee-canon') {
      $vis = ($lines[$i] -replace ' ', '·')
      Info ("L{0}: {1}" -f ($i+1), $vis)
    }
  }

  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($ConfigPath, $lines.ToArray(), $utf8)
  Ok "wrote $ConfigPath"
}

# --- 4) validate YAML ---
Write-Host "`n[4/5] validate YAML`n" -ForegroundColor White

# 4a Python PyYAML if available in hermes venv
$py = "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\python.exe"
$yamlOk = $false
if (Test-Path $py) {
  $code = @"
import sys
p = sys.argv[1]
try:
    import yaml
except ImportError:
    try:
        from ruamel.yaml import YAML
        YAML(typ='safe').load(open(p, encoding='utf-8'))
        print('YAML_OK_RUAMEL')
        sys.exit(0)
    except Exception as e:
        print('YAML_IMPORT_FAIL', e)
        sys.exit(2)
try:
    yaml.safe_load(open(p, encoding='utf-8'))
    print('YAML_OK')
    sys.exit(0)
except Exception as e:
    print('YAML_FAIL', e)
    sys.exit(1)
"@
  $tmpPy = Join-Path $env:TEMP "bee_validate_hermes_yaml.py"
  Set-Content -Path $tmpPy -Value $code -Encoding UTF8
  $out = & $py $tmpPy $ConfigPath 2>&1 | Out-String
  Info $out.Trim()
  if ($out -match 'YAML_OK') { $yamlOk = $true; Ok "Python YAML parse OK" }
  else {
    # try pip install pyyaml quickly
    $pip = "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\pip.exe"
    if (Test-Path $pip) {
      & $pip install pyyaml -q 2>&1 | Out-Null
      $out2 = & $py $tmpPy $ConfigPath 2>&1 | Out-String
      Info $out2.Trim()
      if ($out2 -match 'YAML_OK') { $yamlOk = $true; Ok "Python YAML parse OK (after pyyaml install)" }
      else { Bad "Python YAML parse failed" }
    } else { Bad "Python YAML parse failed" }
  }
} else { Warn "hermes venv python not found — skip py validate" }

# 4b hermes config must not say Failed to parse
$hermesOut = ""
try {
  $hermesOut = & hermes config 2>&1 | Out-String
} catch {
  $hermesOut = "$_"
}
if ($hermesOut -match 'Failed to parse|falling back to default config') {
  Bad "hermes config still reports parse failure"
  Info ($hermesOut.Substring(0, [Math]::Min(500, $hermesOut.Length)))
} else {
  Ok "hermes config — no parse error"
  $yamlOk = $true
}

# --- 5) ensure concurrent-log-handler ---
Write-Host "`n[5/5] deps + summary`n" -ForegroundColor White
$pip = "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\pip.exe"
if (Test-Path $pip) {
  & $pip install concurrent-log-handler -q 2>&1 | Out-Null
  Ok "concurrent-log-handler present"
}

# Alfred side quick check
$agents = "C:\Users\Barak\.openclaw\workspace\AGENTS.md"
if (Test-Path $agents) {
  $n = ([regex]::Matches((Get-Content -Raw $agents), '(?m)^5\.\s+\*\*Read `BEE_CANON\.md`')).Count
  if ($n -eq 1) { Ok "Alfred AGENTS.md step-5 headers = 1" }
  elseif ($n -gt 1) { Bad "Alfred AGENTS.md step-5 duplicated ($n) — run repair-alfred-wire.ps1" }
  else { Warn "Alfred step-5 not found" }
}

Write-Host "`n================ RESULT ================`n" -ForegroundColor White
if ($fail.Count -eq 0) {
  Write-Host "PASS — Hermes config fixed and parses." -ForegroundColor Green
  Write-Host @"

Next (separate window, leave open):
  hermes gateway run

Then check:
  Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue

Ask Alfred: what bank does BEE use and VAT cadence?
"@ -ForegroundColor Cyan
  exit 0
} else {
  Write-Host "FAIL — $($fail.Count) issue(s):" -ForegroundColor Red
  $fail | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "`nPaste this full output back to Max.`n" -ForegroundColor Yellow
  exit 1
}
