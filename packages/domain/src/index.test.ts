import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE } from "./index";

describe("domain foundation", () => {
  it("uses the product's default timezone", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/Istanbul");
  });
});
