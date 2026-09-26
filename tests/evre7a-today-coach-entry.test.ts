import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
  "utf8",
);

describe("Evre 7A Today Coach entry authority", () => {
  it("does not expose the legacy capacity Coach mode from Today", () => {
    expect(source).not.toContain('setCoachMode("capacity")');
  });

  it("routes both Today Coach entry points through the accepted Reactive Coach mode", () => {
    const defaultCallers =
      source.match(/setCoachMode\("default"\)/g) ?? [];

    expect(defaultCallers.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("Vaktim Değişti");
    expect(source).toContain("Koça Yaz");
  });

  it("does not give Today direct legacy Apply authority", () => {
    expect(source).not.toContain("/plans/current/apply-confirmed");
    expect(source).not.toContain("callAiCoachPreview");
  });
});
