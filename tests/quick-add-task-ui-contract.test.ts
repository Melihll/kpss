import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("R2 quick-add confirmation UI safety contract", () => {
  const drawer = readFileSync(
    new URL("../apps/web/src/components/QuickAddTaskDrawer.tsx", import.meta.url),
    "utf8",
  );
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("requires options, preview, proposal confirmation, then one explicit apply", () => {
    expect(drawer).toContain('"/tasks/quick-add/options"');
    expect(drawer).toContain('"/tasks/quick-add/preview"');
    expect(drawer).toContain('"/tasks/quick-add/apply"');
    expect(drawer).not.toContain('"/tasks/quick-add/create"');
    expect(drawer).toContain("Henüz hiçbir görev oluşturulmadı");
    expect(drawer).toContain("preview?.confirmation?.proposalId");
    expect(drawer).toContain("Onayla ve Görevi Ekle");
    expect(drawer).toContain("Görev eklendi");
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

  it("keeps preview free of task inserts and confines creation to the guarded RPC", () => {
    const previewStart = appApi.indexOf('route === "/tasks/quick-add/preview"');
    const applyStart = appApi.indexOf('route === "/tasks/quick-add/apply"', previewStart);
    expect(previewStart).toBeGreaterThan(-1);
    expect(applyStart).toBeGreaterThan(previewStart);
    const previewRoute = appApi.slice(previewStart, applyStart);
    expect(previewRoute).not.toContain('from("tasks").insert');
    expect(previewRoute).toContain('"create_confirmed_action_proposal"');
    expect(appApi.slice(applyStart)).toContain('"apply_confirmed_action_proposal"');
  });
});
