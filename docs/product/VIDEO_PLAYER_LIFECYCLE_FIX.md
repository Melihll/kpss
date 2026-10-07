# Video player lifecycle repair — 2026-10-07

**LOCAL GREEN. Production rollback incident repaired locally; new RC pending.**

This is a new local repair on parent `caf69b4e7a931b8233a63e863205dfbc93419a20`. That RC remains historically failed; it is neither amended nor promoted. The new RC is the commit containing this document. No push, production access, deployment, SQL, migration, schema change, secret change or gate change was performed in this task.

## Incident and root cause — CONFIRMED

The failed production Resources → Matematik → real catalog → video switch raised `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node`, leaving the product root blank. The [original rollback record](releases/2026-10-07_CONCEPT_B_PRODUCTION_ROLLBACK.md) and private console/screenshot evidence were read before repair; that record is preserved without edits.

The deterministic LOCAL reproduction used the actual `VideoPlayerPanel` React component, its real loading/selection logic, and a fake YouTube SDK that **replaces the constructor target with an iframe** and removes that iframe on destruction. Before source repair, the A → B test failed with precisely `NotFoundError: The node to be removed is not a child of this node`. Private machine result: `.release/video-lifecycle-pre-repair.json`. After repair the same replacement regression passes, including unmount.

Confirmed old sequence:

1. React renders `.youtube-player-frame` and retains the div as a managed host node.
2. `new YT.Player(hostRef.current, ...)` receives that same React node. The SDK replaces it with an iframe. React still retains the original, now detached div.
3. Catalog selection sets progress loading; the embedded component unmounts. Its `key={selectedVideo.id}` also forced replacement between identities.
4. Cleanup calls save/destroy; SDK removes the iframe. React reconciliation then tries to remove its original div from a parent that no longer contains it.
5. The commit-phase DOM exception escapes the product root, which has no suitable existing error boundary.

The SDK replacement/destruction behavior is documented in the [official YouTube IFrame API reference](https://developers.google.com/youtube/iframe_api_reference). This is supported by the RED → GREEN actual-component reproduction, not solely inferred from the documentation or production stack.

Earlier accepted tests checked source strings, progress calculations and the pure writer. They did not mount the real component against an SDK that replaces its target. Earlier browser acceptance covered playback/refresh/Today/Focus, but did not establish this catalog-switch regression. The missing ownership test allowed the defect through.

## Repair and DOM ownership

Production source changes are limited to:

- `apps/web/src/components/VideoPlayerDrawer.tsx`: stable React host, imperative SDK subtree, explicit retirement and generation guards; removed identity-based player key.
- `apps/web/src/lib/youtube-progress-writer.ts`: seed an unchanged checkpoint and expose a copy of an existing same-stream dirty checkpoint for safe remount resume. Transport scheduling is otherwise unchanged.

React owns the outer `.youtube-player-frame` div. Each effect creates an imperative `sdkRoot` containing `sdkTarget`, appends it inside the host, and passes **only `sdkTarget`** to the SDK. The SDK owns that target/iframe subtree. React never renders or reconciles its children.

Retirement order: invalidate the generation → stop the effect-local interval → remove visibility/pagehide listeners → unsubscribe writer notifications → clear this generation's shared refs → sample the latest available position → enqueue the legitimate final flush → destroy this SDK instance once → remove only the imperative `sdkRoot`. Destruction/sampling failures retain the cached checkpoint and still detach only that imperative subtree. Flush is asynchronous and does not block DOM retirement.

The local retired flag makes cleanup idempotent. Generation checks cover API-loader continuation, ready/state/error callbacks, interval/tick and writer saved/error subscribers. A retired instance cannot seek a new player, restore its timer, update current UI or apply an old save response to a newly selected video. Final transport saves remain legitimate after retirement; UI subscriptions do not.

Player source was reviewed for `removeChild`, `replaceChild`, `innerHTML`, `replaceChildren`, manual iframe relocation and portals. There is no manual removal of a React-owned element. `sdkRoot.remove()` is the single new DOM cleanup and touches only the imperative subtree.

The existing root contains Suspense/routes and StrictMode but no appropriate local error-boundary facility. No broad boundary architecture was added. A separately designed player-level boundary remains a containment follow-up; it would not replace this ownership repair.

## Progress and backpressure

The existing backend and writer remain the source of persistence. No second tracking system, raw URL task identity, hardcoded frontend playback URL, arbitrary iframe URL or new schema was introduced. Catalog video IDs, authenticated owner verification and `verifiedVideoProgress` remain intact.

The queue bound remains **one active PUT plus one latest pending checkpoint per authenticated owner/catalog-video stream**, using the existing shared writer key. Latest-wins, 15-second failure backoff, critical lifecycle flush and stale-response/owner protection pass. Seeding a clean checkpoint avoids an unchanged ready/StrictMode cleanup write. A remount returning to A during a pending final save uses that same writer's pending checkpoint instead of an older server GET. This is transient transport state, not an additional persisted progress model.

Actual LOCAL transport measurement found maximum active checkpoint PUTs **1**, both overall in the measured flow and for the exercised A stream. Delayed PUTs took roughly 20–21 and 45–46 seconds and completed with 200. Four selections in the second 20-selection run overlapped a delayed PUT. Three intentional 503 responses were **not forwarded** to the backend; successive attempts were 16.013 and 15.982 seconds apart. A subsequent 200 persisted the newer paused checkpoint, and retry remounted the correct player without a DOM error. Finish persisted the final sampled point.

The measured overall maximum is evidence for this acceptance flow. It is not a new promise to serialize independent videos/users globally: the accepted writer bound is per owned stream. Pending-bound assertions, stale responses and failed in-flight retirement are deterministic tests; network observation alone cannot inspect the pending slot.

## Regression coverage

Eleven new actual-component tests cover SDK replacement and A → B, 20 switches in a **91-entry fake catalog**, loading/ready transitions, close during GET, stale ready/state/error callbacks, close/reopen/route-style unmount, StrictMode replay, interval/listener balance, slow PUT/final flush, returning to pending A, failed in-flight saves/backoff, Today → Focus playback/context transitions and sampling/destroy failures. Every fake SDK uses `target.replaceWith(iframe)`; a non-mutating shallow stub is not used.

Two additional writer tests cover clean checkpoint seeding and dirty pending-copy/latest checkpoint retirement. Existing writer regressions also pass. Deterministic counters establish one active player/timer, at-most-once destroy and balanced lifecycle listeners after retirement. The 91-catalog stress test has a 20-second test budget for full-suite parallel CPU load; an initial full run exceeded its old 5-second budget. The complete rerun after that test-only budget correction passed.

## Authenticated LOCAL acceptance — GREEN

Real existing Supabase Auth/ES256/JWKS verification remained enabled. Dedicated LOCAL account: `video-acceptance-local@example.test`, profile `a9cb4d62-5d48-4bdd-a17d-ae8c6f240f31`. Credentials remained in ignored input/memory, outside tracked code/reports/output.

The exact production 91-video resource was not present locally and production was not used for debugging. The deterministic regression uses 91 entries. The real LOCAL browser acceptance used three real playable catalog rows in the existing release-closure resource, with metadata verified from public YouTube sources. B/C were added **only to LOCAL existing catalog tables via scoped REST**, with existing playlist totals updated; no SQL/schema/new tracking. The existing LOCAL canonical A task was moved from Oct 6 to Oct 7 for current-day acceptance. Resource, mapping, task, canonical material/workload and boundary identities were preserved. Those LOCAL fixtures remain available for review.

| Check | Evidence/result |
| --- | --- |
| Resources A playback and progress | PASS; normal playback/checkpoints, then A → B → C → A |
| B/C mapping | PASS; each actual SDK iframe resolved its own existing catalog native ID/title |
| Close/reopen and refresh/resume | PASS; A restored 704 sec / 11:44, then continued normally |
| Stress selections | PASS; two consecutive 20-selection runs = **40 selections**, second run includes 7 loading selections and 4 overlapping delayed PUT |
| Root and SDK bounds | **0 blank roots / 0 uncaught DOM exceptions**, maximum 1 iframe in the drawer; zero after close |
| Today → Focus | PASS; canonical A task, same session, player widget preserved across route transition |
| Paused Focus refresh | PASS; same active paused session, A at 751 sec / 12:31, no autoplay |
| Failure and recovery | PASS; scoped error feedback, bounded attempts, newer checkpoint saved after normal transport restored |
| Resume/finish | PASS; existing finish endpoint called once; one new completed 1-minute session, no active session |
| Final progress | A position **808 sec / 13:28**, watched **806 sec**, displayed **60%**; task remains correctly partial |
| Persistence uniqueness | Two existing progress rows, no duplicate video row; five previous sessions unchanged, one completed new session |
| Original fixture preservation | Original video progress remains byte-equivalent at 870 sec / watched 368, Oct 5 timestamp |

New session: `3f648150-b201-4cec-b09b-05520851bb5d`; existing task `374eb1db-6ee9-4d4c-a1c1-6f039859ecf6`; resource `60851e79-8597-4c88-afbb-9cefcfccedca`; canonical `youtube:87b746c0-c7e9-407e-a378-883fecfbafa8` and existing material mapping unchanged.

The app intentionally may retain an inline Today player while Resources has its drawer. Two hosts in that state are not accumulation; drawer bounds are measured separately. No heap-profiler or full cross-browser memory proof is claimed. Balanced lifecycle counters provide the listener/timer/instance regression proof.

An ignored transport proxy on loopback and a temporary Vite process injected delays/503s exclusively into LOCAL progress PUTs. They used process build inputs, without replacing `.env.local`. The normal user development runtime remains `http://127.0.0.1:5174/`. Temporary fault controls and acceptance processes are removed/stopped after capture.

## PROFILE_LOAD_FAILED — NOT REPRODUCED

Scoped source investigation found the profile GET in `AppShell`'s user-scoped effect, independent of player identity/cleanup. No `PROFILE_LOAD_FAILED` occurred in the measured LOCAL refresh/navigation/switch flow. This does not prove the production transient unrelated. No speculative profile change was made.

At 11:22:39–44 UTC, while continuing after an idle interval, LOCAL Edge was restarting and ordinary Today/Roadmap reads returned 503/502. Four caught `TODAY_LOAD_FAILED`/`ROADMAP_LOAD_FAILED` console entries were retained and classified. After the runtime was available, normal refresh restored the product. No root blanking occurred and no error/warning was recorded after recovery. This separate LOCAL infrastructure interruption is not hidden as an all-console-zero result. Intentional progress 503s and disabled-proactive 404s are expected acceptance conditions.

## Full validation — PASS

| Validation | Result |
| --- | --- |
| Full non-integration regression | **1548/1548 tests, 205/205 test files PASS** |
| Domain/web typecheck | PASS; `pnpm typecheck` |
| Existing scoped lint | PASS; `pnpm lint:ux-lab`, 19 UX Lab files; not a claim of repository-wide ESLint |
| Build | PASS; `pnpm build`, domain/web tsc + Vite; LOCAL Supabase inputs, not a production artifact |
| Secrets/excluded-path scan | PASS; actual temporary credential absent, private/server/provider keys absent; changed/staged/committed paths checked |
| Current safety scripts | All six PASS, listed below |
| Whitespace/diff | `git diff --check` PASS |
| Backend/deployment surface | No app-api, other Edge, domain, migration or schema source diff |

Authoritative safety scripts: `check-ai-coach-safety.mjs`, `check-ai-coach-plan-preview-safety.mjs`, `check-ai-economics-v1-safety.mjs`, `check-planning-v2-shadow-safety.mjs`, `check-canonical-planner-v2-readonly-safety.mjs`, `check-coach-context-v1-readonly-safety.mjs`. Historical checker names were not substituted for these current gates.

Reviewable [evidence index](video-lifecycle-evidence/README.md) and [sanitized measured acceptance](video-lifecycle-evidence/acceptance.json) contain test/file counts, original-data checks, transport limits, timings, source fingerprints and production-state provenance. Raw authenticated snapshots/network evidence remain ignored. `jsdom` is a test-only dependency; package/lock changes support the real DOM replacement regression.

## New local RC and next release surface

After GREEN, create a new local `fix(video): stabilize youtube player lifecycle` commit with failed RC as parent, without amending it. Branch `develop`, upstream `origin/develop`; expected final **ahead 1 / behind 0, clean**. Exact new HEAD and postcommit fingerprint/security checks are reported after commit. The narrow source diff is two frontend modules, their tests and test dependency/lock; the rest is this acceptance documentation, handoff/sprint and the previously produced unedited rollback record.

Next release: **Web only** for this repair. app-api source change/deployment **NONE**; database migration/deployment **NONE**. A separate exact new release freeze must check production build inputs and drift before any future promotion. This LOCAL build is not eligible for automatic production promotion.

Last recorded production state remains restored web Pages `b187f696-2bd8-4fc6-b4d8-1e505f2421a9` / source `cbc209fdf34f217b6d1419612199ee8c8370fe4b`, app-api **v79 ACTIVE**, `verify_jwt=true`, old-web compatibility PASS, database unchanged. Those are incident/release facts, **not a fresh production query in this LOCAL task**. Secondary web rollback stays `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`.

**READY FOR NEW RELEASE FREEZE. NO DEPLOYMENT PERFORMED.** Stop after the clean new local commit; no push, production smoke or deployment follows.
