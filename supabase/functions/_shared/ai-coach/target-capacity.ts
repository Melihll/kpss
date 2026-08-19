import { loadAdaptiveBase } from "../adaptive.ts";

type Client = any;

export interface TargetCapacityLookupInput {
  readonly client: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly effectiveDate: string;
}

function assertRow(result: any, label: string): any {
  if (result?.error || !result?.data) {
    throw new Error(`AI_COACH_TARGET_CAPACITY_${label.toUpperCase().replace(/\s+/g, "_")}_FAILED`);
  }
  return result.data;
}

export async function loadCurrentGrossCapacityForDate(
  input: TargetCapacityLookupInput,
): Promise<number> {
  const profileResult = await input.client
    .from("exam_profiles")
    .select("*")
    .eq("id", input.examProfileId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .single();

  const profile = assertRow(profileResult, "profile lookup");

  const planResult = await input.client
    .from("weekly_plans")
    .select([
      "id",
      "user_id",
      "exam_profile_id",
      "week_start_date",
      "week_end_date",
      "available_minutes",
      "planning_budget_minutes",
      "planned_minutes",
      "status",
      "generation_version",
    ].join(","))
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .eq("status", "active")
    .lte("week_start_date", input.currentDate)
    .gte("week_end_date", input.currentDate)
    .order("generation_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = assertRow(planResult, "weekly plan lookup");

  if (
    input.effectiveDate < input.currentDate ||
    input.effectiveDate < plan.week_start_date ||
    input.effectiveDate > plan.week_end_date
  ) {
    throw new Error("AI_COACH_TARGET_CAPACITY_DATE_OUT_OF_RANGE");
  }

  const adaptive = await loadAdaptiveBase(
    input.client,
    input.userId,
    profile,
    plan,
  );

  const gross = adaptive.grossDayCapacities?.[input.effectiveDate];
  const planning = adaptive.dayCapacities?.[input.effectiveDate];
  const value = gross ?? planning;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("AI_COACH_TARGET_CAPACITY_VALUE_MISSING");
  }

  return Math.max(0, value);
}
