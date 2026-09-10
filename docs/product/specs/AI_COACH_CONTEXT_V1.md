# AI Coach — CoachContextV1 Contract and Canonical Source Map

Status: `EVRE_6B.1_ACCEPTED — EVRE_6B.2_LOCAL_DB_ACCEPTED — NO_RUNTIME_WIRING — CONFIRM_OFF — APPLY_OFF`

Contract version: `coach-context-v1`

Last updated: 2026-09-10

## 1. Decision

`CoachContextV1` is the immutable, compact, user-scoped, time-bounded read model supplied to later AI Coach capabilities. It is not an AI prompt, database reader, planner, recommendation engine, or persistence model.

6B.1 defines the TypeScript contract, its pure deterministic builder, source registry, fail-closed rules, and fixture acceptance suite before any live database wiring. The builder makes no LLM call, performs no database read or write, performs no planning calculation, does not recalculate canonical workload, and exposes no proposal, Confirm, Apply, task-mutation, or capacity-mutation authority.

The source implementation is:

- `packages/domain/src/ai-coach/coach-context-v1.ts` — contract, fact envelope, compactness limits, pure builder, validation, unknown/provenance collection;
- `packages/domain/src/ai-coach/coach-context-v1-source-map.ts` — executable field/source registry and legacy exclusion registry;
- `packages/domain/src/ai-coach/fixtures/coach-context-v1.ts` — required A–H fixtures;
- `packages/domain/src/ai-coach/coach-context-v1.test.ts` — contract acceptance tests.

No current AI Coach runtime imports or calls the builder. 6B.2 adds an unconnected server-side read adapter; it does not change current Coach behavior.

6B.2 implementation sources are:

- `supabase/functions/_shared/coach-context-v1-readonly.ts` — user-scoped read orchestration and compact fact projection;
- `supabase/functions/_shared/canonical-capacity-readonly.ts` — capacity-domain extraction with the same availability/calendar/exception/P48 semantics used by the existing adaptive caller;
- `supabase/functions/_shared/planner-v2-persisted-readonly.ts` — exact and current persisted Planner V2 lifecycle readers;
- `supabase/functions/_shared/coach-context-v1-readonly.test.ts` — read-only, failure-isolation, deterministic, Planner, capacity, legacy-exclusion, and 42-task volume proofs;
- `tests/integration/coach-context-v1-readonly.test.ts` — real local Supabase deterministic-read, explicit-unknown, and zero-mutation proof.

## 2. Contract shape

The compact logical shape is:

```text
CoachContextV1
├─ version, generatedAt, requestId, userId, examProfileId, locale, timezone, currentDate
├─ identity: Fact<Identity>
├─ today: Fact<TodaySummary + StudyAccounting + Task[]>
├─ week: Fact<WeekSummary + StudyAccounting + Task[] + PLN002Coverage + ProgressPositionFact>
├─ subjects[]: identity + task/study/material Fact groups
├─ nextWork: Fact<CanonicalNextWork>
├─ materials: Fact<CanonicalMaterialProgress[] with per-item WorkloadFact>
├─ workload: Fact<CanonicalWorkloadSummary>
├─ capacity: Fact<CapacityDay[]>
├─ recentProgress: Fact<bounded TaskEvent[] + Session[] + PLN002Transition[]>
├─ planner: Fact<exact PlannerV2 identity/lifecycle/freshness/explanation>
├─ signalInputs: Fact<deterministic scalar input[]>
├─ unknowns[]
├─ provenance[]
└─ authority: all mutation/calculation/model permissions false
```

Every fact is one of `known`, `unknown`, `stale`, `blocked`, or `not_applicable`. A known fact has a value, fresh `asOf` semantics, confidence, and at least one provenance source. An unknown fact has `value = null`, `confidence = none`, its intended canonical source, and a reason. A stale fact may retain the last observed value for transparent display, but it is listed in `unknowns` and cannot support a current claim. `blocked` preserves a current deterministic blocker without inventing the missing value. `not_applicable` distinguishes a valid empty state from missing data.

Compactness is enforced structurally and by safety limits: no raw database rows, notes, descriptions, created/updated audit columns, provider messages, or long-term conversation history appear. Today tasks, week tasks, subjects, materials, recent events/sessions, signal inputs, per-fact provenance IDs, and total serialized bytes are bounded. This internal canonical envelope is not yet the payload sent to an LLM; 6B.3 must create a smaller allowlisted projection with on-demand canonical detail.

## 3. Authority invariants

The returned contract fixes these values and a caller cannot elevate them:

- mode is `read_only`;
- LLM calls are not allowed by the builder;
- database writes are not allowed;
- planning calculations are not allowed;
- canonical workload recalculation is not allowed;
- task and capacity mutations are not allowed;
- Planner Confirm and Apply are not allowed.

The builder copies precomputed facts from owning deterministic domains. Sorting, schema validation, cloning/freezing, bounded projection, provenance normalization, and collection of explicit unknowns are context assembly, not planning authority.

`CoachContextV1WorkloadAuthority` intentionally permits only `exact`, `calibrated`, or `unknown`. An unknown workload must have `estimatedMinutes = null`. No legacy or invented fallback is representable in the typed contract.

## 4. Field → truth-source matrix

Readiness meanings:

- `REUSABLE`: an existing domain/read-only contract can supply the fact without using a legacy Coach calculation;
- `WIRED`: 6B.2 has a dedicated user-scoped read adapter, without connecting it to the AI runtime;
- `GAP`: no global canonical fact exists; the field remains unknown/not-applicable unless one of the named exact scoped facts exists.

| CoachContextV1 field | Canonical/read-only truth | Existing reusable reader or contract | Readiness | Fail-closed rule |
| --- | --- | --- | --- | --- |
| `version` | Builder literal | `COACH_CONTEXT_V1_VERSION` | `REUSABLE` | Caller cannot choose a version. |
| `generatedAt` | Server clock | Server runtime instant | `REUSABLE` | Client/model time is not authoritative. |
| `requestId`, `locale` | Authenticated request metadata | `loadCoachContextV1ReadOnly` input | `WIRED` | Request-scoped only; no conversation-history truth. |
| `userId` | Authenticated Supabase user | `app-api` `client.auth.getUser()` | `REUSABLE` | Never take user identity from model output. |
| `examProfileId`, exam identity/status/date | User-owned active `exam_profiles` row | `loadCoachContextV1ReadOnly` compact active-profile query | `WIRED` | No active owned row errors; another profile is never substituted. |
| `timezone`, `displayName` | `user_profiles` | `loadCoachContextV1ReadOnly` compact profile query | `WIRED` | Missing timezone fails closed; client state/default timezone is not substituted. |
| `currentDate` | Server clock evaluated in the persisted profile timezone | `loadCoachContextV1ReadOnly`; `zonedMidnightToUtc` | `WIRED` | One timezone drives current date and all session windows. |
| Today plan identity/generation | Active owned plan covering current date | `WeeklyPlanDbRowV1`; canonical readonly Planner V2 active-plan query | `REUSABLE` | Latest active generation only. |
| Today tasks | Current-date filter over normalized plan tasks | `normalizePlanningSnapshotDbBundleV1`, `mergePlanningTaskProgressV1` | `REUSABLE` | Lifecycle comes from `tasks.status`; minutes never imply completion. |
| Today task summary | Deterministic projection of normalized Today tasks | `loadCoachContextV1ReadOnly` over `mergePlanningTaskProgressV1` | `WIRED` | Projection counts current facts; it does not plan or rank. |
| Today study accounting | Timezone-bounded sessions plus non-superseded allocations | `loadCoachContextV1ReadOnly` ledger projection | `WIRED` | Planned actual, planned credit, Extra, and unknown intent stay separate. |
| Week identity/horizon/status | Selected `weekly_plans` row | `WeeklyPlanDbRowV1` | `REUSABLE` | No active plan becomes an explicit unknown/empty product state. |
| Week tasks/summary | Normalized canonical task/progress state | `normalizePlanningSnapshotDbBundleV1` | `REUSABLE` | No legacy recommendation ordering or inferred lifecycle. |
| Week study/PLN-002 coverage | Current exact-week sessions and non-superseded intent ledger | `loadCoachContextV1ReadOnly` | `WIRED` | Coverage remains `partial`; 6B.2 does not claim universal PLN-002 completeness. |
| `week.progressPosition` | PLN-002-safe plan-versus-credit evaluation | PLN-002 contract; no accepted global reader yet | `GAP` | A known ahead/on-track/behind value is rejected unless coverage is `sufficient`; the rest of context remains available. |
| Subject identity/status | `user_subjects` joined to `subjects` | `loadCoachContextV1ReadOnly` | `WIRED` | Group only by IDs; never infer subject from title. |
| Subject task/study/material facts | Normalized tasks; intent ledger; canonical material/workload grouped by `resource.subject_id` | `loadCoachContextV1ReadOnly` | `WIRED` | A failed material/workload source degrades its own field, not the whole context. |
| `nextWork` | Exact approved-task binding, explicitly scoped canonical material continuation, or exact Planner V2 preview item | `calculateRemainingMaterialScope` for scoped continuation; `PlannerV2Preview.days[].items` for preview | `GAP` | There is no global canonical selector. Legacy `getNextBestTask` is not promoted. |
| Material identity/mapping/progress | MAT-001 canonical Material Truth | `loadCanonicalMaterialUnits`; `MaterialUnitView` | `REUSABLE` | No `resource_progress` percent or title-based fallback. |
| Per-material workload | MAT-001 Canonical Workload Engine estimate | `loadCanonicalWorkloadReadiness.estimates`; `MaterialWorkloadEstimate` | `REUSABLE` | Copy authority/confidence/reason; unknown minutes stay null. |
| Workload summary | MAT-001 Canonical Workload Engine summary | `loadCanonicalWorkloadReadiness.summary`; `CanonicalWorkloadSummary` | `REUSABLE` | CoachContext does not sum or recalculate workload. |
| Capacity | Weekly availability, calendar periods, schedule exceptions, and P48 daily overrides through the capacity domain | `loadCanonicalCapacityReadOnly` | `WIRED` | Gross/reserve/planning facts are copied; Planner-owned protected/post-commitment facts stay unknown. |
| Recent task events | Bounded canonical task/progress lifecycle projection | `loadCoachContextV1ReadOnly` | `WIRED` | Compact, sorted event fields only; no raw rows. |
| Recent session progress | Bounded completed sessions joined to current allocations | `loadCoachContextV1ReadOnly` | `WIRED` | Allocation identity is retained; unallocated historical sessions remain explicit `unknown` intent. |
| Recent substitution/carryover transitions | User-owned typed lifecycle rows | `loadCoachContextV1ReadOnly` | `WIRED` | Never infer a transition from task movement, title, or conversation. |
| Planner identity/lifecycle/freshness | Newest persisted owned `planner_v2_week` row | `loadCurrentPlannerV2PersistedStateReadOnly` | `WIRED` | Read lifecycle/proposal state only; do not treat the proposal as current weekly-plan truth. |
| Planner explanation | Validated structured facts already in `display_payload` | Persisted `confirmed_action_proposals.display_payload` | `WIRED` | Never call `buildPlannerV2Preview` during context construction. |
| Deterministic signal inputs | Scalar values already supplied by known context facts | `sourceFactPath` back-reference to owning fact | `EXTRACT` | 6B.1 creates no proactive insight, severity, ranking, cooldown, or prose. |
| `unknowns` | Fact-envelope availability/freshness | Pure `buildCoachContextV1` traversal | `REUSABLE` | Deterministic; never model-generated. |
| `provenance` | Union of field-level source identities/record IDs/as-of times | Pure builder normalization | `REUSABLE` | Missing provenance rejects the fact. |
| `authority` | 6A/6B contract literal | Pure builder | `REUSABLE` | All mutation/model/planning authority remains false. |

The TypeScript registry is normative for implementation names and contains the same mapping at a finer field-pattern level.

## 5. Legacy-only sources deliberately not used

| Legacy source | Excluded fields | Reason |
| --- | --- | --- |
| `_shared/ai-coach/material-context.ts::loadAiCoachMaterialContext` | material, workload, next work | Top-three projection is not canonical Material Truth and hides missing facts. |
| `_shared/material-workload.ts::loadMaterialWorkloads` | material, workload, next work | It is not the MAT-001 Canonical Workload Engine. |
| `_shared/ai-coach/target-capacity.ts::loadCurrentGrossCapacityForDate` | capacity | Coach-specific legacy comparison is not a standalone canonical capacity read model. |
| `_shared/pilot.ts::loadDailyCoachContext/generateWeeklyReport` | Today, Week, next work, signals | It mixes legacy ranking, recommendations, default material-unit minutes, and older report semantics. |
| `getNextBestTask` / `buildDailyPlanProjection` | next work | Existing recommendation output is not global canonical next-work truth. |
| `_shared/adaptive.ts::previewCurrentPlan/recalculateCurrentPlan/applyCurrentPlanRevision` | Planner state/impact | Older planning lifecycle cannot compete with canonical Planner V2. |
| `ai-coach-plan-preview` | Planner state/impact | Legacy Coach capacity-preview path is compatibility debt. |
| `apply_confirmed_action_proposal` | authority/Planner | New Coach planning mutations must converge on canonical Planner V2; 6B.1 has no mutation path. |

`loadAdaptiveBase` is not accepted wholesale as Coach truth. 6B.2 extracted only its existing capacity primitives and canonical table inputs into `loadCanonicalCapacityReadOnly`; its task ranking, revision/mastery enrichment, and old planning outputs do not enter this contract merely because the canonical shadow currently consumes the monolith.

## 6. Required acceptance states

| Fixture | Contract assertion |
| --- | --- |
| A. Healthy normal week | Versioned immutable context, complete facts, read-only authority. |
| B. Today partially completed | Lifecycle remains `partially_completed`; completed and remaining minutes stay separate. |
| C. Canonical next work available | Carries an exact basis, canonical workload/material identity, and provenance. |
| D. Missing material/workload fact | Per-material workload, summary, and dependent next work propagate unknown; no fallback appears. |
| E. Stale/partial fact | Stale capacity remains visible with `asOf`/expiry/reason and is listed in unknowns. |
| F. PLN-002 ambiguity | Ahead/on-track/behind is unknown while Today/material facts remain usable; an attempted known claim is rejected. |
| G. No tasks today | Today is a known empty list; next work is `not_applicable`, not fabricated. |
| H. Mixed completed/ready future tasks | Statuses remain distinct and output ordering is deterministic. |

The suite also checks output determinism under reversed input order, input non-mutation, deep-frozen output, serialized compactness, raw-row field exclusion, hard collection bounds, source-map coverage, and the explicit legacy exclusion registry.

## 7. 6B.2 resolution and remaining truth gaps

6B.2 resolves the profile/timezone reader, capacity extraction, current persisted Planner lifecycle reader, bounded task/session/transition projection, and canonical material/workload adapter wiring. The following gaps remain explicit:

1. No global canonical next-work selector exists. `nextWork` is always `unknown(canonical_selector_unavailable)` in ordinary 6B.2 construction. A future planner/material domain owner—not Coach—must supply it.
2. No current authoritative reader exposes task-level protected classification or post-commitment available capacity outside a persisted Planner scenario. Those capacity sub-facts remain explicit unknowns; persisted proposal data is not merged into current plan truth.
3. PLN-002 does not yet supply accepted universal completeness/evaluation for exact ahead/on-track/behind. Coverage remains `partial` and trajectory remains `blocked(pln002_completeness_unresolved)`.
4. No centralized deterministic Coach signal-input registry exists. `signalInputs` remains explicit unknown; proactive eligibility, attention/cooldown/dedupe, and prose remain 6D.
5. Router/pricing and usage/cost telemetry remain later 6B work. 6B.2 makes no model call and adds no migration/provider change.
6. The high-volume internal canonical context is 52,716 bytes. 6B.3 must retain that truth internally while defining a compact allowlisted LLM-facing projection and on-demand detail strategy.

## 8. 6B.1 exit criteria

6B.1 is ready for review when all are true:

1. The `coach-context-v1` TypeScript shape is exported from the domain package and fixes read-only/no-authority flags.
2. Every field group is mapped to a named current canonical/read-only source, extraction requirement, or explicit truth gap.
3. Canonical Material Truth and Canonical Workload Engine are the only material/workload sources; missing facts remain unknown.
4. PLN-002-insufficient progress-position claims fail closed without blocking independent context sections.
5. A–H fixtures and focused tests pass, including determinism, unknown propagation, compactness, provenance, and no mutation side effects.
6. Relevant package typecheck and diff checks pass.
7. No runtime integration, prompt/provider/model change, proactive insight, proposal creation, migration, deployment, gate change, production access, Confirm, or Apply occurs.

Passing 6B.1 permits review and planning for 6B.2 live read-only adapter wiring. It does not complete all of 6B, start model telemetry, or authorize production use.

## 9. 6B.2 acceptance evidence

Local acceptance evidence proves:

- 30/30 CoachContext contract and adapter tests pass;
- the 42-task, three-subject, nine-session, eight-material fixture serializes to 52,716 bytes under the 65,536-byte ceiling;
- repeated construction for the same snapshot is byte-equivalent;
- source fixtures and persisted proposal arrays are unchanged, and the adapter exposes no write/RPC method call;
- Planner lifecycle reads only persisted rows/`display_payload`; source inspection proves zero preview-builder imports or calls;
- missing workload and missing material fail independently at field level;
- next work and PLN-002 trajectory fail closed exactly as specified;
- source inspection proves zero imports/calls to the excluded legacy Coach loaders;
- domain and focused adapter TypeScript checks pass; a local esbuild bundle check passes.
- the targeted real local-Supabase test passes `1/1`, repeated construction is identical, total mutable-row delta is `0`, and Planner lifecycle-row delta is `0`.

6B.2 is locally accepted. It does not authorize AI runtime wiring, production access, migration, Preview, Confirm, or Apply.

## 10. 6B.3 required projection boundary

The 52,716-byte production-shaped fixture may remain the internal canonical `CoachContextV1` representation. 6B.3 must not reduce that internal truth by dropping tasks, facts, provenance, or explicit unknowns merely to lower token cost. Before any LLM runtime wiring, 6B.3 must define and test:

1. a compact allowlisted LLM-facing projection selected from the internal context for the current user intent;
2. on-demand retrieval of narrowly scoped canonical detail when the projection is insufficient;
3. deterministic token/byte budgets and fail-closed truncation semantics;
4. provenance, freshness, confidence, and unknown preservation in every projected fact;
5. proof that the full internal envelope is not sent wholesale to the model.
