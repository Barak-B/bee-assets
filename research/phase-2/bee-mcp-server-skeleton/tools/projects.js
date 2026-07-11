// tools/projects.js — :Project-related MCP tools
// Per v17 14.C.1 / 14.A.5: BEE 3-entity model has Project between Customer and Site.

export const projectTools = [
  {
    name: "bee.listProjects",
    description:
      "List projects. Filterable by customer, site, status, value range.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        site_id: { type: "string" },
        status: {
          type: "string",
          enum: ["quoted", "negotiating", "won", "in-progress", "completed", "cancelled", "lost"],
        },
        min_value_nis: { type: "number" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return ctx.fetch(`/projects?${params}`);
    },
  },

  {
    name: "bee.getProject",
    description:
      "Get full project record: customer, site, jobs, equipment, BOM, design specs, " +
      "production forecast, financials, milestones.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, args) => ctx.fetch(`/projects/${encodeURIComponent(args.id)}`),
  },

  {
    name: "bee.createProject",
    description:
      "Create new project — triggered by quote acceptance or tender win. " +
      "Auto-creates the link Customer→Project→Site.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        site_id: { type: "string", description: "If new site, create it first via bee.createSite" },
        name_he: { type: "string" },
        type: {
          type: "string",
          enum: ["new-install", "expansion", "repair", "maintenance-contract"],
        },
        estimated_capacity_kwp: { type: "number" },
        contract_value_nis: { type: "number" },
        target_start_date: { type: "string", description: "ISO date" },
        source: {
          type: "string",
          enum: ["lead", "tender", "referral", "repeat-customer", "manual"],
          description: "Where did this project originate",
        },
        source_ref_id: {
          type: "string",
          description: "Lead ID, tender ID, etc. for traceability",
        },
      },
      required: ["customer_id", "site_id", "name_he", "type", "source"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/projects`, {
        method: "POST",
        body: JSON.stringify({
          ...args,
          created_by: "agent",
          status: "won",
          created_at: new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.updateProjectStatus",
    description:
      "Update project status (won → in-progress → completed, etc.). " +
      "Triggered by job completion or milestone events.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        new_status: { type: "string" },
        reason: { type: "string" },
      },
      required: ["id", "new_status", "reason"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/projects/${encodeURIComponent(args.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify(args),
      }),
  },

  {
    name: "bee.attachDesignSpec",
    description:
      "Attach engineering design spec (from engineering-agent v16 13.A pv_design_calc + " +
      "wire_sizing + protection_coordination outputs) to project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID" },
        design_spec: {
          type: "object",
          description:
            "Structured: { string_config, wire_sizing, protection, panel_count, inverter_model, ... }",
        },
        agent_version: {
          type: "string",
          description: "engineering-agent version that generated this",
        },
      },
      required: ["id", "design_spec"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/projects/${encodeURIComponent(args.id)}/design`, {
        method: "PUT",
        body: JSON.stringify({
          design_spec: args.design_spec,
          agent_version: args.agent_version || "engineering-agent/0.1.0",
          generated_at: new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.attachBom",
    description:
      "Attach BOM (bill of materials) to project. From bom_generator sub-skill.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        bom: {
          type: "array",
          description:
            "[{part_number, brand, qty, unit_price_nis, total_nis, supplier_id}, ...]",
        },
        total_cost_nis: { type: "number" },
        quoted_price_nis: { type: "number" },
        xlsx_url: { type: "string", description: "Link to generated xlsx in Drive/storage" },
      },
      required: ["id", "bom"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/projects/${encodeURIComponent(args.id)}/bom`, {
        method: "PUT",
        body: JSON.stringify(args),
      }),
  },
];
