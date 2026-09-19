import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadProactiveCoachActiveSessionReadOnly } from "../../supabase/functions/_shared/proactive-coach-active-session-readonly.ts";
import { createLocalAuthenticatedClient } from "./_helpers/local-auth.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!url || !anonKey || !serviceRoleKey || !jwtSecret) {
  throw new Error("Local Supabase credentials are required.");
}
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
  throw new Error("PROACTIVE_ACTIVE_SESSION_INTEGRATION_REQUIRES_LOOPBACK_SUPABASE");
}

const EDITION = "11000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-09-19T09:00:00.000Z");

function signupClient() {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function serviceClient() {
  return createClient(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({
    email: `proactive-${label}-${suffix}@example.test`,
    password: `Safe-${suffix}`,
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}

async function createProfile(api: SupabaseClient, userId: string, status: "active" | "draft") {
  const result = await api
    .from("exam_profiles")
    .insert({
      user_id: userId,
      exam_edition_id: EDITION,
      preparation_start_date: "2026-09-01",
      target_exam_date: "2027-08-01",
      status,
    })
    .select("id")
    .single();
  expect(result.error).toBeNull();
  return result.data!.id as string;
}

async function snapshotRows(api: SupabaseClient, userId: string) {
  const sessions = await api
    .from("study_sessions")
    .select("id,user_id,exam_profile_id,status,started_at,updated_at")
    .eq("user_id", userId)
    .order("id");
  const confirmed = await api
    .from("confirmed_action_proposals")
    .select("id,status")
    .eq("user_id", userId)
    .order("id");
  const planner = await api
    .from("planning_v2_proposals")
    .select("id,status")
    .eq("user_id", userId)
    .order("id");
  expect(sessions.error).toBeNull();
  expect(confirmed.error).toBeNull();
  expect(planner.error).toBeNull();
  return {
    sessions: sessions.data,
    confirmed: confirmed.data,
    planner: planner.data,
  };
}

describe("Proactive Coach active-session read-only local adapter", () => {
  const signup = signupClient();
  const service = serviceClient();
  let owner: User;
  let other: User;
  let ownerActor: SupabaseClient;
  let otherActor: SupabaseClient;
  let ownerProfileId: string;
  let ownerOtherProfileId: string;
  let sessionId: string;

  beforeAll(async () => {
    owner = await register(signup, "owner");
    other = await register(signup, "other");
    ownerActor = createLocalAuthenticatedClient({
      url: url!,
      anonKey: anonKey!,
      jwtSecret: jwtSecret!,
      userId: owner.id,
    });
    otherActor = createLocalAuthenticatedClient({
      url: url!,
      anonKey: anonKey!,
      jwtSecret: jwtSecret!,
      userId: other.id,
    });
    ownerProfileId = await createProfile(ownerActor, owner.id, "active");
    ownerOtherProfileId = await createProfile(ownerActor, owner.id, "draft");

    const session = await ownerActor
      .from("study_sessions")
      .insert({
        user_id: owner.id,
        exam_profile_id: ownerProfileId,
        session_type: "custom",
        started_at: "2026-09-19T08:00:00.000Z",
        status: "active",
        entry_source: "web",
      })
      .select("id")
      .single();
    expect(session.error).toBeNull();
    sessionId = session.data!.id;
  });

  it("resolves only the exact authenticated user/profile and creates zero mutations", async () => {
    const before = await snapshotRows(service, owner.id);

    const ownerResult = await loadProactiveCoachActiveSessionReadOnly({
      client: ownerActor,
      userId: owner.id,
      examProfileId: ownerProfileId,
      now: NOW,
    });
    const wrongProfileResult = await loadProactiveCoachActiveSessionReadOnly({
      client: ownerActor,
      userId: owner.id,
      examProfileId: ownerOtherProfileId,
      now: NOW,
    });
    const crossUserResult = await loadProactiveCoachActiveSessionReadOnly({
      client: otherActor,
      userId: owner.id,
      examProfileId: ownerProfileId,
      now: NOW,
    });

    const after = await snapshotRows(service, owner.id);
    expect(ownerResult).toEqual({
      availability: "known",
      value: {
        active: true,
        sessionId,
        startedAt: "2026-09-19T08:00:00+00:00",
      },
      source: "study_sessions_active_readonly",
      asOf: NOW.toISOString(),
      unavailableReason: null,
    });
    expect(wrongProfileResult).toMatchObject({
      availability: "known",
      value: { active: false },
    });
    expect(crossUserResult).toMatchObject({
      availability: "known",
      value: { active: false },
    });
    expect(after).toEqual(before);
    console.info("PROACTIVE_ACTIVE_SESSION_DB_MUTATION_DELTA=0");
    console.info("PROACTIVE_ACTIVE_SESSION_PLANNER_MUTATION_DELTA=0");
  });
});
