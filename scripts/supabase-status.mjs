import { runLocalSupabase } from "./supabase-command.mjs";

export function readLocalSupabaseStatus() {
  const result = runLocalSupabase(["status", "-o", "json"], { capture: true });

  if (result.status !== 0) {
    throw new Error(
      `Local Supabase is unavailable. Run pnpm supabase:start first.\n${result.stderr}`,
    );
  }

  const status = JSON.parse(result.stdout);
  const url = status.API_URL ?? status.api_url;
  const anonKey =
    status.ANON_KEY ??
    status.PUBLISHABLE_KEY ??
    status.anon_key ??
    status.publishable_key;
  const serviceRoleKey =
    status.SERVICE_ROLE_KEY ??
    status.SECRET_KEY ??
    status.service_role_key ??
    status.secret_key;

  if (!url || !anonKey) {
    throw new Error("Supabase status did not return API_URL and an anon/publishable key.");
  }

  return { url, anonKey, serviceRoleKey };
}
