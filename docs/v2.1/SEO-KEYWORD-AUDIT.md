# Shotexa V2.1 — release and SEO audit

**Release-candidate update (18 October 2026):** HEIC conversion is deferred from the public build. The HEIC page and decoder discussed below are historical V2.1 audit findings, not shipped functionality in the [no-HEIC release candidate](./RELEASE-CANDIDATE-NO-HEIC.md). PDF, SVG and Beautifier recommendations remain in scope.

Audit date: 17 October 2026. Branch: `codex/shotexa-v2-1`. Scope: the three V2.1 converters and Screenshot Beautifier. This is a local code and browser audit; no production deployment was changed.

## Recommendation

**NO-GO for HEIC-enabled deployment yet.** The converter and Beautifier flows exercised locally work in Chromium and WebKit, but the statically embedded `heic-to`/libheif/libde265 JavaScript decoder has no verified modified-library replacement or relinking path. This audit now includes full GPLv3/LGPLv3 copies, component notices and versioned source pointers; these close disclosure gaps but do **not** close the LGPL §4d release gate. See [HEIC-LICENSE-RELEASE.md](./HEIC-LICENSE-RELEASE.md) for exact artifacts and the legal review needed. A production-domain smoke test, Search Console inspection and physical-device check also remain outstanding; the local test environment cannot substitute for these checks.

## Research method and metric availability

The connected Ahrefs Keywords Explorer was queried for the US and India but returned **“Insufficient plan.”** Google monthly search volume, numeric keyword difficulty, clicks and traffic potential remain unavailable. Six local Bing Webmaster Tools `KeywordStats_10_17_2026*.csv` exports were added to this review. Each has `Keyword`, `Trends` and `Impressions`, with 600 rows in total. After normalizing case and whitespace there are 499 distinct keywords; 101 recur across files, always with the same impression value. Repeated rows were **not summed**. Unrelated and competitor-brand terms were excluded from the opportunity set.

These files correspond to [Bing Webmaster Tools Keyword Research](https://www.bing.com/webmasters/help/keyword-research-628070b6), which reports query demand and related suggestions. They are **not** [Search Performance](https://www.bing.com/webmasters/help/search-performance-c680da36) records of Shotexa's own impressions, clicks or rankings. The CSVs do not contain the selected country, language, device or date range. Bing says Keyword Research defaults to all countries/languages/devices and the previous three months, but we cannot verify whether these exports used those defaults. Therefore the numbers below are the CSV's **Bing “Impressions” values for an unknown export filter and period**, not monthly Google search volume, US/India volume, Shotexa visibility or verified rankability. The `Trends` arrays have no date labels in the files and were not converted to monthly values. “Likely intent” and “opportunity” remain inferences from the queries, product and competitor pages.

## Top 10 keyword opportunities

For **every row**, US monthly Google volume, India monthly Google volume and numeric difficulty are **unavailable**. Bing figures are copied from one matching deduplicated CSV row, not added across exports. Priority balances observed Bing demand with page relevance; it is **not** a measured ranking-difficulty order.

| Priority | Bing query | CSV “Impressions” | Intent and existing page | Use on the existing page |
| --- | --- | ---: | --- | --- |
| 1 | pdf to jpg | 1,500,744 | Render PDF pages; `/pdf-to-jpg` | Keep as primary title/H1 concept; explain page selection and local conversion. |
| 2 | heic to jpg | 186,392 | Convert iPhone-style HEIC photos; `/heic-to-jpg` | Keep as primary phrase after the license gate clears. |
| 3 | how to convert heic to jpg | 180,552 | Instructional; `/heic-to-jpg` | Answer in existing steps/FAQ; avoid a duplicate guide page. |
| 4 | pdf to jpg converter | 176,102 | Tool-seeking; `/pdf-to-jpg` | Existing functional tool matches the intent. |
| 5 | pdf to png | 164,719 | Lossless PDF page raster; `/pdf-to-jpg` | Keep PNG option and supporting copy on the same route. |
| 6 | pdf to image | 136,753 | Broader PDF page export; `/pdf-to-jpg` | Explain JPG/PNG image outputs without claiming embedded-image extraction. |
| 7 | svg to png | 43,874 | Rasterize SVG; `/svg-to-png` | Keep as primary phrase and explain transparent output. |
| 8 | heic to jpg converter | 21,904 | Tool-seeking; `/heic-to-jpg` | Support with converter controls and honest codec limits. |
| 9 | svg to jpg | 7,665 | Opaque SVG raster; `/svg-to-png` | Mention the JPG background-color option on the same page. |
| 10 | convert heic to png | 2,194 | PNG output; `/heic-to-jpg` | Support the existing PNG option without a second SEO route. |

Secondary rows worth testing in copy include `convert pdf to jpg` (187,194), `convert heic to jpg` (37,442), `convert svg to png` (5,632), `heic to jpg free` (3,600), `svg to png converter` (3,320), `heic to png converter` (2,088), `pdf to jpg high quality` (1,975), and `pdf to png high quality` (582). These are **not additive** with the table: one person may use multiple queries, and the export period is unknown. Several higher-count broad terms and multilingual variants exist, but no country/language filter was supplied, so this audit does not treat them as US or India opportunities. The six files contain **no screenshot, beautifier, mockup, background or template query rows**. Beautifier keyword priorities remain qualitative until a targeted Bing export or Search Performance report is available.

Head terms have large-suite and specialist competitors, and no reliable difficulty metric is available. Product-specific supporting topics remain batch HEIC conversion, selected PDF pages, PNG transparency and no-watermark screenshot templates. They fit the current pages without new keyword routes. Do not repeat exact keywords unnaturally or change canonical URLs based on this export alone.

## Competitor findings

| Competitor | Verified feature or positioning | Implication for Shotexa |
| --- | --- | --- |
| [FreeConvert HEIC](https://www.freeconvert.com/heic-to-jpg), [SVG](https://www.freeconvert.com/svg-to-png) | Broad converter coverage; SVG offers resize, compression and DPI controls and accepts uploads up to its stated limit. | Compete on local processing and a connected image workspace, while acknowledging smaller file/format limits. |
| [CloudConvert HEIC](https://cloudconvert.com/heic-to-jpg), [PDF](https://cloudconvert.com/pdf-to-jpg) | Wide format coverage and image resolution, quality and size controls. | Avoid generic “supports more formats” claims; explain the exact local task and options. |
| [Convertio HEIC](https://convertio.co/heic-jpg/), [SVG](https://convertio.co/svg-converter/) | Batch and broad formats; its pages describe remote/server conversion and file retention/deletion. | Local-only processing is a useful differentiator, but do not imply all online converters retain files indefinitely. |
| [iLovePDF PDF to JPG](https://www.ilovepdf.com/pdf_to_jpg) | Offers page rendering **and embedded-image extraction** with quality choices. | Shotexa renders selected pages; it does **not** extract embedded images. Copy must keep that distinction. |
| [Shots.so](https://shots.so/) | Large template/background/mockup library, including magic backgrounds and 3D treatments. | Original backgrounds and clear one-click compositions matter more than another color variant. |
| [Pika editor](https://pika.style/templates/screenshot-editor), [templates](https://pika.style/templates) | Frames, backgrounds and presets; its page says free exports include a small watermark and some advanced exports are Pro. | Shotexa can truthfully emphasize no added watermark, local editing and editable free templates. |

The SERP also contains browser-only converters, so “local” alone is not a proven uncontested keyword niche. Specific workflows, accurate constraints and visual examples are stronger content angles.

## On-page and indexability audit

| Route | Title, H1 and description | Content and internal links | Canonical/sitemap |
| --- | --- | --- | --- |
| `/heic-to-jpg` | Unique, names JPG and PNG plus local batch conversion. | Explains codec limitations, orientation, steps and FAQs; links to Editor, Beautifier and other continuations. | Registered live tool; self-canonical from route registry; in generated sitemap. |
| `/pdf-to-jpg` | Unique, names page selection, resolution and PNG. | Explains limits, password handling and raster text; links to downstream tools. | Same registry behavior. |
| `/svg-to-png` | Unique, names PNG/JPG, dimensions and local conversion. | Explains passive SVG restriction, transparency and rejection reasons; links to downstream tools. | Same registry behavior. |
| `/screenshot-beautifier` | Updated in this audit to name free mockups, backgrounds and templates. | Updated explanation and FAQ to match the 18 scenes, 12 templates and preserved classic presets. | Existing URL and self-canonical unchanged; remains in sitemap. |

The tool education sections are server-rendered. The route registry generates metadata and sitemap entries from live tools, avoiding duplicate PNG/JPG pages. The `SITE` configuration uses `https://shotexa.com` by default and marks non-production deployments `noindex`; verify the actual production environment variable and rendered canonical after deployment. The production domain was inaccessible from this audit environment, so live indexing, Search Console coverage, canonical host alignment and Core Web Vitals are **not verified**.

On a local `next start` production build, all four pages returned HTTP 200 with the expected unique titles/H1s, `index, follow`, and exact self-canonicals under `https://shotexa.com`. Local `sitemap.xml` contained all four; `robots.txt` allowed them and disallowed `/spikes/`. This checks the build output, not the deployed host.

### Safe improvements made in this audit

- Updated Beautifier title, H1, description, summary, steps and FAQ to describe the shipped visual studio instead of the older preset-only presentation. Existing URL and canonical logic were preserved.
- Corrected a responsive SVG dimension edge case: percentage `width`/`height` now use the `viewBox` dimensions instead of incorrectly parsing `100%` as 100 pixels.
- Released the previous SVG preview Blob URL on every file replacement, including invalid/oversized input, and cleared stale ready state.
- Moved PDF page-size validation into the `try/finally` so an over-limit page is still cleaned up.
- Expanded browser regression checks to inspect actual JPG/PNG/ZIP outputs, PDF pixels, workspace continuation and preview URL cleanup.
- Made existing browser tests tolerate slower WebKit PDF initialization, conversion and consent hydration while retaining output and network assertions. Undo history tests now accept either valid coalesced or separate automated slider steps and still require Undo to reverse the last change.

### 17 October blocker follow-up

- Audited the exact HEIC package and embedded native codec chain. Pinned `heic-to` to 1.6.6; added the complete GPLv3 copy and [component notices](/licenses/HEIC-NOTICES.txt) alongside the existing LGPLv3 text. The HEIC tool footer now links all three. The remaining §4d/source and patent questions are documented in [HEIC-LICENSE-RELEASE.md](./HEIC-LICENSE-RELEASE.md).
- Incorporated six Bing Keyword Research CSVs, deduplicated 101 repeated keyword rows, and mapped measured query counts only to the existing four pages. No routes or canonicals changed.
- Rechecked the HEIC mobile memory path: `preflightHeicSize()` reads the whole input into an `ArrayBuffer`; `heicTo()` reads it again, posts the buffer to a persistent worker without a transfer list, then returns full-resolution `ImageData` and an `ImageBitmap` before Shotexa's export canvas is encoded. The package creates one Blob worker URL without revoking it or exposing worker teardown. The 25 MB file and 24 MP pixel limits reduce abuse, but multiple pixel-sized allocations and a persistent worker remain an unmeasured low-memory-phone risk. The current UI should not be described as phone-memory certified.

Audit edits are limited to `src/config/{tools,tool-content}.ts`, `src/components/tools/conversion/conversion-tool.tsx`, `src/core/conversion/{svg,pdf-images}.ts`, the affected route/converter/Beautifier/consent tests, and this report. The existing V2.1 feature files and earlier visual-polish work were preserved; no route, canonical algorithm, consent policy or production setting changed.

## Functional, security and performance review

- **HEIC/HEIF:** `heic-to/csp` 1.6.6 is lazy-loaded after input. File brand and spatial extent are checked before decoding; input is limited to 25 MB and output to 24 MP/16,384 pixels. Canvas encodes JPG/PNG, with orientation handled by the decoder. A successful batch produces individual results and a ZIP. Unsupported codecs receive an explicit error. The package's persistent decoding worker is not currently exposed for explicit teardown; repeated large sessions need device profiling.
- **PDF:** Existing PDF.js handles documents locally with `isEvalSupported: false`. The tool limits PDFs to 60 MB/80 pages, previews pages at low resolution, converts selected pages sequentially, caps page pixels and aggregate selection pixels, and releases canvases/page resources. Password-protected and malformed files get clear errors. It rasterizes pages rather than extracting embedded image objects.
- **SVG:** A passive element/attribute allowlist rebuilds uploaded markup without inserting it into the app DOM. Scripts, events, stylesheets, images, external URLs, `foreignObject` and active references are rejected. Sanitized Blob URLs are revoked; canvases are released. Supported SVG syntax is intentionally narrower than general SVG, and external-font/linked-resource designs may be rejected.
- **Workspace:** Converted blobs are registered in the existing temporary asset registry; Editor/Beautifier/Compress continuations reuse the in-memory result. Workspace assets remain session-scoped.
- **Beautifier:** The library has 18 procedural Canvas scenes and 12 visual templates. It uses the shared preview/export drawing path. Classic presets, background controls, frames, perspective, typography, multi-image layouts, watermark, undo/redo and exports remain exposed in code. Automated browser checks cover representative templates, background switching and export parity; the whole design matrix is not exhaustively visually certified on physical devices.
- **Analytics and consent:** Existing code only sends allowlisted event names and tool IDs, not file bytes, names or extracted text. Google Analytics loads after explicit acceptance; the saved reject path and legacy Vercel opt-out remain. Automated collector mocks verify request sanitization; actual production GA4/collector delivery is unverified.

### HEIC LGPL-3.0 release concern

The installed package declares `LGPL-3.0`. This pass added the full GPLv3 text, component notices and versioned heic-to/libheif/libde265 source pointers alongside the existing LGPL text. The decoder is Emscripten-compiled **JavaScript** (`USE_WASM=0`) statically embedding libde265, inlined into a worker string and a lazy-loaded production chunk; no separate decoder WASM file was found. [GNU LGPLv3 §4](https://www.gnu.org/licenses/lgpl-3.0.html) describes prominent notice, copies of both licenses, and a real modified-library replacement or source/relinking path. The current bundle still lacks a **verified §4d mechanism and complete corresponding-source/build provenance**. Legal review is required; a license file and source-tag links alone do not clear the gate. The exact inventory, alternative-decoder investigation and release options are in [HEIC-LICENSE-RELEASE.md](./HEIC-LICENSE-RELEASE.md).

## QA evidence

| Gate | Result |
| --- | --- |
| TypeScript | `npx tsc --noEmit` passed after the final test changes |
| ESLint | `npm run lint` passed after the final test changes |
| Unit tests | `npx vitest run src/tests/unit`: 51 files, 793 tests passed |
| Production build | `npm run build` passed; all four routes and sitemap/robots statically generated |
| Converter Playwright Chromium | 7 passed, 1 optional screenshot capture skipped; inspected decoded files and ZIP contents |
| Converter Playwright WebKit | 7 passed, 1 optional screenshot capture skipped in dev; production smoke passed SVG/HEIC/Beautifier and PDF passed on focused rerun. Timeouts in initial production run showed active PDF rendering, not bad output. |
| Beautifier regression Playwright | Chromium: 20/22 passed in full run; two failed on history grouping and slow navigation, then both passed on focused reruns. Focused Undo also passed in WebKit. Production Beautifier export parity passed in both browsers. |
| Analytics/consent Playwright | Final production-build suite: 8/8 passed in Chromium and 8/8 in WebKit, with mocked collection endpoints. Earlier WebKit attempts exposed short assertion windows and a transient reload navigation cancellation; tests were adjusted and rerun. |
| `git diff --check` | Passed (Git reported only line-ending conversion warnings) |

Blocker follow-up verification on 17 October: `npx tsc --noEmit` and `npm run lint` passed; `npx vitest run src/tests/unit` passed 51 files/793 tests; `npm run build` passed with the HEIC, PDF, SVG and Beautifier routes statically generated. On a fresh local production server, the three HEIC notice/license URLs returned HTTP 200, and the HEIC page linked them. Focused production Playwright tests for real HEIC output/orientation/workspace continuation, batch ZIP/error handling and converter mobile layout passed **6/6** across Chromium and WebKit. This is browser automation, not physical-phone memory testing. The earlier PDF/SVG/Beautifier/consent coverage above was not rerun in full because this follow-up changed only HEIC notices, its version pin and this report.

The local WebKit runner is browser automation, not a physical iPhone/Safari check. Browser tests do not establish production analytics delivery, search indexing or legal compliance.

Observed timing caveat: the focused two-page PDF export/recovery flow took about 1.9 minutes in one production-build WebKit run on this audit machine; a prior development run completed faster. This includes PDF.js startup, PNG and JPG batches, ZIP inspection, workspace handoff, and malformed/password input checks. It is not a per-page benchmark or a claim about typical devices.

## Remaining opportunities and release gates

1. Re-export Bing Keyword Research with explicit US and India filters/date ranges, plus targeted Beautifier seeds; obtain Google volume/KD from an authorized source and use actual Search Performance clicks/positions for Shotexa after launch. Avoid doorway pages for output-format variants.
2. Resolve the HEIC LGPL source/relinking mechanism and exact build provenance with qualified counsel; full license texts and notices are now present but insufficient alone. Keep the verified source/build package with the release.
3. Check deployed sitemap, robots, all four canonical URLs, response status and Search Console indexing on `shotexa.com` after approval to deploy.
4. Test HEIC memory use on a representative low-memory phone and a multi-file session; check PDF high-scale export on a mobile device. The local suite verifies functional bounds, not device-wide memory pressure.
5. Compare page speed and render stability with field data when available; no Core Web Vitals or ranking gains are claimed from the local build.

No commit, push, merge or deployment was performed as part of this audit.
