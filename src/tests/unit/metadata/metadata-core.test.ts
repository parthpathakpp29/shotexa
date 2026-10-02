import exifr from "exifr";
import jpeg from "jpeg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { crc32, METADATA_LIMITS, safeText } from "@/core/metadata/bytes";
import { cleanBytes, detectFormat, inspectBytes, validateMetadataInput, verifyBytes } from "@/core/metadata/engine-core";
import { MetadataError, toMetadataError } from "@/core/metadata/errors";
import { minimalOrientationTiff, readExif } from "@/core/metadata/exif";
import { walkJpeg } from "@/core/metadata/jpeg";
import { walkPng } from "@/core/metadata/png";
import { walkWebp } from "@/core/metadata/webp";
import { scanXmp } from "@/core/metadata/xmp";
import { cat, exifApp1, FAKE, jpegWith, pngChunk, pngWith, privacyExif, riff, riffChunk, tiff, utf8, S, L, A, xmpApp1 } from "../../../../scripts/spikes/metadata-fixtures/build";

const DIR = join(process.cwd(), "src", "tests", "fixtures", "metadata");
interface Fx {
  id: string;
  format: "jpeg" | "png" | "webp";
  file: string;
  width: number;
  height: number;
  expect: { privacy?: string[]; preserved?: string[]; noPrivacy?: boolean; orientation?: number; alpha?: boolean; animated?: boolean; thumbnail?: boolean };
}
const manifest: Fx[] = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const load = (id: string) => new Uint8Array(readFileSync(join(DIR, manifest.find((f) => f.id === id)!.file)));

const LEAKS = ["SHOTEXA-FAKE", "SHOTEXA0FAKE"].flatMap((s) => [Buffer.from(s, "latin1"), Buffer.from(s, "utf16le")]);
const leaks = (b: Uint8Array) => LEAKS.filter((m) => Buffer.from(b).includes(m)).map(String);
/** GPS numerators used by the fixtures, in both byte orders. */
const GPS_PATTERNS = [FAKE.latSec[0], FAKE.lonSec[0]].flatMap((v) => {
  const x = Buffer.alloc(4);
  x.writeUInt32LE(v);
  const y = Buffer.alloc(4);
  y.writeUInt32BE(v);
  return [x, y];
});

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(MetadataError);
    return (e as MetadataError).code;
  }
}

describe("format detection and input validation (§45: extension + MIME + magic bytes)", () => {
  it("detects by signature only", () => {
    expect(detectFormat(load("jpeg/clean"))).toBe("jpeg");
    expect(detectFormat(load("png/clean"))).toBe("png");
    expect(detectFormat(load("webp/clean-lossy"))).toBe("webp");
    expect(detectFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });
  it("rejects mismatches with controlled codes", () => {
    const png = load("png/clean");
    const jpg = load("jpeg/clean");
    const webp = load("webp/clean-lossy");
    expect(codeOf(() => validateMetadataInput("photo.jpg", "image/jpeg", png))).toBe("METADATA_INVALID_FILE"); // .jpg containing PNG
    expect(codeOf(() => validateMetadataInput("shot.png", "image/png", jpg))).toBe("METADATA_INVALID_FILE"); // .png containing JPEG
    expect(codeOf(() => validateMetadataInput("", "image/jpeg", webp))).toBe("METADATA_INVALID_FILE"); // MIME says JPEG, bytes are WebP
    expect(codeOf(() => validateMetadataInput("a.gif", "image/gif", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])))).toBe("METADATA_UNSUPPORTED_FORMAT");
    expect(codeOf(() => validateMetadataInput("a.svg", "image/svg+xml", utf8("<svg/>")))).toBe("METADATA_UNSUPPORTED_FORMAT");
    expect(codeOf(() => validateMetadataInput("a.png", "", new Uint8Array()))).toBe("METADATA_INVALID_FILE");
    expect(validateMetadataInput("", "", webp)).toBe("webp"); // clipboard: signature only
    expect(codeOf(() => inspectBytes(new Uint8Array()))).toBe("METADATA_INVALID_FILE");
    expect(codeOf(() => inspectBytes(utf8("GIF89a....")))).toBe("METADATA_UNSUPPORTED_FORMAT");
  });
});

describe("fixture matrix: inspect → clean → verify", () => {
  for (const f of manifest) {
    it(`${f.id}`, async () => {
      const input = load(f.id);
      const ins = inspectBytes(input);
      expect(ins.format).toBe(f.format);
      expect([ins.width, ins.height]).toEqual([f.width, f.height]);
      if (f.expect.orientation) expect(ins.orientation).toBe(f.expect.orientation);
      if (f.expect.alpha) expect(ins.hasAlpha).toBe(true);
      if (f.expect.animated) expect(ins.animated).toBe(true);
      const cats = new Set(ins.privacyFindings.map((p) => p.category));
      for (const c of f.expect.privacy ?? []) expect(cats, `missing category ${c}`).toContain(c);

      const r = cleanBytes(input);
      if (f.expect.noPrivacy) {
        expect(ins.hasPrivacyMetadata).toBe(false);
        expect(r.changed).toBe(false);
        expect(r.output).toBe(input); // the original bytes, not a rewrite
      } else {
        expect(ins.hasPrivacyMetadata).toBe(true);
        expect(r.changed).toBe(true);
      }
      const v = verifyBytes(r.output, { original: input });
      expect(v.problems).toEqual([]);
      expect(v.passed && v.outputValid && v.dimensionsMatch && v.payloadIdentical).toBe(true);
      const keptAfter = inspectBytes(r.output).preservedMetadata.map((m) => m.container);
      for (const p of f.expect.preserved ?? []) expect(keptAfter, `preserved ${p}`).toContain(p);
      // Independent oracles: byte-grep for every synthetic value (ASCII + UTF-16), GPS rationals.
      expect(leaks(r.output)).toEqual([]);
      for (const g of GPS_PATTERNS) expect(Buffer.from(r.output).includes(g)).toBe(false);
      // Re-inspection finds nothing private; cleaning again is a no-op (idempotent).
      expect(inspectBytes(r.output).hasPrivacyMetadata).toBe(false);
      const again = cleanBytes(r.output);
      expect(again.changed).toBe(false);
      // Orientation is preserved (minimal EXIF), never silently dropped.
      if (f.expect.orientation && f.expect.orientation > 1) expect(inspectBytes(r.output).orientation).toBe(f.expect.orientation);
      if (f.expect.alpha) expect(inspectBytes(r.output).hasAlpha).toBe(true);
      if (f.expect.animated) expect(inspectBytes(r.output).animated).toBe(true);
      // Output never grows beyond input + a 34-byte minimal EXIF.
      expect(r.output.length).toBeLessThanOrEqual(input.length + 64);

      // Third-party oracle (exifr, dev-only) for JPEG/PNG.
      if (f.format !== "webp") {
        const after = (await exifr.parse(Buffer.from(r.output), { tiff: true, exif: true, gps: true, ifd1: true, xmp: true, iptc: true, icc: true, mergeOutput: false, translateKeys: false })) ?? {};
        expect(after.gps).toBeUndefined();
        expect(after.exif).toBeUndefined();
        expect(after.ifd1).toBeUndefined();
        expect(after.xmp).toBeUndefined();
        expect(after.iptc).toBeUndefined();
        if ((f.expect.preserved ?? []).some((p) => /ICC|iCCP/.test(p))) expect(after.icc).toBeDefined();
      }
    });
  }
});

describe("container-only cleaning keeps pixels (Node decoders)", () => {
  it("JPEG: jpeg-js decodes identical RGBA before/after for every JPEG fixture", () => {
    for (const f of manifest.filter((x) => x.format === "jpeg")) {
      const input = load(f.id);
      const out = cleanBytes(input).output;
      const a = jpeg.decode(Buffer.from(input), { useTArray: true, formatAsRGBA: true });
      const b = jpeg.decode(Buffer.from(out), { useTArray: true, formatAsRGBA: true });
      expect([b.width, b.height]).toEqual([a.width, a.height]);
      expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)), f.id).toBe(0);
    }
  });
  it("PNG: pngjs decodes identical RGBA (incl. alpha) before/after for every PNG fixture", () => {
    for (const f of manifest.filter((x) => x.format === "png")) {
      const input = load(f.id);
      const out = cleanBytes(input).output;
      // pngjs rejects data after IEND, so the reference decode uses the input up to IEND.
      const a = PNG.sync.read(Buffer.from(input.subarray(0, walkPng(input).iendEnd)));
      const b = PNG.sync.read(Buffer.from(out));
      expect(Buffer.compare(a.data, b.data), f.id).toBe(0);
    }
  });
  it("metadata inserted into a clean file is removed back to the identical bytes", () => {
    const clean = load("jpeg/clean");
    for (const id of ["jpeg/exif-gps", "jpeg/exif-gps-be", "jpeg/exif-thumbnail", "jpeg/xmp", "jpeg/xmp-extended", "jpeg/comments", "jpeg/iptc", "jpeg/mpf-appended", "jpeg/trailing", "jpeg/duplicate-exif", "jpeg/malformed-exif"]) {
      expect(Buffer.compare(Buffer.from(cleanBytes(load(id)).output), Buffer.from(clean)), id).toBe(0);
    }
    const png = load("png/clean");
    for (const id of ["png/text", "png/exif", "png/time", "png/idot", "png/unknown-trailing"]) expect(Buffer.compare(Buffer.from(cleanBytes(load(id)).output), Buffer.from(png)), id).toBe(0);
  });
});

describe("JPEG specifics", () => {
  it("segment walk: markers, scan data, EOI", () => {
    const { segments, eoi } = walkJpeg(load("jpeg/kitchen-sink"));
    expect(segments.some((s) => s.marker === 0xda)).toBe(true);
    expect(eoi).toBeGreaterThan(0);
  });
  it("embedded EXIF thumbnail is reported and its bytes are gone", () => {
    const input = load("jpeg/exif-thumbnail");
    const ins = inspectBytes(input);
    expect(ins.privacyFindings.some((f) => f.category === "thumbnail")).toBe(true);
    const r = readExif(input.subarray(input.indexOf(0x45, 2) + 6), "t"); // "Exif" → TIFF
    void r;
    const out = cleanBytes(input).output;
    // The thumbnail is itself a JPEG: after cleaning only ONE SOI (the main image) remains.
    const sois = [...Buffer.from(out).entries()].filter(([i, v]) => v === 0xff && out[i + 1] === 0xd8).length;
    expect(sois).toBe(1);
  });
  it("orientation: keep-minimal keeps a 26-byte Orientation-only EXIF; 'remove' drops it", () => {
    for (const o of [2, 3, 5, 6, 7, 8]) {
      const input = load(`jpeg/orientation-${o}`);
      const kept = cleanBytes(input);
      expect(kept.rewritten.length).toBe(1);
      expect(inspectBytes(kept.output).orientation).toBe(o);
      expect(Buffer.from(kept.output).includes(Buffer.from(minimalOrientationTiff(o)))).toBe(true);
      const dropped = cleanBytes(input, { orientation: "remove" });
      expect(inspectBytes(dropped.output).orientation).toBeUndefined();
      expect(verifyBytes(dropped.output, { original: input, policy: { orientation: "remove" } }).passed).toBe(true);
    }
    // Orientation 1 is the default: the whole EXIF block goes.
    expect(inspectBytes(cleanBytes(load("jpeg/orientation-1")).output).orientation).toBeUndefined();
  });
  it("ICC and Adobe APP14 are preserved byte-for-byte; keepColorProfile:false can drop ICC", () => {
    const input = load("jpeg/kitchen-sink");
    const out = cleanBytes(input).output;
    expect(inspectBytes(out).colorProfile).toBe("icc");
    expect(inspectBytes(out).preservedMetadata.map((m) => m.container)).toEqual(expect.arrayContaining(["APP0 JFIF", "APP2 ICC", "APP14 Adobe"]));
    expect(inspectBytes(cleanBytes(input, { keepColorProfile: false }).output).colorProfile).toBe("none");
  });
  it("JFIF header thumbnail is stripped while the JFIF header is kept", () => {
    const out = cleanBytes(load("jpeg/jfif-thumbnail")).output;
    const ins = inspectBytes(out);
    expect(ins.preservedMetadata.some((m) => m.container === "APP0 JFIF")).toBe(true);
    expect(ins.privacyFindings).toEqual([]);
  });
});

describe("PNG specifics", () => {
  it("does not strip every ancillary chunk: colour, transparency, physical size, animation stay", () => {
    for (const [id, kept] of [
      ["png/icc", ["PNG iCCP"]],
      ["png/gamma", ["PNG gAMA", "PNG cHRM"]],
      ["png/srgb", ["PNG sRGB", "PNG gAMA"]],
      ["png/phys", ["PNG pHYs"]],
    ] as const) {
      const types = walkPng(cleanBytes(load(id)).output).chunks.map((c) => `PNG ${c.type}`);
      for (const k of kept) expect(types, id).toContain(k);
    }
    const apng = walkPng(cleanBytes(load("png/apng")).output).chunks.map((c) => c.type);
    expect(apng).toEqual(expect.arrayContaining(["acTL", "fcTL", "fdAT", "IDAT"]));
    expect(apng).not.toContain("tEXt");
  });
  it("removes tEXt/zTXt/iTXt/eXIf/tIME/dSIG/iDOT/unknown ancillary and data after IEND", () => {
    const types = walkPng(cleanBytes(load("png/kitchen-sink")).output).chunks.map((c) => c.type);
    for (const t of ["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"]) expect(types).not.toContain(t);
    expect(walkPng(cleanBytes(load("png/idot")).output).chunks.map((c) => c.type)).not.toContain("iDOT");
    const u = cleanBytes(load("png/unknown-trailing")).output;
    expect(walkPng(u).iendEnd).toBe(u.length);
  });
  it("CRCs stay valid (kept chunks are copied; a rewritten eXIf gets a new CRC)", () => {
    for (const id of ["png/kitchen-sink", "png/exif-orientation-6"]) expect(() => walkPng(cleanBytes(load(id)).output)).not.toThrow();
  });
  it("unknown critical chunks fail closed", () => {
    const bad = pngWith(load("png/clean"), [pngChunk("ABCD", utf8("x"))]);
    expect(codeOf(() => cleanBytes(bad))).toBe("METADATA_UNSUPPORTED_FORMAT");
  });
});

describe("WebP specifics", () => {
  it("removes EXIF/XMP, updates VP8X flags and the RIFF size, keeps ICCP/ALPH/ANMF", () => {
    for (const id of ["webp/icc", "webp/alpha", "webp/animated", "webp/exif-lossless"]) {
      const out = cleanBytes(load(id)).output;
      const { chunks, riffEnd } = walkWebp(out);
      expect(riffEnd).toBe(out.length);
      const ids = chunks.map((c) => c.id);
      expect(ids).not.toContain("EXIF");
      expect(ids).not.toContain("XMP ");
      const flags = out[chunks[0].dataStart];
      expect(flags & 0x0c).toBe(0); // EXIF + XMP flags cleared
      if (id === "webp/icc") expect(ids.includes("ICCP") && (flags & 0x20) !== 0).toBe(true);
      if (id === "webp/alpha") expect(ids).toContain("ALPH");
      if (id === "webp/animated") expect(ids.filter((x) => x === "ANMF").length).toBe(2);
    }
  });
  it("keeps orientation as a minimal EXIF chunk with the flag set", () => {
    const out = cleanBytes(load("webp/exif-orientation-6")).output;
    const { chunks } = walkWebp(out);
    expect(chunks.map((c) => c.id)).toContain("EXIF");
    expect(out[chunks[0].dataStart] & 0x08).toBe(0x08);
    expect(inspectBytes(out).orientation).toBe(6);
  });
});

describe("malformed containers fail closed with controlled errors", () => {
  const jpg = load("jpeg/exif-gps");
  const png = load("png/text");
  const webp = load("webp/alpha");
  const cases: [string, Uint8Array, string][] = [
    ["JPEG truncated (no EOI)", jpg.subarray(0, jpg.length - 400), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG segment past end", cat(jpg.subarray(0, 2), Uint8Array.from([0xff, 0xe1, 0xff, 0xff, 0x45])), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG length < 2", cat(jpg.subarray(0, 2), Uint8Array.from([0xff, 0xe1, 0x00, 0x01]), jpg.subarray(2)), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG stray byte instead of marker", cat(jpg.subarray(0, 20), Uint8Array.from([0x00, 0x11]), jpg.subarray(20)), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG no scan (SOS)", Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xd9]), "METADATA_MALFORMED_CONTAINER"],
    ["PNG no IDAT", cat(png.subarray(0, 33), Uint8Array.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG only SOI", Uint8Array.from([0xff, 0xd8, 0xff]), "METADATA_MALFORMED_CONTAINER"],
    ["JPEG no SOF", Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0, 3, 65, 0xff, 0xd9]), "METADATA_MALFORMED_CONTAINER"],
    ["PNG bad CRC", (() => { const b = png.slice(); b[40] ^= 0xff; return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["PNG chunk length 2^31", (() => { const b = png.slice(); b.set([0x80, 0, 0, 0], 33); return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["PNG huge declared length (2^31-1)", (() => { const b = png.slice(); b.set([0x7f, 0xff, 0xff, 0xff], 33); return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["PNG truncated (no IEND)", png.subarray(0, png.length - 12), "METADATA_MALFORMED_CONTAINER"],
    ["PNG first chunk not IHDR", cat(png.subarray(0, 8), pngChunk("tEXt", utf8("a\0b")), png.subarray(8)), "METADATA_MALFORMED_CONTAINER"],
    ["PNG invalid chunk type", (() => { const b = png.slice(); b[37] = 0x31; return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["WebP RIFF size > file", (() => { const b = webp.slice(); b.set([0xff, 0xff, 0xff, 0x0f], 4); return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["WebP odd RIFF size", (() => { const b = webp.slice(); b[4] ^= 1; return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["WebP chunk size > RIFF", (() => { const b = webp.slice(); b.set([0xff, 0xff, 0xff, 0x7f], 16); return b; })(), "METADATA_MALFORMED_CONTAINER"],
    ["WebP truncated", webp.subarray(0, webp.length - 100), "METADATA_MALFORMED_CONTAINER"],
    ["WebP bad first chunk", riff(riffChunk("XYZW", utf8("abcd"))), "METADATA_MALFORMED_CONTAINER"],
  ];
  for (const [name, bytes, code] of cases) {
    it(name, () => {
      expect(codeOf(() => inspectBytes(bytes))).toBe(code);
      expect(codeOf(() => cleanBytes(bytes))).toBe(code);
      const v = verifyBytes(bytes);
      expect(v.passed).toBe(false);
      expect(v.outputValid).toBe(false);
    });
  }
  it("rejects inputs above the size limit before parsing", () => {
    const big = { length: METADATA_LIMITS.maxInputBytes + 1 } as unknown as Uint8Array;
    expect(codeOf(() => inspectBytes(big))).toBe("METADATA_TOO_LARGE");
  });
});

describe("hostile metadata inside a valid container (reported, removed, never fatal)", () => {
  const base = load("jpeg/clean");
  it("EXIF IFD cycle, huge counts, huge entry counts, offsets past the end", () => {
    const cyc = new Uint8Array(26);
    cyc.set([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x0f, 0x01, 2, 0, 4, 0, 0, 0, 0x41, 0x42, 0x43, 0, 8, 0, 0, 0]); // IFD0 → next IFD = IFD0
    const hugeCount = tiff({ ifd0: { 0x010f: A(FAKE.make) } });
    new DataView(hugeCount.buffer).setUint32(8 + 2 + 4, 0x3fffffff, true); // count of first entry
    const manyEntries = Uint8Array.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0xff, 0xff, 0, 0]);
    for (const t of [cyc, hugeCount, manyEntries]) {
      const f = jpegWith(base, [exifApp1(t)]);
      const t0 = performance.now();
      const r = cleanBytes(f);
      expect(performance.now() - t0).toBeLessThan(100);
      expect(Buffer.compare(Buffer.from(r.output), Buffer.from(base))).toBe(0);
      expect(r.before.privacyFindings.some((x) => x.category === "exif")).toBe(true);
    }
  });
  it("EXIF IFD depth/count limits (nested pointers) terminate", () => {
    // Exif IFD pointer to itself.
    const t = tiff({ ifd0: { 0x010f: A(FAKE.make) }, exif: { 0x8769: L(0) } });
    const f = jpegWith(base, [exifApp1(t)]);
    expect(() => cleanBytes(f)).not.toThrow();
  });
  it("XMP is scanned as inert text: entities, DTDs and scripts are never expanded", () => {
    const evil = `<!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><x:xmpmeta><script>alert(1)</script><dc:creator>&b;${FAKE.artist}</dc:creator></x:xmpmeta>`;
    const f = scanXmp(utf8(evil), "t");
    expect(f.some((x) => x.category === "author")).toBe(true);
    const out = cleanBytes(jpegWith(base, [xmpApp1(evil)])).output;
    expect(Buffer.compare(Buffer.from(out), Buffer.from(base))).toBe(0);
  });
  it("unusually large and duplicated metadata (10 × 64 KB XMP + 5 MB PNG iTXt)", () => {
    const big = "x".repeat(65_000);
    const j = jpegWith(base, Array.from({ length: 10 }, () => xmpApp1(big)));
    expect(Buffer.compare(Buffer.from(cleanBytes(j).output), Buffer.from(base))).toBe(0);
    const p = pngWith(load("png/clean"), [pngChunk("iTXt", cat(utf8("XML:com.adobe.xmp\0\0\0\0\0"), utf8("y".repeat(5_000_000))))]);
    const t0 = performance.now();
    expect(Buffer.compare(Buffer.from(cleanBytes(p).output), Buffer.from(load("png/clean")))).toBe(0);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  it("zero-length chunks/segments", () => {
    const p = pngWith(load("png/clean"), [pngChunk("tEXt", new Uint8Array()), pngChunk("zzZz", new Uint8Array())]);
    expect(cleanBytes(p).changed).toBe(true);
    const w = cat(riff(...[riffChunk("VP8X", new Uint8Array(10))]));
    expect(codeOf(() => cleanBytes(w))).toBe("METADATA_MALFORMED_CONTAINER"); // zero canvas → invalid
  });
});

describe("verification catches bad outputs", () => {
  it("fails when privacy metadata remains, payload changes, dimensions change or output is corrupt", () => {
    const orig = load("jpeg/exif-gps");
    expect(verifyBytes(orig, { original: orig }).unexpectedRemainingPrivacyMetadata.length).toBeGreaterThan(0);
    const out = cleanBytes(orig).output.slice();
    out[out.length - 100] ^= 0xff; // flip a byte inside the scan data
    const v = verifyBytes(out, { original: orig });
    expect(v.payloadIdentical).toBe(false);
    expect(v.passed).toBe(false);
    expect(verifyBytes(out.subarray(0, 100), { original: orig }).outputValid).toBe(false);
    const other = load("jpeg/orientation-6");
    expect(verifyBytes(cleanBytes(other).output, { original: orig }).dimensionsMatch).toBe(false);
    // Dropping a preserved ICC profile is detected.
    const icc = load("jpeg/icc");
    const noIcc = cleanBytes(icc, { keepColorProfile: false }).output;
    expect(verifyBytes(noIcc, { original: icc }).missingRequiredMetadata.some((m) => m.startsWith("APP2 ICC"))).toBe(true);
  });
});

describe("helpers and errors", () => {
  it("safe text never interprets control characters and truncates", () => {
    expect(safeText(utf8("a\u0001b\u0000"), "latin1")).toBe("a·b");
    expect(safeText(new Uint8Array(5000).fill(65), "latin1", 10)).toBe("AAAAAAAAAA…");
  });
  it("CRC-32 matches the PNG reference", () => {
    expect(crc32([utf8("IEND")])).toBe(0xae426082);
  });
  it("error mapping", () => {
    expect(toMetadataError(new RangeError("x"), "inspect").code).toBe("METADATA_MALFORMED_CONTAINER");
    expect(toMetadataError(new Error("x"), "inspect").code).toBe("METADATA_PARSE_FAILED");
    expect(toMetadataError(new Error("x"), "clean").code).toBe("METADATA_CLEAN_FAILED");
    expect(toMetadataError(new Error("x"), "verify").code).toBe("METADATA_VERIFICATION_FAILED");
    const e = new MetadataError("METADATA_TOO_LARGE", "local detail");
    expect(e.message).toBe("METADATA_TOO_LARGE");
  });
  it("batch: 25 sequential cleans return independent buffers, no shared state", () => {
    const ids = manifest.slice(0, 25).map((f) => f.id);
    const outs = ids.map((id) => cleanBytes(load(id)));
    for (const [i, r] of outs.entries()) expect(verifyBytes(r.output, { original: load(ids[i]) }).passed).toBe(true);
  });
  it("privacy EXIF writer sanity (fixture builder)", () => {
    const r = readExif(privacyExif({ orientation: 6 }), "t");
    expect(r.orientation).toBe(6);
    expect(r.hasGps).toBe(true);
    expect(r.findings.some((f) => f.label === "GPS latitude" && f.value === "0 7 444.44")).toBe(true);
    void S;
  });
});
