#!/usr/bin/env bash
# rollback.sh — Emergency teardown of GitNexus deployment.
#
# Removes /opt/gitnexus-source, unlinks global binary, deletes ~/.gitnexus.
# Does NOT touch BEE app code/data or Alfred/Hermes configs (those are reverted manually).
#
# Run when: deployment failed mid-way, or you want to retry from scratch.
# Time: ~2 min.

set -u

GITNEXUS_DIR="${GITNEXUS_DIR:-/opt/gitnexus-source}"
BEE_APP_DIR="${BEE_APP_DIR:-/opt/bee-ops}"

echo "=== GitNexus rollback ==="
echo "This will:"
echo "  - npm unlink global gitnexus binary"
echo "  - rm -rf $GITNEXUS_DIR"
echo "  - rm -rf ~/.gitnexus (registry + caches)"
echo "  - rm -rf $BEE_APP_DIR/.gitnexus (index)"
echo ""
echo "This will NOT:"
echo "  - touch the BEE app code or DB"
echo "  - touch Alfred or Hermes configs (you revert those manually)"
echo "  - touch any other bee-prod-1 services"
echo ""
read -p "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo ""
echo "[1/4] npm unlink global gitnexus"
if command -v gitnexus >/dev/null 2>&1; then
  sudo npm uninstall -g gitnexus 2>/dev/null || true
  # The npm link version may need manual unlink:
  cd "$GITNEXUS_DIR/gitnexus" 2>/dev/null && sudo npm unlink || true
  cd - >/dev/null
fi
command -v gitnexus >/dev/null 2>&1 && echo "  ⚠️  gitnexus still in PATH at $(command -v gitnexus)" || echo "  ✓ unlinked"

echo "[2/4] Remove source dir"
if [ -d "$GITNEXUS_DIR" ]; then
  sudo rm -rf "$GITNEXUS_DIR"
  echo "  ✓ $GITNEXUS_DIR removed"
else
  echo "  (already gone)"
fi

echo "[3/4] Remove ~/.gitnexus"
if [ -d "$HOME/.gitnexus" ]; then
  rm -rf "$HOME/.gitnexus"
  echo "  ✓ ~/.gitnexus removed"
else
  echo "  (already gone)"
fi

echo "[4/4] Remove BEE app index"
if [ -d "$BEE_APP_DIR/.gitnexus" ]; then
  rm -rf "$BEE_APP_DIR/.gitnexus"
  echo "  ✓ $BEE_APP_DIR/.gitnexus removed"
else
  echo "  (no index to remove)"
fi

echo ""
echo "=== Rollback complete ==="
echo ""
echo "Next manual steps:"
echo "  1. On Barak's PC: revert ~/.openclaw/openclaw.json (remove 'gitnexus' under mcpServers)"
echo "     A .bak file was created when configs were applied (see configs/ README)"
echo "  2. On Barak's PC: revert ~/.config/hermes/mcp.yaml (remove gitnexus entry)"
echo "  3. Restart Alfred + Hermes to flush cached MCP server registrations"
echo ""
echo "BEE app itself is untouched. To redeploy: bash scripts/prepare-fork.sh"
