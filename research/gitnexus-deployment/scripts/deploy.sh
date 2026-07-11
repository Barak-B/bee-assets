#!/usr/bin/env bash
# deploy.sh — Install + build + register GitNexus locally. NO npm registry at runtime.
#
# Per gitnexus-audit.md §4.1 + §5.1.
# Run on: bee-prod-1 (after prepare-fork.sh completes)
# Expected: ~10 min for install + build
#
# What this does:
#   1. npm install --ignore-scripts (no telemetry, no post-install code)
#   2. Allow tree-sitter native rebuild explicitly (one-time, audited)
#   3. npm run build
#   4. npm link (makes 'gitnexus' command available system-wide from our checkout)
#   5. Restrict ~/.gitnexus permissions to 700
#   6. Verify the binary works (gitnexus --version)
#
# Outputs:
#   /opt/gitnexus-source/gitnexus/dist/  (built artifacts)
#   $(npm prefix -g)/bin/gitnexus → /opt/gitnexus-source/...  (symlink)
#   ~/.gitnexus/  (700 perms enforced)

set -euo pipefail

GITNEXUS_DIR="${GITNEXUS_DIR:-/opt/gitnexus-source}"
LOG="/tmp/gitnexus-deploy-$(date +%Y%m%d-%H%M%S).log"

exec > >(tee -a "$LOG") 2>&1

echo "=== deploy.sh starting $(date -Iseconds) ==="

# ===== Pre-flight =====
[ -d "$GITNEXUS_DIR" ] || { echo "❌ $GITNEXUS_DIR not found — run prepare-fork.sh first"; exit 1; }
[ -f "$GITNEXUS_DIR/.bee-pinned-sha" ] || { echo "❌ Not prepared (no .bee-pinned-sha) — run prepare-fork.sh"; exit 1; }

cd "$GITNEXUS_DIR"

# Confirm we're on bee-internal branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "bee-internal" ]; then
  echo "❌ Expected branch bee-internal, on $CURRENT_BRANCH — abort"
  exit 1
fi

# ===== Step 1: npm install without scripts =====
echo "[1/5] npm install --ignore-scripts (telemetry-safe)"
npm install --ignore-scripts

# ===== Step 2: Selective rebuild of native modules (tree-sitter etc.) =====
echo "[2/5] Rebuilding native modules (tree-sitter)"
# We allow these specific scripts to run (they only compile C bindings — no network):
ALLOWED_NATIVE=(
  "tree-sitter"
  "tree-sitter-javascript"
  "tree-sitter-typescript"
  "tree-sitter-python"
  "tree-sitter-go"
  "tree-sitter-rust"
  "@ladybugdb/core"
)

for mod in "${ALLOWED_NATIVE[@]}"; do
  if [ -d "node_modules/$mod" ]; then
    echo "  rebuilding $mod"
    npm rebuild "$mod" 2>&1 | tail -3 || echo "    (no rebuild needed)"
  fi
done

# ===== Step 3: Build TS → JS =====
echo "[3/5] npm run build"
if grep -q '"build"' gitnexus/package.json; then
  pushd gitnexus
  npm run build
  popd
else
  echo "  (no build script in gitnexus/package.json — already JS?)"
fi

# Sanity check
DIST="gitnexus/dist/cli.js"
[ -f "$DIST" ] || { echo "❌ Build did not produce $DIST"; exit 2; }
echo "  ✓ built: $DIST"

# ===== Step 4: npm link =====
echo "[4/5] npm link (makes gitnexus binary available globally from our checkout)"
pushd gitnexus
sudo npm link 2>&1 | tail -3
popd

# Verify
if command -v gitnexus >/dev/null 2>&1; then
  GITNEXUS_PATH=$(command -v gitnexus)
  echo "  ✓ gitnexus binary: $GITNEXUS_PATH"
  REAL=$(readlink -f "$GITNEXUS_PATH")
  echo "    → $REAL"
  if [[ "$REAL" != *"$GITNEXUS_DIR"* ]]; then
    echo "  ⚠️  WARNING: gitnexus binary not pointing to our fork — there may be a previous npm global install"
    echo "     fix: sudo npm uninstall -g gitnexus && cd $GITNEXUS_DIR/gitnexus && sudo npm link"
  fi
else
  echo "❌ gitnexus binary not in PATH after link — check npm prefix -g and $PATH"
  exit 3
fi

gitnexus --version || { echo "❌ gitnexus --version failed"; exit 4; }

# ===== Step 5: ~/.gitnexus permissions =====
echo "[5/5] Restricting ~/.gitnexus permissions to 700 (per audit §4.2)"
mkdir -p "$HOME/.gitnexus"
chmod 700 "$HOME/.gitnexus"
# Restrict any existing contents (run won't break since gitnexus is the only user)
chmod -R go-rwx "$HOME/.gitnexus" 2>/dev/null || true

echo ""
echo "=== deploy.sh COMPLETE ==="
echo "Binary:     $(command -v gitnexus)"
echo "Version:    $(gitnexus --version 2>/dev/null || echo unknown)"
echo "Source:     $GITNEXUS_DIR (branch bee-internal @ $(cat $GITNEXUS_DIR/.bee-pinned-sha | head -c 8))"
echo "Registry:   $HOME/.gitnexus (700 perms)"
echo "Next:       bash scripts/verify-network-egress.sh"
echo "Log:        $LOG"
