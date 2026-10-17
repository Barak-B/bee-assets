#!/usr/bin/env bash
# verify-network-egress.sh — Confirm GitNexus claim of "no network" at runtime.
#
# Per gitnexus-audit.md §4.5 + §3.4.
# Run on: bee-prod-1 (one-time after deploy, repeat after each version upgrade)
# Expected: ~5 min. Findings written to /tmp/gitnexus-egress-*.log.
#
# What this does:
#   1. Creates a throwaway test repo (tiny, known-clean)
#   2. Runs `gitnexus analyze` under strace -e network → captures syscalls
#   3. Runs MCP server briefly under strace
#   4. Greps trace for non-local network addresses (anything outside 127.0.0.1 + AF_UNIX)
#   5. Reports findings
#
# Pass criteria: ZERO external IPs in the trace (only AF_UNIX, 127.0.0.1, ::1).
# Fail action: investigate (read trace), report to vendor, hold deploy.

set -euo pipefail

LOG_DIR="/tmp/gitnexus-egress"
mkdir -p "$LOG_DIR"

# ===== Pre-flight =====
command -v strace >/dev/null || {
  echo "❌ strace not installed — sudo apt install strace (or yum install strace)"
  exit 1
}
command -v gitnexus >/dev/null || {
  echo "❌ gitnexus not in PATH — run deploy.sh first"
  exit 1
}

# ===== Step 1: Create throwaway test repo =====
TEST_REPO="$LOG_DIR/test-repo"
rm -rf "$TEST_REPO"
mkdir -p "$TEST_REPO"
cd "$TEST_REPO"

cat > hello.js <<'EOF'
function greet(name) { return `Hello, ${name}`; }
function farewell(name) { return `Bye, ${name}`; }
module.exports = { greet, farewell };
EOF

cat > package.json <<'EOF'
{ "name": "egress-test", "version": "0.0.1" }
EOF

git init -q
git add -A
git -c user.email=test@local -c user.name=test commit -q -m "init"

# ===== Step 2: Run analyze under strace =====
echo "[1/3] Running 'gitnexus analyze' under strace…"
ANALYZE_TRACE="$LOG_DIR/analyze.strace"
strace -f -e trace=network -o "$ANALYZE_TRACE" gitnexus analyze . 2>&1 | tail -10

# ===== Step 3: Briefly run MCP under strace =====
echo "[2/3] Running 'gitnexus mcp' under strace for 10s…"
MCP_TRACE="$LOG_DIR/mcp.strace"
strace -f -e trace=network -o "$MCP_TRACE" timeout 10 gitnexus mcp </dev/null >/dev/null 2>&1 || true

# ===== Step 4: Analyze the traces =====
echo "[3/3] Inspecting traces for external network calls…"

# Filter out known-OK lines:
#  - AF_UNIX (Unix domain sockets, fine)
#  - connect to 127.0.0.1 / ::1 (loopback)
#  - sin_addr=htonl(INADDR_LOOPBACK) etc.
FILTER='AF_UNIX|sin_addr.*127\.0\.0\.1|sin6_addr.*::1|inet_addr\("127\.|inet_pton\(AF_INET6, "::1"|inet_pton\(AF_INET, "127\.|netlink|AF_NETLINK|sun_path|bind\(.*AF_UNIX'

EXT_ANALYZE=$(grep -E 'connect\(|sendto\(' "$ANALYZE_TRACE" | grep -vE "$FILTER" | head -50 || true)
EXT_MCP=$(grep -E 'connect\(|sendto\(' "$MCP_TRACE" | grep -vE "$FILTER" | head -50 || true)

EXIT_CODE=0

echo ""
echo "=== ANALYZE TRACE FINDINGS ==="
if [ -n "$EXT_ANALYZE" ]; then
  echo "⚠️  EXTERNAL NETWORK ACTIVITY DETECTED during analyze:"
  echo "$EXT_ANALYZE"
  EXIT_CODE=2
else
  echo "✓ No external network calls during 'gitnexus analyze'"
fi

echo ""
echo "=== MCP TRACE FINDINGS ==="
if [ -n "$EXT_MCP" ]; then
  echo "⚠️  EXTERNAL NETWORK ACTIVITY DETECTED during MCP serve:"
  echo "$EXT_MCP"
  EXIT_CODE=3
else
  echo "✓ No external network calls during 'gitnexus mcp' (10s sample)"
fi

# ===== Step 5: Compare against expected (zero) =====
echo ""
echo "=== VERDICT ==="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ PASS — 'everything local, no network' claim VERIFIED for this version."
  echo "   Re-run this script after each version upgrade."
else
  echo "❌ FAIL — external network activity found. DO NOT promote to bee-prod-1 yet."
  echo ""
  echo "Investigation steps:"
  echo "  1. Inspect full traces:"
  echo "     less $ANALYZE_TRACE"
  echo "     less $MCP_TRACE"
  echo "  2. Identify which dep/code does the egress (gitnexus source vs node_modules)"
  echo "  3. Check if it's UNDERSTAND_QUICKLY_TOKEN (then unset it)"
  echo "  4. Check if it's still @scarf/scarf somehow (re-run prepare-fork.sh)"
  echo "  5. If genuinely a new vendor egress — report to abhigyanpatwari/GitNexus"
fi

echo ""
echo "Logs: $LOG_DIR/"
exit $EXIT_CODE
