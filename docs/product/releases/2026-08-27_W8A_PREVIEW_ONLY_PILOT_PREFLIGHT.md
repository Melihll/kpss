# W8A Planner V2 Preview-Only Pilot Preflight

Status: `READY_FOR_PLANNER_V2_PREVIEW_ONLY_PILOT_RELEASE`
Date: 2026-08-27

## Boundary

W8A is engineering and read-only production preflight only. It does not deploy app-api or web, set or unset a production secret, apply a migration, create a production preview, confirm a proposal, invoke Apply, or mutate production data. Production remains on app-api v32 and Cloudflare Pages deployment `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae` from W7 source `395a536d18b79ea124bdac0d4498a021d9ce9bc0`; Telegram remains v34.

## Gate audit and split

The W7 runtime used one `PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS` allowlist for both preview and confirmation. Enabling it would therefore have granted more authority than a preview-only pilot permits, so it was not set.

The W8A candidate replaces that runtime control with two independent, exact-profile, default-OFF gates:

- `PLANNER_V2_PREVIEW_V1_PROFILE_IDS`: capability visibility and preview endpoint;
- `PLANNER_V2_CONFIRM_V1_PROFILE_IDS`: confirmation endpoint/UI only, effective only when preview is also enabled for the same profile.

Both parsers accept trimmed comma-separated UUIDs, deduplicate safely, and refuse the entire setting on malformed input or `*`. The Week page supports preview-only display and hides confirmation controls. No Apply route, gate, UI, wording, or client/service RPC call was added.

## Preview persistence boundary

One manually requested preview may create one short-lived `confirmed_action_proposals` row in `previewed` state, containing exact snapshot/proposal/planner/component fingerprints, preview and Apply-candidate payloads, expiry, and idempotency identity. This is inert lifecycle history, not application authority.

Preview may not change tasks, weekly-plan content, task-resource links, progress, study sessions, capacity, or canonical task rows. Local HTTP verification observed one allowed lifecycle-row delta and zero application-data mutation.

## Exact pilot profile audit

Profile `73f9b34c-da73-43d9-a05c-2026409cf290` is active, belongs to an existing production auth user, has consistent profile/resource/subject ownership, does not look like fixture/test data, and has no active study session or in-progress task. It has 57 tasks: 4 current-day, 15 future, and status totals 28 ready / 17 partially completed / 5 rescheduled / 7 completed. It has 2 plans, 27 active resources, 9 subjects, and 0 lifecycle proposals.

The fresh strictly read-only Planner V2 shadow observed 341 material views: 76 exact eligible YouTube views totaling 3,323 minutes and 265 unknown/blocked views (245 pace evidence unavailable, 20 mapping missing). Current capacity was 1,545 configured minutes, 557 already studied, 1,038 protected, 65 overcommitted, and 15 available. The safe proposal scheduled zero new items, left 76 eligible items unmet for insufficient contiguous capacity, scheduled no unknown/completed/duplicate material, protected the current day, and reported `applyAllowed=false`. Production counters were identical before and after; diagnostic persistence and mutation authority were both false.

## Verification

- gate/canonical/lifecycle/security focused: 211/211 PASS;
- planning/canonical/P48 targeted: 154/154 PASS;
- preview/confirm split focused: 32/32 PASS;
- local transactional integration: 130/130 PASS across 13 files;
- full non-integration: 909/909 PASS across 133 files;
- domain/repository typechecks, production web build, app-api bundles, bundle/read-only/preview safety checks: PASS;
- normal local app-api HTTP smoke: PASS;
- dedicated local preview-only HTTP matrix: PASS for no-gate, preview-only exact profile, other profile, preview+confirm test profile, malformed/wildcard fail-closed, wrong fingerprint/proposal, absent Apply route, and zero application-data mutation.

## Undeployed candidate identities

- app-api/shared TypeScript source set: 40 files, manifest SHA256 `be9cb9d3f0dcfca4aad90b4c79e6880010096466ee507c056fd63e6eced91c71`;
- production web artifact: 18 files, manifest SHA256 `a41a1be0b8a2fd99cb2e059243a501f50f92c424ff3f525c8d92c907141036d2`;
- exact Supabase deployed bundle identity: unavailable until a separately approved deployment; supported tooling does not expose a deterministic predeployment app-api bundle SHA;
- secondary rollback: app-api v32 and Pages deployment `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`.

These are preflight identities only. Neither candidate was uploaded or activated in W8A.

## Future release and activation — not executed

1. Under separate gate-off runtime approval, deploy the reviewed W8A app-api and web candidates with both new allowlists absent.
2. Verify app-api/web identity, both gates OFF for every profile, Apply route absent, canonical planner OFF, evidence shadow OFF, and production counts unchanged.
3. Under separate pilot activation approval, set only:

   `supabase secrets set PLANNER_V2_PREVIEW_V1_PROFILE_IDS=73f9b34c-da73-43d9-a05c-2026409cf290 --project-ref disnqptbhrdwqcjnfusm`

4. Keep `PLANNER_V2_CONFIRM_V1_PROFILE_IDS` absent. Verify preview ON only for the exact profile; confirmation and Apply remain OFF everywhere.
5. Have the pilot user manually request one preview. Inspect capacity reconciliation, scheduled/blocked/unmet demand, replacement scope, current-day protection, workload authority, and exact fingerprints.
6. Verify the database delta is limited to the expected preview lifecycle row: confirmed/applied/canonical-task/task/plan/resource-link/progress/session/capacity mutation deltas all remain zero.

## Rollback — not executed

Disable new previews with:

`supabase secrets unset PLANNER_V2_PREVIEW_V1_PROFILE_IDS --project-ref disnqptbhrdwqcjnfusm`

Confirmation remains absent and Apply remains unavailable. Existing preview rows remain inert history; no task or plan repair is needed. If runtime rollback is separately authorized, restore app-api v32 and Pages deployment `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`.
