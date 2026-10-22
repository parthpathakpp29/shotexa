# Shotexa V2.1 implementation report

**Release-candidate update (18 October 2026):** This report records the original V2.1 implementation. The current [release candidate](./RELEASE-CANDIDATE-NO-HEIC.md) defers HEIC conversion and preserves its source under `deferred-heic/`; PDF, SVG and Beautifier remain in the candidate.

## 1. Features implemented

- HEIC/HEIF to JPG or PNG: up to 20 files, JPG quality control, per-file progress/errors, individual downloads, and a ZIP. The converter checks HEIF dimensions before decoding and preserves the decoder's orientation.
- PDF to JPG or PNG: page thumbnails, page selection, four resolution choices, sequential exports, individual downloads, and a ZIP. Password-protected and malformed files have explicit errors.
- SVG to PNG or JPG: passive SVG preview, width/height controls with aspect locking, transparent PNG, a JPG background color, and local raster export.
- Converted rasters enter the temporary workspace and can continue into Editor, Beautifier, Compress, Privacy Clean, and other existing tools without another upload.

## 2. Existing functionality reused

- The route/tool registry drives navigation, sitemap inclusion, metadata, and continuations.
- The existing asset registry and workspace runtime own generated blobs, previews, and disposal.
- The shared ZIP creator supplies download names and size limits.
- Beautifier thumbnails use `beautifyLayout` and `drawBeautified`, the same layout/drawing path as the main preview and export. Existing presets and advanced controls remain available.
- The existing consent-gated, allowlisted analytics system handles the new routes through registered tool IDs. No file data is supplied to it.

## 3. Files added or modified

Core converters: `src/core/conversion/{heic,pdf-images,raster,svg}.ts`.

UI and pages: `src/components/tools/conversion/{conversion-page,conversion-tool}.tsx`, three `src/app/(workspace)/<route>/page.tsx` files, `src/components/tools/beautify/studio-gallery.tsx`, and `src/components/tools/beautify/beautify-inspector.tsx`.

Configuration/integration: `src/core/beautify/studio-library.ts`, `src/core/runtime/runtime.ts`, `src/config/{tools,tool-content}.ts`, `src/components/workspace/tool-education.tsx`, `package.json`, `package-lock.json`, and `public/licenses/heic-to-LGPL-3.0.txt`.

QA/artifacts: `src/tests/e2e/conversion-v21.spec.ts`, `src/tests/unit/workspace/routes.test.ts`, `src/tests/fixtures/conversion/`, `playwright.config.ts`, and `docs/v2.1/screenshots/`.

## 4. New routes

- `/heic-to-jpg` (also exports PNG)
- `/pdf-to-jpg` (also exports PNG)
- `/svg-to-png` (also exports JPG)

## 5. Conversion technologies

- `heic-to` 1.6.6, loaded only after choosing a HEIC/HEIF file. Its CSP build decodes into `ImageBitmap`; Canvas encodes JPG/PNG. [Source](https://github.com/hoppergee/heic-to).
- Existing `pdfjs-dist` 4.10.38, moved to a production dependency and loaded only when a PDF is chosen. Its local worker renders pages into Canvas.
- Native DOMParser, a strict SVG allowlist rebuild, Blob URLs, and Canvas rasterization.
- The existing ZIP engine packages multiple results.

## 6. Security measures

- Inputs stay in the browser. Uploaded bytes, filenames, PDF text, and SVG markup are not sent to conversion services or analytics.
- SVG scripts, event handlers, style sheets, embedded images, external URLs, data URLs, `foreignObject`, and unsupported elements/attributes are rejected before preview. Uploaded markup is never mounted in the app DOM.
- File/size limits: HEIC 25 MB and 20 files; PDF 60 MB and 80 pages; SVG 2 MB; raster canvas 24 million pixels and 16,384 pixels per side. PDF selected batches are capped at 80 million output pixels.
- Object URLs, canvases, PDF pages/documents, and decoded `ImageBitmap`s are released when no longer needed.

## 7. Beautifier library

- Twelve original procedural backgrounds across Cosmic, Abstract, Editorial, Nature, Glass, Minimal, Soft, Dark, and Studio collections.
- Eight visual templates for launches, social campaigns, product displays, documentation, app showcases, portfolios, developer work, and presentations.
- Existing classic recipes now have visual composition cards. Their controls and resulting renderer remain unchanged.

## 8. UI and UX changes

- Templates appear first in the inspector; background collections have category tabs and composition thumbnails rendered with the current screenshot. Heavy thumbnail drawing begins as cards approach the viewport.
- The converter upload surfaces, page selections, progress/error messages, result thumbnails, downloads, and continuation cards follow Shotexa's existing visual language.
- Existing advanced Beautifier controls, mobile settings sheet, and export actions remain available.

## 9. SEO changes

- Each new route has a distinct title, description, H1, canonical URL, instructions, supported-format notes, FAQs, and internal links.
- The production sitemap includes exactly the three completed new routes through the existing registry. Their canonical URLs were checked from the production server. Existing route canonicals were not edited.
- No separate near-duplicate PNG/JPG keyword pages were added.

## 10. Performance

- HEIC and PDF decoder code loads only on the corresponding tool route and after input selection; it is absent from homepage execution.
- HEIC dimensions are inspected before full decode. PDF output is rendered one page at a time; preview thumbnails are bounded to 240 pixels on the longest side.
- Batch output limits and cleanup bound peak memory. Browser limits can still be lower on individual mobile devices.

## 11. Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed; the final E2E test edit also passed focused ESLint.
- `npx vitest run src/tests/unit`: 50 files, 789 tests passed.
- `npm run build`: passed, 43 static pages generated, build ID `1Heqidm6DeuqmIyQ7K6iZ`.
- New-tool production Playwright: Chromium 7 passed; WebKit 6 passed and 1 screenshot-only case intentionally skipped. Real exported PNG/JPG bytes, dimensions, transparency, HEIC orientation, ZIP entries, invalid input, workspace continuation, and Beautifier preview/export pixels were inspected.
- Existing Beautifier regression Playwright on the development server: 8 passed across Chromium and WebKit, covering classic recipes, 3D, multiple images, preview/export parity, and mobile controls.
- Focused production consent/network regression: 4 passed across Chromium and WebKit, covering Reject and Accept behavior.
- `git diff --check`: passed.

An initial WebKit run hit two five-second assertion timeouts while the UI still showed normal conversion progress; longer completion waits passed on the full rerun. The older Beautifier suite reports a console 404 when run under plain local `next start` because that host does not serve Vercel's `/_vercel/insights/script.js`. Those behavior checks passed on the development server. Playwright WebKit is browser automation, not a physical Safari/iPhone test.

## 12. Remaining limitations

- Some HEIF codecs or container variants remain unsupported; users receive an explicit error.
- The SVG sanitizer intentionally accepts a narrow passive subset. SVGs using stylesheets, embedded images, filters, or external resources must be simplified before conversion.
- The stated size limits protect typical browser memory; low-memory phones may have tighter limits.
- No physical-device, signed-in, preview, or deployed-production verification was performed.

## 13. Deferred work

- No unrelated V2 features, production settings, analytics changes, commit, push, merge, or deployment were made.
- Before public release, review the `heic-to` LGPL-3.0 distribution obligations; the license text and upstream source link are included in the UI/repository.

## 14. Local testing instructions

From PowerShell in `D:\shotexa`:

```powershell
npx tsc --noEmit
npm run lint
npx vitest run src/tests/unit
npm run build
git diff --check
```

In one terminal, run `npx next start -p 3200`. In a second terminal:

```powershell
$env:E2E_BASE_URL = 'http://localhost:3200'
npx playwright test src/tests/e2e/conversion-v21.spec.ts --project=chromium --project=webkit
npx playwright test src/tests/e2e/analytics-consent.spec.ts --project=chromium --project=webkit --grep 'Vercel tracks before and after rejecting Google|Accept tracks one sanitized page view'
```

For the older Beautifier behavior suite, stop the production server, run `npx next dev -p 3100`, then in another terminal:

```powershell
$env:E2E_BASE_URL = 'http://localhost:3100'
npx playwright test src/tests/e2e/beautify-production.spec.ts --project=chromium --project=webkit --grep 'style recipes|V2.0A|preview shows|mobile:'
```

## 15. Review and deployment status

The implementation is ready for local review. Deployment remains unperformed and requires your approval. Check the LGPL release obligations and exercise the converters on target physical mobile devices before shipping.

## Screenshots

- [HEIC converter](screenshots/heic-to-jpg.png)
- [PDF converter](screenshots/pdf-to-jpg.png)
- [SVG converter](screenshots/svg-to-png.png)
- [Beautifier Studio](screenshots/beautifier-studio.png)
- [Beautifier backgrounds](screenshots/beautifier-backgrounds.png)
- [Inspected HEIC orientation output](screenshots/heic-orientation-export.png)
