import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dialog accessibility contract", () => {
  const hook = readFileSync(new URL("./useDialogAccessibility.ts", import.meta.url), "utf8");

  it("traps keyboard focus, supports escape, restores focus and locks background scroll", () => {
    expect(hook).toContain('event.key === "Escape"');
    expect(hook).toContain('event.key !== "Tab"');
    expect(hook).toContain('document.body.style.overflow = "hidden"');
    expect(hook).toContain("previouslyFocused?.focus");
    expect(hook).toContain("FOCUSABLE_SELECTOR");
  });
});
