import { describe, expect, it } from "vitest";
import {
  resourcePageLabel,
  resourceProgressPercent,
  validateResourcePageForm,
  type ResourcePageProgress,
} from "./resource-progress-ui";

const pageProgress: ResourcePageProgress = {
  resourceId: "resource-1",
  currentPage: 145,
  totalPages: 300,
  progressPercent: 48,
  completed: false,
  createdAt: null,
  updatedAt: null,
};

describe("resource progress UI helpers", () => {
  it("prefers real page progress over forecast progress", () => {
    expect(resourceProgressPercent(72, false, pageProgress)).toBe(48);
  });

  it("falls back to the existing forecast when no page record exists", () => {
    expect(resourceProgressPercent(72, false, null)).toBe(72);
    expect(resourceProgressPercent(72, true, null)).toBe(100);
  });

  it("formats the real page cursor", () => {
    expect(resourcePageLabel(pageProgress)).toBe("145 / 300 sayfa");
    expect(resourcePageLabel(null)).toBeNull();
  });

  it("validates total and current page values before PUT", () => {
    expect(validateResourcePageForm({ totalPages: 300, currentPage: 145 })).toBeNull();
    expect(validateResourcePageForm({ totalPages: 0, currentPage: 0 })).toContain("Toplam sayfa");
    expect(validateResourcePageForm({ totalPages: 300, currentPage: 301 })).toContain("Kaldığınız sayfa");
    expect(validateResourcePageForm({ totalPages: 300.5, currentPage: 10 })).toContain("Toplam sayfa");
  });
});