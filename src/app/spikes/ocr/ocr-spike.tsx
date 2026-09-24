"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OcrService, ExtractOptions, ExtractResult } from "@/core/ocr/ocr-service";
import { allLines, orderLines } from "@/core/ocr/normalize";
import type { OcrLanguage } from "@/core/ocr/types";

type LangChoice = "eng" | "hin" | "eng+hin";
type PrepChoice = "auto" | "none" | "contrast" | "upscale2" | "binarize";

declare global {
  interface Window {
    /** Automation hook for scripts/spikes/ocr/run.ts and the e2e tests (spike only). */
    spikeC?: {
      extract(src: string | Blob, opts?: ExtractOptions & { langs?: LangChoice }): Promise<unknown>;
      warmup(langs?: LangChoice): Promise<number>;
      cancel(): Promise<void>;
      dispose(): Promise<void>;
      lastProgress(): { events: number; last: number };
    };
  }
}

const langs = (c: LangChoice) => c.split("+") as OcrLanguage[];

/** Serialisable summary for automation (lines with boxes, no image data). */
function summarise(r: ExtractResult) {
  const line = (l: ReturnType<typeof allLines>[number]) => ({ text: l.text, bbox: l.bbox, confidence: l.confidence, words: l.words });
  return {
    rawText: r.rawText,
    editedText: r.editedText,
    confidence: r.confidence,
    language: r.language,
    preprocessing: r.preprocessing,
    parts: r.parts,
    fallbacks: r.fallbacks,
    timings: r.timings,
    durationMs: r.durationMs,
    blocks: r.blocks.length,
    engineLines: orderLines(r.blocks, "engine").map(line),
    topDownLines: orderLines(r.blocks, "top-down").map((l) => l.text),
    readingOrder: r.readingOrder,
    rotateRadians: r.rotateRadians ?? null,
  };
}

export function OcrSpike() {
  const serviceRef = useRef<OcrService | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lang, setLang] = useState<LangChoice>("eng");
  const [prep, setPrep] = useState<PrepChoice>("auto");
  const [order, setOrder] = useState<"auto" | "engine" | "top-down">("auto");
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [copied, setCopied] = useState(false);
  const progressCount = useRef({ events: 0, last: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const service = useCallback(async () => {
    if (!serviceRef.current) {
      // The OCR service module itself is a lazy chunk: 0 bytes of OCR code before intent.
      const [{ createOcrService }, vendor] = await Promise.all([import("@/core/ocr/ocr-service"), import("@/config/vendor-assets.json")]);
      // Spike-only fault injection for the error-code tests: ?assets=broken-model | broken-core
      const fault = new URLSearchParams(location.search).get("assets");
      const assets = { ...vendor.tesseract };
      if (fault === "broken-model") assets.langPath = "/vendor/tessdata/missing";
      if (fault === "broken-core") assets.corePath = "/vendor/tesseract-core/missing";
      serviceRef.current = createOcrService({ assets });
    }
    return serviceRef.current;
  }, []);

  useEffect(() => () => void serviceRef.current?.dispose(), []);

  const setImage = useCallback((blob: Blob) => {
    setFile(blob);
    setResult(null);
    setText("");
    setError(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
  }, []);

  // Clipboard-first: normal paste events only (no permission prompts). Same pipeline as files.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      setImage(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [setImage]);

  const run = useCallback(
    async (blob: Blob, o: ExtractOptions = {}) => {
      const svc = await service();
      setBusy(true);
      setError(null);
      progressCount.current = { events: 0, last: 0 };
      try {
        const r = await svc.extract(blob, {
          languages: o.languages ?? langs(lang),
          preprocessing: o.preprocessing ?? (prep === "auto" || prep === "none" ? prep : [prep]),
          readingOrder: o.readingOrder ?? order,
          ...o,
          onProgress: (p, stage) => {
            progressCount.current = { events: progressCount.current.events + 1, last: p };
            setProgress({ p, stage });
          },
        });
        setResult(r);
        setText(r.editedText);
        return r;
      } catch (e) {
        setError((e as { code?: string }).code ?? "OCR_RECOGNITION_FAILED");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [service, lang, prep, order],
  );

  useEffect(() => {
    window.spikeC = {
      async extract(src, opts = {}) {
        const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
        setImage(blob);
        const { langs: l, ...rest } = opts;
        // Main-thread heartbeat: the longest gap is what a user feels as a frozen tab.
        let last = performance.now();
        let maxStallMs = 0;
        const beat = setInterval(() => {
          const now = performance.now();
          maxStallMs = Math.max(maxStallMs, now - last);
          last = now;
        }, 10);
        const t0 = performance.now();
        try {
          const r = await run(blob, { ...rest, languages: l ? langs(l) : rest.languages });
          return { ok: true, wallMs: performance.now() - t0, maxStallMs: Math.round(maxStallMs), progressEvents: progressCount.current.events, ...summarise(r) };
        } catch (e) {
          return { ok: false, wallMs: performance.now() - t0, maxStallMs: Math.round(maxStallMs), code: (e as { code?: string }).code ?? "UNKNOWN" };
        } finally {
          clearInterval(beat);
        }
      },
      async warmup(l = "eng") {
        return (await service()).warmup(langs(l));
      },
      async cancel() {
        await serviceRef.current?.cancel();
      },
      async dispose() {
        await serviceRef.current?.dispose();
        serviceRef.current = null;
      },
      lastProgress: () => progressCount.current,
    };
    return () => {
      delete window.spikeC;
    };
  }, [run, service, setImage]);

  // Word-box overlay (searchable-PDF readiness check).
  useEffect(() => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img || !result) return;
    const draw = () => {
      const s = img.clientWidth / result.image.width;
      c.width = img.clientWidth;
      c.height = img.clientHeight;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      if (!showBoxes) return;
      ctx.strokeStyle = "rgba(255,0,120,.8)";
      for (const l of allLines(result.blocks)) for (const w of l.words) ctx.strokeRect(w.bbox.x * s, w.bbox.y * s, w.bbox.w * s, w.bbox.h * s);
    };
    if (img.complete) draw();
    else img.onload = draw;
  }, [result, showBoxes]);

  return (
    <main className="mx-auto max-w-6xl p-4 font-mono text-sm">
      <h1 className="text-lg font-bold">Spike C — OCR (developer prototype)</h1>
      <p className="mb-3 text-zinc-500">Paste (Ctrl/⌘+V) or choose a screenshot. Recognition runs locally in a Web Worker; nothing is uploaded.</p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input type="file" accept="image/png,image/jpeg,image/webp" data-testid="file-input" aria-label="Choose screenshot" onChange={(e) => e.target.files?.[0] && setImage(e.target.files[0])} />
        <label>
          Language{" "}
          <select value={lang} onChange={(e) => setLang(e.target.value as LangChoice)} data-testid="lang">
            <option value="eng">English</option>
            <option value="hin">Hindi</option>
            <option value="eng+hin">English + Hindi</option>
          </select>
        </label>
        <label>
          Preprocessing{" "}
          <select value={prep} onChange={(e) => setPrep(e.target.value as PrepChoice)}>
            {(["auto", "none", "contrast", "upscale2", "binarize"] as const).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Order{" "}
          <select value={order} onChange={(e) => setOrder(e.target.value as "auto" | "engine" | "top-down")}>
            <option value="auto">auto</option>
            <option value="engine">engine</option>
            <option value="top-down">top-down</option>
          </select>
        </label>
        <button className="min-h-11 border px-3" disabled={!file || busy} onClick={() => file && void run(file).catch(() => {})} data-testid="extract">
          Extract text
        </button>
        <button className="min-h-11 border px-3" disabled={!busy} onClick={() => void serviceRef.current?.cancel()} data-testid="cancel">
          Cancel
        </button>
      </div>

      <div role="status" aria-live="polite" data-testid="status" className="mb-2">
        {busy && progress ? `${progress.stage} — ${Math.round(progress.p * 100)}%` : result ? `Done in ${Math.round(result.timings.totalMs)} ms · confidence ${Math.round((result.confidence ?? 0) * 100)}% · ${result.parts} part(s)` : "Idle"}
      </div>
      {busy && <progress className="mb-2 w-full" max={1} value={progress?.p ?? 0} />}
      {error && (
        <p role="alert" className="mb-2 text-red-600" data-testid="error">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative">
          {previewUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={previewUrl} alt="Screenshot" className="max-h-[75vh] w-full object-contain object-top" />
              <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />
            </>
          )}
        </div>
        <div>
          <textarea className="h-[60vh] w-full border p-2" value={text} onChange={(e) => setText(e.target.value)} aria-label="Recognised text" data-testid="result-text" />
          <div className="mt-2 flex items-center gap-3">
            <button
              className="min-h-11 border px-3"
              disabled={!text}
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <label>
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> word boxes
            </label>
            {result && <span className="text-zinc-500">{result.fallbacks.join(", ")}</span>}
          </div>
        </div>
      </div>
    </main>
  );
}
