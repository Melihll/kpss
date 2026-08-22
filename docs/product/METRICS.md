# KPSS Koçu Product Metrics

Status: Definitions only; telemetry is not implemented by this document

Last updated: 2026-08-22

## Measurement principles

- Metrics support decisions; they do not override user intent or planner safety.
- Planned, extra, substituted, and carried-over work must not be silently combined.
- Product outcomes and guardrails must be reviewed together. A higher execution rate does not justify data loss, hidden task removal, or unsafe mutation.
- Numerators, denominators, exclusions, time zone, and metric version must be reproducible.
- Product reporting uses `Europe/Istanbul` calendar boundaries unless a report explicitly states otherwise.
- Unknown or ambiguous historical semantics remain unknown; they are not guessed into a favorable category.
- Until `PLN-002` finalizes study semantics, affected measures are provisional and should expose their component counts.

## North Star metric

### Weekly Plan Execution Rate

**Question:** How much of the candidate's approved weekly plan was actually executed?

**Initial definition:**

```text
Weekly Plan Execution Rate =
  completed minutes credited to approved planned tasks
  ÷ eligible approved planned minutes
```

Rules:

- Evaluate by candidate and plan week.
- Use the latest approved plan baseline and its auditable revisions; preserve both the original commitment and revised denominator for comparison.
- Cap credited completion for an individual planned task at its eligible planned minutes so extra time cannot inflate execution above the commitment.
- Do not credit extra study to a different planned task unless an explicit user-confirmed substitution links them.
- Exclude cancelled or invalidated work only when the exclusion has an explicit, auditable reason; report excluded minutes separately.
- Report the rate as a percentage and retain numerator and denominator.
- A zero-minute denominator produces `not applicable`, not 0% or 100%.

`PLN-002` must finalize how confirmed substitution and carryover affect the baseline and revised views before this becomes a release-grade metric.

## Supporting product metrics

| Metric | Initial definition | Why it matters | Desired direction |
| --- | --- | --- | --- |
| Planned minutes vs completed minutes | Eligible approved planned minutes and credited completed minutes, shown as separate totals and a difference. Extra study remains separate. | Reveals execution gap without hiding it inside total study time. | Gap narrows without unsafe plan reduction. |
| Study days per week | Count of Istanbul calendar days in a plan week with at least one qualifying completed study session. | Measures consistency. | Contextual; generally upward toward the intended routine. |
| Backlog rate | Minutes explicitly in backlog at week end ÷ eligible planned minutes for the week. | Shows work that lost a scheduled slot. | Down. |
| Carryover rate | Eligible unfinished planned minutes explicitly carried into a later plan period ÷ eligible planned minutes due in the source period. | Separates preserved unfinished intent from disappearance. | Down, while preserving truth. |
| Estimated vs actual duration | For eligible completed work, report `actual minutes - estimated minutes`, absolute error, and ratio, segmented by study stage/type. | Calibrates duration policy. | Absolute error down; systematic bias toward zero. |
| Session completion rate | Completed study sessions ÷ sessions started, excluding sessions cancelled under a documented non-study rule and reporting exclusions. | Measures execution flow reliability. | Up. |
| Subject-switch count per day | Count of transitions between different subjects in the chronological sequence of qualifying study blocks; repeats of the same subject do not add a switch. | Measures daily fragmentation and setup cost. | Down, subject to learning needs. |
| Extra-study minutes | Completed minutes explicitly classified as extra study and not credited to a planned task except through confirmed substitution. | Preserves the distinction between initiative and plan execution. | Contextual; never optimized by silent substitution. |
| Planner-generated moves | Count of planner-originated task date changes, with moved minutes and distance reported separately. | Measures plan churn. | Down unless a justified repair requires movement. |
| User-confirmed substitutions | Count and minutes of explicit substitutions, with source task and replacement work linked. Also report proposal-to-confirm rate. | Verifies that replacement reflects user intent. | Contextual; 100% explicit and traceable. |
| Quick Task preview/apply rate | Unique applied Quick Task proposals ÷ unique valid Quick Task previews; also report preview count, apply count, rejection, expiry, and stale count. | Shows whether previews are useful and safe. | Contextual; improve only with safety stable. |
| Coach preview/confirm/apply rate | Funnel counts and step conversion for valid Coach previews → explicit confirmations → successful idempotent applies. | Shows trust and friction at each approval boundary. | Contextual; no bypass of confirmation. |
| Resource/video progress | Completed eligible resource units or video minutes ÷ assigned eligible units or minutes, segmented by resource role and learning stage. | Connects plan execution to material progress. | Up, without rewarding premature reinforcement. |
| Failed RPC / Edge 5xx | Count and rate per eligible RPC or Edge request, segmented by operation and error family; expected domain rejections are reported separately. | Detects reliability failures and unsafe retry risk. | Toward zero. |
| Planner incidents/manual DB repairs | Count of planner-related incidents and manual database repairs, with severity, affected users, and cause. | Direct production-safety guardrail. | Zero. |
| 7-day retention | Activated candidates with qualifying study activity on day 7 after activation ÷ candidates activated seven days earlier. | Early evidence that the loop remains useful. | Up. |
| 30-day retention | Activated candidates with qualifying study activity on day 30 after activation ÷ candidates activated 30 days earlier. | Longer-term product value. | Up. |

## Definitions shared across metrics

- **Approved planned task:** a task present in an approved plan or auditable approved revision, not merely a generated candidate.
- **Eligible planned minutes:** planned minutes due in the measurement period after only explicit, auditable exclusions.
- **Credited completed minutes:** actual completed study time attributable to that planned task, capped as defined for the North Star.
- **Extra study:** qualifying study intentionally recorded outside the approved planned-task commitment.
- **Substitution:** an explicit user-confirmed relationship in which replacement work takes the place of named planned work.
- **Carryover:** unfinished planned work whose identity and history are preserved into a later date or plan period.
- **Planner-generated move:** a task date change proposed or applied by a planner path, excluding a direct user edit; proposal and application counts must remain distinct.
- **Activation:** first approved plan becoming available to the candidate. If this definition changes, retention cohorts must be versioned rather than silently recomputed.
- **Qualifying study activity:** a completed, non-duplicated study session that passes accounting and overlap protections.

## Required segmentation

Where sample size and privacy allow, report metrics by:

- plan week and candidate;
- subject;
- learning stage;
- resource role;
- planned, extra, substitution, and carryover classification;
- planner version and decision trigger;
- preview, confirmed, applied, rejected, expired, and stale states;
- web, Telegram, or other recording surface where operationally useful.

Single-user results for Esra must be treated as direct product evidence, not generalized as population retention or causal proof.

## M1 scorecard

M1 review should include at minimum:

- Weekly Plan Execution Rate and its raw components;
- estimated versus actual duration by stage/type;
- backlog and carryover rates;
- subject switches and short-fragment count;
- extra-study minutes and user-confirmed substitutions;
- planner moves, including distance and reason coverage;
- percentage of material planner decisions with a complete explanation;
- invariant violations;
- failed RPC / Edge 5xx;
- planner incidents and manual database repairs.

No target is set until `PLN-001` establishes a trustworthy baseline. P0 safety targets are exceptions: no silent task disappearance, no unauthorized/silent mutation, and zero planner-caused manual database repairs during the `PLN-010` seven-day rollout gate.

## Instrumentation requirements for future work

This document does not implement telemetry. Before instrumentation is accepted:

- define the event or query source for each field;
- specify deduplication and idempotency behavior;
- preserve user scope and minimize sensitive data;
- version semantic changes;
- verify time-zone boundaries;
- test failure, retry, stale proposal, and partial-record cases;
- document dashboards or reports that consume the metric;
- validate a sample against source records before using it for a release decision.
