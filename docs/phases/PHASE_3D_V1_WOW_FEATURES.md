# Phase 3D — Final V1 Wow Features

Status: complete for review. This is the final major V1 product-enhancement phase. Work is on `phase-3d/v1-wow-features`, based on `phase-3c/v1-power-tools`. Nothing in this phase was committed, pushed, merged or deployed.

The phase stays inside the existing sixteen Shotexa tools and temporary local workspace. It adds no account system, cloud storage, server image processing, SEO route, persistent project, automatic privacy detection, extension or workflow engine.

## 1. Features proposed

| Tool | Proposed V1 enhancement group | Decision |
| --- | --- | --- |
| Beautifier | Blurred screenshot background; custom canvas; title/subtitle; local watermark; conservative perspective; borders; stronger shadows; 1×/2×/4× export; Copy PNG; more recipes | Implemented except watermark and perspective |
| Editor | Straighten; non-destructive adjustments; filter presets; before/after; transparent/uniform trim; guides | Implemented except uniform-border trim |
| Compare | Heatmap; flicker; synchronized zoom/pan; OpenCV alignment; changed regions; summary; OCR diff; richer file details; report export | Implemented heatmap, flicker, linked zoom/pan, regions, summary and file details; deferred alignment, OCR diff, metadata-category diff and report export |
| Convert | PNG/JPEG/WebP comparison; measured recommendation; filename; transparency preview; Copy PNG; web export pack | Implemented |
| Annotation | Line, ellipse, duplicate, layering and optional magnifier | Deferred |
| Safe Share | Duplicate region, numeric geometry and quick mode switching | Deferred |
| Split | Naming template and intentional overlap | Implemented |
| OCR | Download edited text as Markdown; optional region OCR | Deferred |
| PDF | Portrait/landscape and page-number placement | Deferred |
| Batch | Filename prefix/suffix, aggregate savings and result filters | Implemented |

The implementation order was Beautifier, Compare, Editor, Convert, then the safe smaller-tool additions. Each selected feature had to preserve local processing, preview/export agreement, bounded previews, Blob-first output and controlled failures.

## 2. Features implemented

### Beautifier

- Added a blurred-screenshot background mode. It draws the existing source bitmap enlarged to cover the canvas, then applies adjustable blur, brightness and saturation. It does not retain a second full-resolution source.
- Added custom width and height with optional aspect-ratio locking. Existing presets remain available.
- Added optional title and subtitle at the top or bottom with font size, weight, alignment, colour, spacing and maximum-width controls.
- Added `None`, `Solid` and translucent `Glass` borders with width, opacity, colour and radius controls.
- Added `None`, `Soft`, `Float`, `Strong`, `Hard` and `Glow` shadow presets plus X, Y, blur, spread and opacity controls.
- Added safe 1×, 2× and 4× output. Final dimensions are shown before export and validated before canvas allocation.
- Added Copy PNG after a PNG result exists. Clipboard capability is detected and unsupported browsers receive a normal download-oriented fallback message.
- Expanded recipes to Clean, Launch, Product, Documentation, Glass, Dark, Minimal, Soft, Gradient and Developer. Every recipe is only a settings patch over the shared renderer.
- Preserved browser/phone frames, gradients, positioning, screenshot-colour backgrounds, Auto layout and all Phase 3C canvas presets.

### Compare

- Added a deterministic pixel-difference heatmap. It uses the existing thresholded pixel analysis and makes no semantic or AI claim.
- Added deterministic connected-component grouping for changed regions. The UI reports region count, bounding box, changed pixels and approximate inspected-area percentage.
- Added Sensitivity, Minimum region size, Merge distance and Ignore tiny differences controls. Clicking a region focuses its bounding box in the shared viewport.
- Added A/B flicker with Play, Pause and speed controls. Playback remains off when reduced motion is requested.
- Added synchronized Fit, 100%, Zoom in and Zoom out controls. Both inputs share one viewport transform, preserving alignment.
- Expanded the difference summary to changed pixels, changed percentage, unchanged percentage and region count, explicitly labelled as preview-resolution analysis.
- Added side-by-side file details: dimensions, aspect ratio, format, file size and detected alpha/transparency.
- Kept side-by-side, slider, overlay, difference, swap, sensitivity and PNG comparison export through the existing renderer.

### Editor

- Added free straighten from −15° to +15° with slider, numeric input and reset.
- Integrated straighten into the canonical transform matrix. Bounds expand deterministically; preview and full-resolution export use the same transform order rather than CSS rotation.
- Added non-destructive Brightness, Contrast, Saturation, Warmth, Grayscale and Exposure settings.
- Added Original, B&W, Warm, Cool, High Contrast and Soft presets built from the same adjustment values.
- Added an Original/Edited before-and-after control without retaining a duplicate full-resolution image.
- Added Trim transparent edges. It scans alpha bounds and keeps a one-pixel safety margin rather than making content-aware guesses.
- Added optional rule-of-thirds and centre guides. Guides are interaction-only and never exported.
- Preserved crop, resize, quarter-turn rotation, flip, undo/redo and cross-tool continuation.

### Convert

- Added a bounded local PNG/JPEG/WebP comparison. One decoded source is reused; formats are encoded sequentially and measured rather than estimated.
- Added a candidate table showing format, measured bytes, savings versus source, quality and transparency support.
- Added factual conclusions such as which measured candidate is smallest, whether PNG preserves transparency and whether JPEG requires flattening.
- Added candidate selection for final export.
- Added custom output filenames with invalid-character sanitisation and enforced extensions.
- Kept the checkerboard transparency preview and added clear JPEG flattening status with White, Black, Cream and Custom background choices.
- Added Copy PNG when the browser supports writing PNG Blobs to the Clipboard API, with a graceful unsupported-browser fallback.
- Added Export for Web. It lazily loads the existing ZIP engine and creates `image.webp`, `image.png`, and `picture-snippet.html`, plus copyable `<picture>` markup. AVIF was not added.

### Split

- Added a naming template using `{n}`, for example `screenshot-{n}.png`. Names are sanitised and retain the correct extension inside individual downloads and ZIPs.
- Added 0 px, 20 px, 50 px and custom overlap. Following pieces deliberately begin early so the selected number of rows is duplicated.
- Added explanatory text that overlap intentionally duplicates pixels between pieces.

### Batch

- Added filename prefix and suffix controls with sanitisation.
- Added Original total, Output total, Bytes saved and Savings percentage.
- Added All, Successful and Failed result filters without changing the sequential one-file-at-a-time processing model.

## 3. Features deferred

- Beautifier local watermark/logo and perspective/3D tilt.
- Editor uniform-border trim.
- Compare automatic alignment, OCR text diff, metadata-category differences and comparison report export.
- Annotation line, ellipse, duplicate, bring forward, send backward and magnifier.
- Safe Share duplicate region, numeric X/Y/width/height editing and quick mode switching.
- OCR Markdown download and region OCR.
- PDF orientation and page-number placement.

## 4. Why each deferred feature was deferred

| Deferred feature | Reason |
| --- | --- |
| Beautifier watermark/logo | A second local image needs its own preview/full-resolution decode, object URL, bitmap ownership, undo state and cleanup tests. Adding it late would weaken the phase's single-source lifecycle guarantee. |
| Beautifier perspective/3D tilt | A true projective transform needs deterministic projective sampling, correct bounds and tiled large-output parity. Browser canvas affine transforms would only imitate perspective and were not accepted as a reliable implementation. |
| Editor uniform-border trim | Reliable uniform-border detection needs a documented tolerance and alpha/colour/noise policy. The safe transparent-edge case was implemented; aggressive or surprising crop was not. |
| Compare auto-align | Translation plus scale alignment needs confidence scoring, visible transform disclosure and false-alignment fixtures. Existing OpenCV is lazy, but reuse alone does not make the user-visible result robust. |
| Compare OCR text diff | Two OCR runs, reading-order normalisation and an understandable added/removed/changed model need dedicated lazy-engine and language fixtures. It was not reduced to a raw string diff. |
| Compare metadata-category diff | The current file facts are cheap and deterministic. Deeper metadata comparison would require two lazy inspections and a new disclosure model. |
| Compare report export | A truthful report depends on the deferred alignment/OCR choices and would add another generated-document lifecycle. No partial report format was shipped merely to increase feature count. |
| Annotation additions and magnifier | These change vector object schemas, hit testing, selection ordering and export rendering. Magnifier also adds a sampled-image object. They require a focused preview/export parity pass. |
| Safe Share additions | The relevant source surface is exposed through a filesystem reparse boundary that the repository-safe patch path cannot modify in this environment. No unsafe bypass was used. Existing verified Blur, Pixelate and Blackout export remains intact. |
| OCR Markdown / region OCR | The OCR tool surface is behind the same repository-safe reparse boundary. Region OCR also needs source-to-preview geometry and was explicitly optional. |
| PDF orientation / page numbers | Both normal and searchable PDF plans must remain visually identical. The PDF source surface is behind the repository-safe reparse boundary, so it was left unchanged rather than editing around repository protections. |

## 5. Architecture changes

- `BeautifySettings` now carries background-image, typography, border, shadow and export-scale settings. `beautifyLayout` calculates one composition; `drawBeautified` draws both bounded preview and final export.
- Blurred backgrounds reuse the same decoded bitmap as the foreground. The final path validates scaled output dimensions before allocation.
- Editor adjustment and straighten values are serialisable transform settings. The canonical matrix expands rotated bounds, and the shared transform renderer applies geometry and pixel adjustments for both preview and export.
- Compare difference analysis now returns width, height, pixel totals and connected regions from one deterministic preview buffer. Heatmap and normal difference are modes of the same renderer.
- Compare pan and zoom are one viewport state applied to both images; no independent drift-prone transforms were added.
- Convert adds an `image.compareFormats` worker operation. It decodes once, encodes sequential bounded candidates and returns measured Blobs. Web-pack code is dynamically imported only on intent.
- Split overlap is represented in the split plan, so rendering and filenames remain deterministic and ZIP export receives the same planned pieces.
- Batch naming and summaries extend the existing queue/result model; processing remains sequential and isolated per file.
- No second renderer, server endpoint, route, database, dependency or persistent storage layer was introduced.

## 6. Memory impact

- Interaction previews remain reduced-resolution. Full-resolution work occurs only for final processing/export.
- No product path uses `toDataURL`; output remains Blob-first. The only repository `toDataURL` occurrence is the pre-existing memory spike that compares APIs.
- Beautifier blur reuses one bitmap. It does not retain a second full-resolution screenshot.
- 2×/4× Beautifier dimensions are checked before allocation. Unsafe canvas sizes fail with a controlled error.
- Compare analysis uses bounded preview pixels. OCR and OpenCV remain unloaded because the deferred features never request them.
- Convert decodes once and encodes candidates sequentially. Candidate Blobs are owned by the current result and discarded when results/settings are replaced or the tool unmounts.
- The existing `AssetRegistry` closes replaced/removed `ImageBitmap`s, revokes object URLs and clears Blob references. `WorkspaceRuntime.dispose()` also disposes workers and result registries.
- Large image jobs preserve WorkerBroker recycling. Vision is not kept beside large composition jobs.
- Temporary canvases continue to be released by resetting dimensions after use.

## 7. Mobile behavior

- All six changed tool suites retain dedicated 390 × 844 production-browser coverage.
- Dense settings stay in the existing mobile sheet rather than a horizontal toolbar.
- Beautifier groups recipes and advanced controls in wrapped or stacked controls; custom dimensions have numeric inputs.
- Compare keeps mode, zoom, flicker and region controls in the settings sheet while leaving the preview usable.
- Editor provides numeric straighten alongside the slider and keeps guides/before-after as labelled controls.
- Convert format results stack without horizontal page overflow; JPEG background and filename controls remain keyboard/touch accessible.
- Split and Batch keep sticky actions and existing mobile result layouts.
- Existing touch-size controls are preserved; the Split touch-drag test remains Chromium-only because Playwright WebKit does not emulate that path equivalently.

## 8. Accessibility

- New controls use native buttons, inputs, checkboxes or labelled radio groups and preserve visible focus styling.
- Sliders have numeric alternatives where precision is important.
- Beautifier export size, Compare processing/summary, format comparison and large exports expose status text/live-region feedback.
- Flicker honours `prefers-reduced-motion` and is not silently started for those users.
- Difference analysis is labelled as preview-resolution pixel analysis, not semantic similarity.
- JPEG transparency loss is communicated in text and is not conveyed by checkerboard alone.
- Guides are non-exported visual aids; before/after state remains available through an explicit control rather than pointer-only interaction.

## 9. Tests

Unit coverage was added for:

- custom Beautifier geometry, blur settings, recipes, border/shadow resolution and safe output scaling;
- straighten matrices, expanded bounds, adjustments, presets and transparent-edge trim;
- heatmap/difference values, connected regions, minimum size and merge distance;
- three-format candidate encoding contracts, filename handling and web-pack generation;
- Split overlap/naming invariants;
- Batch affixes, totals and filtering;
- registry removal/disposal, object URL revocation, bitmap close and worker disposal through the existing workspace lifecycle suites.

Production E2E coverage verifies real exports, pixel geometry, preview/export agreement, candidate ZIP contents, filenames, cross-tool continuation, desktop, 390 px mobile, lazy loading and page/console stability.

## 10. Final full-suite numbers

Validation run on 2026-10-04:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with 0 errors and one pre-existing warning in `scripts/spikes/pdf-fixtures/generate.ts` for unused `addInkBands`.
- `npx vitest run` — 34 passed and 3 skipped files; 537 passed and 7 skipped tests, 544 total.
- `npm run build` — passed with Next.js 16.3.6; 31 static routes generated.
- Priority-tool production Playwright — 166 scheduled checks: 165 passed and 1 intentional engine-specific skip.
- Chromium — 83/83 passed.
- WebKit — 82 passed; the Chromium-only Split touch-emulation test was skipped.
- Explicit homepage heavy-module follow-up — 4/4 passed across Chromium and WebKit.

No benchmark source result was retained: the timing-only stitch JSON changed during the full Vitest run and was restored because machine timing is not a product change.

## 11. Browser results

| Browser engine | Result | Coverage notes |
| --- | --- | --- |
| Chromium | 83/83 passed | Desktop, 390 px mobile, touch Split drag, pixel exports, ZIP contents, clipboard capability branches and lazy loading |
| WebKit | 82 passed, 1 skipped | Same production suites; only the test explicitly marked Chromium-only for synthetic touch drag was skipped |

These are Playwright browser engines, not a claim of manual validation on every shipping Chrome/Safari device combination.

## 12. Bundle and lazy-loading results

- The homepage loaded 10 JavaScript files totalling 678.3 KB raw and 205.0 KB gzip in both final Chromium and WebKit checks.
- No homepage request matched OpenCV, Tesseract, trained-data models, WASM, vendor engines, Hindi PDF font or worker files.
- Loaded homepage script bodies did not contain the guarded pdf-lib, annotation, Split or Compress/Convert implementation markers.
- `client-zip` and its ZIP implementation markers were absent from the homepage in both engines.
- Beautifier, Compare, Editor/transform, Convert, Split and Batch production suites retain their route-level lazy-loading assertions.
- Web-pack generation dynamically imports the already-installed `client-zip`; no dependency was added in Phase 3D.

## 13. Screenshots

Captured from the production build during Phase 3D browser checks:

- [Beautifier blurred background, text and glass treatment](../phase-3d/screenshots/01-beautifier-wow.png)
- [Compare heatmap and changed-region analysis](../phase-3d/screenshots/02-compare-heatmap.png)
- [Editor straighten and adjustment controls](../phase-3d/screenshots/03-editor-straighten.png)
- [Convert measured PNG/JPEG/WebP comparison](../phase-3d/screenshots/04-convert-formats.png)

## 14. Known limitations

- Beautifier does not support a second logo asset or projective 3D perspective in V1.
- Blurred-background tiled PNG export rejects unsafe dimensions instead of risking blur seams or an unverified allocation.
- Compare measurements and regions are preview-resolution pixel analysis. They are deterministic but are not full-resolution totals or semantic similarity.
- Compare does not auto-align inputs; users must provide already-corresponding screenshots for meaningful pixel analysis.
- Editor trims transparent edges only. It does not guess uniform or content-aware borders.
- Clipboard image writing depends on browser support and permissions. Download remains the fallback.
- WebP candidate availability remains subject to the browser encoder and existing safe dimension cap. AVIF is not offered.
- No Phase 3D change adds persistence: reloading or closing the temporary workspace releases the session.

## 15. Final complete Shotexa V1 feature inventory

| Existing tool | V1 capability at Phase 3D close |
| --- | --- |
| Smart Stitch | Local overlap analysis, confidence/manual review, multi-image stitching and full-resolution export |
| Combine | Vertical, horizontal and grid composition with local export |
| Beautifier | Recipes, Auto layout, colour/gradient/blur backgrounds, custom/preset canvas, browser/phone frames, title/subtitle, borders, advanced shadows, positioning, safe 1×/2×/4× export and Copy PNG |
| Compare | Side by side, slider, overlay, difference, heatmap, sensitivity, changed/unchanged totals, regions, flicker, synchronized zoom/pan, file details and PNG export |
| Safe Share | Local Blur, Pixelate and Blackout regions with flattened verified export and privacy-metadata removal |
| Blur | Focused local blur/pixelate workflow |
| Extract Text | Lazy local OCR with editable extracted text and no server upload |
| PDF | Local screenshot-to-PDF generation with the established page planning/export path |
| Searchable PDF | Local OCR text layer aligned with the established visual PDF output |
| Editor | Crop ratios, resize, quarter turns, flip, −15° to +15° straighten, adjustments/presets, before/after, transparent trim, non-exported guides and undo/redo |
| Annotate | Existing local vector annotation tools and flattened export |
| Split | Equal/height/custom splitting, drag/keyboard line editing, overlap, naming templates, individual downloads and ZIP export |
| Compress | Local measured compression, quality/resize/background controls, target-size search and factual results |
| Convert | PNG/JPEG/WebP conversion and measured comparison, transparency flattening choices, filenames, Copy PNG and a local web-export ZIP |
| Privacy Clean | Local metadata inspection/removal with output verification |
| Batch | Sequential local compress/convert/resize/privacy jobs, failure isolation/retry, filename affixes, totals, result filters and ZIP output |
| Shared temporary workspace | Paste/drop/picker input, local Blob/ImageBitmap registry, cross-tool continuation, non-destructive artifacts and cleanup on removal/unmount/reload |

## Review recommendation

Phase 3D is a V1 review candidate. The selected features are highly visible, remain local and deterministic, and pass the required TypeScript, lint, unit, build, Chromium and WebKit gates. Deferred features are explicitly excluded rather than partially shipped. No deployment or V2 work should begin until this report and the captured states are reviewed.
