# Concept B — Final release freeze and readiness audit

## Current blocker closure — 2026-10-07

**LOCAL closure GREEN; final GO requires the containing exact RC commit, CLEAN worktree and successful postcommit checks. Production NOT DEPLOYED.** Full acceptance was measured Oct 6; final freeze resumed Oct 7 after interruption. [Detailed closure evidence](release-blocker-evidence/README.md) supersedes the historical NO-GO below for the four named blockers.

| Blocker | Current result |
| --- | --- |
| B1 exact RC | Original 45/183 inventory preserved; intentional source/tests/docs/evidence reviewed. One local release commit after GREEN, no push; exact identity from containing commit and ignored postcommit final-freeze record. |
| B2 production endpoint | Fresh explicit production-input build PASS, 24-file SHA manifest, correct project host; zero LOCAL application Supabase/API endpoints or Lab/fixture/credential markers. LOCAL env unchanged. |
| B3 backpressure | One active PUT / one latest pending; eight deterministic tests and real slow/fail window PASS; no stale UI rollback or per-tick error retry. Captured owner protects logout/relogin. |
| B4 full authenticated smoke | Real-root physical finish, Week add/edit/move/review/confirm, video/Focus, remaining product/account/mobile flows PASS; production/gated Planner mutation never used. |

Fresh source validation **1535/1535 tests / 204/204 files**, domain/web typecheck, scoped lint, correct production build + scan, six current security/safety scripts, app-api local import compatibility and diff check PASS. The phase6G-A checker is explicitly historical/superseded, not counted as a current gate. Exact-HEAD build/tests/safety are repeated after commit without source edits.

Current deployment scope: **Web REQUIRED; app-api REQUIRED; Other Edge NONE; DB migration NONE**. Source closures rechecked against documented app-api baseline; its legacy typecheck-comment/BOM cleanup has no executable change. Old web ignores additive material projection; absent optional targetDate keeps the original preview behavior. **Backward compatibility PASS** from source/tests. Do not push the unrelated historical pending Proactive migration.

Future separately authorized order: verify/archive current known-good production baseline and gates, then only app-api + compatibility smoke, then exact-HEAD web artifact + authorized smoke/observation. No provider/Planner gate, secret, scheduler or migration change. This task did not query/deploy/mutate production or push Git.

Exact documented rollback: web source `395a536d18b79ea124bdac0d4498a021d9ce9bc0`, Pages `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`; app-api source `735de8d96edcef78816a0843e72669c7d16a034b`, ACTIVE code v75/config v78 (same code). Database NOT APPLICABLE. Future preflight must verify drift/archive; this forbidden-production task does not claim a live executable backup.

Known limits: measured Chromium/IAB, external YouTube availability, best-effort hard-unload flush, no paid provider/disabled Planner apply/full remote playlist sync or production load benchmark. Curated evidence contains no passwords/tokens; raw runtime/DB fixtures/build/cache output stays ignored. Stop at the clean local RC; **NOT DEPLOYED**.

## Historical freeze audit — 2026-10-06


2026-10-06 · Europe/Istanbul · **NO-GO · DIRTY · NOT DEPLOYED**

This is a source/artifact readiness audit, not a production release. The accepted Concept B, canonical video acceptance and official logo work remain preserved. The release candidate is not frozen: its source is still uncommitted, the freshly built web artifact targets LOCAL Supabase, the video checkpoint failure path can enqueue requests every second, and the complete authenticated frontend migration checklist remains pending.

No production deploy, Cloudflare operation, Supabase deploy, production SQL/migration/data mutation, secret/gate change, commit or push was performed. The only remote operation was read-only `git ls-remote`. No live production endpoint or database was queried. Baselines below are the exact last verified references in repository release records, not a newly observed live deployment.

## Evidence and identity

- [snapshot.json](release-freeze-evidence/snapshot.json): final Git status, every runtime input hash, build file hashes, environment names and bundle sweep.
- [change-inventory.json](release-freeze-evidence/change-inventory.json): every tracked path from each production baseline to HEAD, tracked candidate changes, and untracked paths, with categories. Untracked audit evidence is separately listed in the snapshot.
- [edge-import-closures.json](release-freeze-evidence/edge-import-closures.json): current relative import closures and changed dependencies against the documented app-api source.
- [validation and reproduction](release-freeze-evidence/README.md), [fresh regression log](release-freeze-evidence/regression.log).
- [frontend migration](FRONTEND_MIGRATION.md), [video source audit](VIDEO_INTEGRATION_AUDIT.md), [authenticated local video acceptance](VIDEO_LOCAL_AUTHENTICATED_ACCEPTANCE.md), [logo acceptance](LOGO_INTEGRATION.md).
- Policy: [RELEASE_PROCESS.md](RELEASE_PROCESS.md). Historical checkpoints in source documents remain intact.

### Git preflight

| Item | Exact result |
| --- | --- |
| Branch | `develop` |
| HEAD | `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd` |
| Upstream / origin/develop | `origin/develop` / `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd` |
| origin/main | `cbc209fdf34f217b6d1419612199ee8c8370fe4b` |
| Local commits not pushed / upstream commits missing | `0 / 0` |
| HEAD ahead of origin/main / behind | `73 / 0`; this is branch history, not a production deployment manifest |
| Staged | `0` |
| Unstaged tracked | `45` files, including the two removed navigation components |
| Untracked | **183 expanded file paths** in final `snapshot.json`; includes product source, brand assets, tests, docs/evidence and generated `tsconfig.tsbuildinfo` |
| Live remote refs | Read-only `git ls-remote origin refs/heads/develop refs/heads/main` matched both recorded refs; no fetch/push |
| Worktree | **DIRTY**, accepted implementation is not all in HEAD |

The source and build were fingerprinted after the final code change and full suite:

- Runtime source manifest SHA-256: `8a27008a5fbc0b4caae9726c17a0b3e0bd27044c7a5dfd865902f8a99a820f40`.
- Local build manifest SHA-256: `d87946edab653708c44049089be12b2e852767e6a8d64217df7ccc4ff0d44e96`.

These hashes identify the audited files; they are **not** a reviewed RC commit or an approved production artifact. The runtime manifest excludes docs, tests and generated tsbuildinfo; it includes DEV source so that reviewed isolation code is identified too. Local environment inputs are not embedded in the source manifest; the resulting build files have their own hashes. Documentation additions do not change the runtime hash.

## Exact production baselines

Web and app-api have different deployed source baselines. `origin/main` cannot stand in for either current deployment.

| Surface | Last documented verified production reference | Source of truth |
| --- | --- | --- |
| Web | Source `395a536d18b79ea124bdac0d4498a021d9ce9bc0`; Cloudflare Pages deployment `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`; immutable URL `https://f7c4dd8e.kpss-coach.pages.dev`; deployment time `2026-08-27T12:52:27Z` | [W7 runtime release](releases/2026-08-27_W7_GATE_OFF_RUNTIME_RELEASE.md), PROJECT_HANDOFF and W8A preflight |
| app-api | Source `735de8d96edcef78816a0843e72669c7d16a034b`; deployed code became ACTIVE **v75**, documented kill-switch disable/re-enable cycle left ACTIVE configuration **v78**, same source | Authoritative production GREEN section of [2026-09-25 pilot release](releases/2026-09-25_AI_COACH_6G_PRODUCTION_PILOT_LOCAL_RELEASE_READY.md) |

The web record contains an 18-file manifest with SHA-256 `f447f1b1a4c32fa8cda6dbb8ab5c5628f1a7f90bbb14401289b9ac377a7ef114`. The app-api source chain was `f977e469` → `f3588e1` → `735de8d`. Older v47/pre-pilot checkpoints in that document are historical; v47 is not the current rollback baseline.

Recorded production policy: exact-profile Reactive Coach pilot enabled; Planner Confirm/Apply, canonical Planner and evidence-shadow OFF; Proactive Coach production surfaces hard-disabled. This audit did not read or change live gate values.

## A–F change inventory

The JSON inventory separates **baseline → HEAD** from **baseline → dirty candidate**. Reporting only committed changes would omit most of the accepted frontend/video/logo migration. The following table explains important groups; the JSON retains every path/status.

### A. Web / frontend

| Important files | Purpose |
| --- | --- |
| `App.tsx`, `product-entry.tsx`, `main.tsx`, `layout/AppShell.tsx`, `layout/TopNavigation.tsx`, `top-navigation.css`; deletions of `Sidebar.tsx` / `MobileNav.tsx` | Real route shell, persistent Today/Focus workspace, white top navigation, account/Coach/mobile sheet; DEV entry separated before importing auth |
| `StudyTodayPanel.tsx`, `StudyMaterialWorkspace.tsx`, `HomePage.tsx`, `today-focus.ts`, `task-material-presentation.ts`, `TaskMaterialSummary.tsx`, `useTaskMaterialDrawer.tsx` | Real task selection and canonical material continuity; existing resource actions; no Lab task state in the product |
| `VideoPlayerDrawer.tsx`, `task-video.ts`, `youtube-player-progress.ts` | Existing catalog/progress contracts; verified task/resource/video/playlist identity; SDK ready/resume fix and stable mounted player |
| `ResourceProgressDrawer.tsx`, `PhysicalStudyFinishDialog.tsx` | Existing page progress/session finish flow; protected physical capture uses a draft until the single finish action |
| `WeekPage.tsx`, `PlanningPanel.tsx`, `TaskActionPreviewDrawer.tsx`, `QuickAddTaskDrawer.tsx`, `app-api.ts` | Selected-day carryover preview, explicit confirmation, manual whole-week replacement review and existing capacity/ownership protection |
| `ResourcesPage.tsx`, `ResourceDetailDrawer.tsx` | Real library/progress and return to eligible current task or a resource-selected planning draft |
| `ProgressPage.tsx`, `RoadmapPage.tsx`, `useRoadmap.ts`, `roadmap.ts` | Simpler read surfaces and real projection/continuity; bounded disclosures |
| `CoachDrawer.tsx`, `PlannerCoachExplanationCard.tsx`, `PlannerV2PreviewPanel.tsx`, `AdaptivePlanningPanel.tsx`, `ProactiveCoachCard.tsx` / `ProactiveCoachSurface.tsx`, planner presentation/lifecycle libraries | Previously committed Evre 7 product language/context changes plus migrated contextual Coach; backend authority/gates preserved |
| `ProductDialog.tsx`, `dialog-focus.ts`, `useDialogAccessibility.ts` | Native dialog focus, Escape, return focus and scroll lock |
| `LoginPage.tsx`, `RegisterPage.tsx`, `SettingsPage.tsx`, `index.html`, `public/brand/*`, `styles.css`, `workspace.css` | Official brand and favicon, account surfaces, production visual DNA/responsive/reduced-motion styles |
| `ux-lab/*`, `dev-video-entry.tsx`, `dev-video-review.tsx`, `local-video-review.ts` | DEV-only design/review surface and loopback-only authenticated review; absent from the production build |

Web includes the committed Evre 7 work after the August web baseline, not just dirty logo changes. Domain Coach/context/evidence/Planner lifecycle additions between August and September are fully enumerated in the inventory; their server portion already belongs to the September app-api baseline.

### B. Edge / shared runtime

Against app-api source `735de8d`, the actual deployable app-api closure changes are:

| File | Purpose / compatibility |
| --- | --- |
| `supabase/functions/app-api/index.ts` | Additive `material_scope` task projection and resource-unit page metadata; catalog/progress enrichment; optional `targetDate` for existing read-only task action preview |
| `supabase/functions/_shared/task-material-scope.ts` | Canonical task/material projection from existing resource/catalog/progress truth; no new persistence |
| `supabase/functions/_shared/task-action-preview.ts` | Optional future same-week target date, real calendar validation, capacity blocking; no silent substitute target |
| `packages/domain/src/ai-coach/proactive-coach-selection-v1.ts` | Deno-compatible runtime imports; production Proactive surface remains disabled |

The other three domain import-compatibility edits (`coach-evidence-view-v1.ts`, `conversation-intelligence-v1.ts`, `planner-coach-explanation-v1.ts`) are also inventoried; type-only edges do not imply a deployed runtime dependency. Local ES256 recovery did not introduce a JWT bypass or server auth rewrite. Session and video-progress mutation endpoints are unchanged from the September app-api baseline.

Historical shared Coach/economics/Planner bundles and helpers differ from the **older web** baseline. They are not newly introduced server changes for this RC. Do not redeploy all functions from a branch merely because `_shared` differs from an August web commit.

### C. Database

**RC database diff: NONE** against the documented September app-api source: migrations, seed and Supabase config are unchanged; no new untracked migration/SQL file. No new policy, trigger, RPC signature or schema change is required by Concept B/video/logo. No production migration-history table was read or written.

There are six **historical** migration additions relative to the August web commit:

1. `20260901123000_planner_v2_preview_attempt_lifecycle.sql`
2. `20260902101000_align_service_role_task_privileges.sql`
3. `20260902103000_harden_planner_v2_expired_confirmation_state.sql`
4. `20260911150000_ai_usage_ledger_v1.sql`
5. `20260911170000_ai_provider_runtime_reservations_v1.sql`
6. `20260919120000_ai_coach_proactive_state_v1.sql`

The September release record explicitly says the economics pair was applied and the Proactive state migration remained **pending / not applied**. This audit does not infer that every historical migration was deployed from Git alone. None is added/altered by this RC, and the currently disabled Proactive surface does not require its pending migration. **Do not run an ordinary migration push**: it could apply that unrelated pending schema. Database deployment/rollback for this release: **NONE / NOT APPLICABLE**.

### D. Config / runtime

- `package.json` / `pnpm-lock.yaml`: local Supabase CLI **2.39.2 → 2.113.0** and DEV/review tooling. `scripts/supabase-command.mjs` launches the installed CLI through Node. Ignored `.temp` REST pin and local container runtime recovery are local operations, not production infra.
- `tsconfig.base.json` / prior test configuration changes: Deno-compatible import checking and tests; no production auth flag.
- No new Supabase production config, deployment infra, secret or gate is needed.
- **Required release input:** production `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, already used by the product. The default local Vite build picks up ignored `.env.local`; see blocker B2.

### E. Tests / local tooling

Existing regression covers task material scope, exact video mapping/progress, Today selection, resume intent, navigation, carryover target/confirmation, Planner P0 invariants, Coach gates/ownership/cost and local fixture isolation. New source/tests include `StudyMaterialWorkspace.test.ts`, `TopNavigation.test.ts`, `task-video.test.ts`, `local-video-review.test.ts`, `video-integration-ui-contract.test.ts`, `local-video-acceptance-safety.test.ts` and revised Evre 7/action/material contracts.

`setup-local-video-acceptance-fixture.mjs` and `local-video-acceptance.mjs` are acceptance tooling only. The audit helper and local app-api compatibility bundle are evidence only, not a function deployment package. `packages/domain/tsconfig.tsbuildinfo` is generated tooling and must be excluded from the recommended commit.

### F. Documentation / assets

UX redesign/migration, authenticated acceptance, logo source/evidence, release records, sprint/handoff/backlog/roadmap and this report are inventoried. Historical GREEN/blocked checkpoints remain preserved. `assets/brand/source/kpss-kocu-logo.svg` is the original design source; only the two optimized public SVGs are shipped.

## Deployment surfaces and order rationale

| Surface | Decision | Diff-based reason |
| --- | --- | --- |
| Web | **REQUIRED** | Committed Evre 7 changes plus dirty real frontend/brand/video migration differ from deployed August web |
| app-api | **REQUIRED** | New `material_scope` projection and optional target-date preview contract are absent from source735de8d; this is more than a local runtime version update |
| Other Edge | **NONE** for this scoped release | Their entry sources have no new RC change; static closures have no change after the September app-api anchor. No new frontend requirement to publish those services was found |
| Database migration | **NONE** | No RC schema/RPC/policy/trigger/seed change |
| Other config/infrastructure | **NONE** | Correct existing web build inputs are mandatory; no new infra/secret/gate activation |

The import report is not proof of every other function's live version. Preserve their existing deployments; do not bulk publish historical branch changes. A future pre-deploy version drift check must use separately authorized read-only production access.

**app-api → web** is the compatible order. `material_scope` is additive and ignored by the existing web. Old preview callers omit optional `targetDate` and keep the established eligible-future-day behavior. The new web requires canonical projection and checks that returned preview target matches its selected day; deploying it first would leave these features without their contract. No new tracking endpoint or progress schema is needed.

## Local-only / hard-code / bundle audit

| Check | Result |
| --- | --- |
| Fixture native video ID / dedicated local account in fresh production chunks | **0 matches** |
| UX Lab toolbar / route in fresh production chunks | **0 matches** |
| Acceptance password variable / `debugger;` in production chunks | **0 matches** |
| Embedded JWT role classification | `anon` only; no service-role credential found; values are not recorded |
| Production backend endpoint in this local build | **FAIL: LOCAL `http://127.0.0.1:54321` is embedded** |
| Original SVG design source in dist | Absent; optimized logo and mark present |

Endpoint matches are in `assets/product-entry-Cgp4GUPb.js` and `assets/roadmap-Bf93FS8j.js`; hashes/files are in snapshot.json. Legitimate DEV/local source references are not treated as fixture leaks. However a local endpoint in a build intended for production is a deploy blocker. Build exit0 does not make this artifact deployable. No `.env` values, credentials or tokens are printed in this report.

The fixture setup checks exact loopback API/DB hosts before auth/writes, defaults to dry-run, requires explicit profile and `--apply` with a local-only password env, and rejects user/profile/resource/material/catalog collisions. It is neither imported by normal UI nor included in production seed. Local live-review entry requires DEV and loopback before auth imports. Production selects `product-entry` and tree-shakes the Lab and live-review entries.

Product source has no hardcoded fixture URL/task/material/player identity and no acceptance auth bypass. Native video identity is data, not task identity. No arbitrary iframe URL is accepted. Existing sanitized error logging is not a fixture/debug logger. The established `verify_jwt=false` settings on scheduler-worker/telegram-webhook use their existing secret-auth model; app-api and protected Coach functions retain JWT verification.

## Safety and real integration results

### Authentication / ownership — PASS (source and fresh regression)

app-api requires bearer auth and `auth.getUser()`; active profile is scoped to the authenticated user. Queries/mutations retain user/profile/resource/session/progress ownership and RLS. Wrong-user/unauthorized regression cases pass. Material enrichment uses the caller client; no service-role ownership bypass was added. Local ES256 recovery updates CLI/Edge/REST compatibility, not signing keys, JWT policy or production auth semantics.

### Planner — PASS (source and fresh regression; full runtime smoke pending)

Existing preview/confirmation/apply gates, stale rejection, canonical metadata, Today/progress-task protection and idempotency remain. Optional selected target is validated and capacity-blocked; the frontend rejects mismatched preview target and confirms explicitly. Manual edit uses the existing whole-week replacement API, reviews every replaced pending task across all days and excludes started/progress/completed tasks. Coach cannot silently apply Planner state. No new direct frontend RPC/apply authority is present.

### AI Coach — PASS (current gates)

Authentication, exact owned user/profile, server provider authority, usage ledger reservation/settlement, cost governor and kill switch remain. The redesigned drawer uses existing sanitized context/requests and does not add prompt/context persistence or Planner mutation authority. Production Proactive guard returns disabled before provider work. Current six safety scripts and regression pass.

An additional legacy checker, `check-ai-coach-6g-local-acceptance.mjs`, **fails** its old `PRODUCTION_ORCHESTRATOR_DISABLED` / `READ_ONLY_COACH_PRODUCTION_RUNTIME_DISABLED` marker assertion. The checker is unchanged from source735de8d and that marker was already absent there: its phase6G-A always-disabled assumption predates the accepted exact-profile production pilot. This is a disclosed historical checker mismatch, not a newly introduced auth bypass. It was not modified or counted as PASS. Current production-gate tests remain the relevant safety evidence.

### Video — canonical chain PASS; checkpoint error-path freeze FAIL

Task UUID → canonical material adapter → owned resource → validated catalog/playlist/video → existing `youtube_video_progress` → Today/Focus remains the single truth. The contract validates catalog UUID, native video ID, resource/playlist identity, duration and position/watched ranges. Ambiguous/missing task mapping renders unavailable with **0 iframe**, not an unrelated resource fallback. Existing library browsing may offer other episodes, but task-locked playback cannot silently choose one.

Today selection retains the canonical task without requiring an active session. The shell mounts one shared Today/Focus workspace; progress callback updates do not recreate the player. Readiness prevents initial zero overwriting persisted resume. Session start/pause/resume/finish remains separate from native YouTube state. Protected physical page capture remains a draft until existing single finish persistence; no fake page save or second video tracking system.

The 2026-10-05 authenticated LOCAL runtime matrix remains **GREEN** for its measured successful flow (one session, one progress row, 365 seconds / about 27%). This audit reran source regression and performed a read-only empty-Today/mobile check, not another authenticated playback/mutation acceptance or production smoke.

**B3 — checkpoint failure/backpressure defect:** `VideoPlayerDrawer.tsx` sets `lastSavedAtRef` only after successful PUT/progress verification, while `startTicking` calls `tick` every 1000 ms and the checkpoint predicate is elapsed time since that ref. Once 15000 ms have passed:

1. A rejected/invalid save leaves the timestamp unchanged; while playback continues, every following tick can enqueue another PUT.
2. A slow in-flight request also leaves the predicate true; one-second ticks add snapshots to `saveChainRef` without an in-flight/coalescing guard.
3. The Promise chain serializes execution but does not bound the queue or failed-request cadence.

This is source-derived failure-path evidence, not a production incident or a newly measured network trace. Successful 15 s acceptance does not cover it. The requirement “no excessive per-second DB/network writes” cannot be marked unconditionally PASS. No additional application code was changed after identifying this blocker. A later explicitly scoped minimal correction should throttle enqueue/attempts independent of success, bound/coalesce pending checkpoints, preserve the pause/end final flush and exact video identity, and test rapid failure + slow response + resume before rerunning the full freeze suite. No schema or alternate tracking is needed.

### Navigation / brand / responsive / accessibility

Source and fresh tests: semantic top nav, current route, five main destinations, Coach/account; mobile/tablet sheet, settings/logout; simplified Focus with return path. No remaining import of the removed Sidebar/MobileNav. Native dialogs/drawers retain labels, focus trap/restore, Escape and scroll lock; visible focus and reduced motion remain.

Official original paths/colors/gradients are preserved. Desktop/tablet full logo is approximately 129×54 px in the 64 px header; mobile mark approximately 34×36 px in a 44 px brand target/60 px header; auth approximately 196×82 px. Public paths and favicon exist in dist; no duplicate text wordmark, source SVG bundle, hardcoded localhost asset path or new distortion/clipping was found. Firefox/Safari actual execution and numeric CLS are not claimed.

**Minimum fix during this audit:** add explicit `aria-label="Görev Ekle"` and `aria-label="Koça Sor"` to the two Today action buttons in `StudyTodayPanel.tsx`. Existing mobile CSS hid their text while the icons were aria-hidden, leaving nameless controls. The defect also exists in the older baseline. Only these two attributes changed; no UI behavior redesign.

After the fix, CUA at 390×844 on the real authenticated LOCAL product exposes both names, measures both buttons 44 px high and `scrollWidth = clientWidth = 390`. [Screenshot](release-freeze-evidence/today-mobile-aria-390.png). No task/session/progress/Planner mutation was initiated; temporary viewport override was reset. Today has no task for the current date, so this screenshot is not video/physical/Week acceptance. Previous 21-view Lab and logo responsive evidence remain scoped historical evidence.

Source 16:9 video, responsive workspace/pages, bounded Roadmap popovers and reduced-motion styles were checked. No new obvious overflow regression was found. The pre-existing 320 px body minimum may exceed available layout width by 15 px when a browser reserves scrollbar space; it is documented in logo evidence, not newly introduced by this release. Full keyboard/screen-reader and every authenticated product route were not newly exercised.

### Performance sanity

- Playback ticks update player refs/watched accounting; no full-page state update every second. Normal successful checkpoints are 15 s plus pause/end/visibility/unmount; failure/backpressure is **B3**, not a passed guarantee.
- Today elapsed display ticks at 30 s; async loads use revision guards/cleanup. No infinite effect/unbounded normal route polling found.
- Workspace presence/library loading can cause a bounded duplicate initial GET; no every-second catalog polling was found.
- Motion is brief and respects reduced motion; no new looping animation or large raster/brand asset. Heavy Coach blur was removed; dialog blur remains restrained.
- No production latency profile, network-failure checkpoint trace or numeric CLS measurement was performed.

## Environment inventory (names only)

No new secret is required. Existing production settings must be preserved, not enabled as a side effect of release.

| Name(s) | Requirement |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **Required web build inputs**; public client configuration, correct production project; never a service-role key |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing required server/platform inputs; server-only service role |
| `OPENAI_API_KEY` | Existing feature-conditional secret, required only for already authorized provider execution |
| `YOUTUBE_API_KEY` | Existing feature-conditional catalog sync secret; playback/progress does not introduce a new key |
| `PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS` | Optional existing physical-capture gate; preserve eligibility |
| `PLANNER_V2_PREVIEW_V1_PROFILE_IDS`, `PLANNER_V2_CONFIRM_V1_PROFILE_IDS`, `PLANNER_V2_APPLY_V1_PROFILE_IDS` | Optional existing gate lists; preserve recorded OFF restrictions/approved eligibility |
| `AI_REACTIVE_COACH_PRODUCTION_PILOT_ENABLED`, `AI_REACTIVE_COACH_PRODUCTION_PILOT_APPROVED`, `AI_REACTIVE_COACH_PRODUCTION_STATIC_BOUND_READY`, `AI_REACTIVE_COACH_PRODUCTION_ENVIRONMENT`, `AI_REACTIVE_COACH_PRODUCTION_ALLOWED_USER_ID`, `AI_REACTIVE_COACH_PRODUCTION_ALLOWED_PROFILE_ID` | Existing exact-profile pilot configuration; conditional requirements of that pilot, no widening/change |
| `SCHEDULER_WORKER_SECRET` | Required only for unchanged scheduler service |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Existing Telegram service requirements; unchanged and outside deploy scope |
| `TELEGRAM_EVENT_STALE_SECONDS` | Optional existing Telegram tuning |
| `TELEGRAM_TRANSPORT_MODE`, `TELEGRAM_CARD_RENDER_MODE` | Existing optional DEV/test transport/render choices; do not promote mock modes |
| `KPSS_VIDEO_ACCEPTANCE_PASSWORD` | **LOCAL fixture only; never required/used in production** |

Literal server env reads are listed in snapshot.json; the six dynamically accessed pilot keys above are additionally inventoried from their typed key contract. DEV Coach runtime controls are local-only and not new production requirements. No secret values are recorded.

## Fresh final validation

All required checks below were rerun **after** the two aria-label attributes changed. There were no further application source changes. Documentation/evidence-only edits were followed by snapshot/diff validation.

| Check | Final result / scope |
| --- | --- |
| Full repository non-integration regression | **1509 / 1509 tests, 200 / 200 files PASS**, exit0; repository convention excludes `tests/integration/**` |
| Domain + web TypeScript project build | **PASS** |
| Repository scoped lint | **PASS**, `check-ux-lab.mjs`, 19 files/strict unused/import isolation; no full ESLint script exists |
| Vite production compilation | **PASS**, 328 modules; main JS 452.36 kB / gzip 132.68 kB, CSS 162.23 kB / gzip 27.25 kB |
| Web artifact production readiness | **FAIL**, two chunks embed local backend; this artifact must not be deployed |
| Six current Coach/Planner/economics safety scripts | **PASS** |
| Additional legacy phase6G-A checker | **FAIL**, stale pre-pilot disabled marker; explicitly classified above, not included among six PASS checks |
| app-api local esbuild/import compatibility | **PASS**, external npm/https imports; 742.3 kB; not a deployed artifact or live Deno runtime acceptance |
| Git diff whitespace check | **PASS**, CR-at-EOL repo convention |
| Read-only local 390 px button AX/layout check | **PASS**; not full migration runtime acceptance |
| Fresh production smoke / linked integration SQL tests | **NOT RUN**, forbidden/outside this audit; no production acceptance claim |

## Blockers and release completion conditions

| ID | Exact blocker | Required next evidence; not performed here |
| --- | --- | --- |
| **B1** | Dirty accepted implementation; HEAD is not the exact release candidate | Review/commit the complete coherent scope, exclude generated/local inputs; record exact RC commit, rerun required validation and verify intended clean worktree. No commit/push in this task |
| **B2** | Fresh artifact contains `http://127.0.0.1:54321` | Build the exact reviewed commit with approved existing production VITE inputs; rescan endpoint/role/fixture/Lab markers and record new artifact manifest. Do not publish the current local artifact |
| **B3** | Progress failure/slow response can enqueue one checkpoint per second after threshold | Minimal checkpoint throttling/backpressure fix and failure-path tests, preserving finish/resume and existing schema/tracking; full freeze revalidation |
| **B4** | Complete authenticated real frontend migration smoke still pending in source-of-truth docs | Complete LOCAL/DEV physical capture/finish, Week edit/add/move/review and Resources/Progress/Roadmap/Coach/account flows with existing ownership/gates; source/unit/Lab/video-only GREEN does not close that checklist |

No newly required migration/auth bypass/fixture leak was found. A compiled build and historical successful video flow do not override B1–B4. **Decision: NO-GO. Release freeze is not complete.**

### Recommended commit scope/message (recommendation only)

Review two coherent commits, without applying them in this task:

1. `feat(web): migrate Concept B workspace with canonical video and official branding` — real web source/route/nav/style/dialog/material/progress/resume fixes, removal of old navigation, optimized public assets + unchanged brand source, the task-preview Edge/helper contract, matching tests and product/release documentation. Include the DEV isolation sources/tests and safety lint helper needed to prove isolation; do not accidentally omit untracked source. Existing material-scope/domain compatibility commits are already in HEAD and remain ancestors. Address B3 before calling this final scope frozen.
2. `chore(dev): align local Supabase runtime and video acceptance tooling` — reviewed CLI/lock/launcher changes, local-only guarded fixture/acceptance scripts and their tests/docs.

The reviewed final tip becomes the RC identity only after checks and acceptance. Keep `packages/domain/tsconfig.tsbuildinfo`, ignored `.env.local`, `.temp`, local containers/DB records and `apps/web/dist` out of the release commit. Human-readable evidence/manifests/screenshots may accompany docs; the generated app-api audit bundle and raw test log are verification output, not deployment inputs. Do not blindly stage all untracked paths.

## Future deployment order — PLAN ONLY

This audit gives no deployment authorization. Resolve B1–B4 and obtain the separately requested release scope first.

1. Record the reviewed RC commit and production-configured web artifact manifest. Independently verify current documented baseline refs/version/gates using authorized read-only production access; preserve the current app-api executable/source/config rollback package and known-good Pages deployment before replacement. If they drift from this report, stop and amend the record.
2. Deploy **only app-api** from the reviewed scope, preserving JWT and current production gates. No other Edge, migration, scheduler, secret or Proactive activation.
3. Run a read-heavy compatibility smoke with the existing production web: auth/Today/task projection/legacy preview behavior. Stop on auth/contract failure; do not publish web into a failed API state.
4. Publish only the separately verified production-configured **web artifact**. The local build with the manifest above is ineligible.
5. Run the predefined new-web smoke below, then the recorded observation window. Record resulting versions/manifests and release owner/approver. No step was executed here.

## Exact rollback points

### Web

Return Pages to known-good deployment **`f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`**, source **`395a536d18b79ea124bdac0d4498a021d9ce9bc0`**, immutable `https://f7c4dd8e.kpss-coach.pages.dev`. The older W3 deployment `1fdc476a-c62e-4d7d-be94-24e2e12416c9` / source8354deff is historical secondary fallback, not the immediate rollback target.

### app-api

Known-good current documented source **`735de8d96edcef78816a0843e72669c7d16a034b`**, ACTIVE code **v75** / latest configuration **v78**. Preserve that executable/source and existing gate configuration in a future authorized pre-deploy step; this audit did not retrieve an executable v78 archive or invent its hash. Supabase version numbers are reference identities, not a claim that an automatic rollback command exists. Do not substitute the earlier saved v47 artifact.

On a new-web issue, roll back web first; the additive new API should still serve old web. If the API itself is unsafe, return web to known-good before removing the new API contract, then restore the known-good API package/config. The existing Reactive pilot disable mechanism is a separately authorized containment option; never enable disabled Planner/Proactive paths while rolling back.

### Database

**NOT APPLICABLE** — no database release. Rollback does not require SQL or migration reversal.

## Future production smoke — not executed

Start with an approved safe/test account and read-heavy navigation. Opening views is not a promise of zero server writes: existing Week initialization can create a week through its established API. Avoid an active user's study data; record the safe account and expected initialization beforehand.

1. Login with existing Auth; no401/refresh loop, correct user/profile.
2. Navbar: logo, current route and every desktop/mobile destination; no Lab toolbar.
3. Today load: real capacity/plan/current session, no client/Edge error.
4. Current task: task UUID/material/resource scope and correct owned profile.
5. Canonical video resolve: exact resource/catalog/playlist/native ID; no unrelated fallback.
6. Player render and persisted position without starting a study mutation; missing mapping shows unavailable/zero iframe.
7. Resources load and task-continuation links; no catalog sync/write during read-heavy smoke.
8. Week load and action availability; preview is reviewed, no automatic confirm/apply/manual replacement.
9. Progress: real saved reports, no fabricated completion.
10. Roadmap: projection/popovers/navigation, safe initialization as recorded.
11. Coach opens with correct context; disabled profile/provider paths remain disabled; no provider call implied by opening.
12. Account/profile/settings and mobile sheet, keyboard/Escape/focus return; no accidental profile mutation.
13. Logout and protected-route behavior.

Then, only with separately authorized controlled mutation on that safe account: start one session → real checkpoint → pause/resume → refresh → Today/Focus → finish once. Verify one session/progress row, expected partial completion, exact identity and no other user's/task's change. Physical capture and Week confirmation use their explicit reviewed paths. Test checkpoint error/backpressure behavior in LOCAL/DEV before production, not by disrupting production networking.

## Observation plan — existing signals only

- Record pre/post smoke baseline and observe initial controlled usage (suggested 30–60 min release window, owner/approver to confirm before deployment); this is a plan, not an automation or running monitor.
- Use existing browser console/network errors and Supabase app-api function/request logs: unexpected 401/403, 5xx, route/runtime failures, video mapping/unavailable increases, progress-save failures and repeated checkpoint attempts.
- Through already authorized existing session/progress/report views, check duplicate session/progress records and unexpected task completion. No ad hoc production SQL repair.
- Use existing Coach error codes, usage ledger/reservation and cost-governor/kill-switch signals, with existing bounded/sanitized telemetry; no new prompt logging/platform.
- Any wrong-user access, Planner mutation without explicit approval, disabled-feature provider execution, duplicate accounting or lost progress: stop rollout and follow [INCIDENT_PROCESS.md](INCIDENT_PROCESS.md), contain/rollback using the recorded refs.
- Compare auth/API/save/route errors with the recorded baseline; unexplained repeated failures halt release closure. Do not invent a production error-rate baseline or claim active monitoring from this task.

## Known non-blocking limits

- Firefox/Safari real-browser logo/SVG verification not yet performed; original standard SVG geometry/gradients plus structural/render checks pass.
- Numeric CLS and production latency profile not measured; pre-existing 320 px/scrollbar width issue remains documented.
- Legacy phase6G-A marker checker is stale relative to the accepted pilot; its FAIL is disclosed, current six safety gates pass.
- Remote playlist sync/onboarding has no new authenticated acceptance in this audit; existing mapped catalog playback remains the integration source of truth.
- Existing bounded duplicate initial library read, browser-close final-save delivery and heavy-latency scenarios are not full production reliability benchmarks. The known unbounded checkpoint failure path is **B3**, not relegated to this list.
- Live production refs/gates and executable rollback archive were not retrieved in this forbidden-production audit. Exact documented refs are given; future read-only drift/archive verification is a pre-deploy requirement.

**Production state: NOT DEPLOYED. Audit/report complete; release candidate freeze incomplete. Stop here.**
