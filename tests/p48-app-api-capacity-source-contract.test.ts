import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appApi = readFileSync(
  new URL("../supabase/functions/app-api/index.ts", import.meta.url),
  "utf8",
);

describe("P48 app-api capacity-source guard", () => {
  const start = appApi.indexOf("async function generateP48Week");
  const end = appApi.indexOf("async function nextTask", start);
  const body = appApi.slice(start, end);

  it("uses the same canonical capacity-source classifier as scheduler generation", () => {
    expect(appApi).toContain(
      'import { classifyP48CapacitySource } from "../_shared/p48-capacity-source.ts";',
    );
    expect(body).toContain("classifyP48CapacitySource");
    expect(body).toContain("activeAvailabilityCount");
    expect(body).toContain("dailyOverrideCount");
  });

  it("rejects missing capacity before academic-gap fallback", () => {
    const guard = body.indexOf("P48_CAPACITY_SOURCE_MISSING");
    const gap = body.indexOf("academicGap: true");

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(gap).toBeGreaterThan(guard);
  });

  it("exposes the configuration error through the existing API error contract", () => {
    expect(appApi).toContain("P48_CAPACITY_SOURCE_MISSING: 409");
  });
});
