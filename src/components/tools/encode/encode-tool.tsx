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
import { AlertTriangle, Check, Download } from "lucide-react";
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
import { resolveFormat } from "@/core/image-encode/settings";
import type { EncodeTool as EncodeToolId } from "@/core/image-encode/types";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset, type EncodeRunResult } from "@/core/runtime/runtime";
import { EncodeInspector } from "./encode-inspector";
import { EncodePreview } from "./encode-preview";

export function EncodeTool({ tool, landing }: { tool: EncodeToolId; landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <EncodeWorkspace tool={tool} />;
}

/** Identifies the output a set of settings produces for one asset. */
const runKey = (assetId: string, format: string, quality: number | null, background: string | null) => JSON.stringify([assetId, format, quality, background]);

function EncodeWorkspace({ tool }: { tool: EncodeToolId }) {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const settings = useWorkspace((s) => s.encode[tool]);
  const setSettings = useWorkspace((s) => s.setEncodeSettings);
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "encode" && j.status === "running"));
  const [run, setRun] = useState<{ key: string; result: EncodeRunResult } | null>(null);
  const [saved, setSaved] = useState<{ id: string; result: EncodeRunResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!selectedId || !file) return null;
  const format = resolveFormat(tool, settings.format, file.type);
  const key = runKey(selectedId, format, supportsQuality(format) ? settings.quality : null, format === "jpeg" ? settings.background : null);
  const current = run?.key === key ? run.result : null;
  // The last result for this image, shown dimmed once the settings move on.
  const shown = run && run.result.sourceId === selectedId ? run.result : null;
  const blocked = !!encodeIssue(file, format);
  const busy = !!job;
  const verb = tool === "compress" ? "Compress" : "Convert";

  async function encode(): Promise<EncodeRunResult | null> {
    if (!selectedId || blocked) return null;
    setError(null);
    try {
      const result = await runtime.encodeAsset(tool, selectedId);
      setRun({ key: runKey(selectedId, result.format, supportsQuality(result.format) ? result.quality : null, result.format === "jpeg" ? result.background : null), result });
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
    const id = runtime.saveEncoded(result);
    setSaved({ id, result });
    downloadAsset(runtime, id);
  }

  const status = busy ? (
    <Badge tone="accent" dot>
      Encoding…
    </Badge>
  ) : (
    <Badge tone="accent" dot>
      → {FORMAT_LABEL[format]}
      {supportsQuality(format) ? ` ${Math.round(settings.quality * 100)}%` : ""}
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
        </>
      }
      inspector={<EncodeInspector key={selectedId} tool={tool} assetId={selectedId} format={format} busy={busy} onRun={() => void encode()} />}
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
