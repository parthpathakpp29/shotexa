# Phase 2M — Compare Screenshots

Branch `phase-2m/compare-screenshots`, from `phase-2l/beautifier-frames`.
Screenshots: `docs/phase-2m/screenshots/`.

## What was built

`/compare-screenshots` — two workspace images, four ways of seeing what changed, all local.

- **Side by side** — both screenshots in equal cells with a small adjustable gap.
- **Before / after** — one image with a draggable divider; the position is stored as a
  percentage, so it means the same thing in the preview and in the export.
- **Overlay** — "after" over "before" at an adjustable opacity.
- **Difference** — a plain per-channel pixel comparison with an adjustable threshold: changed
  pixels are tinted, unchanged ones keep a faint ghost. It reports *where* pixels differ and
  nothing more; no interpretation is offered or implied.
- A/B pickers over every workspace image (with names and sizes), a swap action, fit
  (Fit / Fill / Actual) and five alignments, labels, background, Fit/100 % zoom, and export to
  PNG (default), JPEG or WebP.

New core module `src/core/compare/` (`types`, `presets`, `layout`, `difference`, `draw`,
`render`); UI in `src/components/tools/compare/`.

## Architecture

- **Small settings only.** The store holds two asset ids plus mode, fit, alignment, divider,
  opacity, threshold, gap, labels and background. No bitmaps, no ImageData. Every change is one
  `COMPARE_SET { before, after, key? }` operation, so undo/redo works as everywhere else and a
  divider drag collapses into one step by gesture key.
- **One canonical comparison space.** `compareLayout()` is pure. Both screenshots are fitted
  into one CELL — the larger of the two in each direction — and placed by `place()`:
  *contain* scales each to fit whole (a smaller screenshot is enlarged so both are compared at
  the same displayed size), *cover* fills the cell and crops with the alignment, *actual* keeps
  natural pixels. One scale per image on both axes, so **nothing is ever stretched**; whatever
  a screenshot does not cover shows the background.
- **One renderer.** `drawCompare()` paints every mode. The preview passes the ≤ 4 MP workspace
  bitmaps and a display scale; the export passes the decoded originals at scale 1.
- **Difference rule for mismatched sizes:** both sides are rasterised into the same space *on
  the same background* before comparing, so a pixel outside one screenshot is compared against
  that background rather than against undefined memory. Unit- and E2E-tested.
- **Export** decodes both originals once, composes on one canvas, encodes through the shared
  Phase 2J encoder, verifies the dimensions and releases bitmaps and canvases in `finally`. No
  data URLs. Worker op `compare.export` with the usual main-thread fallback.

## Performance

Interactive work only ever touches the preview bitmaps: moving the divider, the opacity or the
threshold redraws the small canvas, never the full-resolution comparison. Full-resolution
pixels are read only during export. `compareIssue()` refuses, before anything is decoded, a
comparison that would not fit one canvas or the memory budget — and difference, which needs two
extra buffers, is checked against a correspondingly lower ceiling.

## Two-parent lineage

The exported comparison is added with `producedBy: "compare"` and
`derivedFrom: [assetA, assetB]` — both parents, in order, preserved by the existing artifact
model (Combine already stored multiple parents). Names come from the mode
(`compare-before-after.png`, `compare-overlay.png`, `compare-difference.png`,
`compare-side-by-side.png`) and never expose an internal id.

## Tests and validation

- **Unit (19 new, 502 total):** the comparison cell; contain/cover/actual placement and all five
  alignments; an invariant sweep over four source shapes × three fits × five alignments proving
  the drawn rectangle always matches the aspect ratio of the pixels it shows and stays inside
  both the cell and the source; side-by-side geometry with equal and unequal sizes; divider
  percentages (0/50/100) and pointer→percentage conversion; settings clamping; result naming;
  the memory ceiling per mode; and the difference itself — identical input produces no
  highlights, a changed rectangle produces exactly its own pixels, the threshold decides what
  counts, the tint grows with the magnitude, and the result is symmetric and opaque.
  Store tests cover history, divider coalescing and forgetting a removed file; runtime tests
  cover both parents, the original blobs staying untouched, re-comparing a result and the
  controlled errors.
- **E2E (`compare-production.spec.ts`, 14 tests, pixel-verified):** side by side (exact
  placement), different sizes without stretching, the slider at 0/50/100, a real divider drag
  that exports where it was left and undoes in one step, overlay at 0/50/100 %, **the critical
  difference test** (the highlight covers exactly the changed rectangle, in exactly its place,
  with nothing else marked), identical images, mismatched dimensions, swap, preview/export
  parity, Editor result vs its original, Beautifier result vs its source, mobile (including a
  CDP touch drag that must not scroll the page) and homepage lazy loading. Also checked: both
  sources unchanged, no uploads, no console errors.

## Bugs found and fixed

- **The divider handle swallowed its own drag.** It stopped propagation, so grabbing the handle
  — the obvious thing to do — did nothing; only the canvas either side of it worked. The handle
  now lets the gesture through and is focused on pointer-down, so the arrow keys work straight
  after a drag.
- Several E2E expectations were wrong rather than the code: the divider line itself occupies a
  column at the extremes, a mirrored change produces a bounding box spanning both regions, and
  the beautified copy is larger than its source so the shared cell grows with it.
- **The parity test was comparing an empty frame.** Its "wait until the canvas has painted"
  check was satisfied by the background fill — and later by the white divider line at the exact
  centre — before the workspace preview bitmaps existed, so on WebKit it compared a blank
  comparison against a real export. It now waits for screenshot pixels a quarter of the way in,
  clear of the divider, and for the divider value it set.
- The mobile test dispatched touch events through a Chromium-only API; WebKit now exercises the
  same drag through the pointer path.

## Known limitations

- One canvas per comparison: two very large screenshots (especially in Difference) are refused
  with a clear message rather than rendered partially. Crop them in the Editor first.
- No alignment handles or automatic registration — by design. Images are placed by fit and
  alignment only; pixel-perfect registration is a job for the Editor first.
- The exported slider is a still image at the divider position; there is no interactive export.
- Difference is a flat per-channel comparison with one threshold: no perceptual weighting, no
  ignore-regions, and deliberately no interpretation of what changed.
- Labels are drawn into the exported image when enabled; turn them off for clean pixels.

## Final validation

Against `next start --port 3100` on a **default** production build (no `SHOTEXA_ENABLE_SPIKES`).

| Check | Result |
| --- | --- |
| `next build` (default) | 28 routes, compiled clean |
| `/spikes/*` on the default build | 404 (gated), as designed |
| TypeScript (`tsc --noEmit`) | clean |
| ESLint | 0 errors (1 pre-existing warning in a spike fixture script) |
| Unit (`vitest run`) | 31 files passed, 3 skipped · **502 passed, 7 skipped** |
| E2E WebKit — compare, beautify, stabilisation, encode, split, annotation, editor, safe-share, combine, workspace | **105 passed, 5 skipped** (10.0 m) |
| E2E Chromium — full suite on the default build | **138 passed**; the 17 spike tests fail only because `/spikes/*` 404s there |
| E2E Chromium — the 4 spike specs on a `SHOTEXA_ENABLE_SPIKES=1` build | **20 passed** (49.7 s) → 155/155 across the two builds |
| Compare suite on the default build | **14 passed** Chromium, 14 passed WebKit |
| Homepage weight (unchanged by Compare) | 10 scripts, 662.8 KB raw, 200.6 KB gzip |
| Screenshots | 8 refreshed, byte-identical to the previous capture (deterministic) |

The annotation WebKit case that timed out once during an earlier full run passed in this one; it was
load-related flake, not a regression.
