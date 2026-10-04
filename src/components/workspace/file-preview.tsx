"use client";

import { ImageOff } from "lucide-react";
import { useCallback, useRef, useState, type SetStateAction } from "react";
import { ViewportToolbar } from "@/components/ui/viewport";
import { EmptyState } from "@/components/ui/primitives";
import type { ViewportZoom } from "@/core/viewport/viewport";
import { SITE } from "@/config/site";
import { formatBytes, imageTypeLabel } from "@/lib/format-bytes";
import { cn } from "@/lib/cn";
import { useElementWidth } from "@/lib/use-element-width";
import { useViewportInteraction } from "@/lib/use-viewport";
import { BitmapCanvas } from "./bitmap-canvas";
import { useWorkspace, useWorkspaceContext } from "./workspace-provider";

/** "Fit" shows the whole screenshot: full width, but no taller than this. */
const FIT_HEIGHT = 640;

/** Preview of the selected screenshot (connected workspace and not-yet-built tools). */
export function FilePreview({ className }: { className?: string }) {
  const { openPicker } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const [view, setView] = useState<{ assetId: string | null; zoom: ViewportZoom }>({ assetId: selectedId, zoom: "fit" });
  const zoom = view.assetId === selectedId ? view.zoom : "fit";
  const setZoom = useCallback((next: SetStateAction<ViewportZoom>) => {
    setView((current) => {
      const currentZoom = current.assetId === selectedId ? current.zoom : "fit";
      return { assetId: selectedId, zoom: typeof next === "function" ? next(currentZoom) : next };
    });
  }, [selectedId]);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fitWidth = !file ? 0 : Math.floor(Math.min(width, file.width, (FIT_HEIGHT * file.width) / file.height));
  const fitScale = file && fitWidth ? fitWidth / file.width : 1;
  const cssWidth = !file ? 0 : zoom === "fit" ? fitWidth : Math.round(file.width * zoom);
  const viewport = useViewportInteraction({ scrollRef, contentRef, zoom, setZoom, fitScale, allowDragPan: true, allowTouchPan: true });

  return (
    <section aria-label="Preview" className={className}>
      <div className="rounded-lg border border-line bg-surface p-3 shadow-xs sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <ViewportToolbar zoom={zoom} fitScale={fitScale} onFit={viewport.fit} onActual={viewport.actual} onZoomIn={viewport.zoomIn} onZoomOut={viewport.zoomOut} label="Preview view" />
          {file && (
            <p className="t-mono truncate text-[12px] text-ink-3">
              {file.name} · {file.width} × {file.height} px · {imageTypeLabel(file.type)} · {formatBytes(file.bytes)}
            </p>
          )}
        </div>
        <div ref={(element) => { ref(element); scrollRef.current = element; }} className={cn("max-h-[70dvh] overflow-auto rounded-md border border-line bg-surface-2 p-3 sm:p-5", (viewport.spaceHeld || viewport.isPanning) && "cursor-grab", viewport.isPanning && "cursor-grabbing")}>
          {selectedId && file && width > 0 ? (
            <div ref={contentRef} data-viewport-pan className="mx-auto" style={{ width: Math.max(1, cssWidth) }}>
              <BitmapCanvas id={selectedId} width={cssWidth} label={`Preview of ${file.name}`} className="rounded-xs shadow-sm" />
            </div>
          ) : (
            <EmptyState icon={<ImageOff />} title="No screenshot selected" />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="t-mono flex items-center gap-2 text-[12px] text-ink-2">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {SITE.trustLine}
          </p>
          <button type="button" onClick={openPicker} className="min-h-9 text-sm font-medium text-accent-ink hover:underline max-md:min-h-11">
            Add more screenshots
          </button>
        </div>
      </div>
    </section>
  );
}
