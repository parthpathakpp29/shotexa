"use client";

import { FlipHorizontal2, FlipVertical2, Link2, Link2Off, RotateCcw, RotateCcwSquare, RotateCwSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider } from "@/components/ui/controls";
import { NumberField } from "@/components/ui/number-field";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { TOOLS } from "@/config/tools";
import { FILTER_PRESETS, type FilterPreset } from "@/core/image-transform/adjustments";
import { alphaBounds } from "@/core/image-transform/trim";
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
  withAdjustments,
  withCropField,
  withLockAspect,
  withOutputHeight,
  withOutputWidth,
  withStraighten,
} from "@/core/image-transform/transform";
import type { AspectPreset, ImageTransform, Rect, Size } from "@/core/image-transform/types";
import { cn } from "@/lib/cn";
import type { EditorGuide } from "./editor-canvas";

const PRESETS: { value: AspectPreset; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "4:3", label: "4:3" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "3:2", label: "3:2" },
  { value: "2:1", label: "2:1" },
  { value: "1.91:1", label: "1.91:1" },
];


export function EditorInspector({ assetId, source, guide, onGuideChange }: { assetId: string; source: Size; guide: EditorGuide; onGuideChange: (guide: EditorGuide) => void }) {
  const { runtime } = useWorkspaceContext();
  const t = useWorkspace((s) => s.editor.byAsset[assetId] ?? IDENTITY_TRANSFORM);
  const setTransform = useWorkspace((s) => s.setEditTransform);
  const reset = useWorkspace((s) => s.resetEditTransform);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const annotations = useWorkspace((s) => s.annotation.byAsset[assetId]?.length ?? 0);
  const previewVersion = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const [trimStatus, setTrimStatus] = useState<string | null>(null);
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
  const activeFilter = FILTER_PRESETS.find((preset) => JSON.stringify(preset.adjustments) === JSON.stringify(t.adjustments))?.value ?? "custom";

  function trimTransparentEdges() {
    const bitmap = runtime.registry.preview(assetId);
    if (!bitmap) {
      setTrimStatus("The preview is still loading. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(bitmap, 0, 0);
      const bounds = alphaBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, 0);
      if (!bounds) {
        setTrimStatus("No visible pixels were found; the crop was not changed.");
        return;
      }
      const scaleX = source.width / bitmap.width;
      const scaleY = source.height / bitmap.height;
      const x = Math.max(0, Math.floor(bounds.x * scaleX) - 1);
      const y = Math.max(0, Math.floor(bounds.y * scaleY) - 1);
      const right = Math.min(source.width, Math.ceil((bounds.x + bounds.width) * scaleX) + 1);
      const bottom = Math.min(source.height, Math.ceil((bounds.y + bounds.height) * scaleY) + 1);
      const crop = { x, y, width: right - x, height: bottom - y };
      const whole = crop.x === 0 && crop.y === 0 && crop.width === source.width && crop.height === source.height;
      apply({ ...t, crop: whole ? null : crop, cropAspect: "free" });
      setTrimStatus(whole ? "No transparent edge was detected." : `Transparent edges trimmed to ${crop.width} × ${crop.height} px.`);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

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
          // The options intentionally wrap on small inspectors rather than truncating a ratio.
          className="grid-flow-row grid-cols-3"
        />
        <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="crop-fields">
          <NumberField label="X" testId="crop-x" value={crop.x} min={0} max={visible.width - 1} onCommit={(v) => setCropField("x", v)} />
          <NumberField label="Y" testId="crop-y" value={crop.y} min={0} max={visible.height - 1} onCommit={(v) => setCropField("y", v)} />
          <NumberField label="Width" testId="crop-width" value={crop.width} min={1} max={visible.width} onCommit={(v) => setCropField("width", v)} />
          <NumberField label="Height" testId="crop-height" value={crop.height} min={1} max={visible.height} onCommit={(v) => setCropField("height", v)} />
        </div>
        <Button variant="secondary" size="sm" className="mt-4 w-full max-md:h-11" data-testid="editor-auto-trim" disabled={previewVersion === 0 || !runtime.registry.preview(assetId)} onClick={trimTransparentEdges}>
          Trim transparent edges
        </Button>
        {trimStatus && <p className="t-body-sm mt-2 text-ink-3" role="status">{trimStatus}</p>}
        <div className="mt-4">
          <FieldLabel>Preview guides</FieldLabel>
          <SegmentedControl<EditorGuide>
            label="Preview guides"
            size="sm"
            value={guide}
            onChange={onGuideChange}
            options={[
              { value: "none", label: "None" },
              { value: "thirds", label: "Thirds" },
              { value: "center", label: "Centre" },
            ]}
          />
          <p className="t-body-sm mt-2 text-ink-3">Guides help framing and are never exported.</p>
        </div>
      </InspectorSection>

      <InspectorSection
        title="Transform"
        action={
          <button type="button" onClick={() => apply({ ...t, rotation: 0, flipH: false, flipV: false, straighten: 0 })} disabled={t.rotation === 0 && !t.flipH && !t.flipV && t.straighten === 0} className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11">
            <RotateCcw aria-hidden className="size-3.5" /> Reset rotation
          </button>
        }
      >
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
        <div className="mt-4 rounded-md border border-line bg-surface-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel value={`${t.straighten > 0 ? "+" : ""}${t.straighten}°`}>Straighten</FieldLabel>
            <button type="button" onClick={() => apply(withStraighten(t, 0))} disabled={t.straighten === 0} className="t-micro min-h-8 rounded-sm px-2 text-ink-2 hover:text-ink disabled:opacity-40 max-md:min-h-11">Reset</button>
          </div>
          <Slider label="Straighten angle" value={t.straighten} min={-15} max={15} step={0.1} onChange={(straighten) => apply(withStraighten(t, straighten), true)} valueText={`${t.straighten} degrees`} />
          <div className="mt-2">
            <NumberField label="Angle (degrees)" testId="straighten-angle" value={t.straighten} min={-15} max={15} onCommit={(value) => apply(withStraighten(t, value))} />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Adjustments">
        <FieldLabel>Filter preset</FieldLabel>
        <SegmentedControl<FilterPreset | "custom">
          label="Filter preset"
          size="sm"
          value={activeFilter}
          onChange={(value) => {
            const preset = FILTER_PRESETS.find((item) => item.value === value);
            if (preset) apply({ ...t, adjustments: { ...preset.adjustments } });
          }}
          options={[...FILTER_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })), ...(activeFilter === "custom" ? [{ value: "custom" as const, label: "Custom" }] : [])]}
          className="grid-flow-row grid-cols-2"
        />
        <Disclosure title="Fine adjustments" className="mt-4" defaultOpen>
          <div className="space-y-3">
            {([
              ["brightness", "Brightness", -100, 100, 1],
              ["contrast", "Contrast", -100, 100, 1],
              ["saturation", "Saturation", -100, 100, 1],
              ["warmth", "Warmth", -100, 100, 1],
              ["grayscale", "Grayscale", 0, 100, 1],
              ["exposure", "Exposure", -2, 2, 0.1],
            ] as const).map(([key, label, min, max, step]) => (
              <div key={key}>
                <FieldLabel value={key === "exposure" ? `${t.adjustments[key] > 0 ? "+" : ""}${t.adjustments[key]} EV` : `${t.adjustments[key] > 0 ? "+" : ""}${t.adjustments[key]}`}>
                  {label}
                </FieldLabel>
                <Slider label={label} value={t.adjustments[key]} min={min} max={max} step={step} onChange={(value) => apply(withAdjustments(t, { [key]: value }), true)} />
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-3 w-full max-md:h-11" onClick={() => apply({ ...t, adjustments: { ...IDENTITY_TRANSFORM.adjustments } })} disabled={Object.values(t.adjustments).every((value) => value === 0)}>
            <RotateCcw /> Reset adjustments
          </Button>
        </Disclosure>
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
