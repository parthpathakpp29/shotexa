/**
 * Self-hosts heavy processing libraries under stable, versioned URLs (architecture §53).
 * They are fetched only when a tool needs them — never bundled into app chunks.
 * Runs automatically before `dev` and `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
// public/vendor is generated and git-ignored, so it is rebuilt from scratch every time. Left
// in place it accumulates: a dependency bump, or a change in which files a runtime needs,
// otherwise leaves the previous version's assets behind — dead weight in any deployment built
// from a cached workspace, and a confusing second copy when debugging which asset loaded.
rmSync(join(root, "public", "vendor"), { recursive: true, force: true });
const nm = (p) => join(root, "node_modules", p);
const version = (p) => JSON.parse(readFileSync(nm(`${p}/package.json`), "utf8")).version;
const copy = (from, toDir, name) => {
  mkdirSync(join(root, "public", toDir), { recursive: true });
  copyFileSync(nm(from), join(root, "public", toDir, name));
};
const copyLocal = (from, toDir, name) => {
  mkdirSync(join(root, "public", toDir), { recursive: true });
  copyFileSync(join(root, from), join(root, "public", toDir, name));
};

// OpenCV.js (Smart Stitch)
const cvVersion = version("@techstark/opencv-js");
const cvFile = `opencv-${cvVersion}.js`;
copy("@techstark/opencv-js/dist/opencv.js", "vendor/opencv", cvFile);

// Tesseract.js (OCR): worker script, LSTM-only cores (plain/SIMD/relaxed-SIMD; the worker
// picks one by feature detection), and LSTM-only ("best_int") language models.
const tjs = version("tesseract.js");
const tcore = version("tesseract.js-core");
const tDir = `vendor/tesseract/${tjs}`;
const coreDir = `vendor/tesseract-core/${tcore}`;
const langVersion = "4.0.0_best_int";
const langDir = `vendor/tessdata/${langVersion}`;
copy("tesseract.js/dist/worker.min.js", tDir, "worker.min.js");
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  copy(`tesseract.js-core/${f}`, coreDir, f);
}
for (const lang of ["eng", "hin"]) copy(`@tesseract.js-data/${lang}/${langVersion}/${lang}.traineddata.gz`, langDir, `${lang}.traineddata.gz`);

// Background Remover: U²-Net-P weights (Apache-2.0) plus the matching ONNX
// Runtime Web JSEP loader/binary pair used by both WebGPU and WASM providers.
// They remain static, same-origin assets and are fetched only after removal starts.
const ortVersion = version("onnxruntime-web");
const ortDir = `vendor/onnxruntime/${ortVersion}`;
for (const f of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) copy(`onnxruntime-web/dist/${f}`, ortDir, f);
const bgDir = "vendor/background-removal/u2netp-v1";
copyLocal("src/assets/models/u2netp.onnx", bgDir, "u2netp.onnx");
copyLocal("src/assets/models/U2NET-LICENSE.txt", bgDir, "LICENSE.txt");

// Searchable PDF: a compact OFL font containing Basic Latin + Devanagari. Kept outside
// public/vendor (which is generated and ignored) and copied only for local same-origin use.
copyLocal("src/assets/fonts/Hind-Regular.ttf", "vendor/pdf", "Hind-Regular.ttf");
copyLocal("src/assets/fonts/Hind-OFL.txt", "vendor/pdf", "OFL.txt");

writeFileSync(
  join(root, "src/config/vendor-assets.json"),
  JSON.stringify(
    {
      opencv: { url: `/vendor/opencv/${cvFile}`, version: cvVersion },
      tesseract: {
        version: tjs,
        coreVersion: tcore,
        workerPath: `/${tDir}/worker.min.js`,
        corePath: `/${coreDir}`,
        langPath: `/${langDir}`,
        languages: ["eng", "hin"],
      },
      searchablePdf: {
        fontPath: "/vendor/pdf/Hind-Regular.ttf",
        fontLicensePath: "/vendor/pdf/OFL.txt",
      },
      backgroundRemoval: {
        model: "U2NETP",
        modelVersion: "u2netp-v1",
        modelBytes: 4574861,
        modelSha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
        modelPath: `/${bgDir}/u2netp.onnx`,
        modelLicensePath: `/${bgDir}/LICENSE.txt`,
        runtime: "onnxruntime-web",
        runtimeVersion: ortVersion,
        runtimePath: `/${ortDir}/`,
        runtimeModulePath: `/${ortDir}/ort-wasm-simd-threaded.jsep.mjs`,
        runtimeWasmPath: `/${ortDir}/ort-wasm-simd-threaded.jsep.wasm`,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(`vendor assets: opencv ${cvVersion}, tesseract ${tjs} (core ${tcore}), tessdata ${langVersion}, background U2NETP + onnxruntime-web ${ortVersion}`);
