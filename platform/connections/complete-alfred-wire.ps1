<#
.SYNOPSIS
  Insert BEE_CANON step 5 into Alfred AGENTS.md exactly once (fixed Replace overload).
  Prefer repair-alfred-wire.ps1 if duplicates already exist.
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

Write-Host "`nBEE Hive Cortex — complete-alfred-wire (v2)`n" -ForegroundColor White

if (-not (Test-Path $AgentsMd)) { throw "AGENTS.md not found at $AgentsMd" }
Info "target: $AgentsMd"

$text = Get-Content -Raw -Encoding UTF8 $AgentsMd
$stepStarts = ([regex]::Matches($text, '(?m)^5\.\s+\*\*Read `BEE_CANON\.md`')).Count
if ($stepStarts -gt 1) {
  Warn "duplicate step 5 detected ($stepStarts). Run repair-alfred-wire.ps1 instead."
  throw "duplicates present — use repair-alfred-wire.ps1"
}
if ($stepStarts -eq 1) {
  Ok "Step 5 already present once — no change"
  exit 0
}

# Delegate to repair logic for clean single insert
$repair = Join-Path $PSScriptRoot "repair-alfred-wire.ps1"
if ($DryRun) {
  & $repair -AgentsMd $AgentsMd -DryRun
} else {
  & $repair -AgentsMd $AgentsMd
}
