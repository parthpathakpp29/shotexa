"use client";

import { Check, ChevronDown, RotateCcw, WandSparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { FieldLabel, Mono } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { backgroundFromPixels } from "@/core/beautify/auto-background";
import { autoDesignFromPixels } from "@/core/beautify/auto-design";
import { beautifyLayout, withMode } from "@/core/beautify/layout";
import { autoLayout, BACKGROUND_PRESETS, DEFAULT_ADDRESS, DEFAULT_BEAUTIFY, GRADIENT_ANGLES, MAX_PADDING, OUTPUT_PRESETS, PADDING_PRESETS, SHADOW_LABELS, TEXT_PRESETS } from "@/core/beautify/presets";
import { perspectiveForPreset, PERSPECTIVE_PRESETS } from "@/core/beautify/perspective";
import { STUDIO_BACKGROUNDS } from "@/core/beautify/studio-library";
import { ANIMATION_PRESETS } from "@/core/beautify/animation";
import type { AnimationPreset, BackgroundKind, BeautifyMode, BeautifySettings, BorderKind, CaptionPlacement, ExportScale, FontFamily, FontWeight, FrameTheme, GradientAngle, MultiLayout, OutputPreset, PerspectivePreset, ScreenFit, ShadowPreset, TextAlignment } from "@/core/beautify/types";
import { cn } from "@/lib/cn";
import { RecipeGallery, StudioBackgrounds, StudioTemplates } from "./studio-gallery";
import { WatermarkInspector } from "./watermark-inspector";
import { BrandKitPanel } from "./brand-kit-panel";

const MODES: { value: BeautifyMode; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "browser", label: "Browser" },
  { value: "minimal-browser", label: "Minimal browser" },
  { value: "mac-window", label: "macOS-style" },
  { value: "windows-window", label: "Windows-style" },
  { value: "phone", label: "Phone" },
  { value: "android-phone", label: "Android-style" },
  { value: "tablet", label: "Tablet" },
  { value: "laptop", label: "Laptop" },
  { value: "monitor", label: "Monitor" },
];

const BACKGROUND_KINDS: { value: BackgroundKind; label: string }[] = [
  { value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "mesh", label: "Mesh gradient" },
  { value: "radial", label: "Radial" }, { value: "aurora", label: "Aurora" }, { value: "soft-blur", label: "Soft blur" },
  { value: "noise", label: "Noise / grain" }, { value: "pattern", label: "Pattern" }, { value: "screenshot", label: "Screenshot-derived" },
  { value: "custom-image", label: "Custom image" },
  { value: "studio", label: "Studio artwork" },
];

function ProSection({ title, action, children, defaultOpen }: { title: ReactNode; action?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? ["Layout", "Background", "Shadow / Border / Glass", "Position & scale", "Text", "Frame", "Export"].includes(String(title)));
  return <section className="border-b border-line py-2 last:border-b-0"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left"><span className="font-display text-lg">{title}</span><ChevronDown aria-hidden className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} /></button>{open && <div className="pb-3"><div className="mb-3 flex justify-end">{action}</div>{children}</div>}</section>;
}

function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (c: string) => void; testId: string }) {
  return (
    <label className="flex min-h-11 flex-1 items-center gap-2 rounded-sm border border-line bg-surface px-2.5 text-sm md:min-h-9">
      <span aria-hidden className="size-5 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: value }} />
      <span className="min-w-0 flex-1 truncate text-ink-2">{label}</span>
      <Mono className="text-[11px] text-ink-3">{value}</Mono>
      <input type="color" aria-label={label} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="absolute size-0 opacity-0" />
    </label>
  );
}

function NumberField({ label, value, min, max, onChange, testId }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; testId?: string }) {
  return (
    <label className="block min-w-0">
      <span className="t-micro mb-1.5 block text-ink-3">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11"
      />
    </label>
  );
}

export function BeautifyInspector({ assetId, selectedWatermark = null, onSelectWatermark = () => undefined }: { assetId: string; selectedWatermark?: string | null; onSelectWatermark?(id: string | null): void }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const stored = useWorkspace((s) => s.beautify.byAsset[assetId]);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const files = useWorkspace((s) => s.files);
  const order = useWorkspace((s) => s.order);
  if (!file) return null;

  const settings = stored ?? DEFAULT_BEAUTIFY;
  const layout = beautifyLayout(settings, { width: file.width, height: file.height });
  const apply = (patch: Partial<BeautifySettings>, coalesce?: string) => setBeautify(assetId, { ...settings, ...patch }, { coalesce });
  const freeX = layout.canvas.width - layout.content.width;
  const freeY = layout.canvas.height - (layout.caption?.rect.height ?? 0) - layout.content.height;
  const gradient = settings.background.kind === "gradient";
  const twoColors = gradient || settings.background.kind === "studio";
  const activePreset = BACKGROUND_PRESETS.find((p) => p.color === settings.background.color && (!gradient || p.color2 === settings.background.color2));
  const resetAction = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink max-md:min-h-11">
      <RotateCcw className="size-3.5" /> {label}
    </button>
  );

  function sampleScreenshotColours() {
    const bitmap = runtime.registry.preview(assetId);
    if (!bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const sampled = backgroundFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data);
      apply({ background: { ...settings.background, kind: "gradient", ...sampled, angle: 45 } });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  function applyAutoDesign() {
    const bitmap = runtime.registry.preview(assetId);
    if (!bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const decision = autoDesignFromPixels(settings, { width: file.width, height: file.height }, context.getImageData(0, 0, canvas.width, canvas.height).data);
      setBeautify(assetId, decision.settings);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  function setCustomDimension(axis: "width" | "height", value: number) {
    const next = Math.max(64, Math.min(16_384, Math.round(Number.isFinite(value) ? value : 64)));
    const custom = { ...settings.customCanvas, [axis]: next };
    if (custom.lockAspect) {
      if (axis === "width") custom.height = Math.max(64, Math.min(16_384, Math.round(next / custom.aspectRatio)));
      else custom.width = Math.max(64, Math.min(16_384, Math.round(next * custom.aspectRatio)));
    } else {
      custom.aspectRatio = custom.width / custom.height;
    }
    apply({ preset: "custom", customCanvas: custom }, `custom-${axis}`);
  }

  return (
    <div data-testid="beautify-inspector">
      <ProSection title="Templates" defaultOpen>
        <StudioTemplates assetId={assetId} settings={settings} onApply={apply} />
      </ProSection>
      <ProSection title="Brand Kit">
        <BrandKitPanel assetId={assetId} settings={settings} />
      </ProSection>
      <ProSection title="Watermark Stamp Pro">
        <WatermarkInspector assetId={assetId} settings={settings} selectedId={selectedWatermark} onSelect={onSelectWatermark} />
      </ProSection>
      <ProSection title="Layout">
        <Button variant="primary" size="sm" className="mb-4 w-full max-md:h-11" data-testid="beautify-auto-design" onClick={applyAutoDesign}><WandSparkles /> Auto Design</Button>
        <p className="t-body-sm -mt-2 mb-4 text-ink-3">Deterministically samples the local preview to choose contrast, palette, padding, radius and shadow. No AI or upload.</p>
        <SegmentedControl<BeautifyMode> label="Composition style" value={settings.mode} onChange={(mode) => setBeautify(assetId, withMode(settings, mode))} options={MODES} className="grid-flow-row grid-cols-2" />
        <p className="t-body-sm mt-3 text-ink-3">
          {settings.mode === "clean" ? "Your screenshot on a styled background." : settings.mode === "browser" ? "Inside a plain browser window — no real browser's logo." : "Inside a generic phone shell, not a specific handset."}
        </p>
        <div className="mt-4">
          <FieldLabel>Classic recipes</FieldLabel>
          <div className="mt-2"><RecipeGallery assetId={assetId} settings={settings} onApply={apply} /></div>
          <p className="t-body-sm mt-2 text-ink-3">Recipes only set the controls below; you can refine any value afterwards.</p>
        </div>
        <Disclosure title="Multi-screenshot layout" className="mt-4">
          <SegmentedControl<MultiLayout>
            label="Multi-screenshot layout"
            size="sm"
            value={settings.composition.layout}
            onChange={(layout) => apply({ composition: { ...settings.composition, layout } })}
            options={[{ value: "single", label: "1 image" }, { value: "side-by-side", label: "Side by side" }, { value: "stacked", label: "Stacked" }, { value: "fan", label: "3-card fan" }, { value: "three-column", label: "3-column" }, { value: "overlap", label: "Overlap" }]}
            className="grid-flow-row grid-cols-2"
          />
          {settings.composition.layout !== "single" && (
            <div className="mt-3 space-y-2" data-testid="beautify-multi-assets">
              <p className="t-body-sm text-ink-3">Choose up to {settings.composition.layout === "side-by-side" || settings.composition.layout === "stacked" ? 2 : 3} workspace screenshots. The current screenshot is always first.</p>
              {order.filter((id) => id !== assetId).slice(0, 8).map((id) => {
                const selected = settings.composition.assetIds.includes(id);
                const limit = settings.composition.layout === "side-by-side" || settings.composition.layout === "stacked" ? 1 : 2;
                return <Toggle key={id} label={files[id]?.name ?? "Screenshot"} checked={selected} onChange={(checked) => apply({ composition: { ...settings.composition, assetIds: checked ? [...settings.composition.assetIds.filter((value) => value !== id), id].slice(-limit) : settings.composition.assetIds.filter((value) => value !== id), selectedAssetId: checked ? id : assetId } })} />;
              })}
              <div><FieldLabel value={`${settings.composition.spacing}%`}>Spacing</FieldLabel><Slider label="Screenshot spacing" value={settings.composition.spacing} min={0} max={20} onChange={(spacing) => apply({ composition: { ...settings.composition, spacing } }, "composition-spacing")} /></div>
              {settings.composition.selectedAssetId && settings.composition.assetIds.includes(settings.composition.selectedAssetId) && (() => {
                const selectedId = settings.composition.selectedAssetId!;
                const item = settings.composition.items[selectedId] ?? { assetId: selectedId, scale: 1, offsetX: 0, offsetY: 0, radius: 45 };
                const index = settings.composition.assetIds.indexOf(selectedId);
                const reorder = (direction: -1 | 1) => {
                  const next = [...settings.composition.assetIds];
                  const target = Math.max(0, Math.min(next.length - 1, index + direction));
                  [next[index], next[target]] = [next[target], next[index]];
                  apply({ composition: { ...settings.composition, assetIds: next } });
                };
                const updateItem = (patch: Partial<typeof item>, key: string) => apply({ composition: { ...settings.composition, items: { ...settings.composition.items, [selectedId]: { ...item, ...patch } } } }, key);
                return <Disclosure title={`Selected: ${files[selectedId]?.name ?? "Screenshot"}`} defaultOpen><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant="secondary" disabled={index <= 0} onClick={() => reorder(-1)}>Send back</Button><Button type="button" size="sm" variant="secondary" disabled={index >= settings.composition.assetIds.length - 1} onClick={() => reorder(1)}>Bring front</Button></div><div><FieldLabel value={`${Math.round(item.scale * 100)}%`}>Item scale</FieldLabel><Slider label="Selected screenshot scale" value={Math.round(item.scale * 100)} min={50} max={140} onChange={(value) => updateItem({ scale: value / 100 }, `item-scale-${selectedId}`)} /></div><div><FieldLabel value={`${item.offsetX}%`}>Horizontal</FieldLabel><Slider label="Selected screenshot horizontal position" value={item.offsetX} min={-100} max={100} onChange={(offsetX) => updateItem({ offsetX }, `item-x-${selectedId}`)} /></div><div><FieldLabel value={`${item.offsetY}%`}>Vertical</FieldLabel><Slider label="Selected screenshot vertical position" value={item.offsetY} min={-100} max={100} onChange={(offsetY) => updateItem({ offsetY }, `item-y-${selectedId}`)} /></div><div><FieldLabel value={`${item.radius}%`}>Corner radius</FieldLabel><Slider label="Selected screenshot corner radius" value={item.radius} min={0} max={100} onChange={(radius) => updateItem({ radius }, `item-radius-${selectedId}`)} /></div></div></Disclosure>;
              })()}
            </div>
          )}
        </Disclosure>
      </ProSection>

      <ProSection title="Background" action={resetAction("Reset", () => apply({ background: DEFAULT_BEAUTIFY.background }))}>
        <StudioBackgrounds assetId={assetId} settings={settings} onApply={apply} />
        <p className="t-micro mb-2 mt-5 text-ink-3">Classic colors</p>
        <div role="radiogroup" aria-label="Background preset" className="flex flex-wrap gap-2">
          {BACKGROUND_PRESETS.map((p) => {
            const active = activePreset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={p.label}
                title={p.label}
                data-testid={`beautify-bg-${p.id}`}
                onClick={() => apply({ background: { ...settings.background, color: p.color, color2: p.color2 } })}
                className={cn("inline-flex size-9 items-center justify-center rounded-full border shadow-xs transition-transform max-md:size-11", active ? "border-accent ring-2 ring-accent/40" : "border-line-strong hover:scale-105")}
                style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color2})` }}
              >
                {active && <Check aria-hidden className="size-4 text-ink mix-blend-difference" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <SegmentedControl<BackgroundKind> label="Background type" size="sm" value={settings.background.kind} onChange={(kind) => apply({ background: kind === "studio" ? STUDIO_BACKGROUNDS[0].background : { ...settings.background, kind } })} options={BACKGROUND_KINDS.map((kind) => ({ ...kind, label: kind.value === "screenshot" ? "Blurred shot" : kind.label }))} className="grid-flow-row grid-cols-2" />
        </div>
        <Button variant="secondary" size="sm" className="mt-4 w-full max-md:h-11" data-testid="beautify-auto-background" onClick={sampleScreenshotColours}>
          <WandSparkles /> Use screenshot colours
        </Button>
        <p className="t-body-sm mt-2 text-ink-3">Samples the already-local preview to make a related two-stop background. It does not read text or send your image anywhere.</p>
        {settings.background.kind === "custom-image" && <label className="mt-3 block"><span className="t-micro mb-1.5 block text-ink-3">Local background image</span><select aria-label="Custom background image" value={settings.background.assetId ?? ""} onChange={(event) => apply({ background: { ...settings.background, assetId: event.target.value || null } })} className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink max-md:h-11"><option value="">Choose a workspace image</option>{order.filter((id) => id !== assetId).map((id) => <option key={id} value={id}>{files[id]?.name ?? "Local image"}</option>)}</select></label>}
        <div className="mt-3 flex flex-wrap gap-2">
          <ColorField label={twoColors ? "Base" : "Colour"} value={settings.background.color} onChange={(color) => apply({ background: { ...settings.background, color } }, "bg-color")} testId="beautify-color" />
          {twoColors && <ColorField label="Edge" value={settings.background.color2} onChange={(color2) => apply({ background: { ...settings.background, color2 } }, "bg-color2")} testId="beautify-color2" />}
        </div>
        {gradient && (
          <div className="mt-4">
            <FieldLabel>Direction</FieldLabel>
            <SegmentedControl<string>
              label="Gradient direction"
              size="sm"
              value={String(settings.background.angle)}
              onChange={(angle) => apply({ background: { ...settings.background, angle: Number(angle) as GradientAngle } })}
              options={GRADIENT_ANGLES.map((a) => ({ value: String(a.value), label: a.label }))}
            />
          </div>
        )}
        {settings.background.kind === "pattern" && (
          <div className="mt-4">
            <SegmentedControl<"dots" | "grid" | "diagonal"> label="Background pattern" size="sm" value={settings.background.pattern ?? "dots"} onChange={(pattern) => apply({ background: { ...settings.background, pattern } })} options={[{ value: "dots", label: "Dots" }, { value: "grid", label: "Grid" }, { value: "diagonal", label: "Diagonal" }]} />
          </div>
        )}
        {["mesh", "aurora", "noise", "pattern"].includes(settings.background.kind) && (
          <div className="mt-4"><FieldLabel value={`${settings.background.intensity ?? 55}%`}>Effect intensity</FieldLabel><Slider label="Background effect intensity" value={settings.background.intensity ?? 55} min={0} max={100} onChange={(intensity) => apply({ background: { ...settings.background, intensity } }, "background-intensity")} /></div>
        )}
        {(settings.background.kind === "screenshot" || settings.background.kind === "soft-blur") && (
          <div className="mt-4 space-y-3" data-testid="beautify-blurred-background-controls">
            <div>
              <FieldLabel value={`${settings.background.blur} px`}>Blur</FieldLabel>
              <Slider label="Background blur" value={settings.background.blur} min={0} max={48} onChange={(blur) => apply({ background: { ...settings.background, blur } }, "background-blur")} />
            </div>
            <div>
              <FieldLabel value={`${settings.background.brightness}%`}>Brightness</FieldLabel>
              <Slider label="Background brightness" value={settings.background.brightness} min={35} max={120} onChange={(brightness) => apply({ background: { ...settings.background, brightness } }, "background-brightness")} />
            </div>
            <div>
              <FieldLabel value={`${settings.background.saturation}%`}>Saturation</FieldLabel>
              <Slider label="Background saturation" value={settings.background.saturation} min={70} max={140} onChange={(saturation) => apply({ background: { ...settings.background, saturation } }, "background-saturation")} />
            </div>
            <p className="t-body-sm text-ink-3">Uses the same local screenshot bitmap as the foreground. No second full-resolution copy is retained.</p>
          </div>
        )}
      </ProSection>

      <ProSection title="Shadow / Border / Glass" action={resetAction("Reset", () => apply({ padding: DEFAULT_BEAUTIFY.padding, radius: DEFAULT_BEAUTIFY.radius, shadow: DEFAULT_BEAUTIFY.shadow, shadowAdvanced: DEFAULT_BEAUTIFY.shadowAdvanced, border: DEFAULT_BEAUTIFY.border }))}>
        <FieldLabel value={`${settings.padding}%`}>Padding</FieldLabel>
        <SegmentedControl<string>
          label="Padding"
          size="sm"
          value={String(PADDING_PRESETS.find((p) => p.value === settings.padding)?.value ?? "custom")}
          onChange={(v) => apply({ padding: Number(v) }, "padding")}
          options={PADDING_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))}
        />
        <Slider className="mt-3" label="Padding" value={settings.padding} min={0} max={MAX_PADDING} onChange={(padding) => apply({ padding }, "padding")} valueText={`${settings.padding}%`} />

        <div className="mt-4">
          <FieldLabel value={settings.mode === "phone" ? "Device shape" : `${layout.radius} px`}>Corner radius</FieldLabel>
          {settings.mode === "phone" ? (
            <p className="t-body-sm text-ink-3" data-testid="beautify-radius-note">
              The phone shell keeps its own rounding.
            </p>
          ) : (
            <Slider label="Corner radius" value={settings.radius} min={0} max={100} onChange={(radius) => apply({ radius }, "radius")} valueText={`${layout.radius} px`} />
          )}
        </div>

        <div className="mt-4">
          <FieldLabel>Shadow</FieldLabel>
          <SegmentedControl<ShadowPreset> label="Shadow" size="sm" value={settings.shadow} onChange={(shadow) => apply({ shadow })} options={SHADOW_LABELS} className="grid-flow-row grid-cols-3" />
          <Disclosure title="Advanced shadow" className="mt-3">
            <div className="space-y-3">
              {([
                ["x", "X", -12, 12],
                ["y", "Y", -12, 12],
                ["blur", "Blur", 0, 20],
                ["spread", "Spread", 0, 8],
                ["opacity", "Opacity", 0, 80],
              ] as const).map(([key, label, min, max]) => (
                <div key={key}>
                  <FieldLabel value={`${settings.shadowAdvanced[key]}%`}>{label}</FieldLabel>
                  <Slider
                    label={`Shadow ${label.toLowerCase()}`}
                    value={settings.shadowAdvanced[key]}
                    min={min}
                    max={max}
                    step={key === "opacity" ? 1 : 0.5}
                    onChange={(value) => apply({ shadow: "custom", shadowAdvanced: { ...settings.shadowAdvanced, [key]: value } }, `shadow-${key}`)}
                  />
                </div>
              ))}
              <ColorField label="Shadow colour" value={settings.shadowAdvanced.color ?? "#14100c"} onChange={(color) => apply({ shadow: "custom", shadowAdvanced: { ...settings.shadowAdvanced, color } }, "shadow-color")} testId="beautify-shadow-color" />
            </div>
          </Disclosure>
        </div>

        <div className="mt-4">
          <FieldLabel>Border</FieldLabel>
          <SegmentedControl<BorderKind>
            label="Border style"
            size="sm"
            value={settings.border.kind}
            onChange={(kind) => apply({ border: { ...settings.border, kind } })}
            options={[
              { value: "none", label: "None" },
              { value: "solid", label: "Solid" },
              { value: "glass", label: "Glass" },
              { value: "frosted", label: "Frosted" },
              { value: "inner", label: "Inner" },
              { value: "highlight", label: "Highlight" },
            ]}
            className="grid-flow-row grid-cols-3"
          />
          {settings.border.kind !== "none" && (
            <div className="mt-3 space-y-3" data-testid="beautify-border-controls">
              <ColorField label="Border colour" value={settings.border.color} onChange={(color) => apply({ border: { ...settings.border, color } }, "border-color")} testId="beautify-border-color" />
              <div>
                <FieldLabel value={`${settings.border.width} px`}>Width</FieldLabel>
                <Slider label="Border width" value={settings.border.width} min={1} max={24} onChange={(width) => apply({ border: { ...settings.border, width } }, "border-width")} />
              </div>
              {(settings.border.kind === "glass" || settings.border.kind === "frosted") && <div><FieldLabel value={`${settings.border.blur ?? 12} px`}>Glass blur</FieldLabel><Slider label="Glass blur" value={settings.border.blur ?? 12} min={0} max={40} onChange={(blur) => apply({ border: { ...settings.border, blur } }, "border-blur")} /></div>}
              <div>
                <FieldLabel value={`${settings.border.opacity}%`}>Opacity</FieldLabel>
                <Slider label="Border opacity" value={settings.border.opacity} min={5} max={100} onChange={(opacity) => apply({ border: { ...settings.border, opacity } }, "border-opacity")} />
              </div>
            </div>
          )}
        </div>
      </ProSection>

      <ProSection title="Position & scale" action={resetAction("Reset position", () => apply({ scale: DEFAULT_BEAUTIFY.scale, offsetX: 0, offsetY: 0 }))}>
        <Button variant="secondary" size="sm" className="mb-4 w-full max-md:h-11" data-testid="beautify-auto-layout" onClick={() => apply(autoLayout(settings, { width: file.width, height: file.height }))}>
          <WandSparkles /> Auto layout
        </Button>
        <p className="t-body-sm -mt-2 mb-4 text-ink-3">A deterministic starting layout based on screenshot shape. It only adjusts canvas ratio, padding, scale and centring.</p>
        <FieldLabel value={`${Math.round(settings.scale * 100)}%`}>Scale</FieldLabel>
        <Slider label="Composition scale" value={Math.round(settings.scale * 100)} min={40} max={100} onChange={(v) => apply({ scale: v / 100 }, "scale")} valueText={`${Math.round(settings.scale * 100)}%`} />
        <div className="mt-4 grid gap-3">
          <div>
            <FieldLabel>Horizontal</FieldLabel>
            <Slider label="Horizontal position" value={Math.round(settings.offsetX * 100)} min={-100} max={100} onChange={(v) => apply({ offsetX: v / 100 }, "offset-x")} className={cn(freeX <= 0 && "opacity-40")} />
          </div>
          <div>
            <FieldLabel>Vertical</FieldLabel>
            <Slider label="Vertical position" value={Math.round(settings.offsetY * 100)} min={-100} max={100} onChange={(v) => apply({ offsetY: v / 100 }, "offset-y")} className={cn(freeY <= 0 && "opacity-40")} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Snap screenshot position">
          {([[-1, "Left"], [0, "Centre X"], [1, "Right"]] as const).map(([offsetX, label]) => <Button key={label} type="button" size="sm" variant="secondary" onClick={() => { apply({ offsetX }); window.dispatchEvent(new CustomEvent("shotexa:beautify-guide", { detail: "x" })); }}>{label}</Button>)}
          {([[-1, "Top"], [0, "Centre Y"], [1, "Bottom"]] as const).map(([offsetY, label]) => <Button key={label} type="button" size="sm" variant="secondary" onClick={() => { apply({ offsetY }); window.dispatchEvent(new CustomEvent("shotexa:beautify-guide", { detail: "y" })); }}>{label}</Button>)}
        </div>
        {freeX <= 0 && freeY <= 0 && <p className="t-body-sm mt-2 text-ink-3">Add padding or lower the scale to move the screenshot around.</p>}
      </ProSection>

      <ProSection title="3D & Perspective" action={resetAction("Flat", () => apply({ perspective: perspectiveForPreset("flat") }))}>
        <SegmentedControl<PerspectivePreset>
          label="Perspective preset"
          size="sm"
          value={settings.perspective.preset}
          onChange={(preset) => apply({ perspective: perspectiveForPreset(preset) })}
          options={Object.keys(PERSPECTIVE_PRESETS).filter((value) => value !== "custom").map((value) => ({ value: value as PerspectivePreset, label: value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") }))}
          className="grid-flow-row grid-cols-2"
        />
        <Disclosure title="Advanced 3D controls" className="mt-3" defaultOpen={settings.perspective.preset === "custom"}>
          <div className="space-y-3" data-testid="beautify-perspective-controls">
            {([['rotateX', 'Rotate X', -60, 60], ['rotateY', 'Rotate Y', -60, 60], ['rotateZ', 'Rotate Z', -45, 45], ['depth', 'Perspective depth', 200, 2000], ['originX', 'Origin X', 0, 100], ['originY', 'Origin Y', 0, 100]] as const).map(([key, label, min, max]) => <div key={key}><FieldLabel value={key === "depth" ? String(settings.perspective[key]) : `${settings.perspective[key]}°`}>{label}</FieldLabel><Slider label={label} value={settings.perspective[key]} min={min} max={max} onChange={(value) => apply({ perspective: { ...settings.perspective, preset: "custom", [key]: value } }, `perspective-${key}`)} /></div>)}
          </div>
        </Disclosure>
        <p className="t-body-sm mt-3 text-ink-3">Canvas-based projection is shared by preview and export. No WebGL or remote processing is used.</p>
      </ProSection>

      <ProSection title="Text" action={resetAction("Reset text", () => apply({ text: DEFAULT_BEAUTIFY.text }))}>
        <div className="mb-4 grid grid-cols-2 gap-2" aria-label="Text style presets">{TEXT_PRESETS.map((preset) => <Button key={preset.id} type="button" size="sm" variant="secondary" onClick={() => apply({ text: { ...settings.text, ...preset.text } })}>{preset.label}</Button>)}</div>
        <label className="mb-3 block"><span className="t-micro mb-1.5 block text-ink-3">Eyebrow / label</span><input type="text" value={settings.text.eyebrow} maxLength={80} placeholder="Optional label" onChange={(event) => apply({ text: { ...settings.text, eyebrow: event.target.value } }, "caption-eyebrow")} className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11" /></label>
        <label className="block">
          <span className="t-micro mb-1.5 block text-ink-3">Title</span>
          <input
            type="text"
            value={settings.text.title}
            maxLength={120}
            data-testid="beautify-title"
            placeholder="Optional title"
            onChange={(event) => apply({ text: { ...settings.text, title: event.target.value } }, "caption-title")}
            className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11"
          />
        </label>
        <label className="mt-3 block">
          <span className="t-micro mb-1.5 block text-ink-3">Subtitle</span>
          <input
            type="text"
            value={settings.text.subtitle}
            maxLength={200}
            data-testid="beautify-subtitle"
            placeholder="Optional subtitle"
            onChange={(event) => apply({ text: { ...settings.text, subtitle: event.target.value } }, "caption-subtitle")}
            className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11"
          />
        </label>
        <label className="mt-3 block"><span className="t-micro mb-1.5 block text-ink-3">Footer</span><input type="text" value={settings.text.footer} maxLength={160} placeholder="Optional footer" onChange={(event) => apply({ text: { ...settings.text, footer: event.target.value } }, "caption-footer")} className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11" /></label>
        {(settings.text.eyebrow || settings.text.title || settings.text.subtitle || settings.text.footer) && (
          <Disclosure title="Typography controls" className="mt-4" defaultOpen>
            <SegmentedControl<CaptionPlacement>
              label="Text placement"
              size="sm"
              value={settings.text.placement}
              onChange={(placement) => apply({ text: { ...settings.text, placement } })}
              options={[
                { value: "top", label: "Top" },
                { value: "bottom", label: "Bottom" },
              ]}
            />
            <div className="mt-3">
              <FieldLabel>Font family</FieldLabel>
              <SegmentedControl<FontFamily> label="Font family" size="sm" value={settings.text.family} onChange={(family) => apply({ text: { ...settings.text, family } })} options={[{ value: "system", label: "System" }, { value: "humanist", label: "Humanist" }, { value: "geometric", label: "Geometric" }, { value: "serif", label: "Serif" }, { value: "mono", label: "Mono" }]} className="grid-flow-row grid-cols-3" />
            </div>
            <div className="mt-3">
              <FieldLabel value={`${settings.text.fontSize} px`}>Font size</FieldLabel>
              <Slider label="Title font size" value={settings.text.fontSize} min={18} max={120} onChange={(fontSize) => apply({ text: { ...settings.text, fontSize } }, "caption-size")} />
            </div>
            <div className="mt-3">
              <FieldLabel>Weight</FieldLabel>
              <SegmentedControl<string>
                label="Title font weight"
                size="sm"
                value={String(settings.text.weight)}
                onChange={(weight) => apply({ text: { ...settings.text, weight: Number(weight) as FontWeight } })}
                options={[400, 500, 600, 700].map((weight) => ({ value: String(weight), label: String(weight) }))}
              />
            </div>
            <div className="mt-3"><FieldLabel value={`${settings.text.lineHeight}%`}>Line height</FieldLabel><Slider label="Text line height" value={settings.text.lineHeight} min={80} max={200} onChange={(lineHeight) => apply({ text: { ...settings.text, lineHeight } }, "caption-line-height")} /></div>
            <div className="mt-3"><FieldLabel value={`${settings.text.letterSpacing} px`}>Letter spacing</FieldLabel><Slider label="Text letter spacing" value={settings.text.letterSpacing} min={-3} max={12} step={0.5} onChange={(letterSpacing) => apply({ text: { ...settings.text, letterSpacing } }, "caption-letter-spacing")} /></div>
            <div className="mt-3">
              <FieldLabel>Alignment</FieldLabel>
              <SegmentedControl<TextAlignment>
                label="Text alignment"
                size="sm"
                value={settings.text.align}
                onChange={(align) => apply({ text: { ...settings.text, align } })}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Centre" },
                  { value: "right", label: "Right" },
                ]}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <ColorField label="Text colour" value={settings.text.color} onChange={(color) => apply({ text: { ...settings.text, color } }, "caption-color")} testId="beautify-text-color" />
            </div>
            <div className="mt-3">
              <FieldLabel value={`${settings.text.spacing} px`}>Spacing</FieldLabel>
              <Slider label="Title and subtitle spacing" value={settings.text.spacing} min={0} max={48} onChange={(spacing) => apply({ text: { ...settings.text, spacing } }, "caption-spacing")} />
            </div>
            <div className="mt-3">
              <FieldLabel value={`${settings.text.maxWidth}%`}>Maximum width</FieldLabel>
              <Slider label="Maximum text width" value={settings.text.maxWidth} min={30} max={100} onChange={(maxWidth) => apply({ text: { ...settings.text, maxWidth } }, "caption-width")} />
            </div>
            <p className="t-body-sm mt-3 text-ink-3">Uses a system font stack so preview and export stay available without downloading a font.</p>
          </Disclosure>
        )}
      </ProSection>

      {(["browser", "minimal-browser", "mac-window", "windows-window", "laptop", "monitor"] as BeautifyMode[]).includes(settings.mode) && (
        <ProSection title="Frame">
          <SegmentedControl<FrameTheme>
            label="Window theme"
            size="sm"
            value={settings.browser.theme}
            onChange={(theme) => apply({ browser: { ...settings.browser, theme } })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <Toggle className="mt-4" label="Address bar" checked={settings.browser.showAddress} onChange={(showAddress) => apply({ browser: { ...settings.browser, showAddress } })} />
          <Toggle className="mt-3" label="Window controls" checked={settings.browser.showControls ?? true} onChange={(showControls) => apply({ browser: { ...settings.browser, showControls } })} />
          <div className="mt-3"><ColorField label="Frame colour" value={settings.browser.color ?? "#f3f1ee"} onChange={(color) => apply({ browser: { ...settings.browser, color } }, "frame-color")} testId="beautify-frame-color" /></div>
          <div className="mt-3"><FieldLabel value={`${settings.browser.thickness ?? 100}%`}>Frame thickness</FieldLabel><Slider label="Frame thickness" value={settings.browser.thickness ?? 100} min={50} max={160} onChange={(thickness) => apply({ browser: { ...settings.browser, thickness } }, "frame-thickness")} /></div>
          {settings.browser.showAddress && (
            <label className="mt-3 block">
              <span className="t-micro mb-1.5 block text-ink-3">Address text</span>
              <input
                type="text"
                data-testid="beautify-address"
                value={settings.browser.address}
                placeholder={DEFAULT_ADDRESS}
                maxLength={80}
                onChange={(e) => apply({ browser: { ...settings.browser, address: e.target.value } }, "address")}
                className="h-9 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11"
              />
              <span className="t-body-sm mt-1.5 block text-ink-3">Typed by you — Shotexa never reads a URL out of your screenshot.</span>
            </label>
          )}
          <label className="mt-3 block"><span className="t-micro mb-1.5 block text-ink-3">Window title</span><input type="text" value={settings.browser.title ?? ""} maxLength={80} placeholder="Optional title" onChange={(event) => apply({ browser: { ...settings.browser, title: event.target.value } }, "window-title")} className="h-9 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent max-md:h-11" /></label>
        </ProSection>
      )}

      {(["phone", "android-phone", "tablet"] as BeautifyMode[]).includes(settings.mode) && (
        <ProSection title="Frame">
          <SegmentedControl<FrameTheme>
            label="Device colour"
            size="sm"
            value={settings.phone.theme}
            onChange={(theme) => apply({ phone: { ...settings.phone, theme } })}
            options={[
              { value: "dark", label: "Graphite" },
              { value: "light", label: "Silver" },
            ]}
          />
          <div className="mt-3"><ColorField label="Bezel colour" value={settings.phone.color ?? "#1c1714"} onChange={(color) => apply({ phone: { ...settings.phone, color } }, "bezel-color")} testId="beautify-bezel-color" /></div>
          <div className="mt-3"><FieldLabel value={`${settings.phone.thickness ?? 100}%`}>Bezel thickness</FieldLabel><Slider label="Bezel thickness" value={settings.phone.thickness ?? 100} min={50} max={160} onChange={(thickness) => apply({ phone: { ...settings.phone, thickness } }, "bezel-thickness")} /></div>
          <Toggle className="mt-3" label="Device shadow" checked={settings.phone.shadow ?? true} onChange={(shadow) => apply({ phone: { ...settings.phone, shadow } })} />
          <div className="mt-4">
            <FieldLabel>Screenshot fit</FieldLabel>
            <SegmentedControl<ScreenFit>
              label="Screenshot fit"
              size="sm"
              value={settings.phone.fit}
              onChange={(fit) => apply({ phone: { ...settings.phone, fit } })}
              options={[
                { value: "cover", label: "Fill screen" },
                { value: "contain", label: "Fit whole" },
              ]}
            />
            <p className="t-body-sm mt-2 text-ink-3">
              {settings.phone.fit === "cover" ? "Fills the screen; the edges of a differently shaped screenshot are trimmed." : "Shows the whole screenshot; a differently shaped one leaves space above and below."} It is never stretched.
            </p>
          </div>
        </ProSection>
      )}

      <ProSection title="Branding">
        <p className="t-body-sm mb-3 text-ink-3">A quick anchored logo. Use Watermark Stamp Pro above for free positioning and patterns.</p>
        <label className="block"><span className="t-micro mb-1.5 block text-ink-3">Logo / watermark</span><select aria-label="Logo or watermark image" value={settings.branding.assetId ?? ""} onChange={(event) => apply({ branding: { ...settings.branding, assetId: event.target.value || null } })} className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink max-md:h-11"><option value="">None</option><optgroup label="Brand assets">{Object.values(files).filter((file) => file.kind === "resource").map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</optgroup><optgroup label="Workspace screenshots">{order.filter((id) => id !== assetId).map((id) => <option key={id} value={id}>{files[id]?.name ?? "Local image"}</option>)}</optgroup></select></label>
        {settings.branding.assetId && <div className="mt-3 space-y-3"><SegmentedControl<BeautifySettings["branding"]["position"]> label="Watermark position" size="sm" value={settings.branding.position} onChange={(position) => apply({ branding: { ...settings.branding, position } })} options={[{ value: "top-left", label: "Top left" }, { value: "top-right", label: "Top right" }, { value: "bottom-left", label: "Bottom left" }, { value: "bottom-right", label: "Bottom right" }, { value: "center", label: "Centre" }]} className="grid-flow-row grid-cols-2" /><div><FieldLabel value={`${settings.branding.scale}%`}>Scale</FieldLabel><Slider label="Watermark scale" value={settings.branding.scale} min={5} max={60} onChange={(scale) => apply({ branding: { ...settings.branding, scale } }, "branding-scale")} /></div><div><FieldLabel value={`${settings.branding.opacity}%`}>Opacity</FieldLabel><Slider label="Watermark opacity" value={settings.branding.opacity} min={5} max={100} onChange={(opacity) => apply({ branding: { ...settings.branding, opacity } }, "branding-opacity")} /></div><div><FieldLabel value={`${settings.branding.margin}%`}>Margin</FieldLabel><Slider label="Watermark margin" value={settings.branding.margin} min={0} max={20} onChange={(margin) => apply({ branding: { ...settings.branding, margin } }, "branding-margin")} /></div></div>}
        <p className="t-body-sm mt-2 text-ink-3">Choose another local workspace image. It stays in this browser session.</p>
      </ProSection>

      <ProSection title="Animation">
        <label className="block"><span className="t-micro mb-1.5 block text-ink-3">Preview preset</span><select aria-label="Animation preset" value={settings.animation.preset} onChange={(event) => apply({ animation: { ...ANIMATION_PRESETS[event.target.value as AnimationPreset] } })} className="h-10 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink max-md:h-11">{Object.keys(ANIMATION_PRESETS).map((value) => <option key={value} value={value}>{value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")}</option>)}</select></label>
        {settings.animation.preset !== "none" && <div className="mt-3 space-y-3" data-testid="beautify-animation-controls"><div><FieldLabel value={`${settings.animation.duration} ms`}>Duration</FieldLabel><Slider label="Animation duration" value={settings.animation.duration} min={300} max={15000} step={100} onChange={(duration) => apply({ animation: { ...settings.animation, duration } }, "animation-duration")} /></div><div><FieldLabel value={`${settings.animation.intensity}%`}>Intensity</FieldLabel><Slider label="Animation intensity" value={settings.animation.intensity} min={0} max={100} onChange={(intensity) => apply({ animation: { ...settings.animation, intensity } }, "animation-intensity")} /></div><Toggle label="Loop preview" checked={settings.animation.loop} onChange={(loop) => apply({ animation: { ...settings.animation, loop } })} /></div>}
        <p className="t-body-sm mt-2 text-ink-3">Real-time preview only in V2.0A. Static export remains unchanged and reliable; video/GIF export is intentionally separated.</p>
      </ProSection>

      <ProSection title="Export" action={<Mono className="text-[12px] text-ink-2">{layout.canvas.width} × {layout.canvas.height}</Mono>}>
        <SegmentedControl<OutputPreset>
          label="Output size"
          size="sm"
          value={settings.preset}
          onChange={(preset) => apply({ preset })}
          options={OUTPUT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          className="grid-flow-row grid-cols-3"
        />
        {settings.preset === "custom" && (
          <div className="mt-4" data-testid="beautify-custom-canvas">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Width" value={settings.customCanvas.width} min={64} max={16_384} onChange={(value) => setCustomDimension("width", value)} testId="beautify-custom-width" />
              <NumberField label="Height" value={settings.customCanvas.height} min={64} max={16_384} onChange={(value) => setCustomDimension("height", value)} testId="beautify-custom-height" />
            </div>
            <Toggle
              className="mt-3"
              label="Lock aspect ratio"
              checked={settings.customCanvas.lockAspect}
              onChange={(lockAspect) => apply({ customCanvas: { ...settings.customCanvas, lockAspect, aspectRatio: settings.customCanvas.width / settings.customCanvas.height } })}
            />
          </div>
        )}
        <div className="mt-4">
          <FieldLabel>Export resolution</FieldLabel>
          <SegmentedControl<`${ExportScale}`>
            label="Export resolution scale"
            size="sm"
            value={String(settings.exportScale) as `${ExportScale}`}
            onChange={(value) => apply({ exportScale: Number(value) as ExportScale })}
            options={([1, 2, 3, 4] as const).map((value) => ({ value: String(value) as `${ExportScale}`, label: `${value}×` }))}
          />
          <p className="t-body-sm mt-2 text-ink-3" aria-live="polite" data-testid="beautify-final-dimensions">
            Final image: {layout.canvas.width} × {layout.canvas.height} px. Unsafe dimensions are blocked before canvas allocation.
          </p>
          <div className="t-body-sm mt-3 rounded-md border border-line bg-surface-3 p-3 text-ink-2" data-testid="beautify-export-summary">
            <span className="block"><strong className="text-ink">Format:</strong> {exportSettings.format.toUpperCase()} · {settings.exportScale}×</span>
            <span className="block"><strong className="text-ink">Filename:</strong> beautified-{file.name.replace(/\.[^.]+$/, "").replace(/^beautified-/, "")}.{exportSettings.format === "jpeg" ? "jpg" : exportSettings.format}</span>
            <span className="block"><strong className="text-ink">Transparency:</strong> {exportSettings.format === "png" || exportSettings.format === "webp" ? "Supported" : "JPEG exports an opaque canvas"}</span>
            <span className="block"><strong className="text-ink">File size:</strong> measured after encoding</span>
          </div>
        </div>
        <Disclosure title="Advanced options" className="mt-4">
          <FieldLabel>Format</FieldLabel>
          <SegmentedControl<"png" | "jpeg" | "webp">
            label="Image export format"
            size="sm"
            value={exportSettings.format}
            onChange={(format) => setExportSettings({ format })}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" },
              { value: "webp", label: "WebP" },
            ]}
          />
          {exportSettings.format !== "png" && (
            <div className="mt-4">
              <FieldLabel value={`${Math.round(exportSettings.quality * 100)}%`}>Quality</FieldLabel>
              <Slider label="Image quality" value={Math.round(exportSettings.quality * 100)} min={50} max={100} onChange={(v) => setExportSettings({ quality: v / 100 })} />
            </div>
          )}
          <p className="t-body-sm mt-3 text-ink-3">PNG is lossless and the default. Very large compositions can only be saved as PNG.</p>
        </Disclosure>
        <Button variant="ghost" size="sm" className="mt-3 w-full max-md:h-11" data-testid="beautify-reset" disabled={!stored} onClick={() => setBeautify(assetId, null)}>
          <RotateCcw /> Reset composition
        </Button>
      </ProSection>
    </div>
  );
}
