"use client";

import { AlertTriangle, Check, Download, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider } from "@/components/ui/controls";
import { Badge, EmptyState, FieldLabel, InspectorSection, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { OverlapBanner } from "@/components/workspace/overlap-banner";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor } from "@/config/tools";
import { planCombine } from "@/core/combine/layout";
import { selectCombineInputs } from "@/core/combine/inputs";
import type { CombineAlignment, CombineBackground, CombineGridColumns, CombineLayout, CombineSizing } from "@/core/combine/types";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { formatBytes } from "@/components/tools/stitch/stitch-tool";
import type { WorkspaceFile } from "@/core/runtime/types";
import { CombinePreview } from "./combine-preview";

export function CombineTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((state) => state.order.length);
  return count === 0 ? <>{landing}</> : <CombineWorkspace />;
}

function CombineWorkspace() {
  const { runtime, openPicker } = useWorkspaceContext();
  const order = useWorkspace((state) => state.order);
  const files = useWorkspace((state) => state.files);
  const selectedId = useWorkspace((state) => state.selectedId);
  const settings = useWorkspace((state) => state.combine);
  const setSettings = useWorkspace((state) => state.setCombineSettings);
  const exportSettings = useWorkspace((state) => state.exportSettings);
  const setExportSettings = useWorkspace((state) => state.setExportSettings);
  const job = useWorkspace((state) => Object.values(state.jobs).find((item) => item.kind === "combine-export" && item.status === "running"));
  const lastArtifact = useWorkspace((state) => state.lastArtifactId ? state.files[state.lastArtifactId] : undefined);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const inputIds = useMemo(() => selectCombineInputs(order, files, selectedId), [order, files, selectedId]);
  const inputs = inputIds.map((id) => files[id]).filter((file): file is WorkspaceFile => !!file);
  const plan = useMemo(() => inputs.length >= 2 ? planCombine(inputs.map((file) => ({ width: file.width, height: file.height })), settings) : null, [inputs, settings]);
  const exporting = !!job;
  // `addArtifact` intentionally selects the new file. Keep completion separate from the
  // next Combine input set, otherwise the result immediately replaces its own sources.
  const result = (completedId ? files[completedId] : undefined) ?? (lastArtifact?.producedBy === "combine" ? lastArtifact : undefined);

  const exportImage = async () => {
    if (!plan || exporting) return;
    try {
      const result = await runtime.exportCombine(inputIds, plan);
      setCompletedId(result.id);
      downloadAsset(runtime, result.id);
    } catch {
      // The workspace job keeps the controlled error code for the UI.
    }
  };
  const error = useWorkspace((state) => Object.values(state.jobs).find((item) => item.kind === "combine-export" && item.status === "failed")?.error);
  const sizeOptions = settings.layout === "horizontal"
    ? [{ value: "original", label: "Original" }, { value: "match-height", label: "Match height" }]
    : [{ value: "original", label: "Original" }, { value: "match-width", label: "Match width" }];

  const canvas = !plan ? (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
      <EmptyState
        icon={<Plus />}
        title="Add one more screenshot"
        action={
          <Button variant="primary" onClick={openPicker}>
            Add screenshot
          </Button>
        }
      >
        Combine places two or more screenshots in a vertical stack, a horizontal row or a simple grid.
      </EmptyState>
    </div>
  ) : (
    <>
      <h1 className="sr-only">Combine Screenshots Into One Image</h1>
      <OverlapBanner className="mb-4" />
      {error && (
        <Notice tone="error" icon={<AlertTriangle />} title="Combine didn’t finish" className="mb-4">
          {messageFor(error)}
        </Notice>
      )}
      {exporting && (
        <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-accent-ink">Creating the full-resolution image…</span>
            <span className="t-mono text-accent-ink">{job.progress === null ? "" : `${Math.round(job.progress * 100)}%`}</span>
          </div>
          <Progress value={job.progress} label="Combine progress" />
        </div>
      )}
      <CombinePreview inputIds={inputIds} plan={plan} />
    </>
  );

  const inspector = (
    <div data-testid="combine-controls">
      <InspectorSection title="Layout">
        <FieldLabel>ARRANGEMENT</FieldLabel>
        <SegmentedControl<CombineLayout>
          label="Combine layout"
          value={settings.layout}
          onChange={(layout) => setSettings({ layout })}
          options={[
            { value: "vertical", label: "Vertical" },
            { value: "horizontal", label: "Horizontal" },
            { value: "grid", label: "Grid" },
          ]}
        />
        <div className="mt-4">
          <FieldLabel value={`${settings.gap} px`}>SPACING</FieldLabel>
          <Slider label="Spacing" value={settings.gap} min={0} max={64} onChange={(gap) => setSettings({ gap })} />
        </div>
      </InspectorSection>
      <InspectorSection title="Sizing & alignment">
        <FieldLabel>SIZE</FieldLabel>
        <SegmentedControl<CombineSizing>
          label="Image sizing"
          value={settings.sizing}
          onChange={(sizing) => setSettings({ sizing })}
          options={sizeOptions as { value: CombineSizing; label: string }[]}
        />
        <div className="mt-4">
          <FieldLabel>ALIGNMENT</FieldLabel>
          <SegmentedControl<CombineAlignment>
            label="Image alignment"
            value={settings.alignment}
            onChange={(alignment) => setSettings({ alignment })}
            options={[
              { value: "start", label: "Start" },
              { value: "center", label: "Center" },
              { value: "end", label: "End" },
            ]}
          />
        </div>
        {settings.layout === "grid" && (
          <div className="mt-4">
            <FieldLabel>COLUMNS</FieldLabel>
            <SegmentedControl<"auto" | "2" | "3" | "4">
              label="Grid columns"
              value={String(settings.gridColumns) as "auto" | "2" | "3" | "4"}
              onChange={(value) => setSettings({ gridColumns: value === "auto" ? "auto" : (Number(value) as Exclude<CombineGridColumns, "auto">) })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4" },
              ]}
            />
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-ink-3">Images keep their original proportions. Match size scales uniformly; it never stretches a screenshot.</p>
      </InspectorSection>
      <InspectorSection title="Background">
        <SegmentedControl<CombineBackground>
          label="Background"
          value={settings.background}
          onChange={(background) => setSettings({ background })}
          options={[
            { value: "transparent", label: "Clear" },
            { value: "white", label: "White" },
            { value: "cream", label: "Cream" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="Output">
        <Disclosure title="OUTPUT OPTIONS">
          <FieldLabel>FORMAT</FieldLabel>
          <SegmentedControl<"png" | "jpeg" | "webp">
            label="Image export format"
            value={exportSettings.format}
            onChange={(format) => setExportSettings({ format })}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" },
              { value: "webp", label: "WebP" },
            ]}
          />
          {exportSettings.format !== "png" && (
            <div className="mt-4">
              <FieldLabel value={`${Math.round(exportSettings.quality * 100)}%`}>QUALITY</FieldLabel>
              <Slider label="Image quality" value={exportSettings.quality} min={0.7} max={1} step={0.02} onChange={(quality) => setExportSettings({ quality })} />
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-ink-3">PNG is the lossless default. Transparent backgrounds become white in JPEG.</p>
        </Disclosure>
      </InspectorSection>
    </div>
  );

  const below = result && (
    <div className="mt-6" data-testid="combine-result">
      <Notice
        tone="success"
        icon={<Check />}
        title="Combined image ready"
        actions={
          <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}>
            <Download /> Download again
          </Button>
        }
      >
        <span className="t-mono text-[12px]">
          {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
        </span>
        <span className="block">Saved to your downloads and kept in this workspace as a new file.</span>
      </Notice>
      <ContinueWith tools={continuationsFor("combine")} fileId={result.id} />
    </div>
  );

  return (
    <WorkspaceShell
      tool="combine"
      status={
        exporting ? (
          <Badge tone="accent" dot>
            Combining…
          </Badge>
        ) : plan ? (
          <Badge tone="success" dot>
            Preview ready
          </Badge>
        ) : undefined
      }
      exportAction={plan ? { label: "Export combined image", onClick: exportImage, disabled: exporting, busy: exporting } : undefined}
      fileHint="Drag or use the arrows to change the combined-image order. Select a Shotexa result to combine it with files not used to create it."
      inspectorTitle="Combine settings"
      canvas={canvas}
      inspector={inspector}
      below={below}
    />
  );
}
