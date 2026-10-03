"use client";

import { ArrowRight, Gauge, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { Mono } from "@/components/ui/primitives";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { compareSize, suggest, type Suggestion } from "@/core/image-encode/compare";
import { FORMAT_LABEL, formatOfMime, supportsQuality, type OutputFormat } from "@/core/image-encode/formats";
import type { EncodeRunResult } from "@/core/runtime/runtime";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";

const MAX_PANE = 520;

/** Original next to the encoded result, with the size comparison and any suggestion. */
export function EncodePreview({
  assetId,
  format,
  result,
  stale,
  busy,
  blocked,
  onRun,
  onApply,
}: {
  assetId: string;
  format: OutputFormat;
  result: EncodeRunResult | null;
  stale: boolean;
  busy: boolean;
  blocked: boolean;
  onRun(): void;
  onApply(s: NonNullable<Suggestion["apply"]>): void;
}) {
  const file = useWorkspace((s) => s.files[assetId]);
  const [measureRef, available] = useElementWidth<HTMLDivElement>();
  const url = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (!file) return null;
  const input = formatOfMime(file.type) ?? "png";
  // Before and after side by side at every width, so the comparison stays in view on phones.
  const paneWidth = Math.max(80, Math.min(MAX_PANE, file.width, available ? available / 2 - (available >= 640 ? 32 : 20) : MAX_PANE));

  return (
    <section aria-label="Before and after" data-testid="encode-workspace">
      <div ref={measureRef} className="grid grid-cols-2 gap-2 sm:gap-4">
        <figure className="min-w-0 rounded-lg border border-line bg-surface p-2 shadow-xs sm:p-3">
          <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-medium">Original</span>
            <Mono className="text-[11px] text-ink-3" data-testid="encode-original-meta">
              {FORMAT_LABEL[input]} · {file.width} × {file.height} · {formatBytes(file.bytes)}
            </Mono>
          </figcaption>
          <div className="flex max-h-[60dvh] justify-center overflow-auto rounded-sm bg-checker">
            <div style={{ width: paneWidth }}>
              <BitmapCanvas id={assetId} width={paneWidth} label={`Original ${file.name}`} />
            </div>
          </div>
        </figure>
        <figure className="min-w-0 rounded-lg border border-line bg-surface p-2 shadow-xs sm:p-3" data-testid="encode-result-pane">
          <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-medium">Result</span>
            <Mono className="text-[11px] text-ink-3" data-testid="encode-result-meta">
              {result && !stale
                ? `${FORMAT_LABEL[result.format]}${supportsQuality(result.format) ? ` ${Math.round(result.quality * 100)}%` : ""} · ${result.width} × ${result.height} · ${formatBytes(result.bytes)}`
                : `${FORMAT_LABEL[format]} · ${file.width} × ${file.height}`}
            </Mono>
          </figcaption>
          <div className={cn("relative flex max-h-[60dvh] min-h-40 items-start justify-center overflow-auto rounded-sm bg-checker", stale && "opacity-50")}>
            {result && url ? (
              // eslint-disable-next-line @next/next/no-img-element -- local Blob preview of the encoded file
              <img src={url} alt="Encoded result" style={{ width: paneWidth }} className="h-auto max-w-full" data-testid="encode-result-image" />
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-3 text-center sm:p-6">
                <p className="t-body-sm text-ink-2">See the exact file size before you download.</p>
                <Button variant="secondary" onClick={onRun} disabled={busy || blocked} className="max-md:h-11">
                  <Gauge /> {busy ? "Working…" : "Check file size"}
                </Button>
              </div>
            )}
          </div>
        </figure>
      </div>
      {result && <Comparison result={result} stale={stale} busy={busy} blocked={blocked} onRun={onRun} onApply={onApply} />}
    </section>
  );
}

function Comparison({ result, stale, busy, blocked, onRun, onApply }: { result: EncodeRunResult; stale: boolean; busy: boolean; blocked: boolean; onRun(): void; onApply(s: NonNullable<Suggestion["apply"]>): void }) {
  const c = compareSize(result.originalBytes, result.bytes);
  const hint = stale ? null : suggest({ format: result.format, quality: result.quality, comparison: c, probe: result.probe });
  return (
    <div
      className={cn("mt-4 rounded-lg border p-4", stale ? "border-line bg-surface-3" : c.outcome === "larger" ? "border-[#f0dcb4] bg-warning-soft" : "border-[#cfe5d6] bg-success-soft")}
      data-testid="encode-comparison"
      data-original={c.original}
      data-output={c.output}
      data-saved={c.saved}
      data-percent={c.percent}
      data-outcome={c.outcome}
      aria-live="polite"
    >
      <dl className="grid grid-cols-3 gap-2 text-sm sm:gap-3">
        <div>
          <dt className="t-micro text-ink-3">Original</dt>
          <dd className="font-mono text-ink" data-testid="encode-original-size">{formatBytes(c.original)}</dd>
        </div>
        <div>
          <dt className="t-micro text-ink-3">{result.tool === "compress" ? "Compressed" : "Converted"}</dt>
          <dd className="font-mono text-ink" data-testid="encode-output-size">{formatBytes(c.output)}</dd>
        </div>
        <div>
          <dt className="t-micro text-ink-3">{c.outcome === "larger" ? "Larger by" : "Saved"}</dt>
          <dd className={cn("font-mono", c.outcome === "larger" ? "text-warning" : "text-success")} data-testid="encode-saved">
            {c.outcome === "same" ? "No change" : `${formatBytes(Math.abs(c.delta))} (${c.outcome === "larger" ? "+" : ""}${c.percent}%)`}
          </dd>
        </div>
      </dl>
      {stale ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="t-body-sm text-ink-2">Settings changed since this result.</p>
          <Button variant="secondary" size="sm" onClick={onRun} disabled={busy || blocked} className="max-md:h-11">
            <Gauge /> Check again
          </Button>
        </div>
      ) : (
        <>
          {result.target && (
            <p className={cn("t-body-sm mt-3", result.target.metTarget ? "text-success" : "text-warning")} data-testid="encode-target-result">
              {result.target.metTarget
                ? `Target ${formatBytes(result.target.bytes)} met at ${Math.round(result.quality * 100)}% quality after ${result.target.attempts} ${result.target.attempts === 1 ? "try" : "tries"}.`
                : `The target ${formatBytes(result.target.bytes)} could not be reached at 50% quality without resizing or changing format. This is the smallest measured result.`}
            </p>
          )}
          {c.outcome === "larger" && (
            <p className="t-body-sm mt-3 text-ink" data-testid="encode-larger">
              This result is <strong>larger</strong> than the original — keeping the original is smaller.
            </p>
          )}
          {hint && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2" data-testid="encode-suggestion">
              <p className="t-body-sm flex items-center gap-1.5 text-ink-2">
                <Sparkles aria-hidden className="size-4 text-accent" /> {hint.message}
              </p>
              {hint.apply && (
                <Button variant="secondary" size="sm" onClick={() => onApply(hint.apply!)} className="max-md:h-11">
                  Try it <ArrowRight />
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
