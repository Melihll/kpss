# Concept B / Coach V2 — browser evidence

2026-10-02. Isolated, development-only UX Lab. All operations below use in-memory example data.

## Screenshots

- [Desktop Today](desktop-today.png): assignment, inline video, page tracker, session controls and compact daily rail.
- [Desktop Focus](desktop-session.png): shared work context after a page save and pause.
- [Desktop Week](desktop-week.png) and [plan review](desktop-plan-review.png): moving an assignment requires explicit confirmation.
- [Tablet Today](tablet-today.png): stacked materials without horizontal overflow.
- Mobile Today: [video](mobile-today-video.png), [saved page and controls](mobile-today-page.png).
- Mobile [Focus](mobile-session.png), [finish](mobile-finish.png), and [Coach drawer](mobile-coach.png).

Viewport screenshots are intentionally separate for the upper/lower mobile work areas. No stitched screenshot is used as evidence because fixed navigation can be duplicated during full-page capture.

## Responsive checks

[responsive-checks.json](responsive-checks.json) records the seven B routes at 1440×900, 834×1112 and 390×844. All 21 views had zero document-level horizontal overflow; Today and Focus player ratios were 16:9. [workspace-final-checks.json](workspace-final-checks.json) records the final Today/Focus recheck after reducing the redundant breadcrumb/header space, including 320px width.

The important controls were also operated after scrolling: the mobile page field accepted 151/154, save feedback appeared, session controls stayed above the fixed bottom navigation, and the finish/Coach dialogs stayed within the viewport. Opening Focus preserved the input value and paused elapsed time. Dialog Tab/Shift+Tab remained inside; Escape restored focus to “Bir şey sor”.

## Interaction checklist — passed

1. Today: start → inline video advances with timer → enter/save 151 → Focus → pause → Today. Same book value and paused time remain. Resume and finish use that saved value.
2. Finish the book target at 158 → save → next assignment. Mathematics shows only the physical page tracker. Selecting economics shows only video.
3. Economics: start → “Tamamladım” → finish. The summary has **zero manual page/video boundary inputs** and shows 13/91 completed.
4. Video positions and completion are separate. Previous/next retain each lesson's position. Reducer tests additionally verify natural completion, seek without fabricated completion, pause precision and idempotent session save.
5. Coach: open drawer → ask about Friday → review → approve. Friday mathematics moves to Saturday and law becomes 45 minutes. Unavailable-operation scenario disables approval with an explanation.
6. Week: move mathematics through its labeled day menu → review → confirm. Pointer-drag the handle onto Friday → review → confirm. Edit its duration to 50 minutes → review → confirm; the row updates.
7. Week: add “Tekrar soruları” → confirm. Reduce Friday capacity to 30 minutes → review rejects the overloaded day. Cancel leaves the plan unchanged.
8. Resources: Reditus shows saved page 154 and 12/41 paired videos. “Çalışmaya devam et” returns to Today with 154 retained.
9. Empty, error/retry, loading, reset and blocked scenarios remain usable. Loading is exited through the scenario selector.
10. A/C Today text snapshots exactly matched their pre-V2 baselines after B interactions. Their original screen compositions and stylesheet were preserved.

## Code checks

- Full non-integration suite: **194 files, 1,456 tests passed**.
- UX Lab suite: **31 tests passed**, including 23 new workspace cases; rerun after final reducer changes.
- Domain build, web typecheck, scoped lab lint and web production build passed.
- AI Coach, plan-preview and canonical read-only safety scripts passed.
- Production asset scan found no B player/workspace classes or UX Lab identifiers.

The test package emits expected diagnostic messages from deliberately failing Coach fixture lookups; the suite itself passed. These are tool-driven browser checks plus pure-state tests, not a claimed automated end-to-end runner or complete assistive-technology certification.

## Repeat the main review

Open [Today](http://127.0.0.1:5174/ux-lab/today?concept=coach), use the reset button, then repeat steps 1–3. Inspect [Week](http://127.0.0.1:5174/ux-lab/week?concept=coach), [Resources](http://127.0.0.1:5174/ux-lab/resources?concept=coach), [Progress](http://127.0.0.1:5174/ux-lab/progress?concept=coach) and [Roadmap](http://127.0.0.1:5174/ux-lab/roadmap?concept=coach). A reload intentionally resets example progress; this prototype has no real video/audio, API access or persistence.
