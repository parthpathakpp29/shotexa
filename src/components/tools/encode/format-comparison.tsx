"use client";

import { Check, Copy, Gauge, PackageOpen } from "lucide-react";
import { useState } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { FORMAT_LABEL, supportsAlpha, supportsQuality } from "@/core/image-encode/formats";
import type { EncodeRunResult, FormatComparisonRun } from "@/core/runtime/runtime";
import { downloadBlob } from "@/core/runtime/runtime";
import { createWebPack, pictureMarkup } from "@/core/image-encode/web-pack";
import { cn } from "@/lib/cn";

export function FormatComparison({
  comparison,
  selected,
  originalBytes,
  busy,
  blocked,
  onCompare,
  onSelect,
}: {
  comparison: FormatComparisonRun | null;
  selected: EncodeRunResult | null;
  originalBytes: number;
  busy: boolean;
  blocked: boolean;
  onCompare(): void;
  onSelect(candidate: EncodeRunResult): void;
}) {
  const [packBusy, setPackBusy] = useState(false);
  const [packStatus, setPackStatus] = useState<string | null>(null);
  async function exportPack() {
    if (!comparison || packBusy) return;
    setPackBusy(true);
    setPackStatus(null);
    try {
      const pack = await createWebPack(comparison.candidates);
      downloadBlob(pack.blob, "shotexa-web-pack.zip");
      setPackStatus(`Web pack ready: ${pack.names.join(", ")}.`);
    } catch {
      setPackStatus("The web pack could not be created safely. The measured images remain available.");
    } finally {
      setPackBusy(false);
    }
  }
  async function copyMarkup() {
    const markup = pictureMarkup();
    if (!navigator.clipboard?.writeText) {
      setPackStatus("Clipboard text access is unavailable. The snippet is included in the ZIP.");
      return;
    }
    try {
      await navigator.clipboard.writeText(markup);
      setPackStatus("Picture markup copied.");
    } catch {
      setPackStatus("The browser blocked clipboard access. The snippet is included in the ZIP.");
    }
  }
  if (!comparison) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-surface p-4" data-testid="format-comparison-empty">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Compare PNG, JPEG and WebP</p>
            <p className="t-body-sm mt-1 text-ink-2">One local decode, then three bounded encodes. No upload.</p>
          </div>
          <Button variant="secondary" onClick={onCompare} disabled={busy || blocked} className="max-md:h-11" data-testid="compare-formats">
            <Gauge /> {busy ? "Encoding…" : "Measure all formats"}
          </Button>
        </div>
      </div>
    );
  }

  const smallest = comparison.candidates.reduce((best, candidate) => (candidate.bytes < best.bytes ? candidate : best));
  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4" aria-label="Measured format comparison" aria-live="polite" data-testid="format-comparison">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-ink">Measured in this browser</h2>
          <p className="t-body-sm mt-1 text-ink-2" data-testid="format-comparison-summary">
            {FORMAT_LABEL[smallest.format]} produced the smallest measured file for this image: {formatBytes(smallest.bytes)}.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCompare} disabled={busy}>Measure again</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="t-micro border-b border-line text-ink-3">
            <tr><th className="py-2 pr-3">Format</th><th className="py-2 pr-3">Measured</th><th className="py-2 pr-3">vs original</th><th className="py-2 pr-3">Quality</th><th className="py-2 pr-3">Transparency</th><th className="py-2 text-right">Use</th></tr>
          </thead>
          <tbody>
            {comparison.candidates.map((candidate) => {
              const delta = candidate.bytes - originalBytes;
              const percent = originalBytes > 0 ? Math.round((Math.abs(delta) / originalBytes) * 100) : 0;
              const active = selected?.format === candidate.format && selected.bytes === candidate.bytes;
              return (
                <tr key={candidate.format} className={cn("border-b border-line/70 last:border-0", active && "bg-accent-soft")} data-testid={`format-candidate-${candidate.format}`}>
                  <td className="py-3 pr-3 font-medium">{FORMAT_LABEL[candidate.format]}</td>
                  <td className="py-3 pr-3 font-mono">{formatBytes(candidate.bytes)}</td>
                  <td className={cn("py-3 pr-3 font-mono", delta <= 0 ? "text-success" : "text-warning")}>{delta === 0 ? "same" : `${delta < 0 ? "−" : "+"}${percent}%`}</td>
                  <td className="py-3 pr-3">{supportsQuality(candidate.format) ? `${Math.round(candidate.quality * 100)}%` : "Lossless"}</td>
                  <td className="py-3 pr-3">{supportsAlpha(candidate.format) ? "Supported" : "Flattened"}</td>
                  <td className="py-3 text-right">
                    <Button variant={active ? "primary" : "secondary"} size="sm" onClick={() => onSelect(candidate)} className="max-md:h-11" aria-label={`Use measured ${FORMAT_LABEL[candidate.format]}`}>
                      {active && <Check />} {active ? "Selected" : "Use"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="t-body-sm mt-3 text-ink-3">PNG and WebP can preserve transparency. JPEG replaces transparent pixels with the chosen background colour.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => void exportPack()} disabled={packBusy} className="max-md:h-11" data-testid="export-web-pack"><PackageOpen /> {packBusy ? "Building…" : "Export for Web"}</Button>
        <Button variant="ghost" onClick={() => void copyMarkup()} className="max-md:h-11" data-testid="copy-picture-markup"><Copy /> Copy &lt;picture&gt;</Button>
        {packStatus && <p className="t-body-sm basis-full text-ink-2" role="status" data-testid="web-pack-status">{packStatus}</p>}
      </div>
    </section>
  );
}
