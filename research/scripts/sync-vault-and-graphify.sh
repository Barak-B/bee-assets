#!/usr/bin/env bash
# Close the protocol_hive.md §6 sync loop (cross-platform):
#   git → Obsidian vault → Graphify graph.
#
# Mirrors research/scripts/sync-vault-and-graphify.ps1 for Bash / WSL / Linux / macOS.
# Cloud cortex can dry-run against a local mirror; live E:\ vault sync is Barak's PC only.
#
# Usage:
#   bash research/scripts/sync-vault-and-graphify.sh [--dry-run] [--skip-pull] [--skip-vault] [--skip-graphify] [--skip-cluster] [--force-canon] [--force-all]
# Env:
#   BEE_VAULT_BEE_DIR   — override vault BEE folder (required on non-Windows unless default exists)
#   BEE_REPO_ROOT       — override repo root
#   GRAPHIFY_BACKEND    — default deepseek
set -euo pipefail

DRY_RUN=0
SKIP_PULL=0
SKIP_VAULT=0
SKIP_GRAPHIFY=0
SKIP_CLUSTER=0
FORCE_CANON=0
FORCE_ALL=0
BACKEND="${GRAPHIFY_BACKEND:-deepseek}"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    --skip-vault) SKIP_VAULT=1 ;;
    --skip-graphify) SKIP_GRAPHIFY=1 ;;
    --skip-cluster) SKIP_CLUSTER=1 ;;
    --force-canon) FORCE_CANON=1 ;;
    --force-all) FORCE_ALL=1 ;;
    --backend=*) BACKEND="${arg#*=}" ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${BEE_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
RESEARCH_DIR="$REPO_ROOT/research"
DEFAULT_VAULT="E:/Desktop/ברק/תוכנות/תכנות וAI/obsidian/Barak-v-obsidian/3-Projects/BEE"
VAULT_BEE_DIR="${BEE_VAULT_BEE_DIR:-$DEFAULT_VAULT}"
LOCK_FILE="${TMPDIR:-/tmp}/bee-sync.lock"

info(){ printf '  %s\n' "$*"; }
ok(){   printf '  OK  %s\n' "$*"; }
warn(){ printf '  !!  %s\n' "$*" >&2; }

if [[ ! -d "$RESEARCH_DIR" ]]; then
  echo "research/ not found under RepoRoot='$REPO_ROOT'. Set BEE_REPO_ROOT or see PATHS.md." >&2
  exit 1
fi

echo "BEE sync — repo: $REPO_ROOT"
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY RUN — no files copied, no extract run."

# Single-runner lock
if [[ "$DRY_RUN" -eq 0 ]]; then
  if [[ -f "$LOCK_FILE" ]]; then
    age=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE") ))
    if (( age < 1800 )); then
      warn "another sync is running (lock < 30min old) — exiting to avoid a race."
      exit 0
    fi
    warn "stale lock (> 30min) — taking over."
  fi
  echo "$$ $(date -Iseconds 2>/dev/null || date)" >"$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
fi

# Step 1: git pull
if [[ "$SKIP_PULL" -eq 0 ]]; then
  info "git pull (origin, current branch)..."
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git -C "$REPO_ROOT" pull --ff-only || warn "git pull failed (continuing)"
  fi
  ok "pull done"
else
  warn "skipped git pull"
fi

# Step 2: mirror research/**/*.md into the vault
sha_of() { sha256sum "$1" 2>/dev/null | awk '{print $1}'; }
is_canon() {
  case "$(basename "$1")" in
    BRAIN.md|PATHS.md|protocol_hive.md|AGENT_CANON.md|SYNC_STATUS.md) return 0 ;;
    *) return 1 ;;
  esac
}

copied=0; kept=0; identical=0; forced=0
GRAPHIFY_STATUS="skipped"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"

if [[ "$SKIP_VAULT" -eq 0 ]]; then
  info "mirroring research/**/*.md -> $VAULT_BEE_DIR"
  vault_parent="$(dirname "$VAULT_BEE_DIR")"
  if [[ ! -d "$vault_parent" ]]; then
    warn "vault parent '$vault_parent' not found — is the Obsidian vault path correct? (see PATHS.md). Skipping vault mirror."
    warn "Tip: export BEE_VAULT_BEE_DIR=/path/to/vault/3-Projects/BEE"
  else
    total=0
    while IFS= read -r -d '' f; do
      total=$((total + 1))
      rel="${f#"$RESEARCH_DIR"/}"
      dest="$VAULT_BEE_DIR/$rel"
      dest_dir="$(dirname "$dest")"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "    would copy $rel"
        continue
      fi
      if [[ -f "$dest" ]] && [[ "$(sha_of "$dest")" == "$(sha_of "$f")" ]]; then
        identical=$((identical + 1))
        continue
      fi
      force_this=0
      if [[ "$FORCE_ALL" -eq 1 ]] || { [[ "$FORCE_CANON" -eq 1 ]] && is_canon "$rel"; }; then
        force_this=1
      fi
      if [[ "$force_this" -eq 0 && -f "$dest" && "$dest" -nt "$f" ]]; then
        warn "vault copy newer + different — KEEPING vault edit: $rel"
        kept=$((kept + 1))
        continue
      fi
      mkdir -p "$dest_dir"
      cp -f "$f" "$dest"
      if [[ "$force_this" -eq 1 ]]; then forced=$((forced + 1)); else copied=$((copied + 1)); fi
    done < <(find "$RESEARCH_DIR" -type f -name '*.md' -print0)

    if [[ "$DRY_RUN" -eq 1 ]]; then
      ok "$total markdown files (dry-run)"
    else
      ok "$total markdown files ($copied copied, $forced forced, $identical identical, $kept vault-newer kept)"
      [[ "$kept" -gt 0 ]] && warn "$kept vault file(s) were newer and preserved — reconcile those edits back into git (or --force-all)."
    fi
  fi
else
  warn "skipped vault mirror"
fi

# Step 3: graphify extract
if [[ "$SKIP_GRAPHIFY" -eq 0 ]]; then
  if ! command -v graphify >/dev/null 2>&1; then
    warn "graphify not on PATH. Install: pip install 'graphifyy[anthropic,openai]' (PyPI pkg is 'graphifyy')."
    GRAPHIFY_STATUS="missing-cli"
  else
    info "graphify extract . --update --backend=$BACKEND"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      pushd "$RESEARCH_DIR" >/dev/null
      if graphify extract . --update "--backend=$BACKEND"; then
        GRAPHIFY_STATUS="extract-ok"
      else
        warn "graphify extract failed"
        GRAPHIFY_STATUS="extract-failed"
      fi
      if [[ "$SKIP_CLUSTER" -eq 0 ]]; then
        info "graphify cluster-only . --backend=$BACKEND"
        graphify cluster-only . "--backend=$BACKEND" || warn "graphify cluster-only failed"
      else
        warn "skipped graphify cluster-only"
      fi
      popd >/dev/null
      ok "graphify step finished"
    else
      GRAPHIFY_STATUS="dry-run"
    fi
  fi
else
  warn "skipped graphify extract"
  GRAPHIFY_STATUS="skipped"
fi

# Step 4: SYNC_STATUS heartbeat in vault
if [[ "$SKIP_VAULT" -eq 0 && "$DRY_RUN" -eq 0 && -d "$VAULT_BEE_DIR" ]]; then
  NOW="$(date '+%Y-%m-%d %H:%M:%S')"
  HOOKS="$(git -C "$REPO_ROOT" config --get core.hooksPath 2>/dev/null || true)"
  cat >"$VAULT_BEE_DIR/SYNC_STATUS.md" <<EOF
---
aliases:
  - SYNC_STATUS
  - סטטוס סנכרון
tags:
  - bee
  - sync
  - status
---

# \`[[SYNC_STATUS]]\` — dynamic brain heartbeat

> Auto-written by sync-vault-and-graphify.sh. Do not hand-edit.
> Hub: \`[[BRAIN]]\`

| Field | Value |
|---|---|
| **Last sync** | $NOW |
| **Branch** | \`$BRANCH\` |
| **Commit** | \`$COMMIT\` |
| **Copied / forced / identical / kept** | $copied / $forced / $identical / $kept |
| **Graphify** | $GRAPHIFY_STATUS |
| **Hooks path** | \`$HOOKS\` |

Verify: \`pwsh -File research/scripts/verify-brain-sync.ps1\`
EOF
  ok "wrote vault SYNC_STATUS.md (heartbeat)"
fi

echo
echo "Done. Commit research/graphify-out/ if it changed, so the graph stays in git too (§6 loop)."
