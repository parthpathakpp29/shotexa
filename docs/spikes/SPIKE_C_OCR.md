# Spike C — Browser OCR validation (Tesseract.js): results

Status: **complete, awaiting review.** No production OCR page was built.

## Verdict

**Tesseract is suitable for V1, with limitations.** Summary below; the evidence is in §4–§9.

- **Text-first screenshots** (articles, chats, phone UIs, code, receipts, tables, dark mode, low
  contrast, JPEG, blur, long captures): **0.0–4% character error rate (CER)** with the recommended
  default pipeline.
- **Engine behaviour:** identical in Chromium, Firefox and Node, and entirely local.
- **Weak spot: complex desktop UI layouts** (card grids, multi-column feature rows, sidebar +
  settings forms): 17–43% CER. The words are found (90–93% word recall), but Tesseract merges or
  mis-orders them.
- **Hindi:** practical only as English+Hindi.

Raw data in `docs/spikes/results/`:

- `ocr-node.json`: 27 fixtures × ~10 variants, 278 recognitions;
- `ocr-browser-{chromium,firefox,webkit}.json`: performance, memory, cancellation and parity;
- `ocr-browser-chromium-prefix.json`: Chromium before the fixes in §10.

### How to reproduce

```bash
npm run fixtures:ocr                    # regenerate fixtures + ground truth (Playwright/Chromium)
npm test                                # unit tests (OCR adapter, normalisation, preprocessing, strips, errors…)
OCR_BENCH=1 npx vitest run src/tests/benchmark/ocr-benchmark.test.ts   # accuracy/preprocessing benchmark (~20 min)
npx tsx scripts/spikes/ocr/summarise-node.ts        # tables from ocr-node.json
npx tsx scripts/spikes/ocr/eval-order.ts            # reading-order strategies on stored layouts
SHOTEXA_ENABLE_SPIKES=1 npm run build && npx next start -p 3100
npx tsx scripts/spikes/ocr/run-browser.ts --browsers chromium,firefox,webkit
npx tsx scripts/spikes/ocr/summarise-browser.ts
npx playwright test src/tests/e2e/ocr-spike.spec.ts # flows in Chromium, Firefox, WebKit
```

`/spikes/ocr` is a developer prototype:

- **Access:** it returns 404 in production unless `SHOTEXA_ENABLE_SPIKES=1`, and is `noindex`.
- **Input:** paste with Ctrl/⌘+V, or upload.
- **Options:** language, preprocessing, reading order.
- **Output:** progress %, Cancel, screenshot with word-box overlay next to editable text, Copy.

## 1. Setup

| | |
|---|---|
| Device | Windows 10 Pro laptop, Intel i7-5500U (2 cores/4 threads, 2015), 8 GB RAM, no GPU acceleration in headless |
| Browsers | Playwright **Chromium 153.0.8010.12** (full build, new headless), **Firefox 155.0**, **WebKit 26.6**. The WebKit build is the Windows *WinCairo* port, **not Safari**: it has no OffscreenCanvas. |
| Node | 22.12 (same adapter, used for the large accuracy benchmark) |
| Engine | **tesseract.js 7.0.0**, **tesseract.js-core 7.0.0**. OEM = LSTM only. PSM 3 (automatic layout). All three browsers selected the **relaxed-SIMD LSTM** core. |
| Models | `tessdata 4.0.0_best_int` (LSTM-only, integer): **eng 2.95 MB**, **hin 1.39 MB** (gzipped). Self-hosted: nothing from a CDN. |
| Server | Production build (`next start`); models and cores served as versioned static assets |

## 2. Architecture used

```text
React spike page ──(only)──► ocrService  (src/core/ocr/ocr-service.ts, lazy chunk)
                               │ validate header → decide preprocessing / strips
                               ├─► image worker: "ocr.prepare" (decode once, OCR-only preprocessing on a copy, strips) ── typed protocol v1
                               └─► OcrEngine (interface)  ◄── TesseractEngine (the ONLY module importing tesseract.js)
                                        └─► Tesseract.js dedicated Web Worker (one, reused) → self-hosted core + model
                                              ◄── blocks (opt-in) → normalise → OcrResult (original-pixel boxes)
```

- **Adapter:** the `OcrEngine` interface (`initialise`, `recognise`, `terminate`) is in
  `src/core/ocr/types.ts`. Replacing Tesseract with PP-OCR or another engine means one new adapter
  and nothing else.
- **Worker lifecycle:** one worker for the session. Jobs are serialised, and the worker is
  terminated when idle (60 s), after large jobs, and on language change (§10).
- **Result model** (§8): `rawText` (the engine's text, never edited) and `editedText` (cleaned, the
  only user-editable field) are kept separate from `blocks → paragraphs → lines → words`. Every
  level carries a bbox in **original screenshot pixels** plus a confidence; lines also carry a
  baseline. The model also records `durationMs`, `language`, `readingOrder`, `preprocessing`,
  `rotateRadians` and engine name/version.
- **Controlled error codes:** `OCR_ENGINE_LOAD_FAILED`, `OCR_MODEL_LOAD_FAILED`,
  `OCR_DECODE_FAILED`, `OCR_CANCELLED`, `OCR_OUT_OF_MEMORY` and `OCR_RECOGNITION_FAILED`. Raw engine
  messages go only into a local-only `detail` field. Verified in all three browsers.

## 3. Fixtures and ground truth

Fixtures live in `src/tests/fixtures/ocr/<id>/`: `image.png|jpg`, `expected.json` and
`expected.txt`, plus `manifest.json`. There are 27, generated by
`scripts/spikes/ocr-fixtures/generate.ts`.

- **Ground truth is exact.** A DOM walker in the rendered page records every word with its
  device-pixel box and groups the words into visual lines in logical (DOM) reading order. That
  gives text, lines, reading order *and* word boxes to score against.
- **Content** is synthetic and original: English prose, a symbol-heavy TypeScript snippet, a
  receipt, an invoice table, Hindi sentences and mixed Hindi/English chat.
- **Real system fonts:** Segoe UI, Georgia, Consolas, Nirmala UI for Devanagari, and Segoe UI Emoji.

**Metrics** (`src/tests/helpers/ocr-metrics.ts`):

- **Character error rate (CER):** Levenshtein distance over the whole text, in reading order.
  - *Strict* normalisation: NFC, emoji removed (Tesseract has no emoji model; they are counted
    separately), whitespace runs collapsed.
  - Case, digits, punctuation and symbols are never forgiven.
  - *Lenient* normalisation additionally maps curly quotes, dashes and ellipses.
- **Word error rate (WER).**
- **Word recall** (missing text) and **word precision** (hallucinated or incorrect text), both
  order-independent.
- **Exact/near (≤5% CER) line and row matches.**
- **Reading-order score.**
- **Symbol accuracy** from the character alignment.
- **Word-box IoU, horizontal IoU and centre-in-box rate** against the DOM boxes.

## 4. Fixture matrix

Default pipeline = the recommended one: automatic preprocessing (§6) plus the auto reading order
(§7). Timings are warm Chromium runs (worker already loaded) on this 2015 laptop; they vary ±40%
between runs. The "no-prep" columns are the Node run with no preprocessing and Tesseract's own
reading order.

| fixture | category | image | lang | default preprocessing | Chromium ms (warm) | **CER default** | CER no-prep, engine order | WER no-prep | word recall / precision (no-prep) | confidence |
|---|---|---|---|---|---:|---:|---:|---:|---|---:|
| web-clean | ui | 1280×800 | eng | upscale2 | 3520 | **26.6** | 28.5 | 28.6 | 91.7 / 97.5 | 89.6 |
| article | article | 1280×800 | eng | upscale2 | 5130 | **0.2** | 0.3 | 1.8 | 98.2 / 98.2 | 93.0 |
| article-dark | article, dark | 1280×800 | eng | none | 3700 | **0.2** | 0.2 | 1.2 | 98.8 / 98.8 | 93.5 |
| settings-desktop | ui | 1280×800 | eng | upscale2 | 2032 | **42.8** | 24.9 | 27.1 | 90.0 / 92.7 | 89.2 |
| chat-light (emoji, timestamps) | chat | 1170×2652 | eng | none | 3715 | **0.3** | 0.3 | 0.8 | 100.0 / 99.3 | 94.1 |
| chat-dark | chat, dark | 1170×2589 | eng | none | 4106 | **0.6** | 0.6 | 1.5 | 100.0 / 98.6 | 93.9 |
| phone-settings-2x | small text, ui | 780×1936 | eng | none | 1513 | **0.0** | 31.4 | 0.0 | 100.0 / 100.0 | 94.7 |
| phone-dense-3x (11 px) | small text, ui | 1170×2532 | eng | none | 1686 | **0.0** | 0.0 | 0.0 | 100.0 / 100.0 | 94.9 |
| phone-tiny-1x (11 px @1×) | small text | 390×844 | eng | upscale2 | 2025 | **0.6** | 16.2 | 47.4 | 53.8 / 55.3 | 65.0 |
| code-dark | code, dark | 1000×400 | eng | upscale2 | 4251 | **3.7** | 12.1 | 24.2 | 79.8 / 83.2 | 78.3 |
| code-light | code | 1000×400 | eng | upscale2 | 1933 | **1.1** | 2.4 | 10.0 | 90.0 / 90.8 | 83.7 |
| code-dark-2x | code, dark | 2000×800 | eng | none | 3497 | **4.0** | 28.1 | 12.9 | 87.9 / 95.6 | 89.3 |
| table (zebra, numbers) | table | 1000×604 | eng | upscale2 | 2082 | **0.0** | 70.3 | 18.5 | 81.5 / 98.5 | 86.4 |
| receipt | receipt | 520×700 | eng | upscale2 | 1186 | **0.0** | 1.3 | 3.5 | 96.5 / 96.5 | 89.1 |
| low-contrast (#8f on #c9) | low contrast | 1280×800 | eng | none | 1312 | **0.3** | 0.3 | 1.6 | 98.4 / 98.4 | 94.2 |
| jpeg-q35 | low contrast | 1280×800 | eng | upscale2 | 2587 | **0.3** | 0.3 | 1.5 | 98.5 / 98.5 | 93.8 |
| blurred (0.8 px) | low contrast | 1280×800 | eng | none | 2446 | **0.3** | 0.3 | 1.6 | 98.4 / 98.4 | 94.5 |
| mixed-cards | mixed layout | 1280×800 | eng | upscale2 | 1798 | **17.4** | 18.0 | 26.2 | 93.4 / 95.0 | 92.0 |
| two-column | mixed layout | 1280×800 | eng | upscale2 | 4137 | **0.0** | 0.1 | 0.7 | 99.3 / 99.3 | 93.6 |
| hindi-article | hindi | 1280×800 | eng+hin | none | 2772 | **1.1** | 0.0 (hin) | 0.0 | 100 / 100 | 94.0 |
| chat-hindi | hindi, chat | 1170×2532 | eng+hin | none | 2887 | **3.7** | 13.4 (hin) | 19.5 | 81.6 / 80.7 | 80.7 |
| chat-mixed-en-hi | mixed language | 1170×2532 | eng+hin | none | 4121 | **0.8** | 2.1 | 6.1 | 95.1 / 94.0 | 90.6 |
| chat-720x1280 | chat | 720×1280 | eng | none | 2396 | **0.7** | 0.7 | 2.1 | 98.9 / 97.9 | 93.6 |
| chat-1080x1920 | chat | 1080×1920 | eng | none | 1692–2339 | 0.5* | 0.5 | 1.1 | 100 / 99.0 | 93.7 |
| long-1080x5000 | long | 1080×4971 | eng | none | 9027–10044 | 0.5* | 0.5 | 1.9 | 99.2 / 98.1 | 93.4 |
| long-1080x10000 | long | 1080×10323 | eng | none (strips) | 13058–24477 | 0.7* | 0.7 | 1.9 | 99.8 / 98.1 | 93.7 |
| rotated-90 | orientation | 800×1000 | eng | upscale2 | 1837 | **0.4** | 0.4 | 2.4 | 97.6 / 97.6 | 92.7 |

\* Node figure for the default pipeline; in the browser these ran in the size/memory scenarios, not
the accuracy loop.

**Across the whole set:**

| | Mean CER | Worst |
|---|---:|---:|
| Raw Tesseract (no preprocessing, engine order) | 9.41% | 70.3% |
| Recommended default | **4.33%** (Node; Chromium and Firefox identical) | 42.8% |

**Browser parity:**
- **Chromium and Firefox** match Node to the decimal on every fixture.
- **WebKit** (no OffscreenCanvas, so the preprocessing path is skipped) matches Node's
  *no-preprocessing* numbers exactly, including the losses on tiny text, code and tables (§12).

## 5. Accuracy findings by category

| Category | Default CER | Finding |
|---|---|---|
| **Article / long text** | 0.0–0.3% | Launch quality. Misses are "·" → "-" and occasional case slips ("weeKly"). |
| **Chat** (light/dark, multi-line bubbles, timestamps) | 0.3–0.7% | Launch quality. Timestamps read correctly; the rare error is `:` → `.` ("09.06"). **Emoji are never recognised** (no emoji model): dropped, occasionally output as "&"/"Bs" junk (precision 98–99%). |
| **Dark mode** | 0.2–0.6% (chat/article); code 3.7–4.0% | Tesseract handles light-on-dark natively. **Inversion did not help** (§6). |
| **Small mobile text** | 0.0% at DPR 2–3 (even 11 px); 0.6% at DPR 1 **with ×2 upscale** (16.2% without) | Phone screenshots are fine as they are. Only true 1× tiny text needs upscaling. |
| **Code** | 1.1–4.0% | Symbols 92–99% correct: `{ } [ ] ( ) / \ _` are near-perfect; the errors are `===`/`!==`, `?.`, `??` and `"`. Lines containing only `}` are often dropped. **Indentation is not in Tesseract's text**, but rebuilding it from word x-positions was **13/13 correct** on every code fixture (`preserveIndentation`; the line-number gutter must be stripped first). |
| **Tables** | 0.0% with default; 70% raw | Recognition is good. Raw engine order reads column by column; the auto order (§7) restores rows. |
| **Receipt** | 0.0% default; 1.3% raw | Prices and totals right. Raw errors are digit/letter swaps ("2026-83-14", "500ml" → "Seeml"), fixed by the ×2 upscale. |
| **Low contrast / JPEG q35 / blur** | 0.3% | No preprocessing needed. Contrast stretch, binarisation and sharpening did not help (§6). |
| **Mixed layout** | two-column 0.0%; cards 17.4%; landing page 26.6%; settings with sidebar 42.8% | **The main weakness.** Tesseract merges text across narrow card/feature columns into single lines ("Shared calendars Smart reminders Private by default"); ordering can't undo that. See §7. |
| **Hindi / mixed** | 0.0–3.7% with eng+hin | See §5.1. |
| **Rotated 90°** | 0.4% | Tesseract 5 detects vertical text lines itself, so no orientation step is needed (§10.1 bug). |

### 5.1 Hindi and mixed English + Hindi

| Fixture | eng only | hin only | **eng+hin** |
|---|---:|---:|---:|
| hindi-article (pure Devanagari prose) | — | **0.0** | 1.1 |
| chat-hindi (Hindi messages, English UI chrome and timestamps) | — | 13.4 | **3.7** |
| chat-mixed-en-hi (code-mixed messages) | 26.7 | 49.1 | **0.8** |

- **Pure Hindi prose is excellent.**
- **Real screenshots always mix scripts** (English UI, Latin digits), so Hindi must mean **English
  + Hindi**.
- **Cost:** +1.36 MB model download, cold Hindi init 1.1–4.4 s, and a somewhat slower recognition.
  English accuracy with eng+hin loaded is essentially unchanged (article 0.2%, chat 0.3% → 0.6%).
- **Verdict:** practical for V1 as an opt-in language, not the default.

## 6. Preprocessing findings

Each step was benchmarked separately on 24–27 fixtures. Δ is CER points vs no preprocessing (best
of both reading orders); a win or loss means a change beyond ±0.5 points. Times are Node,
same-session deltas.

| Step | Mean Δ CER | Wins / losses | Time | Verdict |
|---|---:|---|---:|---|
| grayscale (ours) | +0.33 | 2 / 4 | ≈0 | **No** (Tesseract grayscales itself) |
| contrast stretch | −0.60 | 4 / 2 | ≈0 | **No by default**: its wins came from layout side-effects, not low contrast; the low-contrast/JPEG/blur fixtures were already 0.3% |
| Otsu binarisation | **+1.49** | 2 / **8** | ≈0 | **Hurts** (anti-aliasing and thin glyphs lost) |
| sharpen (unsharp 3×3) | +0.23 | 1 / 5 | ≈0 | **Hurts** slightly |
| upscale ×1.5 | −0.46 | 8 / 4 | +0.7 s | Unstable: receipt went 1.3% → **25%** |
| **upscale ×2** | **−1.48** | 8 / 3 | +1.5 s | **Helps small text; hurts large text** |
| contrast + ×2 | −1.34 | 7 / 4 | +1.8 s | No better than ×2 alone |
| invert (dark themes) | −0.15 | 1 / 0 (5 fixtures) | — | **Not needed** |
| orientation correction | — | — | — | **Not needed** for 90°; 180° untested (§10.2) |

**What decides whether ×2 helps is text size.** A cheap row-projection estimate of line height
(`estimateLineHeight`) separates the cases cleanly:
- **≤ 17 px** (1× desktop, 1× tiny phone text, code, receipts): ×2 helped every fixture, e.g. tiny
  phone text 16.2% → 0.6% and code 12.1% → 3.7%.
- **≥ 23 px** (DPR 2–3 chats, HiDPI code): ×2 hurt every fixture (code at 2×: 4.0% → 9.0%; chat
  0.3% → 0.6%).

**Default policy** (`choosePreprocessing`, `src/core/ocr/preprocess.ts`; every threshold is in `DEFAULT_PREPROCESS_POLICY`):

```text
estimated line height < 18 px AND upscaled image ≤ 4.2 M px  → grayscale + ×2 upscale
otherwise                                                     → OCR the original directly
(contrast / invert / binarise / sharpen: off)
```

This "auto" policy had **8 wins and 0 losses** vs no preprocessing. Automatic preprocessing is
worth implementing, but *only* this one adaptive step.

**Memory cost of ×2:** a 1280×800 capture upscaled to 4.1 M px peaked at **+300 MiB in Chromium**
(+136 MiB in Firefox, +171 MiB in WebKit). That's why upscaling is capped at 4.2 M output pixels.
A 1920×1080 capture at DPR 1 is therefore *not* upscaled, and small text there stays at raw
accuracy (e.g. code at ~8–12% CER). That's an accepted trade-off to revisit with strip-wise
upscaling (§12).

## 7. Reading order

Reading-order strategies were compared offline on the stored layouts (`scripts/spikes/ocr/eval-order.ts`), no preprocessing:

| Strategy | Mean CER | Worst | Breaks |
|---|---:|---:|---|
| Tesseract engine order (PSM 3) | 9.41 | 70.3 (table) | label/value rows, tables, line-number gutters |
| top-down rows | 10.96 | 69.1 (two-column) | multi-column articles, sidebars, rotated text |
| attach row fragments (heuristic) | 10.59 | 82.1 (code) | **rejected**: attached gutters and labels wrongly |
| attach + split merged columns | 12.29 | 81.7 | **rejected** |
| **auto selector** (chosen) | **5.90** | 43.9 | sidebar + settings form |

**The auto selector** (`chooseReadingOrder`): if two side-by-side blocks both contain a line of
≥ 6 words (side-by-side *prose*), keep Tesseract's order. Otherwise use top-down rows.
- **Fixes:** phone settings (31.4% → 0.0%), tables (70.3% → 15.9%, and 0.0% with the default
  upscale), code gutters (12.1% → 8.2%).
- **Keeps correct:** two-column articles (0.1%) and rotated text (0.4%).
- **Regresses:** settings-desktop (24.9% → 43.9%), where the sidebar interleaves with the form rows.

The rejected heuristics are kept in `scripts/spikes/ocr/order-experiments.ts` for reproducibility.
The rule was tuned on these 27 fixtures, so it must be re-validated on real screenshots.

**Page-segmentation modes are not a better lever.** PSM 4/6 fix tables and phone settings in
Tesseract's own order but break two-column text (69.5%). PSM 11 (sparse) is worse overall.

**Where reading order breaks, and whether basic ordering is enough for V1:**
- **Chats:** fine. Bubbles, timestamps and day separators come out in order: 1.00 order score on
  every chat, including DPR 2/3, dark and long captures.
- **Articles:** fine, including two-column.
- **Tables:** fine with the auto order.
- **Cards and feature columns:** broken by line *merging* inside Tesseract. No ordering rule
  recovers it (splitting at wide gaps was tried and rejected), so fixing it needs real layout
  analysis.
- **Sidebar + form:** neither order is right.
- **Verdict:** basic ordering is **sufficient for V1** on text-first screenshots. Complex desktop
  UIs are a documented limitation: the words are all there (recall 90–93%), but in the wrong order.

## 8. Searchable-PDF readiness

Tesseract.js returns layout only when explicitly requested: `recognize(img, {}, { text: true, blocks: true })`. The adapter always requests it.

| Data | Available | Notes |
|---|---|---|
| Block bbox + confidence + block type | ✅ | `blocktype` e.g. FLOWING_TEXT |
| Paragraph bbox + confidence + `is_ltr` | ✅ | |
| **Line bbox + confidence + baseline** | ✅ | Baseline endpoints mapped to original pixels |
| **Word bbox + confidence** (+ alternative choices) | ✅ | All words have boxes |
| Symbol (character) bbox + confidence | ✅ (not kept in `OcrResult`) | Available for later text-layer glyph spacing |
| Page skew / rotation | ⚠️ `rotateRadians` only when `rotateAuto` is set; no per-word orientation | 90° text was recognised natively; its boxes are in the rotated frame |
| OSD (orientation/script detection) | ❌ in the LSTM-only build | Needs legacy core + `osd.traineddata` (4.3 MB) + legacy `eng` (10.9 MB); not worth it for V1 |

**Box accuracy** vs the DOM ground truth, word boxes in original pixels:

| Measure | Result |
|---|---|
| Horizontal IoU | **0.89–0.98** |
| Word centre inside the true box | **99.4–100%** |
| Full IoU | 0.52–0.70 (expected: DOM boxes are the full font em-box, Tesseract boxes hug the ink) |
| Words box-matched | 90–100% on text-first fixtures |

**Coordinate chain, implemented and unit-tested** (`src/core/ocr/coords.ts`):
- recognised-image px → original px, handling upscale scale and strip offsets (`toOriginal`,
  `composeTransforms`);
- original px → PDF points with a bottom-left origin (`imageBoxToPdf`).

**Conclusion:** the bounding data is sufficient for an invisible text layer. Keep word boxes and
baselines; scale text to the word box width.

## 9. Performance

### 9.1 First use (cold, fresh profile)

| | Chromium | Firefox | WebKit |
|---|---:|---:|---:|
| App JS before OCR intent | 194 KiB | 194 KiB | 193 KiB |
| OCR assets requested before intent | **0** | **0** | **0** |
| JS chunks fetched on intent (service + Tesseract.js API) | 12 KiB | 13 KiB | 12 KiB |
| Tesseract worker script | 33 KiB | 33 KiB | 33 KiB |
| **Core (relaxed-SIMD LSTM `.wasm.js`)** | **1.43 MB** | 1.43 MB | 1.43 MB |
| **English model** | **2.88 MB** | 2.88 MB | 2.88 MB |
| Hindi model (on demand) | 1.36 MB | 1.36 MB | 1.36 MB |
| **Cold init** (worker + core + eng model), localhost | 1.7–2.4 s | 2.0 s | 2.8 s |
| First recognition, 1080×1920 chat | 2.3–4.3 s | 4.1 s | 7.5 s |

- **Total first-use transfer for English is about 4.4 MB.** On a real network, add download time.
- **The decompressed model is cached in IndexedDB** by Tesseract.js (`cacheMethod: "write"`).
  Re-initialising after the worker is terminated took **0.9–2.0 s** with nothing re-downloaded.
- **Architecture §48 is met.** The homepage loads 0 bytes of OCR (verified by the e2e test and by
  inspecting the production chunks).

### 9.2 Warm use (worker reused)

Warm recognition of normal screenshots takes **~1.2–5 s** in Chromium on this 2015 dual-core laptop:
receipt 1.2 s, phone settings 1.5 s, 1080×1920 chat 1.7–3.1 s, 1280×800 article with ×2 upscale
3.2–5.5 s, dark code with ×2 upscale 4.3–7.1 s.

- **Firefox** is similar to about 1.5× slower.
- **WebKit** varied between runs, from Chromium's speed up to 2–3× slower.
- **Reusing the worker** saves the whole init (1–2.4 s) on every job after the first.

| Image size (fresh page, warm engine) | Chromium | Firefox | WebKit |
|---|---:|---:|---:|
| 720×1280 | 2.6 s | 5.0 s | 6.1 s |
| 1080×1920 | 3.1 s | 5.8 s | 8.6 s |
| 1080×4971, full image | 10.0 s | 10.2 s | 24.9 s |
| 1080×4971, strips | 9.0 s | 21.5 s | — (no strips without OffscreenCanvas) |
| 1080×10323, full image | 24.5 s | 19.9 s | 45.9 s |
| 1080×10323, 6 strips | 13.1–18.7 s | 29.9 s | — |

**Long screenshots are feasible:** 1080×10k is recognised at 0.7% CER in every engine. Strips gave
identical accuracy with mixed speed and memory results. They are now a safety valve above
8,000 px (`stripThresholdPx`), not the default.

### 9.3 Memory

OS-level private bytes of the whole browser process tree, using Spike B's sampler; Δ vs page
baseline.

| | Chromium | Firefox | WebKit |
|---|---:|---:|---:|
| Idle OCR worker after init | +77 MiB | +64 MiB | +121 MiB |
| Peak, 1080×1920 chat (fresh page) | +87 MiB | +20 MiB | +90 MiB |
| Peak, 1280×800 with ×2 upscale (4.1 M px) | **+297–300 MiB** | +136 MiB | +171 MiB |
| Peak, 1080×10k full image | +163 MiB | +153 MiB | +260 MiB |
| Retained after 5 jobs, no recycling | +123 → **+262 MiB** | +55 → +97 MiB | +120 → +160 MiB |
| After recycling the worker | +36–49 MiB | ≈ baseline | +118 MiB (WebKit returns memory slowly) |

- **Tesseract's WASM heap grows to fit the largest image and never shrinks**, so an idle worker
  keeps paying for the last big job.
- **With Spike B's budgets** (256 MiB desktop, 160–192 MiB on smaller devices):
  - one normal OCR job fits;
  - a ×2-upscaled 1280×800 job in Chromium does not fit comfortably, hence the 4.2 M-pixel upscale cap;
  - OCR and OpenCV must never be resident at the same time (OpenCV alone is +190–330 MiB).
- **Worker lifecycle:** keep the worker alive while OCR is in use (re-init costs 1–2 s), and
  **terminate it**:
  - after 60 s idle;
  - after any job that recognised ≥ 4 M pixels (retained memory fell from +262 to +174 MiB in the
    re-run);
  - on language change (§10.1);
  - before any other heavy engine starts.

### 9.4 UI responsiveness, progress, cancellation

- **Off the main thread:** decoding and preprocessing run in the image worker, recognition in
  Tesseract's worker.
- **Longest main-thread stall** during recognition: **Chromium 11–57 ms** (scrolling stays smooth),
  Firefox 27–206 ms, WebKit 67–819 ms. The WebKit worst cases coincide with decoding the large
  preview `<img>` on the main thread, which is spike-page work, not OCR.
- **Progress:** 18–29 progress events per job (154 for a 6-strip job), shown as a % in the spike UI
  with an ARIA live status.
- **Cancel:** Tesseract has no per-job abort, so the adapter terminates the worker.
  - The job settled as `OCR_CANCELLED` **17–76 ms after `cancel()`** in all three browsers.
  - The next job worked, re-initialising from cache in 0.9–2.0 s.
  - Memory after cancel: Firefox and WebKit returned to baseline; Chromium kept +161 MiB of
    decoded-image memory from the job, reclaimed lazily (the Spike B behaviour).

## 10. Failures and bugs found (not hidden)

1. **`reinitialize()` leaks engine state across languages (Tesseract.js).** After switching the
   worker from eng+hin back to eng, the rotated screenshot went from **0.4% to 81% CER**
   (confidence 0.93 → 0.30) in all three browsers, while upright text was unaffected. A fresh worker
   fixes it, and a fresh eng+hin worker also read mixed chat better (0.8% vs 2.1%). **Fixed:** a
   language change now creates a new worker.
2. **A missing core or model made `createWorker` hang forever** in all three browsers: the 404
   happens inside Tesseract's worker and never rejects the promise. **Fixed:** a `HEAD` preflight of
   the self-hosted assets (→ `OCR_ENGINE_LOAD_FAILED` / `OCR_MODEL_LOAD_FAILED` in < 100 ms), plus
   an init watchdog (120 s, configurable) that also terminates a late-arriving worker.
3. **×2 upscaling is memory-heavy in Chromium** (+300 MiB for 4.1 M px). Mitigated by the upscale
   cap and recycling; strip-wise upscaling is not yet built.
4. **Layout merging on desktop UIs** (cards, feature grids, sidebars): 17–43% CER from order and
   merging, with recall 90–93%. Open.
5. **Emoji** are never recognised and are sometimes replaced by junk tokens ("&", "Bs").
6. **Code:** `===`/`!==`/`??`/`?.` and quote errors; `}`-only lines dropped; indentation needs
   reconstruction (works, §5).
7. **×1.5 upscaling is unstable:** receipt 1.3% → 25%. It is not used.
8. **WebKit (WinCairo) has no OffscreenCanvas,** so no worker preprocessing or strips. The service
   falls back to OCR on the original (`NO_OFFSCREEN_CANVAS`), and loses the small-text wins there.
   **Real Safari 16.4+ has OffscreenCanvas; this must be re-checked on real Safari and iOS.**
9. **Test limitation:** Firefox and WebKit automation can't place images on the OS clipboard.
   - Chromium: tested with a real clipboard write and Ctrl+V.
   - Firefox/WebKit: tested with a paste event carrying the file, which exercises the same handler
     and pipeline.
10. **Not tested:** real iPhone/Android devices, 180° rotation, handwriting, non-Latin scripts other
    than Devanagari, multi-GPU/real-GPU Chrome, and screenshots from real apps. The fixtures are
    rendered HTML with real fonts.

## 11. Answers to the spike questions

1. **Is Tesseract.js good enough for V1?** Yes, **with limitations**: excellent on text-first
   screenshots, weak on complex desktop UI layouts.
2. **What works well?** Articles and long text, chats (light/dark, long), phone UIs at DPR 2–3,
   receipts, tables (with the auto order), code (1–4% CER), low-contrast/JPEG/blurred text, two-column
   articles, Hindi prose, and 90° rotation.
3. **What performs poorly?** Card grids and feature columns (17–27%), sidebar + settings forms
   (43%), emoji, dense code operators, Hindi without English (13–49% on real mixed screenshots), and
   tiny 1× text when upscaling is skipped (large 1× desktop captures, WebKit fallback).
4. **Default preprocessing?** None, except grayscale + ×2 upscale when the estimated line height is
   < 18 px and the upscaled image stays ≤ 4.2 M px. No contrast, binarisation, sharpening or
   inversion.
5. **Is automatic preprocessing worth it?** Yes, for that single adaptive upscale step: 8 wins,
   0 losses, and it halves the error rate on small text and code.
6. **Is English OCR launch quality?** Yes for text-first screenshots (0.0–0.7% CER typical, 1–4% on
   code). Complex UI layouts need honest UX copy and an easy edit/copy flow.
7. **Is Hindi/mixed-language practical for V1?** Yes, as an **opt-in English+Hindi** option: +1.36 MB,
   0.8–3.7% CER on Hindi and mixed chats. Hindi-only is not recommended.
8. **Fast enough on normal screenshots?** Yes. Roughly 1.2–5 s warm on a 2015 dual-core laptop,
   plus 1.7–2.8 s one-time init. The UI stays responsive, and progress and cancel work.
9. **Feasible on long screenshots?** Yes. 1080×5k takes 9–22 s and 1080×10k takes 13–30 s
   (Chromium/Firefox, up to 46–53 s in WebKit), at 0.5–0.7% CER.
10. **Download sizes?** ~4.4 MB for English first use (1.43 MB core + 2.88 MB model + ~45 KB JS);
    Hindi +1.36 MB. Cached afterwards (HTTP + IndexedDB).
11. **Memory?** Idle worker +64–121 MiB. Normal jobs peak around +20–170 MiB; ×2-upscaled 4 M-pixel
    jobs up to +300 MiB (Chromium). The heap is retained until the worker is terminated.
12. **Keep the worker alive or terminate it?** Keep it alive while OCR is in use. Terminate after
    60 s idle, after ≥ 4 M-pixel jobs, on language change, and before other heavy engines run.
13. **Enough bounding boxes for searchable PDF?** Yes: word, line (with baseline), paragraph and
    block boxes with confidences. Horizontal placement is accurate (x-IoU 0.89–0.98, 99–100% of
    word centres inside the true box).
14. **Biggest reading-order issues?** Tesseract merges lines across narrow columns (cards, feature
    grids) and splits label/value rows and table columns into separate blocks. The auto selector
    fixes the latter, not the former. Sidebar + form layouts remain wrong.
15. **Continue with Tesseract, or benchmark another engine first?** **Continue with Tesseract for
    V1**; the adapter makes swapping cheap. Before launch, **benchmark PP-OCR (PaddleOCR v4/v5 via
    ONNX Runtime Web)** on the same fixtures, with a focus on desktop-UI layouts, emoji-adjacent
    text and code operators. Only switch if it clearly wins on those *and* fits the download/memory
    budget. The `OcrEngine` interface and this benchmark harness are ready for that.

## 12. Architecture changes recommended (all backed by results above)

1. **OCR worker lifetime policy in the WorkerBroker:**
   - fresh worker per language set (never `reinitialize()`);
   - terminate on idle (60 s), after ≥ 4 M recognised pixels, and before OpenCV/PDF work;
   - cancellation by termination.
2. **Asset preflight and init watchdog** for every self-hosted WASM engine. The same hang risk
   likely applies to OpenCV loading.
3. **Self-host all OCR assets** (already done in the spike) under versioned, immutable-cacheable
   URLs; no third-party CDN. `@tesseract.js-data/{eng,hin}` are now runtime `dependencies`,
   copied to `public/vendor/` by `scripts/copy-vendor-assets.mjs` at `predev`/`prebuild`.
4. **Explicit capability path for no-OffscreenCanvas browsers.** Either do OCR preprocessing on the
   main thread in small tiles with yielding, or accept raw OCR there. Decide after real-Safari
   testing.
5. **Result model as specified,** with the reading order recorded, `editedText` separate from the
   layout, and all boxes in original-pixel coordinates.
6. **Default pipeline** = the adaptive ×2 upscale + the auto reading-order selector (both
   configurable). Offer an "order: as detected / top-to-bottom" toggle in the UI later for the
   layouts in §10.4.
7. **Hindi = English+Hindi bundle,** loaded on demand.
8. **Before production:**
   - real-device testing (iPhone Safari, Android Chrome, low-memory Android);
   - a benchmark of real app screenshots;
   - a PP-OCR comparison;
   - strip-wise upscaling for large 1× captures;
   - keep WASM threading / SharedArrayBuffer off (§45); nothing here needs it.

## New modules

| Module | Purpose | Tests |
|---|---|---|
| `src/core/ocr/types.ts` | `OcrEngine`, `OcrResult`, blocks/lines/words, options | contract tests |
| `src/core/ocr/tesseract-engine.ts` | Only Tesseract.js consumer: single reused worker, serialised jobs, cancel, preflight, watchdog, fresh worker per language | 10 unit tests (fake worker) |
| `src/core/ocr/normalize.ts` | Blocks → result, reading orders + selector, cleanup, indentation | unit + offline eval |
| `src/core/ocr/preprocess.ts` | Non-destructive grayscale/contrast/binarise/sharpen/invert/upscale, stats, policy | unit + benchmark |
| `src/core/ocr/strips.ts`, `coords.ts`, `errors.ts` | Long-image strips + merge, coordinate/PDF transforms, error mapping | unit |
| `src/core/ocr/prepare-image.ts` + image worker `ocr.prepare` | One decode, preprocessing, strips, off the main thread | browser runs |
| `src/core/ocr/ocr-service.ts` | Browser facade: validation, fallbacks, lifecycle, progress | e2e in 3 browsers |
| `src/config/ocr.ts` | Provisional runtime policy (strips, idle, recycle, timeout) | — |
| `src/app/spikes/ocr/*` | Dev-only prototype (paste/upload, language, progress, cancel, overlay, copy) | e2e |
| `scripts/spikes/ocr*/**` | Fixture generator, browser runner, summaries, order experiments | — |
