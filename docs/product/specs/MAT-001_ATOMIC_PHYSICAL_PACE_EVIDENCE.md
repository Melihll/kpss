# MAT-001 Atomic Physical Pace Evidence

Status: PRODUCTION_SCHEMA_DEPLOYED — CAPTURE_RUNTIME_NOT_ACTIVATED

## 1. Goal

W2 makes future physical study measurable without fabricating historical pace. An accepted sample exists only when actual break-adjusted active time and an authoritative physical page-progress delta are completed by the same sanctioned database transaction.

The W2 schema/RPC migration is deployed. This release did not activate canonical planning, change the current app-api or Telegram study routes, backfill history, deploy an Edge Function, or write production evidence data.

## 2. Authoritative lifecycle audit

| Path | Actual-time owner | Physical-progress owner | Transactional relationship | W2 authority |
| --- | --- | --- | --- | --- |
| `start_study_session` → pause/resume → `finish_study_session` | Finish closes an open break and subtracts recorded breaks from elapsed time. The underlying session and break rows remain authenticated-user editable. | None. | Session/accounting is transactional, but no protected start timestamp or exact unit boundary is captured. | Existing accounting input only; not accepted physical pace. |
| `record_retroactive_session` | User-supplied actual minutes, overlap-serialized and overlap-validated. | None. | Session/accounting is atomic; progress remains separate. | Actual time only; not accepted pace. |
| `complete_task_unit` | None. | Completes task-unit link and resource-unit progress. | Task/progress writes are atomic with each other. | Progress only; never pace. |
| Direct `resource_unit_progress` mutation | None. | Exact status and optional `completed_through_page`. | One progress mutation only. | Progress only; never pace. |
| `record_test_result` | Optional user-recorded test duration. | Exact test-unit completion in the same function. | Result and first completion are atomic. | Existing W1 first-completion authority remains valid. |
| App-api `/study/start`, `/study/:id/finish`, pause/resume, and test routes | Delegates to the RPCs above. | Delegates separately. | No combined physical page completion today. | Unchanged/inactive for W2. |
| Telegram start/finish and test-result callbacks | Service wrappers delegate to the same RPCs. | Test result may complete an exact unit; ordinary finish does not. | Same boundaries as web. | Unchanged/inactive for W2. |

Current overlap protection remains authoritative: live sessions are unique per user, retroactive recording uses the user advisory lock and interval-overlap predicate, and touching interval boundaries are allowed.

## 3. Chosen architecture

The lifecycle audit found that authenticated users can directly update their own `study_sessions` and `study_session_breaks`. Those rows remain compatible accounting state, but they cannot safely hold W2's time or start-boundary authority. The deployed migration therefore adds:

1. a protected, read-only-to-clients `physical_study_activity_snapshots` row containing the server start timestamp, exact material identity, unit page range, and authoritative start boundary;
2. a protected `physical_study_activity_breaks` ledger controlled only by W2 pause/resume/finish RPCs;
3. an accepted-only immutable `physical_pace_evidence` event table;
4. `start_physical_study_session`, `pause_physical_study_session`, `resume_physical_study_session`, and `finish_physical_study_session` transactional RPCs.

At the W2 schema release, the existing generic start/finish, retroactive, task completion, test result, app-api, and Telegram flows were not replaced or wired to W2 capture. W3 now provides a local, default-OFF app-api/web adapter; no deployed runtime changed and Telegram remains legacy.

The evidence causal identity is `study_session_id`. A unique constraint permits at most one accepted pace sample for that activity. Replaying a successful finish returns the existing event and does not add progress or accounting again.

## 4. Material identity and compatibility

Accepted evidence stores user, profile, subject, resource, optional section, exact persisted resource unit, optional curriculum node, and compatible canonical material type.

W2 accepts exact persisted page-ranged units only:

- canonical `test` for exact `test` problem-solving units;
- canonical `page_range` for other exact page-ranged reading/chapter/content units.

This matches the W1 compatibility key. Test/problem pace cannot calibrate reading/content pace. Synthetic structural spans remain in memory; W2 never inserts them as `resource_units`. Compatible real evidence may later calibrate a synthetic span only through the unchanged W1 hierarchy and confidence gate.

## 5. Boundary semantics

A boundary means “the last page authoritatively completed,” not “the next page” and not an inclusive range endpoint pair.

For a unit `[page_start, page_end]`:

- first-study start boundary is `page_start - 1`;
- existing in-progress start boundary is `completed_through_page`;
- end boundary is the last newly completed page;
- `progressed_pages = end_page_boundary - start_page_boundary`;
- `start = end` is zero progress and creates no accepted event;
- `end < start` is a reversal and rejects the transaction;
- `end > page_end` or a start outside `[page_start - 1, page_end]` is invalid;
- the current persisted boundary must still equal the start snapshot when finishing, otherwise the transaction rejects as concurrent/stale progress;
- a completed or skipped unit cannot start accepted pace capture;
- revisiting pages at or below the existing boundary never counts them again.

Examples for pages 10–20:

- first study through page 12: `9 → 12 = 3 pages`;
- continue through page 15: `12 → 15 = 3 pages`;
- no new page: `15 → 15 = 0`, session time may finish but no pace event exists;
- revisit through page 14: `15 → 14`, rejected as reversal.

Task completion alone does not prove page completion and never inserts pace evidence.

## 6. Time semantics

The finish RPC calculates active seconds from the protected W2 snapshot and pause ledger:

`floor(max(0, finished_at - protected_started_at - sum(protected closed break durations)))`

The physical pause/resume RPCs mirror the generic break lifecycle for compatibility but only their protected ledger is duration authority. Finish rejects an open-pause state mismatch, preventing a generic pause/resume call from silently bypassing protected inactive-time accounting, then closes matching open generic and protected breaks at the same `finished_at`. Evidence requires strictly positive active seconds. This is the only minimum: it distinguishes observed time from no time and introduces no product pace threshold. Existing session/accounting compatibility continues storing `duration_minutes = max(1, floor(active_seconds / 60))`; the evidence event retains seconds and never substitutes planned minutes.

Rejected time sources include task estimates, unit estimates, planned credit, weekly minutes, client wall-clock duration, and unrelated timestamps.

## 7. Atomicity and failure

`finish_physical_study_session` locks the session, protected snapshot, protected breaks, exact unit, and current progress; validates unchanged material identity and start boundary; calculates active time; and—in one PostgreSQL transaction—does all applicable work:

1. closes breaks and completes the study session;
2. applies existing study-intent accounting;
3. advances exact `resource_unit_progress`;
4. completes the linked task unit only when the physical unit reaches its end;
5. inserts the immutable accepted evidence event.

Any exception rolls back every step. There is no client-side second write and no swallowed exception block.

Zero progress is a successful study finish with no progress mutation and no evidence event. Invalid/reversed/stale progress rejects before completion.

## 8. Schema safety

The deployed schema contains ownership-preserving foreign keys for profile, session, task, resource, section, unit, subject/topic identity; page/time/provenance/status constraints; unique session idempotency; authenticated own-row SELECT RLS; no authenticated direct insert/update/delete grant on W2 tables; and update protection for immutable snapshots/events. Deletes are not directly granted but ownership cascades remain available for account/session deletion.

All four W2 mutation RPCs are `security definer` because direct snapshot, break-ledger, and evidence writes are intentionally unavailable. Each obtains `auth.uid()`, explicitly scopes and locks every mutable row to that user/profile/material identity, and uses an empty search path.

No historical insert or update statement exists in the migration.

## 9. Workload ingestion and rollout gate

W1 ingestion accepts `physical_pace_evidence` rows as `actual_elapsed_time + actual_progress_delta` with provenance `atomic_physical_finish`. The loader query remains capability-gated OFF despite the table now existing in production.

The production workload shadow remains on the W1 ingestion path because callers do not enable the new capability. W3 exposes separate local capture and shadow-evidence gates; production app-api/Telegram capture and canonical planning remain inactive.

## 10. Release and rollback considerations

Migration `20260825130000_atomic_physical_pace_evidence.sql` was deployed to production on 2026-08-25 under explicit schema/RPC-only approval. Its SHA256 is `82006d04a089595308ff9b434dd4f4c8888c2191fdd0fb9c69f0af210c32a8e6`. Postflight confirmed exact schema/RPC exposure, zero W2 rows, zero historical evidence, unchanged existing counters, zero pending migrations, and no runtime activation.

Any later app-api, Telegram, or web capture activation requires a separate design, review, tests, and explicit production approval.

W3 completed the local app-api/web design and verification without deployment. Telegram still requires a separate schema/RPC wrapper and page-boundary design. Production activation remains a later explicit decision.

Rollback before capture activation may drop the four new RPCs and three new tables in a reviewed compensating migration. After accepted events exist, rollback must preserve/export immutable evidence and must not silently discard it.

## 11. Historical policy

No existing session, task, test, progress, or estimated-minute row is backfilled into `physical_pace_evidence`. The historical accepted count remains zero unless an already-atomic causal record independently satisfies W1’s existing test-result rule. Timestamp proximity never establishes causality.

## 12. Verification and production state

- SPEC → RED was observed before the W2 module, migration, and ingestion path existed.
- Targeted boundary, migration-contract, W1-ingestion, and runtime-isolation tests: `25/25` PASS.
- Domain typecheck and checked-in edge planning bundle rebuild: PASS.
- Full non-integration regression: `792/792` across `123/123` files PASS.
- Local PostgreSQL migration apply/lint and full integration regression: `114/114` across `12/12` files PASS.
- Production read-only shadow: `341` total, `76` exact, `0` calibrated, `0` fallback, `265` unknown, `76` eligible; physical pages remain `0` calibrated and `5,103` unknown.
- Production safety counters before/after: `79` resource units, `76` video-topic mappings, `0` non-null exact partial-page boundaries.
- Production migration history includes `20260825130000`; linked dry-run reports zero pending migrations.
- All three W2 tables contain `0` rows; accepted historical physical pace samples remain `0`; no backfill occurred.
- Existing production counts remained unchanged before/after: `59` study sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` resource units, `76` video-topic mappings, and `0` non-null exact partial-page boundaries.
- All W2 tables and RPCs are deployed, but app-api, Telegram, web capture routes, W1 loader activation, and canonical planner runtime remain OFF.

The next gate requiring explicit approval is runtime-activation design/review for selected app-api, Telegram, or web capture paths. Schema deployment alone does not authorize route activation, canonical planner cutover, Edge deployment, backfill, or evidence creation.
