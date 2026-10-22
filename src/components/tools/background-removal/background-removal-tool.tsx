"use client";

import { AlertTriangle, Check, Download, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { DEFAULT_BACKGROUND_REMOVAL, type BackgroundRemovalSettings, type MaskBrushMode, type RemovalPreviewMode } from "@/core/background-removal/types";
import { downloadAsset } from "@/core/runtime/runtime";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { BackgroundRemovalInspector } from "./background-removal-inspector";
import { BackgroundRemovalStage } from "./background-removal-stage";

const freshSettings = (): BackgroundRemovalSettings => ({ ...DEFAULT_BACKGROUND_REMOVAL, edge: { ...DEFAULT_BACKGROUND_REMOVAL.edge }, background: { ...DEFAULT_BACKGROUND_REMOVAL.background }, subject: { ...DEFAULT_BACKGROUND_REMOVAL.subject } });

async function matchingPalette(bitmap: ImageBitmap) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { from: "#dce7ff", to: "#f5dcff" };
  ctx.drawImage(bitmap, 0, 0, 24, 24); const data = ctx.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) { if (data[i + 3] < 16) continue; r += data[i]; g += data[i + 1]; b += data[i + 2]; count++; }
  canvas.width = canvas.height = 0; if (!count) return { from: "#dce7ff", to: "#f5dcff" };
  const base = [r / count, g / count, b / count];
  const hex = (values: number[]) => `#${values.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
  return { from: hex(base.map((value) => value * .45 + 255 * .55)), to: hex([base[2] * .5 + 90, base[0] * .45 + 90, base[1] * .5 + 90]) };
}

export function BackgroundRemovalTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((state) => state.order.length);
  const selectedId = useWorkspace((state) => state.selectedId);
  return count && selectedId ? <BackgroundRemovalWorkspace key={selectedId} assetId={selectedId} /> : <>{landing}</>;
}

function BackgroundRemovalWorkspace({ assetId }: { assetId: string }) {
  const { runtime } = useWorkspaceContext();
  const files = useWorkspace((state) => state.files);
  const runningJob = useWorkspace((state) => Object.values(state.jobs).find((job) => job.kind === "background-remove" && job.status === "running"));
  const exportingJob = useWorkspace((state) => Object.values(state.jobs).find((job) => job.kind === "background-export" && job.status === "running"));
  const format = useWorkspace((state) => state.exportSettings.format);
  const [method, setMethod] = useState<"object" | "ink">("object");
  const [previewSurface, setPreviewSurface] = useState<"checkerboard" | "white" | "dark" | "transparent">("checkerboard");
  const [copyStatus, setCopyStatus] = useState("");
  const [settings, setSettings] = useState(freshSettings);
  const [mode, setMode] = useState<RemovalPreviewMode>("original");
  const [brushMode, setBrushMode] = useState<MaskBrushMode>("restore");
  const [brushSize, setBrushSize] = useState(34);
  const [hardness, setHardness] = useState(.72);
  const [revision, setRevision] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [customBackground, setCustomBackground] = useState<{ blob: Blob; bitmap: ImageBitmap } | null>(null);

  useEffect(() => () => customBackground?.bitmap.close(), [customBackground]);

  const file = files[assetId];
  if (!file) return null;
  const sourceId = assetId;
  const ready = !!runtime.backgroundMasks.get(sourceId);
  const running = !!runningJob;
  const exporting = !!exportingJob;
  const result = completedId ? files[completedId] : undefined;
  const jpegBlocked = format === "jpeg" && settings.background.kind === "transparent";
  const customBackgroundMissing = settings.background.kind === "image" && !customBackground;

  async function run() {
    if (running) return; setError(null); setStage("Preparing background remover…");
    try {
      await runtime.removeBackground(sourceId, setStage, false, method);
      if (method === "ink") setSettings(current => ({ ...current, edge: { preset: "natural", feather: 0, smooth: 0, shift: 0 } }));
      const bitmap = runtime.registry.preview(sourceId);
      if (bitmap) { const palette = await matchingPalette(bitmap); setSettings((current) => current.background.kind === "derived" ? { ...current, background: { kind: "derived", ...palette, angle: 135 } } : current); }
      setMode("removed"); setRevision((value) => value + 1); setStage("Mask ready");
    } catch (caught) { const code = (caught as { code?: string }).code ?? "BACKGROUND_INFERENCE_FAILED"; if (code !== "BACKGROUND_CANCELLED" && code !== "CANCELLED") setError(code); }
  }
  async function exportImage() {
    if (!ready || exporting || jpegBlocked || customBackgroundMissing) return; setError(null);
    try { const output = await runtime.exportRemovedBackground(sourceId, settings, customBackground?.blob); setCompletedId(output.id); downloadAsset(runtime, output.id); }
    catch (caught) { setError((caught as { code?: string }).code ?? "BACKGROUND_EXPORT_FAILED"); }
  }
  async function copyPng() {
    const blob = completedId ? runtime.registry.blob(completedId) : null;
    if (!blob || blob.type !== "image/png" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") { setCopyStatus("Use Download PNG, then insert the file into your document."); return; }
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); setCopyStatus("PNG copied. Some destination apps flatten pasted transparency; insert the downloaded PNG if needed."); }
    catch { setCopyStatus("Clipboard unavailable. Download the PNG and insert it into your document."); }
  }
  async function chooseBackground(file: File | null) {
    customBackground?.bitmap.close();
    if (!file) { setCustomBackground(null); return; }
    try { const bitmap = await createImageBitmap(file); setCustomBackground({ blob: file, bitmap }); setSettings((current) => ({ ...current, background: { kind: "image" } })); }
    catch { setError("BACKGROUND_DECODE_FAILED"); setCustomBackground(null); }
  }

  return <WorkspaceShell tool="remove-background" status={<Badge tone={ready ? "success" : "accent"} dot>{running ? stage || "Analyzing…" : ready ? "Mask ready" : "Ready"}</Badge>} exportAction={{ label: "Export image", onClick: exportImage, disabled: !ready || jpegBlocked || customBackgroundMissing, busy: exporting }} fileHint="Choose one PNG, JPEG or WebP. The original file remains unchanged; masks and outputs stay in this browser session." inspectorTitle="Background removal settings" canvas={<>
    <h1 className="sr-only">{TOOLS["remove-background"].seo.h1}</h1>
    {running && <Notice tone="accent" icon={<Loader2 className="animate-spin" />} title={stage || "Analyzing image…"} className="mb-4">The model runs in a dedicated local worker. No image pixels are uploaded.</Notice>}
    {customBackgroundMissing && <Notice tone="warning" icon={<AlertTriangle />} title="Choose a background image" className="mb-4">Custom image replacement is selected, but no local background image has been chosen yet.</Notice>}
    {error && <Notice tone="error" icon={<AlertTriangle />} title="Could not finish" className="mb-4">{error === "BACKGROUND_INK_UNSUITABLE" ? "Use a single ink color on a uniform, opaque background with a clear border. For photos or multicolor artwork, choose Objects & photos." : error === "BACKGROUND_INK_TOO_LARGE" ? "Signature mode supports up to 16 megapixels. Crop the paper margins or resize a copy first." : error === "BACKGROUND_JPEG_NEEDS_BACKGROUND" ? "JPEG cannot preserve transparency. Choose a background or export PNG/WebP." : error === "BACKGROUND_CUSTOM_IMAGE_MISSING" ? "Choose a local background image before exporting this composition." : error === "BACKGROUND_MODEL_LOAD_FAILED" ? "The local model did not load. Retry after checking browser storage and connectivity for the first model fetch." : "The original image is unchanged. Retry or choose another supported image."}</Notice>}
    <BackgroundRemovalStage assetId={sourceId} settings={settings} previewSurface={previewSurface} mode={mode} brushMode={brushMode} brushSize={brushSize} hardness={hardness} revision={revision} customBackground={customBackground?.bitmap ?? null} onBrushMode={setBrushMode} onRevision={() => setRevision((value) => value + 1)} />
  </>} inspector={<BackgroundRemovalInspector method={method} onMethod={setMethod} previewSurface={previewSurface} onPreviewSurface={setPreviewSurface} settings={settings} ready={ready} running={running} stage={stage} error={error} mode={mode} brushMode={brushMode} brushSize={brushSize} hardness={hardness} onSettings={setSettings} onMode={setMode} onBrushMode={setBrushMode} onBrushSize={setBrushSize} onHardness={setHardness} onRun={() => void run()} onCancel={runtime.cancelBackgroundRemoval} onCustomBackground={(value) => void chooseBackground(value)} />} below={result && <div className="mt-6" data-testid="background-removal-result"><Notice tone="success" icon={<Check />} title="Last exported image" actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}><Download /> Download again</Button>{result.type === "image/png" && <Button variant="secondary" onClick={() => void copyPng()}>Copy PNG</Button>}</div>}><span className="t-mono text-[12px]">{result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}</span><span className="block">Use the downloaded file in documents. The preview background is not part of the image.</span>{copyStatus && <span role="status" className="block">{copyStatus}</span>}</Notice><ContinueWith tools={continuationsFor("remove-background")} fileId={result.id} /></div>} />;
}
