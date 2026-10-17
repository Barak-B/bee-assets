#!/usr/bin/env bash
# serve-mcp.sh — Stage 3: shared graphify MCP server on bee-prod-1 (HTTP + API key, Tailscale-bound)
#
# Serves graph.json over MCP Streamable HTTP so Alfred + Hermes + Claude Code
# all query ONE graph without local graphify installs.
#
# Security: binds the Tailscale IP only (not 0.0.0.0), requires Bearer API key.

set -euo pipefail

GRAPH_PATH="${GRAPH_PATH:-/opt/bee-ops/graphify-out/graph.json}"
PORT="${PORT:-8090}"

[ -f "$GRAPH_PATH" ] || { echo "ERROR: $GRAPH_PATH not found — run index-bee-app.sh first"; exit 1; }

# --- Tailscale IP (fallback to loopback) ---
TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
BIND_HOST="${TS_IP:-127.0.0.1}"
echo "Binding to: $BIND_HOST:$PORT"

# --- API key (generate once, persist) ---
KEY_FILE="/etc/graphify-mcp.key"
if [ ! -f "$KEY_FILE" ]; then
  openssl rand -hex 24 | sudo tee "$KEY_FILE" >/dev/null
  sudo chmod 600 "$KEY_FILE"
  echo "Generated API key at $KEY_FILE"
fi
API_KEY=$(sudo cat "$KEY_FILE")

# --- install systemd unit ---
sudo tee /etc/systemd/system/graphify-mcp.service >/dev/null <<EOF
[Unit]
Description=Graphify MCP server (BEE knowledge graph)
After=network-online.target tailscaled.service

[Service]
Type=simple
User=$(whoami)
Environment=GRAPHIFY_API_KEY=$API_KEY
Environment=GRAPHIFY_QUERY_LOG_DISABLE=1
ExecStart=$(command -v python3) -m graphify.serve $GRAPH_PATH --transport http --host $BIND_HOST --port $PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now graphify-mcp
sleep 2
sudo systemctl --no-pager status graphify-mcp | head -8

echo ""
echo "=== MCP server up at http://$BIND_HOST:$PORT/mcp ==="
echo "API key: $KEY_FILE (use as Authorization: Bearer <key>)"
echo ""
echo "Register clients with configs/alfred-openclaw.snippet.json + configs/hermes-mcp.snippet.yaml"
echo "(replace <TAILSCALE_IP>, <PORT>, <API_KEY> placeholders)"
