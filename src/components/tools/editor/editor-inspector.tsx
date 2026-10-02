"use client";

import { FlipHorizontal2, FlipVertical2, Link2, Link2Off, RotateCcw, RotateCcwSquare, RotateCwSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider } from "@/components/ui/controls";
import { NumberField } from "@/components/ui/number-field";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { TOOLS } from "@/config/tools";
import {
  describeOrientation,
  EDITOR_LIMITS,
  flipTransform,
  IDENTITY_TRANSFORM,
  isIdentity,
  naturalSize,
  outputIssue,
  outputSize,
  resetCrop,
  resetResize,
  rotateTransform,
  visibleCrop,
  visibleSize,
  withCropAspect,
  withCropField,
  withLockAspect,
  withOutputHeight,
  withOutputWidth,
} from "@/core/image-transform/transform";
import type { AspectPreset, ImageTransform, Rect, Size } from "@/core/image-transform/types";
import { cn } from "@/lib/cn";

const PRESETS: { value: AspectPreset; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
];


export function EditorInspector({ assetId, source }: { assetId: string; source: Size }) {
  const t = useWorkspace((s) => s.editor.byAsset[assetId] ?? IDENTITY_TRANSFORM);
  const setTransform = useWorkspace((s) => s.setEditTransform);
  const reset = useWorkspace((s) => s.resetEditTransform);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const annotations = useWorkspace((s) => s.annotation.byAsset[assetId]?.length ?? 0);
  const apply = (next: ImageTransform, coalesce = false) => setTransform(assetId, next, { coalesce });

  const visible = visibleSize(t, source);
  const crop = visibleCrop(t, source);
  const natural = naturalSize(t, source);
  const out = outputSize(t, source);
  const orientation = describeOrientation(t);
  const issue = outputIssue(out);
  const upscaled = out.width > natural.width || out.height > natural.height;
  const stretched = !!t.resize && Math.abs(t.resize.scaleX - t.resize.scaleY) > 1e-9;
  const percent = Math.round((out.width / natural.width) * 100);

  const setCropField = (field: keyof Rect, value: number) => apply(withCropField(t, source, field, value));

  return (
    <div data-testid="editor-inspector">
      <InspectorSection
        title="Crop"
        action={
          <button type="button" onClick={() => apply(resetCrop(t))} disabled={!t.crop} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11">
            <RotateCcw aria-hidden className="size-3.5" /> Reset crop
          </button>
        }
      >
        <FieldLabel>Aspect ratio</FieldLabel>
        <SegmentedControl<AspectPreset>
          label="Crop aspect ratio"
          size="sm"
          value={t.cropAspect}
          onChange={(preset) => apply(withCropAspect(t, source, preset))}
          options={PRESETS}
          // Five options never fit the inspector on one line: wrap rather than truncate "Original".
          className="grid-flow-row grid-cols-3"
        />
        <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="crop-fields">
          <NumberField label="X" testId="crop-x" value={crop.x} min={0} max={visible.width - 1} onCommit={(v) => setCropField("x", v)} />
          <NumberField label="Y" testId="crop-y" value={crop.y} min={0} max={visible.height - 1} onCommit={(v) => setCropField("y", v)} />
          <NumberField label="Width" testId="crop-width" value={crop.width} min={1} max={visible.width} onCommit={(v) => setCropField("width", v)} />
          <NumberField label="Height" testId="crop-height" value={crop.height} min={1} max={visible.height} onCommit={(v) => setCropField("height", v)} />
        </div>
      </InspectorSection>

      <InspectorSection title="Rotate & flip">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => apply(rotateTransform(t, "ccw"))}>
            <RotateCcwSquare /> Rotate left
          </Button>
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => apply(rotateTransform(t, "cw"))}>
            <RotateCwSquare /> Rotate right
          </Button>
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => apply(flipTransform(t, "horizontal"))}>
            <FlipHorizontal2 /> Flip horizontal
          </Button>
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => apply(flipTransform(t, "vertical"))}>
            <FlipVertical2 /> Flip vertical
          </Button>
        </div>
        <p className="t-mono mt-3 text-[12px] text-ink-2" data-testid="orientation-status">
          {orientation.length ? orientation.join(" · ") : "Original orientation"}
        </p>
      </InspectorSection>

      <InspectorSection
        title="Resize"
        action={
          <button type="button" onClick={() => apply(resetResize(t))} disabled={!t.resize} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11">
            <RotateCcw aria-hidden className="size-3.5" /> Original size
          </button>
        }
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <NumberField label="Width" testId="resize-width" value={out.width} min={1} max={Math.min(EDITOR_LIMITS.maxWidth, natural.width * EDITOR_LIMITS.maxScale)} onCommit={(v) => apply(withOutputWidth(t, source, v))} />
          <button
            type="button"
            aria-pressed={t.lockAspect}
            aria-label={t.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
            title={t.lockAspect ? "Width and height change together" : "Width and height change independently"}
            onClick={() => apply(withLockAspect(t, !t.lockAspect))}
            className={cn("inline-flex size-9 items-center justify-center rounded-sm border max-md:size-11", t.lockAspect ? "border-accent-line bg-accent-soft text-accent" : "border-line text-ink-3 hover:text-ink")}
          >
            {t.lockAspect ? <Link2 className="size-4" /> : <Link2Off className="size-4" />}
          </button>
          <NumberField label="Height" testId="resize-height" value={out.height} min={1} max={Math.min(EDITOR_LIMITS.maxHeight, natural.height * EDITOR_LIMITS.maxScale)} onCommit={(v) => apply(withOutputHeight(t, source, v))} />
        </div>
        <p className="t-body-sm mt-2 text-ink-3">{t.lockAspect ? "Aspect ratio locked — width and height change together." : "Aspect ratio unlocked — sides change independently."}</p>
        <div className="mt-3 flex items-baseline justify-between text-sm text-ink-2">
          <span>Scale</span>
          <Mono className="text-ink">{stretched ? "Custom" : `${percent}%`}</Mono>
        </div>
        {upscaled && <p className="t-body-sm mt-2 rounded-md border border-[#f0dcb4] bg-warning-soft px-3 py-2 text-warning">Larger than the original. Enlarging adds pixels but not detail.</p>}
        {stretched && <p className="t-body-sm mt-2 rounded-md border border-[#f0dcb4] bg-warning-soft px-3 py-2 text-warning">The aspect ratio has changed, so the image will look stretched.</p>}
      </InspectorSection>

      <InspectorSection title="Result">
        <div className="rounded-md border border-line bg-surface-3 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-ink-2">Output size</span>
            <Mono className="text-[15px] font-medium text-ink" data-testid="editor-output-size">
              {out.width} × {out.height} px
            </Mono>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xs text-ink-3">Original</span>
            <Mono className="text-[12px] text-ink-3">
              {source.width} × {source.height} px
            </Mono>
          </div>
          {issue && (
            <p role="alert" className="t-body-sm mt-2 text-error">
              {issue === "too-large" ? `Too large to export — keep the width under ${EDITOR_LIMITS.maxWidth.toLocaleString()} px.` : "Too many pixels to export safely in a browser. Reduce the size."}
            </p>
          )}
        </div>
        {annotations > 0 && (
          // Editor export is transform-only; annotations stay live and follow these edits.
          <p className="t-body-sm mt-3 rounded-md border border-line bg-surface-3 px-3 py-2 text-ink-2" data-testid="editor-annotation-note">
            This image has {annotations} annotation{annotations === 1 ? "" : "s"}. They follow your edits and are added when you export from{" "}
            <Link href={TOOLS.annotate.route} className="font-medium text-accent-ink hover:underline">
              Annotate
            </Link>
            .
          </p>
        )}
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
          <p className="t-body-sm mt-3 text-ink-3">PNG is lossless and the default. Transparent areas become white in JPEG. Very tall results can only be saved as PNG.</p>
        </Disclosure>
        <Button variant="ghost" size="sm" className="mt-3 w-full max-md:h-11" onClick={() => reset(assetId)} disabled={isIdentity(t)}>
          <RotateCcw /> Reset all edits
        </Button>
      </InspectorSection>
    </div>
  );
}
