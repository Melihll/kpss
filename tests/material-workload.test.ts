import { describe, expect, it } from "vitest";
import {
  projectMaterialWorkload,
} from "../supabase/functions/_shared/material-workload";

describe("P2-07 material workload projection", () => {
  it("projects remaining page workload from the resource's own planned-minute budget", () => {
    expect(projectMaterialWorkload({
      plannedMinutes: 1200,
      page: {
        currentPage: 75,
        totalPages: 300,
      },
    })).toEqual({
      page: {
        currentPage: 75,
        totalPages: 300,
        remainingPages: 225,
        remainingMinutes: 900,
      },
      video: null,
      totalRemainingMinutes: 900,
    });
  });

  it("projects exact remaining video duration in rounded-up minutes", () => {
    expect(projectMaterialWorkload({
      plannedMinutes: 999,
      video: {
        watchedSeconds: 120,
        durationSeconds: 301,
      },
    })).toEqual({
      page: null,
      video: {
        watchedSeconds: 120,
        durationSeconds: 301,
        remainingSeconds: 181,
        remainingMinutes: 4,
      },
      totalRemainingMinutes: 4,
    });
  });

  it("adds page and video components without inventing a global page-rate constant", () => {
    expect(projectMaterialWorkload({
      plannedMinutes: 600,
      page: {
        currentPage: 50,
        totalPages: 100,
      },
      video: {
        watchedSeconds: 600,
        durationSeconds: 1200,
      },
    })).toEqual({
      page: {
        currentPage: 50,
        totalPages: 100,
        remainingPages: 50,
        remainingMinutes: 300,
      },
      video: {
        watchedSeconds: 600,
        durationSeconds: 1200,
        remainingSeconds: 600,
        remainingMinutes: 10,
      },
      totalRemainingMinutes: 310,
    });
  });

  it("clamps completed progress to zero remaining workload", () => {
    expect(projectMaterialWorkload({
      plannedMinutes: 600,
      page: {
        currentPage: 120,
        totalPages: 100,
      },
      video: {
        watchedSeconds: 999,
        durationSeconds: 900,
      },
    })).toEqual({
      page: {
        currentPage: 100,
        totalPages: 100,
        remainingPages: 0,
        remainingMinutes: 0,
      },
      video: {
        watchedSeconds: 900,
        durationSeconds: 900,
        remainingSeconds: 0,
        remainingMinutes: 0,
      },
      totalRemainingMinutes: 0,
    });
  });

  it("returns null when no material-progress signal exists", () => {
    expect(projectMaterialWorkload({
      plannedMinutes: 600,
      page: null,
      video: null,
    })).toBeNull();
  });
});