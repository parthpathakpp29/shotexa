# Phase 2H — Annotation (arrows, boxes, highlights, text, drawing, steps)

Branch `phase-2h/annotation`, from `phase-2g/screenshot-editor`.
Screenshots: `docs/phase-2h/screenshots/`.

## What was built

`/annotate-screenshot` — a live tool built on the Phase 2G transform pipeline.

- **Tools:** Select, Arrow, Rectangle, Highlight (translucent, multiply-blended, adjustable
  opacity), Text (click to place, type, Enter to finish, Shift + Enter for a new line),
  Draw (freehand with mouse, pen or touch; simplified on release), and numbered Step markers.
- **Editing:** select, move, resize (8 handles on boxes, 2 on arrows), recolour, restyle,
  retype, renumber and delete (Delete/Backspace when not typing). Arrow keys nudge (Shift = 10
  px). Clicking empty canvas deselects. Double-click or Enter edits text.
- **Undo/redo** through the workspace command history: one entry per gesture.
- **Export** flattens at full resolution into a new workspace artifact
  (`annotated-<name>.png|jpg|webp`); the source and its annotations stay as they were.
- **Handoff:** works on originals and on Smart Stitch, Combine, Safe Share, Blur and Editor
  results without re-upload. "Continue with" comes from the registry.

New core module `src/core/annotation/`: `types`, `geometry`, `objects`, `render`, `export`.
New UI in `src/components/tools/annotate/`. Shared stage sizing moved to `src/lib/stage-size.ts`.

## Architecture decisions

- **Vector objects in source pixels.** Each annotation is a small object (`from/to`, `rect`,
  `at`, `points`, sizes, colour); `annotation.byAsset` holds them in Zustand. No raster,
  no ImageData. Every change is one `ANNOTATE_SET { before, after, key? }` operation.
- **The Phase 2G matrix is the only coordinate system.** `sourceToOutputMatrix(t, source)`
  (new in `image-transform/matrix.ts`) composes the existing `transformMatrix` with the crop
  offset; `invertMatrix` gives the way back. `annotationFrame` bundles the matrix, its
  inverse, its scale `k` and the output size. No crop or rotation maths lives in Annotation.
- **Interact in output pixels, store in source pixels.** The canvas projects objects into the
  output frame (what the user sees), edits them there, and maps them back on commit. Points
  map through the matrix; lengths (stroke, font, radius) scale by `k`. So an annotation made
  before or after a crop, rotation, flip or resize stays on the same content.
- **Glyphs stay upright.** Text and step numbers never rotate or mirror with the image; only
  their anchor follows the content. Boxes map to their bounding box (exact for quarter turns).
- **One renderer.** `drawAnnotations` draws the preview (on top of a cached transformed base)
  and the export (through a new `overlay` hook in `renderTransform`, per tile when tiled). An
  E2E test compares the on-screen canvas with the exported file pixel by pixel.
- **Latest-value gestures.** `DragSession` keeps the newest pointer value in a ref;
  pointer-up commits that, never the last rendered frame. A fast drag with a single move
  event is covered by unit and E2E tests.
- **Honest undo.** Consecutive edits merge only when they share a gesture key (typing into
  one text, dragging one slider, nudging one object) within the coalesce window, so "add
  arrow" and "type text" are never folded into one step.
- **Automatic sizes.** Stroke, font and marker sizes default to a proportion of the image's
  short side (e.g. 6 px stroke, 45 px text on a 1170 px-wide phone screenshot), and can be
  set explicitly.
- **Step numbers are predictable.** A new marker takes max + 1; deleting never silently
  renumbers the rest. "Renumber steps 1–N" appears when there are gaps or duplicates.
- **System font.** Text uses a system UI stack so the Image Worker's `OffscreenCanvas`
  (which cannot see page web fonts) renders exactly what the preview shows.

## Export and memory

`renderAnnotated` projects the objects once and calls `renderTransform` with the overlay, so
it inherits the 2G pipeline unchanged: single canvas or tiled PNG streaming, `readImageSize`
verification, limits, controlled errors, bitmaps and canvases released in `finally`, no data
URLs. Worker-first (`annotation.export`) with the main-thread fallback (WebKit). The image
worker is released after exports above 16 MP. `ANNOTATION_EMPTY` is a controlled error.

## Workspace integration

- Editor changes are included: Annotate shows the image as edited and exports with the edit
  applied; a note links back to the Editor. The Editor shows a note when the image has
  annotations (Editor export is transform-only).
- Registry: Annotate is **live** (category Edit). Stitch, Combine, Safe Share, Blur and the
  Editor list it as a continuation; Annotate continues to Safe Share, PDF, Combine, Extract
  Text and the Editor. Header menu, footer, `/tools`, homepage index, sitemap and robots
  updated automatically. SEO title "Annotate Screenshot Online – Add Arrows, Text &
  Highlights | Shotexa", H1 "Annotate a Screenshot Online". No synonym routes.

## Tests and validation

- Unit: 406 passing (+56 over Phase 2G). `annotation-core.test.ts` covers models, the frame
  through crop / 90° rotation / both flips / resize (hand-computed points plus
  cross-checks against the orientation module), every object's geometry, hit-testing,
  move/resize clamps, text measurement, freehand simplification (bounded time and size),
  step numbering, `DragSession`, and preview/export draw-call parity. Store tests cover
  history and coalescing; runtime tests cover export, source immutability and handoff.
- E2E (`annotation-production.spec.ts`, 13 tests, pixel-verified): arrow; rectangle and
  highlight with a one-event fast drag; text place/move/edit; freehand; steps with deletion
  and renumbering; mixed types with preview = export; move/resize/delete with undo/redo;
  Editor, Combine and Smart Stitch results → Annotate; crop + rotate alignment (before and
  after the edit); mobile; homepage does not load the annotation code. Also checked: no
  uploads, no console errors, source unchanged, full-resolution dimensions.
- Chromium: full suite 90/90 on a production build. WebKit: annotation 13/13, editor 11/11,
  Safe Share 7/8 (see limitations). Firefox skipped (host issue, as in 2D–2G).

## Fixes made along the way

- **Text box closed immediately.** The default mousedown focus pulled focus back to the
  stage and blurred the new text box. The stage now prevents it and manages focus itself.
- **Canvas jumped mid-gesture.** Focusing a partly off-screen stage scrolled it, so drawing
  on a tall image or on a phone landed ~25 CSS px off. Focus now uses `preventScroll`.
- **Keyboard lost after typing.** After Enter/Escape in a text box, focus returns to the
  canvas so Delete, Escape and nudges keep working.
- **Undo merged unrelated steps.** Coalescing now requires the same gesture key.
- **Freehand simplification was O(n²).** A 20k-point path took ~70 s; it now takes a single
  RDP pass over a capped, pre-filtered input (< 1.5 s worst case, 800 points max).

## Known limitations

- Text anchors at its top-left. After a rotation or flip the text stays upright, so it sits
  beside the same content rather than being rotated with it.
- Boxes on a non-uniformly resized image keep their mapped bounding box; strokes use the
  geometric-mean scale.
- No rich text, fonts or stickers (out of scope).
- WebKit: "Smart Stitch → Safe Share" (untouched Phase 2A test) is intermittent on this host,
  2 of 3 isolated reruns pass.
- Firefox is skipped in this suite for the same host-level Playwright issue as 2D–2G.
