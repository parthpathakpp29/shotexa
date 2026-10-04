"use client";

/**
 * Compare Screenshots: two workspace images, four ways of looking at the difference between
 * them. The comparison is a couple of asset ids and a few numbers (undoable); export renders it
 * from the ORIGINAL files and records BOTH parents on the new artifact.
 */
import { AlertTriangle, Check, Download, Images } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { compareSize } from "@/core/compare/layout";
import { COMPARE_MODES } from "@/core/compare/presets";
import { compareIssue } from "@/core/compare/render";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { CompareInspector } from "./compare-inspector";
import { CompareStage } from "./compare-stage";

export function CompareTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <CompareWorkspace />;
}

function CompareWorkspace() {
  const { runtime } = useWorkspaceContext();
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const selectedId = useWorkspace((s) => s.selectedId);
  const settings = useWorkspace((s) => s.compare);
  const setCompare = useWorkspace((s) => s.setCompare);
  const job = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "compare-export" && j.status === "running"));
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileA = settings.a ? files[settings.a] : undefined;
  const fileB = settings.b ? files[settings.b] : undefined;

  // Choose sensible screenshots the first time, without putting it in the undo history.
  useEffect(() => {
    if (order.length < 2) return;
    const valid = (id: string | null) => !!id && !!files[id];
    if (valid(settings.a) && valid(settings.b) && settings.a !== settings.b) return;
    const first = valid(settings.a) ? settings.a! : (selectedId && files[selectedId] ? selectedId : order[0]);
    const second = order.find((id) => id !== first) ?? order[0];
    setCompare({ ...settings, a: first, b: second }, { record: false });
  }, [order, files, selectedId, settings, setCompare]);

  const exporting = !!job;
  const ready = !!fileA && !!fileB;
  const a = fileA ? { width: fileA.width, height: fileA.height } : null;
  const b = fileB ? { width: fileB.width, height: fileB.height } : null;
  const canvas = a && b ? compareSize(settings, a, b) : null;
  const issue = canvas && a && b ? compareIssue(canvas, settings.mode, a, b) : null;
  const result = completedId ? files[completedId] : undefined;

  async function exportCompare() {
    if (!ready || issue || exporting) return;
    setError(null);
    try {
      const exported = await runtime.exportCompare();
      setCompletedId(exported.id);
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code ?? "COMPARE_INVALID");
    }
  }

  const status = exporting ? (
    <Badge tone="accent" dot>
      Rendering…
    </Badge>
  ) : ready && canvas ? (
    <Badge tone="accent" dot>
      {COMPARE_MODES.find((m) => m.value === settings.mode)!.label} · {canvas.width} × {canvas.height}
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Choose two screenshots
    </Badge>
  );

  return (
    <WorkspaceShell
      tool="compare"
      status={status}
      exportAction={{ label: "Export comparison", onClick: exportCompare, disabled: !ready || !!issue, busy: exporting }}
      fileHint="Compare any two screenshots in this workspace — including results from other tools. Neither original is changed."
      inspectorTitle="Comparison settings"
      canvas={
        <>
          <h1 className="sr-only">{TOOLS.compare.seo.h1}</h1>
          {error && (
            <Notice tone="error" icon={<AlertTriangle />} title="Comparison didn’t finish" className="mb-4">
              {messageFor(error)}
            </Notice>
          )}
          {issue && (
            <Notice tone="warning" icon={<AlertTriangle />} title="Too large to render" className="mb-4">
              <span data-testid="compare-issue">
                {canvas!.width} × {canvas!.height} px is more than a browser can compose in one go. Try the Fit option, a different mode, or crop the screenshots in the Editor first.
              </span>
            </Notice>
          )}
          {exporting && (
            <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-accent-ink">Rendering the comparison at full resolution…</span>
                <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <Progress value={job.progress} label="Export progress" />
            </div>
          )}
          {order.length < 2 ? (
            <div data-testid="compare-needs-two">
              <EmptyState icon={<Images />} title="Drop or choose 2 screenshots to compare">
                Drop another screenshot anywhere in this workspace, paste it, or use Add in the Files panel.
              </EmptyState>
            </div>
          ) : ready ? (
            <CompareStage key={`${settings.a}|${settings.b}`} assetA={settings.a!} assetB={settings.b!} />
          ) : (
            <div data-testid="compare-needs-two">
              <EmptyState icon={<Images />} title="Choose two screenshots">
                Pick a before and an after in the settings panel.
              </EmptyState>
            </div>
          )}
        </>
      }
      inspector={<CompareInspector />}
      below={
        result && (
          <div className="mt-6" data-testid="compare-result">
            <Notice
              tone="success"
              icon={<Check />}
              title="Comparison ready"
              actions={
                <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}>
                  <Download /> Download again
                </Button>
              }
            >
              <span className="t-mono text-[12px]">
                {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
              </span>
              <span className="block">Saved to your downloads and added to this workspace as a new file. Both screenshots are unchanged.</span>
            </Notice>
            <ContinueWith tools={continuationsFor("compare")} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
