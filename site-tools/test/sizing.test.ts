import { describe, expect, it } from "vitest";
import { checkSize, suggestInverter } from "../src/sizing";
import { costOfWaiting } from "../src/tariff";

describe("DC vs AC sizing", () => {
  it("30 kWp on a 15 kW inverter stays in the small-rooftop tier at ratio 2", () => {
    const r = checkSize({ dcKwp: 30, acKw: 15 });
    expect(r.ratio).toBe(2);
    expect(r.ratioOk).toBe(true);
    expect(r.smallRooftop).toBe(true);
    expect(r.maxDcKwp).toBe(30);
  });
  it("31 kWp on 15 kW exceeds the ratio", () => {
    expect(checkSize({ dcKwp: 31, acKw: 15 }).ratioOk).toBe(false);
  });
  it("a 17 kW inverter leaves the small-rooftop tier", () => {
    expect(checkSize({ dcKwp: 25, acKw: 17 }).smallRooftop).toBe(false);
  });
  it("suggests the smallest inverter within the ratio", () => {
    expect(suggestInverter(30)).toBe(15);
    expect(suggestInverter(22)).toBe(12);
    expect(suggestInverter(10)).toBe(5);
  });
  it("clipping reduces the 2026 clock proportionally", () => {
    const a = costOfWaiting({ kWp: 30, specificYield: 1718 });
    const b = costOfWaiting({ kWp: 30, specificYield: 1718, clippingLoss: 0.1 });
    expect(b.costOfWaiting).toBeCloseTo(a.costOfWaiting * 0.9, 6);
    expect(b.firstYearKWh).toBeCloseTo(30 * 1718 * 0.9, 6);
  });
});
