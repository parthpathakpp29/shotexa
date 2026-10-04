"use client";

/**
 * Split Long Screenshot: cut one image into horizontal pieces, equally or at custom lines.
 * Settings are a few numbers per asset (undoable); export renders every piece from the ORIGINAL
 * file in one decode. Pieces are downloaded from here, and join the workspace only when the
 * user asks — a long screenshot can make dozens of files.
 */
import { AlertTriangle, Check, Download, FolderPlus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { messageFor } from "@/core/runtime/messages";
import { downloadBlob, downloadBlobs, type SplitRunResult } from "@/core/runtime/runtime";
import { defaultSplit, planSplit, validatePieces } from "@/core/split/plan";
import { SplitInspector } from "./split-inspector";
import { SplitStage } from "./split-stage";

export function SplitTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <SplitWorkspace />;
}

function SplitWorkspace() {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const stored = useWorkspace((s) => (s.selectedId ? s.split.byAsset[s.selectedId] : undefined));
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "split-export" && j.status === "running"));
  const [result, setResult] = useState<SplitRunResult | null>(null);
  const [addedIds, setAddedIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The selected line belongs to one image: switching files starts with none selected.
  const [lineSel, setLineSel] = useState<{ assetId: string | null; index: number | null }>({ assetId: null, index: null });
  const active = lineSel.assetId === selectedId ? lineSel.index : null;

  if (!selectedId || !file) return null;
  const H = file.height;
  const pieces = planSplit(stored ?? defaultSplit({ width: file.width, height: H }), { width: file.width, height: H });
  const valid = validatePieces(pieces, H, true).length === 0;
  const exporting = !!job;

  async function exportSplit() {
    if (!selectedId || !valid || exporting) return;
    setError(null);
    try {
      const run = await runtime.exportSplit(selectedId);
      setResult(run);
      setAddedIds(null);
    } catch (e) {
      setError((e as { code?: string }).code ?? "EDITOR_EXPORT_VERIFY_FAILED");
    }
  }

  const status = exporting ? (
    <Badge tone="accent" dot>
      Exporting…
    </Badge>
  ) : (
    <Badge tone={valid ? "accent" : "neutral"} dot>
      {pieces.length} piece{pieces.length === 1 ? "" : "s"}
    </Badge>
  );

  return (
    <WorkspaceShell
      tool="split"
      status={status}
      exportAction={{ label: `Split into ${pieces.length} images`, onClick: exportSplit, disabled: !valid, busy: exporting }}
      fileHint="Select any screenshot or Shotexa result to split it. Your original is never changed — every piece is a new image."
      inspectorTitle="Split settings"
      canvas={
        <>
          <h1 className="sr-only">{TOOLS.split.seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title="Split didn’t finish" className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {exporting && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Cutting {pieces.length} pieces at full resolution…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Split progress" />
            </div>
          )}
          <SplitStage key={selectedId} assetId={selectedId} active={active} onActive={(index) => setLineSel({ assetId: selectedId, index })} />
        </>
      }
      inspector={<SplitInspector key={selectedId} assetId={selectedId} />}
      below={result && <SplitResult result={result} addedIds={addedIds} onAdd={() => setAddedIds(runtime.addSplitPieces(result))} />}
    />
  );
}

function SplitResult({ result, addedIds, onAdd }: { result: SplitRunResult; addedIds: string[] | null; onAdd(): void }) {
  const source = useWorkspace((s) => s.files[result.sourceId]);
  const [downloading, setDownloading] = useState(false);
  // Thumbnails straight from the rendered Blobs; released when the result goes away.
  const urls = useMemo(() => result.pieces.map((p) => URL.createObjectURL(p.blob)), [result]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const total = result.pieces.reduce((n, p) => n + p.bytes, 0);

  async function downloadAll() {
    setDownloading(true);
    try {
      await downloadBlobs(result.pieces.map((p) => ({ blob: p.blob, name: p.name })));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-6" data-testid="split-result">
      <Notice
        tone="success"
        icon={<Check />}
        title={`${result.pieces.length} images ready`}
        actions={
          <>
            <Button onClick={downloadAll} disabled={downloading} data-testid="split-download-all">
              <Download /> {downloading ? "Downloading…" : `Download all (${result.pieces.length})`}
            </Button>
            {!addedIds && (
              <Button variant="secondary" onClick={onAdd} data-testid="split-add-to-workspace">
                <FolderPlus /> Add to workspace
              </Button>
            )}
          </>
        }
      >
        <span className="t-mono text-[12px]">
          From {source?.name ?? "your screenshot"} · {formatBytes(total)} in total
        </span>
        <span className="block">
          {addedIds
            ? `Added ${addedIds.length} images to this workspace — the first is selected. Your original is unchanged.`
            : "Download them here, or add them to this workspace to keep working on them. Your original is unchanged."}
        </span>
      </Notice>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Split pieces">
        {result.pieces.map((p, i) => (
          <li key={p.name} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs" data-testid="split-piece" data-width={p.width} data-height={p.height} data-y0={p.y0} data-y1={p.y1}>
            <div className="flex h-36 items-start justify-center overflow-hidden bg-checker p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local Blob preview */}
              <img src={urls[i]} alt={`Piece ${i + 1}`} loading="lazy" className="max-h-full w-auto max-w-full object-contain object-top shadow-xs" />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <span className="truncate font-mono text-[11px] text-ink" title={p.name}>
                {p.name}
              </span>
              <span className="font-mono text-[11px] text-ink-3">
                {p.width} × {p.height} · {formatBytes(p.bytes)}
              </span>
              <Button variant="secondary" size="sm" className="mt-1 max-md:h-11" onClick={() => downloadBlob(p.blob, p.name)} data-testid="split-piece-download" aria-label={`Download ${p.name}`}>
                <Download /> Download
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {addedIds && addedIds.length > 0 && <ContinueWith tools={continuationsFor("split")} fileId={addedIds[0]} />}
    </div>
  );
}
