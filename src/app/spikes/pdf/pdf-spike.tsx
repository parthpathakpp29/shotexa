"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addBreak, moveBreak, removeBreak, snapTo, validateBreaks, type BreakLimits } from "@/core/pdf/breaks";
import { PdfError } from "@/core/pdf/errors";
import type { AnalysedSet, ShotexaPdfEngine } from "@/core/pdf/pdf-engine";
import type { OcrLineBox, PageBreak, PageSetup, PaginationMode, PaginationPlan, PaperSize } from "@/core/pdf/types";

/** One screenshot in the job. Analysis (signals) is cached per item, so reorder is free. */
interface Item {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  analysis: AnalysedSet["images"][number];
  /** Manual anchors (automatic breaks re-planned around them). */
  manual: number[];
  /** Frozen layout after a delete: exactly these breaks, no re-planning. */
  frozen?: number[];
  ocrLines?: OcrLineBox[];
}

interface Selected {
  item: string;
  y: number;
}

const PREVIEW_W = 300;
const ARROW_PX = 4;
const SHIFT_ARROW_PX = 40;
const SNAP_PX = 24;
const MIN_GAP_PX = 48;

declare global {
  interface Window {
    /** Automation hook for scripts/spikes/pdf/run.ts and the e2e tests (spike only). */
    spikeD?: {
      load(srcs: (string | Blob)[]): Promise<{ wallMs: number; decodeMs: number; signalMs: number; path: string; decoders: string[]; sizes: string[]; maxStallMs: number }>;
      configure(o: { paper?: PaperSize; marginPt?: number; overlapPx?: number; mode?: PaginationMode }): void;
      setOcrLines(index: number, lines: OcrLineBox[]): void;
      runOcr(index: number): Promise<{ ms: number; lines: number }>;
      plan(): ReturnType<typeof serialisePlan>;
      moveBreak(index: number, breakIndex: number, y: number, snap?: boolean): void;
      addBreak(index: number, y: number): void;
      removeBreak(index: number, breakIndex: number): void;
      reset(index?: number): void;
      reorder(from: number, to: number): void;
      exportPdf(o?: { format?: "jpeg" | "png"; quality?: number; cancelAfterMs?: number; returnBytes?: boolean }): Promise<unknown>;
      clear(): void;
    };
  }
}

function serialisePlan(plan: PaginationPlan | null, items: Item[]) {
  if (!plan) return null;
  return {
    mode: plan.mode,
    setup: plan.setup,
    images: plan.images.map((im, i) => ({
      name: items[i]?.name,
      width: im.width,
      height: im.height,
      capacityPx: im.capacityPx,
      breaks: im.breaks.map((b) => ({ y: b.y, idealY: b.idealY, source: b.source, confidence: b.confidence, needsReview: b.needsReview ?? false, reasons: b.reasons })),
    })),
    pages: plan.pages,
    planMs: plan.analysisMs,
  };
}

const colour = (b: PageBreak) => (b.source === "manual" ? "#2563eb" : b.confidence === "high" ? "#16a34a" : b.confidence === "medium" ? "#d97706" : b.confidence === "low" ? "#dc2626" : "#6b7280");

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

async function toBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result as string);
    fr.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

function planWith(e: ShotexaPdfEngine | null, list: Item[], s: PageSetup, m: PaginationMode): PaginationPlan | null {
  if (!e || !list.length) return null;
  const set: AnalysedSet = { images: list.map((i) => i.analysis), decodeMs: 0, signalMs: 0, wallMs: 0, path: "worker", decoders: [] };
  return e.plan(set, s, m, { ocrLines: list.map((i) => i.ocrLines), manual: list.map((i) => i.manual), frozen: list.map((i) => i.frozen) });
}

export function PdfSpike() {
  const engineRef = useRef<ShotexaPdfEngine | null>(null);
  const [eng, setEng] = useState<ShotexaPdfEngine | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [marginPt, setMarginPt] = useState(28);
  const [overlapPx, setOverlapPx] = useState(0);
  const [mode, setMode] = useState<PaginationMode>("visual");
  const [snap, setSnap] = useState(true);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; pages: number; ms: number; path: string; tileRows: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [cancellable, setCancellable] = useState(false);
  // ?preview=0 hides the full-size <img> previews so the runner measures the engine alone
  // (a full-resolution preview decode of a 1080×20000 screenshot is ~85 MB by itself).
  const [showPreview] = useState(() => typeof location === "undefined" || new URLSearchParams(location.search).get("preview") !== "0");

  const engine = useCallback(async () => {
    if (!engineRef.current) {
      // Lazy: the PDF engine (and later pdf-lib inside the worker) loads only on intent.
      const { createPdfEngine } = await import("@/core/pdf/pdf-engine");
      engineRef.current = createPdfEngine();
      setEng(engineRef.current);
    }
    return engineRef.current;
  }, []);
  useEffect(() => () => engineRef.current?.dispose(), []);

  const setup: PageSetup = useMemo(() => ({ paper, orientation: "portrait", marginPt, overlapPx }), [paper, marginPt, overlapPx]);
  const setupRef = useRef(setup);
  const modeRef = useRef(mode);
  // Event handlers + the automation API read these; they must not wait for a re-render.
  const computePlan = useCallback((list: Item[], s: PageSetup, m: PaginationMode) => planWith(engineRef.current, list, s, m), []);
  const plan = useMemo(() => planWith(eng, items, setup, mode), [eng, items, setup, mode]);
  const planRef = useRef(plan);
  useEffect(() => {
    itemsRef.current = items;
    setupRef.current = setup;
    modeRef.current = mode;
    planRef.current = plan;
  }, [items, setup, mode, plan]);

  const addFiles = useCallback(
    async (srcs: (string | Blob)[]) => {
      const e = await engine();
      const blobs = await Promise.all(srcs.map(async (s) => (typeof s === "string" ? (await fetch(s)).blob() : s)));
      setBusy("Analysing…");
      setError(null);
      try {
        const set = await e.analyse(blobs, { onProgress: (p, s) => setProgress({ p, stage: s ?? "" }) });
        const next = blobs.map((blob, i) => ({
          id: crypto.randomUUID(),
          name: (blob as File).name ?? (typeof srcs[i] === "string" ? String(srcs[i]).split("/").slice(-2).join("/") : `image ${i + 1}`),
          blob,
          url: URL.createObjectURL(blob),
          analysis: set.images[i],
          manual: [],
        }));
        setItems((old) => [...old, ...next]);
        itemsRef.current = [...itemsRef.current, ...next];
        return set;
      } catch (err) {
        setError(err instanceof PdfError ? err.code : "PDF_ANALYSIS_FAILED");
        throw err;
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [engine],
  );

  // Clipboard-first: normal paste events only.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((x) => x.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files).catch(() => undefined); // shown via `error`
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const updateItem = useCallback((id: string, f: (i: Item) => Item) => {
    const next = itemsRef.current.map((i) => (i.id === id ? f(i) : i));
    itemsRef.current = next;
    setItems(next);
  }, []);

  const limits = (it: Item): BreakLimits => ({ height: it.analysis.height, minGapPx: MIN_GAP_PX });

  /** Apply an edited break list: frozen items keep it verbatim, others keep only manual anchors. */
  const applyBreaks = useCallback(
    (it: Item, next: PageBreak[]) => updateItem(it.id, (i) => (i.frozen ? { ...i, frozen: next.map((b) => b.y) } : { ...i, manual: next.filter((b) => b.source === "manual").map((b) => b.y) })),
    [updateItem],
  );

  // Always from the latest items (a drag fires faster than React re-renders); re-planning is < 1 ms.
  const breaksOf = useCallback(
    (itemIndex: number): PageBreak[] => {
      planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
      return planRef.current?.images[itemIndex]?.breaks ?? [];
    },
    [computePlan],
  );

  const doMove = useCallback(
    (itemIndex: number, breakIndex: number, y: number, withSnap: boolean) => {
      const it = itemsRef.current[itemIndex];
      const list = breaksOf(itemIndex);
      const b = list[breakIndex];
      if (!it || !b) return;
      const yy = withSnap ? snapTo(y, it.analysis.safeYs, SNAP_PX) : y;
      const next = moveBreak(list, b.id, yy, limits(it));
      const moved = next.find((x) => x.id === b.id)!;
      applyBreaks(it, next);
      setSelected({ item: it.id, y: moved.y });
    },
    [applyBreaks, breaksOf],
  );

  const doAdd = useCallback(
    (itemIndex: number, y: number) => {
      const it = itemsRef.current[itemIndex];
      if (!it) return;
      const yy = snap ? snapTo(Math.round(y), it.analysis.safeYs, SNAP_PX) : Math.round(y);
      const next = addBreak(breaksOf(itemIndex), yy, limits(it), `add-${yy}`);
      applyBreaks(it, next);
      setSelected({ item: it.id, y: yy });
    },
    [applyBreaks, breaksOf, snap],
  );

  const doRemove = useCallback(
    (itemIndex: number, breakIndex: number) => {
      const it = itemsRef.current[itemIndex];
      const list = breaksOf(itemIndex);
      const b = list[breakIndex];
      if (!it || !b) return;
      // Deleting freezes this image's layout (else re-planning would recreate the break);
      // the merged page is shrunk to fit.
      const next = removeBreak(list, b.id);
      updateItem(it.id, (i) => ({ ...i, frozen: next.map((x) => x.y) }));
      setSelected(null);
    },
    [breaksOf, updateItem],
  );

  const doReset = useCallback(
    (itemIndex?: number) => {
      for (const [k, it] of itemsRef.current.entries()) if (itemIndex === undefined || k === itemIndex) updateItem(it.id, (i) => ({ ...i, manual: [], frozen: undefined }));
      setSelected(null);
    },
    [updateItem],
  );

  const reorder = useCallback((from: number, to: number) => {
    const next = [...itemsRef.current];
    if (to < 0 || to >= next.length) return;
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const runOcr = useCallback(
    async (itemIndex: number) => {
      const it = itemsRef.current[itemIndex];
      if (!it) return { ms: 0, lines: 0 };
      setBusy("OCR (for PDF)…");
      try {
        const [{ createOcrService }, { allLines }, vendor] = await Promise.all([import("@/core/ocr/ocr-service"), import("@/core/ocr/normalize"), import("@/config/vendor-assets.json")]);
        const svc = createOcrService({ assets: vendor.tesseract });
        const t = performance.now();
        const r = await svc.extract(it.blob, { languages: ["eng"], onProgress: (p, stage) => setProgress({ p, stage }) });
        const ms = performance.now() - t;
        await svc.dispose();
        const lines = allLines(r.blocks).map((l) => ({ y: l.bbox.y, h: l.bbox.h }));
        updateItem(it.id, (i) => ({ ...i, ocrLines: lines }));
        return { ms, lines: lines.length };
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [updateItem],
  );

  const invalid = useMemo(() => {
    if (!plan) return [];
    return plan.images.flatMap((im, i) => validateBreaks(im.breaks, { height: im.height, minGapPx: 1 }).map((e) => `${items[i]?.name}: ${e}`));
  }, [plan, items]);

  const exportPdf = useCallback(
    async (o: { format?: "jpeg" | "png"; quality?: number; cancelAfterMs?: number } = {}) => {
      const e = await engine();
      const p = planRef.current;
      if (!p) throw new PdfError("PDF_INVALID_BREAKS", "no plan");
      if (invalid.length) throw new PdfError("PDF_INVALID_BREAKS", invalid.join(", "));
      const ac = new AbortController();
      abortRef.current = ac;
      setCancellable(true);
      if (o.cancelAfterMs !== undefined) setTimeout(() => ac.abort(), o.cancelAfterMs);
      setBusy("Creating PDF…");
      setError(null);
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return null;
      });
      let events = 0;
      const stopBeat = heartbeat();
      const t = performance.now();
      try {
        const r = await e.createPdf(
          { images: itemsRef.current.map((i) => i.blob), plan: p, imageFormat: o.format ?? format, jpegQuality: o.quality ?? 0.9, title: "Shotexa screenshots" },
          {
            signal: ac.signal,
            onProgress: (f, s) => {
              events++;
              setProgress({ p: f, stage: s ?? "" });
            },
          },
        );
        const url = URL.createObjectURL(r.blob);
        setResult({ url, size: r.blob.size, pages: r.pages, ms: r.ms, path: r.path, tileRows: r.tileRows });
        return { blob: r.blob, size: r.blob.size, pages: r.pages, ms: r.ms, wallMs: performance.now() - t, path: r.path, tileRows: r.tileRows, progressEvents: events, maxStallMs: stopBeat() };
      } catch (err) {
        const code = err instanceof PdfError ? err.code : "PDF_EXPORT_FAILED";
        setError(code);
        throw Object.assign(new Error(code), { code, wallMs: performance.now() - t, progressEvents: events, maxStallMs: stopBeat() });
      } finally {
        stopBeat();
        setBusy(null);
        setProgress(null);
        abortRef.current = null;
        setCancellable(false);
      }
    },
    [engine, format, invalid],
  );

  // Automation API.
  const exportRef = useRef(exportPdf);
  useEffect(() => {
    exportRef.current = exportPdf;
  }, [exportPdf]);
  useEffect(() => {
    window.spikeD = {
      async load(srcs) {
        const blobs = await Promise.all(srcs.map(async (s) => (typeof s === "string" ? (await fetch(s)).blob() : s)));
        const stop = heartbeat();
        const set = await addFiles(blobs);
        return { maxStallMs: stop(), wallMs: set.wallMs, decodeMs: set.decodeMs, signalMs: set.signalMs, path: set.path, decoders: set.decoders, sizes: set.images.map((i) => `${i.width}x${i.height}`) };
      },
      configure(o) {
        if (o.paper) setPaper(o.paper);
        if (o.marginPt !== undefined) setMarginPt(o.marginPt);
        if (o.overlapPx !== undefined) setOverlapPx(o.overlapPx);
        if (o.mode) setMode(o.mode);
        // Keep refs current synchronously for immediate plan() calls.
        const s = { ...setupRef.current, ...(o.paper && { paper: o.paper }), ...(o.marginPt !== undefined && { marginPt: o.marginPt }), ...(o.overlapPx !== undefined && { overlapPx: o.overlapPx }) };
        setupRef.current = s;
        if (o.mode) modeRef.current = o.mode;
        planRef.current = computePlan(itemsRef.current, s, modeRef.current);
      },
      setOcrLines(index, lines) {
        const it = itemsRef.current[index];
        if (it) updateItem(it.id, (i) => ({ ...i, ocrLines: lines }));
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
      },
      runOcr: (i) => runOcr(i),
      plan: () => {
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
        return serialisePlan(planRef.current, itemsRef.current);
      },
      moveBreak(i, b, y, s = false) {
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
        doMove(i, b, y, s);
      },
      addBreak(i, y) {
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
        doAdd(i, y);
      },
      removeBreak(i, b) {
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
        doRemove(i, b);
      },
      reset: (i) => doReset(i),
      reorder: (a, b) => reorder(a, b),
      async exportPdf(o = {}) {
        planRef.current = computePlan(itemsRef.current, setupRef.current, modeRef.current);
        try {
          const { blob, ...rest } = await exportRef.current(o);
          return { ok: true, ...rest, bytes: o.returnBytes ? await toBase64(blob) : undefined };
        } catch (e) {
          const { code, wallMs, progressEvents, maxStallMs } = e as Record<string, unknown>;
          return { ok: false, code, wallMs, progressEvents, maxStallMs };
        }
      },
      clear() {
        for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
        itemsRef.current = [];
        setItems([]);
        setSelected(null);
        engineRef.current?.dispose();
        engineRef.current = null;
        setEng(null);
      },
    };
    return () => {
      delete window.spikeD;
    };
  }, [addFiles, computePlan, doAdd, doMove, doRemove, doReset, reorder, runOcr, updateItem]);

  // Selected break (resolved against the current plan).
  const sel = useMemo(() => {
    if (!selected || !plan) return null;
    const ii = items.findIndex((i) => i.id === selected.item);
    if (ii < 0) return null;
    const bi = plan.images[ii].breaks.findIndex((b) => b.y === selected.y);
    return bi < 0 ? null : { ii, bi, b: plan.images[ii].breaks[bi], cap: plan.images[ii].capacityPx };
  }, [selected, plan, items]);

  const onBreakKey = (e: React.KeyboardEvent, ii: number, bi: number, y: number) => {
    const step = e.shiftKey ? SHIFT_ARROW_PX : ARROW_PX;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      doMove(ii, bi, y + (e.key === "ArrowUp" ? -step : step), false);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      doRemove(ii, bi);
    } else if (e.key === "Enter" || e.key === "s") {
      e.preventDefault();
      doMove(ii, bi, y, true);
    }
  };

  // Pointer drag of a break line (preview px → image px).
  const drag = useRef<{ ii: number; bi: number; scale: number; startY: number; startClient: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent, ii: number, bi: number, y: number, scale: number) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { ii, bi, scale, startY: y, startClient: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const y = d.startY + (e.clientY - d.startClient) / d.scale;
    doMove(d.ii, d.bi, y, false);
    const nb = planRef.current?.images[d.ii]?.breaks.findIndex((b) => b.y === Math.round(y));
    if (nb !== undefined && nb >= 0) d.bi = nb;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !snap) return;
    const y = d.startY + (e.clientY - d.startClient) / d.scale;
    doMove(d.ii, d.bi, y, true);
  };

  const pagesPerImage = (ii: number) => plan?.pages.filter((p) => p.imageIndex === ii) ?? [];

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1400, margin: "0 auto", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20 }}>Spike D — Smart screenshot → PDF (developer prototype)</h1>
      <p style={{ color: "#555", fontSize: 13 }}>Screenshots stay on this device. Drag a break line, or focus it and use ↑/↓ (Shift = ×10), Delete, Enter/S = snap. Double-click the image to add a break.</p>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 14, marginBottom: 12 }}>
        <input type="file" accept="image/*" multiple aria-label="Add screenshots" onChange={(e) => e.target.files && void addFiles(Array.from(e.target.files)).catch(() => undefined)} />
        <label>
          Paper{" "}
          <select aria-label="Paper" value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
            <option value="fit">Fit (one page per image)</option>
          </select>
        </label>
        <label>
          Margin pt <input aria-label="Margin" type="number" min={0} max={72} value={marginPt} onChange={(e) => setMarginPt(Number(e.target.value))} style={{ width: 56 }} />
        </label>
        <label>
          Overlap px <input aria-label="Overlap" type="number" min={0} max={200} value={overlapPx} onChange={(e) => setOverlapPx(Number(e.target.value))} style={{ width: 56 }} />
        </label>
        <label>
          Mode{" "}
          <select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaginationMode)}>
            <option value="fixed">Fixed</option>
            <option value="visual">Smart (visual)</option>
            <option value="ocr">Smart (OCR-assisted)</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to safe gaps
        </label>
        <label>
          Image{" "}
          <select aria-label="Image format" value={format} onChange={(e) => setFormat(e.target.value as "jpeg" | "png")}>
            <option value="jpeg">JPEG 0.9</option>
            <option value="png">PNG (lossless)</option>
          </select>
        </label>
        <button onClick={() => doReset()} disabled={!items.length}>
          Reset all breaks
        </button>
        <button onClick={() => void exportPdf().catch(() => undefined)} disabled={!items.length || !!busy}>
          Create PDF
        </button>
        {cancellable && <button onClick={() => abortRef.current?.abort()}>Cancel</button>}
      </section>

      {busy && (
        <p role="status">
          {busy} {progress && `${Math.round(progress.p * 100)}% — ${progress.stage}`}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="error" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
      {invalid.length > 0 && <p style={{ color: "#b91c1c" }}>Invalid breaks: {invalid.join(", ")}</p>}
      {result && (
        <p data-testid="pdf-result" data-tile-rows={result.tileRows}>
          PDF ready: {result.pages} pages, {(result.size / 1024).toFixed(0)} KB, {result.ms} ms ({result.path}).{" "}
          <a href={result.url} download="shotexa.pdf">
            Download
          </a>{" "}
          ·{" "}
          <a href={result.url} target="_blank" rel="noreferrer">
            Open
          </a>
        </p>
      )}
      {plan && (
        <p style={{ fontSize: 13 }} data-testid="plan-summary">
          {plan.pages.length} pages · {plan.images.reduce((s, i) => s + i.breaks.filter((b) => b.needsReview).length, 0)} breaks need review · plan {plan.analysisMs.toFixed(1)} ms
        </p>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 16, overflowX: "auto", flex: 1 }}>
          {items.map((it, ii) => {
            const im = plan?.images[ii];
            const scale = PREVIEW_W / it.analysis.width;
            return (
              <figure key={it.id} style={{ margin: 0, flex: "none" }} data-testid={`image-${ii}`}>
                <figcaption style={{ fontSize: 12, marginBottom: 4, display: "flex", gap: 4, alignItems: "center" }}>
                  <strong>{ii + 1}.</strong> {it.name} ({it.analysis.width}×{it.analysis.height}) · {pagesPerImage(ii).length} p
                  <button aria-label={`Move image ${ii + 1} up`} onClick={() => reorder(ii, ii - 1)} disabled={ii === 0}>
                    ←
                  </button>
                  <button aria-label={`Move image ${ii + 1} down`} onClick={() => reorder(ii, ii + 1)} disabled={ii === items.length - 1}>
                    →
                  </button>
                  <button aria-label={`Reset image ${ii + 1}`} onClick={() => doReset(ii)}>
                    reset
                  </button>
                  <button aria-label={`OCR image ${ii + 1}`} onClick={() => void runOcr(ii)} disabled={!!busy} title="Run OCR for OCR-assisted pagination">
                    OCR{it.ocrLines ? " ✓" : ""}
                  </button>
                  {it.frozen && <em title="A deleted break froze this image's layout">frozen</em>}
                </figcaption>
                <div style={{ position: "relative", width: PREVIEW_W }} onDoubleClick={(e) => doAdd(ii, (e.clientY - e.currentTarget.getBoundingClientRect().top) / scale)}>
                  {showPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                    <img src={it.url} alt={it.name} width={PREVIEW_W} style={{ display: "block", border: "1px solid #ddd" }} draggable={false} />
                  ) : (
                    <div style={{ width: PREVIEW_W, height: it.analysis.height * scale, background: "#f3f4f6" }} />
                  )}
                  {im?.breaks.map((b, bi) => {
                    const isSel = sel?.ii === ii && sel.bi === bi;
                    return (
                      <div key={bi}>
                        {b.idealY !== undefined && b.idealY !== b.y && (
                          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: b.idealY * scale, borderTop: "1px dashed #9ca3af" }} />
                        )}
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label={`Page break ${bi + 1} of image ${ii + 1}`}
                          aria-valuemin={0}
                          aria-valuemax={it.analysis.height}
                          aria-valuenow={b.y}
                          data-confidence={b.confidence ?? "n/a"}
                          data-source={b.source}
                          onFocus={() => setSelected({ item: it.id, y: b.y })}
                          onKeyDown={(e) => onBreakKey(e, ii, bi, b.y)}
                          onPointerDown={(e) => onPointerDown(e, ii, bi, b.y, scale)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          style={{ position: "absolute", left: -6, right: -6, top: b.y * scale - 6, height: 12, cursor: "ns-resize", touchAction: "none", outline: "none" }}
                        >
                          <div style={{ marginTop: 5, borderTop: `${isSel ? 3 : 2}px solid ${colour(b)}`, boxShadow: isSel ? `0 0 0 2px ${colour(b)}55` : undefined }} />
                          {b.needsReview && <span style={{ position: "absolute", right: 0, top: -10, fontSize: 10, background: "#dc2626", color: "white", padding: "0 3px" }}>review</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </figure>
            );
          })}
        </div>

        <aside style={{ width: 300, fontSize: 13, position: "sticky", top: 8 }} data-testid="break-details">
          <h2 style={{ fontSize: 15 }}>Selected break</h2>
          {sel ? (
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px" }}>
              <dt>Image / break</dt>
              <dd>
                {sel.ii + 1} / {sel.bi + 1}
              </dd>
              <dt>Selected y</dt>
              <dd>{sel.b.y}px</dd>
              <dt>Ideal y</dt>
              <dd>{sel.b.idealY ?? "—"}</dd>
              <dt>Shift</dt>
              <dd>{sel.b.idealY !== undefined ? `${sel.b.y - sel.b.idealY}px (${(((sel.b.y - sel.b.idealY) / sel.cap) * 100).toFixed(1)}% of page)` : "—"}</dd>
              <dt>Source</dt>
              <dd>{sel.b.source}</dd>
              <dt>Confidence</dt>
              <dd style={{ color: colour(sel.b) }}>{sel.b.confidence ?? "—"}</dd>
              <dt>Reasons</dt>
              <dd>
                <ul style={{ margin: 0, paddingLeft: 16 }}>{(sel.b.reasons ?? ["set by you"]).map((r) => <li key={r}>{r}</li>)}</ul>
              </dd>
            </dl>
          ) : (
            <p>Focus or drag a break line.</p>
          )}
          <p style={{ color: "#555" }}>
            Legend: <span style={{ color: "#16a34a" }}>high</span> · <span style={{ color: "#d97706" }}>medium</span> · <span style={{ color: "#dc2626" }}>low (review)</span> · <span style={{ color: "#2563eb" }}>manual</span> · dashed = ideal cut
          </p>
          {plan && (
            <details>
              <summary>Pages ({plan.pages.length})</summary>
              <ol style={{ paddingLeft: 18 }}>
                {plan.pages.map((p, k) => (
                  <li key={k}>
                    img {p.imageIndex + 1}: {p.y0}–{p.y1} ({p.y1 - p.y0}px){p.fitScale < 1 ? ` · shrunk to ${(p.fitScale * 100).toFixed(0)}%` : ""}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </aside>
      </div>
    </main>
  );
}
