# Phase 2N — Batch Processing + ZIP Export

Branch `phase-2n/batch-zip`, from `phase-2m/compare-screenshots`.
Screenshots: `docs/phase-2n/screenshots/`.

## 1. Git state

Phase 2N was developed on its requested branch. The working tree contains only the Phase 2N
implementation, dependency lockfile changes, tests, screenshots and this report. It has not been
merged or committed automatically.

## 2. Files changed

- `src/core/batch/` — types, defaults/settings, resizing rules, naming and the sequential runner.
- `src/core/archive/zip.ts` — the lazy browser ZIP adapter.
- `src/core/runtime/batch-result-registry.ts` — encoded output ownership outside Zustand.
- `src/core/runtime/{runtime,store,types}.ts` — batch orchestration and lightweight state.
- `src/workers/{protocol,image.worker}.ts` — background-aware transform export reuse.
- `src/components/tools/batch/` and `src/app/(workspace)/batch-screenshots/` — production tool.
- `src/config/tools.ts`, `src/components/brand.tsx`, `playwright.config.ts` — registry and shell.
- `src/tests/unit/batch/`, workspace unit tests and `src/tests/e2e/batch-production.spec.ts`.
- `package.json` / `package-lock.json` — `client-zip` runtime; `fflate` test-only extraction.

## 3. Batch architecture

The implementation reuses the shared `WorkspaceRuntime`, `AssetRegistry`, image worker,
transform renderer, encoder and metadata worker. Zustand contains only selected asset ids,
operation/settings, current index, per-item status/error/result ids and whether results were
added. Encoded output `Blob`s and object URLs live in `BatchResultRegistry`.

The browser never persists or uploads source images. Sources are read from `AssetRegistry`; the
original blobs are never modified. Removing a source removes its logical batch item and releases
retained batch results tied to it. Reset and runtime disposal release every remaining URL/blob
reference.

## 4. Selection and model

The tool accepts 2–50 workspace images, defaults to the existing workspace order, and provides
Select all, Clear all and per-file selection. Each row reports filename, dimensions, encoded size,
format and status. The encoded-input guard is 512 MiB across the selected files; this is a refusal
threshold rather than a promise that every set below it will fit every phone.

## 5. Sequential processing

`runSequential()` starts one full-resolution operation at a time. Success or failure is recorded
before the next id starts. A deterministic unit test observed a peak concurrency of exactly one;
real Chromium/WebKit flows cover multiple files, a format-limited failure, cancellation and retry.
Image workers are recycled after source images above 16 MP. WebKit's main-thread fallback yields a
macrotask between files so the Cancel control remains actionable.

## 6. Compress

Batch Compress calls the Phase 2J encoder. It supports Same/PNG/JPEG/WebP and JPEG/WebP quality.
Rows show original and output byte sizes and a saving only when the result is actually smaller;
larger output is described factually.

## 7. Convert

Batch Convert reuses the same encoder for PNG, JPEG and WebP without resizing. JPEG can flatten
transparent sources onto White, Black, Cream or a custom colour. A browser test verifies the
selected cream background and another verifies mixed-source WebP output.

## 8. Resize

Batch Resize reuses the Phase 2G transform/export path. Width, height, percentage and Fit Within
all preserve aspect ratio. Enlargement is off by default. The output format may stay the same or
be PNG/JPEG/WebP. Unit and browser tests cover landscape, portrait and already-small inputs.

## 9. Privacy Clean

Privacy Clean calls the existing metadata worker's inspect-clean-verify pipeline. Container-level
JPEG/PNG/WebP cleaning is retained, so a metadata-free file returns its original blob rather than
being re-encoded. Verification remains mandatory for changed outputs and no new privacy claim was
introduced.

## 10. Per-file errors and retry

A failed item does not abort later files. Completed results stay available and are included in the
ZIP; failed items are visibly excluded. Retry operates only on failed/cancelled items and uses the
current settings. The browser regression uses an over-limit WebP, preserves two completed WebPs,
changes to PNG, retries only the failed file and verifies the mixed final archive.

## 11. Cancellation

Cancel aborts the active operation where supported, stops before the next file, retains completed
outputs and marks the remainder not processed. It does not create partial results. Batch execution
itself is deliberately outside workspace undo/redo; the recovery actions are Cancel, Retry and
Reset.

## 12. Result registry and cleanup

`BatchResultRegistry` owns result blobs and lazily-created object URLs. URLs are revoked on remove,
reset, source removal and runtime disposal. Unit tests cover cleanup. Outputs are not duplicated in
Zustand or added to the workspace until the explicit action is pressed.

## 13. ZIP implementation

`client-zip` 2.5.1 is loaded by dynamic import only when Download ZIP is requested. Entries are
flat and uncompressed because the image payloads are already compressed. Names are stable,
case-insensitively collision-safe (`image.png`, `image-2.png`, ...), and timestamps are fixed for
deterministic output. The unit test extracts the archive with the test-only `fflate` dependency and
compares every output byte exactly; E2E tests also extract downloaded archives and verify names,
formats and dimensions.

## 14. ZIP memory behaviour

Only encoded result blobs survive between jobs; decoded pixels never accumulate across files.
`client-zip` receives blobs directly, but its final `.blob()` still creates the complete archive.
Shotexa therefore refuses ZIP creation above 96 MiB of encoded results, before that archive can
coexist with a much larger result set. This conservative V1 limit is more honest than implying a
streaming download that the current browser download path does not provide.

## 15. Workspace handoff and lineage

Add results to workspace is explicit and idempotent. Successful outputs are added in selected
order, the first is selected, `producedBy` is `batch`, and each result has exactly one
`derivedFrom: [sourceId]`. This distinguishes batch orchestration from the underlying operation
while preserving its one-parent source truth. The ZIP is never registered as an image artifact.

## 16. Mobile

The existing mobile workspace shell is reused: files and settings remain in touch-sized sheets,
the result list exposes individual/ZIP downloads, and the sticky Export action remains at least
44 px high. Processing is still sequential. The 390×844 browser flow passes on Chromium and
WebKit.

## 17. SEO and registry

`/batch-screenshots` is the only canonical route, with the requested title and H1. It contains the
working tool, local-processing reassurance, supported operations, How it works, FAQ and related
tools. The four proposed synonym routes return 404. Batch was added to the Edit category as preview
during implementation and flipped live after validation; the sitemap now contains 19 routes and
the homepage truthfully shows sixteen live tools.

## 18. Performance and bundle

Production Chromium network measurements:

| Surface | Scripts | Raw JS | Gzip JS |
| --- | ---: | ---: | ---: |
| Homepage | 10 | 672.9 KiB | 203.4 KiB |
| Batch route | 12 | 733.0 KiB | 222.4 KiB |
| Batch incremental | 2 | 60.1 KiB | 19.0 KiB |

The `client-zip` output chunk is separate (6.2 KiB raw / 2.6 KiB gzip) and is absent from both the
homepage and the initial Batch route. Automated network checks also found no Batch implementation,
ZIP code, OpenCV, Tesseract, PDF engine, vendor model or worker asset on the homepage.

## 19. Tests

| Check | Result |
| --- | --- |
| Production build | 29 routes, TypeScript clean |
| ESLint | 0 errors/warnings |
| Unit suite | 31 files, **499 passed** |
| Batch E2E — Chromium | **10 passed** |
| Batch E2E — WebKit | **10 passed** |
| Production E2E — Chromium | **145 passed** (one stale route-count assertion corrected and rerun) |
| Production E2E — WebKit | **123 passed, 22 documented skips** |
| Firefox Batch | 10 skipped: local Playwright Firefox cannot create a page on this Windows host |

Unit coverage includes selection/order/50-file limit, settings/status state, sequential peak
concurrency, failure isolation, cancellation, all resize modes, aspect ratio, output mapping,
privacy-clean reuse, deterministic/collision-safe names, URL cleanup, exact ZIP extraction and
workspace lineage. Browser coverage includes all four operations, transparent JPEG background,
large-dimension failure/retry, explicit artifact addition, cancellation, mobile and lazy loading.

## 20. Bugs discovered and fixed

- Partial-failure settings changes originally cleared completed outputs. They now preserve
  completed work while applying the new settings only to Retry failed.
- WebKit's main-thread fallback could complete the next decode before the Cancel click got an
  event-loop turn. An explicit between-file yield now makes cancellation deterministic without
  permitting concurrent jobs.
- Removing a source released its `AssetRegistry` data but initially left its encoded batch result
  retained until Reset. Source removal now releases the linked result and URL immediately.
- The existing sitemap E2E still expected 18 routes and “Fifteen Tools.” It now checks 19 routes,
  “Sixteen Tools,” and the new Batch synonym 404s.

## 21. Known limitations

- The ZIP download is capped at 96 MiB of encoded results and is buffered as one final Blob.
- The 50-file limit does not imply that 50 exceptionally large images are safe; input/output and
  per-format dimension guards can refuse a job first.
- Firefox Batch could not be exercised on this host because the local Playwright browser cannot
  create a page. Chromium and Playwright WebKit passed; Playwright WebKit is not real Safari.
- Result blobs live only for the current in-memory workspace; refresh intentionally clears them.
- Batch does not reorder independently of workspace order and does not put executions into undo
  history, by design.

## 22. Screenshots

- `01-batch-ready.png` — selected files and operation settings.
- `02-batch-results.png` — completed results, individual downloads, ZIP and explicit workspace add.
- `03-mobile-batch.png` — mobile results and sticky workspace controls.

## 23. Recommendation for launch hardening

Phase 2N is ready for V1 within its documented caps. Final launch hardening should validate the
25–50 file path on real lower-memory Android and Safari devices, record OS-level peak memory for
representative large batches, confirm download behaviour near the 96 MiB archive cap, rerun the
Firefox suite on a healthy host, and perform keyboard/screen-reader plus manual visual QA. Those
checks should tune limits and copy; they should not change the sequential architecture.
