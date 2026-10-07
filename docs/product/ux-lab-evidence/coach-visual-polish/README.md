# Concept B visual identity review

Local preview: `http://127.0.0.1:5174/ux-lab/today?concept=coach`. Replace `today` with `session`, `week`, `resources`, `progress`, `roadmap` or `coach` to review each screen.

The selected direction is warm stone + ink + muted mineral blue. Screenshots here cover the shared Today/Focus workspace, Week, Resources, Progress, Roadmap, a contextual Coach drawer and mobile Today/Focus. `mobile-focus-lower.png` shows the page and session controls after scrolling; viewport captures avoid the in-app browser's full-page image stitching artifact.

`responsive-checks.json` records 21 route/viewport checks at 1440×900, 834×1112 and 390×844: no horizontal document overflow and a 1.778 video ratio on Today/Focus. Interactive checks covered start/pause/resume/save, Week move review and approval, resource detail reveal, Coach suggestion reveal, loading/empty/error/blocked examples, and A/C isolation. The preview console had no errors.

Motion is limited to short state transitions. `prefers-reduced-motion` removes it. The 3px backdrop blur is confined to B dialogs/drawers, and is disabled at mobile widths. These checks are browser and visual QA for an offline prototype, not production integration or assistive-technology certification.
