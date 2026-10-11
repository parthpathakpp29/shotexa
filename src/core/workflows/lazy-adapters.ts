/**
 * A workflow's adapters reach into every tool engine Shotexa has — the structured-data
 * exporters, the Beautifier presets, the privacy detectors, the archive writer. None of that
 * is needed to show the recipe list, so loading it with the page would put tens of kilobytes
 * of tool logic into the /workflows chunk, and from there into anything that merely links to
 * /workflows (Next prefetches those links).
 *
 * This wraps the real adapter map in one that loads it on first use. The engine keeps the
 * exact contract it had: every supported action still has an adapter, and an action with no
 * real implementation still fails with WORKFLOW_ADAPTER_MISSING — just when it runs rather
 * than when the engine is constructed.
 */
import type { WorkflowAdapterMap, WorkflowStepAdapter } from "./types";
import { SUPPORTED_WORKFLOW_ACTIONS } from "./validate";

export function lazyWorkflowAdapters(load: () => Promise<WorkflowAdapterMap>): WorkflowAdapterMap {
  let pending: Promise<WorkflowAdapterMap> | null = null;
  let resolved: WorkflowAdapterMap | null = null;
  const adapters = () => (resolved ? Promise.resolve(resolved) : (pending ??= load().then((map) => (resolved = map))));

  const map: WorkflowAdapterMap = {};
  for (const action of SUPPORTED_WORKFLOW_ACTIONS) {
    const adapter: WorkflowStepAdapter = {
      async execute(step, context) {
        const real = (await adapters())[step.action];
        if (!real) throw Object.assign(new Error(`No adapter for ${step.action}`), { code: "WORKFLOW_ADAPTER_MISSING" });
        return real.execute(step, context);
      },
      async cancel() {
        // Never force the load just to cancel: if nothing has run, there is nothing to stop.
        await resolved?.[action]?.cancel?.();
      },
    };
    map[action] = adapter;
  }
  return map;
}
