# KPSS Koçu — Project Handoff

Last updated: 2026-08-24

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

Specify MAT-001 canonical identities, physical units, YouTube video-topic mappings, unified planner MaterialUnitView, progress/import behavior, photo/PDF intake, Today exact scope, Week exact destination, safety invariants, and acceptance scenarios.

Continue with `SPEC → TEST → IMPLEMENT → VERIFY`.

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
