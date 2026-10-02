"use client";

/**
 * Annotation: arrows, boxes, highlights, text, freehand and numbered steps, kept as small
 * vector objects in source pixels until export, which flattens them at full resolution on top
 * of any pending Screenshot Editor changes into a new workspace artifact.
 */
import { AlertTriangle, Check, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { annotationFrame } from "@/core/annotation/geometry";
import type { AnnotationObject } from "@/core/annotation/types";
import { IDENTITY_TRANSFORM, outputIssue } from "@/core/image-transform/transform";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { AnnotateCanvas } from "./annotate-canvas";
import { AnnotateInspector } from "./annotate-inspector";

const EMPTY: AnnotationObject[] = [];

export function AnnotateTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <AnnotateWorkspace />;
}

function AnnotateWorkspace() {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const t = useWorkspace((s) => (s.selectedId ? (s.editor.byAsset[s.selectedId] ?? IDENTITY_TRANSFORM) : IDENTITY_TRANSFORM));
  const objects = useWorkspace((s) => (s.selectedId ? (s.annotation.byAsset[s.selectedId] ?? EMPTY) : EMPTY));
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "annotate-export" && j.status === "running"));
  const lastArtifact = useWorkspace((s) => (s.lastArtifactId ? s.files[s.lastArtifactId] : undefined));
  const files = useWorkspace((s) => s.files);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useMemo(() => (file ? annotationFrame(t, { width: file.width, height: file.height }) : null), [file, t]);

  if (!selectedId || !file || !frame) return null;
  const blocked = !!outputIssue(frame.out);
  const exporting = !!job;
  const count = objects.length;
  // `addArtifact` selects the new file, so remember which export this panel is reporting.
  const result = (completedId ? files[completedId] : undefined) ?? (lastArtifact?.producedBy === "annotate" ? lastArtifact : undefined);

  async function exportAnnotated() {
    if (!selectedId || !count || blocked || exporting) return;
    setError(null);
    try {
      const exported = await runtime.exportAnnotated(selectedId);
      setCompletedId(exported.id);
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code ?? "EDITOR_EXPORT_VERIFY_FAILED");
    }
  }

  const status = exporting ? (
    <Badge tone="accent" dot>
      Exporting…
    </Badge>
  ) : count ? (
    <Badge tone="accent" dot>
      {count} annotation{count === 1 ? "" : "s"}
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Ready to annotate
    </Badge>
  );

  return (
    <WorkspaceShell
      tool="annotate"
      status={status}
      exportAction={{ label: "Export annotated image", onClick: exportAnnotated, disabled: !count || blocked, busy: exporting }}
      fileHint="Select any screenshot or Shotexa result to annotate it. Your original is never changed — export saves a new copy."
      inspectorTitle="Annotation settings"
      canvas={
        <>
          <h1 className="sr-only">{TOOLS.annotate.seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title="Export didn’t finish" className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {exporting && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Flattening annotations at full resolution…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Export progress" />
            </div>
          )}
          <AnnotateCanvas key={selectedId} assetId={selectedId} />
        </>
      }
      inspector={<AnnotateInspector key={selectedId} assetId={selectedId} frame={frame} />}
      below={
        result && (
          <div className="mt-6" data-testid="annotate-result">
            <Notice
              tone="success"
              icon={<Check />}
              title="Annotated image ready"
              actions={
                <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}>
                  <Download /> Download again
                </Button>
              }
            >
              <span className="t-mono text-[12px]">
                {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
              </span>
              <span className="block">Saved to your downloads and added to this workspace as a new file. The original and its annotations are unchanged.</span>
            </Notice>
            <ContinueWith tools={continuationsFor("annotate")} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
