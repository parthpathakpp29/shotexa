# Phase 2L — Screenshot Beautifier + Browser/Device Frames

Branch `phase-2l/beautifier-frames`, from `phase-2k/stabilisation`.
Screenshots: `docs/phase-2l/screenshots/`.

## What was built

`/screenshot-beautifier` — a raw screenshot turned into a presentation image, locally.

- **Three styles:** *Clean* (the screenshot on a styled background), *Browser* (inside a plain
  window with generic controls and an optional address bar) and *Phone* (inside a generic
  modern handset shell).
- **Background:** seven curated presets, solid or two-stop gradient with four directions, plus
  custom colours.
- **Padding** (None / Small / Medium / Large, or a slider), **corner radius**, **shadow**
  (None / Soft / Medium / Strong), **scale** and **horizontal/vertical position**.
- **Output presets:** Auto, 1:1, 4:3, 16:9, Square 1080 and Landscape 1200 — the composition is
  fitted, never stretched.
- **Export** at full resolution to PNG (default), JPEG or WebP, as a new workspace artifact with
  "Continue with" from the registry.

New core module `src/core/beautify/` (`types`, `presets`, `layout`, `draw`, `render`); UI in
`src/components/tools/beautify/`.

## Architecture

- **Small settings per asset.** `beautify.byAsset` holds the mode, background, padding, radius,
  shadow, scale, offsets, frame options and preset. No pixels in Zustand. Every change is one
  `BEAUTIFY_SET { before, after, key? }` operation, so undo/redo works like every other tool and
  a slider drag collapses into one step by gesture key.
- **One layout, one renderer.** `beautifyLayout(settings, source)` is pure and returns the whole
  composition in output pixels: canvas, content box, screen opening, the screenshot's rectangle,
  the source crop, radii, shadow and frame geometry. `drawBeautified(ctx, layout, image,
  imageScale, scale, offsetY)` paints it. The preview passes the ≤ 4 MP workspace bitmap and a
  display scale; the export passes the decoded original and scale 1 — so they cannot drift.
- **Canvas shadows ignore the transform**, so the blur and offset are multiplied by the scale by
  hand. That is what makes a shadow look the same in the preview and at full size.
- **Screen vs screenshot.** The layout keeps the device's screen opening (`screen`) separate
  from where the screenshot is drawn (`image`). A "fit whole" screenshot is letterboxed on the
  screen rather than sitting on the shell colour.
- **Export** reuses the Phase 2G/2J pipeline: `decodeSource` once, the Spike B strategy chooser
  (single canvas, or tiled PNG streaming for very large outputs, each tile redrawing the
  composition offset by its row), the shared `encodeCanvas`, `readImageSize` verification and
  canvas cleanup in `finally`. No data URLs. Worker op `beautify.export`, with the usual
  main-thread fallback; the image worker is recycled after large sources.

## Frames

- **Browser:** a chrome strip of 5.5 % of the screenshot's width (clamped 28–120 px), three
  generic coloured dots, and an optional rounded address pill whose text the user types. Light
  and dark. The screenshot squares off against the chrome and keeps the window's bottom corners.
  No company's logo or button set is reproduced, and no URL is ever read from the image.
- **Phone:** a 9:19.5 screen in a bezel (3.5 % of the screen width, clamped 8–90 px), rounded
  screen, small camera pill, graphite or silver shell. *Fill screen* crops a differently shaped
  screenshot to the screen; *Fit whole* letterboxes it. Either way the screenshot is drawn at
  its native resolution and never stretched. It is not a copy of any particular handset.

## Tests and validation

- **Unit (24 new, 477 total):** padding that scales with the image, scale and position clamping
  (the composition can never leave the canvas), corner radii and their limits, shadow scaling,
  browser chrome and dot/address placement, phone opening ratio and bezel, contain vs cover
  crops, output presets (ratio presets only grow the canvas; fixed presets are exact), gradient
  directions, settings clamping, mode defaults — and an invariant sweep asserting that across
  five source shapes and nine settings combinations **the drawn rectangle always has the
  aspect ratio of the pixels it shows**.
- **E2E (`beautify-production.spec.ts`, 14 tests, pixel-verified):** clean background and
  padding (exact placement), corners and shadow, gradient, browser frame and dots, address text
  on and off, phone frame, a 7.5:1 strip fitted and filled without distortion, 1:1 / 16:9 /
  Landscape 1200 presets, preview-versus-export parity, undo/redo, Editor → Annotate →
  Beautifier, Smart Stitch → Beautifier, mobile, and homepage lazy loading. Also checked: source
  unchanged, no uploads, no console errors.

## Bugs found and fixed

- **`useElementWidth` never corrected a bad first measurement.** It only updated from a
  ResizeObserver, so a stage whose frame never resized afterwards kept the width it had
  mid-layout — including 0, which left the stage hidden. It now measures on attach and again on
  the next frame. This affected every canvas stage, not only the Beautifier.
- **A letterboxed screenshot had no screen behind it** (it sat on the shell colour). The layout
  now distinguishes the screen opening from the screenshot rectangle.
- The preview drew nothing until the workspace bitmap arrived; it now draws the composition
  immediately and fills the screenshot in when it is ready.

## Known limitations

- Frames are drawn shapes, not photographic mockups: no reflections, no device buttons, no
  branded hardware.
- The phone frame is portrait 9:19.5 only; there is no landscape device or tablet.
- Gradients are two stops in four directions by design — no multi-stop editor.
- In Phone mode the corner-radius control is inactive: the shell keeps its own proportions.
- Exporting selects the new artifact (as in every other tool), so re-select the source to keep
  adjusting the same composition.
- Very large compositions must be PNG; JPEG and WebP need the whole canvas in one canvas and the
  tool says so before exporting.
