import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
// The importer is intentionally plain ESM so it can also run as a standalone CLI.
// @ts-expect-error no declaration file is needed by the integration harness.
import { runImporter } from "../../scripts/import-p48-canonical.mjs";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Supabase URL, anon key and service-role key are required.");

const EDITION = "11000000-0000-0000-0000-000000000001";
const CONSUMER_SECTION_KEY = "p48:31000000-0000-0000-0000-000000000018:section:002";

function anonymousClient() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function createActor(label: string) {
  const api = anonymousClient();
  const unique = randomUUID();
  const signup = await api.auth.signUp({ email: `canonical-${label}-${unique}@example.test`, password: `Safe-${unique}` });
  expect(signup.error).toBeNull();
  const user = signup.data.user!;
  const profile = await api.from("exam_profiles").insert({
    user_id: user.id, exam_edition_id: EDITION, preparation_start_date: "2026-08-01", target_exam_date: "2027-09-06", status: "active",
  }).select("id").single();
  expect(profile.error).toBeNull();
  return { api, userId: user.id, profileId: profile.data!.id };
}

describe("P48 canonical importer and baseline persistence", () => {
  let actorA: Awaited<ReturnType<typeof createActor>>;
  let actorB: Awaited<ReturnType<typeof createActor>>;
  let firstApply: any;

  beforeAll(async () => {
    actorA = await createActor("a");
    actorB = await createActor("b");
    const boot = await actorA.api.rpc("bootstrap_p48_strategy");
    expect(boot.error).toBeNull();
    firstApply = await runImporter({ mode: "apply", userId: actorA.userId, examProfileId: actorA.profileId });
  }, 60_000);

  it("imports canonical sections, execution units, baseline tasks and task links", async () => {
    expect(firstApply.create).toEqual({ sections: 237, units: 45, tasks: 35 });
    const [sections, units, tasks, links, week, days] = await Promise.all([
      actorA.api.from("resource_sections").select("id", { count: "exact", head: true }),
      actorA.api.from("resource_units").select("id", { count: "exact", head: true }),
      actorA.api.from("tasks").select("id", { count: "exact", head: true }).eq("source_reason", "baseline_import")
        .not("curriculum_node_id", "is", null).not("resource_section_id", "is", null),
      actorA.api.from("task_resource_units").select("id", { count: "exact", head: true }),
      actorA.api.from("p48_week_capacity_overrides").select("capacity_minutes,planning_budget_minutes,reserve_minutes").eq("week_start_date", "2026-08-17").single(),
      actorA.api.from("p48_daily_capacity_overrides").select("capacity_date,capacity_minutes,reserve_minutes")
        .gte("capacity_date", "2026-08-17").lte("capacity_date", "2026-08-23").order("capacity_date"),
    ]);
    expect(sections.count).toBe(237);
    expect(units.count).toBe(45);
    expect(tasks.count).toBe(35);
    expect(links.count).toBe(45);
    expect(week.data).toEqual({ capacity_minutes: 2520, planning_budget_minutes: 2310, reserve_minutes: 210 });
    expect(days.data).toEqual([
      { capacity_date: "2026-08-17", capacity_minutes: 360, reserve_minutes: 30 },
      { capacity_date: "2026-08-18", capacity_minutes: 360, reserve_minutes: 15 },
      { capacity_date: "2026-08-19", capacity_minutes: 360, reserve_minutes: 30 },
      { capacity_date: "2026-08-20", capacity_minutes: 360, reserve_minutes: 30 },
      { capacity_date: "2026-08-21", capacity_minutes: 360, reserve_minutes: 30 },
      { capacity_date: "2026-08-22", capacity_minutes: 360, reserve_minutes: 30 },
      { capacity_date: "2026-08-23", capacity_minutes: 360, reserve_minutes: 45 },
    ]);
  });

  it("is idempotent on a second apply", async () => {
    const second = await runImporter({ mode: "apply", userId: actorA.userId, examProfileId: actorA.profileId });
    expect(second.create).toEqual({ sections: 0, units: 0, tasks: 0 });
    expect(second.update).toEqual({ sections: 0, units: 0, deactivatedSections: 0 });
    expect(second.unchanged).toEqual({ sections: 237, units: 45, tasks: 35 });
  }, 60_000);

  it("resolves the Economicus Cilt 1 alias through the existing target without creating a duplicate resource", async () => {
    const targets = await actorA.api.from("p48_resource_targets")
      .select("resource_id,resources(name)").eq("reference_resource_id", "31000000-0000-0000-0000-000000000021").single();
    expect(targets.error).toBeNull();
    expect((targets.data!.resources as any).name).toBe("Economicus İktisat Soru Bankası 1 – Mikro İktisat");
    const resources = await actorA.api.from("resources").select("id", { count: "exact", head: true });
    expect(resources.count).toBe(26);
  });

  it("keeps the second Tüketici slice pending when the first slice completes", async () => {
    const section = await actorA.api.from("resource_sections").select("id").eq("canonical_key", CONSUMER_SECTION_KEY).single();
    expect(section.error).toBeNull();
    const units = await actorA.api.from("resource_units").select("id,page_start,page_end").eq("resource_section_id", section.data!.id).order("page_start");
    expect(units.data).toHaveLength(2);
    const link = await actorA.api.from("task_resource_units").select("task_id").eq("resource_unit_id", units.data![0].id).single();
    const completed = await actorA.api.rpc("complete_task_unit", { p_task_id: link.data!.task_id, p_resource_unit_id: units.data![0].id });
    expect(completed.error).toBeNull();
    const progress = await actorA.api.from("resource_unit_progress").select("resource_unit_id,status").in("resource_unit_id", units.data!.map((unit) => unit.id));
    expect(progress.data).toEqual([{ resource_unit_id: units.data![0].id, status: "completed" }]);
  });

  it("enforces user/profile isolation before importer writes and through RLS", async () => {
    await expect(runImporter({ mode: "apply", userId: actorA.userId, examProfileId: actorB.profileId }))
      .rejects.toThrow("INVALID_EXAM_PROFILE_OWNERSHIP");
    const visibleToA = await actorA.api.from("resource_sections").select("id").limit(1).single();
    expect(visibleToA.error).toBeNull();
    const hiddenFromB = await actorB.api.from("resource_sections").select("id").eq("id", visibleToA.data!.id);
    expect(hiddenFromB.data).toEqual([]);
  });
});
