import type {
  WorkflowAdapterMap,
  WorkflowExecutionContext,
  WorkflowExecutionState,
  WorkflowRecipe,
  WorkflowSessionSummary,
  WorkflowStepResult,
} from "./types";
import { assertValidWorkflowRecipe } from "./validate";

const runId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const errorCode = (error: unknown) => (error as { code?: string })?.code ?? (error instanceof Error ? error.message : "WORKFLOW_STEP_FAILED");

/**
 * How a started run absorbs changed inputs: `updated` in place (nothing has used them yet),
 * `restarted` from the first step, `reset` to not-started (too few screenshots), or `busy`
 * (a step is executing). `idle` means no run exists, so only the selection changes.
 */
export type InputChangeEffect = "idle" | "updated" | "restarted" | "reset" | "busy";

export interface WorkflowEngineSnapshot {
  state: WorkflowExecutionState;
  context: Omit<WorkflowExecutionContext, "signal" | "reportProgress">;
}

export class WorkflowEngine {
  readonly id = runId();
  readonly startedAt = Date.now();
  #recipe: WorkflowRecipe;
  #adapters: WorkflowAdapterMap;
  #abort = new AbortController();
  #listeners = new Set<(snapshot: WorkflowEngineSnapshot) => void>();
  #busy = false;
  #initialAssetIds: string[] = [];
  #context: Omit<WorkflowExecutionContext, "signal" | "reportProgress">;
  #state: WorkflowExecutionState;

  constructor(recipe: WorkflowRecipe, adapters: WorkflowAdapterMap) {
    assertValidWorkflowRecipe(recipe);
    this.#recipe = recipe;
    this.#adapters = adapters;
    this.#context = { runId: this.id, originalAssetIds: [], assetIds: [], outputIds: [], data: {}, checks: [] };
    this.#state = this.#freshState();
  }

  get recipe() { return this.#recipe; }
  get snapshot(): WorkflowEngineSnapshot { return { state: { ...this.#state, steps: this.#state.steps.map((step) => ({ ...step })) }, context: { ...this.#context, originalAssetIds: [...this.#context.originalAssetIds], assetIds: [...this.#context.assetIds], outputIds: [...this.#context.outputIds], data: { ...this.#context.data }, checks: [...this.#context.checks] } }; }

  subscribe(listener: (snapshot: WorkflowEngineSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  configure(recipe: WorkflowRecipe): void {
    if (!(this.#state.status === "idle" || this.#state.status === "waiting-review" || this.#state.status === "failed")) return;
    assertValidWorkflowRecipe(recipe);
    if (recipe.id !== this.#recipe.id || recipe.steps.length !== this.#recipe.steps.length) throw Object.assign(new Error("Workflow structure cannot change during a run."), { code: "WORKFLOW_STRUCTURE_CHANGED" });
    this.#recipe = recipe;
  }

  async start(assetIds: string[]): Promise<void> {
    if (assetIds.length < this.#recipe.input.min || (this.#recipe.input.max && assetIds.length > this.#recipe.input.max)) {
      throw Object.assign(new Error("Input does not match this recipe."), { code: "WORKFLOW_INPUT_INVALID" });
    }
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#initialAssetIds = [...assetIds];
    this.#context = { runId: this.id, originalAssetIds: [...assetIds], assetIds: [...assetIds], outputIds: [], data: {}, checks: [] };
    this.#state = this.#freshState();
    this.#state.status = "running";
    this.#emit();
    await this.#advance();
  }

  async confirmReview(data: Record<string, string> = {}): Promise<void> {
    if (this.#state.status !== "waiting-review") return;
    const index = this.#state.currentIndex;
    const step = this.#recipe.steps[index];
    this.#context.data = { ...this.#context.data, ...data };
    this.#state.status = "running";
    this.#state.steps[index] = { ...this.#state.steps[index], status: "running", progress: 0, error: undefined };
    this.#emit();
    try {
      const adapter = this.#adapters[step.action];
      if (!adapter) throw Object.assign(new Error(`No adapter for ${step.action}`), { code: "WORKFLOW_ADAPTER_MISSING" });
      const result = await adapter.execute(step, {
        ...this.#context,
        signal: this.#abort.signal,
        reportProgress: (progress) => {
          if (this.#state.currentIndex !== index || this.#state.status !== "running") return;
          this.#state.steps[index] = { ...this.#state.steps[index], progress: Math.max(0, Math.min(1, progress)) };
          this.#recalculate();
          this.#emit();
        },
      });
      if (this.#abort.signal.aborted) return;
      this.#merge(result);
      this.#state.steps[index] = { ...this.#state.steps[index], status: "completed", progress: 1, error: undefined };
      this.#state.currentIndex++;
      this.#recalculate();
      this.#emit();
      await this.#advance();
    } catch (error) {
      const code = errorCode(error);
      this.#state.steps[index] = { ...this.#state.steps[index], status: "failed", progress: null, error: code };
      this.#state.status = "failed";
      this.#state.error = code;
      this.#emit();
    }
  }

  reorderReviewAssets(assetIds: string[]): void {
    if (!this.#atInputReview()) return;
    if (assetIds.length !== this.#context.assetIds.length || assetIds.some((id) => !this.#context.assetIds.includes(id))) return;
    this.#context.assetIds = [...assetIds];
    this.#context.originalAssetIds = [...assetIds];
    this.#initialAssetIds = [...assetIds];
    this.#emit();
  }

  /**
   * Swap the screenshots a started run uses. While the input review is still open nothing
   * downstream has used them, so they change in place. Once a later step has run, its work
   * belongs to the old inputs: the run restarts from the first step with the recipe's current
   * settings. Fewer inputs than the recipe needs returns the run to idle. Never while a step
   * is executing: its adapter would finish into the new run's context.
   */
  async replaceInputs(assetIds: string[]): Promise<InputChangeEffect> {
    const effect = this.inputChangeEffect(assetIds.length);
    const { max } = this.#recipe.input;
    const next = max ? assetIds.slice(0, max) : [...assetIds];
    if (effect === "reset") this.reset();
    if (effect === "updated") {
      this.#context.assetIds = [...next];
      this.#context.originalAssetIds = [...next];
      this.#initialAssetIds = [...next];
      this.#emit();
    }
    if (effect === "restarted") {
      await this.cancel();
      await this.start(next);
    }
    return effect;
  }

  /** What `replaceInputs` would do with this many screenshots, without doing it. */
  inputChangeEffect(count: number): InputChangeEffect {
    if (this.#state.status === "idle") return "idle";
    if (this.#state.status === "running" || this.#busy) return "busy";
    if (count < this.#recipe.input.min) return "reset";
    return this.#atInputReview() ? "updated" : "restarted";
  }

  /** Abandon the current run without recording it and return to the not-started state. */
  reset(): void {
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#initialAssetIds = [];
    this.#context = { runId: this.id, originalAssetIds: [], assetIds: [], outputIds: [], data: {}, checks: [] };
    this.#state = this.#freshState();
    this.#emit();
  }

  async retry(): Promise<void> {
    if (this.#state.status !== "failed") return;
    const index = this.#state.currentIndex;
    this.#state.steps[index] = { ...this.#state.steps[index], status: "pending", progress: null, error: undefined };
    this.#state.status = "running";
    this.#state.error = undefined;
    this.#abort = new AbortController();
    this.#emit();
    await this.#advance();
  }

  async skip(): Promise<void> {
    const index = this.#state.currentIndex;
    const step = this.#recipe.steps[index];
    if (!step?.optional || !(["waiting-review", "failed"] as const).includes(this.#state.status as "waiting-review" | "failed")) return;
    this.#state.steps[index] = { ...this.#state.steps[index], status: "skipped", progress: 1, error: undefined };
    this.#state.currentIndex++;
    this.#state.status = "running";
    this.#state.error = undefined;
    this.#recalculate();
    this.#emit();
    await this.#advance();
  }

  async cancel(): Promise<void> {
    if (["completed", "cancelled", "idle"].includes(this.#state.status)) return;
    this.#abort.abort();
    const step = this.#recipe.steps[this.#state.currentIndex];
    if (step) await this.#adapters[step.action]?.cancel?.();
    if (this.#state.steps[this.#state.currentIndex]) this.#state.steps[this.#state.currentIndex] = { ...this.#state.steps[this.#state.currentIndex], status: "cancelled", progress: null };
    this.#state.status = "cancelled";
    this.#emit();
  }

  async restart(): Promise<void> {
    await this.cancel();
    await this.start(this.#initialAssetIds);
  }

  toSession(): WorkflowSessionSummary | null {
    if (!(this.#state.status === "completed" || this.#state.status === "cancelled" || this.#state.status === "failed")) return null;
    return {
      id: this.id,
      recipeId: this.#recipe.id,
      recipeName: this.#recipe.name,
      status: this.#state.status,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      assetIds: [...this.#context.assetIds],
      outputIds: [...this.#context.outputIds],
      checks: [...this.#context.checks],
    };
  }

  #atInputReview(): boolean {
    return this.#state.status === "waiting-review" && this.#recipe.steps[this.#state.currentIndex]?.action === "input";
  }

  #freshState(): WorkflowExecutionState {
    return { recipeId: this.#recipe.id, status: "idle", currentIndex: 0, progress: 0, steps: this.#recipe.steps.map((step) => ({ id: step.id, status: step.enabled === false ? "skipped" : "pending", progress: step.enabled === false ? 1 : null })) };
  }

  async #advance(): Promise<void> {
    if (this.#busy || this.#state.status !== "running") return;
    this.#busy = true;
    try {
      while (this.#state.currentIndex < this.#recipe.steps.length && this.#state.status === "running") {
        const index = this.#state.currentIndex;
        const step = this.#recipe.steps[index];
        if (step.enabled === false) {
          this.#state.currentIndex++;
          this.#recalculate();
          continue;
        }
        if (step.review) {
          this.#state.steps[index] = { ...this.#state.steps[index], status: "review", progress: null };
          this.#state.status = "waiting-review";
          this.#emit();
          return;
        }
        const adapter = this.#adapters[step.action];
        if (!adapter) throw Object.assign(new Error(`No adapter for ${step.action}`), { code: "WORKFLOW_ADAPTER_MISSING" });
        this.#state.steps[index] = { ...this.#state.steps[index], status: "running", progress: 0, error: undefined };
        this.#emit();
        try {
          const result = await adapter.execute(step, {
            ...this.#context,
            signal: this.#abort.signal,
            reportProgress: (progress) => {
              if (this.#state.currentIndex !== index || this.#state.status !== "running") return;
              this.#state.steps[index] = { ...this.#state.steps[index], progress: Math.max(0, Math.min(1, progress)) };
              this.#recalculate();
              this.#emit();
            },
          });
          if (this.#abort.signal.aborted) return;
          this.#merge(result);
          this.#state.steps[index] = { ...this.#state.steps[index], status: "completed", progress: 1 };
          this.#state.currentIndex++;
          this.#recalculate();
          this.#emit();
        } catch (error) {
          if (this.#abort.signal.aborted) return;
          const code = errorCode(error);
          this.#state.steps[index] = { ...this.#state.steps[index], status: "failed", progress: null, error: code };
          this.#state.status = "failed";
          this.#state.error = code;
          this.#emit();
          return;
        }
      }
      if (this.#state.currentIndex >= this.#recipe.steps.length && this.#state.status === "running") {
        this.#state.status = "completed";
        this.#state.progress = 1;
        this.#emit();
      }
    } finally {
      this.#busy = false;
    }
  }

  #merge(result: WorkflowStepResult): void {
    if (result.assetIds) this.#context.assetIds = [...result.assetIds];
    if (result.outputIds) this.#context.outputIds = [...new Set([...this.#context.outputIds, ...result.outputIds])];
    if (result.data) this.#context.data = { ...this.#context.data, ...result.data };
    if (result.checks) this.#context.checks = [...new Set([...this.#context.checks, ...result.checks])];
  }

  #recalculate(): void {
    const completed = this.#state.steps.reduce((sum, step) => sum + (step.status === "completed" || step.status === "skipped" ? 1 : step.status === "running" && step.progress !== null ? step.progress : 0), 0);
    this.#state.progress = this.#state.steps.length ? completed / this.#state.steps.length : 0;
  }

  #emit(): void { for (const listener of this.#listeners) listener(this.snapshot); }
}
