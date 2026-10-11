import { Check, FileOutput, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { ACTION_COPY, guideFor, STEP_EFFECT_LABELS, stepEffect } from "@/config/workflow-guides";
import type { WorkflowAction, WorkflowRecipe, WorkflowStepDefinition } from "@/core/workflows/types";
import { cn } from "@/lib/cn";

/** Steps that fetch a versioned model or OCR language data the first time they run. */
const DOWNLOADS_ASSETS: WorkflowAction[] = ["privacy-scan", "ocr", "compare-text-diff", "remove-background", "structured-extract"];

export function StepTags({ step }: { step: WorkflowStepDefinition }) {
  const effect = stepEffect(step);
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      <Tag tone={effect === "changes-image" ? "accent" : "neutral"}>{STEP_EFFECT_LABELS[effect]}</Tag>
      {step.review && effect !== "you-choose" && <Tag>You review first</Tag>}
      {step.optional && <Tag>Optional</Tag>}
    </span>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return <span className={cn("t-mono rounded-xs border px-1.5 py-0.5 text-[10.5px] leading-none", tone === "accent" ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-surface-2 text-ink-2")}>{children}</span>;
}

/** "Shotexa will help you" — the purpose of the workflow, before anything runs. */
export function WorkflowIntro({ recipe, className }: { recipe: WorkflowRecipe; className?: string }) {
  const guide = guideFor(recipe);
  const downloads = recipe.steps.some((step) => step.enabled !== false && DOWNLOADS_ASSETS.includes(step.action));
  return (
    <section aria-labelledby="workflow-intro-title" data-testid="workflow-intro" className={cn("rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6", className)}>
      <p className="t-micro text-accent-ink">What this workflow does</p>
      <h2 id="workflow-intro-title" className="t-h2 mt-2">Shotexa will help you</h2>
      <p className="t-body-sm mt-1 text-ink-2">{guide.useCase}</p>
      <ul className="mt-4 space-y-2">
        {guide.helps.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-ink">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-start gap-2.5 rounded-md bg-surface-3 px-3 py-2.5 text-sm text-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          Your screenshots stay on this device.
          {downloads && " The first time, Shotexa downloads the recognition data or model these steps need — your images are never sent with it."}
        </span>
      </p>
    </section>
  );
}

/**
 * "What will happen" — every step in plain language with what it does to the image, plus the
 * final output. Optional steps can be switched off before the run starts.
 */
export function WorkflowPlan({ recipe, onToggleStep, className }: { recipe: WorkflowRecipe; onToggleStep?(stepId: string, enabled: boolean): void; className?: string }) {
  const guide = guideFor(recipe);
  return (
    <section aria-labelledby="workflow-plan-title" data-testid="workflow-plan" className={cn("rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6", className)}>
      <h2 id="workflow-plan-title" className="t-h2">What will happen</h2>
      <p className="t-body-sm mt-1 text-ink-2">Shotexa pauses at each step marked “You decide” or “You review first”, so nothing is changed without you seeing it.</p>
      <ol className="mt-5 space-y-4">
        {recipe.steps.map((step, index) => {
          const enabled = step.enabled !== false;
          return (
            <li key={step.id} className={cn("flex gap-3", !enabled && "opacity-60")}>
              <span aria-hidden className="t-mono mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-[12px] text-ink-2">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <h3 className="text-[15px] font-semibold leading-snug">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.name}
                  </h3>
                  {step.optional && onToggleStep && (
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-ink-2 max-md:min-h-11">
                      <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={enabled} onChange={(event) => onToggleStep(step.id, event.target.checked)} aria-label={`Include ${step.name}`} />
                      Include
                    </label>
                  )}
                </div>
                <p className="t-body-sm mt-0.5 text-ink-2">{enabled ? step.description : "Switched off — this step will be skipped."}</p>
                {enabled && step.action !== "input" && <StepTags step={step} />}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-accent-line bg-accent-soft/60 p-4" data-testid="workflow-output-expectation">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-accent"><FileOutput aria-hidden className="size-[18px]" /></span>
        <div className="min-w-0">
          <p className="t-micro text-accent-ink">What you’ll get</p>
          <p className="mt-1 text-sm font-semibold text-ink">{guide.output.summary}</p>
          <p className="t-body-sm text-ink-2">{guide.output.formats}</p>
        </div>
      </div>
    </section>
  );
}

/** The main stages as a row of pills on a workflow card; optional stages are dashed. */
export function WorkflowPipeline({ recipe }: { recipe: WorkflowRecipe }) {
  const stages = guideFor(recipe).pipeline.map((stage) => {
    const optional = /\(optional\)$/i.test(stage);
    return { label: stage.replace(/\s*\(optional\)$/i, ""), optional };
  });
  return (
    <ol aria-label="Main steps" className="flex flex-wrap items-center gap-1.5">
      {stages.map((stage, index) => (
        <li key={stage.label}>
          <span
            title={stage.optional ? "Optional — you can switch it off" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-medium leading-none",
              stage.optional ? "border-dashed border-line-strong bg-surface text-ink-3" : "border-line bg-surface text-ink-2",
            )}
          >
            <span aria-hidden className={cn("t-mono inline-flex size-4 items-center justify-center rounded-full text-[9.5px]", stage.optional ? "bg-surface-2 text-ink-3" : "bg-dark text-white")}>{index + 1}</span>
            {stage.label}
            {stage.optional && <span className="sr-only"> (optional)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const runningCopy = (step: WorkflowStepDefinition) => ACTION_COPY[step.action].running;
export const reviewCopy = (step: WorkflowStepDefinition) => ACTION_COPY[step.action].review;
