import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-13 weekly task material resource contract", () => {
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("hydrates material resource identity from direct, section and unit relations", () => {
    const start = appApi.indexOf("async function planWithTasks");
    const end = appApi.indexOf("async function loadP48Roadmap", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const body = appApi.slice(start, end);
    expect(body).toContain("resources(id,name,resource_type)");
    expect(body).toContain("resource_sections(resource_id,resources(id,name,resource_type))");
    expect(body).toContain("resource_units(resource_id,name,unit_type,estimated_minutes,resources(id,name,resource_type))");
    expect(body).toContain("material_resource_id");
    expect(body).toContain("section?.resource_id");
    expect(body).toContain("unit.resource_id");
  });

  it("keeps planWithTasks read-only", () => {
    const start = appApi.indexOf("async function planWithTasks");
    const end = appApi.indexOf("async function loadP48Roadmap", start);
    const body = appApi.slice(start, end);

    expect(body).not.toContain(".insert(");
    expect(body).not.toContain(".update(");
    expect(body).not.toContain(".upsert(");
    expect(body).not.toContain(".delete(");
    expect(body).not.toContain(".rpc(");
    expect(body).not.toContain("recalculate");
  });
});