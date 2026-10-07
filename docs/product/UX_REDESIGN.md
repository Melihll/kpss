# KPSS Koçu — UX Redesign / UX Lab

**2026-10-05 · Accepted B source migration: SOURCE IMPLEMENTED / LOCAL AUTH SMOKE PENDING / NOT DEPLOYED.** The user has now authorized local real-frontend migration and top navigation. Current architecture, API/action map, limits and validation: [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md). Earlier prototype-only authorization statements below are historical. Local authenticated acceptance is still pending because Supabase/Auth is down and Docker is absent; production is unchanged.

**2026-10-02 · Iteration 2 · Concept B / Coach V2 — production visual reset**

The user selected B for a second prototype iteration. This is a candidate frontend direction, not authorization to migrate or deploy it. The 2026-10-01 audit, A/C concepts and first-iteration validation below remain historical evidence.

This is a separately authorized frontend experiment after Evre 7 closure. It does not open Evre 8, promote a design, migrate the production frontend, or change Planner/Coach authority.

## Run and compare

From the repository root: `pnpm dev:ux-lab`, then open **http://127.0.0.1:5174/ux-lab**.

If the local pnpm bootstrap cannot run, use the installed runtime directly:

```powershell
cd apps/web
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort
```

No Supabase service, login, environment variable, API key, AI provider, or YouTube request is needed. Concept B requests the same optional Geist font as the production frontend; system fallbacks keep it usable offline. All changes live in React memory in this tab. Refresh resets the example week. The prototype toolbar offers **Focus / Coach / Product**, a neutral comparison, reset, and loading / empty / error / unavailable-operation scenarios. Choose Normal durum to leave a simulated loading state.

Direct links:

- Focus: http://127.0.0.1:5174/ux-lab/today?concept=focus
- Coach: http://127.0.0.1:5174/ux-lab/today?concept=coach
- Product: http://127.0.0.1:5174/ux-lab/today?concept=product

A and C retain their shared first-iteration in-memory plan. B V2 has an independent combined book/video fixture and workspace reducer; switching concepts retains each fixture and pauses B's active session. A full page reload deliberately resets example data. The toolbar is a prototype evaluation surface, separate from the student interface.

## 1. Current UX problems — actionable audit

Read before implementation: `PROJECT_HANDOFF.md`, `CURRENT_SPRINT.md`, `PRODUCT_BACKLOG.md`, `ROADMAP.md`, `ARCHITECTURE_DECISIONS.md`, and `specs/PLANNER_V2_PROPOSAL_LIFECYCLE.md`. Evre 7 material projection and ownership rules remain authoritative. The request describes some debt already addressed in Evre 7; this audit does not label those repairs as missing.

| Area / evidence | Current finding | Prototype response |
| --- | --- | --- |
| `src/App.tsx`, `main.tsx`, `auth/AuthContext.tsx` | React Router lazy pages are mounted under global auth, then protected application routes. An ordinary new child route would still initialize real auth. | Select the entry **before** importing auth. Development-only `/ux-lab` has its own bootstrap and stylesheet. |
| `components/layout/*`, `styles.css` | Five clear destinations exist. Desktop sidebar starts as an icon rail; labels appear on hover/focus, with no per-icon tooltip. Mobile bottom navigation exists. | Persistent desktop labels; distinct horizontal Focus navigation; six mobile destinations including Coach. No collapsed sidebar. |
| `StudyTodayPanel.tsx` | Today already puts focus before Coach and uses factual progress. The view still combines active session controls and a large amount of dashboard state. | One dominant next task; a full-screen study session with all navigation behind a modal boundary. |
| `WeekPage.tsx`, `PlanningPanel.tsx` | Day tabs and material continuity are useful. Large planning forms remain; UI says “Efektif kapasite”, “Planlama bütçesi”, “Telegram'ın kullanacağı hafta”, “Planı kaydet, sonra Telegram'dan test et”, `/bugun`, `/simdi`. | Day-based work cards; one task editor; “Ayırdığın süre”; explicit, readable review of each change. |
| `CoachDrawer.tsx` | Shared authority, bounded conversation and sanitized presentation already exist. Quick prompt still says “Planner ne görüyor?”. | Contextual daily briefing, bounded recent conversation, answer / suggestion / plan-change presentations. No chat message applies changes. |
| `PhysicalStudyFinishDialog.tsx` | Already captures only the unknown page boundary; preserve this strength. Copy still says “hız kanıtı oluşmaz”. | One unknown page/video field, optional no-new-progress action, elapsed time, saved feedback. |
| `ProgressPage.tsx`, `ExecutionPanel.tsx` | Reporting sections are present but “Çalışma ve test araçları” and manual recording tools compete with the answer to “İyi gidiyor muyum?”. | Human-readable weekly assessment, unattended subjects and a next action first; records remain secondary. |
| `ResourcesPage.tsx`, `ResourceDetailDrawer.tsx`, `VideoPlayerDrawer.tsx` | Strong subject navigation and shared persisted material presentation; keep these patterns. | Subject filters, physical/video distinction, visible statuses and forecasts; current video position and playlist completion separately labeled. |
| `RoadmapPage.tsx` | Month timeline and keyboard-aware month selection already exist. Dense projections need progressive disclosure. | Selected month shows start/end resources, load, milestone and risk inline, without narrow hover popovers. |
| `styles.css`, `useDialogAccessibility.ts` | Existing tokens, responsive rules, loading/empty states, focus restoration and reduced-motion support are strengths. Large global stylesheet mixes components and presentation; some surfaces use gradients/glass effects and oversized type. | Small scoped token system, calm flat surfaces, explicit state variants, native modal isolation plus keyboard containment. |

State architecture: existing screens use local React hooks with `callAppApi`, Supabase and specialized hooks. Iteration 1 uses an isolated state owner/context, pure transitions and the same data across its concepts. B V2 adds a separate in-memory workspace reducer for its combined-material fixture. The lab shares the existing pure `Icon` component; API-bound application components are intentionally not imported. No pre-existing product component or stylesheet was redesigned.

## 2. Design principles

- Answer “What should I do now?” before showing totals or history.
- Preserve material identity and progress continuity across Today, Week and Resources.
- Show evidence in ordinary Turkish; keep identifiers, reason codes and gating vocabulary out of student surfaces.
- Reveal one decision at a time. Editing one task does not expose a weekly spreadsheet.
- Explain a change, show its effect, then ask for explicit approval.
- Keep duration factual. Session time excludes pauses; a completed page range does not fabricate minutes.
- Use readable labels, semantic controls, visible focus, adequate touch areas and restrained motion.

## 3. Information architecture

| Destination | User question | Lab path |
| --- | --- | --- |
| Bugün | Şimdi ne çalışmalıyım? | `/ux-lab/today` |
| Haftam | Haftamı nasıl yönetirim? | `/ux-lab/week` |
| AI Koç | Durumumu nasıl anlayıp seçenekleri değerlendirebilirim? | `/ux-lab/coach` |
| Yol Haritası | Şimdi neredeyim, sonra ne var? | `/ux-lab/roadmap` |
| Kaynaklar | Hangi kaynakta nerede kaldım? | `/ux-lab/resources` |
| İlerleme | İyi gidiyor muyum, neye odaklanmalıyım? | `/ux-lab/progress` |
| Odak | Bu çalışmayı nasıl sürdürüp kaydederim? | B: `/ux-lab/session?concept=coach`; A/C: full-screen dialog from a task |

## 4. Focus concept

Horizontal desktop navigation and a single central action sequence. The next task dominates Today; daily progress and remaining tasks follow it. Coach becomes a quiet contextual row. Week opens one day at a time. Study mode keeps just the assignment, source, boundary, timer and two actions. Useful for assessing whether a low-choice start reduces hesitation.

## 5. Coach concept — V2, 2026-10-02

**Why B was selected:** the user chose its contextual support and reviewable plan changes as the direction to develop. This is a product direction decision, not evidence of a completed student usability study. The first B/C comparison exposed insufficient differentiation: both felt like variants of a dashboard, with color doing too much of the work.

**Historical V1:** B used an editorial daily briefing, serif headlines, warm surfaces and supportive session copy. That approach is retained here as history; it has been replaced in the B screen composition.

**V2 identity:** an active study workspace. The assignment, book boundary, video and elapsed study time are one context. Coach is a compact on-demand helper. Short labels and factual counts replace the daily briefing, motivational headlines and repeated explanations. Student headings use the system sans-serif stack; the simulated lesson slide has its own teaching typography.

| Area | V2 decision and behavior |
| --- | --- |
| Today | The current assignment is the main work surface. The production-style date/countdown/actions header leads into one large “Şimdi” card with adjacent video and page tracking on wide desktop. Daily progress and a plain upcoming-task list follow below; tablet and mobile stack the same content. The white pill sidebar has no promotional footer. |
| Inline video | A 16:9 simulated teaching slide with play/pause, seek, previous/next, completion and collapsible chapters. The toolbar clearly identifies the simulation. Position is retained independently for each lesson; changing lessons does not erase completed items. No audio, YouTube, external embedding or network API is used. |
| Two progress meanings | “Bu video” shows current position/length; “Seri” shows completed count/total. Seeking alone does not mark completion. Reaching the end through playback or choosing “Tamamladım” records a completed item. Out-of-order completions do not advance the contiguous source boundary across unwatched lessons. |
| Inline page progress | Book name, start, last saved page, target, progress and “Geldiğin sayfa” are visible in the work surface. Saving a page updates the source without inventing study minutes or silently finishing the task. Validation prevents regressions, fractional pages and values outside the assignment. |
| One study session | “Çalışmaya başla” starts the timer and available video. Video play can also start the session. Pausing the video alone leaves the timer running for book work; “Mola ver” pauses both. Resume restores the previously playing video. A second assignment cannot silently replace an open session. |
| Focus continuity | Today and `/session` render the same `CoachWorkArea` against the same reducer. Video position, completion, page draft, saved page and timer survive navigation. Focus expands the work surface and removes the main sidebar. Other B pages expose a return strip while work is active. Direct links open a ready assignment without starting the timer. |
| Finish | Time and video information are already known. Video-only work asks for no boundary input. Book work asks only for the final page, prefilled from the inline draft/saved value. The review pauses time; save records once and offers the next assignment or continuation of partial work. |
| Week | A day/capacity strip and compact task rows replace the older board composition. Add, edit, remove, daily capacity and day selection remain. A pointer-enabled handle and native drag fallback open a plan review when dropped on another future day. The labeled day menu provides the keyboard/touch alternative. Capacity, completed records, partially recorded boundaries, active work and stale proposals remain protected by demo checks. |
| Resources | Source rows expose current page/video count, overall progress, expandable saved position and continuation into Today. Reditus shows its paired video series alongside the book. Sources without today's assignment open a preselected-source task editor. |
| Coach | Small entry → contextual drawer. B's `/coach` route also remains available. Preset replies retain a bounded history and suggestions; a message never applies a plan change. Review displays affected assignments and before/after values. |
| Progress / Roadmap | Concise weekly duration, daily chart, subject balance and expandable records. Missing-subject insight updates from the fixture. Roadmap uses month selection, milestone, start/end sources and weekly load. Forecasts are labeled as examples and do not pretend to recalculate. |

**B/C differentiation:** B exposes and operates the learning material in Today and Focus; C remains the wider dashboard overview with its original task/session and resource drawer model. This changes navigation, content priority and study interaction, not only palette.

Implementation: `CoachLab.tsx`, `CoachWorkArea.tsx`, `CoachVideo.tsx`, `CoachPageTrack.tsx`, `CoachPlanViews.tsx`, `coach-workspace-context.ts`, `coach-workspace-state.ts`, the B layout file `coach-v2.css`, and the current B visual file `coach-production-fusion.css`. A/C retain their original screen files and `lab.css`. Shared task/capacity/review dialogs receive optional compact-copy props; their default A/C presentation remains intact. The development-only entry gate is unchanged.

### Review URLs

- [Bugün](http://127.0.0.1:5174/ux-lab/today?concept=coach)
- [Odak](http://127.0.0.1:5174/ux-lab/session?concept=coach)
- [Haftam](http://127.0.0.1:5174/ux-lab/week?concept=coach)
- [Kaynaklar](http://127.0.0.1:5174/ux-lab/resources?concept=coach)
- [İlerleme](http://127.0.0.1:5174/ux-lab/progress?concept=coach)
- [Yol Haritası](http://127.0.0.1:5174/ux-lab/roadmap?concept=coach)
- [Koç](http://127.0.0.1:5174/ux-lab/coach?concept=coach)

### Validation, 2026-10-02

- Full non-integration regression: **194 files / 1,456 tests pass**, including **31 UX Lab tests** (8 original transitions + 23 B workspace cases).
- Domain build, web TypeScript, scoped UX Lab lint and web production build pass. No repository-wide lint configuration is claimed; installed tools were used directly as in iteration 1.
- Existing AI Coach / plan-preview / canonical read-only safety scripts pass; the production asset scan excludes UX Lab V2 code and styles.
- **21 responsive route checks:** seven B screens × 1440×900, 834×1112, 390×844. No horizontal document overflow; Today/Focus player ratio remains 16:9.
- Browser interactions cover combined material/page save, Today ↔ Focus continuity, pause/resume, partial/full finish, next task, book-only and video-only work, zero manual video boundary fields, Coach drawer/plan approval, task add/edit, move via day menu and pointer drag, capacity rejection, resource continuation, keyboard dialog containment/restoration and loading/empty/error states.
- A and C Today text snapshots match the pre-V2 baselines exactly after exercising B. A/C screen implementations and the original stylesheet were not rewritten.
- Evidence and a repeatable review checklist: [coach-v2/README.md](ux-lab-evidence/coach-v2/README.md). Original iteration evidence remains separate.

Limitations: local memory only; refreshing resets records. Video is a simulation, Coach answers are fixtures, and roadmap forecasts are fixed examples. Browser checks do not claim a screen-reader certification or production API integration. No production migration or deployment was started.

### Rejected Concept B visual polish — historical record, 2026-10-02

The warm-stone direction below was explicitly rejected in the subsequent visual reset. Its stylesheet was removed; these notes remain only as a record of the prior iteration.

- **Selected direction:** warm stone + ink + muted mineral blue. Soft slate/sage stayed too close to B V2's green UI; cool neutral/indigo felt more like a conventional SaaS dashboard. Warm paper (`#f3f1eb`), off-white work surfaces (`#fffefa`), ink (`#27343b`) and mineral-blue interaction (`#315e69`) give the study desk a quieter editorial character. Muted green signals saved/success, ochre marks pauses/warnings, and clay red is reserved for errors. The dark blue-green video surface is distinct from, but related to, the session accent.
- **Typography and rhythm:** locally available `Candara` headings, neutral `Segoe UI` body text and tabular `Bahnschrift` numerals with system fallbacks; no remote font dependency. Stronger page/work titles, restrained metadata labels, compact ledger-like progress numbers and mobile 44px touch targets keep dense material legible.
- **Depth and motion:** a single low-shadow workspace, tonal controls, fine rules and a lighter active surface establish hierarchy. Short 150–260ms transitions explain selection, video play, session start/pause, page save, resource details, week drop targets, coach replies and dialog/drawer entry. The timer text itself does not animate on each tick. `prefers-reduced-motion` removes transitions and animations.
- **Blur and cliché restraint:** only modal/drawer backdrops get a 3px blur, disabled on narrow screens and reduced motion. Cards remain opaque. Removed decorative sparkle icons from B's coach entry; there are no neon gradients, glowing CTAs, floating effects or large AI slogans.
- **Scope:** these rules live in `coach-identity.css` after B V2's layout CSS and apply only under `.b-lab`. Today and Focus share the same workspace and state styling. A/C, production routes, data and planning behavior are unchanged.
- **Verification:** web TypeScript, scoped UX Lab lint, 31 relevant tests and the web production build pass. The production assets contain no B workspace styles. [Review captures and 21 responsive checks](ux-lab-evidence/coach-visual-polish/README.md) cover all seven B routes at desktop, tablet and mobile sizes with no horizontal overflow; video ratio is 16:9. Start/pause/resume/save, Week review, resource reveal, Coach suggestion and sample non-ideal states were exercised in the browser.

### Concept B production visual reset — current, 2026-10-02

The active Concept B styling follows the existing production frontend in `apps/web/src/styles.css`, `components/StudyTodayPanel.tsx` and `components/layout/Sidebar.tsx`. The underlying B V2 workspace, session, Week and Coach interactions remain in place.

- **Foundation:** Geist with system fallbacks; page `#f7f7f5`, white surface, text `#111113`, border `#e5e5e3`, indigo `#4f46e5`, and soft active indigo `#eef0ff`. Rendered production and Lab root tokens match for font and these six colors. No warm-stone, mineral-blue, Candara or Bahnschrift rules remain active.
- **Today:** a large date, exam countdown, planned time and direct actions lead into one dominant white “Şimdi” card with a restrained lavender tint. The assignment, inline simulated video and/or page tracker, session controls and strong indigo start action stay together. Daily progress and the plain upcoming-task list follow below the card.
- **Focus:** the same work card and reducer expand without the main sidebar. The video remains 16:9; video-only tasks show only video, book-only tasks only page tracking, and mixed tasks show both. Session and material progress persist across Today/Focus navigation.
- **Navigation and secondary views:** the product-style white pill sidebar contracts to icons and expands on hover/focus, with an indigo active state and a full clickable Coach icon area. Week, Resources, Progress, Roadmap and the Coach drawer use the same neutral/indigo hierarchy without changing their information architecture or review controls.
- **Motion:** restrained 140–220ms transitions for purposeful state changes. Blur is limited to dialog/drawer backdrops; surfaces stay opaque. Reduced-motion preference disables transitions and animations.
- **Scope:** `coach-production-fusion.css` is imported after the B layout stylesheet and scoped to `.b-lab`. The rejected `coach-identity.css` was removed. A/C, production routes, Planner authority and backend contracts were not migrated or changed.
- **Review:** [visual reset captures, responsive matrix and product-token comparison](ux-lab-evidence/coach-visual-reset/README.md). The live production Today page requires authentication in this environment, so comparison uses its checked-in components/styles and the rendered public root tokens, not a claim of an authenticated side-by-side session.
- **Final checks:** 31 targeted UX Lab tests, web TypeScript, scoped UX Lab lint and web production build pass. The production bundle contains no B workspace or visual-reset stylesheet markers. The browser recorded no console errors in the final interaction pass.

## 6. Product concept

Persistent desktop navigation and a composed Today view: dominant study action, weekly rhythm, contextual Coach and current resource. Week uses a multi-day card board on desktop and selected-day cards on mobile. Progress and resources become visible adjacent to work. Study mode retains a small resource progress summary. The comparison evaluates the usefulness and information cost of this wider overview.

Iteration 1 did not mark a preferred concept. The user's iteration 2 request selects B for further prototype work; A and C remain comparison references.

## 7. Shared design system

Implementation: `apps/web/src/ux-lab/ui.tsx`, `lab.css`, `model.ts`, `context.ts`.

| Foundation | Decision |
| --- | --- |
| Typography | Iteration 1: page 27–38px; section 21px; card 16px; body 14px; secondary 12px; metadata 9–11px. The current B reset follows the production Geist/system sans stack and uses stronger Today/work headings. A/C keep their earlier system stack. |
| Spacing | 4, 8, 12, 16, 24, 32, 48px foundation; layout sizes use consistent component rules. |
| Radius | 8px controls, 14px cards, 22px elevated surfaces; Focus reduces the largest level to 16px. |
| Surfaces | Quiet page, white card, subtle green/warm emphasis, opaque modal. No neon, decorative illustrations or glass effects. |
| States | Hover, pressed, selected, disabled with explanation, success, warning, error, loading, saving, saved and completion. |
| Components | Button, IconButton, Badge, Progress, TaskCard, PageHeading, SectionHeading, EmptyState, Skeleton, shared Modal/Drawer, task/capacity editors and PlannerDiff. |
| Navigation | Semantic links and pressed/current buttons. Native disclosure for secondary context. No popovers needed for essential information. |
| Accessibility | Labeled inputs, native dialog/background isolation, Escape, Tab/Shift+Tab containment, focus restoration, scroll lock, focus rings, live save feedback, reduced motion. Timer does not continuously announce every tick. |

Plain section surfaces use CSS rather than introducing a wrapper for every visual pattern. B V2 adds a distinct workspace composition and reducer, while reusing the shared controls, progress, dialogs and demo proposal checks.

## 8. Iteration 1 screens and working behavior — historical baseline

All three concepts include all seven experiences above.

- **Today:** next task, daily target/actual minutes, upcoming and completed work, resource and contextual Coach entry.
- **Week:** per-day and total capacity; add/edit/remove a single task; edit duration/day/boundary; review/cancel/confirm; check daily capacity before accepting a change. Completed work and partial study history are protected.
- **Study:** start → pause → resume → finish → one boundary input → saving → saved. No-progress and partial progress are supported. Today, Week, Resources and Progress read the updated shared state. A running session remains isolated from navigation.
- **Coach:** deterministic demo answers; up to three recent exchanges; contextual suggestions; explicit plan review and confirm. Text such as “onayla” still only offers review. Unavailable actions explain the reason in Turkish.
- **Roadmap:** four selectable example months and later preparation phases; workload, source start/end, milestone and risk shown inline.
- **Resources:** subject filtering; active/queued/waiting status; physical page progress; video loading skeleton; 23:15 / 49:04 current position separately from 12 / 91 completed videos. The player visibly identifies its simulation and makes no YouTube request.
- **Progress:** factual weekly minutes and planned target, daily chart, subject balance, actionable summary, secondary record list.

### Validation, 2026-10-01

| Check | Result |
| --- | --- |
| Domain and web TypeScript | PASS, strictness retained |
| Scoped lab lint | PASS via `node scripts/check-ux-lab.mjs`; strict unused checks, explicit-any check, isolated import allowlist, network/storage/unsafe-code exclusions |
| Full non-integration regression | **193 files / 1,433 tests PASS**, including 8 new lab transition tests |
| Domain + web production build | PASS; production bundle excludes lab bootstrap, styling and demo strings |
| Coach / Coach plan-preview / canonical read-only safety checks | All PASS |
| Browser responsive matrix | **54 views PASS:** 3 concepts × 6 route screens × 1440×900 / 834×1112 / 390×844; no page-level horizontal overflow |
| Mobile study flow | All three concepts: start, pause, resume, finish, correct saved page; no dialog horizontal overflow |
| Functional browser smoke | Plan proposal/review/approval and Week result, add/cancel/remove, capacity rejection, video controls, empty/error/loading/unavailable states, focus containment and restoration |

The repository has no root lint script or ESLint setup. `pnpm typecheck` and `pnpm lint` stalled in the local package-manager bootstrap and were stopped. Installed TypeScript/Vitest/Vite binaries were used directly; a specifically scoped `lint:ux-lab` command was added rather than claiming repository-wide lint coverage. Existing `test:v1-e2e` is a database/HTTP mutation script, not a browser harness, so it was not used for this offline prototype. Browser smoke evidence and a repeatable checklist are in [ux-lab-evidence/README.md](ux-lab-evidence/README.md).

## 9. Known open questions — historical baseline and V2 status

V2 resolves the initial direction choice toward B, adds its contextual Coach drawer and pointer/day-menu movement, and makes video progress automatic at finish. The original questions below remain recorded to preserve the first evaluation context; production persistence, integration and user studies are still outside this work.

- Compare task-first Focus, explanation-first Coach and wider Product with actual students before choosing a direction.
- Should Coach stay a destination or also open as a contextual panel? The demo makes it easy to reach without overlaying the current plan.
- Drag-and-drop is intentionally deferred; labeled day selection works with keyboard, touch and screen readers and remains an alternative if dragging is added later.
- The player is a simulation, not live YouTube playback. Coach uses preset interpretations, not a language model. Roadmap dates/loads and completion estimates are fixtures, not planner calculations, and do not recalculate with edits.
- Refresh persistence, authentication, resource creation/import, settings, actual exam calendar and production capability discovery are outside this iteration.
- An in-memory plan review is only an interaction model. Its version check is not a substitute for server freshness, exact confirmation, protected commitments or atomic Apply.
- An automated browser test runner and a full assistive-technology audit remain future work; this iteration has tool-driven browser checks plus regression tests.

## 10. Migration strategy into real frontend — historical prototype boundary

**Stop at prototype evaluation. No production migration is included.**

1. Choose an interaction direction from observed student tasks, keeping the shared pieces that work across concepts.
2. Map existing authoritative `task-material-presentation`, persisted page/video boundaries and progress to the selected presentation. Do not infer material identity or workload from titles.
3. Replace one presentation at a time behind the established application boundary. Preserve Today/Week material continuity and the existing accessible dialogs.
4. Keep Week as the sole owner of canonical Planner lifecycle. Coach remains interpretation, explanation and navigation. Explicit preview/review, exact confirmation, freshness checking and separately gated Apply retain their existing server authority.
5. When a production capability is unavailable, present a plain-language explanation. Never activate Confirm/Apply because the demo has an enabled button.
6. Reconnect sessions only to the sanctioned overlap/idempotency-safe recording flow. Replace demo transitions; do not reuse the local state model as business logic.
7. Re-run existing material, session, Planner/Coach safety and product acceptance tests, then obtain the separately scoped production migration/release authorization.

Historical sprint/handoff evidence remains unchanged. Evre 7 stays closed; Evre 8/9 and all production gates retain their previously recorded status.

## 11. Accepted Concept B source migration — 2026-10-05

The user accepted B V2 and visual reset and authorized local migration into the real frontend with new top application navigation. Sidebar and its offsets were removed; the shared white 64px/60px sticky navbar uses existing routes/auth, mobile menu, distinct contextual Coach action and account controls. Lab B uses that same component under its separate black review toolbar.

Today/Focus share one persistent real study workspace; actual YouTube and page APIs replace Lab simulation in the product. Week retains real Planner authority and uses existing reviewed carryover/manual-plan flows. Resources continuation and quieter Progress/Roadmap hierarchy were added. Lab timer, material/proposal reducers, canned Coach, identity and fixture data stay development-only.

Source implementation, typecheck/build, 1463 tests and safety checks pass. Lab B navigation/browser evidence passes. **Authenticated full product smoke is pending** because localhost Supabase/Auth is down and Docker is absent. No production fallback or release acceptance claim.

Full API/action map, limitations, screenshots and local links: [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md) and [frontend-migration evidence](ux-lab-evidence/frontend-migration/README.md). No deploy, production SQL/migration/data mutation, gate/secret/provider change or remote push/merge occurred. **NOT DEPLOYED**.
