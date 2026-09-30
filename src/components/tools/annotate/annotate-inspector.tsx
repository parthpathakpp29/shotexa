"use client";

/**
 * Annotation inspector. With something selected it edits that object; otherwise it sets the
 * defaults for the active tool. Sizes are shown in output pixels (what exports) and stored in
 * source pixels, converted through the same frame the canvas and export use.
 */
import { Check, ListRestart, Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider } from "@/components/ui/controls";
import { FieldLabel, InspectorSection, Mono } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { TOOLS as REGISTRY } from "@/config/tools";
import type { AnnotationFrame } from "@/core/annotation/geometry";
import { ANNOTATION_COLORS, autoSizes, HIGHLIGHT_COLORS, removeObject, renumberSteps, stepsNeedRenumber, updateObject } from "@/core/annotation/objects";
import type { AnnotationObject } from "@/core/annotation/types";
import { describeOrientation, IDENTITY_TRANSFORM, isIdentity } from "@/core/image-transform/transform";
import { cn } from "@/lib/cn";
import { ANNOTATION_TOOLS } from "./annotate-canvas";

const EMPTY: AnnotationObject[] = [];
const TYPE_LABEL: Record<AnnotationObject["type"], string> = { arrow: "Arrow", rectangle: "Rectangle", highlight: "Highlight", text: "Text", freehand: "Drawing", step: "Step marker" };

function Swatches({ colors, value, onChange, label }: { colors: readonly { value: string; label: string }[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {colors.map((c) => {
        const active = c.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn("inline-flex size-8 items-center justify-center rounded-full border shadow-xs transition-transform max-md:size-11", active ? "border-accent ring-2 ring-accent/40" : "border-line-strong hover:scale-105")}
            style={{ backgroundColor: c.value }}
          >
            {active && <Check aria-hidden className="size-4" style={{ color: c.value === "#ffffff" || c.value === "#ffe14d" ? "#1c1714" : "#ffffff" }} />}
          </button>
        );
      })}
    </div>
  );
}

export function AnnotateInspector({ assetId, frame }: { assetId: string; frame: AnnotationFrame }) {
  const { runtime } = useWorkspaceContext();
  const objects = useWorkspace((s) => s.annotation.byAsset[assetId] ?? EMPTY);
  const selectedId = useWorkspace((s) => s.annotation.selectedId);
  const tool = useWorkspace((s) => s.annotation.tool);
  const style = useWorkspace((s) => s.annotation.style);
  const setStyle = useWorkspace((s) => s.setAnnotationStyle);
  const setAnnotations = useWorkspace((s) => s.setAnnotations);
  const t = useWorkspace((s) => s.editor.byAsset[assetId] ?? IDENTITY_TRANSFORM);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const auto = autoSizes(frame.out);
  const k = frame.k;
  const state = () => runtime.store.getState().annotation.byAsset[assetId] ?? EMPTY;
  /** Update the selected object; `key` merges a slider drag or typing burst into one undo step. */
  const update = (patch: Partial<AnnotationObject>, key?: string) => {
    const current = state().find((o) => o.id === selectedId);
    if (current) setAnnotations(assetId, updateObject(state(), { ...current, ...patch } as AnnotationObject), key ? { coalesce: `${key}:${current.id}` } : undefined);
  };
  const out = (v: number) => Math.round(v * k);

  const editorChanges = isIdentity(t) ? [] : [...(t.crop ? ["Cropped"] : []), ...describeOrientation(t), ...(t.resize ? ["Resized"] : [])];

  return (
    <div data-testid="annotate-inspector">
      {selected ? (
        <InspectorSection
          title={TYPE_LABEL[selected.type]}
          action={
            <button
              type="button"
              onClick={() => setAnnotations(assetId, removeObject(state(), selected.id), { select: null })}
              className="t-mono inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-[12px] text-error hover:bg-error-soft max-md:min-h-11"
            >
              <Trash2 aria-hidden className="size-3.5" /> Delete
            </button>
          }
        >
          <div className="space-y-4" data-testid="annotation-properties" data-type={selected.type}>
            <div>
              <FieldLabel>Colour</FieldLabel>
              <Swatches label="Annotation colour" colors={selected.type === "highlight" ? HIGHLIGHT_COLORS : ANNOTATION_COLORS} value={selected.color} onChange={(color) => update({ color })} />
            </div>
            {selected.type === "text" && (
              <div>
                <FieldLabel>Text</FieldLabel>
                <textarea
                  aria-label="Text"
                  data-testid="annotation-text-field"
                  value={selected.text}
                  rows={2}
                  onChange={(e) => update({ text: e.target.value }, "text")}
                  className="w-full resize-y rounded-sm border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
            )}
            {(selected.type === "arrow" || selected.type === "rectangle" || selected.type === "freehand") && (
              <div>
                <FieldLabel value={`${out(selected.width)} px`}>Stroke width</FieldLabel>
                <Slider label="Stroke width" min={1} max={Math.max(48, auto.stroke * 4)} value={out(selected.width)} onChange={(v) => update({ width: v / k }, "width")} />
              </div>
            )}
            {selected.type === "highlight" && (
              <div>
                <FieldLabel value={`${Math.round(selected.opacity * 100)}%`}>Opacity</FieldLabel>
                <Slider label="Highlight opacity" min={15} max={90} value={Math.round(selected.opacity * 100)} onChange={(v) => update({ opacity: v / 100 }, "opacity")} />
              </div>
            )}
            {selected.type === "text" && (
              <div>
                <FieldLabel value={`${out(selected.size)} px`}>Font size</FieldLabel>
                <Slider label="Font size" min={10} max={Math.max(200, auto.font * 4)} value={out(selected.size)} onChange={(v) => update({ size: v / k }, "size")} />
              </div>
            )}
            {selected.type === "step" && (
              <>
                <div>
                  <FieldLabel>Number</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" className="max-md:size-11" aria-label="Lower number" disabled={selected.n <= 1} onClick={() => update({ n: selected.n - 1 })}>
                      <Minus />
                    </Button>
                    <Mono className="w-10 text-center text-[15px] text-ink" data-testid="step-number">
                      {selected.n}
                    </Mono>
                    <Button variant="secondary" size="sm" className="max-md:size-11" aria-label="Higher number" disabled={selected.n >= 99} onClick={() => update({ n: selected.n + 1 })}>
                      <Plus />
                    </Button>
                  </div>
                </div>
                <div>
                  <FieldLabel value={`${out(selected.radius * 2)} px`}>Size</FieldLabel>
                  <Slider label="Marker size" min={16} max={Math.max(240, auto.radius * 8)} value={out(selected.radius * 2)} onChange={(v) => update({ radius: v / 2 / k }, "radius")} />
                </div>
              </>
            )}
            <p className="t-body-sm text-ink-3">Drag to move{selected.type === "arrow" ? ", or drag an end to re-aim it" : selected.type === "rectangle" || selected.type === "highlight" ? ", or drag a handle to resize" : ""}. Delete or Backspace removes it.</p>
          </div>
        </InspectorSection>
      ) : (
        <InspectorSection title={tool === "select" ? "Select" : `New ${ANNOTATION_TOOLS.find((x) => x.id === tool)!.label.toLowerCase()}`}>
          {tool === "select" ? (
            <p className="t-body-sm text-ink-2">{objects.length ? "Click an annotation on the image to edit it." : "Choose a tool above to start marking up this screenshot."}</p>
          ) : (
            <div className="space-y-4" data-testid="annotation-defaults">
              <div>
                <FieldLabel>Colour</FieldLabel>
                {tool === "highlight" ? (
                  <Swatches label="Highlight colour" colors={HIGHLIGHT_COLORS} value={style.highlightColor} onChange={(highlightColor) => setStyle({ highlightColor })} />
                ) : (
                  <Swatches label="Annotation colour" colors={ANNOTATION_COLORS} value={style.color} onChange={(color) => setStyle({ color })} />
                )}
              </div>
              {(tool === "arrow" || tool === "rectangle" || tool === "freehand") && (
                <div>
                  <FieldLabel value={style.strokeWidth === null ? `Auto · ${auto.stroke} px` : `${style.strokeWidth} px`}>Stroke width</FieldLabel>
                  <Slider label="Stroke width" min={1} max={Math.max(48, auto.stroke * 4)} value={style.strokeWidth ?? auto.stroke} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
                </div>
              )}
              {tool === "highlight" && (
                <div>
                  <FieldLabel value={`${Math.round(style.highlightOpacity * 100)}%`}>Opacity</FieldLabel>
                  <Slider label="Highlight opacity" min={15} max={90} value={Math.round(style.highlightOpacity * 100)} onChange={(v) => setStyle({ highlightOpacity: v / 100 })} />
                </div>
              )}
              {(tool === "text" || tool === "step") && (
                <div>
                  <FieldLabel value={style.fontSize === null ? `Auto · ${auto.font} px` : `${style.fontSize} px`}>{tool === "text" ? "Font size" : "Marker size"}</FieldLabel>
                  <Slider label={tool === "text" ? "Font size" : "Marker size"} min={10} max={Math.max(200, auto.font * 4)} value={style.fontSize ?? auto.font} onChange={(fontSize) => setStyle({ fontSize })} />
                </div>
              )}
              {(style.strokeWidth !== null || style.fontSize !== null) && (
                <button type="button" onClick={() => setStyle({ strokeWidth: null, fontSize: null })} className="t-mono text-[12px] text-accent-ink hover:underline max-md:min-h-11">
                  Use automatic sizes
                </button>
              )}
            </div>
          )}
        </InspectorSection>
      )}

      <InspectorSection title="Annotations">
        <div className="flex items-baseline justify-between text-sm text-ink-2">
          <span>On this image</span>
          <Mono className="text-ink" data-testid="annotation-count">
            {objects.length}
          </Mono>
        </div>
        {stepsNeedRenumber(objects) && (
          <Button variant="secondary" size="sm" className="mt-3 w-full max-md:h-11" onClick={() => setAnnotations(assetId, renumberSteps(state()))}>
            <ListRestart /> Renumber steps 1–{objects.filter((o) => o.type === "step").length}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="mt-2 w-full max-md:h-11" disabled={!objects.length} onClick={() => setAnnotations(assetId, [], { select: null })}>
          <Trash2 /> Clear all
        </Button>
        {editorChanges.length > 0 && (
          <p className="t-body-sm mt-3 rounded-md border border-line bg-surface-3 px-3 py-2 text-ink-2" data-testid="annotate-editor-note">
            Includes your <Link href={REGISTRY.editor.route} className="font-medium text-accent-ink hover:underline">Editor</Link> changes: {editorChanges.join(" · ")}.
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
          <p className="t-body-sm mt-3 text-ink-3">PNG is lossless and keeps text sharp. Very tall results are saved as PNG.</p>
        </Disclosure>
      </InspectorSection>
    </div>
  );
}
