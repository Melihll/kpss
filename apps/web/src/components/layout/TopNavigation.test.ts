import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAVIGATION, TopNavigation } from "./TopNavigation";

function render(path: string, focus = false) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(TopNavigation, { displayName: "Deniz", focus, onCoach: () => undefined })));
}
describe("product top navigation", () => {
  it("preserves all product deep links and marks exactly the active destination", () => {
    for (const item of PRODUCT_NAVIGATION) {
      const html = render(item.to);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      for (const destination of PRODUCT_NAVIGATION) expect(html).toContain(`href="${destination.to}"`);
      expect(html).toContain("Hesap menüsü");
      expect(html).toContain("Gezinme menüsü");
      expect(html).toContain("Koça Sor");
      expect(html).not.toContain("sidebar");
    }
  });
  it("gives Focus an explicit exit while removing the full navigation", () => {
    const html = render("/session", true);
    expect(html).toContain("Odak Modu");
    expect(html).toContain("Bugüne dön");
    expect(html).not.toContain("Ana gezinme");
    expect(html).not.toContain("Hesap menüsü");
  });
});
