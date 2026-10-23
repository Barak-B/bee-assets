#!/usr/bin/env node
// alfred-enrich.js — Per-intent context-fetch orchestrator.
//
// Given { intent, entityHints, sender }, fan out to the relevant data sources in
// parallel and return a single enriched bundle that the Composer feeds into a template.
//
// The fetch plan is INTENT-SPECIFIC so we don't waste API quota / latency:
//   client-status      → BEE: client → sites → projects → jobs · Calendar upcoming · sites/<X>.md
//   client-fault       → BEE: client → site → inverters · monitoring/site/:id/live · open alerts
//   client-quote       → BEE: client (history) · pricebook · similar past quotes
//   client-payment     → BEE: client → invoices · ledger
//   vendor             → BEE: connections · last invoices from this vendor
//   regulatory         → just stash sender + topic; fetch sites mentioned
//   internal-task      → no BEE fetch; calendar today + ideas drawer
//   internal-idea      → ideas drawer
//   internal-meeting   → calendar (read-only) — propose times
//   noise              → no fetch
//
// Returns: { intent, fetchedAt, sources: {...}, errors: {...}, ttfbMs, totalMs }

const path = require("path");
const bee = require("./alfred-bee");

// Memory-graph recall (Task #70) — optional; injects prior local KG context per client/site.
let memgraph = null;
try { memgraph = require("./alfred-memory-graph"); } catch (e) { /* optional */ }

async function withTimeout(p, ms, label) {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`timeout ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer);
  }
}

async function safe(label, fn, errors) {
  try {
    return await withTimeout(fn(), 8000, label);
  } catch (e) {
    errors[label] = String(e.message || e);
    return null;
  }
}

// Try to resolve a client by name OR phone OR free-text hint
async function resolveClient(hints, errors) {
  const q = hints.clientName || hints.address || hints.phone;
  if (!q) return null;
  const list = await safe("clients", () => bee.clients({ q, limit: 5 }), errors);
  if (!list) return null;
  const arr = Array.isArray(list) ? list : list.items || [];
  return arr[0] || null;
}

async function resolveSite(client, hints, errors) {
  if (!client && !hints.siteName) return null;
  if (client) {
    const list = await safe("sites", () => bee.sites({ clientId: client.id }), errors);
    const arr = Array.isArray(list) ? list : list?.items || [];
    if (hints.siteName) {
      const match = arr.find((s) => (s.name || "").includes(hints.siteName));
      if (match) return match;
    }
    return arr[0] || null;
  }
  const list = await safe("sites", () => bee.sites({ q: hints.siteName }), errors);
  const arr = Array.isArray(list) ? list : list?.items || [];
  return arr[0] || null;
}

const PLANS = {
  "client-status": async ({ entityHints }, errors) => {
    const client = await resolveClient(entityHints, errors);
    const site = await resolveSite(client, entityHints, errors);
    const [projects, jobs] = await Promise.all([
      client ? safe("projects", () => bee.projects({ clientId: client.id }), errors) : null,
      site ? safe("jobs", () => bee.jobs({ siteId: site.id }), errors) : null,
    ]);
    return { client, site, projects, jobs };
  },
  "client-fault": async ({ entityHints }, errors) => {
    const client = await resolveClient(entityHints, errors);
    const site = await resolveSite(client, entityHints, errors);
    const [live, alerts] = await Promise.all([
      site ? safe("monitoring", () => bee.monitoringSite(site.id), errors) : null,
      safe("alerts", () => bee.alerts({ open: true }), errors),
    ]);
    const siteAlerts = site && Array.isArray(alerts)
      ? alerts.filter((a) => a.siteId === site.id || a.inverter?.siteId === site.id)
      : [];
    return { client, site, live, openAlerts: siteAlerts };
  },
  "client-quote": async ({ entityHints }, errors) => {
    const client = await resolveClient(entityHints, errors);
    return { client, hint: "Pricebook fetch + similar-quote search not yet wired" };
  },
  "client-payment": async ({ entityHints }, errors) => {
    const client = await resolveClient(entityHints, errors);
    return { client, hint: "Invoice/ledger fetch not yet wired — needs /api/ledger validation" };
  },
  vendor: async ({ entityHints }, errors) => {
    const conns = await safe("connections", () => bee.api?.("/api/connections") || Promise.resolve(null), errors);
    return { vendor: entityHints.clientName || null, connections: conns };
  },
  regulatory: async ({ entityHints }, errors) => {
    const site = entityHints.siteName ? await resolveSite(null, entityHints, errors) : null;
    return { site };
  },
  "internal-task": async () => ({ }),
  "internal-idea": async () => ({ }),
  "internal-meeting": async () => ({ }),
  noise: async () => ({ }),
};

async function enrich(classified) {
  const t0 = Date.now();
  const errors = {};
  const plan = PLANS[classified.intent] || PLANS.noise;
  const sources = await plan(classified, errors);
  // Recall prior knowledge-graph context for the resolved client/site (read-only, local, zero-egress).
  if (memgraph && sources && typeof sources === "object") {
    try {
      const h = classified.entityHints || {};
      const name = (sources.client && sources.client.name) || h.clientName || (sources.site && sources.site.name) || h.siteName;
      if (name) {
        const g = memgraph.neighbors(name, { depth: 1 });
        if (g && g.entity && g.edges && g.edges.length) sources.graph = g;
      }
    } catch (e) { errors.graph = String(e.message || e); }
  }
  const totalMs = Date.now() - t0;
  return {
    intent: classified.intent,
    urgency: classified.urgency,
    entityHints: classified.entityHints || {},
    fetchedAt: new Date().toISOString(),
    sources,
    errors,
    totalMs,
  };
}

async function main() {
  let raw = "";
  if (process.stdin.isTTY) {
    console.error("Usage: echo '<classified-json>' | node alfred-enrich.js");
    process.exit(2);
  }
  raw = require("fs").readFileSync(0, "utf8");
  const classified = JSON.parse(raw);
  const result = await enrich(classified);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("ERROR:", err.message);
    process.exit(1);
  });
}

module.exports = { enrich };
