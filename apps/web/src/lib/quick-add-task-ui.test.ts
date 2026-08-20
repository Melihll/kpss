import { describe, expect, it } from "vitest";
import {
  canPreviewQuickAdd,
  initialQuickAddForm,
  quickAddDateBounds,
  type QuickAddOptions,
} from "./quick-add-task-ui";

const options: QuickAddOptions = {
  weekStartDate: "2026-08-17",
  weekEndDate: "2026-08-23",
  minDate: "2026-08-20",
  subjects: [
    { id: "citizenship", name: "Vatandaşlık", sortOrder: 1 },
    { id: "history", name: "Tarih", sortOrder: 2 },
  ],
};

describe("quick add task UI helpers", () => {
  it("never allows a date before today inside the current week", () => {
    expect(quickAddDateBounds(options)).toEqual({
      min: "2026-08-20",
      max: "2026-08-23",
    });
  });

  it("defaults to the first active subject, 30 minutes and earliest allowed date", () => {
    expect(initialQuickAddForm(options)).toEqual({
      subjectId: "citizenship",
      title: "",
      estimatedMinutes: "30",
      plannedDate: "2026-08-20",
    });
  });

  it("accepts a complete preview form", () => {
    expect(canPreviewQuickAdd({
      subjectId: "citizenship",
      title: "Anayasa kısa tekrar",
      estimatedMinutes: "30",
      plannedDate: "2026-08-20",
    }, options)).toBe(true);
  });

  it("rejects blank title, fractional minutes and out-of-range date", () => {
    expect(canPreviewQuickAdd({
      subjectId: "citizenship",
      title: " ",
      estimatedMinutes: "30",
      plannedDate: "2026-08-20",
    }, options)).toBe(false);

    expect(canPreviewQuickAdd({
      subjectId: "citizenship",
      title: "Tekrar",
      estimatedMinutes: "12.5",
      plannedDate: "2026-08-20",
    }, options)).toBe(false);

    expect(canPreviewQuickAdd({
      subjectId: "citizenship",
      title: "Tekrar",
      estimatedMinutes: "30",
      plannedDate: "2026-08-24",
    }, options)).toBe(false);
  });
});