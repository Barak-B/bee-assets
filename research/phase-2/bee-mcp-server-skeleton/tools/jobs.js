// tools/jobs.js — :Job-related MCP tools
// Jobs = units of work within a project (e.g., "install inverter", "inspect panels").

export const jobTools = [
  {
    name: "bee.listJobs",
    description:
      "List jobs filtered by status, assignee, project, site. 1,425 open total per MEMORY.md.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "scheduled", "in-progress", "blocked", "done", "cancelled"],
        },
        assigned_to: { type: "string", description: "Person ID" },
        project_id: { type: "string" },
        site_id: { type: "string" },
        type: {
          type: "string",
          description:
            "install | inspect | repair | maintenance | site-visit | quote-prep",
        },
        scheduled_after: { type: "string", description: "ISO date" },
        scheduled_before: { type: "string", description: "ISO date" },
        limit: { type: "number", default: 50 },
      },
    },
    handler: async (ctx, args) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params.set(k, String(v));
      }
      return ctx.fetch(`/jobs?${params}`);
    },
  },

  {
    name: "bee.getJob",
    description: "Get full job record with assignee, project, site context, history.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (ctx, args) => ctx.fetch(`/jobs/${encodeURIComponent(args.id)}`),
  },

  {
    name: "bee.createJob",
    description:
      "Create new job. Often triggered by field-dispatch-agent or engineering-agent.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        site_id: { type: "string" },
        type: { type: "string" },
        title_he: { type: "string" },
        description: { type: "string" },
        assigned_to: { type: "string", description: "Person ID — leave null for unassigned" },
        scheduled_for: { type: "string", description: "ISO datetime" },
        estimated_hours: { type: "number" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
      },
      required: ["project_id", "site_id", "type", "title_he"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/jobs`, {
        method: "POST",
        body: JSON.stringify({
          ...args,
          status: "pending",
          created_at: new Date().toISOString(),
          created_by: "agent",
        }),
      }),
  },

  {
    name: "bee.assignJob",
    description:
      "Assign or reassign job to a Person. Field-dispatch-agent uses this for daily optimization.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        person_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["id", "person_id"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/jobs/${encodeURIComponent(args.id)}/assign`, {
        method: "PATCH",
        body: JSON.stringify({
          person_id: args.person_id,
          reason: args.reason || "agent reassignment",
          assigned_at: new Date().toISOString(),
        }),
      }),
  },

  {
    name: "bee.updateJobStatus",
    description:
      "Promote job status (pending → scheduled → in-progress → done). " +
      "On done: triggers downstream — site dossier update, parent project check, " +
      "customer notification if SLA-relevant.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        new_status: { type: "string" },
        reason: { type: "string" },
        completion_notes: { type: "string", description: "Required if new_status = done" },
        photos: {
          type: "array",
          items: { type: "string" },
          description: "URLs of completion photos (avoids missing-photo truck rolls — v11 8.D)",
        },
      },
      required: ["id", "new_status"],
    },
    handler: async (ctx, args) =>
      ctx.fetch(`/jobs/${encodeURIComponent(args.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          ...args,
          changed_at: new Date().toISOString(),
        }),
      }),
  },
];
