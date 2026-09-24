/**
 * Self-hosts heavy processing libraries under stable, versioned URLs (architecture §53).
 * They are fetched only when a tool needs them — never bundled into app chunks.
 * Runs automatically before `dev` and `build`.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "node_modules/@techstark/opencv-js/package.json"), "utf8"));
const file = `opencv-${pkg.version}.js`;
mkdirSync(join(root, "public/vendor/opencv"), { recursive: true });
copyFileSync(join(root, "node_modules/@techstark/opencv-js/dist/opencv.js"), join(root, "public/vendor/opencv", file));

writeFileSync(
  join(root, "src/config/vendor-assets.json"),
  JSON.stringify({ opencv: { url: `/vendor/opencv/${file}`, version: pkg.version } }, null, 2) + "\n",
);
console.log(`vendor assets: /vendor/opencv/${file}`);
