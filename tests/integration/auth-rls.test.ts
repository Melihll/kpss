import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
}

function client(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function register(
  api: SupabaseClient,
  label: string,
): Promise<User> {
  const unique = randomUUID();
  const { data, error } = await api.auth.signUp({
    email: `phase01-${unique}@example.test`,
    password: `Safe-${unique}`,
    options: { data: { display_name: label } },
  });

  expect(error).toBeNull();
  expect(data.session, "Local email confirmations must be disabled").not.toBeNull();
  expect(data.user).not.toBeNull();
  return data.user!;
}

describe("local Auth profile automation and RLS", () => {
  const anonymous = client();
  const userAClient = client();
  const userBClient = client();
  let userA: User;
  let userB: User;

  beforeAll(async () => {
    userA = await register(userAClient, "User A");
    userB = await register(userBClient, "User B");
  });

  it("creates one profile for each Auth signup", async () => {
    const [{ data: profileA, error: errorA }, { data: profileB, error: errorB }] =
      await Promise.all([
        userAClient.from("user_profiles").select("*").eq("id", userA.id).single(),
        userBClient.from("user_profiles").select("*").eq("id", userB.id).single(),
      ]);

    expect(errorA).toBeNull();
    expect(errorB).toBeNull();
    expect(profileA).toMatchObject({
      id: userA.id,
      display_name: "User A",
      timezone: "Europe/Istanbul",
    });
    expect(profileB).toMatchObject({
      id: userB.id,
      display_name: "User B",
      timezone: "Europe/Istanbul",
    });
  });

  it("does not expose profiles to anonymous callers", async () => {
    const { data, error } = await anonymous.from("user_profiles").select("*");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("lets each user read only their own profile", async () => {
    const { data: ownA, error: ownAError } = await userAClient
      .from("user_profiles")
      .select("id")
      .eq("id", userA.id)
      .single();
    const { data: ownB, error: ownBError } = await userBClient
      .from("user_profiles")
      .select("id")
      .eq("id", userB.id)
      .single();
    const { data: foreign, error: foreignError } = await userAClient
      .from("user_profiles")
      .select("id")
      .eq("id", userB.id)
      .maybeSingle();

    expect(ownAError).toBeNull();
    expect(ownBError).toBeNull();
    expect(ownA?.id).toBe(userA.id);
    expect(ownB?.id).toBe(userB.id);
    expect(foreignError).toBeNull();
    expect(foreign).toBeNull();
  });

  it("blocks cross-user updates and allows own-profile updates", async () => {
    const { data: blockedRows, error: blockedError } = await userAClient
      .from("user_profiles")
      .update({ display_name: "Compromised" })
      .eq("id", userB.id)
      .select("id");

    expect(blockedError).toBeNull();
    expect(blockedRows).toEqual([]);

    const { data: unchangedB, error: unchangedError } = await userBClient
      .from("user_profiles")
      .select("display_name")
      .eq("id", userB.id)
      .single();
    expect(unchangedError).toBeNull();
    expect(unchangedB?.display_name).toBe("User B");

    const { data: updatedA, error: updateError } = await userAClient
      .from("user_profiles")
      .update({ display_name: "User A Updated" })
      .eq("id", userA.id)
      .select("display_name, updated_at")
      .single();

    expect(updateError).toBeNull();
    expect(updatedA?.display_name).toBe("User A Updated");
    expect(updatedA?.updated_at).toBeTruthy();
  });
});
