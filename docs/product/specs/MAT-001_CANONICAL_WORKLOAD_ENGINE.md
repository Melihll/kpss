# MAT-001 Canonical Workload Engine

Status: EVRE_4_ENGINEERING_COMPLETE — PRODUCTION_DATA_MATURITY_IN_PROGRESS — EXACT_PROFILE_CAPTURE_PILOT_ON — EVIDENCE_SHADOW_OFF — CANONICAL_RUNTIME_OFF

## 1. Purpose

The canonical workload engine answers, for every canonical material view:

> How much real work remains, what evidence supports the estimate, and how confident are we?

It is subject-agnostic and does not create duration merely to fill planner capacity. It is a read-only projection over canonical material, progress, and actual execution evidence. The existing app-api material-workload path and production planner remain unchanged.

## 2. Authority classes

| Authority | Meaning | Current uses |
| --- | --- | --- |
| `exact` | Remaining work follows directly from authoritative progress and an intrinsic workload boundary. | Completed material (`0`); authoritative full-video duration minus `watched_seconds`. |
| `calibrated` | Physical remaining pages are converted with compatible accepted W2 pace evidence at sufficient confidence. | Page-ranged physical material at medium/high calibration readiness. Low-confidence pace remains visible in readiness shadow but the material workload stays `unknown`. |
| `fallback` | An explicit, reviewed product fallback policy supplies pace. | Supported by the domain contract, but no fallback policy is authorized for production W1. |
| `unknown` | No defensible duration can be calculated. | Missing/incompatible evidence, unsafe progress, missing range, or non-authoritative mapping. |

`unknown` always has `estimatedMinutes = null` and is planner-ineligible.

## 3. Production evidence audit

The following classifications describe what a record proves. Pace calibration requires a single causally linked observation that proves both `actual_elapsed_time` and `actual_progress_delta`.

| Source | Classification | Pace authority | Reason |
| --- | --- | --- | --- |
| Completed `study_sessions.duration_minutes` / current allocation actual minutes | `actual_elapsed_time` | No, alone | Finish flow records overlap-safe elapsed minutes, but live task starts do not bind an exact resource unit and finish does not persist a page delta. |
| Retroactive study session with `resource_unit_id` | `actual_elapsed_time`, progress `unavailable` | No | The duration is user-recorded actual time, but the RPC does not atomically record how much of the unit changed. |
| `resource_unit_progress` status or `completed_through_page` | `actual_progress_delta` | No, alone | It proves authoritative material progress but stores no elapsed time or before-boundary event. |
| First exact-unit `test_results` completion with non-null positive `duration_minutes`, a valid page-ranged `test` unit, and `test_results.completed_at = resource_unit_progress.completed_at` | `actual_elapsed_time` + `actual_progress_delta` | No for W4 calibration | It remains useful descriptive evidence, but W4 admits only immutable accepted `physical_pace_evidence` created by the atomic W2 lifecycle into physical calibration. |
| Later test attempts or a test result not matching the first completion timestamp | `actual_elapsed_time`, progress `unreliable` | No | Time may be real, but the page range was already complete or causal progress cannot be proven. |
| `tasks.estimated_minutes`, planned credit, and weekly target minutes | `planned_only` | No | These are obligations/budgets, not observed pace. |
| Historical `resource_units.estimated_minutes` | `planned_only`, `unreliable` for intrinsic duration | No | Importers distributed task minutes across execution slices; the value is not intrinsic material duration. |
| `task_resource_units` completion | `actual_progress_delta` only when corroborated by canonical progress; otherwise `unreliable` | No | It is task execution linkage, not an elapsed-time/progress-delta pair. |
| `youtube_video_progress.watched_seconds` | `actual_progress_delta` | Pace not needed | It is monotonic workload progress. `last_position_seconds` is only a resume cursor. |

No pace may be inferred by joining unrelated or merely nearby timestamps. No planned duration is accepted as actual time.

## 4. Domain model

`WorkloadEvidence` identifies the user/profile, source record, resource, subject/topic, material type, actual minutes, progress amount/unit, sample interval, evidence classifications, and provenance.

`PaceEstimate` reports minutes per unit, sample count, observed minutes/progress, confidence, provenance, and selected scope.

`CalibrationReadiness` reports the winning scope and why it won, compatible sample count, total observed minutes/progress, deterministic pace, confidence, shadow usability, planner usability, blocked reason, evidence identities, provenance, and aggregation policy. `usableForShadow` and `usableForPlanner` are intentionally separate.

`MaterialWorkloadEstimate` reports canonical material identity, remaining amount/unit, estimated minutes or `null`, authority, confidence, planner eligibility, blocking reason, and an evidence summary.

The production evidence adapter retains non-calibratable observations so shadow output can distinguish actual time, actual progress, planned-only data, unreliable linkage, and unavailable data rather than silently dropping them.

## 5. Physical progress

- `progressState = completed` means exact zero remaining workload.
- A valid inclusive page range has `pageEnd - pageStart + 1` pages.
- `completed_through_page` is used only for `in_progress` page material and must be inside `[pageStart, pageEnd)`. Remaining pages start at `completed_through_page + 1`.
- No partial progress is inferred from task minutes, session minutes, task status, or timestamps.
- An invalid range or invalid partial boundary blocks the view instead of clamping it into apparent validity.
- Non-completed physical material without an exact page range cannot be pace-calibrated.

## 6. Pace hierarchy and compatibility

Only accepted W2 observations with causal study-session identity, valid positive active time, exact positive page-boundary progress, the same user and exam profile, page progress unit, and exact material type are compatible. Candidate/rejected rows, historical inferred pairs, planned duration, invalid boundaries/time, and cross-user/profile evidence are excluded. This intentionally prevents, for example, test pace from leaking into reading pace.

The first scope containing valid evidence wins:

1. exact resource + material type;
2. subject + material type;
3. user + material type;
4. an explicit reviewed fallback policy;
5. unknown.

A narrower scope is never blended with a broader scope. Broader cross-type evidence is not demonstrably compatible in W1 and is therefore excluded.

Pace is the deterministic median of per-session `actualMinutes / progressedPages`, ordered independently of input order. For an even number of samples, the two middle rates are averaged. This is the smallest robust replacement for W1's pooled weighted mean: one extreme long or short session cannot dominate the selected pace. Total observed minutes and pages remain separately reported and continue to drive the unchanged confidence thresholds. Physical workload rounding is `ceil(remainingPages × pace)`.

## 7. Confidence and planner threshold

Confidence is deterministic:

- `low`: fewer than 3 independent samples, fewer than 60 total observed minutes, or coefficient of variation above `0.75`;
- `medium`: at least 3 samples, at least 60 observed minutes, and coefficient of variation at most `0.75`;
- `high`: at least 5 samples, at least 120 observed minutes, and coefficient of variation at most `0.35`.

The minimum of three observations is the first sample size that demonstrates repeatability beyond a single pair; sixty observed minutes prevents a few tiny records from creating planning authority. Dispersion limits prevent a numerically large but unstable sample from claiming confidence. These are explicit W1 product safety tolerances and are contract-tested.

A low-confidence accepted pace is visible through `CalibrationReadiness` for diagnostic shadow only. It does not create material duration: `estimatedMinutes = null`, workload authority is `unknown`, and Planner V2 receives an explicit unresolved-workload reason. A calibrated physical view is planner-eligible only at `medium` or `high` confidence and only when canonical topic mapping, active state, exact page range, and valid progress are already authoritative. A configured fallback is eligible only when its policy explicitly authorizes planning and supplies at least medium confidence. Completed material and authoritative full videos are exact/high-confidence, subject to mapping eligibility.

## 8. YouTube workload

For an active, validated, authoritatively mapped, non-segment full video:

`remainingSeconds = max(durationSeconds - watchedSeconds, 0)`

`estimatedMinutes = ceil(remainingSeconds / 60)`

The authority is `exact`. Completion produces zero.

Unmapped, ambiguous, AI-candidate-only, conflicting, or segment mappings remain blocked even when full video duration exists. Segment workload remains unavailable until segment-specific progress is authoritative.

## 9. Fallback policy

W1 defines a typed fallback input so a later reviewed product decision can be represented without changing estimation semantics. No repository or product contract currently authorizes a production physical fallback, so production W1 supplies none. Historical planned minutes and page-count constants are not fallback policies.

## 10. Shadow readiness report

The read-only shadow report includes:

- total, exact, calibrated, fallback, and unknown views;
- planner-eligible views and blocked reasons;
- exact YouTube remaining minutes;
- physical calibrated and unknown pages;
- confidence distribution;
- known workload minutes grouped by subject, resource, and material type;
- evidence-source classification counts and accepted pace sample totals.
- W2 exclusion counts grouped by reason;
- exact-resource, subject/type, and type readiness plus confidence distribution;
- physical estimated remaining minutes and planner-eligible calibrated views;
- calibrated scope sample count, selected hierarchy level, aggregation policy, and provenance.

Partial canonical coverage never produces a false parity claim against the legacy planned-minute projection.

## 11. Runtime and safety

- Canonical workload planning and runtime evidence-shadow consumption remain OFF.
- The app-api continues using the existing production workload helper.
- All production W1 inspection is read-only.
- The W4 runner may explicitly bypass the runtime evidence-shadow gate for diagnostic reads only. It has no mutation path and reports concurrent production changes instead of treating natural pilot activity as its own side effect.
- No migration, Edge/web deployment, planner cutover, secret change, or production data write is authorized.
- AI has no workload or mutation authority.
- User intent remains outside and above optimizer preferences.

## 12. Current production readiness

Linked Supabase was measured read-only on 2026-08-25 for the target mapping/profile scope:

- active resources: `27`;
- canonical material views: `341` (`250` physical, `91` YouTube);
- exact workload views: `76`;
- calibrated workload views: `0`;
- fallback workload views: `0`;
- unknown workload views: `265`;
- planner-eligible views: `76`;
- blocked by `pace_evidence_unavailable`: `245` physical views;
- blocked by `mapping_missing`: `20` views (`5` physical structural spans and `15` held YouTube videos);
- exact YouTube remaining workload: `3,323` minutes;
- physical pages with calibrated workload: `0`;
- physical pages with unknown workload: `5,103`;
- confidence distribution: `76 high`, `265 none`, `0 medium`, `0 low`;
- known minutes are entirely authoritative Mathematics video workload; no physical duration was fabricated.

Production evidence classifications at the W4 closure snapshot were:

- `actual_elapsed_time`: `36` records;
- `actual_progress_delta`: `2` records;
- `planned_only`: `57` records;
- `unreliable`: `0` records;
- `unavailable`: `38` record classifications;
- accepted pace samples proving both actual time and progress delta: `0`.

Classifications may overlap on one observation, so their counts are not summed as a row total. The available actual-time and actual-progress records do not form a causal pair. The correct production result is therefore zero calibrated physical pages.

Read-only guards were identical before and after the shadow:

- global `resource_units`: `79`;
- global `youtube_video_topic_links`: `76`;
- non-null `resource_unit_progress.completed_through_page`: `0`.

Canonical runtime remains OFF.

## 13. Verification

- workload/evidence/shadow targeted tests: `25/25` PASS;
- domain typecheck: PASS;
- full non-integration regression: `767/767` tests across `119/119` files PASS;
- MAT-001 persistence integration suite: `ENVIRONMENT_BLOCKED` before collection because `SUPABASE_URL` and `SUPABASE_ANON_KEY` are unavailable in the local shell;
- linked production shadow: PASS, read-only guards unchanged;
- no migration, production write, Edge deployment, planner cutover, or app-api canonical workload activation occurred during W1 verification.

## 14. W2 atomic physical pace evidence schema release

W2 now has a production-deployed schema/RPC capability. It introduces protected server-time/material snapshots, a protected physical pause ledger, and immutable accepted evidence created atomically with exact progress by a dedicated finish RPC. Generic study, app-api, Telegram, and web flows remain unchanged; the evidence loader remains capability-gated OFF by default.

Local W2 verification on 2026-08-25:

- targeted boundary/migration/ingestion/runtime tests: `25/25` PASS;
- domain typecheck and checked-in edge planning bundle: PASS;
- full non-integration regression: `792/792` across `123/123` files PASS;
- local PostgreSQL migration apply: PASS;
- full local integration regression: `114/114` across `12/12` files PASS;
- a three-sample exact-resource fixture calibrates 10 pages to 20 minutes at medium confidence and becomes planner-eligible; a one-sample synthetic span remains low-confidence and blocked;
- linked production read-only shadow remains `341` views: `76` exact, `0` calibrated, `0` fallback, `265` unknown, and `76` planner-eligible;
- production W2 migration `20260825130000` was deployed on 2026-08-25 with SHA256 `82006d04a089595308ff9b434dd4f4c8888c2191fdd0fb9c69f0af210c32a8e6`;
- all W2 tables contain `0` rows, historical accepted physical pace samples remain `0`, safety counters remain `79 / 76 / 0`, and canonical runtime remains OFF.

The next gate is a separate runtime-activation design/review and explicit approval. The schema release does not imply app-api/Telegram/web capture activation, canonical planner cutover, data backfill, or evidence creation.

## 15. W3 gated capture runtime integration

W3 added one server adapter that selects either the existing generic lifecycle or the W2 physical lifecycle. App-api and both web finish surfaces were integrated locally before the separately approved gate-off release and exact-profile pilot activation.

- `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` is an explicit app-api profile allowlist and defaults OFF.
- Exactly one compatible persisted pending physical unit may be selected automatically. Explicit selected-unit input is supported by the server contract; ambiguous tasks remain legacy when the product supplies no selection.
- W2-owned pause/resume/finish always remain on protected authority. Mixed generic/W2 identity fails safely.
- Web finish requests the last completed page and surfaces evidence, no-evidence, and conflict outcomes. No page end is inferred from task completion or title.
- W2 finish remains the only progress/evidence/task-unit/accounting mutation. Application code performs no dual write.
- W1 read-only shadow consumption uses the separate `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` gate; it defaults OFF and does not activate planner calibration.
- Telegram remains legacy and `UI_BLOCKED` pending an ownership-preserving service wrapper and page-boundary interaction.
- Local verification covers runtime OFF parity, exact-unit eligibility, W2 lifecycle routing, retry/idempotency, boundary validation, no double accounting/completion, W1 shadow visibility, overlap safety, and proposal-only study deviation.
- Production read-only verification remains `0` snapshots, `0` protected breaks, and `0` evidence. Workload remains `76 exact / 0 calibrated / 0 fallback / 265 unknown`, and physical pages remain `0 calibrated / 5,103 unknown`.
- The later W3 release deployed app-api gate-off, then the separately approved pilot set exactly one profile in `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS`. Telegram remains legacy; evidence-shadow and canonical planning remain OFF.

The pilot remains limited to the approved profile. Any allowlist expansion, Telegram activation, evidence-shadow activation, or canonical planner activation requires a separate review and approval.

## 16. W4 calibration readiness and Phase 4 closure

W4 closes Canonical Workload Engine engineering without claiming that production evidence is mature:

- only immutable accepted W2 evidence can calibrate physical pace;
- the scope winner is deterministic: exact resource/type, then subject/type, then same-user type, then an explicitly authorized fallback, otherwise unknown;
- median session pace provides deterministic outlier resistance while W1's sample/minute/dispersion confidence promotion remains unchanged;
- one compatible sample is low-confidence shadow evidence only; three compatible 20-minute exact-resource samples meet medium readiness and planning eligibility;
- synthetic structural spans remain in-memory, require exact inclusive page ranges and authoritative mapping, use ceil rounding, and never persist estimates to `resource_units`;
- historical `resource_units.estimated_minutes` remains legacy execution metadata and is never promoted to canonical authority;
- `PlannerV2WorkloadHandoff` admits only planner-eligible exact or medium/high calibrated/fallback workload; unresolved physical work has null minutes and an explicit reason;
- the production diagnostic runner reads W2 evidence explicitly without enabling `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` or the canonical planner.

Engineering completion means the exact workload engine, W2 calibration engine, gated production capture pilot, deterministic readiness/confidence, read-only shadow reporting, blocked-unknown semantics, and Planner V2 handoff all exist and are verified. Data maturity is separate: it continues through natural accepted W2 evidence and does not require every physical page or resource to have three samples before Phase 4 engineering can close.

W4 verification on 2026-08-25:

- targeted W4 workload/calibration/shadow tests: `51/51` PASS;
- full non-integration regression: `827/827` across `128/128` files PASS;
- full local Supabase integration regression: `116/116` across `12/12` files PASS;
- domain typecheck, checked-in planning Edge bundle, and local PostgreSQL lint: PASS;
- linked migrations: `0` pending;
- production diagnostic: `0` accepted/usable W2 samples, `0` ready scopes, `0` calibrated physical pages, `5,103` unknown physical pages, `0` physical estimated minutes;
- W2 capture rows: `0` snapshots / `0` protected breaks / `0` accepted evidence before and after;
- capture pilot remains present for the one approved profile; evidence-shadow and canonical planner remain OFF;
- app-api remains v31 ACTIVE, JWT-protected, with unchanged bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`;
- no production mutation, migration, secret change, code deployment, web deployment, backfill, or synthetic activity occurred.

Phase classification: `EVRE_4_ENGINEERING_COMPLETE_DATA_MATURITY_IN_PROGRESS`.
