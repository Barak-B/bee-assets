import { describe, expect, it } from "vitest";
import { storageRequirements } from "../src/storage";

const ids = (k: number) => storageRequirements(k).map((r) => r.id);

describe("storage licensing", () => {
  it("home battery up to 20 kWh needs only design and standard", () => {
    expect(ids(15)).toEqual(["electrical-design", "battery-standard"]);
    expect(ids(20)).toEqual(["electrical-design", "battery-standard"]);
  });
  it("adds a safety consultant above 20 kWh", () => {
    expect(ids(32)).toContain("safety-consultant");
    expect(ids(32)).not.toContain("fire-authority");
  });
  it("factory 4 cabinets (1,044 kWh) needs everything", () => {
    expect(ids(1044)).toEqual([
      "electrical-design",
      "battery-standard",
      "safety-consultant",
      "fire-authority",
      "building-permit",
    ]);
  });
  it("one 261 kWh cabinet needs fire authority, not a permit", () => {
    expect(ids(261)).toContain("fire-authority");
    expect(ids(261)).not.toContain("building-permit");
  });
});
