"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/primitives";
import { ACTION_COPY } from "@/config/workflow-guides";
import type { WorkflowAction, WorkflowRecipe, WorkflowStepDefinition } from "@/core/workflows/types";
import { cn } from "@/lib/cn";
import { StepConfig } from "./step-config";
import { cloneRecipe } from "./workflow-shared";

const ACTIONS: { action: WorkflowAction; label: string; config: WorkflowStepDefinition["config"] }[] = [
  { action: "remove-background", label: "Remove Background", config: { trim: false, padding: 0 } },
  { action: "resize", label: "Resize", config: { width: 1600, lockAspect: true } },
  { action: "compress", label: "Compress", config: { format: "webp", quality: 0.82 } },
  { action: "convert", label: "Convert", config: { format: "webp", quality: 0.9 } },
  { action: "privacy-clean", label: "Privacy Clean", config: { requireRedactions: false } },
  { action: "beautify", label: "Beautify preset", config: { preset: "saas-hero", canvas: "16:9", format: "webp", quality: 0.86 } },
  { action: "watermark", label: "Add watermark", config: { position: "bottom-right", opacity: 82, scale: 18 } },
  { action: "metadata-remove", label: "Metadata removal", config: {} },
  { action: "pdf", label: "PDF", config: { paper: "a4", smart: true } },
  { action: "compare", label: "Compare two screenshots", config: { preset: "visual-qa", mode: "difference", alignment: "auto" } },
  { action: "compare-text-diff", label: "Compare visible text", config: {} },
  { action: "compare-report", label: "Comparison report", config: { format: "pdf" } },
  { action: "structured-extract", label: "Extract structured data", config: { mode: "auto" } },
  { action: "export-csv", label: "Export CSV", config: { filename: "extracted-data.csv", delimiter: "," } },
  { action: "export-xlsx", label: "Export XLSX", config: { filename: "extracted-data.xlsx", allTables: true } },
  { action: "export-json", label: "Export JSON", config: { filename: "extracted-data.json", inferTypes: false } },
  { action: "export-markdown", label: "Export Markdown", config: { filename: "extracted-data.md" } },
  { action: "export", label: "Export", config: { filename: "workflow-output.webp" } },
];

export function CustomRecipeBuilder({ initial, onSave, onCancel }: { initial: WorkflowRecipe; onSave(recipe: WorkflowRecipe): void; onCancel(): void }) {
  const [recipe, setRecipe] = useState(() => cloneRecipe(initial));
  const [action, setAction] = useState<WorkflowAction>("resize");
  const customSteps = recipe.steps.slice(1);
  function updateStep(index: number, next: WorkflowStepDefinition) { const steps = [...recipe.steps]; steps[index + 1] = next; setRecipe({ ...recipe, steps }); }
  function updateOutputFilename(filename: string) { setRecipe({ ...recipe, output: { ...recipe.output, filename }, steps: recipe.steps.map((step) => step.action === "export" ? { ...step, config: { ...step.config, filename } } : step) }); }
  function move(index: number, delta: number) { const next = [...customSteps]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setRecipe({ ...recipe, steps: [recipe.steps[0], ...next] }); }
  function add() { const def = ACTIONS.find((item) => item.action === action)!; const needsReview = ["beautify", "watermark", "privacy-clean", "metadata-remove", "compress", "compare", "compare-text-diff"].includes(action); const destructive = ["privacy-clean", "metadata-remove", "compress"].includes(action); const step = { id: `${action}-${crypto.randomUUID()}`, name: def.label, description: ACTION_COPY[action].description, action, config: structuredClone(def.config), enabled: true, review: needsReview || undefined, destructive: destructive || undefined } as WorkflowStepDefinition; setRecipe({ ...recipe, steps: [...recipe.steps, step] }); }
  const iconButton = "inline-flex size-10 items-center justify-center rounded-md border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-30 max-md:size-11";
  return <main className="mx-auto w-full max-w-[980px] px-4 py-10 sm:px-6" data-testid="custom-recipe-builder">
    <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" onClick={onCancel}><ArrowLeft /> Workflows</Button><div><p className="t-micro text-accent-ink">Custom workflow</p><h1 className="t-h1">Build your own workflow</h1></div></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="rounded-xl border border-line bg-surface p-5 shadow-xs" aria-label="Workflow steps">
        <div className="grid gap-4 sm:grid-cols-2"><div><FieldLabel htmlFor="recipe-name">Workflow name</FieldLabel><input id="recipe-name" value={recipe.name} onChange={(event) => setRecipe({ ...recipe, name: event.target.value })} className="h-11 w-full rounded-md border border-line px-3" /></div><div><FieldLabel htmlFor="recipe-file">Output filename</FieldLabel><input id="recipe-file" value={recipe.output.filename} onChange={(event) => updateOutputFilename(event.target.value)} className="h-11 w-full rounded-md border border-line px-3" /></div></div>
        <h2 className="mt-6 font-display text-xl">Steps</h2>
        <p className="t-body-sm mt-1 text-ink-2">Steps run from top to bottom. Switch one off to skip it without deleting it.</p>
        <ol className="mt-4 space-y-3">
          <li className="rounded-lg border border-line bg-surface-3 p-4"><strong>1. Choose screenshots</strong><p className="t-body-sm text-ink-2">You pick the screenshots each time you run the workflow.</p></li>
          {customSteps.map((step, index) => <li key={step.id} className={cn("rounded-lg border border-line p-4", step.enabled === false && "bg-surface-3")} data-testid="custom-step">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" role="switch" aria-label={`Enable ${step.name}`} title={step.enabled === false ? "Switched off" : "Switched on"} aria-checked={step.enabled !== false} onClick={() => updateStep(index, { ...step, enabled: step.enabled === false })} className={cn("relative h-6 w-11 shrink-0 rounded-full", step.enabled === false ? "bg-line-strong" : "bg-accent")}><span className={cn("absolute top-1 size-4 rounded-full bg-white transition-all", step.enabled === false ? "left-1" : "left-6")} /></button>
              <span className="min-w-0 flex-1"><strong className="block">{index + 2}. {step.name}</strong><span className="t-body-sm block text-ink-2">{step.enabled === false ? "Switched off — skipped when the workflow runs." : ACTION_COPY[step.action].description}</span></span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Move ${step.name} up`} title="Move up" className={iconButton} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden className="size-4" /></button>
                <button type="button" aria-label={`Move ${step.name} down`} title="Move down" className={iconButton} disabled={index === customSteps.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden className="size-4" /></button>
                <button type="button" aria-label={`Remove ${step.name}`} title="Delete step" className={cn(iconButton, "text-error hover:border-[#f3c9c4] hover:bg-error-soft hover:text-error")} onClick={() => setRecipe({ ...recipe, steps: recipe.steps.filter((item) => item.id !== step.id) })}><Trash2 aria-hidden className="size-4" /></button>
              </span>
            </div>
            <StepConfig step={step} onChange={(next) => updateStep(index, next)} />
          </li>)}
        </ol>
        <div className="mt-5 rounded-lg border border-dashed border-line-strong bg-surface-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row"><select aria-label="Workflow action" value={action} onChange={(event) => setAction(event.target.value as WorkflowAction)} className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3">{ACTIONS.map((item) => <option key={item.action} value={item.action}>{item.label}</option>)}</select><Button onClick={add}><Plus /> Add step</Button></div>
          <p className="t-body-sm mt-2 text-ink-2">{ACTION_COPY[action].description}</p>
        </div>
      </section>
      <aside className="rounded-xl border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-20 lg:self-start">
        <p className="t-micro text-accent-ink">Saved in this browser</p>
        <h2 className="mt-2 font-display text-2xl">Steps, not screenshots</h2>
        <p className="t-body-sm mt-3 text-ink-2">When you save a workflow, Shotexa remembers the processing steps and settings — not your screenshot files. Nothing is uploaded.</p>
        <ul className="t-body-sm mt-4 space-y-1.5 text-ink-2"><li className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> Rename, edit, duplicate or delete it later</li><li className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> Steps that change the image stop for your review</li></ul>
        <Button variant="primary" size="lg" className="mt-6 w-full" disabled={!recipe.name.trim() || recipe.steps.length < 2} onClick={() => onSave(recipe)}><Check /> Save workflow</Button>
        {recipe.steps.length < 2 && <p className="t-body-sm mt-2 text-center text-ink-3">Add at least one step to save.</p>}
        <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}>Cancel</Button>
      </aside>
    </div>
  </main>;
}
