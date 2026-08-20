import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeResourceProgress,
  presentResourceProgress,
} from "../supabase/functions/_shared/resource-progress";

describe("resource progress deterministic contract", () => {
  it("tracks page zero before a resource is started", () => {
    expect(normalizeResourceProgress({
      totalPages: 300,
      currentPage: 0,
    })).toEqual({
      totalPages: 300,
      currentPage: 0,
      progressPercent: 0,
      completed: false,
    });
  });

  it("calculates deterministic page progress", () => {
    expect(normalizeResourceProgress({
      totalPages: 300,
      currentPage: 145,
    })).toEqual({
      totalPages: 300,
      currentPage: 145,
      progressPercent: 48,
      completed: false,
    });
  });

  it("marks the source complete only at the final page", () => {
    expect(normalizeResourceProgress({
      totalPages: 300,
      currentPage: 300,
    })).toMatchObject({
      progressPercent: 100,
      completed: true,
    });
  });

  it("rejects invalid total and current page values", () => {
    expect(() => normalizeResourceProgress({
      totalPages: 0,
      currentPage: 0,
    })).toThrow("RESOURCE_PROGRESS_INVALID_TOTAL_PAGES");

    expect(() => normalizeResourceProgress({
      totalPages: 100.5,
      currentPage: 10,
    })).toThrow("RESOURCE_PROGRESS_INVALID_TOTAL_PAGES");

    expect(() => normalizeResourceProgress({
      totalPages: 100,
      currentPage: -1,
    })).toThrow("RESOURCE_PROGRESS_INVALID_CURRENT_PAGE");

    expect(() => normalizeResourceProgress({
      totalPages: 100,
      currentPage: 101,
    })).toThrow("RESOURCE_PROGRESS_INVALID_CURRENT_PAGE");

    expect(() => normalizeResourceProgress({
      totalPages: 100,
      currentPage: 10.5,
    })).toThrow("RESOURCE_PROGRESS_INVALID_CURRENT_PAGE");
  });

  it("presents database rows using the public camelCase contract", () => {
    expect(presentResourceProgress({
      resource_id: "resource-1",
      current_page: 25,
      total_pages: 100,
      created_at: "2026-08-20T08:00:00Z",
      updated_at: "2026-08-20T08:30:00Z",
    })).toEqual({
      resourceId: "resource-1",
      currentPage: 25,
      totalPages: 100,
      progressPercent: 25,
      completed: false,
      createdAt: "2026-08-20T08:00:00Z",
      updatedAt: "2026-08-20T08:30:00Z",
    });
  });
});

describe("P1-08A schema and app-api contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260820110000_create_resource_progress.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("creates a user-scoped resource page progress table with RLS", () => {
    expect(migration).toContain("create table public.resource_progress");
    expect(migration).toContain("primary key (user_id, resource_id)");
    expect(migration).toContain("check (total_pages > 0)");
    expect(migration).toContain("current_page >= 0 and current_page <= total_pages");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain('create policy "Users own resource progress"');
  });

  it("keeps source-page progress separate from resource_unit_progress", () => {
    expect(migration).not.toContain("alter table public.resource_unit_progress");
    expect(migration).not.toContain("update public.resource_unit_progress");
  });

  it("exposes GET and PUT through one resource-scoped route", () => {
    const start = appApi.indexOf("const resourceProgressMatch");
    const end = appApi.indexOf('route === "/weekly-plan/options"', start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const routeBody = appApi.slice(start, end);
    expect(routeBody).toContain('request.method === "GET"');
    expect(routeBody).toContain('request.method === "PUT"');
    expect(routeBody).toContain('from("resource_progress")');
    expect(routeBody).toContain(".upsert(");
    expect(routeBody).toContain('eq("user_id", userId)');
    expect(routeBody).toContain('eq("exam_profile_id", profile.id)');
  });

  it("does not mutate resource status or rebuild plans when page progress changes", () => {
    const start = appApi.indexOf("const resourceProgressMatch");
    const end = appApi.indexOf('route === "/weekly-plan/options"', start);
    const routeBody = appApi.slice(start, end);

    expect(routeBody).not.toContain('from("resources").update');
    expect(routeBody).not.toContain("replace_manual_weekly_plan");
    expect(routeBody).not.toContain("persist_weekly_plan");
    expect(routeBody).not.toContain("recalculateCurrentPlan");
  });
});