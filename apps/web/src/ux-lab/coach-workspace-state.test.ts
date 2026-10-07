import { describe, expect, it } from "vitest";
import { createCoachWorkspace, currentTask, elapsedSeconds, pageBoundary, workspaceProposalError, workspaceReducer, type WorkspaceAction } from "./coach-workspace-state";
import { coachProposal, createDemoState, type Proposal } from "./model";

function run(actions: WorkspaceAction[]) { return actions.reduce(workspaceReducer, createCoachWorkspace(0)); }
describe("Concept B shared study workspace", () => {
  it("isolates the combined-resource fixture from A/C", () => {
    const coach = createCoachWorkspace();
    expect(coach.lab.materials.find((m) => m.id === "reditus")?.total).toBe(420);
    expect(createDemoState().materials.find((m) => m.id === "reditus")?.total).toBe(480);
    expect(createDemoState().materials.some((m) => m.id === "account-video")).toBe(false);
  });
  it("starts the session and related player together", () => {
    const state = run([{ type: "start", now: 1000 }, { type: "tick", now: 18500 }]);
    expect(elapsedSeconds(state)).toBe(17);
    expect(state.playlists["account-video"]?.positions[13]).toBe(1411.5);
    expect(currentTask(state)?.id).toBe("today-main");
  });
  it("excludes pauses and preserves sub-second time across resume", () => {
    const state = run([{ type: "start", now: 1000 }, { type: "pause", now: 2750 }, { type: "tick", now: 10000 }, { type: "resume", now: 20000 }, { type: "pause", now: 21500 }, { type: "tick", now: 50000 }]);
    expect(elapsedSeconds(state)).toBe(3);
    expect(state.playlists["account-video"]?.positions[13]).toBe(1397.25);
    expect(state.playlists["account-video"]?.playing).toBe(false);
  });
  it("video pause allows continued book study without pausing the session", () => {
    const state = run([{ type: "video-toggle", resourceId: "account-video", now: 0 }, { type: "video-toggle", resourceId: "account-video", now: 1000 }, { type: "tick", now: 6000 }]);
    expect(elapsedSeconds(state)).toBe(6);
    expect(state.playlists["account-video"]?.positions[13]).toBe(1395);
    expect(state.session?.phase).toBe("running");
  });
  it("keeps page drafts, timer, and individual video positions when switching views/lessons", () => {
    const state = run([{ type: "start", now: 0 }, { type: "draft", taskId: "today-main", value: "151", now: 1000 }, { type: "video-select", resourceId: "account-video", number: 14, now: 3000 }, { type: "video-seek", resourceId: "account-video", seconds: 110, now: 4000 }, { type: "video-select", resourceId: "account-video", number: 13, now: 5000 }]);
    expect(state.playlists["account-video"]?.positions[13]).toBe(1397);
    expect(state.playlists["account-video"]?.positions[14]).toBe(110);
    expect(state.drafts["today-main"]).toBe("151");
    expect(elapsedSeconds(state)).toBe(5);
  });
  it("separates time position from completed playlist count", () => {
    const state = run([{ type: "start", now: 0 }, { type: "video-seek", resourceId: "account-video", seconds: 2930, now: 1000 }, { type: "tick", now: 10000 }]);
    expect(state.playlists["account-video"]?.completed).toHaveLength(12);
    expect(state.lab.materials.find((m) => m.id === "account-video")?.progress).toBe(12);
  });
  it("records natural completion once without automatically starting a new lesson", () => {
    const state = run([{ type: "start", now: 0 }, { type: "video-seek", resourceId: "account-video", seconds: 2929, now: 0 }, { type: "tick", now: 2000 }, { type: "tick", now: 5000 }, { type: "video-complete", resourceId: "account-video", now: 6000 }]);
    expect(state.playlists["account-video"]?.completed).toHaveLength(13);
    expect(state.playlists["account-video"]?.current).toBe(13);
    expect(state.playlists["account-video"]?.playing).toBe(false);
    expect(state.lab.version).toBe(1);
  });
  it("does not skip unwatched videos when updating the contiguous resource boundary", () => {
    const state = run([{ type: "video-select", resourceId: "account-video", number: 15, now: 0 }, { type: "video-complete", resourceId: "account-video", now: 1000 }]);
    expect(state.playlists["account-video"]?.completed).toHaveLength(13);
    expect(state.lab.materials.find((m) => m.id === "account-video")?.progress).toBe(12);
  });
  it("saves an inline page without fabricating time or completing the task", () => {
    const state = run([{ type: "draft", taskId: "today-main", value: "151", now: 0 }, { type: "save-page", taskId: "today-main", now: 1000 }]);
    expect(pageBoundary(state, currentTask(state)!)).toBe(151);
    expect(currentTask(state)?.done).toBe(false);
    expect(currentTask(state)?.studiedSeconds).toBe(0);
    expect(state.session).toBe(null);
  });
  it.each(["", "140", "159", "151.5", "NaN"])("rejects invalid page %s", (value) => {
    const state = run([{ type: "draft", taskId: "today-main", value, now: 0 }, { type: "save-page", taskId: "today-main", now: 1000 }]);
    expect(state.error).toContain("141–158");
    expect(pageBoundary(state, currentTask(state)!)).toBe(141);
  });
  it("finishes a mixed session using the existing page draft, saving time exactly once", () => {
    const state = run([{ type: "start", now: 0 }, { type: "draft", taskId: "today-main", value: "158", now: 1000 }, { type: "finish", now: 61000 }, { type: "save-finish", now: 90000 }, { type: "save-finish", now: 100000 }]);
    expect(currentTask(state)?.done).toBe(true);
    expect(currentTask(state)?.studiedSeconds).toBe(61);
    expect(state.session?.phase).toBe("saved");
    expect(state.playlists["account-video"]?.positions[13]).toBe(1455);
  });
  it("returns from finish without counting time in the review dialog", () => {
    const state = run([{ type: "start", now: 0 }, { type: "finish", now: 1000 }, { type: "resume-edit", now: 100000 }, { type: "pause", now: 102000 }]);
    expect(elapsedSeconds(state)).toBe(3);
  });
  it("supports a physical-only task and partial completion followed by a second session", () => {
    const state = run([{ type: "select", taskId: "today-math", now: 0 }, { type: "start", now: 1000 }, { type: "draft", taskId: "today-math", value: "90", now: 1000 }, { type: "finish", now: 61000 }, { type: "save-finish", now: 62000 }, { type: "select", taskId: "today-math", now: 63000 }, { type: "start", now: 64000 }, { type: "draft", taskId: "today-math", value: "96", now: 65000 }, { type: "finish", now: 124000 }, { type: "save-finish", now: 125000 }]);
    expect(currentTask(state)?.studiedSeconds).toBe(120);
    expect(currentTask(state)?.done).toBe(true);
    expect(Object.values(state.playlists).some((p) => p.playing)).toBe(false);
  });
  it("finishes video-only work using known completion without a manual boundary", () => {
    const state = run([{ type: "select", taskId: "today-video", now: 0 }, { type: "start", now: 0 }, { type: "video-complete", resourceId: "economy", now: 60000 }, { type: "finish", now: 61000 }, { type: "save-finish", now: 62000 }]);
    expect(currentTask(state)?.done).toBe(true);
    expect(currentTask(state)?.studiedSeconds).toBe(61);
  });
  it("records video-only partial time while preserving the unfinished task", () => {
    const state = run([{ type: "select", taskId: "today-video", now: 0 }, { type: "start", now: 0 }, { type: "finish", now: 10000 }, { type: "save-finish", now: 15000 }]);
    expect(currentTask(state)?.done).toBe(false);
    expect(currentTask(state)?.studiedSeconds).toBe(10);
  });
  it("prevents a second task from replacing an active session", () => {
    const state = run([{ type: "start", now: 0 }, { type: "select", taskId: "today-math", now: 1000 }]);
    expect(currentTask(state)?.id).toBe("today-main");
    expect(state.notice).toContain("Önce");
    expect(state.playlists["account-video"]?.playing).toBe(true);
  });
  it("protects active work from edits and still allows independent reviewed changes", () => {
    const state = run([{ type: "start", now: 0 }]);
    const task = currentTask(state)!;
    const proposal: Proposal = { version: state.lab.version, title: "Move", reason: "Test", changes: [{ before: task, after: { ...task, day: 4 } }] };
    expect(workspaceProposalError(state, proposal)).toContain("Bu çalışma sürüyor");
    expect(workspaceReducer(state, { type: "apply", proposal, now: 1000 }).lab).toBe(state.lab);
    const accepted = workspaceReducer(state, { type: "apply", proposal: coachProposal(state.lab), now: 1000 });
    expect(accepted.lab.tasks.find((t) => t.id === "fri-math")?.day).toBe(5);
  });
  it("invalidates a plan proposal after inline page progress changed", () => {
    const initial = createCoachWorkspace();
    const proposal = coachProposal(initial.lab);
    const updated = workspaceReducer(workspaceReducer(initial, { type: "draft", taskId: "today-main", value: "151", now: 0 }), { type: "save-page", taskId: "today-main", now: 1000 });
    expect(workspaceProposalError(updated, proposal)).toContain("Bu sırada planın değişti");
  });
  it("selects remaining today work after the current, unstarted task is moved", () => {
    const state = createCoachWorkspace();
    const task = currentTask(state)!;
    const moved = workspaceReducer(state, { type: "apply", now: 0, proposal: { version: state.lab.version, title: "Move", reason: "Test", changes: [{ before: task, after: { ...task, day: 4 } }] } });
    expect(currentTask(moved)?.id).toBe("today-math");
  });
});
