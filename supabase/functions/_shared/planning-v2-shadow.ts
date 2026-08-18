import {
  buildPlanningSnapshotFromDbBundleV1,
  decidePlanningActionV2,
  toPlanningV2ProposalRow,
  toPlanningV2SnapshotRow,
} from "./planning-v2.bundle.js";

import {
  loadAdaptiveBase,
} from "./adaptive.ts";

type Client = any;

type PlanningV2Trigger =
  | "STUDY_COMPLETED"
  | "STUDY_DEVIATION"
  | "CAPACITY_INCREASE"
  | "CAPACITY_DECREASE"
  | "MISSED_DAY"
  | "MASTERY_CHANGE"
  | "WEEKLY_REVIEW"
  | "MANUAL_REPLAN";

export interface RunPlanningV2ShadowDecisionInput {
  readonly client: Client;

  readonly userId: string;
  readonly examProfileId: string;

  readonly currentDate: string;

  readonly trigger: PlanningV2Trigger;

  readonly generatedAt?: string;
}

const VERSIONS = Object.freeze({
  plannerVersion:
    "planning-v2-local-repair-v1",

  scoringVersion:
    "candidate-scoring-v1",

  learnerStateVersion:
    "learner-state-v1",

  snapshotSchemaVersion:
    "planning-snapshot-v2",
});

function assertRow(
  result: any,
  name: string,
) {
  if (result.error) {
    throw new Error(
      `${name}: ${result.error.message ?? result.error}`,
    );
  }

  if (!result.data) {
    throw new Error(
      `${name}: row not found`,
    );
  }

  return result.data;
}

function assertResult(
  result: any,
  name: string,
) {
  if (result.error) {
    throw new Error(
      `${name}: ${result.error.message ?? result.error}`,
    );
  }

  return result.data ?? [];
}

function datePlusDays(
  isoDate: string,
  days: number,
): string {
  const value =
    new Date(`${isoDate}T00:00:00Z`);

  value.setUTCDate(
    value.getUTCDate() + days,
  );

  return value
    .toISOString()
    .slice(0, 10);
}

function weekDates(
  weekStart: string,
): string[] {
  return Array.from(
    { length: 7 },
    (_, index) =>
      datePlusDays(
        weekStart,
        index,
      ),
  );
}

function sortById<T extends { id?: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      String(a.id ?? "")
        .localeCompare(
          String(b.id ?? ""),
        ),
  );
}

async function sha256Hex(
  value: string,
): Promise<string> {
  const encoded =
    new TextEncoder().encode(
      value,
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded,
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

async function existingRowId(
  client: Client,
  table: string,
  filters:
    Record<string, string>,
): Promise<string | null> {
  let query =
    client
      .from(table)
      .select("id");

  for (
    const [key, value]
    of Object.entries(filters)
  ) {
    query =
      query.eq(
        key,
        value,
      );
  }

  const result =
    await query.maybeSingle();

  if (result.error) {
    throw new Error(
      `${table} lookup: ${
        result.error.message ??
        result.error
      }`,
    );
  }

  return result.data?.id ?? null;
}

async function persistImmutableRow(
  client: Client,

  table: string,

  row: Record<string, unknown>,

  filters:
    Record<string, string>,
): Promise<string> {
  const existing =
    await existingRowId(
      client,
      table,
      filters,
    );

  if (existing) {
    return existing;
  }

  const inserted =
    await client
      .from(table)
      .insert(row)
      .select("id")
      .single();

  if (!inserted.error) {
    return inserted.data.id;
  }

  /*
   * Another identical shadow run may
   * have won the race.
   */
  if (
    inserted.error.code ===
    "23505"
  ) {
    const raced =
      await existingRowId(
        client,
        table,
        filters,
      );

    if (raced) {
      return raced;
    }
  }

  throw new Error(
    `${table} insert: ${
      inserted.error.message ??
      inserted.error
    }`,
  );
}

export async function runPlanningV2ShadowDecision(
  input:
    RunPlanningV2ShadowDecisionInput,
) {
  /*
   * ----------------------------------------------------------
   * READ PHASE
   * ----------------------------------------------------------
   */

  const profileResult =
    await input.client
      .from("exam_profiles")
      .select("*")
      .eq(
        "id",
        input.examProfileId,
      )
      .eq(
        "user_id",
        input.userId,
      )
      .eq(
        "status",
        "active",
      )
      .single();

  const profile =
    assertRow(
      profileResult,
      "active exam profile",
    );

  const planResult =
    await input.client
      .from("weekly_plans")
      .select(
        [
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
        ].join(","),
      )
      .eq(
        "user_id",
        input.userId,
      )
      .eq(
        "exam_profile_id",
        input.examProfileId,
      )
      .eq(
        "status",
        "active",
      )
      .lte(
        "week_start_date",
        input.currentDate,
      )
      .gte(
        "week_end_date",
        input.currentDate,
      )
      .order(
        "generation_version",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

  const plan =
    assertRow(
      planResult,
      "active weekly plan",
    );

  /*
   * Reuse the existing production read/projection
   * layer for effective capacities and real study.
   *
   * This call READS state. We do not call
   * recalculateCurrentPlan().
   */
  const adaptive =
    await loadAdaptiveBase(
      input.client,
      input.userId,
      profile,
      plan,
    );

  const [
    learnerStateResult,
    editionResult,
  ] =
    await Promise.all([
      input.client
        .from(
          "learner_unit_states_v2",
        )
        .select("*")
        .eq(
          "user_id",
          input.userId,
        )
        .eq(
          "exam_profile_id",
          input.examProfileId,
        ),

      profile.exam_edition_id
        ? input.client
            .from(
              "exam_editions",
            )
            .select(
              "exam_date",
            )
            .eq(
              "id",
              profile.exam_edition_id,
            )
            .maybeSingle()
        : Promise.resolve({
            data: null,
            error: null,
          }),
    ]);

  const learnerStates =
    assertResult(
      learnerStateResult,
      "learner V2 state",
    );

  if (editionResult.error) {
    throw new Error(
      `exam edition: ${
        editionResult.error.message ??
        editionResult.error
      }`,
    );
  }

  const examDate =
    editionResult.data
      ?.exam_date ??
    null;

  /*
   * ----------------------------------------------------------
   * TASK NORMALIZATION
   * ----------------------------------------------------------
   */

  const rawTasks =
    sortById(
      (adaptive.tasks ?? [])
        .filter(
          (task: any) =>
            task.status !==
            "cancelled",
        ),
    );

  const tasks =
    rawTasks.map(
      (task: any) => ({
        id:
          task.id,

        user_id:
          task.user_id,

        exam_profile_id:
          task.exam_profile_id,

        weekly_plan_id:
          task.weekly_plan_id,

        subject_id:
          task.subject_id,

        curriculum_node_id:
          task.curriculum_node_id ??
          null,

        resource_id:
          task.resource_id ??
          null,

        resource_section_id:
          task.resource_section_id ??
          null,

        task_type:
          task.task_type,

        title:
          task.title,

        planned_date:
          task.planned_date ??
          null,

        estimated_minutes:
          Number(
            task.estimated_minutes ??
            0,
          ),

        priority_score:
          Number(
            task.priority_score ??
            0,
          ),

        importance:
          task.importance ??
          null,

        status:
          task.status,

        completed_at:
          task.completed_at ??
          null,
      }),
    );

  const taskProgress =
    rawTasks.flatMap(
      (task: any) => {
        const progress =
          Array.isArray(
            task.task_progress,
          )
            ? task
                .task_progress[0]
            : task.task_progress;

        if (!progress) {
          return [];
        }

        return [
          {
            task_id:
              task.id,

            user_id:
              task.user_id,

            completed_minutes:
              Number(
                progress.completed_minutes ??
                0,
              ),
          },
        ];
      },
    );

  /*
   * ----------------------------------------------------------
   * EFFECTIVE CAPACITY NORMALIZATION
   * ----------------------------------------------------------
   */

  const dailyCapacities =
    weekDates(
      plan.week_start_date,
    ).map(
      (date) => {
        /*
         * loadAdaptiveBase.dayCapacities is already
         * POST-RESERVE planning capacity.
         *
         * grossDayCapacities is the matching effective
         * gross capacity before reserve.
         */
        const planningCapacity =
          Math.max(
            0,
            Number(
              adaptive
                .dayCapacities?.[
                  date
                ] ??
                0,
            ),
          );

        const grossCapacity =
          Math.max(
            planningCapacity,
            Number(
              adaptive
                .grossDayCapacities?.[
                  date
                ] ??
                planningCapacity,
            ),
          );

        const effectiveReserve =
          Math.max(
            0,
            grossCapacity -
              planningCapacity,
          );

        return {
          date,

          grossCapacityMinutes:
            grossCapacity,

          reserveMinutes:
            effectiveReserve,

          alreadyStudiedMinutes:
            Math.max(
              0,
              Number(
                adaptive
                  .actualMinutesByDate?.[
                    date
                  ] ??
                  0,
              ),
            ),
        };
      },
    );

  const bundle = {
    weeklyPlan: {
      id:
        plan.id,

      user_id:
        plan.user_id,

      exam_profile_id:
        plan.exam_profile_id,

      week_start_date:
        plan.week_start_date,

      week_end_date:
        plan.week_end_date,

      available_minutes:
        Number(
          plan.available_minutes ??
          0,
        ),

      planning_budget_minutes:
        Number(
          plan.planning_budget_minutes ??
          0,
        ),

      planned_minutes:
        Number(
          plan.planned_minutes ??
          0,
        ),

      status:
        plan.status,

      generation_version:
        Number(
          plan.generation_version ??
          1,
        ),
    },

    tasks,

    taskProgress,

    learnerStates:
      [...learnerStates].sort(
        (a: any, b: any) =>
          String(
            a.curriculum_node_id,
          ).localeCompare(
            String(
              b.curriculum_node_id,
            ),
          ),
      ),

    dailyCapacities,
  };

  /*
   * Snapshot fingerprint excludes generatedAt.
   *
   * Same source state + same trigger
   * => same immutable snapshot identity.
   */
  const fingerprintPayload =
    JSON.stringify({
      currentDate:
        input.currentDate,

      trigger:
        input.trigger,

      examDate,

      versions:
        VERSIONS,

      bundle,
    });

  const snapshotHash =
    await sha256Hex(
      fingerprintPayload,
    );

  const snapshotId =
    [
      "planning-v2-shadow",
      plan.id,
      input.trigger,
      snapshotHash.slice(
        0,
        24,
      ),
    ].join(":");

  const generatedAt =
    input.generatedAt ??
    new Date().toISOString();

  /*
   * ----------------------------------------------------------
   * DOMAIN DECISION
   * ----------------------------------------------------------
   */

  const snapshot =
    buildPlanningSnapshotFromDbBundleV1({
      bundle,

      snapshotId,

      snapshotHash,

      generatedAt,

      currentDate:
        input.currentDate,

      trigger:
        input.trigger,

      versions:
        VERSIONS,

      examDate,
    });

  const decision =
    decidePlanningActionV2({
      snapshot,
    });

  /*
   * ----------------------------------------------------------
   * SHADOW WRITE PHASE
   *
   * Only planning_v2_* tables are written.
   * ----------------------------------------------------------
   */

  const snapshotRow =
    toPlanningV2SnapshotRow(
      snapshot,
      {
        weeklyPlanId:
          plan.id,

        sourcePlanGenerationVersion:
          Number(
            plan.generation_version ??
            1,
          ),
      },
      snapshotHash,
    );

  const planningSnapshotDatabaseId =
    await persistImmutableRow(
      input.client,

      "planning_v2_snapshots",

      snapshotRow,

      {
        user_id:
          input.userId,

        idempotency_key:
          snapshotRow.idempotency_key,
      },
    );

  const proposalRow =
    toPlanningV2ProposalRow({
      snapshot,

      planningSnapshotDatabaseId,

      proposal:
        decision.proposal,

      validation:
        decision.validation,

      decision:
        decision.decision,

      weeklyPlanId:
        plan.id,
    });

  const planningProposalDatabaseId =
    await persistImmutableRow(
      input.client,

      "planning_v2_proposals",

      proposalRow,

      {
        user_id:
          input.userId,

        idempotency_key:
          proposalRow.idempotency_key,
      },
    );

  /*
   * There is intentionally NO:
   *
   * tasks.update()
   * weekly_plans.update()
   * apply_plan_revision()
   * recalculateCurrentPlan()
   */
  return Object.freeze({
    shadow: true,

    userId:
      input.userId,

    examProfileId:
      input.examProfileId,

    weeklyPlanId:
      plan.id,

    snapshotId:
      snapshot.meta.snapshotId,

    snapshotHash,

    planningSnapshotDatabaseId,

    planningProposalDatabaseId,

    decision:
      decision.decision,

    changedTaskCount:
      decision.proposal
        .changedTaskCount,

    validationValid:
      decision.validation.valid,

    applyRecommended:
      decision.applyRecommended,

    proposal:
      decision.proposal,

    validation:
      decision.validation,
  });
}