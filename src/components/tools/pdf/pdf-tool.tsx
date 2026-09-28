"use client";

import { AlertTriangle, Check, Download, FileText, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { addBreak, moveBreak, removeBreak, snapTo, validateBreaks } from "@/core/pdf/breaks";
import type { PageBreak, PageSetup } from "@/core/pdf/types";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import type { FileId, PdfBreakEdit } from "@/core/runtime/types";
import { PdfInspector, type SelectedPdfBreak } from "./pdf-inspector";
import { PdfPreview } from "./pdf-preview";

const MIN_GAP_PX = 48;
const SNAP_PX = 24;
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function PdfTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((state) => state.order.length);
  return count === 0 ? <>{landing}</> : <PdfWorkspace />;
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function PdfWorkspace() {
  const { runtime } = useWorkspaceContext();
  const order = useWorkspace((state) => state.order);
  const files = useWorkspace((state) => state.files);
  const selectedId = useWorkspace((state) => state.selectedId);
  const session = useWorkspace((state) => state.pdf);
  const setInputs = useWorkspace((state) => state.setPdfInputs);
  const setSettings = useWorkspace((state) => state.setPdfSettings);
  const setStatus = useWorkspace((state) => state.setPdfStatus);
  const setPlan = useWorkspace((state) => state.setPdfPlan);
  const setSelectedBreak = useWorkspace((state) => state.selectPdfBreak);
  const setBreakEdit = useWorkspace((state) => state.setPdfBreakEdit);
  const lastDocument = useWorkspace((state) => state.pdf.lastDocumentId ? state.documents[state.pdf.lastDocumentId] : undefined);

  const inputIds = useMemo(() => {
    const selected = selectedId ? files[selectedId] : undefined;
    if (selected?.kind === "artifact") return [selected.id];
    const originals = order.filter((id) => files[id]?.kind === "original");
    return originals.length ? originals : selected ? [selected.id] : [];
  }, [order, files, selectedId]);
  const inputSignature = inputIds.join("|");
  const editSignature = JSON.stringify(inputIds.map((id) => session.edits[id] ?? { manual: [] }));
  const setup: PageSetup = useMemo(() => ({ paper: session.paper, orientation: "portrait", marginPt: session.marginPt, overlapPx: 0 }), [session.paper, session.marginPt]);
  const planSequence = useRef(0);

  useEffect(() => {
    if (!sameIds(session.inputIds, inputIds)) setInputs(inputIds);
  }, [inputSignature, inputIds, session.inputIds, setInputs]);

  useEffect(() => {
    if (!inputIds.length) return;
    const sequence = ++planSequence.current;
    const effectiveSmart = session.smart && session.paper !== "fit";
    setStatus("analysing", null, effectiveSmart ? "Finding better page breaks" : "Preparing pages");
    void runtime.planPdf(inputIds, setup, effectiveSmart, session.edits).then((plan) => {
      if (sequence === planSequence.current) setPlan(plan);
    }).catch((error) => {
      if (sequence !== planSequence.current) return;
      const code = (error as { code?: string }).code ?? "PDF_ANALYSIS_FAILED";
      if (code !== "PDF_CANCELLED" && code !== "CANCELLED") setStatus("failed", null, undefined, code);
    });
    return () => {
      planSequence.current = sequence + 1;
    };
    // editSignature is the stable trigger for logical break changes, including undo/redo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, inputSignature, session.paper, session.marginPt, session.smart, editSignature]);

  const plan = session.plan;
  const breakEntries = useMemo(() => {
    if (!plan) return [];
    let pagesBefore = 0;
    return plan.images.flatMap((image, imageIndex) => {
      const assetId = inputIds[imageIndex];
      const entries = image.breaks.map((pageBreak, breakIndex) => ({ assetId, imageIndex, breakIndex, pageNumber: pagesBefore + breakIndex + 1, pageBreak, capacityPx: image.capacityPx }));
      pagesBefore += image.breaks.length + 1;
      return entries;
    });
  }, [plan, inputIds]);
  const reviewEntries = breakEntries.filter((entry) => entry.pageBreak.source === "automatic" && entry.pageBreak.confidence !== undefined && entry.pageBreak.confidence !== "high");
  const selected = useMemo<SelectedPdfBreak | null>(() => {
    const current = session.selectedBreak;
    if (!current) return null;
    return breakEntries.find((entry) => entry.assetId === current.assetId && entry.pageBreak.y === current.y) ?? null;
  }, [breakEntries, session.selectedBreak]);

  useEffect(() => {
    if (!breakEntries.length) {
      if (session.selectedBreak) setSelectedBreak(null);
      return;
    }
    // A manual edit updates the selection before the asynchronous re-plan commits. Keep that
    // pending y instead of snapping focus back to the first automatic review break.
    if (selected || session.selectedBreak) return;
    const first = reviewEntries[0] ?? breakEntries[0];
    setSelectedBreak({ assetId: first.assetId, y: first.pageBreak.y });
  }, [breakEntries, reviewEntries, selected, session.selectedBreak, setSelectedBreak]);

  useEffect(() => {
    if (!session.selectedBreak) return;
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='pdf-break']")).find((node) => node.dataset.assetId === session.selectedBreak?.assetId && Number(node.dataset.breakY) === session.selectedBreak?.y);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [session.selectedBreak]);

  const imageFor = (assetId: FileId) => {
    const imageIndex = inputIds.indexOf(assetId);
    return { imageIndex, image: imageIndex >= 0 ? runtime.store.getState().pdf.plan?.images[imageIndex] : undefined, file: files[assetId] };
  };
  const applyBreaks = (assetId: FileId, next: PageBreak[], options: { coalesce?: boolean } = {}) => {
    const current: PdfBreakEdit = runtime.store.getState().pdf.edits[assetId] ?? { manual: [] };
    const edit: PdfBreakEdit = current.frozen ? { manual: [], frozen: next.map((item) => item.y) } : { manual: next.filter((item) => item.source === "manual").map((item) => item.y) };
    setBreakEdit(assetId, edit, { coalesce: options.coalesce });
  };
  const move = (assetId: FileId, breakIndex: number, y: number, options: { snap: boolean; coalesce: boolean }) => {
    const { image, file } = imageFor(assetId);
    const pageBreak = image?.breaks[breakIndex];
    if (!image || !file || !pageBreak) return;
    const target = options.snap ? snapTo(y, runtime.pdfSafeYs(assetId), SNAP_PX) : y;
    const next = moveBreak(image.breaks, pageBreak.id, target, { height: file.height, minGapPx: MIN_GAP_PX });
    const moved = next.find((item) => item.id === pageBreak.id) ?? next[breakIndex];
    applyBreaks(assetId, next, { coalesce: options.coalesce });
    if (moved) setSelectedBreak({ assetId, y: moved.y });
  };
  const add = (assetId: FileId, y: number) => {
    const { image, file } = imageFor(assetId);
    if (!image || !file) return;
    const target = snapTo(y, runtime.pdfSafeYs(assetId), SNAP_PX);
    const next = addBreak(image.breaks, target, { height: file.height, minGapPx: MIN_GAP_PX }, `manual-${Date.now().toString(36)}`);
    if (next === image.breaks) return;
    applyBreaks(assetId, next);
    setSelectedBreak({ assetId, y: Math.round(target) });
  };
  const remove = (assetId: FileId, breakIndex: number) => {
    const { image } = imageFor(assetId);
    const pageBreak = image?.breaks[breakIndex];
    if (!image || !pageBreak) return;
    const next = removeBreak(image.breaks, pageBreak.id);
    setBreakEdit(assetId, { manual: [], frozen: next.map((item) => item.y) });
    setSelectedBreak(null);
  };
  const reset = () => {
    const assetId = selected?.assetId ?? inputIds[0];
    if (assetId) setBreakEdit(assetId, { manual: [] });
    setSelectedBreak(null);
  };
  const addToLargestPage = () => {
    if (!plan) return;
    const assetId = selected?.assetId ?? inputIds[0];
    const imageIndex = inputIds.indexOf(assetId);
    const slices = plan.pages.filter((page) => page.imageIndex === imageIndex);
    const slice = [...slices].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
    if (slice) add(assetId, (slice.y0 + slice.y1) / 2);
  };
  const navigate = (direction: 1 | -1) => {
    const list = reviewEntries.length ? reviewEntries : breakEntries;
    if (!list.length) return;
    const index = selected ? list.findIndex((entry) => entry.assetId === selected.assetId && entry.pageBreak.y === selected.pageBreak.y) : -1;
    const next = list[(index + direction + list.length) % list.length];
    setSelectedBreak({ assetId: next.assetId, y: next.pageBreak.y });
  };

  const busy = session.status === "analysing" || session.status === "exporting";
  const exportPdf = async () => {
    if (!plan || busy) return;
    const invalid = plan.images.flatMap((image) => validateBreaks(image.breaks, { height: image.height, minGapPx: 1 }));
    if (invalid.length) {
      setStatus("failed", null, undefined, "PDF_INVALID_BREAKS");
      return;
    }
    try {
      const result = await runtime.exportPdf(inputIds, plan);
      downloadAsset(runtime, result.id);
    } catch {
      // Runtime stores a controlled error code.
    }
  };

  const status = session.status === "exporting" ? <Badge tone="accent" dot>Creating PDF…</Badge> : session.status === "analysing" ? <Badge tone="neutral" dot>Analysing pages…</Badge> : plan ? <Badge tone={reviewEntries.length ? "warning" : "success"} dot>{reviewEntries.length ? `${reviewEntries.length} page break${reviewEntries.length === 1 ? "" : "s"} need review` : session.smart && session.paper !== "fit" ? "High confidence" : `${plan.pages.length} page${plan.pages.length === 1 ? "" : "s"} ready`}</Badge> : undefined;
  const sourceForContinue = selectedId && inputIds.includes(selectedId) ? selectedId : inputIds[0];
  const resultMatches = lastDocument && sameIds(lastDocument.sourceIds, inputIds);

  return (
    <WorkspaceShell
      tool="pdf"
      status={status}
      exportAction={{ label: "Export PDF", onClick: exportPdf, disabled: !plan || session.status === "analysing", busy: session.status === "exporting" }}
      fileHint="Reorder screenshots here to change their order in the PDF. Selecting a Shotexa result converts that result by itself."
      inspectorTitle="PDF settings"
      canvas={
        <div data-testid="pdf-workspace">
          <h1 className="sr-only">Convert Screenshots to PDF</h1>
          {session.error && session.status === "failed" && <Notice tone="error" icon={<AlertTriangle />} title="PDF creation stopped" className="mb-4" actions={<Button variant="secondary" onClick={() => setStatus("idle")}><X /> Dismiss</Button>}>{messageFor(session.error)}</Notice>}
          {session.status === "cancelled" && <Notice className="mb-4" title="PDF creation cancelled">Your screenshots and page-break edits are unchanged.</Notice>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-xs">
            <div><p className="font-display text-lg">Screenshot to PDF</p><p className="text-sm text-ink-2">{inputIds.length} screenshot{inputIds.length === 1 ? "" : "s"} · processing stays in this browser</p></div>
            <div className="flex items-center gap-2"><FileText className="size-4 text-accent" /><span className="t-mono text-[12px]">{plan ? `${plan.pages.length} page${plan.pages.length === 1 ? "" : "s"}` : "Preparing…"}</span></div>
          </div>
          {busy && <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite"><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-accent-ink">{session.stage ?? (session.status === "exporting" ? "Creating PDF" : "Analysing pages")}</span><span className="t-mono text-accent-ink">{session.progress === null ? "" : `${Math.round(session.progress * 100)}%`}</span></div><Progress value={session.progress} label="PDF progress" /></div>}
          {plan ? <PdfPreview inputIds={inputIds} files={files} plan={plan} selected={session.selectedBreak} disabled={session.status === "exporting"} onSelect={(assetId, y) => setSelectedBreak({ assetId, y })} onMove={move} onDelete={remove} onAdd={add} /> : <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-line bg-surface"><Loader2 className="size-6 animate-spin text-accent" /><span className="ml-3 text-sm text-ink-2">Preparing the page preview…</span></div>}
        </div>
      }
      inspector={<PdfInspector session={session} reviewCount={reviewEntries.length} selected={selected} busy={busy} onSettings={setSettings} onPrevious={() => navigate(-1)} onNext={() => navigate(1)} onNudge={(delta) => selected && move(selected.assetId, selected.breakIndex, selected.pageBreak.y + delta, { snap: false, coalesce: false })} onSnap={() => selected && move(selected.assetId, selected.breakIndex, selected.pageBreak.y, { snap: true, coalesce: false })} onAdd={addToLargestPage} onDelete={() => selected && remove(selected.assetId, selected.breakIndex)} onReset={reset} onCancel={() => runtime.cancelPdf()} />}
      below={resultMatches && lastDocument && <div data-testid="pdf-result" className="mt-5"><Notice tone="success" icon={<Check />} title="PDF ready" actions={<Button variant="secondary" onClick={() => downloadAsset(runtime, lastDocument.id)}><Download /> Download again</Button>}><span className="t-mono text-[12px]">{lastDocument.name} · {lastDocument.pageCount} page{lastDocument.pageCount === 1 ? "" : "s"} · {formatBytes(lastDocument.bytes)}</span><span className="block">Downloaded and kept in the workspace as a PDF output.</span></Notice><ContinueWith tools={["extract-text", "safe-share", "annotate"]} fileId={sourceForContinue} /></div>}
    />
  );
}
