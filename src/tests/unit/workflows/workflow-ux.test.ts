import { describe, expect, it, vi } from "vitest";
import { TOOL_CONTENT } from "@/config/tool-content";
import { LIVE_TOOLS, TOOLS } from "@/config/tools";
import { ACTION_COPY, guideFor, inputRequirement, WORKFLOW_GUIDES } from "@/config/workflow-guides";
import { WorkflowEngine } from "@/core/workflows/engine";
import { BUILT_IN_WORKFLOWS, workflowById } from "@/core/workflows/recipes";
import type { WorkflowRecipe, WorkflowStepAdapter, WorkflowStepDefinition } from "@/core/workflows/types";
import { SUPPORTED_WORKFLOW_ACTIONS } from "@/core/workflows/validate";

const adapter = (fn: WorkflowStepAdapter["execute"]): WorkflowStepAdapter => ({ execute: fn });

function recipe(steps: WorkflowStepDefinition[], input: WorkflowRecipe["input"] = { min: 1, max: 2, accepts: ["image/png", "image/jpeg", "image/webp"], label: "One or two" }): WorkflowRecipe {
  return { id: "custom:inputs", name: "Inputs", description: "Input changes", icon: "wand", category: "custom", input, steps, output: { kind: "image", filename: "out.png" } };
}

const inputReview: WorkflowStepDefinition = { id: "input", name: "Choose", description: "Choose", action: "input", config: {}, review: true };
const inputAuto: WorkflowStepDefinition = { id: "input", name: "Choose", description: "Choose", action: "input", config: {} };
const resize: WorkflowStepDefinition = { id: "resize", name: "Resize", description: "Resize", action: "resize", config: { width: 100 } };
const reviewCompress: WorkflowStepDefinition = { id: "compress", name: "Compress", description: "Compress", action: "compress", config: {}, review: true };

describe("changing a workflow's screenshots", () => {
  it("does nothing to the engine before a run starts", async () => {
    const engine = new WorkflowEngine(recipe([inputAuto]), { input: adapter(async () => ({})) });
    expect(engine.inputChangeEffect(1)).toBe("idle");
    expect(await engine.replaceInputs(["a"])).toBe("idle");
    expect(engine.snapshot.state.status).toBe("idle");
  });

  it("updates in place while the input review is open — nothing downstream has run", async () => {
    const resizeRun = vi.fn(async () => ({}));
    const engine = new WorkflowEngine(recipe([inputReview, resize]), { input: adapter(async (_s, c) => ({ assetIds: c.assetIds })), resize: adapter(resizeRun) });
    await engine.start(["a", "b"]);
    expect(engine.snapshot.state.status).toBe("waiting-review");
    expect(await engine.replaceInputs(["b", "c"])).toBe("updated");
    expect(engine.snapshot.context.originalAssetIds).toEqual(["b", "c"]);
    expect(engine.snapshot.context.assetIds).toEqual(["b", "c"]);
    expect(engine.snapshot.state.currentIndex).toBe(0);
    expect(resizeRun).not.toHaveBeenCalled();
  });

  it("restarts from the first step once a later step has used the old screenshots, keeping settings", async () => {
    const seen: string[] = [];
    const engine = new WorkflowEngine(recipe([inputAuto, resize, reviewCompress]), {
      input: adapter(async (_s, c) => { seen.push(`input:${c.assetIds.join(",")}`); return {}; }),
      resize: adapter(async (step, c) => { seen.push(`resize:${c.assetIds.join(",")}:${(step.config as { width?: number }).width}`); return { assetIds: [`${c.assetIds[0]}-small`] }; }),
      compress: adapter(async () => ({})),
    });
    await engine.start(["old"]);
    expect(engine.snapshot.state.status).toBe("waiting-review");
    engine.configure(recipe([inputAuto, { ...resize, config: { width: 64 } } as WorkflowStepDefinition, reviewCompress]));
    expect(engine.inputChangeEffect(1)).toBe("restarted");
    expect(await engine.replaceInputs(["new"])).toBe("restarted");
    expect(seen).toEqual(["input:old", "resize:old:100", "input:new", "resize:new:64"]);
    expect(engine.snapshot.context.originalAssetIds).toEqual(["new"]);
    expect(engine.snapshot.context.assetIds).toEqual(["new-small"]);
    expect(engine.snapshot.state.status).toBe("waiting-review");
    // Restart uses the new screenshots too.
    await engine.restart();
    expect(seen.at(-2)).toBe("input:new");
  });

  it("returns to not-started when fewer screenshots remain than the workflow needs", async () => {
    const engine = new WorkflowEngine(recipe([inputReview]), { input: adapter(async () => ({})) });
    await engine.start(["a"]);
    expect(await engine.replaceInputs([])).toBe("reset");
    expect(engine.snapshot.state.status).toBe("idle");
    expect(engine.snapshot.context.originalAssetIds).toEqual([]);
    expect(engine.snapshot.context.outputIds).toEqual([]);
  });

  it("refuses to change screenshots while a step is executing", async () => {
    let release: () => void = () => undefined;
    const engine = new WorkflowEngine(recipe([inputAuto, resize]), {
      input: adapter(async () => ({})),
      resize: adapter(() => new Promise((resolve) => { release = () => resolve({}); })),
    });
    const run = engine.start(["a"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.snapshot.state.status).toBe("running");
    expect(await engine.replaceInputs(["b"])).toBe("busy");
    expect(engine.snapshot.context.originalAssetIds).toEqual(["a"]);
    release();
    await run;
    expect(engine.snapshot.state.status).toBe("completed");
  });

  it("keeps the recorded inputs in the reviewed order", async () => {
    const engine = new WorkflowEngine(recipe([inputReview]), { input: adapter(async () => ({})) });
    await engine.start(["a", "b"]);
    engine.reorderReviewAssets(["b", "a"]);
    expect(engine.snapshot.context.originalAssetIds).toEqual(["b", "a"]);
  });

  it("caps replacements at the workflow's maximum", async () => {
    const engine = new WorkflowEngine(recipe([inputReview]), { input: adapter(async () => ({})) });
    await engine.start(["a"]);
    await engine.replaceInputs(["a", "b", "c"]);
    expect(engine.snapshot.context.originalAssetIds).toEqual(["a", "b"]);
  });
});

describe("workflow guides", () => {
  it("explain every built-in workflow in outcome terms", () => {
    for (const workflow of BUILT_IN_WORKFLOWS) {
      const guide = WORKFLOW_GUIDES[workflow.id];
      expect(guide, workflow.id).toBeDefined();
      expect(guide.outcome.length).toBeGreaterThan(20);
      expect(guide.helps.length).toBeGreaterThanOrEqual(3);
      expect(guide.pipeline.length).toBeGreaterThanOrEqual(3);
      expect(guide.output.summary).toBeTruthy();
      expect(guide.output.formats).toBeTruthy();
      expect(workflow.description).toBe(guide.outcome);
    }
  });

  it("describe every step in plain language — no internal names", () => {
    for (const workflow of BUILT_IN_WORKFLOWS) {
      for (const step of workflow.steps) {
        expect(step.description.length, `${workflow.id}/${step.id}`).toBeGreaterThan(15);
        expect(`${step.name} ${step.description}`).not.toMatch(/adapter|renderer|checkpoint|Beautifier Pro|\bInput\b/);
      }
    }
  });

  it("have progress and review copy for every supported action", () => {
    for (const action of SUPPORTED_WORKFLOW_ACTIONS) {
      const copy = ACTION_COPY[action];
      expect(copy.running, action).toMatch(/…$/);
      expect(copy.review, action).toBeTruthy();
      expect(copy.running).not.toMatch(/adapter|executing/i);
    }
  });

  it("fall back to the recipe itself for custom workflows", () => {
    const custom = recipe([inputAuto, resize]);
    const guide = guideFor(custom);
    expect(guide.outcome).toBe(custom.description);
    expect(guide.pipeline).toEqual(["Resize"]);
  });

  it("state input requirements in words", () => {
    expect(inputRequirement(workflowById("safe-share")!)).toBe("Uses one screenshot");
    expect(inputRequirement(workflowById("product-screenshot")!)).toBe("Uses one to three screenshots");
    expect(inputRequirement(workflowById("visual-qa-report")!)).toBe("Uses two screenshots");
    expect(inputRequirement(workflowById("documentation-pack")!)).toBe("Uses one or more screenshots");
  });
});

describe("tool page education content", () => {
  const BANNED = /powerful|seamless|revolutionary|unparalleled|robust|stunning|highly regarded|ideal solution|comprehensive|free online screenshot tool/i;

  it("exists for every live tool, with a sensible amount of each section", () => {
    for (const id of LIVE_TOOLS) {
      const content = TOOL_CONTENT[id];
      expect(content, id).toBeDefined();
      expect(content.steps.length, id).toBeGreaterThanOrEqual(3);
      expect(content.steps.length, id).toBeLessThanOrEqual(5);
      expect(content.useCases.length, id).toBeGreaterThanOrEqual(2);
      expect(content.useCases.length, id).toBeLessThanOrEqual(4);
      expect(content.faq.length, id).toBeGreaterThanOrEqual(3);
      expect(content.faq.length, id).toBeLessThanOrEqual(5);
      expect(content.outputs.length, id).toBeGreaterThan(0);
      expect(content.privacy, id).toMatch(/browser|device/);
      expect(content.whatHeading.startsWith("What "), id).toBe(true);
      const sentences = content.intro.split(/(?<=[.!?])\s+/).length;
      expect(sentences, id).toBeGreaterThanOrEqual(2);
      expect(sentences, id).toBeLessThanOrEqual(4);
    }
  });

  it("is written for each tool, not shared boilerplate", () => {
    const intros = LIVE_TOOLS.map((id) => TOOL_CONTENT[id].intro);
    const questions = LIVE_TOOLS.flatMap((id) => TOOL_CONTENT[id].faq.map((item) => item.q));
    const headings = LIVE_TOOLS.map((id) => TOOL_CONTENT[id].whatHeading);
    expect(new Set(intros).size).toBe(intros.length);
    expect(new Set(questions).size).toBe(questions.length);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("avoids filler marketing language", () => {
    for (const id of LIVE_TOOLS) expect(JSON.stringify(TOOL_CONTENT[id]), id).not.toMatch(BANNED);
    expect(JSON.stringify(WORKFLOW_GUIDES)).not.toMatch(BANNED);
  });

  it("links only to workflows that exist", () => {
    for (const id of LIVE_TOOLS) {
      for (const workflow of TOOL_CONTENT[id].workflows ?? []) expect(workflowById(workflow), `${id} → ${workflow}`).toBeDefined();
    }
  });

  it("never claims an upload or a cloud fallback", () => {
    for (const id of LIVE_TOOLS) {
      const text = `${TOOL_CONTENT[id].privacy} ${TOOL_CONTENT[id].faq.map((item) => item.a).join(" ")}`;
      expect(text, id).not.toMatch(/\b(we|is|are) uploaded to|cloud|our servers?/i);
      expect(TOOLS[id].status).toBe("live");
    }
  });
});
