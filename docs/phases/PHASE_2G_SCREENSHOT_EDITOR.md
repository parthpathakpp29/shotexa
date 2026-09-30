# Phase 2G — Screenshot Editor (crop, resize, rotate, flip)

Branch `phase-2g/screenshot-editor`, from `phase-2f/surface-sync`.
Screenshots: `docs/phase-2g/screenshots/`.

## What was built

`/screenshot-editor` — the shared image-transform primitives, shipped as a live tool.

- **Crop:** a draggable box with eight handles, move and draw-a-new-box gestures, arrow-key
  nudging, exact X/Y/width/height fields, reset, and Free / Original / 1:1 / 4:3 / 16:9 presets.
- **Resize:** width and height in pixels with an aspect lock, scale readout, and warnings when
  the result is enlarged or stretched.
- **Rotate and flip:** 90° left/right and horizontal/vertical mirroring.
- **Two views of one transform:** *Crop* (the whole image as rotated, with the box on top) and
  *Result* (exactly what will export).
- Full-resolution export to PNG (default), JPEG or WebP. The result is a new workspace
  artifact with "Continue with" actions; the source is never changed.

New core module `src/core/image-transform/`: `types`, `orientation`, `crop`, `transform`,
`matrix`, `render`. New UI in `src/components/tools/editor/`.

## Architecture decisions

- **One logical transform per asset, no pixels.** `ImageTransform` holds the crop (integer
  source pixels), a quarter-turn rotation, flips, a resize, the aspect lock and the crop
  preset. It lives in Zustand as `editor.byAsset`; every change is one
  `EDIT_SET_TRANSFORM { before, after }` operation, so crop, resize, rotate, flip and reset
  all undo the same way. No bitmap snapshots.
- **Fixed order: crop → rotate → flip → resize.** The crop is stored in *source* space, so a
  later rotation or flip never invalidates it; the visible crop is derived on demand.
- **Flips act on what the user sees.** "Flip horizontal" mirrors the currently visible image
  even after a rotation (using R90·FlipH = FlipV·R90).
- **Canonical orientation.** Rotations and mirrors can be spelled 16 ways but only make 8
  distinct pictures. State is normalised to a rotation plus at most a horizontal mirror, so
  equal pictures always compare equal (reset, identity checks, no-op history). A unit test
  proves "same picture ⇔ same stored state" over all combinations. The inspector describes
  mirrored quarter turns neutrally ("Rotated 90° · Mirrored") because two different action
  sequences reach the same stored state.
- **Resize is stored as scale, not pixels.** Cropping after resizing keeps the proportion and
  can never silently upscale. Unlocked scales swap with the axes on a quarter turn.
- **One matrix for preview and export.** `transformMatrix` compiles the whole transform into a
  single canvas affine. The live preview draws the ≤ 4 MP workspace preview through it; the
  export draws the original file through it — so the preview cannot drift from the output.
  Only the crop region is sampled, and a 1:1 crop/rotate/flip disables smoothing so it is a
  pixel-exact copy.
- **Responsive dragging.** A crop drag lives in local component state; the store is written
  once on pointer-up (one undo step per gesture), and the bitmap canvas is not redrawn while
  dragging.
- **Typed values are honoured.** Crop and resize fields commit on Enter or blur, not per
  keystroke. A typed position that would push the box past the image trims it to fit rather
  than snapping back.

## Export and memory

`renderTransform` follows the Smart Stitch / Combine pipeline (Spike B):
`chooseOutputStrategy` picks one canvas, or **tiled PNG streaming** for outputs beyond the
canvas budget — each tile redraws the transformed source offset by its row. This keeps tall
Smart Stitch results editable. Output is verified with `readImageSize`; controlled
`EDITOR_*` codes cover invalid transforms, decode failure, a source whose decoded size
disagrees with its header, memory pressure, sizes a format would silently crop, and failed
verification. Limits: width ≤ 32,767 px (the tile width), height ≤ 131,072 px, ≤ 200 MP,
enlargement ≤ 8×. Worker-first, with the main-thread fallback for browsers without worker
OffscreenCanvas; bitmaps and canvases are released in `finally`; no data URLs.

## Workspace handoff

Works on originals and on any image artifact — Smart Stitch, Combine, Safe Share, Blur,
Privacy Clean and earlier edits — without re-upload. Stitch, Combine, Safe Share and Blur
now list the Editor as a continuation; the Editor offers Safe Share, Extract Text, PDF and
Combine. Annotate is pre-listed and stays hidden by `continuationsFor()` until it ships.

## Reused work

Spike B's strategy chooser, streaming PNG encoder and memory rules; the Phase 1 workspace
shell, store command history and artifact model; Phase 2F's registry-driven discovery (the
new **Edit** category appears in the header menu, footer, `/tools` and the homepage index
automatically, and the homepage tool count is now derived from the registry).

## Tests and validation

Unit tests: 350 passing across 25 files (+64 over Phase 2F). Chromium E2E: all 77 passing
(66 existing + 11 new). WebKit: the 11 editor flows plus the 8 Safe Share flows pass, which
exercises the main-thread export fallback. Firefox skipped (host issue, see below).

Unit coverage: orientation (hand-computed points,
exact inverse, visible-frame composition, canonical uniqueness), crop geometry and ratio
locks, resize maths and limits, the transform matrix (checked against the independent point
formulas and a hand-computed crop→rotate→flip→resize case), export planning (single canvas,
tiled, controlled failures), store undo/redo/coalescing, and runtime artifact handoff with a
source-immutability check. E2E (`editor-production.spec.ts`) verifies **exported pixels** on a
four-colour test image for crop, locked/unlocked resize, rotation, both flips, a combined
transform and undo/redo; the Smart Stitch, Combine and Safe Share handoffs; and mobile.

## Fixes made along the way

- **Stale drag commit (also in Safe Share).** Pointer-up committed the rectangle from the
  last *rendered* frame. When a fast drag outran rendering (seen on WebKit's main-thread
  path), the crop jumped back — and in Safe Share a quick drag could create no region at
  all. Both canvases now commit the latest drag value from a ref.
- **`applyOp` catch-all.** The store's final `else` silently handled PDF breaks; every
  operation type is now matched explicitly so a new type can't fall into another's branch.

## Known limitations

- Rotation is quarter turns only (no free-angle straighten).
- Firefox is skipped in this suite for the same host-level Playwright issue as 2D/2E.
- A JPEG whose EXIF orientation makes its decoded size differ from its header is refused
  (`EDITOR_SOURCE_MISMATCH`) rather than guessed at; screenshots rarely carry this tag.
- Fit never enlarges past 100%, so very small images stay small on screen (zoom is available).
