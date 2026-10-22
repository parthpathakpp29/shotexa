# Shotexa quality refinement and SEO audit

**Release-candidate evidence note (22 October 2026):** The named browser screenshots, exports, and measurement files below are preserved in the local release archive outside Git. They are listed as evidence descriptions rather than links because they are not in this candidate.

Review date: October 21, 2026. Branch: `codex/shotexa-v2-3`. Local work only; no commit, push, deployment, cloud provisioning, analytics-consent change, or new dependency.

## 1. Background-removal diagnosis

**The reported customer file is not yet diagnosed.** The three referenced attachments were not available in this session. Their alpha properties were supplied by the user; they were not independently measured here. We cannot establish whether the opaque Shotexa file was a downloaded export, a captured preview, or an input containing checkerboard pixels. Keep those originals private and provide local paths for a follow-up comparison.

The reproducible problem is different and concrete: the existing U²-Net-P object mask retains paper around narrow ink strokes. On the synthetic 1200 × 480 blue-curve fixture, the baseline PNG has genuine transparency but a broad white halo. Its original 320 × 320 mask is enlarged and softened; it is not a suitable single-ink extractor.

### Traced path

1. The runtime retains the original Blob and creates a bounded display bitmap. It does not alter the original file.
2. U²-Net-P runs in a lazy local worker (WebGPU where available, WASM fallback), producing a 320 × 320 alpha mask.
3. The exporter decodes the original Blob, applies the refined mask with `destination-in`, and encodes a fresh canvas. PNG retains alpha. Transparent JPEG requests are blocked.
4. Previously, the preview painted its checkerboard directly into a separate display canvas. **The export did not encode that preview canvas.** Capturing the preview would include the checkerboard; this remains a hypothesis for the customer file, not a proven cause.
5. Exported Blobs enter AssetRegistry as derived artifacts. Continue With selects the artifact, not the original. The new Copy PNG action also uses this exact exported Blob.
6. Destination applications may flatten clipboard images. Downloading and inserting the PNG is the dependable fallback. Word/LibreOffice placement has not been physically tested in this session.

### Measured alpha and quality

| 1200 × 480 synthetic fixture | Before: object model | After: single-ink method |
|---|---:|---:|
| Fully transparent pixels | 507,541 | 566,086 |
| Fully opaque pixels | 0 | 3,823 |
| Partial alpha pixels | 68,459 | 6,091 |
| Retained pixels where original paper was exactly white | Broad visible halo | 0 |
| Lost strokes with expected alpha > 20 | Not used as a baseline metric | 0 |
| Maximum alpha error versus known ink coverage | Not applicable to object model | 1/255 |
| Output dimensions | 1200 × 480 | 1200 × 480 |

Counts are fixture-specific, not a general accuracy score. Raw measurements: baseline, after.

### Evidence

- Original synthetic ink
- Before exported PNG and before UI
- After exported PNG and after UI
- Composites on white, dark, and green
- Single-color logo export
- Photo/object export, using the existing NASA public-domain astronaut fixture
- Mobile settings

All new signature/logo fixtures are synthetic. No customer files, personal names, or real signatures were copied into evidence.

## 2. Focused fixes

### 1 — Full-resolution single-ink extraction (P1)

An explicit **Signature / single-color mark** method estimates a uniform paper color from the border, estimates the ink color, recovers fractional pixel coverage, and removes paper-color contamination at antialiased edges. It uses original-resolution pixels and does not smooth or erode strokes by default. No model download is needed for this method.

The method rejects transparent inputs, nonuniform borders, low-contrast empty paper, and substantially multicolor marks. It is intentionally unsuitable for general photographs, textured paper, colored noise or multiple ink colors. A 16-megapixel limit bounds additional mask allocation. The existing object method and manual restore/erase tools remain available.

### 2 — Correct composition and trim (P0 export clipping; P1 preview mismatch)

Preview and export now share `paintRemovedBackground`. This removes separate implementations of gradient direction, replacement-image sizing, subject positioning, and shadows. Trim previously subtracted the bounds and then added a second centering offset, which could clip the subject. The new layout computes transformed bounds, including scale and position, before trimming. Shadow composition no longer draws the translucent subject twice. A replacement image that fails decoding now raises an error instead of silently disappearing; JPEG replacement output explicitly uses a white backing for uncovered alpha.

The source preview remains bounded by the existing 1024-pixel display proxy. Native-size fixtures verify exact composition parity; large-image previews can differ slightly through resampling and are not a full-resolution proof of every edge. Full-resolution exports still decode the original Blob.

### 3 — Transparent-preview and document workflow (P2)

Checkerboard, white, dark and neutral preview surfaces are CSS display surfaces, outside encoded canvas pixels. The UI explicitly says they are not exported and that capturing the preview includes its surface. Export details distinguish retained alpha from a chosen background. Copy PNG uses the last exported artifact and reports unsupported clipboard access with a download fallback. The result card is labelled **Last exported image** to distinguish it from edits made afterward.

### 4 — Compression guidance (P2)

Removed the unsupported assurance that text stays sharp down to approximately 80% JPEG/WebP quality. The inspector now recommends checking at 100% and using PNG for lossless small-text output. Compression behavior and defaults are unchanged.

## 3. Ranked findings and deferred work

| Priority | Finding | Disposition |
|---|---|---|
| P0 — fixed | Trim offset clipped exported subject pixels; transformed bounds were not considered | Fixed with shared layout and regression coverage; original files were not modified |
| Unconfirmed | Customer's opaque checkerboard export claim | No baked-checkerboard export reproduced; do not infer the cause without the original files |
| P1 | Object segmentation retains paper around fine ink | Fixed for the explicitly supported single-ink case |
| P1 | Preview and export used different composition rules | Shared painter; display-proxy resolution remains documented |
| P1 | Photo masks retain halos around hair/complex boundaries | Deferred: manual review/refinement remains necessary; no unbenchmarked model replacement |
| P1 | Old comparison claims contradict V2.1/V2.2 capabilities | Corrected perspective, branding, optional watermarks and preview-only motion descriptions |
| P2 | Checkerboard display can be mistaken for image pixels | CSS surfaces, instructions and artifact-based Copy PNG |
| P2 | Local production tests record Vercel-only analytics 404s or miss delayed consent UI | Local-only QA config declines analytics before hydration; no product consent change |
| P2 | Hard-coded compression-quality promise | Corrected wording |
| P2 | Very large images and mobile inference performance | Existing bounded processing retained; physical low-memory phone testing remains outstanding |

Larger work should benchmark guided matting or an alternative model on a licensed, diverse dataset before adopting it. Include hair, transparent objects, low-contrast products, colored paper and mixed-color logos. Do not generalize the signature result to these cases.

## 4. Tool quality scorecard

The registry has 20 live tools. Branding and packs are embedded Beautifier workflows, not separate duplicate routes. This is a sample-based engineering scorecard, not a numerical competitor ranking.

**S** = satisfactory in sampled output/regression checks; **W** = usable with a material limitation needing review; **N** = not benchmarked broadly. Privacy scores cover local data paths and available network assertions, not a formal security certification. Performance is N where no controlled device benchmark was performed.

| Live tool / embedded workflow | Correctness | Visual quality | Usability | Performance | Reliability | Privacy/security | Evidence / limitation |
|---|---|---|---|---|---|---|---|
| Remove Background | S/W | W | S | W | S/W | S | Alpha and ink tests; photo halos remain; conditional method limits |
| Beautifier Studio | S | S | S | N | S | S | Shared painter, template and workspace regression; high-resolution device budget still matters |
| Watermark Stamp Pro | S | S | S | N | S | S | Layer manipulation and exports; user watermarks remain optional |
| Brand Kit | S | S | S | N | S/W | S | Browser-local persistence; browser storage eviction remains a limitation |
| Screenshot Packs | S | S | S | N | S | S | Sequential rendering, selected results and ZIP integrity |
| Smart Stitch | S/W | W | S | N | S/W | S | Real scrolling fixtures and manual correction; ambiguous overlap needs review |
| Combine Screenshots | S | S | S | N | S | S | Shared encoder/workspace chains; aspect-ratio preservation |
| Screenshot Editor / Crop / Resize | S | S | S | N | S | S | Transform output and artifact continuation; enlargement cannot restore detail |
| Annotate Screenshot | S | S | S | N | S | S | Flattened exports in cross-tool chains |
| Split Long Screenshot | S | S | S | N | S | S | Split-piece continuation and format output checks |
| Compress Screenshot | S | W | S | N | S | S | Actual sizes and target search; lossy text quality needs visual review |
| Convert Screenshot + PNG/JPG/WebP pages | S | S/W | S | N | S | S | File signatures, alpha backing, dimensions and selected formats; lossy sources stay lossy |
| PDF to JPG / PNG | S | S/W | S | N | S | S | Real selected-page pixels and ZIP; rasterizes pages, does not extract embedded assets |
| SVG to PNG / JPG | S | S/W | S | N | S | S | Passive SVG validation, alpha/fill and sizing; unsupported SVG constructs rejected |
| Screenshot to PDF | S | S | S | N | S | S | Real PDF pages, pagination, ordering and continuation |
| Searchable PDF | S/W | S | S | W | S | S | English/Hindi text-layer tests; OCR accuracy and CPU cost vary |
| OCR / Extract Text | S/W | N/A | S | W | S | S | Editable text, cancellation/retry; small/blurred/typeface-specific text can be wrong |
| Screenshot to Data | S/W | N/A | S | W | S | S | Table edits and CSV/JSON/XLSX checks; inferred rows/columns require review |
| Smart Privacy Guard / Redact | S/W | S | S | W | S | S/W | Flattened reviewed output; detection is incomplete and solid fill is safest |
| Blur Screenshot | S | S | S | N | S | W | Blur/pixelation are not equivalent to opaque secure redaction |
| Metadata Removal | S | S | S | N | S | S | Container cleaning and verification; private information visible in pixels remains |
| Compare Screenshots | S | S | S | N | S | S | Side-by-side, divider/diff/export; comparison is visual, not semantic |
| Batch Processing | S | S/W | S | N | S | S | Sequential processing, cancel/retry, per-item errors and actual ZIP entries |
| Workflows | S/W | S | S | N | S/W | S | Existing runtime/action reuse; browser-session state is intentionally transient |

See the test-results section for actual pass/fail counts and remaining gaps. A row marked S does not imply every input or physical device was tested.

## 5. Complete technical SEO audit

The repeatable crawler is `scripts/quality-audit/crawl.mjs`; raw route data is seo-crawl.json. It inspects server HTML rather than relying on hydrated UI alone.

- **Inventory:** 39 sitemap URLs covering the homepage, navigation/privacy/workflows, eight comparisons, 20 live tools, and six additional format routes. No route added in this refinement.
- **HTTP and links:** all 39 return 200; no broken internal page links discovered in their server-rendered anchors. `/remove-background/` redirects with 308 to its established slashless URL. Unknown and HEIC URLs return 404/noindex.
- **Metadata:** all have unique titles and descriptions, a self-referencing canonical, and one H1. Canonical conventions and sitemap registration are preserved. Several descriptive titles are long; this is a possible search-result truncation issue, not a crawling failure.
- **Robots:** production behavior remains conditional on the existing environment helper. Both `/share` and `/share/manage` are noindex/nofollow/noarchive and absent from the sitemap; unconfigured cloud services were not activated. Development/preview indexability rules were not changed.
- **Server rendering:** useful page copy and internal navigation are present in initial HTML. Processing UI and models load on demand.
- **Structured data:** no JSON-LD blocks were found in this crawl. There is no malformed JSON-LD to repair. Consider accurate WebApplication/BreadcrumbList markup in a separate evidence-led change; no invented ratings or promises of FAQ rich results.
- **Headings:** one H1 per route; the full heading inventory is retained in the JSON for review. Tool controls use lower-level headings. No broad heading redesign was needed.
- **Mobile:** browser tests cover converter controls and core workflows; the new removal surface fits at 390 px. Physical iOS/Android and assistive-technology acceptance remain separate checks.
- **Speed/CWV:** the crawl records localhost response times, which are not field Core Web Vitals. No verified CrUX or Search Console field dataset was available. Keep model/runtime/ZIP code lazy; prioritize real mobile LCP/INP measurements before changing sitewide bundles. No ranking or traffic prediction is made.

### Format-page value and overlap

| Family | Distinct useful intent | Risk / action |
|---|---|---|
| PDF to JPG vs PNG | Smaller photographic page previews versus lossless text/diagrams | JPG copy was too generic; tightened its H1 and compression-specific explanation. Shared page engine remains. |
| SVG to PNG vs JPG | Alpha overlays/icons versus mandatory background-filled JPEG | Tightened PNG heading and alpha/use-size explanation. SVG security limitations stay explicit. |
| WebP to PNG vs JPG | Preserve decoded alpha/lossless re-encoding versus compatibility and chosen matte | Existing unique benefits/limitations and tested defaults retained. |
| PNG to JPG vs JPG to PNG | Flatten alpha and reduce photographic size versus avoid another lossy encode | Content explains that PNG does not recover lost JPEG detail or create transparency. |
| Converter hub vs format routes | Choose a workflow versus arrive with a specific source/target | Hub links to functional routes; no spelling-only JPEG duplicates. |
| Blur vs Redact | Manual concealment versus reviewed sensitive-region suggestions | Keep the security distinction explicit; do not market blur as irreversible redaction. |

Shared UI and format words alone would not justify separate pages. These pages have real output constraints, format-specific guidance and working conversion behavior. Monitor query-to-page performance in Search Console before consolidating or adding routes.

### Competitor comparisons

Reviewed official sources, not competitor output-quality assumptions. Shotexa is identified as the publisher on all comparison pages. Removed fixed Xnapper/CleanShot prices that could become stale; users can consult current plans. Corrected the Pika processing claim to explicitly unverified, optional watermark language, Shotexa perspective capability, and Pika's team/capture strengths. Clarified that Shotexa motion is preview-only while Shots.so offers animated exports. Unlisted competitor functions are described as unlisted rather than categorically impossible.

Primary evidence: [Pika product](https://pika.style/) and [plans](https://pika.style/pricing), [Shots.so](https://shots.so/), [Xnapper](https://xnapper.com/), [CleanShot](https://cleanshot.com/), [Snagit](https://www.techsmith.com/snagit/), [FreeConvert](https://www.freeconvert.com/image-converter), [Convertio](https://convertio.co/image-converter/), [iLovePDF PDF to JPG](https://www.ilovepdf.com/pdf_to_jpg). The FreeConvert/Convertio/iLovePDF pages already explain broader format/PDF capabilities and published retention claims; Shotexa is not presented as a complete PDF suite. No new side-by-side competitor processing benchmark was run or claimed.

## 6. Keyword evidence and priorities

Source: six repository CSVs in `docs/v2.1/keyword-research/`, 600 rows and 499 normalized distinct keywords. Extracted evidence retains duplicate occurrence counts without summing them.

| Exact keyword | CSV Impressions |
|---|---:|
| pdf to jpg | 1,500,744 |
| pdf to png | 164,719 |
| svg to png | 43,874 |
| svg to jpg | 7,665 |

These are **Bing Keyword Research CSV Impressions**, not Google monthly searches, not Shotexa's own search impressions, and not a traffic forecast. Export period, market and filters were not recorded alongside the CSVs. Repeated rows are not additional demand.

The supplied dataset does not establish exact demand for background/signature removal, transparent PNG maker, WebP/JPG/PNG pairs, screenshot beautifier/mockups/watermarks, privacy blur, or target-size compression. Their priority here comes from user feedback and existing functional fit, not invented volumes. Google Trends could not be retrieved through the available research tool; no Search Console property data was available.

Priorities: (1) improve and validate the existing background-removal page for the demonstrated signature need; (2) retain useful PDF/SVG pages supported by the CSVs; (3) improve discovery of already-working conversion/compression/branding tools; (4) gather query-level Search Console and field performance evidence. Do not create more routes until there is a distinct workflow and evidence of need. Target-size compression already exists and should be explained within its current tool; QR reading and additional codecs remain outside this sprint.

## 7. Tests and local reproduction

Test status is updated after the final runs below. Earlier failures and their diagnoses are retained in logs rather than counted as passing tests.

- TypeScript: `npx tsc --noEmit` passed (exit 0; `typescript-final.log`).
- ESLint: `npm run lint` passed (exit 0; `lint-final.log`).
- Unit suite: final **56 files / 816 tests passed**, using `npm run test -- --maxWorkers=2` (137.76 seconds). An earlier unrestricted run overlapped the build and exceeded a metadata-fuzz timing assertion; the complete bounded run passed without changing assertions.
- Production build: final build passed, 53 generated pages.
- HEIC guard: final build passed, 1,686 emitted/public files scanned.
- Broad Chromium/WebKit regression: **210 passed, 26 skipped, 0 failed, 0 flaky** in 34.3 minutes. See `regression-run.log` and `regression-results.json`. This run preceded the final ink-loop optimization, transformed-trim/native-preview test adjustment and final content rebuild; the focused production rerun below verifies the changed removal surface.
- Final focused background-removal run: all **14 new quality cases passed** across Chromium/WebKit; the original six Chromium cases also passed. The combined run finished with **21 passed, one WebKit handoff timeout, four not run** (`background-final.log`, `background-final-results.json`). A diagnostic rerun then hit the original five-second initial-canvas readiness assertion before removal began (`background-webkit-confirmation.log`).
- Bounded-readiness WebKit confirmation: **6 passed, 0 failed** in 6.7 minutes (`background-webkit-final.log`, `background-webkit-final.json`). All **26 distinct focused cases** are now covered by passing runs. This is not a claim that the initial combined run was clean. The final harness changes passed scoped ESLint, and TypeScript was rerun successfully afterward.
- `git diff --check`: passed (exit 0). Existing Windows line-ending warnings do not indicate whitespace errors.

The local-only `playwright.quality.config.ts` initializes rejected analytics consent. It fixes the known local test-environment problem (Vercel analytics script 404 / delayed consent panel), without changing app consent or masking application console errors. Consent-specific tests should continue using the normal config. Browser preview/export parity is checked on native-size fixtures at DPR 1; earlier comparisons incorrectly mixed a 1024-pixel display proxy or WebKit's default DPR 2 with native export pixels. A development-only mobile failure coincided with Fast Refresh fully reloading the page after an ink-code edit and clearing its session workspace; final tests run against a stable production build.

The local QA config now allows 30 seconds for assertion readiness; the legacy model-to-Beautifier test separately allows up to 60 seconds and records handoff latency. Pixel, URL, artifact and ZIP assertions are unchanged. These adjustments address observed timing instability on this audit machine, not a measured production speed improvement; no routing or workspace application code was changed for them.

The diagnostic handoff completed in **8,567 ms**, exceeding the old five-second assertion while retaining the output in Beautifier. This confirms delayed navigation in that rerun, not lost workspace data. It is a local performance limitation to review on actual devices; it is not counted as a universal fast-navigation result.

The broad run's 26 skips include intentionally disabled HEIC coverage, an opt-in screenshot capture, and existing WebKit exclusions for heavier OCR/PDF/workspace workflows. English/Hindi OCR, cancellation/retry, multipage PDF and several continuation chains passed in Chromium; their WebKit skips are not claimed as passes. Clipboard PNG write/read pixels were checked in Chromium only; WebKit coverage checks download and continuation. Physical mobile devices, Word/LibreOffice clipboard insertion, field CWV and customer reference-file reproduction remain unverified.

Run:

```powershell
npx tsc --noEmit
npm run lint
npm run test -- --maxWorkers=2
npm run build
node scripts/check-v21-no-heic.mjs
npx next start -p 3101
# In a second terminal:
$env:E2E_BASE_URL='http://localhost:3101'
npx playwright test -c playwright.quality.config.ts src/tests/e2e/background-removal-production-quality.spec.ts src/tests/e2e/background-removal-production.spec.ts --project=chromium --project=webkit --workers=1
node scripts/quality-audit/crawl.mjs
git diff --check
```

For visual review, upload the synthetic fixture to `/remove-background`, choose **Signature / single-color mark**, run removal, switch preview surfaces, export PNG, and insert it over a colored background. Use **Objects & photos** for the astronaut fixture and inspect the remaining hair/background limitations. Export before continuing into another tool; the result card refers to the last exported artifact.

## 8. Files, privacy, performance and readiness

Changed removal files: core `types`, `ink` (new), `render`; existing worker protocol/background worker; runtime method selection/artifact mask metadata; removal tool, inspector and stage. Added ink unit tests, transformed-trim regression, browser quality tests, synthetic fixture, local-only QA config and repeatable audit scripts. SEO/content changes are limited to existing tool descriptions, converter headings, compression guidance and older comparison pages. Existing uncommitted V2.1/V2.2/V2.3 and SEO-expansion work was preserved.

The existing ONNX model and its distribution/license arrangement are unchanged. The new method uses browser Canvas and TypeScript only. No images are sent to an external processing API. Temporary bitmaps/canvases are released; model work remains cancellable through worker termination. Full-resolution masks cost one byte per pixel plus temporary decoded/canvas buffers; the single-ink guard caps this new path at 16 MP. Object inference, OCR and large exports remain device-dependent.

Baseline signature inference took 18,528 ms plus 11,992 ms model loading in its captured run. Single-ink runs needed no model download; the latest browser timing is retained in `screenshots/alpha-results.json`. These are illustrative local runs under changing machine load, not a controlled cross-device speed claim. The algorithms serve different input classes; the main measured improvement is the correct alpha/stroke result.

The same 1200 × 480 fixture was also measured in five sequential Node pixel-processing runs before and after removing per-pixel temporary arrays. Median CPU time fell from 377.9 ms to 157.4 ms (about 58%). See `ink-benchmark-before.json`, `ink-benchmark-after.json`, and `scripts/quality-audit/benchmark-ink.ts`. This excludes browser decode/render and ran under variable machine load; it is not a device-wide performance guarantee.

**Readiness: GO for local product review.** The reproduced export-clipping defect is fixed, the synthetic signature output is measurably improved, all 26 focused cases have passing coverage, and the build/static/unit/HEIC checks pass. The 210-pass broad suite and final 39-page SEO crawl provide additional regression evidence. No commit, push, merge, deployment or cloud activation was performed.

This is not a production-release certification. The customer's specific opaque-checkerboard file still requires private-file inspection. Photo halos, display-proxy resampling, observed local WebKit readiness delays, skipped heavier WebKit cases and physical-device/document-app validation remain limitations. Do not claim general remove.bg equivalence or universal removal accuracy. Review the before/after exports and these limits before a release decision.

The final build is available for local review at `http://localhost:3101/remove-background` while the QA server is running. The usual port 3100 and existing production settings were not changed.
