#!/usr/bin/env bash
# Wire bee-assets to auto-refresh the Obsidian vault + Graphify graph after every commit.
# Bash twin of install-git-hooks.ps1 — sets core.hooksPath to research/scripts/git-hooks.
set -euo pipefail

UNINSTALL=0
[[ "${1:-}" == "--uninstall" ]] && UNINSTALL=1

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Not inside a git repo. cd into the bee-assets clone first." >&2
  exit 1
}

if [[ "$UNINSTALL" -eq 1 ]]; then
  git -C "$REPO" config --unset core.hooksPath 2>/dev/null || true
  echo "Unset core.hooksPath — git is back to .git/hooks. Auto-sync disabled."
  exit 0
fi

HOOK_DIR="$REPO/research/scripts/git-hooks"
HOOK_FILE="$HOOK_DIR/post-commit"
[[ -f "$HOOK_FILE" ]] || { echo "hook not found: $HOOK_FILE (did you git pull?)"; exit 1; }

git -C "$REPO" config core.hooksPath "research/scripts/git-hooks"
chmod +x "$HOOK_FILE" \
  "$REPO/research/scripts/sync-vault-and-graphify.sh" \
  "$REPO/research/scripts/install-git-hooks.sh" 2>/dev/null || true

echo "Installed."
echo "  core.hooksPath -> research/scripts/git-hooks"
echo "  Every commit now refreshes the Obsidian vault + graphify graph in the background."
echo
echo "  Vault-only:  export BEE_HOOK_ARGS='--skip-pull --skip-graphify'   # bash sync"
echo "           or  export BEE_HOOK_ARGS='-SkipPull -SkipGraphify'       # PowerShell sync"
echo "  Disable:     bash research/scripts/install-git-hooks.sh --uninstall"
echo
echo "  Tip: verify with  bash research/scripts/sync-vault-and-graphify.sh --dry-run"
