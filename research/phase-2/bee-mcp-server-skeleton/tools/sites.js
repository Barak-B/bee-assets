// tools/sites.js — :Site-related MCP tools

export const siteTools = [
  {
    name: "bee.listSites",
    description:
      "List BEE sites. Filterable by customer, city, status. Up to 200 results.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        city: { type: "string" },
        status: { type: "string", description: "active | maintenance | inactive" },
        capacity_min_kwp: { type: "number" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      return ctx.fetch(`/sites?${params}`);
    },
  },

  {
    name: "bee.getSite",
    description:
      "Get full site record including equipment list, recent alerts, production history, " +
      "linked project, current job status, photos, dossier link.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, args) => ctx.fetch(`/sites/${encodeURIComponent(args.id)}`),
  },

  {
    name: "bee.updateSiteStatus",
    description:
      "Promote site status (e.g., installing → installed → operational). " +
      "Triggered by engineering-agent or field-dispatch-agent on completion events.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        new_status: {
          type: "string",
          enum: ["planning", "installing", "installed", "operational", "maintenance", "decommissioned"],
        },
        reason: { type: "string" },
        agent_id: { type: "string" },
      },
      required: ["id", "new_status", "reason"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/sites/${encodeURIComponent(args.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          new_status: args.new_status,
          reason: args.reason,
          agent_id: args.agent_id || "system",
          changed_at: new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.appendSiteEvent",
    description:
      "Append an event row to site dossier (Hebrew table format per AGENTS.md L437). " +
      "Triggered by alfred-handle.js when a message arrives in a mapped site group.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        event: { type: "string", description: "Free-text event description (Hebrew)" },
        event_type: {
          type: "string",
          enum: ["status-update", "fault", "fix", "site-visit", "delivery", "inspection", "other"],
        },
        source: {
          type: "string",
          enum: ["wa", "call", "email", "manual", "alert"],
        },
        ts: { type: "string", description: "ISO timestamp" },
      },
      required: ["id", "event", "event_type", "source"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/sites/${encodeURIComponent(args.id)}/events`, {
        method: "POST",
        body: JSON.stringify({
          event: args.event,
          event_type: args.event_type,
          source: args.source,
          ts: args.ts || new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.getSiteProduction",
    description:
      "Get production data for a site over a window. Used by customer-success-agent for QBR " +
      "+ engineering-agent for fault analysis.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        window: { type: "string", description: "30d | 90d | 365d", default: "30d" },
        granularity: { type: "string", description: "hour | day | month", default: "day" },
      },
      required: ["id"],
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams({
        window: args.window || "30d",
        granularity: args.granularity || "day",
      });
      return ctx.fetch(`/sites/${encodeURIComponent(args.id)}/production?${params}`);
    },
  },
];
