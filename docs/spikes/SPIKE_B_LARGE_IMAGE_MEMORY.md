# Spike B — Large image / browser memory: results

Status: **complete for desktop engines, awaiting review.** Real iOS/Android testing is still
required (see §11).

Raw data: [`results/memory-chromium.json`](results/memory-chromium.json),
[`results/memory-firefox.json`](results/memory-firefox.json),
[`results/memory-webkit.json`](results/memory-webkit.json) (worker path, as designed),
[`results/memory-webkit-main.json`](results/memory-webkit-main.json) (every case forced onto
the main-thread fallback).

## How to reproduce

```bash
npm run fixtures:large                     # tall fixtures → .cache/spike-b (gitignored, ~50 MB)
SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
npm run bench:memory -- --base http://localhost:3100 --browsers chromium,firefox,webkit
npm run bench:memory -- --base http://localhost:3100 --browsers webkit --force-ctx main --tag main
npm run bench:memory:summary               # markdown tables from the JSON results
```

- **Harness:** `/spikes/memory` is dev-only. It returns 404 in production unless
  `SHOTEXA_ENABLE_SPIKES=1` and is `noindex`.
- **Experiments:** `src/spikes/memory/experiments.ts`. The same code runs in a worker or on the
  main thread.
- **Runner:** `scripts/spikes/memory/run.ts`. It gives each case a fresh browser context, lets
  memory settle before taking the baseline, runs a warm-up first so worker start-up cost stays in
  the baseline, detects crashes and timeouts, and verifies every export by reading the encoded
  header.
- **Memory measurement:** OS-level, taken from outside the browser. `sample-processes.ps1` samples
  **private bytes (commit charge) of every browser process**: browser, renderer/content, GPU,
  utility. That captures canvas backing stores, decoded bitmaps and WASM, none of which JS APIs can see.

## 1. Test matrix

| Area | Cases |
|---|---|
| Canvas limits | 1080 and 1440 wide × 8,192 … 100,000 tall. DOM canvas and OffscreenCanvas on the main thread, OffscreenCanvas in a worker. Each probe = allocate + draw at the far corner + read back. |
| Decode | 1080×5k/10k/20k/30k and 1440×20k PNG; 1080×20k/30k JPEG; 1080×16,383 WebP. Full decode vs `resizeWidth` thumbnail vs crop decode (`sx/sy/sw/sh`). Worker and main thread. |
| Resource lifecycle | 12× decode of a 1080×10000 image: `close()` vs leaked, plus forced GC and worker recycling. 20 × 10 MiB Blob URLs, revoked vs kept. |
| Single-canvas export | 5 sizes × PNG/JPEG/WebP in a worker; 2 cases on the main thread. |
| Tiled streamed PNG | 5 sizes in a worker; 1 on the main thread. 2,048-row tiles → `CompressionStream` PNG encoder. |
| Split output | 1080×30000 → 8 JPEGs; 1440×20000 → 5 WebPs. 4,096-row sections (also the PDF-page payload). |
| Multi-image composition | 8/16/25 × 1080×2400 (19,200 / 38,400 / 60,000 tall), 12 × 1440×3200 (38,400), 2 × 1080×30000 (60,000). Decode-all vs sequential single canvas vs tiled. |
| Export API | `toDataURL` vs `toBlob`, 1080×20000, main thread. |
| OpenCV | Load only; Smart Stitch analysis on 2 × 1080×10000 (true offset 7000) and 2 × 1080×2400. |

Fixtures are synthetic chat-style screenshots with anti-aliased "text" and noisy photo blocks, so
encoded sizes are realistic: 1080×20000 is 6.0 MB as PNG and 3.7 MB as JPEG.

## 2. Browser / environment

- **Machine:** Windows 10 Pro, Intel i7-5500U (2 cores / 4 threads, 2015), **8 GB RAM**. A modest
  laptop, and the only device tested.
- **Browsers:** Playwright **Chromium 153** (full build, new headless), **Firefox 155**, and
  **WebKit 26.6**. The WebKit build is the *WinCairo* port, which is **not Safari**: it has no
  OffscreenCanvas and uses different canvas limits and memory behaviour.
- **Server:** production build (`next start`), not the dev server.
- **Caveats:**
  - Headless rendering means no GPU canvas acceleration.
  - One run per case. Repeat-run noise was about ±25 MiB; for example, decoding 1080×10000 measured
    +40 and +64 MiB in two runs.
  - Sampling resolution is about 250 ms, so very short spikes can be missed.

## 3. Memory estimates vs measurements

Theory: decoded RGBA = width × height × 4 bytes.

| Image | Decoded | Chromium peak | Firefox peak | WebKit (main) peak |
|---|---:|---:|---:|---:|
| 1080×5000 PNG | 20.6 MiB | +33 | +21 | +85 |
| 1080×10000 PNG | 41.2 MiB | +40 | +18 | +97 |
| 1080×20000 PNG | 82.4 MiB | +126 | +47 | +152 |
| 1080×30000 PNG | 123.6 MiB | +146 | +47 | +197 |
| 1440×20000 PNG | 109.9 MiB | +166 | +82 | +229 |
| 1080×30000 JPEG | 123.6 MiB | +135 | +43 | +178 |
| **1080×30000 → 240-px thumbnail** (`resizeWidth`) | 6.1 MiB result | **+155** | +24 | +197 |
| **1080×30000 → 2,048-row crop decode** | 8.4 MiB result | **+142** | +65 | +196 |

Findings:

- **Chromium and WebKit:** a decode costs about 1.0–1.5× the theoretical RGBA size, plus the
  encoded Blob. Decode times were 0.1–0.3 s in Chromium and Firefox and up to 1.5 s in WebKit.
- **Firefox** shows much smaller commit growth. It decodes lazily and discards decoded surfaces.
  That's good news for Firefox, but Shotexa can't rely on it.
- **Thumbnails and crop decodes do not avoid a full decode** in Chromium or WebKit. Peak memory
  equals a full decode, and only the *retained* memory is small. So **every thumbnail of a tall
  screenshot costs a full decode transiently**: generate them sequentially, in a worker, and
  budget them as full decodes.
- **Single-canvas export peak** ≈ **canvas bytes × 1.25–2.1 + resident source**. For example,
  1080×30000 PNG peaked at +257 MiB in Chromium, +179 MiB in Firefox and +196 MiB in WebKit.
  `singleCanvasPeakFactor = 1.5` in `src/config/limits.ts`.
- **OpenCV worker:**
  - loading alone costs **+189 MiB in Chromium, +230 MiB in Firefox, +330 MiB in WebKit**;
  - that includes a **128 MiB WASM linear memory** (Emscripten's initial heap) plus 13 MB of parsed
    script;
  - analysing 2 × 1080×10000 peaked at +331 MiB (Chromium) / +351 MiB (Firefox), found the exact
    offset of 7000, and took 2.2–2.4 s.

  **The OpenCV runtime is bigger than any single image operation measured.**

### Where memory lives and when it is released

- **Chromium:** canvas and bitmap memory sits in the renderer process in this headless setup (GPU
  process flat). The key lifecycle finding comes from the **bitmap-lifecycle test** (12 decodes of
  the same 1080×10000 image):

  | Variant | Peak | Retained after |
  |---|---:|---:|
  | `close()`, but a 1×1 probe canvas that *drew* each bitmap was never reset | +506 MiB | +501 MiB |
  | same + forced GC | +62 MiB | ≈0 |
  | `close()` **and the probe canvas reset** (`width = 0`) | **+88 MiB** | +15 MiB |
  | same + worker terminated afterwards | +68 MiB | **≈0** |
  | never closed | +506 MiB | +475 MiB |

  **In Chromium, a canvas that has drawn an ImageBitmap keeps its decoded pixels alive after
  `bitmap.close()`** until that canvas is reset, flushed or garbage-collected. This is consistent
  with deferred canvas recordings holding a reference to the draw source; the only code difference
  between rows 1 and 3 is the canvas reset. `close()` is necessary but not sufficient.
- **Firefox:** closed peaked at +20–54 MiB; the leaked variant stayed small too because of lazy
  decoding.
- **Object URLs:** revoking matters. Retained after the test: Chromium 59 (revoked) vs 231 MiB
  (kept); WebKit 17 vs 197 MiB. Firefox was inconclusive: the Blob sources were JS arrays awaiting GC.
- **`toDataURL` vs `toBlob`** (1080×20000 PNG, main thread): similar peak memory at this size, but
  `toDataURL` **blocked the main thread for 481 ms (Chromium) and 656 ms (Firefox)**, versus
  96 / 323 ms for `toBlob`. It also creates a 33%-larger string on the JS heap. The existing rule
  "Blob output, never `toDataURL()`" is confirmed.
- **Freed memory is not returned promptly.** Chromium kept most of a closed decode committed for
  seconds afterwards. Process-level memory therefore tracks the *sum* of recent work unless workers
  are recycled.

## 4. Maximum safe canvas / image sizes observed

| | Chromium 153 | Firefox 155 | WebKit (WinCairo) |
|---|---|---|---|
| Canvas height 65,535 (1080 and 1440 wide) | ✅ DOM, Offscreen, worker | ✅ DOM, Offscreen, worker | ✅ DOM only |
| Canvas height 65,536 | ❌ **silent**: blank canvas, read-back is 0,0,0,0, no exception | ❌ throws | ✅ even 1440×100000 (lazy allocation; not representative of Safari) |
| OffscreenCanvas | ✅ | ✅ | ❌ **not available** (main or worker) |
| ImageBitmap 1080×30000 / 1440×20000 | ✅ | ✅ | ✅ |
| Largest export produced | 1080×60,000 PNG (single canvas and tiled) | 1080×60,000 PNG (both) | 1080×60,000 PNG (both, main thread) |
| JPEG ≤ 65,535 px | ✅ | ✅ | ✅ |
| **WebP > 16,383 px** | ❌ **silently cropped to 16,383** while returning `image/webp` | ❌ throws `NS_ERROR_FAILURE` | ❌ `toBlob` returns `null` |

- **No renderer crashed or timed out** in any engine, including 1080×60000 outputs peaking near
  370 MiB on this 8 GB machine. On desktop, the failures that matter are the **silent** ones:
  Chromium's cropped WebP and its blank canvas past 65,535 px. Every export must be checked against
  the requested size (`readImageSize()` in `src/core/image/image-size.ts`).
- **Mobile is unknown.** iOS Safari historically caps canvas area at 16,777,216 px (4096²), which
  would limit 1080-wide images to ~15,500 px, and enforces a total canvas-memory budget. It was not
  testable here, so Shotexa uses **16,777,216 px as the cross-browser single-canvas ceiling** until
  real-device testing says otherwise.

## 5. Worker vs main-thread behaviour

Longest main-thread stall measured during each operation (a heartbeat every 10 ms; a stall means
the tab is frozen for that long):

| Operation | Chromium (worker) | Firefox (worker) | Chromium (main) | Firefox (main) | WebKit (main, the only option) |
|---|---:|---:|---:|---:|---:|
| Decode 1080×30000 | 13 ms | 264 ms | — | — | — |
| Export 1080×20000 PNG | 11 ms | 185 ms | 110 ms | 296 ms | 4,922 ms |
| Export 1080×30000 JPEG | 12 ms | 267 ms | 162 ms | 446 ms | 3,123 ms |
| Tiled streamed PNG 1080×30000 | 12 ms | 255 ms | **2,500 ms** | 2,384 ms | 5,525 ms |
| 25 × phone → 1080×60000, tiled | 12 ms | 39 ms | — | — | 358 ms |

- **Chromium:** workers keep the UI fully responsive (≤ 14 ms) for every operation.
- **Firefox:** still stalls the main thread for 80–270 ms during large worker decodes and exports, growing with
  size. That's likely GC or canvas-readback work in the shared content process. Noticeable, but no freeze.
- **Main thread:** canvas encoding blocks for 0.1–0.5 s. The **JS PNG encoder blocks for seconds**,
  so it must run in a worker.
- **WebKit without OffscreenCanvas:** everything runs on the main thread, with 1–14 s freezes for
  tall outputs; the worst was 14 s for a 1080×30000 tiled PNG done without yielding. **The
  main-thread fallback must process tile by tile with yields between tiles** (not measured yet), and
  must restrict sizes further.

## 6. Export results by format

1080×30000 single canvas in a worker (WebKit on the main thread):

| Format | Chromium | Firefox | WebKit | Output size |
|---|---|---|---|---|
| PNG | ✅ 2.1 s, +257 MiB | ✅ 1.3 s, +179 MiB | ✅ 3.7 s, +196 MiB | 4.6 MB |
| JPEG q 0.9 | ✅ 1.2 s, +256 MiB | ✅ 1.2 s, +186 MiB | ✅ 1.9 s, +322 MiB | 3.9 MB (Chromium/WebKit), **5.9 MB (Firefox)** |
| WebP q 0.9 | ❌ **silent crop to 16,383** | ❌ throws | ❌ `null` | — |

Tiled streamed PNG (one tall PNG via tiles + `CompressionStream`), 1080×30000:

- 3.3 s in Chromium, 2.7 s in Firefox, 15.8 s in WebKit (main thread).
- Peak +237 MiB in Chromium, +171 MiB in Firefox, +109 MiB in WebKit. For a single tall source,
  the source decode dominates, so tiling saves little.
- Output is 1.5–12% larger than the browser's own PNG encoder (fixed None/Sub/Up filters).
- Correct PNG in every engine. Verified by header, and byte-exact round-trips in unit tests
  (including 70,000 rows).

Split output: 1080×30000 → 8 JPEG sections took 1.1 s at +161 MiB in Chromium and 1.1 s at
+73 MiB in Firefox. 1440×20000 → 5 WebP sections took 5.2–5.4 s. WebP encoding is slow everywhere:
2.5–3.4× JPEG time in Chromium.

**Multi-image composition** is where the strategy matters most:

| Output | Single canvas, sequential decode | Tiled + sequential | Chromium time (single → tiled) |
|---|---|---|---|
| 8 × 1080×2400 → 1080×19,200 | +135 MiB (decode-all first: +168) | **+103** | 0.8 → 2.2 s |
| 16 × 1080×2400 → 1080×38,400 | +223 | **+139** | 1.6 → 4.3 s |
| 12 × 1440×3200 → 1440×38,400 | +293 | **+183** | 2.6 → 6.3 s |
| 25 × 1080×2400 → 1080×60,000 | +310 (Firefox +313) | **+117** (Firefox +169, WebKit +63) | 2.6 → 6.5 s |
| 2 × 1080×30000 → 1080×60,000 | — | +367 (two 124 MiB sources overlap one tile) | 6.1 s |

**Tiled + sequential keeps peak memory roughly flat as the output grows** (about +100–180 MiB, set
by the tile plus the sources crossing it). A single canvas grows linearly with output height. The
cost is 2–3× the encode time, from JS filtering in the worker.

## 7. Failure cases

1. **Silent WebP truncation (Chromium).** Anything taller than 16,383 px is cut to 16,383 rows with
   no error. This was discovered while generating fixtures and reproduced in export tests.
   **Critical:** a stitched screenshot would lose its bottom silently.
2. **Silent canvas failure past 65,535 px (Chromium).** The canvas is created and `getContext`
   works, but it is blank: read-back 0,0,0,0, no exception.
3. **Retained decoded memory (Chromium).** Covered in §3: closed bitmaps stay alive via canvases that drew them.
4. **Thumbnail and crop decodes still cost a full decode** (Chromium, WebKit).
5. **No OffscreenCanvas on the tested WebKit port.** Every worker canvas path fails with
   `ReferenceError`. Real Safari has supported OffscreenCanvas 2D since 16.4, but capability
   detection plus a main-thread fallback is mandatory.
6. **Main-thread freezes:** 1–14 s in WebKit for tall outputs; 2.5 s for the JS PNG encoder in Chromium.
7. **Firefox stalls the main thread 80–270 ms during worker exports** of tall images.
8. **OpenCV's fixed cost** (+190–330 MiB) exceeds the architecture's 192 MiB soft budget on its own.
9. **Not observed:** tab crashes, out-of-memory errors or timeouts on this 8 GB desktop. Mobile
   crash thresholds are **unknown**.

## 8. Recommended soft memory budget

The initial ~192 MiB (§40) is **not contradicted for image work alone**, but it can't be one number:

- **Image working set per heavy job** (decoded sources + canvases + encode buffers):
  - **256 MiB** on desktop, or when `navigator.deviceMemory` > 4 (Chromium only);
  - **192 MiB** at ≤ 4 GB;
  - **128 MiB** at ≤ 2 GB;
  - **160 MiB provisional on iOS**, which exposes no device memory.

  Implemented as `softBudgetFor()` in `src/config/limits.ts`. Every number is provisional.
- **Engine runtimes are separate and must not coexist with a heavy image job:** the current
  OpenCV.js build costs 190–330 MiB before any image work. Either terminate the vision worker
  before composition (the "one heavy job at a time" policy, §40.5, enforced by *worker lifetime*),
  or replace the OpenCV build (Spike A recommendation 1 — this spike makes it more urgent).
- **What fits in 256 MiB with the recommended strategy (all engines tested):**
  - any stitch or combine output up to at least 1080×60,000 via tiles, as long as each source is
    ≤ ~1080×20,000;
  - single-canvas outputs up to the 16.7M px area ceiling.

  A *single tall source* such as a 1080×30000 image costs ~150–200 MiB just to decode, which is the
  real limit for 128–160 MiB devices.

## 9. Recommended fallback strategy

Implemented as a pure, tested chooser in `src/core/image/output-strategy.ts`. It decides before
allocating anything and returns controlled reason codes for UI copy and the `memory_fallback`
analytics event.

```text
source decoded bytes > budget           → reduce-or-split  (offer: reduce dimensions / split / PDF)
requested size > format limit           → split (WebP > 16,383, JPEG > 65,535) — never let an encoder crop
area ≤ 16.7M px AND estimated peak ≤ budget AND OffscreenCanvas
                                        → single canvas in a worker  (fastest)
PNG AND CompressionStream               → tiled + sequential composition → streamed PNG, in a worker
JPEG/WebP (no streaming encoder)        → split into 4,096-row sections (or suggest PNG / PDF)
no OffscreenCanvas in workers           → main-thread DOM canvas, tile by tile, yielding between tiles, tighter limits
```

Rules the data forces:

- **Tiles, not one giant canvas,** for large or multi-image outputs. One reusable 2,048-row tile
  canvas; sources decoded lazily and released after their last tile (`src/core/image/tiled-compose.ts`).
- **Sequential processing:** at most the sources crossing the current tile are decoded.
- **Split output** (4,096-row sections) is the universal fallback for JPEG/WebP and the natural
  **PDF page payload**. Each section becomes one page, so a PDF fallback needs no tall canvas at all
  (Spike D will build it with pdf-lib).
- **Verify every export:** compare the encoded header to the requested size and type, and fail
  loudly otherwise.
- **Canvas hygiene:** reset (`width = height = 0`) any canvas that drew a large bitmap, close
  bitmaps immediately, revoke object URLs, and recycle heavy workers after large jobs.

## 10. Does production Smart Stitch need tiled output?

**Yes, as the path for large outputs, not for every stitch.**

- A typical 2–3 phone-screenshot stitch (≤ 1080×7,500) fits a single canvas comfortably, and that
  path is 2–3× faster.
- Tiling becomes necessary for:
  - PNG outputs above the 16.7M px area ceiling (the iOS-safe limit), roughly 1080×15,500;
  - long multi-image stitches, where single-canvas memory grows linearly (+310 MiB at 1080×60,000
    vs +117 MiB tiled);
  - every WebP output above 16,383 px, via split.
- The stitch `StitchPlan` (segments of source rows → output rows) maps directly onto the tiled
  `ComposePlan`, so it needs no separate design. The Spike A `composeStitch()` (one full-size
  canvas) must be replaced by the strategy chooser + tiled composer before production.

## 11. Architecture changes required

None of these change the product or stack. They make existing rules (§24, §40, §41, §45) concrete:

1. **WorkerBroker must manage worker *lifetime*, not just jobs.** Recycle a heavy worker after
   large jobs or on idle, which is the only reliable way to return Chromium's retained memory. And
   never keep the OpenCV worker alive during composition (it holds ≥ 190 MiB).
2. **CapabilityManager must detect OffscreenCanvas in workers** (missing in the tested WebKit
   port). The main-thread fallback must be tile-by-tile with yielding and tighter size limits, or
   the tab freezes for seconds.
3. **Export verification is mandatory** for every encode (`readImageSize`), because failures are
   silent: WebP cropping, and blank canvases past 65,535 px.
4. **Thumbnail generation must be budgeted as a full decode** and done sequentially in a worker.
   `resizeWidth` does not reduce peak memory for tall images.
5. **Canvas-reset rule** added to the memory policy (§40): after drawing a large bitmap, reset the
   canvas, as well as closing the bitmap.
6. **Limits live in `src/config/limits.ts`:** device-aware soft budget, 16.7M px single-canvas
   area, 65,535 px height ceiling, format limits, tile and section heights. Real-device testing
   must tune them.
7. **OpenCV replacement becomes more urgent** (Spike A, recommendation 1). A smaller WASM heap or a
   pure-TS matcher would free 128+ MiB on every device.

**Still required before production (Spike B-2):**
- run the same harness on **real iPhone/iPad Safari, Android Chrome (including a low-memory
  device) and macOS Safari**, with remote debugging and mobile memory tools;
- record crash thresholds and tune `limits.ts`;
- measure the tile-by-tile main-thread fallback with yielding.

## New reusable modules

| Module | Purpose | Tests |
|---|---|---|
| `src/core/export/png-stream-encoder.ts` | Any-height PNG from row batches via `CompressionStream` | byte-exact round-trip, 70,000 rows |
| `src/core/image/tiled-compose.ts` | Tiled, sequential composition with early source release and cancellation | tile mapping, release order, cancellation |
| `src/core/image/image-size.ts` | PNG/JPEG/WebP dimensions from headers (export verification) | real fixtures |
| `src/core/image/output-strategy.ts` + `src/config/limits.ts` | Strategy chooser, device-aware budget | 8 cases |
| `src/core/stitch/opencv-loader.ts` | Shared lazy OpenCV loader (vision worker refactored to use it; Spike A tests still pass) | via Spike A e2e |
