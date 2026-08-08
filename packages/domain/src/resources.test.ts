import { describe, expect, it } from "vitest";
import { createBulkResourceUnits } from "./resources";

describe("bulk resource units", () => {
  it("creates a deterministic inclusive range", () => {
    const units = createBulkResourceUnits({ prefix: "Test", start: 1, end: 12, unitType: "test" });
    expect(units).toHaveLength(12);
    expect(units[0]).toEqual({ name: "Test 1", unitType: "test", sortOrder: 1 });
    expect(units[11]?.name).toBe("Test 12");
  });

  it("rejects invalid and duplicate ranges", () => {
    expect(() => createBulkResourceUnits({ prefix: "Test", start: 5, end: 2, unitType: "test" })).toThrow();
    expect(() => createBulkResourceUnits({ prefix: "Test", start: 1, end: 2, unitType: "test", existingNames: ["Test 2"] })).toThrow(/Duplicate/);
  });
});
