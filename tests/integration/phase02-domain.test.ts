import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

const EDITION_ID = "11000000-0000-0000-0000-000000000001";
const MATHEMATICS_ID = "20000000-0000-0000-0000-000000000002";

function client(): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const unique = randomUUID();
  const { data, error } = await api.auth.signUp({
    email: `phase02-${unique}@example.test`,
    password: `Safe-${unique}`,
    options: { data: { display_name: label } },
  });
  expect(error).toBeNull();
  expect(data.session).not.toBeNull();
  return data.user!;
}

describe("Phase 02 catalog, ownership and resource RLS", () => {
  const userAClient = client();
  const userBClient = client();
  let userA: User;
  let userB: User;
  let profileAId: string;
  let resourceAId: string;
  let sectionAId: string;

  beforeAll(async () => {
    userA = await register(userAClient, "Phase 02 User A");
    userB = await register(userBClient, "Phase 02 User B");
  });

  it("lets authenticated users read the deterministic global subject catalog", async () => {
    const { data, error } = await userAClient.from("subjects").select("id, code, name").order("sort_order");
    expect(error).toBeNull();
    expect(data).toHaveLength(14);
    expect(data?.find((subject) => subject.code === "MATEMATIK")?.name).toBe("Matematik");
  });

  it("does not let authenticated users modify the global subject catalog", async () => {
    const { error } = await userAClient
      .from("subjects")
      .update({ name: "Changed" })
      .eq("id", MATHEMATICS_ID);
    expect(error).not.toBeNull();
  });

  it("seeds only the documented representative curriculum sample", async () => {
    const { data, error } = await userAClient
      .from("curriculum_nodes")
      .select("id, name, parent_id")
      .order("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(12);
    expect(data?.some((node) => node.name === "Hareket Problemleri" && node.parent_id)).toBe(true);
  });

  it("lets User A create an owned draft exam profile", async () => {
    const { data, error } = await userAClient
      .from("exam_profiles")
      .insert({
        user_id: userA.id,
        exam_edition_id: EDITION_ID,
        preparation_start_date: "2026-08-07",
        target_exam_date: null,
        status: "draft",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    profileAId = data!.id;
  });

  it("hides User A's exam profile from User B", async () => {
    const { data, error } = await userBClient
      .from("exam_profiles")
      .select("id")
      .eq("id", profileAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("lets User A select a subject once", async () => {
    const { data, error } = await userAClient
      .from("user_subjects")
      .insert({
        user_id: userA.id,
        exam_profile_id: profileAId,
        subject_id: MATHEMATICS_ID,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("rejects a duplicate subject selection", async () => {
    const { error } = await userAClient.from("user_subjects").insert({
      user_id: userA.id,
      exam_profile_id: profileAId,
      subject_id: MATHEMATICS_ID,
      status: "active",
    });
    expect(error?.code).toBe("23505");
  });

  it("prevents User B from adding a subject under User A's profile", async () => {
    const { error } = await userBClient.from("user_subjects").insert({
      user_id: userB.id,
      exam_profile_id: profileAId,
      subject_id: MATHEMATICS_ID,
      status: "active",
    });
    expect(error).not.toBeNull();
  });

  it("initializes all selected-subject curriculum progress rows", async () => {
    const { data, error } = await userAClient.rpc("initialize_subject_progress", {
      p_exam_profile_id: profileAId,
      p_subject_id: MATHEMATICS_ID,
    });
    expect(error).toBeNull();
    expect(data).toBe(7);
  });

  it("keeps subject progress initialization idempotent", async () => {
    const { data, error } = await userAClient.rpc("initialize_subject_progress", {
      p_exam_profile_id: profileAId,
      p_subject_id: MATHEMATICS_ID,
    });
    expect(error).toBeNull();
    expect(data).toBe(0);

    const { count } = await userAClient
      .from("topic_progress")
      .select("id", { count: "exact", head: true })
      .eq("exam_profile_id", profileAId);
    expect(count).toBe(7);
  });

  it("hides User A's topic progress from User B", async () => {
    const { data, error } = await userBClient
      .from("topic_progress")
      .select("id")
      .eq("exam_profile_id", profileAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets User A create valid availability and rejects invalid windows", async () => {
    const { data, error } = await userAClient
      .from("weekly_availability")
      .insert({
        user_id: userA.id,
        exam_profile_id: profileAId,
        weekday: 1,
        start_time: "14:00",
        end_time: "18:00",
        label: "Pazartesi",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    const { error: invalidError } = await userAClient.from("weekly_availability").insert({
      user_id: userA.id,
      exam_profile_id: profileAId,
      weekday: 1,
      start_time: "18:00",
      end_time: "14:00",
    });
    expect(invalidError?.code).toBe("23514");
  });

  it("prevents User B from reading or changing User A's availability", async () => {
    const { data: readRows, error: readError } = await userBClient
      .from("weekly_availability")
      .select("id")
      .eq("exam_profile_id", profileAId);
    expect(readError).toBeNull();
    expect(readRows).toEqual([]);

    const { data: changedRows, error: changeError } = await userBClient
      .from("weekly_availability")
      .update({ label: "Changed" })
      .eq("exam_profile_id", profileAId)
      .select("id");
    expect(changeError).toBeNull();
    expect(changedRows).toEqual([]);
  });

  it("isolates calendar periods and schedule exceptions by profile owner", async () => {
    const periodResult = await userAClient.from("calendar_periods").insert({
      user_id: userA.id,
      exam_profile_id: profileAId,
      period_type: "midterm",
      name: "Vize haftası",
      start_date: "2026-10-12",
      end_date: "2026-10-18",
      capacity_multiplier: 0.5,
    });
    expect(periodResult.error).toBeNull();

    const exceptionResult = await userAClient.from("schedule_exceptions").insert({
      user_id: userA.id,
      exam_profile_id: profileAId,
      exception_date: "2026-10-13",
      exception_type: "extra_available",
      minutes_delta: 180,
      note: "Ek çalışma zamanı",
    });
    expect(exceptionResult.error).toBeNull();

    const [periodRead, exceptionRead] = await Promise.all([
      userBClient.from("calendar_periods").select("id").eq("exam_profile_id", profileAId),
      userBClient.from("schedule_exceptions").select("id").eq("exam_profile_id", profileAId),
    ]);
    expect(periodRead.error).toBeNull();
    expect(periodRead.data).toEqual([]);
    expect(exceptionRead.error).toBeNull();
    expect(exceptionRead.data).toEqual([]);

    const foreignInsert = await userBClient.from("calendar_periods").insert({
      user_id: userB.id,
      exam_profile_id: profileAId,
      period_type: "custom",
      name: "Forbidden",
      start_date: "2026-10-12",
      end_date: "2026-10-12",
    });
    expect(foreignInsert.error).not.toBeNull();
  });

  it("lets User A create an owned resource", async () => {
    const { data, error } = await userAClient
      .from("resources")
      .insert({
        user_id: userA.id,
        exam_profile_id: profileAId,
        subject_id: MATHEMATICS_ID,
        name: "Matematik Soru Bankası",
        publisher: "Demo Yayınları",
        resource_type: "question_bank",
        resource_role: "primary",
        difficulty: "normal",
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    resourceAId = data!.id;
  });

  it("hides User A's resource from User B", async () => {
    const { data, error } = await userBClient
      .from("resources")
      .select("id")
      .eq("id", resourceAId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("prevents User B from adding sections or units to User A's resource", async () => {
    const { error: sectionError } = await userBClient.from("resource_sections").insert({
      resource_id: resourceAId,
      name: "Forbidden Section",
      sort_order: 1,
    });
    expect(sectionError).not.toBeNull();

    const { error: unitError } = await userBClient.from("resource_units").insert({
      resource_id: resourceAId,
      resource_section_id: null,
      unit_type: "test",
      name: "Forbidden Test",
      sort_order: 1,
    });
    expect(unitError).not.toBeNull();
  });

  it("lets User A add a resource section", async () => {
    const { data, error } = await userAClient
      .from("resource_sections")
      .insert({
        resource_id: resourceAId,
        curriculum_node_id: "30000000-0000-0000-0000-000000000003",
        name: "Problemler",
        sort_order: 1,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    sectionAId = data!.id;
  });

  it("bulk-creates exactly 12 units and skips duplicates idempotently", async () => {
    const args = {
      p_resource_id: resourceAId,
      p_section_id: sectionAId,
      p_prefix: "Test",
      p_start: 1,
      p_end: 12,
      p_unit_type: "test",
    };
    const first = await userAClient.rpc("create_bulk_resource_units", args);
    expect(first.error).toBeNull();
    expect(first.data).toBe(12);
    const second = await userAClient.rpc("create_bulk_resource_units", args);
    expect(second.error).toBeNull();
    expect(second.data).toBe(0);

    const { count, error } = await userAClient
      .from("resource_units")
      .select("id", { count: "exact", head: true })
      .eq("resource_section_id", sectionAId);
    expect(error).toBeNull();
    expect(count).toBe(12);
  });

  it("prevents User B from creating progress for User A's resource unit", async () => {
    const { data: unit } = await userAClient
      .from("resource_units")
      .select("id")
      .eq("resource_section_id", sectionAId)
      .limit(1)
      .single();
    const { error } = await userBClient.from("resource_unit_progress").insert({
      user_id: userB.id,
      resource_unit_id: unit!.id,
      status: "in_progress",
    });
    expect(error).not.toBeNull();
  });
});
