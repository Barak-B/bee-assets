// Price-anomaly detector — PURE unit tests. No DB, no network, no env.
//   node --import tsx --test tests/benchmark.test.ts
// (Unlike dryrun.test.ts, this needs zero infrastructure — it exercises the
//  Tier-0 stats core directly, so you can watch the "smart layer" actually run.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBenchmarks, priceAnomaly, type BenchmarkInputLine } from "../src/benchmark.js";

// A realistic-ish history: 8 buys of the same 550W panel around ₪480 (=48000 agorot).
const PANEL = "מודול 550w";
function panelHistory(prices: number[]): BenchmarkInputLine[] {
  return prices.map((p) => ({ descriptionNorm: PANEL, unit: "pcs", unitPriceCents: BigInt(p) }));
}

test("computeBenchmarks groups by (descriptionNorm, unit) and computes mean+stddev", () => {
  const lines = [
    ...panelHistory([48000, 48500, 47800, 48200, 48100, 47900]),
    { descriptionNorm: "כבל סולארי 6mm", unit: "m", unitPriceCents: 350n },
    { descriptionNorm: "כבל סולארי 6mm", unit: "m", unitPriceCents: 360n },
  ];
  const stats = computeBenchmarks(lines);
  assert.equal(stats.length, 2, "two distinct (item,unit) groups");
  const panel = stats.find((s) => s.descriptionNorm === PANEL)!;
  assert.equal(panel.count, 6);
  assert.equal(panel.avgUnitPriceCents, 48083n); // round(mean of the six)
  assert.ok(panel.stdDevCents > 0n, "non-zero spread");
});

test("a 30% overcharge is flagged HIGH", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48500, 47800, 48200, 48100, 47900]));
  const v = priceAnomaly(62000n, bench); // ~29% above ~48k
  assert.equal(v.verdict, "anomaly");
  if (v.verdict !== "anomaly") return;
  assert.equal(v.side, "high");
  assert.ok(v.z > 2.5, `z=${v.z}`);
  assert.ok(v.deltaPct > 25, `deltaPct=${v.deltaPct}`);
});

test("a suspiciously cheap line is flagged LOW (unit/qty mix-up signal)", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48500, 47800, 48200, 48100, 47900]));
  const v = priceAnomaly(4800n, bench); // 10x too cheap — likely ₪48 keyed where ₪480 meant
  assert.equal(v.verdict, "anomaly");
  if (v.verdict !== "anomaly") return;
  assert.equal(v.side, "low");
  assert.ok(v.z < -2.5, `z=${v.z}`);
});

test("a normal price passes", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48500, 47800, 48200, 48100, 47900]));
  const v = priceAnomaly(48300n, bench);
  assert.equal(v.verdict, "ok");
});

test("too few samples => insufficient_data, never a false alarm", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48500])); // only 2
  const v = priceAnomaly(99000n, bench);
  assert.equal(v.verdict, "insufficient_data");
});

test("a previously rock-stable price (stdDev==0) still catches a divergence", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48000, 48000, 48000, 48000])); // std=0
  assert.equal(bench.stdDevCents, 0n);
  const ok = priceAnomaly(48000n, bench);
  assert.equal(ok.verdict, "ok");
  const diverge = priceAnomaly(55000n, bench); // +14.6%
  assert.equal(diverge.verdict, "anomaly");
  if (diverge.verdict !== "anomaly") return;
  assert.equal(diverge.side, "high");
  assert.equal(diverge.z, Infinity);
});

test("big z escalates warn -> alert", () => {
  const [bench] = computeBenchmarks(panelHistory([48000, 48500, 47800, 48200, 48100, 47900]));
  const warn = priceAnomaly(60000n, bench);
  const alert = priceAnomaly(120000n, bench);
  if (warn.verdict !== "anomaly" || alert.verdict !== "anomaly") {
    assert.fail("both should be anomalies");
  }
  assert.equal(alert.severity, "alert");
});
