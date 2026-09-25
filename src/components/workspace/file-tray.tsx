"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { BitmapCanvas } from "./bitmap-canvas";
import { useDropTarget, useWorkspace, useWorkspaceContext } from "./workspace-provider";

/**
 * Left column: the screenshots in workspace order. Reorder by drag OR the move buttons
 * (drag is never the only way — architecture §47). Selection drives the preview.
 */
export function FileTray({ hint, className, onAfterSelect }: { hint?: string; className?: string; onAfterSelect?: () => void }) {
  const { runtime, openPicker } = useWorkspaceContext();
  const order = useWorkspace((s) => s.order);
  const files = useWorkspace((s) => s.files);
  const selectedId = useWorkspace((s) => s.selectedId);
  const reorder = useWorkspace((s) => s.reorder);
  const select = useWorkspace((s) => s.select);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const drop = useDropTarget();
  const small = "inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30 max-md:size-11";

  return (
    <section aria-label="Screenshots" className={cn("flex min-h-0 flex-col", className)} {...drop.props}>
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <h2 className="flex items-center gap-2 font-display text-xl">
          Screenshots <span className="t-mono inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-line bg-surface-2 px-1.5 text-[12px] text-ink-2">{order.length}</span>
        </h2>
        <button type="button" onClick={openPicker} className="inline-flex min-h-9 items-center gap-1 rounded-sm px-1.5 text-sm font-medium text-accent-ink hover:bg-accent-soft max-md:min-h-11">
          <Plus aria-hidden className="size-4" /> Add
        </button>
      </div>
      <ol className="-mx-1 mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1" data-testid="file-list">
        {order.map((id, i) => {
          const f = files[id];
          if (!f) return null;
          const selected = id === selectedId;
          return (
            <li
              key={id}
              draggable
              data-testid="file-item"
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                if (dragFrom !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                reorder(dragFrom, i);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={cn(
                "shrink-0 overflow-hidden rounded-md border bg-surface-3 transition-[border-color,box-shadow]",
                selected ? "border-accent-line ring-1 ring-accent-line" : "border-line hover:border-line-strong",
                dragFrom === i && "opacity-50",
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${i + 1}. ${f.name}, ${f.width} by ${f.height} pixels${f.kind === "artifact" ? ", Shotexa result" : ""}`}
                onClick={() => {
                  select(id);
                  onAfterSelect?.();
                }}
                className="relative block h-24 w-full overflow-hidden border-b border-line bg-surface-2 text-left"
              >
                <BitmapCanvas id={id} width={240} label="" className="pointer-events-none" />
                <span className="t-mono absolute left-2 top-2 inline-flex size-6 items-center justify-center rounded-xs bg-dark text-[11px] text-white">{i + 1}</span>
                <span className="t-mono absolute bottom-2 right-2 rounded-xs bg-dark/85 px-1.5 py-0.5 text-[10.5px] text-white">
                  {f.width} × {f.height}
                </span>
                {f.kind === "artifact" && <span className="t-micro absolute right-2 top-2 rounded-xs bg-accent px-1.5 py-0.5 text-[9.5px] text-white">Result</span>}
              </button>
              <div className="flex items-center gap-1 py-1.5 pl-2 pr-1">
                <GripVertical aria-hidden className="size-3.5 shrink-0 cursor-grab text-ink-3 max-md:hidden" />
                <span className="t-mono min-w-0 flex-1 truncate text-[12px] text-ink" title={f.name}>
                  {f.name}
                </span>
                <button type="button" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => reorder(i, i - 1)} className={small}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move ${f.name} down`} disabled={i === order.length - 1} onClick={() => reorder(i, i + 1)} className={small}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => runtime.removeFile(id)} className={cn(small, "hover:bg-error-soft hover:text-error")}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
        <li className="shrink-0">
          <button
            type="button"
            onClick={openPicker}
            className={cn("flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent-ink", drop.over && "border-accent bg-accent-soft text-accent-ink")}
          >
            <Plus aria-hidden className="size-4" /> Add screenshot
          </button>
        </li>
      </ol>
      {hint && <p className="t-body-sm mt-4 border-t border-line pt-3 text-ink-3">{hint}</p>}
    </section>
  );
}
