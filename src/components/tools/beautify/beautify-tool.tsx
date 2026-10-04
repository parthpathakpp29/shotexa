"use client";

/**
 * Screenshot Beautifier: a screenshot presented on a background, in a browser window or in a
 * phone shell. The composition is a few numbers per asset (undoable); export renders it from
 * the ORIGINAL file through the shared pipeline into a new workspace artifact.
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
import { beautifySize } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY } from "@/core/beautify/presets";
import { FORMAT_LABEL } from "@/core/image-encode/formats";
import { encodeIssue } from "@/core/image-encode/limits";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { BeautifyInspector } from "./beautify-inspector";
import { BeautifyStage } from "./beautify-stage";

export function BeautifyTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <BeautifyWorkspace />;
}

function BeautifyWorkspace() {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const settings = useWorkspace((s) => (s.selectedId ? s.beautify.byAsset[s.selectedId] : undefined)) ?? DEFAULT_BEAUTIFY;
  const format = useWorkspace((s) => s.exportSettings.format);
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "beautify-export" && j.status === "running"));
  const lastArtifact = useWorkspace((s) => (s.lastArtifactId ? s.files[s.lastArtifactId] : undefined));
  const files = useWorkspace((s) => s.files);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (!selectedId || !file) return null;
  const canvas = beautifySize(settings, { width: file.width, height: file.height });
  const issue = encodeIssue(canvas, format);
  const exporting = !!job;
  // `addArtifact` selects the new file, so remember which export this panel is reporting.
  const result = (completedId ? files[completedId] : undefined) ?? (lastArtifact?.producedBy === "beautify" ? lastArtifact : undefined);

  async function exportBeautified() {
    if (!selectedId || issue || exporting) return;
    setError(null);
    try {
      const exported = await runtime.exportBeautified(selectedId);
      setCompletedId(exported.id);
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code ?? "BEAUTIFY_TOO_LARGE");
    }
  }

  async function copyResultPng(id: string) {
    const blob = runtime.registry.blob(id);
    if (!blob || blob.type !== "image/png") return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setCopyStatus("Copy PNG is not supported in this browser. Download remains available.");
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyStatus("PNG copied to the clipboard.");
    } catch {
      setCopyStatus("The browser blocked clipboard image access. Download the PNG instead.");
    }
  }

  const status = exporting ? (
    <Badge tone="accent" dot>
      Composing…
    </Badge>
  ) : (
    <Badge tone="accent" dot>
      {canvas.width} × {canvas.height}
    </Badge>
  );

  return (
    <WorkspaceShell
      tool="beautify"
      status={status}
      exportAction={{ label: "Export image", onClick: exportBeautified, disabled: !!issue, busy: exporting }}
      fileHint="Select any screenshot or Shotexa result to beautify it. Your original is never changed — the result is a new image."
      inspectorTitle="Beautifier settings"
      canvas={
        <>
          <h1 className="sr-only">{TOOLS.beautify.seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title="Export didn’t finish" className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {issue && (
            <Notice tone="warning" icon={<AlertTriangle />} title="Too large to export" className="mb-4">
              <span data-testid="beautify-issue">
                {canvas.width} × {canvas.height} px is beyond what a browser can encode as {FORMAT_LABEL[format]}. Reduce the padding, lower the scale, or choose PNG.
              </span>
            </Notice>
          )}
          {exporting && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Composing at full resolution…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Export progress" />
            </div>
          )}
          <BeautifyStage key={selectedId} assetId={selectedId} />
        </>
      }
      inspector={<BeautifyInspector key={selectedId} assetId={selectedId} />}
      below={
        result && (
          <div className="mt-6" data-testid="beautify-result">
            <Notice
              tone="success"
              icon={<Check />}
              title="Image ready"
              actions={
                <div className="flex flex-wrap gap-2">
                  {result.type === "image/png" && <Button variant="secondary" onClick={() => void copyResultPng(result.id)} data-testid="beautify-copy-png"><Copy /> Copy PNG</Button>}
                  <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}><Download /> Download again</Button>
                </div>
              }
            >
              <span className="t-mono text-[12px]">
                {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
              </span>
              <span className="block">Saved to your downloads and added to this workspace as a new file. The original screenshot is unchanged.</span>
              {copyStatus && <span className="mt-1 block" role="status" data-testid="beautify-copy-status">{copyStatus}</span>}
            </Notice>
            <ContinueWith tools={continuationsFor("beautify")} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
