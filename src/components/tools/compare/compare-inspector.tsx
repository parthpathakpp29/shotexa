"use client";

/**
 * Compare Pro settings. Every preset only moves the controls below it — nothing here has a
 * hidden mode, and the report records exactly these values.
 */
import { ArrowLeftRight, Crosshair, RotateCcw, SquareDashed, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { NumberField } from "@/components/ui/number-field";
import { Badge, FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { alignmentSummary } from "@/core/compare/align";
import {
  ALIGN_MODES,
  ALIGN_OPTIONS,
  BACKGROUND_OPTIONS,
  COMPARE_MODES,
  COMPARE_PRESETS,
  DEFAULT_COMPARE,
  FIT_OPTIONS,
  METRIC_OPTIONS,
  applyComparePreset,
} from "@/core/compare/presets";
import type { CompareAlign, CompareAlignMode, CompareFit, CompareMetric, CompareMode, ComparePresetId } from "@/core/compare/types";
import { cn } from "@/lib/cn";
import { describeMismatch, useCompareResults } from "./use-compare";

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

export function CompareInspector({ onDrawIgnore }: { onDrawIgnore?: (on: boolean) => void } = {}) {
  const { runtime } = useWorkspaceContext();
  const settings = useWorkspace((s) => s.compare);
  const setCompare = useWorkspace((s) => s.setCompare);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const fileA = useWorkspace((s) => (s.compare.a ? s.files[s.compare.a] : undefined));
  const fileB = useWorkspace((s) => (s.compare.b ? s.files[s.compare.b] : undefined));
  const versionA = useWorkspace((s) => (s.compare.a ? s.files[s.compare.a]?.previewVersion ?? 0 : 0));
  const versionB = useWorkspace((s) => (s.compare.b ? s.files[s.compare.b]?.previewVersion ?? 0 : 0));
  const alignState = useWorkspace((s) => s.compareRun.align);
  const results = useCompareResults(fileA, fileB);
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
  const patchDiff = (patch: Partial<typeof settings.diff>, coalesce?: string) => apply({ diff: { ...settings.diff, ...patch } }, coalesce);
  const patchHeat = (patch: Partial<typeof settings.heatmap>, coalesce?: string) => apply({ heatmap: { ...settings.heatmap, ...patch } }, coalesce);
  const patchAlign = (patch: Partial<typeof settings.alignment>, coalesce?: string) => apply({ alignment: { ...settings.alignment, ...patch } }, coalesce);
  const mismatches = fileA && fileB ? describeMismatch(fileA, fileB) : [];
  const analysing = settings.mode === "difference" || settings.mode === "heatmap";
  const enabledIgnores = settings.ignoreRegions.filter((region) => region.enabled).length;

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
        {mismatches.length > 0 && fileA && fileB && (
          <div className="t-body-sm mt-3 rounded-md border border-[#f0dcb4] bg-warning-soft px-3 py-2 text-ink-2" data-testid="compare-size-note">
            <p className="font-medium text-ink">These screenshots are not the same shape</p>
            <ul className="mt-1 list-disc pl-4">
              {mismatches.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="mt-1 text-ink-3">Neither is stretched. Choose how they are fitted and placed below, or turn on automatic alignment.</p>
          </div>
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
                    <div><dt className="inline text-ink-3">Size </dt><dd className={cn("inline", fileA.width !== fileB.width || fileA.height !== fileB.height ? "text-warning" : "")}>{file.width} × {file.height}</dd></div>
                    <div><dt className="inline text-ink-3">Ratio </dt><dd className="inline">{(file.width / file.height).toFixed(2)}:1</dd></div>
                    <div><dt className="inline text-ink-3">Format </dt><dd className={cn("inline", fileA.type !== fileB.type ? "text-warning" : "")}>{file.type.replace("image/", "").toUpperCase()}</dd></div>
                    <div><dt className="inline text-ink-3">Bytes </dt><dd className="inline">{formatBytes(file.bytes)}</dd></div>
                    <div><dt className="inline text-ink-3">Alpha </dt><dd className="inline">{transparent === null ? "Checking…" : transparent ? "Present" : "None detected"}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </InspectorSection>

      <InspectorSection title="Presets" action={settings.preset && <Badge tone="accent">{COMPARE_PRESETS.find((p) => p.id === settings.preset)?.label}</Badge>}>
        <div role="radiogroup" aria-label="Comparison preset" className="grid grid-cols-2 gap-2" data-testid="compare-presets">
          {COMPARE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={settings.preset === preset.id}
              data-testid={`compare-preset-${preset.id}`}
              onClick={() => setCompare(applyComparePreset(settings, preset.id as ComparePresetId))}
              className={cn(
                "min-h-11 rounded-md border px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                settings.preset === preset.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="t-body-sm mt-2 text-ink-3" data-testid="compare-preset-hint">
          {settings.preset ? COMPARE_PRESETS.find((p) => p.id === settings.preset)?.description : "A preset just sets the controls below — you can change any of them afterwards."}
        </p>
      </InspectorSection>

      <InspectorSection
        title="Comparison"
        action={
          <button
            type="button"
            onClick={() =>
              apply({
                threshold: DEFAULT_COMPARE.threshold,
                minRegionSize: DEFAULT_COMPARE.minRegionSize,
                mergeDistance: DEFAULT_COMPARE.mergeDistance,
                ignoreTiny: DEFAULT_COMPARE.ignoreTiny,
                detectMovement: DEFAULT_COMPARE.detectMovement,
                diff: { ...DEFAULT_COMPARE.diff },
                heatmap: { ...DEFAULT_COMPARE.heatmap },
                flicker: false,
                preset: null,
              })
            }
            className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink max-md:min-h-11"
          >
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
        {settings.mode === "side-by-side" && (
          <div className="mt-4">
            <FieldLabel value={`${settings.gap}%`}>Gap</FieldLabel>
            <Slider label="Gap between screenshots" value={settings.gap} min={0} max={20} onChange={(gap) => apply({ gap }, "gap")} valueText={`${settings.gap}%`} />
          </div>
        )}

        {analysing && (
          <>
            <div className="mt-4">
              <FieldLabel>What is measured</FieldLabel>
              <SegmentedControl<CompareMetric> label="Difference metric" size="sm" value={settings.diff.metric} onChange={(metric) => patchDiff({ metric })} options={METRIC_OPTIONS.map((m) => ({ value: m.value, label: m.label }))} />
              <p className="t-body-sm mt-2 text-ink-3" data-testid="compare-metric-hint">
                {METRIC_OPTIONS.find((m) => m.value === settings.diff.metric)!.hint}
              </p>
            </div>
            {settings.diff.metric === "pixel" ? (
              <div className="mt-4">
                <FieldLabel value={String(settings.threshold)}>Sensitivity</FieldLabel>
                <Slider label="Difference sensitivity" value={120 - settings.threshold} min={0} max={120} onChange={(v) => apply({ threshold: 120 - v }, "threshold")} valueText={`colour tolerance ${settings.threshold}`} />
                <p className="t-body-sm mt-2 text-ink-3">
                  Higher sensitivity marks smaller changes. Shotexa shows <em>where</em> pixels differ — it does not interpret what changed.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <FieldLabel value={`ΔE ${settings.diff.deltaE.toFixed(1)}`}>Perceptual tolerance</FieldLabel>
                <Slider label="Perceptual tolerance" value={Math.round(settings.diff.deltaE * 10)} min={5} max={150} onChange={(v) => patchDiff({ deltaE: v / 10 }, "delta-e")} valueText={`delta E ${settings.diff.deltaE.toFixed(1)}`} />
                <p className="t-body-sm mt-2 text-ink-3">CIE76 ΔE*ab in CIELAB. About 2.3 is the classic just-noticeable difference; higher values ignore more rendering noise.</p>
              </div>
            )}

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
              <Toggle className="mt-3" label="Look for moved regions" description="Deterministic matching only" checked={settings.detectMovement} onChange={(detectMovement) => apply({ detectMovement })} />
              <p className="t-body-sm mt-2 text-ink-3">A removed and an added region are only reported as one movement when the two actually correlate. Otherwise they stay separate.</p>
            </Disclosure>

            <Disclosure title="Noise and colour" className="mt-4">
              <Toggle label="Ignore anti-aliasing" description="Sub-pixel shifts only" checked={settings.diff.ignoreAntialiasing} onChange={(ignoreAntialiasing) => patchDiff({ ignoreAntialiasing })} />
              <Toggle className="mt-3" label="Ignore near-identical colour" description="Under the just-noticeable difference" checked={settings.diff.ignoreNearIdenticalColour} onChange={(ignoreNearIdenticalColour) => patchDiff({ ignoreNearIdenticalColour })} />
              <div className="mt-3">
                <FieldLabel value={String(settings.diff.luminanceTolerance)}>Luminance tolerance</FieldLabel>
                <Slider label="Luminance tolerance" value={settings.diff.luminanceTolerance} min={0} max={120} onChange={(luminanceTolerance) => patchDiff({ luminanceTolerance }, "luminance")} />
                <p className="t-body-sm mt-2 text-ink-3">Below the colour tolerance this catches brightness-only changes the colour gate would let through.</p>
              </div>
              <Toggle className="mt-3" label="Ignore transparent pixels" checked={settings.diff.ignoreTransparent} onChange={(ignoreTransparent) => patchDiff({ ignoreTransparent })} />
              <Toggle className="mt-3" label="Compare alpha" description="Transparency counts as a change" checked={settings.diff.compareAlpha} onChange={(compareAlpha) => patchDiff({ compareAlpha })} />
              <div className="mt-3">
                <FieldLabel>Ignore one colour</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label="Colour to ignore"
                    data-testid="compare-ignore-colour"
                    value={settings.diff.ignoreColour ?? "#ffffff"}
                    onChange={(event) => patchDiff({ ignoreColour: event.target.value.toLowerCase() })}
                    className="size-9 cursor-pointer rounded-sm border border-line bg-surface p-0.5 max-md:size-11"
                  />
                  <Button size="sm" variant="ghost" onClick={() => patchDiff({ ignoreColour: null })} disabled={!settings.diff.ignoreColour}>
                    Clear
                  </Button>
                  <Mono className="text-[11px]">{settings.diff.ignoreColour ?? "not set"}</Mono>
                </div>
                {settings.diff.ignoreColour && (
                  <div className="mt-3">
                    <FieldLabel value={String(settings.diff.ignoreColourTolerance)}>Colour match tolerance</FieldLabel>
                    <Slider label="Ignored colour tolerance" value={settings.diff.ignoreColourTolerance} min={0} max={120} onChange={(ignoreColourTolerance) => patchDiff({ ignoreColourTolerance }, "ignore-colour")} />
                  </div>
                )}
              </div>
            </Disclosure>

            {settings.mode === "heatmap" && (
              <Disclosure title="Heatmap" className="mt-4" defaultOpen>
                <div>
                  <FieldLabel value={`${settings.heatmap.intensity}%`}>Intensity</FieldLabel>
                  <Slider label="Heatmap intensity" value={settings.heatmap.intensity} min={25} max={200} onChange={(intensity) => patchHeat({ intensity }, "heat-intensity")} />
                </div>
                <div className="mt-3">
                  <FieldLabel value={`${settings.heatmap.threshold}%`}>Threshold</FieldLabel>
                  <Slider label="Heatmap threshold" value={settings.heatmap.threshold} min={0} max={100} onChange={(threshold) => patchHeat({ threshold }, "heat-threshold")} />
                  <p className="t-body-sm mt-2 text-ink-3">Change strength a pixel needs before it is coloured. Pixels below it are still counted as changed.</p>
                </div>
                <Toggle className="mt-3" label="Changed only" description="Keep the screenshot visible underneath" checked={settings.heatmap.changedOnly} onChange={(changedOnly) => patchHeat({ changedOnly })} />
                <div className="mt-3">
                  <FieldLabel value={`${settings.heatmap.dimUnchanged}%`}>Dim unchanged</FieldLabel>
                  <Slider label="Dim unchanged areas" value={settings.heatmap.dimUnchanged} min={0} max={100} onChange={(dimUnchanged) => patchHeat({ dimUnchanged }, "heat-dim")} />
                </div>
                <Toggle className="mt-3" label="Draw the legend" description="Saved into the exported image" checked={settings.heatmap.legend} onChange={(legend) => patchHeat({ legend })} />
              </Disclosure>
            )}
          </>
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

      <InspectorSection
        title="Automatic alignment"
        action={
          <button
            type="button"
            data-testid="compare-align-reset"
            onClick={() => {
              runtime.resetCompareAlignment();
              patchAlign({ dx: 0, dy: 0, scale: 1 });
            }}
            className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink max-md:min-h-11"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        }
      >
        <SegmentedControl<CompareAlignMode>
          label="Alignment mode"
          size="sm"
          className="grid-flow-row grid-cols-2"
          value={settings.alignment.mode}
          onChange={(mode) => patchAlign({ mode })}
          options={ALIGN_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
        <p className="t-body-sm mt-2 text-ink-3" data-testid="compare-align-hint">
          {ALIGN_MODES.find((m) => m.value === settings.alignment.mode)!.hint}
        </p>
        {settings.alignment.mode !== "off" && (
          <div className="mt-3 rounded-md border border-line bg-surface-3 p-3" data-testid="compare-align-result" aria-live="polite">
            {alignState.status === "running" ? (
              <p className="t-body-sm flex items-center gap-2 text-ink-2">
                <Crosshair aria-hidden className="size-4" /> Measuring the alignment…
              </p>
            ) : results.alignment ? (
              <>
                <p className="t-mono text-[12px] text-ink">{alignmentSummary(results.alignment)}</p>
                <p className="t-body-sm mt-1 text-ink-3">
                  {results.alignment.status === "failed"
                    ? "No reliable match was found, so the comparison runs unaligned. Nudge it by hand below if you need to."
                    : `Measured by ${results.alignment.method === "translate-scale" ? "translation and scale" : "translation"}, match score ${results.alignment.score.toFixed(2)} (${results.alignment.confidence} confidence).`}
                </p>
              </>
            ) : (
              <p className="t-body-sm text-ink-3">Not measured yet.</p>
            )}
          </div>
        )}
        <Disclosure title="Manual fine tuning" className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="X offset" ariaLabel="Manual X offset" testId="compare-manual-dx" value={settings.alignment.dx} min={-4000} max={4000} onCommit={(dx) => patchAlign({ dx, mode: settings.alignment.mode === "off" ? "translate" : settings.alignment.mode })} />
            <NumberField label="Y offset" ariaLabel="Manual Y offset" testId="compare-manual-dy" value={settings.alignment.dy} min={-4000} max={4000} onCommit={(dy) => patchAlign({ dy, mode: settings.alignment.mode === "off" ? "translate" : settings.alignment.mode })} />
          </div>
          <div className="mt-3">
            <FieldLabel value={`${(settings.alignment.scale * 100).toFixed(1)}%`}>Manual scale</FieldLabel>
            <Slider label="Manual scale" value={Math.round(settings.alignment.scale * 1000)} min={500} max={2000} onChange={(v) => patchAlign({ scale: v / 1000, mode: settings.alignment.mode === "off" ? "translate-scale" : settings.alignment.mode }, "manual-scale")} valueText={`${(settings.alignment.scale * 100).toFixed(1)} percent`} />
          </div>
          <p className="t-body-sm mt-2 text-ink-3">These are added on top of any measured transform, in comparison pixels. The export uses exactly the same numbers.</p>
        </Disclosure>
      </InspectorSection>

      <InspectorSection
        title="Ignore regions"
        action={
          settings.ignoreRegions.length > 0 && (
            <button type="button" onClick={() => apply({ ignoreRegions: [] })} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink max-md:min-h-11" data-testid="compare-ignore-clear">
              <Trash2 className="size-3.5" /> Clear all
            </button>
          )
        }
      >
        <Button variant="secondary" size="sm" className="w-full max-md:h-11" data-testid="compare-ignore-add" onClick={() => onDrawIgnore?.(true)}>
          <SquareDashed /> Draw a region to ignore
        </Button>
        <p className="t-body-sm mt-2 text-ink-3">
          Timestamps, rotating banners, ads, avatars, counters — anything that changes on its own. Ignored areas are left out of the measurement and shown outlined. They last for this comparison.
        </p>
        {settings.ignoreRegions.length > 0 && (
          <ul className="mt-3 space-y-2" data-testid="compare-ignore-list">
            {settings.ignoreRegions.map((region, index) => (
              <li key={region.id} className="rounded-md border border-line bg-surface-3 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Name for ignore region ${index + 1}`}
                    value={region.name}
                    placeholder={`Region ${index + 1}`}
                    onChange={(event) =>
                      apply({ ignoreRegions: settings.ignoreRegions.map((item) => (item.id === region.id ? { ...item, name: event.target.value } : item)) }, `ignore-name-${region.id}`)
                    }
                    className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent max-md:h-11"
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={region.enabled}
                    aria-label={`${region.enabled ? "Disable" : "Enable"} ignore region ${index + 1}`}
                    onClick={() => apply({ ignoreRegions: settings.ignoreRegions.map((item) => (item.id === region.id ? { ...item, enabled: !item.enabled } : item)) })}
                    className={cn("inline-flex h-9 shrink-0 items-center rounded-sm border px-2 text-[12px] max-md:h-11", region.enabled ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-3")}
                  >
                    {region.enabled ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ignore region ${index + 1}`}
                    onClick={() => apply({ ignoreRegions: settings.ignoreRegions.filter((item) => item.id !== region.id) })}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-line text-ink-2 hover:text-ink max-md:size-11"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
                <Mono className="mt-1.5 block text-[11px]">
                  {(region.width * 100).toFixed(1)}% × {(region.height * 100).toFixed(1)}% at {(region.x * 100).toFixed(1)}%, {(region.y * 100).toFixed(1)}%
                </Mono>
              </li>
            ))}
          </ul>
        )}
        {enabledIgnores > 0 && <p className="t-body-sm mt-2 text-accent-ink">{enabledIgnores} region{enabledIgnores === 1 ? "" : "s"} left out of the comparison.</p>}
      </InspectorSection>

      <InspectorSection title="Fitting">
        <FieldLabel>How each screenshot fills the frame</FieldLabel>
        <SegmentedControl<CompareFit> label="Fit" size="sm" value={settings.fit} onChange={(fit) => apply({ fit })} options={FIT_OPTIONS} />
        <p className="t-body-sm mt-2 text-ink-3">
          {settings.fit === "contain" ? "Each screenshot is shown whole, scaled to the same frame." : settings.fit === "cover" ? "Each screenshot fills the frame; the overflow is trimmed." : "Natural pixels, no scaling."}
        </p>
        <div className="mt-4">
          <FieldLabel>Placement</FieldLabel>
          <SegmentedControl<CompareAlign> label="Placement" size="sm" value={settings.align} onChange={(align) => apply({ align })} options={ALIGN_OPTIONS} className="grid-flow-row grid-cols-3" />
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
          onClick={() => {
            runtime.resetCompareAlignment();
            setCompare({ ...DEFAULT_COMPARE, a: settings.a, b: settings.b });
          }}
        >
          <RotateCcw /> Reset comparison
        </Button>
      </InspectorSection>
    </div>
  );
}
