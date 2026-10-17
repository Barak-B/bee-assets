#!/usr/bin/env bash
# smoke-test.sh — post-deploy verification for graphify (all 3 stages)
# Run anywhere graphify is installed. Non-fatal: runs all checks, reports summary.

set -uo pipefail
PASS=0; FAIL=0; SKIP=0

check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "  [$label] PASS"; PASS=$((PASS+1));
  else echo "  [$label] FAIL"; FAIL=$((FAIL+1)); fi
}

GRAPH="${GRAPH_PATH:-/opt/bee-ops/graphify-out/graph.json}"
MCP_URL="${MCP_URL:-}"          # e.g. http://100.x.y.z:8090/mcp
API_KEY="${GRAPHIFY_API_KEY:-}"

echo "=== Graphify smoke test $(date -Iseconds) ==="

echo "1. Binary"
check "graphify on PATH"   command -v graphify
check "version works"      graphify --version

echo "2. Graph artifacts"
if [ -f "$GRAPH" ]; then
  check "graph.json exists"     test -f "$GRAPH"
  check "graph.json is JSON"    python3 -c "import json;json.load(open('$GRAPH'))"
  check "report exists"         test -f "$(dirname "$GRAPH")/GRAPH_REPORT.md"
  echo "  nodes/edges: $(python3 -c "import json;g=json.load(open('$GRAPH'));print(len(g.get('nodes',[])),'/',len(g.get('links',g.get('edges',[]))))" 2>/dev/null || echo '?')"
else
  echo "  [graph at $GRAPH] SKIP (set GRAPH_PATH)"; SKIP=$((SKIP+1))
fi

echo "3. Query round-trip"
if [ -f "$GRAPH" ]; then
  check "query returns nodes"  bash -c "graphify query 'main entry points' --graph '$GRAPH' | grep -q NODE"
else
  echo "  SKIP"; SKIP=$((SKIP+1))
fi

echo "4. MCP HTTP server (if deployed)"
if [ -n "$MCP_URL" ]; then
  check "rejects no-auth"  bash -c "curl -s -o /dev/null -w '%{http_code}' '$MCP_URL' | grep -qE '401|403'"
  if [ -n "$API_KEY" ]; then
    check "accepts Bearer"  bash -c "curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer $API_KEY' -H 'Accept: application/json, text/event-stream' '$MCP_URL' | grep -qE '200|400|406'"
  fi
  check "loopback NOT 0.0.0.0"  bash -c "! (ss -tlnp 2>/dev/null | grep -E \"0\\.0\\.0\\.0:$(echo $MCP_URL | grep -oE ':[0-9]+' | tr -d ':')\" )"
else
  echo "  SKIP (set MCP_URL + GRAPHIFY_API_KEY)"; SKIP=$((SKIP+1))
fi

echo "5. Privacy"
if [ "${GRAPHIFY_QUERY_LOG_DISABLE:-}" = "1" ] || [ ! -s "$HOME/.cache/graphify-queries.log" ]; then
  echo "  [query log disabled/empty] PASS"; PASS=$((PASS+1))
else
  echo "  [query log active at ~/.cache/graphify-queries.log] WARN — set GRAPHIFY_QUERY_LOG_DISABLE=1 on prod"
fi

echo ""
echo "=== PASS:$PASS FAIL:$FAIL SKIP:$SKIP ==="
[ $FAIL -eq 0 ] && echo "OK" || { echo "Failures — review above"; exit 1; }
