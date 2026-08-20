import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-08B Resources page progress UI contract", () => {
  const page = readFileSync(
    new URL("../apps/web/src/pages/ResourcesPage.tsx", import.meta.url),
    "utf8",
  );
  const drawer = readFileSync(
    new URL("../apps/web/src/components/ResourceProgressDrawer.tsx", import.meta.url),
    "utf8",
  );

  it("loads real resource page progress and preserves forecast fallback", () => {
    expect(page).toContain("/progress");
    expect(page).toContain("pageProgressByResource");
    expect(page).toContain("resource.progressPercent");
    expect(page).toContain("pageProgress?.progressPercent");
    expect(page).toContain("Sayfa takibi");
  });

  it("saves only through the resource progress PUT endpoint", () => {
    expect(drawer).toContain('method: "PUT"');
    expect(drawer).toContain('`/resources/${resource.resourceId}/progress`');
    expect(drawer).not.toContain("weekly-plan");
    expect(drawer).not.toContain("recalculate");
    expect(drawer).not.toContain("resource_unit_progress");
    expect(drawer).not.toContain("resources.status");
  });

  it("states that saving page progress does not automatically change the plan", () => {
    expect(drawer).toContain("çalışma planını otomatik olarak değiştirmez");
  });
});