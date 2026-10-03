# Phase 3B — V1.1 Product Depth & Existing Tool Enhancements

Status: complete. This document is the audit and delivery record for Phase 3B. It is deliberately scoped to the existing sixteen live tools and the local-first workspace; it creates no new tools, routes, accounts, uploads, or server image processing.

## Scope and audit method

The source of truth is `phase-3a/seo-content-audit` at `39fca82`; this work is on `phase-3b/v1-product-depth`. The audit inspected the live-tool registry, workspace runtime/store, each tool's controls and export path, shared preview/file tray, and the existing unit and browser-production suites. The implementation boundary is: reuse Blob-first exports, the AssetRegistry, worker broker, `Continue with`, and controlled large-image failures. No source pixels, OCR text, or uploads leave the browser.

## Existing-tool audit and proposed enhancement matrix

| Tool | Current capability | User-facing gap / friction | Proposed enhancement | Priority | Risk and mobile / memory assessment | Overlap decision |
| --- | --- | --- | --- | --- | --- | --- |
| Smart Stitch | Automatic adjacent-overlap analysis, static-band handling, seam confidence, normal/overlay/difference review, seam drag, exact offsets, keyboard nudges and reordering | The inspector has a compact join selector rather than a persistent seam-review summary; automatic header/footer treatment needs especially careful wording | Keep current manual fallback; consider a seam list with confidence and direct selection | P1 | Low pixel cost; compact list is mobile-safe. Do not promise automatic header removal | Not duplicated: only Stitch owns overlap/seam analysis |
| Combine | Vertical/horizontal/grid layouts, proportional match sizing, spacing, alignment, transparent/solid backgrounds and reorder through File Tray | No separators, corner radius, captions, or custom output frame | Border/separator and safe rounded-corner treatment | P2 | Composition changes need full-resolution render coverage; inspector density is a mobile concern | Do not overlap with Beautifier's composition surface |
| Safe Share / Blur | Multiple selectable blur/pixelate/blackout rectangles, intensity, resize/move, flattened verified export and metadata clean | Exact region geometry is view-only and a repeated region must be redrawn | Numeric X/Y/width/height editing and duplicate selected region | P1 | Small serialisable state only; no new raster path. Number fields fit mobile sheets | Complements, rather than duplicates, manual region selection |
| Extract Text | Lazy local OCR, English and English+Hindi, editable text, copy/TXT, stored geometry for Searchable PDF | No Markdown download; no region OCR without a crop model; no extra lazy language packs beyond Hindi | Markdown download from user-edited text | P1 | Text-only Blob, no added engine/model/bundle cost | Region OCR and broad languages defer: both need careful OCR geometry/model QA |
| PDF | A4/Letter/fit, margins, smart editable page breaks, file selection/reorder and local PDF export | No page numbering, orientation control or per-page rotation | Page numbers and orientation, only after preserving smart-plan invariants | P2 | PDF rendering and pagination need cross-browser/long-image validation | Searchable PDF should share options if added |
| Searchable PDF | Uses same visual PDF plan plus local OCR text layer, progress/cancel and layout geometry | Language selection and failed-page retry are inherited/limited; normal output correctly hides text layer | Per-page OCR state/retry and shared PDF options | V2 | OCR and PDF concurrency/memory lifecycle makes partial retries non-trivial | Do not expose invisible layer or duplicate normal PDF behavior |
| Editor | Deterministic full-resolution crop, aspect presets, 90-degree rotation, flip, numeric crop/resize dimensions and format controls | Missing common 4:5/9:16 canvas presets, visual adjustments and free-angle straighten | Add well-tested canvas-size/crop presets first; defer free-angle and colour adjustment pipeline | P1 / V2 | Presets are low risk; colour/free rotation introduce another full-res transform and preview math | No platform guarantees in preset names |
| Annotate | Vector arrows, boxes, highlights, text, drawing, steps, selection, resize, undo/redo and vector-to-final export | No line/ellipse/callout, duplicate, ordering or multi-select controls | Duplicate and layer ordering first; geometry/tool expansion later | P2 | State is vector-only, but selection/order UX needs keyboard/mobile coverage | Keep vector until final export |
| Split | Equal/custom split lines, fixed-height mode, direct manipulation, ZIP/download/add-to-workspace and piece dimensions | No overlap between pieces, naming template or social-size presets | Overlap and naming templates | P1 | Changes slice coverage semantics; needs exact row/overlap tests and clear duplicate-pixel accounting | ZIP already solves batch-download need |
| Compress | JPEG/WebP quality, factual PNG behavior, exact pre-download comparison, recommendations and dimensions | Users cannot ask for a target byte budget | Bounded binary quality search for 200 KB / 500 KB / 1 MB / custom target; explicit unreachable outcome | P0 | Reuse a single decoded bitmap per run; JPEG/WebP only; bounded encodes and worker release protect memory | Unique to Compress; Convert retains manual quality control |
| Convert | PNG/JPEG/WebP, quality, transparency-aware JPEG background, exact before/after comparison | Filename control and richer background preview are missing | Optional output filename field; retain factual format scope | P1 | Metadata-only state; no new image work | Do not duplicate Compress target-size search |
| Beautifier | Solid/gradient background, generic browser/phone frames, shadows, fit/position and basic output presets | Missing title/caption, custom canvas size, watermark and screenshot-derived blur | Caption/canvas presets first; watermark/blur background later | P1 / V2 | Watermark needs safe local extra-asset lifecycle; blur background increases full-res work | Avoid trademarked device/browser assets |
| Compare | Side-by-side/slider/overlay/difference, fit/alignment, sensitivity, full-res export | No changed-region counts/boxes, percentage or ignore-small-islands control | Deterministic connected-component summary/report | P1 | Requires scan buffers and threshold-aware tests; potentially costly on big images | Do not claim semantic understanding |
| Privacy Clean | Container inspection, targeted private metadata removal, verification and retention of rendering-critical metadata | Results are factual but category summary could distinguish retained metadata more explicitly | Expanded before/after retained-category explanation | P2 | Metadata-only; no raster decode/recompress | Safe Share already removes metadata during its export |
| Batch | Sequential local compress/convert/resize/privacy clean, ZIP, selection, retry, individual statuses and workspace add | Naming controls, totals, selection shortcuts and compatible chaining are limited | Naming template/totals and one narrow two-step recipe only after memory proof | P1 / V2 | Sequential execution is intentionally memory-safe; chaining must never retain all decoded images | Do not create a workflow engine |
| Workspace and shared preview | Shared File Tray reordering, artifacts, mobile sheets, preview, tool handoff and cleanup | File type and encoded size are not consistently visible at selection/preview time | Add concise type, dimensions and bytes to shared file facts | P0 | Read-only metadata already in store; no decoding, state or bundle change | Shared display improves every existing tool without new global control system |

## Prioritisation

- **P0:** target file size for Compress; consistently visible width × height, type and size in the workspace.
- **P1:** precise and duplicable manual redactions; Markdown OCR download; editor canvas presets; Split overlap/naming; Convert rename; Beautifier caption/presets; Compare deterministic region summary; Batch naming/totals; Stitch seam-review list.
- **P2:** Combine separators/corners/captions; PDF page numbers/orientation; annotation ordering/duplicate; richer metadata explanation.
- **V2:** automatic privacy detection, OCR-region architecture and broad language catalog, Searchable PDF per-page retry, free-angle editor rotation/colour adjustments, watermark upload/derived blur background, Compare semantic analysis, persistent projects and a batch workflow engine.

The selected implementation order is P0 first, followed only by P1 changes that retain existing serialisable workspace state and do not add heavyweight client dependencies.

## Features implemented

### Target file size for Compress (P0)

Compress now offers a manual quality mode plus 200 KB, 500 KB, 1 MB, and custom-KB targets for JPEG and WebP. The target search is factual rather than aspirational:

- It makes at most seven local encodes, starting at the selected quality cap and searching whole-percent quality values.
- It decodes the input only once, reusing the same `ImageBitmap` for every candidate encode.
- It retains the highest measured quality at or below the requested bytes, then shows the actual quality, bytes, and number of attempts.
- If 50% quality still exceeds the target, it says so clearly and returns the smallest measured result. It does not resize, silently change format, or claim precision it did not measure.
- PNG deliberately remains target-free because it has no browser quality control. The UI explains that JPEG or WebP is required for this specific trade-off.

### Shared workspace file facts (P0)

The shared File Tray and preview header now consistently expose filename, source dimensions, image type, and encoded byte size. These are existing ingestion facts, so the change neither decodes an image nor adds state, memory pressure, or a dependency to the homepage.

## Features deliberately deferred

The P1 ideas in the matrix remain deliberately deferred after the audit. They are sound candidates, but implementing them together would broaden the release surface beyond the selected P0 improvements:

- redaction duplicate/exact-geometry controls;
- Markdown OCR download and OCR-region selection;
- editor/beautifier canvas presets and title/caption treatment;
- Split overlap/naming; Compare connected-region reporting; Batch naming/totals; and a persistent Stitch seam list.

The following remain V2 because they need substantial new state models, heavyweight processing, or larger validation programs: automatic privacy detection, broad OCR language catalogs, free-angle transforms/colour adjustment, Searchable PDF per-page retry, watermark/background-media lifecycle, semantic comparison, persistent projects, and a workflow engine.

## Architecture changes

- Added the pure `target-size` quality-search helper and narrow `targetBytes` encoder setting. The worker protocol carries only the numeric request; all image data remains local in the existing image worker or its main-thread fallback.
- `EncodeResult` reports the actual chosen quality and target-search outcome. This avoids presenting the quality cap as though it were the output quality.
- Added a tiny shared formatting helper for existing workspace metadata only. It imports no image-processing code.

## Memory/performance impact

- Target-size compression performs up to seven full encodes in the existing image worker, but one source decode is reused and only the current best/smallest candidate Blob is retained. The usual capability limits, dimension checks, Blob export, canvas release, and worker-release policy still apply.
- A target disables the optional alternative-format probe, avoiding an extra encode that does not help meet the requested size.
- Workspace file facts are O(1) metadata display with no canvas or bitmap work.

## Mobile behavior

- Target choices are 44 px-or-larger controls inside the existing Compress Settings bottom sheet; the custom KB field uses the existing numeric input behaviour.
- The existing sticky mobile export remains unchanged. The result announces a measured target success or an explicit unreachable outcome.
- File information stays one truncated line in the preview and a compact two-line treatment in the File Tray, preserving the existing mobile layout.

## Tests added

- Unit: bounded quality-search success and unreachable-target fallback.
- Unit: encoder-settings normalisation includes target bytes and refuses implausibly tiny targets.
- Browser: Chromium and WebKit each verified a local WebP target-size flow, measured output/download byte parity, no outbound upload requests, and no browser errors.

## Full validation results

Validation completed on 2026-10-03:

- `npx tsc --noEmit` — passed.
- Focused Vitest encoder/workspace suite — 58 passed.
- `npx vitest run` — 525 passed, 7 skipped.
- `npm run lint` — passed with one pre-existing warning in `scripts/spikes/pdf-fixtures/generate.ts` (`addInkBands` unused).
- `npm run build` — passed; all 31 static routes generated.
- Complete `encode-production` E2E suite — Chromium 14/14 passed and WebKit 14/14 passed, including the existing mobile cases and homepage feature-bundle check.

## Known limitations

- A byte target is only available for JPEG/WebP. PNG is lossless and therefore cannot provide a truthful generic quality/target-size control.
- Browser encoders can vary slightly by engine. The product reports bytes from the actual result generated by that browser; it does not promise an exact outcome in advance.
- The target is a quality cap search, not a resize tool. When it cannot be reached at 50%, the user must choose a smaller canvas using Editor/Split or select another format.

## Recommended final V1 launch checklist

1. Run the full required gates from a clean final candidate: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, and `npm run build`.
2. Run the whole `encode-production` suite in Chromium and WebKit, including its mobile cases; recheck target-size at every preset and a custom target.
3. Confirm target outputs preserve source dimensions, measured output/download bytes match, and no upload requests occur.
4. Re-run homepage request inspection to confirm OpenCV, Tesseract, pdf-lib, client-zip, and feature-specific code remain absent before tool use.
5. Manually check the file-fact labels and Compress Settings bottom sheet at 390 px width, then clear the workspace and confirm object URLs/worker ownership return to the existing cleanup path.

## Guardrails maintained

- Keep all image work Blob-first and local. No `toDataURL`, storage, upload, account or backend path is introduced.
- A target-size pass may encode more than once, but must decode only once, cap attempts, retain only the current best Blob, expose the final measured bytes, and release/recycle the image worker under the existing large-image policy.
- Shared file information uses the already-ingested `WorkspaceFile` metadata; it does not decode a bitmap or change registry ownership.

## Deferred by design

No new SEO routes or large SEO copy, automatic sensitive-data detection, cloud persistence, authentication, workflow graph, semantic comparison, server image processing, or brand-device renders are in Phase 3B.
