# Concept B release blocker closure — 2026-10-07

**LOCAL readiness GREEN / production NOT DEPLOYED.** Full authenticated acceptance ran on 2026-10-06 (Europe/Istanbul). The interrupted task resumed on 2026-10-07 for evidence, source freeze and exact-HEAD verification. Historical NO-GO and earlier scoped GREEN reports remain intact.

The final RC is the single local `release(web): prepare concept b production candidate` commit containing this record, on `develop`. Its parent is `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd`. Resolve the exact identity with `git rev-parse HEAD`; final postcommit identity, validation and artifact hashes are in ignored `.release/final-freeze.json`. There is no self-referential commit hash inside this commit. GO requires those postcommit checks and a clean tree; this document alone is not deployment authorization.

## Evidence files

| File | What it proves |
| --- | --- |
| `worktree-inventory.json` | Every final changed/untracked path and purpose; also all original 45 tracked + 183 untracked paths with disposition |
| `initial-inventory.json` | First closure inventory, before cleanup; original exact freeze is separately preserved |
| `candidate-source.json` | Runtime input SHA-256 manifest, documented baseline comparison and all Edge import closures; precommit source identity |
| `production-artifact-precommit.json` | Fresh production-input artifact, per-file hashes and endpoint/fixture/Lab findings |
| `validation-precommit.json` | Fresh full suite and current validation results before commit |
| `network-acceptance.json` | Curated LOCAL request timings, bounded progress concurrency, fault windows and mutation counts; no payloads/headers/credentials |
| `acceptance-results.json` | Curated persisted acceptance assertions/IDs; original state protection, physical evidence and Week outcomes; not a database export |
| `local-gate-contracts.json` | Real ES256/JWKS-authenticated capabilities and deterministic Coach explanation; provider not attempted |
| `local-resume-preflight.json` | Oct 7 resumed LOCAL stack; all measured persisted domain state preserved, no reset; normal JWT/gates unchanged |
| `console-acceptance.json`, `runtime-recovery-console.json` | Retained resolved LOCAL runtime failures, deliberate Coach 503, and clean normal acceptance window |
| `week-visible-contract.json` | Visible Week body contains no UUID/internal reason/action codes; desktop width measurement |
| `roadmap-visible-contract.json` | Real selected milestone tooltip fits horizontally and vertically after the fix |
| `mobile-*-layout.json` | 390 px real video and Coach DOM geometry; no page horizontal overflow |
| PNG files | Actual authenticated product, including video, physical finish/refresh, Week review/edit, Progress, Roadmap, Coach error and mobile account/menu |

Raw LOCAL fixture/DB/network/runtime output, temporary credentials, compiler caches, production build output and the generated compatibility bundle remain ignored in `.release/`, `.temp/`, `dist/` or `*.tsbuildinfo`. Required curated evidence and historic user evidence are intentionally versioned. No user evidence was blindly removed. The old generated `release-freeze-evidence/app-api-audit.bundle.js` was preserved in ignored `.release/app-api-audit.bundle.js`; the old record remains historical.

Oct 7 resume preflight initially found Docker stopped after an unclean exit. Docker's log showed inaccessible AF_UNIX IPC sockets; this matches the [Docker startup issue report](https://github.com/docker/desktop-feedback/issues/531). Only examined zero-byte runtime socket directories were renamed to adjacent backups, reversibly, with Docker stopped and paths verified. No factory reset, DB/volume deletion, secret/config modification, package upgrade or Windows restart. LOCAL DB/Auth/REST restarted healthy; Edge 1.74.3 resumed with oneshot/JWT verification unchanged and tracked config restored. Fresh ES256/Planner/Coach checks passed, all measured task/progress/session/page/evidence fields match the Oct 6 final state. Original root 5174 was restored; actual Oct 7 Today shows the persisted revised 30-minute task. `resumed-console.json` preserves two offline Vite/import errors from 06:11 UTC before recovery and records zero errors after 06:31:50 UTC. These runtime backups live outside the repository and are not release inputs.

## 1. Worktree and release scope

The original 45 tracked and 183 untracked paths are individually classified as RELEASE SOURCE, TEST, DOCS, EVIDENCE, LOCAL ONLY or GENERATED. The intentional set includes accepted Concept B real routes/navigation, Today/Focus/material workspaces, Week/Resources/Progress/Roadmap/Coach/account, official SVG source/public variants/favicon, additive app-api contracts, DEV-isolated Lab/review source, tests, guarded LOCAL helpers and release records.

The CLI 2.113.0 lockfile and executable resolver are preserved from the accepted LOCAL ES256 recovery. They are development tooling, not production auth changes. The retained Lab and fixture helpers are excluded from production runtime by the DEV entry split; the artifact scan confirms their markers are absent. Source helpers contain no account password. `.gitignore` adds only general `*.tsbuildinfo` and task-local `.release/` exclusions.

One local commit is authorized only after precommit GREEN; no push. Postcommit checks must report `develop`, `origin/develop`, ahead/behind `1/0`, CLEAN. Do not add a second documentation commit or edit source after freeze.

## 2. Correct production build inputs

Root cause of the original wrong artifact is the tracked build entry reading `import.meta.env.VITE_SUPABASE_URL`, with Vite loading the existing LOCAL `apps/web/.env.local`. That file is generated by the local Supabase env helper. No production process override was supplied to the original build; there is no application hardcoded fallback. Repository inspection found `.env.local` and its backup, no `.env`, `.env.production` or `.env.production.local`. A backup is not a Vite input. CI/Pages variables were not locally available and no remote settings were queried.

Installed Vite 7.3.6 `loadEnv` confirms precedence: `.env` → `.env.local` → `.env.production` → `.env.production.local`, with existing process `VITE_*` values taking priority. This task used the user's public production URL/key as explicit process inputs only. `apps/web/.env.local` stays LOCAL and is not permanently overwritten. No service-role or new production secret is required.

Use `pnpm build:release` (or `node scripts/build-production-web.mjs`) for the candidate. It refuses missing/LOCAL process inputs and server keys before cleanup, validates the exact nonsymlink `apps/web/dist` target, then runs domain/web typecheck and a fresh Vite build. The scanner checks JS/CSS/HTML runtime separately from source maps, verifies `https://disnqptbhrdwqcjnfusm.supabase.co`, rejects application loopback/API URLs, fixture video/account/password markers and UX Lab markers, and hashes all 24 output files.

Precommit manifest: `9fef4610f5b574a3cbdc8ce298494ac868e40b212da6af5007a81104596530bc`. The same source is rebuilt after commit with its exact HEAD recorded; use that final artifact, not an older local build.

Two vendor literals are explicitly reported rather than claimed absent: React Router's `http://localhost` URL parser base is immediately replaced with the actual window origin; the Auth SDK's unused `http://localhost:9999` default is bypassed by mandatory explicit `createClient` project inputs. Narrow occurrence/context checks accept only those declarations. A local `fetch` even in the same chunk still fails. All application LOCAL Supabase/API endpoints and `127.0.0.1:54321` / `localhost:54321` occurrences are zero. The 13 guard tests cover valid/invalid inputs, keys, vendor context and injected local endpoints.

## 3. Existing video PUT backpressure and lifecycle

The player still resolves canonical catalog UUIDs from owned task/material/resource truth and uses the existing GET/PUT `/youtube-videos/:catalogUuid/progress`. No raw URL identity, arbitrary iframe URL, schema, progress table or second tracking system was added.

SDK sampling remains one second; normal persistence is 15 seconds. `YouTubeProgressWriter` holds at most one active request and one replaceable pending latest checkpoint. Shared ownership key `userId:catalogUuid` spans Today/Focus, drawers and remounts. Pause, context switch, finish, visibility/pagehide and cleanup request critical flushes through the same single-flight writer. Failures retain the latest dirty state and impose 15-second backoff; normal ticks do not automatically retry forever. A newer waiting critical snapshot gets one delayed attempt, whose own failure does not self-loop. Listener detach and revision comparison prevent stale responses from updating an old/newer UI state. A deliberate backward seek remains valid.

The existing API client checks the captured owner against the current Auth session before a delayed PUT, preventing queued work from switching user after logout/relogin. Backend auth/RLS are unchanged.

Eight deterministic writer tests cover normal/dedup, slow many-tick latest wins, bounded failure, critical coalescing/stale response, shared Today/Focus remount, finish, backward seek and failed critical flush. Three owner tests verify current owner, changed owner and normal callers.

Real browser transport acceptance: **maximum concurrent PUT = 1**; two delayed saves lasted 38,990 / 45,206 ms. Three deliberately failed PUTs were separated by **15,116 / 15,997 ms**, not every second. Recovery pause persisted 350 sec. All 28 PUTs in the measured window include periodic and explicit lifecycle saves; short spacing at lifecycle events is not a periodic request storm. Source tests additionally prove exact final latest values.

The real smoke found two SDK lifecycle issues and fixed them without a new feature: finishing a partial task now pauses the still-mounted player when the session becomes ready; async restore `seekTo` cannot start playback after ready/paused restoration. Ready restore stayed at 524 sec for 89.162 sec with no active session. Explicit product start then native ready play/pause both worked. Final measured progress is **580 sec / 9:40 / 43%**, one row for the new catalog stream.

There are three deliberately started/finished video sessions, one per explicit acceptance/retest start. Native ready play/pause does not create a StudySession. One physical session and the original historical session make five completed sessions total, zero active; no duplicate session mutation. The original Oct 5 task/session/catalog remain byte-equal for measured fields: position 870, watched 368, original updated timestamp unchanged. Earlier reports' 365 sec is a historical measurement, not today's baseline and was not rewritten/reset.

## 4. Full authenticated real frontend smoke

All actions used real product root and normal LOCAL Auth/API, not UX Lab. The transport observer forwarded to 127.0.0.1:54321; only dedicated video PUT and Coach error fault injection were controlled. Data and successful application responses were real. Original root 5174 was also checked directly after relogin. Password rotation was explicitly authorized for the dedicated LOCAL account, performed only through LOCAL Admin Auth; the random value was never printed or written to source/Git/reports.

| Flow | Result and persisted semantics |
| --- | --- |
| Login/Today | PASS — dedicated profile, real capacity/current/continuation tasks, correct catalog/video/material |
| Video/Focus | PASS — play, periodic/critical saves, pause/refresh/resume, Today→Focus same iframe/session; slow/fail bounded saves |
| Physical page | PASS — real book/unit, pages 10–20; global page saved 9→12 and retained after refresh |
| Physical finish | PASS — existing `physical_v1` capture 9, draft 15 survives Focus; finish asks only last page, one completed session/evidence 9→15, six pages / 18 active sec, unit boundary 15 retained after refresh |
| Week render/add | PASS — real quick-add preview→explicit confirm; 20-minute task persisted and refreshed |
| Week move | PASS — supported accessible move dropdown, exact Oct 7 review/capacity, explicit carryover confirmation; same task UUID persisted to Oct 7; no claim of a separately tested native drag gesture |
| Week edit/review | PASS — supported manual-week review replaces one pending task, 20→30 min/title update; old pending task soft-cancelled, new task ready Oct 7; three progressed canonical tasks preserved; refresh verified |
| Week negative metadata | PASS — raw `MOVE` label changed to user-facing “Taşıma”; visible normal body contains no UUID, canonical IDs or internal reason codes |
| Resources | PASS — three real resources/categories, global page/video state, correct domain continue route |
| Progress | PASS — real completed session metrics and plan/task counts; no Lab values |
| Roadmap | PASS — real timeline/milestones/month popover; long title wraps; selected tooltip width/scroll 230/230, height/scroll 60/60, page width/scroll 1440/1440 |
| Coach | PASS — dedicated profile, real deterministic Planner explanation, safe unavailable preview, controlled 503 friendly error, real normal retry; paid provider not attempted |
| Account | PASS — profile/settings, logout→Login, protected Week route→Login, relogin; no auth loop |
| 390 px | PASS — menu/Today/video/book/Coach/account; no page horizontal overflow; Coach changed from 100vw to 100% to fit the available client width |
| Console/network | PASS in recovered normal flow — no unexplained failure, repeated 401, exception, production call, PUT storm or duplicate session request |

Global resource page 12 and unit completion page 15 are independent existing contracts, not contradictory synthetic state. Atomic physical finish uses unit progress/capture/evidence. The acceptance helper uses persisted boundary `physical_pages`, while frontend projection is `page_range`. No constraint/index was weakened: an initial duplicate canonical video fixture and an incorrect physical boundary attempt rolled back; corrected scoped LOCAL fixture uses existing canonical adapter/constraints and preserves historical acceptance.

Generic Planner capabilities (enabled, preview, confirm, apply and production mutation) all remained false. Manual Week/quick-add/carryover are existing user-confirmed contracts, not gated Planner bypasses. Coach returned `EXPLANATION`, no current canonical preview, `providerAttempted=false`, `providerUsed=false`, `noMutationPerformed=true`. Proactive stays hard-disabled; expected 404 reads are disclosed. Only the dedicated LOCAL physical-capture profile was allowlisted; production gates/secrets were untouched.

The initial LOCAL per-worker runtime accumulated the standard worker CPU limit and returned 546, causing three caught page-load logs. Those are retained, not hidden. Restarting LOCAL functions with standard `oneshot` policy fixed the runtime without changing JWT/CPU limits; tracked config was restored byte for byte. [Official CLI policy documentation](https://supabase.com/docs/guides/local-development/cli/config) describes the policies. The clean window starts 2026-10-06T18:41:21.528Z: **827 measured requests, zero unexplained errors**. Controlled video 503s and one Coach 503 are separate. This is LOCAL functional acceptance, not a production load benchmark or complete third-party HAR.

## Validation and exact freeze

Fresh source checks: **1535/1535 tests, 204/204 files PASS**, full repository non-integration suite; domain/web typecheck PASS; existing scoped lint 19 files PASS; production-input build PASS (329 modules, 24 files); six authoritative safety scripts PASS; app-api local import bundle PASS; `git diff --check` PASS. Secrets/ownership/JWT guards were reviewed and tested. No remote vulnerability scan or SQL reset/integration suite is claimed.

The old phase6G-A checker expects an obsolete always-disabled orchestrator marker. It was unchanged and mismatched documented source 735de8d already; the accepted 2026-09-25 exact-profile pilot report explicitly supersedes the earlier pending result. Its default now says SUPERSEDED; `--historical-phase6g-a` retains the original assertion for archaeology. It is not counted as a current PASS gate. No runtime was regressed to satisfy it.

Postcommit: rerun the full suite, production build/typecheck, scoped lint, six safety scripts, endpoint/fixture scan, source snapshot and diff checks from exact HEAD. Save generated output only under ignored `.release/`; no source edits. Stop if any fails, otherwise final GO is the clean local RC plus those checks.

## Deployment surfaces and backward compatibility

Source closure comparison to documented app-api baseline 735de8d finds app-api changes only: task material projection, optional exact carryover target, and earlier removal of BOM/typecheck-only comments in `proactive-coach-selection-v1.ts` (no executable change). Other five Edge closures have no change. No migration/seed/config diff relative to that baseline. The preserved pending Proactive migration in history is unrelated and must not be pushed.

- **Web REQUIRED** — accepted real Concept B and brand/material/navigation migration.
- **app-api REQUIRED** — additive `material_scope` and existing progress read enrichment; optional `targetDate` for exact move preview.
- **Other Edge NONE** — static closures, not live version claims; do not bulk-deploy shared history.
- **Database migration NONE; new production secrets NONE.**

Backward compatibility **PASS**: old web ignores additive task projection; callers omitting `targetDate` retain the original future-date iteration/capacity behavior. Exact requested target is validated for real ISO date, current week, future day and capacity, never silently falls back. Auth/ownership/Today/active-session restrictions and explicit confirmation remain. Current source/contract tests passed; no production compatibility smoke was performed because it is forbidden in this task.

Future authorized deployment order: (1) verify documented live baseline/gates read-only and archive known-good executables/artifacts; (2) deploy only app-api with existing JWT/gates and verify old-web compatibility; (3) publish the exact-HEAD production-configured web artifact, then separately authorized smoke/observation. No migration, other Edge, provider/Planner activation or secret change. This task performs none of those steps.

Exact documented rollback: web source **395a536d18b79ea124bdac0d4498a021d9ce9bc0**, Pages **f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae**, immutable `https://f7c4dd8e.kpss-coach.pages.dev`; app-api source **735de8d96edcef78816a0843e72669c7d16a034b**, ACTIVE code **v75**, latest configuration **v78** with the same code. Preserve its executable and gates in future preflight; old v47 is not the immediate rollback. Database rollback NOT APPLICABLE.

Non-blocking limits: Chromium/IAB was measured, not Firefox/Safari; YouTube availability remains external; pagehide is best effort during a hard process/network shutdown; full remote playlist sync was outside this task; LOCAL fixture capacities are deliberately generous and not production/student recommendations; no paid Coach provider or disabled Planner apply was tested; live production drift/executable archive verification belongs to the separately authorized deployment task.

**Production: NOT DEPLOYED. No production access/SQL/migration/data/secret operation and no Git push.**
