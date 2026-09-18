import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LocalAuthenticatedClientInput {
  readonly url: string;
  readonly anonKey: string;
  readonly jwtSecret: string;
  readonly userId: string;
}

const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
]);

function signedAuthenticatedJwt(
  jwtSecret: string,
  userId: string,
): string {
  const header = Buffer.from(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    }),
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: userId,
      role: "authenticated",
      iss: "supabase-demo",
    }),
  ).toString("base64url");

  const unsigned = `${header}.${payload}`;

  const signature = createHmac(
    "sha256",
    jwtSecret,
  )
    .update(unsigned)
    .digest("base64url");

  return `${unsigned}.${signature}`;
}

/**
 * Local-integration-only PostgREST actor.
 *
 * Auth signup remains real and must happen separately.
 * This client reuses that real auth.users id as auth.uid()
 * while omitting the iat claim that triggers the known local
 * PostgREST v14.15 clock flake.
 */
export function createLocalAuthenticatedClient(
  input: LocalAuthenticatedClientInput,
): SupabaseClient {
  const hostname = new URL(input.url).hostname;

  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      "LOCAL_AUTH_HELPER_REQUIRES_LOOPBACK_SUPABASE",
    );
  }

  if (
    !input.anonKey ||
    !input.jwtSecret ||
    !input.userId
  ) {
    throw new Error(
      "LOCAL_AUTH_HELPER_INPUT_REQUIRED",
    );
  }

  const token = signedAuthenticatedJwt(
    input.jwtSecret,
    input.userId,
  );

  return createClient(
    input.url,
    input.anonKey,
    {
      accessToken: async () => token,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
