import { describe, expect, it } from "vitest";
import {
  buildFoundationWeekGoldenSnapshotV2,
  decidePlanningActionV2,
} from "./index";

describe("Planning Decision Pipeline V2", () => {
  it("keeps the canonical feasible week untouched", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2(),
      });

    expect(result.decision).toBe(
      "KEEP_PLAN",
    );

    expect(
      result.applyRecommended,
    ).toBe(false);

    expect(
      result.proposal.applyRecommended,
    ).toBe(false);

    expect(
      result.proposal.changedTaskCount,
    ).toBe(0);

    expect(
      result.validation.valid,
    ).toBe(true);
  });

  it("keeps the plan untouched after +60 capacity", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            trigger:
              "CAPACITY_INCREASE",

            capacityDeltaByDate: {
              "2026-08-18": 60,
            },
          }),
      });

    expect(result.decision).toBe(
      "KEEP_PLAN",
    );

    expect(
      result.proposal.changedTaskCount,
    ).toBe(0);

    expect(
      result.applyRecommended,
    ).toBe(false);
  });

  it("keeps the real 43-minute deviation without reshuffling", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            trigger:
              "STUDY_DEVIATION",

            completedMinutesByTaskId: {
              "task-01": 43,
            },

            partiallyCompletedTaskIds: [
              "task-01",
            ],

            studiedMinutesByDate: {
              "2026-08-17": 43,
            },
          }),
      });

    expect(result.decision).toBe(
      "KEEP_PLAN",
    );

    expect(
      result.proposal.changedTaskCount,
    ).toBe(0);

    expect(
      result.proposal.moves,
    ).toEqual([]);
  });

  it("repairs -50 capacity using one future move and becomes ready to apply", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            trigger:
              "CAPACITY_DECREASE",

            capacityDeltaByDate: {
              "2026-08-18": -50,
              "2026-08-19": 50,
            },
          }),
      });

    expect(result.decision).toBe(
      "READY_TO_APPLY",
    );

    expect(
      result.validation.valid,
    ).toBe(true);

    expect(
      result.proposal.changedTaskCount,
    ).toBe(1);

    expect(
      result.proposal.moves,
    ).toHaveLength(1);

    expect(
      result.proposal.backlog,
    ).toEqual([]);

    expect(
      result.applyRecommended,
    ).toBe(true);

    expect(
      result.proposal.applyRecommended,
    ).toBe(true);
  });

  it("repairs -90 capacity with exactly one backlog mutation when the week has no spare space", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            trigger:
              "CAPACITY_DECREASE",

            capacityDeltaByDate: {
              "2026-08-18": -90,
            },
          }),
      });

    expect(result.decision).toBe(
      "READY_TO_APPLY",
    );

    expect(
      result.proposal.changedTaskCount,
    ).toBe(1);

    expect(
      result.proposal.moves,
    ).toEqual([]);

    expect(
      result.proposal.backlog,
    ).toHaveLength(1);

    expect(
      result.proposal.backlog[0]?.taskId,
    ).toBe("task-05");
  });

  it("blocks past-due repair when an active task is immutable", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            currentDate:
              "2026-08-18",

            activeTaskIds: [
              "task-01",
            ],
          }),
      });

    expect(result.decision).toBe(
      "BLOCKED",
    );

    expect(
      result.applyRecommended,
    ).toBe(false);

    expect(
      result.proposal.applyRecommended,
    ).toBe(false);

    expect(
      result.repair.successful,
    ).toBe(false);

    expect(
      result.reasonCodes,
    ).toContain(
      "NO_AUTOMATIC_MUTATION",
    );
  });

  it("lets validator override an otherwise successful repair", () => {
    const result =
      decidePlanningActionV2({
        snapshot:
          buildFoundationWeekGoldenSnapshotV2({
            trigger:
              "CAPACITY_DECREASE",

            capacityDeltaByDate: {
              "2026-08-18": -50,
              "2026-08-19": 50,
            },
          }),

        validationPolicy: {
          // Deliberately reject even a one-task automatic repair.
          maxAutomaticChangedTaskCount: 0,
          maxAutomaticChangedTaskFraction: 0,
        },
      });

    expect(
      result.repair.successful,
    ).toBe(true);

    expect(
      result.validation.valid,
    ).toBe(false);

    expect(
      result.validation.violations.some(
        (violation) =>
          violation.code ===
          "MASS_CHANGE_GUARD",
      ),
    ).toBe(true);

    expect(result.decision).toBe(
      "BLOCKED",
    );

    expect(
      result.applyRecommended,
    ).toBe(false);

    expect(
      result.proposal.applyRecommended,
    ).toBe(false);
  });

  it("is deterministic for the same immutable snapshot", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger:
          "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -50,
          "2026-08-19": 50,
        },
      });

    const first =
      decidePlanningActionV2({
        snapshot,
      });

    const second =
      decidePlanningActionV2({
        snapshot,
      });

    expect(first).toEqual(second);
  });
});
