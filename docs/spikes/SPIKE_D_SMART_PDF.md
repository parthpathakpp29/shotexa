# Spike D — Smart screenshot-to-PDF pagination: results

Status: **complete, awaiting review.** No product `/screenshot-to-pdf` page, no searchable PDF,
no backend. Everything runs in the browser; screenshots never leave the device.

## Verdict

**Production recommendation: needs limited refinement** (§19). The core question — *can Shotexa
reliably create better screenshot PDFs than basic fixed-cut converters, while remaining local,
responsive, memory-safe and manually correctable?* — is answered **yes**.

- **Better cuts.** Over 14 fixtures on A4 and Letter (124–130 page breaks):
  - Fixed cuts split content (a text line, table row, chat message, photo…) at **60.5%** of
    breaks and cut through glyphs **61** times.
  - Visual Smart Pagination splits content at **19.7%** of breaks with **0** glyph cuts.
  - Allowing ≤ 5% shrink brings it to **12.9%**, at the *same page count* as fixed.
  - On the eight normal document types (articles, code, tables, settings, receipts, dense tables,
    dense code, dense cards) visual pagination made **0** content-splitting cuts.
  - 23 of the 25 remaining bad cuts are **unavoidable inside the window**: a chat bubble, giant
    message or photo taller than the search window. Manual correction handles those, and it
    works.
- **OCR is not needed for pagination.** OCR-assisted results were *identical* to visual-only on
  every fixture. OCR run just for the PDF costs 7.6–52 s per screenshot (Node) or 3–46 s
  (browsers, Spike C). **Do not load OCR for PDF.**
- **Local and responsive.** Analysis and PDF generation run in the Document Worker. In Chromium
  and Firefox the longest main-thread stall was **≤ 88 ms** in the clean run (typically
  15–45 ms). pdf-lib is a lazy 182 KB-gzip chunk loaded only on export; the homepage loads none
  of it (E2E-verified).
- **Memory-safe.** Processing is page by page with band tiling: no canvas is ever taller than
  2,048 rows, and nothing scales with page count. A 1080×30000 screenshot exports at a median of
  +182 MiB (Chromium), +103 MiB (Firefox) and +232 MiB (WebKit).
- **Correctable.**
  - Break editing: drag, ↑/↓ and Shift+↑/↓, add, delete, reset, snap to safe gaps.
  - Moving a break re-plans only the automatic breaks after it.
  - Confidence colours and "review" flags point the user at risky cuts.
- **Valid output.** **All 51** PDFs produced by the runner in Chromium, Firefox and WebKit (plus
  every E2E download) passed structural validation against their plans. Page breaks were **identical across the three engines** for
  all 18 cases.

**Eight engine-level issues were found (§15); seven are fixed or mitigated.** The main ones:

1. Firefox blocks the main thread when `createImageBitmap` decodes inside a worker.
2. Engine-dependent canvas resampling produced different breaks per browser.
3. An accelerated canvas in Chromium uploads the whole source to the GPU process (2.3× peak).
4. Decoded memory lingers in a reused worker.
5. A "Fit" page could exceed the cross-browser canvas limit.

**Raw data** in `docs/spikes/results/`:

- `pdf-node.json`: 14 fixtures × 2 papers × 21 variants;
- `pdf-tuning.json`: a 243-combination weight grid;
- `pdf-overlap.json`;
- `pdf-browser-{chromium,firefox,webkit}[-rep2|-rep3].json`: the final build;
- evidence runs:
  - `pdf-browser-chromium-gpucanvas-rep{1,2,3}.json`: before the software-canvas fix;
  - `pdf-browser-chromium-imagedecoder.json`: WebCodecs decode in Chromium.

### How to reproduce

```bash
npx tsx scripts/spikes/pdf-fixtures/generate.ts        # fixtures + DOM ground truth (Playwright/Chromium)
PDF_OCR=1 npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t "ocr cache"   # OCR lines (~7 min)
PDF_BENCH=1 npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t pagination
PDF_TUNE=1 npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t tune
PDF_OVERLAP=1 npx vitest run src/tests/benchmark/pdf-benchmark.test.ts -t overlap
npx tsx scripts/spikes/pdf/summarise.ts                 # pagination tables (§4–§9)
npm test                                                # unit tests
SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
npx tsx scripts/spikes/pdf/run-browser.ts --browsers chromium,firefox,webkit   # (+ --only … --tag rep2)
npx tsx scripts/spikes/pdf/summarise-browser.ts
npx playwright test src/tests/e2e/pdf-spike.spec.ts     # flows in Chromium, Firefox, WebKit
```

`/spikes/pdf` is a developer prototype:

- **Access:** 404 in production unless `SHOTEXA_ENABLE_SPIKES=1`; `noindex`.
- **Input:** upload or paste several screenshots; reorder them.
- **Options:** A4/Letter/Fit, margin, overlap, Fixed/Visual/OCR-assisted mode (with an optional
  "OCR" button that runs the Spike C service), snapping, JPEG/PNG.
- **Preview:** break lines coloured by confidence, with the ideal cut dashed. A side panel shows
  the selected break's ideal y, selected y, shift and reasons.
- **Output:** export with progress and Cancel, then Download or Open.
- **Automation:** `window.spikeD` for the runner and E2E. `?preview=0` hides the full-size
  previews so that runs measure the engine alone.

## 1. Environment

| | |
|---|---|
| Device | Windows 10 Pro laptop, Intel i7-5500U (2 cores/4 threads, 2015), 8 GB RAM. Headless, no GPU. |
| Browsers | Playwright **Chromium 153.0.8010.12**, **Firefox 155.0**, **WebKit 26.6**. The WebKit build is the Windows *WinCairo* port, **not Safari**: no OffscreenCanvas and no `ImageDecoder`, so it exercises the main-thread fallback. |
| Node | 22.12 (pagination benchmark, tuning, overlap) |
| PDF library | **pdf-lib 1.17.1** (MIT). Built chunk: 448 KB raw / **182 KB gzip**, loaded only inside the Document Worker on the first export. |
| Server | Production build (`next start`) |

**Timing caveat:** this is a slow 2015 laptop that was shared with other applications during the
runs (Chrome, ChatGPT and Codex kept system CPU load around **60%**). Absolute times varied by up
to ~1.5× between runs, and a few stall outliers in the repeat runs coincide with that load.
Compare rows *within* a run, and treat absolute times as a pessimistic desktop bound. Memory is
OS-level private bytes for the whole browser process tree (renderer, GPU, workers), sampled every
50 ms. It is noisy, so the large cases were run three times and reported as medians (§10).

## 2. Architecture used

```text
React spike page ──► PdfEngine (src/core/pdf/pdf-engine.ts; the UI never touches pdf-lib)
                       │ analyse(images)   → Document Worker "pdf.analyse", one image at a time:
                       │                     decode (ImageDecoder on Firefox, else createImageBitmap)
                       │                     → full-width 1:1 bands (≤ 512 rows) → JS area-average proxy
                       │                     → row signals (content, edges, transition, clearance)
                       │                     → worker recycled if the job decoded > 8 MP
                       │ plan(set, setup, mode, {manual, frozen, ocrLines})   pure, < 1 ms, main thread
                       │ createPdf(plan)   → Document Worker "pdf.create":
                       │                     per image: decode once; per page, per ≤ 2,048-row band:
                       │                     crop on a software canvas → JPEG/PNG → reset canvas
                       │                     → pdf-lib embed + draw → save → Blob; worker recycled if > 8 MP
                       └ no OffscreenCanvas (WebKit WinCairo): worker "pdf.decode" returns a transferred
                         ImageBitmap; canvas work happens on the page in 48-row / 512-row bands with
                         time-sliced yields (≤ 24 ms of work per task); pdf-lib still runs in the worker.
```

- **Pure modules** (unit-tested in Node): `geometry`, `signals`, `paginate`, `breaks`, `coords`,
  `plan`, `errors`, `config`.
- **Browser modules:** `decode`, `analyse-image`, `render-pdf`, `pdf-engine`, and
  `src/workers/document.worker.ts`.
- **Worker protocol v1** gains:
  - three ops: `pdf.analyse`, `pdf.create`, `pdf.decode`;
  - an optional transfer-list hook in `serveWorker`.

## 3. Fixtures and ground truth

- **Rendering:** 14 synthetic screenshots rendered by Playwright/Chromium from HTML scenes
  (`scripts/spikes/pdf-fixtures/`) at DPR 3 (1080 px wide); code is 1280 px at DPR 2.
- **Ground truth (`truth.json`):**
  - every text line box, plus its **measured glyph ink band** (the rows that actually contain
    glyph pixels, because DOM line boxes include empty leading);
  - typed regions: heading, chat-message, table-row, code-line, list-item, field, receipt-row,
    image, paragraph, card.
- **OCR lines (`ocr.json`):** Node Tesseract with the Spike C default pipeline.

| Fixture | Size | Content |
|---|---|---|
| article | 1080×5673 | headings, paragraphs, lists, quotes |
| chat-light / chat-dark | 1080×5355 / 1080×5157 | small and multi-line bubbles, day separators |
| code | 1280×4772 | syntax-highlighted code, blank lines, comments |
| table | 1080×6084 | bordered zebra table with header |
| settings | 1080×6108 | cards, fields, section separators |
| receipt | 1080×5892 | item rows, prices, total |
| long-chat-10000 | 1080×11586 | very long chat |
| long-article-20000 | 1080×21342 | very long article |
| *dense-table* | 1080×6132 | tight rows, faint borders, no gaps |
| *dense-code* | 1280×4100 | continuous code, 16 px lines, no blank lines |
| *giant-message* | 1080×8961 | one chat message taller than a page |
| *photos* | 1080×8133 | article with tall photos |
| *dense-cards* | 1080×6255 | cards with 2 px gaps |

*Italic* = difficult set. The browser runs also used Spike B's large images: 1080×2400 and
1440×3200 phone screenshots, 1080×5000 and 1080×30000, and a pair of 1080×10000.

**Metrics** (`src/tests/helpers/pdf-metrics.ts`), per break:

- **Text-line cut:** the cut crosses a glyph ink band.
- **Hard-region cut:** the cut falls inside a heading, message, row, code line, list item, field,
  receipt row or image, more than 4 px from its edges.
  - It is **content-splitting** when that region's text lies on *both* sides of the cut.
  - Otherwise it is a **cosmetic edge cut**: only padding, a border or a rounded bubble bottom
    moves to the next page. Photos always count as split.
- **Bad break** = a text-line cut or a content-splitting cut.
- **Strict bad** also counts cosmetic edge cuts.
- **Avoidable:** some clean y existed in the allowed window (oracle).
- **Also reported:** shift from the ideal cut, very short pages, page count.

Why the split between content-splitting and cosmetic: in `table`, the smart cuts land in a row's
blank bottom padding, 3 px above its 1 px border (verified pixel by pixel). The row's text is
intact and only the border moves to the next page. **Both numbers are reported.**

## 4. Fixture matrix

A4 + Letter. Bad / breaks; strict counts in parentheses.

| Fixture | Fixed | Visual ±10% | OCR-assisted ±10% | Visual ±15% | Unavoidable at ±10% |
|---|---:|---:|---:|---:|---:|
| article | 3/6 (3) | **0/7** (0) | 0/7 | 0/7 | 0 |
| chat-light | 5/6 (5) | 4/6 (4) | 4/6 | 3/6 | 3 |
| chat-dark | 4/6 (6) | **0/6** (1) | 0/6 | 0/6 | 0 |
| code | 1/4 (3) | **0/4** (0) | 0/4 | 0/4 | 0 |
| table | 3/7 (6) | **0/7** (4 cosmetic) | 0/7 | 0/7 | 0 |
| settings | 3/7 (6) | **0/7** (0) | 0/7 | 0/7 | 0 |
| receipt | 2/7 (4) | **0/7** (0) | 0/7 | 0/7 | 0 |
| long-chat-10000 | 10/15 (14) | 7/15 (10) | 7/15 | 6/15 | 7 |
| long-article-20000 | 18/27 (19) | **0/28** (0) | 0/28 | 0/28 | 0 |
| *dense-table* | 2/7 (7) | **0/7** (0) | 0/7 | 0/7 | 0 |
| *dense-code* | 3/4 (3) | **0/4** (0) | 0/4 | 0/4 | 0 |
| *giant-message* | 10/11 (11) | 9/11 (9) | 9/11 | 9/11 | 9 |
| *photos* | 7/10 (7) | 5/10 (5) | 5/10 | 5/10 | 4 |
| *dense-cards* | 4/7 (7) | **0/8** (0) | 0/8 | 0/8 | 0 |

**Every remaining bad cut is in content taller than the window:**

- chat messages of 1,000–2,000 px in the chats;
- the giant message, where 9 of 11 breaks necessarily fall inside it;
- photos of 400–900 px.

The algorithm then takes the least-bad cut: between two lines of a bubble (never through glyphs),
or a low-confidence "review" cut through a photo.

## 5. Algorithm

1. **Proxy:** grayscale, ≤ 360 px wide, vertical scale ≥ 0.5 (row precision ≤ 2 px). It is built
   from 1:1 full-width bands plus a JS area average rather than canvas downscaling. It is
   **bit-for-bit identical to the Node benchmark** (unit test) and in every engine (browser runs).
2. **Row signals:**
   - *content*: fraction of pixels differing from the page background (the histogram mode);
   - *edges*: fraction of strong horizontal gradients, i.e. glyph strokes;
   - *transition*: mean row-to-row change (separators);
   - *clearance*: stroke-free run up/down. Measured against strokes, not background, so gaps
     *inside* bubbles and cards count.
3. **Ideal cut:** `pageTop + capacity`. Capacity is 1,573 px (A4) or 1,430 px (Letter) for a
   1080-px image with 28 pt margins.
4. **Candidates:** from `ideal − windowUp·capacity` to `ideal + windowDown·capacity`. Pages are
   never shorter than 60% of capacity.
5. **Cost** = `edge·2 + ink·0.5 − whitespace·1.5 − separator·1.5 + distance·0.6 + ocrText·6`.
   All weights and thresholds are in `src/core/pdf/config.ts` (`resolvePaginationConfig` merges
   overrides). The lowest cost wins; ties go to the candidate nearest the ideal.
6. **Confidence:**
   - **low** if the cut still crosses strokes (edge > 5%) or an OCR line;
   - **high** if it sits in stroke-free whitespace outside any coloured block;
   - **medium** otherwise (a gap inside a bubble or card).

   If a low-confidence cut improves on the ideal by less than `minImprovement`, the algorithm
   **keeps the ideal cut** ("no safe boundary nearby") and sets `needsReview`.
7. **Manual breaks are anchors.** Automatic breaks are re-planned after them. Deleting a break
   *freezes* that image's layout; the merged page is shrunk to fit and shown as
   "shrunk to N%".
8. **Page slices:** `[y0, y1)` plus optional overlap and `fitScale` (< 1 only for manual/shrink
   pages taller than capacity).

**Weight tuning** (`pdf-tuning.json`, 243 combinations):

- **Broad plateau:** 105 of 243 tie for the best result (0 glyph cuts; the fewest strict-bad
  cuts on normal fixtures). The worst combinations are about 35% worse.
- **Defaults:** a mid-plateau point, deliberately not an optimum fitted to 14 fixtures.

**Ablation** (visual ±10%, all fixtures):

| Variant | Bad | Strict |
|---|---:|---:|
| all signals | 19.7% | 26.0% |
| − edge density | 19.7% | 26.0% |
| − ink density | 19.7% | **22.8%** |
| − whitespace | **24.6%** | **37.3%** |
| − separator | 18.3% | **46.0%** |
| − distance | 19.5% | 26.6% (mean shift 44 → 60 px) |
| OCR only (no visual signals) | **52.8%** | 72.8% |

- **Whitespace clearance is the core signal.**
- **The separator** keeps cuts off 1 px borders and bubble edges.
- **Edge density** is redundant given clearance.
- **Ink density** slightly *hurts* the strict metric. It is a candidate for weight 0 once there
  are more fixtures; unchanged here to avoid over-fitting.

## 6. Visual vs OCR-assisted pagination

| Mode | Bad | Strict | Glyph cuts | Extra cost per screenshot |
|---|---:|---:|---:|---|
| Fixed | 60.5% | 81.5% | 61 | — |
| **Visual ±10%** | **19.7%** | **26.0%** | **0** | analysis 0.3–1.4 s in the worker (§11); plan < 1 ms |
| OCR-assisted ±10%, **OCR performed for the PDF** | 19.7% | 26.0% | 0 | + **7.6–52.4 s** (Node); browsers 3–46 s (Spike C §9.2) |
| OCR-assisted ±10%, **OCR already exists** | 19.7% | 26.0% | 0 | + < 1 ms (line intersection) |

- **OCR changed nothing on any fixture.** Visual pagination already has zero glyph cuts, and the
  cuts it cannot avoid (bubbles, photos) are not text-line problems.
- **OCR alone is much worse** (52.8%): OCR boxes don't see bubbles, borders, cards or photos.
- **Recommendation:** never auto-load OCR for pagination.
  - If a later flow such as searchable PDF has already produced OCR lines, passing them in is
    free and harmless.
  - The `ocr` mode path exists and is tested; it simply earned no measurable benefit.

## 7. Search-window experiment

All fixtures, A4 + Letter. "+downN" allows a page up to N% taller, shrunk to fit.

| Window | Bad | Strict | Mean shift | Max shift | Pages (fixed = 152) |
|---|---:|---:|---:|---:|---:|
| ±5% | 27.0% | 37.3% | 23 px | 5.0% | 154 |
| **±10%** | 19.7% | 26.0% | 44 px | 9.6% | 155 |
| ±12% | 18.9% | 24.4% | 46 px | 10.5% | 155 |
| ±15% | 18.1% | 22.0% | 54 px | 14.1% | 155 |
| ±20% | 13.8% | 17.7% | 73 px | 19.5% | 158 |
| **up10 + down5** | **12.9%** | 24.2% | 33 px | 9.7% | **152** |
| up15 + down5 | 12.0% | 22.4% | 41 px | 12.4% | 153 |

- **Normal fixtures:** fixed 57.6%, ±10% 12.6%, ±15% 10.3%, **up10+down5 8.2%**.
- **Difficult fixtures:** fixed 66.7%, ±10% 35.0%, up10+down5 23.1%.
- **No variant produced a "very short" page** (< 60% of capacity).

**Recommendation:** **10% up plus up to 5% shrink.**

- It gives the best content-splitting rate at exactly the fixed page count. A page is at most 5%
  smaller, which is visually negligible.
- Offer "never scale" (±10%, +2% pages) as an option.
- Past 12% the gains diminish while pages end emptier. What remains is content taller than any
  sensible window.
- The config default is still `windowDown = 0`, which all browser runs used. Switching it is a
  one-line change for the product page.

## 8. Manual adjustment

- **Model:** `PageBreak { id, y, source: automatic | manual, idealY, confidence, reasons,
  needsReview }`.
- **Pure operations** (`breaks.ts`):
  - sort, and clamp between neighbours (minimum page 48 px);
  - move (the break becomes manual);
  - add (rejects out-of-range, too-close and duplicate positions);
  - remove;
  - snap to a safe y (stroke-free gap centres and separator rows within ±24 px);
  - validate (`OUT_OF_RANGE`, `TOO_CLOSE`, `UNSORTED` → `PDF_INVALID_BREAKS`; the UI blocks
    export).
- **Re-planning:**
  - Move or add keeps every manual break as an anchor and re-plans only the automatic breaks
    after it.
  - Delete freezes the image's layout.
  - Reset (per image or all) returns to automatic.
- **Re-plan cost:** < 1 ms, so every keystroke re-plans live.
- **UI**, verified by hand in the browser pane and by E2E in three engines:
  - pointer drag (snaps on release);
  - focusable `role=slider` lines: ↑/↓ 4 px, Shift+↑/↓ 40 px, Delete, Enter/S to snap;
  - double-click to add a break;
  - the side panel shows ideal y, selected y, shift (px and % of page), source, confidence and
    reasons.
- **Bugs found and fixed:**
  - focus was lost after the first arrow press (the line's React key contained its y);
  - manual breaks lost their ideal y, so the shift couldn't be shown;
  - rejected uploads caused unhandled promise rejections.

## 9. Confidence levels

Visual ±10%, all fixtures:

| Confidence | Breaks | Bad | Bad rate |
|---|---:|---:|---:|
| high | 76 | 3 | **3.9%** |
| medium | 47 | 18 | 38.3% |
| low (kept the ideal cut, flagged "review") | 4 | 4 | 100% |

- **High is trustworthy.**
- **Low is always right to flag.** All four are photo cuts with no gap anywhere.
- **Medium is the weak spot.** A gap between two lines *inside* a bubble or card is clean for
  glyphs but still splits the message. The product UI should show medium breaks in amber
  ("check") with next/previous navigation, and must not describe them as safe.

## 10. Memory

**Strategy:** one decoded image at a time; everything else is streamed.

- **Analysis:** decode → ≤ 512-row bands on one small canvas → a ≤ 360 × h/2 grayscale proxy
  (~3.8 MB for 1080×21342) → signals. The bitmap is closed and the canvas reset.
- **Export:**
  - per image: decode once;
  - per page, per ≤ 2,048-row band: crop on a **software** canvas → encode → reset the canvas
    (Spike B: a canvas that drew a bitmap pins it) → embed;
  - only the encoded pages (≈ the PDF size) accumulate.
- **Worker recycling:** the Document Worker is recycled after any job that decoded more than
  8 MP.
- **Is the screenshot duplicated?**
  - The source `Blob` goes to the worker by reference.
  - It is decoded **twice in total** (analysis, export), never once per page.
  - Full-size RGBA is never copied into JS; only ≤ 512- and ≤ 2,048-row band copies exist.
  - The PDF holds each row once (overlap repeats only the overlapped rows).

**Measured.** Final build; median of 3 runs for the large cases; MiB above the page's idle
baseline:

| Case | Chromium analyse / export peak | Firefox analyse / export peak | WebKit (fallback) analyse / export peak |
|---|---:|---:|---:|
| 1 × 1080×5355 (chat) | 41 / 78 | 41 / 79 | 20 / 47 |
| 4 × 1080×2400 | 54 / 35 | 46 / 53 | 39 / 62 |
| 1080×11586 | 106 / 89 | 69 / 41 | 62 / 54 |
| 1080×21342 | 182 / 121 | 123 / 110 | 123 / 146 |
| 1080×21342, one Fit page (11 bands) | 185 / 125 | 124 / 93 | 122 / 172 |
| **1080×30000** | 223 / **182** (161–208) | 145 / **103** (98–146) | 234 / **232** (170–234) |
| 2 × 1080×10000 | 129 / 84 | 124 / 126 | 139 / 177 |

- **Bounded:** peaks scale with the *largest single image*, not with page count or image count.
  - Two 1080×10000 images peak about the same as one 1080×21342: 84 vs 121 MiB (Chromium),
    126 vs 110 (Firefox), 177 vs 146 (WebKit).
  - The 20-page 30k export stays within ~1.6× of the 14-page 20k export.
  - The floor is one full decode, the same floor Spike B found.
- **Retained** after the job plus clearing the workspace: ≤ 30 MiB in Chromium and ≤ 61 MiB in
  Firefox/WebKit, in every final-run case except `long-20000-with-preview`. No growth across
  repeated exports in the cancel → export-again test.
- **Full-size previews are not free.** `long-20000-with-preview` retains +73 MiB in Chromium and
  +111 MiB in WebKit: the page decodes a full-resolution `<img>`. The product UI must use
  downscaled thumbnails.

**Three memory findings changed the implementation** (evidence files in `results/`):

1. **Accelerated canvas.** With a default (accelerated) 2D context in Chromium, `drawImage`
   uploads the *whole* source bitmap to the GPU process. The 1080×30000 export peaked at
   **+414–420 MiB**; with `willReadFrequently: true` (software canvas) it peaks at
   **+161–208 MiB**, and export is faster (`gpucanvas-rep*`).
2. **Decode memory lingers.** Analysis followed by export in the same worker peaked at
   +471 MiB for 1080×30000 during development, against +243 MiB after recycling. That run
   predates the file-per-run layout; the number is from its console log.
3. **`ImageDecoder` in Chromium** decodes without stalls, but the 1080×30000 export peaked at
   **+2,683 MiB** (`imagedecoder`). This is why `ImageDecoder` is used on Firefox only.

## 11. Performance and responsiveness

Final clean run, JPEG q 0.9, A4, analysis in the worker except WebKit. Times in ms.

| Case | Chromium analyse / export | Firefox analyse / export | WebKit analyse / export |
|---|---:|---:|---:|
| 1080×2400 phone | 486 / 361 | 257 / 321 | 559 / 606 |
| 1080×5355 chat | 392 / 406 | 347 / 384 | 726 / 990 |
| 4 × 1080×2400 (reordered) | 575 / 546 | 534 / 610 | 1,760 / 3,732 |
| mixed 4 (1080/1280/1440 wide, 13 pages) | 1,025 / 1,064 | 1,011 / 1,029 | 3,065 / 5,812 |
| 1080×5000 | 460 / 430 | 324 / 496 | 2,191 / 3,329 |
| 1080×11586 | 605 / 631 | 534 / 712 | 3,406 / 2,474 |
| 1080×11586 **PNG** | 540 / **3,354** | 730 / **3,968** | 1,535 / **6,559** |
| 1080×21342 (14 pages) | 983 / 1,021 | 920 / 1,139 | 2,712 / 4,979 |
| 1080×30000 (20 pages) | 1,406 / 1,410 | 1,375 / 1,377 | 3,644 / 6,119 |
| 2 × 1080×10000 | 947 / 968 | 889 / 970 | 2,502 / 5,896 |
| re-plan after a manual edit | < 1 | < 1 | < 1 |

**Timing breakdown:**

- **Analysis** is about half decode and half signals (~30–45 ms per MP in the worker).
- **Fixed vs visual:** fixed mode pays the same analysis today. It could skip analysis entirely,
  since it only needs the image size.
- **Plan:** 0.02–1 ms.
- **OCR** (if performed): +3–46 s, see §6.

**Main-thread responsiveness.** Longest main-thread gap, measured with a 10 ms heartbeat during
the job:

| Engine | Analyse | Export | Notes |
|---|---:|---:|---|
| Chromium | 12–27 ms | 11–22 ms | clean run; repeat-run outliers up to 136 ms under background load |
| Firefox | 13–88 ms | 14–61 ms | after the `ImageDecoder` fix; before it, **~400 ms per 20k decode** (§15) |
| WebKit (main-thread fallback) | 81–485 ms | 47–315 ms | canvas work on the page; one repeat reached 865 ms |

**Progress and cancellation:**

- **Progress:** one event per image during analysis; one per page plus "saving" during export.
- **Cancel** (requested 250 ms after export start, 1080×21342), rejected with `PDF_CANCELLED`:

  | Engine | Rejected at | Memory after | Next export |
  |---|---:|---:|---|
  | Chromium | 401 ms | +6 MiB | ✅ 14 pages |
  | Firefox | 1,054 ms | −15 MiB | ✅ 14 pages |
  | WebKit | 2,764 ms | −19 MiB | ✅ 14 pages |

  - Latency is bounded by one uninterruptible step: the source decode, or one band's encode.
    Cancellation is checked before every band and page.
  - A harder cancel (terminate the worker immediately) is recommended for the product (§20).

## 12. PDF output validation

Every PDF the runner produced (51 across the three engines) and every PDF downloaded in E2E was
reloaded with pdf-lib in Node and checked against its plan (`scripts/spikes/pdf/validate-pdf.ts`):

- page count;
- page size (A4 595.28×841.89 pt, Letter 612×792 pt, Fit = slice height × scale + margins);
- no rotation;
- the expected number of image bands per page (≥ 1, so no blank pages);
- image width = source width, and band rows = slice rows plus seam overlaps (no clipping);
- the content-stream transforms of all bands: their union equals the planned placement to
  0.05 pt, inside the margins, top-aligned and centred;
- non-trivial image data;
- producer and title metadata.

**Result: 51/51 runner PDFs and all E2E downloads valid.**

| | Chromium | Firefox | WebKit |
|---|---:|---:|---:|
| 1080×21342 JPEG → 14 pages | 4,135 KB | **6,617 KB** | 4,196 KB |
| 1080×11586 JPEG / PNG → 8 pages | 1,769 / 889 KB | 2,852 / 889 KB | 1,800 / 897 KB |

**Output size findings:**

- **Firefox's canvas JPEG encoder** produces ~1.6× larger files at the same quality setting.
- **PNG** is *smaller* than JPEG for these flat UI screenshots, and lossless. It is 3–6× slower
  to export because pdf-lib re-parses PNGs in JS (see §20).

**Viewers actually tested:**

- **Chromium's built-in PDF viewer (PDFium),** in the browser pane:
  - the 13-page mixed A4 document (title "Shotexa screenshots", margins correct, page 2 starts
    cleanly at a list item);
  - the WebKit-generated 1-page 1080×21342 Fit PDF, made of 512-row bands: no visible seams at
    92% zoom.
- **Structural reload with pdf-lib.**

**No other viewer was tested:** not Acrobat, Preview, Firefox pdf.js, iOS or Android.

## 13. Page overlap

Repeat the last N rows of each page at the top of the next. All fixtures, A4 + Letter; strict
bad cuts. "Rescued" means every element cut at the break appears complete on the next page.

| Overlap | Fixed: pages / strict bad / rescued | Visual: pages / strict bad / rescued |
|---:|---|---|
| 0 | 152 / 101 / — | 155 / 33 / — |
| 24 px | 155 / 101 / 33 | 158 / 35 / 2 |
| 48 px | 155 / 105 / 50 | 160 / 33 / 2 |
| 96 px | 161 / 101 / 64 | 165 / 37 / 7 |

- **With fixed cuts, overlap helps** (96 px rescues 64 of 101). It still leaves more broken cuts
  (37) than visual pagination without overlap (33 strict).
- **With smart pagination it barely matters** (2–7 rescued for 2–6% more pages): the remaining
  bad cuts are taller than any sensible overlap.
- **Recommendation:** off by default, available as an option.
  - Implementation: it is geometry only (`overlapPx` in `PageSetup`).
  - Validation: exported and checked in all three engines (`long-10000-overlap48`).

## 14. Searchable-PDF readiness (coordinates)

- **Mapping:** `imageBoxToPdfPage(box, slices, imageIndex, geometry, margin)` maps an image-pixel
  box to `{pageIndex, x, y, w, h}` in PDF user space (points, bottom-left origin).
  - It picks the page containing the box's vertical centre (the first page when overlap repeats
    it).
  - The page-local offset is `y − slice.y0`.
  - `slicePlacement` gives scale = `geometry.scale × fitScale`, top-aligned and centred.
- **Unit-tested:** placement, shrunk pages, a box on page 2, boxes straddling a cut, out-of-range
  and wrong-image boxes, overlap.
- **Proven end to end:** the validator composes each page's content-stream `cm` matrices and
  checks the drawn bands against `slicePlacement` to 0.05 pt. A text layer placed with the same
  function will land on its pixels, including on tiled and shrunk pages.
- **Not built:** the text layer itself.

## 15. Browser differences (found and fixed)

| # | Problem | Engines | Evidence | Fix |
|---|---|---|---|---|
| 1 | **`createImageBitmap(blob)` inside a worker blocks the page's main thread** for the whole decode (~400 ms for 1080×21342). A busy worker, `ImageDecoder`, drawing, `getImageData` and `convertToBlob` did not. | Firefox 155 | isolated worker tests: bitmap 336–469 ms stall vs `ImageDecoder` 13 ms; app flow 305–541 ms → 18–31 ms | `decode.ts`: WebCodecs `ImageDecoder` for PNG/WebP/GIF on Gecko. JPEG stays on `createImageBitmap` for EXIF orientation. |
| 2 | **Canvas downscale filters differ** (`imageSmoothingQuality` is ignored by Firefox), so near-tie gaps resolved differently: Firefox cut `long-article-20000` into **15 pages vs 14**, and `chat-light`'s third break differed by 110 px. | all | break-parity check | JS area-average proxy from 1:1 bands: identical breaks in all 18 cases × 3 engines, bit-identical to Node |
| 3 | **Accelerated 2D canvas uploads the whole source bitmap** to the GPU process on `drawImage`. | Chromium | 1080×30000 export +414–420 → +161–208 MiB | `willReadFrequently: true` on export crops |
| 4 | **Decoded memory lingers** in a reused worker. | Chromium | +471 → +243 MiB | recycle the worker after jobs over 8 MP |
| 5 | **`ImageDecoder` memory** | Chromium | +2,683 MiB export peak (1080×30000) | gate `ImageDecoder` to Gecko |
| 6 | **No OffscreenCanvas or `ImageDecoder`** | WebKit WinCairo | — | worker decodes and transfers an `ImageBitmap`; page-thread bands with time-sliced yields; sequential images; pdf-lib in the worker. Stalls 47–485 ms remain (§18). |
| 7 | **"Fit" page taller than the canvas ceiling** (1080×21342 = 23 MP > 16.7 MP, `limits.ts`) | all (iOS is the real risk) | — | pages are drawn as ≤ 2,048-row bands with a 1-row seam overlap: one PDF page, several image XObjects |
| 8 | **JPEG size** | Firefox | 1.6× larger than Chromium at q 0.9 | not fixed; see §18 |

**A bug of my own, found while fixing #1:** a Python patch turned `\b` in the Gecko regex into a
literal backspace byte, so the gate silently never matched. An intermediate run then showed
Firefox stalls "coming back"; logging the decoder that was actually used exposed it. All sources
were then scanned for control characters (clean). The `decoder` field stays in analysis results
as diagnostics.

**WebKit ≠ Safari.** Safari 16.4+ has OffscreenCanvas in workers, so real Safari should take the
worker path, and Safari 17+ has `ImageDecoder`. Neither was tested here.

## 16. Error handling

`PdfError(code, detail)`: the detail stays local, and raw dependency messages are never shown or
sent.

| Code | When | Verified by |
|---|---|---|
| `PDF_DECODE_FAILED` | image cannot be decoded | **E2E ×3 engines** (corrupt upload → message; the page stays usable and the next export works), unit mapping |
| `PDF_ANALYSIS_FAILED` | signal computation failed | unit mapping |
| `PDF_EXPORT_FAILED` | encoder returned null, pdf-lib failure | unit mapping |
| `PDF_MEMORY_PRESSURE` | no 2D context, `RangeError` / allocation failure | unit mapping |
| `PDF_CANCELLED` | user cancel; checked before every band and page | **E2E ×3**, runner ×3, unit (between pages) |
| `PDF_UNSUPPORTED_SIZE` | width > 16,384 or height > 65,535 (Spike B limits), checked after decode | unit |
| `PDF_INVALID_BREAKS` | out-of-range, too-close or unsorted breaks at export | unit (validation); the UI blocks export |

## 17. Tests

**Unit tests** (`src/tests/unit/pdf/pdf-core.test.ts`): **40 tests; the full unit suite is 113/113
green.** They cover:

- geometry: A4, Letter, Fit, the page cap, margins, unsupported sizes;
- the proxy: the banded area proxy is bit-identical to the benchmark's, and yield counts are
  correct;
- scoring: text vs gap, distance normalisation, OCR intersection with padding, separators, config
  merging;
- `chooseBreak`: moves to a gap, never leaves the window, low-confidence fallback and review,
  medium inside blocks;
- `paginateImage`: fixed multiples, capacity and window limits, shrink allowance, manual anchors,
  manual beyond one page, short images and Fit, overlap;
- slices: coverage, sorting, `fitScale`, band tiling with seams;
- the break model: sort, move, clamp, add (duplicate / too close / out of range), remove, snap,
  validate;
- plan building: OCR→visual fallback, multi-image order, frozen layouts;
- coordinates: placement, shrink centring, OCR box on page 2, straddling and outside boxes,
  overlap;
- error mapping;
- PDF assembly in Node with pdf-lib: A4 validated, Fit with bands, mixed widths on Letter,
  cancellation between pages, progress.

**E2E** (`src/tests/e2e/pdf-spike.spec.ts`), **24/24 passing** (8 tests × Chromium, Firefox,
WebKit):

1. The homepage loads no PDF engine or document worker.
2. A normal screenshot → PDF (no uploads; only GETs).
3. Multiple screenshots → reorder → PDF.
4. A long screenshot → automatic smart breaks → PDF.
5. Move a break with the keyboard → the PDF uses it.
6. Photos → low-confidence breaks flagged → manual keyboard fix clears "review" and leaves no
   bad cut.
7. Cancel export → `PDF_CANCELLED`, then exporting again works.
8. A corrupt image → `PDF_DECODE_FAILED`, and the page stays usable.

Every E2E PDF is downloaded through the real link and validated as in §12.

## 18. Failures and limitations (not hidden)

- **Unavoidable bad cuts remain** in content taller than the window: chat bubbles in long chats,
  giant messages, photos. Automatic pagination cannot fix these; they need the manual tools. The
  confidence model flags photos (low) but rates splits *between lines inside a bubble* as
  **medium** — 38% of medium breaks are bad.
- **WebKit WinCairo fallback is slow and stalls:** analysis and export take 2–4× Chromium, with
  47–485 ms stalls (one repeat hit 865 ms). This build lacks OffscreenCanvas; real Safari should
  not need the fallback, but that is untested.
- **Cancellation latency** is up to ~1 s in Firefox and ~2.5 s in WebKit for 1080×21342: the
  source decode cannot be interrupted.
- **PNG embedding is slow** (3.4–6.6 s for 8 pages): pdf-lib re-parses PNGs in JS.
- **Firefox JPEGs are ~1.6× larger.**
- **Fixed mode still runs analysis** (wasted ~0.3–1.4 s).
- **Measurements** are from one shared 2015 laptop under background load, with Playwright engines
  only. No iOS, Android, real Safari, or low-memory devices. No viewer besides Chromium's PDFium
  and pdf-lib.
- **Fixtures are synthetic** (rendered HTML), although they cover the requested categories and the
  difficult cases. Real-world screenshots (anti-aliasing, compression, gradients, wallpapers
  behind chat) will add noise; the whitespace signal is stroke-based, so flat colour backgrounds
  are fine, but textured backgrounds are untested.
- **Weights were tuned on the same 14 fixtures** they are evaluated on. The broad plateau (105/243
  tie) makes over-fitting unlikely, but a held-out real-screenshot set is needed.

## 19. Answers to the spike questions

1. **Environment?** §1: a 2015 dual-core laptop; Chromium 153, Firefox 155, WebKit 26.6
   (WinCairo, not Safari); Node 22; pdf-lib 1.17.1.
2. **Fixtures?** 14 synthetic fixtures with DOM + ink-band ground truth and OCR lines, plus Spike B's
   large images (§3).
3. **Is Smart Pagination better than fixed?** Yes: 60.5% → 19.7% content-splitting breaks, 61 → 0
   glyph cuts; 12.9% with ≤ 5% shrink at equal page count (§4, §7).
4. **Algorithm?** A stroke-based row-signal proxy, windowed candidate scoring with central
   configurable weights, a confidence model, and manual anchors (§5).
5. **Visual vs OCR?** Identical results; OCR costs seconds to a minute. Visual only (§6).
6. **Load OCR for PDF?** No. Use existing OCR lines only if they are free (§6).
7. **Window size?** ±10% up plus ≤ 5% shrink; ±5% is too tight, > 15% has diminishing returns (§7).
8. **Confidence reliable?** High 3.9% bad; low always correct to flag; medium needs a "check"
   state (§9).
9. **Manual correction?** Complete: drag, keys, add, delete, reset, snap, live re-plan, validation;
   E2E in 3 engines (§8, §17).
10. **PDF generation correct?** Dimensions, placement, scaling, margins, page count, no clipping, no
    rotation, no blank pages: validated for 51 runner PDFs plus all E2E PDFs (§12).
11. **Memory bounded?** Yes: by the largest single image, not by pages or image count. Median
    1080×30000 export +103–232 MiB (§10).
12. **Is the screenshot duplicated?** Decoded twice in total (analyse, export), never per page. The
    Blob is passed by reference; no full-size RGBA copy in JS (§10).
13. **Performance?** Visual analysis typically 0.3–1.4 s and export 0.4–1.4 s per screenshot in
    Chromium/Firefox, up to 30k px (one outlier: 2.9 s under load). PNG is 3–6× slower.
    OCR +3–46 s (§11).
14. **Responsive?** Chromium ≤ 27 ms and Firefox ≤ 88 ms stalls (clean run); WebKit fallback up to
    ~0.5 s (§11).
15. **Progress / cancel / cleanup?** Yes in all engines. Memory returns to baseline and the next
    export works; latency is bounded by one decode (§11).
16. **Browser differences?** 8 found, 7 fixed (§15). Page breaks are identical across engines.
17. **Searchable-PDF coordinates?** Mapping implemented and proven by unit tests and
    content-stream checks; the text layer is not built (§14).
18. **Overlap?** Useful for fixed cuts, not for smart pagination; off by default (§13).
19. **Failures?** §18.
20. **Recommendation:** **needs limited refinement.**
    - The algorithm, engine abstraction, worker pipeline, memory strategy and editing model are
      production-grade in structure and validated.
    - Refinements before building `/screenshot-to-pdf`:
      1. Surface **medium** confidence as "check" and add break-to-break navigation.
      2. Default to **up10 + ≤ 5% shrink**, with a "never scale" option.
      3. Skip analysis in fixed mode.
      4. Make cancel terminate the worker immediately.
      5. Use thumbnails, not full-size previews.
      6. Pick the image encoding strategy (see §20).
      7. Validate on real Safari/iOS/Android and in real viewers (Acrobat, Preview, pdf.js).
      8. Evaluate on a held-out set of real screenshots.

    None of these changes the architecture.

## 20. Architecture changes recommended

1. **`PdfEngine` stays the only PDF API.** Keep `analyse` / `plan` / `createPdf` with pure
   `plan()` on the main thread for instant editing, and heavy work in the Document Worker.
   Protocol ops as implemented: `pdf.analyse`, `pdf.create`, `pdf.decode` (transferable).
2. **Shared `decodeImage()`** (`src/core/pdf/decode.ts`) for every worker-side decode in Shotexa,
   including stitching and OCR preprocessing: `ImageDecoder` on Gecko, `createImageBitmap`
   elsewhere, fallback on failure. The Firefox main-thread stall affects *any* worker that
   decodes with `createImageBitmap`, so Spike A/C code paths should adopt it too.
3. **Canvas policy:** every crop or encode canvas that draws a large source uses a software
   context (`willReadFrequently: true`). Add this to the Spike B `limits.ts` guidance.
4. **Worker lifecycle:** recycle the Document Worker after any job over 8 MP; a hard cancel
   terminates it. Generalise into the broker as `recycleAfterPx`.
5. **Engine-independent analysis:** image analysis that drives decisions (pagination, and likely
   stitching) must not depend on canvas resampling. Use 1:1 bands and a JS reduction.
6. **Band tiling for any tall output page** (≤ `tileHeight` rows per image XObject, 1-row seam
   overlap). It keeps "Fit" and shrunk pages under the canvas-area ceiling.
7. **Config:** `windowUp 0.10`, `windowDown 0.05` for the product; weights stay in
   `config.ts`, with `ink` → 0 after a real-screenshot evaluation.
8. **UI contract:**
   - confidence states high / medium ("check") / low ("review");
   - break navigation; drag, keys, add, delete, reset, snap;
   - "shrunk to N%" labels;
   - thumbnails only.
9. **Image encoding:** JPEG q 0.9 remains the fast default. For lossless and smaller output on
   flat UI screenshots, embed raw RGB with native `CompressionStream("deflate")` as a FlateDecode
   image XObject, bypassing pdf-lib's JS PNG parser (pdf-lib supports raw streams). This needs
   one more measurement before choosing a default.
10. **Dependencies:** pdf-lib only (lazy, in-worker); no new ones. OCR is not a dependency of the
    PDF feature.

### New and changed files

- `src/core/pdf/`: types, config, geometry, signals, paginate, breaks, coords, plan, errors, decode,
  analyse-image, render-pdf, pdf-engine
- `src/workers/document.worker.ts`; `src/workers/protocol.ts` (PDF ops, transfer hook)
- `src/app/spikes/pdf/` (spike page, `noindex`, 404 unless `SHOTEXA_ENABLE_SPIKES=1`)
- `src/tests/unit/pdf/`, `src/tests/e2e/pdf-spike.spec.ts`, `src/tests/benchmark/pdf-benchmark.test.ts`,
  `src/tests/helpers/pdf-metrics.ts`, `src/tests/fixtures/pdf/` (12 MB)
- `scripts/spikes/pdf-fixtures/`, `scripts/spikes/pdf/` (runner, validator, summarisers)
- `playwright.config.ts` (PDF flows also run in Firefox and WebKit); `package.json` (+ pdf-lib)
