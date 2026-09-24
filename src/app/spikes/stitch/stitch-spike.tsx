"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateImageFile } from "@/core/image/validate";
import { describeConfidence } from "@/core/stitch/confidence";
import { createStitchEngine, type StitchAnalysisResult, type StitchEngine } from "@/core/stitch/engine";
import { offsetRange, planStitch } from "@/core/stitch/plan";

const PREVIEW_WIDTH = 360;

interface Shot {
  file: File;
  width: number;
  height: number;
  /** Downscaled preview bitmap — full-res pixels are never decoded on the main thread. */
  preview: ImageBitmap;
}

type ViewMode = "normal" | "difference";

async function loadShot(file: File): Promise<Shot> {
  const v = await validateImageFile(file);
  if (!v.ok) throw new Error(`${file.name}: ${v.code}`);
  // Probe dimensions cheaply, then create a small preview.
  const probe = await createImageBitmap(file);
  const { width, height } = probe;
  probe.close();
  const preview = await createImageBitmap(file, { resizeWidth: PREVIEW_WIDTH, resizeHeight: Math.max(1, Math.round((height * PREVIEW_WIDTH) / width)), resizeQuality: "medium" });
  return { file, width, height, preview };
}

export function StitchSpike() {
  const engineRef = useRef<StitchEngine | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [analysis, setAnalysis] = useState<StitchAnalysisResult | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const [mode, setMode] = useState<ViewMode>("normal");
  const [status, setStatus] = useState("Choose or paste two screenshots (top one first).");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportUrl, setExportUrl] = useState<{ url: string; bytes: number; ms: number; w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);
  const engine = () => (engineRef.current ??= createStitchEngine());

  const a = shots[0];
  const b = shots[1];

  const runAnalysis = useCallback(async (pair: Shot[]) => {
    const [a, b] = pair;
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    setStatus("Analysing locally…");
    try {
      const res = await engine().analyse(a.file, b.file, { onProgress: (p, stage) => setStatus(`Analysing locally… ${Math.round(p * 100)}% (${stage ?? ""})`) });
      setAnalysis(res);
      setOffset(res.offsetY);
      setStatus(res.status === "matched" ? describeConfidence(res.confidence, res.confidenceClass) : `No reliable overlap found (${res.reason}). Placed end to end — adjust manually.`);
    } catch (e) {
      setError(`Analysis failed: ${(e as Error).message}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    try {
      const loaded = await Promise.all(files.slice(0, 2).map(loadShot));
      setShots((prev) => {
        prev.forEach((s) => s.preview.close());
        return loaded;
      });
      setAnalysis(null);
      setOffset(null);
      setExportUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      if (loaded.length === 2) void runAnalysis(loaded);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [runAnalysis]);

  // Normal paste events only — no clipboard permission prompts (architecture §14).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      // Pasting one image at a time appends it as the next screenshot.
      if (files.length === 1 && shots.length === 1) void addFiles([shots[0].file, files[0]]);
      else void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, shots]);

  const bands = useMemo(() => analysis?.bands ?? { top: 0, bottom: 0 }, [analysis]);
  const plan = useMemo(() => (a && b && offset !== null ? planStitch(a, b, offset, bands) : null), [a, b, offset, bands]);
  const range = a ? offsetRange(a) : { min: 1, max: 1 };
  const manuallyAdjusted = analysis !== null && offset !== analysis.offsetY;

  // Preview render (downscaled bitmaps only).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plan || !a || !b) return;
    const s = PREVIEW_WIDTH / plan.width;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.max(1, Math.round(plan.height * s));
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const draw = (shot: Shot, sy: number, h: number, dy: number) => {
      const k = shot.preview.width / shot.width;
      ctx.drawImage(shot.preview, 0, sy * k, shot.preview.width, h * k, 0, dy * s, shot.width * s, h * s);
    };
    if (mode === "normal") {
      for (const seg of plan.segments) draw(seg.source === "a" ? a : b, seg.sy, seg.height, seg.dy);
      ctx.strokeStyle = "rgba(255,0,128,.9)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, plan.seamY * s + 0.5);
      ctx.lineTo(canvas.width, plan.seamY * s + 0.5);
      ctx.stroke();
    } else {
      // Difference: A at 0, B at offset; aligned overlap turns black.
      draw(a, 0, a.height, 0);
      ctx.globalCompositeOperation = "difference";
      draw(b, 0, b.height, plan.offsetY);
      ctx.globalCompositeOperation = "source-over";
    }
  }, [plan, mode, a, b]);

  const nudge = (delta: number) => setOffset((o) => (o === null ? o : Math.min(range.max, Math.max(range.min, o + delta))));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge((e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
  };

  const doExport = async () => {
    if (!a || !b || !plan) return;
    setBusy(true);
    setStatus("Composing full-resolution image locally…");
    try {
      const { blob, ms } = await engine().compose(a.file, b.file, plan, { type: "image/png" });
      setExportUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), bytes: blob.size, ms, w: plan.width, h: plan.height };
      });
      setStatus("Stitched image ready.");
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const resultJson = analysis && plan
    ? JSON.stringify({
        detectedOffsetY: analysis.detectedOffsetY,
        offsetY: analysis.offsetY,
        overlap: analysis.overlap,
        confidence: analysis.confidence,
        confidenceClass: analysis.confidenceClass,
        status: analysis.status,
        reason: analysis.reason ?? null,
        bandHypothesis: analysis.bandHypothesis,
        timings: analysis.timings,
        engineLoadMs: analysis.engineLoadMs,
        decodeMs: analysis.decodeMs,
        currentOffset: plan.offsetY,
        outputHeight: plan.height,
      })
    : "";

  return (
    <main className="mx-auto max-w-5xl p-4 font-mono text-sm">
      <h1 className="text-lg font-bold">Spike A — Smart Stitch (developer prototype)</h1>
      <p className="mb-3 text-zinc-500">Everything runs in this tab. Files are never uploaded.</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          data-testid="file-input"
          aria-label="Choose two screenshots"
          onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
        />
        <button className="border px-2 py-1" disabled={shots.length !== 2 || busy} onClick={() => {
            const swapped = [shots[1], shots[0]];
            setShots(swapped);
            void runAnalysis(swapped);
          }}>
          Swap A/B
        </button>
        <button className="border px-2 py-1" disabled={shots.length !== 2 || busy} onClick={() => void runAnalysis(shots)}>
          Re-analyse
        </button>
      </div>

      <p role="status" aria-live="polite" data-testid="status" className="mb-2">
        {status}
      </p>
      {error && (
        <p role="alert" className="mb-2 text-red-600">
          {error}
        </p>
      )}

      {a && b && (
        <p className="mb-2 text-zinc-500">
          A: {a.width}×{a.height} · B: {b.width}×{b.height}
        </p>
      )}

      {plan && analysis && (
        <div className="grid gap-4 md:grid-cols-[380px_1fr]">
          <div>
            <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Preview mode">
              {(["normal", "difference"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {m}
                </label>
              ))}
            </div>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              onKeyDown={onKey}
              aria-label="Stitch preview. Arrow keys move screenshot B by 1 pixel, Shift+Arrow by 10."
              className="max-h-[80vh] w-[360px] overflow-auto border outline-offset-2 focus:outline-2"
            />
          </div>

          <div className="space-y-3">
            <fieldset className="border p-2">
              <legend>Manual offset (B relative to A, full-res px)</legend>
              <div className="flex flex-wrap items-center gap-2">
                <button className="min-h-11 min-w-11 border" onClick={() => nudge(-10)} aria-label="Move B up 10 pixels">−10</button>
                <button className="min-h-11 min-w-11 border" onClick={() => nudge(-1)} aria-label="Move B up 1 pixel">−1</button>
                <input
                  type="number"
                  data-testid="offset-input"
                  className="w-24 border px-1"
                  min={range.min}
                  max={range.max}
                  value={offset ?? 0}
                  onChange={(e) => setOffset(Math.min(range.max, Math.max(range.min, Number(e.target.value) || range.min)))}
                  aria-label="Offset in pixels"
                />
                <button className="min-h-11 min-w-11 border" onClick={() => nudge(1)} aria-label="Move B down 1 pixel">+1</button>
                <button className="min-h-11 min-w-11 border" onClick={() => nudge(10)} aria-label="Move B down 10 pixels">+10</button>
                <button className="min-h-11 border px-2" disabled={!manuallyAdjusted} onClick={() => setOffset(analysis.offsetY)}>
                  Reset to automatic
                </button>
              </div>
              <input
                type="range"
                className="mt-2 w-full"
                min={range.min}
                max={range.max}
                value={offset ?? 0}
                onChange={(e) => setOffset(Number(e.target.value))}
                aria-label="Offset slider"
              />
              <p>
                offset {plan.offsetY}px · overlap {a!.height - plan.offsetY}px · seam at A row {plan.seamY} · output {plan.width}×{plan.height}
                {manuallyAdjusted && " · manually adjusted"}
              </p>
            </fieldset>

            <table className="w-full border-collapse [&_td]:border [&_td]:px-1">
              <tbody>
                <tr><td>status</td><td>{analysis.status}{analysis.reason ? ` (${analysis.reason})` : ""}</td></tr>
                <tr><td>confidence</td><td>{(analysis.confidence * 100).toFixed(1)}% — {analysis.confidenceClass}</td></tr>
                <tr><td>detected offset / overlap</td><td>{analysis.detectedOffsetY ?? "—"} / {analysis.detectedOffsetY !== null ? a!.height - analysis.detectedOffsetY : "—"}</td></tr>
                <tr><td>breakdown</td><td>{Object.entries(analysis.breakdown).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") || "none" : (v as number).toFixed(2)}`).join("  ")}</td></tr>
                <tr><td>bands (full-res)</td><td>top {analysis.bands.top} · bottom {analysis.bands.bottom} · hypothesis {analysis.bandHypothesis}</td></tr>
                <tr><td>seam MAD / ink mismatch</td><td>{analysis.seamResidual.toFixed(2)} / {(analysis.inkMismatch * 100).toFixed(1)}%</td></tr>
                <tr><td>timings ms</td><td>engine load {analysis.engineLoadMs} · decode {analysis.decodeMs} · {Object.entries(analysis.timings).map(([k, v]) => `${k} ${v}`).join(" · ")}</td></tr>
              </tbody>
            </table>

            <div className="flex items-center gap-2">
              <button className="min-h-11 border px-3" disabled={busy} onClick={() => void doExport()} data-testid="export">
                Export full-resolution PNG
              </button>
              {exportUrl && (
                <a className="underline" href={exportUrl.url} download="stitched.png" data-testid="download">
                  Download stitched.png ({exportUrl.w}×{exportUrl.h}, {(exportUrl.bytes / 1024).toFixed(0)} KiB, {exportUrl.ms} ms)
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <output hidden data-testid="stitch-result">{resultJson}</output>
    </main>
  );
}
