/**
 * Spike E fixtures → src/tests/fixtures/metadata/{jpeg,png,webp}/ + manifest.json
 *
 *   npx tsx scripts/spikes/metadata-fixtures/generate.ts
 *
 * Pixels are procedural (Node). PNG via pngjs, JPEG via jpeg-js (both deterministic). WebP image
 * chunks come from Chromium's canvas encoder (lossy q0.85, lossless q1) and are re-wrapped into
 * containers built here. All metadata values are synthetic.
 */
import { chromium } from "@playwright/test";
import jpeg from "jpeg-js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  A, animatedWebp, ascii, cat, encodePng, exifApp1, FAKE, iCCP, iccApp2, iccProfile, iptcApp13, iTXt, jpegWith, makePixels, orientationOnlyExif, pngChunk, pngWith,
  privacyExif, riff, riffChunk, S, seg, tEXt, tiff, utf8, vp8x, WEBP_FLAG, webpChunks, xmpApp1, xmpPacket, zTXt, idatOf,
} from "./build";

const OUT = join(process.cwd(), "src", "tests", "fixtures", "metadata");
const W = 480;
const H = 320;
const OW = 240; // orientation fixtures: non-square
const OH = 160;

interface Expect {
  /** Privacy categories that inspection must report. */
  privacy?: string[];
  /** Containers that must survive cleaning. */
  preserved?: string[];
  noPrivacy?: boolean;
  orientation?: number;
  alpha?: boolean;
  animated?: boolean;
  thumbnail?: boolean;
  hiddenImage?: boolean;
}
interface Fixture {
  id: string;
  format: "jpeg" | "png" | "webp";
  file: string;
  width: number;
  height: number;
  description: string;
  expect: Expect;
}
const manifest: Fixture[] = [];
function put(format: Fixture["format"], name: string, bytes: Uint8Array, width: number, height: number, description: string, expect: Expect) {
  const ext = format === "jpeg" ? "jpg" : format;
  const file = `${format}/${name}.${ext}`;
  writeFileSync(join(OUT, file), bytes);
  manifest.push({ id: `${format}/${name}`, format, file, width, height, description, expect });
}

const jpg = (w: number, h: number, px: Uint8Array, q = 90) => Uint8Array.from(jpeg.encode({ data: Buffer.from(px), width: w, height: h }, q).data);

async function webpBases() {
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage();
  const enc = async (w: number, h: number, px: Uint8Array, q: number) => {
    const b64 = await page.evaluate(
      async ({ w, h, data, q }) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const bytes = Uint8ClampedArray.from(atob(data), (ch) => ch.charCodeAt(0));
        c.getContext("2d")!.putImageData(new ImageData(bytes, w, h), 0, 0);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/webp", q));
        const u = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const x of u) s += String.fromCharCode(x);
        return btoa(s);
      },
      { w, h, data: Buffer.from(px).toString("base64"), q },
    );
    // Keep only the image chunks (Chromium adds VP8X + an sRGB ICCP).
    return webpChunks(Uint8Array.from(Buffer.from(b64, "base64"))).filter((c) => ["VP8 ", "VP8L", "ALPH"].includes(c.id));
  };
  const r = {
    lossy: await enc(W, H, makePixels(W, H), 0.85),
    lossless: await enc(W, H, makePixels(W, H), 1),
    alpha: await enc(W, H, makePixels(W, H, { alpha: true }), 0.85),
    orient: await enc(OW, OH, makePixels(OW, OH), 0.85),
    frame0: await enc(160, 100, makePixels(160, 100, { variant: 0 }), 0.85),
    frame1: await enc(160, 100, makePixels(160, 100, { variant: 1 }), 0.85),
  };
  await browser.close();
  return r;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  for (const d of ["jpeg", "png", "webp"]) mkdirSync(join(OUT, d), { recursive: true });

  const px = makePixels(W, H);
  const pxA = makePixels(W, H, { alpha: true });
  const opx = makePixels(OW, OH);
  const baseJpg = jpg(W, H, px);
  const orientJpg = jpg(OW, OH, opx);
  // A distinct "uncropped original" thumbnail: it must never survive Privacy Clean.
  const thumb = jpg(96, 64, makePixels(96, 64, { variant: 5 }), 60);
  const p3 = iccProfile("Display P3 (Shotexa synthetic)", "p3");
  const xmp = xmpPacket();

  // ------------------------------------------------------------------ JPEG
  const J = (name: string, bytes: Uint8Array, desc: string, e: Expect, w = W, h = H) => put("jpeg", name, bytes, w, h, desc, e);
  J("clean", baseJpg, "JFIF only (jpeg-js)", { noPrivacy: true, preserved: ["APP0 JFIF"] });
  J("exif-gps", jpegWith(baseJpg, [exifApp1(privacyExif())]), "Full EXIF: GPS, make/model, serial, owner, dates, software, comments (little-endian)", { privacy: ["exif", "location", "device", "author", "software", "timestamp", "comment"] });
  J("exif-gps-be", jpegWith(baseJpg, [exifApp1(privacyExif({ le: false }))]), "Same EXIF, big-endian TIFF", { privacy: ["exif", "location", "device", "author"] });
  J("exif-thumbnail", jpegWith(baseJpg, [exifApp1(privacyExif({ thumbnail: thumb }))]), "EXIF with an IFD1 JPEG thumbnail of different content", { privacy: ["exif", "thumbnail", "location"], thumbnail: true });
  J("xmp", jpegWith(baseJpg, [xmpApp1(xmp)]), "XMP only (creator, tool, city, GPS, dates, document ID)", { privacy: ["xmp", "author", "location", "software"] });
  J("xmp-extended", jpegWith(baseJpg, [xmpApp1(xmp), seg(0xe1, cat(ascii("http://ns.adobe.com/xmp/extension/\0"), ascii("0123456789ABCDEF0123456789ABCDEF"), new Uint8Array(8), utf8(`<x:xmpmeta>${FAKE.artist}</x:xmpmeta>`)))]), "XMP + extended XMP segment", { privacy: ["xmp"] });
  J("icc", jpegWith(baseJpg, [exifApp1(privacyExif()), iccApp2(p3)]), "Display-P3 ICC profile + EXIF", { privacy: ["exif", "location"], preserved: ["APP2 ICC", "APP0 JFIF"] });
  J("comments", jpegWith(baseJpg, [seg(0xfe, ascii(FAKE.comment)), seg(0xfe, ascii(`${FAKE.artist} second comment`))]), "Two COM segments", { privacy: ["comment"] });
  J("iptc", jpegWith(baseJpg, [seg(0xed, iptcApp13())]), "Photoshop APP13 IPTC: by-line, city, country, caption", { privacy: ["iptc", "author", "location"] });
  {
    // JFIF with an 8×8 RGB thumbnail + a JFXX thumbnail segment.
    const noApp0 = cat(baseJpg.subarray(0, 2), baseJpg.subarray(4 + ((baseJpg[4] << 8) | baseJpg[5])));
    const jfif = seg(0xe0, cat(ascii("JFIF\0"), Uint8Array.from([1, 2, 0, 0, 1, 0, 1, 8, 8]), new Uint8Array(8 * 8 * 3).fill(200)));
    const jfxx = seg(0xe0, cat(ascii("JFXX\0"), Uint8Array.from([0x10]), thumb));
    J("jfif-thumbnail", cat(noApp0.subarray(0, 2), jfif, jfxx, noApp0.subarray(2)), "JFIF header thumbnail + JFXX thumbnail", { privacy: ["thumbnail"], preserved: ["APP0 JFIF"] });
  }
  J("mpf-appended", jpegWith(baseJpg, [seg(0xe2, cat(ascii("MPF\0"), ascii("MM\0*"), new Uint8Array(8)))], thumb), "MPF index + a second image appended after EOI", { privacy: ["hidden-image"], hiddenImage: true });
  J("trailing", jpegWith(baseJpg, [], ascii("SHOTEXA-FAKE-TRAILING appended private data")), "Text appended after EOI", { privacy: ["other"] });
  J(
    "kitchen-sink",
    jpegWith(baseJpg, [exifApp1(privacyExif({ thumbnail: thumb })), xmpApp1(xmp), iccApp2(p3), seg(0xed, iptcApp13()), seg(0xfe, ascii(FAKE.comment)), seg(0xe4, ascii("SHOTEXA-FAKE-VENDOR app data")), seg(0xeb, cat(ascii("JP"), new Uint8Array(6), ascii("jumbSHOTEXA-FAKE-C2PA manifest"))), seg(0xee, Uint8Array.from([0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1]))]),
    "EXIF(+GPS+thumbnail) + XMP + ICC + IPTC + COM + unknown APP4 + JUMBF/C2PA APP11 + Adobe APP14",
    { privacy: ["exif", "xmp", "iptc", "comment", "thumbnail", "location", "private-app", "provenance"], preserved: ["APP2 ICC", "APP14 Adobe", "APP0 JFIF"], thumbnail: true },
  );
  for (const o of [1, 2, 3, 5, 6, 7, 8]) J(`orientation-${o}`, jpegWith(orientJpg, [exifApp1(orientationOnlyExif(o))]), `EXIF Orientation ${o} + camera make`, { privacy: ["exif", "device"], orientation: o }, OW, OH);
  J("orientation-minimal-6", jpegWith(orientJpg, [exifApp1(tiff({ ifd0: { 0x0112: S(6) } }))]), "Orientation-only EXIF (already clean)", { noPrivacy: true, orientation: 6 }, OW, OH);
  J("duplicate-exif", jpegWith(baseJpg, [exifApp1(privacyExif()), exifApp1(privacyExif({ le: false }))]), "Two EXIF APP1 segments", { privacy: ["exif", "location"] });
  J("malformed-exif", jpegWith(baseJpg, [exifApp1(cat(ascii("II*\0"), Uint8Array.from([0xff, 0xff, 0, 0]), ascii(FAKE.make)))]), "EXIF APP1 with an IFD offset past its end (container valid)", { privacy: ["exif"] });

  // ------------------------------------------------------------------ PNG
  const basePng = encodePng(W, H, px);
  const alphaPng = encodePng(W, H, pxA);
  const orientPng = encodePng(OW, OH, opx);
  const P = (name: string, bytes: Uint8Array, desc: string, e: Expect, w = W, h = H) => put("png", name, bytes, w, h, desc, e);
  const time = pngChunk("tIME", Uint8Array.from([0x07, 0xd1, 2, 3, 4, 5, 6]));
  const exifChunk = (t: Uint8Array) => pngChunk("eXIf", t);
  P("clean", basePng, "pngjs output, no metadata", { noPrivacy: true });
  P("text", pngWith(basePng, [tEXt("Author", FAKE.artist), tEXt("Software", FAKE.software), tEXt("Creation Time", FAKE.date), tEXt("Source", FAKE.model), zTXt("Description", FAKE.description), iTXt("XML:com.adobe.xmp", xmp)], [tEXt("Comment", FAKE.comment)]), "tEXt Author/Software/Creation Time/Source/Comment + zTXt + iTXt XMP", { privacy: ["author", "software", "timestamp", "device", "comment", "xmp"] });
  P("exif", pngWith(basePng, [exifChunk(privacyExif())]), "eXIf with GPS/device/author", { privacy: ["exif", "location", "device"] });
  P("exif-orientation-6", pngWith(orientPng, [exifChunk(orientationOnlyExif(6))]), "eXIf Orientation 6 + make", { privacy: ["exif"], orientation: 6 }, OW, OH);
  P("time", pngWith(basePng, [], [time]), "tIME only", { privacy: ["timestamp"] });
  P("icc", pngWith(basePng, [iCCP("Display P3 (Shotexa synthetic)", p3), tEXt("Author", FAKE.artist)]), "iCCP Display-P3 + Author", { privacy: ["author"], preserved: ["PNG iCCP"] });
  P("gamma", pngWith(basePng, [pngChunk("gAMA", Uint8Array.from([0, 1, 0x86, 0xa0])), pngChunk("cHRM", cat(...[31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000].map((v) => Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255])))), tEXt("Software", FAKE.software)]), "gAMA 1.0 + cHRM (P3 primaries) + Software", { privacy: ["software"], preserved: ["PNG gAMA", "PNG cHRM"] });
  P("srgb", pngWith(basePng, [pngChunk("sRGB", Uint8Array.from([0])), pngChunk("gAMA", Uint8Array.from([0, 0, 0xb1, 0x8f])), tEXt("Author", FAKE.artist)]), "sRGB + gAMA + Author", { privacy: ["author"], preserved: ["PNG sRGB", "PNG gAMA"] });
  P("phys", pngWith(basePng, [pngChunk("pHYs", Uint8Array.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])), tEXt("Author", FAKE.artist)]), "pHYs 72 dpi + Author", { privacy: ["author"], preserved: ["PNG pHYs"] });
  P("alpha", pngWith(alphaPng, [tEXt("Author", FAKE.artist)], [time]), "RGBA with transparency + Author + tIME", { privacy: ["author", "timestamp"], alpha: true });
  {
    // APNG: two frames (IDAT = frame 0, fdAT = frame 1).
    const f1 = idatOf(encodePng(W, H, makePixels(W, H, { variant: 1 })));
    const be = (v: number) => Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
    const fctl = (seq: number) => pngChunk("fcTL", cat(be(seq), be(W), be(H), be(0), be(0), Uint8Array.from([0, 50, 0, 100, 0, 0])));
    const apng = pngWith(basePng, [pngChunk("acTL", cat(be(2), be(0))), fctl(0), tEXt("Software", FAKE.software)], [fctl(1), pngChunk("fdAT", cat(be(2), f1))]);
    P("apng", apng, "Animated PNG (2 frames) + Software", { privacy: ["software"], animated: true });
  }
  P("idot", pngWith(basePng, [pngChunk("iDOT", new Uint8Array(28).fill(1)), tEXt("Software", FAKE.software)]), "Apple-style iDOT chunk + Software", { privacy: ["private-app", "software"] });
  P("unknown-trailing", pngWith(basePng, [pngChunk("prVt", ascii("SHOTEXA-FAKE-PRIVATE chunk"))], [], ascii("SHOTEXA-FAKE-TRAILING after IEND")), "Unknown private ancillary chunk + data after IEND", { privacy: ["private-app", "other"] });
  P(
    "kitchen-sink",
    pngWith(alphaPng, [iCCP("Display P3 (Shotexa synthetic)", p3), pngChunk("pHYs", Uint8Array.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])), tEXt("Author", FAKE.artist), zTXt("Comment", FAKE.comment), iTXt("XML:com.adobe.xmp", xmp), exifChunk(privacyExif()), time], [pngChunk("dSIG", ascii("SHOTEXA-FAKE-SIGNATURE"))]),
    "RGBA + iCCP + pHYs + tEXt + zTXt + iTXt XMP + eXIf + tIME + dSIG",
    { privacy: ["author", "comment", "xmp", "exif", "location", "timestamp", "provenance"], preserved: ["PNG iCCP", "PNG pHYs"], alpha: true },
  );

  // ------------------------------------------------------------------ WebP
  const wb = await webpBases();
  const chunksOf = (list: { id: string; data: Uint8Array }[]) => list.map((c) => riffChunk(c.id, c.data));
  const exifW = riffChunk("EXIF", privacyExif());
  const xmpW = riffChunk("XMP ", utf8(xmp));
  const X = (name: string, bytes: Uint8Array, desc: string, e: Expect, w = W, h = H) => put("webp", name, bytes, w, h, desc, e);
  X("clean-lossy", riff(...chunksOf(wb.lossy)), "Simple lossy (VP8)", { noPrivacy: true });
  X("clean-lossless", riff(...chunksOf(wb.lossless)), "Simple lossless (VP8L)", { noPrivacy: true });
  X("exif-lossy", riff(vp8x(W, H, WEBP_FLAG.exif), ...chunksOf(wb.lossy), exifW), "VP8X + VP8 + EXIF", { privacy: ["exif", "location", "device"] });
  X("exif-lossless", riff(vp8x(W, H, WEBP_FLAG.exif | WEBP_FLAG.xmp), ...chunksOf(wb.lossless), exifW, xmpW), "VP8X + VP8L + EXIF + XMP", { privacy: ["exif", "xmp", "location"] });
  X("xmp", riff(vp8x(W, H, WEBP_FLAG.xmp), ...chunksOf(wb.lossy), xmpW), "VP8X + VP8 + XMP", { privacy: ["xmp", "author"] });
  X("icc", riff(vp8x(W, H, WEBP_FLAG.icc | WEBP_FLAG.exif), riffChunk("ICCP", p3), ...chunksOf(wb.lossy), exifW), "ICCP Display-P3 + EXIF", { privacy: ["exif"], preserved: ["WebP ICCP"] });
  X("alpha", riff(vp8x(W, H, WEBP_FLAG.alpha | WEBP_FLAG.exif | WEBP_FLAG.xmp), ...chunksOf(wb.alpha), exifW, xmpW), "Lossy + ALPH + EXIF + XMP", { privacy: ["exif", "xmp"], alpha: true });
  X("animated", animatedWebp(160, 100, [chunksOf(wb.frame0), chunksOf(wb.frame1)], [exifW, xmpW], WEBP_FLAG.exif | WEBP_FLAG.xmp), "Animated (2 ANMF frames) + EXIF + XMP", { privacy: ["exif", "xmp"], animated: true }, 160, 100);
  X("exif-orientation-6", riff(vp8x(OW, OH, WEBP_FLAG.exif), ...chunksOf(wb.orient), riffChunk("EXIF", orientationOnlyExif(6))), "EXIF Orientation 6 + make", { privacy: ["exif"], orientation: 6 }, OW, OH);
  X("exif-prefixed", riff(vp8x(W, H, WEBP_FLAG.exif), ...chunksOf(wb.lossy), riffChunk("EXIF", cat(ascii("Exif\0\0"), privacyExif()))), "EXIF chunk with an 'Exif\\0\\0' prefix (some writers)", { privacy: ["exif", "location"] });
  X("unknown-trailing", cat(riff(vp8x(W, H, 0), ...chunksOf(wb.lossy), riffChunk("PRIV", ascii("SHOTEXA-FAKE-PRIVATE chunk"))), ascii("SHOTEXA-FAKE-TRAILING after RIFF")), "Unknown chunk + data after the RIFF container", { privacy: ["private-app", "other"] });

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  // Keep the synthetic ICC profile for colour tests.
  writeFileSync(join(OUT, "display-p3-synthetic.icc"), p3);
  console.log(`${manifest.length} fixtures → ${OUT}`);
  void A;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
