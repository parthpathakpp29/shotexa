/**
 * Markdown fixture table for docs/spikes/SPIKE_E_METADATA_PRIVACY.md (Node engine + browser
 * decode results from metadata-browser-*.json).
 *   npx tsx scripts/spikes/metadata/fixture-table.ts
 */
import jpeg from "jpeg-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { cleanBytes, inspectBytes, verifyBytes } from "../../../src/core/metadata/engine-core";
import { walkPng } from "../../../src/core/metadata/png";

const FIX = join(process.cwd(), "src", "tests", "fixtures", "metadata");
const OUT = join(process.cwd(), "docs", "spikes", "results");
const manifest: { id: string; file: string; format: string; description: string }[] = JSON.parse(readFileSync(join(FIX, "manifest.json"), "utf8"));
const browsers = ["chromium", "firefox", "webkit"].filter((b) => existsSync(join(OUT, `metadata-browser-${b}.json`)));
const bres = Object.fromEntries(browsers.map((b) => [b, JSON.parse(readFileSync(join(OUT, `metadata-browser-${b}.json`), "utf8")).results.fixtures.fixtures as Record<string, unknown>[]]));

function nodePixels(format: string, a: Uint8Array, b: Uint8Array): string {
  if (format === "jpeg") {
    const x = jpeg.decode(Buffer.from(a), { useTArray: true });
    const y = jpeg.decode(Buffer.from(b), { useTArray: true });
    return Buffer.compare(Buffer.from(x.data), Buffer.from(y.data)) === 0 ? "✅" : "❌";
  }
  if (format === "png") {
    const x = PNG.sync.read(Buffer.from(a.subarray(0, walkPng(a).iendEnd)));
    const y = PNG.sync.read(Buffer.from(b));
    return Buffer.compare(x.data, y.data) === 0 ? "✅" : "❌";
  }
  return "n/a";
}

console.log("| Fixture | In → out bytes | Privacy metadata found | Preserved | Pixels equal (Node · Chromium · Firefox · WebKit) | Dims | Orientation | Verified |");
console.log("|---|---:|---|---|---|---|---|---|");
for (const f of manifest) {
  const a = new Uint8Array(readFileSync(join(FIX, f.file)));
  const ins = inspectBytes(a);
  const r = cleanBytes(a);
  const v = verifyBytes(r.output, { original: a });
  const cats = [...new Set(ins.privacyFindings.map((p) => p.category))];
  const preserved = [...new Set(ins.preservedMetadata.map((m) => m.container.replace(/^PNG |^WebP /, "")))];
  const bpx = browsers.map((b) => {
    const x = bres[b].find((y) => y.id === f.id) as { pixelsEqual: Record<string, boolean>; orientationKept: boolean } | undefined;
    return x ? (Object.values(x.pixelsEqual).every(Boolean) ? "✅" : "❌") : "—";
  });
  const orient = ins.orientation && ins.orientation > 1 ? `${ins.orientation} → ${inspectBytes(r.output).orientation ?? "lost"}` : "—";
  console.log(
    `| ${f.id} | ${a.length} → ${r.output.length}${r.changed ? "" : " (unchanged)"} | ${cats.join(", ") || "none"} | ${preserved.join(", ") || "—"} | ${nodePixels(f.format, a, r.output)} · ${bpx.join(" · ")} | ${v.dimensionsMatch ? "✅" : "❌"} | ${orient} | ${v.passed ? "✅" : "❌"} |`,
  );
}
