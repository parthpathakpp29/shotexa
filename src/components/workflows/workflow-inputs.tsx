"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ImagePlus, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { inputRequirement } from "@/config/workflow-guides";
import type { WorkflowRecipe } from "@/core/workflows/types";
import { cn } from "@/lib/cn";
import { formatBytes, imageTypeLabel } from "@/lib/format-bytes";

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
type Intent = { kind: "add" } | { kind: "replace"; id: string };

/** What a screenshot's position means in this workflow ("Before", "Main image"…). */
export function inputRole(recipe: WorkflowRecipe, index: number): string | null {
  if (recipe.id === "visual-qa-report") return index === 0 ? "Before" : index === 1 ? "After" : null;
  if (recipe.id === "product-screenshot") return index === 0 ? "Main image" : "Also shown";
  if (recipe.id === "documentation-pack") return `Page ${index + 1}`;
  return null;
}

/**
 * The screenshots a workflow uses, with explicit Remove / Change / Add / reorder controls.
 * Removing here only takes a screenshot out of this workflow — it stays in the workspace,
 * where it can be added back or deleted on purpose.
 */
export function WorkflowInputs({
  recipe,
  inputIds,
  onChange,
  compact = false,
  reorderable = false,
  locked = false,
  note,
}: {
  recipe: WorkflowRecipe;
  inputIds: string[];
  onChange(next: string[]): void;
  /** Run-time variant: smaller thumbnails, no workspace list. */
  compact?: boolean;
  reorderable?: boolean;
  /** A step is executing: inputs cannot change until it finishes. */
  locked?: boolean;
  note?: string;
}) {
  const { runtime, addFiles, loadSample } = useWorkspaceContext();
  const files = useWorkspace((state) => state.files);
  const order = useWorkspace((state) => state.order);
  const pickerRef = useRef<HTMLInputElement>(null);
  const intent = useRef<Intent>({ kind: "add" });
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const max = recipe.input.max;
  const single = max === 1;
  const full = max !== undefined && inputIds.length >= max;
  const others = order.filter((id) => !inputIds.includes(id) && files[id]);

  function open(next: Intent) {
    intent.current = next;
    pickerRef.current?.click();
  }

  function apply(added: string[]) {
    if (!added.length) return;
    const current = intent.current;
    intent.current = { kind: "add" };
    if (current.kind === "replace") {
      const index = inputIds.indexOf(current.id);
      const next = [...inputIds];
      next.splice(index < 0 ? next.length : index, index < 0 ? 0 : 1, added[0]);
      onChange(next);
      return;
    }
    const room = max === undefined ? added.length : Math.max(0, max - inputIds.length);
    // A single-screenshot workflow that already has one: the new file replaces it.
    if (!room && single) onChange([added[0]]);
    else if (room) onChange([...inputIds, ...added.slice(0, room)]);
  }

  async function ingest(list: File[], source: "picker" | "drop") {
    if (!list.length) return;
    setBusy(true);
    try {
      apply(await addFiles(list, source));
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= inputIds.length) return;
    const next = [...inputIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files") || locked) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files") || locked) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(false);
      intent.current = { kind: "add" };
      void ingest(Array.from(event.dataTransfer.files), "drop");
    },
  };

  const control = "inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:pointer-events-none disabled:opacity-35 max-md:size-11 [&_svg]:size-4";

  return (
    <section aria-labelledby="workflow-inputs-title" data-testid="workflow-inputs" className={cn("rounded-xl border border-line bg-surface shadow-xs", compact ? "p-3" : "p-5", over && "border-accent bg-accent-soft")} {...dropProps}>
      <input
        ref={pickerRef}
        type="file"
        accept={ACCEPT}
        multiple={!single}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="workflow-file-input"
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []);
          event.target.value = "";
          void ingest(list, "picker");
        }}
      />
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="workflow-inputs-title" className={cn("font-display", compact ? "text-lg" : "text-xl")}>
          {single ? "Your screenshot" : "Your screenshots"}
        </h2>
        <span className="t-mono text-[11.5px] text-ink-3" data-testid="workflow-input-count">
          {max ? `${inputIds.length} of ${max}` : `${inputIds.length} added`}
        </span>
      </div>
      {!compact && <p className="t-body-sm mt-1 text-ink-2">{inputRequirement(recipe)}.</p>}

      {inputIds.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-surface-3 p-5 text-center">
          <span className="mx-auto inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent"><ImagePlus className="size-5" aria-hidden /></span>
          <p className="t-body-sm mt-3 text-ink-2">{single ? "Add the screenshot to use." : "Add the screenshots to use."} You can also paste or drop them here.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => open({ kind: "add" })} disabled={busy || locked}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} {single ? "Choose screenshot" : "Choose screenshots"}
            </Button>
            {!compact && order.length === 0 && (
              <Button onClick={() => { setBusy(true); void loadSample().finally(() => setBusy(false)); }} disabled={busy}>
                Try a sample
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ol className={cn("mt-3", compact ? "space-y-2" : "space-y-3")} data-testid="workflow-input-list">
          {inputIds.map((id, index) => {
            const file = files[id];
            if (!file) return null;
            const role = inputRole(recipe, index);
            return (
              <li key={id} data-testid="workflow-input" className="flex items-center gap-3 rounded-lg border border-line bg-surface-3 p-2">
                <span className={cn("relative shrink-0 overflow-hidden rounded-sm border border-line bg-surface-2", compact ? "h-12 w-16" : "h-16 w-24")}>
                  <BitmapCanvas id={id} width={compact ? 64 : 96} label={`Thumbnail of ${file.name}`} className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  {role && <span className="t-micro block text-accent-ink">{role}</span>}
                  <span className="t-mono block truncate text-[12px] text-ink" title={file.name} data-testid="workflow-input-name">{file.name}</span>
                  <span className="t-mono block truncate text-[10.5px] text-ink-3">
                    {file.width} × {file.height} · {imageTypeLabel(file.type)} · {formatBytes(file.bytes)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {reorderable && inputIds.length > 1 && (
                    <>
                      <button type="button" className={control} aria-label={`Move ${file.name} earlier`} title="Move earlier" disabled={index === 0 || locked} onClick={() => move(index, -1)}>
                        <ArrowUp aria-hidden />
                      </button>
                      <button type="button" className={control} aria-label={`Move ${file.name} later`} title="Move later" disabled={index === inputIds.length - 1 || locked} onClick={() => move(index, 1)}>
                        <ArrowDown aria-hidden />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={cn(control, "hover:border-[#f3c9c4] hover:bg-error-soft hover:text-error")}
                    aria-label={`Remove ${file.name} from workflow`}
                    title="Remove from workflow (stays in your workspace)"
                    disabled={locked}
                    onClick={() => onChange(inputIds.filter((item) => item !== id))}
                  >
                    <X aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {inputIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {reorderable && recipe.id === "visual-qa-report" && inputIds.length === 2 && (
            <Button size="sm" onClick={() => onChange([inputIds[1], inputIds[0]])} disabled={locked}>
              <ArrowUpDown /> Swap before and after
            </Button>
          )}
          {single ? (
            <Button size="sm" onClick={() => open({ kind: "replace", id: inputIds[0] })} disabled={locked || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Change screenshot
            </Button>
          ) : (
            <Button size="sm" onClick={() => open({ kind: "add" })} disabled={locked || busy || full}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add screenshot
            </Button>
          )}
        </div>
      )}
      {full && !single && <p className="t-body-sm mt-2 text-ink-3">This workflow uses up to {max} screenshots. Remove one to add another.</p>}
      {note && <p className="t-body-sm mt-3 rounded-md bg-surface-2 px-3 py-2 text-ink-2" data-testid="workflow-input-note">{note}</p>}
      {locked && <p className="t-body-sm mt-3 text-ink-3">Screenshots can be changed when this step finishes.</p>}

      {!compact && others.length > 0 && (
        <div className="mt-5 border-t border-line pt-4" data-testid="workflow-workspace-files">
          <h3 className="t-micro text-ink-3">Also in your workspace</h3>
          <p className="t-body-sm mt-1 text-ink-3">Not used by this workflow.</p>
          <ul className="mt-3 space-y-2">
            {others.map((id) => {
              const file = files[id]!;
              return (
                <li key={id} className="flex items-center gap-3 rounded-md border border-line p-2">
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-xs border border-line bg-surface-2">
                    <BitmapCanvas id={id} width={56} label={`Thumbnail of ${file.name}`} className="absolute inset-0 h-full w-full object-cover" />
                  </span>
                  <span className="t-mono min-w-0 flex-1 truncate text-[12px]" title={file.name}>{file.name}</span>
                  <Button
                    size="sm"
                    variant="soft"
                    className="max-md:h-11"
                    disabled={!single && full}
                    aria-label={single && inputIds.length ? `Use ${file.name} instead` : `Use ${file.name} in this workflow`}
                    onClick={() => onChange(single ? [id] : [...inputIds, id])}
                  >
                    {single && inputIds.length ? "Use instead" : "Use"}
                  </Button>
                  <button type="button" className={cn(control, "hover:border-[#f3c9c4] hover:bg-error-soft hover:text-error")} aria-label={`Delete ${file.name} from workspace`} title="Delete from workspace" onClick={() => runtime.removeFile(id)}>
                    <Trash2 aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!compact && inputIds.length > 0 && <p className="t-body-sm mt-4 text-ink-3">Removing a screenshot here keeps it in your workspace.</p>}
    </section>
  );
}
