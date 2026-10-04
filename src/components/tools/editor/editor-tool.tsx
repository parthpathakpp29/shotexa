"use client";

/**
 * Screenshot Editor: crop, resize, rotate and flip, non-destructively. Edits are a logical
 * transform per asset (undoable); export renders it at full resolution into a new workspace
 * artifact and leaves the source exactly as it was.
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
import { IDENTITY_TRANSFORM, isIdentity, outputIssue, outputSize } from "@/core/image-transform/transform";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { EditorCanvas, type EditorGuide, type EditorView } from "./editor-canvas";
import { EditorInspector } from "./editor-inspector";

export function EditorTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <EditorWorkspace />;
}

function EditorWorkspace() {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const t = useWorkspace((s) => (s.selectedId ? (s.editor.byAsset[s.selectedId] ?? IDENTITY_TRANSFORM) : IDENTITY_TRANSFORM));
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "editor-export" && j.status === "running"));
  const lastArtifact = useWorkspace((s) => (s.lastArtifactId ? s.files[s.lastArtifactId] : undefined));
  const [view, setView] = useState<EditorView>("crop");
  const [guide, setGuide] = useState<EditorGuide>("none");
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = useWorkspace((s) => s.files);

  if (!selectedId || !file) return null;
  const source = { width: file.width, height: file.height };
  const out = outputSize(t, source);
  const unchanged = isIdentity(t);
  const blocked = !!outputIssue(out);
  const exporting = !!job;
  // `addArtifact` selects the new file, so remember which export this panel is reporting.
  const result = (completedId ? files[completedId] : undefined) ?? (lastArtifact?.producedBy === "editor" ? lastArtifact : undefined);

  async function exportEdit() {
    if (!selectedId || unchanged || blocked || exporting) return;
    setError(null);
    try {
      const exported = await runtime.exportEdit(selectedId);
      setCompletedId(exported.id);
      setView("crop");
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code ?? "EDITOR_EXPORT_VERIFY_FAILED");
    }
  }

  const status = exporting ? (
    <Badge tone="accent" dot>
      Exporting…
    </Badge>
  ) : unchanged ? (
    <Badge tone="neutral" dot>
      Original
    </Badge>
  ) : (
    <Badge tone="accent" dot>
      Edited · {out.width} × {out.height}
    </Badge>
  );

  return (
    <WorkspaceShell
      tool="editor"
      status={status}
      exportAction={{ label: "Export edited image", onClick: exportEdit, disabled: unchanged || blocked, busy: exporting }}
      fileHint="Select any screenshot or Shotexa result to edit it. Your original is never changed — export saves a new copy."
      inspectorTitle="Edit settings"
      canvas={
        <>
          <h1 className="sr-only">{TOOLS.editor.seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title="Export didn’t finish" className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {exporting && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Creating the full-resolution image…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Export progress" />
            </div>
          )}
          <EditorCanvas key={selectedId} assetId={selectedId} view={view} onViewChange={setView} guide={guide} />
        </>
      }
      inspector={<EditorInspector key={selectedId} assetId={selectedId} source={source} guide={guide} onGuideChange={setGuide} />}
      below={
        result && (
          <div className="mt-6" data-testid="editor-result">
            <Notice
              tone="success"
              icon={<Check />}
              title="Edited image ready"
              actions={
                <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}>
                  <Download /> Download again
                </Button>
              }
            >
              <span className="t-mono text-[12px]">
                {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
              </span>
              <span className="block">Saved to your downloads and added to this workspace as a new file. The original is unchanged.</span>
            </Notice>
            <ContinueWith tools={continuationsFor("editor")} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
