import { describe, expect, it } from "vitest";
import { checkPvConnection, connectionKva, maxPvKw } from "../src/connection";

describe("connection", () => {
  it("rates common connections", () => {
    expect(connectionKva({ phases: 1, amps: 25 })).toBeCloseTo(5.75, 2);
    expect(connectionKva({ phases: 3, amps: 25 })).toBeCloseTo(17.32, 2);
    expect(connectionKva({ phases: 3, amps: 40 })).toBeCloseTo(27.71, 2);
  });

  it("caps PV at 0.9 of the connection (35כ2)", () => {
    expect(maxPvKw({ phases: 3, amps: 25 })).toBeCloseTo(15.59, 2);
    expect(maxPvKw({ phases: 3, amps: 40 })).toBeCloseTo(24.94, 2);
  });

  it("suggests the smallest upgrade that fits", () => {
    const r = checkPvConnection({ phases: 3, amps: 25 }, 20);
    expect(r.fits).toBe(false);
    expect(r.upgradeTo).toEqual({ phases: 3, amps: 40 });
    expect(r.productionMeterRequired).toBe(true);
  });

  it("matches the poultry archetype: 99.5 kW AC needs 3x160A", () => {
    const r = checkPvConnection({ phases: 3, amps: 25 }, 99.5);
    expect(r.upgradeTo).toEqual({ phases: 3, amps: 160 });
    expect(r.exportLimitApplies).toBe(false);
  });

  it("flags CT metering above 3x100A and export limits above 100 kW", () => {
    const r = checkPvConnection({ phases: 3, amps: 250 }, 150);
    expect(r.metering).toBe("ct");
    expect(r.exportLimitApplies).toBe(true);
    expect(r.fits).toBe(true);
  });

  it("no production meter at 15 kW and below", () => {
    expect(checkPvConnection({ phases: 3, amps: 25 }, 15).productionMeterRequired).toBe(false);
  });

  it("rejects bad input", () => {
    expect(() => connectionKva({ phases: 1, amps: 0 })).toThrow(RangeError);
    expect(() => checkPvConnection({ phases: 1, amps: 25 }, -1)).toThrow(RangeError);
  });
});
