# Phase 2E — Combine Screenshots

Branch `phase-2e/combine-screenshots` · commit `4109b89` · 25 files, ~895 insertions.
Screenshots: `docs/phase-2e/screenshots/`.

## What was built

`/combine-screenshots` — arrange two or more screenshots into a single image. This is the
counterpart to Smart Stitch: Stitch is for captures that *overlap*, Combine is for
captures that do not.

- Layouts: vertical stack, horizontal row, or a grid (auto, 2, 3 or 4 columns).
- Spacing 0–64 px, alignment start/center/end, and a background of clear, white, cream or dark.
- Sizing: keep original sizes, or match width (vertical/grid) / match height (horizontal).
- Live canvas preview from workspace thumbnails; export composes the original files.

New core: `src/core/combine/{types,layout,compose,inputs,errors}.ts`.
New UI: `combine-{tool,preview}.tsx`.

## Architecture decisions

- **Layout is pure and deterministic.** `planCombine(sources, settings)` takes only
  dimensions and returns a `CombinePlan` of placements in output pixels. No pixels, no DOM,
  no async — which makes it fully unit-testable and lets the preview and the exporter share
  one source of truth.
- **Scaling never distorts.** `scaled()` applies one ratio to both axes; "match width" and
  "match height" resize uniformly. `resolveCombineSettings` also swaps an impossible
  sizing mode for the current layout rather than producing a stretched result.
- **Selecting a result hides the inputs that produced it.** `selectCombineInputs` makes a
  selected artifact the primary source and excludes its own `derivedFrom` files, so
  "stitched result + one more screenshot" works without the sources appearing twice.
- **Export reuses the Spike B strategy chooser** — single canvas, or tiled PNG streaming
  for outputs beyond the canvas budget — and recycles the image worker above 16 MP.
- Settings live in Zustand as `CombineSettings` and are undoable via
  `COMBINE_SET_SETTINGS`; the plan and the pixels stay outside the store.

## Reused spike work

- **Spike B (large-image memory):** `chooseOutputStrategy`, `composeTiles`,
  `createBlobBitmapProvider`, the streaming PNG encoder, export size verification, and the
  canvas-reset and bitmap-close rules.

## Tests and validation

- Unit: `src/tests/unit/combine/combine-core.test.ts` — layout maths for all three
  arrangements, gap handling, uniform scaling, grid column distribution and settings
  resolution.
- E2E: `src/tests/e2e/combine-production.spec.ts` — 8 tests that assert the *exported
  pixels*, using solid-colour PNGs so placement and aspect ratio can be checked exactly;
  plus reordering, grid layout, the Smart Stitch and Safe Share handoffs, mobile, and the
  no-upload assertion.

## Known limitations

- Firefox is skipped in this suite for the same host-level Playwright issue as Phase 2D;
  Chromium and WebKit cover the flow.
- Transparent backgrounds become white in JPEG — stated in the UI.
- Grid fills row-major with no per-cell reordering; order comes from the file tray.
- Very large combinations fall back to controlled `COMBINE_*` error codes rather than
  degrading quality.
