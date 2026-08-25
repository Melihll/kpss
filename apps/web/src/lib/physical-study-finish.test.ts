import { describe, expect, it } from "vitest";
import { validatePhysicalFinishBoundary } from "./physical-study-finish";

const capture = { pageStart: 10, pageEnd: 20, startPageBoundary: 12 };

describe("physical study finish boundary UX", () => {
  it("accepts zero progress and the first advancing boundary", () => {
    expect(validatePhysicalFinishBoundary(capture, "12")).toEqual({ ok: true, boundary: 12, zeroProgress: true });
    expect(validatePhysicalFinishBoundary(capture, "13")).toEqual({ ok: true, boundary: 13, zeroProgress: false });
  });

  it("rejects missing, fractional, reversed, and beyond-unit boundaries", () => {
    expect(validatePhysicalFinishBoundary(capture, "")).toMatchObject({ ok: false, code: "PHYSICAL_PAGE_BOUNDARY_REQUIRED" });
    expect(validatePhysicalFinishBoundary(capture, "12.5")).toMatchObject({ ok: false, code: "PHYSICAL_PAGE_BOUNDARY_INVALID" });
    expect(validatePhysicalFinishBoundary(capture, "11")).toMatchObject({ ok: false, code: "PHYSICAL_PROGRESS_REVERSAL" });
    expect(validatePhysicalFinishBoundary(capture, "21")).toMatchObject({ ok: false, code: "PHYSICAL_PAGE_BOUNDARY_INVALID" });
  });
});
