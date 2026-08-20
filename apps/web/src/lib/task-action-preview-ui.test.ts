import { describe, expect, it } from "vitest";
import {
  taskActionLabel,
  taskActionMessage,
  taskActionStatusLabel,
  type TaskActionPreviewResponse,
} from "./task-action-preview-ui";

function preview(
  patch: Partial<TaskActionPreviewResponse> = {},
): TaskActionPreviewResponse {
  return {
    kind: "TASK_ACTION_PREVIEW",
    previewOnly: true,
    replacesWeeklyPlan: false,
    applyRecommended: false,
    action: "DEFER",
    status: "READY",
    task: {
      id: "task-1",
      title: "Anayasa tekrar",
      subjectName: "Vatandaşlık",
      resourceName: null,
      plannedDate: "2026-08-20",
      status: "planned",
      estimatedMinutes: 60,
      completedMinutes: 15,
      remainingMinutes: 45,
      active: false,
    },
    duration: {
      estimatedMinutes: 60,
      completedMinutes: 15,
      remainingMinutes: 45,
    },
    changes: [{
      changeType: "MOVE",
      taskId: "task-1",
      fromDate: "2026-08-20",
      toDate: "2026-08-21",
      remainingMinutes: 45,
      reasonCodes: [],
    }],
    proposal: { moves: [{}], backlog: [], changedTaskCount: 1 },
    capacity: { targetRemainingMinutes: 90, afterMoveMinutes: 45 },
    reasonCodes: [],
    mutations: [],
    ...patch,
  };
}

describe("task action preview UI presenter", () => {
  it("labels all three task actions", () => {
    expect(taskActionLabel("DEFER")).toBe("Ertele");
    expect(taskActionLabel("REMOVE_TODAY")).toBe("Bugünden çıkar");
    expect(taskActionLabel("DURATION_DETAILS")).toBe("Süre detayları");
  });

  it("presents a MOVE preview", () => {
    const result = preview();
    expect(taskActionStatusLabel(result)).toBe("Taşıma önizlemesi hazır");
    expect(taskActionMessage(result)).toContain("2026-08-21");
  });

  it("presents a BACKLOG preview", () => {
    const result = preview({
      action: "REMOVE_TODAY",
      changes: [{
        changeType: "BACKLOG",
        taskId: "task-1",
        fromDate: "2026-08-20",
        toDate: null,
        remainingMinutes: 45,
        reasonCodes: [],
      }],
      proposal: { moves: [], backlog: [{}], changedTaskCount: 1 },
    });
    expect(taskActionStatusLabel(result)).toBe("Backlog önizlemesi hazır");
    expect(taskActionMessage(result)).toContain("backlog");
  });

  it("presents duration details without implying a mutation", () => {
    const result = preview({
      action: "DURATION_DETAILS",
      status: "INFO",
      changes: [],
      proposal: { moves: [], backlog: [], changedTaskCount: 0 },
    });
    expect(taskActionStatusLabel(result)).toBe("Süre bilgisi");
    expect(taskActionMessage(result)).toContain("kalan 45 dk");
  });

  it("translates a blocked defer reason", () => {
    const result = preview({
      status: "BLOCKED",
      changes: [],
      proposal: { moves: [], backlog: [], changedTaskCount: 0 },
      reasonCodes: ["NO_FEASIBLE_FUTURE_DAY", "NO_AUTOMATIC_MUTATION"],
    });
    expect(taskActionMessage(result)).toContain("uygun bir gün bulunamadı");
  });
});