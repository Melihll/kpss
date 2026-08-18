# AI Coach Foundation V1

AI Coach V1 is a provider-independent interpretation boundary. It does not call
an AI provider yet and has no database, Edge Function, scheduler, or production
integration.

```text
USER MESSAGE
    ↓
AI Gateway (provider output is unknown/untrusted)
    ↓
Structured Interpretation
    ↓
Strict Validator and Normalizer
    ↓
Evidence / Planning-Trigger Candidate
    ↓
Deterministic Learner-State or Planning Rules
    ↓
Planning Engine V2
    ↓
Proposal and Validation
```

## Trust boundary

AI is responsible only for interpretation: intent classification, explicit
subject/topic hints, study feedback, fatigue/difficulty signals, capacity-change
requests, missed-study reasons, and future human-readable coaching.

Provider output enters the domain as `unknown`. The validator rejects unknown
intents and fields, malformed dates, invalid confidence, unsafe minute values,
and ambiguous capacity amounts. A request that lacks required detail becomes
`NEEDS_CLARIFICATION`; it cannot produce a planning trigger candidate.

Validated capacity evidence may map to `CAPACITY_INCREASE` or
`CAPACITY_DECREASE` when the user supplied an explicit direction, but
this is only a candidate for deterministic review. Absolute `targetMinutes`
remain evidence until deterministic rules compare them with current capacity. It
does not change capacity or invoke Planning Engine V2 by itself. Difficulty,
fatigue, mastery feedback, and general coaching default to evidence-only or
`NO_REPLAN`.

## AI must never directly mutate the plan

AI must not calculate capacity, remaining minutes, feasibility, priority,
prerequisite legality, or task dates. It must not create, move, cancel, or apply
tasks; write learner state; update `tasks` or `weekly_plans`; call replanning or
apply RPCs; or claim a plan change was applied.

Planning Engine V2 remains the decision authority. Its deterministic snapshot,
feasibility, repair, proposal, and validation pipeline is the only future route
from accepted evidence toward a plan change.

## Future provider adapter

A future adapter implements `AiGatewayV1.interpretStudyMessage()` and returns
raw provider output. Provider SDK types, credentials, retries, and transport stay
outside the domain. Every adapter must use the same validator before mapping any
evidence. No adapter may call planning or persistence directly.
