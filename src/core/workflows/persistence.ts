import type { StoredCustomRecipe, WorkflowRecipe } from "./types";
import { validateWorkflowRecipe } from "./validate";

export const CUSTOM_WORKFLOW_STORAGE_KEY = "shotexa.custom-workflows.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function serialiseCustomRecipes(recipes: WorkflowRecipe[]): string {
  const payload: StoredCustomRecipe[] = recipes.map((recipe) => ({ version: 1, recipe }));
  return JSON.stringify(payload);
}

export function parseCustomRecipes(value: string | null): WorkflowRecipe[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const stored = entry as Partial<StoredCustomRecipe>;
      if (stored.version !== 1 || !stored.recipe || !String(stored.recipe.id).startsWith("custom:")) return [];
      return validateWorkflowRecipe(stored.recipe).valid ? [stored.recipe] : [];
    });
  } catch {
    return [];
  }
}

export function loadCustomRecipes(storage: StorageLike): WorkflowRecipe[] {
  return parseCustomRecipes(storage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY));
}

export function saveCustomRecipes(storage: StorageLike, recipes: WorkflowRecipe[]): void {
  const valid = recipes.filter((recipe) => recipe.id.startsWith("custom:") && validateWorkflowRecipe(recipe).valid);
  storage.setItem(CUSTOM_WORKFLOW_STORAGE_KEY, serialiseCustomRecipes(valid));
}
