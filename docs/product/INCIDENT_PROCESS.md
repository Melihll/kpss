# KPSS Koçu Incident Process

Status: Active policy

Last updated: 2026-08-22

## Purpose

An incident is an event that threatens plan correctness, study accounting, user intent, data integrity, privacy, availability, or trust. The immediate goal is safe containment and evidence preservation, not rapid feature work.

## Severity

| Severity | Definition | Examples |
| --- | --- | --- |
| `P0` | Active or credible risk of data loss, incorrect plan/accounting, unauthorized mutation/access, or violation of a mandatory safety guarantee. | Silent task disappearance; extra study removes planned work; cross-user mutation; overlapping study counted twice; stale proposal applied; planner-caused manual DB repair required. |
| `P1` | Core product behavior is materially wrong or unavailable, but there is no current evidence of P0 data/safety impact. | Planner repeatedly creates poor fragments; explanations are missing for many moves; core study flow is unavailable with state preserved. |
| `P2` | Meaningful degradation with a safe workaround and limited impact. | Non-critical metric/report failure; isolated resource-progress display problem. |

When uncertain between levels, start with the higher severity until evidence narrows the impact.

## Roles

Every active incident should name, even if one person holds multiple roles:

- **Incident lead:** owns severity, coordination, and stop/restore decisions.
- **Investigator:** reconstructs the technical and product timeline.
- **Recorder:** maintains timestamps, evidence, decisions, and actions.
- **Release owner:** disables, rolls back, or restores through approved paths.
- **User communicator:** owns concise, factual user updates when needed.

## Response flow

### 1. Declare and preserve

- Assign an incident ID, severity, start time, affected user/scope, and initial symptom.
- Preserve relevant logs, revisions, proposal identifiers, task/session identifiers, versions, and timestamps.
- Keep observed facts separate from hypotheses.
- Do not rewrite history or create synthetic activity to reproduce the issue in Esra's account.

### 2. Contain

- Stop or disable the smallest unsafe mutation path.
- Keep deterministic/read-only or last-known-safe behavior available when possible.
- Pause related releases and automatic triggers if they could widen impact.
- Protect Esra's current plan and data from exploratory changes.

### 3. Assess impact

Determine:

- affected users and time window;
- plans, tasks, revisions, sessions, resources, and accounting entries involved;
- whether Today work or user-confirmed intent changed;
- whether extra study, substitution, or carryover semantics were violated;
- whether data crossed user boundaries;
- whether retry, concurrency, stale state, or partial application contributed;
- whether any manual database repair has already occurred.

### 4. Diagnose

Build a timeline from source evidence:

```text
User/system action
→ input snapshot/version
→ proposal or direct action
→ preview/confirmation state
→ apply attempt
→ committed records
→ user-visible result
```

Prefer reproducible tests or read-only queries. An unexplained gap remains a gap until evidence resolves it.

### 5. Decide recovery

Recovery must have:

- exact affected records and expected state;
- reason the action is safe and user-intent preserving;
- reviewed commands or migration, if a data change is unavoidable;
- backup/recovery strategy;
- before/after verification queries;
- authorization and named executor;
- an audit record and user communication plan where relevant.

Ad hoc production edits are prohibited. Manual database repair is a last resort and must be counted in [METRICS.md](METRICS.md).

### 6. Verify and monitor

- Verify containment and recovery with read-only evidence.
- Confirm no unrelated user or plan changed.
- Exercise the failed path safely where possible.
- Monitor through a defined window for recurrence.
- Reopen or re-escalate if the invariant remains unproven.

### 7. Close and learn

An incident closes only when:

- unsafe behavior is contained;
- affected state is understood and, if authorized, recovered;
- verification evidence is recorded;
- root cause and contributing conditions are documented;
- regression coverage and observability gaps have owners;
- related backlog and architecture/release documents are updated;
- user communication is complete where applicable.

## Mandatory P0 checks

For any planner or study-accounting incident, explicitly check all of the following:

1. Extra study did not silently substitute for planned work.
2. No task disappeared without an explicit audited transition.
3. Today tasks remained protected.
4. The mutation used an approved proposal/confirm/apply or sanctioned direct path.
5. Proposal ownership, generation/version, fingerprint, and freshness were valid where applicable.
6. Study time did not overlap or account twice.
7. Retry was idempotent.
8. Transactional changes either fully committed or fully rolled back.
9. User scope and RLS/ownership boundaries held.
10. The explanation matches the actual committed change.

## Incident record template

```markdown
# INC-YYYY-NNN — Short title

- Severity:
- Status:
- Started:
- Detected:
- Contained:
- Resolved:
- Incident lead:
- Affected scope:
- Related release/commit:

## Symptom

## User impact

## Timeline

## Evidence

## Root cause

## Containment

## Recovery and verification

## Invariant review

## Follow-up items

## User communication
```

Incident records should avoid secrets and unnecessary personal data. Link to protected evidence rather than copying sensitive production content into the repository.

## Relationship to product work

- A P0 incident interrupts normal sprint order until safely contained.
- A new systemic problem receives a backlog item with severity-informed priority.
- A changed safety boundary updates [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).
- A missed release gate updates [RELEASE_PROCESS.md](RELEASE_PROCESS.md).
- Incident counts and every manual DB repair feed the product safety metrics.
