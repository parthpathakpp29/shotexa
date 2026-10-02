# Phase 2K — Stabilisation Pass

Branch `phase-2k/stabilisation`, from `phase-2j/compress-convert`. No new tools; fixes only
for genuine cross-tool issues, plus one new regression suite.

## Tests performed

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | clean |
| ESLint (`src`, Playwright config) | clean |
| Unit (Vitest) | 452 passed, 7 skipped (existing skips), 29 files |
| Production build (`SHOTEXA_ENABLE_SPIKES=1` for the suite, then default) | passes |
| Chromium E2E, full suite, production build | **127 / 127** (115 existing + 12 new) |
| WebKit: stabilisation, Compress/Convert, Split, Annotation, Editor, Safe Share, Combine, workspace | **77 passed**, 5 skipped (Chromium-only by design: OCR chains, CDP touch) |
| WebKit: OCR, PDF, Searchable PDF, metadata, spikes | 26 passed, 17 skipped (existing Chromium-only flows) |
| Firefox | skipped — this host's Playwright Firefox cannot create a page (unchanged since 2D) |

No test was weakened. Two new assertions were corrected during authoring because the test's
expectation was wrong (Combine's gap position after a rotation; the page's own UI fonts are
not "heavy" assets).

## Cross-tool flows verified (`src/tests/e2e/stabilisation.spec.ts`)

Every hop is a *Continue with* link — no re-upload. Each result is checked to be a new
artifact that becomes the selection; names carry the lineage; outputs are decoded.

1. **Smart Stitch → Editor → Annotate → Safe Share → OCR → PDF** — 1170 × 3792 stitched,
   cropped to 2000 px, annotated, redacted, OCR'd, exported as a PDF of the Safe Share copy only.
   No uploads, no console errors.
2. **Combine → Split → Editor → Compress** — combined 120 × 176, split, piece 1 rotated,
   compressed to WebP (88 × 120); Combine's clear gap is still transparent at the end.
3. **Editor → Annotate → Convert** — mirrored, annotated, converted to JPEG; pixels in place.
4. **Safe Share → OCR → Searchable PDF** — the exported PDF's text layer contains the OCR text.
5. **Split piece → Combine** — three pieces recombined; row-coded pixels prove order and
   content (the original they were cut from is correctly excluded).

`derivedFrom` / `producedBy` for every tool are asserted in the runtime unit tests; the E2E
flows verify the visible consequences (names, selection, what each tool takes as input).

## Shared encoder regression

- Smart Stitch exports as PNG, JPEG and WebP decode at 1170 × 3792 (last row present).
- Transparency: Editor PNG keeps alpha 0, WebP keeps ≤ 10, JPEG becomes **white** (never black);
  Annotation JPEG likewise; Combine → … → WebP keeps its clear gap.
- **Tall PNG:** 1000 × 20,000 (above the 16.7 MP single-canvas ceiling) streams in tiles; rows
  0, 2047, 2048, 10,000 and 19,999 are all in place — no truncation at tile seams.
- **JPEG beyond one canvas:** the same image as JPEG fails with the controlled "Export didn't
  finish" message; no download, no half-made artifact.
- **WebP beyond 16,383 px:** Split into two 17,000 px WebP pieces is refused with a message;
  the same split as PNG reconstructs rows 0 → 33,999 exactly.
- Compress/Convert: the 13-test Phase 2J suite passes on both engines.
- No request with a body is sent during any flow.

## Memory / resource audit

Reviewed: AssetRegistry (bitmaps closed, object URLs revoked on remove/replace), OCR and PDF
result registries (dropped with their asset), WorkerBroker (lazy, released after large jobs;
vision and document workers released after use), every `createObjectURL` (registry-owned or
revoked), every export path (bitmaps closed and canvases zeroed in `finally`).

Fixed:
- **Canvas memory on unmount.** The Editor, Annotation and Redaction stages (up to 16 MP
  backing stores), tall `BitmapCanvas` previews and the Combine preview were left for the GC.
  iOS Safari counts every canvas against one fixed total until collection, so moving between
  tools could exhaust it. New `useReleasingCanvas` (React 19 ref cleanup) zeroes them on unmount.
- **Worker release after cropped exports.** Editor and Annotation sized the "recycle the image
  worker" rule by the *output*, although the whole *source* is decoded; a small crop of a huge
  screenshot kept the worker's large heap. Now sized by the larger of the two (Split and
  Compress/Convert already used the source).
- **Transparency cache.** Compress/Convert's per-asset alpha cache is now dropped with the asset.

Not changed (by design): the image worker stays alive between small jobs to avoid restarting
it; pending Split/Compress results live in page state and are freed on unmount.

## Bugs fixed

1. **1 px stage on first render** (Editor, Annotation, Redaction). Before the container is
   measured the stage rendered at 1 × 1 px and accepted input, so a gesture in that frame landed
   at the wrong scale. Root cause of two intermittent WebKit failures — including the "Smart
   Stitch → Safe Share" flake reported since Phase 2H. Stages now wait for a measured width;
   both tests pass 5/5 on WebKit.
2. **Stale homepage copy.** "More tools are on the way — see what's coming" linked to a page with
   nothing coming; the line now follows the registry.
3. The canvas, worker and cache items above.

## Product surface

- Sitemap: 16 URLs (3 static + 13 tools), each returns 200; robots points at it.
- Synonyms (`/png-to-jpg`, `/jpg-to-png`, `/webp-to-png`, `/split-screenshot`,
  `/crop-screenshot`, `/add-arrow-to-screenshot`, `/highlight-screenshot`) return 404.
- `/tools`, the header menu and the homepage list every live tool; no "Coming soon" anywhere
  (the menu section and `/tools` section hide when empty); homepage says "Thirteen Tools".
- Every Continue with target is live and never the tool itself (unit-tested); lists reviewed.

## Dead code removed

- `src/components/tools/preview-tool.tsx` — unused since Compress went live (no imports in
  `src`, scripts or tests). A scan for component/lib files imported nowhere found no others.

## Homepage performance

10 scripts, **654.4 KB raw / 198.7 KB gzip**. Asserted not loaded on the homepage: OpenCV,
Tesseract and language models, any `.wasm`, anything under `/vendor/` (incl. the Hindi PDF font
`Hind-Regular.ttf`), any worker, pdf-lib, fontkit, the Annotation renderer, the Split tool and
the Compress/Convert UI. (The page's own UI fonts are self-hosted under `/_next/static/media`.)

## Browser limitations (known)

- Playwright WebKit on Windows is **not** Safari: no iOS memory limits, no iOS canvas cap, a
  different image decoder and WebP encoder.
- WebP output ≤ 16,383 px per side; JPEG/WebP exports need one canvas (≤ 16.7 MP policy);
  PNG streams in tiles (needs `CompressionStream`, present in current Safari/Chrome).
- Spike B memory limits are provisional (measured on one 8 GB Windows laptop).
- Firefox is untested on this host.

## Launch-hardening checklist (real devices — none available here)

**iPhone Safari (current iOS and one version back; a 4 GB-RAM model):**
- Paste from Photos and the screenshot share sheet; check HEIC screenshots are refused with a clear message.
- Smart Stitch 3–6 phone screenshots → export PNG; watch for reloads ("page crashed").
- Editor/Annotation on a 1170 × 10,000 image: open, draw, switch tools 10× (canvas cap).
- Split a 30,000 px screenshot into 10; "Download all" behaviour (Safari asks per file?).
- OCR English and English + Hindi on a receipt; model download over cellular; cancel/retry.
- PDF and Searchable PDF of a long screenshot; open in Files and search the text.
- Compress to WebP/JPEG; Convert transparent PNG → JPEG (background colour).
**iPad Safari:** the same, plus split-view width (desktop vs mobile layout breakpoint) and
Apple Pencil for Annotation freehand and handles.
**Mid-range Android Chrome (6 GB):** paste/share-target, Stitch + OCR + PDF chain, touch
dragging of split lines, crop handles and annotation handles; bottom sheets and sticky export.
**Low-memory Android (≤ 3 GB, Android Go):** long stitch (≥ 20,000 px), OpenCV load time,
worker recycling after large exports, tab reload recovery, controlled memory messages.
**Very tall screenshots:** 50,000 px PNG through Stitch, Split, Editor crop and PDF; JPEG/WebP
refusal messages.
**OCR:** first-load model size and caching; offline after first use; Hindi script accuracy.
**Smart Stitch / OpenCV:** WASM load on iOS; vision worker released before export.
**PDF:** pdf-lib + fontkit load only on intent; large PDF save on iOS (Files app).
**Large exports:** 60 MP PNG; time-to-download; no truncation (compare dimensions).
Record per device: success, time, peak memory (Safari Web Inspector / chrome://inspect).
