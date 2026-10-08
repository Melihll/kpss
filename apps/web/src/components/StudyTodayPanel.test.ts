// @vitest-environment jsdom
// Handler/state coverage only. Physical pointer coverage lives in tests/browser/.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyTodayPanel } from "./StudyTodayPanel";
import type { RoadmapTask } from "../lib/roadmap";
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../lib/app-api", () => ({ callAppApi: api.call, AppApiError: class extends Error {}, FRIENDLY_API_ERRORS: {} }));
vi.mock("../hooks/useRoadmap", () => ({ useRoadmap: () => ({ data: null }) }));
vi.mock("../hooks/useTaskMaterialDrawer", () => ({ useTaskMaterialDrawer: () => ({ openTaskMaterial: vi.fn(), materialDrawer: null }) }));
vi.mock("./Icon", () => ({ Icon: () => null }));
vi.mock("./QuickAddTaskDrawer", () => ({ QuickAddTaskDrawer: () => null }));
vi.mock("./TaskActionPreviewDrawer", () => ({ TaskActionPreviewDrawer: () => null }));
vi.mock("./PhysicalStudyFinishDialog", () => ({ PhysicalStudyFinishDialog: () => null }));
vi.mock("./ProactiveCoachSurface", () => ({ ProactiveCoachSurface: () => null }));
vi.mock("./TaskMaterialSummary", () => ({ TaskMaterialSummary: () => null, TaskMaterialActions: () => null }));
vi.mock("./StudyMaterialWorkspace", () => ({ StudyMaterialWorkspace: () => null }));
const task: RoadmapTask = { id: "task-1", title: "Math · Questions", description: null, planned_date: "2026-10-08", estimated_minutes: 60, status: "in_progress", work_mode: "questions" };
const session = { id: "session-1", task_id: task.id, started_at: "2026-10-08T10:00:00Z", tasks: { title: task.title }, lifecycle: "legacy" };
let container: HTMLDivElement, root: Root | null, paused: boolean, completed: boolean;
let pauseGate: Promise<void> | null;
const posts = () => api.call.mock.calls.filter(([, options]) => options?.method === "POST").map(([path]) => path);
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>(".focus-session-actions button")].find(b => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name)!;
async function mount(focus = false) {
  root = createRoot(container);
  await act(async () => root!.render(createElement(MemoryRouter, { initialEntries: [focus ? "/session" : "/"] }, createElement(StudyTodayPanel, { focus, onCoach: () => undefined }))));
}
async function click(name: string) { await act(async () => button(name).click()); }
async function unmount() { if (root) { await act(async () => root!.unmount()); root = null; } }
describe("shared Today/Focus session action contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    container = document.createElement("div"); document.body.append(container);
    root = null; paused = false; completed = false; pauseGate = null;
    api.call.mockReset();
    api.call.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === "POST") {
        if (path.endsWith("/pause")) { if (pauseGate) await pauseGate; paused = true; return { paused }; }
        if (path.endsWith("/resume")) { paused = false; return { paused }; }
        if (path.endsWith("/finish")) { completed = true; return { session: { ...session, status: "completed" } }; }
        throw new Error("Unexpected session mutation");
      }
      if (path === "/weekly-plan/current") return { tasks: [task] };
      if (path === "/study-sessions/active") return { session: completed ? null : session, paused, break: paused ? { id: "break-1", session_id: session.id, started_at: "2026-10-08T10:01:00Z", ended_at: null } : null, closedBreakSeconds: 0 };
      if (path === "/execution/summary") return { todayStudyMinutes: 0, weekStudyMinutes: 0, dailyPlan: { tasks: [{ id: task.id, minutes: 60 }], completedTaskIds: [], deferredTaskCount: 0, deferredMinutes: 0, capacityMinutes: 60, remainingCapacityMinutes: 60, totalMinutes: 60, totalCommittedMinutes: 60 } };
      if (path === "/tasks/next") return { task, reason: "default", remainingMinutes: 60 };
      throw new Error("Unexpected GET");
    });
  });
  afterEach(async () => { await unmount(); container.remove(); vi.unstubAllGlobals(); });
  for (const focus of [false, true]) {
    it(`${focus ? "Focus" : "Today"}: Pause dispatches only pause and Resume preserves the ID`, async () => {
      await mount(focus); await click("Mola ver");
      expect(posts()).toEqual(["/study-sessions/session-1/pause"]);
      expect(button("Çalışmaya devam et")).toBeDefined();
      await click("Çalışmaya devam et");
      expect(posts()).toEqual(["/study-sessions/session-1/pause", "/study-sessions/session-1/resume"]);
      expect(button("Mola ver")).toBeDefined();
    });
    it(`${focus ? "Focus" : "Today"}: intentional Finish dispatches only finish`, async () => {
      await mount(focus); await click("Çalışmayı Bitir");
      expect(posts()).toEqual(["/study-sessions/session-1/finish"]);
      expect(container.querySelector(".focus-session-actions")).toBeNull();
    });
  }
  it("disables both controls throughout a pending pause and rejects repeat native button activation", async () => {
    let resolve!: () => void; pauseGate = new Promise<void>(yes => { resolve = yes; });
    await mount();
    await act(async () => { button("Mola ver").click(); });
    expect(button("Mola ver").disabled).toBe(true);
    expect(button("Çalışmayı Bitir").disabled).toBe(true);
    await act(async () => { button("Mola ver").click(); button("Çalışmayı Bitir").click(); });
    expect(posts()).toEqual(["/study-sessions/session-1/pause"]);
    await act(async () => resolve());
    expect(button("Çalışmaya devam et").disabled).toBe(false);
  });
  it("keeps action DOM identity through 30 execution refreshes with no session mutation", async () => {
    await mount(); const original = button("Mola ver");
    for (let i = 0; i < 30; i++) await act(async () => window.dispatchEvent(new Event("kpss:execution-changed")));
    expect(button("Mola ver")).toBe(original);
    expect(posts()).toEqual([]);
    await click("Mola ver"); expect(posts()).toEqual(["/study-sessions/session-1/pause"]);
  });
  it("remounts the same paused server session without starting another session", async () => {
    await mount(); await click("Mola ver"); await unmount(); await mount(true);
    expect(button("Çalışmaya devam et")).toBeDefined();
    await click("Çalışmaya devam et");
    expect(posts()).toEqual(["/study-sessions/session-1/pause", "/study-sessions/session-1/resume"]);
  });
});
