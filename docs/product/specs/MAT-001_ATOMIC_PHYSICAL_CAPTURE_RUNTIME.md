# MAT-001 Atomic Physical Capture Runtime

Status: W3_RUNTIME_DEPLOYED — CAPTURE_GATE_OFF — PLANNER_OFF

## 1. Scope

W3 integrates the deployed W2 physical lifecycle behind a server-side capability gate. The verified W3 web and `app-api` code are deployed in production, but capture remains gate-off. W3 does not deploy Telegram, enable a production flag, create production evidence, or activate canonical workload planning.

The sanctioned local path is:

`web intent → app-api → PhysicalStudyLifecycleService → one W2 RPC`

The service owns lifecycle selection. The browser never writes a session, break, progress row, task-unit completion, or evidence row directly.

## 2. Current entry-point matrix

| Channel | Route / command | Current mutation path | Session authority | Progress authority | Task completion authority | W2 eligibility |
| --- | --- | --- | --- | --- | --- | --- |
| app-api / web Today | `POST /study-sessions/start` | `start_study_session` | Generic session RPC | None | `start_task` inside generic start | Eligible only when the gate is ON and one exact compatible pending physical unit exists. |
| app-api / web | `POST /study-sessions/:id/pause` | `pause_study_session` | Generic break RPC | None | None | W2 pause only for a session with a protected W2 snapshot. |
| app-api / web | `POST /study-sessions/:id/resume` | `resume_study_session` | Generic break RPC | None | None | W2 resume only for a session with a protected W2 snapshot. |
| app-api / web Today and Execution | `POST /study-sessions/:id/finish` | `finish_study_session` | Generic finish/accounting RPC | None | Minute-based task accounting | W2 finish only for a protected W2 session and an explicit completed-through-page boundary. |
| app-api / web Execution | `POST /study-sessions/:id/cancel` | `cancel_study_session` | Generic cancel RPC | None | None | Legacy only. W2 capture has no sanctioned cancel RPC, so a W2-owned session must finish with an explicit boundary, including zero progress. |
| app-api / web Execution | `POST /study-sessions/retroactive` | `record_retroactive_session` | Atomic generic retroactive RPC | None | Planned/extra accounting | Never W2; it has no causal live page delta. |
| app-api / web | `POST /tasks/:id/start` | `start_task` | None | None | Task status | Not a study session; unchanged. |
| app-api / web | `POST /tasks/:id/progress` | `update_task_progress` | None | None | Minute/task status | Not W2 evidence; unchanged. |
| app-api / web | `POST /tasks/:id/complete-unit` | `complete_task_unit` | None | Exact unit completion without time | Task unit and possibly task | Progress-only path; unchanged and never pace evidence. |
| app-api / web | `POST /tasks/:id/complete` | `complete_task` | None | Requires no pending units | Task | Unchanged; cannot fabricate a W2 boundary. |
| app-api / web Execution | `POST /test-results` | `record_test_result` | None | First exact test completion can be atomic | `complete_task_unit` inside result RPC | Existing W1 test evidence path; unchanged and not routed through physical W2 study capture. |
| app-api / web resource drawer | `PUT /resources/:id/progress` | `resource_progress` upsert | None | Coarse whole-resource page cursor | None | Not exact `resource_unit_progress`; never W2 evidence. |
| app-api / web video player | YouTube progress routes | YouTube progress RPC/update | None | Exact video seconds | None | Never physical W2. |
| Telegram | `task_start:*` | `telegram_start_study_session` | Generic service wrapper | None | `start_task` through generic start | W3 UI/authority blocked; remains legacy. |
| Telegram | `session_finish:*` | `telegram_finish_study_session` | Generic service wrapper | None | Minute-based accounting | W3 UI/authority blocked; remains legacy. |
| Telegram | `task_done:*` | `telegram_complete_task` | None | No exact page delta | Custom-task completion | Never W2. |
| Telegram | manual study flow | `telegram_record_retroactive_session` | Atomic generic retroactive wrapper | None | Planned/extra accounting | Never W2. |
| Telegram | result flow | `telegram_record_test_result` | None | Exact test completion when explicitly selected | Result RPC | Existing test evidence path; unchanged. |
| Authenticated direct Supabase clients | table RLS and public lifecycle RPCs | Existing database grants | Generic rows remain user-editable; W2 rows are protected | Direct progress remains progress-only | Existing task RPCs | Direct generic calls do not become W2 evidence. W2 accepted capture is available only through the four dedicated RPCs. |
| Scheduler worker | stale-session query | Read-only count/query | None | None | None | Not a mutation entry point. |

## 3. Runtime adapter contract

`PhysicalStudyLifecycleService` is the sole application adapter for app-api study start, pause, resume, finish, and cancel selection.

- Capability OFF calls the same legacy RPC with the same arguments and does not query W2 evidence tables.
- Capability ON examines persisted `task_resource_units` and their persisted `resource_units`; it never derives identity from a title.
- A session with a protected snapshot remains W2-owned even if the start gate is later disabled, so rollback cannot mix generic and protected break accounting.
- A session carrying a resource-unit identity without its protected snapshot is a mixed-state conflict and is never silently treated as legacy.
- Each user action invokes one mutation RPC. Progress, evidence, task-unit completion, and study accounting are not duplicated in application code.

## 4. Capability gate

Capture uses the app-api runtime environment variable `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS`.

- Missing, empty, or invalid values mean OFF.
- A comma-separated exact exam-profile UUID allowlist enables only those profiles.
- `*` is an explicit all-profile development setting; it is not a default.
- Each Edge runtime owns its own environment, so a future channel can be rolled out independently.
- Migration presence alone never enables capture.

The W1 shadow reader uses the separate `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` switch. Capture and planning evidence consumption therefore remain independently controllable. Neither switch is enabled in production; deploying the W3 runtime did not activate either path.

## 5. Exact-unit eligibility

A W2 candidate must be a persisted, active, pending task link whose unit:

- belongs to the task's exact resource;
- has an integer page range with `page_start > 0` and `page_end >= page_start`;
- is not `video` and does not belong to a `video_course` resource;
- is not completed or skipped.

Exactly one compatible physical candidate may be auto-selected. More than one compatible candidate is ambiguous and remains on the legacy path unless a future product surface supplies an explicit selected unit. No unit, YouTube-only work, and synthetic in-memory structural spans remain legacy/non-W2.

## 6. Start and retry

An eligible gated start calls `start_physical_study_session(task, unit, entry_source)` and returns lifecycle identity plus unit range and start boundary. An `ACTIVE_SESSION_EXISTS` retry is idempotent only when the active session and protected snapshot match the same task and resource unit. A different active session remains a conflict. Ownership and stale-link failures propagate without fallback.

## 7. Pause, resume, finish, and cancel

Protected snapshot ownership, not the current feature flag, selects pause/resume/finish authority.

- W2 pause/resume call their W2 RPCs.
- Legacy pause/resume remain generic.
- W2 finish requires one integer last-completed-page boundary.
- Boundary below the protected start is reversal; above the unit end is invalid; equality is valid zero progress.
- The W2 finish RPC remains the only mutation authority. Its result is surfaced as `completed_with_evidence` or `completed_without_evidence`; replay remains idempotent.
- Stale progress, ownership, identity, or break-ledger conflicts are returned for reload/recovery and are never retried with a guessed boundary.
- W2 cancel is rejected because the deployed contract has no protected cancel RPC. The user can finish at the start boundary to preserve study history without evidence.

## 8. Web boundary UX

For a W2-owned active session, both web finish controls open the same boundary dialog: “Kaçıncı sayfaya kadar tamamladın?” The dialog shows the unit range and protected starting boundary, accepts equality for zero progress, and rejects reversal or a value beyond the unit before submitting. Legacy sessions retain one-click finish.

## 9. Telegram status

Telegram is `UI_BLOCKED` for W2 capture in W3. It currently has no authoritative page-boundary finish interaction, and its webhook holds a service-role client while the deployed W2 functions intentionally derive ownership from `auth.uid()`. Calling W2 safely would require a new reviewed service-role wrapper that scopes and sets the user claim, which is a schema/RPC contract change outside W3. Telegram therefore remains on its verified legacy wrappers; W3 does not imitate ownership or weaken the protected RPCs.

## 10. Shadow evidence separation

Local/read-only shadow evaluation may explicitly pass `physicalPaceEvidenceAvailable: true` to the canonical evidence loader. The default remains false. The production runner reads the separate shadow switch and reports whether accepted W2 evidence was included; it never mutates data and never activates planner authority.

## 11. Rollout and rollback

The next rollout gate requires later explicit production approval to configure an exact profile allowlist and observe protected lifecycle counters for that pilot. The W3 app-api and web artifacts are already deployed; they must not be redeployed merely to enable the pilot. Evidence-shadow consumption and canonical planner activation remain separate later decisions. Telegram needs a separately reviewed ownership-preserving RPC wrapper and boundary UX before it can be proposed.

Rollback removes the app-api profile from the capture allowlist. New starts immediately use legacy behavior. Existing protected sessions must continue through W2 pause/resume/finish so their ledgers are not mixed. No accepted evidence is deleted or rewritten.

## 12. W3 production guardrail

The W3 runtime is deployed but dormant: capture, evidence-shadow consumption, and the canonical planner remain OFF. The gate-off release performed no migration, feature configuration, production data mutation, Telegram deployment, or pilot activation. Production postflight checks were read-only.

## 13. Verification

- SPEC → RED was observed before the lifecycle adapter and finish-boundary module existed.
- Targeted W3 lifecycle, page UX, evidence, runtime-isolation, overlap, study-deviation, and proposal-safety tests: `41/41` PASS across `8/8` files.
- Full non-integration regression: `810/810` PASS across `126/126` files.
- Full local Supabase integration: `116/116` PASS across `12/12` files, including the adapter path, replay, single evidence/allocation, no double task minutes, exact partial boundary, and separately gated W1 visibility.
- Domain typecheck: PASS.
- Web project-reference typecheck and production build: PASS (`300` modules transformed).
- Local app-api Edge bundle: PASS; the temporary bundle was removed and nothing was deployed.
- Local database lint: PASS; no schema errors.
- Linked migration history includes `20260825130000`; linked dry-run reports the remote database is up to date with zero pending migrations.
- Production read-only shadow: `341` total, `76` exact, `0` calibrated, `0` fallback, `265` unknown, `76` eligible; physical pages remain `0` calibrated and `5,103` unknown.
- Production read-only capture guards before/after: `0` snapshots, `0` protected breaks, `0` evidence. Units/mappings/partial boundaries remain `79 / 76 / 0`.
- Gate-off release source identity was verified three ways at `8354deff78b06f56411dc969a073c54f68829c69`, the working tree was clean, and linked migrations were current before deployment.
- Production `app-api` advanced from v29 to v30 at `2026-08-25T14:31:10.230Z`; it is active with `verify_jwt = true` and bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`. No other Edge Function changed.
- The unauthenticated active-session smoke returned HTTP `401`.
- Cloudflare Pages deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` remained the W3 production web at commit `8354deff78b06f56411dc969a073c54f68829c69`; production and immutable URLs returned HTTP `200`, identical HTML SHA256 `68eb853309ed7a1fe95419ae392af1bda4229afa626d23b120ba5315a073f11d`, and HTTP `200` for both referenced assets.
- Production operational counters before/after the release audit were `61` sessions, `248` tasks, `1` test result, and `1` resource-progress row. Units/mappings/partial boundaries remained `79 / 76 / 0`.
- W2 snapshots, protected breaks, and evidence remained `0 / 0 / 0`; accepted historical pace samples and calibrated physical pages remained `0`.
- Capture, shadow evidence consumption, canonical workload planning, and Telegram W2 integration remain OFF in production. No natural legacy study action occurred during the observation window, so legacy parity is `NOT_OBSERVED` rather than manufactured.
