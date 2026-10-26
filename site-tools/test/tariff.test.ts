import { describe, expect, it } from "vitest";
import { ROOFTOP_TRACKS, costOfWaiting, trackRevenue } from "../src/tariff";

describe("2026 clock", () => {
  it("draft 2027 rate is 5% below today and shorter", () => {
    expect(ROOFTOP_TRACKS.draft2027.rate).toBeCloseTo(0.456, 3);
    expect(ROOFTOP_TRACKS.draft2027.years).toBe(20);
    expect(ROOFTOP_TRACKS.draft2027.status).toBe("draft");
  });

  it("revenue without degradation is kWh × rate × years", () => {
    const r = trackRevenue(ROOFTOP_TRACKS.current, { kWp: 10, specificYield: 1700, degradation: 0 });
    expect(r).toBeCloseTo(10 * 1700 * 0.48 * 25, 6);
  });

  it("10 kWp in Tel Aviv: waiting costs tens of thousands of NIS", () => {
    const w = costOfWaiting({ kWp: 10, specificYield: 1718 });
    expect(w.firstYearKWh).toBe(17180);
    expect(w.revenue2026).toBeGreaterThan(w.revenue2027);
    expect(w.costOfWaiting).toBeGreaterThan(40000);
    expect(w.costOfWaiting).toBeLessThan(60000);
  });

  it("urban premium widens the gap", () => {
    const base = costOfWaiting({ kWp: 10, specificYield: 1718 });
    const urban = costOfWaiting({ kWp: 10, specificYield: 1718, urban: true });
    expect(urban.costOfWaiting).toBeGreaterThan(base.costOfWaiting);
  });
});
