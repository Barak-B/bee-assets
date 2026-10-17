// tools/customers.js — :Customer-related MCP tools
//
// All tools follow the {name, description, inputSchema, handler(ctx, args)} contract.
// Handler returns either a string or JSON-serializable object.

export const customerTools = [
  {
    name: "bee.listCustomers",
    description:
      "List all BEE customers. Filterable by SLA tier or portal access. Returns up to 200 results.",
    inputSchema: {
      type: "object",
      properties: {
        sla_tier: { type: "string", description: "Filter: tier_1 | tier_2 | tier_3" },
        portal_only: { type: "boolean", description: "Only customers with portal access" },
        search: { type: "string", description: "Substring match on name_he" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams();
      if (args.sla_tier) params.set("sla_tier", args.sla_tier);
      if (args.portal_only) params.set("portal_only", "true");
      if (args.search) params.set("q", args.search);
      params.set("limit", String(args.limit ?? 50));
      return ctx.fetch(`/customers?${params}`);
    },
  },

  {
    name: "bee.getCustomer",
    description:
      "Get full customer record including sites, projects, recent alerts, contact history.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Customer ID" },
      },
      required: ["id"],
    },
    handler: async (ctx, args) => ctx.fetch(`/customers/${encodeURIComponent(args.id)}`),
  },

  {
    name: "bee.updateCustomerHealthScore",
    description:
      "Update customer health score (0-100) computed by customer-success-agent. " +
      "Writes back to BEE app (Q78 paradigm). Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        score: { type: "number", minimum: 0, maximum: 100 },
        reason: { type: "string", description: "Why score changed (audit log)" },
        calculated_at: { type: "string", description: "ISO timestamp" },
      },
      required: ["id", "score", "reason"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/customers/${encodeURIComponent(args.id)}/health`, {
        method: "PATCH",
        body: JSON.stringify({
          score: args.score,
          reason: args.reason,
          calculated_at: args.calculated_at || new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.appendCustomerNote",
    description:
      "Append a note to the customer record (e.g., outcome of a call, complaint resolution). " +
      "Visible in BEE app portal if customer has portal access.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        note: { type: "string" },
        source: {
          type: "string",
          enum: ["wa", "call", "email", "manual", "agent"],
        },
        author_id: { type: "string", description: "barak or agent id" },
        visible_in_portal: { type: "boolean", default: false },
      },
      required: ["id", "note", "source"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/customers/${encodeURIComponent(args.id)}/notes`, {
        method: "POST",
        body: JSON.stringify({
          note: args.note,
          source: args.source,
          author_id: args.author_id || "agent",
          visible_in_portal: args.visible_in_portal ?? false,
          created_at: new Date().toISOString(),
        }),
      }),
  },
];
