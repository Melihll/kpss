# KPSS Koçu Product Backlog

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


Status: Active

Last updated: 2026-09-12

## Workflow

Each backlog item has exactly one status:

| Status | Meaning |
| --- | --- |
| `TODO` | Defined but not yet ready or committed for immediate execution. |
| `READY` | Clear enough to start and acceptance criteria are reviewable. |
| `IN_PROGRESS` | Work has explicitly begun and has an owner. |
| `BLOCKED` | Work began or was ready, but a named dependency prevents progress. |
| `DONE` | The relevant Definition of Done evidence is complete and reviewed. |

Status changes must be deliberate. Being listed under `NOW` does not by itself mean work has started.

## Priorities

| Priority | Meaning |
| --- | --- |
| `P0` | Data loss, incorrect plan, accounting, or safety. |
| `P1` | Core product quality. |
| `P2` | Meaningful product improvement. |
| `P3` | Nice to have. |

Priority describes impact, not implementation order. Dependencies and safety gates may determine sequence.

## Current milestone backlog

| ID | Priority | Title | Status |
| --- | --- | --- | --- |
| `PLN-001` | `P0` | Esra 7-day Planning Reality Audit | `DONE` |
| `PLN-002` | `P0` | Separate Planned Study / Extra Study / Substitution / Carryover semantics | `IN_PROGRESS` |
| `PLN-003` | `P1` | Study Block Duration Policy | `IN_PROGRESS` |
| `PLN-004` | `P1` | Learning Stage Model | `IN_PROGRESS` |
| `MAT-001` | `P1` | Canonical Material Content & Progress | `IN_PROGRESS` |
| `PLN-005` | `P1` | Resource Role Model | `TODO` |
| `PLN-006` | `P1` | Daily Fragmentation Control | `TODO` |
| `PLN-007` | `P1` | Planner Decision Trace | `TODO` |
| `PLN-008` | `P1` | Planner Simulation Suite | `TODO` |
| `PLN-009` | `P1` | Shadow Evaluation | `TODO` |
| `PLN-010` | `P1` | Controlled Production Rollout | `TODO` |

## Evre 6 AI Coach backlog

| ID | Phase | Priority | Title | Status |
| --- | --- | --- | --- | --- |
| `AIC-001` | 6A | `P0` | Product / Authority / Cost Contract | `DONE` |
| `AIC-002` | 6B | `P0` | CoachContextV1 | `IN_PROGRESS — 6B.6B.2 LOCAL_ACCEPTANCE_GREEN / SECOND_REAL_SMOKE_NOT_AUTHORIZED` |
| `AIC-003` | 6C | `P1` | Reactive Coach | `TODO` |
| `AIC-004` | 6D | `P1` | Proactive Coach | `TODO` |
| `AIC-005` | 6E | `P0` | Planner V2 Integration | `TODO` |
| `AIC-006` | 6F | `P1` | Conversation Intelligence | `TODO` |
| `AIC-007` | 6G | `P0` | Eval / Cost / Production Acceptance | `TODO` |

The normative Evre 6 scope and phase contract is [AI Coach Evre 6 — Product, Authority & Cost Contract](specs/AI_COACH_EVRE_6_PRODUCT_AUTHORITY_COST_CONTRACT.md). AI teacher/tutoring/quiz/mastery features are outside every Evre 6 item. No backlog status grants runtime, deployment, migration, gate, Confirm, Apply, or production authority.

## `AIC-001` / Evre 6A — Product / Authority / Cost Contract

- Priority: `P0`
- Status: `DONE`
- Problem: AI Coach cannot safely expand while product outcomes, truth sources, LLM responsibility, planner authority, proactive triggers, user experience, and per-user model cost limits remain implicit.
- Desired outcome: One final, reviewable contract constrains all later Evre 6 design and acceptance.
- Acceptance criteria:
  - Explain, Diagnose, Guide, Proactive Insight, Planner V2 proposal interpretation, daily/weekly analysis, and contextual conversation are defined.
  - Deterministic truth/calculation responsibility and bounded LLM interpretation/wording responsibility are explicit.
  - AI cannot create/move/cancel/apply tasks, calculate canonical workload/capacity, invent materials, mutate capacity/progress/stage, or bypass Planner V2.
  - Every Coach-originated planning Apply converges on the canonical Planner V2 lifecycle.
  - Twenty realistic Turkish scenarios define truth sources, responsibility, allowed/forbidden behavior, proposal eligibility, and expected UX.
  - Proactive categories, eligibility, materiality, freshness, dedupe, cooldown, attention budget, user control, and no-auto-proposal rules are defined.
  - AI usage/cost telemetry starts in 6B; centralized server-side routing/pricing and provider/versioned-TRY ledger semantics are defined; automatic hard-governor completion is a 6G exit criterion.
  - Normal-user `≤ 150–200 TL/month`, heavy-user `≤ 250 TL/month`, and hard `300 TL/month` limits are contractual.
  - T0–T3 routing, caching, cooldowns, deterministic fallback, and “no LLM for deterministic calculations” are defined.
  - 6A–6G entry/exit and authority states plus the ten final architecture decisions are recorded.
  - Product/architecture review decisions are incorporated and all 20 scenarios are revalidated.
- Completion note (2026-09-10): the final contract is accepted and 6A is closed. Runtime code, migrations, deployments, gates, and production state are unchanged. Confirm and Apply remain OFF.

## `AIC-002` / Evre 6B — CoachContextV1

- Priority: `P0`
- Status: `IN_PROGRESS — 6B.1–6B.6B.1 ACCEPTED — 6B.6B.2 LOCAL_ACCEPTANCE_GREEN / SECOND_REAL_SMOKE_NOT_AUTHORIZED — REAL_SMOKE_ATTEMPT_1_COUNT_HTTP_400 — PRODUCTION ACTIVATION BLOCKED`
- Dependency: closed `AIC-001`; accepted 6B.1 checkpoint `acd16ffb2263b5285b14bd7329ff4357d7971e00`.
- Desired outcome: One immutable, minimal, user-scoped context envelope supplies canonical facts, provenance, freshness, confidence/authority, unknowns, and bounded conversation state while beginning centralized router/pricing and AI usage/cost telemetry.
- Acceptance criteria:
  - Context distinguishes plan, task, capacity, workload, material progress, stage, resource role, and study-intent semantics.
  - Material facts use canonical Material Truth and the Canonical Workload Engine; legacy top-three material/workload projections are not truth sources or fallbacks.
  - Daily/weekly totals preserve Planned Study, Extra Study, Substitution, Carryover, and ambiguity.
  - Definitive ahead/behind fields are unknown when PLN-002 semantics are insufficient; other independently known facts remain available.
  - Canonical Planner V2 proposal identity/lifecycle/fingerprint can be bound without transferring authority.
  - Facts carry freshness, confidence/authority, provenance, and known/unknown/blocked/not-applicable semantics where applicable.
  - Model routing and pricing configuration are centralized server-side and versioned.
  - Every Evre 6 model call from 6B onward is recorded in a usage/cost ledger with provider cost and a versioned TRY estimate.
  - Context minimization, user isolation, redaction, fingerprints, fixtures, and per-tier token estimates pass review.
  - No provider call, proposal creation, confirmation, Apply, or production activation is introduced by the context contract itself.
- 6B.1 note (2026-09-10): [CoachContextV1 Contract and Canonical Source Map](specs/AI_COACH_CONTEXT_V1.md) is accepted at `acd16ffb2263b5285b14bd7329ff4357d7971e00`, with a pure typed builder, executable field/source and legacy-exclusion registries, compactness/authority guards, and A–H fixtures/tests. It does not complete router/pricing, telemetry, or 6B as a whole.
- 6B.2 note (2026-09-10): canonical read-only adapters and focused proofs are implemented locally (30/30; 42-task internal canonical context 52,716 bytes). The targeted real local-Supabase integration test passes `1/1` with mutable-row delta `0` and Planner lifecycle-row delta `0`; static safety proves zero preview recomputation and zero legacy Coach truth-loader calls. No runtime wiring, production access, migration, Preview, Confirm, or Apply occurred.
- 6B.3 requirement: retain the complete internal canonical context and introduce a separate compact allowlisted LLM-facing projection plus on-demand detail strategy. The 52,716-byte high-volume fixture must not be sent wholesale to a model or “optimized” by deleting canonical truth from the internal contract.
- 6B.3 local note (2026-09-11): `CoachEvidenceViewV1` implements eight explicit scope/capability pairs and six bounded detail kinds over the immutable canonical context. High-volume scope reductions are 56.9–97.8%; the largest detail is 10,103 bytes. A–H, limits, availability/provenance preservation, no-leak, profile isolation, local-DB zero-mutation, and static no-preview/no-legacy/no-LLM/no-query proofs are locally accepted. No runtime wiring or production action occurred.
- 6B.4 local acceptance (2026-09-11): centralized `CoachSignalCandidateV1` registry evaluates only known/fresh facts or emits explicit data-quality candidates for unavailable facts. Fifteen signal classes, source-owned freshness policy, deterministic dedupe/cooldown/attention metadata, five bounded evidence-scope integrations, A–J tests, and high-volume size evidence are accepted locally. No prose, LLM/provider call, proposal, runtime wiring, or production action occurs.
- 6B.5 local acceptance (2026-09-11): [Central Router, Pricing, FX and Usage Ledger V1](specs/AI_COACH_ROUTER_COST_TELEMETRY_V1.md) defines capability routing, production-fail-closed fixture-only versioned pricing/FX, `AiUsageEventV1`, Europe/Istanbul monthly accounting, deterministic preflight, and a service-owned append-only ledger. The migration is applied only to loopback local Supabase for RLS/idempotency/immutability tests. Atomic persistent user-month reservation, authoritative production pricing/FX, production migration, provider metering, and runtime wiring remain hard prerequisites/open work for 6B.6.
- 6B.6A local acceptance (2026-09-11): [Provider Runtime and Atomic Budget Safety V1](specs/AI_COACH_PROVIDER_RUNTIME_BUDGET_V1.md) adds a production-authoritative configuration boundary that defaults to unavailable, complete billable-token-bound gating, defensive provider-attempt observation, atomic user-wide Istanbul-month worst-case reservation, service-only lifecycle RPCs, transactional ledger settlement, reconciliation states, and read-only operational views. Exact `290 + 10` / `290 + 10.01` and concurrent saturation tests pass. At that checkpoint production route/pricing/FX/billable-bound facts and update mechanisms were absent; no provider or user-facing runtime was wired, the migration was local-only, and 6B remained in progress.
- 6B.6B.1 local acceptance (2026-09-12): [Read-Only Provider Orchestrator V1](specs/AI_COACH_READ_ONLY_PROVIDER_ORCHESTRATOR_V1.md) audits the manual provider foundation, pins current official GPT-5.4 snapshot/pricing facts, blocks regional/long-context/unmodeled billing, and connects canonical context/evidence/signals through immutable request identity, exact mocked input count, worst-case TRY authorization, real local atomic reservation/ledger, mocked provider observation, and grounded response validation. It is disconnected from live Coach and rejects production. Count-endpoint/cache-write billing, acquired FX, operations, real gateway, production migration/deployment, and activation remain blockers; 6B remains in progress.
- 6B.6B.2 local acceptance green (2026-09-12): [Controlled DEV Runtime Pre-Smoke Foundation V1](specs/AI_COACH_CONTROLLED_DEV_RUNTIME_V1.md) and the [DEV Smoke/Reconciliation Runbook](specs/AI_COACH_DEV_SMOKE_RUNBOOK.md) now cover the central default-OFF, production-prohibited, server-only exact allowlist; closure-held API key; fixed-origin injected-fetch gateway; transport authority separation; official count identity with unresolved billing preserved; dedicated controlled-DEV cost authorization; authoritative local route/pricing envelope; deterministic TCMB acquisition/freshness; one-attempt/no-retry/no-fallback policy; and critical reconciliation. Full A→Z mocked smoke and checkpoint regression are green. `TEMP_DEV_COST_POLICY_2026_09_12` permits a separately approved single observed-cost local-DEV smoke despite unresolved count-endpoint billing; no real provider call has occurred and production remains blocked.

## `AIC-003` / Evre 6C — Reactive Coach

- Priority: `P1`
- Status: `TODO`
- Dependency: accepted `AIC-002`, eval fixtures, cost ledger, and separate release scope.
- Desired outcome: The user can ask the Coach to Explain, Diagnose, or Guide and receive grounded Turkish responses with deterministic fallbacks.
- Acceptance criteria:
  - Deterministic questions route to T0 with zero provider calls.
  - LLM output is schema-validated, grounded to CoachContextV1, and cannot call mutation tools.
  - Facts, hypotheses, unknowns, clarification, out-of-scope, provider failure, and cost-limited states are distinct.
  - All relevant 20 contract scenarios pass, including prohibited-action assertions.
  - Every call/retry/fallback is metered through the 6B ledger; the hard governor remains a 6G production-acceptance requirement.
  - User-facing language uses durum analizi, ilerleme değerlendirmesi, ders dengesi, çalışma eğilimi, and plan riski rather than mastery/medical diagnosis.
  - No broad production exposure occurs before 6G acceptance.

## `AIC-004` / Evre 6D — Proactive Coach

- Priority: `P1`
- Status: `TODO`
- Dependency: accepted reactive safety and approved trigger/attention policy.
- Desired outcome: Deterministic, timely, actionable in-app insights reach the user without noise, manipulation, invented causes, outbound messaging, or automatic planning.
- Acceptance criteria:
  - Deterministic rules own trigger eligibility, priority, dedupe, hysteresis, cooldown, expiry, and suppression.
  - Every launch trigger has a deterministic template and sufficient data-quality threshold.
  - Same-fingerprint/category limits, daily attention budget, active-work protection, dismiss/snooze/disable, and audit facts are enforced.
  - Proactive Coach is in-app only in Evre 6; Telegram, email, push, SMS, and other outbound channels are prohibited.
  - Silence is a valid outcome when freshness, confidence, actionability, attention, or cost conditions are not met.
  - Proactive insight generation never creates/persists a Planner proposal and does not use an LLM to decide whether to fire.
  - Shadow precision/actionability, cost, in-app rendering, and silence acceptance pass before 6G.

## `AIC-005` / Evre 6E — Planner V2 Integration

- Priority: `P0`
- Status: `TODO`
- Dependency: accepted context/reactive boundaries; the 6A canonical-convergence decision is final.
- Desired outcome: Coach-originated planning requests and explanations use one canonical Planner V2 lifecycle with no competing Apply authority.
- Acceptance criteria:
  - Natural-language intent remains an untrusted candidate; deterministic Planner V2 owns workload, feasibility, proposal, protection, and placement.
  - AI states no real task/date/capacity/affected-count outcome until a deterministic Planner V2 scenario or canonical preview supplies it.
  - Proposal interpretation is an exact rendering of immutable diff, reasons, warnings, blocked/unmet work, lifecycle, and expiry.
  - Changed intent creates a new snapshot/proposal attempt; no proposal body or confirmation is reused.
  - Chat text cannot confirm or apply; stale/expired proposals cannot proceed.
  - New development does not use the legacy/generic Coach planning Apply path; every Coach planning mutation converges on canonical Planner V2.
  - Preview, Confirm, and Apply remain independently gated. Confirm and Apply stay OFF until separate release approvals.

## `AIC-006` / Evre 6F — Conversation Intelligence

- Priority: `P1`
- Status: `TODO`
- Dependency: stable reactive Coach and canonical proposal binding.
- Desired outcome: Short recent context plus compact structured conversation state/signals resolve references and corrections without long-term raw-history storage, stale facts, privacy leakage, or authority transfer.
- Acceptance criteria:
  - Referents bind to unique user-scoped IDs and current fingerprints; ambiguity asks one clarification.
  - Corrections supersede conversational claims but never rewrite history or an immutable proposal.
  - Raw long-term conversation history is not stored by default; structured state is minimized, retention/deletion/redaction are defined, and no cross-user/provider memory is trusted.
  - Conversation summaries are metered, provenance-bearing, and non-authoritative.
  - “Tamam/evet/uygula” prose never substitutes for canonical confirmation or Apply.

## `AIC-007` / Evre 6G — Eval / Cost / Production Acceptance

- Priority: `P0`
- Status: `TODO`
- Dependency: relevant 6B–6F exits and a separate production release brief.
- Desired outcome: Safety, groundedness, UX, cost, observability, and rollback are proven before any controlled production expansion.
- Acceptance criteria:
  - P0 authority violations, cross-user leakage, invented workload/material, and false Apply-success claims are zero.
  - Numeric and causal claims in the acceptance set are fully grounded in supplied deterministic facts.
  - Turkish ambiguity, correction, injection, malformed provider output, refusal, timeout, retry, stale proposal, cache isolation, and cost exhaustion tests pass.
  - Normal-user projected p90 is `≤ 200 TL/month`, heavy-user projected p90 is `≤ 250 TL/month`, and no path exceeds `300 TL/month`.
  - Every model call is ledgered/reconciled with provider cost, provider-pricing version, versioned TRY estimate, and centralized server-side model-router version; deterministic-only cases produce zero model calls.
  - The automatic pre-call budget governor enforces the hard `300 TL/month` per-user ceiling while deterministic/template product behavior remains available.
  - Limited exact-profile production acceptance, disable/rollback, and any independent capability activation receive separate approval.

## `PLN-001` — Esra 7-day Planning Reality Audit

- Priority: `P0`
- Status: `DONE`
- Problem: Current planning behavior cannot be safely changed until important decisions from Esra's latest seven days can be reconstructed from real evidence. Unknown moves, substitutions, backlogs, or accounting effects make planner changes unsafe.
- Desired outcome: A factual, reviewable timeline that explains what was planned, what Esra actually did, what changed, which component or action caused each change, and which behavior remains unexplained.
- Acceptance criteria:
  - Planned versus actual study is reconstructed for the seven-day audit window.
  - Manual and extra study is identified separately from planned study.
  - Capacity changes are identified with their effective time and source where evidence exists.
  - Plan revisions are traced in order.
  - Task moves, carryovers, and backlog transitions are traced without treating disappearance as an explanation.
  - Resource and video usage is identified where recorded.
  - Each important planner decision is connected to evidence or explicitly listed as unexplained.
  - The audit is read-only with respect to Esra's production data; no synthetic activity or repair is introduced.
- Completion note (2026-08-22): status advanced `READY → IN_PROGRESS → DONE`. The acceptance evidence, hypotheses, sanitized observation references, and unknowns are recorded in the [PLN-001 audit](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md). This item required investigation and documentation, not implementation; production remained read-only and no planner behavior was changed.

## `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Current phase: production released; planned-study authenticated real-user acceptance passed on 2026-08-23; extra-study authenticated real-user acceptance remains pending. The approved model is defined in [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md), and implementation evidence is recorded in [PLN-002 Implementation Decision](decisions/PLN-002_IMPLEMENTATION_DECISION.md).
- Problem: Study outside the plan can be misinterpreted as completion or replacement of planned work, and movement across days can obscure whether work was substituted, carried over, or silently removed.
- Desired outcome: Planned study, extra study, user-confirmed substitution, and carryover are distinct concepts in product behavior, accounting, explanations, and tests.
- Acceptance criteria:
  - Each of the four concepts has an unambiguous product definition and lifecycle.
  - Extra study never silently substitutes for, completes, cancels, or removes another planned subject.
  - Substitution requires explicit user confirmation and records what replaced what.
  - Carryover preserves the identity and history of the original planned work.
  - Planned and extra minutes can be reported separately.
  - A task-linked session performed ahead of its approved date is not silently classified as planned, extra, or substitution; the user's intent or an explicit documented default determines its accounting treatment.
  - Extra/manual study does not reduce the approved-plan denominator or consume displacement capacity unless the product presents and records the user-approved consequence.
  - Existing records have a documented interpretation or are explicitly classified as ambiguous; history is not rewritten to hide ambiguity.
  - Automated tests cover extra study, confirmed substitution, rejected substitution, carryover, retry, and concurrent mutation boundaries.
  - Planner explanations state whether extra study affected a decision.
  - Regression fixtures cover the PLN-001 manual Mathematics → Finance backlog and early Turkish → Finance/Law backlog chains.
- Release note (2026-08-22): the forward-only schema, domain/planner semantics, authenticated API, minimal ambiguity UI, and audit contracts were released after local migration replay plus unit, integration/RLS, Edge, Telegram, Coach, P0 safety, typecheck, and production-build gates passed. Status remains `IN_PROGRESS`: planned-study authenticated real-user acceptance passed on 2026-08-23, while extra-study authenticated real-user acceptance is still pending.

## `PLN-003` — Study Block Duration Policy

- Priority: `P1`
- Status: `IN_PROGRESS`
- Problem: A uniform duration assumption ignores the cognitive and practical differences between learning, practice, review, reinforcement, video, and spaced review, producing unrealistic blocks or avoidable fragments.
- Desired outcome: Estimated duration follows an explicit, configurable policy based on study stage and activity type, with sensible bounds and an explanation.
- Acceptance criteria:
  - Separate duration policies exist for new-topic learning, mathematics concept learning, primary practice, reinforcement, review, video, and spaced review.
  - The policy does not hard-code “every subject = 60 minutes.”
  - Duration inputs, defaults, minimums, maximums, and rounding behavior are documented.
  - A chosen duration can be explained using its study type/stage and relevant evidence.
  - Estimated versus actual duration is measurable using the definition in [METRICS.md](METRICS.md).
  - Real Esra examples and boundary cases cover the three 30-minute new-topic video/notes blocks, short availability, long resources, partial work, and continuation.
  - Duration calibration rejects or explicitly excludes overlapping session intervals and reports when historical per-task actual time cannot be de-overlapped reliably.
  - Policy changes are versioned or otherwise traceable so past decisions remain explainable.

- Implementation note (2026-08-23): `pln-003-v1` is implemented and locally verified. The centralized deterministic policy covers `new_learning`, `guided_practice`, `primary_practice`, `reinforcement`, `error_review`, and `spaced_review`; supports AI recommendations only as normalized advisory input; preserves explicit user overrides and genuine remainders; and prevents policy-tagged blocks from being fabricated below their minimum solely to fill residual capacity.
- Verification evidence: targeted PLN-003 tests pass, full unit regression passes (`632/632`), integration/RLS passes (`101/101`), TypeScript typecheck passes, `planning.bundle.js` is regenerated from current sources, and planning bundle reproducibility/safety checks pass. `roadmap.test.ts` passes `11/11`, including four PLN-003 duration-aware schedule scenarios, covering preferred new-learning duration, residual capacity below the class minimum, and multiple valid same-subject blocks in one day.
- Status remains `IN_PROGRESS`: no PLN-003 production rollout or real-user verification has occurred. Current production planning inputs also do not yet provide a canonical `learning_stage` / `blockClass` for normal P48 resources, so the duration policy is not broadly authoritative in production. Distinct backlog semantics such as learning-stage assignment and any separate video/mathematics-concept classification remain unresolved rather than being silently inferred from `work_mode` or resource role.

## `PLN-004` — Learning Stage Model

- Priority: `P1`
- Status: `TODO`
- Problem: Planning by subject and minutes alone cannot distinguish first exposure from practice or later reinforcement, so it may order pedagogically different work as if it were interchangeable.
- Desired outcome: The planner represents and respects the progression `Learn → Practice → Review / Reinforcement`.
- Acceptance criteria:
  - Learning stages have explicit definitions, allowed transitions, and evidence requirements.
  - New-topic learning and question solving are represented as different stages.
  - Practice does not imply that required initial learning occurred unless evidence supports it.
  - Review and reinforcement do not replace required initial learning.
  - Tasks and planner decisions expose the intended learning stage as structured data rather than inferring it only from mixed prose descriptions.
  - Partial, repeated, skipped, and corrected evidence have defined stage behavior.
  - A task reaching its credited-minute estimate has a documented relationship to task status and required resource-unit evidence.
  - Tests cover valid sequencing, invalid shortcuts, unknown evidence, and stage-specific replanning.
- Local verification note (2026-08-24): the deterministic learning-stage evaluator, canonical material-evidence adapter, and material-evidence-to-stage flow are implemented. PLN-004 targeted tests pass `22/22`; full non-integration repository regression passes `654/654` across `95/95` test files; domain typecheck passes. Integration/RLS suites were not rerun in the current shell because local Supabase environment variables were unavailable. No database or production-authoritative behavior is introduced by this checkpoint.

## `MAT-001` — Canonical Material Content & Progress

- Priority: `P1`
- Status: `IN_PROGRESS`
- Problem: The planner can reference resources, but it cannot yet rely on a complete subject-agnostic model of the exact material units a learner should execute, such as page ranges, tests, chapters, or individual YouTube videos.
- Desired outcome: Every supported KPSS resource can expose exact, ordered, progress-aware material units that map to curriculum topics and can be planned consistently across Today and Week views.
- Acceptance criteria:
  - The material model is subject-agnostic and supports every KPSS subject and future resources without subject-specific planner branches.
  - Physical resources use canonical sections and executable units such as page ranges, tests, chapters, readings, mocks, or other explicit units.
  - YouTube resources expose individual playlist videos with real duration and deterministic topic mappings rather than treating an entire playlist as one topic unit.
  - A topic may map to multiple videos, and a video may map to multiple topics when evidence requires it.
  - Physical unit progress and YouTube video progress remain historical execution facts and are not silently rewritten when pedagogical stage state changes.
  - A user can explicitly import existing progress through flows such as completed units, watched videos, or a verified "completed up to here" boundary.
  - "Completed before but forgotten" preserves material completion history while allowing PLN-004 to require review or remediation.
  - Photo/PDF-assisted content intake may propose sections, units, page ranges, tests, and topic mappings, but canonical publication requires deterministic validation and review.
  - Planner inputs expose a unified material-unit view across physical resources and YouTube without duplicating authoritative progress stores.
  - Today tasks can identify exact executable scope, and Week plans can expose the exact material destination expected by the end of the week.
  - Existing `resource_sections`, `resource_units`, `resource_unit_progress`, `youtube_playlist_videos`, and `youtube_video_progress` are reused where their semantics already fit.
  - Tests cover physical page/test units, video-topic mappings, partial progress, imported progress, forgotten material, missing mappings, multi-topic units, and subject-independent behavior.

- Architecture note: resource role remains owned by PLN-005, learning-stage progression remains owned by PLN-004, and duration normalization remains owned by PLN-003.
- W2 release note (2026-08-25): atomic physical pace evidence migration `20260825130000` is deployed as schema/RPC capability only. Protected start/material snapshots, protected pause accounting, immutable accepted events, causal session idempotency, exact page-boundary semantics, RLS, and four W2 RPCs are present. All W2 tables and historical accepted samples remain at `0`; no backfill occurred; app-api/Telegram/web capture and canonical planning remain inactive. Runtime activation requires a separate design/review and explicit approval.
- W4 engineering closure (2026-08-25): Canonical Workload Engine Phase 4 is `ENGINEERING_COMPLETE`; production data maturity remains `IN_PROGRESS`. Accepted-W2-only calibration, deterministic median pace, unchanged W1 confidence promotion, explicit readiness, structural-span shadow arithmetic, read-only production diagnostics, blocked unknown workload, and the Planner V2 handoff are implemented and verified. The exact-profile capture pilot remains active, but accepted evidence and calibrated physical pages remain zero; evidence-shadow and canonical planning remain OFF. MAT-001 is not marked `DONE` because natural evidence maturity and later planner shadow/rollout evidence are still pending.
- W5 engineering note (2026-08-26): the Planner V2 canonical shadow consumes MAT-001 handoffs without changing material or task state. It schedules exact whole boundaries only, carries unknown/blocked physical demand explicitly, deduplicates full-video workload, and produces immutable snapshot/proposal fingerprints. MAT-001 remains `IN_PROGRESS`: production data maturity and controlled application of exact material plans are later gates.
- W6 engineering note (2026-08-26): the Planner V2 proposal lifecycle is locally implemented through exact confirmation and an atomic Apply candidate. Canonical task identity/boundary persistence, stale/capacity rechecks, conservative replacement, rollback, and idempotency require the new additive migration candidate. It is not applied to production; app-api/web capability remains default OFF and there is no live Apply route. Production schema review, preview pilot, and any later Apply activation remain separate backlog/release decisions.
- Evre 5 reliability note (2026-09-02): repeated deterministic previews now create distinct lifecycle attempt rows instead of reusing an expired record; deterministic proposal/snapshot identity remains stable and confirmation stays bound to the returned attempt `recordId`. Local migration rebuilds reproduce the existing hosted task/plan `service_role` baseline, and confirmed→expired Apply now clears the current confirmation marker without weakening its constraint. Local integration and regression gates are GREEN; all new migration/runtime changes remain undeployed, production Confirm/Apply remain OFF, and no production mutation occurred.
- Evre 5 production acceptance note (2026-09-07): exact-profile Preview, exact Confirm, and one meaningful atomic Apply passed in production. Lifecycle record `805be0cb-7d68-4b12-8df9-7b14f52a852e` created exactly one 22-minute canonical YouTube task on 2026-09-08, replaced zero tasks, advanced the weekly plan once from generation 3 to 4, preserved past/Today/41 protected manual future tasks, and left study sessions unchanged. Duplicate protection passed with exactly one active canonical task. Confirm and Apply returned to OFF immediately after the pilot.
- Evre 5 final closure note (2026-09-08): the accepted task was visible on both production Week and Today before start with the correct date, duration, material, and exact canonical identity. It remained `ready` with zero task progress/sessions, duplicate count one, and weekly plan `2662 / 2662 / 2662` generation 4. Other observed Today changes were explained by natural linked sessions; future manual tasks and all observation-window task/session/proposal/plan counters were unchanged. Confirm and Apply remained OFF. Evre 5 Planner V2 / Planner Truth is `CLOSED`; Evre 6 AI Coach is the next active macro phase under a separate discovery/specification scope.

## `PLN-005` — Resource Role Model

- Priority: `P1`
- Status: `TODO`
- Problem: A resource link does not tell the planner whether the material teaches, provides primary practice, reinforces, or supports revision. Treating resources as interchangeable can create pedagogically unsound tasks.
- Desired outcome: Resources participate in planning through explicit roles: Instruction, Primary Practice, Reinforcement, and Revision.
- Acceptance criteria:
  - Each role has a product definition and planning purpose.
  - Video courses, main question banks, and second question banks have documented role-assignment rules, including the audited İlyas Güneş instruction video, Yediiklim primary question bank, and Yargı Plus reinforcement question bank.
  - A task identifies its learning stage and resource role when a resource is required.
  - The planner does not use reinforcement material as silent replacement for instruction or primary practice.
  - Missing targets/mappings, unavailable, duplicate, and multi-role resource cases have deterministic behavior; an unmapped instruction video cannot silently disappear from the learning path.
  - Target `sequence_order` and pedagogical prerequisites are distinct, documented rules; sequence 1/2 for two question banks does not by itself prove instruction occurred.
  - Planner explanations identify why a resource and role were selected.
  - Tests cover the normal Learn → Practice → Review / Reinforcement resource path and invalid substitutions.

## `PLN-006` — Daily Fragmentation Control

- Priority: `P1`
- Status: `TODO`
- Problem: Unnecessary 20–30 minute fragments and frequent subject changes increase setup cost and reduce focus, even when the daily minute total fits.
- Desired outcome: Daily plans use coherent blocks and minimize unnecessary subject switching while retaining required review and fitting real capacity.
- Acceptance criteria:
  - Fragmentation and subject-switch count have explicit definitions.
  - The PLN-001 baseline—25 Mon–Sat blocks, 19 planned switches, and five observed actual switches—is retained as a before-state for simulations.
  - The planner has documented minimum block and split rules by study type/stage.
  - Avoidable 20–30 minute fragments are reduced without concealing capacity shortfalls.
  - Subject continuity is an explicit planning objective, subordinate to prerequisites, safety, and user intent.
  - Necessary short review activities remain possible and explainable.
  - Before/after simulations report fragment count, switch count, capacity fit, affected tasks, and whether a different-subject preference caused the sequence.
  - Tests cover tight capacity, mixed learning stages, due reviews, partial tasks, and user-fixed ordering.

## `PLN-007` — Planner Decision Trace

- Priority: `P1`
- Status: `TODO`
- Problem: A plan cannot be trusted or debugged when placements, moves, duration changes, backlog, carryover, and the effects of extra study lack a durable reason.
- Desired outcome: Every material planner decision has a human-understandable explanation backed by structured trace data.
- Acceptance criteria:
  - Every task placement records why the task is scheduled on that day.
  - Every move records origin, destination, trigger, reason, and relevant constraints.
  - Every duration change records the prior value, new value, and policy/evidence used.
  - Every backlog and carryover decision records why the work was not kept in place.
  - The trace states whether extra study, substitution, capacity, learning stage, or resource availability affected the decision.
  - No task can silently disappear; cancellation or removal requires an explicit, auditable transition.
  - Explanations are deterministic for the same decision evidence and avoid unsupported claims.
  - Traces are user-scoped and do not expose another user's data.

## `PLN-008` — Planner Simulation Suite

- Priority: `P1`
- Status: `TODO`
- Problem: Unit tests alone do not show that full-week plans remain sensible across realistic behavior changes and interacting edge cases.
- Desired outcome: A repeatable suite evaluates planner outcomes against real Esra scenarios and synthetic edge cases before production behavior changes.
- Acceptance criteria:
  - Sanitized or approved real Esra scenarios cover the failures and ambiguities found by `PLN-001`.
  - Synthetic cases cover extra study, confirmed substitution, carryover, capacity changes, missed days, partial work, duration error, resource gaps, stage prerequisites, fragmentation, and stale proposals.
  - Expected outcomes assert the planner invariants, not only snapshot shape.
  - The same input and version produce the same decision wherever determinism is required.
  - Failures display a useful decision trace and changed-task summary.
  - The suite can compare candidate behavior with the current planner without production writes.
  - P0 regressions block release.

## `PLN-009` — Shadow Evaluation

- Priority: `P1`
- Status: `TODO`
- Problem: A candidate planner cannot be judged safely from isolated tests or by applying unproven decisions to the real plan.
- Desired outcome: Candidate planning behavior is compared with the current production planner using real inputs while the candidate remains non-authoritative and does not mutate the real plan.
- Acceptance criteria:
  - Shadow execution is read-only for the real plan and cannot call an apply path.
  - Current and candidate behavior are compared on the same eligible snapshot and versioned inputs.
  - Comparison includes invariant violations, changed-task count, unexplained decisions, fragmentation, subject switches, backlog, carryover, duration fit, and execution-related metrics where available.
  - Candidate proposals and validation results are reviewable without exposing secrets or cross-user data.
  - Stale, incomplete, or ownership-mismatched snapshots are rejected.
  - Promotion thresholds and the observation window are defined before evaluation begins.
  - Any P0 invariant violation blocks promotion.

## `PLN-010` — Controlled Production Rollout

- Priority: `P1`
- Status: `TODO`
- Problem: Even a tested planner change can cause real-world plan or accounting failures when introduced without limited scope, verification, observability, and a stop path.
- Desired outcome: Approved planning behavior reaches production through explicit gates and demonstrates seven days of normal Esra usage without planner-caused manual database repair.
- Acceptance criteria:
  - `PLN-001` through `PLN-009` meet their required completion and promotion gates.
  - The release follows [RELEASE_PROCESS.md](RELEASE_PROCESS.md), including explicit scope, migration/deploy review where relevant, verification, and rollback/disable strategy.
  - Initial production exposure is limited to the approved user and scope.
  - Planner decisions, failures, moves, and manual repair events are observable.
  - Stop conditions and the responsible decision maker are named before rollout.
  - Seven consecutive days of normal Esra usage complete without manual database repair caused by planner behavior.
  - No P0 planner invariant is violated during the observation window.
  - Real-user behavior and explanations are reviewed before broader expansion.

- Evre 5 acceptance checkpoint (closed 2026-09-08): the approved exact-profile meaningful Apply pilot passed with `1 create / 0 replace / 22 min`, exact canonical linkage, one generation increment, unchanged protected work/sessions, and no duplicate; final Week/Today real-user visibility also passed. This closes Evre 5 Planner V2 / Planner Truth, but does not complete the separate seven-day `PLN-010` observation criterion or authorize broader exposure. Confirm and Apply remain OFF.

## Definition of Done

A feature is not done because code exists. `DONE` requires the relevant combination of:

- problem and specification defined;
- implementation complete;
- automated tests pass;
- production or release verification complete;
- observability available;
- real user behavior verified.

For each item, the completion note must state which evidence applies, link to it, and explain any element that is legitimately not applicable. P0 work cannot waive safety verification. If required evidence is missing, the item remains `IN_PROGRESS` or `BLOCKED`, not `DONE`.

## Backlog maintenance

- New work receives a stable ID, priority, problem, desired outcome, acceptance criteria, and status.
- Changes to scope or criteria are recorded in version control; completed criteria are not rewritten to make an item appear done.
- The [current sprint](CURRENT_SPRINT.md) must agree with this file's status and ordering.
- Milestone sequencing belongs in [ROADMAP.md](ROADMAP.md), not in ad hoc issue lists.
- Metric impact should reference [METRICS.md](METRICS.md); architectural impact should reference [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).
