# PLN-004 — Learning Stage Model

Status: IN_PROGRESS — IMPLEMENTED_LOCAL_VERIFIED — PRODUCTION_ACTIVATION_GATED
Last updated: 2026-08-24

## 1. Purpose

Make learning stage a canonical structured planner concept so pedagogically different work is not treated as interchangeable subject minutes.

The model must preserve the progression `Learn → Practice → Review / Reinforcement` while allowing partial work, repetition, correction, and explicit evidence from prior study.

## 2. Architectural boundaries

- The deterministic planning engine owns stage eligibility, prerequisite validation, and schedulable-stage decisions.
- AI may classify or explain ambiguous evidence, but it cannot directly mark a stage satisfied or mutate the plan.
- Learning stage must not be inferred solely from task prose, `work_mode`, resource type, or resource role.
- Resource role remains a separate concept owned by PLN-005.
- Study-block duration remains a separate concept owned by PLN-003.
- User intent remains authoritative and no stage interpretation may silently remove or replace Today work.

## 3. Canonical learning stages

| Stage | Meaning | Normal prerequisite |
| --- | --- | --- |
| `learn` | Initial acquisition or first structured exposure to a topic/concept | none |
| `practice` | Primary application after learning, including guided or independent problem solving | `learn` satisfied |
| `review` | Deliberate revisit of previously learned/practiced material for recall, spacing, or error correction | prior valid learning evidence; normally `practice` satisfied |
| `reinforcement` | Additional practice intended to strengthen an already established path rather than replace instruction or primary practice | `practice` satisfied |

`unknown` is not a schedulable learning stage. It represents insufficient evidence to determine progression safely.

## 4. Core progression rules

1. Normal progression is `learn → practice → review / reinforcement`.
2. A stage may repeat when evidence is partial, remediation is required, or the stage has multiple required units.
3. Practice evidence does not silently prove that required initial learning occurred.
4. Review or reinforcement never substitutes for required initial learning.
5. Reinforcement never silently substitutes for required primary practice.
6. Imported or historical evidence may satisfy a prerequisite only when its provenance and meaning are sufficiently explicit.
7. Unknown or ambiguous evidence is preserved as unknown rather than guessed into a later stage.
8. Corrected evidence may change the currently required stage, but historical evidence is retained for auditability rather than rewritten.

## 5. Stage state

Each learning stage has a state separate from task lifecycle:

| State | Meaning |
| --- | --- |
| `not_started` | No accepted evidence for the required stage exists |
| `in_progress` | Valid partial evidence exists but the stage requirement is not yet satisfied |
| `satisfied` | Required evidence for the stage is complete |
| `remediation_required` | Earlier evidence exists, but explicit later evidence requires the stage to be repeated or repaired |
| `unknown` | Evidence exists but is insufficient or ambiguous for a deterministic stage decision |

Stage state is scoped to a learning target such as a topic or concept. It is not a global property of a subject.

## 6. Evidence model

A stage transition must be supported by structured evidence. Minutes alone are not sufficient evidence.

Canonical evidence must identify, where applicable:
- user and exam-profile ownership;
- topic/concept learning target;
- intended learning stage;
- source or resource unit;
- provenance / evidence source;
- recorded time;
- credited progress or completed unit;
- whether the evidence is current, superseded, corrected, or explicitly user-confirmed.

Evidence sources may include:
- sanctioned study-session completion tied to a staged task;
- explicit resource-unit completion such as a lesson/video/chapter/problem set;
- imported historical evidence with trusted provenance;
- explicit user confirmation of prior completed learning;
- a reviewed correction that supersedes an earlier interpretation.

Task title text, `work_mode`, resource type, resource role, elapsed timer minutes, or AI interpretation alone must not silently satisfy a stage.

## 7. Task completion versus stage satisfaction

Task lifecycle and pedagogical progression are separate concepts.

`task.status = completed` means the scheduled execution item was completed through a sanctioned execution path.

`stage.state = satisfied` means the required structured learning evidence for the target and stage has been accepted.

Therefore:
1. A completed task may leave its stage `in_progress` when required units remain incomplete.
2. Reaching or exceeding estimated minutes does not automatically satisfy the stage.
3. A short task may satisfy a stage when the required explicit unit evidence is complete.
4. Multiple completed tasks may contribute evidence toward the same stage.
5. A failed, abandoned, or partial task may still contribute valid partial evidence without satisfying the stage.
6. Stage satisfaction does not by itself mean mastery; mastery remains a separate evidence/model concern.

Example:

A 75-minute Learn task may finish after 75 actual minutes while one required instructional unit remains incomplete. The task may be `completed`, but the Learn stage remains `in_progress` and Practice must not be unlocked yet.

Conversely, if all required Learn units are explicitly completed in 62 minutes, the Learn stage may become `satisfied` without manufacturing another 13 minutes of work.

## 8. Deterministic transition rules

Stage transitions are target-scoped and evidence-driven.

### 8.1 Learn → Practice

`practice` becomes normally eligible only when `learn` is `satisfied` for the same learning target.

Exceptions require explicit trusted evidence that Learn was completed previously. Practice activity by itself is not sufficient proof.

If Learn is `not_started`, `in_progress`, `remediation_required`, or `unknown`, the planner must not silently advance the target to Practice.

### 8.2 Practice → Review

`review` becomes normally eligible after valid prior learning evidence and `practice = satisfied`.

A narrowly defined review may occur before Practice satisfaction only when it reviews already learned material without claiming to advance the target beyond Practice.

Such a review must not mark Practice satisfied and must not unlock Reinforcement.

### 8.3 Practice → Reinforcement

`reinforcement` becomes eligible only when `practice = satisfied`.

Reinforcement cannot repair a missing Learn prerequisite implicitly and cannot replace unfinished primary Practice.

### 8.4 Repetition

The same stage may be scheduled again when:
- required units remain incomplete;
- remediation is explicitly required;
- the stage definition contains multiple required units;
- previous evidence was partial;
- corrected evidence invalidates an earlier satisfaction decision.

Repeated work must preserve the same stage identity instead of being mislabeled as advancement.

## 9. Partial, skipped, unknown, and corrected evidence

### Partial

Partial valid evidence moves a stage from `not_started` to `in_progress` or keeps it `in_progress`.
Partial evidence never unlocks a later stage unless that later stage has an independently satisfied prerequisite.

### Skipped

A user may explicitly skip a recommended activity, but skipping does not fabricate stage satisfaction.

If a later stage requires the skipped prerequisite, the planner must expose the unmet prerequisite instead of silently continuing as if it were complete.

A user-confirmed prior-learning claim may satisfy the prerequisite only through the explicit prior-evidence path, not through the skip action itself.

### Unknown

When evidence is ambiguous, contradictory, or lacks trusted provenance, stage state becomes or remains `unknown`.

Unknown evidence does not authorize progression.
The planner may request clarification, preserve the current safe stage, or schedule a non-destructive diagnostic/review action, but it must not infer completion.

### Corrected

A correction supersedes the interpretation of earlier evidence without deleting historical audit records.

If corrected evidence removes prerequisite satisfaction, dependent future stages become ineligible for new scheduling until the prerequisite is restored.

Already completed historical tasks are not silently deleted or rewritten.

Any plan mutation caused by corrected evidence must follow normal planner safety and confirmed mutation rules where applicable.

## 10. Remediation behavior

`remediation_required` represents explicit evidence that an earlier stage must be revisited.

Examples include:
- a failed or insufficient diagnostic result;
- explicit user feedback that the concept was not understood;
- structured error evidence indicating the prerequisite learning path is incomplete;
- a reviewed correction invalidating prior stage satisfaction.

Remediation does not erase historical satisfaction evidence. It creates a new current requirement for the affected stage.

Planner behavior:
1. Schedule the required remediation stage before dependent new advancement.
2. Preserve unrelated valid stages and other subjects.
3. Do not silently remove Today tasks.
4. Do not treat remediation as automatic substitution for already planned work.
5. Record the reason the stage was reopened.

## 11. Stage eligibility summary

| Current evidence state | Learn | Practice | Review | Reinforcement |
| --- | --- | --- | --- | --- |
| No accepted evidence | eligible | blocked | blocked | blocked |
| Learn in progress | continue | blocked | blocked except narrow non-advancing review | blocked |
| Learn satisfied | optional repeat/remediation | eligible | limited if explicitly justified | blocked |
| Practice in progress | as needed | continue | limited non-advancing review | blocked |
| Practice satisfied | as needed | optional repeat | eligible | eligible |
| Remediation required for Learn | remediation eligible | blocked for new advancement | non-advancing only | blocked |
| Unknown prerequisite evidence | clarification / safe stage only | blocked | blocked for advancement | blocked |

## 12. Planner contract

Every schedulable staged task must expose structured learning-stage data.

Minimum planner-facing contract:
- learning target identifier;
- canonical learning stage;
- current stage state;
- prerequisite stage requirements;
- evidence summary / provenance reference;
- whether the stage is currently eligible;
- deterministic reason when blocked or reopened.

The planner must not derive canonical stage solely from task title, `work_mode`, resource type, or resource role.

If canonical stage data is absent:
1. preserve existing safe legacy behavior;
2. do not fabricate a learning stage;
3. do not activate stage-dependent duration policy;
4. surface the missing structured evidence for future resolution.

Stage eligibility is evaluated before duration selection and before final schedule placement.

Conceptually:

`evidence → stage state → eligibility → duration policy → feasibility / placement`

not:

`resource/work_mode → guessed stage → schedule`

## 13. Relationship to PLN-003 duration policy

PLN-004 supplies the pedagogical stage evidence that PLN-003 currently lacks in normal P48 production inputs.

The relationship is:
- `learn` may map to a PLN-003 learning-oriented block class only through an explicit deterministic mapping;
- `practice` may map to guided or primary-practice duration classes according to structured task/resource context;
- `review` may map to error-review or spaced-review classes according to explicit review intent;
- `reinforcement` may map to the reinforcement duration class.

Learning stage and block class remain separate fields.

A learning stage does not itself determine an exact duration. PLN-003 remains responsible for duration bounds and normalization.

No production activation is authorized merely because a mapping exists in specification or code.

## 14. Relationship to PLN-005 resource roles

Learning stage answers: what pedagogical step is the learner performing?

Resource role answers: why is this resource appropriate for that step?

Examples:
- `learn` + Instruction;
- `practice` + Primary Practice;
- `reinforcement` + Reinforcement;
- `review` + Revision.

These combinations are expected normal paths, not inference rules.

A resource role must not silently manufacture a learning stage, and a learning stage must not silently assign a resource role.

## 15. Safety invariants

`STG-001` Practice does not prove Learn.
`STG-002` Review does not replace required Learn.
`STG-003` Reinforcement does not replace required Learn or Practice.
`STG-004` Minutes alone cannot satisfy a stage.
`STG-005` Task completion and stage satisfaction remain separate.
`STG-006` Unknown evidence cannot unlock advancement.
`STG-007` Corrections preserve audit history.
`STG-008` Remediation reopens a requirement without rewriting historical evidence.
`STG-009` Stage interpretation cannot silently remove or displace Today work.
`STG-010` AI has no direct stage-satisfaction or plan-mutation authority.
`STG-011` Missing stage metadata must degrade safely to legacy behavior rather than guessed semantics.
`STG-012` Same authoritative evidence and policy version must produce the same stage decision.

## 16. Separation from material progress

Learning-stage state and material progress are independent but related concepts.

`Material progress` answers: what concrete resource content has the learner executed?

`Learning stage` answers: what pedagogical requirement is currently satisfied, incomplete, blocked, or reopened for a curriculum target?

The following concepts must remain distinct:

`Study Intent ≠ Task Status ≠ Material Progress ≠ Learning Stage ≠ Resource Role ≠ Duration Block Class`

Consequences:
1. Completing a video, page range, test, chapter, or other material unit records an execution fact; it does not automatically satisfy a learning stage.
2. A learning stage may be satisfied by one or more accepted material units only when the deterministic stage evidence contract declares those units sufficient for that target.
3. Material completion history must not be deleted or reset merely because a topic later requires review or remediation.
4. A learner may have completed material previously while the current learning state requires review or remediation.
5. Planned-credit accounting remains separate from both material progress and learning-stage satisfaction.

Example:

A learner may have `Video 5 = completed` and `Video 6 = completed` while the associated topic is later reopened as `remediation_required`. The videos remain historically completed; PLN-004 records the new pedagogical requirement without falsifying execution history.

## 17. Exact material evidence contract

PLN-004 consumes canonical material evidence supplied by MAT-001 without owning the material catalog itself.

Supported evidence may reference physical or digital executable units such as:
- page ranges;
- tests or question sets;
- chapters or readings;
- mock-exam units;
- individual YouTube videos;
- explicitly mapped segments or other future subject-independent material units.

For stage evaluation, material evidence must identify:
- the curriculum learning target;
- the material unit identity and authoritative source kind;
- the stage for which the evidence is relevant;
- progress state and completion evidence;
- provenance, including whether progress was observed directly, imported, user-confirmed, or corrected;
- deterministic topic mapping when the material unit is not intrinsically scoped to one topic.

Material evidence rules:
1. Physical units normally inherit curriculum scope from their canonical resource section unless an explicit validated override is required.
2. YouTube playlist membership alone does not prove topic scope; individual videos or validated video segments require explicit curriculum-topic mapping.
3. One topic may require multiple material units.
4. One material unit may contribute evidence to multiple topics only through explicit mappings; each topic evaluates satisfaction independently.
5. A completed unit with missing or ambiguous topic mapping is preserved as material history but does not silently satisfy a stage.
6. Estimated or actual minutes do not replace required unit evidence.
7. Material evidence is subject-agnostic. No stage rule may depend on a Mathematics-only, History-only, Geography-only, Turkish-only, Law-only, Economics-only, Finance-only, or other subject-specific planner branch.

## 18. Imported progress and forgotten material

A learner joining the system after prior study must be able to establish existing material progress without pretending that the work occurred inside the current planner.

Examples include:
- marking individual previously completed units;
- marking videos as previously watched;
- confirming a validated "completed up to here" boundary in an ordered resource;
- importing reviewed historical progress with provenance.

Imported material progress is historical execution evidence, not automatic proof of current retention or mastery.

If the learner explicitly reports that previously completed material has been forgotten or is no longer understood:
1. preserve the original material completion history;
2. preserve its provenance and timestamps where available;
3. reopen the appropriate learning requirement as review or remediation according to deterministic policy;
4. do not mark the completed units as never executed;
5. do not silently remove unrelated Today work;
6. expose the reason the topic was reopened.

AI may interpret natural-language statements such as prior completion, uncertainty, or forgetting and produce a structured recommendation. The deterministic system must validate the recommendation before any stage transition or plan mutation.

## 19. Exact-scope planning behavior

When canonical material data is available, staged planner output should identify the exact executable material scope rather than only a subject and minute total.

Examples of exact scope include:
- `Video 5 + Video 6`;
- `pages 42–53`;
- `Test 3–4`;
- a mixed task containing explicitly related instructional and reading units when policy permits.

Planner behavior:
1. Stage eligibility is resolved before selecting material units.
2. Resource-role eligibility is resolved separately under PLN-005.
3. The planner selects the next valid incomplete material units in canonical order unless an explicit justified rule overrides that order.
4. Exact material units become task scope through stable structured identifiers rather than title text alone.
5. Partial execution preserves completed units and returns only the remaining valid scope to future planning.
6. Today may show the exact units intended for the current execution block.
7. Week may show the exact material destination expected by the end of the planning period.
8. Missing canonical material data must degrade safely; the planner may retain legacy scope but must not fabricate page ranges, video mappings, stage satisfaction, or stage-dependent duration metadata.

Conceptually:

`topic state → eligible stage → valid resource role → remaining material units → duration policy → placement`

## 20. Acceptance scenarios

The implementation and tests must cover at least the following scenarios:

1. A fresh topic has no accepted evidence: Learn is eligible and Practice is blocked.
2. Required Learn units are completed with accepted evidence: Practice becomes eligible.
3. Practice units are completed without accepted Learn evidence: Practice history is preserved but Learn remains required.
4. Reinforcement evidence exists without required Learn or Practice evidence: prerequisites remain unsatisfied.
5. A Learn task ends after its estimated minutes while required material units remain: the task may complete, but Learn remains `in_progress`.
6. Required Learn units finish earlier than estimated: Learn may become satisfied without manufacturing additional minutes.
7. A physical page-range task is partially completed: completed scope remains complete and only the remaining valid scope is replanned.
8. A previously watched video is marked forgotten: video completion history remains intact while the topic becomes review/remediation eligible.
9. A user imports a validated "completed up to here" boundary: historical progress is recorded with provenance and stage evaluation occurs separately.
10. Ambiguous imported progress is retained but does not unlock a later stage.
11. A YouTube video without deterministic topic mapping does not satisfy a topic merely because its playlist is linked to that topic.
12. One video explicitly mapped to multiple topics contributes evidence only according to each topic mapping and does not globally satisfy all stages.
13. Corrected evidence can reopen an earlier requirement without deleting historical tasks or material progress.
14. AI recommends a stage interpretation but deterministic validation rejects it: no authoritative stage or plan mutation occurs.
15. Extra Study may create valid material or learning evidence while retaining zero planned credit and without displacing unrelated planned work.
16. Equivalent evidence in different KPSS subjects follows the same core stage engine without subject-specific planner branches.

## 21. Non-goals

PLN-004 does not:
- define the complete physical-resource or YouTube content-ingestion system; that belongs to MAT-001;
- define Instruction, Primary Practice, Reinforcement, or Revision resource roles; that belongs to PLN-005;
- choose exact block duration; that belongs to PLN-003;
- define mastery scoring, exam-score prediction, or long-term forgetting curves;
- authorize AI to mutate stage state or plans directly;
- activate new production-authoritative planner behavior merely because the model exists in code.

## 22. Implementation and rollout gates

Implementation must proceed under `SPEC → TEST → IMPLEMENT → VERIFY → RELEASE`.

Before production-authoritative activation:
1. stage state and transition rules must have deterministic domain tests;
2. task completion versus stage satisfaction must have regression coverage;
3. MAT-001 must provide canonical material-unit evidence for the production path being activated;
4. PLN-005 must provide any resource-role data required by that path;
5. PLN-003 stage-dependent duration mapping must consume explicit canonical metadata rather than inference from prose, `work_mode`, or resource type;
6. missing metadata must preserve safe legacy behavior;
7. planner simulation and mutation-safety regressions must pass;
8. no production migration, deployment, or stage-based planner activation occurs without its separate release approval.

## 23. Local verification evidence

Local verification completed on 2026-08-24.

- PLN-004 targeted domain tests: `22/22` passed across three test files.
- Full non-integration repository regression: `654/654` tests passed across `95/95` test files.
- `@kpss-coach/domain` TypeScript typecheck passed.
- `git diff --check` passed; Windows LF/CRLF notices are informational only.
- Integration/RLS suites were not rerun in this shell because the required local Supabase environment variables were unavailable.
- PLN-004 introduces no database migration, RLS change, production mutation path, or production-authoritative planner activation.

Production-authoritative activation remains gated on canonical MAT-001 material inputs, PLN-005 resource-role semantics, stage-aware planner integration, regression/simulation evidence, and a separately approved release.
