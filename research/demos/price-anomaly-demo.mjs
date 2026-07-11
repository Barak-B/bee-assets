#!/usr/bin/env node
// price-anomaly-demo.mjs — watch the procurement "smart layer" run, zero install.
//
//   node research/demos/price-anomaly-demo.mjs
//
// Pure Node, no deps, read-only. Mirrors the logic in
// research/phase-3/procurement-tracking/phase-a/src/benchmark.ts (Tier-0, $0, no LLM):
// build a price benchmark from buying history, then score new PO lines with a z-score
// and flag over- AND under-charges. This is the first piece of the "smart layer" that
// actually RUNS (BRAIN §4b) — everything here is arithmetic you can audit by hand.

// ── the same Tier-0 stats as benchmark.ts, inlined ────────────────────────────
function computeBenchmark(prices) {
  const n = prices.length;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const variance = n < 2 ? 0 : prices.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1);
  return { count: n, avg: mean, std: Math.sqrt(variance) };
}
function priceAnomaly(price, b, { minSamples = 5, zThreshold = 2.5, zAlert = 4, flatDeltaPct = 5 } = {}) {
  if (b.count < minSamples) return { verdict: "insufficient_data", benchCount: b.count };
  const deltaPct = b.avg === 0 ? 0 : ((price - b.avg) / b.avg) * 100;
  if (b.std === 0) {
    if (Math.abs(deltaPct) < flatDeltaPct) return { verdict: "ok", z: 0, deltaPct };
    return { verdict: "anomaly", side: price > b.avg ? "high" : "low",
      severity: Math.abs(deltaPct) >= flatDeltaPct * 3 ? "alert" : "warn",
      z: price > b.avg ? Infinity : -Infinity, deltaPct,
      reason: `diverges ${deltaPct.toFixed(1)}% from a previously stable price` };
  }
  const z = (price - b.avg) / b.std;
  if (Math.abs(z) < zThreshold) return { verdict: "ok", z, deltaPct };
  const side = z > 0 ? "high" : "low";
  return { verdict: "anomaly", side, severity: Math.abs(z) >= zAlert ? "alert" : "warn", z, deltaPct,
    reason: side === "high"
      ? `${deltaPct.toFixed(1)}% above mean — possible overcharge`
      : `${Math.abs(deltaPct).toFixed(1)}% below mean — check for a unit/qty mix-up` };
}

const shek = (cents) => "₪" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── a small, BEE-shaped buying history (cents/agorot) ──────────────────────────
const HISTORY = {
  "מודול 550W":         [48000, 48500, 47800, 48200, 48100, 47900, 48300, 48000],
  "כבל סולארי DC 6mm":  [350, 360, 355, 348, 352, 358, 351],
  "אינוורטר SolarEdge 10kW": [1190000, 1185000, 1195000, 1188000, 1192000], // ₪11,900 area
  "מבטח DC 1000V":      [4200, 4200, 4200, 4200, 4200], // rock-stable -> std=0
};

// ── new lines arriving on a fresh PO (what we want to vet) ─────────────────────
const NEW_LINES = [
  { item: "מודול 550W",              unit: "pcs", price: 48300 }, // normal
  { item: "מודול 550W",              unit: "pcs", price: 62000 }, // +29% overcharge
  { item: "כבל סולארי DC 6mm",       unit: "m",   price: 3550 },  // 10x — ₪35.50 keyed where ₪3.55?
  { item: "אינוורטר SolarEdge 10kW", unit: "pcs", price: 1480000 }, // +24% overcharge
  { item: "מבטח DC 1000V",           unit: "pcs", price: 4900 },  // +16.7% off a flat price
  { item: "ממסר חדש לגמרי",          unit: "pcs", price: 9900 },  // no history at all
];

console.log("\n=== BEE price-anomaly demo (Tier-0, $0, no LLM) ===\n");
console.log("Benchmarks built from buying history:\n");
const benches = {};
for (const [item, prices] of Object.entries(HISTORY)) {
  const b = computeBenchmark(prices);
  benches[item] = b;
  console.log(`  ${item.padEnd(26)} n=${b.count}  avg=${shek(b.avg).padStart(12)}  σ=${shek(b.std)}`);
}

console.log("\nScoring new PO lines:\n");
let flagged = 0, alerts = 0;
for (const ln of NEW_LINES) {
  const b = benches[ln.item];
  let v;
  if (!b) v = { verdict: "new_item" };
  else v = priceAnomaly(ln.price, b);

  let tag, note;
  if (v.verdict === "new_item")          { tag = "🆕 NEW   "; note = "no benchmark yet — first time we buy this"; }
  else if (v.verdict === "insufficient_data") { tag = "·  thin  "; note = `only ${v.benchCount} prior samples`; }
  else if (v.verdict === "ok")           { tag = "✅ ok    "; note = `z=${v.z.toFixed(2)}  Δ${v.deltaPct.toFixed(1)}%`; }
  else {
    flagged++;
    if (v.severity === "alert") { alerts++; tag = "⚡ ALERT "; } else tag = "⚠️  FLAG  ";
    const zs = Number.isFinite(v.z) ? `z=${v.z.toFixed(2)}  ` : "";
    note = `${v.side.toUpperCase()}  ${zs}${v.reason}`;
  }
  console.log(`  ${tag} ${ln.item.padEnd(26)} ${shek(ln.price).padStart(12)}  →  ${note}`);
}

console.log(`\n  ${flagged} line(s) flagged, ${alerts} at ⚡ALERT level (would draft a heads-up to Barak per Law #2).\n`);
console.log("This is exactly what src/benchmark.ts does against the real PO history in the DB.\n");
