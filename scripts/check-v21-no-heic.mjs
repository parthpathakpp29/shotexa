/** Verify the HEIC decoder is absent from a completed V2.1 production build. */
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
if (packageJson.dependencies?.["heic-to"] || packageJson.devDependencies?.["heic-to"]) failures.push("heic-to remains in package.json");
if (lock.packages?.["node_modules/heic-to"] || lock.packages?.[""]?.dependencies?.["heic-to"]) failures.push("heic-to remains in package-lock.json");
if (existsSync(join(root, "src/app/(workspace)/heic-to-jpg/page.tsx"))) failures.push("HEIC App Router page remains public");

const buildRoot = join(root, ".next");
const outputRoots = [join(buildRoot, "static"), join(buildRoot, "server"), join(root, "public")];
if (!existsSync(join(buildRoot, "BUILD_ID"))) failures.push("Missing completed production BUILD_ID");
for (const outputRoot of outputRoots) if (!existsSync(outputRoot)) failures.push(`Missing output directory: ${relative(root, outputRoot)}`);

const signatures = ["heic-to", "libheif", "libde265", "isWasm2js", "HEIF image not found", "HEIC-NOTICES"];
const longest = Math.max(...signatures.map((value) => value.length));
let filesScanned = 0;

async function scanFile(path) {
  filesScanned++;
  const name = relative(root, path).replaceAll("\\", "/");
  if (/heic-to|HEIC-NOTICES|\/heic\./i.test(name)) failures.push(`HEIC asset path: ${name}`);
  let tail = "";
  for await (const chunk of createReadStream(path)) {
    const text = tail + chunk.toString("latin1");
    for (const signature of signatures) {
      if (text.includes(signature)) failures.push(`Decoder signature ${signature} in ${name}`);
    }
    tail = text.slice(-(longest - 1));
  }
}

async function scanTree(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scanTree(path);
    else if (entry.isFile()) await scanFile(path);
  }
}

if (existsSync(buildRoot)) {
  for (const entry of readdirSync(buildRoot, { withFileTypes: true })) {
    if (entry.isFile()) await scanFile(join(buildRoot, entry.name));
  }
}
for (const directory of outputRoots) await scanTree(directory);
if (failures.length) {
  console.error(`HEIC release check failed (${filesScanned} emitted/public files scanned):`);
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`HEIC release check passed: dependency, route, and ${filesScanned} emitted/public files contain no decoder signatures.`);
}
