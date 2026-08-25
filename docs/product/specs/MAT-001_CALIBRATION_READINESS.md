# MAT-001 Calibration Readiness

Status: ENGINEERING_COMPLETE — DATA_MATURITY_IN_PROGRESS — RUNTIME_OFF

## Contract

`CalibrationReadiness` is the explicit W4 boundary between observed physical pace and planner-authoritative workload. It exposes scope, hierarchy reason, compatible sample count, total observed minutes and pages, median pace, confidence, authority, shadow/planner usability, blocked reason, evidence IDs, provenance, and aggregation policy.

Shadow usability is not planner usability. One valid accepted W2 observation produces a low-confidence pace that is inspectable in read-only diagnostics. It does not authorize a material duration. Medium or high confidence is required before remaining pages can become calibrated workload.

## Admission and exclusions

Only `physical_pace_evidence` with `evidence_status = accepted` is admitted. The row must have the requested user/profile, compatible material type, `page` progress, causal `study_session_id`, a valid increasing boundary whose delta exactly equals progressed pages, positive actual active time, and reliable actual-time plus actual-progress classifications.

Candidate/rejected rows, non-W2 or inferred historical observations, planned/estimated durations, cross-user/profile rows, incompatible types, zero progress, invalid active time, malformed boundaries, missing causal identity, and unreliable evidence are excluded with stable reason codes. `resource_units.estimated_minutes` is never evidence.

## Hierarchy, pace, and confidence

The first populated compatible scope wins:

1. user + exact resource + material type;
2. user + subject + material type;
3. user + material type;
4. explicit reviewed fallback only when product policy authorizes it;
5. unknown.

The deterministic pace is the median of per-session minutes/page. Even-sized sets average the two middle rates. Sample order cannot change the result. Total observed minutes/pages and coefficient of variation are reported separately.

W1 confidence remains authoritative: medium requires at least 3 samples, 60 minutes, and coefficient of variation at most 0.75; high requires at least 5 samples, 120 minutes, and coefficient of variation at most 0.35; otherwise confidence is low.

## Structural workload and Planner V2

An in-memory physical structural span needs an exact inclusive page range, authoritative active curriculum mapping, compatible accepted W2 pace, and medium/high confidence. Its workload is `ceil(remainingPages × pace)`. No synthetic span or calculated duration is persisted.

`PlannerV2WorkloadHandoff` carries canonical identity, remaining amount/unit, estimated minutes, workload authority/confidence, planner eligibility, unresolved reason, and evidence summary. Planner V2 may schedule only `plannerEligible = true`. Unknown or low-confidence physical workload carries null minutes and must remain blocked or be surfaced explicitly; arbitrary minutes/page are forbidden.

## Runtime separation

The production diagnostic runner can read accepted W2 evidence explicitly while `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` remains missing/OFF. This bypass is read-only and does not activate app-api planning. Capture allowlisting, diagnostic evidence reading, runtime evidence-shadow consumption, and canonical planner activation are four independent controls.

Phase 4 engineering completion does not imply production data maturity. Natural accepted W2 samples may accumulate under the exact-profile capture pilot; readiness changes deterministically as evidence matures. No backfill or synthetic production evidence is permitted.
