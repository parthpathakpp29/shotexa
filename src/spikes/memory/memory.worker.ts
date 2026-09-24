/// <reference lib="webworker" />
/** Spike B worker: runs one experiment per message. Spike harness only — not production. */
import { runExperiment, type ExperimentName } from "./experiments";

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener("message", async (e: MessageEvent<{ id: number; name: ExperimentName; params: unknown }>) => {
  const { id, name, params } = e.data;
  self.postMessage({ id, result: await runExperiment("worker", self.location.origin, name, params) });
});
