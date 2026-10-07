# KPSS Koçu — Official logo integration

> **2026-10-06 release readiness: NO-GO / NOT DEPLOYED.** Brand paths/assets/favicon and existing responsive sizing passed source/build checks; no new brand blocker was found. Overall release is blocked by dirty source, a local backend endpoint in the fresh build, video checkpoint failure/backpressure and pending complete authenticated product smoke. [Final freeze audit](CONCEPT_B_RELEASE_FREEZE.md). Firefox/Safari runtime and numerical CLS remain unmeasured; dated logo acceptance/evidence below remain unchanged. No production operation, commit or push.

**2026-10-06 · LOCAL/DEV source integration complete · NOT DEPLOYED**

The supplied official design now appears in the real frontend and the shared Concept B product navigation. The user explicitly confirmed the Downloads file without the attachment's `(1)` suffix. The original K, sparkle, ocean waves, gradients, wordmarks, colors and geometric proportions were preserved.

## Assets

| Variant | Repository path | Dimensions / viewBox | Size |
| --- | --- | --- | --- |
| Unchanged source | `assets/brand/source/kpss-kocu-logo.svg` | 1200 × 600 / `0 0 1200 600` | 8,190 B |
| Transparent full logo | `apps/web/public/brand/kpss-kocu-logo.svg` | 728 × 304 / `220 142 728 304` | 7,837 B |
| Transparent compact mark | `apps/web/public/brand/kpss-kocu-mark.svg` | 289 × 304 / `220 142 289 304` | 1,764 B |

The source copy matches `C:/Users/drlme/Downloads/kpss-kocu-logo.svg` byte for byte. SHA-256: `8c4fcc1aa2f3f60d45da5db5874df88f0392a0a84e6f5f08e77c874824778895`.

The white canvas was removed from web variants and the root viewBox was cropped around visible paint, with approximately two source units of padding. Whitespace between tags was removed. Full-logo geometry and all six gradient definitions match the source; the compact variant preserves the existing `brand-mark` subtree and its three gradients. Mask/outline/descender bounds were included in the crop. No vector paths were simplified or rounded.

Structural comparisons and renders are recorded in [asset-verification.json](brand-evidence/asset-verification.json). Changing root canvas coordinates produces tiny edge antialiasing differences in the QA renderer; raster output is not claimed to be bit-identical. The underlying geometry and color attributes are identical.

## Usage

- **Desktop:** full logo at approximately **129 × 54 px**, within the existing **64 px** white header. Symmetric brand/action columns keep primary navigation centered. Focus uses wider symmetric columns for Coach + return actions.
- **Tablet:** full logo at the same size; primary destinations move into the existing menu at 1000 px and below. Coach/account/menu spacing remains usable.
- **Mobile:** at 600 px and below, `picture` selects the K mark at approximately **34 × 36 px**, inside a **44 × 44 px** link. The header remains **60 px** high.
- **Login/register:** full logo at approximately **196 × 82 px**, with one meaningful image alt. The profile-required state uses the compact mark.
- **Concept B Lab:** shares `TopNavigation`, so its product header uses the same assets. The separate UX Lab review toolbar remains intact.

`TopNavigation` uses the existing React Router `Link`: product logo → `/`; Lab logo → `/ux-lab/today?concept=coach`. Desktop and mobile Week → logo → Today flows passed. There is no new location assignment or full-page reload handler. The existing persistent product player remained mounted during the observed route flow.

The logo link has one accessible name, **“KPSS Koçu — Bugün”**. Its image uses empty alt and `aria-hidden`, and there is no duplicate plain-text wordmark. The accessibility snapshot exposes one brand link. White navigation was retained; the dark wordmark is readable on that surface. No recoloring, white-logo hack, UI accent changes or ocean gradients elsewhere were introduced.

## Favicon

**USED.** `apps/web/index.html` references `/brand/kpss-kocu-mark.svg` as an SVG favicon. The existing K remains recognizable at **16, 32 and 48 px**; the tiny sparkle is naturally less distinct at 16 px. No replacement symbol or raster web icon was designed. See [scale comparison](brand-evidence/mark-scale-comparison.png) and the individual native-size PNG evidence.

## SVG compatibility

**Syntax/reference verification: PASS. Actual Chromium rendering: PASS.**

Both files parse as XML, have no background rectangle, unresolved internal references, external image/font/link resources, scripts or foreign objects. The full logo retains `gradientUnits="userSpaceOnUse"`, the original mask, and both modern `href="#caps"` and legacy `xlink:href="#caps"` on `use`. The mark requires only ordinary vector paths and gradients.

This uses SVG syntax compatible with Chrome, Firefox and Safari. The available in-app Chromium browser displayed the gradients, mask, full wordmark and compact mark without clipping. **Native Firefox and Safari execution was not available and is not claimed.** [Static checks](brand-evidence/svg-syntax-verification.json).

Both public assets returned locally as SVG, and their build copies have identical SHA-256 checksums. The build excludes UX Lab code. PNGs are QA artifacts only.

## Responsive and layout validation

**PASS for the primary desktop/tablet/mobile matrix**, verified in the authenticated real frontend and Concept B Lab on 2026-10-05/06.

| Viewport override | Logo | Header | Result |
| --- | --- | --- | --- |
| 1440 × 900 | Full, ~129 × 54 px | 64 px | Centered navigation; no wrap, overlap, distortion or clipping |
| 834 × 1112 | Full, ~129 × 54 px | 64 px | Coach/account/menu fit; no horizontal overflow |
| 390 × 844 | Mark, ~34 × 36 px | 60 px | Brand and menu fit; no horizontal overflow |
| Login (1440/390/320 px), register (390 px) | Full, ~196 × 82 px | Auth card | Proportions and single accessible image preserved |
| Lab Focus, desktop and mobile | Full / mark | 64 / 60 px | Explicit return remains usable; centered desktop Focus label |

Additional 600/601 and 1000/1001/1024 px breakpoint probes verified header layout. Picture source selection was verified after settling at the primary sizes and 1024 px. The real frontend has an existing global `body { min-width: 320px }`: at a 320 px override with a visible 15 px scrollbar, it produces 15 px of page overflow. The brand and header controls still fit the 320 px header; this pre-existing page minimum was not changed by the logo task. Auth at 320 px retained the correct logo ratio.

Intrinsic `width`/`height` and matching CSS `aspect-ratio` reserve the logo box. Loaded dimensions remained consistent across route transitions; screenshots showed no logo-induced movement. **A numerical PerformanceObserver CLS measurement was not collected.** DOM measurements, observations and limitations: [browser-measurements.json](brand-evidence/browser-measurements.json). [Screenshot index](brand-evidence/README.md).

## Checks

| Check | Result |
| --- | --- |
| Relevant frontend tests | **10/10 PASS**, 3 files: TopNavigation, StudyMaterialWorkspace, today-focus |
| Web TypeScript check | **PASS** — `node node_modules/typescript/bin/tsc -b apps/web --pretty false` |
| Existing scoped UX Lab lint | **PASS** — 19 files, strict unused/import isolation checks |
| Local Vite build | **PASS** — 328 modules; both SVG assets included |
| Source preservation / XML / internal references | **PASS** |
| Whitespace diff check | **PASS** |

Initial restricted-shell checks encountered Windows pnpm junction access errors; the same checks passed with host access. No dependency/configuration changes were needed for branding. This task used relevant regression checks; the previous 1509-test video acceptance run remains separate historical evidence.

## Scope and review

Review the actual app at [local frontend](http://127.0.0.1:5174/) or [Concept B Lab](http://127.0.0.1:5174/ux-lab/today?concept=coach).

Only source assets, frontend branding/layout and local evidence/docs were changed. The existing local account was used to verify the header and auth screens, then its session was restored. **Production: NOT DEPLOYED.** No production SQL/mutation, schema change, remote push/merge or release freeze work was performed.
