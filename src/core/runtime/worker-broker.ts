/**
 * WorkerBroker — one lazily created worker per dependency family (architecture §24), with
 * lifetime control (Spike B/C/D): heavy workers can be released after large jobs, and the
 * OpenCV (vision) worker is released before full-resolution composition so its ~190–330 MiB
 * runtime never coexists with an export.
 *
 * A worker's script — and therefore its dependencies — is only fetched on its first job.
 */
import { createWorkerClient, WorkerJobError, type RunOptions } from "@/workers/broker/worker-client";
import type { OpName, WorkerOps } from "@/workers/protocol";

export type WorkerKind = "image" | "vision" | "document" | "background" | "privacy";
type Client = ReturnType<typeof createWorkerClient>;

export class WorkerBroker {
  #clients = new Map<WorkerKind, Client>();
  #factories: Record<WorkerKind, () => Worker>;
  /** Kinds that have run at least one job (diagnostics/tests). */
  readonly started = new Set<WorkerKind>();
  /** While the page is being left, no job may start (and no worker script may begin loading). */
  #suspended = false;

  constructor(factories: Record<WorkerKind, () => Worker>) {
    this.#factories = factories;
  }

  run<K extends OpName>(kind: WorkerKind, op: K, input: WorkerOps[K]["input"], opts?: RunOptions): Promise<WorkerOps[K]["output"]> {
    if (this.#suspended) return Promise.reject(new WorkerJobError("CANCELLED"));
    let c = this.#clients.get(kind);
    if (!c) {
      c = createWorkerClient(this.#factories[kind]);
      this.#clients.set(kind, c);
    }
    this.started.add(kind);
    return c.run(op, input, opts);
  }

  /** Refuse new jobs (page being left); `resume` after a back/forward-cache restore. */
  suspend(): void {
    this.#suspended = true;
  }

  resume(): void {
    this.#suspended = false;
  }

  /** Terminate a worker (frees its heap); the next job recreates it. */
  release(kind: WorkerKind): void {
    this.#clients.get(kind)?.terminate();
    this.#clients.delete(kind);
  }

  dispose(): void {
    for (const k of [...this.#clients.keys()]) this.release(k);
  }
}

export function browserWorkerFactories(): Record<WorkerKind, () => Worker> {
  return {
    image: () => new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module", name: "shotexa-image" }),
    vision: () => new Worker(new URL("../../workers/vision.worker.ts", import.meta.url), { type: "module", name: "shotexa-vision" }),
    document: () => new Worker(new URL("../../workers/document.worker.ts", import.meta.url), { type: "module", name: "shotexa-document" }),
    background: () => new Worker(new URL("../../workers/background.worker.ts", import.meta.url), { type: "module", name: "shotexa-background" }),
    privacy: () => new Worker(new URL("../../workers/privacy.worker.ts", import.meta.url), { type: "module", name: "shotexa-privacy" }),
  };
}
