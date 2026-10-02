# Phase 2J — Compress Screenshot + Convert Screenshot

Branch `phase-2j/compress-convert`, from `phase-2i/split-long-screenshot`.
Screenshots: `docs/phase-2j/screenshots/`.

## What was built

- `/compress-screenshot` — make a PNG, JPEG or WebP smaller. The format stays the same unless
  the user picks another; JPEG/WebP get a quality slider (default 80%); PNG shows a factual
  note instead of a fake quality control.
- `/convert-screenshot` — PNG ↔ JPEG ↔ WebP in every direction, same pixel size. Defaults to
  the natural target (PNG → JPEG, JPEG/WebP → PNG); JPEG/WebP quality (default 92%); a JPEG
  background (White default, Black, Cream, custom colour) for inputs that can carry
  transparency, with a note saying whether the image actually has transparent areas.
- Both: original and result side by side (dimensions, format, size), an exact size comparison
  (original, new size, bytes and percent saved — or "larger by"), honest suggestions with a
  "Try it" button, Download, the result added as a selected workspace artifact, and Continue
  with from the registry.

New shared core `src/core/image-encode/`; UI in `src/components/tools/encode/` (one workspace
for both tools).

## Shared encoder architecture

- `formats` — the one PNG/JPEG/WebP table (MIME, extension, label), quality support, alpha
  support, quality clamping (50–100%), PNG never receives a quality.
- `encode` — `encodeCanvas` (the single canvas → Blob step) and `prepareBackground` (JPEG gets
  the chosen background; PNG/WebP stay transparent). The Editor/Annotation/Split renderer,
  Combine and the Smart Stitch chain now use these instead of their own copies.
- `limits` — `encodeIssue`: the Spike B output strategy decides, before decoding, whether a
  format can hold the image (WebP ≤ 16,383 px per side; JPEG/WebP need one canvas; PNG
  streams in tiles).
- `reencode` — `encodeImage`: decode the original once and re-encode through the Phase 2G
  renderer with an identity transform (`renderDecoded`: pixel-exact 1:1 copy, single canvas or
  tiled PNG, dimension verification, cleanup), plus an optional second measurement (WebP at
  80% when the output is PNG) so suggestions quote a real size. Errors map to `ENCODE_*`.
- `compare` — `compareSize` (smaller / same / larger, whole percent) and `suggest`.
- `settings` — defaults, format resolution per tool, backgrounds, file names
  (`compressed-<name>.<ext>`, Convert keeps the name with the new extension).
- `alpha` — transparency detection on the ≤ 4 MP preview (never the full file).
- Worker op `image.encode`, main-thread fallback (WebKit) through the same code. React
  components contain no canvas encoding.

## Behaviour

- Moving the slider never re-encodes. "Check file size" encodes once and shows the exact
  result; the primary action reuses it when the settings haven't changed (the downloaded file is
  byte-identical to what was shown), otherwise encodes first. Changed settings dim the last
  result with "Check again".
- A result larger than the original is labelled "Larger by … (+N%)" with a plain warning; no
  savings are claimed. Suggestions (lower quality, try WebP, or the measured WebP size for PNG)
  change settings only when the user presses "Try it".
- Metadata such as EXIF is not copied into the new file (stated in the UI).

## Workspace handoff

Works on originals and on Smart Stitch, Combine, Safe Share, Blur, Editor, Annotation and
Split results without re-upload (all list Compress; Editor, Annotation and Split also list
Convert). The saved result is an artifact (`producedBy: "compress" | "convert"`,
`derivedFrom: [source]`) and is selected. Both tools continue to Editor, Annotate, Safe Share,
Extract Text, PDF and Combine. With these two live, every registry tool is live; the empty
"Coming soon" menu section is now hidden.

## Tests and validation

- Unit: 18 encoder tests (format/MIME mapping, quality handling, background flattening, PNG
  vs JPEG/WebP encoder config, limits and controlled errors, size comparison, larger-output
  reporting, suggestions, settings and names), runtime tests (original file in, nothing saved
  until asked, artifact metadata, re-compressing a result, JPEG transparency shortcut,
  controlled errors) and route/registry/SEO tests.
- E2E (`encode-production.spec.ts`, 13 tests): JPEG → smaller JPEG; JPEG → WebP; transparent
  PNG → JPEG on white and on a custom colour; PNG → WebP keeping transparency; WebP → PNG and
  the WebP size limit; exact size/percent display; a larger result and "Try it"; Editor →
  Annotation → Compress; Split piece → Convert; mobile Compress; mobile Convert (cream);
  homepage lazy loading. Outputs are checked by file signature, decoded in the browser and
  sampled (dimensions, colours, alpha); no uploads; no console errors; source unchanged.
- Chromium: full suite 115/115 on a production build. WebKit: Compress/Convert, Split,
  Annotation, Editor and Safe Share pass (the size-limit test needed a wait for the new file;
  fixed). Firefox skipped (host issue, as before).

## Known limitations

- The browser's PNG encoder has no compression level, so PNG → PNG rarely gets smaller; the UI
  says so and quotes the measured WebP size instead.
- JPEG/WebP need the whole image in one canvas: very long screenshots must use PNG or be split
  first (explained before encoding). WebP holds at most 16,383 px per side.
- Metadata (EXIF, colour profile) is not carried over; colours are encoded as sRGB by the
  browser.
- Transparency detection uses the downscaled preview, so a transparent area smaller than a
  preview pixel may be reported as "no transparent areas" (the background is still applied).
