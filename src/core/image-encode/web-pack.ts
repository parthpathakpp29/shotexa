import type { FormatCandidate } from "./types";

export interface WebPackResult {
  blob: Blob;
  names: string[];
  markup: string;
}

export function pictureMarkup(alt = ""): string {
  const safeAlt = alt.replace(/["<>]/g, "");
  return `<picture>\n  <source srcset="image.webp" type="image/webp">\n  <img src="image.png" alt="${safeAlt}" width="auto" height="auto">\n</picture>\n`;
}

/** Build a deterministic local web pack from candidates already measured in the Convert UI. */
export async function createWebPack(candidates: readonly Pick<FormatCandidate, "format" | "blob" | "bytes">[], alt = ""): Promise<WebPackResult> {
  const webp = candidates.find((candidate) => candidate.format === "webp");
  const png = candidates.find((candidate) => candidate.format === "png");
  if (!webp || !png) throw new Error("WEB_PACK_CANDIDATES_MISSING");
  if (webp.bytes + png.bytes > 96 * 1024 * 1024) throw new Error("WEB_PACK_TOO_LARGE");
  const markup = pictureMarkup(alt);
  const html = new Blob([markup], { type: "text/html;charset=utf-8" });
  const entries = [
    { name: "image.webp", input: webp.blob, size: webp.blob.size, lastModified: new Date(0) },
    { name: "image.png", input: png.blob, size: png.blob.size, lastModified: new Date(0) },
    { name: "picture-snippet.html", input: html, size: html.size, lastModified: new Date(0) },
  ];
  const { downloadZip } = await import("client-zip");
  const metadata = entries.map(({ name, size }) => ({ name, size }));
  return { blob: await downloadZip(entries, { metadata }).blob(), names: entries.map((entry) => entry.name), markup };
}
