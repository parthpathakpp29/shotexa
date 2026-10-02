# Phase 2C — Screenshot to PDF and Smart Pagination

Branch `phase-2c/smart-pdf` · commit `7eec35b` · 23 files, ~1,150 insertions.
Screenshots: `docs/phase-2c/screenshots/`.

## What was built

`/screenshot-to-pdf` — multi-screenshot PDF export with reviewable page breaks.

- Paper: A4, Letter, or **Fit** (page follows the image); adjustable margin.
- **Smart pagination** places breaks between lines of content rather than through them,
  and flags the ones worth a look ("N page breaks need review").
- Every break can be dragged, nudged, snapped, added, deleted or reset, with undo/redo.
- Multi-image input in workspace order; JPEG or PNG page images with a quality control.
- Progress and cancellation for both the analysis and the export pass.

New: `pdf-{tool,inspector,preview,landing}.tsx`, `src/core/runtime/pdf-analysis-registry.ts`.

## Architecture decisions

- **Row signals stay out of Zustand.** Per-image analysis (`safeYs` and row statistics) is
  held in `PdfAnalysisRegistry`; the store keeps only `PdfBreakEdit` — a small array of
  manual break positions plus `frozen` positions. Analysis is cached per asset, so changing
  paper size or margin re-plans instantly without re-analysing pixels.
- **Deleting a break freezes the layout.** Without `frozen`, the planner would immediately
  recreate a break the user just removed. This is the reason `PdfBreakEdit` has two arrays.
- **Analysis and export are sequence-guarded.** Both hold an `AbortController` and compare
  a sequence number before writing results, so rapid setting changes cannot let a stale
  plan overwrite a newer one.
- **Cancellation is bounded by disposing the engine.** An in-flight image decode is not
  interruptible, so `cancelPdf()` disposes the engine outright rather than waiting.
- Smart pagination uses the Spike D window: 10% upward search, at most 5% page shrink.

## Reused spike work

- **Spike D (Smart PDF):** the whole engine — `analyse-image`, `signals`, `breaks`,
  `paginate`, `plan`, `geometry`, `coords`, `render-pdf`, `decode` — was reused unchanged.
  Phase 2C added the registry, the runtime wiring, the break editor and the UI.
- **Spike B (memory):** page-by-page processing and worker lifetime rules.

## Tests and validation

- Unit: `production-pdf.test.ts` plus the Spike D `pdf-core.test.ts` pagination suite, and
  store coverage for break editing, freezing, coalescing and undo/redo.
- E2E: `src/tests/e2e/pdf-production.spec.ts` — 11 tests covering export, page counts,
  manual break editing, paper and margin changes, cancellation, and the Smart Stitch and
  Safe Share handoffs, with the no-upload assertion.

## Known limitations

- Smart pagination is off for **Fit**, where the page follows the image and there is
  nothing to break.
- Break quality depends on the row-signal heuristic; dense code and tables were the
  weakest cases in Spike D, which is why every break is editable.
- The deeper production assertions run on Chromium only; the cross-browser engine evidence
  comes from the Spike D suite.
