<#
.SYNOPSIS
  One-time: enable OpenSSH Server on Windows + print Tailscale SSH target for remote agents.
  Does NOT expose the machine to the public internet — Tailscale only.

.EXAMPLE
  # Run as Administrator:
  pwsh -File platform\connections\enable-remote-ssh.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  !!  $m" -ForegroundColor Yellow }

Write-Host "`nBEE — enable-remote-ssh (Tailscale + OpenSSH)`n" -ForegroundColor White

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Warn "Not admin — re-run this script in 'Run as Administrator' PowerShell"
  throw "Administrator required"
}

# OpenSSH Server
$cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') {
  Info "Installing OpenSSH.Server..."
  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
  Ok "OpenSSH.Server installed"
} else { Ok "OpenSSH.Server already installed" }

Start-Service sshd -ErrorAction SilentlyContinue
Set-Service -Name sshd -StartupType Automatic
Ok "sshd Automatic + started"

# Firewall (Tailscale usually bypasses, but ensure local rule)
if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -EA SilentlyContinue)) {
  New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
  Ok "firewall rule for sshd"
} else { Ok "firewall rule exists" }

# Tailscale IP
$tsIP = $null
if (Get-Command tailscale -EA SilentlyContinue) {
  $tsIP = (tailscale ip -4 2>$null | Select-Object -First 1)
  if ($tsIP) { Ok "Tailscale IPv4: $tsIP" } else { Warn "tailscale ip returned empty — is Tailscale logged in?" }
} else {
  Warn "tailscale CLI not found — install Tailscale and re-run"
}

$user = $env:USERNAME
Write-Host "`n===== GIVE THIS TO THE AGENT =====`n" -ForegroundColor Yellow
if ($tsIP) {
  Write-Host "ssh $user@$tsIP" -ForegroundColor Green
  Write-Host "Optional: ssh $user@$tsIP `"hermes gateway restart`"" -ForegroundColor Cyan
} else {
  Write-Host "Tailscale IP unknown — after Tailscale is up, run: tailscale ip -4" -ForegroundColor Yellow
}
Write-Host @"

NOTE: Cursor Cloud VMs are NOT on your Tailscale network by default.
Until you add a Private Worker on this PC (docs/REMOTE_ACCESS.md option B)
or a Tailscale subnet/funnel path, cloud agents still cannot SSH here.
Use Cursor Desktop local Agent for immediate hands-on.

Whitelist for remote ops: see docs/REMOTE_ACCESS.md
"@
Write-Host "`n==================================`n" -ForegroundColor Yellow
