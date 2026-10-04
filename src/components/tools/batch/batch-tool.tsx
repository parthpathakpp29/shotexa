"use client";

import { AlertTriangle, Check, Download, Files, Loader2, PackageOpen, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { Badge, EmptyState, FieldLabel, InspectorSection, Notice, Progress } from "@/components/ui/primitives";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { BACKGROUND_PRESETS } from "@/core/image-encode/settings";
import { FORMAT_LABEL, OUTPUT_FORMATS, supportsQuality, type OutputFormat } from "@/core/image-encode/formats";
import { MAX_BATCH_FILES } from "@/core/batch/types";
import type { BatchItemState, BatchOperation, BatchResult, BatchSettings, ResizeMode } from "@/core/batch/types";
import { resizeOutput } from "@/core/batch/settings";
import { compareSize } from "@/core/image-encode/compare";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { downloadBlob } from "@/core/runtime/runtime";
import type { WorkspaceFile } from "@/core/runtime/types";

const OPS: { value: BatchOperation; label: string }[] = [
  { value: "compress", label: "Compress" }, { value: "convert", label: "Convert" }, { value: "privacy", label: "Privacy Clean" }, { value: "resize", label: "Resize" },
];

export function BatchTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <BatchWorkspace />;
}

function BatchWorkspace() {
  const { runtime } = useWorkspaceContext();
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const batch = useWorkspace((s) => s.batch);
  const selectedId = useWorkspace((s) => s.selectedId);
  const setSelection = useWorkspace((s) => s.setBatchSelection);
  const toggle = useWorkspace((s) => s.toggleBatchSelection);
  const [error, setError] = useState<string | null>(null);
  const [zipNames, setZipNames] = useState<string[]>([]);
  const [resultFilter, setResultFilter] = useState<"all" | "successful" | "failed">("all");
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    if (!batch.selectedIds.length && batch.status === "idle" && order.length >= 2) setSelection(order.slice(0, MAX_BATCH_FILES));
  }, [batch.selectedIds.length, batch.status, order, setSelection]);

  const items = batch.selectedIds.map((id) => ({ file: files[id], state: batch.items[id] })).filter((x) => x.file);
  const complete = items.filter((x) => x.state?.status === "completed");
  const failed = items.filter((x) => x.state?.status === "failed");
  const completedResults = complete.flatMap((item) => item.state?.resultId ? [runtime.batchResults.get(item.state.resultId)] : []).filter((result): result is NonNullable<typeof result> => !!result);
  const originalTotal = completedResults.reduce((sum, result) => sum + result.originalBytes, 0);
  const outputTotal = completedResults.reduce((sum, result) => sum + result.bytes, 0);
  const bytesSaved = originalTotal - outputTotal;
  const savingsPercent = originalTotal > 0 ? Math.round((bytesSaved / originalTotal) * 100) : 0;
  const running = batch.status === "running";
  const current = batch.currentIndex === null ? null : items[batch.currentIndex]?.file;
  const progress = items.length ? items.filter((x) => x.state?.status === "completed" || x.state?.status === "failed").length / items.length : 0;

  async function process() {
    setError(null); setZipNames([]);
    try { await runtime.runBatch(); } catch (e) { setError((e as { code?: string }).code ?? "BATCH_FAILED"); }
  }
  async function retry() {
    setError(null);
    try { await runtime.retryBatchFailed(); } catch (e) { setError((e as { code?: string }).code ?? "BATCH_FAILED"); }
  }
  async function zip() {
    setError(null);
    try { const result = await runtime.createBatchZip(); setZipNames(result.names); downloadBlob(result.blob, "shotexa-batch.zip"); } catch (e) { setError((e as { code?: string }).code ?? "ZIP_CREATE_FAILED"); }
  }
  function alterSelection(ids: string[]) { runtime.resetBatch(); setSelection(ids); }

  const status = running ? <Badge tone="accent" dot>{(batch.currentIndex ?? 0) + 1} of {items.length}</Badge> : complete.length ? <Badge tone={failed.length ? "warning" : "success"} dot>{complete.length} completed{failed.length ? ` · ${failed.length} failed` : ""}</Badge> : <Badge tone="neutral" dot>{batch.selectedIds.length} selected</Badge>;
  return (
    <WorkspaceShell
      tool="batch"
      status={status}
      exportAction={{ label: running ? "Processing…" : complete.length ? "Download ZIP" : "Process batch", onClick: complete.length ? zip : process, disabled: batch.selectedIds.length < 2, busy: running }}
      fileHint="Choose which workspace images belong in this batch. Sources remain unchanged and full-resolution jobs run one at a time."
      inspectorTitle="Batch settings"
      canvas={<>
        <h1 className="sr-only">{TOOLS.batch.seo.h1}</h1>
        {error && <Notice tone="error" icon={<AlertTriangle />} title="Batch action didn’t finish" className="mb-4">{batchError(error)}</Notice>}
        {running && <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-medium text-accent-ink">{batch.currentIndex! + 1} of {items.length} files · Processing {current?.name}</span><span className="t-mono text-[12px] text-accent-ink">{Math.round(progress * 100)}%</span></div><Progress value={progress} label="Batch progress" /><Button variant="secondary" size="sm" className="mt-3" onClick={() => runtime.cancelBatch()}><Square /> Cancel</Button></div>}
        {order.length < 2 ? <EmptyState icon={<Files />} title="Add at least two screenshots">Batch processing needs two or more workspace images.</EmptyState> : <BatchFileList onSelection={alterSelection} onToggle={toggle} />}
      </>}
      inspector={<BatchInspector disabled={running} onReset={() => { runtime.resetBatch(); setZipNames([]); }} />}
      below={(complete.length > 0 || failed.length > 0) && <div className="mt-6 space-y-4" data-testid="batch-results"><Notice tone={failed.length ? "warning" : "success"} icon={failed.length ? <AlertTriangle /> : <Check />} title={failed.length ? `${complete.length} completed · ${failed.length} failed` : `${complete.length} files ready`} actions={<div className="flex flex-wrap gap-2"><Button variant="primary" onClick={zip} disabled={!complete.length}><PackageOpen /> Download ZIP</Button>{failed.length > 0 && <Button variant="secondary" onClick={retry}><RefreshCw /> Retry failed</Button>}<Button variant="secondary" disabled={batch.addedToWorkspace || !complete.length} onClick={() => runtime.addBatchResults()}><Files /> {batch.addedToWorkspace ? "Added" : "Add results to workspace"}</Button></div>}>Only successful outputs are included. Completed files remain available if another item fails or the batch is cancelled.{zipNames.length > 0 && <span className="mt-1 block t-mono text-[11px]">ZIP: {zipNames.join(", ")}</span>}</Notice><div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="batch-summary"><SummaryStat label="Original total" value={formatBytes(originalTotal)} /><SummaryStat label="Output total" value={formatBytes(outputTotal)} /><SummaryStat label="Bytes saved" value={`${bytesSaved < 0 ? "+" : ""}${formatBytes(Math.abs(bytesSaved))}`} warn={bytesSaved < 0} /><SummaryStat label="Savings" value={`${bytesSaved < 0 ? "+" : ""}${Math.abs(savingsPercent)}%`} warn={bytesSaved < 0} /></div><SegmentedControl value={resultFilter} onChange={setResultFilter} options={[{ value: "all", label: "All" }, { value: "successful", label: "Successful" }, { value: "failed", label: "Failed" }]} label="Batch result filter" className="max-w-md" /><ResultList filter={resultFilter} />{batch.addedToWorkspace && <ContinueWith tools={continuationsFor("batch")} fileId={selectedId} />}</div>}
    />
  );
}

function BatchFileList({ onSelection, onToggle }: { onSelection(ids: string[]): void; onToggle(id: string): void }) {
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const batch = useWorkspace((s) => s.batch);
  const selected = new Set(batch.selectedIds);
  return <section className="rounded-xl border border-line bg-surface shadow-xs"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><h2 className="font-display text-xl">Batch files</h2><p className="t-mono text-[11px] text-ink-3">{batch.selectedIds.length} selected · maximum {MAX_BATCH_FILES}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={batch.status === "running"} onClick={() => onSelection(order.slice(0, MAX_BATCH_FILES))}>Select all</Button><Button size="sm" variant="ghost" disabled={batch.status === "running"} onClick={() => onSelection([])}>Clear all</Button></div></div><ul className="divide-y divide-line" data-testid="batch-file-list">{order.map((id) => { const file = files[id]; const state = batch.items[id]; return <li key={id} className="flex items-center gap-3 p-3 sm:p-4"><input type="checkbox" className="size-5 accent-[var(--accent)]" checked={selected.has(id)} disabled={batch.status === "running" || (!selected.has(id) && selected.size >= MAX_BATCH_FILES)} onChange={() => onToggle(id)} aria-label={`Include ${file.name}`} /><div className="h-14 w-20 shrink-0 overflow-hidden rounded-sm border border-line bg-surface-2"><BitmapCanvas id={id} width={160} label="" className="pointer-events-none" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="t-mono mt-1 text-[10.5px] text-ink-3">{file.width} × {file.height} · {formatBytes(file.bytes)} · {file.type.replace("image/", "").toUpperCase()}</p></div><ItemStatus status={state?.status} error={state?.error} /></li>; })}</ul></section>;
}

function ItemStatus({ status, error }: { status?: string; error?: string }) {
  if (status === "processing") return <Badge tone="accent"><Loader2 className="size-3 animate-spin" /> Processing</Badge>;
  if (status === "completed") return <Badge tone="success">Done</Badge>;
  if (status === "failed") return <span title={error}><Badge tone="error" className="max-w-44 truncate">Failed</Badge></span>;
  if (status === "cancelled") return <Badge tone="neutral">Not processed</Badge>;
  return <Badge tone="neutral">Ready</Badge>;
}

function BatchInspector({ disabled, onReset }: { disabled: boolean; onReset(): void }) {
  const batch = useWorkspace((s) => s.batch);
  const setOperation = useWorkspace((s) => s.setBatchOperation);
  const setSettings = useWorkspace((s) => s.setBatchSettings);
  const setNaming = useWorkspace((s) => s.setBatchNaming);
  const files = useWorkspace((s) => s.files);
  const first = files[batch.selectedIds[0]];
  const retryable = Object.values(batch.items).some((item) => item.status === "failed" || item.status === "cancelled");
  const update = <K extends keyof BatchSettings>(kind: K, patch: Partial<BatchSettings[K]>) => {
    // After a partial run, keep completed outputs: changed settings apply only to Retry failed.
    // Otherwise a setting change invalidates the whole previous run.
    if (!retryable) onReset();
    setSettings(kind, patch);
  };
  return <div className={disabled ? "pointer-events-none opacity-60" : ""}>
    <InspectorSection title="Operation"><SegmentedControl value={batch.operation} onChange={(value) => { onReset(); setOperation(value); }} options={OPS} label="Batch operation" className="grid-cols-2 grid-flow-row" /><p className="t-body-sm mt-3 text-ink-2">{batch.operation === "compress" ? "Reduce encoded file size without resizing." : batch.operation === "convert" ? "Change every selected image to one format." : batch.operation === "privacy" ? "Remove supported private metadata without re-encoding pixels." : "Scale each image while preserving its aspect ratio."}</p></InspectorSection>
    {batch.operation === "compress" && <EncodeBatchSettings value={batch.settings.compress} onChange={(p) => update("compress", p)} allowSame />}
    {batch.operation === "convert" && <EncodeBatchSettings value={batch.settings.convert} onChange={(p) => update("convert", p as Partial<BatchSettings["convert"]>)} background />}
    {batch.operation === "resize" && <ResizeSettings value={batch.settings.resize} onChange={(p) => update("resize", p)} preview={first ? resizeOutput(first, batch.settings.resize).size : null} />}
    {batch.operation === "privacy" && <InspectorSection title="Privacy Clean"><p className="t-body-sm text-ink-2">Removes supported GPS, private EXIF, XMP, comments and software metadata. Required orientation and colour information are preserved and every output is verified.</p></InspectorSection>}
    <InspectorSection title="Filenames"><div className="grid gap-3"><label className="block"><span className="t-micro text-ink-3">Prefix</span><input data-testid="batch-filename-prefix" value={batch.filenamePrefix} onChange={(event) => { onReset(); setNaming(event.target.value, batch.filenameSuffix); }} className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus-visible:border-accent" /></label><label className="block"><span className="t-micro text-ink-3">Suffix</span><input data-testid="batch-filename-suffix" value={batch.filenameSuffix} onChange={(event) => { onReset(); setNaming(batch.filenamePrefix, event.target.value); }} className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus-visible:border-accent" /></label></div><p className="t-body-sm mt-2 text-ink-3">Applied before the extension. Invalid filename characters become hyphens.</p></InspectorSection>
    {retryable && <p className="t-body-sm mt-4 rounded-md border border-warning/20 bg-warning-soft p-3 text-warning">Changed settings apply to failed or cancelled files when you choose Retry failed. Completed outputs stay unchanged.</p>}
  </div>;
}

function EncodeBatchSettings({ value, onChange, allowSame, background }: { value: { format: OutputFormat | "same"; quality: number; background?: string }; onChange(p: Partial<typeof value>): void; allowSame?: boolean; background?: boolean }) {
  const options = [...(allowSame ? [{ value: "same" as const, label: "Same" }] : []), ...OUTPUT_FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))];
  const actual = value.format === "same" ? null : value.format;
  return <><InspectorSection title="Output format"><SegmentedControl value={value.format} onChange={(format) => onChange({ format })} options={options} label="Output format" /></InspectorSection>{(!actual || supportsQuality(actual)) && <InspectorSection title="Quality"><FieldLabel value={`${Math.round(value.quality * 100)}%`}>JPEG / WebP quality</FieldLabel><Slider label="Quality" min={50} max={100} value={Math.round(value.quality * 100)} onChange={(v) => onChange({ quality: v / 100 })} /></InspectorSection>}{background && value.format === "jpeg" && <InspectorSection title="Transparent pixels"><div className="grid grid-cols-2 gap-2">{BACKGROUND_PRESETS.map((preset) => <button type="button" key={preset.value} onClick={() => onChange({ background: preset.value })} className={`min-h-11 rounded-md border px-3 text-sm ${value.background === preset.value ? "border-accent bg-accent-soft" : "border-line"}`}>{preset.label}</button>)}<label className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="color" value={value.background ?? "#ffffff"} onChange={(e) => onChange({ background: e.target.value })} /> Custom</label></div></InspectorSection>}</>;
}

function ResizeSettings({ value, onChange, preview }: { value: BatchSettings["resize"]; onChange(p: Partial<BatchSettings["resize"]>): void; preview: { width: number; height: number } | null }) {
  const number = (label: string, key: "width" | "height" | "percentage" | "fitWidth" | "fitHeight", suffix = "px") => <label className="block"><span className="t-micro text-ink-3">{label}</span><span className="mt-1 flex items-center rounded-md border border-line bg-surface"><input className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" type="number" min="1" value={value[key]} onChange={(e) => onChange({ [key]: Math.max(1, Number(e.target.value)) })} /><span className="t-mono pr-3 text-[11px] text-ink-3">{suffix}</span></span></label>;
  return <><InspectorSection title="Resize by"><SegmentedControl value={value.mode} onChange={(mode: ResizeMode) => onChange({ mode })} options={[{ value: "width", label: "Width" }, { value: "height", label: "Height" }, { value: "percentage", label: "%" }, { value: "fit", label: "Fit" }]} label="Resize method" />{value.mode === "width" && <div className="mt-3">{number("Width", "width")}</div>}{value.mode === "height" && <div className="mt-3">{number("Height", "height")}</div>}{value.mode === "percentage" && <div className="mt-3">{number("Percentage", "percentage", "%")}</div>}{value.mode === "fit" && <div className="mt-3 grid grid-cols-2 gap-2">{number("Fit width", "fitWidth")}{number("Fit height", "fitHeight")}</div>}{preview && <p className="t-mono mt-3 text-[11px] text-ink-3">First result: {preview.width} × {preview.height} px</p>}</InspectorSection><InspectorSection title="Sizing"><Toggle checked={value.allowEnlarge} onChange={(allowEnlarge) => onChange({ allowEnlarge })} label="Allow enlargement" description={value.allowEnlarge ? "Small images may be enlarged" : "Small images stay at original size"} /></InspectorSection><EncodeBatchSettings value={value} onChange={onChange} allowSame background /></>;
}

function SummaryStat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className="rounded-lg border border-line bg-surface p-3"><p className="t-micro text-ink-3">{label}</p><p className={`mt-1 font-mono text-sm ${warn ? "text-warning" : "text-ink"}`}>{value}</p></div>;
}

function ResultList({ filter }: { filter: "all" | "successful" | "failed" }) {
  const { runtime } = useWorkspaceContext();
  const batch = useWorkspace((s) => s.batch);
  const files = useWorkspace((s) => s.files);
  type Row = { kind: "successful"; result: BatchResult; source: WorkspaceFile; state: BatchItemState } | { kind: "failed"; source: WorkspaceFile; state: BatchItemState };
  const rows: Row[] = [];
  for (const id of batch.selectedIds) {
    const state = batch.items[id];
    const source = files[id];
    const result = state?.resultId ? runtime.batchResults.get(state.resultId) : undefined;
    if (result && source && state) rows.push({ kind: "successful", result, source, state });
    else if (state?.status === "failed" && source) rows.push({ kind: "failed", source, state });
  }
  const shown = rows.filter((row) => filter === "all" || row.kind === filter);
  return <ul className="divide-y divide-line rounded-lg border border-line bg-surface" data-testid="batch-result-list">{shown.map((row) => { if (row.kind === "failed") return <li key={row.source.id} className="flex items-center gap-3 px-4 py-3"><AlertTriangle className="size-4 text-warning" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{row.source.name}</span><span className="t-mono text-[10.5px] text-warning">Failed · {row.state.error ?? "Could not process"}</span></span></li>; const { result } = row; const comparison = compareSize(result.originalBytes, result.bytes); return <li key={result.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><Check className="size-4 text-success" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.outputName}</span><span className="t-mono text-[10.5px] text-ink-3">{result.width} × {result.height} · {formatBytes(result.bytes)}{result.operation === "compress" && comparison.outcome === "smaller" ? ` · ${comparison.percent}% saved` : ""}{result.operation === "compress" && comparison.outcome === "larger" ? " · larger than original" : ""}{result.operation === "privacy" && result.changed === false ? " · no private metadata found; original bytes retained" : ""}</span></span><Button size="sm" variant="ghost" onClick={() => downloadBlob(result.blob, result.outputName)}><Download /> Download</Button></li>; })}</ul>;
}

function batchError(code: string) {
  if (code === "BATCH_NEEDS_TWO") return "Choose at least two workspace images.";
  if (code === "BATCH_TOO_MANY_FILES") return `This first release accepts up to ${MAX_BATCH_FILES} images.`;
  if (code === "BATCH_INPUT_TOO_LARGE") return "The selected encoded files are too large for one safe browser session. Process fewer files at a time.";
  if (code === "ZIP_TOO_LARGE") return "The completed outputs are too large to buffer safely as one browser download. Download individual results or run a smaller batch.";
  if (code === "ZIP_EMPTY") return "There are no successful outputs to put in a ZIP.";
  return "The operation could not finish. Completed files are still available; review failed items and retry.";
}
