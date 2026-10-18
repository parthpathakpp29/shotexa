# HEIC decoder distribution review

Reviewed 17 October 2026 for Shotexa V2.1. This is a technical inventory and proposed release checklist, not a legal determination. **HEIC-enabled deployment remains NO-GO pending qualified license and patent review.**

## Exact installed payload

| Layer | Evidence | License and distribution implication |
| --- | --- | --- |
| `heic-to` 1.6.6 | Lockfile resolves the npm tarball with integrity `sha512-PYpOtPFEzgPxIoGF4LQ+oBD8o/tMvcFDNynrNzK1fLXfE6mTe2W+AHOvBKc5MwnVak4/Pnb51g9CJAtWL5YGWA==`; package declares no production npm dependencies. | Declares LGPL-3.0. The exact package is now pinned instead of accepting later 1.x releases without a notice/source review. |
| Generated `libheif-without-unsafe-eval.js` | 3,323,355 bytes, SHA-256 `D6AD000A632567EF3B8FF13063FDAA0D6B9FA3A51F49F2E91AA15C994965ADE8`. Its header identifies libheif 1.23.6, `USE_UNSAFE_EVAL=0`, libde265 1.0.16. | libheif is LGPL-covered native code compiled with Emscripten. The package includes generated JS, not its C/C++ sources. |
| HEVC codec | The [libheif Emscripten build](https://github.com/strukturag/libheif/blob/v1.23.6/build-emscripten.sh) links `libde265.a` statically by default. The [heic-to 1.6.6 build instructions](https://github.com/hoppergee/heic-to/blob/v1.6.6/README.md) specify libde265 1.0.16. | libde265 is also LGPL-covered. No runtime npm dependency record captures this embedded native library. |
| Browser distribution | Shotexa imports `heic-to/csp` lazily. Its CSP distribution file is 3,151,186 bytes, SHA-256 `F6657AA9470A6068E6E59713818C8BFE21882365FCEAC77C597F9B0BFED3E0C8`. A local production build placed it in a roughly 3.15 MB content-hashed chunk. | `heic-to`'s esbuild process embeds the compiled decoder in the worker JavaScript string, then embeds that string in the application-loaded JS module. The worker is created from a Blob URL. |
| WASM distinction | Upstream's published instructions use `USE_WASM=0`. The generated JS contains a `WebAssembly` compatibility shim with `isWasm2js:true`; the package does not ship a separate `libheif.wasm`. | Treat this as compiled **JavaScript**, not an independently swappable WASM binary. The mention of `WebAssembly` in generated code does not prove a distinct WASM payload. |

The [libheif 1.23.6 README](https://github.com/strukturag/libheif/blob/v1.23.6/README.md) and [libde265 1.0.16 README](https://github.com/strukturag/libde265/blob/v1.0.16/README.md) identify the libraries and their LGPL terms. The libheif build defaults to libde265 enabled and AOM, OpenJPEG, WebCodecs and uncompressed codec disabled. That strongly identifies libde265 as the HEVC dependency, but the exact compile flags and Emscripten toolchain used to create the npm-shipped file are not independently reproducible from the package. Upstream confirmation or a reproducible rebuild is needed before claiming the *complete* corresponding source inventory. The build may also contain Emscripten runtime code with its own notices; those need a generated-payload review.

The delivered LGPL file is the installed package's `LICENSE` (SHA-256 `DBD7222D8026E5D6CA6991D1E6A205DE927F300840433C2E90A60644A9980C75`). The newly delivered GPLv3 file is a complete GNU GPLv3 copy from the locally installed Git distribution (SHA-256 `3972DC9744F6499F0F9B2DBF76696F2AE7AD8AF9B23DDE66D6AF86C9DFB36986`). Both texts and the component notices were served with HTTP 200 by the fresh local production build. The GPL copy should still be checked against the [FSF's canonical text](https://www.gnu.org/licenses/gpl-3.0.txt) during final legal review.

## LGPL-3.0 conditions to resolve

[LGPLv3 §4](https://www.gnu.org/licenses/lgpl-3.0.html) requires, for a combined work, terms that permit modification of the library portion and reverse engineering to debug those modifications, plus:

1. Prominent notice that the library is used under LGPL (§4a).
2. Copies of both the LGPLv3 supplement and GNU GPLv3 (§4b), and library copyright notices in a work displaying notices (§4c).
3. **Either** Minimal Corresponding Source plus Corresponding Application Code sufficient and permitted to recombine/relink against a modified library (§4d0), **or** a suitable shared-library mechanism that works with an interface-compatible modified replacement supplied on the user's system (§4d1).
4. Installation Information if GPLv3 §6 makes it applicable (§4e). The actual distribution model and any technical restrictions require review.

The original HEIC page linked only the package's LGPL text and generic upstream home page. This pass added the complete GPLv3 copy, component/version notices, source-tag pointers and on-page links. They address notice and license-copy gaps. **They do not satisfy or prove §4d, complete source conveyance, or installation rights.** The production chunk inlines the decoder, and a modified `libheif` or `libde265` cannot simply be substituted for a separate library file. A dynamic `import()` of `heic-to/csp` is only code splitting; it is not evidence of the LGPL's suitable shared-library mechanism.

Potential compliant paths for counsel to approve:

- **§4d0:** provide the exact corresponding sources for `heic-to`, libheif, libde265 and any incorporated build/runtime pieces, the precise toolchain/build scripts and modifications, plus application code or linkable artifacts and instructions/license terms that genuinely let a recipient rebuild and run Shotexa with a modified decoder. Test this with a harmless library modification in a clean environment. Determine whether app code disclosure or separately buildable application artifacts are needed; do not assume a repository homepage satisfies this.
- **§4d1:** redesign the decoder as a separately loaded library with a stable interface and a user-operable, compatible replacement path. Verify the replacement actually works in a production build and review CSP, supply-chain and security implications. Merely extracting the same minified worker into another hashed chunk is insufficient.
- **Alternative:** obtain separate commercial permissions for the full embedded library chain, or use another decoder only after confirming its native/transitive codec licensing and equivalent browser coverage.

HEVC may also carry patent licensing obligations separate from open-source copyright terms. Qualified legal review must cover intended jurisdictions and distribution. This document does not determine patent status.

## Permissive-alternative check

- [`heic2any`](https://github.com/alexcorvi/heic2any) advertises an MIT wrapper but embeds libheif. The [libheif maintainer explicitly challenged its license treatment](https://github.com/alexcorvi/heic2any/issues/59). It is not a verified permissive replacement.
- [`@su-engineering/heic`](https://github.com/su-engineering/heic-web) is MIT for its native/WebCodecs core, but its cross-browser fallback uses `libheif-js` under LGPL. Without that fallback it reports unsupported files on browsers without native HEVC decoding; this cannot replace the current Chromium/WebKit coverage on present evidence.
- [`hevc.js`](https://github.com/lid-labs/hevc.js) advertises an MIT HEVC video decoder, but an HEVC bitstream decoder alone is not a proven HEIF still-image container/transform/color/orientation decoder. Its maintenance, patent position, image fidelity and transitive dependencies would all need separate qualification and browser tests.
- `libheif-js`, `heic2any`, and other wrappers around libheif/libde265 do not become permissive because the wrapper's own package metadata says MIT.

No actively maintained, independently verified permissive decoder was found that preserves the current private browser conversion, HEIF support and quality in the tested browsers. Do not switch on license metadata alone.

## Release gate and evidence to retain

1. Obtain the **exact** sources and build recipe that correspond to the npm-shipped generated JS, including the libde265 source and Emscripten/runtime notices. Record hashes and confirm any local or upstream modifications.
2. Choose and validate §4d0 or §4d1 with an actual modified-library rebuild/replacement test. Confirm user rights and any Installation Information duty.
3. Have qualified counsel approve open-source and HEVC patent distribution terms before enabling the public HEIC route.
4. After that approval, retest the exact release artifact in Chromium and WebKit and on a low-memory phone; keep the pinned package, license files, source archive/build record and output inspection with the release.

Current code and local tests establish conversion behavior, not legal compliance. No commit, push, merge or deployment was performed.
