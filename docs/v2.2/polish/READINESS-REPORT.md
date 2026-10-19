# Shotexa V2.2 UX polish readiness report

**Branch:** `codex/shotexa-v2-2`  
**Review state:** Local changes only; no commit, push, merge, or deployment.  
**Date:** 19 October 2026

## What changed

- Watermark uploads and Brand Kit logos now enter the existing transient asset registry as resources. They stay available to the Beautifier renderer and pack exports without becoming screenshot tray items or pack candidates. Clearing the workspace releases these resource assets.
- Repeated text and logo watermarks now offer **Screenshot only** and **Entire canvas** coverage. A newly enabled repeat starts with 18% opacity, a slight diagonal angle, and screenshot coverage. Existing saved layers without a coverage setting retain their previous full-canvas behavior.
- The Beautifier inspector now presents Templates, Brand Kit, and Watermark Stamp Pro together near the top. The existing static branding section explains when to use an anchored logo versus an editable watermark. Screenshot Packs retain shared pack controls and per-image editing in the existing workspace.
- Brand Kit image bytes are stored in IndexedDB as array buffers and restored to browser-local blobs on load. This fixes an observed WebKit IndexedDB `UnknownError` when storing a `Blob` directly and reads legacy Blob records.
- Workspace production-style tests now account for the local Vercel Insights script being unavailable and dismiss the existing consent banner before mobile interaction. Product analytics settings were not changed.

## Before and after

The **Northstar** SaaS dashboard, mobile screen, and transparent logo are synthetic local fixtures. The UI captures and downloads are from the running Shotexa application. No image was sent to an external service.

| View | Before | After |
| --- | --- | --- |
| Watermark editor | [Logo appears as screenshot 3; heavy full-canvas repeat](before/watermark-desktop.png) | [Two screenshots; subtle screenshot-clipped repeat](after/watermark-desktop.png) |
| Screenshot Packs desktop | [Before](before/pack-desktop.png) | [After](after/pack-desktop.png) |
| Screenshot Packs mobile | [Before](before/pack-mobile.png) | [After](after/pack-mobile.png) |

Additional views: [Brand Kit](after/brand-kit.png), [mobile editing](after/mobile-editing.png), [mobile pack controls](after/pack-mobile-controls.png), and [pack render results](after/pack-results.png).

## Real browser exports

- [Screenshot-only repeat](exports/watermark-screenshot-only.png) and [full-canvas repeat](exports/watermark-entire-canvas.png): pixel checks confirm coverage outside the screenshot is absent in the first export and present in the second.
- [Transparent logo export](exports/watermark-transparent-logo.png): transparent source pixels preserve the underlying screenshot while opaque logo pixels render visibly.
- [Desktop pack image](exports/pack-saas-desktop.png), [mobile pack image](exports/pack-saas-mobile.png), and [two-image ZIP](exports/northstar-pack.zip): downloaded from Shotexa's browser UI. The ZIP entries were decoded and checked as PNG files.

## Workflow and quality checks

- Uploaded two differently sized screenshots, then a transparent logo. The logo did not increase the screenshot count. Applied repeated marks in both coverage modes and compared preview and export pixels.
- Saved a Brand Kit containing the transparent logo, reloaded the page, applied the kit to a two-image pack, adjusted one image independently, and exported both images and a ZIP.
- Exercised mobile watermark editing, Undo and Redo, pack controls, and horizontal-overflow checks at a 390 px viewport.
- The shared Beautifier layout and painter remain the preview/export path. Tiling uses the layout's rendered screenshot bounds, so output resolution scales the placement with the screenshot.
- Processing remains local. Uploaded screenshots are session assets; only an explicitly saved Brand Kit writes selected branding assets to IndexedDB. Pack rendering remains sequential.

## Test results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run test` | Passed: 53 files, 800 tests |
| `npm run build` | Passed; Next production build `Wf96MtYkJ1BcItb0mmeWT` and postbuild HEIC exclusion guard |
| `node scripts/check-v21-no-heic.mjs` | Passed separately; 1,570 emitted/public files and dependency/route paths scanned without decoder signatures |
| Chromium and WebKit V2.2 Playwright, production build | Passed: 18/18 cases across both engines (11.2 min) |
| Chromium and WebKit V2.1 converter + workspace Playwright, production build | Passed: 22 cases; six intentional skips (four HEIC cases and two opt-in evidence captures) |
| Chromium and WebKit focused Beautifier parity/undo/mobile Playwright | Passed: 6/6 cases |
| `git diff --check` | Passed |

## Production-style workspace test diagnosis

The earlier strict browser-console assertion saw `/_vercel/insights/script.js` return 404 on localhost. That endpoint is provided by Vercel in deployment and is absent in the local build; this is a local test-environment condition. The test now ignores only that exact local script error. The mobile workspace test also clicked through an already-visible analytics consent banner; dismissing it in setup reflects the actual interactive page state. No evidence from those two failures indicated a workspace rendering or file-lifecycle defect. The full workspace suite now passes in Chromium and WebKit against the local production build.

## Limits and readiness

- Screenshots are realistic generated fixtures, not customer-owned SaaS captures or physical-device tests. Playwright WebKit is browser-engine coverage, not a test on physical Safari hardware.
- Screenshot-only repeat uses the rendered image bounds for a single screenshot and the content bounds for multi-image compositions. Tiling is optional; exports remain free of forced watermarks.
- Brand Kit persistence remains local to the browser and depends on available IndexedDB storage. Explicit errors are shown if storage fails.
- **Ready for user review.** The new V2.2 suite, V2.1 converter suite, workspace suite, and focused Beautifier parity/undo/mobile checks pass against the production build in both browser engines. This is local readiness, with no claim of physical-device or deployed-site verification.

## Local review

Run `npx next dev -p 3100`, then open `http://localhost:3100/screenshot-beautifier`. Upload the files in [fixtures](fixtures/), add a tiled watermark, save a Brand Kit with the transparent logo, create a two-image pack, and compare the downloads in [exports](exports/). Run `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx playwright test` for the relevant V2.2 and regression specs.
