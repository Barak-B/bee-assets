// tools/alerts.js — :Alert-related MCP tools
// 461 active alerts per MEMORY.md. SolarEdge / Sungrow / SMA inverter events stream in.

export const alertTools = [
  {
    name: "bee.listAlerts",
    description:
      "List active alerts. Filterable by site, severity, type, age.",
    inputSchema: {
      type: "object",
      properties: {
        site_id: { type: "string" },
        customer_id: { type: "string" },
        severity: {
          type: "string",
          enum: ["critical", "high", "medium", "low", "info"],
        },
        type: {
          type: "string",
          description:
            "inverter-fault | low-production | comm-loss | weather-event | maintenance-due | warranty-expiry",
        },
        status: { type: "string", enum: ["open", "acknowledged", "resolved"] },
        max_age_hours: { type: "number" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return ctx.fetch(`/alerts?${params}`);
    },
  },

  {
    name: "bee.getAlert",
    description: "Get full alert record with site, equipment, diagnosis history.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, args) => ctx.fetch(`/alerts/${encodeURIComponent(args.id)}`),
  },

  {
    name: "bee.diagnoseAlert",
    description:
      "Attach AI diagnosis to alert (from engineering-agent fault_analysis sub-skill). " +
      "Writes back to BEE app per Q78 paradigm.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        probable_causes: {
          type: "array",
          items: { type: "string" },
          description: "Ranked list of probable causes",
        },
        recommended_actions: {
          type: "array",
          items: { type: "string" },
        },
        parts_needed: {
          type: "array",
          description: "BOM if replacement required",
        },
        urgency: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
        },
        estimated_repair_hours: { type: "number" },
        agent_id: { type: "string" },
      },
      required: ["id", "probable_causes", "urgency"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/alerts/${encodeURIComponent(args.id)}/diagnosis`, {
        method: "PUT",
        body: JSON.stringify({
          ...args,
          diagnosed_at: new Date().toISOString(),
          agent_id: args.agent_id || "engineering-agent/0.1.0",
        }),
      }),
  },

  {
    name: "bee.acknowledgeAlert",
    description: "Mark alert as acknowledged (Barak saw it, not yet resolved).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        ack_by: { type: "string", description: "Person ID" },
      },
      required: ["id"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/alerts/${encodeURIComponent(args.id)}/ack`, {
        method: "POST",
        body: JSON.stringify({
          ack_by: args.ack_by || "barak",
          ack_at: new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.resolveAlert",
    description: "Close alert with resolution notes. Often paired with job completion.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        resolution: { type: "string" },
        related_job_id: { type: "string" },
      },
      required: ["id", "resolution"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/alerts/${encodeURIComponent(args.id)}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          resolution: args.resolution,
          related_job_id: args.related_job_id || null,
          resolved_at: new Date().toISOString(),
        }),
      }),
  },
];
