#!/usr/bin/env bash
# smoke-test.sh — Post-deploy verification (curl + tool calls).
#
# Run on: bee-prod-1 OR Barak's PC (if SSH-stdio MCP reachable via Tailscale)
# Pre-req: All previous steps done; configs applied to Alfred + Hermes
# Expected: ~5 min, all green checks

set -uo pipefail   # not -e — we want to run all checks even if one fails

LOG="/tmp/gitnexus-smoke-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"
  local cmd="$2"
  echo -n "  [$label] "
  if eval "$cmd" >/dev/null 2>&1; then
    echo "✓ PASS"
    PASS=$((PASS+1))
  else
    echo "✗ FAIL"
    FAIL=$((FAIL+1))
  fi
}

warn() {
  local msg="$1"
  echo "  [WARN] $msg"
  WARN=$((WARN+1))
}

echo "=== GitNexus smoke test starting $(date -Iseconds) ==="
echo ""

# ===== 1. Binary + version =====
echo "1. Binary checks"
check "gitnexus in PATH"           "command -v gitnexus"
check "gitnexus --version works"   "gitnexus --version"
check "gitnexus list works"         "gitnexus list"

# ===== 2. Source pinned + sanitized =====
echo ""
echo "2. Source integrity"
GITNEXUS_DIR="${GITNEXUS_DIR:-/opt/gitnexus-source}"
check "Source dir exists"           "[ -d $GITNEXUS_DIR ]"
check "On bee-internal branch"      "cd $GITNEXUS_DIR && [ \"\$(git rev-parse --abbrev-ref HEAD)\" = bee-internal ]"
check "Pinned SHA recorded"         "[ -f $GITNEXUS_DIR/.bee-pinned-sha ]"
check "@scarf/scarf removed"        "! grep -q '@scarf/scarf' $GITNEXUS_DIR/package.json $GITNEXUS_DIR/gitnexus/package.json"
check "node_modules has no scarf"   "! [ -d $GITNEXUS_DIR/node_modules/@scarf ] && ! [ -d $GITNEXUS_DIR/gitnexus/node_modules/@scarf ]"

# ===== 3. Permissions =====
echo ""
echo "3. Permissions hardening"
HOME_GN_PERMS=$(stat -c %a "$HOME/.gitnexus" 2>/dev/null || echo "missing")
if [ "$HOME_GN_PERMS" = "700" ]; then
  echo "  [.gitnexus = 700] ✓ PASS"
  PASS=$((PASS+1))
else
  echo "  [.gitnexus = 700] ✗ FAIL (got $HOME_GN_PERMS)"
  FAIL=$((FAIL+1))
fi

# ===== 4. Index exists =====
echo ""
echo "4. BEE app indexed"
BEE_APP_DIR="${BEE_APP_DIR:-/opt/bee-ops}"
check "BEE .gitnexus exists"        "[ -d $BEE_APP_DIR/.gitnexus ]"
check "meta.json present"           "[ -f $BEE_APP_DIR/.gitnexus/meta.json ]"

# ===== 5. UNDERSTAND_QUICKLY_TOKEN not set =====
echo ""
echo "5. Telemetry env vars"
if [ -n "${UNDERSTAND_QUICKLY_TOKEN:-}" ]; then
  echo "  [UNDERSTAND_QUICKLY_TOKEN] ✗ FAIL — set in env! Unset before continuing."
  FAIL=$((FAIL+1))
else
  echo "  [UNDERSTAND_QUICKLY_TOKEN] ✓ PASS (not set)"
  PASS=$((PASS+1))
fi

# ===== 6. MCP server starts (smoke) =====
echo ""
echo "6. MCP server starts"
MCP_OUT=$(timeout 3 gitnexus mcp </dev/null 2>&1 || true)
if echo "$MCP_OUT" | grep -qi 'mcp.*ready\|listening\|connected\|stdio'; then
  echo "  [MCP boots] ✓ PASS"
  PASS=$((PASS+1))
else
  echo "  [MCP boots] ⚠️  unclear — check manually:"
  echo "  $MCP_OUT" | head -5 | sed 's/^/    /'
  WARN=$((WARN+1))
fi

# ===== 7. Tool calls via MCP (JSON-RPC over stdio) =====
echo ""
echo "7. MCP tool calls (JSON-RPC handshake)"
# Send initialize + listTools, check we get tool definitions back
MCP_RESPONSE=$(
  printf '%s\n%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0"}}}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | timeout 10 gitnexus mcp 2>/dev/null
)

if echo "$MCP_RESPONSE" | grep -q '"name":"list_repos"'; then
  echo "  [list_repos tool exposed] ✓ PASS"
  PASS=$((PASS+1))
else
  echo "  [list_repos tool exposed] ✗ FAIL"
  FAIL=$((FAIL+1))
fi

if echo "$MCP_RESPONSE" | grep -q '"name":"query"'; then
  echo "  [query tool exposed] ✓ PASS"
  PASS=$((PASS+1))
fi

if echo "$MCP_RESPONSE" | grep -q '"name":"impact"'; then
  echo "  [impact tool exposed] ✓ PASS"
  PASS=$((PASS+1))
fi

# Check rename IS present at server (we'll filter at client level via allowed_tools)
if echo "$MCP_RESPONSE" | grep -q '"name":"rename"'; then
  warn "rename tool present at MCP server level — ensure Alfred/Hermes filter it out via allowed_tools (audit §3.1)"
fi

# ===== 8. Network egress regression check =====
echo ""
echo "8. Network egress (quick sample)"
if command -v ss >/dev/null 2>&1; then
  # Spawn a quick MCP session in background, check open sockets, kill
  timeout 3 gitnexus mcp </dev/null >/dev/null 2>&1 &
  GN_PID=$!
  sleep 1
  if [ -n "$GN_PID" ] && kill -0 $GN_PID 2>/dev/null; then
    EXT_CONNS=$(ss -tnp 2>/dev/null | grep "pid=$GN_PID" | grep -vE '127\.0\.0\.1|\[::1\]' | head -5 || true)
    if [ -z "$EXT_CONNS" ]; then
      echo "  [no external sockets] ✓ PASS"
      PASS=$((PASS+1))
    else
      echo "  [external sockets detected] ✗ FAIL:"
      echo "$EXT_CONNS" | sed 's/^/    /'
      FAIL=$((FAIL+1))
    fi
    kill $GN_PID 2>/dev/null || true
  fi
else
  warn "ss command not available — skip socket check"
fi

# ===== Summary =====
echo ""
echo "============================================"
echo "SMOKE TEST SUMMARY"
echo "  PASS:  $PASS"
echo "  FAIL:  $FAIL"
echo "  WARN:  $WARN"
echo "============================================"
echo "Log: $LOG"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ Deployment looks good. Next: run for a day, monitor logs, then start using"
  echo "   gitnexus tools from Alfred + Hermes sessions."
  exit 0
else
  echo "❌ Failures detected. Review log + fix before promoting to production use."
  echo "   If unsure: bash scripts/rollback.sh and start over."
  exit 1
fi
