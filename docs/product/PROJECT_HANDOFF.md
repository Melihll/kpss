# KPSS Koçu — Project Handoff

Last updated: 2026-08-26

## Canonical source

- Repository: `https://github.com/Melihll/kpss.git`
- Branch: `main`
- Last verified product checkpoint before W5: `fa46fd2`
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

Review the W6 local migration/RPC candidate as a separate production schema release. Do not deploy or activate Planner V2 proposal generation, confirmation, or Apply until that release and later runtime gates receive explicit approval. Continue read-only W5 shadow observation and natural W2 pilot evidence observation.

In parallel, continue passive observation of the next natural W2-eligible physical study lifecycle for the exact-profile pilot. Inspect it read-only if it occurs; do not manufacture activity, widen the allowlist, or alter accepted evidence.

Telegram requires a separately reviewed service-role W2 wrapper plus authoritative page-boundary UX before it can enter an activation proposal. Do not activate canonical workload planning while production physical pace evidence remains insufficient.

## 2026-08-26 Planner V2 canonical W5 engineering

- `canonical-planner-v2-shadow-v1` builds an immutable deterministic weekly proposal from exact daily capacity, protected commitments, canonical material boundaries, `PlannerV2WorkloadHandoff`, progress identity, learning-stage facts, and stable policy metadata.
- It schedules only positive-integer, planner-eligible whole canonical workloads. Exact remaining YouTube videos are supported; M:N topic views deduplicate by source video. Unknown physical pace, unsafe mappings, missing boundaries, completed material, and exact in-progress identities cannot schedule.
- Current-day work is protected: no new canonical item is placed on or before the snapshot date. Pinned/manual/current-day/in-progress remaining minutes occupy capacity; future generated/legacy tasks are comparison-only.
- Capacity is exact and never rounded upward. Pre-existing protected overcommit is visible, one-minute overflow stays unmet, and daily/horizon totals are asserted.
- Snapshot/proposal fingerprints use deterministic SHA-256 canonical JSON and change with relevant capacity, workload, progress, commitment, policy, profile, or horizon state.
- The production adapter is strictly read-only and separate from the older diagnostic-persistence runner. It has no mutation/RPC method, returns `applyAllowed: false`, and leaves live Today/Week behavior unchanged.
- Full design and safety boundaries: [Planner V2 Canonical Shadow](specs/PLANNER_V2_CANONICAL_SHADOW.md).
- Canonical planner runtime, evidence-shadow runtime, migrations, secrets, app-api, Telegram, task state, and deployments remain unchanged in W5.
- Verification checkpoint: focused canonical/adapter tests `26/26`, targeted planner/canonical/P48 tests `228/228` across `28/28`, local integration/RLS `116/116` across `12/12`, full non-integration regression `853/853` across `130/130`, repository typecheck, local production build, V1/V2 bundle safety, read-only-path safety, and linked PostgreSQL lint all PASS.
- Production read-only shadow (2026-08-26): `341` views (`76` exact YouTube, `265` unknown), `3,323` exact eligible video minutes, `0` calibrated physical pages, `5,103` unknown physical pages, and `0` accepted/usable W2 pace samples. With `15` unoccupied contiguous minutes, the proposal schedules `0`, leaves all `3,323` eligible minutes unmet, and blocks `245` pace-unknown plus `20` mapping-unknown views. It schedules zero unknown/completed/duplicate material and changes no production counters.
- Live comparison: post-study capacity `1,386`, legacy remaining plan `1,372`, protected occupancy `1,372`, newly proposed `0`, legacy/V2 horizon overflow `0/0`, current-day differences `0`; one pre-existing day is overcommitted by `1` minute and is surfaced rather than hidden.
- Docker/local Supabase integration was restored without changing implementation or tests. A transient fresh-JWT timing failure immediately after Docker startup cleared after host/Auth/database clock verification; the complete rerun passed `116/116`. W5 engineering gates are GREEN.

## 2026-08-26 Planner V2 proposal lifecycle W6 engineering

- `planner-v2-lifecycle-v1` adds an explicit generated/previewed/confirmed/applied/stale/rejected/expired state machine around the unchanged deterministic W5 proposal.
- Preview exposes reconciled horizon/day/item/blocked/replacement data and structured domain explanation facts. Exact confirmation binds owner, profile, proposal ID, proposal fingerprint, snapshot fingerprint, planner version, and timestamp.
- Component hashes categorize freshness changes; the local transaction candidate also rechecks an authoritative database fingerprint, plan generation, ownership, exact material boundary, conservative replacement scope, canonical uniqueness, and capacity under lock.
- A local-only additive migration candidate was required because production tasks cannot currently persist canonical workload/material boundary/proposal identity and existing proposal rows cannot bind W5 identity. It adds no production state in W6.
- App-api preview/confirmation is exact-profile allowlisted, rejects wildcard activation, and defaults OFF. Web shows a minimal review/confirm panel only when enabled. No Planner V2 Apply HTTP route exists; confirmation alone cannot mutate a task or plan.
- Local transaction tests prove stale never applies, unconfirmed/foreign calls fail, current-day/manual work is retained, a late failure rolls back replacement and inserts, duplicate canonical work is blocked, and replay returns the original result idempotently.
- Verification: focused W5/W6 lifecycle/read-only/capability/safety `61/61`, canonical planning/P48 `365/365`, local integration/RLS/transaction `124/124`, and full non-integration regression `888/888` all PASS. Domain/web typechecks, production web build, final app-api local bundle/HTTP smoke, default-OFF zero-mutation smoke, V1/V2/read-only safety checks, clean migration reset, PostgreSQL lint, and `git diff --check` PASS.
- Production read-only audit: app-api remains v31 ACTIVE; the exact-profile capture secret remains present; evidence-shadow, canonical planner, and W6 lifecycle secrets remain absent/OFF. Production table statistics report estimated `0 / 0 / 0` physical snapshots/breaks/evidence and estimated `0` confirmed action proposals. The only local/remote migration difference is the intentionally undeployed W6 candidate `20260826120000`; no production migration was applied.
- Telegram is unchanged. Canonical planner, evidence-shadow, capture pilot, production secrets/migrations/data, Edge/web deployments, and live app-api remain unchanged.
- Full contract: [Planner V2 Proposal Lifecycle](specs/PLANNER_V2_PROPOSAL_LIFECYCLE.md).

## 2026-08-25 Canonical Workload Engine W4 closure

- Status: `EVRE_4_ENGINEERING_COMPLETE_DATA_MATURITY_IN_PROGRESS`.
- `CalibrationReadiness` now distinguishes low-confidence diagnostic shadow visibility from medium/high planner eligibility and records selected scope, reason, totals, median pace, confidence, evidence identities, provenance, and blocked reason.
- Physical calibration admits only accepted atomic W2 rows with matching user/profile/type, causal activity identity, valid positive page delta, and valid positive active time. Planned duration, historical pseudo-pairs, malformed rows, and cross-scope evidence are excluded.
- Pace uses deterministic median session minutes/page for outlier resistance. W1 confidence thresholds remain unchanged: one sample stays low and blocked; three compatible samples totaling at least 60 minutes can become medium.
- Low-confidence physical material remains `unknown` with null minutes. Medium/high structural spans use inclusive remaining-page arithmetic and `ceil(remainingPages × pace)` in memory only; historical `resource_units.estimated_minutes` is not authority.
- `PlannerV2WorkloadHandoff` carries only canonical workload authority/confidence and an explicit unresolved reason. It cannot turn an unknown duration into schedulable minutes.
- Read-only diagnostic shadow now reports global admission/exclusions, exact/subject/type readiness, confidence, material pages/minutes, YouTube exact workload, total authority, blocked reasons, scope provenance, and concurrent natural-production change detection.
- Verification: targeted W4 tests `51/51`, full non-integration `827/827` across `128/128`, local integration `116/116` across `12/12`, domain typecheck, planning Edge bundle, and PostgreSQL lint all PASS.
- Final production read-only snapshot: `0 / 0 / 0` W2 snapshots/breaks/accepted evidence; `0` usable samples and ready scopes; `0 / 5,103` calibrated/unknown physical pages; `341` total views (`76` exact, `0` calibrated, `0` fallback, `265` unknown, `76` planner-eligible); `0` pending migrations.
- Exact-profile capture secret remains present at its original activation timestamp. `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` remains missing/OFF; canonical planner remains OFF; app-api remains v31 ACTIVE with unchanged W3 code bundle.
- No production mutation, migration, secret change, backfill, synthetic activity, Edge deployment, web deployment, Telegram change, or planner cutover occurred in W4.

Phase 4 engineering is complete. Production data maturity is ongoing and may advance only through natural accepted W2 evidence under the existing pilot controls.

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

## 2026-08-25 W3 gate-off runtime production release

- Status: `W3_RUNTIME_DEPLOYED — CAPTURE_GATE_OFF — PLANNER_OFF`.
- Verified source commit `8354deff78b06f56411dc969a073c54f68829c69` was deployed only to the production `app-api` Edge Function; it advanced from v29 to v30 at `2026-08-25T14:31:10.230Z` with bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`.
- The W3 web was already live from Cloudflare Pages deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` at the same source commit. The release did not deploy web; the production and immutable W3 URLs remained HTTP 200 with matching HTML and healthy referenced assets.
- `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` remains missing, so capture is OFF. `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` remains missing, so W2 evidence consumption is OFF. Canonical planner runtime remains OFF.
- Postflight W2 tables remain `0 / 0 / 0` for snapshots, protected breaks, and pace evidence. Accepted historical physical pace samples remain `0`; physical calibration remains `0` pages.
- Production safety counters remained `61` sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` resource units, `76` video-topic mappings, and `0` non-null exact partial-page boundaries during the release window.
- Workload shadow remained `341` views: `76` exact, `0` calibrated, `0` fallback, `265` unknown, and `76` planner-eligible; physical pages remained `0 / 5,103` calibrated/unknown and exact YouTube remaining workload remained `3,323` minutes.
- No Telegram deployment or activation, planner activation, database migration, production data mutation, W2 RPC test, evidence backfill, or pilot activation occurred.
- The next gate is a separately approved exact-profile pilot capture activation; it is not enabled by this release.

## 2026-08-25 W3 exact-profile capture pilot activation

- Status: `W3_EXACT_PROFILE_PILOT_ENABLED — PLANNER_OFF`; observation state: `WAITING_FOR_NATURAL_SESSION`.
- `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` was set at `2026-08-25T16:05:45.276Z` to the single approved profile `73f9b34c-da73-43d9-a05c-2026409cf290`.
- The pure production-profile matcher resolves capture ON only for that profile and OFF for both other active production profiles; wildcard capture is not configured.
- Preflight inventory contained `13` W2-eligible exact physical paths, `2` ambiguous multi-unit paths, `26` no-unit paths, and `0` invalid paths. Ambiguous, no-unit, nonphysical, and Telegram work remains legacy.
- Activation itself created no rows or ordinary-state mutations: W2 snapshots/protected breaks/evidence remained `0 / 0 / 0`; sessions/tasks/test-results/resource-progress remained `61 / 248 / 1 / 1`.
- `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` remains missing, canonical planner runtime remains OFF, accepted samples remain `0`, and physical calibrated pages remain `0`.
- Supabase secret propagation advanced function configuration version counters without changing code bundles or deployment timestamps. `app-api` is active at v31 with the v30 bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573` and `verify_jwt = true`; no code was redeployed.
- Cloudflare Pages remained deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` at W3 commit `8354deff78b06f56411dc969a073c54f68829c69`; independent mobile-data verification cleared the local-network-only health blocker. No web deployment occurred.
- No natural eligible W2 session occurred during the bounded activation observation window. The pilot remains enabled waiting for natural use; no artificial session or evidence was created.
- No Telegram deployment, migration, backfill, planner activation, evidence-shadow activation, second-profile activation, or rollback occurred.
