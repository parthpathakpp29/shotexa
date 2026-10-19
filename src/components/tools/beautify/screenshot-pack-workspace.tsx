"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, PackageOpen, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Progress } from "@/components/ui/primitives";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { createZip } from "@/core/archive/zip";
import { MAX_BATCH_OUTPUT_BYTES } from "@/core/batch/types";
import { listBrandKits, materializeBrandKit, type BrandKit } from "@/core/brand-kit/storage";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import { renderBeautified } from "@/core/beautify/render";
import { resolveStudioTemplate, STUDIO_TEMPLATES } from "@/core/beautify/studio-library";
import type { BeautifySettings, ExportScale, OutputPreset } from "@/core/beautify/types";
import { downloadBlob } from "@/core/runtime/runtime";
import { BeautifyInspector } from "./beautify-inspector";
import { BeautifyStage } from "./beautify-stage";

interface PackOutput { id: string; name: string; blob: Blob; width: number; height: number }
const selectClass = "h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

export function ScreenshotPackWorkspace({ onBack }: { onBack(): void }) {
  const { runtime } = useWorkspaceContext();
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const activeId = useWorkspace((s) => s.selectedId);
  const select = useWorkspace((s) => s.select);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const byAsset = useWorkspace((s) => s.beautify.byAsset);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const [ids, setIds] = useState<string[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [kitId, setKitId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [tab, setTab] = useState<"pack" | "image">("pack");
  const [selectedWatermark, setSelectedWatermark] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<PackOutput[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState("");
  const [running, setRunning] = useState(false);
  const [renderedSignature, setRenderedSignature] = useState("");
  const controller = useRef<AbortController | null>(null);
  const initialised = useRef(false);
  const active = activeId && files[activeId] ? activeId : ids[0];
  const activeSettings = active ? byAsset[active] ?? DEFAULT_BEAUTIFY : DEFAULT_BEAUTIFY;
  const references = new Set(Object.values(byAsset).flatMap((settings) => [settings.branding.assetId, settings.background.assetId, ...(settings.watermarks ?? []).map((layer) => layer.assetId)].filter((id): id is string => !!id)));
  const eligibleIds = order.filter((id) => !references.has(id));
  const signature = (resultIds: string[]) => JSON.stringify({ settings: resultIds.map((id) => byAsset[id] ?? DEFAULT_BEAUTIFY), exportSettings });
  const stale = outputs.length > 0 && renderedSignature !== signature(outputs.map((item) => item.id));

  useEffect(() => {
    if (initialised.current || !order.length) return;
    initialised.current = true;
    const references = new Set(Object.values(byAsset).flatMap((settings) => [settings.branding.assetId, settings.background.assetId, ...(settings.watermarks ?? []).map((layer) => layer.assetId)].filter((id): id is string => !!id)));
    setIds(order.filter((id) => !references.has(id)).slice(0, 20));
  }, [byAsset, order]);
  useEffect(() => { void listBrandKits().then(setKits).catch(() => setError("Saved brands are unavailable in this browser.")); }, []);
  useEffect(() => () => { controller.current?.abort(); }, []);

  function choose(id: string, checked: boolean) { if (checked && ids.length >= 20) { setError("A pack can include up to 20 screenshots. Export another pack for the rest."); return; } setIds((old) => checked ? [...old, id] : old.filter((item) => item !== id)); }
  function applyToSelected(style: BeautifySettings) {
    for (const id of ids) if (files[id]) setBeautify(id, { ...style, composition: { ...style.composition, layout: "single", assetIds: [], selectedAssetId: null, items: {} } });
    setOutputs([]);
  }
  function applyTemplate() {
    const template = STUDIO_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    for (const id of ids) {
      const file = files[id];
      if (!file) continue;
      const current = byAsset[id] ?? DEFAULT_BEAUTIFY;
      setBeautify(id, { ...current, ...resolveStudioTemplate(template, current, { width: file.width, height: file.height }) });
    }
    setOutputs([]);
  }
  async function applyKit() {
    const kit = kits.find((item) => item.id === kitId);
    if (!kit) return;
    setError("");
    try { const style = await materializeBrandKit(kit, runtime); applyToSelected(style); setExportSettings(kit.exportSettings); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not apply this brand."); }
  }
  function setSharedSize(preset: OutputPreset, scale: ExportScale) {
    for (const id of ids) if (files[id]) setBeautify(id, { ...(byAsset[id] ?? DEFAULT_BEAUTIFY), preset, exportScale: scale });
    setOutputs([]);
  }
  async function render(idsToRender: string[]) {
    if (running || !idsToRender.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true); setError(""); setFailures([]); setOutputs([]); setProgress(0);
    const completed: PackOutput[] = [];
    const failed: string[] = [];
    for (let index = 0; index < idsToRender.length; index++) {
      if (abort.signal.aborted) break;
      const id = idsToRender[index];
      const file = files[id];
      const image = runtime.registry.blob(id);
      if (!file || !image) { failed.push(`${file?.name ?? "Image"}: source unavailable`); continue; }
      setCurrent(file.name);
      const settings = byAsset[id] ?? DEFAULT_BEAUTIFY;
      const resourceIds = [...new Set([...settings.composition.assetIds, settings.branding.assetId, settings.background.assetId, ...(settings.watermarks ?? []).map((layer) => layer.assetId)].filter((item): item is string => !!item && item !== id))];
      const resources = resourceIds.flatMap((resourceId) => {
        const meta = files[resourceId]; const blob = runtime.registry.blob(resourceId);
        return meta && blob ? [{ id: resourceId, image: blob, source: { width: meta.width, height: meta.height } }] : [];
      });
      try {
        if (resources.length !== resourceIds.length) throw new Error("A logo or background image is unavailable. Reapply the brand or reupload it.");
        const input = { image, settings, source: { width: file.width, height: file.height }, resources, format: exportSettings.format, quality: exportSettings.quality };
        const result = runtime.caps.offscreenCanvas
          ? await runtime.broker.run("image", "beautify.export", input, { signal: abort.signal, onProgress: (fraction) => setProgress((index + fraction) / idsToRender.length) })
          : await renderBeautified(image, settings, { ...input, signal: abort.signal, createCanvas: (width, height) => Object.assign(document.createElement("canvas"), { width, height }), yieldBetweenTiles: () => new Promise((resolve) => requestAnimationFrame(() => resolve())), onProgress: (fraction) => setProgress((index + fraction) / idsToRender.length) });
        const extension = exportSettings.format === "jpeg" ? "jpg" : exportSettings.format;
        const base = file.name.replace(/\.[^.]+$/, "");
        if (completed.reduce((total, item) => total + item.blob.size, 0) + result.blob.size > MAX_BATCH_OUTPUT_BYTES) throw new Error("Pack output exceeds the 96 MB ZIP limit. Use fewer images or JPEG/WebP.");
        completed.push({ id, name: `pack-${base}.${extension}`, blob: result.blob, width: result.width, height: result.height });
        setRenderedSignature(signature(completed.map((item) => item.id)));
        setOutputs([...completed]);
      } catch (cause) {
        if (abort.signal.aborted) break;
        failed.push(`${file.name}: ${cause instanceof Error ? cause.message : "Could not render"}`);
        setFailures([...failed]);
      }
      setProgress((index + 1) / idsToRender.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (abort.signal.aborted) setError("Pack rendering stopped. Completed images remain available below.");
    else if (failed.length) setError(`${failed.length} image${failed.length === 1 ? "" : "s"} could not be rendered. Successful outputs remain available.`);
    setCurrent(""); setRunning(false); controller.current = null;
  }
  async function zip() {
    if (stale) { setError("The design changed after rendering. Render this pack again before downloading."); return; }
    setError("");
    try { const result = await createZip(outputs.map((item) => ({ name: item.name, input: item.blob }))); downloadBlob(result.blob, "shotexa-screenshot-pack.zip", true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ZIP could not be created."); }
  }

  return <WorkspaceShell tool="beautify" status={<Badge tone="accent" dot>{ids.length} in pack</Badge>}
    exportAction={{ label: running ? "Rendering pack…" : "Render selected", onClick: () => void render(ids), disabled: !ids.length, busy: running }}
    fileHint="Choose the screenshots in this pack. Saved brand assets stay local and source files remain unchanged."
    inspectorTitle="Pack controls"
    canvas={<div data-testid="screenshot-pack-workspace" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl text-ink">Screenshot Packs</h1><p className="text-sm text-ink-3">One visual system, tailored to each screenshot.</p></div><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> Back to Beautifier</Button></div>
      {error && <Notice tone="warning" title="Pack needs attention">{error}</Notice>}
      <div className="rounded-lg border border-line bg-surface p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg">1. Choose screenshots</h2><button type="button" className="text-xs font-semibold text-accent-ink" onClick={() => setIds(eligibleIds.slice(0, 20))}>Select all</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{eligibleIds.map((id) => <div key={id} className={`overflow-hidden rounded-md border ${ids.includes(id) ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}><button type="button" onClick={() => select(id)} aria-label={`Preview ${files[id]?.name}`} className="block aspect-[4/3] w-full overflow-hidden bg-surface-2"><BitmapCanvas id={id} width={160} label={files[id]?.name ?? "Screenshot"} className="h-full w-full object-contain" /></button><label className="flex min-h-11 items-center gap-2 px-2 text-xs"><input type="checkbox" aria-label={`Include ${files[id]?.name} in pack`} checked={ids.includes(id)} onChange={(event) => choose(id, event.target.checked)} /><span className="min-w-0 truncate">{files[id]?.name}</span></label></div>)}</div></div>
      {active && <div className="rounded-lg border border-line bg-surface p-4"><h2 className="mb-3 font-display text-lg">2. Preview and refine</h2><BeautifyStage key={active} assetId={active} selectedWatermark={selectedWatermark} onSelectWatermark={setSelectedWatermark} /></div>}
      {running && <div className="rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite"><div className="mb-2 flex items-center justify-between text-sm"><span>Rendering {current}</span><span>{Math.round(progress * 100)}%</span></div><Progress label="Screenshot pack progress" value={progress} /><Button variant="secondary" size="sm" className="mt-3" onClick={() => controller.current?.abort()}><Square /> Cancel</Button></div>}
      {outputs.length > 0 && <div className="rounded-lg border border-line bg-surface p-4" data-testid="pack-results"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-display text-lg">3. Export your pack</h2><p className="text-xs text-ink-3">{outputs.length} images rendered locally. Download one or package all successful outputs.{stale && " Design changed; render again to update these files."}</p></div><Button variant="primary" disabled={stale || running} onClick={() => void zip()}><PackageOpen /> Download ZIP</Button></div><div className="grid gap-2 sm:grid-cols-2">{outputs.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-line p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-ink-3">{item.width} × {item.height} px</p></div><Button variant="secondary" size="sm" disabled={stale || running} onClick={() => downloadBlob(item.blob, item.name, true)}><Download /> Download</Button></div>)}</div>{failures.length > 0 && <ul className="mt-3 text-xs text-red-700">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}</div>}
    </div>}
    inspector={<div className="space-y-4"><div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface-2 p-1"><button type="button" className={`min-h-11 rounded-sm text-sm ${tab === "pack" ? "bg-surface font-semibold shadow-sm" : ""}`} aria-pressed={tab === "pack"} onClick={() => setTab("pack")}>Pack style</button><button type="button" className={`min-h-11 rounded-sm text-sm ${tab === "image" ? "bg-surface font-semibold shadow-sm" : ""}`} aria-pressed={tab === "image"} onClick={() => setTab("image")}>Selected image</button></div>{tab === "pack" ? <div className="space-y-5" data-testid="pack-inspector">
      <p className="text-sm text-ink-3">Choose a shared look, then open Selected image for any unique edits. Apply the current image’s style to the pack at any time.</p>
      <div><label className="t-micro mb-1 block text-ink-3" htmlFor="pack-template">Beautifier template</label><select id="pack-template" className={selectClass} value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Choose a template</option>{STUDIO_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select><Button variant="secondary" size="sm" className="mt-2 w-full" disabled={!templateId || !ids.length || running} data-testid="pack-apply-template" onClick={applyTemplate}>Apply template to selected</Button></div>
      <div><label className="t-micro mb-1 block text-ink-3" htmlFor="pack-brand">Brand Kit</label><select id="pack-brand" className={selectClass} value={kitId} onChange={(event) => setKitId(event.target.value)}><option value="">Choose a saved brand</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select><Button variant="secondary" size="sm" className="mt-2 w-full" disabled={!kitId || !ids.length || running} data-testid="pack-apply-brand" onClick={() => void applyKit()}>Apply brand to selected</Button></div>
      <Button variant="secondary" size="sm" className="w-full" disabled={!active || !ids.length || running} onClick={() => applyToSelected(activeSettings)}>Apply current image style to selected</Button>
      <div className="grid grid-cols-2 gap-2"><label><span className="t-micro mb-1 block text-ink-3">Output size</span><select aria-label="Pack output size" className={selectClass} value={activeSettings.preset} onChange={(event) => setSharedSize(event.target.value as OutputPreset, activeSettings.exportScale)}><option value="auto">Auto</option><option value="square-1080">Square 1080</option><option value="portrait-1080">Portrait 1080</option><option value="landscape-1600">Landscape 1600</option><option value="product-hunt">Product Hunt</option><option value="open-graph">Open Graph</option></select></label><label><span className="t-micro mb-1 block text-ink-3">Resolution</span><select aria-label="Pack export resolution" className={selectClass} value={activeSettings.exportScale} onChange={(event) => setSharedSize(activeSettings.preset, Number(event.target.value) as ExportScale)}>{[1, 2, 3, 4].map((scale) => <option key={scale} value={scale}>{scale}×</option>)}</select></label></div>
      <label className="block"><span className="t-micro mb-1 block text-ink-3">Format</span><select aria-label="Pack format" className={selectClass} value={exportSettings.format} onChange={(event) => setExportSettings({ format: event.target.value as "png" | "jpeg" | "webp" })}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
      {exportSettings.format !== "png" && <label className="block"><span className="t-micro mb-1 block text-ink-3">Quality {Math.round(exportSettings.quality * 100)}%</span><input aria-label="Pack quality" type="range" min={50} max={100} value={Math.round(exportSettings.quality * 100)} onChange={(event) => setExportSettings({ quality: Number(event.target.value) / 100 })} className="w-full" /></label>}
      <div className="grid grid-cols-2 gap-2"><Button variant="primary" size="sm" disabled={!ids.length || running} data-testid="pack-render-selected" onClick={() => void render(ids)}>Render selected</Button><Button variant="secondary" size="sm" disabled={!eligibleIds.length || running} onClick={() => void render(eligibleIds.slice(0, 20))}>Render all</Button></div>
    </div> : active ? <BeautifyInspector key={active} assetId={active} selectedWatermark={selectedWatermark} onSelectWatermark={setSelectedWatermark} /> : <p className="text-sm text-ink-3">Select an image to edit it.</p>}</div>}
  />;
}
