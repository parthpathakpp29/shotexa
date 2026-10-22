# Shotexa V2.1 release candidate without HEIC

Prepared 18 October 2026 on `codex/shotexa-v2-1`. This candidate retains PDF-to-JPG/PNG, SVG-to-PNG/JPG, Beautifier Studio and the existing workspace tools. HEIC conversion is deferred pending the separate licensing and mobile-memory review in [HEIC-LICENSE-RELEASE.md](./HEIC-LICENSE-RELEASE.md). No commit, push, merge, preview deployment or production deployment was performed.

## Release boundary

- `/heic-to-jpg` has no App Router `page.tsx` and must return 404. It is absent from the tool registry, navigation groups, continuations, sitemap, metadata and educational content. No redirect to a different converter is intended.
- The live PDF/SVG converter has no HEIC branch or decoder import. `heic-to` is absent from `package.json` and `package-lock.json`, so a clean production install cannot resolve it as a direct dependency.
- HEIC route, engine, former shared UI, registry/content snippets and notices are preserved in [deferred-heic](./deferred-heic/RESTORE.md). HEIC Playwright cases and fixtures remain available but the cases are skipped for this candidate.
- License texts specific to the deferred decoder are outside `public/`. They are source archive material, not assets for this release.

## Verification evidence

The completed local production build lists 42 static routes, including PDF, SVG and Beautifier, with no HEIC route. `postbuild` runs the decoder/asset scanner automatically, so `npm run build` now fails if a HEIC route, dependency or emitted decoder signature returns. These checks apply to the **local** build; the eventual Vercel Preview output and served assets must be checked again after an authorized deployment.

| Gate | Result |
| --- | --- |
| TypeScript | `npx tsc --noEmit` passed after regeneration of stale Next dev route types |
| ESLint | `npm run lint` passed |
| Unit tests | `npx vitest run src/tests/unit` passed: 51 files, 794 tests |
| Production build | Final `npm run build` passed, including automatic `postbuild` HEIC scan; 42 static routes, with no `/heic-to-jpg` |
| Chromium/WebKit regression | Converter suite: 12 active tests passed, 6 intentional HEIC/capture skips. Beautifier, visual-polish and consent suite: 52 passed on the first run; 8 test-harness failures were diagnosed and all 8 passed on a fresh targeted rerun in both browsers. The full 60-case suite was not repeated after those fixes. |
| Route, navigation and sitemap | Chromium/WebKit route checks passed; live HTTP check returned 404 for `/heic-to-jpg` and all three former license URLs, 200 with correct canonical URLs for the three retained tools; titles, descriptions, H1s, sitemap and rendered public pages contain no HEIC promotion |
| Dependency and emitted bundle scan | `postbuild` passed: package manifest/lock, route absence and 1,418 files in `.next` root, `.next/static`, `.next/server` and `public` checked for decoder signatures and asset paths |
| `git diff --check` | Passed after final code and documentation updates; new release files also have no trailing whitespace |

`node_modules/heic-to@1.6.6` remains **extraneous in this developer checkout** because the pre-deferral installation was not pruned. It is absent from `package.json`, `package-lock.json`, the live application source, the production build's server traces and emitted assets. A clean install from the lockfile will not install it. The local directory is not a deployable asset, and was left untouched to preserve the ongoing checkout. The Preview checklist still requires direct inspection of the uploaded output.

The first Beautifier regression run exposed two local test-harness conditions: a plain `next start` server returns 404 for Vercel's `/_vercel/insights/script.js`, and the unchosen consent banner covers the mobile Settings button. The test now filters only that known localhost script 404 and chooses Reject before mobile editor interaction. The consent-specific tests remained unchanged and passed in both browsers. No analytics or consent application code was changed for this candidate.

PDF rendering is sequential, capped at 60 MB input, 80 pages and 24 megapixels per output page; page canvases are released. SVG input is capped at 2 MB and rejects active/external content. Beautifier previews use reduced backing size, while export chooses a single canvas or tiled PNG as permitted by the existing memory budget. These limits and browser tests reduce risk but do not replace a physical low-memory phone test.

## Vercel Preview checklist (after explicit approval to commit/push/deploy)

- [ ] Deploy the exact reviewed commit to a Vercel **Preview** environment. Record commit SHA, deployment URL and build ID. Do not promote a local dirty tree or a different commit.
- [ ] Confirm Preview remains `noindex` and `robots.txt` disallows crawling. Verify the preview's canonical host behavior against the existing site configuration without changing production canonical URLs.
- [ ] Confirm `/heic-to-jpg` and all three archived HEIC license URLs return 404. Check `/tools`, menus, footer, continuation actions, sitemap and rendered HTML for HEIC promotion.
- [ ] Download and inspect the Preview's served JavaScript and static assets. Search for `heic-to`, `libheif`, `libde265`, the old CSP decoder hash and any roughly 3 MB HEIC decoder chunk. Confirm no HEIC source map or public static asset is served. Check the Vercel output dependency trace for `node_modules/heic-to`.
- [ ] Convert a real multi-page PDF to PNG and JPG, select pages, download and inspect individual files and ZIP, then continue into Editor or Beautifier.
- [ ] Convert a safe SVG to transparent PNG and background-filled JPG, inspect dimensions, reject an SVG with active/external content, and continue the result into another tool.
- [ ] Exercise Beautifier templates, backgrounds, undo/redo and a high-resolution export. Compare preview and export; check desktop and mobile layouts.
- [ ] Repeat consent Reject and Accept network checks. Confirm no uploaded file contents, filenames or extracted text reach analytics or external processing endpoints.
- [ ] Check console/network errors and key workflows in Chromium and WebKit. Test an actual low-memory phone for PDF high-scale export and Beautifier stability; browser emulation alone does not measure device memory.
- [ ] Check preview sitemap, robots, status, titles, descriptions and canonicals for the remaining live routes. Confirm existing indexed production URLs are unchanged. After separate production approval, monitor errors, conversion failures and indexing; roll back on a broken export, leaked input or unexpected HEIC asset.

## Recommendation

**GO for an authorized Vercel Preview release candidate. NO-GO for production deployment today.** The local build and functional checks pass with HEIC omitted, but no Preview deployment or physical low-memory phone test has occurred. Complete the Preview checklist against the exact reviewed commit and output, then reassess production approval. HEIC remains excluded until its separate LGPL/relinking and mobile-memory review is resolved. No commit, push, merge or deployment was made during this preparation.
