"use client";

import { AlertTriangle, Check, CircleDashed, Download, FileArchive, FileImage, FileText, Loader2, RotateCcw, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import type { WorkflowEngineSnapshot } from "@/core/workflows/engine";
import type { WorkflowOutput, WorkflowRecipe, WorkflowStepStatus } from "@/core/workflows/types";
import { cn } from "@/lib/cn";
import { formatBytes, imageTypeLabel } from "@/lib/format-bytes";
import { reviewCopy, runningCopy, StepTags } from "./workflow-overview";

type DisplayStatus = "upcoming" | "current" | "running" | "complete" | "skipped" | "failed" | "cancelled";

const STATUS_LABELS: Record<DisplayStatus, string> = {
  upcoming: "Upcoming",
  current: "Waiting for you",
  running: "In progress",
  complete: "Complete",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

function displayStatus(status: WorkflowStepStatus, isCurrent: boolean): DisplayStatus {
  if (status === "completed") return "complete";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "running") return "running";
  if (status === "review" || isCurrent) return "current";
  return "upcoming";
}

function StatusIcon({ status }: { status: DisplayStatus }) {
  const base = "inline-flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5";
  if (status === "complete") return <span aria-hidden className={cn(base, "border-success bg-success text-white")}><Check /></span>;
  if (status === "failed") return <span aria-hidden className={cn(base, "border-error bg-error text-white")}><AlertTriangle /></span>;
  if (status === "skipped") return <span aria-hidden className={cn(base, "border-line-strong bg-surface-2 text-ink-3")}><SkipForward /></span>;
  if (status === "cancelled") return <span aria-hidden className={cn(base, "border-line-strong bg-surface-2 text-ink-3")}><X /></span>;
  if (status === "running") return <span aria-hidden className={cn(base, "border-accent bg-accent text-white")}><Loader2 className="animate-spin" /></span>;
  if (status === "current") return <span aria-hidden className={cn(base, "border-accent bg-surface text-accent ring-4 ring-accent-soft")}><span className="size-2.5 rounded-full bg-accent" /></span>;
  return <span aria-hidden className={cn(base, "border-line-strong bg-surface text-ink-3")}><CircleDashed /></span>;
}

/**
 * Every step with its state in words as well as colour: "Complete", "Waiting for you",
 * "In progress"… The current step carries aria-current and a visible label.
 */
export function WorkflowStepper({ recipe, snapshot }: { recipe: WorkflowRecipe; snapshot: WorkflowEngineSnapshot }) {
  const finished = ["completed", "cancelled"].includes(snapshot.state.status);
  const done = snapshot.state.steps.filter((step) => step.status === "completed" || step.status === "skipped").length;
  return (
    <nav aria-label="Workflow steps" data-testid="workflow-stepper">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="t-micro text-ink-3">Steps</p>
        <p className="t-mono text-[11.5px] text-ink-3">{done} of {recipe.steps.length} done</p>
      </div>
      <ol className="space-y-1.5">
        {recipe.steps.map((step, index) => {
          const state = snapshot.state.steps[index];
          const isCurrent = index === snapshot.state.currentIndex && !finished;
          const status = displayStatus(state.status, isCurrent);
          const active = status === "current" || status === "running" || (isCurrent && status === "failed");
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              data-testid="workflow-step"
              data-status={status}
              className={cn("relative rounded-md border p-2.5", active ? "border-accent-line bg-accent-soft shadow-xs" : "border-transparent", status === "failed" && "border-[#f3c9c4] bg-error-soft")}
            >
              {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" />}
              <div className="flex items-start gap-2.5">
                <StatusIcon status={status} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", active ? "font-semibold text-ink" : status === "upcoming" ? "font-medium text-ink-2" : "font-medium text-ink")}>
                    {index + 1}. {step.name}
                  </span>
                  <span className={cn("t-mono mt-0.5 block text-[10.5px] uppercase tracking-[0.06em]", status === "failed" ? "text-error" : active ? "text-accent-ink" : status === "complete" ? "text-success" : "text-ink-3")}>
                    {STATUS_LABELS[status]}
                    {step.optional && status === "upcoming" ? " · Optional" : ""}
                  </span>
                  {(active || status === "upcoming") && <span className="t-body-sm mt-1 block text-[12.5px] leading-snug text-ink-2">{step.description}</span>}
                </span>
              </div>
              {state.status === "running" && <Progress value={state.progress} label={`${step.name} progress`} className="mt-2.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The step Shotexa is on right now, in words: what it is, what it does, and what the user
 * should do next. Sits above the step's own editor.
 */
export function CurrentStep({ recipe, snapshot, onContinue, onSkip }: { recipe: WorkflowRecipe; snapshot: WorkflowEngineSnapshot; onContinue(): void; onSkip(): void }) {
  const index = snapshot.state.currentIndex;
  const step = recipe.steps[index];
  if (!step || snapshot.state.status === "completed") return null;
  const status = snapshot.state.status;
  const stepState = snapshot.state.steps[index];
  const waiting = status === "waiting-review";
  const running = status === "running";
  return (
    <section aria-labelledby="workflow-current-title" data-testid="workflow-current-step" className={cn("mb-4 rounded-xl border bg-surface p-4 shadow-xs sm:p-5", status === "failed" ? "border-[#f3c9c4]" : "border-accent-line")}>
      <p className="t-micro flex flex-wrap items-center gap-x-2 text-accent-ink">
        <span>Step {index + 1} of {recipe.steps.length}</span>
        <span aria-hidden>·</span>
        <span className={cn(status === "failed" && "text-error")}>{waiting ? "Waiting for you" : running ? "In progress" : status === "failed" ? "Failed" : status === "cancelled" ? "Cancelled" : "Ready"}</span>
      </p>
      <h2 id="workflow-current-title" className="t-h2 mt-1.5">{step.name}</h2>
      <p className="t-body-sm mt-1 text-ink-2">{step.description}</p>
      <StepTags step={step} />
      {running && (
        <div className="mt-4" role="status">
          <p className="flex items-center gap-2 text-sm font-medium text-accent-ink"><Loader2 aria-hidden className="size-4 animate-spin" /> {runningCopy(step)}</p>
          <Progress value={stepState?.progress ?? null} label={`${step.name} progress`} className="mt-2" />
        </div>
      )}
      {waiting && <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-ink">{reviewCopy(step)}</p>}
      {/* Phones keep the settings in a sheet; the main decision stays one tap away here. */}
      {waiting && (
        <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
          <Button variant="primary" className="h-11 flex-1" onClick={onContinue}>Continue <span aria-hidden>→</span></Button>
          {step.optional && <Button className="h-11" onClick={onSkip}>Skip this step</Button>}
        </div>
      )}
    </section>
  );
}

function outputIcon(type: string) {
  if (type.startsWith("image/")) return <FileImage />;
  if (type.includes("zip")) return <FileArchive />;
  return <FileText />;
}

function outputKind(output: WorkflowOutput): string {
  if (output.type.startsWith("image/")) return `${imageTypeLabel(output.type)} image`;
  if (output.type.includes("pdf")) return "PDF document";
  if (output.type.includes("zip")) return "ZIP archive";
  if (output.name.endsWith(".csv")) return "CSV file";
  if (output.name.endsWith(".json")) return "JSON file";
  if (output.name.endsWith(".md")) return "Markdown file";
  if (output.name.endsWith(".xlsx")) return "Spreadsheet";
  return "File";
}

/** Pixel size of image outputs, read from the file itself once it exists. */
function useImageSizes(outputs: WorkflowOutput[], blobFor: (id: string) => Blob | undefined) {
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const key = outputs.map((output) => output.id).join(",");
  useEffect(() => {
    let cancelled = false;
    for (const output of outputs) {
      const blob = blobFor(output.id);
      if (!blob || !output.type.startsWith("image/") || typeof createImageBitmap !== "function") continue;
      void createImageBitmap(blob).then((bitmap) => {
        const label = `${bitmap.width} × ${bitmap.height} px`;
        bitmap.close();
        if (!cancelled) setSizes((current) => ({ ...current, [output.id]: label }));
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
    // The outputs of a finished run never change; their ids identify them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return sizes;
}

export function WorkflowCompletion({ recipe, checks, outputs, blobFor, onDownloadAll, onDownload, onRunAgain, onExit }: {
  recipe: WorkflowRecipe;
  checks: string[];
  outputs: WorkflowOutput[];
  blobFor(id: string): Blob | undefined;
  onDownloadAll(): void;
  onDownload(id: string): void;
  onRunAgain(): void;
  onExit(): void;
}) {
  const sizes = useImageSizes(outputs, blobFor);
  return (
    <section aria-labelledby="workflow-done-title" className="rounded-xl border border-[#cfe5d6] bg-success-soft p-5 shadow-sm sm:p-6" data-testid="workflow-complete">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-success text-white"><Check aria-hidden className="size-6" /></span>
        <div>
          <p className="t-micro text-success">Done</p>
          <h2 id="workflow-done-title" className="t-h1">{recipe.name} is ready</h2>
        </div>
      </div>

      {checks.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">What Shotexa completed</h3>
          <ul className="mt-2 space-y-1.5">
            {checks.map((item) => {
              const warning = item.startsWith("Warning:");
              return (
                <li key={item} className={cn("flex items-start gap-2 text-sm", warning ? "text-warning" : "text-ink")}>
                  {warning ? <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />}
                  <span>{warning && <span className="sr-only">Warning: </span>}{item.replace(/^Warning:\s*/, "")}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {outputs.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">{outputs.length === 1 ? "Your file" : "Your files"}</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="workflow-outputs">
            {outputs.map((output) => (
              <li key={output.id} className="flex items-center gap-3 rounded-lg border border-[#cfe5d6] bg-surface p-3" data-testid="workflow-output">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-5">{outputIcon(output.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="t-mono block truncate text-[12.5px] text-ink" title={output.name}>{output.name}</span>
                  <span className="t-mono block text-[11px] text-ink-3">{[outputKind(output), formatBytes(output.bytes), sizes[output.id]].filter(Boolean).join(" · ")}</span>
                </span>
                {outputs.length > 1 && (
                  <button type="button" onClick={() => onDownload(output.id)} aria-label={`Download ${output.name}`} title={`Download ${output.name}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-line text-ink-2 hover:border-line-strong hover:text-ink max-md:size-11">
                    <Download aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {outputs.length > 0 && (
          <Button variant="primary" size="lg" onClick={onDownloadAll}>
            <Download /> {outputs.length === 1 ? "Download output" : `Download outputs (${outputs.length})`}
          </Button>
        )}
        <Button size="lg" onClick={onRunAgain}><RotateCcw /> Run again</Button>
        <Button size="lg" variant="ghost" onClick={onExit}>Choose another workflow</Button>
      </div>
      {recipe.id === "safe-share" && <p className="t-body-sm mt-4 text-ink-2">Shotexa checked the steps it performed. It can’t promise that every sensitive detail was found — look over the image before you share it.</p>}
    </section>
  );
}
