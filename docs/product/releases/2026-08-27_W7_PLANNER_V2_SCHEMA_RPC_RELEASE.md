# W7 Planner V2 Schema/RPC Capability Release

Status: W7_SCHEMA_RPC_DEPLOYED — PLANNER_V2_RUNTIME_OFF
Date: 2026-08-27

## Purpose

Deploy only the reviewed additive Planner V2 proposal-lifecycle schema, canonical task metadata protections, and service-only transaction capability. This release does not activate proposal preview, confirmation, Apply, canonical planning, or evidence consumption.

## Reviewed identity and scope

- Repository source: `a4833593f94ede42f7b7399bec9ebb939e2efa74`.
- Migration: `20260826120000_planner_v2_proposal_lifecycle_candidate.sql`.
- Migration SHA256: `a52d9ccc1f7b135ce7a93bb9c546e866c57beffeabb8d34bc0803e08558691a5`.
- Supabase project: `disnqptbhrdwqcjnfusm`.
- Authorized operation: linked application of that one migration only.

The release excluded app-api, web, and Telegram deployment; secrets; runtime gates; proposal generation or confirmation; Apply invocation; task/plan mutation; backfill; and every other migration.

## Release result

- The final identity gate matched the approved source and migration hash with a clean synchronized branch.
- The linked dry-run listed exactly the approved migration.
- `supabase db push --linked` applied exactly `20260826120000_planner_v2_proposal_lifecycle_candidate.sql` successfully; no repair or retry was needed.
- Linked history records `20260826120000` on both local and remote sides. The post-release dry-run reports the remote database up to date, and linked PostgreSQL lint reports no schema errors.

## Schema and security postflight

- All expected task canonical identity/material/boundary/planner fields and strengthened constraints are present.
- All expected proposal fingerprint, snapshot, planner, component, confirmation, result, and idempotency contracts are present.
- Canonical task and proposal identity unique indexes are present.
- `tasks_guard_planner_v2_metadata` and `guard_planner_v2_task_metadata()` are installed and active.
- `apply_planner_v2_proposal_candidate()` is `SECURITY DEFINER`, uses an empty `search_path`, requires explicit actor user/profile bindings, and is executable only by `service_role`.
- Apply EXECUTE authority is denied to `public`, `anon`, and `authenticated`; untrusted Apply grants are zero. The service-role PostgREST schema exposes the trusted path, while the database privilege matrix prevents a usable authenticated-client Apply path.
- Direct proposal-table access is unchanged: `authenticated` retains SELECT only and `service_role` retains full access.
- The canonical metadata trigger blocks direct untrusted canonical mutation without testing against production rows; legacy task ownership/RLS behavior remains intact.

Expected objects present: all. Missing: `0`. Conflicting: `0`.

## Zero-data and runtime postflight

Production values remained:

- tasks: `248` total / `241` active;
- weekly plans: `9` total / `9` active;
- task-resource-unit links: `79`;
- legacy V2 snapshots/proposals: `6 / 6`;
- confirmed-action proposals: `0`;
- Planner V2 confirmed/applied/result rows: `0 / 0 / 0`;
- canonical Planner V2 tasks and non-null canonical identities: `0 / 0`;
- W2 snapshots/breaks/evidence: `0 / 0 / 0`.

The migration created no lifecycle row, canonical task, confirmation, Apply result, plan generation, historical backfill, or application-data mutation.

Runtime remained isolated:

- canonical planner: OFF;
- W6 lifecycle: OFF;
- evidence-shadow: OFF;
- physical capture pilot: unchanged, with the same exact allowlist digest;
- app-api: v31 ACTIVE, unchanged;
- Telegram webhook: v34 ACTIVE, unchanged;
- web: unchanged; no deployment was performed.

## Next gate

The next release gate is a separately approved Gate-OFF app-api/web runtime deployment for preview and confirmation. It must leave the profile gate OFF and expose no production Apply authority. Any future trusted Apply route must verify the human JWT, derive actor user and active exam-profile identity server-side, and pass those exact bindings to the service-only RPC under a separate approval.

## Approval

Explicit production approval was limited to the reviewed W7 migration and its additive schema/RPC capability. All runtime activation and application mutation remain unapproved.
