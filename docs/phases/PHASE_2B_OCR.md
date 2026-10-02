# Phase 2B — Screenshot to Text (OCR)

Branch `phase-2b/ocr` · commit `005f5c7` · 26 files, ~830 insertions.
Screenshots: `docs/phase-2b/screenshots/`.

## What was built

`/screenshot-to-text` — on-device OCR with an editable result.

- English, or English + Hindi, chosen per extraction; Hindi models load only when selected.
- Live progress with named stages, and a working **Cancel**.
- The extracted text lands in a textarea the user can correct; Copy and Download TXT both
  use the edited text.
- Results survive navigation, so a stitched or redacted image can be sent straight to OCR.

New: `ocr-tool.tsx`, `ocr-landing.tsx`, `src/core/ocr/text-export.ts`,
`src/core/runtime/ocr-result-registry.ts`, `src/config/ocr.ts`.

## Architecture decisions

- **Structured OCR output never enters Zustand.** Blocks, lines and word boxes live in
  `OcrResultRegistry`, keyed by asset; the store keeps only status, progress, language,
  confidence and the edited text (`OcrAssetState`). This keeps the Phase 1 rule that the
  store holds small serialisable values only — and it is what later made Searchable PDF
  possible without re-running OCR.
- **Edited text and OCR geometry are separate.** The user's corrections are the Copy/TXT
  version; the original structured result stays untouched for anything that needs
  coordinates.
- **Heavy WASM heaps are never co-resident.** Before OCR runs, the runtime releases the
  vision (OpenCV) and document workers, because Spike B measured each large runtime at
  190–330 MiB.
- **Everything is self-hosted.** Tesseract worker, core and traineddata are copied into
  `public/vendor/` at build time and referenced through `src/config/vendor-assets.json`;
  nothing is fetched from a CDN.
- Cancellation is cooperative (`AbortController` plus `service.cancel()`), with a timeout
  that raises the controlled code `OCR_TIMEOUT`.

## Reused spike work

- **Spike C (OCR):** the engine adapter, preprocessing, strip planning, reading-order
  normalisation and the Tesseract wrapper (`src/core/ocr/*`) were reused as built; Phase 2B
  added the service wiring, registry, UI and export.

## Tests and validation

- Unit: `production-ocr.test.ts`, `tesseract-engine.test.ts`, plus the Spike C
  `ocr-core.test.ts` accuracy suite against the fixture corpus.
- Runtime and store: OCR lifecycle cases in `runtime.test.ts` and `store.test.ts`.
- E2E: `src/tests/e2e/ocr-production.spec.ts` — 10 tests covering extraction, editing,
  clipboard copy, TXT download, both language packs, cancel-and-retry, a controlled
  model-load failure, and the Smart Stitch and Safe Share handoffs. No screenshot bytes or
  extracted text leave the device.

## Known limitations

- Accuracy is Tesseract's; dense code and low-contrast dark themes remain the weakest
  cases measured in Spike C.
- Only English and Hindi ship as language packs.
- One extraction runs at a time — starting another cancels the first by design.
- The cancel-and-retry E2E test was flaky until Phase 2F: it selected the next file before
  ingest had finished. Fixed by waiting on the file count rather than a timer.
