import { describe, expect, it } from "vitest";
import { recommendCharger } from "../src/ev";

describe("EV charger", () => {
  it("typical commuter on 3x40A gets the smallest charger that covers the day", () => {
    const r = recommendCharger({ connection: { phases: 3, amps: 40 }, dailyKm: 60, hoursAvailable: 10 });
    expect(r.dailyKWh).toBeCloseTo(10.2, 1);
    expect(r.recommended?.kw).toBe(3.7);
    expect(r.shortfall).toBe(false);
  });

  it("long daily drive in short time picks a 3-phase charger", () => {
    const r = recommendCharger({ connection: { phases: 3, amps: 40 }, dailyKm: 300, hoursAvailable: 4 });
    expect(r.recommended?.phases).toBe(3);
    expect(r.recommended!.kw).toBeGreaterThanOrEqual(r.requiredKw);
  });

  it("single-phase 25A cannot take a 32A charger", () => {
    const r = recommendCharger({ connection: { phases: 1, amps: 25 }, dailyKm: 200, hoursAvailable: 3 });
    expect(r.recommended?.kw).toBe(3.7);
    expect(r.shortfall).toBe(true);
  });

  it("never offers a 3-phase charger on a single-phase connection", () => {
    const r = recommendCharger({ connection: { phases: 1, amps: 40 }, dailyKm: 400, hoursAvailable: 2 });
    expect(r.recommended?.phases).toBe(1);
  });

  it("advises load management when charger and house exceed the connection", () => {
    const r = recommendCharger({ connection: { phases: 1, amps: 25 }, dailyKm: 50, hoursAvailable: 8, houseLoadKw: 3 });
    expect(r.recommended?.kw).toBe(3.7);
    expect(r.loadManagementAdvised).toBe(true);
  });

  it("no load management needed on 3x40A with a 3.7 kW charger", () => {
    const r = recommendCharger({ connection: { phases: 3, amps: 40 }, dailyKm: 60, hoursAvailable: 10 });
    expect(r.loadManagementAdvised).toBe(false);
  });
});
