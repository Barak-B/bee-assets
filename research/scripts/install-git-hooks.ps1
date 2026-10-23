<#
.SYNOPSIS
  Wire bee-assets to auto-refresh the Obsidian vault + Graphify graph after every commit,
  by pointing git at the version-controlled hooks dir (research/scripts/git-hooks/).

.DESCRIPTION
  Sets `git config core.hooksPath research/scripts/git-hooks`. From then on, every commit
  fires research/scripts/git-hooks/post-commit, which runs sync-vault-and-graphify.ps1 in
  the background (vault mirror + incremental graphify extract). This is the bee-assets
  equivalent of the graphify hook already active on OpenClawAgent — but richer (it also
  mirrors the markdown into the vault, and uses the correct '--backend=' equals form).

  Run ONCE on the local machine (the cloud cortex can't reach .git / E:\ — protocol §5).

  Do NOT also run `graphify hook install` on this repo — core.hooksPath would bypass the
  hook it writes into .git/hooks, and this custom hook already covers graphify + vault.

.PARAMETER Uninstall
  Revert: unset core.hooksPath (git goes back to .git/hooks).

.EXAMPLE
  pwsh research/scripts/install-git-hooks.ps1
.EXAMPLE
  # vault-only, skip the paid graphify extract on each commit:
  [Environment]::SetEnvironmentVariable("BEE_HOOK_ARGS","-SkipPull -SkipGraphify","User")
.EXAMPLE
  pwsh research/scripts/install-git-hooks.ps1 -Uninstall
#>
[CmdletBinding()]
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"

$repo = (git rev-parse --show-toplevel 2>$null)
if (-not $repo) { throw "Not inside a git repo. cd into the bee-assets clone first." }
$repo = $repo.Trim()

if ($Uninstall) {
  git -C $repo config --unset core.hooksPath 2>$null
  Write-Host "Unset core.hooksPath — git is back to .git/hooks. Auto-sync disabled." -ForegroundColor Yellow
  exit 0
}

$hookDir  = Join-Path $repo "research/scripts/git-hooks"
$hookFile = Join-Path $hookDir "post-commit"
if (-not (Test-Path $hookFile)) { throw "hook not found: $hookFile (did you git pull?)" }

git -C $repo config core.hooksPath "research/scripts/git-hooks"

# Ensure the hook is executable for git-bash (no-op on a fresh Windows checkout, but the
# committed mode bit usually carries it; this makes a re-clone robust).
git -C $repo update-index --chmod=+x research/scripts/git-hooks/post-commit 2>$null | Out-Null

Write-Host "Installed." -ForegroundColor Green
Write-Host "  core.hooksPath -> research/scripts/git-hooks"
Write-Host "  Every commit now refreshes the Obsidian vault + graphify graph in the background."
Write-Host ""
Write-Host "  Vault-only (skip paid graphify):  setx BEE_HOOK_ARGS `"-SkipPull -SkipGraphify`""
Write-Host "  Disable:                          pwsh research/scripts/install-git-hooks.ps1 -Uninstall"
Write-Host ""
Write-Host "  Tip: verify paths first with   pwsh research/scripts/sync-vault-and-graphify.ps1 -DryRun"
