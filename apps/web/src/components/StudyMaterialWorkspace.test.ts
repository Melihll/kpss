import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudyMaterialWorkspace } from "./StudyMaterialWorkspace";
import type { RoadmapTask } from "../lib/roadmap";

vi.mock("../lib/app-api", () => ({ callAppApi: vi.fn(), FRIENDLY_API_ERRORS: {}, AppApiError: class extends Error {} }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "local-test-owner" } }) }));
const task: RoadmapTask = { id: "task", title: "Ders", description: null, planned_date: "2026-10-05", estimated_minutes: 45, status: "ready", work_mode: "book", material_resource_id: "resource", resources: { name: "Kitap", resource_type: "book" }, material_scope: { kind: "page_range", resourceId: "resource", resourceUnitId: "unit", pageStart: 142, pageEnd: 158, completedThroughPage: 141, completed: false } };
function render(value: RoadmapTask, capture = false) {
  return renderToStaticMarkup(createElement(StudyMaterialWorkspace, { task: value, capture: capture ? { pageStart: 142, pageEnd: 158, startPageBoundary: 141 } : null, pageDraft: "150", onPageDraft: () => undefined, playback: "ready", visible: true }));
}
describe("real material workspace", () => {
  it("keeps protected physical progress as a draft for atomic finish, with no standalone save form", () => {
    const html = render(task, true);
    expect(html).toContain('value="150"');
    expect(html).toContain('min="141"');
    expect(html).toContain('max="158"');
    expect(html).toContain("sürenle birlikte kaydedilir");
    expect(html).not.toContain("resource-progress-panel");
    expect(html).not.toContain("Video çalışma alanı");
  });
  it("uses exact video material identity and shows no physical page input", () => {
    const html = render({ ...task, work_mode: "video", material_scope: { kind: "full_video", resourceId: "resource", youtubePlaylistVideoId: "video-id", title: "Ders 4", position: 4, durationSeconds: 1200, watchedSeconds: 0, completed: false } });
    expect(html).toContain("Video çalışma alanı");
    expect(html).not.toContain("Kitap çalışma alanı");
    expect(html).not.toContain("Geldiğin sayfa");
  });
  it("does not manufacture a resource identity from the title", () => {
    const html = render({ ...task, material_resource_id: null, resources: null, material_scope: null });
    expect(html).toContain("kaynak bağlanmamış");
    expect(html).not.toContain("study-materials");
  });
});
