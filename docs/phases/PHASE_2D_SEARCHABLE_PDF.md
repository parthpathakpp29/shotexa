# Phase 2D — Searchable PDF (OCR text layer)

Branch `phase-2d/searchable-pdf` · commit `8bef921` · 33 files, ~1,020 insertions.
Screenshots: `docs/phase-2d/screenshots/`.

## What was built

`/screenshot-to-searchable-pdf` — the Phase 2C PDF plus an invisible, selectable text layer.

- The page images are unchanged: the screenshot still looks exactly like the screenshot.
- An invisible text run is positioned over each OCR line, so the PDF can be searched,
  selected and copied from.
- The inspector shows OCR readiness per input file ("2/3 ready") and can extract the
  missing ones in place, with progress and cancel — the user never has to leave for the
  OCR tool first.
- Devanagari is supported by embedding the Hind font; Latin text uses the standard fonts.

New: `src/core/pdf/searchable-text.ts`, `searchable-pdf-landing.tsx`,
`src/assets/fonts/Hind-Regular.ttf` (+ OFL licence).

## Architecture decisions

- **The text layer uses the original OCR geometry, never the user's edited text.** Edited
  prose has no reliable relationship to the word boxes, so using it would misplace the
  layer. `searchableSourceFromResult` takes the structured result; the edited text stays
  the Copy/TXT version. This is stated in the file's header comment and surfaced in the UI.
- **This is why Phase 2B kept structured results in a registry.** Searchable PDF reuses the
  OCR already attached to each asset — no second recognition pass.
- **Font embedding is conditional and self-hosted.** Hind is copied into `public/vendor/`
  by the build step and embedded through `@pdf-lib/fontkit` only when the text needs it;
  a failure raises the controlled `PDF_FONT_LOAD_FAILED`.
- **Missing OCR is a blocking, explicit state.** Export is disabled until every input has a
  result; the runtime raises `PDF_OCR_REQUIRED` rather than silently producing a PDF with a
  partial or missing text layer.
- The visual pipeline is shared with Phase 2C — `runPdfExport` takes a `searchable` flag,
  so both routes produce identical page images.

## Reused spike work

- **Spike C (OCR)** through the Phase 2B registry, and **Spike D (Smart PDF)** for the
  pagination and rendering pipeline. Phase 2D added only the text-layer mapping, the font
  handling and the readiness UI.

## Tests and validation

- Unit: `src/tests/unit/pdf/searchable-pdf.test.ts` — line ordering, empty-line filtering,
  and image-space → PDF-page coordinate mapping across page slices.
- E2E: `src/tests/e2e/searchable-pdf-production.spec.ts` — 9 tests covering the blocked
  state, in-place extraction, the produced text layer, mobile, and the Smart Stitch and
  Safe Share handoffs, with the no-upload assertion.

## Known limitations

- The text layer is only as good as the OCR: a misread word is searchable as the misread.
- Firefox is skipped in this suite — Playwright's Firefox on the development host fails to
  create a page before app code loads. Chromium and WebKit cover the flow. Real Firefox
  verification is outstanding.
- Only English and Hindi, matching the available language packs.
