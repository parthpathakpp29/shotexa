"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MetadataError } from "@/core/metadata/errors";
import type { ShotexaMetadataEngine } from "@/core/metadata/metadata-engine";
import type { MetadataCleanRun, MetadataInspectRun } from "@/core/metadata/run";
import type { MetadataPolicy } from "@/core/metadata/types";

interface Entry {
  id: string;
  file: File;
  inspect?: MetadataInspectRun;
  clean?: MetadataCleanRun;
  url?: string;
  error?: string;
}

type Src = string | Blob | { b64: string; name?: string; type?: string };

declare global {
  interface Window {
    /** Automation hook for scripts/spikes/metadata/run-browser.ts and the e2e tests (spike only). */
    spikeE?: Record<string, (...a: never[]) => Promise<unknown>>;
  }
}

/** Main-thread heartbeat: the longest gap is what a user feels as a frozen tab. */
function heartbeat() {
  let last = performance.now();
  let max = 0;
  const id = setInterval(() => {
    const now = performance.now();
    max = Math.max(max, now - last);
    last = now;
  }, 10);
  return () => {
    clearInterval(id);
    return Math.max(max, performance.now() - last);
  };
}

async function sha256(data: ArrayBufferView | ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", data as ArrayBuffer));
  return Array.from(d.subarray(0, 12), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function toBlob(src: Src, name = "", type = ""): Promise<File> {
  if (src instanceof Blob) return src instanceof File ? src : new File([src], name, { type: type || src.type });
  if (typeof src === "string") {
    const b = await (await fetch(src)).blob();
    return new File([b], name || src.split("/").pop() || "", { type: type || b.type });
  }
  const bin = atob(src.b64);
  const u = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new File([u], src.name ?? name, { type: src.type ?? type });
}

function canvasOf(w: number, h: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement("canvas"), { width: w, height: h });
}

/** Decode → RGBA hash + a few samples. `via: "bitmap"` uses createImageBitmap options; "img" is what users see. */
async function decode(blob: Blob, via: "bitmap-raw" | "bitmap-default" | "img") {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  let close = () => {};
  let optionsHonoured = true;
  if (via === "img") {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    src = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
    close = () => URL.revokeObjectURL(url);
  } else {
    let bm: ImageBitmap;
    try {
      bm = via === "bitmap-raw" ? await createImageBitmap(blob, { imageOrientation: "none", colorSpaceConversion: "none" } as ImageBitmapOptions) : await createImageBitmap(blob);
    } catch {
      optionsHonoured = false;
      bm = await createImageBitmap(blob);
    }
    src = bm;
    w = bm.width;
    h = bm.height;
    close = () => bm.close();
  }
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  close();
  (c as { width: number }).width = 0;
  let alphaMin = 255;
  for (let i = 3; i < data.length; i += 4) if (data[i] < alphaMin) alphaMin = data[i];
  const at = (x: number, y: number) => {
    const i = (Math.floor(y) * w + Math.floor(x)) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  return { w, h, hash: await sha256(data), alphaMin, tl: at(w * 0.05, h * 0.05), tr: at(w * 0.95, h * 0.05), bl: at(w * 0.05, h * 0.95), optionsHonoured };
}

export function MetadataSpike() {
  const engines = useRef<Partial<Record<"worker" | "main", ShotexaMetadataEngine>>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<"worker" | "main">("worker");
  const [busy, setBusy] = useState(false);

  const engine = useCallback(async (m: "worker" | "main" = "worker") => {
    if (!engines.current[m]) {
      const { createMetadataEngine } = await import("@/core/metadata/metadata-engine");
      engines.current[m] = createMetadataEngine({ mode: m });
    }
    return engines.current[m]!;
  }, []);
  useEffect(() => () => Object.values(engines.current).forEach((e) => e?.dispose()), []);

  const add = useCallback(
    async (files: File[]) => {
      const e = await engine(mode);
      setBusy(true);
      for (const file of files) {
        const id = crypto.randomUUID();
        try {
          const inspect = await e.inspect(file);
          setEntries((old) => [...old, { id, file, inspect }]);
        } catch (err) {
          setEntries((old) => [...old, { id, file, error: (err as MetadataError).code ?? "METADATA_PARSE_FAILED" }]);
        }
      }
      setBusy(false);
    },
    [engine, mode],
  );

  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const files = Array.from(ev.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      ev.preventDefault();
      void add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const cleanEntry = useCallback(
    async (id: string) => {
      const e = await engine(mode);
      const entry = entries.find((x) => x.id === id);
      if (!entry) return;
      try {
        const clean = await e.clean(entry.file);
        const url = URL.createObjectURL(clean.output ?? entry.file);
        setEntries((old) => old.map((x) => (x.id === id ? { ...x, clean, url } : x)));
      } catch (err) {
        setEntries((old) => old.map((x) => (x.id === id ? { ...x, error: (err as MetadataError).code } : x)));
      }
    },
    [engine, entries, mode],
  );

  useEffect(
    () => () =>
      entries.forEach((x) => {
        if (x.url) URL.revokeObjectURL(x.url);
      }),
    // revoke on unmount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------- automation API
  useEffect(() => {
    const api = {
      async inspect(src: Src, o: { name?: string; type?: string; mode?: "worker" | "main" } = {}) {
        const f = await toBlob(src, o.name, o.type);
        const stop = heartbeat();
        const t = performance.now();
        try {
          const r = await (await engine(o.mode ?? "worker")).inspect(f);
          return { ok: true, wallMs: performance.now() - t, maxStallMs: stop(), ...r };
        } catch (e) {
          stop();
          return { ok: false, code: (e as MetadataError).code };
        }
      },
      async clean(src: Src, o: { name?: string; type?: string; mode?: "worker" | "main"; policy?: Partial<MetadataPolicy>; returnB64?: boolean } = {}) {
        const f = await toBlob(src, o.name, o.type);
        const stop = heartbeat();
        const t = performance.now();
        try {
          const r = await (await engine(o.mode ?? "worker")).clean(f, o.policy);
          const wallMs = performance.now() - t;
          const maxStallMs = stop();
          const out = r.output ?? f;
          const bytes = new Uint8Array(await out.arrayBuffer());
          let b64: string | undefined;
          if (o.returnB64) {
            let s = "";
            for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            b64 = btoa(s);
          }
          return {
            ok: true,
            wallMs,
            maxStallMs,
            changed: r.changed,
            inputBytes: r.inputBytes,
            outputBytes: r.outputBytes,
            ms: r.ms,
            verification: r.verification,
            removed: r.removed.map((x) => x.container),
            rewritten: r.rewritten.map((x) => x.container),
            preserved: r.preserved.map((x) => x.container),
            privacyCategories: [...new Set(r.before.privacyFindings.map((x) => x.category))],
            sha: await sha256(bytes),
            b64,
          };
        } catch (e) {
          stop();
          return { ok: false, code: (e as MetadataError).code, wallMs: performance.now() - t };
        }
      },
      /** Decode original vs cleaned (and a strip-everything variant) in this browser. */
      async compare(src: Src, o: { name?: string } = {}) {
        const f = await toBlob(src, o.name);
        const e = await engine("main");
        const cleaned = (await e.clean(f)).output ?? f;
        const stripped = (await e.clean(f, { orientation: "remove", keepColorProfile: false })).output ?? f;
        const out: Record<string, unknown> = {};
        for (const [k, b] of [["original", f], ["cleaned", cleaned], ["stripped", stripped]] as const) {
          out[k] = { raw: await decode(b, "bitmap-raw"), bitmap: await decode(b, "bitmap-default"), img: await decode(b, "img") };
        }
        return out;
      },
      /** Are Canvas exports metadata-free? (PNG/JPEG/WebP from a fresh canvas.) */
      async canvasExports() {
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 200;
        const x = c.getContext("2d")!;
        x.fillStyle = "#e33";
        x.fillRect(0, 0, 320, 200);
        x.fillStyle = "#fff";
        x.font = "24px sans-serif";
        x.fillText("Redacted export", 20, 100);
        x.clearRect(250, 150, 40, 30);
        const e = await engine("main");
        const res: Record<string, unknown> = {};
        for (const [type, q] of [["image/png", undefined], ["image/jpeg", 0.9], ["image/webp", 0.9], ["image/webp", 1]] as const) {
          const blob: Blob | null = await new Promise((r) => c.toBlob(r, type, q));
          if (!blob) {
            res[`${type} q${q}`] = null;
            continue;
          }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const ins = e.inspectBytes(bytes);
          res[`${type} q${q}`] = {
            bytes: bytes.length,
            hasPrivacyMetadata: ins.hasPrivacyMetadata,
            privacy: ins.privacyFindings.map((f) => `${f.source}: ${f.label}`),
            preserved: ins.preservedMetadata.map((m) => m.container),
            removable: ins.removableMetadata.map((m) => m.container),
            colorProfile: ins.colorProfile,
          };
        }
        return res;
      },
      /** Extension / MIME / magic mismatches → controlled errors. */
      async mismatch(png: string, jpg: string, webp: string) {
        const P = new Uint8Array(await (await fetch(png)).arrayBuffer());
        const J = new Uint8Array(await (await fetch(jpg)).arrayBuffer());
        const W = new Uint8Array(await (await fetch(webp)).arrayBuffer());
        const e = await engine("worker");
        const cases: [string, File][] = [
          [".jpg containing PNG", new File([P], "photo.jpg", { type: "image/jpeg" })],
          [".png containing JPEG", new File([J], "shot.png", { type: "image/png" })],
          ["image/jpeg MIME with WebP bytes", new File([W], "", { type: "image/jpeg" })],
          ["SVG", new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "x.svg", { type: "image/svg+xml" })],
          ["empty", new File([], "x.png", { type: "image/png" })],
          ["correct PNG (control)", new File([P], "ok.png", { type: "image/png" })],
        ];
        const out: Record<string, string> = {};
        for (const [name, file] of cases) {
          try {
            await e.inspect(file);
            out[name] = "OK";
          } catch (err) {
            out[name] = (err as MetadataError).code;
          }
        }
        return out;
      },
      /** The approach Privacy Clean avoids: decode + canvas + re-encode (for time/memory comparison). */
      async naiveReencode(src: Src) {
        const f = await toBlob(src);
        const stop = heartbeat();
        const t = performance.now();
        const bm = await createImageBitmap(f);
        const c = canvasOf(bm.width, bm.height);
        (c.getContext("2d") as OffscreenCanvasRenderingContext2D).drawImage(bm, 0, 0);
        bm.close();
        const type = f.type || "image/png";
        const out: Blob = "convertToBlob" in c ? await c.convertToBlob({ type, quality: 0.92 }) : await new Promise((r) => (c as HTMLCanvasElement).toBlob((b) => r(b!), type, 0.92));
        (c as { width: number }).width = 0;
        return { wallMs: performance.now() - t, maxStallMs: stop(), inputBytes: f.size, outputBytes: out.size };
      },
      async dispose() {
        Object.values(engines.current).forEach((x) => x?.dispose());
        engines.current = {};
        return true;
      },
    };
    window.spikeE = api as unknown as Window["spikeE"];
    return () => {
      delete window.spikeE;
    };
  }, [engine]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20 }}>Spike E — Metadata inspection &amp; Privacy Clean (developer prototype)</h1>
      <p style={{ color: "#555", fontSize: 13 }}>JPEG / PNG / WebP. Files never leave this page. Values below are shown locally only.</p>
      <p style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Add images" onChange={(e) => e.target.files && void add(Array.from(e.target.files))} />
        <label>
          Engine{" "}
          <select aria-label="Engine" value={mode} onChange={(e) => setMode(e.target.value as "worker" | "main")}>
            <option value="worker">Image Worker</option>
            <option value="main">Main thread</option>
          </select>
        </label>
        {busy && <span role="status">Inspecting…</span>}
      </p>
      {entries.map((x) => {
        const ins = x.inspect?.inspection;
        const cats = ins ? [...new Set(ins.privacyFindings.map((f) => f.category))] : [];
        const v = x.clean?.verification;
        return (
          <section key={x.id} data-testid="entry" style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, margin: "12px 0" }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>
              {x.file.name || "(pasted image)"} · {(x.file.size / 1024).toFixed(1)} KB
            </h2>
            {x.error && (
              <p role="alert" data-testid="error" style={{ color: "#b91c1c" }}>
                {x.error}
              </p>
            )}
            {ins && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
                <div>
                  <h3 style={{ fontSize: 13 }}>Detected</h3>
                  <p>
                    {ins.format.toUpperCase()} {ins.width}×{ins.height}
                    {ins.orientation ? ` · orientation ${ins.orientation}` : ""}
                    {ins.hasAlpha ? " · alpha" : ""}
                    {ins.animated ? " · animated" : ""}
                  </p>
                  <ul data-testid="categories">{ins.categories.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
                <div>
                  <h3 style={{ fontSize: 13 }}>Privacy-sensitive</h3>
                  {ins.hasPrivacyMetadata ? (
                    <ul data-testid="privacy">
                      {ins.privacyFindings.slice(0, 40).map((f, i) => (
                        <li key={i}>
                          {f.label} <span style={{ color: "#777" }}>({f.source})</span>
                          {f.value ? `: ${f.value}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p data-testid="no-privacy">No privacy-sensitive metadata found.</p>
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: 13 }}>Preserved</h3>
                  <ul>{ins.preservedMetadata.map((m, i) => <li key={i}>{m.label}</li>)}</ul>
                </div>
              </div>
            )}
            {ins && !x.clean && (
              <button onClick={() => void cleanEntry(x.id)} disabled={!ins.hasPrivacyMetadata}>
                {ins.hasPrivacyMetadata ? "Privacy Clean" : "Nothing to remove"}
              </button>
            )}
            {x.clean && v && (
              <div data-testid="verification" style={{ fontSize: 13 }}>
                <h3 style={{ fontSize: 13 }}>{v.passed ? "Privacy Clean complete — verified" : "Verification failed"}</h3>
                <ul>
                  {cats.map((c) => (
                    <li key={c}>✓ {c} removed</li>
                  ))}
                  <li>{v.payloadIdentical ? "✓ image data byte-identical (pixels unchanged)" : "✗ image data changed"}</li>
                  <li>{v.dimensionsMatch ? "✓ dimensions unchanged" : "✗ dimensions changed"}</li>
                  {x.clean.rewritten.length > 0 && <li>✓ orientation kept (minimal EXIF)</li>}
                  {v.preservedRequiredMetadata.filter((p) => !p.startsWith("0x")).map((p) => <li key={p}>✓ kept {p}</li>)}
                </ul>
                <p>
                  {(x.clean.inputBytes / 1024).toFixed(1)} KB → {(x.clean.outputBytes / 1024).toFixed(1)} KB in {x.clean.ms.total.toFixed(1)} ms ·{" "}
                  <a href={x.url} download={x.file.name ? x.file.name.replace(/(\.\w+)$/, "-clean$1") : "clean"}>
                    Download
                  </a>
                </p>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
