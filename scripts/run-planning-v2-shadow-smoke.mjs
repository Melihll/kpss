import assert from "node:assert/strict";
import {
  buildSync,
} from "esbuild";
import {
  pathToFileURL,
} from "node:url";
import {
  rmSync,
} from "node:fs";
import path from "node:path";

const root =
  process.cwd();

const tempBundle =
  path.join(
    root,
    ".planning-v2-shadow-smoke.mjs",
  );

buildSync({
  absWorkingDir: root,

  entryPoints: [
    "supabase/functions/_shared/planning-v2-shadow.ts",
  ],

  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",

  outfile: tempBundle,

  logLevel: "info",
});

class FakeQuery {
  constructor(
    client,
    table,
  ) {
    this.client =
      client;

    this.table =
      table;

    this.filters =
      [];

    this.orderBy =
      null;

    this.limitCount =
      null;

    this.singleMode =
      null;

    this.action =
      "select";

    this.insertPayload =
      null;
  }

  select() {
    return this;
  }

  insert(payload) {
    this.action =
      "insert";

    this.insertPayload =
      payload;

    return this;
  }

  eq(
    column,
    value,
  ) {
    this.filters.push({
      type: "eq",
      column,
      value,
    });

    return this;
  }

  gte(
    column,
    value,
  ) {
    this.filters.push({
      type: "gte",
      column,
      value,
    });

    return this;
  }

  lte(
    column,
    value,
  ) {
    this.filters.push({
      type: "lte",
      column,
      value,
    });

    return this;
  }

  in(
    column,
    values,
  ) {
    this.filters.push({
      type: "in",
      column,
      value: values,
    });

    return this;
  }

  is(
    column,
    value,
  ) {
    this.filters.push({
      type: "is",
      column,
      value,
    });

    return this;
  }

  not(
    column,
    operator,
    value,
  ) {
    this.filters.push({
      type: "not",
      column,
      operator,
      value,
    });

    return this;
  }

  order(
    column,
    options = {},
  ) {
    this.orderBy = {
      column,
      ascending:
        options.ascending !== false,
    };

    return this;
  }

  limit(count) {
    this.limitCount =
      count;

    return this;
  }

  maybeSingle() {
    this.singleMode =
      "maybe";

    return this;
  }

  single() {
    this.singleMode =
      "single";

    return this;
  }

  applyFilters(rows) {
    let output =
      [...rows];

    for (
      const filter
      of this.filters
    ) {
      output =
        output.filter(
          (row) => {
            const actual =
              row[
                filter.column
              ];

            if (
              filter.type ===
              "eq"
            ) {
              return (
                actual ===
                filter.value
              );
            }

            if (
              filter.type ===
              "gte"
            ) {
              return (
                actual >=
                filter.value
              );
            }

            if (
              filter.type ===
              "lte"
            ) {
              return (
                actual <=
                filter.value
              );
            }

            if (
              filter.type ===
              "in"
            ) {
              return (
                filter.value.includes(
                  actual,
                )
              );
            }

            if (
              filter.type ===
              "is"
            ) {
              return (
                actual ===
                filter.value
              );
            }

            if (
              filter.type ===
              "not"
            ) {
              if (
                filter.operator ===
                "is"
              ) {
                return (
                  actual !==
                  filter.value
                );
              }

              return true;
            }

            return true;
          },
        );
    }

    if (
      this.orderBy
    ) {
      const {
        column,
        ascending,
      } =
        this.orderBy;

      output.sort(
        (a, b) => {
          const left =
            a[column];

          const right =
            b[column];

          if (
            left === right
          ) {
            return 0;
          }

          const comparison =
            left < right
              ? -1
              : 1;

          return ascending
            ? comparison
            : -comparison;
        },
      );
    }

    if (
      this.limitCount != null
    ) {
      output =
        output.slice(
          0,
          this.limitCount,
        );
    }

    return output;
  }

  async execute() {
    if (
      this.action ===
      "insert"
    ) {
      const rows =
        Array.isArray(
          this.insertPayload,
        )
          ? this.insertPayload
          : [
              this.insertPayload,
            ];

      const inserted =
        rows.map(
          (row) => {
            const stored = {
              ...row,

              id:
                row.id ??
                `${this.table}-db-${this.client.nextId++}`,
            };

            this.client
              .tables[
                this.table
              ]
              .push(
                stored,
              );

            this.client
              .inserts
              .push({
                table:
                  this.table,

                row:
                  stored,
              });

            return stored;
          },
        );

      const result =
        this.singleMode
          ? inserted[0]
          : inserted;

      return {
        data: result,
        error: null,
      };
    }

    const source =
      this.client
        .tables[
          this.table
        ] ??
      [];

    const rows =
      this.applyFilters(
        source,
      );

    if (
      this.singleMode ===
      "single"
    ) {
      if (
        rows.length !== 1
      ) {
        return {
          data: null,

          error: {
            message:
              `single expected 1 row for ${this.table}, got ${rows.length}`,
          },
        };
      }

      return {
        data: rows[0],
        error: null,
      };
    }

    if (
      this.singleMode ===
      "maybe"
    ) {
      if (
        rows.length > 1
      ) {
        return {
          data: null,

          error: {
            message:
              `maybeSingle expected <=1 row for ${this.table}, got ${rows.length}`,
          },
        };
      }

      return {
        data:
          rows[0] ??
          null,

        error: null,
      };
    }

    return {
      data: rows,
      error: null,
    };
  }

  then(
    resolve,
    reject,
  ) {
    return this
      .execute()
      .then(
        resolve,
        reject,
      );
  }
}

class FakeSupabase {
  constructor(options = {}) {
    this.nextId =
      1;

    this.inserts =
      [];

    const dates =
      [
        "2026-08-17",
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
        "2026-08-23",
      ];

    this.tables = {
      exam_profiles: [
        {
          id:
            "profile-1",

          user_id:
            "user-1",

          status:
            "active",

          exam_edition_id:
            "edition-1",
        },
      ],

      weekly_plans: [
        {
          id:
            "plan-1",

          user_id:
            "user-1",

          exam_profile_id:
            "profile-1",

          week_start_date:
            "2026-08-17",

          week_end_date:
            "2026-08-23",

          available_minutes:
            2100,

          planning_budget_minutes:
            1995,

          planned_minutes:
            90,

          status:
            "active",

          generation_version:
            3,
        },
      ],

      weekly_availability:
        [],

      calendar_periods:
        [],

      schedule_exceptions:
        [],

      tasks: [
        {
          id:
            "task-1",

          user_id:
            "user-1",

          exam_profile_id:
            "profile-1",

          weekly_plan_id:
            "plan-1",

          subject_id:
            "subject-1",

          curriculum_node_id:
            "unit-1",

          resource_id:
            "resource-1",

          resource_section_id:
            null,

          task_type:
            "solve_resource_units",

          title:
            "Matematik I",

          planned_date:
            "2026-08-18",

          estimated_minutes:
            90,

          priority_score:
            60,

          importance:
            "important",

          status:
            "partially_completed",

          completed_at:
            null,

          created_at:
            "2026-08-17T10:00:00Z",

          source_reason:
            "baseline_import",

          revision_schedule_id:
            null,

          task_progress: [
            {
              completed_minutes:
                43,
            },
          ],
        },
      ],

      topic_progress: [
        {
          curriculum_node_id:
            "unit-1",

          state:
            "practicing",

          mastery_level:
            "unknown",
        },
      ],

      revision_schedules:
        [],

      task_reschedule_events:
        [],

      study_sessions:
        [],

      p48_daily_capacity_overrides:
        dates.map(
          (date) => ({
            user_id:
              "user-1",

            exam_profile_id:
              "profile-1",

            capacity_date:
              date,

            capacity_minutes:
              300,

            reserve_minutes:
              15,
          }),
        ),

      learner_unit_states_v2:
        [],

      exam_editions: [
        {
          id:
            "edition-1",

          exam_date:
            "2027-09-06",
        },
      ],

      planning_v2_snapshots:
        [],

      planning_v2_proposals:
        [],
    };

    if (options.capacityMinutes != null) {
      for (const override of this.tables.p48_daily_capacity_overrides) {
        override.capacity_minutes = options.capacityMinutes;
      }
    }

    if (options.completedMinutes != null) {
      this.tables.tasks[0].task_progress[0].completed_minutes =
        options.completedMinutes;
    }

    if (options.pastDuePattern) {
      const template = this.tables.tasks[0];
      this.tables.tasks = [
        {
          ...template,
          id: "past-partial",
          title: "Synthetic partial carryover",
          planned_date: "2026-08-17",
          estimated_minutes: 90,
          status: "partially_completed",
          task_progress: [{ completed_minutes: 62 }],
        },
        {
          ...template,
          id: "past-75",
          title: "Synthetic 75 minute carryover",
          planned_date: "2026-08-17",
          estimated_minutes: 75,
          status: "rescheduled",
          task_progress: [{ completed_minutes: 0 }],
        },
        {
          ...template,
          id: "past-45",
          title: "Synthetic 45 minute carryover",
          planned_date: "2026-08-17",
          estimated_minutes: 45,
          status: "rescheduled",
          task_progress: [{ completed_minutes: 0 }],
        },
      ];

      this.tables.tasks.push(
        ...Array.from({ length: 7 }, (_, index) => ({
          ...template,
          id: `completed-filler-${index}`,
          title: `Synthetic completed filler ${index}`,
          planned_date: "2026-08-18",
          estimated_minutes: 1,
          status: "completed",
          completed_at: "2026-08-18T09:00:00Z",
          task_progress: [{ completed_minutes: 1 }],
        })),
      );
    }
  }

  from(table) {
    if (
      !(table in this.tables)
    ) {
      throw new Error(
        `Unexpected table: ${table}`,
      );
    }

    return new FakeQuery(
      this,
      table,
    );
  }
}

try {
  const moduleUrl =
    `${pathToFileURL(
      tempBundle,
    ).href}?t=${Date.now()}`;

  const {
    runPlanningV2ShadowDecision,
  } =
    await import(
      moduleUrl
    );

  const client =
    new FakeSupabase();

  const input = {
    client,

    userId:
      "user-1",

    examProfileId:
      "profile-1",

    currentDate:
      "2026-08-18",

    trigger:
      "STUDY_DEVIATION",

    generatedAt:
      "2026-08-18T20:55:00+03:00",
  };

  const first =
    await runPlanningV2ShadowDecision(
      input,
    );

  assert.equal(
    first.shadow,
    true,
  );

  assert.equal(
    first.userId,
    "user-1",
  );

  assert.equal(
    first.weeklyPlanId,
    "plan-1",
  );

  /*
   * Feasible partial progress must not cause
   * unnecessary plan mutation.
   */
  assert.equal(
    first.decision,
    "KEEP_PLAN",
  );

  assert.equal(
    first.changedTaskCount,
    0,
  );

  assert.equal(first.evaluation.currentPlan.feasible, true);
  assert.equal(first.evaluation.v2.changedTaskCount, 0);
  assert.equal(first.evaluation.stability.changeRatio, 0);

  const snapshotInsert =
    client.inserts.find(
      (item) =>
        item.table ===
        "planning_v2_snapshots",
    );

  const proposalInsert =
    client.inserts.find(
      (item) =>
        item.table ===
        "planning_v2_proposals",
    );

  assert.ok(
    snapshotInsert,
    "planning_v2_snapshots insert missing",
  );

  assert.ok(
    proposalInsert,
    "planning_v2_proposals insert missing",
  );

  assert.equal(
    client.inserts.length,
    2,
    "only two shadow writes should occur",
  );

  assert.deepEqual(
    client.inserts.map(
      (item) =>
        item.table,
    ),
    [
      "planning_v2_snapshots",
      "planning_v2_proposals",
    ],
  );

  /*
   * Weekly capacity semantics:
   *
   * gross:
   *   7 * 300 = 2100
   *
   * reserve:
   *   7 * 15 = 105
   *
   * planning:
   *   7 * 285 = 1995
   */
  assert.equal(
    snapshotInsert.row
      .available_minutes,
    2100,
  );

  assert.equal(
    snapshotInsert.row
      .reserve_minutes,
    105,
  );

  assert.equal(
    snapshotInsert.row
      .planning_budget_minutes,
    1995,
  );

  const payload =
    snapshotInsert.row
      .snapshot_payload;

  assert.ok(
    payload,
    "snapshot payload missing",
  );

  const aug18 =
    payload
      .dailyCapacities
      .find(
        (day) =>
          day.date ===
          "2026-08-18",
      );

  assert.ok(
    aug18,
    "Aug 18 capacity missing",
  );

  assert.equal(
    aug18
      .grossCapacityMinutes,
    300,
  );

  assert.equal(
    aug18
      .reserveMinutes,
    15,
  );

  assert.equal(
    aug18
      .planningCapacityMinutes,
    285,
  );

  /*
   * Lifecycle invariant:
   * 43 / 90 remains partial and has 47 remaining.
   */
  const task =
    payload
      .existingTasks
      .find(
        (item) =>
          item.taskId ===
          "task-1",
      );

  assert.ok(
    task,
    "task missing from snapshot",
  );

  assert.equal(
    task.completedMinutes,
    43,
  );

  assert.equal(
    task.remainingMinutes,
    47,
  );

  assert.equal(
    task.isCompleted,
    false,
  );

  assert.equal(
    task.isPartiallyCompleted,
    true,
  );

  /*
   * Run exactly the same source state again.
   *
   * Snapshot + proposal persistence must be
   * idempotent, so write count stays 2.
   */
  const second =
    await runPlanningV2ShadowDecision(
      input,
    );

  assert.equal(
    second.snapshotId,
    first.snapshotId,
  );

  assert.equal(
    second.snapshotHash,
    first.snapshotHash,
  );

  assert.deepEqual(
    second.evaluation,
    first.evaluation,
    "idempotent second run produced a different evaluation",
  );

  assert.equal(
    client.inserts.length,
    2,
    "idempotent second run created duplicate shadow rows",
  );

  /*
   * Hypothetical capacity is an in-memory overlay only. It preserves
   * the target day's existing reserve and leaves every other day alone.
   */
  const increaseOverlayClient = new FakeSupabase();
  const increaseOverlayInput = {
    ...input,
    client: increaseOverlayClient,
    trigger: "CAPACITY_INCREASE",
    hypotheticalCapacityEvent: {
      effectiveDate: "2026-08-20",
      deltaMinutes: 60,
    },
  };
  const increaseOverlay = await runPlanningV2ShadowDecision(
    increaseOverlayInput,
  );
  const increaseOverlayPayload = increaseOverlayClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row.snapshot_payload;
  const increaseTarget = increaseOverlayPayload.dailyCapacities.find(
    (day) => day.date === "2026-08-20",
  );
  const increaseUnrelated = increaseOverlayPayload.dailyCapacities.find(
    (day) => day.date === "2026-08-19",
  );

  assert.deepEqual(
    {
      gross: increaseTarget.grossCapacityMinutes,
      planning: increaseTarget.planningCapacityMinutes,
      reserve: increaseTarget.reserveMinutes,
    },
    { gross: 360, planning: 345, reserve: 15 },
  );
  assert.deepEqual(
    {
      gross: increaseUnrelated.grossCapacityMinutes,
      planning: increaseUnrelated.planningCapacityMinutes,
      reserve: increaseUnrelated.reserveMinutes,
    },
    { gross: 300, planning: 285, reserve: 15 },
  );
  assert.equal(increaseOverlay.evaluation.currentPlan.availableMinutes, 2160);

  const identicalOverlay = await runPlanningV2ShadowDecision(
    increaseOverlayInput,
  );
  assert.equal(identicalOverlay.snapshotId, increaseOverlay.snapshotId);
  assert.equal(identicalOverlay.snapshotHash, increaseOverlay.snapshotHash);
  assert.equal(
    increaseOverlayClient.inserts.length,
    2,
    "identical hypothetical event created duplicate shadow rows",
  );

  const decreaseOverlayClient = new FakeSupabase();
  await runPlanningV2ShadowDecision({
    ...input,
    client: decreaseOverlayClient,
    trigger: "CAPACITY_DECREASE",
    hypotheticalCapacityEvent: {
      effectiveDate: "2026-08-20",
      deltaMinutes: -90,
    },
  });
  const decreaseTarget = decreaseOverlayClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row.snapshot_payload.dailyCapacities.find(
    (day) => day.date === "2026-08-20",
  );
  assert.deepEqual(
    {
      gross: decreaseTarget.grossCapacityMinutes,
      planning: decreaseTarget.planningCapacityMinutes,
      reserve: decreaseTarget.reserveMinutes,
    },
    { gross: 210, planning: 195, reserve: 15 },
  );

  const floorOverlayClient = new FakeSupabase();
  await runPlanningV2ShadowDecision({
    ...input,
    client: floorOverlayClient,
    trigger: "CAPACITY_DECREASE",
    hypotheticalCapacityEvent: {
      effectiveDate: "2026-08-20",
      deltaMinutes: -400,
    },
  });
  const floorTarget = floorOverlayClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row.snapshot_payload.dailyCapacities.find(
    (day) => day.date === "2026-08-20",
  );
  assert.equal(floorTarget.grossCapacityMinutes, 0);
  assert.equal(floorTarget.planningCapacityMinutes, 0);
  assert.ok(floorTarget.reserveMinutes >= 0);

  const plus30Client = new FakeSupabase();
  const plus30 = await runPlanningV2ShadowDecision({
    ...increaseOverlayInput,
    client: plus30Client,
    hypotheticalCapacityEvent: {
      effectiveDate: "2026-08-20",
      deltaMinutes: 30,
    },
  });
  assert.notEqual(plus30.snapshotHash, increaseOverlay.snapshotHash);
  assert.notEqual(plus30.snapshotId, increaseOverlay.snapshotId);

  const differentDateClient = new FakeSupabase();
  const differentDate = await runPlanningV2ShadowDecision({
    ...increaseOverlayInput,
    client: differentDateClient,
    hypotheticalCapacityEvent: {
      effectiveDate: "2026-08-21",
      deltaMinutes: 60,
    },
  });
  assert.notEqual(differentDate.snapshotHash, increaseOverlay.snapshotHash);
  assert.notEqual(differentDate.snapshotId, increaseOverlay.snapshotId);

  for (const invalid of [
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-08-20", deltaMinutes: -60 },
    },
    {
      trigger: "CAPACITY_DECREASE",
      event: { effectiveDate: "2026-08-20", deltaMinutes: 60 },
    },
    {
      trigger: "STUDY_DEVIATION",
      event: { effectiveDate: "2026-08-20", deltaMinutes: 60 },
    },
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-08-24", deltaMinutes: 60 },
    },
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-08-17", deltaMinutes: 60 },
    },
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-02-30", deltaMinutes: 60 },
    },
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-08-20", deltaMinutes: 0 },
    },
    {
      trigger: "CAPACITY_INCREASE",
      event: { effectiveDate: "2026-08-20", deltaMinutes: 1.5 },
    },
  ]) {
    const invalidClient = new FakeSupabase();
    await assert.rejects(
      runPlanningV2ShadowDecision({
        ...input,
        client: invalidClient,
        trigger: invalid.trigger,
        hypotheticalCapacityEvent: invalid.event,
      }),
    );
    assert.equal(
      invalidClient.inserts.length,
      0,
      "invalid hypothetical event reached shadow persistence",
    );
  }

  /*
   * Capacity increase grows effective capacity, but the stable
   * weekly planning budget must not expand or pull work forward.
   */
  const increasedClient = new FakeSupabase({
    capacityMinutes: 360,
  });
  const increased = await runPlanningV2ShadowDecision({
    ...input,
    client: increasedClient,
    trigger: "CAPACITY_INCREASE",
  });
  const increasedSnapshot = increasedClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row;

  assert.equal(increasedSnapshot.available_minutes, 2520);
  assert.equal(increasedSnapshot.reserve_minutes, 105);
  assert.equal(increasedSnapshot.planning_budget_minutes, 1995);
  assert.equal(increased.decision, "KEEP_PLAN");
  assert.equal(increased.changedTaskCount, 0);

  /*
   * Capacity decrease remains a valid input even when the stable
   * budget is above current effective capacity. Never clamp it.
   */
  const decreasedClient = new FakeSupabase({
    capacityMinutes: 30,
  });
  const decreased = await runPlanningV2ShadowDecision({
    ...input,
    client: decreasedClient,
    trigger: "CAPACITY_DECREASE",
  });
  const decreasedSnapshot = decreasedClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row;

  assert.equal(decreasedSnapshot.available_minutes, 210);
  assert.equal(decreasedSnapshot.reserve_minutes, 105);
  assert.equal(decreasedSnapshot.planning_budget_minutes, 1995);
  assert.ok(
    ["READY_TO_APPLY", "BLOCKED"].includes(decreased.decision),
    `capacity decrease was not repaired or blocked: ${decreased.decision}`,
  );
  assert.equal(decreased.evaluation.currentPlan.feasible, false);
  assert.equal(decreased.evaluation.currentPlan.planningBudgetMinutes, 1995);
  assert.equal(decreased.evaluation.v2.decision, decreased.decision);

  /*
   * Lifecycle is status-driven: 90/90 with a partial status is not
   * silently promoted to completed, even though remaining is zero.
   */
  const lifecycleClient = new FakeSupabase({
    completedMinutes: 90,
  });
  await runPlanningV2ShadowDecision({
    ...input,
    client: lifecycleClient,
  });
  const lifecyclePayload = lifecycleClient.inserts.find(
    (item) => item.table === "planning_v2_snapshots",
  ).row.snapshot_payload;
  const lifecycleTask = lifecyclePayload.existingTasks.find(
    (item) => item.taskId === "task-1",
  );

  assert.equal(lifecycleTask.completedMinutes, 90);
  assert.equal(lifecycleTask.remainingMinutes, 0);
  assert.equal(lifecycleTask.isCompleted, false);
  assert.equal(lifecycleTask.isPartiallyCompleted, true);

  /*
   * Synthetic production-shaped missed day: only the three past-due
   * tasks move, including 28 remaining minutes on the partial task.
   */
  const missedDayClient = new FakeSupabase({ pastDuePattern: true });
  const missedDay = await runPlanningV2ShadowDecision({
    ...input,
    client: missedDayClient,
    trigger: "MISSED_DAY",
  });

  assert.equal(missedDay.evaluation.currentPlan.feasible, false);
  assert.ok(
    missedDay.evaluation.currentPlan.issueCodes.includes(
      "PAST_DUE_REMAINING_WORK",
    ),
  );
  assert.equal(missedDay.decision, "READY_TO_APPLY");
  assert.equal(missedDay.changedTaskCount, 3);
  assert.deepEqual(
    missedDay.evaluation.v2.movedTaskIds.slice().sort(),
    ["past-45", "past-75", "past-partial"],
  );
  assert.deepEqual(missedDay.evaluation.v2.backlogTaskIds, []);
  assert.equal(
    missedDay.evaluation.stability.completedTaskMutationCount,
    0,
  );
  assert.equal(missedDay.evaluation.stability.activeTaskMutationCount, 0);
  assert.equal(
    missedDayClient.inserts.filter(
      (item) => item.table.startsWith("planning_v2_"),
    ).length,
    2,
  );

  /*
   * Fake client intentionally implements no:
   *
   * update()
   * delete()
   * rpc()
   *
   * Therefore any real plan mutation attempt
   * would already have crashed this smoke test.
   */
  console.log(
    "\n✅ Planning V2 shadow smoke passed",
  );

  console.log(
    "   decision:           ",
    first.decision,
  );

  console.log(
    "   changed tasks:       ",
    first.changedTaskCount,
  );

  console.log(
    "   gross capacity:      ",
    snapshotInsert.row.available_minutes,
  );

  console.log(
    "   reserve:             ",
    snapshotInsert.row.reserve_minutes,
  );

  console.log(
    "   planning budget:     ",
    snapshotInsert.row.planning_budget_minutes,
  );

  console.log(
    "   writes:              ",
    client.inserts.length,
  );

  console.log(
    "   real plan mutations: 0",
  );

  console.log(
    "   bridge scenarios:     16",
  );
}
finally {
  rmSync(
    tempBundle,
    {
      force: true,
    },
  );
}

