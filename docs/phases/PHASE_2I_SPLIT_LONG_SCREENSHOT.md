# Phase 2I — Split Long Screenshot

Branch `phase-2i/split-long-screenshot`, from `phase-2h/annotation`.
Screenshots: `docs/phase-2i/screenshots/`.

## What was built

`/split-long-screenshot` — cut one image into horizontal pieces, locally.

- **Equal:** by number of sections (near-equal pieces, never more than 1 px apart) or by target
  height (a cut every N px; the last piece takes the remainder).
- **Custom:** click the image to add a line, drag a line, arrow-key nudge (Shift = 10 px),
  Delete/Backspace or the toolbar to remove, "Add split" (halves the tallest piece), previous /
  next line navigation, reset. Dragging, nudging or deleting an equal line turns the split into
  custom lines at the same positions in the same step.
- Numbered sections with their sizes on the preview; a piece list in the inspector.
- **Export** renders every piece from the original at full resolution as PNG (default), JPEG
  or WebP, named `shotexa-split-01.png`, `-02`, …
- **Results:** thumbnails, per-piece Download, "Download all", and an explicit "Add to workspace"
  that turns the pieces into workspace artifacts; Continue with then comes from the registry.

New core module `src/core/split/` (`types`, `plan`, `render`); UI in
`src/components/tools/split/`; shared `NumberField` moved to `src/components/ui/number-field.tsx`.

## Architecture decisions

- **Small settings in source pixels.** `split.byAsset` holds `{ mode, by, count, height, lines }`.
  No pixels in Zustand. Every change is one `SPLIT_SET { before, after, key? }` operation, the
  same pattern as Annotation (`null` = never split / reset).
- **Pieces are half-open row ranges between increasing cuts:** `[0, c1), [c1, c2), …, [cn, H)`.
  Every row is in exactly one piece by construction; `validatePieces` rejects gaps, overlaps,
  fractional rows, slivers (< 24 px) or lost bottom rows before anything is rendered.
- **PDF page-break model reused.** Custom lines are `PageBreak`s, edited with the existing
  `clampBreak` / `moveBreak` / `addBreak` / `removeBreak` / `validateBreaks`: a dragged line is
  clamped between its neighbours and can never reorder.
- **Limits:** pieces ≥ 24 px, at most 100 pieces; the count and height inputs are clamped to
  what the image can hold; a sliver remainder in height mode joins the previous piece.
- **Latest-value drags** (`DragSession`): the newest pointer position is committed on release —
  one undo step per drag. The preview is the ≤ 4 MP workspace bitmap drawn once; lines and
  labels are DOM overlays, so dragging never re-renders pixels.

## Export and memory

- The worker (`split.export`) decodes the original **once**, then renders each piece as an
  identity-orientation crop through the Phase 2G pipeline (`renderDecoded`, split out of
  `renderTransform`). Each piece therefore gets the same single-canvas / tiled-PNG choice, the
  pixel-exact 1:1 copy, encoder verification and canvas cleanup.
- No canvas of the whole image is made; each piece's canvas (or tile) is released as soon as it
  is encoded; the bitmap is closed in `finally`. No data URLs.
- Main-thread fallback (WebKit) through the same code; the image worker is recycled after
  sources above 16 MP.
- **Downloads:** no ZIP library exists in the project, so "Download all" saves the pieces one
  after another (250 ms apart), as allowed by the spec. No batch/ZIP system was built.

## Workspace handoff

- Works on originals and on Smart Stitch, Combine, Editor and Annotate results (all list Split
  as a continuation) without re-upload.
- Pieces join the workspace only on "Add to workspace" (`addArtifacts`: one batch,
  `producedBy: "split"`, `derivedFrom: [source]`, the first piece selected). Split then offers
  Combine, Annotate, Editor, Safe Share, Extract Text and PDF.
- Split works on the file as it is; pending Editor changes or annotations are not applied (export
  from those tools first).

## Tests and validation

- **Unit: 431 passing (+25).** Equal-count and target-height maths, clamps and limits, sliver
  folding, custom add/move/delete/reset, neighbour clamping, invalid-line detection, a
  reconstruction check over many plans, validation of gaps/overlaps/fractions, the crop and
  source→output matrix of each piece (a pure vertical shift), file names, store undo/redo and
  gesture coalescing, runtime export (original file in, pieces out, nothing added until asked),
  artifact creation and controlled errors, and the registry/route/SEO config.
- **E2E (`split-production.spec.ts`, 12 tests), reconstruction verified pixel by pixel** on
  row-coded fixtures (each row's colour encodes its y): a 600 × 60,000 image split in two (tiled
  path), 4 sections plus individual download, Add to workspace and Continue to Annotate, target
  height, custom add, drag with neighbour clamping and nudges, delete, undo/redo/reset, Smart
  Stitch and Combine results (restacked pieces equal the original byte for byte), mobile, a real
  touch drag (Chromium) and homepage lazy loading. Also checked: source unchanged, no uploads, no
  console errors.
- Chromium: full suite 102/102 on a production build. WebKit: Split 11/11 (touch test is
  Chromium-only), Annotation 13/13, Editor 11/11, Safe Share 8/8. Firefox skipped (host issue).

## Known limitations

- Horizontal cuts only; no content-aware placement (out of scope).
- "Download all" is sequential downloads; some browsers ask once to allow multiple downloads.
- Pending Editor transforms and annotations are not applied by Split.
- Rendered pieces live in the page until added to the workspace; navigating away discards them.
