# Shotexa V2.1 Beautifier visual polish

This folder is the review package for the focused Beautifier Studio refinement on
`codex/shotexa-v2-1`. The before images are retained from the first V2.1 browser
capture; the after images and PNG exports were captured from the edited application
through Playwright. No production service or external image processor was used.

## Compare the same source

| Before | After |
| --- | --- |
| [Studio with Shotexa homepage](before/studio-homepage.png) | [Refined Studio with Shotexa homepage](after/studio-homepage.png) |
| [Narrow background library](before/background-library.png) | [Expanded background library](after/background-gallery-desktop.png) and [lower collection](after/background-gallery-lower.png) |

The homepage source was captured from the local Shotexa site. The other source
screenshots are original local HTML test fixtures rendered in Playwright, not
third-party products or claimed customer screenshots. Their exact pixels are in
[sources](sources/).

## Gallery and editor captures

- [Desktop template collection](after/template-gallery-desktop.png)
- [Desktop dashboard composition](after/dashboard-editor-desktop.png)
- [Desktop website composition](after/website-editor-desktop.png)
- [Desktop code/documentation composition](after/docs-editor-desktop.png)
- [Mobile template collection](after/template-gallery-mobile.png)
- [Mobile editor](after/mobile-editor.png)

## Encoded full-resolution exports

- [Dashboard, 1600 × 900](exports/dashboard-16x9.png)
- [Website, 1080 × 1350](exports/website-4x5.png)
- [Mobile app, 1080 × 1920](exports/mobile-9x16.png)
- [Documentation, 1080 × 1080](exports/docs-1x1.png)

## Implementation notes

The curated library has 18 original vector Canvas scenes. Each uses a different
motif and a small, fixed number of gradients, strokes, and shapes. The same
`drawBeautified` pipeline paints thumbnails, the live canvas, and exported
images. No raster artwork, external requests, or new runtime dependency is
needed. The template collection has 12 compositions; the inspector keeps quick
picks and the full gallery offers larger previews of the uploaded screenshot.
Portrait screenshots prioritize the mobile and editorial templates.

Gentle perspective compositions use one affine draw to keep the preview crisp;
stronger 3D transforms retain the existing piecewise projection. The stage
caps its perspective preview backing width at 1600 pixels, and gallery cards
release their canvases when hidden or replaced.

The visual examples cover four source kinds and 16:9, 4:5, 9:16, and 1:1 output.
The browser test inspects each encoded PNG's dimensions and compares live
background pixels with the export. The original screenshots, user text,
workspace images, branding, and multi-image settings remain editable.

## Verification (17 October 2026)

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npx vitest run src/tests/unit`: 51 files, 793 tests passed.
- New visual Playwright suite: 5 Chromium and 5 WebKit tests passed. The tests
  export and decode all four example compositions, check output dimensions and
  preview/background color parity, and exercise the desktop and mobile galleries.
- Existing Beautifier Playwright regression suite: 17 Chromium tests passed,
  including multi-image, perspective, branding, animation, undo/redo, preview
  parity, mobile controls, and workspace continuation.
- `npm run build` and `git diff --check`: passed.

These browser results cover automated Chromium and WebKit. A physical iPhone or
Safari device was not available for a real-device visual check.

## Local review

From `D:\shotexa`:

```powershell
npx next dev -p 3100
```

Open `http://localhost:3100/screenshot-beautifier`, upload one of the files
in `docs/v2.1/visual-polish/sources/`, then use **Browse full-size previews**.
The exact export exercise can be repeated with:

```powershell
$env:E2E_BASE_URL='http://localhost:3100'
$env:CAPTURE_BEAUTIFY_POLISH='1'
npx playwright test src/tests/e2e/beautify-production-visual-polish.spec.ts --project=chromium
```

The capture flag overwrites only the images in this review package.
