import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("W3 web and server runtime contract", () => {
  const adapter = source("supabase/functions/_shared/physical-study-lifecycle.ts");
  const appApi = source("supabase/functions/app-api/index.ts");
  const today = source("apps/web/src/components/StudyTodayPanel.tsx");
  const execution = source("apps/web/src/components/ExecutionPanel.tsx");
  const dialog = source("apps/web/src/components/PhysicalStudyFinishDialog.tsx");

  it("keeps all physical lifecycle mutation selection in one server adapter", () => {
    expect(appApi).toContain("PhysicalStudyLifecycleService");
    expect(appApi).not.toContain("start_physical_study_session");
    expect(appApi).not.toContain("finish_physical_study_session");
    expect(adapter).toContain('"start_physical_study_session"');
    expect(adapter).toContain('"pause_physical_study_session"');
    expect(adapter).toContain('"resume_physical_study_session"');
    expect(adapter).toContain('"finish_physical_study_session"');
    expect(adapter).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("uses one explicit boundary dialog from both web finish controls", () => {
    expect(today).toContain("PhysicalStudyFinishDialog");
    expect(execution).toContain("PhysicalStudyFinishDialog");
    expect(today).toContain("completedThroughPage");
    expect(execution).toContain("completedThroughPage");
    expect(dialog).toContain("Kaçıncı sayfaya kadar tamamladın?");
    expect(dialog).toContain("yeni sayfa tamamlanmadı");
    expect(dialog).toContain("hız kanıtı oluşmaz");
  });

  it("preserves proposal-only study deviation handling after either finish path", () => {
    expect(appApi).toContain('previewCurrentPlan(client,userId,profile,plan,"study_deviation")');
    expect(appApi).toContain("planMutationApplied:false");
    expect(appApi).not.toMatch(/recalculateCurrentPlan\([^\n]+study_deviation/);
  });

  it("does not expose generic cancel for a W2-owned web session", () => {
    expect(execution).toContain('active.lifecycle !== "physical_v1"');
    expect(adapter).toContain("PHYSICAL_SESSION_CANCEL_UNAVAILABLE");
  });
});
