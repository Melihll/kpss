# AI Coach — CoachContextV1 Contract and Canonical Source Map

Status: `EVRE_6B.1_REVIEW_PENDING — LOCAL_ONLY — NO_RUNTIME_WIRING — CONFIRM_OFF — APPLY_OFF`

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

No current AI Coach runtime imports or calls the builder in 6B.1.

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

Compactness is enforced both structurally and by limits: no raw database rows, notes, descriptions, created/updated audit columns, provider messages, or long-term conversation history appear. Today tasks, week tasks, subjects, materials, recent events/sessions, signal inputs, per-fact provenance IDs, and total serialized bytes are bounded.

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
- `EXTRACT`: canonical tables/primitives exist, but 6B.2 must extract a dedicated user-scoped read adapter from a mixed/private reader;
- `GAP`: no global canonical fact exists; the field remains unknown/not-applicable unless one of the named exact scoped facts exists.

| CoachContextV1 field | Canonical/read-only truth | Existing reusable reader or contract | Readiness | Fail-closed rule |
| --- | --- | --- | --- | --- |
| `version` | Builder literal | `COACH_CONTEXT_V1_VERSION` | `REUSABLE` | Caller cannot choose a version. |
| `generatedAt` | Server clock | Server runtime instant | `REUSABLE` | Client/model time is not authoritative. |
| `requestId`, `locale` | Authenticated request metadata | Edge HTTP request context | `EXTRACT` | Request-scoped only; no conversation-history truth. |
| `userId` | Authenticated Supabase user | `app-api` `client.auth.getUser()` | `REUSABLE` | Never take user identity from model output. |
| `examProfileId`, exam identity/status/date | User-owned active `exam_profiles` row | `app-api::activeProfile`; active-profile query in `runCanonicalPlannerV2ReadOnlyShadow` | `EXTRACT` | No active owned row means unknown/error, not another profile. |
| `timezone`, `displayName` | `user_profiles` | `UserProfile`; web `AuthContext::loadProfile` proves current projection | `EXTRACT` | 6B.2 needs a server reader; client state is not the authority boundary. |
| `currentDate` | Server clock evaluated in the same supported profile timezone | `DEFAULT_TIMEZONE`, `getZonedDayRange`, `calendarToday` | `EXTRACT` | Timezone/date mismatch becomes unknown; do not silently mix windows. |
| Today plan identity/generation | Active owned plan covering current date | `WeeklyPlanDbRowV1`; canonical readonly Planner V2 active-plan query | `REUSABLE` | Latest active generation only. |
| Today tasks | Current-date filter over normalized plan tasks | `normalizePlanningSnapshotDbBundleV1`, `mergePlanningTaskProgressV1` | `REUSABLE` | Lifecycle comes from `tasks.status`; minutes never imply completion. |
| Today task summary | Deterministic projection of normalized Today tasks | `NormalizedPlanningSnapshotDbBundleV1` inputs | `EXTRACT` | Builder copies supplied summary; it does not plan or rank. |
| Today study accounting | Timezone-bounded sessions plus non-superseded allocations | `buildStudyCapacityAccounting`; completed-study aggregators; `study_sessions` + `study_session_allocations` | `EXTRACT` | Planned actual, planned credit, Extra, and unknown intent stay separate. |
| Week identity/horizon/status | Selected `weekly_plans` row | `WeeklyPlanDbRowV1` | `REUSABLE` | No active plan becomes an explicit unknown/empty product state. |
| Week tasks/summary | Normalized canonical task/progress state | `normalizePlanningSnapshotDbBundleV1` | `REUSABLE` | No legacy recommendation ordering or inferred lifecycle. |
| Week study/PLN-002 coverage | Reconciled, overlap-safe intent ledger for the exact week | `buildStudyCapacityAccounting`; current non-superseded allocations | `EXTRACT` | Incomplete intent evidence sets coverage to `partial`/`unknown`. |
| `week.progressPosition` | PLN-002-safe plan-versus-credit evaluation | PLN-002 contract; no accepted global reader yet | `GAP` | A known ahead/on-track/behind value is rejected unless coverage is `sufficient`; the rest of context remains available. |
| Subject identity/status | `user_subjects` joined to `subjects` | Existing `app-api` weekly context query | `EXTRACT` | Group only by IDs; never infer subject from title. |
| Subject task/study/material facts | Normalized tasks; intent ledger; canonical material/workload grouped by supplied `subjectId` | Same owning readers as their top-level sections | `EXTRACT` | A missing group is an individual unknown, not a blended estimate. |
| `nextWork` | Exact approved-task binding, explicitly scoped canonical material continuation, or exact Planner V2 preview item | `calculateRemainingMaterialScope` for scoped continuation; `PlannerV2Preview.days[].items` for preview | `GAP` | There is no global canonical selector. Legacy `getNextBestTask` is not promoted. |
| Material identity/mapping/progress | MAT-001 canonical Material Truth | `loadCanonicalMaterialUnits`; `MaterialUnitView` | `REUSABLE` | No `resource_progress` percent or title-based fallback. |
| Per-material workload | MAT-001 Canonical Workload Engine estimate | `loadCanonicalWorkloadReadiness.estimates`; `MaterialWorkloadEstimate` | `REUSABLE` | Copy authority/confidence/reason; unknown minutes stay null. |
| Workload summary | MAT-001 Canonical Workload Engine summary | `loadCanonicalWorkloadReadiness.summary`; `CanonicalWorkloadSummary` | `REUSABLE` | CoachContext does not sum or recalculate workload. |
| Capacity | Weekly availability, calendar periods, schedule exceptions, and P48 daily overrides through the capacity domain | `calculateDayAvailableMinutes`; capacity override readers/functions | `EXTRACT` | Extract a read-only projection; do not import the legacy Coach target-capacity helper. |
| Recent task events | Bounded canonical task/progress lifecycle projection | `tasks` + `task_progress` contract | `EXTRACT` | Compact event fields only; no raw rows. |
| Recent session progress | Bounded completed sessions joined to current intent allocations | `study_sessions` + `study_session_allocations` | `EXTRACT` | No notes; recording channel is not study intent. |
| Recent substitution/carryover transitions | User-owned typed lifecycle rows | `study_substitutions` + `task_carryovers` | `EXTRACT` | Never infer a transition from task movement, title, or conversation. |
| Planner identity/lifecycle/freshness | Exact owned `planner_v2_week` proposal row plus canonical fingerprints | `PlannerV2Preview`, `validatePlannerV2Freshness`; private `app-api::loadPlannerV2Proposal` | `EXTRACT` | Conversation cannot confirm/apply; stale stays stale. |
| Planner explanation | Structured facts in canonical preview | `buildPlannerV2Preview` | `REUSABLE` | Copy facts exactly; later AI wording cannot alter them. |
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

`loadAdaptiveBase` is not accepted wholesale as Coach truth. Its existing capacity primitives and canonical table inputs may be extracted into a dedicated read-only 6B.2 adapter; its task ranking, revision/mastery enrichment, and old planning outputs do not enter this contract merely because the canonical shadow currently consumes the monolith.

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

## 7. Unresolved truth gaps for 6B.2

These gaps do not block 6B.1 and must not be filled by the LLM or legacy Coach math:

1. There is no exported, consolidated server-side profile/timezone/current-date reader. 6B.2 must ensure one timezone drives `currentDate`, Today/Week windows, and session grouping.
2. Capacity truth exists as domain primitives and canonical tables but is embedded in the mixed `loadAdaptiveBase` reader. 6B.2 needs a small, read-only capacity adapter without old planner/recommendation outputs.
3. There is no global canonical next-work selector. A fact is known only for an exact approved-task binding, scoped canonical continuation, or existing Planner V2 preview item. All other cases remain unknown/not-applicable.
4. The persisted Planner V2 proposal loader is private inside `app-api`. 6B.2 should extract a user/profile/action-kind-scoped read function; it must not add Confirm or Apply behavior.
5. PLN-002 does not yet supply an accepted universal completeness/evaluation reader for exact ahead/on-track/behind. The comparison remains unknown for insufficient windows while other facts continue.
6. No centralized deterministic Coach signal-input registry exists yet. 6B.2 may project named scalar inputs with source paths; proactive eligibility, attention/cooldown/dedupe, and prose remain 6D.
7. 6B's centralized model router/pricing and usage/cost telemetry ledger are separate later 6B work. 6B.1 makes no model call and does not implement telemetry, migrations, or provider changes.

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
