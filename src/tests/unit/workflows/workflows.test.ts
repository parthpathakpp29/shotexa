import { describe, expect, it, vi } from "vitest";
import { WorkflowEngine } from "@/core/workflows/engine";
import { WorkflowOutputRegistry } from "@/core/workflows/output-registry";
import { loadCustomRecipes, parseCustomRecipes, saveCustomRecipes, serialiseCustomRecipes, type StorageLike } from "@/core/workflows/persistence";
import { BUILT_IN_WORKFLOWS } from "@/core/workflows/recipes";
import type { WorkflowRecipe, WorkflowStepAdapter, WorkflowStepDefinition } from "@/core/workflows/types";
import { validateWorkflowRecipe } from "@/core/workflows/validate";
import { lazyWorkflowAdapters } from "@/core/workflows/lazy-adapters";

const input: WorkflowStepDefinition = { id: "input", name: "Input", description: "Input", action: "input", config: {} };
const exportStep: WorkflowStepDefinition = { id: "export", name: "Export", description: "Export", action: "export", config: { filename: "out.png" } };

function recipe(steps: WorkflowStepDefinition[] = [input, exportStep]): WorkflowRecipe {
  return { id: "custom:test", name: "Test", description: "Test recipe", icon: "wand", category: "custom", input: { min: 1, accepts: ["image/png", "image/jpeg", "image/webp"], label: "One" }, steps, output: { kind: "image", filename: "out.png" } };
}

const adapter = (fn: WorkflowStepAdapter["execute"]): WorkflowStepAdapter => ({ execute: fn });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("workflow recipe validation", () => {
  it("accepts every built-in recipe", () => {
    expect(BUILT_IN_WORKFLOWS.map((item) => validateWorkflowRecipe(item).valid)).toEqual(BUILT_IN_WORKFLOWS.map(() => true));
    expect(BUILT_IN_WORKFLOWS.map((item) => item.id)).toContain("visual-qa-report");
  });

  it("rejects missing input, duplicate ids and unsupported actions", () => {
    const invalid = { ...recipe(), steps: [{ ...input, action: "imaginary" }, input] };
    const result = validateWorkflowRecipe(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Step 1 is invalid.");
    expect(validateWorkflowRecipe({ ...recipe(), input: { min: 0 }, steps: [input, input] }).errors).toEqual(expect.arrayContaining(["Recipe input minimum must be at least one.", "Step id input is duplicated."]));
  });

  it("requires input to be the first step", () => {
    expect(validateWorkflowRecipe(recipe([exportStep, input])).errors).toContain("The first step must be an input step.");
  });
});

describe("workflow engine", () => {
  it("runs enabled steps in order and hands off output references", async () => {
    const seen: string[] = [];
    const engine = new WorkflowEngine(recipe(), {
      input: adapter(async (_step, context) => { seen.push(`input:${context.assetIds[0]}`); return { assetIds: ["derived"] }; }),
      export: adapter(async (_step, context) => { seen.push(`export:${context.assetIds[0]}`); return { outputIds: ["output"] }; }),
    });
    await engine.start(["source"]);
    expect(seen).toEqual(["input:source", "export:derived"]);
    expect(engine.snapshot.state.status).toBe("completed");
    expect(engine.snapshot.context.outputIds).toEqual(["output"]);
  });

  it("pauses for review and executes the adapter only after approval", async () => {
    const review = { ...input, id: "review", review: true } as WorkflowStepDefinition;
    const execute = vi.fn(async () => ({ checks: ["Reviewed"] }));
    const engine = new WorkflowEngine(recipe([review]), { input: adapter(execute) });
    await engine.start(["source"]);
    expect(engine.snapshot.state.status).toBe("waiting-review");
    expect(execute).not.toHaveBeenCalled();
    await engine.confirmReview({ note: "approved" });
    expect(execute).toHaveBeenCalledOnce();
    expect(engine.snapshot.context.data.note).toBe("approved");
    expect(engine.snapshot.state.status).toBe("completed");
  });

  it("reorders multi-image input only while the input review is open", async () => {
    const review = { ...input, review: true } as WorkflowStepDefinition;
    const execute = vi.fn(async (_step, context) => ({ assetIds: context.assetIds }));
    const engine = new WorkflowEngine(recipe([review]), { input: adapter(execute) });
    await engine.start(["first", "second"]);
    engine.reorderReviewAssets(["second", "first"]);
    expect(engine.snapshot.context.assetIds).toEqual(["second", "first"]);
    await engine.confirmReview();
    expect(execute.mock.calls[0][1].assetIds).toEqual(["second", "first"]);
  });

  it("accepts settings-only recipe updates before and during review", async () => {
    const review = { ...input, review: true } as WorkflowStepDefinition;
    const original = recipe([review]);
    const engine = new WorkflowEngine(original, { input: adapter(async () => ({})) });
    const configured = { ...original, name: "Configured", steps: [{ ...review, description: "Updated review" }] };
    engine.configure(configured);
    await engine.start(["source"]);
    expect(engine.recipe.name).toBe("Configured");
    const duringReview = { ...configured, steps: [{ ...configured.steps[0], config: { multiple: true } }] } as WorkflowRecipe;
    engine.configure(duringReview);
    expect(engine.recipe.steps[0].config).toEqual({ multiple: true });
  });

  it("skips an optional failed step without rerunning completed work", async () => {
    const optional = { ...exportStep, optional: true } as WorkflowStepDefinition;
    const first = vi.fn(async () => ({ assetIds: ["derived"] }));
    const engine = new WorkflowEngine(recipe([input, optional]), {
      input: adapter(first),
      export: adapter(async () => { throw Object.assign(new Error("failed"), { code: "TEST_FAILURE" }); }),
    });
    await engine.start(["source"]);
    expect(engine.snapshot.state.status).toBe("failed");
    await engine.skip();
    expect(engine.snapshot.state.status).toBe("completed");
    expect(first).toHaveBeenCalledOnce();
  });

  it("retries only the failed step", async () => {
    let attempts = 0;
    const first = vi.fn(async () => ({}));
    const engine = new WorkflowEngine(recipe(), {
      input: adapter(first),
      export: adapter(async () => { attempts++; if (attempts === 1) throw new Error("once"); return { checks: ["Export generated"] }; }),
    });
    await engine.start(["source"]);
    await engine.retry();
    expect(attempts).toBe(2);
    expect(first).toHaveBeenCalledOnce();
    expect(engine.snapshot.state.status).toBe("completed");
  });

  it("allows failed-step settings to change before retry", async () => {
    let seen = 0;
    const failing: Extract<WorkflowStepDefinition, { action: "export" }> = { id: "export", name: "Export", description: "Export", action: "export", config: { filename: "before.png" } };
    const original = recipe([input, failing]);
    const engine = new WorkflowEngine(original, {
      input: adapter(async () => ({})),
      export: adapter(async (step) => {
        if (step.action === "export" && step.config.filename === "before.png") throw new Error("change-me");
        seen++;
        return {};
      }),
    });
    await engine.start(["source"]);
    const updated: Extract<WorkflowStepDefinition, { action: "export" }> = { ...failing, config: { filename: "after.png" } };
    engine.configure({ ...original, steps: [input, updated] });
    await engine.retry();
    expect(seen).toBe(1);
    expect(engine.snapshot.state.status).toBe("completed");
  });

  it("cancels a running adapter and reports cancelled", async () => {
    const engine = new WorkflowEngine(recipe([input]), {
      input: adapter(async (_step, context) => new Promise((resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "WORKFLOW_CANCELLED" })), { once: true });
        void resolve;
      })),
    });
    const running = engine.start(["source"]);
    await tick();
    await engine.cancel();
    await running;
    expect(engine.snapshot.state.status).toBe("cancelled");
  });

  it("restarts from original inputs", async () => {
    const execute = vi.fn(async () => ({}));
    const engine = new WorkflowEngine(recipe([input]), { input: adapter(execute) });
    await engine.start(["source"]);
    await engine.restart();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(engine.snapshot.context.originalAssetIds).toEqual(["source"]);
  });

  it("does not execute disabled custom steps", async () => {
    const disabled = { ...exportStep, enabled: false } as WorkflowStepDefinition;
    const runExport = vi.fn(async () => ({}));
    const engine = new WorkflowEngine(recipe([input, disabled]), { input: adapter(async () => ({})), export: adapter(runExport) });
    await engine.start(["source"]);
    expect(runExport).not.toHaveBeenCalled();
    expect(engine.snapshot.state.steps[1].status).toBe("skipped");
  });
});

describe("lazily loaded adapters", () => {
  it("loads the real adapters once, on the first step that runs", async () => {
    const execute = vi.fn(async () => ({ checks: ["ran"] }));
    const load = vi.fn(async () => ({ input: { execute }, export: { execute } }));
    const engine = new WorkflowEngine(recipe(), lazyWorkflowAdapters(load));
    expect(load).not.toHaveBeenCalled();

    await engine.start(["a"]);
    await tick();
    expect(engine.snapshot.state.status).toBe("completed");
    // Two steps ran, but the module was imported exactly once.
    expect(execute).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(engine.snapshot.context.checks).toEqual(["ran"]);
  });

  it("reports a genuinely missing adapter with the same controlled code", async () => {
    const engine = new WorkflowEngine(recipe(), lazyWorkflowAdapters(async () => ({ input: { execute: async () => ({}) } })));
    await engine.start(["a"]);
    await tick();
    expect(engine.snapshot.state.status).toBe("failed");
    expect(engine.snapshot.state.error).toBe("WORKFLOW_ADAPTER_MISSING");
  });

  it("cancelling before anything ran never forces the load", async () => {
    const load = vi.fn(async () => ({ input: { execute: async () => ({}) } }));
    const engine = new WorkflowEngine(recipe([{ ...input, review: true }, exportStep]), lazyWorkflowAdapters(load));
    await engine.start(["a"]);
    await engine.cancel();
    expect(load).not.toHaveBeenCalled();
    expect(engine.snapshot.state.status).toBe("cancelled");
  });
});

describe("custom workflow persistence and cleanup", () => {
  it("round-trips a custom recipe without blobs", () => {
    const value = serialiseCustomRecipes([recipe()]);
    expect(value).not.toContain("blob:");
    expect(parseCustomRecipes(value)).toEqual([recipe()]);
  });

  it("ignores invalid or non-custom stored recipes", () => {
    expect(parseCustomRecipes("not-json")).toEqual([]);
    expect(parseCustomRecipes(JSON.stringify([{ version: 1, recipe: BUILT_IN_WORKFLOWS[0] }]))).toEqual([]);
  });

  it("saves and loads through local-storage-compatible configuration", () => {
    const values = new Map<string, string>();
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    saveCustomRecipes(storage, [recipe()]);
    expect(loadCustomRecipes(storage)[0].name).toBe("Test");
  });

  it("keeps output blobs outside logical state and releases them", () => {
    const outputs = new WorkflowOutputRegistry();
    const output = outputs.put(new Blob(["result"], { type: "text/plain" }), "result.txt");
    outputs.saveSession({ id: "session", recipeId: "custom:test", recipeName: "Test", status: "completed", startedAt: 1, updatedAt: 2, assetIds: ["asset"], outputIds: [output.id], checks: ["Done"] });
    expect(outputs.stats()).toEqual({ outputs: 1, sessions: 1, bytes: 6 });
    expect(outputs.blob(output.id)?.size).toBe(6);
    outputs.clear();
    expect(outputs.stats()).toEqual({ outputs: 0, sessions: 0, bytes: 0 });
  });
});
