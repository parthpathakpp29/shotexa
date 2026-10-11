import type { WorkflowAction, WorkflowRecipe, WorkflowStepDefinition } from "./types";

export const SUPPORTED_WORKFLOW_ACTIONS: readonly WorkflowAction[] = [
  "input",
  "privacy-scan",
  "privacy-review",
  "redact-review",
  "annotation-review",
  "remove-background",
  "beautify",
  "resize",
  "ocr",
  "compare",
  "compare-text-diff",
  "compare-report",
  "structured-extract",
  "export-csv",
  "export-xlsx",
  "export-json",
  "export-markdown",
  "privacy-clean",
  "metadata-remove",
  "compress",
  "convert",
  "watermark",
  "pdf",
  "package-bug-report",
  "package-documentation",
  "export",
] as const;

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

function validStep(step: unknown): step is WorkflowStepDefinition {
  if (!step || typeof step !== "object") return false;
  const candidate = step as Partial<WorkflowStepDefinition>;
  return typeof candidate.id === "string" && !!candidate.id.trim()
    && typeof candidate.name === "string" && !!candidate.name.trim()
    && typeof candidate.description === "string"
    && typeof candidate.action === "string"
    && SUPPORTED_WORKFLOW_ACTIONS.includes(candidate.action as WorkflowAction)
    && !!candidate.config && typeof candidate.config === "object" && !Array.isArray(candidate.config);
}

export function validateWorkflowRecipe(recipe: unknown): WorkflowValidationResult {
  const errors: string[] = [];
  if (!recipe || typeof recipe !== "object") return { valid: false, errors: ["Recipe must be an object."] };
  const value = recipe as Partial<WorkflowRecipe>;
  if (typeof value.id !== "string" || !value.id.trim()) errors.push("Recipe id is required.");
  if (typeof value.name !== "string" || !value.name.trim()) errors.push("Recipe name is required.");
  if (typeof value.description !== "string") errors.push("Recipe description is required.");
  if (!value.input || !Number.isInteger(value.input.min) || value.input.min < 1) errors.push("Recipe input minimum must be at least one.");
  if (!Array.isArray(value.steps) || !value.steps.length) errors.push("Recipe needs at least one step.");
  else {
    const ids = new Set<string>();
    value.steps.forEach((step, index) => {
      if (!validStep(step)) errors.push(`Step ${index + 1} is invalid.`);
      else if (ids.has(step.id)) errors.push(`Step id ${step.id} is duplicated.`);
      else ids.add(step.id);
    });
    if (value.steps[0] && validStep(value.steps[0]) && value.steps[0].action !== "input") errors.push("The first step must be an input step.");
  }
  if (!value.output || typeof value.output.filename !== "string" || !value.output.filename.trim()) errors.push("Output filename is required.");
  return { valid: errors.length === 0, errors };
}

export function assertValidWorkflowRecipe(recipe: unknown): asserts recipe is WorkflowRecipe {
  const result = validateWorkflowRecipe(recipe);
  if (!result.valid) throw Object.assign(new Error(result.errors.join(" ")), { code: "WORKFLOW_INVALID_RECIPE", errors: result.errors });
}
