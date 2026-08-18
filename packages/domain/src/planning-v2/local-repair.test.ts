import { describe, expect, it } from "vitest";
import {
  buildFoundationWeekGoldenSnapshotV2,
  repairCurrentPlanLocallyV1,
} from "./index";

describe("Planning V2 Local Repair V1", () => {
  it("does nothing when the canonical plan is already feasible", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2(),
      );

    expect(result.repairRequired).toBe(false);
    expect(result.successful).toBe(true);
    expect(result.changedTaskCount).toBe(0);
    expect(result.moves).toEqual([]);
    expect(result.backlog).toEqual([]);
  });

  it("does nothing after a +60 capacity increase", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          trigger: "CAPACITY_INCREASE",
          capacityDeltaByDate: {
            "2026-08-18": 60,
          },
        }),
      );

    expect(result.changedTaskCount).toBe(0);
    expect(result.repairRequired).toBe(false);
  });

  it("repairs a -90 fully packed day with one minimal task mutation", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          trigger: "CAPACITY_DECREASE",

          capacityDeltaByDate: {
            "2026-08-18": -90,
          },
        }),
      );

    expect(result.repairRequired).toBe(true);
    expect(result.successful).toBe(true);

    // The canonical week has no spare planning capacity.
    // Therefore a move cannot solve the weekly deficit.
    expect(result.moves).toHaveLength(0);

    // Exactly one 90-minute task is enough.
    expect(result.backlog).toHaveLength(1);
    expect(result.backlog[0]?.taskId).toBe(
      "task-05",
    );
    expect(
      result.backlog[0]?.remainingMinutes,
    ).toBe(90);

    expect(result.changedTaskCount).toBe(1);
    expect(result.backlogMinutes).toBe(90);
  });

  it("moves work to the nearest future slack before using backlog", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          trigger: "CAPACITY_DECREASE",

          capacityDeltaByDate: {
            "2026-08-18": -50,
            "2026-08-19": 50,
          },
        }),
      );

    expect(result.successful).toBe(true);
    expect(result.backlog).toEqual([]);
    expect(result.moves).toHaveLength(1);

    expect(result.moves[0]?.taskId).toBe(
      "task-06",
    );

    expect(result.moves[0]?.fromDate).toBe(
      "2026-08-18",
    );

    expect(result.moves[0]?.toDate).toBe(
      "2026-08-19",
    );

    expect(
      result.moves[0]?.remainingMinutes,
    ).toBe(50);
  });

  it("preserves partial work when an untouched task can repair the overload", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          currentDate: "2026-08-18",
          trigger: "CAPACITY_DECREASE",

          completedMinutesByTaskId: {
            "task-01": 90,
            "task-02": 50,
            "task-03": 70,
            "task-04": 30,

            "task-05": 10,
          },

          completedTaskIds: [
            "task-01",
            "task-02",
            "task-03",
            "task-04",
          ],

          partiallyCompletedTaskIds: [
            "task-05",
          ],

          studiedMinutesByDate: {
            "2026-08-17": 240,
            "2026-08-18": 10,
          },

          capacityDeltaByDate: {
            "2026-08-18": -50,
          },
        }),
      );

    expect(result.successful).toBe(true);

    const changedIds = [
      ...result.moves.map(
        (item) => item.taskId,
      ),
      ...result.backlog.map(
        (item) => item.taskId,
      ),
    ];

    expect(changedIds).not.toContain(
      "task-05",
    );

    expect(changedIds).toContain(
      "task-06",
    );
  });

  it("never moves an active task", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          currentDate: "2026-08-18",
          trigger: "CAPACITY_DECREASE",

          completedMinutesByTaskId: {
            "task-01": 90,
            "task-02": 50,
            "task-03": 70,
            "task-04": 30,

            "task-05": 10,
          },

          completedTaskIds: [
            "task-01",
            "task-02",
            "task-03",
            "task-04",
          ],

          activeTaskIds: ["task-05"],

          studiedMinutesByDate: {
            "2026-08-17": 240,
            "2026-08-18": 10,
          },

          capacityDeltaByDate: {
            "2026-08-18": -90,
          },
        }),
      );

    const changedIds = [
      ...result.moves.map(
        (item) => item.taskId,
      ),
      ...result.backlog.map(
        (item) => item.taskId,
      ),
    ];

    expect(changedIds).not.toContain(
      "task-05",
    );
  });

  it("never pulls work into an earlier date", () => {
    const result =
      repairCurrentPlanLocallyV1(
        buildFoundationWeekGoldenSnapshotV2({
          trigger: "CAPACITY_DECREASE",

          capacityDeltaByDate: {
            "2026-08-19": -30,
            "2026-08-18": 120,
            "2026-08-20": 30,
          },
        }),
      );

    for (const move of result.moves) {
      expect(
        move.toDate > move.fromDate,
      ).toBe(true);
    }
  });

  it("is deterministic for the same snapshot", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger: "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -50,
          "2026-08-19": 50,
        },
      });

    const first =
      repairCurrentPlanLocallyV1(snapshot);

    const second =
      repairCurrentPlanLocallyV1(snapshot);

    expect(first).toEqual(second);
  });
});
