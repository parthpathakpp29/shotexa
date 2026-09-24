import { PROTOCOL_VERSION, type OpName, type WorkerErrorCode, type WorkerOps, type WorkerRequest, type WorkerResponse } from "../protocol";

export class WorkerJobError extends Error {
  constructor(readonly code: WorkerErrorCode | "CANCELLED" | "WORKER_CRASHED") {
    super(code);
    this.name = "WorkerJobError";
  }
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number, stage?: string) => void;
}

/**
 * Minimal main-thread client for one dependency-specific worker. The worker is created
 * lazily on first use so its dependencies (e.g. OpenCV) cost 0 bytes until then.
 * Seed of the future WorkerBroker (architecture §24).
 */
export function createWorkerClient(factory: () => Worker) {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: unknown): void; onProgress?: RunOptions["onProgress"] }>();

  const ensure = () => {
    if (worker) return worker;
    worker = factory();
    worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const job = pending.get(msg.jobId);
      if (!job) return;
      if (msg.type === "PROGRESS") return job.onProgress?.(msg.progress, msg.stage);
      pending.delete(msg.jobId);
      if (msg.type === "SUCCESS") job.resolve(msg.output);
      else if (msg.type === "CANCELLED") job.reject(new WorkerJobError("CANCELLED"));
      else job.reject(new WorkerJobError(msg.code));
    });
    worker.addEventListener("error", () => {
      for (const job of pending.values()) job.reject(new WorkerJobError("WORKER_CRASHED"));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  };

  return {
    run<K extends OpName>(op: K, input: WorkerOps[K]["input"], opts: RunOptions = {}): Promise<WorkerOps[K]["output"]> {
      const w = ensure();
      const jobId = `${op}:${++seq}`;
      return new Promise((resolve, reject) => {
        pending.set(jobId, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts.onProgress });
        opts.signal?.addEventListener("abort", () => w.postMessage({ version: PROTOCOL_VERSION, jobId, type: "CANCEL" } satisfies WorkerRequest), { once: true });
        w.postMessage({ version: PROTOCOL_VERSION, jobId, type: "RUN", op, input } as WorkerRequest);
      });
    },
    /** Hard termination — fallback for a stuck worker only. */
    terminate() {
      worker?.terminate();
      worker = null;
      for (const job of pending.values()) job.reject(new WorkerJobError("CANCELLED"));
      pending.clear();
    },
  };
}
