"use client";

/**
 * Compress Screenshot and Convert Screenshot: one workspace over the shared encoder
 * (`core/image-encode`). The page never encodes pixels itself — it asks the runtime, which
 * runs the Image Worker (or the main-thread fallback) on the ORIGINAL file.
 *
 * "Check file size" encodes and shows the exact result; the primary action reuses that result
 * when the settings haven't changed (no second encode), saves it as a new, selected workspace
 * artifact and downloads it. Moving a slider never re-encodes.
 */
import { AlertTriangle, Check, Copy, Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { compareSize } from "@/core/image-encode/compare";
import { FORMAT_LABEL, supportsQuality } from "@/core/image-encode/formats";
import { encodeIssue } from "@/core/image-encode/limits";
import { customOutputName, resolveFormat } from "@/core/image-encode/settings";
import type { EncodeTool as EncodeToolId } from "@/core/image-encode/types";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset, type EncodeRunResult, type FormatComparisonRun } from "@/core/runtime/runtime";
import { EncodeInspector } from "./encode-inspector";
import { EncodePreview } from "./encode-preview";
import { FormatComparison } from "./format-comparison";

export function EncodeTool({ tool, landing }: { tool: EncodeToolId; landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <EncodeWorkspace tool={tool} />;
}

/** Identifies the output a set of settings produces for one asset. */
const runKey = (assetId: string, format: string, quality: number | null, background: string | null, targetBytes: number | null) => JSON.stringify([assetId, format, quality, background, targetBytes]);

function EncodeWorkspace({ tool }: { tool: EncodeToolId }) {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const settings = useWorkspace((s) => s.encode[tool]);
  const setSettings = useWorkspace((s) => s.setEncodeSettings);
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "encode" && j.status === "running"));
  const [run, setRun] = useState<{ key: string; result: EncodeRunResult } | null>(null);
  const [comparison, setComparison] = useState<{ key: string; result: FormatComparisonRun } | null>(null);
  const [saved, setSaved] = useState<{ id: string; result: EncodeRunResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputNames, setOutputNames] = useState<Record<string, string>>({});
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!selectedId || !file) return null;
  const assetId = selectedId;
  const asset = file;
  const outputName = outputNames[assetId] ?? asset.name.replace(/\.[^.]+$/, "");
  const setOutputName = (value: string) => setOutputNames((names) => ({ ...names, [assetId]: value }));
  const format = resolveFormat(tool, settings.format, file.type);
  const targetBytes = tool === "compress" && supportsQuality(format) ? settings.targetBytes : null;
  const key = runKey(selectedId, format, supportsQuality(format) ? settings.quality : null, format === "jpeg" ? settings.background : null, targetBytes);
  const current = run?.key === key ? run.result : null;
  const comparisonKey = JSON.stringify([selectedId, settings.quality, settings.background]);
  const currentComparison = comparison?.key === comparisonKey && comparison.result.sourceId === selectedId ? comparison.result : null;
  // The last result for this image, shown dimmed once the settings move on.
  const shown = run && run.result.sourceId === selectedId ? run.result : null;
  const blocked = !!encodeIssue(file, format);
  const busy = !!job;
  const verb = tool === "compress" ? "Compress" : "Convert";

  async function encode(): Promise<EncodeRunResult | null> {
    if (!selectedId || blocked) return null;
    setError(null);
    try {
      const result = await runtime.encodeAsset(tool, assetId);
      setRun({ key: runKey(assetId, result.format, supportsQuality(result.format) ? settings.quality : null, result.format === "jpeg" ? result.background : null, result.target?.bytes ?? null), result });
      return result;
    } catch (e) {
      setError((e as { code?: string }).code ?? "ENCODE_MEMORY_PRESSURE");
      return null;
    }
  }

  async function exportResult() {
    if (busy || blocked) return;
    const result = current ?? (await encode());
    if (!result) return;
    const named = tool === "convert" ? { ...result, name: customOutputName(outputName, asset.name, result.format) } : result;
    const id = runtime.saveEncoded(named);
    setSaved({ id, result: named });
    downloadAsset(runtime, id);
  }

  async function compareAllFormats() {
    if (busy) return;
    setError(null);
    try {
      const result = await runtime.compareEncodeFormats(assetId);
      setComparison({ key: comparisonKey, result });
    } catch (e) {
      setError((e as { code?: string }).code ?? "ENCODE_MEMORY_PRESSURE");
    }
  }

  function selectCandidate(candidate: EncodeRunResult) {
    setSettings("convert", { format: candidate.format });
    setRun({ key: runKey(assetId, candidate.format, supportsQuality(candidate.format) ? settings.quality : null, candidate.format === "jpeg" ? settings.background : null, null), result: candidate });
    setCopyStatus(null);
  }

  async function copyPng() {
    if (!current || current.format !== "png") return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setCopyStatus("Copy PNG is not supported in this browser. Download remains available.");
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": current.blob })]);
      setCopyStatus("PNG copied to the clipboard.");
    } catch {
      setCopyStatus("The browser blocked clipboard image access. Download the PNG instead.");
    }
  }

  const status = busy ? (
    <Badge tone="accent" dot>
      Encoding…
    </Badge>
  ) : (
    <Badge tone="accent" dot>
      → {FORMAT_LABEL[format]}
      {targetBytes ? ` · target ${Math.round(targetBytes / 1024)} KB` : supportsQuality(format) ? ` ${Math.round(settings.quality * 100)}%` : ""}
    </Badge>
  );

  return (
    <WorkspaceShell
      tool={tool}
      status={status}
      exportAction={{ label: tool === "compress" ? "Compress & download" : `Convert to ${FORMAT_LABEL[format]}`, onClick: exportResult, disabled: blocked, busy }}
      fileHint={`Select any screenshot or Shotexa result to ${verb.toLowerCase()} it. Your original is never changed — the result is a new file.`}
      inspectorTitle={`${verb} settings`}
      canvas={
        <>
          <h1 className="sr-only">{TOOLS[tool].seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title={`${verb} didn’t finish`} className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {busy && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Encoding at full resolution on your device…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Encoding progress" />
            </div>
          )}
          <EncodePreview
            key={selectedId}
            assetId={selectedId}
            format={format}
            result={shown}
            stale={!!shown && !current}
            busy={busy}
            blocked={blocked}
            onRun={() => void encode()}
            onApply={(apply) => {
              // A suggestion changes settings only because the user chose "Try it".
              setSettings(tool, { format: tool === "compress" && apply.format === format && settings.format === "same" ? "same" : apply.format, ...(apply.quality === undefined ? {} : { quality: apply.quality }) });
              void encode();
            }}
          />
          {tool === "convert" && (
            <>
              <FormatComparison comparison={currentComparison} selected={current} originalBytes={file.bytes} busy={busy} blocked={false} onCompare={() => void compareAllFormats()} onSelect={selectCandidate} />
              {current?.format === "png" && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => void copyPng()} className="max-md:h-11" data-testid="copy-output-png"><Copy /> Copy PNG</Button>
                  {copyStatus && <p className="t-body-sm text-ink-2" role="status" data-testid="copy-output-status">{copyStatus}</p>}
                </div>
              )}
            </>
          )}
        </>
      }
      inspector={<EncodeInspector key={selectedId} tool={tool} assetId={selectedId} format={format} busy={busy} outputName={tool === "convert" ? outputName : undefined} onOutputName={tool === "convert" ? setOutputName : undefined} onRun={() => void encode()} />}
      below={saved && <SavedResult tool={tool} saved={saved} onDownload={() => downloadAsset(runtime, saved.id)} />}
    />
  );
}

function SavedResult({ tool, saved, onDownload }: { tool: EncodeToolId; saved: { id: string; result: EncodeRunResult }; onDownload(): void }) {
  const exists = useWorkspace((s) => !!s.files[saved.id]);
  if (!exists) return null;
  const r = saved.result;
  const c = compareSize(r.originalBytes, r.bytes);
  return (
    <div className="mt-6" data-testid="encode-result">
      <Notice
        tone="success"
        icon={<Check />}
        title={tool === "compress" ? "Compressed image ready" : `Converted to ${FORMAT_LABEL[r.format]}`}
        actions={
          <Button variant="secondary" onClick={onDownload}>
            <Download /> Download again
          </Button>
        }
      >
        <span className="t-mono text-[12px]">
          {r.name} · {r.width} × {r.height} px · {formatBytes(r.bytes)}
        </span>
        <span className="block">
          {c.outcome === "smaller"
            ? `${formatBytes(c.saved)} smaller than the original (${c.percent}% saved).`
            : c.outcome === "larger"
              ? `${formatBytes(c.delta)} larger than the original (+${c.percent}%).`
              : "The same size as the original."}{" "}
          Added to this workspace as a new file; the original is unchanged.
        </span>
      </Notice>
      <ContinueWith tools={continuationsFor(tool)} fileId={saved.id} />
    </div>
  );
}
