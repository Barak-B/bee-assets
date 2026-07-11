<#
.SYNOPSIS
  Inserts BEE_CANON Session Startup step 5 into Alfred AGENTS.md (with backup).
  Run this yourself — it edits the constitutional file only when you invoke it.

.EXAMPLE
  pwsh -File platform\connections\complete-alfred-wire.ps1
  pwsh -File platform\connections\complete-alfred-wire.ps1 -DryRun
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

Write-Host "`nBEE Hive Cortex — complete-alfred-wire`n" -ForegroundColor White

if (-not (Test-Path $AgentsMd)) {
  throw "AGENTS.md not found at $AgentsMd"
}
Info "target: $AgentsMd"

$step = @'
5. **Read `BEE_CANON.md`** (in your workspace) — the cross-agent canon digest synced from the
   bee-assets repo. Its locked facts (bank = Mercantile code 17, VAT monthly, 0% מקדמות, the 4
   authorized outbound destinations, the agent roster, "never invent operator facts") are
   **AUTHORITATIVE**. If anything in `MEMORY.md` or a daily note conflicts with `BEE_CANON.md`,
   `BEE_CANON.md` wins. It is refreshed from git on every sync — **do not edit it locally**;
   propose canon changes back in self-chat (they belong in the git repo).
'@

$text = Get-Content -Raw -Encoding UTF8 $AgentsMd

if ($text -match 'Read `BEE_CANON\.md`') {
  Ok "Step 5 already present — no change"
  exit 0
}

# Prefer inserting after an existing "4." startup step; else after Session Startup heading; else append
$inserted = $false
$newText = $text

if ($text -match '(?m)^4\.\s+.+$') {
  # Insert after the last line of step 4 block is hard; insert after first line matching ^4.
  $newText = [regex]::Replace($text, '(?m)^4\.\s+.+$', { param($m) $m.Value + "`r`n`r`n" + $step }, 1)
  if ($newText -ne $text) { $inserted = $true; Ok "inserted after step 4" }
}

if (-not $inserted -and $text -match '(?m)^#+[^\r\n]*Session Startup[^\r\n]*') {
  $newText = [regex]::Replace($text, '(?m)^#+[^\r\n]*Session Startup[^\r\n]*', { param($m) $m.Value + "`r`n`r`n" + $step }, 1)
  if ($newText -ne $text) { $inserted = $true; Ok "inserted under Session Startup heading" }
}

if (-not $inserted) {
  $newText = $text.TrimEnd() + "`r`n`r`n## Session Startup — BEE Canon`r`n`r`n" + $step + "`r`n"
  $inserted = $true
  Warn "no Session Startup/step 4 found — appended new section at end; review the file"
}

if ($DryRun) {
  Info "[DryRun] would write change; showing first 200 chars of step:"
  Info ($step.Substring(0, [Math]::Min(200, $step.Length)))
  exit 0
}

$backup = "$AgentsMd.bak-bee-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Force $AgentsMd $backup
Ok "backup → $backup"
Set-Content -Path $AgentsMd -Value $newText -Encoding UTF8 -NoNewline
Ok "wrote AGENTS.md"

# Show proof
Select-String -Path $AgentsMd -Pattern 'BEE_CANON' -SimpleMatch | ForEach-Object { Info $_.Line.Trim() }

Write-Host "`nDone. Ask Alfred: what bank does BEE use and VAT cadence?`n" -ForegroundColor Green
