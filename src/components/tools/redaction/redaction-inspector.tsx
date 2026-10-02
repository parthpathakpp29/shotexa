"use client";

import { Check, Eraser, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, VerificationCard } from "@/components/ui/controls";
import { FieldLabel, InspectorSection } from "@/components/ui/primitives";
import type { SafeShareVerification, RedactionMode } from "@/core/redaction/types";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/components/workspace/workspace-provider";

const MODES: { mode: RedactionMode; title: string; body: string }[] = [
  { mode: "blur", title: "Blur", body: "Visually hides an area." },
  { mode: "pixelate", title: "Pixelate", body: "Strong visual obscuring." },
  { mode: "blackout", title: "Blackout", body: "Permanently replaces the selected pixels." },
];
const EMPTY_REDACTIONS: import("@/core/redaction/types").Redaction[] = [];

export function RedactionInspector({ assetId, verification }: { assetId: string; verification?: SafeShareVerification | null }) {
  const mode = useWorkspace((s) => s.redaction.mode);
  const selectedId = useWorkspace((s) => s.redaction.selectedId);
  const operations = useWorkspace((s) => s.redaction.byAsset[assetId] ?? EMPTY_REDACTIONS);
  const blur = useWorkspace((s) => s.redaction.blurIntensity);
  const pixelate = useWorkspace((s) => s.redaction.pixelateIntensity);
  const setMode = useWorkspace((s) => s.setRedactionMode);
  const setIntensity = useWorkspace((s) => s.setRedactionIntensity);
  const update = useWorkspace((s) => s.updateRedaction);
  const remove = useWorkspace((s) => s.deleteRedaction);
  const clear = useWorkspace((s) => s.clearRedactions);
  const select = useWorkspace((s) => s.selectRedaction);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const selected = operations.find((r) => r.id === selectedId);

  function chooseMode(next: RedactionMode) {
    setMode(next);
    if (selected) update(assetId, selected.id, { mode: next, intensity: next === "blur" ? blur : next === "pixelate" ? pixelate : 1 });
  }

  const intensityKind = (selected?.mode ?? mode) === "blur" ? "blur" : (selected?.mode ?? mode) === "pixelate" ? "pixelate" : null;
  const intensity = selected && intensityKind ? selected.intensity : intensityKind === "blur" ? blur : pixelate;
  return (
    <div data-testid="redaction-inspector">
      <InspectorSection title="Redaction mode">
        <div className="space-y-2" role="radiogroup" aria-label="Redaction mode">
          {MODES.map((item) => {
            const active = (selected?.mode ?? mode) === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseMode(item.mode)}
                className={cn("flex min-h-[68px] w-full items-start gap-3 rounded-md border p-3 text-left transition-colors", active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}
              >
                <span aria-hidden className={cn("mt-1 size-3.5 shrink-0", item.mode === "blackout" ? "bg-black" : item.mode === "pixelate" ? "bg-[repeating-linear-gradient(45deg,#5e554d_0_2px,#d6ccbe_2px_4px)]" : "rounded-full bg-ink-3 blur-[2px]")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{item.title}</span>
                  <span className="t-body-sm mt-0.5 block text-ink-2">{item.body}</span>
                </span>
                <span className={cn("mt-1 inline-flex size-4 items-center justify-center rounded-full border", active ? "border-accent bg-accent text-white" : "border-line-strong")}>
                  {active && <Check className="size-3" />}
                </span>
              </button>
            );
          })}
        </div>
        {intensityKind && (
          <div className="mt-4">
            <FieldLabel value={`${Math.round(intensity)} px`}>{intensityKind === "blur" ? "Blur intensity" : "Pixel size"}</FieldLabel>
            <Slider
              label={intensityKind === "blur" ? "Blur intensity" : "Pixelation strength"}
              min={intensityKind === "blur" ? 4 : 6}
              max={intensityKind === "blur" ? 48 : 64}
              value={intensity}
              onChange={(value) => {
                setIntensity(intensityKind, value);
                if (selected) update(assetId, selected.id, { intensity: value }, { coalesce: true });
              }}
            />
          </div>
        )}
        {(selected?.mode === "blur" || selected?.mode === "pixelate" || (!selected && mode !== "blackout")) && (
          <p className="mt-3 rounded-md border border-[#f0dcb4] bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">Blur and Pixelate are visual obscuring. Use Blackout when the pixels must be permanently replaced.</p>
        )}
      </InspectorSection>

      <InspectorSection
        title="Selections"
        action={operations.length ? <button type="button" onClick={() => clear(assetId)} className="text-xs font-medium text-accent-ink hover:underline">Clear all</button> : undefined}
      >
        {operations.length ? (
          <ul className="space-y-2">
            {operations.map((r, i) => (
              <li key={r.id} className={cn("flex items-center gap-2 rounded-md border p-2", selectedId === r.id ? "border-accent-line bg-accent-soft" : "border-line") }>
                <button type="button" onClick={() => select(r.id)} className="min-h-9 min-w-0 flex-1 text-left text-sm">
                  <span className="font-medium capitalize">{r.mode} {i + 1}</span>
                  <span className="t-mono block truncate text-[10px] text-ink-3">{Math.round(r.rect.x)}, {Math.round(r.rect.y)} · {Math.round(r.rect.width)} × {Math.round(r.rect.height)}</span>
                </button>
                <button type="button" aria-label={`Delete ${r.mode} redaction ${i + 1}`} onClick={() => remove(assetId, r.id)} className="inline-flex size-9 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-2 hover:text-error"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-line-strong bg-surface-3 p-4 text-center">
            <Eraser className="mx-auto size-5 text-accent" />
            <p className="t-body-sm mt-2 text-ink-2">Drag a rectangle over information you want to hide.</p>
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="Privacy Clean">
        {verification ? (
          <VerificationCard
            title="Safe Share Ready"
            items={[
              { label: "Redactions flattened", ok: verification.redactionsFlattened },
              { label: "Privacy metadata removed", ok: verification.privacyMetadataRemoved },
              { label: "Output verified", ok: verification.outputVerified && verification.dimensionsMatch && verification.formatMatch },
            ]}
          />
        ) : (
          <p className="t-body-sm text-ink-2">On export, Shotexa flattens every region into the output pixels, removes privacy-sensitive metadata, and verifies the final image before download.</p>
        )}
      </InspectorSection>

      <Disclosure title="Advanced options">
        <FieldLabel>Export format</FieldLabel>
        <SegmentedControl
          value={exportSettings.format}
          onChange={(format) => setExportSettings({ format })}
          options={[
            { value: "png", label: "PNG" },
            { value: "jpeg", label: "JPEG" },
            { value: "webp", label: "WebP" },
          ]}
          label="Export format"
          size="sm"
        />
        {exportSettings.format !== "png" && (
          <div className="mt-4">
            <FieldLabel value={`${Math.round(exportSettings.quality * 100)}%`}>Image quality</FieldLabel>
            <Slider
              label="Export quality"
              min={50}
              max={100}
              value={Math.round(exportSettings.quality * 100)}
              onChange={(quality) => setExportSettings({ quality: quality / 100 })}
              valueText={`${Math.round(exportSettings.quality * 100)} percent`}
            />
          </div>
        )}
        <p className="t-body-sm mt-3 text-ink-2">PNG keeps screenshot text crisp. JPEG and WebP can be smaller, but they use lossy compression at lower quality settings.</p>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => { select(null); }}><RotateCcw /> Deselect region</Button>
      </Disclosure>
    </div>
  );
}
