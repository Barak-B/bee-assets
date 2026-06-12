#!/usr/bin/env bash
# index-bee-app.sh — Stage 2: index BEE Operations app (code + live PG schema + optional docs)
#
# Run on: the machine with BEE app source (bee-prod-1 or dev box)
# Time: ~5 min code+schema, +10-20 min if docs pass enabled
# Cost: $0 for code+schema (local). Docs pass ≈ $1-3 via DeepSeek.
#
# Env (override as needed):
#   BEE_APP_DIR     — default /opt/bee-ops
#   BEE_DB_DSN      — postgresql://user:pass@127.0.0.1:5432/bee  (optional, enables schema pass)
#   DEEPSEEK_API_KEY — (optional, enables docs pass)

set -euo pipefail

BEE_APP_DIR="${BEE_APP_DIR:-/opt/bee-ops}"
export GRAPHIFY_QUERY_LOG_DISABLE=1   # no query log on prod box

echo "=== Graphify Stage 2 — index BEE app ==="

# --- 0. install (idempotent) ---
# 'anthropic' extra needed for the default 'claude' backend (graphify auto-detects
# from API key). Without it: "the 'anthropic' package is required for this backend".
EXTRAS="postgres,sql,mcp,neo4j,anthropic"
if ! command -v graphify >/dev/null 2>&1; then
  echo "[0/4] Installing graphifyy[$EXTRAS] (NOTE: double-y package name)..."
  if command -v uv >/dev/null 2>&1; then
    uv tool install "graphifyy[$EXTRAS]"
  else
    pipx install "graphifyy[$EXTRAS]" || pip install --user "graphifyy[$EXTRAS]"
  fi
fi
graphify --version

# --- 1. ignore file (keep node_modules/dist/secrets out) ---
if [ ! -f "$BEE_APP_DIR/.graphifyignore" ]; then
  cat > "$BEE_APP_DIR/.graphifyignore" <<'EOF'
node_modules/
dist/
build/
.next/
coverage/
*.min.js
.env*
secrets/
graphify-out/cache/
EOF
  echo "[1/4] wrote $BEE_APP_DIR/.graphifyignore"
else
  echo "[1/4] .graphifyignore exists — leaving as-is"
fi

# --- 2. code pass (local AST — 41 routes, 38 Prisma models, $0) ---
echo "[2/4] Code extraction (local, no API)..."
graphify extract "$BEE_APP_DIR" --no-viz

# --- 3. live PostgreSQL schema pass (optional) ---
if [ -n "${BEE_DB_DSN:-}" ]; then
  echo "[3/4] Live PG schema introspection..."
  graphify extract --postgres "$BEE_DB_DSN"
else
  echo "[3/4] SKIP schema pass (set BEE_DB_DSN to enable)"
fi

# --- 4. docs pass via DeepSeek (optional, costs ~\$1-3) ---
if [ -n "${DEEPSEEK_API_KEY:-}" ] && [ -d "$BEE_APP_DIR/docs" ]; then
  echo "[4/4] Docs semantic extraction via DeepSeek..."
  graphify extract "$BEE_APP_DIR/docs" --backend deepseek --no-viz
else
  echo "[4/4] SKIP docs pass (set DEEPSEEK_API_KEY + ensure docs/ exists)"
fi

# --- git hook: keep graph fresh per commit (AST-only, $0) ---
if [ -d "$BEE_APP_DIR/.git" ]; then
  (cd "$BEE_APP_DIR" && graphify hook install)
  echo "git hook installed — graph auto-rebuilds on commit"
fi

echo ""
echo "=== Done. Graph: $BEE_APP_DIR/graphify-out/graph.json ==="
echo "Try:  graphify query \"which routes touch the alerts model?\" --graph $BEE_APP_DIR/graphify-out/graph.json"
echo "Next: scripts/serve-mcp.sh to share this graph with Alfred + Hermes"
