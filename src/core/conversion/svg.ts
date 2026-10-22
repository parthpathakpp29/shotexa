import { assertRasterSize, encodeCanvas, releaseCanvas, type RasterFormat } from "./raster";

const NS = "http://www.w3.org/2000/svg";
const ELEMENTS = new Set(["svg", "g", "defs", "linearGradient", "radialGradient", "stop", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "clipPath"]);
const ATTRS = new Set(["xmlns", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform", "gradientUnits", "gradientTransform", "offset", "stop-color", "stop-opacity", "id", "clip-path", "font-size", "font-family", "font-weight", "text-anchor", "preserveAspectRatio"]);
const URL_REF = /^url\(#[A-Za-z_][\w.-]*\)$/;

/** Rebuild a passive SVG from an allowlist. Never attach the uploaded DOM to the app. */
export function sanitizeSvg(input: string): { svg: string; width: number; height: number } {
  if (input.length > 2_000_000 || /<!\s*(DOCTYPE|ENTITY)/i.test(input)) throw new Error("This SVG contains unsupported declarations or is too large.");
  const parsed = new DOMParser().parseFromString(input, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== NS || parsed.querySelector("parsererror")) throw new Error("This is not a valid SVG.");
  const clean = document.implementation.createDocument(NS, "svg", null);
  const copy = (node: Element, parent: Element, depth: number): void => {
    if (depth > 64 || !ELEMENTS.has(node.localName) || node.namespaceURI !== NS) throw new Error(`Unsupported SVG element: ${node.localName}.`);
    const next = depth === 0 ? parent : clean.createElementNS(NS, node.localName);
    for (const attr of Array.from(node.attributes)) {
      if (attr.name === "xmlns") continue;
      if (attr.namespaceURI || !ATTRS.has(attr.name) || /[<>]/.test(attr.value)) throw new Error(`Unsupported SVG attribute: ${attr.name}.`);
      if (/(?:url\(|@import|https?:|data:|javascript:|\\)/i.test(attr.value) && !(attr.name === "fill" || attr.name === "stroke" || attr.name === "clip-path") ) throw new Error("SVG external or active references are unsupported.");
      if (["fill", "stroke", "clip-path"].includes(attr.name) && /url\(/i.test(attr.value) && !URL_REF.test(attr.value)) throw new Error("Only local SVG color and clip references are supported.");
      if (/url\(|https?:|data:|javascript:/i.test(attr.value) && !URL_REF.test(attr.value)) throw new Error("SVG external resources are unsupported.");
      next.setAttribute(attr.name, attr.value);
    }
    if (depth > 0) parent.appendChild(next);
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) copy(child as Element, next, depth + 1);
      else if (child.nodeType === Node.TEXT_NODE && (node.localName === "text" || node.localName === "tspan")) next.appendChild(clean.createTextNode(child.textContent ?? ""));
    }
  };
  copy(root, clean.documentElement, 0);
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const lengthInPixels = (value: string | null) => value && /^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*(?:px)?\s*$/.test(value) ? Number.parseFloat(value) : 0;
  // Percentage and physical-unit lengths need a viewport. Use viewBox dimensions
  // instead of parseFloat("100%"), which would distort a common responsive SVG.
  const width = lengthInPixels(root.getAttribute("width")) || (viewBox?.length === 4 ? viewBox[2] : 0);
  const height = lengthInPixels(root.getAttribute("height")) || (viewBox?.length === 4 ? viewBox[3] : 0);
  assertRasterSize(width, height);
  clean.documentElement.setAttribute("width", String(width));
  clean.documentElement.setAttribute("height", String(height));
  return { svg: new XMLSerializer().serializeToString(clean.documentElement), width, height };
}

export async function convertSvg(svg: string, width: number, height: number, format: RasterFormat, background = "#ffffff", quality = 0.92): Promise<Blob> {
  assertRasterSize(width, height);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    if (format === "jpg") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    return await encodeCanvas(canvas, format, quality);
  } catch {
    throw new Error("This SVG could not be rasterized in this browser.");
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
    releaseCanvas(canvas);
  }
}
