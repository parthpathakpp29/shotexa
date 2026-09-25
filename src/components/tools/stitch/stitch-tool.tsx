"use client";

/**
 * Smart Stitch — the Phase 1 vertical slice. Uses the validated Spike A engine (OpenCV
 * analysis in the Vision Worker, pair planner) chained over N screenshots, previews from
 * downscaled bitmaps, and the Spike B export pipeline (single canvas or tiled PNG stream).
 */
import { AlertTriangle, Check, Crosshair, Download, Loader2, Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, IconButton, Mono, Notice, Progress, Toolbar, ToolbarDivider } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { TOOLS } from "@/config/tools";
import { messageFor } from "@/core/runtime/messages";
import { downloadAsset } from "@/core/runtime/runtime";
import { pairKey } from "@/core/runtime/store";
import type { StitchPair } from "@/core/runtime/types";
import { planStitchChain } from "@/core/stitch/chain";
import { offsetRange } from "@/core/stitch/plan";
import { useElementWidth } from "@/lib/use-element-width";
import { StitchCanvas, type SeamChange } from "./stitch-canvas";
import { StitchInspector } from "./stitch-inspector";

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const NO_BANDS = { top: 0, bottom: 0 };
/** "Fit" never goes wider than a comfortable reading width (tall phone captures stay reviewable). */
const FIT_MAX_WIDTH = 560;

export function StitchTool({ landing }: { landing: React.ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <StitchWorkspace />;
}

type Summary = { tone: "accent" | "warning" | "neutral" | "error"; label: string; detail: string };

function summarise(pairs: (StitchPair | undefined)[]): Summary | null {
  if (!pairs.length || pairs.some((p) => !p || p.status === "pending" || p.status === "analysing")) return null;
  if (pairs.some((p) => p!.status === "failed")) return { tone: "error", label: "Couldn’t align", detail: "See the note below" };
  if (pairs.some((p) => p!.offset !== p!.autoOffset)) return { tone: "neutral", label: "Adjusted manually", detail: "Review the seam before exporting" };
  if (pairs.some((p) => !p!.matched)) return { tone: "warning", label: "No overlap found", detail: "Placed one after another" };
  if (pairs.every((p) => p!.confidence === "high")) return { tone: "accent", label: "High confidence", detail: "Screenshots aligned automatically" };
  return { tone: "warning", label: "Review recommended", detail: "Check the seam before exporting" };
}

function StitchWorkspace() {
  const { runtime, openPicker } = useWorkspaceContext();
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const pairMap = useWorkspace((s) => s.stitch.pairs);
  const { viewMode, activeJoin } = useWorkspace((s) => s.stitch);
  const setPairOffset = useWorkspace((s) => s.setPairOffset);
  const setActiveJoin = useWorkspace((s) => s.setActiveJoin);
  const setPair = useWorkspace((s) => s.setPair);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const exportJob = useWorkspace((s) => Object.values(s.jobs).find((j) => j.kind === "stitch-export" && j.status === "running"));
  const lastArtifact = useWorkspace((s) => (s.lastArtifactId ? s.files[s.lastArtifactId] : undefined));

  const originals = useMemo(() => order.map((id) => files[id]).filter((f) => f && f.kind === "original"), [order, files]);
  const joinKeys = useMemo(() => originals.slice(1).map((f, i) => pairKey(originals[i].id, f.id)), [originals]);
  const joinSig = joinKeys.join(",");
  const pairs = joinKeys.map((k) => pairMap[k]);
  const ready = pairs.length > 0 && pairs.every((p) => p?.status === "ready");
  const analysing = pairs.length > 0 && !ready && !pairs.some((p) => p?.status === "failed");
  const failed = pairs.find((p) => p?.status === "failed");
  const summary = summarise(pairs);
  const versions = originals.map((f) => f.previewVersion).join(",");
  const maxOffsets = originals.slice(0, -1).map((f) => offsetRange(f).max);
  const join = Math.min(activeJoin, Math.max(0, pairs.length - 1));

  // Analyse every adjacent pair that has no result yet (first run lazily loads the engine).
  useEffect(() => {
    if (joinSig) void runtime.analyseStitch();
  }, [runtime, joinSig]);

  const plan = useMemo(() => {
    if (originals.length < 2) return null;
    return planStitchChain(
      originals.map((f) => ({ width: f.width, height: f.height })),
      pairs.map((p, i) => (p?.status === "ready" ? { offsetY: p.offset, bands: p.bands } : { offsetY: originals[i].height, bands: NO_BANDS })),
    );
    // pairs is derived from pairMap + joinKeys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originals, pairMap, joinSig]);

  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fitWidth = plan ? Math.min(boxWidth, plan.width, FIT_MAX_WIDTH) : 0;
  const cssWidth = plan ? (zoom === "fit" ? fitWidth : Math.round(plan.width * zoom)) : 0;
  const zoomPct = plan && plan.width ? Math.round((cssWidth / plan.width) * 100) : 100;
  const stepZoom = (dir: 1 | -1) => {
    const cur = cssWidth / (plan?.width || 1);
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) : [...ZOOMS].reverse().find((z) => z < cur - 0.001);
    if (next) setZoom(next);
  };
  const centerSeam = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el || !plan || plan.seams[join] === undefined) return;
    el.scrollTo({ top: Math.max(0, plan.seams[join] * (cssWidth / plan.width) - el.clientHeight / 2 + 24), behavior });
  };

  // Bring the join into view once the automatic alignment is ready.
  const centred = useRef(false);
  useEffect(() => {
    if (!ready) {
      centred.current = false;
      return;
    }
    if (centred.current || !cssWidth) return;
    centred.current = true;
    requestAnimationFrame(() => centerSeam("instant"));
  });

  const [exportError, setExportError] = useState<string | null>(null);
  const exporting = !!exportJob;
  const doExport = async () => {
    setExportError(null);
    try {
      const r = await runtime.exportStitch();
      downloadAsset(runtime, r.id);
    } catch (e) {
      setExportError((e as { code?: string }).code ?? "INTERNAL");
    }
  };
  const reanalyse = () => {
    for (const p of pairs) if (p) setPair({ ...p, status: "pending" });
    void runtime.analyseStitch();
  };
  const onSeamChange = (j: number, c: SeamChange) => {
    const p = pairs[j];
    if (p) setPairOffset(p.key, c.offset, { coalesce: c.coalesce });
  };

  const currentIds = originals.map((f) => f.id).join(",");
  const result = lastArtifact && lastArtifact.producedBy === "stitch" && lastArtifact.derivedFrom?.join(",") === currentIds ? lastArtifact : undefined;

  const status = exporting ? (
    <Badge tone="accent" dot>
      Exporting…
    </Badge>
  ) : analysing ? (
    <Badge tone="neutral" dot>
      Aligning…
    </Badge>
  ) : ready ? (
    <Badge tone="neutral" dot>
      Canvas ready
    </Badge>
  ) : undefined;

  const canvas =
    originals.length < 2 ? (
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
          Smart Stitch joins two or more overlapping screenshots — for example a long chat or web page captured in parts. Add the next part to continue.
        </EmptyState>
      </div>
    ) : (
      <>
        <h1 className="sr-only">{TOOLS.stitch.seo.h1}</h1>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {summary ? (
            <Badge tone={summary.tone === "error" ? "error" : summary.tone} dot>
              <span data-testid="stitch-confidence">
                {summary.label} · {summary.detail}
              </span>
            </Badge>
          ) : (
            <Badge tone="neutral">
              <Loader2 aria-hidden className="size-3 animate-spin" /> Finding where your screenshots overlap…
            </Badge>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Toolbar aria-label="Canvas">
            <IconButton label="Undo" onClick={undo} disabled={!canUndo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" onClick={redo} disabled={!canRedo}>
              <Redo2 />
            </IconButton>
            <ToolbarDivider />
            <IconButton label="Zoom out" onClick={() => stepZoom(-1)}>
              <Minus />
            </IconButton>
            <Mono className="w-12 text-center text-[13px] text-ink" aria-live="polite">
              {zoomPct}%
            </Mono>
            <IconButton label="Zoom in" onClick={() => stepZoom(1)}>
              <Plus />
            </IconButton>
            <IconButton label="Fit" active={zoom === "fit"} onClick={() => setZoom("fit")}>
              <Maximize />
            </IconButton>
            <ToolbarDivider />
            <Button variant="ghost" size="sm" onClick={() => centerSeam()} aria-label="Center seam" className="px-2.5 font-mono text-[12px] max-md:h-11">
              <Crosshair /> <span className="max-xl:hidden">Center seam</span>
            </Button>
          </Toolbar>
        </div>

        {failed && (
          <Notice tone="warning" icon={<AlertTriangle />} title="These screenshots can’t be stitched as they are" className="mb-3">
            {messageFor(failed.error ?? "INTERNAL")}
          </Notice>
        )}
        {summary?.label === "No overlap found" && (
          <Notice tone="warning" icon={<AlertTriangle />} className="mb-3">
            We couldn’t find a shared area, so the screenshots are placed one after another. If they should overlap, check their order or use <strong className="font-medium text-ink">Adjust manually</strong>.
          </Notice>
        )}
        {exportError && (
          <Notice tone="error" icon={<AlertTriangle />} title="Export didn’t finish" className="mb-3">
            {messageFor(exportError)}
          </Notice>
        )}

        <div className="rounded-lg border border-line bg-surface p-2 shadow-xs sm:p-3">
          <div ref={scrollRef} className="relative max-h-[calc(100dvh-15rem)] min-h-[320px] overflow-auto rounded-md bg-surface-2 p-3 sm:p-5 max-md:max-h-[calc(100dvh-13rem)]">
            <div ref={boxRef} className="w-full">
              {plan && cssWidth > 0 && (
                <StitchCanvas
                  plan={plan}
                  images={originals}
                  versions={versions}
                  cssWidth={cssWidth}
                  viewMode={viewMode}
                  activeJoin={join}
                  offsets={pairs.map((p, i) => p?.offset ?? originals[i].height)}
                  offsetMax={maxOffsets}
                  interactive={ready}
                  onSeamChange={onSeamChange}
                  onSelectJoin={setActiveJoin}
                  dimmed={analysing || exporting}
                />
              )}
            </div>
            {(analysing || exporting) && (
              <div className="pointer-events-none sticky bottom-3 mx-auto mt-[-4.5rem] w-full max-w-xs rounded-md border border-line bg-surface/95 p-3 shadow-md">
                <p className="mb-2 text-sm text-ink">{exporting ? "Creating the full-resolution image…" : "Finding where your screenshots overlap…"}</p>
                <Progress value={exporting ? (exportJob?.progress ?? null) : null} label={exporting ? "Export progress" : "Alignment progress"} />
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="mt-6" data-testid="stitch-result">
            <Notice
              tone="success"
              icon={<Check />}
              title="Stitched image ready"
              actions={
                <Button variant="secondary" onClick={() => downloadAsset(runtime, result.id)}>
                  <Download /> Download again
                </Button>
              }
            >
              <Mono className="text-[12.5px]">
                {result.name} · {result.width} × {result.height} px · {formatBytes(result.bytes)}
              </Mono>
              <span className="block">Saved to your downloads and kept in this workspace as a new file.</span>
            </Notice>
            <ContinueWith tools={TOOLS.stitch.continueWith} fileId={result.id} />
          </div>
        )}
      </>
    );

  return (
    <WorkspaceShell
      tool="stitch"
      status={status}
      exportAction={originals.length >= 2 ? { label: "Export stitched image", onClick: doExport, disabled: !ready, busy: exporting } : undefined}
      fileHint="Drag or use the arrows to change the order. Smart Stitch finds the overlaps automatically."
      inspectorTitle="Alignment"
      canvas={canvas}
      inspector={
        originals.length >= 2 ? (
          <StitchInspector pairs={pairs.filter((p): p is StitchPair => !!p)} maxOffsets={maxOffsets} plan={ready ? plan : null} ready={ready} onReanalyse={reanalyse} />
        ) : (
          <p className="t-body-sm text-ink-2">Alignment settings appear once there are two screenshots.</p>
        )
      }
    />
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

