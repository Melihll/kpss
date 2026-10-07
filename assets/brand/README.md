# Official KPSS Koçu logo

The user confirmed `C:/Users/drlme/Downloads/kpss-kocu-logo.svg` as the official supplied asset. The attachment's `(1)` filename suffix was absent on disk; this exact file was explicitly approved.

`source/kpss-kocu-logo.svg` is the unchanged 1200 × 600 original, including its white canvas. SHA-256:

```text
8c4fcc1aa2f3f60d45da5db5874df88f0392a0a84e6f5f08e77c874824778895
```

Web variants live in `apps/web/public/brand/`:

| Asset | viewBox | Intended use |
| --- | --- | --- |
| `kpss-kocu-logo.svg` | `220 142 728 304` | Desktop/tablet navigation, login/register |
| `kpss-kocu-mark.svg` | `220 142 289 304` | Mobile/compact navigation, favicon, profile-required state |

Only the white background rectangle, surrounding canvas and between-tag whitespace were removed. The full logo keeps all original geometry, transforms, colors, six gradients and the wordmark mask. Its internal `use` retains `xlink:href` and also supplies modern `href`.

The compact asset copies the existing `brand-mark` group, including its original sparkle and parent translation. It keeps the group's three original gradients and removes unused wordmark definitions. Do not redraw or recolor either variant.

The crops include approximately two source units of padding around rendered paint bounds; masked shapes and the `ç` descender were included. Wordmarks are vector paths, with no external fonts or image resources.

PNG renders in `docs/product/brand-evidence/` are verification evidence only. The website uses SVG throughout. Integration and validation: `docs/product/LOGO_INTEGRATION.md`.
