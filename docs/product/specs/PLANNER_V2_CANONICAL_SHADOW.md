# Planner V2 Canonical Shadow

Status: engineering shadow only

Version: `canonical-planner-v2-shadow-v1`
Runtime authority: OFF

## Purpose and boundary

Planner V2 turns an immutable, subject-agnostic planning snapshot into a deterministic weekly proposal. It does not create, update, cancel, move, or complete tasks. It does not apply a plan revision and does not persist a diagnostic proposal. W5 therefore establishes the future `Preview → Explain → Confirm → transactional Apply` boundary without authorizing Apply.

The existing legacy path remains unchanged:

`P48 capacities/resource targets → minute blocks → weekly task payload → replace/persist RPC`

The adaptive flow also remains unchanged:

`weekly plan + tasks + actual study + revisions → deterministic preview → explicit Apply RPC`

The W5 path is separate:

`canonical material views + PlannerV2WorkloadHandoff + exact capacity + protected commitments → immutable proposal + legacy comparison`

The production runner imports only the canonical read loaders and pure proposal/comparison functions. It does not call the older `runPlanningV2ShadowDecision` diagnostic-persistence path.

## Input contract

`CanonicalPlannerV2Input` contains:

- `userId`, `examProfileId`, `currentDate`, `horizonStart`, and `horizonEnd`;
- one exact integer configured capacity and already-studied minute count for every horizon day;
- classified existing commitments with remaining minutes, date, protection status, and exact canonical workload identity when recoverable;
- `PlannerV2WorkloadHandoff` demand enriched with material boundary, curriculum identity, title, stage decision, priority/order facts, date window, prerequisites, and provenance;
- completed canonical workload identities;
- a deterministic progress-data identity;
- the exact planner, current-day protection, splitting, and ordering policy versions.

The read adapter classifies tasks as completed, in progress, protected current day, pinned/locked, manual, legacy, or future replaceable/generated. Only in-progress, current-day, pinned, and manual remaining minutes occupy proposal capacity. A task is given a canonical physical identity only when it has exactly one authoritative `task_resource_units` identity; ambiguity stays null instead of being guessed.

## Proposal contract

`CanonicalPlannerV2Proposal` contains stable snapshot/proposal fingerprints, version and horizon identity, per-day plans, scheduled exact material items, blocked demand, unmet eligible demand, completed demand omissions, capacity accounting, warnings, explanation facts, and `applyAllowed: false`.

Every scheduled item carries canonical workload/material/resource/topic identity, date, exact integer minutes, authority, confidence, whole material boundary, learning stage, reason codes, and source provenance. Every blocked item retains remaining amount/unit plus both the planner block reason and canonical unresolved-workload reason.

## Snapshot and staleness

The snapshot fingerprint is SHA-256 over stable canonical JSON of every relevant decision input. Object keys are sorted; database arrays are normalized by stable identities; prerequisite/provenance arrays are sorted. Relevant capacity, commitment, workload, progress, policy, profile, or horizon changes therefore change the fingerprint. The proposal fingerprint covers the snapshot fingerprint and normalized result.

W6 Apply must re-read authoritative state, reconstruct this input, compare the snapshot fingerprint transactionally, and reject a mismatch. W5 has no Apply implementation.

## Exact capacity

For each day:

`available = max(0, configured - already studied - protected commitments)`

`overcommitted = max(0, already studied + protected commitments - configured)`

`unused = available - newly proposed`

All quantities are non-negative integer minutes. The engine never rounds capacity upward and never emits hidden overtime. A whole workload that is one minute too large remains unmet or moves to a later fitting day. Pre-existing protected overcommit is surfaced explicitly rather than concealed.

## Whole-material splitting policy

W5 uses `whole_canonical_workload_only`.

- A YouTube demand is the whole authoritative remaining video. Its duration is `ceil((duration_seconds - watched_seconds) / 60)`. Segment mappings remain blocked because canonical segment progress does not exist. Multiple topic views of one full video share `youtube:<source-video-id>` and can schedule only once.
- A physical demand can schedule only when the canonical engine supplies planner-eligible exact/calibrated remaining minutes and the remaining page boundary is authoritative. W5 does not split a page range because it cannot yet map arbitrary minute chunks back to authoritative progress boundaries.
- Unknown, missing-mapping, ambiguous, inactive, or boundary-less material is never converted into a default 30/60-minute task.

## Deterministic ordering

The stable order is:

1. explicit user priority, descending, when the input owns one;
2. already-started continuation;
3. learning stage (`learn`, `practice`, `review`, `reinforcement`);
4. earliest latest-date constraint;
5. current P48 resource `sequence_order` plus canonical material `sortOrder`;
6. canonical workload identity;
7. demand identity.

Production canonical material currently has no independent explicit user-priority field, so the adapter supplies neutral priority `0`; it does not manufacture preference. Pinned/manual legacy tasks are protected commitments, not optimizer hints. Database row order and randomness never participate.

## Learning stage

Material completion and topic mastery remain separate. The read adapter conservatively maps current P48 `work_mode` to a proposal stage: video/book/notes to Learn, questions/mock to Practice, and review to Review. Current `topic_progress.state` gates Practice and later stages. Unknown stage binding remains explicit and non-advancing. A proposal never updates topic state, mastery, material progress, or task status.

This adapter is a shadow interpretation of current authoritative fields, not permission to activate stage-dependent production planning. PLN-004/PLN-005 activation gates remain unchanged.

## Current-day and existing-work safety

No new canonical item may be placed on or before `currentDate`. Existing current-day tasks remain visible as protected commitments and occupy their remaining capacity. Completed canonical identities are omitted. Exact in-progress identities are blocked from duplicate planning. Future generated/legacy tasks remain read-only comparison inputs unless explicitly pinned/manual.

## Proposal invariants

The proposal assertion fails on negative/zero scheduled minutes, unknown scheduled workload, capacity overflow, day/item mismatch, current/past placement, duplicate canonical identity, invalid horizon date, daily or horizon reconciliation error, hidden overcommit, or any Apply authority. Candidate filtering separately keeps blocked, completed, missing-boundary, invalid-duration, and prerequisite-unsatisfied demand out of scheduled items.

## Legacy comparison

The read-only comparison reports:

- exact post-study capacity, protected occupancy, legacy and V2 proposed minutes, overflow, and unused minutes;
- unique canonical eligible demand, scheduled/unmet eligible demand, and unknown/mapping blockers;
- exact YouTube, calibrated physical, duplicate, completed, and unknown scheduling counts;
- per-day counts/minutes, legacy-only/V2-only/comparable items, and date/order differences;
- current-day, capacity, unknown/stale, and duplicate safety violations.

Parity is diagnostic, not the quality objective: legacy tasks may contain historical fixed-minute assumptions and may lack an exact material identity.

## Production read-only contract

`run-canonical-planner-v2-readonly.mjs` selects an active profile, reads the active plan, capacities, tasks, preferences, exact task-unit links, P48 targets, topic progress, canonical material, and current accepted W2 evidence, then builds the proposal and comparison in memory. It records before/after row counts for tasks, plans, old V2 diagnostic rows, and W2 tables. The adapter and runner contain no `.insert`, `.update`, `.upsert`, `.delete`, or `.rpc` call and do not import the diagnostic persistence runner.

The physical evidence read uses the established W4 diagnostic bypass only for read-only calibration evaluation. It does not change `PHYSICAL_PACE_EVIDENCE_SHADOW_V1`. Canonical planner runtime, production Apply, app-api Today/Week mutation, Telegram, migrations, secrets, and deployments remain untouched and OFF.

### 2026-08-26 read-only observation

The exact pilot profile produced `341` canonical views: `76` exact/high-confidence YouTube views and `265` unknown views. Exact remaining YouTube demand was `3,323` minutes. Physical calibration remained `0` accepted/usable W2 samples, `0` calibrated pages, and `5,103` unknown pages. The active legacy week had `1,386` post-study capacity minutes, `1,372` remaining legacy/protected minutes, and only `15` unoccupied contiguous minutes. Whole-video policy therefore scheduled zero videos and reported all `3,323` exact minutes as unmet; it did not split or invent work. It blocked `245` pace-unknown and `20` mapping-unknown views.

Before/after counts were identical: tasks `57`, weekly plans `2`, diagnostic snapshots/proposals `0/0`, W2 activity snapshots/breaks `0/0`, and accepted physical evidence `0`. The comparison reported zero current-day, unknown-scheduled, duplicate, completed-scheduled, legacy horizon-overflow, and V2 horizon-overflow violations. It surfaced one pre-existing day with a one-minute protected overcommit.

Local integration/RLS passed `116/116` across `12/12` files after Docker Desktop and the local Supabase stack were restored. The first run immediately after startup hit a transient local `JWT issued at future` setup error; host, Auth, and database clocks were aligned, the complete rerun passed without an implementation or test change, and no production system was involved.

## Future Apply boundary

W6 may add a separately approved Apply path only if it:

- requires explicit preview and confirmation;
- verifies the snapshot fingerprint transactionally;
- preserves current-day, completed, in-progress, pinned/manual, and user-intent constraints;
- persists exact canonical workload and boundary identities;
- remains idempotent and rejects duplicates/stale state;
- never treats proposal generation or study completion as implicit Apply.
