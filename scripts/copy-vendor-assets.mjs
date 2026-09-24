/**
 * Self-hosts heavy processing libraries under stable, versioned URLs (architecture §53).
 * They are fetched only when a tool needs them — never bundled into app chunks.
 * Runs automatically before `dev` and `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nm = (p) => join(root, "node_modules", p);
const version = (p) => JSON.parse(readFileSync(nm(`${p}/package.json`), "utf8")).version;
const copy = (from, toDir, name) => {
  mkdirSync(join(root, "public", toDir), { recursive: true });
  copyFileSync(nm(from), join(root, "public", toDir, name));
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
    },
    null,
    2,
  ) + "\n",
);
console.log(`vendor assets: opencv ${cvVersion}, tesseract ${tjs} (core ${tcore}), tessdata ${langVersion}`);
