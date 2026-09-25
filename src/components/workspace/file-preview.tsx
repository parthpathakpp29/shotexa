"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/primitives";
import { SITE } from "@/config/site";
import { useElementWidth } from "@/lib/use-element-width";
import { BitmapCanvas } from "./bitmap-canvas";
import { useWorkspace, useWorkspaceContext } from "./workspace-provider";

type Zoom = "fit" | "0.5" | "1" | "2";
/** "Fit" shows the whole screenshot: full width, but no taller than this. */
const FIT_HEIGHT = 640;

/** Preview of the selected screenshot (connected workspace and not-yet-built tools). */
export function FilePreview({ className }: { className?: string }) {
  const { openPicker } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const cssWidth = !file ? 0 : zoom === "fit" ? Math.floor(Math.min(width, file.width, (FIT_HEIGHT * file.width) / file.height)) : Math.round(file.width * Number(zoom));

  return (
    <section aria-label="Preview" className={className}>
      <div className="rounded-lg border border-line bg-surface p-3 shadow-xs sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SegmentedControl<Zoom>
            label="Zoom"
            size="sm"
            value={zoom}
            onChange={setZoom}
            className="w-64"
            options={[
              { value: "fit", label: "Fit" },
              { value: "0.5", label: "50%" },
              { value: "1", label: "100%" },
              { value: "2", label: "200%" },
            ]}
          />
          {file && (
            <p className="t-mono truncate text-[12px] text-ink-3">
              {file.name} · {file.width} × {file.height} px
            </p>
          )}
        </div>
        <div ref={ref} className="max-h-[70dvh] overflow-auto rounded-md border border-line bg-surface-2 p-3 sm:p-5">
          {selectedId && file && width > 0 ? (
            <div className="mx-auto" style={{ width: Math.max(1, cssWidth) }}>
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
