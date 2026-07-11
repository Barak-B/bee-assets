<#
.SYNOPSIS
  Repair Alfred AGENTS.md after duplicate BEE_CANON inserts, then insert step 5 once.
  Restores from .bak-bee-* if present, else dedupes in place.

.EXAMPLE
  pwsh -File platform\connections\repair-alfred-wire.ps1
#>
[CmdletBinding()]
param(
  [string]$AgentsMd = $(if ($env:BEE_ALFRED_WORKSPACE) {
      Join-Path $env:BEE_ALFRED_WORKSPACE "AGENTS.md"
    } else {
      "C:\Users\Barak\.openclaw\workspace\AGENTS.md"
    }),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE Hive Cortex — repair-alfred-wire`n" -ForegroundColor White

if (-not (Test-Path $AgentsMd)) { throw "Missing $AgentsMd" }

$step = @'
5. **Read `BEE_CANON.md`** (in your workspace) — the cross-agent canon digest synced from the
   bee-assets repo. Its locked facts (bank = Mercantile code 17, VAT monthly, 0% מקדמות, the 4
   authorized outbound destinations, the agent roster, "never invent operator facts") are
   **AUTHORITATIVE**. If anything in `MEMORY.md` or a daily note conflicts with `BEE_CANON.md`,
   `BEE_CANON.md` wins. It is refreshed from git on every sync — **do not edit it locally**;
   propose canon changes back in self-chat (they belong in the git repo).
'@

# Prefer restoring the backup taken just before the buggy insert
$dir = Split-Path $AgentsMd -Parent
$bak = Get-ChildItem -Path $dir -Filter "AGENTS.md.bak-bee-*" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$pre = $null
if ($bak) {
  Info "found backup: $($bak.FullName)"
  $pre = Get-Content -Raw -Encoding UTF8 $bak.FullName
  Ok "will restore from backup then insert once"
} else {
  Warn "no bak-bee backup — will strip duplicate BEE_CANON blocks from current file"
  $pre = Get-Content -Raw -Encoding UTF8 $AgentsMd
  # Remove any block that starts with "5. **Read `BEE_CANON.md`**" through the "git repo)." line
  $pre = [regex]::Replace($pre,
    '(?ms)^\s*5\.\s+\*\*Read `BEE_CANON\.md`\*\*.*?git repo\)\.\s*',
    '')
}

# Ensure we don't already have step after restore
if ($pre -match 'Read `BEE_CANON\.md`') {
  $pre = [regex]::Replace($pre,
    '(?ms)^\s*5\.\s+\*\*Read `BEE_CANON\.md`\*\*.*?git repo\)\.\s*',
    '')
  Warn "stripped existing BEE_CANON step(s) before clean insert"
}

# Insert ONCE after Session Startup step 4 only (first ^4. under that section if possible)
$marker = '<!-- BEE_CANON_STEP5 -->'
$insertBlock = "`r`n`r`n$marker`r`n$step`r`n"

$idxStartup = $pre.IndexOf('Session Startup')
if ($idxStartup -lt 0) {
  $newText = $pre.TrimEnd() + "`r`n`r`n## Session Startup`r`n$insertBlock"
  Warn "no Session Startup heading — appended section"
} else {
  # Find first line matching ^4. AFTER Session Startup
  $rx = New-Object System.Text.RegularExpressions.Regex('(?m)^4\.\s+.+$', 'Multiline')
  $m = $rx.Match($pre, $idxStartup)
  if ($m.Success) {
    $insertAt = $m.Index + $m.Length
    $newText = $pre.Substring(0, $insertAt) + $insertBlock + $pre.Substring($insertAt)
    Ok "inserting once after first step-4 following Session Startup"
  } else {
    # insert right after Session Startup heading line
    $lineEnd = $pre.IndexOf("`n", $idxStartup)
    if ($lineEnd -lt 0) { $lineEnd = $idxStartup }
    $newText = $pre.Substring(0, $lineEnd + 1) + $insertBlock + $pre.Substring($lineEnd + 1)
    Warn "no step 4 after Session Startup — inserted under heading"
  }
}

$count = ([regex]::Matches($newText, 'Read `BEE_CANON\.md`')).Count
Info "BEE_CANON mention count after repair: $count (expect 3 lines in one step ≈ multiple mentions OK; unique steps should be 1)"
$stepStarts = ([regex]::Matches($newText, '(?m)^5\.\s+\*\*Read `BEE_CANON\.md`')).Count
Info "step-5 headers: $stepStarts (must be 1)"

if ($stepStarts -ne 1) {
  throw "repair failed — step-5 header count=$stepStarts"
}

if ($DryRun) {
  Info "[DryRun] no write"
  exit 0
}

$safe = "$AgentsMd.before-repair-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Force $AgentsMd $safe
Ok "current file saved → $safe"
Set-Content -Path $AgentsMd -Value $newText -Encoding UTF8 -NoNewline
Ok "wrote clean AGENTS.md"

Write-Host "`nVerify: Select-String BEE_CANON should show ~3 lines, not dozens.`n" -ForegroundColor Green
Select-String -Path $AgentsMd -Pattern 'BEE_CANON' | ForEach-Object { Info $_.Line.Trim().Substring(0, [Math]::Min(100, $_.Line.Trim().Length)) }
