import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P2-08 material-aware finish projection contract", () => {
  const roadmap = readFileSync(
    new URL("../packages/domain/src/p48/roadmap.ts", import.meta.url),
    "utf8",
  );

  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("keeps the legacy fallback explicit in the deterministic domain", () => {
    expect(roadmap).toContain("materialRemainingMinutes?: number | null");
    expect(roadmap).toContain(
      "Math.max(0, resource.plannedMinutes - resource.actualMinutes)",
    );
    expect(roadmap).toContain(
      "materialRemainingMinutes !== null",
    );
  });

  it("feeds P2-07 workload into the existing P48 forecast", () => {
    expect(appApi).toContain(
      "materialWorkloads[resource.resourceId]?.totalRemainingMinutes ?? null",
    );
    expect(appApi).toContain("forecastP48Resources({");
  });

  it("does not add planner or task mutations", () => {
    const marker = "const subjectForecasts = forecastP48Resources({";
    const start = appApi.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const projectionWindow = appApi.slice(
      Math.max(0, start - 500),
      start + 900,
    );

    expect(projectionWindow).not.toContain(".insert(");
    expect(projectionWindow).not.toContain(".update(");
    expect(projectionWindow).not.toContain(".upsert(");
    expect(projectionWindow).not.toContain(".delete(");
    expect(projectionWindow).not.toContain(".rpc(");
  });
});