# KPSS Koçu — Project Handoff

Last updated: 2026-08-25

## Canonical source

- Repository: `https://github.com/Melihll/kpss.git`
- Branch: `main`
- Last verified product checkpoint before this handoff: `a582cff`
- Repository code and `docs/product/` are authoritative over chat recollection.

## Current milestone

`M1 — Planning Correctness & Study Model`

## Core architecture

`Study Intent ≠ Task Status ≠ Material Progress ≠ Learning Stage ≠ Resource Role ≠ Duration Block Class`

Target flow:

`Curriculum Topic → Learning Stage → Resource Role → Remaining Material Units → Duration Policy → Planner Placement → Today / Week`

The architecture is subject-agnostic across all KPSS subjects. Do not create Mathematics-specific planner branches.

## Current state

- `PLN-001`: DONE.
- `PLN-002`: production released; planned-study natural acceptance PASS; natural Extra Study acceptance pending.
- `PLN-003`: deterministic duration policy locally verified; production-authoritative stage activation gated.
- P48 planned-credit accounting correction: deployed and observing.
- `PLN-004`: `IMPLEMENTED_LOCAL_VERIFIED`; production-authoritative activation gated.

PLN-004 verification:
- targeted domain tests `22/22` PASS;
- non-integration regression `654/654` across `95/95` files PASS;
- domain typecheck PASS;
- no database migration or production deployment.

## Existing material infrastructure

- `resource_sections` can map physical resource sections to curriculum topics.
- `resource_units` supports executable physical units and page ranges.
- `resource_unit_progress` stores physical execution progress.
- `task_resource_units` connects exact units to tasks.
- `youtube_playlists` and `youtube_playlist_videos` store YouTube catalogs.
- YouTube videos include real `duration_seconds` and ordered `position`.
- `youtube_video_progress` stores playback/completion progress.
- `topic_resource_links` links topics to resources/playlists, but individual video-to-topic mapping is not yet canonical.

## Active task

`MAT-001 — Canonical Material Content & Progress`

Goal: make the planner capable of using exact subject-independent scope such as `pages 42–53`, `Test 3–4`, or `Video 5 + Video 6`, while tracking exactly where the learner stopped and what the week is expected to finish.

Physical and YouTube authoritative stores should be reused rather than duplicated.

Material completion history remains separate from pedagogical state. Previously completed material stays completed even when PLN-004 later requires review/remediation.

## Production guardrails

- No silent Today-task removal.
- Extra Study does not silently substitute for planned work.
- AI has no direct plan/stage mutation authority.
- Missing canonical metadata degrades safely rather than being guessed.
- No MAT-001 production migration/deployment without a separate release decision.

## NEXT EXACT STEP

Prepare a separate W3 production activation proposal for the already verified app-api/web capture path. That proposal must name the exact profile allowlist, deploy app-api and web, keep Telegram legacy, verify the first protected lifecycle under observation, and retain canonical workload planning OFF. No deployment or feature enablement is authorized by this handoff.

Telegram requires a separately reviewed service-role W2 wrapper plus authoritative page-boundary UX before it can enter an activation proposal. Do not activate canonical workload planning while production physical pace evidence remains insufficient.

## 2026-08-24 MAT-001 canonical material shadow checkpoint

- Canonical physical + YouTube DB loader is implemented and verified against local PostgreSQL.
- Individual YouTube video-topic mappings use mapping-safe canonical identities.
- Conflicting full-video mappings are not planner-authoritative.
- Segment mappings remain planner-ineligible until exact segment progress exists.
- Canonical workload shadow compares legacy and canonical stores read-only.
- Partial canonical coverage never produces a misleading numeric parity delta.
- Existing production material workload path remains unchanged.
- MAT-001 production migration remains undeployed.

## 2026-08-24 MAT-001 production schema release

- Migration `20260824123500_mat001_material_progress_and_video_topic_mapping.sql` was applied to production successfully.
- Remote migration history matches local history.
- Post-apply dry-run reports the remote database is up to date.
- `resource_unit_progress.completed_through_page` exists as nullable exact page progress.
- `youtube_video_topic_links` exists with ownership constraints, mapping status/provenance, optional segment bounds, RLS and validation triggers.
- Existing production material data was preserved: 91 YouTube videos, 91 active videos and 1 resource-unit progress row remained unchanged.
- No fabricated partial-page backfill was created.
- No automatic individual video-topic mappings were created.
- Production canonical runtime path remains inactive.
- No Edge Function, planner, Telegram or application deployment was performed as part of this release.

## 2026-08-24 MAT-001 YouTube mapping production data release

- Explicit human batch approval was given for the 76 deterministic full-video mapping proposals.
- 76 validated full-video YouTube-to-curriculum mappings were applied to production.
- All 76 rows use mapping_status `validated` and mapping_provenance `reviewed_mapping`.
- No segment mappings were created.
- 15 non-single videos remain held: 10 segment-review videos, 3 ambiguous combined-topic videos, 1 manual-review video and 1 non-instructional intro.
- The 206 physical structural-unit candidates remain HOLD.
- Production resource_units remained at 79 rows during this release.
- No exact partial-page progress rows were fabricated.
- Canonical material runtime remains inactive.
- No planner, Edge Function, Telegram or application deployment was performed as part of this release.

## 2026-08-25 MAT-001 canonical material model milestone complete

- Canonical Material Model / project Phase 3 is shadow-verified and considered structurally complete.
- Production canonical runtime has NOT been activated.
- Production YouTube mapping release contains 76 authoritative full-video mappings; 15 videos remain held.
- Physical canonical content is represented by existing persisted execution units plus in-memory synthetic structural coverage.
- H8C measured 5,103 valid physical section-pages: 458 persisted-covered and 4,645 synthetic structural pages.
- 217 structural spans were derived; all remain planner-ineligible until workload authority exists.
- Canonical shadow inventory totals 341 active material views: 250 physical and 91 YouTube.
- Next milestone is Canonical Workload Engine: pace evidence, calibration, remaining-work estimation and confidence.

## 2026-08-25 canonical workload engine W1

- Subject-agnostic workload authority is implemented as `exact`, `calibrated`, `fallback`, or `unknown`, with explicit confidence, provenance, reason, and planner eligibility.
- Production evidence semantics are audited. Session time alone and progress alone cannot calibrate pace; planned minutes and historical unit estimates are rejected.
- The only accepted production pace shape is the atomic first completion of an exact page-ranged test with matching actual duration and resource progress. The target profile currently has `0` accepted samples.
- Read-only production shadow: `341` views; `76` exact, `0` calibrated, `0` fallback, `265` unknown; `76` planner-eligible.
- Exact authoritative YouTube remaining workload is `3,323` minutes.
- Physical readiness is intentionally conservative: `0` calibrated pages and `5,103` unknown pages.
- Blockers are `245 pace_evidence_unavailable` views and `20 mapping_missing` views (`5` physical, `15` YouTube).
- Confidence distribution is `76 high` and `265 none`.
- Safety guards were unchanged before/after: `79` global resource units, `76` video-topic links, `0` non-null exact partial-page boundaries.
- Targeted W1 tests pass `25/25`; full non-integration regression passes `767/767` across `119/119` files; domain typecheck passes.
- MAT-001 persistence integration remains `ENVIRONMENT_BLOCKED` because local Supabase integration variables are unavailable; it failed before test collection/assertions.
- No migration, production mutation, Edge deployment, planner cutover, or app-api canonical workload activation occurred.
- Canonical runtime remains OFF.

## 2026-08-25 atomic physical pace evidence W2

- The lifecycle audit found generic session and break rows are authenticated-user editable and physical progress is written separately. They remain accounting state, not trustworthy pace authority.
- The local W2 migration candidate adds protected physical activity start/material snapshots, a protected pause ledger, immutable accepted pace evidence, and dedicated start/pause/resume/finish RPCs.
- The physical finish transaction validates the unchanged exact material identity and progress boundary, derives break-adjusted active seconds from protected server timestamps, advances exact progress, completes the task unit only at the unit end, and inserts at most one event per session.
- Boundary semantics use the last completed page: first study starts at `page_start - 1`; `end - start` is the new-page count; equal boundaries create no event; reversal, invalid range, stale progress, and non-positive observed time reject.
- W1 ingestion recognizes deployed accepted rows as `actual_elapsed_time + actual_progress_delta`, segregated between `page_range` and `test`. The loader capability defaults OFF and app-api/Telegram routes are not wired to W2.
- Verification: targeted `25/25`, non-integration `792/792` across `123/123` files, local integration `114/114` across `12/12` files, domain typecheck PASS, edge planning bundle rebuilt, and local PostgreSQL migration apply/lint PASS.
- Local fixture readiness: three compatible exact-resource samples produce medium-confidence calibrated workload and planner eligibility; one sample leaves synthetic material low-confidence and blocked.
- Production read-only audit is unchanged: `341` views (`76` exact, `0` calibrated, `0` fallback, `265` unknown), `3,323` exact YouTube minutes, `0 / 5,103` calibrated/unknown physical pages, and safety counters `79` resource units / `76` mappings / `0` partial boundaries before and after.
- Migration `20260825130000_atomic_physical_pace_evidence.sql` was deployed on 2026-08-25 under explicit schema/RPC-only approval; SHA256 `82006d04a089595308ff9b434dd4f4c8888c2191fdd0fb9c69f0af210c32a8e6`.
- Postflight: all expected tables, columns, indexes, RPC signatures, RLS/security statements, and immutable triggers are present; linked lint passes; zero migrations remain pending.
- All three W2 tables contain `0` rows; accepted historical physical pace samples remain `0`; no backfill or evidence sample was created.
- Existing counts remained `59` sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` resource units, `76` mappings, and `0` non-null exact partial-page boundaries.
- Status: `PRODUCTION_SCHEMA_DEPLOYED — CAPTURE_RUNTIME_NOT_ACTIVATED`. No Edge/app/Telegram/web deployment occurred; routes and canonical planner remain OFF.
- Next gate requires a separate runtime-activation design/review and explicit production approval.

## 2026-08-25 atomic physical capture runtime W3

- One shared `PhysicalStudyLifecycleService` now owns app-api lifecycle selection locally. The web expresses intent; it never dual-writes session, break, progress, task-unit, or evidence state.
- Capture is OFF by default and can only be enabled for an explicit exam-profile allowlist through `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS`; migration presence alone cannot activate it.
- Capability OFF preserves generic start/pause/resume/finish/cancel. Capability ON uses W2 only for exactly one persisted, active, pending, page-ranged physical task unit. Ambiguous, missing, YouTube, and synthetic structural work remain legacy/non-W2.
- Protected snapshot ownership routes pause/resume/finish even after the start gate is rolled back. A resource-unit session without its protected snapshot fails as mixed state.
- Both web finish surfaces ask for the exact last completed page. Equality with the protected start boundary records study time without evidence; advancement calls the single atomic W2 finish; reversal, beyond-range, stale progress, and break mismatch fail safely.
- W2-owned sessions do not expose generic cancel in web because the deployed W2 contract has no protected cancel RPC. Zero-progress finish is the sanctioned way to preserve actual time without evidence.
- W1 shadow evidence loading uses the separate `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` switch. Capture and calibration consumption remain independently gated, and canonical planner runtime remains OFF.
- Telegram is `UI_BLOCKED`: its service-role webhook cannot invoke the deployed `auth.uid()`-scoped W2 RPCs, and it has no authoritative page-boundary finish interaction. It remains on the verified legacy wrappers; no ownership bypass or schema change was introduced.
- Verification: targeted W3 lifecycle/UX/shadow/safety tests PASS; full non-integration and local Supabase integration suites PASS; domain/web typechecks, app-api bundle, and web production build PASS.
- Production read-only postcheck: W2 snapshots/breaks/evidence remain `0 / 0 / 0`; workload remains `341` views (`76` exact, `0` calibrated, `0` fallback, `265` unknown, `76` eligible), with `0 / 5,103` calibrated/unknown physical pages.
- Existing production counters are `60` sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` units, `76` mappings, and `0` exact partial boundaries. The one additional session since W2 was legitimate activity unrelated to W3; all guarded counts were stable during the read-only audit.
- Deployed app-api v29 and Telegram v33 remain the August 24 builds; no physical-pace feature secret exists. W3 performed no migration, Edge/web/Telegram deployment, feature enablement, production mutation, or planner cutover.
- Status: `LOCAL_VERIFIED — PRODUCTION_RUNTIME_OFF — TELEGRAM_UI_BLOCKED`.
