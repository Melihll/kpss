# AI Coach — CoachContextV1 Contract and Canonical Source Map

Status: `EVRE_6B.1_ACCEPTED — EVRE_6B.2_LOCAL_DB_ACCEPTED — EVRE_6B.3_LOCAL_ACCEPTED — EVRE_6B.4_LOCAL_ACCEPTED — NO_RUNTIME_WIRING — CONFIRM_OFF — APPLY_OFF`

Contract version: `coach-context-v1`

Last updated: 2026-09-11

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

Compactness is enforced structurally and by safety limits: no raw database rows, notes, descriptions, created/updated audit columns, provider messages, or long-term conversation history appear. Today tasks, week tasks, subjects, materials, recent events/sessions, signal inputs, per-fact provenance IDs, and total serialized bytes are bounded. This internal canonical envelope is not an LLM payload; 6B.3 adds a separate smaller allowlisted projection with bounded canonical detail.

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
4. 6B.4 supplies the centralized deterministic signal registry. Runtime `signalInputs` may still be explicit unknown; signal types that require a source-owned precomputed input suppress rather than invent it. Delivery-time attention budgets, cooldown state, dedupe persistence, and prose remain 6D.
5. 6B.5 implements the unconnected router/pricing/FX/usage-ledger foundation in [Central Router, Pricing, FX and Usage Ledger V1](AI_COACH_ROUTER_COST_TELEMETRY_V1.md). 6B.2 context construction still makes no model call and performs no ledger write.
6. The high-volume internal canonical context remains 52,716 bytes. 6B.3 retains that truth internally and supplies a separate compact allowlisted evidence projection plus bounded detail strategy.

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

## 10. 6B.3 projection requirement and resolution

The 52,716-byte production-shaped fixture remains the internal canonical `CoachContextV1` representation. 6B.3 does not reduce that internal truth by dropping tasks, facts, provenance, or explicit unknowns merely to lower token cost. Before any later LLM runtime wiring, 6B.3 defines and tests:

1. a compact allowlisted LLM-facing projection selected from the internal context for the current user intent;
2. on-demand retrieval of narrowly scoped canonical detail when the projection is insufficient;
3. deterministic token/byte budgets and fail-closed truncation semantics;
4. provenance, freshness, confidence, and unknown preservation in every projected fact;
5. proof that the full internal envelope is not sent wholesale to the model.

## 11. CoachEvidenceViewV1 boundary

6B.3 implements the following deterministic, read-only boundary without connecting an LLM or the current Coach runtime:

```text
CoachContextV1 (internal canonical truth; up to 65,536 bytes)
  -> explicit deterministic scope/capability selection
  -> CoachEvidenceViewV1 (allowlisted evidence; up to 32,768 bytes)
  -> optional bounded CoachEvidenceDetailResponseV1 (up to 16,384 bytes)
  -> later AI runtime (not part of 6B.3)
```

`CoachEvidenceViewV1` may select, limit, filter by an already-authoritative subject identity, and structure existing facts. It cannot calculate new product truth, rank work, infer intent, reinterpret availability, recompute workload/capacity/Planner output, or turn `unknown`, `stale`, or `blocked` into `known`. Natural-language intent routing is not part of this phase; the caller supplies one explicit scope and its fixed capability.

The versioned view carries:

- `version = coach-evidence-view-v1` and the source `coach-context-v1` version/request reference;
- explicit `scope`, fixed `capability`, optional selected `subjectId`, `asOf`, timezone, and current date;
- only the allowlisted evidence sections for that scope;
- per-collection available/returned/limit/truncation metadata;
- projected unknowns and normalized provenance from exposed facts only;
- the bounded detail kinds available for that scope;
- immutable non-authority metadata: no DB writes, arbitrary query, new truth calculation, workload recalculation, Planner preview recomputation, task/capacity mutation, Confirm, Apply, LLM call, or provider call.

## 12. Scope → allowed truth matrix

| Scope | Fixed capability | Allowed CoachContext truth | Explicitly excluded | View collection limits | Available bounded details |
| --- | --- | --- | --- | --- | --- |
| `today_explain` | `explain` | identity; Today summary/study; up to 8 Today tasks; minimal Week summary/study/PLN-002 position; canonical next-work fact; up to 6 Today signal candidates | Week task list, subjects, material/workload payload, capacity, recent history, Planner, non-Today signals | Today tasks `8`; signals `6` | `today_tasks`, `recent_sessions` |
| `week_progress` | `progress_analysis` | Week summary/study/PLN-002 position; subject factual summaries; capacity; bounded recent events/sessions/transitions; up to 6 Week-relevant signals | identity, Today/Week task payloads, canonical work/material payload, Planner | subjects `12`; capacity days `7`; task events `8`; sessions `6`; transitions `4`; signals `6` | `week_tasks`, `subject_tasks`, `recent_sessions` |
| `subject_progress` | `progress_analysis` | selected owned subject summary; Week summary; subject-filtered canonical materials/workload minutes; subject-filtered recent progress; relevant or unresolved next-work fact; up to 4 selected-subject signals | identity, Today/Week task payloads, cross-subject material/signals, resource workload map, capacity, Planner | subjects `1`; materials `6`; task events `6`; sessions `6`; transitions `4`; signals `4` | `subject_tasks`, `recent_sessions`, `subject_material_progress` |
| `canonical_work` | `guide` | canonical next-work fact; canonical workload summary; up to 8 canonical material facts | identity, Today, Week, subject summaries, capacity, recent progress, Planner, signals | materials `8` | `subject_material_progress` |
| `capacity_status` | `status_analysis` | Today/Week summary and study accounting; canonical capacity days including nested protected/available unknowns | task lists, subjects, canonical work/material/workload, recent progress, Planner, signals | Today tasks `0`; capacity days `7` | `today_tasks`, `week_tasks` |
| `planner_explanation` | `planner_proposal_interpretation` | persisted authoritative Planner lifecycle/summary/warnings/explanation facts only | identity, Today, Week, task lists, subjects, canonical work/material/workload, capacity, recent progress, signals | warnings `8`; explanation facts `12` | `planner_explanation_detail` |
| `general_status` | `status_analysis` | identity; Today/Week summaries; subject summaries; canonical next-work/workload summary; capacity; up to 4 importance-ordered signals | task lists, materials, recent progress, Planner | Today tasks `0`; subjects `8`; capacity days `7`; signals `4` | `today_tasks`, `week_tasks`, `subject_tasks`, `recent_sessions`, `subject_material_progress` |
| `proactive_candidate` | `proactive_insight_candidate` | Today/Week summaries; subject summaries; workload summary; capacity; up to 4 proactive-eligible validated signals | identity, task lists, next work, materials, recent progress, Planner, raw signal inputs | Today tasks `0`; subjects `8`; capacity days `7`; signals `4` | `today_tasks`, `week_tasks`, `subject_tasks`, `recent_sessions`, `subject_material_progress` |

The executable source of this matrix is `COACH_EVIDENCE_SCOPE_RULES_V1`. A mismatched scope/capability pair, a missing subject for `subject_progress`, or a subject outside the context profile fails closed. Scope selection does not parse user language.

## 13. Bounded detail contract

`CoachEvidenceDetailRequestV1` is a closed discriminated request containing only version, one allowlisted kind, authenticated user identity, exact exam-profile identity, and—only where required—one subject identity. It contains no table, column, SQL, path, predicate, sort, pagination, URL, or generic query field.

`resolveCoachEvidenceDetailV1` reads only the already-built canonical context. It performs no additional database query. It rejects a user/profile mismatch before selecting data and rejects missing, unexpected, or out-of-profile subject selectors. Each response preserves the source fact's availability, freshness, confidence, provenance, and unknown reason; collection metadata makes truncation explicit.

| Detail kind | Allowlisted source | Item limit | Subject required | Notes |
| --- | --- | ---: | --- | --- |
| `today_tasks` | `today.value.tasks` | 24 | no | Current Today task projection only. |
| `week_tasks` | `week.value.tasks` | 24 | no | Bounded current-week task projection. |
| `subject_tasks` | current Week tasks matching the owned `subjectId` | 16 | yes | No title-based subject inference. |
| `recent_sessions` | `recentProgress.value.sessions` | 12 | no | Keeps allocation ID, accounting intent, and recording channel distinct. |
| `subject_material_progress` | canonical materials matching the owned `subjectId` | 16 | yes | Per-material canonical workload fact is copied, never recalculated. |
| `planner_explanation_detail` | persisted Planner lifecycle summary/differences/warnings/explanation facts | 24 combined warnings/facts/difference IDs | no | One shared deterministic item budget; never calls a preview builder or exposes Confirm/Apply authority. |

Every response has a 16,384-byte hard ceiling and immutable evidence-only authority flags. There is no LLM tool-calling surface in 6B.3.

## 14. Truth and security invariants

The projector and detail resolver preserve these requirements:

1. Runtime `nextWork` stays `unknown(canonical_selector_unavailable)` until a non-Coach authoritative global selector exists.
2. Runtime exact trajectory stays `blocked(pln002_completeness_unresolved)` while PLN-002 completeness is unresolved.
3. `known`, `unknown`, `stale`, `blocked`, and `not_applicable` availability is copied; projection never upgrades it.
4. Collection limits are explicit selection metadata, not fabricated product truth.
5. Workload summaries and per-material estimates are copied from the Canonical Workload Engine; no Coach formula exists.
6. Planner evidence comes only from the persisted lifecycle fact already present in CoachContext; no preview/reproposal path is imported or called.
7. Legacy Coach loaders are excluded, and the evidence module has no DB/RPC/arbitrary-query/provider surface.
8. The source context is never mutated; outputs are deep-frozen and deterministic.

## 15. High-volume size acceptance

The existing 42-task, three-subject, nine-session, eight-material fixture remains 52,716 bytes. No canonical truth was deleted from that internal context. Its deterministic AI-facing projections are:

| Scope | Bytes | Reduction from full context |
| --- | ---: | ---: |
| `today_explain` | 8,995 | 82.9% |
| `week_progress` | 22,740 | 56.9% |
| `subject_progress` | 14,655 | 72.2% |
| `canonical_work` | 10,899 | 79.3% |
| `capacity_status` | 13,553 | 74.3% |
| `planner_explanation` | 1,158 | 97.8% |
| `general_status` | 22,462 | 57.4% |
| `proactive_candidate` | 21,289 | 59.6% |

All scopes are materially smaller than the internal context and stay below the 32,768-byte view ceiling while retaining the facts/provenance required by their scope. Bounded detail sizes are `3,517` (`today_tasks`), `10,103` (`week_tasks`), `7,079` (`subject_tasks`), `5,191` (`recent_sessions`), `3,814` (`subject_material_progress`), and `1,053` bytes (`planner_explanation_detail`). The largest is `week_tasks` at 10,103 bytes, below the 16,384-byte detail ceiling.

`week_progress` (22,740 bytes) and `general_status` (22,462 bytes) are the largest normal conversational views. They pass the 6B.3 hard ceiling and are materially smaller than the internal context, but remain cost-watch items for later runtime token budgeting/evaluation; 6B.3 does not shrink them by deleting required truth.

## 16. 6B.3 local acceptance state

The A–H suite covers every scope deterministically. The high-volume fixture proves size reduction and collection limits. The local-Supabase test constructs the canonical context, projects evidence, resolves detail twice, rejects mismatched user/profile detail requests, and observes mutable-row delta `0` plus Planner lifecycle-row delta `0`. Static safety reports preview recomputation `0`, legacy truth-loader calls `0`, LLM/provider calls `0`, DB mutation calls `0`, and arbitrary DB-query surfaces `0`.

6B.3 is locally accepted. It does not authorize natural-language routing, prompt/model/provider changes, current Coach runtime wiring, proactive prose, proposals, Preview, Confirm, Apply, migrations, deployment, or production access.

## 17. 6B.4 deterministic signal boundary

6B.4 adds a pure domain layer between the canonical context and the evidence projector:

```text
CoachContextV1 facts
  -> centralized deterministic Coach Signal Registry V1
  -> CoachSignalSetV1 / CoachSignalCandidateV1
  -> scope-bounded CoachEvidenceViewV1.signalCandidates
  -> later reactive/proactive runtime (not part of 6B.4)
```

`CoachSignalCandidateV1` contains no user-facing prose. It contains a version, closed signal type, severity/importance, optional subject/date scope, deterministic `reasonCode`, source fact paths, `asOf`, freshness, completeness-based confidence, scalar evidence values, provenance references, dedupe key, reactive/proactive eligibility, attention category, cooldown class, valid-silence flag, and immutable non-authority flags. `CoachSignalSetV1` is deterministic, deep-frozen, limited to 32 candidates and 24,576 serialized bytes, and reports available/returned/truncated counts.

Behavioral candidates require `known` facts with source-declared `fresh` state, a non-expired source expiry when present, and the additional calendar/lifecycle checks in the freshness policy. `unknown`, `blocked`, or stale facts never become behavioral conclusions. They are either suppressed or copied into `important_truth_unknown` / `context_data_stale` data-quality candidates with the original reason, freshness, source path, and provenance.

The layer performs no workload formula, task/date/capacity inference, trajectory classification, Planner preview, proposal mutation, database query/write, natural-language routing, prose generation, or LLM/provider call. `overall_ahead`, `overall_behind`, `subject_ahead`, and `subject_behind` are not signal types.

## 18. Central signal registry

The executable registry is `COACH_SIGNAL_REGISTRY_V1`; all evaluators are centralized in `coach-signal-v1.ts` rather than UI/components.

| Signal type | Exact input | Deterministic emission | Suppression / unavailable behavior | Proactive / attention / cooldown |
| --- | --- | --- | --- | --- |
| `today_remaining_work` | known/fresh current-date `today.summary` | open count and remaining minutes are positive | suppress if unavailable/stale/date mismatch/zero | no / progress / same snapshot |
| `today_completed_as_planned` | known/fresh `today.summary` + planned credit | non-empty; all tasks completed; zero remaining; planned credit covers planned minutes | suppress otherwise | yes / progress / daily |
| `today_partial_completion` | known/fresh `today.summary` | partial count is positive | suppress otherwise | yes / progress / state change |
| `repeated_task_miss` | known/fresh distinct recent task events | same task has at least two distinct `missed` events | stale/unavailable suppresses behavior and may emit data quality | yes / consistency / weekly |
| `subject_recent_completion_drop` | allowlisted `signalInputs[key=subject_recent_completion_drop:<subjectId>]` | positive numeric canonical input; owned subject; `subjects...` source path | suppress missing/stale/invalid/non-positive input | yes / progress / weekly |
| `subject_workload_progress_available` | known/fresh canonical workload + subject material fact | subject has material, zero unknown workload views, and canonical subject minutes entry | incomplete inputs emit the paired unknown candidate | no / material / state change |
| `subject_workload_progress_unknown` | canonical workload + subject material fact | required subject workload/material fact unavailable or incomplete | suppress for no material or complete workload | no / data quality / state change |
| `schedule_capacity_change` | allowlisted `signalInputs[key=schedule_capacity_change:<date>]` | non-zero canonical delta with `capacity...` source path | suppress missing/stale/invalid/zero input | yes / capacity / state change |
| `weekly_completion_pattern` | known/fresh current `week.summary` | non-empty week; copy counts/minutes only | unavailable/stale/out-of-range suppresses and may emit data quality | no / progress / weekly |
| `recent_study_consistency` | allowlisted `signalInputs[key=recent_study_consistency_days]` | non-negative canonical count with `recentProgress...` source path | suppress missing/stale/invalid input | no / consistency / weekly |
| `recent_recovery` | known/fresh distinct recent task events | latest event for a task is completed after an earlier miss | stale/unavailable/no sequence suppresses behavior | yes / consistency / state change |
| `planner_warning_present` | known/fresh non-expired persisted Planner lifecycle | stored warning count is positive; warning prose is not copied into the signal | suppress unavailable/stale/expired/empty | yes / planner / state change |
| `material_progress_stalled` | allowlisted `signalInputs[key=material_progress_stalled:<materialViewId>]` | canonical boolean true; material exists; `materials...` source path | suppress missing/stale/invalid/false input | yes / material / weekly |
| `context_data_stale` | important context facts | fact is stale, source expiry elapsed, or category policy rejects scope | suppress when no stale fact | no / data quality / state change |
| `important_truth_unknown` | important context facts | fact is explicitly `unknown` or `blocked` | `known` and `not_applicable` do not emit | no / data quality / state change |

Candidates are deduplicated by signal type, subject/date/entity, reason, and source path, then ordered deterministically by declared importance, type, and dedupe key. Limits are explicit selection metadata. Silence remains allowed even for proactive-eligible candidates; delivery, attention-budget enforcement, category cooldown state, dedupe persistence, and prose remain later phases.

## 19. Freshness policy

6B.4 deliberately defines no Coach-owned numeric TTL. The current canonical fact envelope and its owning source expiry remain authoritative; where an owner has no safe independent TTL, that limitation is explicit rather than replaced with an invented duration.

| Category | Acceptance rule | Additional hardening | Explicit limitation |
| --- | --- | --- | --- |
| Today/Week/task | source-declared fresh | Today date must equal context date; context date must fall inside Week | no independent task TTL authority |
| Persisted Planner lifecycle | source-declared fresh | fact expiry and persisted proposal expiry must not have elapsed | persisted lifecycle expiry is authoritative |
| Capacity | source-declared fresh | current date must fall inside capacity horizon | no Coach-owned capacity TTL |
| Material/workload | source-declared fresh | canonical owner availability/expiry copied as-is | canonical owners publish no independent Coach TTL |
| Recent progress | source-declared fresh with declared window | window is evidence context only, never trajectory authority | no independent recent-progress TTL |
| Deterministic signal input | source-declared fresh | key pattern and source fact path must be allowlisted | missing registry input suppresses dependent signal |
| Important mixed context | apply the owning category policy per fact | stale/unknown/blocked becomes data-quality evidence only | no cross-domain Coach TTL |

## 20. Evidence-view integration and bounds

Only five evidence scopes expose candidates:

| Evidence scope | Candidate allowlist | Maximum candidates |
| --- | --- | ---: |
| `today_explain` | three Today factual types | 6 |
| `week_progress` | repeated miss, drop, capacity change, Week pattern, consistency, recovery, stale/unknown quality | 6 |
| `subject_progress` | selected-subject drop/workload/recovery/stall only | 4 |
| `general_status` | all registered types, importance-first bounded selection | 4 |
| `proactive_candidate` | only registry candidates with `proactiveCandidate = true` | 4 |

`canonical_work`, `capacity_status`, and `planner_explanation` do not receive signal payloads. Raw `signalInputs` are no longer copied into the proactive view; only validated candidates are exposed. Candidate provenance is included in the evidence-view provenance union. Every resulting view remains under the existing 32,768-byte ceiling.

## 21. 6B.4 high-volume acceptance

The internal 42-task `CoachContextV1` remains 52,716 bytes. The signal set contains 8 candidates, serializes to 13,598 bytes, and remains below its 32-candidate / 24,576-byte limits. Evidence-view results are:

| Scope | 6B.4 bytes | Reduction from full context |
| --- | ---: | ---: |
| `today_explain` | 12,252 | 76.8% |
| `week_progress` | 27,820 | 47.2% |
| `subject_progress` | 16,491 | 68.7% |
| `canonical_work` | 10,899 | 79.3% |
| `capacity_status` | 13,553 | 74.3% |
| `planner_explanation` | 1,158 | 97.8% |
| `general_status` | 28,553 | 45.8% |
| `proactive_candidate` | 22,501 | 57.3% |

The accepted pre-signal `proactive_candidate` view was 21,289 bytes; validated signal integration adds 1,212 bytes. It does not materially undo 6B.3 savings. `week_progress` and `general_status` remain under the hard ceiling but are the largest normal views and stay explicit runtime cost-watch items. The largest bounded detail remains `week_tasks` at 10,103 bytes.

## 22. 6B.4 local acceptance state

A–J fixtures cover healthy silence/no-warning, Today partial completion, repeated miss, stale-pattern suppression, missing workload, PLN-002 blocking, recovery, capacity change, dedupe, and an empty signal set. Additional tests cover registered-input source-path validation, Planner warning count without prose, registry completeness, provenance/freshness preservation, evidence-scope allowlists, deterministic byte equality, and size/count limits.

6B.4 is locally accepted. It does not authorize AI runtime wiring, proactive UI/prose, prompt/model/provider changes, proposal creation, Preview, Confirm, Apply, migrations, deployment, gate changes, or production access.
