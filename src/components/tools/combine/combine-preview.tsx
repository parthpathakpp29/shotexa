"use client";

import { useEffect, useRef } from "react";
import { useReleasingCanvas } from "@/lib/use-canvas-ref";
import type { CombinePlan } from "@/core/combine/types";
import { useElementWidth } from "@/lib/use-element-width";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";

/** Downscaled canvas preview. Full-resolution pixels are decoded only during export. */
export function CombinePreview({ inputIds, plan }: { inputIds: string[]; plan: CombinePlan }) {
  const { runtime } = useWorkspaceContext();
  const canvas = useRef<HTMLCanvasElement>(null);
  const attachCanvas = useReleasingCanvas(canvas);
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>();
  const cssWidth = Math.max(1, Math.min(boxWidth || 560, plan.width, 760));
  const scale = cssWidth / plan.width;
  const cssHeight = Math.max(1, Math.round(plan.height * scale));

  useEffect(() => {
    const target = canvas.current;
    if (!target || !boxWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.max(1, Math.round(cssWidth * dpr));
    target.height = Math.max(1, Math.round(cssHeight * dpr));
    target.style.width = `${cssWidth}px`;
    target.style.height = `${cssHeight}px`;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, plan.width, plan.height);
    if (plan.background) {
      ctx.fillStyle = plan.background;
      ctx.fillRect(0, 0, plan.width, plan.height);
    }
    for (const placement of plan.placements) {
      const bitmap = runtime.registry.preview(inputIds[placement.source]);
      if (!bitmap) continue;
      ctx.drawImage(bitmap, placement.x, placement.y, placement.width, placement.height);
    }
  }, [runtime, inputIds, plan, boxWidth, cssWidth, cssHeight, scale]);

  return (
    <section className="rounded-lg border border-line bg-surface p-2 shadow-xs sm:p-3" data-testid="combine-preview">
      <div ref={boxRef} className="max-h-[calc(100dvh-15rem)] min-h-[320px] overflow-auto rounded-md border border-line bg-surface-2 p-3 sm:p-5 max-md:max-h-[calc(100dvh-13rem)]">
        <div className="bg-checker mx-auto w-fit rounded-xs shadow-sm"><canvas ref={attachCanvas} aria-label="Combined screenshot preview" /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="t-mono text-[12px] text-ink-2">{plan.width} × {plan.height} px · {inputIds.length} screenshots</p>
        <p className="text-xs text-ink-3">Preview uses workspace thumbnails. Export uses the original files.</p>
      </div>
    </section>
  );
}
