# Deferred HEIC converter source

This directory preserves the V2.1 HEIC work while the release candidate ships without the converter. The archived `*.ts.txt` and `*.tsx.txt` files contain the original source bytes; the `.txt` suffix keeps them outside TypeScript compilation and Next.js route discovery. The license/notice texts are retained here instead of in `public/`. The two HEIC Playwright cases and their fixtures remain in `src/tests/e2e/conversion-v21.spec.ts` and `src/tests/fixtures/conversion/`, with the cases skipped for this release.

No HEIC decoder or notice file from this directory belongs in a V2.1 production artifact.

## Re-enable after licensing and security approval

1. Restore `heic.ts.txt` to `src/core/conversion/heic.ts`, `heic-route.page.tsx.txt` to `src/app/(workspace)/heic-to-jpg/page.tsx`, and the pre-deferral conversion UI files to `src/components/tools/conversion/` (drop only the `.before-deferral` and final `.txt` suffixes). Merge later PDF/SVG changes rather than overwriting them blindly.
2. Re-add `heic-to` **1.6.6** to both dependency manifests, then reassess the package version, embedded libheif/libde265 versions, notices, source availability, library replacement and HEVC patent obligations. Do not publish the decoder on the strength of license files alone. The exact audit is in `../HEIC-LICENSE-RELEASE.md`.
3. Restore the three text files under `public/licenses/`. Restore the HEIC item in `ToolId`, `TOOLS`, and `TOOL_CONTENT`, using the pre-deferral V2.1 design: name `HEIC to JPG`, route `/heic-to-jpg`, category `edit`, icon `convert`, JPG/PNG local batch and ZIP copy, and continuations `["editor", "beautify", "compress", "metadata", "pdf"]`. Restore `addConvertedImage`'s `producedBy` union.
4. Re-enable the two skipped HEIC Playwright cases; update registry and sitemap expectations in `src/tests/unit/workspace/routes.test.ts`; remove the temporary 404/discovery assertion. Repeat real file, ZIP, workspace, mobile and bundle tests before publishing.

The archived UI files and route contain the exact former tool copy and notice links. The old route and static license URLs intentionally return 404 in the no-HEIC release candidate.
