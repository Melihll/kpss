# W3 Exact-Profile Physical Capture Pilot Activation

Status: W3_EXACT_PROFILE_PILOT_ENABLED — PLANNER_OFF
Observation: WAITING_FOR_NATURAL_SESSION
Date: 2026-08-25

## Scope and approval

Physical capture was enabled only for production exam profile `73f9b34c-da73-43d9-a05c-2026409cf290` through `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` at `2026-08-25T16:05:45.276Z`.

The release did not configure wildcard or any second profile, activate evidence-shadow consumption or the canonical planner, deploy Edge/web/Telegram code, apply a migration, backfill history, create artificial study activity, or mutate production data manually.

## Last-moment safety gate

- Repository `HEAD`, `origin/main`, and independent remote all matched `3d1fa8faff39b3c9161fc99e2afa31f307d2e9cf`; the tree was clean.
- Linked migrations were current with zero pending migrations.
- `app-api` was v30, active, and JWT-protected before activation.
- Capture and evidence-shadow secrets were absent; canonical runtime was OFF.
- W2 snapshots, protected breaks, and pace evidence were `0 / 0 / 0`.
- Workload shadow was `341` total, `76` exact, `0` calibrated, `0` fallback, `265` unknown, and `76` planner-eligible; physical pages were `0 / 5,103` calibrated/unknown and accepted samples were `0`.
- W3 web health was independently verified over mobile data after the local Wi-Fi/DNS path was shown to interfere with `pages.dev`; Cloudflare production identity remained deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` at commit `8354deff78b06f56411dc969a073c54f68829c69`.

## Activation and propagation

- The exact approved secret-set operation succeeded with one secret changed.
- The capture secret is present; evidence-shadow remains absent.
- Pure matcher verification against the current active production profiles returned ON only for the pilot, OFF for both other profiles, and wildcard false.
- Supabase secret propagation advanced all function configuration version counters while leaving their bundle hashes and deployment timestamps unchanged. `app-api` is v31, active, JWT-protected, and still uses bundle SHA256 `4747c9f5e9343587eec0da34beae149e3a289633ef1c9ca79d28a134827af573`; no code deployment occurred.
- Web and Telegram artifacts were unchanged; Telegram remains legacy.

## Immediate safety verification

- Activation created no W2 rows: snapshots `0`, protected breaks `0`, evidence `0`.
- Other-profile W2 rows remained `0`.
- Production counters remained `61` sessions, `248` tasks, `1` test result, `1` resource-progress row, `79` resource units, `76` mappings, and `0` non-null exact page boundaries.
- Evidence-shadow remained OFF, canonical runtime remained false, accepted samples remained `0`, and physical calibrated pages remained `0`.
- Preflight inventory remains `13` eligible exact physical paths, `2` ambiguous multi-unit paths, `26` no-unit paths, and `0` invalid paths. Only the first class can enter W2; all others remain legacy.

## Observation and rollback

No natural eligible W2 action occurred during the bounded observation window. No artificial session or evidence was created. The pilot remains enabled in state `PILOT_ENABLED_WAITING_FOR_NATURAL_SESSION`.

At the first natural eligible action, inspect lifecycle identity, protected pause state if used, finish boundary, evidence cardinality, cross-profile isolation, and planner isolation read-only. On any approved failure condition, unset `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` to block new W2 starts. An already-open protected session remains W2-owned and must not be cancelled, converted, or deleted.
