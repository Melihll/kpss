# PLN-002 — Study Intent Semantics

Status: `IN_PROGRESS — SPECIFICATION`

Last updated: 2026-08-22

Milestone: `M1 — Planning Correctness & Study Model`

This is a product and technical design. It does not authorize a schema migration, application change, planner change, deployment, production write, or historical-data rewrite.

## 1. Problem

The product records what was studied and can associate a study session with a task, topic, resource, and resource unit. It does not record enough structured intent to distinguish reliably among:

- fulfillment of approved planned work;
- voluntary work beyond the approved plan;
- an explicit decision to replace one commitment with another; and
- unfinished planned work moved forward with its history intact.

Those distinctions are product semantics, not planner optimization details. Without them, actual minutes can be mistaken for permission to move or remove unrelated work.

The governing rule is:

> Extra study must not silently substitute, remove, backlog, cancel, reduce, or reschedule another planned task. User intent overrides planner optimization.

## 2. Evidence from PLN-001

The [PLN-001 audit](../audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md) established the following evidence using sanitized observations:

- Historical automatic `STUDY_DEVIATION` revisions moved tasks and sent tasks to backlog after actual study diverged from the plan.
- In `OBS-004`, a 40-minute taskless Mathematics session causally preceded a Finance task moving to backlog.
- In `OBS-005`, early Turkish study causally preceded Finance and Law tasks moving to backlog.
- The hypothesis that early Turkish study caused the audited Geography move was disproved: `OBS-001` associated that move with a broader Mathematics-triggered shuffle, while `OBS-002` produced no task changes.
- The window contained 351 minutes of task-linked early study and 40 minutes of explicit manual study, but no durable substitution or carryover semantics.
- The plan contained 25 Monday–Saturday blocks and 19 planned subject switches, compared with five observed actual switches. Intent semantics therefore must remain independent of the later duration and fragmentation policies.
- Overlapping sessions contributed 139.2 raw minutes, so neither intent nor credited progress may be reconstructed from raw duration sums without overlap-safe accounting.
- Current study-completion routes preview replanning and do not apply it automatically. This protects current behavior, but it does not supply the missing semantic model.

These findings support a semantic correction, not a claim that every historical record can be classified after the fact.

## 3. Terminology

| Term | Normative meaning |
| --- | --- |
| Approved plan | The current user-visible set of committed tasks and dates after any required confirmation. |
| Planned capacity | The scheduling budget used to construct the approved plan. |
| Actual study time | Overlap-safe elapsed study time that actually occurred, regardless of intent. |
| Planned credit | The portion of actual study that fulfills an approved task obligation. It is bounded by the task's remaining creditable requirement. |
| Planned Study | A study action that fulfills an already-approved planned task. |
| Extra Study | A voluntary study action beyond the current approved commitment. It does not, by itself, relieve another commitment. |
| Substitution | A user-confirmed relationship in which specified replacement work relieves a specified amount of a source planned task. |
| Carryover | A lineage-preserving transition that moves unfinished planned work to a later commitment. |
| Backlog | Unscheduled work with no promised destination slot. Backlog is not carryover. |
| Context link | A task, topic, resource, or resource-unit association that describes what was studied. A context link does not by itself prove intent. |
| Modality | How study occurred, such as `book`, `questions`, `video`, or `mixed`. Modality is not intent. |
| Active-plan mutation | A change to an approved task's date, status, amount, or presence in the active plan. |

The four named semantics are not four interchangeable values of one lifecycle enum. Planned Study and Extra Study classify study accounting. Substitution is a confirmed relationship and plan transition. Carryover is a task lifecycle and lineage transition.

## 4. Current-state model

### 4.1 Canonical capabilities

The current implementation provides these relevant primitives:

- `study_sessions` can link to a task, topic, resource, and resource unit; it records session type, entry source, status, duration, and timestamps.
- `session_mode` records coarse modality (`book`, `questions`, `video`, or `mixed`). It must not be reused for study intent.
- Starting from a task creates a task-linked session. Finishing or retroactively recording a task-linked session updates task progress; credited minutes are capped while actual study minutes are retained.
- A retroactive session can be taskless. Its entry channel records how it was entered, not why the user studied.
- A confirmed Quick Task creates a manual custom task in the active weekly plan. Its preview, plan version, snapshot fingerprint, expiry, ownership, idempotency, and apply result are protected by the confirmed-action flow.
- Tasks support planned dates, status, source reason, resource links, and an optional `carried_from_task_id` lineage link.
- Plan revisions and task reschedule events record parts of movement history, but not a complete user-intent transition.
- Backlogging clears the planned date and leaves work unscheduled. This is not a carryover destination.
- Daily capacity projection subtracts all actual study from remaining capacity. It cannot distinguish extra actual time from planned fulfillment.
- Study completion and task completion currently request a preview and return without automatically applying a plan mutation.

### 4.2 Support classification

The allowed classifications are `SUPPORTED_NOW`, `PARTIALLY_SUPPORTED`, and `NOT_SUPPORTED`. No concept earns `SUPPORTED_NOW` because the current records cannot enforce its complete lifecycle and invariants.

| Concept | Classification | Reason |
| --- | --- | --- |
| Planned Study | `PARTIALLY_SUPPORTED` | A task-linked session and capped task progress represent much of planned fulfillment, but intent is not explicit, ahead-of-date/manual ambiguity remains, and there is no authoritative allocation ledger. |
| Extra Study | `PARTIALLY_SUPPORTED` | Taskless/manual study and uncapped actual minutes can be recorded, but extra intent, separate reporting, and non-displacement guarantees are absent. |
| Substitution | `NOT_SUPPORTED` | No typed source-to-replacement relationship, relieved amount, explicit confirmation record, or substitution-specific mutation exists. |
| Carryover | `PARTIALLY_SUPPORTED` | Task lineage, carryover source reasons, and planner candidates exist, but a complete confirmed transition, destination, actor, remaining amount, and audit lifecycle are not authoritative. |

No current field is a safe substitute for study intent:

- `session_mode` is modality;
- `session_type` is the studied context;
- `entry_source` is the recording channel;
- task `source_reason` is why a task exists; and
- a task link is context and sometimes a safe prospective default, but is not universal proof of historical intent.

## 5. Proposed semantics

### 5.1 Planned Study

Planned Study is actual study intended to fulfill an already-approved task.

- It must identify the target task. Topic, resource, and resource-unit links remain contextual and may be inherited from or validated against that task.
- Actual minutes are always recorded overlap-safely.
- Planned credit is applied to the target task and is capped at that task's remaining creditable requirement. Resource-unit or completion requirements remain independent of minute credit.
- Estimated minutes describe the planned obligation; actual minutes describe reality. Neither value overwrites the other.
- If a planned 60-minute task takes 85 minutes, all 85 minutes remain Planned Study for intent reporting, 60 minutes at most are planned credit, and the 25-minute overrun is variance. It is not automatically Extra Study.
- If the user deliberately continues into additional work after fulfilling the task, that work must be recorded as a separate Extra allocation or session. A later split/reclassification must be explicit and audited.

Safe prospective default: starting from an approved task card classifies the session as Planned Study for that task. This default is visible and reversible. Ahead-of-date task use follows the dedicated rule in Section 6; historical task links are not blindly backfilled as planned.

### 5.2 Extra Study

Extra Study is voluntary work beyond the current approved commitment.

- It may be taskless or linked to a topic, resource, resource unit, or task for context.
- It records all overlap-safe actual minutes.
- Its default planned credit is zero. A task context link does not silently turn extra work into planned fulfillment.
- It may update factual learning evidence such as topic or resource-unit progress when that evidence is valid, but it does not change an unrelated task's date, status, commitment amount, or presence.
- It does not retrospectively consume planned capacity or reduce the approved-plan denominator. Actual time may exceed nominal capacity.
- It may inform future forecasts and the next plan generation. If it makes active-plan work unnecessary, the product may propose a user-visible change to the affected same learning obligation, but must not silently apply it or affect unrelated work.

### 5.3 Substitution

Substitution means: “I want this specified work instead of that specified planned work.”

- It requires explicit user confirmation through `Proposal → Preview → Confirm → Apply`.
- The source is an approved planned task and a precise amount of its remaining obligation.
- The replacement is a task or a recorded/recordable study allocation with enough topic/resource/work detail to explain what replaced the source.
- The preview must show the source amount relieved, replacement work, all task/date/status changes, and any capacity consequence.
- Apply must validate user ownership, active-plan identity/version, snapshot state, expiry, and idempotency. Stale proposals are rejected and re-previewed.
- Partial substitution is allowed. It records exact source minutes relieved and leaves the remainder committed.
- Substitution relief is not fake completion credit. The source task is reduced, split, cancelled, or carried forward by an explicit transition; the replacement receives only its own valid learning/progress evidence.
- After apply, the replacement becomes approved planned work. Its study allocation is therefore Planned Study and references the substitution relationship; `substitution` is not a third session-accounting intent.
- The audit record preserves proposer, confirmer, apply result, reason, before/after state, and source-to-replacement relationship.

### 5.4 Carryover

Carryover moves unfinished planned work forward without losing its identity or history.

- It is caused by a remaining approved obligation that cannot or will not be completed in its current slot, followed by a decision to retain it in a later slot.
- It records the source task, remaining amount, prior date/plan, destination date/plan, reason, actor, and transition state.
- Within the same weekly plan, the preferred representation keeps the same task identity and progress, adding a carryover transition event.
- Across plan boundaries, a successor task may be created with `carried_from_task_id`; the source remains historical and the full lineage is traversable.
- Backlog is different: backlog has no committed destination. A task cannot be called carried over merely because its date was cleared.
- The system may automatically detect and propose a carryover candidate after a deadline. Applying it requires user confirmation unless the user has explicitly enabled a versioned carryover policy and the destination fits without displacing protected work.
- Even under a pre-authorized policy, automatic carryover must be deterministic, auditable, limited to the unfinished task, and unable to move unrelated tasks. Otherwise it remains a proposal.

## 6. Edge cases

| Case | Expected behavior |
| --- | --- |
| 1. Turkish 60 and Geography 60 are planned; the user voluntarily studies 40 extra Turkish | Record 40 actual Extra Study minutes with zero planned credit by default. Turkish and Geography remain unchanged. Any relief or move requires an explicit affected-task preview and confirmation. |
| 2. A planned 60-minute task takes 85 minutes | Record 85 Planned Study actual minutes, at most 60 planned-credit minutes, and +25 duration variance. The overrun is not Extra Study unless the user explicitly starts or splits distinct additional work. |
| 3. The user studies an entirely unplanned topic | Ask once whether this was extra or replaced a planned task. Extra creates a topic/resource-context allocation with zero planned credit. Replacement opens substitution selection and preview. |
| 4. The user records study after the fact | If an approved task is selected, default to Planned Study for that task and show the classification. If no task is selected, require Extra or “instead of a planned task”; the latter starts substitution confirmation. Never infer from duration or topic alone. |
| 5. “I studied Turkish instead of Geography” | Create a substitution proposal naming Geography as source, Turkish work as replacement, and the exact full or partial amount. Apply only after a fresh preview and explicit confirmation. |
| 6. The user cannot finish Geography today | Offer: keep today, propose carryover to a visible destination, or send to backlog. Carryover preserves task identity/progress and records the reason; backlog remains explicitly unscheduled. No other task moves silently. |
| 7. The user exceeds today's nominal capacity but continues | Allow study and record actual time. Show an over-capacity indicator without rewriting the approved plan. Replanning is an optional, separately confirmed action. |
| 8. Extra study advances a topic enough to remove a future need | Preserve the evidence. At the next plan generation, use it normally. For an active plan, propose a change only to the affected obligation and explain that Extra Study informed it; never delete today's unrelated task. |
| 9. Quick Task creates additional work | After its existing preview/confirmation adds it to the active plan, it is user-scheduled planned work. Sessions started from it are Planned Study. “Manual” source describes task origin, not Extra intent. If the user wants unscheduled Extra Study, use the study-recording flow instead. |
| 10. Video and question practice occur for one topic on one day | Record separate sessions or allocations with their own modality and context. Each may independently be Planned or Extra. Topic equality does not merge intent, modality, learning stage, or resource evidence. |

Additional boundaries:

- A session started early from an approved task card is Planned Study for that task, even ahead of its date, but it cannot displace unrelated work. If recorded through a generic/manual flow, the product asks for intent.
- An interrupted session may have Planned and Extra allocations only when the user explicitly splits or reclassifies it; allocation minutes must still reconcile to actual session minutes.
- Rejecting, expiring, or encountering a stale substitution proposal makes no plan change.
- Retrying an applied intent transition returns the prior result and never doubles credit, relief, or movement.

## 7. Capacity semantics

### 7.1 Separate ledgers

Planned capacity is the planner's scheduling budget. Actual study time is an observed ledger. Planned fulfillment is a credit ledger. They must not be collapsed into one mutable number.

The daily view should expose at least:

- approved planned workload;
- planned credit earned and planned workload remaining;
- actual study elapsed;
- Extra Study actual time; and
- nominal actual-time overage, if any.

### 7.2 Required example

If daily planned capacity is 180 minutes, approved tasks total 180 minutes, and the user voluntarily studies 40 extra minutes:

- approved planned workload remains 180 minutes;
- Extra Study actual time is 40 minutes;
- total actual study becomes 220 minutes if the planned 180 is also completed;
- nominal actual-time overage is 40 minutes; and
- no planned task changes unless the user confirms a separate plan action.

The system must never silently reinterpret this as `140 planned + 40 extra`.

### 7.3 Future replanning

Future planning may use total actual time as evidence for duration calibration, fatigue, availability suggestions, or next-plan needs. It must preserve provenance: which evidence was planned, extra, overrun, substituted, or historically unknown. For the active plan, evidence can create an explainable proposal but cannot authorize an unrelated mutation. A user-approved capacity change affects future scheduling budget from its stated effective point; it does not rewrite prior intent.

## 8. Data-model alternatives

| Option | Schema impact | Planner impact | API impact | UI impact | Migration risk | Historical compatibility | Auditability | Complexity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Add `study_intent` to `study_sessions` | One enum column | Planner can filter planned/extra but cannot represent relief or lineage safely | Small request/response change | Small prompt/label change | Low initially; semantic expansion becomes brittle | Old rows require `unknown`; mixed allocations do not fit | Weak for partial substitution and carryover | Low initially, high hidden complexity |
| B. Store generic metadata/events | Generic event table or JSON payload | Planner must interpret events and enforce semantics in code | Generic event endpoints | UI maps loosely typed payloads | Medium; few DB constraints | Can append unknown/derived events without rewriting | Good chronology, weak relational integrity | Medium write cost, high query/validation cost |
| C. Hybrid normalized intent ledger plus typed transitions | Session allocation ledger plus typed substitution and carryover records | Explicit inputs; active-plan mutations remain confirmed actions | Typed fields/endpoints with versioned previews | Minimal prompts plus dedicated replacement/carryover previews | Medium; requires careful dual accounting | Old rows remain `unknown`; only proven relationships are backfilled | Strong, queryable, constraint-friendly | Medium and explicit |

### 8.1 Decision

Option C is the smallest correct representation. Option A incorrectly forces accounting intent, a replacement relationship, and a task lifecycle into one enum. Option B is flexible but moves critical invariants out of the database and makes ordinary reporting harder. Option C adds more than one record type because the product has more than one semantic dimension.

## 9. Recommended design

### 9.1 Study allocation ledger

Add a normalized `study_session_allocations` record in a future migration:

| Field | Purpose |
| --- | --- |
| `id`, `user_id`, `session_id` | Stable, user-scoped identity and session relationship. |
| `accounting_intent` | `planned`, `extra`, or `unknown`. Substitution and carryover are deliberately excluded because they are relationships/transitions, not session-accounting intents. |
| `target_task_id` | Planned-credit target when applicable; nullable for Extra/unknown. |
| `topic_id`, `resource_id`, `resource_unit_id` | Optional immutable-at-record context needed for explanation. |
| `actual_minutes` | Overlap-safe actual time assigned to this allocation. |
| `planned_credit_minutes` | Credit to the target planned obligation; zero for Extra by default. |
| `intent_source` | `inferred_task_start`, `user_selected`, `confirmed_action`, or `historical_unknown`. |
| `substitution_id` | Required when a planned replacement allocation fulfills a confirmed substitution. |
| `recorded_by`, `recorded_at` | Initiator/actor and event time. |
| `supersedes_allocation_id`, `reason` | Append-only correction/reclassification trail. |

For a completed session, active allocations must reconcile exactly to its overlap-safe actual duration. Planned credit must be non-negative, cannot exceed assigned actual minutes, and cannot exceed the target obligation remaining at application time. Corrections append a superseding record or event; they do not erase history.

### 9.2 Typed substitution record

Add `study_substitutions` with source task, replacement task/session/allocation descriptor, proposed and relieved source minutes, replacement expected/actual minutes, status, reason, plan identity/version, snapshot fingerprint, idempotency key, proposer/confirmer/applier, timestamps, and before/after summary. Extend the existing confirmed-action mechanism with a typed substitution action rather than bypassing it.

### 9.3 Typed carryover record

Add `task_carryovers` with source task, optional successor task, from/to plan and date, remaining minutes, reason, policy/confirmation source, status, actor, proposal/action reference, and timestamps. Same-plan carryover keeps the task ID; cross-plan carryover uses the existing lineage link. Backlog remains a separate explicit transition.

### 9.4 Authority boundaries

- The allocation ledger is authoritative for intent reporting and planned credit after cutover.
- Study sessions remain authoritative for actual elapsed intervals.
- Tasks/resource units remain authoritative for obligation and learning-work state.
- Substitution and carryover records authorize and explain their own plan transitions.
- Plan revisions summarize resulting changes but do not replace the typed intent records.
- `session_mode` remains unchanged and orthogonal.

## 10. API implications

No API changes are made by this specification. A later implementation should:

- Return intent allocation, provenance, actual minutes, and planned credit in study-session responses.
- On task-card start, default to `planned` with the selected task and expose the default in the response.
- Require `extra` or `replace_planned_task` in a generic/manual unplanned flow; replacement first creates a proposal, not a plan mutation.
- Accept append-only intent corrections with an explicit reason and idempotency key.
- Add typed substitution preview/confirm/apply operations using the current ownership, plan-version, snapshot, expiry, and retry protections.
- Add carryover preview/confirm/apply operations and make backlog a distinct choice.
- Return `planMutationApplied: false` for study recording unless a separate confirmed action was applied.
- Reject cross-user task, session, topic, resource, substitution, and carryover references.

Task completion must consume planned credit and independent completion requirements; it must not infer substitution or carryover. Retroactive recording must apply the same overlap, idempotency, and accounting rules as live sessions.

## 11. Planner implications

No planner behavior changes in this phase. The future planner contract should be:

- Read planned-credit and actual-time ledgers separately.
- Never use Extra Study as implicit displacement capacity.
- Never infer substitution from matching topic, duration, ordering, or actual-over-planned deviation.
- Apply substitution only from a valid confirmed substitution record.
- Treat carryover and backlog as separate typed inputs and outcomes.
- Preserve protected Today work unless a confirmed action names the affected commitment.
- Use Extra Study evidence in a future plan only with an explanation of the evidence and affected need.
- When proposing an active-plan change due to learning progress, constrain the proposal to the same affected learning obligation; unrelated tasks remain unchanged.
- Include intent provenance in decision traces and deterministic regression fixtures for `OBS-004` and `OBS-005`.

The current `remaining capacity = capacity - all actual minutes` projection is incompatible with these semantics for active-plan displacement. Implementation must introduce separate planned-remaining and actual-elapsed inputs before any PLN-002 planner behavior is enabled.

## 12. UI implications

This design requires a small, targeted UX change, not a major redesign.

### 12.1 Safe inference without a prompt

- Start from an approved task: “Planlı görev” is inferred and shown unobtrusively.
- Start from a confirmed Quick Task: “Planlı görev” is inferred.
- Continue a running session: keep its existing allocation intent.
- Exceed a planned task estimate: keep Planned Study and show actual-versus-estimate variance; do not interrupt with a prompt.

### 12.2 Confirmation required

For a generic or retroactive study record with no selected planned task, ask:

> Bu çalışma mevcut planına ek mi, yoksa planlı bir görevin yerine mi yapıldı?

Actions:

- `Ekstra çalıştım`
- `Planlı bir görev yerine yaptım`

The replacement action requires source-task selection, full/partial amount, a changed-task preview, and explicit confirmation. The carryover UI similarly distinguishes `Daha sonraya taşı` from `Backlog'a gönder` and shows the destination.

An ahead-of-date task started from its task card may use the visible Planned default. A generic entry that merely matches a future topic must ask; topic matching is not intent.

### 12.3 Minimal reporting language

- `Planlanan`: approved workload.
- `Planlı tamamlanan`: credited planned fulfillment.
- `Ekstra çalışma`: voluntary actual study.
- `Gerçekleşen`: total actual study.
- `Yerine yapıldı`: confirmed substitution, with source shown.
- `Devredildi`: carryover, with origin and destination shown.

## 13. Audit/explainability

Every meaningful record or transition must answer who, what, when, why, and under which plan state.

Minimum shared audit data:

- stable event/record ID and user scope;
- semantic type and lifecycle status;
- source and target task/session/allocation IDs as applicable;
- topic/resource context needed to explain the work;
- actual, credited, replaced, or remaining minutes as applicable;
- intent source: inferred default, explicit user selection, confirmed action, policy, or historical unknown;
- initiator and confirmer (`user`, deterministic system component, or approved policy identity);
- human-readable reason code and optional user note;
- occurred, proposed, confirmed, applied, rejected/expired, and recorded timestamps as applicable;
- active plan ID, plan generation/version, snapshot fingerprint, and idempotency key for mutations;
- before/after values and affected-task list;
- reference to the superseded record for corrections; and
- whether Extra Study evidence influenced a later planner decision.

User-facing explanations must distinguish observation from consequence. Example: “40 minutes of Extra Turkish study were recorded. Geography remained unchanged.” A later decision may say: “The next Turkish requirement was reduced because Extra Study supplied topic-progress evidence,” but only when the rule and affected requirement are named.

## 14. Invariants

| ID | Invariant |
| --- | --- |
| `INV-001` | Extra Study alone cannot change another task's `planned_date`, status, amount, or presence in the approved plan. |
| `INV-002` | Substitution requires explicit user intent and a fresh confirmed source-to-replacement proposal. |
| `INV-003` | Carryover preserves original task identity/history; cross-plan successors retain traversable lineage. |
| `INV-004` | Actual study time may exceed planned capacity without silently reducing planned workload. |
| `INV-005` | Progress from Extra Study may affect future needs but cannot retroactively rewrite unrelated current-day intent. |
| `INV-006` | Study modality and study intent are separate concepts and fields. |
| `INV-007` | Extra Study has zero planned credit by default; a context link alone cannot change that. |
| `INV-008` | Active allocations for a completed session reconcile to overlap-safe actual session time; overlap is never double-counted. |
| `INV-009` | Planned credit cannot exceed allocation actual minutes or the target task's remaining creditable obligation. |
| `INV-010` | A planned-task overrun remains Planned Study variance unless the user explicitly separates or reclassifies additional work. |
| `INV-011` | Substitution relief never fabricates completion evidence for the source or replacement task. |
| `INV-012` | Partial substitution records the exact relieved amount and preserves the source remainder. |
| `INV-013` | Backlog and carryover are distinct; a carryover has a lineage-preserving destination, while backlog is explicitly unscheduled. |
| `INV-014` | A stale, expired, rejected, ownership-mismatched, or already-applied mutation cannot create a new plan change or duplicate accounting. |
| `INV-015` | Recording study does not apply a plan mutation unless a separate, valid confirmed action authorizes it. |
| `INV-016` | Historical ambiguity is represented as `unknown`; backfill does not invent intent. |
| `INV-017` | No intent transition can reference another user's task, session, plan, topic, resource, or action. |
| `INV-018` | Extra Study that informs a later decision retains provenance and yields an explanation naming the affected obligation. |
| `INV-019` | Quick Task task origin (`manual`) does not classify its sessions as Extra; after confirmed scheduling it is planned work. |
| `INV-020` | Reclassification is append-only and preserves the prior classification, actor, reason, and time. |

## 15. Migration/backfill strategy

A future implementation requires a database migration. This specification creates none.

Recommended rollout:

1. Add nullable/append-only typed records and constraints without changing planner behavior.
2. Preserve every pre-cutover session as `historical_unknown` unless explicit existing evidence proves a semantic transition. A task link may be retained as context but is not enough to assert intent in bulk.
3. Backfill only explicit carryover lineage already represented by a source/successor relationship. Do not relabel backlog events as carryover.
4. Do not infer historical substitutions from matching subjects, timing, revisions, or task disappearance.
5. Dual-write new session actuals and allocations behind a disabled feature gate; shadow-compare actual, credit, and task-progress totals.
6. Reconcile overlap handling, retries, partial sessions, concurrent finishes, and retroactive entries before making the ledger authoritative.
7. Switch reads to the new ledger only after invariants and sanitized PLN-001 regression fixtures pass.
8. Enable substitution/carryover apply paths separately through release gates and controlled rollout.

Historical reports must expose an `unknown` segment rather than presenting guessed planned/extra totals as fact.

## 16. Acceptance criteria

The design phase is complete when:

- the four semantics and their separate lifecycles are unambiguous;
- all ten required edge cases have deterministic expected behavior;
- current support is classified without misusing `session_mode`;
- alternatives are compared and one approach is recommended;
- planned capacity, actual time, planned credit, and Extra Study are separate;
- the 180 planned plus 40 extra example preserves all 180 planned minutes;
- safe inference and confirmation boundaries are defined with minimal UX;
- audit fields and automated-test invariants are explicit;
- migration and historical ambiguity rules are documented; and
- the backlog and current sprint link to this specification while PLN-002 remains `IN_PROGRESS`.

Implementation acceptance must additionally satisfy every PLN-002 criterion in [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md), including concurrency/retry tests, planner explanations, and sanitized `OBS-004`/`OBS-005` regressions. Documentation alone does not make PLN-002 `DONE`.

## 17. Out of scope

- Database migration or backfill execution.
- Application, API, study-session, task-completion, or planner code changes.
- Production reads, writes, repairs, deployment, or feature rollout.
- Duration policy (`PLN-003`).
- Learning-stage semantics (`PLN-004`).
- Resource-role semantics (`PLN-005`).
- Fragmentation optimization, broad UI redesign, or new dashboards.
- Reclassifying or repairing historical production activity.

## 18. Implementation plan

This is sequencing guidance for a future explicitly authorized implementation:

1. Write executable contract tests for `INV-001`–`INV-020` and sanitized `OBS-004`/`OBS-005` fixtures.
2. Create and review the allocation, substitution, and carryover migration with user-scope, reconciliation, and append-only constraints.
3. Add domain types and pure accounting functions for actual time, planned credit, overrun, Extra Study, and corrections.
4. Update live and retroactive session APIs behind a disabled feature gate; add shadow reconciliation and observability.
5. Add the minimal intent prompt, visible defaults, reporting labels, and correction history.
6. Extend confirmed actions for partial/full substitution with stale-state and concurrency tests.
7. Add typed carryover/backlog choices and lineage-preserving transitions.
8. Separate planner planned-remaining inputs from actual-elapsed evidence; keep all mutations preview-only until promotion gates pass.
9. Run simulations, shadow evaluation, and the controlled release process before any production authority is enabled.

The largest implementation risk is double accounting or double relief across session actuals, planned credit, task progress, substitution, and carryover during retries or concurrent mutation. The implementation must make those ledgers reconcilable and idempotent before planner behavior changes.
