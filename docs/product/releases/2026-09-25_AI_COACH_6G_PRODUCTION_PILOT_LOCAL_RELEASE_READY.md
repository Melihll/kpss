# AI Coach 6G Exact-Profile Production Pilot ? Local Release Ready

Date: 2026-09-25

## Scope-guard update ? AI_COACH_6G_PROACTIVE_PRODUCTION_SCOPE_GUARD_ACCEPTED_2026_09_25

Accepted checkpoint:

`5641d925cd53d1800b4ad8e5e5202032d290ef4a`

The production release package now explicitly hard-disables every Proactive Coach POST surface before its read/action handlers when `app-api` runs in production.

Local DEV proactive behavior remains unchanged. The exact-profile Reactive Coach production path remains unchanged.

Updated acceptance:

- proactive focused: `27/27` PASS;
- 6G production/reactive focused: `110/110` PASS;
- full non-integration: `181/181` files, `1387/1387` tests PASS;
- app-api bundle: PASS;
- AI economics safety: PASS;
- AI Coach safety: PASS;
- workspace typecheck: PASS.

Read-only production preflight evidence:

- active app-api rollback target: `v47`;
- unauthenticated app-api probe: HTTP `401`;
- `OPENAI_API_KEY`: present;
- Reactive Coach production-pilot keys: all absent/OFF;
- Planner Preview: present;
- Planner Confirm: OFF;
- Planner Apply: OFF;
- canonical Planner: OFF;
- evidence-shadow: OFF.

Pending linked migrations:

1. `20260911150000_ai_usage_ledger_v1.sql`
2. `20260911170000_ai_provider_runtime_reservations_v1.sql`
3. `20260919120000_ai_coach_proactive_state_v1.sql`

The third migration is a separate Proactive Coach persistence release and is not included in this exact-profile Reactive Coach production pilot.

The reviewed production DB prerequisite for this pilot is therefore only the AI economics dependency pair `20260911150000 ? 20260911170000`.

Those two production migrations still require separate explicit approval before execution.

An ordinary migration push must not be used if it would also apply the proactive migration. The next release step is to verify an isolated execution procedure for only the two AI economics migrations, without executing it.

No production migration, deployment, secret mutation, provider call, Planner Confirm, or Planner Apply occurred during this checkpoint.


## Status

`LOCAL_RELEASE_READY / PRODUCTION_NOT_YET_EXECUTED`

Implementation checkpoint:

`6f99016ef293fe82ff29bfef377afeb8addf10d9`

Evre 6G / AIC-007 remains `IN_PROGRESS`.

## Accepted local evidence

- Exact-profile production activation contract: GREEN.
- Static-bound production orchestrator path: GREEN.
- Generation-only production OpenAI gateway: GREEN.
- Dedicated production runtime preparation: GREEN.
- app-api server-owned production binding: GREEN.
- Focused release acceptance: `110/110` PASS.
- Full non-integration acceptance: `181/181` files, `1386/1386` tests PASS.
- app-api local bundle/import check: PASS.
- AI economics safety: PASS.
- AI Coach safety: PASS.
- Workspace typecheck: PASS.
- Production provider calls during local acceptance: `0`.
- Production deployments: `0`.
- Production secret changes: `0`.
- Production SQL/migrations: `0`.

## Production authority model

Production execution requires:

- server deployment environment = production;
- dedicated pilot enabled gate;
- explicit pilot approval gate;
- static-bound-ready gate;
- exact server-owned user allowlist;
- exact server-owned profile allowlist;
- production activation authority;
- generation authority = `openai_production_gateway`.

Production exposes no input-token count transport.

The production gateway uses only the fixed Responses generation path.

OFF, malformed, unapproved, or ownership-mismatched execution fails closed before provider work.

## Cost and accounting

The hard monthly per-user governor remains authoritative.

Production reserves against the conservative static complete-request input upper bound before generation.

Reported actual usage may be below that upper bound but may not exceed it.

Unknown provider outcome remains reconciliation-required and fail-closed.

## Planner isolation

Planner Confirm: OFF.

Planner Apply: OFF.

AI chat does not constitute canonical confirmation.

AI Coach has no task/material/workload/capacity mutation or Planner Apply authority.

## Approval boundary

Melih explicitly approved the exact-profile AI Coach production acceptance scope, including the required app-api deployment/provider activation steps with exact user/profile allowlisting while Planner Confirm and Apply remain OFF.

Production database migration is not implicitly included.

If preflight discovers a required pending migration, stop for separate explicit migration approval.

## Rollback / disable

Primary immediate disable:

- switch the dedicated production pilot gate OFF; or
- remove the exact production pilot allowlist.

Before deployment, record the currently active app-api version/source as the executable rollback target.

## Stop conditions

Disable immediately for:

- cross-user/profile access or evidence;
- provider execution outside the exact allowlist;
- any task/material/workload/capacity mutation;
- Planner Confirm or Apply authority;
- production input-token count endpoint traffic;
- governor/reservation bypass;
- actual usage above reserved static bounds;
- unexplained ledger/settlement/reconciliation mismatch;
- false mutation or Apply-success claims;
- unexpected retry/fallback provider traffic;
- loss of JWT enforcement;
- any P0 AI Coach or Planner invariant violation.

## Next exact step

Run read-only production preflight.

Verify:

- repository and remote identities;
- current app-api version and JWT enforcement;
- linked migration state;
- accounting/governor schema availability;
- required production secret/gate presence without printing values;
- exact allowlist readiness;
- Planner Confirm/Apply OFF state;
- current executable rollback target.

If no migration or other new authority is required, proceed only with the already approved exact-profile app-api/provider activation rollout and collect real smoke, ledger, isolation, and rollback evidence.
