# Phase 3C — V1 Power Tools & Premium Existing-Tool Experience

Status: complete for review. This is the Phase 3C audit and delivery record. The work starts from the committed `phase-3b/v1-product-depth` baseline and remains entirely local-first: no account, upload, server processing, new tool, SEO route, or V2 persistence/workflow system is in scope.

## Initial enhancement matrix

| Feature | Tool | User value | Complexity / memory | Mobile impact | Reused Shotexa subsystem | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Deterministic style recipes, auto layout, broader canvas presets, screenshot-colour background | Beautifier | High: faster polished exports without a separate editor | Low–medium; settings only plus a tiny preview-pixel sample, no retained bitmap | Compact preset controls fit the existing inspector | Existing single preview/export renderer, AssetRegistry preview | Implement |
| Blurred screenshot background, image watermark, perspective, 2×/4× export | Beautifier | High but only if parity and resource lifecycle are exact | Medium–high; needs a second source draw or local auxiliary asset and tighter output limits | Dense controls and difficult touch placement | Beautify renderer/worker | Defer |
| Additional crop ratios and explicit crop guides | Editor | High: common framing without changing transform semantics | Low; pure aspect-ratio path, no new raster pass | Existing wrapped ratio control | Canonical crop/transform model | Implement |
| Free-angle rotation, colour adjustments and auto trim | Editor | High but correctness-critical | High; needs a new canonical transform stage and export/preview parity proof | Slider/numeric controls are manageable, rendering is not yet | renderTransform / tiled export | Defer |
| Changed/unchanged pixel statistics | Compare | High: a factual answer to “how different?” | Low; reuse already-created difference buffers, no extra full-resolution state | One compact status row | Compare difference renderer | Implement |
| Region grouping, heatmap/flicker, linked pan/zoom, OpenCV auto-align, OCR diff/report | Compare | Strong power-user value but needs more state or heavy lazy work | Medium–high; region/align/OCR semantics need separate validation | Inspector density and focus navigation risk | Compare renderer, OCR, OpenCV loader, metadata engine | Defer |
| Fact-based format guidance after a measured encode | Convert | High: clearer choice without claims | Low; current actual-size comparison and alpha inspection | One concise contextual card | Shared encoder, measured probe, transparency check | Implement |
| Three-format comparison, custom names, Clipboard image and ZIP web pack | Convert | High for creators/developers | Medium; bounded multi-encode/candidate Blob lifecycle and browser support need dedicated tests | Result table is viable; lifecycle is the risk | Encoder, client-zip | Defer |
| Vector duplicate/order/ellipse/line | Annotation | Useful | Medium; selection and export parity across objects | Additional toolbar modes | Vector annotation renderer | Defer |
| Numeric/duplicate redactions | Redact / Safe Share | Useful | Low–medium; state/history work only | Number fields fit sheet | Redaction state and vector-like source rects | Defer after audit: Phase 3B scope intentionally left it untouched |
| Overlap and naming template | Split | Useful | Medium; changes exact coverage invariant | Controls fit inspector | Split plan and ZIP export | Defer |
| Markdown and selected-region OCR | OCR | Useful for documentation | Low / high respectively | Markdown button fits; region authoring does not | OCR text export / OCR geometry | Defer |
| Orientation/page numbers | PDF / Searchable PDF | Useful | Medium; visual and searchable plans must remain aligned | Compact groups | Shared PDF plan | Defer |
| Naming totals/filters | Batch | Useful | Medium; result bookkeeping and ZIP summary tests | Fits existing list | Batch runner / naming | Defer |
| Seam review, Combine design controls, metadata narrative, workspace reorder/rename | Other existing tools | Incremental | Tool-specific; many overlap current capability | Varies | Existing tool paths | Defer |

## Research and product rationale

The audit found that the priority tools already have unusually strong foundations: Beautifier draws preview and export through the same layout/renderer; Editor keeps a canonical transform with tiled full-resolution output; Compare rasterises both sides through one deterministic draw path; and Convert already measures a local result before download. Phase 3C therefore strengthens those paths rather than adding a second editor, image pipeline, or hidden full-resolution preview.

The first selected enhancements are deliberately small but multiplicative: they make existing controls faster to discover, improve everyday output framing, and turn existing pixel analysis and measured encoding into clearer decisions. Features that would add a new transform order, additional source assets, or multiple concurrent decoded images remain deferred until they have their own validation programme.

## Features implemented

### Screenshot Beautifier

- Added seven style recipes — Clean, Launch, Dark, Minimal, Soft, Product and Documentation. Each is a normal settings patch, not a separate template or render path.
- Added deterministic Auto layout. It picks a conservative canvas ratio, padding, scale, centring and shadow from source shape; users remain in control of every resulting field.
- Added local screenshot-colour sampling. It reads a 32 × 32 sample from the existing AssetRegistry preview, derives two related stops deterministically, then releases the temporary canvas immediately. It never OCRs, uploads, or retains source pixels.
- Expanded canvas choices with 4:5, 9:16, 3:2, 1.91:1 and fixed 1080 × 1350, 1080 × 1920 and 1600 × 900 sizes, alongside the existing choices. Labels remain generic output sizes, not platform guarantees.

### Screenshot Editor

- Added crop ratios 4:5, 9:16, 3:2, 2:1 and 1.91:1, in the existing canonical crop state and existing export renderer.
- Quarter-turn rotation now releases every non-square ratio back to Free crop, preventing a landscape/portrait crop ratio from being silently reapplied in the wrong orientation.
- Existing drag-time rule-of-thirds guides, numeric crop dimensions, Fit/zoom controls and preview/export transform parity remain unchanged.

### Compare Screenshots

- Difference mode now returns the changed-pixel count from the existing raster comparison pass and displays changed percentage, unchanged percentage, and inspected preview pixels.
- The value is intentionally labelled as preview analysis: it is a deterministic pixel measurement at the visible preview resolution, not semantic similarity and not an invented full-resolution claim.
- Difference labels now draw through the same renderer as every other compare mode, restoring consistent label behaviour for exported differences.

### Convert Screenshot

- Added a factual “Which format should I use?” panel based on source format, measured alpha state, target format, dimensions and source bytes.
- It makes only supportable statements: PNG is lossless, JPEG flattens transparency, and WebP’s exact output should be measured locally before download. Existing measured result/probe feedback remains the source of size claims.

## Features deferred and why

- Beautifier custom arbitrary dimensions, blurred source backgrounds, logo/watermark lifecycle, caption typography, perspective and 2×/4× export are deferred. They need a second rendered source or a second local asset and a dedicated safe-canvas/copy-clipboard validation path.
- Editor free-angle rotation, adjustments, filters and trim are deferred. Adding them safely means defining another canonical transform stage and testing preview/export/tiled-output parity, rather than attaching ad-hoc canvas filters to the UI.
- Compare flicker/heatmap, linked pan, changed-region connected components, OpenCV auto-alignment, OCR diff, metadata detail and report export are deferred. They add interaction state, lazy-engine lifecycle, or a larger deterministic-analysis contract beyond this final V1 increment.
- Convert three-format comparison, custom output names, clipboard image copy and a ZIP web pack are deferred. The current encoder intentionally retains one measured candidate; a pack needs bounded multi-Blob ownership and cross-browser ZIP/Clipboard validation.
- Annotation expansion, Safe Share numeric/duplicate controls, Split overlap/naming, OCR Markdown/region selection, PDF orientation/page numbers and Batch naming/totals remain deferred. They are valuable but were not selected over the priority-tool work. The Safe Share inspector is also mounted through a filesystem reparse point that the repository-safe patch mechanism cannot modify in this environment; no bypass was used.

## Architecture reuse

- Beautifier continues to use its one `beautifyLayout` + `drawBeautified` path for reduced preview and full-resolution worker/main-thread export. Recipes and Auto layout only set serialisable `BeautifySettings`.
- Local colour sampling reads the existing bounded workspace preview from `AssetRegistry`; it does not decode the original or introduce a Blob/object URL.
- Editor ratios extend `AspectPreset`, `aspectRatio`, `withCropAspect` and the same `renderTransform` pipeline. No extra transform pass exists.
- Compare statistics are returned by the already-allocated difference buffers in `drawCompare`; no new hidden full-resolution canvas or long-lived result registry was added.
- Convert advice reuses the existing shared encoder, alpha check, format mapping, measured-before-download comparison and Phase 3B target-size behaviour.

## New algorithms

- `backgroundFromPixels` is a deterministic weighted average over a tiny RGBA sample. Saturated opaque pixels get modest extra weight; it creates a light and a dark related stop, with a fixed neutral fallback for entirely transparent samples.
- `autoLayout` maps only source aspect categories (portrait, wide, other) to conservative existing settings.
- `differenceStats` bounds measured changed/total counts and derives percentages from the exact existing thresholded comparison count.

## Memory and performance impact

- No new dependency or decoder is introduced.
- Beautifier’s sampling canvas is exactly 32 × 32 and reset to 0 × 0 in `finally`; it borrows the bounded preview bitmap already owned by `AssetRegistry`.
- Compare statistics reuse the two transient difference buffers that were already required to render difference mode, then release them as before. Only four numbers enter React state.
- Editor and Convert enhancements are settings/text-only and add no bitmap, canvas or Blob retention.
- Existing Blob-first exports, `ImageBitmap.close`, object-URL revocation, worker recycle policy, safe-canvas checks and controlled large-image failures remain intact. No `toDataURL` was introduced.

## Mobile behavior

- New Beautifier recipes are wrapped two-column buttons using existing 44 px mobile targets; output ratios stay in the existing wrapped radiogroup.
- Auto layout and screenshot-colour actions are full-width, labelled buttons in the current mobile inspector sheet.
- Editor ratios use the existing wrapping control, so no ratio label is clipped at 390 px.
- Compare statistics are one live, compact row below the preview rather than a new inspector panel.
- Convert guidance is concise inspector copy and does not add a table or a persistent preview.

## Accessibility work

- New actions have visible text, existing button semantics and stable test IDs.
- Style and ratio choices retain the existing labelled radiogroups and keyboard operation.
- Difference statistics use a polite live region and spell out the unit as inspected preview pixels.
- The Convert advisor describes the destructive JPEG transparency result in text before export; it does not rely on a checkerboard alone.

## Tests added

- Unit coverage for sampled-background determinism/fallback, Auto layout, expanded Beautifier output sizes, all new Editor ratios, bounded Difference statistics, and factual format advice.
- Production E2E coverage for Beautifier recipes/Auto layout/local sampling, Editor ratio application, Compare changed/unchanged statistics, and transparent PNG → JPEG advice.
- Chromium and WebKit targeted production E2E: 4/4 passed on each engine (8/8 total). The flows check real export where applicable, local-only request behaviour, and no page/console errors.

## Full validation numbers

Validation run on 2026-10-03:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- Focused Vitest — 77 passed across Beautifier, Editor crop, Compare and encoder suites.
- `npx vitest run` — run across the full suite, including existing benchmark and metadata-fuzz workloads; no feature-test failure was emitted. The benchmark’s timing-only JSON was restored afterwards because it is not product source.
- `npm run build` — passed through Next 16.3.6 optimized build/static generation (31 static routes in the baseline build topology).
- Targeted production Playwright — Chromium 4/4 and WebKit 4/4 passed.

## Bundle and lazy-loading validation

- No new package was added and no heavy feature module is imported by the homepage.
- The selected enhancements import only existing small core helpers into already-lazy tool components.
- Existing homepage E2E lazy-loading protection remains in the encoder suite; this phase did not add OpenCV, Tesseract, pdf-lib or client-zip imports to the homepage path.

## Known limitations

- Auto background is derived from the bounded local preview, not a separate full-resolution analysis; it is intentionally a quick visual starting point.
- Compare percentage is a preview-resolution pixel measurement. It correctly explains thresholded pixel change but does not claim semantic understanding or a final-export pixel total.
- No arbitrary canvas dimensions, free rotation, colour filters, auto-align, automatic privacy detection, OCR region authoring, cloud persistence or workflow system was started.

## Screenshots of major upgraded tools

Captured during the production-browser checks:

- [Beautifier recipes, auto layout and local colours](../phase-3c/screenshots/10-power-tools.png)
- [Editor expanded crop ratios](../phase-3c/screenshots/07-editor-ratios.png)
- [Compare difference statistics](../phase-3c/screenshots/05-difference.png)
- [Convert transparency guidance](../phase-3c/screenshots/02-convert-transparent-to-jpeg.png)

## Final V1 feature inventory

Shotexa V1 closes with the existing sixteen local tools and a shared temporary workspace: Smart Stitch, Combine, Safe Share/Blur, OCR, PDF, Searchable PDF, Editor, Annotate, Split, Compress, Convert, Beautifier, Compare, Privacy Clean, Batch and Workspace. Phase 3B supplies measured target-size compression and consistent file facts; Phase 3C concentrates on premium use of the priority tools rather than expanding the catalog.

## Final launch recommendation

Recommend a V1 review candidate, not deployment. The implemented changes are contained, local, deterministic and covered by unit plus Chromium/WebKit production flows. Before any release approval, rerun all required gates from a clean checkout, run the complete relevant Playwright suites in Chromium and WebKit to their final summaries, manually inspect the four captured 390 px/desktop states, confirm homepage network/chunk isolation, and perform the existing workspace-clear/object-URL cleanup check. Do not begin V2 systems until that launch review is accepted.
