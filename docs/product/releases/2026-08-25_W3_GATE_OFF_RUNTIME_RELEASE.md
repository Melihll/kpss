# W3 Gate-Off Runtime Release

Status: W3_RUNTIME_DEPLOYED — CAPTURE_GATE_OFF — PLANNER_OFF
Date: 2026-08-25

## Purpose

Deploy the verified W3 physical capture runtime to the production `app-api` while leaving capture, evidence-shadow consumption, the canonical planner, Telegram integration, and the pilot inactive.

## Reviewed source and release scope

- Repository commit: `8354deff78b06f56411dc969a073c54f68829c69`.
- Supabase project: `disnqptbhrdwqcjnfusm`.
- Authorized deployment: `app-api` only.
- Existing production web: Cloudflare Pages deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` at the reviewed commit.
- Risk classification: Edge production, capability gate OFF.

Explicit exclusions were web deployment, Telegram deployment, migration apply, production data mutation, W2 RPC invocation for testing, secret or configuration changes, historical evidence backfill, canonical planner activation, and pilot activation.

## Pre-deploy gates

- Local `HEAD`, local `origin/main`, and independent remote `main` all matched the reviewed commit.
- The working tree was clean and the linked migration dry-run reported zero pending migrations.
- `app-api` was active at v29 with `verify_jwt = true`.
- `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` and `PHYSICAL_PACE_EVIDENCE_SHADOW_V1` were absent; canonical runtime was OFF.
- W2 snapshots, protected breaks, and evidence were `0 / 0 / 0`.
- Safety counters were `61` sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` resource units, `76` mappings, and `0` non-null exact partial-page boundaries.

## Deployment result

- `app-api` deployment: SUCCESS.
- Production version: v30, advanced from v29.
- Updated at: `2026-08-25T14:31:10.230Z`.
- Bundle SHA256: `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`.
- Status: `ACTIVE`; `verify_jwt = true`.
- All other Edge Function versions, timestamps, and bundle hashes were unchanged.
- Unauthenticated active-session smoke: HTTP `401`.
- Rollback: not performed; preserved v29 remains the rollback source if a later gate-off regression is found.

## Production postflight

- Both physical-pace secrets remained absent and canonical runtime remained OFF.
- W2 snapshots, protected breaks, and evidence remained `0 / 0 / 0`; accepted historical samples remained `0`.
- Safety counters were unchanged through the release window.
- Workload shadow remained `341` total, `76` exact, `0` calibrated, `0` fallback, `265` unknown, and `76` planner-eligible.
- Physical workload remained `0` calibrated pages and `5,103` unknown pages; exact YouTube remaining workload was `3,323` minutes.
- The production and immutable W3 Pages URLs returned HTTP `200`, identical HTML SHA256 `68eb853309ed7a1fe95419ae392af1bda4229afa626d23b120ba5315a073f11d`, and HTTP `200` for both referenced assets. No web deployment was performed.
- No natural legacy study action occurred during the observation window (`study_sessions` remained `61`), so legacy parity is `NOT_OBSERVED`; no artificial production study data was created.

## Rollback and next gate

Gate-off rollback, if later required, is the preserved v29 `app-api` source. No database rollback is needed and web rollback is not indicated.

The next gate is a separately approved exact-profile pilot capture activation. It must keep evidence-shadow consumption and canonical planning OFF, keep Telegram legacy, and observe the first protected lifecycle. This release does not enable that pilot.

## Approval

Release owner and approver: Melih — explicit production approval granted on 2026-08-25 for the reviewed `app-api` deployment only.
