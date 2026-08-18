import { describe, expect, it } from "vitest";

import {
  buildFoundationWeekGoldenSnapshotV2,
  buildLocalRepairProposalV1,
  decidePlanningActionV2,
  deriveLearnerUnitStateV1,
  planningV2ApplyDedupeKey,
  planningV2ProposalIdempotencyKey,
  planningV2SnapshotIdempotencyKey,
  repairCurrentPlanLocallyV1,
  toLearnerUnitStateV2Row,
  toPlanningV2ProposalRow,
  toPlanningV2SnapshotRow,
} from "./index";

describe("Planning V2 shadow persistence adapters", () => {
  it("maps immutable snapshot to database row semantics", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger:
          "CAPACITY_INCREASE",

        capacityDeltaByDate: {
          "2026-08-18": 60,
        },
      });

    const row =
      toPlanningV2SnapshotRow(
        snapshot,
        {
          weeklyPlanId: "weekly-plan-1",
          sourcePlanGenerationVersion: 7,
        },
        "snapshot-hash-1",
      );

    expect(row.user_id).toBe(
      snapshot.userId,
    );

    expect(
      row.exam_profile_id,
    ).toBe(snapshot.examProfileId);

    expect(row.weekly_plan_id).toBe(
      "weekly-plan-1",
    );

    expect(
      row.external_snapshot_id,
    ).toBe(
      snapshot.meta.snapshotId,
    );

    expect(row.snapshot_hash).toBe(
      "snapshot-hash-1",
    );

    expect(
      row.source_plan_generation_version,
    ).toBe(7);

    expect(
      row.snapshot_payload,
    ).toBe(snapshot);
  });

  it("creates deterministic snapshot idempotency key", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    expect(
      planningV2SnapshotIdempotencyKey(
        snapshot,
      ),
    ).toBe(
      planningV2SnapshotIdempotencyKey(
        snapshot,
      ),
    );
  });

  it("maps learner state without inventing memory values", () => {
    const state =
      deriveLearnerUnitStateV1({
        userId: "user-1",
        examProfileId: "profile-1",
        curriculumUnitId: "unit-1",

        evidence: [
          {
            evidenceId: "study-1",

            userId: "user-1",
            examProfileId: "profile-1",
            curriculumUnitId: "unit-1",

            type: "STUDY",

            occurredAt:
              "2026-08-18T12:00:00+03:00",

            studyMinutes: 45,
          },
        ],
      });

    const row =
      toLearnerUnitStateV2Row(
        state,
        {
          stateVersion:
            "learner-state-v1",

          evidenceFingerprint:
            "evidence-123",

          evidenceWatermark:
            "2026-08-18T12:00:00+03:00",
        },
      );

    expect(row.study_minutes).toBe(45);

    expect(row.mastery_mean).toBeNull();

    expect(
      row.memory_stability,
    ).toBeNull();

    expect(
      row.memory_difficulty,
    ).toBeNull();

    expect(
      row.retrievability,
    ).toBeNull();

    expect(
      row.state_version,
    ).toBe("learner-state-v1");
  });

  it("maps READY_TO_APPLY decision to validated shadow proposal", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger:
          "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -50,
          "2026-08-19": 50,
        },
      });

    const decision =
      decidePlanningActionV2({
        snapshot,
      });

    expect(decision.decision).toBe(
      "READY_TO_APPLY",
    );

    const row =
      toPlanningV2ProposalRow({
        snapshot,

        planningSnapshotDatabaseId:
          "snapshot-db-id",

        proposal:
          decision.proposal,

        validation:
          decision.validation,

        decision:
          decision.decision,

        weeklyPlanId:
          "weekly-plan-1",
      });

    expect(row.status).toBe(
      "validated",
    );

    expect(
      row.validation_valid,
    ).toBe(true);

    expect(
      row.changed_task_count,
    ).toBe(1);

    expect(
      row.apply_dedupe_key,
    ).toBe(
      planningV2ApplyDedupeKey(
        decision.proposal,
      ),
    );
  });

  it("maps blocked decision without apply dedupe key", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        currentDate:
          "2026-08-18",

        activeTaskIds: [
          "task-01",
        ],
      });

    const decision =
      decidePlanningActionV2({
        snapshot,
      });

    expect(decision.decision).toBe(
      "BLOCKED",
    );

    const row =
      toPlanningV2ProposalRow({
        snapshot,

        planningSnapshotDatabaseId:
          "snapshot-db-id",

        proposal:
          decision.proposal,

        validation:
          decision.validation,

        decision:
          decision.decision,
      });

    expect(row.status).toBe(
      "blocked",
    );

    expect(
      row.apply_recommended,
    ).toBe(false);

    expect(
      row.apply_dedupe_key,
    ).toBeNull();
  });

  it("keeps proposal idempotency separate from eventual apply idempotency", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger:
          "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -50,
          "2026-08-19": 50,
        },
      });

    const repair =
      repairCurrentPlanLocallyV1(
        snapshot,
      );

    const proposal =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    expect(
      planningV2ProposalIdempotencyKey(
        proposal,
      ),
    ).not.toBe(
      planningV2ApplyDedupeKey(
        proposal,
      ),
    );
  });

  it("rejects proposal persisted against wrong snapshot", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const decision =
      decidePlanningActionV2({
        snapshot,
      });

    const tamperedSnapshot = {
      ...snapshot,

      meta: {
        ...snapshot.meta,
        snapshotId:
          "different-snapshot",
      },
    };

    expect(() =>
      toPlanningV2ProposalRow({
        snapshot:
          tamperedSnapshot,

        planningSnapshotDatabaseId:
          "db-id",

        proposal:
          decision.proposal,

        validation:
          decision.validation,

        decision:
          decision.decision,
      }),
    ).toThrow(
      /proposal snapshot does not match/,
    );
  });
});
