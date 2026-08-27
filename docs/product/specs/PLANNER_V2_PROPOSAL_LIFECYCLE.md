# Planner V2 Proposal Lifecycle

Status: W7 schema/RPC deployed; Planner V2 runtime inactive
Lifecycle version: `planner-v2-lifecycle-v1`
Planner version: `canonical-planner-v2-shadow-v1`

## Purpose and release boundary

W6 turns the immutable W5 canonical proposal into a reviewable lifecycle:

`snapshot → proposal → preview → structured explanation → exact confirmation → freshness check → atomic Apply candidate`

This is not a production Planner V2 runtime release. The profile capability `PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS` defaults OFF, rejects `*`, and is unset in production. There is no Planner V2 Apply HTTP route, no production secret change, and no app-api/web/Telegram deployment in W7. The additive schema/RPC capability was deployed separately on 2026-08-27; migration presence alone does not generate, preview, confirm, or apply a proposal.

## Existing infrastructure audit

The established `confirmed_action_proposals` framework already supplies server-created short-lived proposals, authenticated ownership, plan-generation checks, a database fingerprint, advisory transaction locks, and an idempotent applied result. `apply_plan_revision()` also demonstrates a single PostgreSQL transaction and protected task-state checks. W6 reuses those safety patterns and the W5 deterministic snapshot/proposal engine.

The existing schema was not sufficient for canonical Apply. Tasks had no persisted canonical workload/material boundary, planner version, or proposal fingerprint; duplicate canonical work could not be proven without title inference. Existing proposal rows did not bind the W5 proposal fingerprint, W5 snapshot fingerprint, planner version, or confirmation timestamp. The legacy/P48 replacement RPCs also cannot express the conservative W6 replacement scope. An additive local migration candidate was therefore required; unsafe client multi-write logic was not created.

W7 release preflight identified two privilege-boundary gaps before production apply: authenticated users could execute the public-schema Apply RPC through PostgREST, and existing authenticated task INSERT/UPDATE grants would automatically cover the new canonical metadata columns. The candidate was hardened in place before release. Apply is executable only by `service_role`, and a database trigger protects Planner V2 task metadata while preserving existing legacy task writes. The reviewed hardened migration was then deployed on 2026-08-27 with runtime gates still OFF.

## State machine

| State | Meaning | Allowed next transitions |
| --- | --- | --- |
| `generated` | Immutable body, snapshot and output fingerprint; no authority. | `previewed`, `rejected`, `expired` |
| `previewed` | Visible to the user; no mutation authority. | `confirmed`, `stale`, `rejected`, `expired` |
| `confirmed` | Exact proposal identity explicitly accepted; freshness still mandatory. | `applied`, `stale`, `rejected`, `expired` |
| `applied` | Transaction committed exactly once. | repeated Apply returns the original result |
| `stale` | Authoritative state changed. | terminal; regenerate, preview and confirm again |
| `rejected` | Proposal declined/invalidated. | terminal |
| `expired` | Confirmation window elapsed. | terminal |

The domain transition function rejects every unlisted transition. UI navigation does not change lifecycle state.

## Identity and freshness

- `snapshotFingerprint` is deterministic SHA-256 over decision inputs.
- `proposalFingerprint` is deterministic SHA-256 over the exact output.
- confirmation binds user, profile, proposal ID, proposal fingerprint, snapshot fingerprint, planner version, and server confirmation time.
- component hashes classify capacity, progress, task state, workload, protected commitments, and policy changes.
- the transaction also compares `planner_v2_database_fingerprint()`, which covers the active plan, task/progress/session/capacity state, exact task-unit links, resource-unit progress, YouTube catalog/progress/mappings, and topic progress.

Any mismatch returns `stale`; it is never silently repaired. The only recovery path is regenerate → preview → explicit confirmation.

## Preview and explanation contract

Preview is a pure immutable representation with:

- horizon totals for available, protected, newly planned, unused, unmet, and blocked demand;
- per-day configured/available/protected/proposed/unused minutes, warnings, and exact scheduled items;
- canonical identity, resource/topic, material type, whole boundary, minutes, workload authority/confidence, reason codes, and continuation state;
- blocked canonical demand and its unresolved reason;
- created identities plus retained, replaceable, and outside-scope task IDs.

Structured explanation facts are domain facts: `day_capacity`, `continuation_selected`, `blocked_workload`, `current_day_protected`, `unused_capacity`, and `replacement_scope`. AI is neither required nor allowed to invent placement reasons or authorize mutation.

## Replacement and protection rules

`RETAIN` includes current-day, completed, in-progress, manual, pinned/locked, explicit carryover, and baseline-import/legacy commitments. `REPLACEABLE` is limited to explicitly named future generated work (`planner_v2`, curriculum/resource generation, revision generation, or dynamic replan) within the exact proposal horizon. `OUTSIDE_SCOPE` includes undated or out-of-horizon work and is untouched.

New work must be strictly after the snapshot current date and inside the horizon. Unknown workload, missing subject identity, duplicate canonical identity, non-positive minutes, or an unsupported boundary cannot enter the transaction. User intent has no optimizer override.

## ApplyPlan

The deterministic ApplyPlan contains proposal/snapshot/planner identity, owner/profile/horizon, retained/replaceable/outside IDs, exact canonical task creates, whole material boundaries, workload authority/confidence, dedupe keys, expected minutes, `atomicRequired=true`, and `applyCandidateOnly=true`.

Physical tasks require a persisted `physical:<resource_unit_uuid>` identity and exact page boundary before task/resource-unit linkage can be written. Synthetic structural spans remain previewable but are not persistable. YouTube tasks require `youtube:<video_uuid>`, an active owned full video, and exact duration identity. Titles are never identity.

## Transaction and idempotency

`apply_planner_v2_proposal_candidate()` is server-only and executes in one PostgreSQL transaction. `public`, `anon`, and `authenticated` have no EXECUTE authority; only `service_role` may call it. A future app-api Apply route must first verify the human JWT, derive the actor user and active profile, and pass both bindings to the server-only RPC. The database independently verifies that the actor owns the proposal, confirmation, profile, and active plan before continuing.

The transaction locks the proposal and weekly plan, takes a per-user advisory transaction lock, verifies exact confirmation identity, plan generation, the authoritative database fingerprint, owner/profile, horizon, protected replacement scope, active resource/material boundary, canonical uniqueness, and final capacity. Only then does it cancel the explicitly named future Planner V2 tasks, insert exact canonical tasks/progress/unit links, reconcile plan minutes, advance generation, and store one result.

Any raised failure rolls back all replacement and insert operations. A repeated call after `applied` returns the stored result with `idempotent=true`; it cannot create tasks or consume capacity again. A unique partial index prevents the same active canonical workload from appearing twice in one plan.

## Canonical task metadata privilege boundary

Existing authenticated task INSERT/UPDATE and owner RLS remain unchanged for backward compatibility. `tasks_guard_planner_v2_metadata` rejects direct `authenticated` or `anon` attempts to create Planner V2 tasks, inject canonical metadata into legacy tasks, or change protected metadata on canonical tasks. Trusted `service_role` writes and the postgres-owned transactional Apply function are allowed through the guard.

`tasks_planner_v2_metadata_complete` makes canonical metadata all-or-nothing: only `source_reason='planner_v2'` may carry it, every identity/version/fingerprint field must be nonblank, and the boundary must be a valid exact physical-page or full-video shape consistent with the canonical workload identity. Historical and new legacy tasks continue to require all canonical fields to be null; no backfill is required.

## App-api and web

- `GET /planner-v2/capability` reports preview/confirmation and always reports Apply disabled.
- `POST /planner-v2/preview` is behind the exact-profile default-OFF gate, uses the authenticated read-only W5 adapter, creates a short-lived server proposal candidate, and performs no task/plan mutation.
- `POST /planner-v2/confirm` accepts every exact identity field and records confirmation only.
- no `/planner-v2/apply` route exists.

The Week page hides the panel when capability is OFF. When enabled locally it shows capacity, proposed days/items, blocked work, deterministic facts, replacement counts, and an exact-confirm button. After confirmation it explicitly states that Apply is unavailable.

Telegram remains unchanged and legacy/UI-blocked. No weaker service-role or generic-text confirmation channel was added.

## Future release sequence

1. Completed: review and harden the additive schema/RPC candidate.
2. Completed: apply the migration under schema-only production approval with capability OFF.
3. Completed: verify zero proposal/task mutation, service-only Apply, metadata guards, and zero pending migrations.
4. Next: separately approve and deploy the Gate-OFF app-api/web preview/confirmation runtime while keeping the lifecycle profile gate OFF and Apply unavailable.
5. Later: run a separately approved exact-profile preview/confirm pilot with Apply still unavailable, then review natural preview quality and stale behavior.
6. Design a distinct app-api Apply activation gate and rollback plan. That future route must derive actor user/profile from the verified JWT and invoke the service-role-only RPC; deploy/activate only under explicit approval.

The hardened migration `20260826120000_planner_v2_proposal_lifecycle_candidate.sql` is deployed with SHA256 `a52d9ccc1f7b135ce7a93bb9c546e866c57beffeabb8d34bc0803e08558691a5`. Production canonical planning, W6 lifecycle, evidence-shadow consumption, capture-pilot configuration, app-api/web runtime, Apply routing, and Telegram remain unchanged and outside this schema-only release authority.
