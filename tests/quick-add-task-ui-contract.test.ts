import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-05B quick-add UI safety contract", () => {
  const drawer = readFileSync(
    new URL("../apps/web/src/components/QuickAddTaskDrawer.tsx", import.meta.url),
    "utf8",
  );
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("uses options then preview and exposes no create/apply call", () => {
    expect(drawer).toContain('"/tasks/quick-add/options"');
    expect(drawer).toContain('"/tasks/quick-add/preview"');
    expect(drawer).not.toContain('"/tasks/quick-add/apply"');
    expect(drawer).not.toContain('"/tasks/quick-add/create"');
    expect(drawer).toContain("Henüz hiçbir görev oluşturulmadı");
  });

  it("keeps quick-add options route read-only", () => {
    const start = appApi.indexOf('route === "/tasks/quick-add/options"');
    const end = appApi.indexOf('route === "/tasks/quick-add/preview"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const routeBody = appApi.slice(start, end);
    expect(routeBody).toContain('from("user_subjects")');
    expect(routeBody).not.toContain(".insert(");
    expect(routeBody).not.toContain(".update(");
    expect(routeBody).not.toContain(".upsert(");
    expect(routeBody).not.toContain(".delete(");
    expect(routeBody).not.toContain(".rpc(");
  });
});