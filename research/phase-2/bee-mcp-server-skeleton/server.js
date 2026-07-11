// bee-mcp-server / server.js — Phase 2 Action #15
//
// MCP server that exposes BEE Operations app as MCP tools to Alfred + Hermes.
// Per v19 Q78 paradigm: agents read context + write outputs back to BEE app.
//
// HOST: bee-prod-1 (same VPS as the BEE app, internal-only over Tailscale)
// AUTH: JWT from BEE app SQLite (extracted to ~/.openclaw/secrets/bee-integrations.env)
//
// REGISTER IN ALFRED:
//   ~/.openclaw/openclaw.json (or workspace mcp config):
//   {
//     "mcpServers": {
//       "bee": {
//         "type": "http",
//         "url": "http://bee-prod-1:18791/mcp"
//       }
//     }
//   }
//
// REGISTER IN HERMES:
//   hermes mcp add bee http://bee-prod-1:18791/mcp
//
// SECURITY: only accessible via Tailscale (Tailscale subnet routes -> bee-prod-1)
// HARDENING: bind to 100.x.y.z (Tailscale IP), not 0.0.0.0

import { config as loadEnv } from "dotenv";
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { customerTools } from "./tools/customers.js";
import { siteTools } from "./tools/sites.js";
import { projectTools } from "./tools/projects.js";
import { jobTools } from "./tools/jobs.js";
import { alertTools } from "./tools/alerts.js";

loadEnv({ path: process.env.BEE_ENV_PATH || "~/.openclaw/secrets/bee-integrations.env" });

const BEE_API_BASE = process.env.BEE_API_BASE || "http://localhost:3001/api";
const BEE_JWT = process.env.BEE_JWT;
const PORT = parseInt(process.env.BEE_MCP_PORT || "18791", 10);
const BIND_ADDR = process.env.BEE_MCP_BIND || "127.0.0.1";

if (!BEE_JWT) {
  console.error("BEE_JWT missing in env. Extract from bee-integrations.env.");
  process.exit(1);
}

// ===== Shared context for tools =====
export const ctx = {
  apiBase: BEE_API_BASE,
  jwt: BEE_JWT,
  /**
   * Fetch wrapper with auth headers.
   * @param {string} path - relative to apiBase
   * @param {RequestInit} opts
   */
  async fetch(path, opts = {}) {
    const url = `${BEE_API_BASE}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Authorization": `Bearer ${BEE_JWT}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...opts.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`BEE API ${path}: ${res.status} ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },
};

// ===== Aggregate all tools =====
const allTools = [
  ...customerTools,
  ...siteTools,
  ...projectTools,
  ...jobTools,
  ...alertTools,
];

const toolMap = Object.fromEntries(allTools.map((t) => [t.name, t]));

// ===== MCP server setup =====
const server = new Server(
  { name: "bee-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap[name];
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(ctx, args || {});
    return {
      content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    console.error(`[${name}] ${e.message}`);
    return {
      content: [{ type: "text", text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

// ===== HTTP transport =====
const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
await server.connect(transport);

const httpServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tools: allTools.length, uptime: process.uptime() }));
    return;
  }
  if (req.url?.startsWith("/mcp")) {
    return transport.handleRequest(req, res);
  }
  res.writeHead(404);
  res.end();
});

httpServer.listen(PORT, BIND_ADDR, () => {
  console.log(`bee-mcp-server listening on http://${BIND_ADDR}:${PORT}/mcp`);
  console.log(`Tools registered: ${allTools.length}`);
  for (const t of allTools) console.log(`  - ${t.name}`);
});

// ===== Graceful shutdown =====
function shutdown() {
  console.log("Shutting down…");
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
