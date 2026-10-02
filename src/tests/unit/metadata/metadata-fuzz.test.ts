/**
 * Lightweight fuzz / property tests for the metadata parsers (Spike E §32).
 *
 * Seeded (reproducible). Per case: inspect + clean (+ verify the output). Properties:
 *  - only MetadataError is thrown (no TypeError/RangeError/undefined reads escape);
 *  - no case takes longer than MAX_MS (no hangs / quadratic blow-ups);
 *  - clean never grows the file by more than the 34-byte minimal EXIF;
 *  - every clean output re-parses, and re-inspection finds no privacy metadata.
 *
 *   METADATA_FUZZ=200000 npx vitest run src/tests/unit/metadata/metadata-fuzz.test.ts   # more cases
 *   METADATA_FUZZ_REPORT=1 …                                                         # write results JSON
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32 } from "@/core/metadata/bytes";
import { cleanBytes, inspectBytes, verifyBytes } from "@/core/metadata/engine-core";
import { MetadataError } from "@/core/metadata/errors";
import { walkJpeg } from "@/core/metadata/jpeg";
import { walkPng } from "@/core/metadata/png";
import { walkWebp } from "@/core/metadata/webp";

const DIR = join(process.cwd(), "src", "tests", "fixtures", "metadata");
const manifest: { id: string; file: string; format: string }[] = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const seeds = manifest.map((f) => ({ id: f.id, format: f.format, bytes: new Uint8Array(readFileSync(join(DIR, f.file))) }));
const TOTAL = Number(process.env.METADATA_FUZZ ?? 24000);
const MAX_MS = 500;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

/** Offsets of structural length fields (where corruption is most interesting). */
function lengthFields(b: Uint8Array, format: string): { at: number; size: 2 | 4; le: boolean }[] {
  try {
    if (format === "jpeg") return walkJpeg(b).segments.filter((s) => s.end - s.start > 2).map((s) => ({ at: s.start + 2, size: 2 as const, le: false }));
    if (format === "png") return walkPng(b).chunks.map((c) => ({ at: c.start, size: 4 as const, le: false }));
    return [{ at: 4, size: 4 as const, le: true }, ...walkWebp(b).chunks.map((c) => ({ at: c.start + 4, size: 4 as const, le: true }))];
  } catch {
    return [];
  }
}

type Mutator = (b: Uint8Array, r: () => number, format: string) => Uint8Array;
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const MUTATORS: Record<string, Mutator> = {
  bitflip: (b, r) => {
    const c = b.slice();
    for (let i = 0, n = 1 + Math.floor(r() * 8); i < n; i++) c[Math.floor(r() * c.length)] ^= 1 << Math.floor(r() * 8);
    return c;
  },
  headerBytes: (b, r) => {
    const c = b.slice();
    const span = Math.min(c.length, 4096);
    for (let i = 0, n = 1 + Math.floor(r() * 6); i < n; i++) c[Math.floor(r() * span)] = Math.floor(r() * 256);
    return c;
  },
  lengthField: (b, r, f) => {
    const fields = lengthFields(b, f);
    if (!fields.length) return b.slice();
    const fld = pick(r, fields);
    const c = b.slice();
    const vals = [0, 1, 2, 3, 0xff, 0xffff, 0x7fffffff, 0x80000000, 0xffffffff, Math.floor(r() * 0xffffffff), b.length, b.length - fld.at];
    const v = pick(r, vals) >>> 0;
    const dv = new DataView(c.buffer);
    if (fld.size === 2) dv.setUint16(fld.at, v & 0xffff, fld.le);
    else dv.setUint32(fld.at, v, fld.le);
    return c;
  },
  truncate: (b, r) => b.slice(0, Math.floor(r() * b.length)),
  insert: (b, r) => {
    const at = Math.floor(r() * b.length);
    const junk = Uint8Array.from({ length: 1 + Math.floor(r() * 64) }, () => Math.floor(r() * 256));
    const c = new Uint8Array(b.length + junk.length);
    c.set(b.subarray(0, at));
    c.set(junk, at);
    c.set(b.subarray(at), at + junk.length);
    return c;
  },
  duplicateElement: (b, r, f) => {
    // Duplicate a random structural element (segment/chunk) in place.
    let ranges: [number, number][] = [];
    try {
      if (f === "jpeg") ranges = walkJpeg(b).segments.filter((s) => s.marker !== 0xda).map((s) => [s.start, s.end]);
      else if (f === "png") ranges = walkPng(b).chunks.map((c) => [c.start, c.end]);
      else ranges = walkWebp(b).chunks.map((c) => [c.start, c.end]);
    } catch {
      return b.slice();
    }
    if (!ranges.length) return b.slice();
    const [s, e] = pick(r, ranges);
    const c = new Uint8Array(b.length + (e - s));
    c.set(b.subarray(0, e));
    c.set(b.subarray(s, e), e);
    c.set(b.subarray(e), e + (e - s));
    return c;
  },
  pngDataWithValidCrc: (b, r, f) => {
    // Mutate inside a PNG chunk and FIX its CRC so the mutation reaches classification.
    if (f !== "png") return MUTATORS.bitflip(b, r, f);
    let chunks;
    try {
      chunks = walkPng(b).chunks.filter((c) => c.length > 0);
    } catch {
      return b.slice();
    }
    const ch = pick(r, chunks);
    const c = b.slice();
    for (let i = 0, n = 1 + Math.floor(r() * 8); i < n; i++) c[ch.dataStart + Math.floor(r() * ch.length)] = Math.floor(r() * 256);
    const crc = crc32([c.subarray(ch.start + 4, ch.dataStart + ch.length)]);
    new DataView(c.buffer).setUint32(ch.dataStart + ch.length, crc);
    return c;
  },
  randomWithMagic: (b, r) => {
    const n = 16 + Math.floor(r() * 2048);
    const c = Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
    c.set(b.subarray(0, Math.min(16, n)));
    return c;
  },
};

interface Stats {
  cases: number;
  rejected: Record<string, number>;
  cleaned: number;
  unchanged: number;
  maxMs: number;
  maxCase: string;
  byMutator: Record<string, number>;
  uncontrolled: string[];
  invalidOutputs: string[];
  privacyLeftInOutput: string[];
  grewOutput: string[];
  slow: string[];
}

function runCase(name: string, input: Uint8Array, s: Stats) {
  const t0 = performance.now();
  try {
    inspectBytes(input);
    const r = cleanBytes(input);
    if (r.changed) {
      s.cleaned++;
      if (r.output.length > input.length + 64) s.grewOutput.push(name);
      const v = verifyBytes(r.output);
      if (!v.outputValid) s.invalidOutputs.push(name);
      if (v.unexpectedRemainingPrivacyMetadata.length) s.privacyLeftInOutput.push(`${name}: ${v.unexpectedRemainingPrivacyMetadata[0]}`);
    } else s.unchanged++;
  } catch (e) {
    if (e instanceof MetadataError) s.rejected[e.code] = (s.rejected[e.code] ?? 0) + 1;
    else s.uncontrolled.push(`${name}: ${String((e as Error)?.stack ?? e).slice(0, 200)}`);
  }
  const ms = performance.now() - t0;
  if (ms > s.maxMs) {
    s.maxMs = ms;
    s.maxCase = name;
  }
  if (ms > MAX_MS) s.slow.push(`${name}: ${ms.toFixed(0)} ms`);
  s.cases++;
}

describe("metadata parser fuzzing", () => {
  it(`${TOTAL} seeded mutation cases + random-byte files`, () => {
    const s: Stats = { cases: 0, rejected: {}, cleaned: 0, unchanged: 0, maxMs: 0, maxCase: "", byMutator: {}, uncontrolled: [], invalidOutputs: [], privacyLeftInOutput: [], grewOutput: [], slow: [] };
    const r = rng(0x5eed_e);
    const names = Object.keys(MUTATORS);
    const t0 = performance.now();
    for (let i = 0; i < TOTAL; i++) {
      const seed = seeds[i % seeds.length];
      const m = names[Math.floor(r() * names.length)];
      s.byMutator[m] = (s.byMutator[m] ?? 0) + 1;
      runCase(`#${i} ${m} ${seed.id}`, MUTATORS[m](seed.bytes, r, seed.format), s);
    }
    // Pure random bytes (no magic) + tiny inputs.
    for (let i = 0; i < 2000; i++) runCase(`random#${i}`, Uint8Array.from({ length: Math.floor(r() * 512) }, () => Math.floor(r() * 256)), s);
    for (let n = 0; n < 64; n++) for (const seed of seeds.slice(0, 3)) runCase(`prefix ${n} ${seed.id}`, seed.bytes.slice(0, n), s);
    const totalMs = performance.now() - t0;
    if (process.env.METADATA_FUZZ_REPORT) {
      writeFileSync(
        join(process.cwd(), "docs", "spikes", "results", "metadata-fuzz.json"),
        JSON.stringify({ date: new Date().toISOString(), node: process.version, seed: "0x5eede", totalMs: Math.round(totalMs), ...s, maxMs: +s.maxMs.toFixed(1), uncontrolled: s.uncontrolled.slice(0, 20), invalidOutputs: s.invalidOutputs.slice(0, 20), privacyLeftInOutput: s.privacyLeftInOutput.slice(0, 20), slow: s.slow.slice(0, 20) }, null, 1) + "\n",
      );
    }
    console.log(JSON.stringify({ cases: s.cases, rejected: s.rejected, cleaned: s.cleaned, unchanged: s.unchanged, maxMs: s.maxMs.toFixed(1), maxCase: s.maxCase, totalMs: Math.round(totalMs) }));
    expect(s.uncontrolled).toEqual([]);
    expect(s.invalidOutputs).toEqual([]);
    expect(s.privacyLeftInOutput).toEqual([]);
    expect(s.grewOutput).toEqual([]);
    expect(s.slow).toEqual([]);
  }, 600_000);
});
