# Logo integration evidence

Local verification captured on 2026-10-05/06. The PNGs are evidence, not website assets. The official website files remain SVG.

| Evidence | Purpose |
| --- | --- |
| `asset-verification.json` | Original SHA-256, source preservation, exact geometry/gradient comparison and renderer edge differences |
| `svg-syntax-verification.json` | XML parsing, reference integrity, gradients/mask and absence of executable/external nodes |
| `local-asset-responses.json` | Local public SVG responses: HTTP 200 and `image/svg+xml` |
| `browser-measurements.json` | Observed dimensions, selected assets, accessible labels and measurement limitations |
| `source-preview.png`, `full-preview.png` | Original canvas and transparent cropped full-logo render |
| `mark-16px.png`, `mark-32px.png`, `mark-48px.png` | Native small-size favicon readability |
| `mark-scale-comparison.png` | Nearest-neighbor enlargement of the three sizes for inspection |
| `product-desktop-1440.png`, `product-tablet-834.png`, `product-mobile-390.png` | Authenticated product navigation |
| `lab-desktop-1440.png`, `lab-tablet-834.png`, `lab-mobile-390.png` | Concept B header, distinct from the unchanged review toolbar |
| `lab-focus-desktop-1440.png`, `lab-focus-mobile-390.png` | Shared header in Focus |
| `login-desktop-1440.png`, `login-mobile-390.png`, `register-mobile-390.png` | Actual auth screens with full logo |

Viewport filenames identify requested overrides; visible scrollbars can reserve approximately 15 px of client width. Browser evidence comes from the available Chromium in-app browser. Firefox/Safari runtime coverage and numerical CLS values are not asserted.

Results and remaining platform limitations: [LOGO_INTEGRATION.md](../LOGO_INTEGRATION.md). **NOT DEPLOYED.**
