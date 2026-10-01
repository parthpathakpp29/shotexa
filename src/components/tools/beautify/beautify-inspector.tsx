"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { beautifyLayout, withMode } from "@/core/beautify/layout";
import { BACKGROUND_PRESETS, DEFAULT_ADDRESS, DEFAULT_BEAUTIFY, GRADIENT_ANGLES, MAX_PADDING, OUTPUT_PRESETS, PADDING_PRESETS, SHADOW_LABELS } from "@/core/beautify/presets";
import type { BackgroundKind, BeautifyMode, BeautifySettings, FrameTheme, GradientAngle, OutputPreset, ScreenFit, ShadowPreset } from "@/core/beautify/types";
import { cn } from "@/lib/cn";

const MODES: { value: BeautifyMode; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "browser", label: "Browser" },
  { value: "phone", label: "Phone" },
];

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

export function BeautifyInspector({ assetId }: { assetId: string }) {
  const file = useWorkspace((s) => s.files[assetId]);
  const stored = useWorkspace((s) => s.beautify.byAsset[assetId]);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  if (!file) return null;

  const settings = stored ?? DEFAULT_BEAUTIFY;
  const layout = beautifyLayout(settings, { width: file.width, height: file.height });
  const apply = (patch: Partial<BeautifySettings>, coalesce?: string) => setBeautify(assetId, { ...settings, ...patch }, { coalesce });
  const freeX = layout.canvas.width - layout.content.width;
  const freeY = layout.canvas.height - layout.content.height;
  const gradient = settings.background.kind === "gradient";
  const activePreset = BACKGROUND_PRESETS.find((p) => p.color === settings.background.color && (!gradient || p.color2 === settings.background.color2));

  return (
    <div data-testid="beautify-inspector">
      <InspectorSection title="Style">
        <SegmentedControl<BeautifyMode> label="Composition style" value={settings.mode} onChange={(mode) => setBeautify(assetId, withMode(settings, mode))} options={MODES} />
        <p className="t-body-sm mt-3 text-ink-3">
          {settings.mode === "clean" ? "Your screenshot on a styled background." : settings.mode === "browser" ? "Inside a plain browser window — no real browser's logo." : "Inside a generic phone shell, not a specific handset."}
        </p>
      </InspectorSection>

      <InspectorSection title="Background">
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
          <SegmentedControl<BackgroundKind>
            label="Background type"
            size="sm"
            value={settings.background.kind}
            onChange={(kind) => apply({ background: { ...settings.background, kind } })}
            options={[
              { value: "solid", label: "Solid" },
              { value: "gradient", label: "Gradient" },
            ]}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ColorField label={gradient ? "From" : "Colour"} value={settings.background.color} onChange={(color) => apply({ background: { ...settings.background, color } }, "bg-color")} testId="beautify-color" />
          {gradient && <ColorField label="To" value={settings.background.color2} onChange={(color2) => apply({ background: { ...settings.background, color2 } }, "bg-color2")} testId="beautify-color2" />}
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
      </InspectorSection>

      <InspectorSection title="Padding, corners and shadow">
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
          <SegmentedControl<ShadowPreset> label="Shadow" size="sm" value={settings.shadow} onChange={(shadow) => apply({ shadow })} options={SHADOW_LABELS} />
        </div>
      </InspectorSection>

      <InspectorSection title="Size and position">
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
        {freeX <= 0 && freeY <= 0 && <p className="t-body-sm mt-2 text-ink-3">Add padding or lower the scale to move the screenshot around.</p>}
      </InspectorSection>

      {settings.mode === "browser" && (
        <InspectorSection title="Browser window">
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
        </InspectorSection>
      )}

      {settings.mode === "phone" && (
        <InspectorSection title="Phone">
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
        </InspectorSection>
      )}

      <InspectorSection title="Output" action={<Mono className="text-[12px] text-ink-2">{layout.canvas.width} × {layout.canvas.height}</Mono>}>
        <SegmentedControl<OutputPreset>
          label="Output size"
          size="sm"
          value={settings.preset}
          onChange={(preset) => apply({ preset })}
          options={OUTPUT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          className="grid-flow-row grid-cols-3"
        />
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
      </InspectorSection>
    </div>
  );
}
