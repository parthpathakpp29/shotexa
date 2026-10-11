"use client";

import { ImagePlus, Loader2, RotateCcw, Scissors, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, InspectorSection, Notice } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { EDGE_PRESETS, type BackgroundRemovalSettings, type EdgePreset, type MaskBrushMode, type RemovalPreviewMode } from "@/core/background-removal/types";
import { cn } from "@/lib/cn";

function Choice<T extends string>({ value, onChange, options, label, columns = 2 }: { value: T; onChange(value: T): void; options: { value: T; label: string }[]; label: string; columns?: 2 | 3 }) {
  return <div role="group" aria-label={label} className={cn("grid gap-1 rounded-md bg-surface-2 p-1", columns === 3 ? "grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3" : "grid-cols-2")}>{options.map((option) => <button type="button" key={option.value} onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={cn("min-h-11 min-w-0 break-words rounded-sm px-2 text-xs font-medium leading-tight transition-colors", value === option.value ? "bg-surface text-ink shadow-xs" : "text-ink-2 hover:text-ink")}>{option.label}</button>)}</div>;
}

function Range({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange(value: number): void }) {
  return <div><FieldLabel value={`${value}${suffix}`}>{label}</FieldLabel><input aria-label={label} className="h-11 w-full accent-[var(--color-accent)]" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

export function BackgroundRemovalInspector({ settings, ready, running, stage, error, mode, brushMode, brushSize, hardness, onSettings, onMode, onBrushMode, onBrushSize, onHardness, onRun, onCancel, onCustomBackground }: {
  settings: BackgroundRemovalSettings; ready: boolean; running: boolean; stage: string; error: string | null; mode: RemovalPreviewMode; brushMode: MaskBrushMode; brushSize: number; hardness: number;
  onSettings(value: BackgroundRemovalSettings): void; onMode(value: RemovalPreviewMode): void; onBrushMode(value: MaskBrushMode): void; onBrushSize(value: number): void; onHardness(value: number): void; onRun(): void; onCancel(): void; onCustomBackground(file: File | null): void;
}) {
  const format = useWorkspace((s) => s.exportSettings.format);
  const quality = useWorkspace((s) => s.exportSettings.quality);
  const setExport = useWorkspace((s) => s.setExportSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const patch = (value: Partial<BackgroundRemovalSettings>) => onSettings({ ...settings, ...value });
  const patchSubject = (value: Partial<BackgroundRemovalSettings["subject"]>) => patch({ subject: { ...settings.subject, ...value } });
  const patchEdge = (value: Partial<BackgroundRemovalSettings["edge"]>) => patch({ edge: { ...settings.edge, ...value } });
  const gradient = settings.background.kind === "gradient" || settings.background.kind === "derived" ? settings.background : null;

  return <div data-testid="background-removal-inspector">
    <InspectorSection title="Remove background">
      {!ready ? <Button variant="primary" size="lg" className="w-full" onClick={onRun} disabled={running}>{running ? <Loader2 className="animate-spin" /> : <Scissors />} {running ? stage || "Analyzing image…" : "Remove background"}</Button> : <Button variant="secondary" className="w-full" onClick={onRun} disabled={running}><RotateCcw /> Run again</Button>}
      {running && <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}><X /> Cancel</Button>}
      <p className="t-body-sm mt-3 text-ink-2" aria-live="polite">{running ? stage : ready ? "Mask ready. Review the edges before export." : "The 4.36 MiB model loads only when you start. Your image stays on your device."}</p>
      {error && <Notice tone="error" title="Removal did not finish" className="mt-3">{error === "BACKGROUND_MODEL_LOAD_FAILED" ? "The local model could not load. Check the connection for first use, then retry." : "This browser could not complete local inference. The original image is unchanged."}</Notice>}
    </InspectorSection>

    <InspectorSection title="Preview">
      <Choice value={mode} onChange={onMode} label="Preview mode" columns={3} options={[{ value: "removed", label: "Removed" }, { value: "original", label: "Original" }, { value: "split", label: "Split" }, { value: "checkerboard", label: "Transparency" }, { value: "mask", label: "Mask" }]} />
    </InspectorSection>

    <InspectorSection title="Refine mask">
      <Choice value={brushMode} onChange={onBrushMode} label="Brush mode" options={[{ value: "restore", label: "Restore" }, { value: "erase", label: "Erase" }]} />
      <div className="mt-3 space-y-3"><Range label="Brush size" value={brushSize} min={4} max={120} suffix=" px" onChange={onBrushSize} /><Range label="Brush hardness" value={Math.round(hardness * 100)} min={0} max={100} suffix="%" onChange={(value) => onHardness(value / 100)} /></div>
      <p className="t-body-sm mt-2 text-ink-2">Restore paints foreground back into the mask. Erase removes unwanted foreground. One stroke creates one undo step.</p>
    </InspectorSection>

    <InspectorSection title="Edges">
      <select aria-label="Edge preset" className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm" value={settings.edge.preset} onChange={(event) => onSettings({ ...settings, edge: EDGE_PRESETS[event.target.value as EdgePreset] })}>{Object.keys(EDGE_PRESETS).map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
      <div className="mt-3 space-y-3"><Range label="Feather" value={settings.edge.feather} min={0} max={8} step={0.25} suffix=" px" onChange={(feather) => patchEdge({ feather, preset: "natural" })} /><Range label="Edge shift" value={settings.edge.shift} min={-5} max={5} suffix=" px" onChange={(shift) => patchEdge({ shift, preset: "natural" })} /><Range label="Smooth" value={settings.edge.smooth} min={0} max={4} suffix=" px" onChange={(smooth) => patchEdge({ smooth, preset: "natural" })} /></div>
    </InspectorSection>

    <InspectorSection title="Background">
      <Choice value={settings.background.kind} onChange={(kind) => patch({ background: kind === "transparent" ? { kind } : kind === "solid" ? { kind, color: "#f5f1eb" } : kind === "blur-original" ? { kind, blur: 24 } : kind === "image" ? { kind } : { kind, from: "#dce7ff", to: "#f5dcff", angle: 135 } })} label="Background type" columns={3} options={[{ value: "transparent", label: "Transparent" }, { value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "derived", label: "Matching" }, { value: "blur-original", label: "Blur" }, { value: "image", label: "Image" }]} />
      {settings.background.kind === "solid" && <div className="mt-3"><FieldLabel>Background color</FieldLabel><input aria-label="Background color" type="color" value={settings.background.color} onChange={(event) => patch({ background: { kind: "solid", color: event.target.value } })} className="h-11 w-full rounded-md border border-line bg-surface p-1" /></div>}
      {gradient && <div className="mt-3 grid grid-cols-2 gap-2"><input aria-label="Gradient start color" type="color" value={gradient.from} onChange={(event) => patch({ background: { ...gradient, from: event.target.value } })} className="h-11 w-full rounded-md border border-line bg-surface p-1" /><input aria-label="Gradient end color" type="color" value={gradient.to} onChange={(event) => patch({ background: { ...gradient, to: event.target.value } })} className="h-11 w-full rounded-md border border-line bg-surface p-1" /><div className="col-span-2"><Range label="Gradient angle" value={gradient.angle} min={0} max={360} suffix="°" onChange={(angle) => patch({ background: { ...gradient, angle } })} /></div></div>}
      {settings.background.kind === "blur-original" && <div className="mt-3"><Range label="Background blur" value={settings.background.blur} min={4} max={60} suffix=" px" onChange={(blur) => patch({ background: { kind: "blur-original", blur } })} /></div>}
      {settings.background.kind === "image" && <><input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onCustomBackground(event.target.files?.[0] ?? null)} /><Button variant="secondary" className="mt-3 w-full" onClick={() => fileRef.current?.click()}><ImagePlus /> Choose local image</Button></>}
    </InspectorSection>

    <InspectorSection title="Subject">
      <div className="space-y-3"><Range label="Scale" value={Math.round(settings.subject.scale * 100)} min={25} max={180} suffix="%" onChange={(value) => patchSubject({ scale: value / 100 })} /><Range label="Horizontal position" value={settings.subject.x} min={-500} max={500} suffix=" px" onChange={(x) => patchSubject({ x })} /><Range label="Vertical position" value={settings.subject.y} min={-500} max={500} suffix=" px" onChange={(y) => patchSubject({ y })} /></div>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings.subject.shadow} onChange={(event) => patchSubject({ shadow: event.target.checked })} /> Ambient subject shadow</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings.trim} onChange={(event) => patch({ trim: event.target.checked })} /> Trim transparent space</label>
      {settings.trim && <Range label="Trim padding" value={settings.subject.padding} min={0} max={240} suffix=" px" onChange={(padding) => patchSubject({ padding })} />}
    </InspectorSection>

    <InspectorSection title="Export">
      <Choice value={format} onChange={(value) => setExport({ format: value })} label="Export format" columns={3} options={[{ value: "png", label: "PNG" }, { value: "webp", label: "WebP" }, { value: "jpeg", label: "JPEG" }]} />
      {format !== "png" && <div className="mt-3"><Range label="Image quality" value={Math.round(quality * 100)} min={50} max={100} suffix="%" onChange={(value) => setExport({ quality: value / 100 })} /></div>}
      {format === "jpeg" && settings.background.kind === "transparent" && <Notice tone="warning" title="JPEG needs a background" className="mt-3">Choose Solid, Gradient, Blur or a custom image. PNG and WebP preserve transparency.</Notice>}
      <div className="t-body-sm mt-3 rounded-md bg-surface-2 p-3 text-ink-2"><span className="block"><strong className="text-ink">Transparency:</strong> {format === "jpeg" ? "Not supported" : "Preserved"}</span><span className="block"><strong className="text-ink">Processing:</strong> Local worker, Blob export</span></div>
    </InspectorSection>
  </div>;
}
