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

Specify `W2 — Atomic Physical Pace Evidence Capture`: bind overlap-safe actual elapsed time to an exact canonical physical before/after progress delta in one sanctioned flow, then collect enough compatible samples for the W1 confidence gate. Any migration or production release requires a separate proposal and authorization.

Do not activate canonical workload planning while production physical pace evidence remains insufficient. Continue with `SPEC → TEST → IMPLEMENT → VERIFY`.

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
