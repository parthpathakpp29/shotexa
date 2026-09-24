"use client";

import { useEffect, useState } from "react";
import { runExperiment, type ExecContext, type ExperimentName, type ExperimentOutput } from "@/spikes/memory/experiments";

declare global {
  interface Window {
    spikeB?: {
      run(ctx: ExecContext, name: ExperimentName, params: unknown): Promise<ExperimentOutput & { maxMainStallMs: number }>;
      /** Terminate the experiment worker (tests "recycle heavy worker after a job"). */
      recycle(): void;
    };
  }
}

/**
 * Exposes `window.spikeB.run(ctx, name, params)` for the runner. Measures the longest
 * main-thread stall (heartbeat gap) during each experiment, which is what users feel as
 * a frozen tab.
 */
export function MemoryHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let worker: Worker | null = null;
    let seq = 0;
    const pending = new Map<number, (r: ExperimentOutput) => void>();
    const getWorker = () => {
      if (worker) return worker;
      worker = new Worker(new URL("../../../spikes/memory/memory.worker.ts", import.meta.url), { type: "module", name: "spike-b" });
      worker.addEventListener("message", (e: MessageEvent<{ id: number; result: ExperimentOutput }>) => {
        pending.get(e.data.id)?.(e.data.result);
        pending.delete(e.data.id);
      });
      return worker;
    };

    window.spikeB = {
      recycle() {
        worker?.terminate();
        worker = null;
        pending.clear();
      },
      async run(ctx, name, params) {
        let last = performance.now();
        let maxGap = 0;
        const beat = setInterval(() => {
          const now = performance.now();
          maxGap = Math.max(maxGap, now - last);
          last = now;
        }, 10);
        try {
          const result =
            ctx === "main"
              ? await runExperiment("main", location.origin, name, params)
              : await new Promise<ExperimentOutput>((resolve) => {
                  const id = ++seq;
                  pending.set(id, resolve);
                  getWorker().postMessage({ id, name, params });
                });
          maxGap = Math.max(maxGap, performance.now() - last);
          return { ...result, maxMainStallMs: Math.round(maxGap) };
        } finally {
          clearInterval(beat);
        }
      },
    };
    queueMicrotask(() => setReady(true));
    return () => {
      worker?.terminate();
      delete window.spikeB;
    };
  }, []);

  return (
    <main className="p-4 font-mono text-sm">
      <h1 className="font-bold">Spike B — memory harness</h1>
      <p data-testid="harness-ready">{ready ? "ready" : "loading"}</p>
    </main>
  );
}
