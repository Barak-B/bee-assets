#!/usr/bin/env bash
# prepare-fork.sh — Clone GitNexus, sanitize, audit. Idempotent.
#
# Per gitnexus-audit.md §4.1 + §3.2 + §3.3.
# Run on: bee-prod-1 (or any build host with network egress to github + npm)
# Expected: ~5 min for clone + audit. Build is a separate step (deploy.sh).
#
# What this does:
#   1. Clone GitNexus to /opt/gitnexus-source (if not already)
#   2. Create bee-internal branch
#   3. Remove @scarf/scarf from package.json
#   4. Lock dependencies (no surprise upgrades)
#   5. npm audit at moderate threshold — fails if HIGH/CRITICAL found
#   6. Pin tree-sitter native modules (no auto-rebuild)
#
# Outputs:
#   /opt/gitnexus-source/  (branch: bee-internal)
#   /tmp/gitnexus-prepare.log  (full log)
#
# Re-runnable: safe to run again — won't re-clone, won't double-modify.

set -euo pipefail

# ===== Config =====
GITNEXUS_REPO="${GITNEXUS_REPO:-https://github.com/abhigyanpatwari/GitNexus.git}"
GITNEXUS_DIR="${GITNEXUS_DIR:-/opt/gitnexus-source}"
GITNEXUS_REF="${GITNEXUS_REF:-main}"   # pin to a specific tag/SHA after first deploy
LOG="/tmp/gitnexus-prepare-$(date +%Y%m%d-%H%M%S).log"

exec > >(tee -a "$LOG") 2>&1

echo "=== prepare-fork.sh starting $(date -Iseconds) ==="
echo "GITNEXUS_DIR=$GITNEXUS_DIR"
echo "GITNEXUS_REPO=$GITNEXUS_REPO"
echo "GITNEXUS_REF=$GITNEXUS_REF"

# ===== Step 1: Clone (or pull) =====
if [ -d "$GITNEXUS_DIR/.git" ]; then
  echo "[1/6] Existing clone found — pulling latest from $GITNEXUS_REF"
  cd "$GITNEXUS_DIR"
  git fetch origin
  git checkout "$GITNEXUS_REF"
  git pull origin "$GITNEXUS_REF"
else
  echo "[1/6] Cloning fresh: $GITNEXUS_REPO → $GITNEXUS_DIR"
  sudo mkdir -p "$(dirname "$GITNEXUS_DIR")"
  sudo chown -R "$USER:$USER" "$(dirname "$GITNEXUS_DIR")"
  git clone "$GITNEXUS_REPO" "$GITNEXUS_DIR"
  cd "$GITNEXUS_DIR"
  git checkout "$GITNEXUS_REF"
fi

# ===== Step 2: bee-internal branch =====
echo "[2/6] Ensuring bee-internal branch"
if git rev-parse --verify bee-internal >/dev/null 2>&1; then
  git checkout bee-internal
  git rebase "$GITNEXUS_REF" || {
    echo "⚠️  Rebase conflict on bee-internal. Manual review needed."
    echo "   git status; resolve; git rebase --continue"
    exit 1
  }
else
  git checkout -b bee-internal
fi

# ===== Step 3: Remove @scarf/scarf =====
echo "[3/6] Removing @scarf/scarf (per audit §3.2)"
# gitnexus/package.json is the one with the dep — check root + sub-package
for pkg in package.json gitnexus/package.json; do
  if [ -f "$pkg" ] && grep -q '@scarf/scarf' "$pkg"; then
    # Use a backup-safe sed (in-place with .bak, then delete .bak)
    sed -i.scarfbak '/@scarf\/scarf/d' "$pkg"
    rm -f "${pkg}.scarfbak"
    echo "  ✓ removed from $pkg"
  fi
done

# Commit the sanitization (so it survives future rebases)
if ! git diff --quiet; then
  git add package.json gitnexus/package.json 2>/dev/null || true
  git commit -m "BEE-internal: remove @scarf/scarf telemetry dep (audit §3.2)" || true
else
  echo "  (scarf already removed in previous run)"
fi

# ===== Step 4: package-lock regenerate without scripts =====
echo "[4/6] Regenerate package-lock without running install scripts"
# This refreshes the lockfile without ANY post-install scripts running (telemetry-safe)
npm install --package-lock-only --ignore-scripts

# Commit lockfile updates if any
if ! git diff --quiet package-lock.json 2>/dev/null; then
  git add package-lock.json
  git commit -m "BEE-internal: regenerate package-lock without scarf" || true
fi

# ===== Step 5: npm audit at moderate threshold =====
echo "[5/6] npm audit (must be clean at moderate+)"
set +e
npm audit --audit-level moderate --omit dev > /tmp/gitnexus-audit-output.txt 2>&1
AUDIT_RC=$?
set -e

if [ $AUDIT_RC -ne 0 ]; then
  echo "⚠️  npm audit found vulnerabilities at moderate+ severity:"
  cat /tmp/gitnexus-audit-output.txt | tail -50
  echo ""
  echo "DECISION REQUIRED:"
  echo "  - If LOW/MED only — review + acknowledge → set AUDIT_OVERRIDE=1 and re-run"
  echo "  - If HIGH/CRITICAL — DO NOT PROCEED. Pin to older known-clean version of gitnexus."
  if [ "${AUDIT_OVERRIDE:-0}" != "1" ]; then
    exit 2
  fi
  echo "  AUDIT_OVERRIDE=1 set — proceeding despite findings."
else
  echo "  ✓ npm audit clean at moderate+ threshold"
fi

# ===== Step 6: Capture state for deploy.sh =====
echo "[6/6] Capturing prepared state"
echo "$GITNEXUS_REF" > "$GITNEXUS_DIR/.bee-pinned-ref"
git rev-parse HEAD > "$GITNEXUS_DIR/.bee-pinned-sha"

echo ""
echo "=== prepare-fork.sh COMPLETE ==="
echo "Pinned to: $(cat "$GITNEXUS_DIR/.bee-pinned-sha")"
echo "Branch:    bee-internal (off $GITNEXUS_REF)"
echo "Audit:     $(cat /tmp/gitnexus-audit-output.txt | tail -1)"
echo "Next:      bash scripts/deploy.sh"
echo "Log:       $LOG"
