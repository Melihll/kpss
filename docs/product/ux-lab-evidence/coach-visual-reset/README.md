# Concept B — production visual reset review

Open the running Lab at [Today](http://127.0.0.1:5174/ux-lab/today?concept=coach), [Focus](http://127.0.0.1:5174/ux-lab/session?concept=coach), [Week](http://127.0.0.1:5174/ux-lab/week?concept=coach), [Resources](http://127.0.0.1:5174/ux-lab/resources?concept=coach), [Progress](http://127.0.0.1:5174/ux-lab/progress?concept=coach), [Roadmap](http://127.0.0.1:5174/ux-lab/roadmap?concept=coach), and [Coach](http://127.0.0.1:5174/ux-lab/coach?concept=coach).

This reset keeps Concept B V2's study and planning interactions while adopting the existing production frontend's visual foundation. The source comparison used `apps/web/src/styles.css`, `components/StudyTodayPanel.tsx`, and `components/layout/Sidebar.tsx`. The live production Today route redirected to sign-in, so its authenticated state was not available for side-by-side capture. [Rendered token comparison](product-token-comparison.json) confirms the production and Lab root font, background, surface, text, border, primary and soft-primary values match.

## Captures

| View | Evidence |
| --- | --- |
| Today desktop | [top](desktop-today.png), [work card and task list](desktop-today-lower.png) |
| Focus desktop | [work surface](desktop-focus.png) |
| Week and plan review | [week](desktop-week.png), [review dialog](week-review.png) |
| Resources, Progress, Roadmap | [resources](desktop-resources.png), [progress](desktop-progress.png), [roadmap](desktop-roadmap.png) |
| Contextual Coach | [drawer](coach-drawer.png) |
| Today mobile | [top](mobile-today.png), [material and progress](mobile-today-lower.png) |
| Focus mobile | [top](mobile-focus.png), [material and controls](mobile-focus-lower.png) |

[Responsive checks](responsive-checks.json) cover all seven Concept B routes at 1440×900, 834×1112 and 390×844. No route has document-level horizontal overflow; Today and Focus retain a 16:9 video. Browser interaction checks covered Today → Focus continuity, start/pause/resume/save, task and capacity editors, contextual Coach, Week review, and book-only/video-only/mixed material states. A/C were sampled after the reset and remain outside the B-scoped style rules.

The prototype uses local sample data. Video, Coach replies and roadmap forecasts are simulations. No production migration or deployment is included.
