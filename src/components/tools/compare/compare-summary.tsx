"use client";

/**
 * The factual panel under the comparison: what was measured, what visible text changed, and
 * the report exports. Every number here comes from the same summary object the PDF and the
 * JSON are built from, so the three can never disagree.
 */
import { AlertTriangle, Download, FileJson, FileText, FolderArchive, Loader2, Minus, Plus, Type, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Mono, Notice, Progress } from "@/components/ui/primitives";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { regionLabel } from "@/core/compare/analysis";
import { buildCompareSummary, summaryRows } from "@/core/compare/summary";
import type { CompareRegion, CompareTextChange, CompareVisualAnalysis } from "@/core/compare/types";
import { messageFor } from "@/core/runtime/messages";
import type { WorkspaceFile } from "@/core/runtime/types";
import { cn } from "@/lib/cn";
import { useCompareResults } from "./use-compare";

const KIND_TONE: Record<CompareRegion["kind"], "neutral" | "accent" | "warning" | "success"> = {
  visual: "neutral",
  text: "accent",
  added: "success",
  removed: "warning",
  moved: "accent",
};

function TextChangeRow({ change, selected, onSelect }: { change: CompareTextChange; selected: boolean; onSelect(): void }) {
  const icon = change.kind === "added" ? <Plus aria-hidden className="size-3.5" /> : change.kind === "removed" ? <Minus aria-hidden className="size-3.5" /> : <Type aria-hidden className="size-3.5" />;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-testid="compare-text-change"
        data-kind={change.kind}
        className={cn("w-full rounded-md border px-3 py-2.5 text-left transition-colors", selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="t-micro inline-flex items-center gap-1 text-ink-3">
            {icon}
            {change.kind === "added" ? "Added text" : change.kind === "removed" ? "Removed text" : "Modified text"}
          </span>
          <Mono className="text-[11px] text-ink-3">OCR confidence {(change.confidence * 100).toFixed(0)}%</Mono>
        </span>
        {change.before !== undefined && (
          <span className="t-mono mt-1.5 block break-words text-[12px] text-ink-2">
            <span aria-hidden>− </span>
            <span className="sr-only">Before: </span>
            {change.before}
          </span>
        )}
        {change.after !== undefined && (
          <span className="t-mono mt-0.5 block break-words text-[12px] text-ink">
            <span aria-hidden>+ </span>
            <span className="sr-only">After: </span>
            {change.after}
          </span>
        )}
      </button>
    </li>
  );
}

export function CompareSummaryPanel({
  fileA,
  fileB,
  analysis,
  selectedRegion,
  onSelectRegion,
  selectedTextChange,
  onSelectTextChange,
  showReport = true,
}: {
  fileA: WorkspaceFile;
  fileB: WorkspaceFile;
  analysis: CompareVisualAnalysis | null;
  selectedRegion: number | null;
  onSelectRegion(id: number | null): void;
  selectedTextChange: string | null;
  onSelectTextChange(id: string | null): void;
  /** A workflow generates the report in its own step, so it hides these buttons. */
  showReport?: boolean;
}) {
  const { runtime } = useWorkspaceContext();
  const settings = useWorkspace((s) => s.compare);
  const textState = useWorkspace((s) => s.compareRun.text);
  const reportState = useWorkspace((s) => s.compareRun.report);
  const results = useCompareResults(fileA, fileB);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      buildCompareSummary({
        a: { name: fileA.name, width: fileA.width, height: fileA.height, bytes: fileA.bytes, type: fileA.type, transparent: null },
        b: { name: fileB.name, width: fileB.width, height: fileB.height, bytes: fileB.bytes, type: fileB.type, transparent: null },
        settings,
        alignment: results.alignment,
        analysis,
        textDiff: results.textDiff,
      }),
    [analysis, fileA, fileB, results.alignment, results.textDiff, settings],
  );

  const rows = summaryRows(summary);
  const regions = analysis?.regions ?? [];
  const textDiff = results.textDiff;
  const analysing = settings.mode === "difference" || settings.mode === "heatmap";

  async function analyseText() {
    setError(null);
    try {
      await runtime.analyseCompareText();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "COMPARE_CANCELLED") setError(code ?? "COMPARE_TEXT_FAILED");
    }
  }

  async function downloadReport(kind: "pdf" | "zip" | "json") {
    setError(null);
    try {
      await runtime.exportCompareReport(kind);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "COMPARE_CANCELLED") setError(code ?? "COMPARE_REPORT_FAILED");
    }
  }

  return (
    <section aria-label="Comparison summary" className="mt-6 grid gap-5 lg:grid-cols-2" data-testid="compare-summary">
      {error && (
        <Notice tone="error" icon={<AlertTriangle />} title="That step didn’t finish" className="lg:col-span-2">
          {messageFor(error)}
        </Notice>
      )}

      <div className="rounded-lg border border-line bg-surface p-5 shadow-xs">
        <h2 className="font-display text-xl">Comparison summary</h2>
        {analysing ? (
          <>
            <dl className="mt-4 divide-y divide-line" data-testid="compare-summary-metrics">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 py-1.5">
                  <dt className="t-body-sm text-ink-2">{row.label}</dt>
                  <dd className="t-mono text-[13px] text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="t-body-sm mt-3 text-ink-3">
              {summary.metric.mode === "perceptual" ? "Perceptual" : "Pixel"} metric · {summary.metric.description}
            </p>
            {summary.alignment.status !== "off" && (
              <p className="t-mono mt-2 text-[12px] text-ink-2" data-testid="compare-summary-alignment">
                Alignment: X {summary.alignment.x >= 0 ? "+" : ""}
                {Math.round(summary.alignment.x)} px · Y {summary.alignment.y >= 0 ? "+" : ""}
                {Math.round(summary.alignment.y)} px
                {Math.abs(summary.alignment.scalePercent - 100) >= 0.05 ? ` · Scale ${summary.alignment.scalePercent.toFixed(1)}%` : ""}
                {summary.alignment.status === "failed" ? " · not measured" : ""}
              </p>
            )}
          </>
        ) : (
          <p className="t-body-sm mt-3 text-ink-2">
            Switch to Difference or Heatmap to measure how much changed, where it changed and how many changed regions there are. The before/after, slider and overlay views are for looking, not measuring.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl">Visible text changes</h2>
          {textDiff && (
            <Badge tone={textDiff.changes.length ? "accent" : "neutral"} dot>
              {textDiff.changes.length} change{textDiff.changes.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {textState.status === "running" ? (
          <div className="mt-4" aria-live="polite">
            <p className="t-body-sm text-ink-2" data-testid="compare-text-stage">{textState.stage ?? "Working…"}</p>
            <Progress value={null} label="Text comparison progress" className="mt-2" />
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void runtime.cancelCompareText()}>
              <X /> Cancel
            </Button>
          </div>
        ) : (
          <>
            <p className="t-body-sm mt-2 text-ink-2">
              Runs on-device OCR on both screenshots and compares what it read. It is never part of the visual comparison, because OCR takes far longer than a pixel difference.
            </p>
            <Button variant="secondary" size="sm" className="mt-3 max-md:h-11" data-testid="compare-analyse-text" onClick={() => void analyseText()}>
              <Type /> {textDiff ? "Analyse text changes again" : "Analyse text changes"}
            </Button>
          </>
        )}
        {textState.status === "failed" && (
          <p className="t-body-sm mt-3 text-error" data-testid="compare-text-error">
            {messageFor(textState.error)} The visual comparison above is unaffected.
          </p>
        )}
        {textDiff && (
          <div className="mt-4">
            <Mono className="text-[12px]" data-testid="compare-text-totals">
              {textDiff.added} added · {textDiff.removed} removed · {textDiff.changed} modified · {textDiff.unchangedLines} unchanged lines
            </Mono>
            {textDiff.changes.length === 0 ? (
              <p className="t-body-sm mt-2 text-ink-2">
                OCR read the same words in the same order on both screenshots, so there is no visible text change to report — even if the lines wrap differently.
              </p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="compare-text-list">
                {textDiff.changes.slice(0, 40).map((change) => (
                  <TextChangeRow key={change.id} change={change} selected={selectedTextChange === change.id} onSelect={() => onSelectTextChange(selectedTextChange === change.id ? null : change.id)} />
                ))}
              </ul>
            )}
            {textDiff.changes.length > 40 && <p className="t-body-sm mt-2 text-ink-3">The remaining {textDiff.changes.length - 40} changes are in the report and the JSON summary.</p>}
          </div>
        )}
      </div>

      {analysing && regions.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5 shadow-xs lg:col-span-2">
          <h2 className="font-display text-xl">Changed regions</h2>
          <p className="t-body-sm mt-1 text-ink-2">
            A region is only named when the measurement supports it. Anything else is reported as a visual change — Shotexa does not guess what an area of pixels represents.
          </p>
          <ul className="mt-4 grid gap-2 md:grid-cols-2" data-testid="compare-region-list">
            {regions.slice(0, 40).map((region) => (
              <li key={region.id}>
                <button
                  type="button"
                  onClick={() => onSelectRegion(selectedRegion === region.id ? null : region.id)}
                  aria-pressed={selectedRegion === region.id}
                  data-testid="compare-region-item"
                  data-kind={region.kind}
                  className={cn("w-full rounded-md border px-3 py-2.5 text-left transition-colors", selectedRegion === region.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">Region {region.id}</strong>
                    <Badge tone={KIND_TONE[region.kind]}>{regionLabel(region, analysis?.analysisScale ?? 1)}</Badge>
                    <Mono className="text-[11px] text-ink-3">{region.confidence} confidence</Mono>
                  </span>
                  <Mono className="mt-1 block text-[11px]">
                    {region.width} × {region.height} at {region.x}, {region.y} · {region.pixels.toLocaleString()} changed px · {region.percent.toFixed(2)}%
                  </Mono>
                  {region.sourceB && (
                    <Mono className="mt-0.5 block text-[11px] text-ink-3">
                      In After at {region.sourceB.x}, {region.sourceB.y}
                    </Mono>
                  )}
                  {region.pairedWith !== undefined && <Mono className="mt-0.5 block text-[11px] text-ink-3">Paired with region {region.pairedWith}</Mono>}
                </button>
              </li>
            ))}
          </ul>
          {regions.length > 40 && <p className="t-body-sm mt-3 text-ink-3">{regions.length - 40} further regions are listed in the report and the JSON summary.</p>}
        </div>
      )}

      {showReport && (
      <div className="rounded-lg border border-line bg-surface p-5 shadow-xs lg:col-span-2">
        <h2 className="font-display text-xl">Comparison report</h2>
        <p className="t-body-sm mt-1 text-ink-2">
          A local record of what was measured and the settings that produced it — the file facts, the summary, the before/after and difference views, the changed regions, any text changes and the
          ignored areas. It is not a certification, and it is built in this browser.
        </p>
        {reportState.status === "running" && (
          <div className="mt-4" aria-live="polite">
            <p className="t-body-sm text-ink-2" data-testid="compare-report-stage">{reportState.stage ?? "Working…"}</p>
            <Progress value={null} label="Report progress" className="mt-2" />
          </div>
        )}
        {reportState.status === "failed" && (
          <p className="t-body-sm mt-3 text-error" data-testid="compare-report-error">
            {messageFor(reportState.error)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" className="max-md:h-11" data-testid="compare-report-pdf" disabled={reportState.status === "running"} onClick={() => void downloadReport("pdf")}>
            {reportState.status === "running" && reportState.kind === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF report
          </Button>
          <Button variant="secondary" className="max-md:h-11" data-testid="compare-report-zip" disabled={reportState.status === "running"} onClick={() => void downloadReport("zip")}>
            {reportState.status === "running" && reportState.kind === "zip" ? <Loader2 className="animate-spin" /> : <FolderArchive />} Report ZIP
          </Button>
          <Button variant="secondary" className="max-md:h-11" data-testid="compare-report-json" disabled={reportState.status === "running"} onClick={() => void downloadReport("json")}>
            {reportState.status === "running" && reportState.kind === "json" ? <Loader2 className="animate-spin" /> : <FileJson />} JSON summary
          </Button>
          {results.report && (
            <Button
              variant="ghost"
              className="max-md:h-11"
              data-testid="compare-report-again"
              onClick={() => {
                const record = results.report!;
                void import("@/core/runtime/runtime").then(({ downloadBlob }) => downloadBlob(record.blob, record.name));
              }}
            >
              <Download /> Download {results.report.name} again
            </Button>
          )}
        </div>
        <p className="t-body-sm mt-3 text-ink-3">
          The ZIP contains only the files that were actually generated: before.png, after.png, difference.png, heatmap.png, report.pdf and summary.json.
        </p>
      </div>
      )}
    </section>
  );
}
