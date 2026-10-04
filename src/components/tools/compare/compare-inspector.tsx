"use client";

import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { ALIGN_OPTIONS, BACKGROUND_OPTIONS, COMPARE_MODES, DEFAULT_COMPARE, FIT_OPTIONS } from "@/core/compare/presets";
import type { CompareAlign, CompareFit, CompareMode } from "@/core/compare/types";
import { cn } from "@/lib/cn";

/** A/B picker: every workspace image, labelled with its name and size. */
function AssetPicker({ label, value, exclude, onChange, testId }: { label: string; value: string | null; exclude: string | null; onChange: (id: string) => void; testId: string }) {
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  return (
    <label className="block">
      <span className="t-micro mb-1.5 block text-ink-3">{label}</span>
      <select
        data-testid={testId}
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent max-md:h-11"
      >
        {!value && <option value="">Choose a screenshot…</option>}
        {order
          .map((id) => files[id])
          .filter(Boolean)
          .map((f) => (
            <option key={f.id} value={f.id} disabled={f.id === exclude}>
              {f.name} · {f.width} × {f.height}
              {f.id === exclude ? " (already chosen)" : ""}
            </option>
          ))}
      </select>
    </label>
  );
}

export function CompareInspector() {
  const { runtime } = useWorkspaceContext();
  const settings = useWorkspace((s) => s.compare);
  const setCompare = useWorkspace((s) => s.setCompare);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const fileA = useWorkspace((s) => (s.compare.a ? s.files[s.compare.a] : undefined));
  const fileB = useWorkspace((s) => (s.compare.b ? s.files[s.compare.b] : undefined));
  const versionA = useWorkspace((s) => (s.compare.a ? s.files[s.compare.a]?.previewVersion ?? 0 : 0));
  const versionB = useWorkspace((s) => (s.compare.b ? s.files[s.compare.b]?.previewVersion ?? 0 : 0));
  const [alpha, setAlpha] = useState<{ a: boolean | null; b: boolean | null }>({ a: null, b: null });

  useEffect(() => {
    let live = true;
    if (!settings.a || !settings.b) return;
    void Promise.all([runtime.hasTransparency(settings.a), runtime.hasTransparency(settings.b)]).then(([a, b]) => live && setAlpha({ a, b }));
    return () => {
      live = false;
    };
  }, [runtime, settings.a, settings.b, versionA, versionB]);

  const apply = (patch: Partial<typeof settings>, coalesce?: string) => setCompare({ ...settings, ...patch }, { coalesce });
  const differentSizes = !!fileA && !!fileB && (fileA.width !== fileB.width || fileA.height !== fileB.height);

  return (
    <div data-testid="compare-inspector">
      <InspectorSection
        title="Screenshots"
        action={
          <button
            type="button"
            data-testid="compare-swap"
            aria-label="Swap before and after"
            disabled={!settings.a || !settings.b}
            onClick={() => apply({ a: settings.b, b: settings.a })}
            className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11"
          >
            <ArrowLeftRight aria-hidden className="size-3.5" /> Swap
          </button>
        }
      >
        <div className="space-y-3">
          <AssetPicker label="Before (A)" value={settings.a} exclude={settings.b} onChange={(a) => apply({ a })} testId="compare-pick-a" />
          <AssetPicker label="After (B)" value={settings.b} exclude={settings.a} onChange={(b) => apply({ b })} testId="compare-pick-b" />
        </div>
        {differentSizes && (
          <p className="t-body-sm mt-3 text-ink-2" data-testid="compare-size-note">
            These screenshots are different sizes ({fileA.width} × {fileA.height} and {fileB.width} × {fileB.height}). Neither is stretched — choose how they are fitted below.
          </p>
        )}
        {fileA && fileB && (
          <Disclosure title="File details" className="mt-4">
            <div className="grid grid-cols-2 gap-3" data-testid="compare-file-details">
              {([
                ["A", fileA, alpha.a],
                ["B", fileB, alpha.b],
              ] as const).map(([label, file, transparent]) => (
                <div key={label} className="min-w-0 rounded-md border border-line bg-surface-3 p-3">
                  <p className="t-micro text-ink-3">{label} · {file.name}</p>
                  <dl className="t-mono mt-2 space-y-1 text-[11px] text-ink-2">
                    <div><dt className="inline text-ink-3">Size </dt><dd className="inline">{file.width} × {file.height}</dd></div>
                    <div><dt className="inline text-ink-3">Ratio </dt><dd className="inline">{(file.width / file.height).toFixed(2)}:1</dd></div>
                    <div><dt className="inline text-ink-3">Format </dt><dd className="inline">{file.type.replace("image/", "").toUpperCase()}</dd></div>
                    <div><dt className="inline text-ink-3">Bytes </dt><dd className="inline">{formatBytes(file.bytes)}</dd></div>
                    <div><dt className="inline text-ink-3">Alpha </dt><dd className="inline">{transparent === null ? "Checking…" : transparent ? "Present" : "None detected"}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </InspectorSection>

      <InspectorSection
        title="Comparison"
        action={
          <button type="button" onClick={() => apply({ threshold: DEFAULT_COMPARE.threshold, minRegionSize: DEFAULT_COMPARE.minRegionSize, mergeDistance: DEFAULT_COMPARE.mergeDistance, ignoreTiny: DEFAULT_COMPARE.ignoreTiny, flicker: false })} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink max-md:min-h-11">
            <RotateCcw className="size-3.5" /> Reset analysis
          </button>
        }
      >
        <SegmentedControl<CompareMode>
          label="Comparison mode"
          value={settings.mode}
          onChange={(mode) => apply({ mode })}
          options={COMPARE_MODES.map((m) => ({ value: m.value, label: m.label }))}
          className="grid-flow-row grid-cols-2"
        />
        <p className="t-body-sm mt-3 text-ink-3" data-testid="compare-mode-hint">
          {COMPARE_MODES.find((m) => m.value === settings.mode)!.hint}
        </p>

        {settings.mode === "slider" && (
          <div className="mt-4">
            <FieldLabel value={`${settings.divider}%`}>Divider</FieldLabel>
            <Slider label="Divider position" value={settings.divider} min={0} max={100} onChange={(divider) => apply({ divider }, "divider")} valueText={`${settings.divider}%`} />
          </div>
        )}
        {settings.mode === "overlay" && (
          <div className="mt-4">
            <FieldLabel value={`${Math.round(settings.opacity * 100)}%`}>After opacity</FieldLabel>
            <Slider label="After opacity" value={Math.round(settings.opacity * 100)} min={0} max={100} onChange={(v) => apply({ opacity: v / 100 }, "opacity")} valueText={`${Math.round(settings.opacity * 100)}%`} />
          </div>
        )}
        {(settings.mode === "difference" || settings.mode === "heatmap") && (
          <div className="mt-4">
            <FieldLabel value={String(settings.threshold)}>Sensitivity</FieldLabel>
            <Slider label="Difference sensitivity" value={120 - settings.threshold} min={0} max={120} onChange={(v) => apply({ threshold: 120 - v }, "threshold")} valueText={`threshold ${settings.threshold}`} />
            <p className="t-body-sm mt-2 text-ink-3">
              Higher sensitivity marks smaller changes. Shotexa shows <em>where</em> pixels differ — it does not interpret what changed.
            </p>
            <Disclosure title="Changed region controls" className="mt-4">
              <Toggle label="Ignore tiny differences" checked={settings.ignoreTiny} onChange={(ignoreTiny) => apply({ ignoreTiny })} />
              <div className="mt-3">
                <FieldLabel value={`${settings.minRegionSize} px`}>Minimum region size</FieldLabel>
                <Slider label="Minimum changed region size" value={settings.minRegionSize} min={1} max={500} onChange={(minRegionSize) => apply({ minRegionSize }, "region-size")} />
              </div>
              <div className="mt-3">
                <FieldLabel value={`${settings.mergeDistance} px`}>Merge distance</FieldLabel>
                <Slider label="Changed region merge distance" value={settings.mergeDistance} min={0} max={40} onChange={(mergeDistance) => apply({ mergeDistance }, "merge-distance")} />
              </div>
              <p className="t-body-sm mt-2 text-ink-3">Region pixel counts and distances use the bounded interaction preview, shown beside the result.</p>
            </Disclosure>
          </div>
        )}
        {settings.mode === "side-by-side" && (
          <div className="mt-4">
            <FieldLabel value={`${settings.gap}%`}>Gap</FieldLabel>
            <Slider label="Gap between screenshots" value={settings.gap} min={0} max={20} onChange={(gap) => apply({ gap }, "gap")} valueText={`${settings.gap}%`} />
          </div>
        )}
        <div className="mt-4">
          <Toggle label={settings.flicker ? "Flicker playing" : "Flicker paused"} description="Preview only" checked={settings.flicker} onChange={(flicker) => apply({ flicker })} />
          {settings.flicker && (
            <div className="mt-3">
              <FieldLabel>Speed</FieldLabel>
              <SegmentedControl<"250" | "500" | "1000">
                label="Flicker speed"
                size="sm"
                value={String(settings.flickerSpeed) as "250" | "500" | "1000"}
                onChange={(value) => apply({ flickerSpeed: Number(value) as 250 | 500 | 1000 })}
                options={[
                  { value: "1000", label: "Slow" },
                  { value: "500", label: "Medium" },
                  { value: "250", label: "Fast" },
                ]}
              />
              <p className="t-body-sm mt-2 text-ink-3">Alternates A and B locally. Reduced-motion settings pause the effect automatically.</p>
            </div>
          )}
        </div>
      </InspectorSection>

      <InspectorSection title="Fitting">
        <FieldLabel>How each screenshot fills the frame</FieldLabel>
        <SegmentedControl<CompareFit> label="Fit" size="sm" value={settings.fit} onChange={(fit) => apply({ fit })} options={FIT_OPTIONS} />
        <p className="t-body-sm mt-2 text-ink-3">
          {settings.fit === "contain" ? "Each screenshot is shown whole, scaled to the same frame." : settings.fit === "cover" ? "Each screenshot fills the frame; the overflow is trimmed." : "Natural pixels, no scaling."}
        </p>
        <div className="mt-4">
          <FieldLabel>Alignment</FieldLabel>
          <SegmentedControl<CompareAlign> label="Alignment" size="sm" value={settings.align} onChange={(align) => apply({ align })} options={ALIGN_OPTIONS} className="grid-flow-row grid-cols-3" />
        </div>
      </InspectorSection>

      <InspectorSection title="Output" action={<Mono className="text-[12px] text-ink-2">{exportSettings.format.toUpperCase()}</Mono>}>
        <Toggle label="Before / after labels" checked={settings.labels} onChange={(labels) => apply({ labels })} />
        <div className="mt-4">
          <FieldLabel>Background</FieldLabel>
          <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-2">
            {BACKGROUND_OPTIONS.map((o) => {
              const active = settings.background === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => apply({ background: o.value })}
                  className={cn("inline-flex size-9 items-center justify-center rounded-full border shadow-xs max-md:size-11", active ? "border-accent ring-2 ring-accent/40" : "border-line-strong hover:scale-105")}
                  style={{ backgroundColor: o.value }}
                />
              );
            })}
          </div>
          <p className="t-body-sm mt-2 text-ink-3">Shown wherever a screenshot does not cover the frame.</p>
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
          <p className="t-body-sm mt-3 text-ink-3">PNG is lossless and the default. The export is a still image — the divider is saved where you left it.</p>
        </Disclosure>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full max-md:h-11"
          data-testid="compare-reset"
          onClick={() => setCompare({ ...DEFAULT_COMPARE, a: settings.a, b: settings.b })}
        >
          <RotateCcw /> Reset comparison
        </Button>
      </InspectorSection>
    </div>
  );
}
