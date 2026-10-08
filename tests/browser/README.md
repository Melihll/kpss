# LOCAL session action pointer regression

These tests exercise the actual AppShell/StudyTodayPanel, product styles and
session handlers. They use the documented CUA browser API for native pointer
input. They do not use programmatic `element.click()`. The jsdom component tests
cover contracts/state separately and are not physical hit-testing evidence.

## Preconditions

- Existing LOCAL Supabase on `127.0.0.1:54321`, dedicated acceptance account/profile.
- Reusable questions task `19c01150-747c-4ddd-a08a-0c19d60934b9` and no active session.
- An ignored evidence directory, e.g. `.release/mobile-session-action-fix-20261008/`.
- `local-read-models.json` in that directory with supported authenticated GET
  snapshots under `readModels.weekly`, `.summary` and `.roadmap` (no credentials).
- Ports 5175 and 54326 available. No production configuration changes.

Run `node tests/browser/session-action-runtime.mjs <ignored-evidence-directory>`.
It sets process-only LOCAL client inputs. It injects the test-only event recorder
through a Vite plugin; none of this instrumentation ships in the product build.
Its proxy records method/path/status and selected session response fields, never
authorization headers, Auth bodies or secrets. Unrelated writes are refused.
Live mode permits at most one start for the dedicated LOCAL user/task.

## Browser workflow

Open `http://127.0.0.1:5175/` through CUA and use the existing dedicated LOCAL
authentication. Import `session-actions.cua.mjs` in CUA and pass the bound tab,
viewport capability and absolute evidence directory (with trailing slash).
Call `responsiveCase(tab, viewport, root, width, focus)` for each combination of
`[320,360,375,390,414,768,1280]` and `[false,true]`. Save returned rows to
`responsive-matrix.json`, then run `verify-session-actions.mjs <directory>`.

Fixture mode uses actual UI components and synthetic session responses; it
creates **zero persisted sessions**. Captured LOCAL read models keep the layout
regression independent of Edge worker restarts. Every action requires unique
exact accessible names, visible/enabled controls, actual viewport dimensions,
zero rectangle overlap, unclipped bounds, no horizontal overflow and both
centers resolving to their own buttons. Actual trusted receiver events and
POST endpoint/response assertions are then checked from the proxy journal.

For RED, capture `old-today-390.json` and `old-focus-390.json` using `geometry()`
on the old layout. Save the corresponding snapshots/screenshots. In fixture
mode only, click the intended Pause center using CUA native input; save each
trusted Finish receiver/request as `old-<page>-390-click.json`. The verifier
requires the same geometry assertion to fail on old evidence and pass on new.
Never reproduce accidental Finish against production or a real new session.

For the separate live acceptance, set `control.json` transport to `live`, click
Start once, and use `pointerAction()` for pause/resume/finish. Observe the UI
after each input. Verify `assertRequest()` in a subsequent CUA call so the
external journal has settled. Do not retry a completed click when an assertion
fails: first inspect actual UI/request/session state. `mode:"slow"` delays the
next pause by 12000ms; switching control to `mode:"rapid-rerender"` with a unique
`burst` and `iterations:30` triggers execution refreshes during that delay.
Record both disabled controls, attempt native input, and assert no extra POST.
Test keyboard activation separately. Save supported read-only before, paused
and final snapshots, running/paused normal reload evidence, and console logs.
Run `verify-local-session.mjs <directory>` for same-session continuity, exactly
one start/final finish, request/receiver mappings, pending rerenders, accounting
and old-row preservation. No direct DB state manipulation is used.

Teardown: close only the created test tab, reset the temporary viewport, stop
the test server. Keep the ignored evidence. No production requests/deploy/push.
