"use client";

import { Check, Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, Slider } from "@/components/ui/controls";
import { FieldLabel, InspectorSection } from "@/components/ui/primitives";
import { NumberField } from "@/components/ui/number-field";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { FORMAT_LABEL, formatOfMime, OUTPUT_FORMATS, supportsQuality, type OutputFormat } from "@/core/image-encode/formats";
import { encodeIssue, formatMaxSide } from "@/core/image-encode/limits";
import { BACKGROUND_PRESETS, TARGET_SIZE_PRESETS } from "@/core/image-encode/settings";
import { formatAdvice } from "@/core/image-encode/compare";
import type { EncodeTool } from "@/core/image-encode/types";
import { cn } from "@/lib/cn";

export function issueText(issue: ReturnType<typeof encodeIssue>, format: OutputFormat): string | null {
  if (!issue) return null;
  if (issue === "format-dimension") return `${FORMAT_LABEL[format]} holds at most ${formatMaxSide(format).toLocaleString()} px per side. Choose PNG, or split the image first.`;
  if (issue === "source-too-large") return "This image is too large to re-encode in a browser. Split it first.";
  return `This image is too large to encode as ${FORMAT_LABEL[format]} in a browser. Choose PNG, or split it first.`;
}

export function EncodeInspector({ tool, assetId, format, busy, outputName, onOutputName, onRun }: { tool: EncodeTool; assetId: string; format: OutputFormat; busy: boolean; outputName?: string; onOutputName?(value: string): void; onRun(): void }) {
  const { runtime } = useWorkspaceContext();
  const file = useWorkspace((s) => s.files[assetId]);
  const settings = useWorkspace((s) => s.encode[tool]);
  const setSettings = useWorkspace((s) => s.setEncodeSettings);
  const previewVersion = useWorkspace((s) => s.files[assetId]?.previewVersion ?? 0);
  const [transparent, setTransparent] = useState<{ id: string; value: boolean | null } | null>(null);
  const input = file ? (formatOfMime(file.type) ?? "png") : "png";
  const needsBackground = format === "jpeg" && input !== "jpeg";

  useEffect(() => {
    if (!needsBackground) return;
    let live = true;
    void runtime.hasTransparency(assetId).then((value) => live && setTransparent({ id: assetId, value }));
    return () => {
      live = false;
    };
  }, [runtime, assetId, needsBackground, previewVersion]);

  if (!file) return null;
  const hasAlpha = transparent?.id === assetId ? transparent.value : null;
  const advisor = tool === "convert" ? formatAdvice({ source: input, target: format, hasTransparency: hasAlpha }) : null;
  const issue = encodeIssue(file, format);
  // Explicit same-format Convert is useful after measuring candidates; Auto still changes format.
  const choices = OUTPUT_FORMATS;
  const custom = !BACKGROUND_PRESETS.some((p) => p.value === settings.background);

  return (
    <div data-testid="encode-inspector">
      <InspectorSection title="Output format">
        <SegmentedControl<OutputFormat>
          label="Output format"
          value={format}
          onChange={(f) => setSettings(tool, { format: tool === "compress" && f === input ? "same" : f })}
          options={choices.map((f) => ({
            value: f,
            label:
              tool === "compress" && f === input ? (
                <span className="inline-flex items-center gap-1.5">
                  {FORMAT_LABEL[f]}
                  <span className="sr-only"> · original</span>
                  <span aria-hidden title="Original format" className="size-1.5 rounded-full bg-accent" />
                </span>
              ) : (
                FORMAT_LABEL[f]
              ),
          }))}
        />
        <p className="t-body-sm mt-3 text-ink-3">
          {tool === "compress" && format === input ? "Same format as the original." : `${FORMAT_LABEL[input]} → ${FORMAT_LABEL[format]}.`} Pixel size stays {file.width} × {file.height}.
        </p>
        {issue && (
          <p role="alert" className="t-body-sm mt-2 text-error" data-testid="encode-issue">
            {issueText(issue, format)}
          </p>
        )}
      </InspectorSection>

      {advisor && (
        <InspectorSection title="Which format should I use?">
          <p className="text-sm font-medium text-ink" data-testid="convert-format-advice-title">{advisor.title}</p>
          <p className="t-body-sm mt-2 text-ink-2" data-testid="convert-format-advice">{advisor.detail}</p>
          <p className="t-body-sm mt-2 text-ink-3">Source: {FORMAT_LABEL[input]} · {file.width} × {file.height} px · {Math.round(file.bytes / 1024).toLocaleString()} KB.</p>
        </InspectorSection>
      )}

      <InspectorSection title="Quality">
        {supportsQuality(format) ? (
          <>
            <FieldLabel value={<span data-testid="encode-quality-value">{Math.round(settings.quality * 100)}%</span>}>{FORMAT_LABEL[format]} quality</FieldLabel>
            <Slider label={`${FORMAT_LABEL[format]} quality`} value={Math.round(settings.quality * 100)} min={50} max={100} onChange={(v) => setSettings(tool, { quality: v / 100 })} valueText={`${Math.round(settings.quality * 100)}%`} />
            <p className="t-body-sm mt-2 text-ink-3">Lower quality makes a smaller file; text stays sharp down to about 80%.</p>
          </>
        ) : (
          <p className="t-body-sm text-ink-2" data-testid="encode-png-note">
            PNG is lossless: every pixel is kept exactly and there is no quality setting. The size depends on the image itself — choose JPEG or WebP to trade quality for a smaller file.
          </p>
        )}
      </InspectorSection>

      {tool === "compress" && (
        <InspectorSection title="Target file size">
          {supportsQuality(format) ? (
            <>
              <div role="radiogroup" aria-label="Target file size" className="grid grid-cols-2 gap-2">
                <button type="button" role="radio" aria-checked={settings.targetBytes === null} onClick={() => setSettings(tool, { targetBytes: null })} className={cn("min-h-10 rounded-sm border px-2 text-sm max-md:min-h-11", settings.targetBytes === null ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong")}>Manual</button>
                {TARGET_SIZE_PRESETS.map((preset) => (
                  <button key={preset.bytes} type="button" role="radio" aria-checked={settings.targetBytes === preset.bytes} onClick={() => setSettings(tool, { targetBytes: preset.bytes })} className={cn("min-h-10 rounded-sm border px-2 text-sm max-md:min-h-11", settings.targetBytes === preset.bytes ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong")}>{preset.label}</button>
                ))}
              </div>
              <div className="mt-3">
                <NumberField label="Custom target" ariaLabel="Custom target in KB" testId="encode-target-custom" value={Math.max(1, Math.round((settings.targetBytes ?? 500 * 1024) / 1024))} min={1} max={1024 * 1024} unit="KB" onCommit={(kb) => setSettings(tool, { targetBytes: kb * 1024 })} />
              </div>
              <p className="t-body-sm mt-3 text-ink-3">Shotexa makes up to seven local JPEG/WebP encodes to find the highest measured quality at or below this target. It never resizes or changes the format. If 50% is still larger, it reports the closest result.</p>
            </>
          ) : (
            <p className="t-body-sm text-ink-2">PNG is lossless and has no quality setting, so it cannot honestly target an exact file size. Choose JPEG or WebP to use a target.</p>
          )}
        </InspectorSection>
      )}

      {needsBackground && (
        <InspectorSection title="Background">
          <p className="t-body-sm mb-3 text-ink-2" data-testid="encode-alpha-note">
            {hasAlpha === true
              ? "This image has transparent areas. JPEG can't store transparency, so they'll be filled with this colour."
              : hasAlpha === false
                ? "No transparent areas were found, so this colour won't show. JPEG can't store transparency."
                : "JPEG can't store transparency: any transparent areas are filled with this colour."}
          </p>
          <div role="radiogroup" aria-label="JPEG background" className="flex flex-wrap items-center gap-2">
            {BACKGROUND_PRESETS.map((p) => {
              const active = settings.background === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => setSettings(tool, { background: p.value })}
                  className={cn("inline-flex size-9 items-center justify-center rounded-full border shadow-xs max-md:size-11", active ? "border-accent ring-2 ring-accent/40" : "border-line-strong")}
                  style={{ backgroundColor: p.value }}
                >
                  {active && <Check aria-hidden className={cn("size-4", p.value === "#000000" ? "text-white" : "text-ink")} />}
                </button>
              );
            })}
            <label className={cn("relative inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm max-md:h-11", custom ? "border-accent ring-2 ring-accent/40" : "border-line-strong")}>
              <span aria-hidden className="size-4 rounded-full border border-line" style={{ backgroundColor: settings.background }} />
              Custom
              <input
                type="color"
                aria-label="Custom background colour"
                data-testid="encode-background-custom"
                value={settings.background}
                onChange={(e) => setSettings(tool, { background: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </InspectorSection>
      )}

      {tool === "convert" && outputName !== undefined && onOutputName && (
        <InspectorSection title="Filename">
          <label className="block text-sm font-medium text-ink" htmlFor="convert-filename">Output filename</label>
          <input
            id="convert-filename"
            data-testid="convert-filename"
            value={outputName}
            onChange={(event) => onOutputName(event.target.value)}
            className="mt-2 h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 max-md:h-11"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="t-body-sm mt-2 text-ink-3">Invalid filename characters are replaced. The correct .{format === "jpeg" ? "jpg" : format} extension is added automatically.</p>
        </InspectorSection>
      )}

      <InspectorSection title="Result">
        <Button variant="secondary" className="w-full max-md:h-11" onClick={onRun} disabled={busy || !!issue} data-testid="encode-check">
          <Gauge /> {busy ? "Working…" : "Check file size"}
        </Button>
        <p className="t-body-sm mt-3 text-ink-3">Encodes on your device to show the exact size before you download. Metadata such as EXIF is not copied into the new file.</p>
      </InspectorSection>
    </div>
  );
}
