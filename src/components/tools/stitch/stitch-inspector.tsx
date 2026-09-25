"use client";

import { RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { ExportFormat, StitchPair, StitchViewMode } from "@/core/runtime/types";
import type { ChainPlan } from "@/core/stitch/chain";
import { cn } from "@/lib/cn";

export function StitchInspector({
  pairs,
  maxOffsets,
  plan,
  ready,
  onReanalyse,
}: {
  pairs: StitchPair[];
  maxOffsets: number[];
  plan: ChainPlan | null;
  ready: boolean;
  onReanalyse(): void;
}) {
  const { viewMode, activeJoin, manualMode } = useWorkspace((s) => s.stitch);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setViewMode = useWorkspace((s) => s.setViewMode);
  const setActiveJoin = useWorkspace((s) => s.setActiveJoin);
  const setManualMode = useWorkspace((s) => s.setManualMode);
  const setPairOffset = useWorkspace((s) => s.setPairOffset);
  const resetPairs = useWorkspace((s) => s.resetPairs);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const sliderId = useId();
  const join = Math.min(activeJoin, Math.max(0, pairs.length - 1));
  const pair = pairs[join];
  const adjusted = pairs.some((p) => p.offset !== p.autoOffset);
  const automatic = !adjusted && !manualMode;
  const max = maxOffsets[join] ?? 1;
  const setOffset = (v: number, coalesce = false) => pair && setPairOffset(pair.key, Math.min(max, Math.max(1, Math.round(v))), { coalesce });

  return (
    <div>
      <InspectorSection
        title={<span className="max-md:sr-only">Alignment</span>}
        action={
          <button type="button" onClick={() => resetPairs()} disabled={!adjusted} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11">
            <RotateCcw aria-hidden className="size-3.5" /> Reset
          </button>
        }
      >
        <div className="space-y-5">
          <Toggle
            label="Automatic alignment"
            description={automatic ? "On" : adjusted ? "Off · adjusted manually" : "Off"}
            checked={automatic}
            onChange={(on) => {
              if (on) {
                resetPairs();
                setManualMode(false);
              } else setManualMode(true);
            }}
          />

          {pairs.length > 1 && (
            <div>
              <FieldLabel>Join</FieldLabel>
              <SegmentedControl<string>
                label="Join being edited"
                size="sm"
                value={String(join)}
                onChange={(v) => setActiveJoin(Number(v))}
                options={pairs.map((_, i) => ({ value: String(i), label: `${i + 1} ↔ ${i + 2}` }))}
              />
            </div>
          )}

          <div>
            <FieldLabel>View mode</FieldLabel>
            <SegmentedControl<StitchViewMode>
              label="View mode"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "normal", label: "Normal" },
                { value: "overlay", label: "Overlay" },
                { value: "difference", label: "Difference" },
              ]}
            />
            {viewMode === "difference" && <p className="t-body-sm mt-2 text-ink-3">Matching areas turn black. Bright shapes mean the screenshots don’t line up there.</p>}
            {viewMode === "overlay" && <p className="t-body-sm mt-2 text-ink-3">The lower screenshot is shown see-through over the shared area.</p>}
          </div>

          <div>
            <FieldLabel htmlFor={sliderId} value={pair ? `${pair.offset} px` : "—"}>
              Join position
            </FieldLabel>
            <Slider id={sliderId} label="Join position" min={1} max={max} value={pair?.offset ?? 1} valueText={pair ? `${pair.offset} pixels` : undefined} onChange={(v) => setOffset(v, true)} className={cn(!ready && "opacity-50")} />
            <p className="t-body-sm mt-1.5 text-ink-3">Where screenshot {join + 2} starts inside screenshot {join + 1}.</p>
          </div>

          <Button variant="secondary" className="w-full" aria-expanded={manualMode} onClick={() => setManualMode(!manualMode)} disabled={!ready}>
            <SlidersHorizontal className="text-accent" /> Adjust manually
          </Button>

          {manualMode && pair && (
            <div className="rounded-md border border-line bg-surface-3 p-3.5" data-testid="manual-controls">
              <div className="grid grid-cols-4 gap-1.5">
                {[-10, -1, 1, 10].map((d) => (
                  <Button key={d} size="sm" variant="secondary" className="max-md:h-11" onClick={() => setOffset(pair.offset + d)} aria-label={`Move join ${d > 0 ? "down" : "up"} ${Math.abs(d)} pixel${Math.abs(d) > 1 ? "s" : ""}`}>
                    <span className="font-mono">{d > 0 ? `+${d}` : `−${-d}`}</span>
                  </Button>
                ))}
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 text-sm text-ink-2">
                Exact position
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={max}
                    value={pair.offset}
                    onChange={(e) => e.target.value && setOffset(Number(e.target.value))}
                    className="t-mono h-9 w-24 rounded-sm border border-line bg-surface px-2 text-right text-ink max-md:h-11"
                  />
                  <Mono className="text-[12px]">px</Mono>
                </span>
              </label>
              <p className="t-body-sm mt-3 text-ink-3">Tip: drag the seam line, or select it and use ↑ ↓ (Shift moves 10 px). Difference view makes small misalignments easy to spot.</p>
            </div>
          )}

          <Disclosure title="Advanced options">
            <div className="space-y-4">
              <div>
                <FieldLabel>Format</FieldLabel>
                <SegmentedControl<ExportFormat>
                  label="Export format"
                  size="sm"
                  value={exportSettings.format}
                  onChange={(format) => setExportSettings({ format })}
                  options={[
                    { value: "png", label: "PNG" },
                    { value: "jpeg", label: "JPEG" },
                    { value: "webp", label: "WebP" },
                  ]}
                />
                <p className="t-body-sm mt-1.5 text-ink-3">{exportSettings.format === "png" ? "Lossless — best for text and interface screenshots." : "Smaller files. Very tall images can only be exported as PNG."}</p>
              </div>
              {exportSettings.format !== "png" && (
                <div>
                  <FieldLabel value={`${Math.round(exportSettings.quality * 100)}%`}>Quality</FieldLabel>
                  <Slider label="Quality" min={50} max={100} value={Math.round(exportSettings.quality * 100)} onChange={(v) => setExportSettings({ quality: v / 100 })} />
                </div>
              )}
              {plan && (
                <p className="flex items-center justify-between text-sm text-ink-2">
                  Output size <Mono className="text-ink">{plan.width} × {plan.height} px</Mono>
                </p>
              )}
              <Button variant="ghost" size="sm" className="w-full" onClick={onReanalyse} disabled={!ready}>
                <RefreshCw /> Find the overlap again
              </Button>
            </div>
          </Disclosure>
        </div>
      </InspectorSection>
    </div>
  );
}
