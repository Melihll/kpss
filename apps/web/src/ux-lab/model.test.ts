import { describe, expect, it } from "vitest";
import { applyProposal, coachProposal, createDemoState, finishStudy, proposalError, studiedMinutes, type Proposal } from "./model";

describe("isolated UX Lab behavior", () => {
  it("only applies an explicitly reviewed proposal and rejects repeat/stale application", () => {
    const state = createDemoState();
    const before = JSON.stringify(state);
    const proposal = coachProposal(state);
    expect(proposal.changes).toHaveLength(2);
    expect(JSON.stringify(state)).toBe(before);
    const after = applyProposal(state, proposal);
    expect(after.tasks.find((t) => t.id === "fri-math")?.day).toBe(5);
    expect(after.tasks.find((t) => t.id === "fri-law")?.minutes).toBe(45);
    expect(after.tasks.filter((t) => t.day === 3)).toEqual(state.tasks.filter((t) => t.day === 3));
    expect(applyProposal(after, proposal)).toBe(after);
  });
  it("records partial progress, resumes, and never reverses material progress", () => {
    const state = createDemoState();
    const initialMinutes = studiedMinutes(state.tasks);
    const partial = finishStudy(state, "today-main", 134, 125);
    expect(partial.materials[0]?.progress).toBe(134);
    expect(partial.tasks.find((t) => t.id === "today-main")?.done).toBe(false);
    expect(studiedMinutes(partial.tasks)).toBeCloseTo(initialMinutes + 125 / 60);
    expect(finishStudy(partial, "today-main", 130, 100)).toBe(partial);
    const done = finishStudy(partial, "today-main", 142, 75);
    expect(done.tasks.find((t) => t.id === "today-main")?.studiedSeconds).toBe(200);
    expect(done.tasks.find((t) => t.id === "today-main")?.done).toBe(true);
    expect(finishStudy(done, "today-main", 142, 75)).toBe(done);
  });
  it("accepts no new pages without inventing progress or completing the task", () => {
    const state = createDemoState();
    const after = finishStudy(state, "today-main", 126, 90);
    expect(after.materials[0]?.progress).toBe(126);
    expect(after.tasks.find((t) => t.id === "today-main")?.done).toBe(false);
    expect(after.tasks.find((t) => t.id === "today-main")?.studiedSeconds).toBe(90);
  });
  it("validates boundaries and seconds for book and video work", () => {
    const state = createDemoState();
    for (const page of [125, 143, 130.5, NaN]) expect(finishStudy(state, "today-main", page, 20)).toBe(state);
    for (const seconds of [-2, Infinity, NaN]) expect(finishStudy(state, "today-main", 142, seconds)).toBe(state);
    const after = finishStudy(state, "today-video", 13, 90);
    expect(after.materials.find((m) => m.id === "economy")?.progress).toBe(13);
    expect(after.tasks.find((t) => t.id === "today-video")?.done).toBe(true);
  });
  it("refuses over-capacity plans and capacity reduction below planned work", () => {
    const state = createDemoState();
    const proposal: Proposal = { version: state.version, title: "test", reason: "test", changes: [], capacity: { day: 3, before: 240, after: 30 } };
    expect(proposalError(state, proposal)).toContain("Önce bir çalışmayı taşı");
    expect(applyProposal(state, proposal)).toBe(state);
  });
  it("supports add, edit and remove without touching the input state", () => {
    const state = createDemoState();
    const task = { ...state.tasks.find((t) => t.id === "fri-math")!, id: "new-task", minutes: 30 };
    const added = applyProposal(state, { version: 0, title: "test", reason: "test", changes: [{ before: null, after: task }] });
    expect(added.tasks).toHaveLength(state.tasks.length + 1);
    const edited = applyProposal(added, { version: 1, title: "test", reason: "test", changes: [{ before: task, after: { ...task, day: 6 } }] });
    expect(edited.tasks.find((t) => t.id === task.id)?.day).toBe(6);
    const removed = applyProposal(edited, { version: 2, title: "test", reason: "test", changes: [{ before: edited.tasks.find((t) => t.id === task.id)!, after: null }] });
    expect(removed.tasks).toEqual(state.tasks);
    expect(state.version).toBe(0);
  });
  it("protects completed work and recorded partial study history", () => {
    const state = finishStudy(createDemoState(), "today-main", 130, 60);
    for (const id of ["today-main", "today-done"]) {
      const task = state.tasks.find((t) => t.id === id)!;
      const proposal: Proposal = { version: state.version, title: "test", reason: "test", changes: [{ before: task, after: null }] };
      expect(applyProposal(state, proposal)).toBe(state);
    }
  });
  it("invalidates a reviewed plan when study progress changes", () => {
    const state = createDemoState();
    const proposal = coachProposal(state);
    const after = finishStudy(state, "today-main", 130, 60);
    expect(proposalError(after, proposal)).toContain("planın değişti");
    expect(applyProposal(after, proposal)).toBe(after);
  });
});
