"use client";

/**
 * Smart Stitch preview. Draws the chain plan from the downscaled preview bitmaps only (the
 * full-resolution composition happens at export). The active join has a draggable,
 * keyboard-operable "Seam line" handle; Overlay/Difference show how the two screenshots
 * line up inside their shared region (difference turns black where they match).
 */
import { useEffect, useRef } from "react";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import type { ChainPlan } from "@/core/stitch/chain";
import type { StitchViewMode, WorkspaceFile } from "@/core/runtime/types";
import { cn } from "@/lib/cn";

/** Canvas backing-store limits (Safari caps canvas area at ~16.7 M px). */
const MAX_BACKING_WIDTH = 2560;
const MAX_BACKING_AREA = 16_000_000;
const MAX_BACKING_SIDE = 32_000;

export interface SeamChange {
  offset: number;
  /** Merge with the previous edit into one undo step (drags, held keys). */
  coalesce: boolean;
}

export function StitchCanvas({
  plan,
  images,
  versions,
  cssWidth,
  viewMode,
  activeJoin,
  offsets,
  offsetMax,
  interactive,
  onSeamChange,
  onSelectJoin,
  dimmed,
}: {
  plan: ChainPlan;
  images: WorkspaceFile[];
  /** Changes whenever a preview bitmap changes (redraw trigger). */
  versions: string;
  cssWidth: number;
  viewMode: StitchViewMode;
  activeJoin: number;
  offsets: number[];
  offsetMax: number[];
  interactive: boolean;
  onSeamChange(join: number, c: SeamChange): void;
  onSelectJoin(join: number): void;
  dimmed?: boolean;
}) {
  const { runtime } = useWorkspaceContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssScale = plan.width ? cssWidth / plan.width : 0;
  const cssHeight = Math.round(plan.height * cssScale);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plan.width || !cssWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let bw = Math.min(MAX_BACKING_WIDTH, Math.round(cssWidth * dpr));
    let bh = Math.round((plan.height * bw) / plan.width);
    const fit = Math.min(1, Math.sqrt(MAX_BACKING_AREA / (bw * bh)), MAX_BACKING_SIDE / bh);
    bw = Math.max(1, Math.floor(bw * fit));
    bh = Math.max(1, Math.floor(bh * fit));
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = bw / plan.width;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bw, bh);
    ctx.imageSmoothingQuality = "high";

    const draw = (i: number, sy: number, h: number, dy: number) => {
      const f = images[i];
      const bm = f && runtime.registry.preview(f.id);
      if (!bm || h <= 0) return;
      const pk = bm.width / f.width;
      ctx.drawImage(bm, 0, sy * pk, bm.width, h * pk, 0, dy * k, f.width * k, h * k);
    };

    for (const seg of plan.segments) draw(seg.source, seg.sy, seg.height, seg.dy);

    if (viewMode !== "normal" && images[activeJoin + 1]) {
      const a = images[activeJoin];
      const b = images[activeJoin + 1];
      const topA = plan.tops[activeJoin];
      const topB = plan.tops[activeJoin + 1];
      const end = Math.min(topA + a.height, topB + b.height);
      if (end > topB) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, topB * k, bw, (end - topB) * k);
        ctx.clip();
        draw(activeJoin, 0, a.height, topA);
        if (viewMode === "overlay") ctx.globalAlpha = 0.5;
        else ctx.globalCompositeOperation = "difference";
        draw(activeJoin + 1, 0, b.height, topB);
        ctx.restore();
      }
    }
    return () => {
      // Free the backing store eagerly when the plan/zoom changes (large canvases).
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [runtime, plan, images, versions, cssWidth, viewMode, activeJoin]);

  return (
    <div className="relative mx-auto" style={{ width: cssWidth, height: cssHeight }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Stitched preview, ${plan.width} by ${plan.height} pixels`}
        className={cn("block rounded-xs shadow-sm transition-opacity", dimmed && "opacity-45")}
        style={{ width: cssWidth, height: cssHeight }}
        data-testid="stitch-canvas"
      />
      {interactive &&
        plan.seams.map((seam, j) => (
          <SeamHandle
            key={j}
            top={seam * cssScale}
            join={j}
            active={j === activeJoin}
            offset={offsets[j]}
            max={offsetMax[j]}
            cssScale={cssScale}
            multi={plan.seams.length > 1}
            onChange={(c) => onSeamChange(j, c)}
            onSelect={() => onSelectJoin(j)}
          />
        ))}
    </div>
  );
}

function SeamHandle({ top, join, active, offset, max, cssScale, multi, onChange, onSelect }: { top: number; join: number; active: boolean; offset: number; max: number; cssScale: number; multi: boolean; onChange(c: SeamChange): void; onSelect(): void }) {
  const drag = useRef<{ y: number; offset: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(1, Math.round(v)));
  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ top }}>
      <div className={cn("absolute inset-x-0 -top-px h-0.5", active ? "bg-accent" : "bg-accent/45")} />
      <button
        type="button"
        role="slider"
        aria-label={multi ? `Seam line between screenshots ${join + 1} and ${join + 2}` : "Seam line"}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={offset}
        aria-valuetext={`Join position ${offset} pixels`}
        data-testid={`seam-${join}`}
        onFocus={onSelect}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowDown" ? 1 : -1);
          onChange({ offset: clamp(offset + step), coalesce: e.repeat });
        }}
        onPointerDown={(e) => {
          onSelect();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, offset };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !cssScale) return;
          // Dragging moves the lower screenshot with the pointer.
          onChange({ offset: clamp(d.offset + (e.clientY - d.y) / cssScale), coalesce: true });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className={cn(
          "pointer-events-auto absolute left-1/2 top-0 inline-flex h-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none select-none items-center gap-2 whitespace-nowrap rounded-full border bg-surface px-3.5 font-mono text-[12px] shadow-md transition-colors max-md:h-11",
          active ? "border-accent-line text-ink" : "border-line text-ink-2",
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        Seam line
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="block h-px w-3 bg-ink-3" />
          <span className="block h-px w-3 bg-ink-3" />
        </span>
      </button>
    </div>
  );
}
