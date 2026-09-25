# Spike E — Metadata removal / Privacy Clean: results

Status: **complete, awaiting review.** This is the last Phase 0 spike. No product
`/remove-image-metadata` page, Safe Share UI, workspace or backend was built. Everything runs
in the browser; images never leave the device.

## Verdict

**Production recommendation: ready with limited refinements** (§17).

The question: *can Shotexa safely inspect, remove and verify privacy-sensitive metadata from
JPEG, PNG and WebP files locally, without unnecessary recompression or damaging the image?*
**Yes.**

- **Container-level, no recompression.** Privacy Clean parses the container, drops
  privacy-sensitive segments/chunks and copies everything else **byte-for-byte**.
  - The image payload (JPEG scans, PNG IDAT, WebP VP8/VP8L/ALPH/ANMF) is never decoded or
    re-encoded.
  - Across **48 fixtures**, decoded pixels are identical before and after in Node (jpeg-js,
    pngjs) and in Chromium, Firefox and WebKit, through three decode paths.
  - The image payload bytes are verified identical, too.
- **Nothing important is broken.**
  - ICC profiles, PNG colour chunks (sRGB/gAMA/cHRM/cICP…), transparency, APNG/animated WebP
    frames, JFIF and Adobe APP14 are kept.
  - EXIF **orientation is kept** as a 26-byte Orientation-only EXIF.
  - This was measured, not assumed: stripping these would visibly rotate/flip images (all 3
    engines) and shift colours (Chromium, WebKit) (§8, §9).
- **Removal is verified, not trusted.** Every clean output is re-parsed by the same inspection
  logic and checked against the original (privacy categories gone, payload identical,
  dimensions equal, preserved elements present) before it is returned. Two independent oracles
  confirm it in tests:
  - a byte-grep for every synthetic value (ASCII and UTF-16);
  - **exifr**, a third-party parser used in tests only.
- **Safe on hostile input.** Strict bounds-checked parsers failed closed with controlled codes
  across **202,192 seeded fuzz cases**, with:
  - 0 uncontrolled exceptions;
  - 0 invalid outputs;
  - 0 privacy leaks in outputs;
  - 0 hangs (worst case 218 ms).
- **Fast and small.**
  - A normal screenshot is cleaned **and verified** in **2–20 ms** (browser medians).
  - A 1080×20,000 PNG takes ~0.2–0.3 s in the Image Worker, at a fraction of the memory of
    decoding it (§12).
  - The engine is **12.5 KB gzip**, lazy-loaded, with **no runtime dependency**.
- **Canvas exports are NOT automatically clean.**
  - Chromium and WebKit add ICC profiles (harmless).
  - Playwright's Firefox added a **per-session, per-origin, content-dependent 16-character ID**
    in a private `deBG` PNG chunk (§14).
  - Safe Share should therefore always run Privacy Clean + verify on its export.

**Raw data** in `docs/spikes/results/`:

- `metadata-fuzz.json`: the 200k-case fuzz run;
- `metadata-browser-{chromium,firefox,webkit}.json`: decode matrix, canvas, mismatches, large
  images, batch;
- `metadata-batch-gc.json`: the forced-GC batch check.

### How to reproduce

```bash
npx tsx scripts/spikes/metadata-fixtures/generate.ts   # 48 fixtures + manifest (Node + Chromium for WebP bases)
npm test                                               # unit tests (incl. 95 metadata tests + 26k-case fuzz)
METADATA_FUZZ=200000 METADATA_FUZZ_REPORT=1 npx vitest run src/tests/unit/metadata/metadata-fuzz.test.ts
SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
npx tsx scripts/spikes/metadata/run-browser.ts --browsers chromium,firefox,webkit
npx tsx scripts/spikes/metadata/batch-gc.ts
npx tsx scripts/spikes/metadata/summarise-browser.ts    # tables
npx tsx scripts/spikes/metadata/fixture-table.ts        # §6 table
E2E_BASE_URL=http://localhost:3100 npx playwright test src/tests/e2e/metadata-spike.spec.ts
```

`/spikes/metadata` is a developer prototype:

- **Access:** `noindex`; 404 in production unless `SHOTEXA_ENABLE_SPIKES=1`.
- **Input:** drop, paste or upload.
- **Display:** "Detected / Privacy-sensitive / Preserved", with values shown locally only.
- **Actions:** Privacy Clean, then a verification checklist and a download.
- **Options:** Image Worker vs main thread.
- **Automation:** `window.spikeE`.

## 1. Environment

| | |
|---|---|
| Machine | Windows 10 Pro laptop, Intel i7-5500U (2 cores/4 threads, 2015), 8 GB RAM; shared with other apps (background CPU ~60%) — absolute times are pessimistic |
| Browsers | Playwright **Chromium 153.0.8010.12**, **Firefox 155.0**, **WebKit 26.6**. WebKit is the Windows *WinCairo* port, **not Safari**. |
| Node | 22.12 (unit tests, fuzzing, Node decoders) |
| Runtime dependencies added | **none** |
| Dev-only | **exifr 7.1.3** (independent oracle in tests) |
| Chosen approach | Small custom format-aware container rewriters + bounded EXIF/XMP/IPTC classification (`src/core/metadata/`, 1,643 lines incl. types and docs) |

## 2. Library evaluation (§18)

| Library | License / last release | Browser | Reads EXIF/XMP/GPS | Rewrites JPEG | Rewrites PNG | Rewrites WebP | Notes |
|---|---|---|---|---|---|---|---|
| exifr 7.1.3 | MIT / 2022 | ✅ | ✅ (JPEG, PNG, TIFF, HEIC; not WebP) | ❌ | ❌ | ❌ | Read-only; modular builds. Chosen as a **test oracle**. |
| ExifReader 4.45 | MPL-2.0 / 2026 | ✅ | ✅ | ❌ | ❌ | ❌ | Read-only |
| exif-reader 2.0 | MIT / 2025 | ✅ | TIFF block only | ❌ | ❌ | ❌ | Needs its own container walker |
| piexifjs 1.0.6 | MIT / 2022 | ✅ | EXIF only | EXIF insert/remove only | ❌ | ❌ | No XMP/IPTC/COM/ICC awareness, no PNG/WebP |
| exif-be-gone 1.5 | ISC / 2024 | Node streams | — | strip | strip | ❌ | No inspection report, no policy (e.g. ICC, orientation), Node-oriented |
| node-webpmux 3.2 | LGPL-3.0 / 2025 | Node | — | — | — | ✅ | Node-only, LGPL |
| @uswriting/exiftool | Apache-2.0 / 2025 | WASM | ✅ everything | ✅ | ✅ | ✅ | ExifTool compiled to WASM (Perl runtime): multi-MB download for a ~10 KB job |
| exiftool-vendored | MIT / 2026 | Node + Perl | ✅ | ✅ | ✅ | ✅ | Server/desktop only |

**Decision: a hybrid.** Keep custom, small, format-aware container rewriters in production code,
and use mature parsers as independent test oracles.

- **Why not a library:**
  - no browser library both *inspects* and *rewrites* all three formats under a privacy policy
    (keep ICC/colour/orientation, drop thumbnails/trailers/unknown chunks);
  - the ones that rewrite are either JPEG-EXIF-only, Node-only or multi-MB.
- **Why custom is safe here:**
  - the rewrite is structurally simple: copy whole segments/chunks, never re-encode;
  - the parser surface is small;
  - it is fuzzed (§15) and cross-checked by exifr on every JPEG/PNG fixture;
  - the result is 12.5 KB gzip, fully tree-shaken, and testable in Node.

## 3. Architecture

```text
UI (spike page) ──► MetadataEngine  (src/core/metadata/metadata-engine.ts, lazy chunk)
                     │ inspect(file) / clean(file, policy) → Image Worker "metadata.inspect" / "metadata.clean"
                     │ verify(blob, {original})             → pure, main thread (cheap)
                     ▼
         run.ts: read bytes once → validate (extension + MIME + magic, §45) → engine-core
         engine-core.ts: analyse → inspect | clean (build) | verify (re-analyse output + compare)
             jpeg.ts · png.ts · webp.ts   container walk + classification + byte-preserving rebuild
             exif.ts · xmp.ts             bounded EXIF/TIFF walker, XMP/IPTC scanners (data only)
             bytes.ts · errors.ts · policy.ts · types.ts
```

- **No new worker.** The existing **Image Worker** gains two ops (`metadata.inspect`,
  `metadata.clean`). The worker never decodes pixels for these ops.
- **`clean` refuses to return an output that fails verification**
  (`METADATA_VERIFICATION_FAILED` / `METADATA_OUTPUT_INVALID`).
- **When nothing needs removing, the original Blob is returned untouched** (`changed: false`,
  `output: null`).

## 4. Format handling

### JPEG

- **Walk:** SOI → segments (length-checked) → SOS + entropy data (native `indexOf(0xFF)`;
  skips stuffed `FF00` and RST markers) → EOI → trailing bytes.
- **Fails closed** on: no SOI/SOF/SOS/EOI, a segment past the end, length < 2, invalid markers,
  or runaway fill bytes.
- **Removed:**
  - APP1 EXIF (incl. GPS, IFD1 thumbnail), APP1 XMP + extended XMP;
  - APP13 Photoshop/IPTC (incl. Photoshop thumbnails), COM;
  - APP0 JFXX thumbnails, APP2 MPF + secondary images;
  - APP11 JUMBF/C2PA, unrecognised APPn;
  - anything after EOI.
- **Rewritten:**
  - JFIF with a header thumbnail → a 16-byte JFIF without the thumbnail;
  - EXIF with orientation 2–8 → a minimal Orientation-only EXIF.
- **Preserved byte-for-byte:** APP0 JFIF, APP2 ICC_PROFILE, APP14 Adobe (decoders need its
  colour transform), all tables/frames/scans.

### PNG

- **Walk:** signature → chunks with length ≤ 2³¹−1, letter-only types and **CRC checked on
  every chunk**. IHDR must come first; IDAT and IEND are required.
- **Unknown critical chunks** → `METADATA_UNSUPPORTED_FORMAT`; anything after IEND is removed.
- **Removed:**
  - tEXt / zTXt / iTXt (classified by keyword: Author, Software, Creation Time, Source,
    Comment, XMP, "Raw profile type exif" …; zTXt is never inflated);
  - eXIf, tIME, dSIG;
  - unrecognised ancillary chunks, e.g. Apple **iDOT**. iDOT holds file offsets that become
    wrong once other chunks move, so it must not be kept.
- **Preserved:**
  - colour: iCCP, sRGB, gAMA, cHRM, cICP, mDCv, cLLi, sBIT;
  - transparency: tRNS;
  - rendering: bKGD, pHYs, hIST, sPLT, oFFs, pCAL, sCAL, sTER;
  - animation: acTL, fcTL, fdAT;
  - image data: IHDR, PLTE, IDAT, IEND.
- **CRCs:** kept chunks keep their original CRC; only a rewritten eXIf gets a new one.
- **Not "remove every ancillary chunk":** colour, transparency, physical-size and animation
  chunks are asserted to survive (`png/icc`, `gamma`, `srgb`, `phys`, `alpha`, `apng`,
  `kitchen-sink`).

### WebP

- **Walk:** RIFF/WEBP header, even RIFF size ≤ file length, chunk sizes within the RIFF (with
  pad byte); an image chunk (VP8/VP8L/ANMF) is required.
- **Removed:** EXIF (with or without the "Exif\0\0" prefix some writers add), "XMP ",
  unrecognised chunks, bytes after the RIFF.
- **Rebuild:** the VP8X flags are recomputed (EXIF/XMP cleared, ICC set only if ICCP is kept)
  and the RIFF size is rewritten.
- **Preserved byte-for-byte:** VP8, VP8L, ALPH, ICCP, ANIM, ANMF.
- **Animated WebP is supported at container level** (frames untouched; tested with 2 ANMF
  frames). Lossy and lossless are both tested.

## 5. Privacy Clean policy

| Metadata type | Remove | Preserve | Conditional | Reason |
|---|:-:|:-:|:-:|---|
| EXIF (JPEG APP1, PNG eXIf, WebP EXIF): GPS lat/long/alt, device make/model, body/lens serials, owner, host computer, dates/offsets, software, artist/copyright, descriptions, user comments, Windows XP tags, unique ID, maker notes | ✅ | | | Location, identity, device, time |
| EXIF Orientation (2–8) | | | ✅ | Kept as a minimal Orientation-only EXIF; removal visibly rotates/flips images (§8). Orientation 1 is dropped (default). |
| EXIF IFD1 thumbnail, JFIF/JFXX thumbnails, Photoshop thumbnails, XMP thumbnails | ✅ | | | Can show an uncropped/unredacted original |
| XMP (standard + extended) | ✅ | | | Creator, tool, history, GPS, city, document IDs |
| IPTC / Photoshop IRB | ✅ | | | By-line, city, country, caption, contact |
| JPEG COM; PNG tEXt/zTXt/iTXt | ✅ | | | Free text (author, software, comments, dates) |
| PNG tIME | ✅ | | | Modification timestamp |
| MPF secondary images, bytes after EOI / IEND / RIFF | ✅ | | | Hidden images and appended data (motion photos, gain maps, other files) |
| C2PA/JUMBF (APP11), PNG dSIG | ✅ | | | Provenance can identify people/devices; signatures are invalid after any edit |
| Unrecognised APPn / ancillary / WebP chunks (e.g. iDOT, Firefox `deBG`) | ✅ | | | Not needed to render; may hold private data or identifiers |
| ICC profiles (APP2, iCCP, ICCP) | | ✅ | | Colour-correct rendering (§9). Not treated as private. |
| PNG sRGB, gAMA, cHRM, cICP, mDCv, cLLi, sBIT | | ✅ | | Colour/transfer interpretation |
| PNG tRNS, PLTE, bKGD, pHYs, hIST, sPLT, oFFs/pCAL/sCAL/sTER | | ✅ | | Transparency, palette, physical size; registered, not private |
| JFIF APP0 (no thumbnail), Adobe APP14 | | ✅ | | Needed by decoders (density, colour transform) |
| Image data and animation | | ✅ | | The image itself, copied byte-for-byte |

All switches live in `DEFAULT_METADATA_POLICY` (`src/core/metadata/policy.ts`):
`orientation: "keep-minimal" | "remove"`, `keepColorProfile`, `removeTrailingData`,
`removeUnknown`.

## 6. Fixture results

48 deterministic fixtures (`src/tests/fixtures/metadata/`, 2.1 MB): 23 JPEG, 14 PNG, 11 WebP.

- **Pixels:** procedural and asymmetric, with saturated corners. PNG is encoded by pngjs, JPEG by
  jpeg-js, and WebP image chunks by Chromium's encoder (lossy q0.85 and lossless), re-wrapped in
  containers built by the generator.
- **Metadata values:** all synthetic (`SHOTEXA-FAKE-…`); GPS is set in the open ocean near 0°N 0°E.
- **Malformed and adversarial inputs** are generated in the tests (§15).

"Pixels equal" covers:

- **Node:** jpeg-js / pngjs decode of input vs output (n/a for WebP);
- **Browsers:** SHA-256 of decoded RGBA via `<img>` (what users see), `createImageBitmap`
  default, and `createImageBitmap` with `imageOrientation: "none"` + `colorSpaceConversion:
  "none"`.

| Fixture | In → out bytes | Privacy metadata found | Preserved | Pixels equal (Node · Chromium · Firefox · WebKit) | Dims | Orientation | Verified |
|---|---:|---|---|---|---|---|---|
| jpeg/clean | 48037 → 48037 (unchanged) | none | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/exif-gps | 48999 → 48037 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/exif-gps-be | 48999 → 48037 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/exif-thumbnail | 50747 → 48037 | exif, description, device, software, timestamp, author, camera, comment, identifier, location, thumbnail | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/xmp | 49071 → 48037 | xmp, location, author, software, timestamp, device, description, identifier | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/xmp-extended | 49205 → 48037 | xmp, location, author, software, timestamp, device, description, identifier | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/icc | 49525 → 48563 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | APP0 JFIF, APP2 ICC | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/comments | 48136 → 48037 | comment | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/iptc | 48207 → 48037 | iptc, author, location, description, timestamp | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/jfif-thumbnail | 49945 → 48037 | thumbnail | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/mpf-appended | 49763 → 48037 | hidden-image | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/trailing | 48080 → 48037 | other | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/kitchen-sink | 52615 → 48579 | exif, description, device, software, timestamp, author, camera, comment, identifier, location, thumbnail, xmp, iptc, private-app, provenance | APP0 JFIF, APP2 ICC, APP14 Adobe | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/orientation-1 | 12719 → 12653 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/orientation-2 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 2 → 2 | ✅ |
| jpeg/orientation-3 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 3 → 3 | ✅ |
| jpeg/orientation-5 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 5 → 5 | ✅ |
| jpeg/orientation-6 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 6 → 6 | ✅ |
| jpeg/orientation-7 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 7 → 7 | ✅ |
| jpeg/orientation-8 | 12719 → 12689 | exif, device, orientation | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | 8 → 8 | ✅ |
| jpeg/orientation-minimal-6 | 12689 → 12689 (unchanged) | none | APP0 JFIF, APP1 Exif | ✅ · ✅ · ✅ · ✅ | ✅ | 6 → 6 | ✅ |
| jpeg/duplicate-exif | 49961 → 48037 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| jpeg/malformed-exif | 48072 → 48037 | exif | APP0 JFIF | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/clean | 74445 → 74445 (unchanged) | none | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/text | 75796 → 74445 | author, software, timestamp, device, description, xmp, location, identifier, comment | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/exif | 75409 → 74445 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/exif-orientation-6 | 19729 → 19699 | exif, device, orientation | — | ✅ · ✅ · ✅ · ✅ | ✅ | 6 → 6 | ✅ |
| png/time | 74464 → 74445 | timestamp | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/icc | 74798 → 74747 | author | iCCP | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/gamma | 74551 → 74505 | software | gAMA, cHRM | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/srgb | 74525 → 74474 | author | sRGB, gAMA | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/phys | 74517 → 74466 | author | pHYs | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/alpha | 76111 → 76041 | author, timestamp | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/apng | 149023 → 148977 | software | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/idot | 74531 → 74445 | private-app, software | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/unknown-trailing | 74515 → 74445 | private-app, other | — | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| png/kitchen-sink | 78540 → 76364 | author, comment, xmp, location, software, timestamp, device, description, identifier, exif, camera, provenance | iCCP, pHYs | ✅ · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/clean-lossy | 14208 → 14208 (unchanged) | none | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/clean-lossless | 5826 → 5826 (unchanged) | none | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/exif-lossy | 15186 → 14226 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/exif-lossless | 7814 → 5844 | exif, description, device, software, timestamp, author, camera, comment, identifier, location, xmp | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/xmp | 15236 → 14226 | xmp, location, author, software, timestamp, device, description, identifier | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/icc | 15702 → 14742 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | ICCP | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/alpha | 15318 → 13348 | exif, description, device, software, timestamp, author, camera, comment, identifier, location, xmp | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/animated | 6354 → 4384 | exif, description, device, software, timestamp, author, camera, comment, identifier, location, xmp | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/exif-orientation-6 | 4230 → 4200 | exif, device, orientation | — | n/a · ✅ · ✅ · ✅ | ✅ | 6 → 6 | ✅ |
| webp/exif-prefixed | 15192 → 14226 | exif, description, device, software, timestamp, author, camera, comment, identifier, location | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |
| webp/unknown-trailing | 14292 → 14226 | private-app, other | — | n/a · ✅ · ✅ · ✅ | ✅ | — | ✅ |

- **Byte-level confirmation:**
  - removing metadata that was *inserted* into the clean base files gives back **exactly the
    clean base bytes** (11 JPEG and 5 PNG fixtures, asserted in tests);
  - browser output is **byte-identical to Node output** for all 48 fixtures in all three engines
    (deterministic, no Canvas involved).
- **`jfif-thumbnail`:** its JFIF header is rewritten (thumbnail dropped), which is why it lists
  nothing under "Preserved".

## 7. JPEG findings

- **Recompression-free:** yes. Scans and tables are copied; jpeg-js and three browsers decode
  identical pixels.
- **EXIF thumbnails:**
  - IFD1 thumbnails (a distinct 96×64 "uncropped" image in `exif-thumbnail` and `kitchen-sink`)
    are removed with the EXIF block;
  - tests assert only **one** SOI marker remains, and exifr finds no IFD1 afterwards;
  - JFIF header thumbnails, JFXX thumbnails, Photoshop thumbnails and MPF-appended images are
    removed as well.
- **Duplicate/extended/malformed metadata:**
  - two EXIF blocks: both handled;
  - extended XMP: removed;
  - an EXIF block with offsets past its end: reported as malformed EXIF and removed. The
    container stays valid, so the file is not rejected.

## 8. Orientation (§13)

**Measured, not assumed:**

- Original vs cleaned (minimal EXIF) vs "stripped" (all EXIF removed);
- decoded via `<img>`, which is what users see;
- EXIF Orientation 1/2/3/5/6/7/8, on a 240×160 asymmetric image.

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| JPEG orientation 2–8: stripping changes the display | **yes, all 6** (5–8 swap to 240×160) | **yes, all 6** | **yes, all 6** |
| PNG eXIf orientation 6: stripping changes the display | **yes** (160×240 → 240×160) | **yes** | no (engine ignores PNG eXIf orientation) |
| WebP EXIF orientation 6 | ignored (240×160 either way) | ignored | ignored |
| Cleaned (minimal Orientation-only EXIF) = original, pixel-identical | ✅ all | ✅ all | ✅ all |

**Production rule:** keep orientation as a minimal EXIF containing only IFD0 Orientation. It
has no other tags, no thumbnail and no dates, and is not private.

- **Why not normalise the pixels instead:** rotating would force a decode + re-encode, which is
  lossy for JPEG and exactly what this feature must avoid. It would also cost the memory in §12.
- **WebP:** the same minimal EXIF is written. It is harmless where ignored and correct where
  honoured (browsers disagree; real Safari was not testable).
- **Opt-in `orientation: "remove"`:** for users who want *zero* EXIF. The UI must then warn
  that the image may display rotated.

## 9. Pixel and colour fidelity (§11, §12)

- **Pixels:** identical in every fixture × engine × decode path, and in Node.
- **Dimensions:** unchanged everywhere.
- **Alpha:**
  - PNG RGBA, WebP ALPH and APNG are preserved;
  - the minimum decoded alpha is identical before/after (0 on transparent fixtures).
- **Colour:** a synthetic **Display-P3 ICC profile** (v2 matrix/TRC, Bradford-adapted) was
  embedded in JPEG, PNG and WebP, and PNG gAMA 1.0 + P3 cHRM was also tested.

  Does removing the colour metadata change the displayed pixels?

  | | Chromium | Firefox (Playwright) | WebKit |
  |---|---|---|---|
  | JPEG ICC | **yes** | no | **yes** |
  | PNG iCCP | **yes** | no | **yes** |
  | PNG gAMA + cHRM | **yes** | no | **yes** |
  | WebP ICCP | **yes** | no | no |
  | PNG sRGB + gAMA (sRGB-equivalent) | no | no | no |

  With the colour metadata **kept**, the displayed pixels were identical to the original in
  every engine.

**Conclusion:** colour profiles and colour chunks change rendering and must be preserved. They
are not privacy metadata. The Firefox build tested did not colour-manage these images, so no
difference showed there.

## 10. Verification (§10)

`verifyBytes(output, { original })` re-parses the output with the inspection logic and reports
`MetadataVerification`:

- `unexpectedRemainingPrivacyMetadata`, which must be empty;
- `removedCategories`;
- `preservedRequiredMetadata` / `missingRequiredMetadata`: every element the policy preserves,
  byte-identical;
- `dimensionsMatch`;
- `payloadIdentical`: image data bytes identical;
- `outputValid`: the output parses as a strict container.

Pixel-level checks (decode + hash) are a separate, optional browser step (`compare` in the spike
page). They are not needed in production because the payload is byte-identical.

**Negative tests confirm verification catches:**

- remaining metadata;
- a flipped scan byte;
- truncated output;
- a dimension change;
- a dropped ICC profile.

## 11. Input validation (§25)

Extension + declared MIME + magic bytes, reusing `src/core/image/validate.ts`. Identical
results in all three browsers and Node:

| Case | Result |
|---|---|
| `.jpg` containing PNG | `METADATA_INVALID_FILE` |
| `.png` containing JPEG | `METADATA_INVALID_FILE` |
| `image/jpeg` MIME with WebP bytes | `METADATA_INVALID_FILE` |
| SVG | `METADATA_UNSUPPORTED_FORMAT` |
| empty file | `METADATA_INVALID_FILE` |
| clipboard image (no name) | signature only → accepted when valid |

## 12. Performance and memory

**Normal files** (fixtures 4–80 KB). Times are the Image Worker round trip including read +
clean + **verify**; medians per format:

| | JPEG | PNG | WebP | Longest main-thread stall |
|---|---:|---:|---:|---:|
| Chromium | 3.9 ms | 3.3 ms | 2.7 ms | 15 ms |
| Firefox | 2.0 ms | 5.0 ms | 2.0 ms | 111 ms (one JPEG case) |
| WebKit | 15 ms | 18 ms | 20 ms | 178 ms (one WebP case) |

- **Node:** inspect 0.8–3.9 ms, clean 1.1–3.9 ms, verify 2.1–6.8 ms.
- **Inspection alone is cheaper:** no rebuild, no verify.

**Large files** (Spike B images + injected EXIF). Columns:

- worker read/clean/verify (ms);
- longest main-thread stall (worker | main thread);
- peak memory: container clean vs **decode + Canvas re-encode** (the approach Privacy Clean
  avoids).

| Engine | File (encoded) | Worker ms | Stall worker / main | Peak MiB: clean / re-encode | Re-encode time |
|---|---|---|---|---|---:|
| Chromium | 1080×20000 JPEG (3.6 MB) | 10 / 76 / 127 | 67 / 83 ms | **2 / 171** | 1.0 s |
| Chromium | 1080×20000 PNG (5.9 MB) | 14 / 55 / 86 | 13 / 127 ms | **38 / 96** | 0.9 s |
| Chromium | 1080×16383 WebP (0.5 MB) | 4 / 9 / 8 | 17 / 20 ms | **11 / 422** | 4.9 s |
| Firefox | 1080×20000 JPEG | 20 / 17 / 32 | 16 / 63 ms | **61 / 123** | 0.9 s |
| Firefox | 1080×20000 PNG | 29 / 96 / 207 | 13 / 295 ms | **49 / 134** | 1.0 s |
| Firefox | 1080×16383 WebP | 2 / 7 / 6 | 14 / 15 ms | **19 / 171** | 5.9 s |
| WebKit | 1080×20000 JPEG | 21 / 21 / 31 | 25 / 243 ms | **63 / 218** | 1.6 s (1.6 s stall) |
| WebKit | 1080×20000 PNG | 28 / 56 / 93 | 32 / 285 ms | **101 / 171** | 4.8 s (4.8 s stall) |
| WebKit | 1080×16383 WebP | 58 / 22 / 31 | 54 / 134 ms | **18 / 158** | 15.9 s (15.9 s stall) |

- **Container cleaning scales with the *encoded* size, not the decoded size.** A 1080×20,000
  image is 82 MiB decoded, but only 0.5–6 MB encoded.
  - Cleaning needs the file bytes plus an output copy and a verify pass: roughly 2–100 MiB
    transient.
  - Decode + re-encode needs 96–422 MiB, takes 0.9–16 s, changes the file (recompression,
    different size) and **freezes WebKit's page for up to 16 s**.
- **PNG verification dominates large-PNG time,** because the CRC is checked on every chunk of
  both files. It is still ≤ 0.3 s.
- **Worker vs main thread:**
  - on the main thread, large PNGs stall the page 127–295 ms;
  - in the Image Worker, stalls stay at 13–67 ms (Chromium/Firefox) and 25–165 ms in WebKit
    (which has no OffscreenCanvas, but these ops don't need it).
  - The first job in a fresh page also pays the worker start (≈ 0.1–1.3 s once).

**Batch memory** (§29):

- **25 files sequentially:** memory stays flat, and after `dispose()` it is at or below the
  baseline:
  - Chromium: −7.5 MiB;
  - Firefox: −18.9 MiB (plateau ~22 MiB during the run);
  - WebKit: −11 MiB (2–15 MiB during the run).
- **20 × 1080×20000 in a row:** memory climbs ~25–30 MiB per file, then drops back (a GC
  sawtooth: peaks of 210 / 320 / 207 MiB in Chromium / Firefox / WebKit).
- **Chromium with `--expose-gc` + forced GC after each file:** the same sawtooth, returning to
  **7–33 MiB** above baseline repeatedly (`metadata-batch-gc.json`).
- **No monotonic growth, no leak observed.** The transient garbage is ~5× the file size (input
  read, output, verify) and is collected on the engine's schedule.
- **For production batch/ZIP:** process sequentially (as tested), revoke object URLs (done), and
  recycle the Image Worker after ~200 MB of processed input if device memory is small.

**Code size (production build):**

- `metadata-engine` lazy chunk: **38 KB raw / 12.5 KB gzip / 11 KB brotli**;
- the Image Worker chunk (including the existing stitch/OCR ops): 41 KB / 13.7 KB gzip;
- neither is referenced by the homepage (E2E-verified).

## 13. Browser results (§27)

- **All engines, all 48 fixtures:** verified ✅, output bytes = Node output ✅, pixels equal ✅,
  dimensions ✅, orientation ✅, alpha ✅.
- **Privacy:** no non-GET or body-carrying requests during any run.
- **Differences are in *rendering*, not in the cleaner:**
  - PNG eXIf orientation is ignored by WebKit (WinCairo);
  - WebP EXIF orientation is ignored by all three;
  - colour management of tagged images varies (§9).
- **Canvas exports** differ too (§14).
- **WebKit here is WinCairo, not Safari:** real Safari/iOS behaviour for orientation and colour
  still needs checking on devices.

## 14. Canvas-generated images and Safe Share (§24)

A fresh canvas (text + transparent area) was encoded in each engine and inspected:

| Engine | PNG | JPEG q0.9 | WebP q0.9 / q1 |
|---|---|---|---|
| Chromium | nothing | JFIF + **ICC** | **ICCP** |
| Firefox (Playwright 155) | **`deBG` private chunk** holding a 16-character hex ID | JFIF | nothing |
| WebKit | sBIT + **iCCP** | JFIF + **ICC** | **ICCP** |

- **Canvas output never contains the *source* image's EXIF/GPS/XMP.** Canvas works from pixels
  only.
- **Browsers do add their own metadata:**
  - ICC profiles (not private; preserved);
  - in Firefox, a `deBG` chunk whose 16-character value is:
    - **stable within a browser context for the same origin and content**;
    - different across contexts, launches and origins (`localhost` vs `127.0.0.1`);
    - different for different content;
    - absent on `about:blank`.

  It behaves like a per-session identifier (likely related to canvas-fingerprinting
  randomisation). **Not verified in stock Firefox.** Privacy Clean removes it as unrecognised
  application data.

**Safe Share integration:**

```text
Original → render fresh export canvas → apply transforms → apply redactions to pixels → flatten
        → encode (browser adds its own chunks here)
        → Privacy Clean (container-level, cheap)            ← AFTER encoding
        → verify (mandatory: runs inside clean())
        → download
```

- **Always run clean + verify on Safe Share / Redact exports.** It costs 2–20 ms for a typical
  screenshot, and it is the only way to guarantee the downloaded bytes contain no identifying
  chunks, whatever the browser's encoder adds.
- **The Redaction launch test (§56)** should call `verifyBytes` on the exported file, after the
  pixel checks.

## 15. Malformed input and fuzzing (§16, §17, §32)

**Parser safety:**

- every read goes through bounds-checked helpers;
- lengths are validated before use, and output buffers are sized from kept ranges, never from
  declared lengths;
- limits: input ≤ 512 MiB, JPEG segments ≤ 10k, PNG chunks ≤ 200k, WebP chunks ≤ 100k,
  EXIF ≤ 16 IFDs / 1,000 entries / depth 4 with cycle detection, XMP scanned ≤ 2 MiB;
- zTXt/iCCP are never inflated (no zip bombs);
- XMP is regex-scanned text: no XML parser, no entities, no DTDs, nothing executed;
- decoded text is truncated and control characters are neutralised.

**Targeted tests (all pass):**

- invalid segment length, segment past end, truncated JPEG / PNG / WebP;
- stray bytes, missing SOF/SOS/IDAT;
- bad CRC, chunk length 2³¹ and 2³¹−1 (huge declared length), invalid chunk type;
- odd or oversized RIFF sizes, bad first chunk;
- unknown critical PNG chunk;
- EXIF: IFD cycle, count 2³⁰, 65,535 entries, self-pointing Exif IFD;
- duplicate metadata;
- 10 × 64 KB XMP and a 5 MB iTXt;
- zero-length chunks;
- XMP with entity-expansion/`<script>` payloads (treated as inert text).

**Fuzzing** (seeded xorshift, `metadata-fuzz.test.ts`):

- **Mutators:** bit flips, header byte overwrites, structural length-field corruption (0, 1, 2,
  0xFFFF, 2³¹−1, 2³¹, 2³²−1, random, file-relative), truncation, random insertion, element
  duplication, **PNG data mutation with the CRC repaired** (so mutations reach classification),
  random bytes behind a valid magic number, pure random files, 0–63-byte prefixes.
- **Properties checked on every case:**
  - only `MetadataError` escapes;
  - ≤ 500 ms per case;
  - output ≤ input + 64 bytes;
  - every clean output re-parses;
  - no privacy metadata remains.

| Run | Cases | Uncontrolled exceptions | Hangs (> 500 ms) | Invalid outputs | Privacy left in output | Output grew | Slowest case |
|---|---:|---:|---:|---:|---:|---:|---:|
| Default (`npm test`) | 26,192 | 0 | 0 | 0 | 0 | 0 | 16.5 ms |
| Extended | **202,192** | **0** | **0** | **0** | **0** | **0** | 218 ms |

- **Extended run outcomes:**
  - 110,951 rejected as `METADATA_MALFORMED_CONTAINER`, 2,212 as `…UNSUPPORTED_FORMAT`, 10 as
    `…INVALID_FILE`;
  - 80,555 cleaned (outputs valid and clean);
  - 8,464 needed no change.
- **What fuzzing proves:** robustness of *these* parsers against *these* mutation strategies
  within the stated limits. It is not a formal security proof, and the parsers were not fuzzed
  with coverage guidance.
- **Container-valid is not decoder-valid:** a mutated file whose *scan data* is corrupt but
  whose container is valid is cleaned, and its payload copied as-is. Privacy Clean does not
  validate or repair entropy-coded data. The browser decode is unchanged by cleaning, whatever it
  is.

## 16. Tests

- **Unit** (`src/tests/unit/metadata/`), 95 tests:
  - format detection and input mismatches;
  - the fixture matrix (inspect → clean → verify), with the byte-grep, GPS-pattern and exifr
    oracles, idempotence and the orientation, alpha and animation invariants;
  - Node pixel equality (jpeg-js, pngjs) and byte-exact round trips to clean bases;
  - JPEG segments, thumbnails, orientation keep/remove, ICC/Adobe, JFIF thumbnail;
  - PNG preserved/removed chunks, CRCs, unknown critical;
  - WebP flags, RIFF size, ICCP/ALPH/ANMF, minimal EXIF;
  - 19 malformed-container cases, the size limit;
  - hostile EXIF/XMP, large/duplicate/zero-length elements;
  - verification negatives, helpers, error mapping, batch.

  Plus the 26k-case fuzz test. **The full unit suite is 209/209 green.**
- **E2E** (`src/tests/e2e/metadata-spike.spec.ts`), **15/15** (5 flows × Chromium, Firefox,
  WebKit, production build):
  1. The homepage loads no metadata engine or worker.
  2. JPEG with GPS/EXIF/XMP/IPTC → findings shown → Privacy Clean → download re-verified in Node
     (engine + byte-grep + exifr) + no uploads.
  3. No-metadata file → "No privacy-sensitive metadata found.", nothing rewritten.
  4. Oriented JPEG stays oriented, PNG ICC kept, animated WebP intact.
  5. Extension/MIME mismatch → controlled error.
- **Test fixes found while running E2E:**
  - one test uploaded the same file twice, which Firefox handles differently: fixed;
  - dev-server flakiness in Firefox: E2E can now target a production server via `E2E_BASE_URL`.

## 17. Answers to the Spike E questions

1. **JPEG without recompression?** Yes. Segment-level removal; scans are copied byte-for-byte,
   and pixels are identical in Node and 3 browsers.
2. **PNG privacy metadata without stripping colour/rendering chunks?** Yes. Text/eXIf/tIME and
   unknown chunks go; iCCP/sRGB/gAMA/cHRM/tRNS/pHYs/animation chunks stay, byte-identical.
3. **WebP EXIF/XMP safely?** Yes, lossy, lossless, alpha and animated, with VP8X flags and RIFF
   size rewritten.
4. **Remove by default:** EXIF (all private tags), GPS, XMP, IPTC, comments/text chunks,
   timestamps, thumbnails, MPF/appended data, provenance blocks, unknown application data (§5).
5. **Preserve:** ICC and colour chunks, transparency, JFIF/Adobe, palette/physical size,
   animation, all image data, and orientation (minimal EXIF).
6. **Orientation:** keep a minimal Orientation-only EXIF. Removal visibly rotates/flips JPEGs in
   every engine and PNGs in Chromium/Firefox. Normalising pixels would force lossy re-encoding.
7. **Embedded thumbnails removed?** Yes (EXIF IFD1, JFIF, JFXX, Photoshop, XMP, MPF), verified by
   exifr and a single-SOI check.
8. **Pixels preserved?** Yes, identical in every fixture, engine and decode path.
9. **Dimensions?** Yes.
10. **Alpha?** Yes.
11. **ICC/colour behaviour?** Yes, preserved, and measurably necessary (§9).
12. **Automatic verification?** Yes. `clean()` verifies every output before returning it; a
    failing output is never delivered.
13. **Library, custom or hybrid?** Hybrid: custom container rewriters in production, a mature
    parser (exifr) as a test oracle.
14. **Size:** 12.5 KB gzip lazy chunk, 0 runtime dependencies.
15. **Inspection speed:** ~1–4 ms for normal files (Node); ~40–105 ms for 1080×20000
    (CRC/scan-bound).
16. **Cleaning speed:** 2–20 ms including verify for normal files (browser medians); ≤ 0.3 s for
    1080×20000 in the worker.
17. **Memory:** proportional to encoded size, 2–100 MiB transient for 20k images vs 96–422 MiB
    for decode + re-encode. Batch is flat, with GC sawtooth only.
18. **Avoids large-image decode costs?** Yes. It never decodes pixels.
19. **Malformed files handled safely?** Yes. Controlled codes, fail closed, bounded work.
20. **Fuzzing:** 202,192 cases with 0 uncontrolled exceptions, 0 hangs, 0 invalid outputs and 0
    leaks.
21. **Cross-browser?** Yes. Identical bytes and identical decoded pixels in Chromium, Firefox and
    WebKit.
22. **Does Canvas export already remove metadata?** It never carries the *source* metadata, but
    browsers add their own: ICC (Chromium/WebKit), and a per-session ID chunk in Playwright's
    Firefox. Don't assume exports are clean.
23. **Safe Share always runs the verifier?** Yes, after encoding (2–20 ms).
24. **No privacy metadata?** Say "No privacy-sensitive metadata found." and offer the original
    file unchanged (`changed: false`; the same Blob is returned). No rewrite, and no claim that
    cleaning happened.
25. **Architecture changes:** §19.
26. **Ready for production?** **Ready with limited refinements** (§18, §19).

## 18. Limitations (explicit)

- **Scope:** JPEG, PNG and WebP only (no HEIC/TIFF/RAW/SVG/PDF).
- **Not removed by design:**
  - ICC profile *text tags* (profile description/copyright) stay with the profile. They are not
    user data in normal files, but a custom profile could in theory carry text.
  - Pixel content itself: text or faces visible in the image are a redaction concern, not a
    metadata one.
- **Some things are not inspected in depth:**
  - maker notes are removed but not interpreted;
  - zTXt is classified by keyword only (never inflated);
  - XMP beyond 2 MiB is removed but not scanned.
- **HDR gain maps** (Ultra HDR / Apple, carried via MPF + appended images) are removed with the
  secondary images. The SDR base image is untouched, but HDR rendering falls back to SDR.
  Deliberate (hidden-image risk), but a visible trade-off for HDR photos.
- **Corrupt scan data:** Privacy Clean does not validate or repair entropy-coded data. A file
  that is container-valid but decoder-corrupt is cleaned as-is.
- **Test environment:**
  - fixtures are synthetic;
  - real camera files (maker-note variety, Samsung/Apple trailers, Ultra HDR) were not included;
  - no iOS/Android/Safari/low-memory devices were tested;
  - the Firefox `deBG` finding is from Playwright's build only.
- **Fuzzing is mutation-based, not coverage-guided.** No formal security claims beyond what is
  measured here.

## 19. Architecture changes recommended (backed by the results)

1. **`MetadataEngine` in `src/core/metadata/` as specified:** `inspect` / `clean` / `verify`,
   container-level, **verification inside `clean()`**, controlled `METADATA_*` codes, and
   local-only values.
2. **No new worker.** Run inspect/clean in the existing **Image Worker** (large-PNG main-thread
   stalls of 127–295 ms vs 13–67 ms in the worker). `verify` of an in-memory export can stay on
   the main thread (single-digit ms for screenshots).
3. **Safe Share/Redact export order (§35):** move "scrub privacy metadata" to **after** "encode
   output": encode → Privacy Clean → verify → download. Browsers add chunks at encode time
   (§14).
4. **Orientation policy:** minimal Orientation-only EXIF by default, with `orientation:
   "remove"` as an explicit, warned opt-in. The Image Worker's other ops (crop/rotate/export)
   should bake orientation into pixels when they *do* decode, then write no EXIF.
5. **Batch/ZIP:** sequential processing (validated), object URL revocation, optional Image
   Worker recycling after ~200 MB processed on low-memory devices.
6. **Analytics:** only `metadata_found`, `metadata_clean_completed` and
   `metadata_clean_failed` (controlled code), plus coarse booleans if the privacy policy allows.
   Never values, filenames, timestamps or IDs. Nothing was implemented here.
7. **Honest copy:** "Shotexa removes GPS location, camera/device details, EXIF, XMP and other
   privacy-sensitive metadata from JPEG, PNG and WebP files locally in your browser, and checks
   the result." Do **not** claim that no hidden information can exist in any image.
8. **Playwright:** `E2E_BASE_URL` lets E2E run against a production server (added to
   `playwright.config.ts`, default unchanged).

## Phase 0 Technical Validation Summary

| Area | Status | Must stay on the production backlog |
|---|---|---|
| **Smart Stitch** (Spike A) | **Validated with limitations** | Replace the 13 MB OpenCV build (pure-TS NCC or a custom build); tiny-overlap pass; smarter seam placement; confidence calibration on real device screenshots; N > 2 images and reversed order; width normalisation; tiled output for large stitches; Firefox/WebKit accuracy runs |
| **Large-image processing** (Spike B) | **Validated with limitations** (desktop engines) | Real iOS/iPadOS/Android (incl. low-memory) testing to tune `limits.ts`; tile-by-tile main-thread fallback for no-OffscreenCanvas browsers; WorkerBroker lifetime/recycling policy; mandatory export-size verification |
| **OCR** (Spike C) | **Validated with limitations** | Weak on complex desktop layouts; Hindi only as English+Hindi; PP-OCR comparison before launch; strip-wise upscaling; OCR worker lifetime policy; real-device testing |
| **Smart PDF** (Spike D) | **Validated with limitations** | "Check" state for medium-confidence breaks; up10 + ≤ 5% shrink default; skip analysis in fixed mode; hard cancel; thumbnail previews; image embedding strategy (JPEG vs raw deflate); Safari/iOS and PDF-viewer (Acrobat, Preview, pdf.js) testing; real-screenshot benchmark |
| **Metadata / Privacy Clean** (Spike E) | **Validated with limitations** | Real camera-file corpus (maker notes, vendor trailers, Ultra HDR); Safari/iOS orientation and colour checks; confirm the Firefox `deBG` behaviour in stock Firefox; Safe Share export order change (§19.3); UI copy for the orientation opt-out |

Nothing is **unresolved** in the sense of blocking the architecture. Every open item is a
tuning, device-testing or UX task that fits the existing design (engines behind interfaces,
work in workers, verified outputs).
