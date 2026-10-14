import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Called after JWT and active-profile verification. This route has exactly one read RPC.
export async function weeklyStudyViewRoute(request: Request, route: string, client: SupabaseClient, profileId: string, currentWeek: string, json: (body: unknown, status?: number) => Response, presentMaterials?: (view: any) => Promise<any>): Promise<Response | null> {
  if (route !== "/week/view") return null;
  if (request.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => !["weekStart", "profileId"].includes(k))) return json({ error: { code: "INVALID_WEEK" } }, 422);
  if (params.has("profileId") && params.get("profileId") !== profileId) return json({ error: { code: "EXAM_PROFILE_NOT_FOUND" } }, 404);
  const week = params.get("weekStart") ?? currentWeek;
  const date = new Date(`${week}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== week || date.getUTCDay() !== 1) return json({ error: { code: "INVALID_WEEK" } }, 422);
  const result = await client.rpc("weekly_study_view", { p_exam_profile_id: profileId, p_week_start: week });
  if (result.error) {
    const missing = ["PGRST202", "42883", "42P01"].includes(result.error.code);
    const code = missing ? "WEEK_VIEW_UNAVAILABLE" : ["UNAUTHORIZED", "EXAM_PROFILE_NOT_FOUND", "UNSUPPORTED_WEEK"].find(c => result.error!.message.includes(c)) ?? "WEEK_VIEW_FAILED";
    return json({ error: { code } }, missing ? 503 : code === "UNAUTHORIZED" ? 401 : code === "EXAM_PROFILE_NOT_FOUND" ? 404 : code === "UNSUPPORTED_WEEK" ? 422 : 500);
  }
  if (result.data?.contractVersion !== "weekly-study-view-v1" || result.data.profileId !== profileId || result.data.weekStart !== week) return json({ error: { code: "WEEK_VIEW_UNAVAILABLE" } }, 503);
  return json(presentMaterials ? await presentMaterials(result.data) : result.data);
}
