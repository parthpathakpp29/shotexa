"use client";

import { BookOpen, Bug, Columns2, Globe2, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { ACTION_COPY } from "@/config/workflow-guides";
import { downloadBlob } from "@/core/runtime/runtime";
import type { workflowOutputsFor } from "@/core/workflows/output-registry";
import type { WorkflowRecipe } from "@/core/workflows/types";

/** Small helpers shared by the workflow landing, runner and builder. */
export function iconFor(recipe: WorkflowRecipe) {
  if (recipe.icon === "shield") return <ShieldCheck />;
  if (recipe.icon === "sparkles") return <Sparkles />;
  if (recipe.icon === "bug") return <Bug />;
  if (recipe.icon === "book") return <BookOpen />;
  if (recipe.icon === "globe") return <Globe2 />;
  if (recipe.icon === "compare") return <Columns2 />;
  return <WandSparkles />;
}

export const cloneRecipe = (recipe: WorkflowRecipe) => JSON.parse(JSON.stringify(recipe)) as WorkflowRecipe;

export function newCustomRecipe(): WorkflowRecipe {
  return { id: `custom:${crypto.randomUUID()}`, name: "My workflow", description: "A workflow saved in this browser.", icon: "wand", category: "custom", input: { min: 1, accepts: ["image/png", "image/jpeg", "image/webp"], label: "One or more screenshots" }, output: { kind: "image", filename: "workflow-output.webp" }, steps: [{ id: "input", name: "Choose screenshots", description: ACTION_COPY.input.description, action: "input", config: { multiple: true } }] };
}

export function downloadOutputs(registry: ReturnType<typeof workflowOutputsFor>, ids: string[]) {
  ids.forEach((id, index) => { const output = registry.output(id); const blob = registry.blob(id); if (output && blob) setTimeout(() => downloadBlob(blob, output.name, index > 0), index * 200); });
}
