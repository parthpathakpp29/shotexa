# Shotexa release readiness — V2.1 to V2.3 Phase A

## Separated release-candidate verification — 22 October 2026

The audit below records the earlier mixed D:\shotexa checkout. The isolated D:\shotexa-release-candidate branch has 91 unstaged release changes (57 tracked edits and 34 new files), with all original changes and deferred Phase B preserved in the local backup. Its current gates passed: 55 unit files / 809 tests, TypeScript, ESLint, a 51-page production build, the postbuild HEIC exclusion guard, and a 39-URL production crawl. Focused Chromium/WebKit release checks passed 88 cases with 6 intentional skips; original-tool smoke passed 20/20. An optional 260-case broad browser sweep was interrupted after four failures; focused reruns and a test-selector correction did not reproduce a functional defect, but the complete sweep has not passed. Cloudflare Worker code, share routes, upload UI, Wrangler dependencies and scripts are absent from the candidate; /share, /share/manage, and both HEIC routes returned 404/noindex. The mixed-tree figures of 816 unit tests, 53 pages, and installed Wrangler below are historical and do not describe this candidate. Production remains NO-GO pending Vercel Preview and physical-device review.

**Audit date:** 21 October 2026 (IST)
**Checkout:** `D:\shotexa`, `codex/shotexa-v2-3` at `12d54bd` plus local changes
**Decision:** **GO for a Vercel Preview candidate after a reviewed, scoped Git snapshot; NO-GO for production today.** No commit, push, merge, deployment, cloud resource, billing, or production setting was changed by this audit.

This document records local source/build/browser evidence. It does not certify the live Vercel deployment, a physical phone, or a Cloudflare service. Earlier implementation reports are useful provenance, but current checks below take precedence.

## 1. Complete feature inventory

| Scope | Current implementation and evidence | Classification |
| --- | --- | --- |
| V2.1 PDF to JPG/PNG | Shared PDF page picker, bounded local rendering, individual page output and ZIP. Existing JPG route and new PNG route retain rendered images in the workspace. | READY locally |
| V2.1 SVG to PNG/JPG | Passive SVG validation, raster output, transparent PNG or filled JPG, dimensions/background controls; active content rejected. | READY locally |
| V2.1 Beautifier Studio | 18 original procedural backgrounds, 12 templates and visual polish use the common layout/draw/render path. | READY locally |
| V2.2 Watermark Stamp Pro | Optional text/image watermark, shared preview/export painter; no mandatory mark. | READY locally |
| V2.2 Local Brand Kit | Explicitly saved settings/assets in IndexedDB, restored in the browser. Uploaded screenshots remain transient. | READY locally |
| V2.2 Screenshot Packs | Sequential bounded per-image rendering, individual downloads and ZIP, progress/cancellation. | READY locally |
| V2.3 Phase A Smart Privacy Guard | Optional local face suggestions, sensitive text and Indian-style plate-text clues, editable boxes, manual fallback, reviewed flattened metadata-cleaned image and Copy PNG. Detection is advisory; Blackout is the privacy choice for secrets. | READY locally, detector accuracy NEEDS REVIEW on devices |
| SEO expansion | Six format pages (`/pdf-to-png`, `/svg-to-jpg`, `/webp-to-png`, `/webp-to-jpg`, `/png-to-jpg`, `/jpg-to-png`); three comparison pages (FreeConvert, Convertio, iLovePDF); existing alternatives and `/convert-screenshot` hub. | READY locally |
| Quality improvements | Signature/single-color ink extraction, real alpha, shared background preview/export composition, clipping fix, artifact-based Copy PNG and honest compression guidance. | READY for tested fixtures; diverse photo edges NEED REVIEW |
| Original tools | Stitch, combine, editor, annotate, OCR, PDF, searchable PDF, metadata, compare, batch, compression and background remover remain in the route/runtime registry and unit suite. Focused browser regression is reported below. | NEEDS REVIEW for any original flow not covered by this browser run |
| HEIC | No public route or decoder in emitted/public files. Historical code/evidence remains deferred. | DEFERRED |
| Cloudflare Safe Share Links Phase B | Worker/R2/D1/Turnstile source and UI code retained locally, but the creation component is disconnected from Privacy Guard; `/share` and `/share/manage` return 404 and `noindex`; the client build has no Cloudflare upload/Turnstile signature. No cloud resource was provisioned. | DEFERRED — must not be activated |

**READY locally** means implementation and selected automated checks support a Preview candidate, not that production has been verified. Phase C review/collaboration remains proposal-only.

## 2. Production-ready release scope

The intended release is V2.1, V2.2, V2.3 Phase A, the listed SEO routes, and the quality fixes. Local image processing, exports, asset registry, workspace continuation, and optional GA consent remain the common architecture. Current changes remove Cloudflare upload claims from public site metadata, privacy copy, social image, analytics consent text, and converter comparison copy. The local Privacy Guard tool keeps its existing “Safe Share” naming for **downloadable redacted copies**; it offers no cloud link action.

## 3. Deferred and blocked scope

- **HEIC:** keep decoder, route, navigation, sitemap, and public bundle excluded. Do not restore historical HEIC files without a separate license, browser support, memory and real-device review.
- **Cloudflare Phase B:** keep `cloudflare/safe-share/`, `src/components/share/`, `src/components/tools/redaction/share-link-creator.tsx`, `src/core/share/`, Phase B tests, and the Phase B report as future source only. A future release must deliberately reconnect UI and routes after architecture, paid CPU, abuse, retention, privacy, and owner approval. Public env variables alone cannot reenable this candidate.
- Do not activate Workers, R2, D1, Turnstile, a Worker domain, or paid service. The original mixed checkout included local Phase B scripts and Wrangler **dev** dependencies. The separated release candidate excludes those package/lockfile changes.
- Automatic face and plate suggestions cannot guarantee complete detection. Photo hair/complex-edge masking, physical Safari/low-memory Android behavior, and clipboard behavior in Word/LibreOffice need review.

## 4. Git branch and commit assessment

At the initial audit, the branch had **64 modified tracked files, 150 untracked files, and no staged files**. `HEAD` is `12d54bd` (V2.2), preceded by `6499e67` (V2.1). V2.3 Phase A/B, SEO expansion and quality work are predominantly uncommitted. Local `origin/main` is `8210aa9`; `origin/main...HEAD` shows **6 remote-only and 8 branch-only commits**. The remote-only side is merge history with no file-content delta from the common ancestor in the local ref, so no overlapping source edits were found in that comparison. This is **not** a guarantee about an unfetched remote or an actual merge result. No fetch/merge/rebase was done.

Do not stage the entire tree. `debug.log` is untracked (1,200 bytes) and should be inspected/left out. The untracked evidence includes a 792 KB public-domain face fixture and three 536–627 KB screenshots; the numerous quality/SEO report logs and screenshots need intentional selection. `.env*`, `.wrangler/`, `.dev.vars*`, build outputs, test results and vendor copies are ignored; no `.env*` file was present in this checkout. Preserve evidence that demonstrates actual exports, but omit redundant screenshots and generated logs from the release snapshot. No real Cloudflare account/database ID or secret was found in the reviewed configuration; `wrangler.toml` uses local placeholders.

## 5. Security and privacy findings

**Release-blocking issue found and fixed locally:** Phase B's creation control and routes were previously reachable if public Cloudflare variables were configured. The control is now absent from the active redaction module, while Phase B component code remains for future work. Both share routes call Next.js `notFound()` unconditionally, return HTTP 404 with `noindex`, and are absent from the sitemap. The local production `.next/static` scan found no Turnstile script, share-upload action, or share API URL signature. No Next.js share API route exists. This is a code-level fail-closed gate; the Worker is separate source and has not been deployed.

The Phase A export path flattens redactions into pixels and strips metadata before publishing a reviewed workspace artifact. Its optional OCR/face checks run locally. SVG validation rejects active/external constructs. Current tests cover invalid SVG, real export bytes, alpha, and workspace continuation. Manual review remains essential because pattern/face detection can miss content, and blur/pixelation may not conceal secrets as strongly as opaque Blackout.

Consent tests cover no GA tag before acceptance, rejection/persistence, URL sanitization, and Vercel analytics behavior in the local test environment. Collector delivery and live production consent behavior remain Preview/production checks.

## 6. SEO audit

A crawl of the local production server derived **39 intended indexable URLs from `sitemap.xml`**. All 39 returned HTTP 200, had one H1, a canonical, a title and description, and no invalid structured-data JSON; there were no broken internal links. Titles, descriptions and H1 text were distinct across all 39. The six focused converter routes and three comparison routes are present, while the established `/convert-screenshot` hub and previous alternative URLs remain. This verifies route output and basic duplication signals, not search-engine indexing or content originality by itself.

`/heic-to-jpg`, `/heic-to-png`, `/share`, and `/share/manage` each returned HTTP 404 plus `noindex`; none is in the sitemap. `robots.txt` allows production public routes, disallows spikes and `/share/`, and names the canonical sitemap. The older `/remove-background/` form gives a 308 to `/remove-background`. Production host/canonical correctness must be checked again on Preview and the actual domain, because this crawl used the default `https://shotexa.com` canonical setting.

The comparison copy distinguishes Shotexa's narrower local conversion from competitor cloud tools and iLovePDF's wider PDF suite. On 21 October, official pages still supported FreeConvert's stated eight-hour deletion, Convertio's input/output retention description, and iLovePDF page-to-JPG versus embedded-image extraction and desktop option: [FreeConvert privacy](https://www.freeconvert.com/privacy), [Convertio retention](https://support.convertio.co/hc/en-us/articles/360004419173-File-retention-policy-and-privacy-concerns), [iLovePDF PDF to JPG](https://www.ilovepdf.com/pdf_to_jpg), [iLovePDF desktop](https://www.ilovepdf.com/desktop). Recheck these temporally changing claims before a later publication if the release is delayed.

Format pages have task-specific explanations, limitations, related links and controls. Their text is relatively concise (the shortest converter body in the local crawl is about 241 words); monitor search performance rather than adding pages or speculative copy now. No JSON-LD script was found in the crawled pages. Structured data can be evaluated later only for accurately represented, visible content and eligible schema types. Mobile converter/comparison layouts are in the focused browser suite. Local response timings are not Core Web Vitals; measure LCP/INP/CLS and asset transfer on Vercel Preview before production.

## 7. Testing results

| Gate | Original mixed-tree audit result (21 October) |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS again after final source and test edits |
| `npm test` | PASS — 56 files, 816/816 unit tests |
| `npm run build` | PASS on the final working tree — 53 static pages. Build includes Next.js TypeScript validation. |
| `node scripts/check-v21-no-heic.mjs` | PASS as build poststep — 1,676 emitted/public files, no decoder signatures. |
| Production-route/SEO crawl | PASS again on the final built server — 39 sitemap pages, no broken links/issues; HEIC and share paths 404/noindex. |
| Chromium/WebKit focused release regression | Initial run: **95 passed, 6 skipped, 3 failed** out of 104. Two workspace failures were local Analytics 404 assertions caused by using `127.0.0.1`; both exact cases passed on `localhost` without code/test changes. The logo brush case failed at redo pixels, then passed in both browsers after the test selected the canvas toolbar brush, waited for its mode, and asserted the initial stroke changed pixels. The pixel assertions were retained and strengthened. The full 104-case matrix was not repeated after that test correction. |
| Original-tool Chromium/WebKit smoke | **21 passed, 3 explicit skips** out of 24 using the local production QA config. Covered batch ZIP, editor crop/mobile, target-size compression, OCR, PDF export/pagination, cross-tool continuation and lazy loading. Skips: WebKit mixed English/Hindi OCR and two long cross-tool chains. |
| Dependency advisory check | `npm audit --omit=dev --offline --audit-level=high` found 0 cached production advisories. Offline cache data is not a live advisory check. |
| `git diff --check` and staged equivalent | PASS at final review; no files are staged. The new untracked report was also checked for unintended trailing whitespace. |

The focused browser selection covers background removal quality, V2.1 conversion, SEO routes, V2.2 watermark/Brand Kit/Packs, V2.3 Phase A, legacy local redaction, workspace and analytics consent. The added smoke set covered original tool flows. The homepage lazy-load check measured 15 initial scripts, 759.5 KB raw / 233.8 KB gzip, plus 78.6 KB prefetch in this local build, and observed no heavy engine/model loaded before use; no previous identical measurement was available to calculate a regression. Deferred Phase B cloud-link browser tests are intentionally **not** part of the release gate. A full Playwright matrix, live collector telemetry, physical iOS/Android and real Vercel Preview have not run here.

## 8. Remaining issues and release blockers

1. **Production blocker:** no Vercel Preview review of the exact scoped Git snapshot, actual host/canonicals, headers, download bytes, consent/network, mobile layout, and analytics delivery.
2. **Production blocker:** physical low-memory Android and iPhone/Safari testing of PDF, face fallback, Brand Kit, Packs, background removal, and download/ZIP/clipboard behavior remains outstanding. Automated WebKit is not a device test.
3. **Git scope blocker:** Phase B code and its package dependencies are intermingled with uncommitted release work. Build the release snapshot using an explicit include list and separately preserve the Cloudflare work before committing anything. Exclude `debug.log` and review evidence size/content.
4. Final production build, crawl, lint and whitespace checks pass. The initial browser matrix was not repeated in full after the brush-test correction; its three failures and exact reruns remain recorded above. Any genuine regression is a blocker; do not adjust tests merely to make a gate green.
5. Background-removal photo edges and optional face/plate recall remain product limitations requiring user review, not claims of automated privacy assurance. The earlier quality report could not diagnose the reported customer checkerboard file without the original input/output.

## 9. Recommended Git steps — after owner review only

These are instructions for a later authorized release operation, **not actions taken by this audit**.

1. Re-run `git status --short`, `git diff --check`, and inspect every changed/untracked file. Copy the complete working tree to a safe local backup if needed before selective staging; do not use `git add -A`.
2. Preserve Phase B in a separate reviewed branch/worktree or patch **including untracked files** (`cloudflare/safe-share`, share components/core/routes/tests, Phase B docs and package/lockfile changes). Verify its saved tree before removing any Phase B file from the release checkout. Never discard it via reset/clean.
3. Starting from the reviewed V2.2 commit, stage only V2.3 Phase A, SEO, quality, release guard/copy, selected fixtures/reports, and this report by explicit path. Keep Phase B Worker, client components, share routes/tests, Wrangler scripts/dependencies, `debug.log`, redundant captures and generated logs out of the release commit. Review `git diff --cached --stat`, `git diff --cached --check`, client bundle, and build from the **exact staged candidate**.
4. Compare that scoped candidate with the current `origin/main` ref and refresh the ref only when network/Git operations are approved. Review the six remote-only merge commits, any new changes, and an actual conflict preview. Decide whether to merge/rebase/cherry-pick only after that review. Do not merge automatically.
5. Once the owner approves the snapshot and Git actions, commit/push a `codex/` release branch, open a reviewed Preview PR, and keep the separate Phase B branch private/deferred. Do not deploy from a mixed working tree.

## 10. Vercel Preview checklist

- [ ] Build the exact scoped commit; compare its manifest/sitemap against this 39-URL inventory and verify that all existing indexed routes remain.
- [ ] Confirm `/share`, `/share/manage`, HEIC paths and any Worker API address are unreachable; no Turnstile network request or upload action appears even with accidental share env variables.
- [ ] Check 200/308/404 statuses, self canonicals, Preview `noindex`, robots, OG image, H1 and internal links on desktop/mobile.
- [ ] Inspect actual downloaded PNG/JPG/PDF/ZIP bytes, alpha, dimensions, redaction flattening and metadata; continue output into Editor/Beautifier/Packs.
- [ ] Test first-use model loading, memory/cancellation, Brand Kit reload, mobile safe areas and accessible controls in Chromium, Safari and physical phones.
- [ ] Verify GA only after consent, Vercel Analytics URL hygiene, no screenshots/OCR/finding data in requests, and production telemetry configuration.
- [ ] Run a performance trace on representative mobile hardware/network; check LCP, INP, CLS, JS/model transfer and memory rather than relying on local response time.

## 11. Production deployment checklist

- [ ] Owner approves the reviewed scoped commit and confirms Cloudflare/HEIC deferral, branch/PR review, rollback target and release window.
- [ ] Preview gates above pass; CI/tests green on the exact commit; known issues are accepted explicitly.
- [ ] Confirm Vercel environment values and canonical domain without adding Cloudflare values; check billing/infrastructure unchanged.
- [ ] Deploy through the normal approved Vercel path, then smoke test key routes and downloaded artifacts on the live host.
- [ ] Monitor errors, conversion/export failures, consent/analytics behavior and Core Web Vitals for the agreed observation period. Roll back to the prior deployment if a critical tool fails, private bytes leave the browser unexpectedly, share creation becomes reachable, HEIC appears, or indexed routes/canonicals regress.
- [ ] Save release evidence and reconcile Search Console/sitemap after deployment; do not infer indexing from a successful local crawl.

## 12. Final recommendation

**Preview candidate: conditional GO. Production: NO-GO today.** The scoped local application is promising and the Cloudflare activation path has been closed, but documented browser exceptions, explicit Git separation, Vercel Preview, and physical-device verification are required before a production release decision. Retain all Phase B work for a separate future approval.
