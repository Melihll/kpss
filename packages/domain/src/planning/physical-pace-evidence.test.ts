import { describe, expect, it } from "vitest";
import {
  evaluatePhysicalPaceCompletion,
  physicalPaceMaterialType,
} from "./physical-pace-evidence";

describe("W2 physical pace boundary semantics", () => {
  it("counts inclusive first-study pages from the pre-progress boundary", () => {
    expect(evaluatePhysicalPaceCompletion({
      pageStart: 10,
      pageEnd: 20,
      startPageBoundary: 9,
      endPageBoundary: 12,
    })).toEqual({
      status: "accepted",
      startPageBoundary: 9,
      endPageBoundary: 12,
      progressedPages: 3,
      resultingProgressState: "in_progress",
    });
  });

  it("treats equal boundaries as zero progress rather than one page", () => {
    expect(evaluatePhysicalPaceCompletion({
      pageStart: 10,
      pageEnd: 20,
      startPageBoundary: 12,
      endPageBoundary: 12,
    })).toMatchObject({ status: "zero_progress", progressedPages: 0 });
  });

  it("rejects progress reversal so revisited pages are not double counted", () => {
    expect(evaluatePhysicalPaceCompletion({
      pageStart: 10,
      pageEnd: 20,
      startPageBoundary: 15,
      endPageBoundary: 14,
    })).toEqual({ status: "rejected", reason: "progress_reversal" });
  });

  it.each([
    { pageStart: 0, pageEnd: 20, startPageBoundary: 0, endPageBoundary: 1 },
    { pageStart: 10, pageEnd: 9, startPageBoundary: 9, endPageBoundary: 10 },
    { pageStart: 10, pageEnd: 20, startPageBoundary: 8, endPageBoundary: 12 },
    { pageStart: 10, pageEnd: 20, startPageBoundary: 9, endPageBoundary: 21 },
  ])("rejects invalid page boundaries: %o", (input) => {
    expect(evaluatePhysicalPaceCompletion(input)).toEqual({
      status: "rejected",
      reason: "invalid_page_boundary",
    });
  });

  it("marks an end boundary at the unit end as completed", () => {
    expect(evaluatePhysicalPaceCompletion({
      pageStart: 10,
      pageEnd: 20,
      startPageBoundary: 18,
      endPageBoundary: 20,
    })).toMatchObject({
      status: "accepted",
      progressedPages: 2,
      resultingProgressState: "completed",
    });
  });

  it("keeps problem solving and content study in separate canonical material types", () => {
    expect(physicalPaceMaterialType("test", true)).toBe("test");
    expect(physicalPaceMaterialType("mock", true)).toBe("page_range");
    expect(physicalPaceMaterialType("reading", true)).toBe("page_range");
    expect(physicalPaceMaterialType("chapter", true)).toBe("page_range");
    expect(physicalPaceMaterialType("reading", false)).toBeNull();
  });
});
