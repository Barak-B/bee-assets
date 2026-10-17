#!/usr/bin/env bash
# index-bee-app.sh — First analyze run of BEE Operations app.
#
# Per gitnexus-audit.md §5.2 + §5.3.
# Run on: bee-prod-1 (or wherever BEE app source is cloned)
# Pre-req: deploy.sh succeeded; bee-app code accessible
# Expected: 2-10 min depending on BEE app size.
#
# What this does:
#   1. Verify BEE app source is present + is a git repo
#   2. Run gitnexus analyze (first time builds full index)
#   3. Restrict .gitnexus/ to 700 perms
#   4. Verify index built successfully
#   5. Print summary stats

set -euo pipefail

# ===== Config =====
# Path to BEE Operations app source. Override via env var.
BEE_APP_DIR="${BEE_APP_DIR:-/opt/bee-ops}"   # adjust to actual path

# ===== Pre-flight =====
command -v gitnexus >/dev/null || { echo "❌ gitnexus not in PATH — run deploy.sh"; exit 1; }
[ -d "$BEE_APP_DIR" ] || {
  echo "❌ BEE app not found at $BEE_APP_DIR"
  echo "   Set BEE_APP_DIR env var:"
  echo "     BEE_APP_DIR=/path/to/bee-ops bash $0"
  exit 1
}
[ -d "$BEE_APP_DIR/.git" ] || {
  echo "❌ $BEE_APP_DIR is not a git repository"
  echo "   GitNexus requires a git repo for change detection"
  exit 1
}

echo "=== index-bee-app.sh starting $(date -Iseconds) ==="
echo "BEE app: $BEE_APP_DIR"
echo "$(cd "$BEE_APP_DIR" && git log -1 --oneline)"
echo ""

# ===== Step 1: First-time analyze =====
cd "$BEE_APP_DIR"
echo "[1/3] Running first-time gitnexus analyze (this builds full index)…"

# --force ensures fresh build first time
# (omit --embeddings to skip semantic vectors initially — add later if needed for RAG)
gitnexus analyze --force 2>&1 | tee /tmp/gitnexus-bee-analyze.log

# ===== Step 2: Perms =====
echo "[2/3] Restricting .gitnexus/ permissions to 700"
chmod 700 .gitnexus
chmod -R go-rwx .gitnexus

# ===== Step 3: Verify =====
echo "[3/3] Verifying index"
if [ -f ".gitnexus/meta.json" ]; then
  cat .gitnexus/meta.json | head -30
else
  echo "❌ .gitnexus/meta.json missing — analyze failed"
  exit 2
fi

echo ""
echo "Registry status (should show 1 repo):"
gitnexus list

echo ""
echo "=== index-bee-app.sh COMPLETE ==="
echo "Index location:  $BEE_APP_DIR/.gitnexus/"
echo "Registry:        $HOME/.gitnexus/registry.json"
echo "Next:            Apply MCP configs (see ../configs/), then bash scripts/smoke-test.sh"
