# Shotexa SEO growth expansion — implementation report

**Release-candidate evidence note (22 October 2026):** The named browser screenshots, exports, and measurement files below are preserved in the local release archive outside Git. They are listed as evidence descriptions rather than links because they are not in this candidate.

Reviewed 20 October 2026 on `codex/shotexa-v2-3`. This work is local and uncommitted. No Cloudflare Safe Share resources or production settings were changed.

## Pages implemented

| Route | Distinct working experience | Format detail |
| --- | --- | --- |
| `/pdf-to-png` | Existing PDF page picker, resolution control, page preview, individual download and ZIP | PNG preselected; lossless page raster with clear text/vector limitations |
| `/svg-to-jpg` | Existing safe passive-SVG validator and rasterizer | JPG preselected; dimensions, quality and opaque background controls |
| `/webp-to-png` | Shared image encoder and temporary workspace | PNG preselected; decoded alpha preserved where present |
| `/webp-to-jpg` | Shared image encoder and temporary workspace | JPEG preselected; quality and transparency-fill controls |
| `/png-to-jpg` | Shared image encoder and temporary workspace | JPEG preselected; measured output size and background controls |
| `/jpg-to-png` | Shared image encoder and temporary workspace | PNG preselected; accepts JPEG files without a redundant `/jpeg-to-png` page |

All six have original task-specific explanations, limitations, FAQs, self canonicals, unique titles/descriptions and related-tool links. The raster pages reject a wrong source format without discarding the file. A completed output is a separate temporary workspace asset and can continue into Editor and other tools. The original PDF or SVG is held by its converter while that page is open; **only its rendered image result** enters the shared workspace.

The existing `/convert-screenshot` page now serves as the image converter hub, linking to the six focused workflows. Existing `/pdf-to-jpg`, `/svg-to-png` and screenshot tools retain their routes and behavior. `jpg-to-pdf` and `png-to-pdf` were deferred: `/screenshot-to-pdf` already accepts both, and separate pages would require a genuinely different source-specific PDF workflow to avoid thin duplication.

## Existing functionality reused

- `ConversionTool` and `core/conversion` for PDF page rendering and validated SVG rasterization. Its existing ZIP engine and `runtime.addConvertedImage` are reused.
- `EncodeTool`, `EncodeInspector`, `core/image-encode`, the Image Worker, and the workspace asset registry for PNG/JPEG/WebP. Source files stay unchanged.
- `ToolLanding`, `Uploader`, the `(workspace)` layout/provider, `ContinueWith`, static route metadata and the generated sitemap.
- No new image-processing library, cloud conversion service or HEIC decoder was added.

## Competitor comparisons

New original pages: `/alternatives/freeconvert`, `/alternatives/convertio`, and `/alternatives/ilovepdf`. Each names Shotexa as publisher, has a comparison table, explains when either product fits better, links to functional Shotexa workflows, and links to the competitor's official evidence. Claims were reviewed on 20 October 2026 and may change.

| Comparison | Shotexa advantage for the stated workflow | Competitor advantage shown fairly |
| --- | --- | --- |
| [FreeConvert](https://www.freeconvert.com/image-converter) | Browser-local conversion and immediate continuation into screenshot editing | Much wider format catalog, larger-file and advanced image options; FreeConvert states an eight-hour upload deletion window |
| [Convertio](https://convertio.co/image-converter/) | Browser-local screenshot formats and connected local editing | Broader conversion and cloud imports/batches; its [retention policy](https://support.convertio.co/hc/en-us/articles/360004419173-File-retention-policy-and-privacy-concerns) says inputs are removed after conversion and outputs within 24 hours |
| [iLovePDF](https://www.ilovepdf.com/pdf_to_jpg) | Select PDF pages, render local PNG/JPG and work with those images | Embedded-image extraction and a full PDF suite; its [desktop app](https://www.ilovepdf.com/desktop) offers a separate local option |

The `/alternatives` hub links to these pages and explains the PDF-suite distinction. There are no unsupported price comparisons and no claim that Shotexa edits PDF text, signs documents or extracts original embedded PDF images.

## Keyword evidence and remaining opportunities

The six existing local Bing Keyword Research exports in `docs/v2.1/keyword-research/` contain 600 rows and 499 distinct normalized queries. The deduplicated CSV value for `pdf to png` is **164,719** and for `svg to jpg` is **7,665**. These are the files' `Impressions` values with unknown saved date/country/device filters. They are **not** monthly Google search volume, Shotexa Search Performance impressions, traffic forecasts or difficulty scores. [Bing explains the distinction between Keyword Research and Search Performance](https://www.bing.com/webmasters/help/keyword-research-628070b6). No exact WebP/PNG/JPG format-pair demand figures or QR-reader figures were established from those exports. The focused routes were chosen for useful, different outputs and controls, not invented demand estimates.

| Opportunity | Decision |
| --- | --- |
| Image Converter Hub | Improve the existing `/convert-screenshot` hub; done. A second indexable hub would duplicate it. |
| Target-size image compression | Existing `/compress-screenshot` already measures and searches a target for JPEG/WebP. Improve that page from observed user needs before another route. PNG has no honest fixed-size guarantee. |
| QR Code Reader from Image | Privacy Guard can *detect* visual codes but does not expose a decoded reader result. Defer until a useful, safe local reader workflow exists and demand is verified. |
| Additional formats | Evaluate AVIF/GIF/BMP/TIFF only with verified browser/encoder support, safety limits and distinct demand. HEIC remains excluded due to unresolved LGPL compliance. |
| CloudConvert | [Official image catalog](https://cloudconvert.com/image-converter/) supports many more formats; a future comparison could be distinct if research reveals a useful Shotexa crossover. |
| iHatePDF | Ambiguous similarly named domains and broad PDF scope; confirm the intended product and a meaningful comparison before a page. |
| Shots.so / Pika | Existing comparison pages; do not duplicate them. |

## Technical SEO and UX

- Six format and three comparison routes are registered once in `STATIC_ROUTES`; sitemap entries derive from that registry. Existing canonical URL behavior and indexing controls remain.
- Format pages have a preselected export target and task-specific copy, benefits, limitations, FAQs and related links. The raster upload prompt names the required source format. Wrong-source files remain in the workspace with a clear warning.
- The comparison table scrolls within its container on narrow screens. No separate JPG/JPEG spelling pages were created.
- The pages use existing site styles and shared components; no extra converter bundles or network processing were introduced.

## Changed files for this expansion

`src/config/format-conversions.ts`, `src/config/converter-comparisons.ts`, six new `(workspace)` format route files, three new alternatives route files, `src/components/tools/conversion/{conversion-page,conversion-tool,format-education,raster-format-page}.tsx`, `src/components/tools/encode/{encode-tool,encode-inspector,encode-landing}.tsx`, `src/components/alternatives/comparison-page.tsx`, `src/components/workspace/{tool-landing,uploader}.tsx`, `src/config/routes.ts`, `src/app/(workspace)/alternatives/page.tsx`, route and encoder regression tests, `src/tests/e2e/seo-expansion.spec.ts`, and the WebKit test selector in `playwright.config.ts`.

## Browser evidence and real exports

The evidence was generated by Playwright against a local production build. The small color fixtures deliberately verify alpha, dimensions and JPEG fill; `documentation-screenshot.jpg` is converted from an existing documentation-style UI fixture. These are actual downloaded files, not mocked conversions.

| Feature | UI evidence | Export evidence |
| --- | --- | --- |
| PDF to PNG | Input, rendered result | PNG page |
| SVG to JPG | Input, rendered result | JPG image |
| WebP to PNG/JPG | PNG editor, JPG editor | PNG, JPG |
| PNG/JPG conversion | PNG to JPG, JPG to PNG | JPG, PNG, documentation example |
| Comparison pages | FreeConvert, Convertio, iLovePDF | — |
| Mobile | Converter, comparison | — |

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 55 files, 811 tests passed |
| `npm run build` | Passed; new routes prerendered |
| HEIC exclusion guard | Passed; no decoder signatures in 1,683 emitted/public files |
| Converter, encoder and new SEO E2E, Chromium/WebKit | 54 passed, 6 intentional skips (HEIC and an optional capture test) |
| Final-build SEO and sitemap E2E, Chromium/WebKit | 14 passed, including reset-to-page-format and sampled SVG background color |
| `git diff --check` | Passed; only local Git line-ending advisories |

The E2E tests check real downloaded file signatures, decoded dimensions, PNG alpha, JPEG background pixels, wrong-source handling, workspace continuation, metadata/canonicals, sitemap inclusion, HEIC exclusion and mobile width. Existing converter and encoder regression suites add further format and ZIP coverage. An initial encoder regression run hit the local Vercel Analytics script's expected 404 and a consent panel covering a lower-page button. The test now saves the explicit rejected preference before navigation; the full rerun passed. No application conversion defect was found from those failures.

## Local review

From `D:\shotexa`, run `npm install` if dependencies are missing, then `npx next dev -p 3100` and open `http://localhost:3100/pdf-to-png` or any route above. Upload a source matching the page name; inspect the output format, use the controls and download a file. For production-mode checks, run `npm run build`, then `npx next start -p 3101` and set `E2E_BASE_URL=http://localhost:3101` for Playwright. No Cloudflare binding is needed for these pages.

## Readiness recommendation

**Ready for local product review.** Review the new routes and comparison wording before any release. Browser automation covers Chromium and Playwright WebKit; it does not prove real-device Safari behavior or search ranking. HEIC and cloud sharing remain outside this expansion.
