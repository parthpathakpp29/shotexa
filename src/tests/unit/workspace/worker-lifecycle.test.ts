/** Workers while the page is being left: no new jobs, and handled worker errors stay handled. */
import { describe, expect, it, vi } from "vitest";
import { WorkerBroker } from "@/core/runtime/worker-broker";
import { createWorkerClient, WorkerJobError } from "@/workers/broker/worker-client";

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  postMessage(message: unknown) { this.posted.push(message); }
  terminate = vi.fn();
}

describe("WorkerBroker suspension", () => {
  it("refuses jobs while suspended without creating a worker, and accepts them again after resume", async () => {
    const factory = vi.fn(() => new FakeWorker() as unknown as Worker);
    const broker = new WorkerBroker({ image: factory, vision: factory, document: factory, background: factory });
    broker.suspend();
    await expect(broker.run("image", "image.preview", {} as never)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(factory).not.toHaveBeenCalled();
    broker.resume();
    void broker.run("image", "image.preview", {} as never).catch(() => undefined);
    expect(factory).toHaveBeenCalledOnce();
    broker.dispose();
  });
});

describe("worker client errors", () => {
  it("rejects waiting jobs and marks the error event handled", async () => {
    const worker = new FakeWorker();
    const client = createWorkerClient(() => worker as unknown as Worker);
    const job = client.run("image.preview", {} as never);
    const error = new Event("error", { cancelable: true });
    worker.dispatchEvent(error);
    await expect(job).rejects.toBeInstanceOf(WorkerJobError);
    await expect(job).rejects.toMatchObject({ code: "WORKER_CRASHED" });
    expect(error.defaultPrevented).toBe(true);
    expect(worker.terminate).toHaveBeenCalled();
  });
});
