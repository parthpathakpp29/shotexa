"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider } from "@/components/ui/controls";
import { NumberField } from "@/components/ui/number-field";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canSplit, clampCount, clampHeight, cutsFor, defaultSplit, heightBounds, maxPieces, MIN_SLICE_PX, piecesFor, withMode } from "@/core/split/plan";
import type { EqualBy, SplitMode, SplitSettings } from "@/core/split/types";
import { newLineId } from "./split-stage";

const SHOWN_PIECES = 8;

export function SplitInspector({ assetId }: { assetId: string }) {
  const file = useWorkspace((s) => s.files[assetId]);
  const stored = useWorkspace((s) => s.split.byAsset[assetId]);
  const setSplit = useWorkspace((s) => s.setSplit);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  if (!file) return null;

  const H = file.height;
  const source = { width: file.width, height: H };
  const settings = stored ?? defaultSplit(source);
  const pieces = piecesFor(cutsFor(settings, H), H);
  const splittable = canSplit(H);
  const bounds = heightBounds(H);
  const apply = (next: SplitSettings, coalesce?: string) => setSplit(assetId, next, { coalesce });

  return (
    <div data-testid="split-inspector">
      <InspectorSection title="Split method">
        {!splittable ? (
          <p className="t-body-sm text-ink-2" data-testid="split-too-short">
            This image is only {H} px tall — too short to split into pieces of at least {MIN_SLICE_PX} px.
          </p>
        ) : (
          <div className="space-y-4">
            <SegmentedControl<SplitMode>
              label="Split method"
              value={settings.mode}
              onChange={(mode) => apply(withMode(settings, mode, H, newLineId))}
              options={[
                { value: "equal", label: "Equal" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {settings.mode === "equal" ? (
              <>
                <div>
                  <FieldLabel>Split by</FieldLabel>
                  <SegmentedControl<EqualBy>
                    label="Split by"
                    size="sm"
                    value={settings.by}
                    onChange={(by) => apply({ ...settings, by })}
                    options={[
                      { value: "count", label: "Sections" },
                      { value: "height", label: "Height" },
                    ]}
                  />
                </div>
                {settings.by === "count" ? (
                  <div>
                    <FieldLabel value={`2–${maxPieces(H)}`}>Number of sections</FieldLabel>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" className="max-md:size-11" aria-label="Fewer sections" disabled={clampCount(settings.count, H) <= 2} onClick={() => apply({ ...settings, count: clampCount(settings.count - 1, H) }, "count")}>
                        <Minus />
                      </Button>
                      <div className="w-24">
                        <NumberField label="" ariaLabel="Number of sections" testId="split-count" unit="" value={clampCount(settings.count, H)} min={2} max={maxPieces(H)} onCommit={(count) => apply({ ...settings, count }, "count")} />
                      </div>
                      <Button variant="secondary" size="sm" className="max-md:size-11" aria-label="More sections" disabled={clampCount(settings.count, H) >= maxPieces(H)} onClick={() => apply({ ...settings, count: clampCount(settings.count + 1, H) }, "count")}>
                        <Plus />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <NumberField label="Height of each piece" testId="split-height" value={clampHeight(settings.height, H)} min={bounds.min} max={bounds.max} onCommit={(height) => apply({ ...settings, height }, "height")} />
                    <p className="t-body-sm mt-2 text-ink-3">The last piece takes what is left. Between {bounds.min.toLocaleString()} and {bounds.max.toLocaleString()} px.</p>
                  </div>
                )}
              </>
            ) : (
              <p className="t-body-sm text-ink-2">
                Click the image to add a line, or use <span className="font-medium text-ink">Add split</span>. Drag a line to move it; select it and press Delete to remove it.
              </p>
            )}
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="Pieces" action={<Mono className="text-ink" data-testid="split-piece-count">{pieces.length}</Mono>}>
        <ol className="space-y-1" data-testid="split-piece-list">
          {pieces.slice(0, SHOWN_PIECES).map((p) => (
            <li key={p.index} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-ink-2">Piece {p.index + 1}</span>
              <Mono className="text-[12px] text-ink-3">
                {file.width} × {p.y1 - p.y0} px
              </Mono>
            </li>
          ))}
          {pieces.length > SHOWN_PIECES && <li className="text-xs text-ink-3">…and {pieces.length - SHOWN_PIECES} more</li>}
        </ol>
        <p className="t-body-sm mt-3 text-ink-3">Every row of the original is in exactly one piece, at full resolution.</p>
        <Button variant="ghost" size="sm" className="mt-3 w-full max-md:h-11" data-testid="split-reset" disabled={!stored} onClick={() => setSplit(assetId, null)}>
          <RotateCcw /> Reset split
        </Button>
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
          <p className="t-body-sm mt-3 text-ink-3">PNG is lossless and the default. Very tall pieces can only be saved as PNG.</p>
        </Disclosure>
      </InspectorSection>
    </div>
  );
}
