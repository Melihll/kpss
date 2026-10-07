# Concept B production deployment and rollback — 2026-10-07

Status: **ROLLED BACK — PRODUCTION ACCEPTANCE FAILED**

The exact Concept B RC was pushed and deployed within the approved app-api/web scope. Selecting another resource video caused an uncaught React DOM `removeChild` error and a blank product root. The production web was returned to the explicitly approved live baseline. app-api v79 remains ACTIVE after renewed compatibility and ownership checks against the restored web. No product source was changed and no replacement RC was created.

## Release candidate

- Source commit: `caf69b4e7a931b8233a63e863205dfbc93419a20`.
- Branch: `develop`; parent `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd`.
- `origin/develop`: exact RC, verified again after rollback.
- `origin/main`: `cbc209fdf34f217b6d1419612199ee8c8370fe4b`, unchanged.
- Product source remained frozen. This record is an uncommitted documentation-only addition; no closure commit or additional push was performed.
- Prior exact-RC validation: 1,535 tests / 204 files, typecheck, scoped lint, production build, security and applicable safety checks PASS. That local evidence did not prevent the production video-selection failure.

## Preflight and accepted baseline drift

The live Cloudflare Pages API showed deployment `b187f696-2bd8-4fc6-b4d8-1e505f2421a9`, source `cbc209fdf34f217b6d1419612199ee8c8370fe4b`, created by `github:push` on 2026-09-10 at `20:51:41.893404Z`. This differed from the documented August baseline. Rollout stopped at that discovery.

The user explicitly accepted this live deployment as the **primary production web baseline and primary rollback target**, retaining `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae` / source `395a536d18b79ea124bdac0d4498a021d9ce9bc0` as the **secondary fallback**. This record documents that previously undocumented drift; it does not rewrite the August release history.

app-api was independently reverified: live configuration v78 / code v75, source `735de8d96edcef78816a0843e72669c7d16a034b`, ACTIVE, `verify_jwt=true`. No additional risky drift was found. The downloaded live runtime matched that source across 57/57 executable AST comparisons, and the complete rollback source closure compiled locally. Both Pages targets were available. No SQL or migration was used for these checks.

Release approver: the user, Melih. Execution, investigation, evidence recording and rollback: Codex under the explicit release and rollback instructions. Only the existing, explicitly designated pilot profile `73f9b34c-da73-43d9-a05c-2026409cf290` was used for controlled study acceptance.

## app-api deployment

- Deployed: ONLY `app-api`, before web.
- Previous state: code v75 / configuration v78.
- New state: v79 ACTIVE.
- Bundle SHA256: `c803d34e9487e315fcc78f31f11d8a1e908bc05cac0a1d5ed35416c2cf10015f`.
- Configuration: preserved; `verify_jwt=true`.
- Planner capability on the approved pilot: Preview ON; Confirm OFF; Apply OFF; `productionMutationAuthority=false`.
- Reactive Coach existing exact-user/profile production pilot and cost configuration: preserved. Proactive Coach was neither deployed nor enabled.
- All existing secret name/value digests match the preflight snapshot. Supabase automatically refreshed built-in `SUPABASE_*` metadata timestamps during deploy; values did not change. No secret set/unset action occurred.
- The other five Edge functions' deployment metadata remained identical.
- Old-web compatibility before web deploy: authenticated next task, current weekly plan and active-session reads succeeded; unauthenticated access returned 401; foreign-owned profiles were invisible. The legacy task action preview without `targetDate` returned 200, `previewOnly=true`, with an empty mutations list; no Apply occurred.
- Renewed post-rollback compatibility: task/plan reads 200, authenticated ownership verified, unauthenticated access 401, foreign-owned profiles visible `0`, active session `null`, unchanged Planner safety gates. The restored old Today UI displayed the remaining 29 minutes correctly and had no new captured console errors.

## Web deployment

- Previous Pages deployment: `b187f696-2bd8-4fc6-b4d8-1e505f2421a9`.
- New, subsequently rolled-back deployment: `2f7f674c-0b0d-407e-8de2-98579ddfe094`.
- Candidate immutable URL: `https://2f7f674c.kpss-coach.pages.dev` — failed acceptance; not a known-good rollback target.
- Source: exact `caf69b4e7a931b8233a63e863205dfbc93419a20`.
- Cloudflare deployment created `2026-10-07T07:26:59.630818Z`, successful deploy stage ended `07:27:01.463269Z`.
- Existing production-configured artifact uploaded without rebuilding against local `.env.local`.
- Artifact: 24 files; full manifest SHA256 `9fef4610f5b574a3cbdc8ce298494ac868e40b212da6af5007a81104596530bc`; runtime manifest SHA256 `dc820ea4871a2275c48b6410e199ad1971f2f33f279122c0f13a9e77af46b9cd`.
- Artifact scan: production Supabase host; no loopback application API endpoint, UX Lab entry, fixture or temporary acceptance credentials. Vendor URL-parser base and unused SDK localhost defaults were documented allowances, not live application endpoints.
- Official logo and favicon loaded in the RC before rollback.
- `main` was Cloudflare production-branch deployment metadata only. No Git main push/merge occurred.
- Production alias after rollback: [kpss-coach.pages.dev](https://kpss-coach.pages.dev), serving the primary baseline again.

## Database

- Migrations: **NONE**.
- SQL: **NONE**.
- Schema, policy, RLS and migration-history mutation: **NONE**.
- No database rollback or manual repair.
- Existing supported application paths persisted the narrowly authorized study acceptance below. “Database unchanged” in this release means no database deployment/schema change; it does not mean zero application row writes.

## Production smoke

These results distinguish checks completed before the incident from final release acceptance.

| Area | Result and limit |
| --- | --- |
| Login | PASS: existing approved account session, protected product access and verified normal Auth user. No production account/password creation or password reset. No fresh browser password-entry test. |
| Navigation | PASS before failure: official brand, all six product destinations, account/settings and mobile menu. |
| Today | PASS before failure and after rollback: correct date/capacity/current task and remaining work. |
| Canonical material | PASS read-only identity chain and source projection for an existing historical canonical video task. Current week had 47 resource-level tasks; historical task was not moved or recreated. Live Today inline canonical-video playback was not exercised. |
| Video | **FAIL**: first resource player rendered existing persisted progress; selecting a different catalog video crashed React and blanked the root. Playback/progress/backpressure acceptance of the selected canonical video was not completed. |
| Resources | Owned resources, empty-mapping guard and real catalog rendered; **FAIL for video selection**. |
| Week | PASS read-heavy: real plan, interactions and Preview-only gates; no add/edit/move/Apply acceptance mutations. |
| Progress | PASS before failure: real metrics rendered. |
| Roadmap | PASS before failure: timeline, navigation and details/popovers. |
| Coach | PASS contextual UI/gates; no paid provider invocation or conversation smoke. |
| Account | PASS menu/settings reads; no settings edit or production password change. |
| Mobile | PASS before failure at 390px: menu and layout, no horizontal overflow. Only the tested in-app Chromium browser is evidenced. |
| Console/network | **FAIL** due fatal runtime error; a preceding `PROFILE_LOAD_FAILED` recovered on refresh. Available browser logs, loaded asset URLs, artifact scan and narrow API probes were inspected. Full HAR/global provider logs were unavailable; no global error-rate claim is made. |

## Controlled mutation

The read-heavy checks performed up to that point had passed before this minimal existing-task study flow. The later resource-video check exposed the release blocker.

- Existing task: `aa0707ff-b9d7-46ed-b918-7bd713e8b2aa` (resource-level Hukuk work, 30 minutes planned).
- Exactly one new session: `abc37a71-a794-47c5-967e-37f66baef6ac`.
- Start: `2026-10-07T11:26:40.795058+03:00`; finish: `11:28:52.176729+03:00`.
- Exactly one closed break: pause `11:27:14.35346+03:00`, resume `11:28:28.992078+03:00`.
- Persisted actual study duration: **1 minute**. Final session status: `completed`; task: `partially_completed`, 29 minutes remaining. Break time was excluded.
- Pause/resume, refresh while paused, Today → Focus continuity and finish: PASS for this same session.
- Generic resource study has no independent periodic video checkpoint path. Persisted lifecycle state was verified; this is not production canonical-video checkpoint/backpressure acceptance.
- Physical page persistence: NOT RUN; no safe canonical page fixture existed. No page data was manufactured.
- No duplicate session or progress record; no active test session left behind.

## Incident and observation

- Incident: Concept B resource-video switch; severity **P1** (core frontend unavailable, without observed accounting/ownership corruption).
- Status: **CONTAINED BY WEB ROLLBACK; ROOT CAUSE/REPAIR OPEN**.
- Detected: `2026-10-07T08:36:25.655Z`.
- Trigger: Resources → Matematik → “2026 KPSS Matematik Video Ders Notları – İlyas Güneş” → Video izle → select `13 - TABAN ARİTMETİĞİ - İLYAS GÜNEŞ l KPSS - MEB AGS` from the real 91-video catalog.
- Observed error: `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` Stack begins at `product-entry-CFpldKfk.js:9:99151`. Root became blank; screenshot and console evidence preserved locally.
- Mapping for the selected historical canonical task was independently verified: native YouTube ID `fevyDdnq__4`, catalog identity `bae6f705-159f-4e45-a22e-456b091d45bd`, duration 1,287 seconds, owner/profile and resource-topic mapping matched. A raw URL was not introduced as task identity and no arbitrary iframe mapping was added.
- Hypothesis only: the imperative YouTube SDK replaces a React-owned node; selected-video unmount/reconciliation may remove an already-replaced child. [VideoPlayerDrawer.tsx](../../../apps/web/src/components/VideoPlayerDrawer.tsx) needs a separately authorized local investigation and regression reproduction. This release task did not fix source or assert a confirmed root cause.
- The player cleanup calls `tick()`/`save()` before destroy. Consistent with that path, one existing first-video progress row acquired a new timestamp `2026-10-07T11:36:27.559326+03:00`, shortly after the crash. Its video identity, position **519 seconds**, watched time **30 seconds** and completion state remained identical. This is an observed timestamp-only write; network request count was not captured, so it must not be described as proof of exactly one request or zero checkpoint traffic.
- App-api errors: none in the measured supported task/plan/session/auth probes. Tooling-only incorrect-column REST read probes were corrected; they are not product app-api 5xx evidence. Global provider error rates were not available because the provider log dashboard required a separate login.
- Auth anomalies: no persistent auth loop or repeated 401/403 observed in scoped acceptance. Expected unauthenticated 401 remained intact. A transient RC profile-load error recovered on refresh.
- Client errors: fatal RC error above; no new errors/warnings captured after rollback through `08:49:23.350Z`.
- Coach telemetry: existing usage/reservation/reservation-event rows **1 / 1 / 3**, byte-equivalent across the scoped snapshots. No release-triggered paid provider call.

## Safety invariants and post-rollback state

Renewed snapshot at `2026-10-07T08:41:30.1302034Z`:

| Record set | Before → after | Verified result |
| --- | --- | --- |
| Tasks | 333 → 333 | Only the authorized task changed to partially completed; no task inserted/deleted. |
| Sessions | 131 → 132 | One authorized completed 1-minute session; all previous 131 rows unchanged; active sessions 0. |
| Weekly plans | 8 → 8 | Rows unchanged; no Planner Apply. |
| Resource progress | 0 → 0 | Unchanged. |
| Video progress | 2 → 2 | No duplicates; identity/progress values unchanged; exactly one row differs only in `updated_at`. |
| Physical snapshots / pace evidence | 0 / 0 → 0 / 0 | Unchanged. |
| Confirmed action proposals | 7 → 7 | Unchanged. |
| Coach ledger | 1 / 1 / 3 → 1 / 1 / 3 | Unchanged. |

Ownership, normal Auth identity, expected unauthenticated denial, zero visible foreign-owned profiles, JWT enforcement, existing gates and unchanged other services passed the scoped checks. No unrelated task/plan mutation was observed within the tested profile. The evidence is profile-scoped, not a scan of every production user's activity.

## Rollback

**EXECUTED — WEB ONLY**.

- Target: `b187f696-2bd8-4fc6-b4d8-1e505f2421a9`, source `cbc209fdf34f217b6d1419612199ee8c8370fe4b`.
- Executed and verified: `2026-10-07T08:39:50.4954313Z`, approximately 3 minutes 25 seconds after detection.
- The initial rollback request encountered an expired existing Cloudflare OAuth credential. Normal credential refresh succeeded without expanding access; the authorized rollback then succeeded. No automatic approval rejection occurred.
- app-api rollback: **NOT REQUIRED based on renewed scoped compatibility/safety evidence**; v79 retained. Executable fallback remains source `735de8d96edcef78816a0843e72669c7d16a034b`, prior code v75 / config v78, if a backend regression is later established.
- Secondary web fallback retained: `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`.
- Final Pages API verification at `08:48:32.9340678Z`: canonical deployment is the approved primary baseline, environment `production`, stage `success`.
- Browser recovery at `08:49:23.350Z`: old asset `/assets/index-DmM0W_12.js`, real current task and 29-minute remainder, no profile-required screen, no new post-rollback captured console errors.
- Temporary acceptance API Auth session was closed; the user's browser session and LOCAL development environment were retained. Temporary viewport override and unused provider-log tab were removed.

## Production versions

- **Web:** `b187f696-2bd8-4fc6-b4d8-1e505f2421a9` / `cbc209fdf34f217b6d1419612199ee8c8370fe4b`.
- **app-api:** v79 ACTIVE / `verify_jwt=true` / exact RC source; existing configuration and gates preserved.
- **Database:** deployment/schema **UNCHANGED**; the authorized acceptance session and timestamp-only progress write remain recorded.

## Evidence and documentation disposition

Provider metadata, narrowly scoped snapshots, browser logs and screenshots are private LOCAL evidence under `.release/production-20261007/` (git-ignored). They contain production profile state and were not copied into tracked source or published.

- [Live preflight](../../../.release/production-20261007/preflight.json), [baseline metadata](../../../.release/production-20261007/pages-live.json), [rollback-source verification](../../../.release/production-20261007/rollback-verification.json).
- [New deployment](../../../.release/production-20261007/pages-after.json), [rollback result](../../../.release/production-20261007/rollback-result.json), [final Pages metadata](../../../.release/production-20261007/pages-final.json).
- [Final function metadata](../../../.release/production-20261007/functions-final.json), [secret/gate digest comparison](../../../.release/production-20261007/gate-comparison.json).
- [Fatal browser console](../../../.release/production-20261007/browser-console-failure.json), [blank-root screenshot](../../../.release/production-20261007/video-switch-failure.png).
- [Post-rollback invariants](../../../.release/production-20261007/postrollback-verification.json), [browser recovery](../../../.release/production-20261007/browser-recovery.json), [recovered Today screenshot](../../../.release/production-20261007/rollback-recovered.png).

The four success-only release closure documents (`PROJECT_HANDOFF.md`, `CURRENT_SPRINT.md`, `FRONTEND_MIGRATION.md`, `CONCEPT_B_RELEASE_FREEZE.md`) were not marked production-GREEN or rewritten. This separate dated release/incident record captures the accepted drift, deployments, failure and containment. Documentation remains uncommitted for review; exact RC and remote refs remain as stated.

## Remaining risks and follow-up

- RC web must not be promoted again as accepted. A separately scoped LOCAL player lifecycle fix, meaningful video-switch regression coverage, a new RC freeze and renewed release acceptance are required.
- Root cause remains a hypothesis; no repair or full video checkpoint/backpressure acceptance was performed after the stop condition.
- The transient RC profile-load failure needs a separate investigation.
- Current-week Today canonical-video execution and physical-page persistence were not safely applicable to this existing production plan. Local acceptance does not replace missing production evidence.
- Global provider log visibility, full network request counts and browsers beyond the tested in-app Chromium session remain unverified.
- The failed immutable Pages deployment may remain addressable; it is not the production alias or an approved rollback target.

## FINAL STATE

**PRODUCTION WEB ROLLED BACK — ACCEPTANCE FAILED. app-api v79 retained with verified old-web compatibility; database schema unchanged. Source repair and further rollout STOPPED.**
