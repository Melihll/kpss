import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/p48-week.ts"),
  "utf8",
);

describe("P48 week generator capacity-source guard", () => {
  it("classifies the capacity source before week generation", () => {
    expect(source).toContain("classifyP48CapacitySource");
  });

  it("raises an observable configuration error instead of an academic gap", () => {
    expect(source).toContain(
      'throw new Error("P48_CAPACITY_SOURCE_MISSING")',
    );
  });
});
