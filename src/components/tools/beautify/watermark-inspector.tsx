"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider, Toggle } from "@/components/ui/controls";
import { FieldLabel } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import type { BeautifySettings, FontFamily, WatermarkLayer } from "@/core/beautify/types";

const field = "h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

export function WatermarkInspector({ assetId, settings, selectedId, onSelect }: { assetId: string; settings: BeautifySettings; selectedId: string | null; onSelect(id: string | null): void }) {
  const { runtime } = useWorkspaceContext();
  const files = useWorkspace((s) => s.files);
  const order = useWorkspace((s) => s.order);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const [error, setError] = useState<string | null>(null);
  const layers = settings.watermarks ?? [];
  const selected = layers.find((layer) => layer.id === selectedId) ?? layers.at(-1);
  const save = (next: WatermarkLayer[], coalesce?: string) => setBeautify(assetId, { ...settings, watermarks: next }, { coalesce });
  const edit = (patch: Partial<WatermarkLayer>, key?: string) => {
    if (!selected) return;
    save(layers.map((layer) => layer.id === selected.id ? { ...layer, ...patch } : layer), key ? `watermark-${selected.id}-${key}` : undefined);
  };
  function add(kind: WatermarkLayer["kind"], logoId: string | null = null) {
    if (layers.length >= 12) { setError("Use up to 12 watermark layers per image."); return; }
    const layer: WatermarkLayer = { id: crypto.randomUUID(), kind, text: kind === "text" ? "Your brand" : "", assetId: logoId, x: 50, y: 50, size: kind === "text" ? 7 : 18, rotation: 0, opacity: 65, color: "#343b50", font: "system", letterSpacing: 0, tiled: false, tileScope: "screenshot", tileGap: 28 };
    save([...layers, layer]);
    onSelect(layer.id);
    setError(null);
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Choose a PNG, JPG, or WebP logo."); return; }
    try {
      const result = await runtime.ingestResource(file);
      if (!result.added.length) { setError("This logo could not be added. Check its format and size."); return; }
      add("image", result.added[0]);
    } catch { setError("This logo could not be loaded. Try a smaller image."); }
  }
  return <div data-testid="watermark-inspector" className="space-y-4">
    <p className="t-body-sm text-ink-3">Optional marks, always free. Drag a selected mark on the canvas, or use the precise controls below.</p>
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" size="sm" onClick={() => add("text")} data-testid="watermark-add-text">Add text</Button>
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-sm border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-accent">Upload logo<input className="sr-only" aria-label="Upload watermark logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {layers.length === 0 ? <p className="rounded-md border border-dashed border-line p-3 text-sm text-ink-3">No watermark. Exports stay clean until you add one.</p> : <>
      <label className="block"><span className="t-micro mb-1 block text-ink-3">Layer</span><select className={field} aria-label="Selected watermark layer" value={selected?.id ?? ""} onChange={(event) => onSelect(event.target.value)}>{layers.map((layer, index) => <option key={layer.id} value={layer.id}>{index + 1}. {layer.kind === "text" ? layer.text || "Text" : files[layer.assetId ?? ""]?.name ?? "Logo"}</option>)}</select></label>
      {selected && <div key={selected.id} className="space-y-3 rounded-lg border border-line bg-surface-2 p-3" data-testid="watermark-layer-controls">
        {selected.kind === "text" ? <>
          <label className="block"><span className="t-micro mb-1 block text-ink-3">Watermark text</span><input className={field} aria-label="Watermark text" maxLength={160} value={selected.text} onChange={(event) => edit({ text: event.target.value }, "text")} /></label>
          <div className="grid grid-cols-2 gap-2"><label><span className="t-micro mb-1 block text-ink-3">Font</span><select className={field} aria-label="Watermark font" value={selected.font} onChange={(event) => edit({ font: event.target.value as FontFamily })}>{(["system", "humanist", "geometric", "serif", "mono"] as const).map((font) => <option key={font} value={font}>{font[0].toUpperCase() + font.slice(1)}</option>)}</select></label><label><span className="t-micro mb-1 block text-ink-3">Color</span><input className="h-11 w-full rounded-sm border border-line bg-surface p-1" aria-label="Watermark color" type="color" value={selected.color} onChange={(event) => edit({ color: event.target.value }, "color")} /></label></div>
          <div><FieldLabel value={`${selected.letterSpacing}`}>Letter spacing</FieldLabel><Slider label="Watermark letter spacing" value={selected.letterSpacing} min={-2} max={20} step={0.5} onChange={(letterSpacing) => edit({ letterSpacing }, "spacing")} /></div>
        </> : <label className="block"><span className="t-micro mb-1 block text-ink-3">Logo image</span><select className={field} aria-label="Watermark logo image" value={selected.assetId ?? ""} onChange={(event) => edit({ assetId: event.target.value || null })}><option value="">Select a logo</option><optgroup label="Brand assets">{Object.values(files).filter((file) => file.kind === "resource").map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</optgroup><optgroup label="Workspace screenshots">{order.filter((id) => id !== assetId).map((id) => <option key={id} value={id}>{files[id]?.name ?? "Image"}</option>)}</optgroup></select></label>}
        <div><FieldLabel value={`${selected.size}%`}>{selected.kind === "text" ? "Text size" : "Logo width"}</FieldLabel><Slider label="Watermark size" value={selected.size} min={2} max={80} onChange={(size) => edit({ size }, "size")} /></div>
        <div><FieldLabel value={`${selected.opacity}%`}>Opacity</FieldLabel><Slider label="Watermark opacity" value={selected.opacity} min={0} max={100} onChange={(opacity) => edit({ opacity }, "opacity")} /></div>
        <div><FieldLabel value={`${selected.rotation}°`}>Rotation</FieldLabel><Slider label="Watermark rotation" value={selected.rotation} min={-180} max={180} onChange={(rotation) => edit({ rotation }, "rotation")} /></div>
        <div className="grid grid-cols-2 gap-2">{(["x", "y"] as const).map((axis) => <label key={axis}><span className="t-micro mb-1 block text-ink-3">{axis.toUpperCase()} position %</span><input className={field} aria-label={`Watermark ${axis.toUpperCase()} position`} type="number" min={0} max={100} step={0.25} value={selected[axis]} onChange={(event) => edit({ [axis]: Math.max(0, Math.min(100, Number(event.target.value))) }, axis)} /></label>)}</div>
        <Toggle label="Repeat across image" checked={selected.tiled} onChange={(tiled) => edit({ tiled, ...(tiled && selected.opacity === 65 ? { opacity: 18 } : {}), ...(tiled && selected.rotation === 0 ? { rotation: -18 } : {}) })} />
        {selected.tiled && <div className="space-y-3 rounded-sm border border-line bg-surface p-3"><p className="text-xs text-ink-3">A light pattern keeps the screenshot readable. Adjust opacity if you need a stronger mark.</p><label className="block"><span className="t-micro mb-1 block text-ink-3">Repeat coverage</span><select className={field} aria-label="Watermark repeat coverage" value={selected.tileScope ?? "canvas"} onChange={(event) => edit({ tileScope: event.target.value as "canvas" | "screenshot" })}><option value="screenshot">Screenshot only</option><option value="canvas">Entire canvas</option></select></label><div><FieldLabel value={`${selected.tileGap}%`}>Pattern spacing</FieldLabel><Slider label="Watermark pattern spacing" value={selected.tileGap} min={2} max={100} onChange={(tileGap) => edit({ tileGap }, "tile-gap")} /></div></div>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3"><Button variant="ghost" size="sm" onClick={() => { const copy = { ...selected, id: crypto.randomUUID(), x: Math.min(100, selected.x + 5), y: Math.min(100, selected.y + 5) }; save([...layers, copy]); onSelect(copy.id); }}>Duplicate</Button><Button variant="ghost" size="sm" onClick={() => { save(layers.filter((layer) => layer.id !== selected.id)); onSelect(null); }}>Remove layer</Button></div>
      </div>}
    </>}
  </div>;
}
