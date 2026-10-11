import type { WorkflowOutput, WorkflowSessionSummary } from "./types";

const id = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export class WorkflowOutputRegistry {
  #blobs = new Map<string, Blob>();
  #outputs = new Map<string, WorkflowOutput>();
  #urls = new Map<string, string>();
  #sessions = new Map<string, WorkflowSessionSummary>();

  put(blob: Blob, name: string): WorkflowOutput {
    const output: WorkflowOutput = { id: id(), name, type: blob.type || "application/octet-stream", bytes: blob.size, createdAt: Date.now() };
    this.#blobs.set(output.id, blob);
    this.#outputs.set(output.id, output);
    return output;
  }

  blob(outputId: string): Blob | undefined { return this.#blobs.get(outputId); }
  output(outputId: string): WorkflowOutput | undefined { return this.#outputs.get(outputId); }
  outputs(ids: string[]): WorkflowOutput[] { return ids.map((outputId) => this.#outputs.get(outputId)).filter((item): item is WorkflowOutput => !!item); }

  objectUrl(outputId: string): string | undefined {
    const blob = this.#blobs.get(outputId);
    if (!blob) return undefined;
    const current = this.#urls.get(outputId);
    if (current) return current;
    const url = URL.createObjectURL(blob);
    this.#urls.set(outputId, url);
    return url;
  }

  saveSession(session: WorkflowSessionSummary): void { this.#sessions.set(session.id, { ...session, assetIds: [...session.assetIds], outputIds: [...session.outputIds], checks: [...session.checks] }); }
  session(sessionId: string): WorkflowSessionSummary | undefined { return this.#sessions.get(sessionId); }
  sessions(): WorkflowSessionSummary[] { return [...this.#sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt); }

  remove(outputId: string): void {
    const url = this.#urls.get(outputId);
    if (url) URL.revokeObjectURL(url);
    this.#urls.delete(outputId);
    this.#blobs.delete(outputId);
    this.#outputs.delete(outputId);
  }

  clear(): void {
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear();
    this.#blobs.clear();
    this.#outputs.clear();
    this.#sessions.clear();
  }

  stats() { return { outputs: this.#outputs.size, sessions: this.#sessions.size, bytes: [...this.#blobs.values()].reduce((sum, blob) => sum + blob.size, 0) }; }
}

const REGISTRIES = new WeakMap<object, WorkflowOutputRegistry>();

/** Session-only workflow resources associated with the existing workspace runtime. */
export function workflowOutputsFor(runtime: object): WorkflowOutputRegistry {
  const current = REGISTRIES.get(runtime);
  if (current) return current;
  const registry = new WorkflowOutputRegistry();
  REGISTRIES.set(runtime, registry);
  return registry;
}

export function releaseWorkflowOutputs(runtime: object): void {
  REGISTRIES.get(runtime)?.clear();
  REGISTRIES.delete(runtime);
}
