# KPSS Koçu — Project Handoff

> **Active phase - PROACTIVE_COACH_6D_MATERIALITY_CHECKPOINT_2026_09_19**
>
> - **6B Runtime Foundation and 6C Reactive Coach are CLOSED; AIC-003 is DONE.**
> - **6D Proactive Coach / AIC-004 is ACTIVE / IN_PROGRESS and is not complete.**
> - Step 2A deterministic selector is accepted at `3481271b26fd0241d8ecd4a310e08ea85e5083c6`; its local-auth regression checkpoint is `888040011dc773a5a143b4d62d054623957495c3`.
> - Step 2B.3 versioned materiality/actionability policy is accepted at `c3d8fbe60a8dae4474a5d67ec547010b7fcbbcb2`; Step 2B.4 selector gating is accepted at `a0db5d8d0d5d1a80026e2f6906ae70c3f868470c`.
> - V1 launch-enabled signals are `today_completed_as_planned`, `repeated_task_miss`, `recent_recovery`, and `planner_warning_present`. `today_partial_completion`, `subject_recent_completion_drop`, `schedule_capacity_change`, and `material_progress_stalled` remain deterministic fail-closed silence because their materiality/unit/source thresholds are unresolved.
> - Focused signal/materiality/selector tests pass `54/54`; full non-integration passes `1249/1249` across `163/163` files; workspace typecheck and AI Coach/Planner safety checks pass.
> - Cooldown is not claimed as hysteresis. The current selector state has no authoritative persisted clear-condition observation; persistent hysteresis remains open until an approved server-owned state contract exists. Runtime state/user-control wiring, deterministic rendering/templates, and shadow precision/actionability acceptance also remain.
> - Production deployment/mutation, migrations/resets, provider/LLM calls, and automatic Planner proposal/Preview/Confirm/Apply calls for this checkpoint are all `0`. Planner Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.




> **Controlled DEV acceptance CLOSED - REAL_SMOKE_ATTEMPT_5_GREEN_2026_09_13**
>
> - Attempt 5 completed the complete real controlled-DEV provider path successfully.
> - Real TCMB calls: `1`.
> - OpenAI input-token count: `1`, HTTP `200`, exact input tokens `4882`.
> - Count request id: `req_0ac3ad3a0b2f46cbbb2e2017bac58b47`.
> - OpenAI generation: `1`, HTTP `200`.
> - Generation request id: `req_1f2dbdd2d2e74b3c98e29eb1480db51c`.
> - Provider order: `count -> generation`.
> - Accounting order: `reserve -> markStarted -> settle`.
> - Accounting counters: reserve `1`, markStarted `1`, settle `1`, release `0`, reconcile `0`.
> - Provider usage: input `4882`, cached input `0`, output `153`, total `5035`.
> - Observed actualTryCost: `0.211052`.
> - Grounded response validation passed with `5` accepted source fact paths.
> - Response capability: `today_analysis`.
> - `noMutationPerformed = true`.
> - Production access, DB calls, Planner calls, task mutations, deploys, migrations, retries, and fallbacks: all `0`.
> - Secret cleanup, temporary harness cleanup, HEAD preservation, and clean-worktree post-check all passed.
> - Attempt 5 authorization is consumed. No further controlled-DEV smoke attempt is required for this acceptance gate.
> - **6B.6B.2 Controlled DEV Runtime Acceptance: CLOSED.**
> - **6B Runtime Foundation: CLOSED.**
> - Next product phase: **6C Reactive Coach**.
> - Production provider remains prohibited until separately authorized.
> - Confirm and Apply remain OFF.
> - This block supersedes older controlled-DEV current-state notes below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_4_GROUNDING_STOP_2026_09_12**
>
> - Attempt 4 reached the full real provider transport and accounting path.
> - Real TCMB calls: `1`.
> - Real OpenAI input-token count calls: `1`; HTTP status `200`.
> - Exact input tokens: `2716`.
> - Count provider request id: `req_b3eb7177ea0349fda7d480f05cea7502`.
> - Real OpenAI generation calls: `1`; HTTP status `200`.
> - Generation provider request id: `req_658551d2cc8e4f0abe40a06c3f1b298b`.
> - Provider order: `count -> generation`.
> - Accounting order: `reserve -> markStarted -> settle`.
> - Accounting counters: reserve `1`, markStarted `1`, settle `1`, release `0`, reconcile `0`.
> - Production access, DB calls, Planner calls, task mutations, deploys, migrations, retries, and fallbacks: all `0`.
> - Execution stopped fail-closed only at grounded response validation with `GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE`.
> - Root cause: the prompt required exact fact references but the request payload did not expose the validator's exact allowed reference catalog.
> - Offline repair now sends deterministic `referenceCatalog.sourceFactPaths`, `referenceCatalog.acknowledgedUnknownPaths`, and `referenceCatalog.staleOrBlockedWarningPaths` to the model.
> - Grounding validator strictness remains unchanged; fabricated or out-of-catalog paths are still rejected.
> - Focused grounding repair acceptance: `55/55` tests PASS; typecheck PASS; AI economics safety PASS; AI Coach safety PASS.
> - Attempt 4 authorization is consumed. No automatic rerun is authorized.
> - Any next real provider execution is Attempt 5 and requires new explicit operator authorization.
> - Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_3_COST_TIME_STOP_2026_09_12**
>
> - Attempt 3 real controlled-DEV execution reached the repaired OpenAI input-token count boundary successfully.
> - Real TCMB calls: `1`.
> - Real OpenAI input-token count calls: `1`.
> - OpenAI input-token count HTTP status: `200`.
> - Count provider request id: `req_13e199b81c404d9da2e281ae71c5b241`.
> - Real OpenAI generation calls: `0`.
> - Accounting reserve / mark-started / settle / release / reconcile: `0 / 0 / 0 / 0 / 0`.
> - Execution stopped fail-closed at local controlled-DEV cost authorization with `AI_CONTROLLED_DEV_COST_BOUND_INVALID`.
> - Root cause: the exact count proof is observed at `countedAt`, but controlled-DEV cost authorization evaluated the proof at the earlier request start time (`requestedAt`). Real network latency therefore made a valid proof appear future-dated.
> - Focused offline repair changes controlled-DEV cost authorization evaluation from `input.requestedAt` to `counted.countedAt`.
> - Regression coverage now explicitly models a real count observation occurring after request start.
> - Focused repair acceptance: `48/48` tests PASS; typecheck PASS; AI economics safety PASS; AI Coach safety PASS.
> - Attempt 3 authorization is consumed. No automatic rerun is authorized.
> - Any next real provider execution is Attempt 4 and requires new explicit operator authorization.
> - Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_2_HARNESS_DISCOVERY_FAILURE_2026_09_12**
>
> - Attempt 2 received explicit operator authorization, but the temporary Vitest harness was created under `scripts/`, which is outside the repository's configured Vitest include paths.
> - Vitest stopped with `No test files found` before the test body executed.
> - Attempt 2 real TCMB calls: `0`.
> - Attempt 2 real OpenAI input-token count calls: `0`.
> - Attempt 2 real OpenAI generation calls: `0`.
> - Database calls, Planner calls, task mutations, production access, deploys, and migrations: `0`.
> - Attempt 2 therefore did **not** test the repaired provider contract and did **not** create a new real provider attempt.
> - The Attempt 2 operational authorization is consumed under the no-automatic-rerun rule.
> - Any next real provider execution requires a new explicit authorization and must use a Vitest-discoverable temporary harness under `supabase/functions/_shared/ai-coach/**/*.test.ts`.
> - Provider repair remains locally GREEN and committed. Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_1_2026_09_12**
>
> - The first explicitly authorized real controlled-DEV smoke attempt is consumed.
> - Real OpenAI input-token calls in attempt 1: `1`.
> - The input-token request returned HTTP `400` and failed closed as `count_http_error`.
> - Provider request id: `req_ee35d869741f444c8de988f93b0f9bec`.
> - Real generation calls in attempt 1: `0`.
> - Reservation / mark-started / settlement / release / reconciliation: `0 / 0 / 0 / 0 / 0`.
> - Database calls, Planner calls, task mutations, production access, deploys, and migrations caused by the smoke: `0`.
> - The offline provider-contract repair is focused-GREEN. The strict provider schema surface was reduced while stronger deterministic local validation remains enforced.
> - Safe provider error `type/code/param` diagnostics are now implemented locally; provider message text is not surfaced.
> - A second real provider smoke is **NOT AUTHORIZED**.
> - Production provider activation remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This current-state block supersedes older pre-smoke wording later in this document.


Last updated: 2026-09-19

## Canonical source

- Repository: `https://github.com/Melihll/kpss.git`
- Base branch: `main`
- Local working branch: `evre6-ai-coach`; latest accepted Evre 6C final acceptance checkpoint is `d6ac4f5370cffbbd6667b45d3790cd5f4971dea2`. Always verify `git status -sb` and `git log -1` before any push, deployment, migration, or runtime activation.
- 6B.1 base commit: `cbc209fdf34f217b6d1419612199ee8c8370fe4b`
- 6B.1 accepted checkpoint: `acd16ffb2263b5285b14bd7329ff4357d7971e00`
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
- Planner V2 / Planner Truth Evre 5: `CLOSED`. Engineering, exact-profile production acceptance, and final Week/Today real-user observation are complete. Confirm and Apply are OFF.
- Evre 6 AI Coach: 6A is `CLOSED`; 6B.1–6B.6B.1 are accepted locally; 6B.6B.2 local acceptance is green and checkpointed on the feature branch. The controlled local-DEV authority chain now includes the default-OFF/prod-prohibited switch, server-only credential, fixed-origin injected-fetch gateway, real/mock transport authority separation, exact OpenAI count identity with unresolved billing preserved, dedicated controlled-DEV cost authorization, authoritative local route/pricing, TCMB acquisition/freshness, and full A→Z mocked smoke. `TEMP_DEV_COST_POLICY_2026_09_12` allows one separately approved observed-cost local-DEV smoke despite unresolved count billing; no real provider call has occurred. Both AI migrations remain local-only; current Coach runtime, deployment, gates, and production are unchanged.

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

`AIC-004 / Evre 6D — Proactive Coach (ACTIVE / IN_PROGRESS)`

`AIC-003 / Evre 6C Reactive Coach` is CLOSED at final acceptance checkpoint `d6ac4f5370cffbbd6667b45d3790cd5f4971dea2`.

The canonical 20-scenario Reactive Coach authority contract is accepted for 6C. Focused routing/executor `29/29`, complete AI Coach `205/205`, full non-integration `1209/1209` across `161/161` files, workspace typecheck, and mutation-authority audit are green.

Reactive Coach remains read-only. Planner/task/capacity mutation authority, Confirm authority, and Apply authority remain false. Production provider activation is still prohibited and no Evre 6C code has been deployed from this feature branch.

6D Step 2A deterministic selection is accepted at `3481271b26fd0241d8ecd4a310e08ea85e5083c6`, with local-auth harness stabilization at `888040011dc773a5a143b4d62d054623957495c3`. Step 2B.3 adds the immutable eight-signal materiality/actionability policy at `c3d8fbe60a8dae4474a5d67ec547010b7fcbbcb2`; Step 2B.4 integrates it before active-work and attention controls at `a0db5d8d0d5d1a80026e2f6906ae70c3f868470c`.

V1 may select only completed-as-planned, repeated task miss, recent recovery, and persisted Planner warning after independent evidence validation. Partial completion, completion drop, capacity change, and material stall remain explicit unresolved silence. Existing cooldown/dedupe state is not canonical clear-condition hysteresis; an approved persistent server-owned state contract is still required. Runtime/user-control wiring, deterministic templates/rendering, and shadow precision/actionability acceptance remain open, so AIC-004 is not done.

6E Planner integration, 6F bounded conversation intelligence, and 6G production acceptance remain NOT_STARTED.

## Production guardrails

- No silent Today-task removal.
- Extra Study does not silently substitute for planned work.
- AI has no direct plan/stage mutation authority.
- AI has no direct task, capacity, workload, material, progress, learning-stage, or Apply authority.
- All quantities, lifecycle states, proactive triggers, and feasibility decisions are deterministic; no LLM is used for deterministic calculations.
- CoachContext material facts come only from canonical Material Truth and Canonical Workload Engine; legacy top-three projections are not truth sources.
- Incomplete PLN-002 semantics make definitive ahead/behind claims unknown, but do not block other independently known Coach facts.
- AI usage/cost telemetry starts in 6B. `TEMP_DEV_COST_POLICY_2026_09_12` temporarily makes the 300 TL monthly ceiling non-blocking only for the controlled initial local-DEV observation path; the automatic 300 TL per-user hard governor remains a mandatory 6G production-acceptance requirement.
- Model routing/pricing and versioned TRY estimation are centralized server-side; the ledger carries provider cost and versioned TRY cost estimates.
- New development must not use the legacy Coach planning Apply path. Every future Coach-originated planning mutation must converge on the canonical Planner V2 lifecycle.
- Real-plan impact claims require a fresh deterministic Planner V2 scenario/preview.
- Proactive Coach is in-app only with attention budget, category cooldown, dedupe, and valid silence.
- Raw long-term conversation history is not stored by default; 6F uses short recent context plus compact structured state/signals.
- User-facing analysis uses durum analizi, ilerleme değerlendirmesi, ders dengesi, çalışma eğilimi, and plan riski—not mastery or medical-style diagnosis.
- Coach facts carry freshness, confidence/authority, provenance, and unknown semantics where applicable.
- Conversation text cannot confirm or apply a proposal.
- Missing canonical metadata degrades safely rather than being guessed.
- No MAT-001 production migration/deployment without a separate release decision.

## NEXT EXACT STEP

Prepare the `AIC-004 / Evre 6D Proactive Coach` implementation slice from the accepted Evre 6 product contract. Keep trigger eligibility fully deterministic and server-owned before any optional wording call.

The first 6D slice must preserve: in-app only delivery; versioned materiality thresholds; freshness/context fingerprints; category cooldown and dedupe; attention budget; active-session protection; deterministic fallback; dismiss/snooze/disable controls; silence as a valid outcome; zero automatic Planner proposal generation; and zero Confirm/Apply authority.

Do not deploy, migrate, enable production provider traffic, enable outbound notifications, or change Planner V2 Confirm/Apply gates while opening 6D.

## 2026-09-10 Evre 6A final contract closure

- Status: `EVRE_6A_CLOSED — FINAL_CONTRACT_ACCEPTED — DOCS_ONLY`.
- The dedicated spec defines Explain, Diagnose, Guide, Proactive Insight, Planner V2 proposal interpretation, daily/weekly analysis, and contextual conversation.
- AI teacher/tutoring/quiz/mastery capabilities are explicitly outside Evre 6.
- Twenty Turkish scenarios bind each user message/event to required truth sources, deterministic-versus-LLM responsibility, allowed/forbidden behavior, Planner proposal eligibility, and expected UX.
- AI cannot create/move/cancel/apply tasks, calculate canonical workload/capacity, invent materials, mutate capacity/progress/stage, or bypass Planner V2.
- New development does not use the legacy Coach planning Apply path. Every future Coach planning mutation converges on the canonical Planner V2 lifecycle; natural-language “tamam/uygula” cannot confirm or apply.
- CoachContextV1 uses canonical Material Truth and Canonical Workload Engine. Legacy top-three material/workload projections are not truth sources.
- PLN-002-insufficient ahead/behind claims fail closed to unknown per field while other Coach capabilities remain available.
- Proactive insight categories use deterministic in-app triggers, materiality/data-quality gates, fingerprint freshness, hysteresis, 72-hour same-fingerprint suppression, 24-hour category cooldown, daily attention limits, user controls, valid silence, and no automatic proposal creation.
- AI usage/cost telemetry begins in 6B. Server-side centralized router/pricing and the cost ledger carry provider cost plus versioned TRY estimates. The 6G hard governor enforces the 300 TL monthly user ceiling before production acceptance; deterministic answers use no LLM.
- Raw long-term conversation history is not stored by default; 6F uses short recent context plus compact structured state/signals.
- Real plan impact is stated only from a fresh deterministic Planner V2 scenario/preview. User-facing analysis avoids mastery/medical diagnosis terminology. Coach facts expose freshness, confidence/authority, provenance, and unknown semantics where applicable.
- Evre 6 phases are 6A contract, 6B CoachContextV1, 6C Reactive Coach, 6D Proactive Coach, 6E Planner V2 integration, 6F Conversation Intelligence, and 6G Eval/Cost/Production Acceptance.
- All 20 Turkish acceptance scenarios were revalidated against the ten final decisions with no contract contradiction.
- No runtime code, deployment, migration, gate, production data, or production capability changed. Planner V2 Confirm remains OFF. Planner V2 Apply remains OFF.

## 2026-09-07 Evre 5 production acceptance

- Preview production PASS, exact Confirm production PASS, and meaningful atomic Apply production PASS for exact profile `73f9b34c-da73-43d9-a05c-2026409cf290`.
- Fresh lifecycle record `805be0cb-7d68-4b12-8df9-7b14f52a852e` reached `applied` with non-null `confirmed_at` and `applied_at`. The earlier expired attempt was not reused.
- Apply created task `c428ab7b-5186-42cb-a3a3-de6058387471`: `13 - TABAN ARİTMETİĞİ - İLYAS GÜNEŞ l KPSS - MEB AGS`, scheduled 2026-09-08 for 22 minutes with canonical identity `youtube:bae6f705-159f-4e45-a22e-456b091d45bd` and an exact `full_video` boundary.
- Result: `1 create / 0 replace / 22 min`. Weekly plan `ebbba80d-427c-4d5b-9562-e235f58ba266` moved from `2662 / 2662 / 2640`, generation 3, to `2662 / 2662 / 2662`, generation 4.
- Safety acceptance PASS: past and Today task fingerprints were unchanged; all 41 protected manual future tasks were unchanged; study sessions remained 85 completed / 0 active / 0 cancelled; active canonical duplicate count is exactly one.
- Read-only closure postflight reconfirmed the same lifecycle, task, plan, protection, duplicate, and session state. Linked migrations are synchronized with zero pending. app-api v47 is ACTIVE with JWT verification enabled and its downloaded 27-file source matches the local Planner V2 release after newline normalization.
- Confirm and Apply gates are absent/OFF after the pilot. Preview remains exact-profile-only. No deployment, migration, gate change, or production-data mutation occurred during the closure postflight.
- Evre 5 engineering and production acceptance completed here; the bounded real-user observation closed successfully on 2026-09-08. Evre 6 AI Coach is now the next active macro phase.

## 2026-09-08 Evre 5 final real-user observation and closure

- The authenticated production Week page showed the accepted task on 8 September as a 22-minute Mathematics video item; the Today page showed the same exact task title and linked material in the normal task sequence. Week visibility and Today visibility both passed before the Planner V2 task was started.
- Database observation reconfirmed task `c428ab7b-5186-42cb-a3a3-de6058387471` as `ready`, dated 2026-09-08, with 22 estimated minutes, zero task progress, zero linked study sessions, exact canonical identity `youtube:bae6f705-159f-4e45-a22e-456b091d45bd`, an active full-video boundary, and exactly one active canonical duplicate total.
- Weekly plan `ebbba80d-427c-4d5b-9562-e235f58ba266` remained `2662 / 2662 / 2662`, generation 4. Three other Today-task changes were fully explained by natural linked study sessions totaling 127 minutes; no future manual task had changed after Apply and no unexplained task mutation was found.
- Confirm and Apply remained absent/OFF. The observation created or updated zero tasks, sessions, proposals, or plans and performed no deployment, migration, gate change, or repository push.
- Final classification: `EVRE_5_PLANNER_V2_PLANNER_TRUTH_CLOSED`. Meaningful production Apply and final Week/Today real-user observation both passed. Evre 6 AI Coach is the next active macro phase under a separate discovery/specification scope.

## 2026-09-02 Evre 5 preview-attempt lifecycle hardening

- Root cause: preview persistence reused `planner-v2-preview:<proposalFingerprint>` and the partial unique `(user_id, planner_proposal_id)` index, so a repeated deterministic preview could return an expired lifecycle row instead of a fresh confirmation lease.
- The app-api candidate now appends a random attempt UUID to the deterministic fingerprint-based idempotency prefix. `20260901123000_planner_v2_preview_attempt_lifecycle.sql` replaces the unique proposal-identity index with a non-unique lookup index; proposal/snapshot fingerprints stay deterministic and exact confirmation remains bound to the returned `recordId`.
- `20260902101000_align_service_role_task_privileges.sql` reproduces the already-hosted CRUD baseline for four task/plan tables after local reset. It does not grant proposal-table writes or broaden hosted authority.
- A real DB regression exposed the latent confirmed→expired Apply failure against `confirmed_action_proposals_confirmation_state`. `20260902103000_harden_planner_v2_expired_confirmation_state.sql` preserves the strict constraint and clears `confirmed_at` atomically with the expiry transition; Apply remains executable only by `service_role`.
- Local verification is GREEN: focused lifecycle/security/HTTP `26/26`; Planner V2 lifecycle DB integration `16/16`; all integration `132/132`; full non-integration `949/949`; workspace typecheck, Planner V2 safety/read-only checks, local PostgreSQL lint, and diff check PASS.
- No production command, deploy, migration, secret/gate change, proposal action, Apply, or application-data mutation occurred. Confirm and Apply remain OFF. The candidate is committed locally and remains unpushed pending release review.

## 2026-09-01 W8D confirm correction + W8E controlled Apply engineering

- Historical proposal `19ade727-e534-4be1-bdb0-3c7b6e505af0` is authoritatively `expired` with `confirmed_at = null`. The false success came from a three-layer contract gap: the confirmation RPC returned an expired result as JSON without a transport error, app-api forwarded it as HTTP 200, and the web ignored the body and set a local `confirmed=true` flag.
- Confirmation now parses only the exact five identity fields, rereads the owned lifecycle row after the RPC, and returns success only when persistence is exactly `confirmed` with matching record/proposal/fingerprint/snapshot/planner identities and a valid non-null `confirmed_at`. Expired, stale, rejected, non-pending, wrong-owner, and wrong-identity outcomes cannot render confirmed UI.
- `PLANNER_V2_APPLY_V1_PROFILE_IDS` is independent and default OFF. Missing, blank, malformed, empty-entry, or wildcard configuration fails the whole setting closed. Apply also requires preview eligibility, an exact persisted confirmed proposal, active owned profile, and fresh current Planner V2 state.
- `POST /planner-v2/apply` authenticates the human JWT, derives actor user/profile server-side, refuses client authority fields, reloads the exact proposal, recomputes component freshness, and calls the deployed service-role-only `apply_planner_v2_proposal_candidate` RPC. Atomicity, current-day/protected-task retention, capacity, canonical dedupe, unknown-workload blocking, rollback, and idempotency remain database-enforced.
- Web Apply is shown only for an authoritative confirmed response plus Apply capability ON. Neither confirmation nor Apply is optimistic; expired/stale outcomes require a fresh preview.
- Current-week absence is expected input-state behavior, not a missing rollover engine. The active P48 strategy has no current plan because it has neither active recurring availability nor current-week daily overrides. Recurring availability would carry forward if present; the existing Week/Today `ensureWeek` flow already calls `/p48/week/generate` and correctly refuses to invent capacity.
- No migration was required. No production deployment, secret change, proposal action, plan/task mutation, or bootstrap was performed. Production remains preview exact-profile-only, confirmation OFF, new Apply gate absent/OFF, canonical planner OFF, and evidence shadow OFF.
- Verification is GREEN: focused lifecycle/security `86/86`; targeted canonical Planner V2/planning/capacity/P48 `451/451`; local HTTP gate/authority/incident matrix PASS; local integration/RLS/transaction `130/130`; full non-integration `939/939`; typechecks, explicit production-target web build, app-api local bundle/HTTP serve, client secret/target scan, Planner V2 bundle/read-only safety, local PostgreSQL lint, and diff checks PASS.
- Read-only production refresh: app-api v36 ACTIVE, Telegram v37 ACTIVE, preview/capture exact-profile allowlists present, confirm/Apply/canonical/evidence-shadow secrets absent, and linked migrations synchronized with zero pending. No production command changed state.
- Full engineering record: [W8D/W8E Confirm + Apply Engineering](releases/2026-09-01_W8D_W8E_CONFIRM_APPLY_ENGINEERING.md).

## 2026-08-27 W8A exact-profile preview-only pilot preflight

- The W7 single lifecycle allowlist coupled preview and confirmation, so it was not activated. W8A implements independent `PLANNER_V2_PREVIEW_V1_PROFILE_IDS` and `PLANNER_V2_CONFIRM_V1_PROFILE_IDS` gates; confirmation additionally requires preview eligibility for the same profile.
- Missing, empty, malformed, or wildcard settings fail closed. UUID lists are whitespace-safe and duplicate-safe. The Week page shows preview content for a preview-only profile but hides confirmation controls and never implies Apply.
- Preview authority is limited to an inert short-lived `previewed` lifecycle row. It cannot mutate tasks, plans, resource links, progress, sessions, capacity, or canonical tasks. No `/planner-v2/apply` route, Apply UI, or client/service Apply call exists.
- Exact profile `73f9b34c-da73-43d9-a05c-2026409cf290` remains active, ownership-consistent, non-test, and outside an active study/planning transition: 0 active sessions, 0 in-progress tasks, 57 tasks (4 current-day / 15 future), 2 plans, 27 active resources, 9 subjects, and 0 lifecycle proposals.
- Fresh production read-only shadow: 76 exact eligible YouTube items / 3,323 minutes, 265 unknown blocked items, 15 available minutes after protected commitments, 0 scheduled items, 0 unknown/completed/duplicate items scheduled, current day protected, Apply false, and identical before/after counters.
- Verification is green: split focused 32/32; W5/W6/W7/W8A focused 211/211; planning/canonical/P48 154/154; integration 130/130; full non-integration 909/909; typecheck, production web build, app-api bundles, safety checks, normal HTTP smoke, and dedicated preview-only matrix PASS.
- Production remains app-api v32 / Pages `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae` / Telegram v34 with zero pending migrations. Both new gates, canonical planner, and evidence shadow are OFF; the physical-capture pilot is unchanged. W8A caused zero production mutation and performed no deployment or secret change.
- Full preflight and the unexecuted activation/rollback commands are recorded in [W8A Planner V2 Preview-Only Pilot Preflight](releases/2026-08-27_W8A_PREVIEW_ONLY_PILOT_PREFLIGHT.md).

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

### 2026-08-27 W7 release-gate privilege hardening

- The first W7 production preflight correctly blocked release because authenticated users could execute the public-schema Apply RPC through PostgREST and existing authenticated task writes extended to the new canonical metadata columns.
- The still-undeployed `20260826120000` migration was hardened in place so exactly one linked migration remains pending. Apply is `service_role`-only and requires explicit actor user/profile bindings; the database rechecks proposal, confirmation, profile, and plan ownership.
- A database trigger denies authenticated/anon canonical metadata insertion or modification while leaving legacy owner task INSERT/UPDATE behavior intact. A completeness constraint binds `planner_v2` source semantics to nonblank canonical identity/material/version/fingerprint fields and valid exact physical/video boundaries.
- A future app-api Apply route must verify the human JWT, derive actor user/profile server-side, and call the server-only RPC. No such route was added or enabled during W7-FIX.
- Production migration, tasks/plans/proposals, gates, secrets, app-api v31, web, and Telegram remain unchanged. Repeat the complete W7 release preflight against the hardened commit before requesting schema-release approval.

### 2026-08-27 W7 schema/RPC production release

- Status: `W7_SCHEMA_RPC_DEPLOYED — PLANNER_V2_RUNTIME_OFF`.
- The sole approved migration `20260826120000_planner_v2_proposal_lifecycle_candidate.sql` was applied from reviewed source `a4833593f94ede42f7b7399bec9ebb939e2efa74`; its SHA256 is `a52d9ccc1f7b135ce7a93bb9c546e866c57beffeabb8d34bc0803e08558691a5`.
- Postflight found every expected canonical task column/constraint/index, proposal lifecycle field/index, helper RPC, metadata guard function/trigger, and Apply RPC. Linked migration history is synchronized, the dry-run reports the remote database up to date, and linked PostgreSQL lint reports no schema errors.
- `apply_planner_v2_proposal_candidate()` is `SECURITY DEFINER`, uses an empty `search_path`, and is executable only by `service_role`. `public`, `anon`, and `authenticated` have no direct Apply authority; the service-role PostgREST schema exposes the trusted path while the database privilege matrix prevents a usable client path.
- `tasks_guard_planner_v2_metadata` is active. It blocks direct untrusted canonical metadata writes while preserving legacy owner task operations; `tasks_planner_v2_metadata_complete` enforces exact all-or-nothing canonical identity and physical/video boundary shapes.
- The migration performed no backfill and activated no behavior. Production remained at `248 / 241` total/active tasks, `9 / 9` total/active weekly plans, `79` task-resource-unit links, `6 / 6` legacy V2 snapshots/proposals, `0` confirmed-action proposals, `0` canonical Planner V2 tasks, and `0 / 0 / 0` W2 snapshots/breaks/evidence.
- Canonical planner, W6 lifecycle, and evidence-shadow remain OFF. The exact physical capture allowlist digest is unchanged. app-api remains v31, Telegram remains v34, and no Edge Function or web deployment, secret change, proposal/confirmation/Apply call, task/plan mutation, or runtime activation occurred.
- The next release gate is a separately approved Gate-OFF app-api/web runtime deployment. A future trusted Apply route must derive actor user/profile from the verified human JWT and pass both bindings to the service-only RPC; W7 does not implement or enable that route.

### 2026-08-27 W7 gate-off runtime production release

- Status: `W7_GATE_OFF_RUNTIME_DEPLOYED`.
- Approved source `395a536d18b79ea124bdac0d4498a021d9ce9bc0` was deployed to production app-api as v32 ACTIVE at `2026-08-27T12:29:12Z`. The supported CLI does not expose an exact deployed bundle SHA; the reviewed source-closure SHA256 is `ed963a421a7feefb8e5da10985eee9d9dec293349c3c819a2683ca2f60d7aaef`. Rollback remains app-api v31 with bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`.
- The verified 18-file web artifact (manifest SHA256 `f447f1b1a4c32fa8cda6dbb8ab5c5628f1a7f90bbb14401289b9ac377a7ef114`) was uploaded to Cloudflare Pages production branch `main`. Deployment `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae` completed at `2026-08-27T12:52:27Z`; immutable URL `https://f7c4dd8e.kpss-coach.pages.dev` and production alias `https://kpss-coach.pages.dev` matched all 18 candidate files byte-for-byte. Web rollback remains deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` at source `8354deff78b06f56411dc969a073c54f68829c69`.
- Public root, Week, and Roadmap routes returned HTTP 200 and the production login shell rendered successfully. While the lifecycle gate is absent, the Planner V2 panel returns null; only the designed capability probe is automatic. Preview and confirmation remain user-initiated and unavailable, and no Apply button, client request, or app-api `/planner-v2/apply` route exists.
- Postflight remained `248 / 241` total/non-cancelled tasks, `9 / 9` total/active weekly plans, `79` task-resource-unit links, `6 / 6` legacy V2 snapshots/proposals, `0` Planner V2 lifecycle proposals in every state, `0` confirmed/applied lifecycle rows, `0` canonical Planner V2 tasks, and `0 / 0 / 0` W2 snapshots/breaks/evidence. Release-caused Planner V2 application-data mutation was zero.
- `PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS` and `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` remain absent/OFF. Canonical planner runtime remains OFF. The exact physical capture allowlist digest is unchanged. Linked migration history remains synchronized with zero pending migrations.
- Telegram webhook remains v34 ACTIVE and was not deployed. No secret, migration, Telegram runtime, production preview, confirmation, Apply call, task/plan/progress row, or pilot configuration changed.
- The next gate is a separately approved exact-profile **PREVIEW-ONLY** production pilot. Apply must remain unavailable.

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
