# W7 Planner V2 Gate-Off Runtime Release

Status: W7_GATE_OFF_RUNTIME_DEPLOYED
Date: 2026-08-27

## Scope and approved source

- Repository source: `395a536d18b79ea124bdac0d4498a021d9ce9bc0`.
- Supabase project: `disnqptbhrdwqcjnfusm`.
- Cloudflare account: `fafe53fd4c6a785b05f3795e68b0a042`.
- Authorized runtime scope: gate-off app-api and web only.
- Excluded: secrets, lifecycle/canonical/evidence activation, physical-capture changes, migrations, Telegram, production preview/confirmation/Apply, and task/plan/progress mutation.

The previously released W7 schema/RPC capability remains deployed. Linked migration history is synchronized and the postflight dry-run reports zero pending migrations.

## App-api result

- Result: `APP_API_GATE_OFF_RELEASE_GREEN`.
- New runtime: app-api v32 ACTIVE, updated `2026-08-27T12:29:12Z` from the approved source.
- Reviewed source-closure SHA256: `ed963a421a7feefb8e5da10985eee9d9dec293349c3c819a2683ca2f60d7aaef`.
- Exact deployed bundle SHA: not exposed by supported Supabase CLI tooling.
- Rollback: app-api v31 with bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`.
- Health: authenticated routes retain JWT enforcement; unauthenticated capability and established app routes return 401. No `/planner-v2/apply` route or database Apply invocation exists in app-api.

## Web result

- Result: `WEB_GATE_OFF_RELEASE_GREEN`.
- Candidate manifest: 18 files, SHA256 `f447f1b1a4c32fa8cda6dbb8ab5c5628f1a7f90bbb14401289b9ac377a7ef114`.
- Deployment: `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`.
- Immutable URL: `https://f7c4dd8e.kpss-coach.pages.dev`.
- Production alias: `https://kpss-coach.pages.dev`.
- Branch/source: `main` / `395a536d18b79ea124bdac0d4498a021d9ce9bc0`.
- Completion timestamp: `2026-08-27T12:52:27Z` from the Wrangler deployment log.
- Artifact verification: all 18 files matched the approved local artifact on both immutable and production URLs.
- Rollback: deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9`, source `8354deff78b06f56411dc969a073c54f68829c69`.

Public root, Week, and Roadmap routes returned HTTP 200; the normal login shell rendered successfully. The production client contains no service-role credential and no `/planner-v2/apply` request. With lifecycle capability OFF, the Planner V2 panel is null/hidden. Only the designed capability probe runs automatically; preview and confirmation require explicit user actions and remain unavailable.

## Authority and zero-mutation postflight

- Authenticated browser → direct database Apply remains denied by the deployed W7 privilege boundary.
- Web → no Apply request or UI.
- app-api → no Apply HTTP route.
- Preview and confirmation → cannot Apply.
- The service-role Apply RPC capability exists but was not invoked.

Production after release:

- tasks: `248` total / `241` non-cancelled;
- weekly plans: `9` total / `9` active;
- task-resource-unit links: `79`;
- legacy V2 snapshots/proposals: `6 / 6`;
- Planner V2 lifecycle proposals: `0` in every state;
- confirmed/applied Planner V2 lifecycle rows: `0 / 0`;
- canonical Planner V2 tasks: `0`;
- W2 snapshots/breaks/evidence: `0 / 0 / 0`;
- pending migrations: `0`.

Release-caused Planner V2 application-data mutations: `0`. No production preview, confirmation, Apply result, canonical task, or plan mutation was created.

## Runtime gates and unchanged services

- Planner V2 proposal lifecycle: OFF; `PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS` absent.
- Canonical planner: OFF.
- Physical pace evidence shadow: OFF; secret absent.
- Exact physical capture pilot: unchanged; allowlist digest unchanged.
- Telegram webhook: v34 ACTIVE, unchanged.
- Production secrets: unchanged.

## Next gate

The next gate is a separately approved exact-profile **PREVIEW-ONLY** production pilot. Confirmation and Apply remain outside this release and require their own explicit controls and approval.
