"use client";

import { ArrowRight, Copy, Download, FileOutput, History, ListChecks, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/primitives";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { guideFor } from "@/config/workflow-guides";
import { loadCustomRecipes, saveCustomRecipes } from "@/core/workflows/persistence";
import { BUILT_IN_WORKFLOWS, workflowById } from "@/core/workflows/recipes";
import { workflowOutputsFor } from "@/core/workflows/output-registry";
import type { WorkflowRecipe } from "@/core/workflows/types";
import { cn } from "@/lib/cn";
import { WorkflowPipeline } from "./workflow-overview";
import { cloneRecipe, downloadOutputs, iconFor, newCustomRecipe } from "./workflow-shared";

/**
 * The landing is all that /workflows needs up front — and all that a page linking here
 * prefetches. The runner (with every step's settings and the tool renderers it loads) and the
 * custom-workflow builder arrive only when someone opens one.
 */
function Opening() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50dvh] items-center justify-center gap-2.5 text-sm text-ink-2">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      Opening…
    </div>
  );
}
const WorkflowRunner = dynamic(() => import("./workflow-runner").then((module) => module.WorkflowRunner), { ssr: false, loading: Opening });
const CustomRecipeBuilder = dynamic(() => import("./workflow-builder").then((module) => module.CustomRecipeBuilder), { ssr: false, loading: Opening });

/** `/workflows?workflow=safe-share` opens a built-in workflow directly (links from tool pages). */
const WORKFLOW_PARAM = "workflow";

function syncWorkflowParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(WORKFLOW_PARAM, id);
  else url.searchParams.delete(WORKFLOW_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** `explainer` and `footer` are server-rendered by the page and shown only on the landing. */
export function WorkflowsApp({ explainer, footer }: { explainer?: ReactNode; footer?: ReactNode }) {
  const { runtime } = useWorkspaceContext();
  const outputs = useMemo(() => workflowOutputsFor(runtime), [runtime]);
  const [selected, setSelected] = useState<WorkflowRecipe | null>(null);
  const [custom, setCustom] = useState<WorkflowRecipe[]>([]);
  const [builder, setBuilder] = useState<WorkflowRecipe | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Browser-only state (saved workflows, a ?workflow= link) is read after hydration. A timeout,
  // not a frame: frames don't run in a tab that isn't being painted, and a link opened in a
  // background tab must still land on its workflow.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCustom(loadCustomRecipes(window.localStorage));
      const linked = workflowById(new URLSearchParams(window.location.search).get(WORKFLOW_PARAM) ?? "");
      if (linked) setSelected(cloneRecipe(linked));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function persist(next: WorkflowRecipe[]) { setCustom(next); saveCustomRecipes(window.localStorage, next); }
  function open(recipe: WorkflowRecipe) {
    setSelected(cloneRecipe(recipe));
    syncWorkflowParam(recipe.builtIn ? recipe.id : null);
    window.scrollTo({ top: 0 });
  }
  function exit() {
    setSelected(null);
    setHistoryVersion((value) => value + 1);
    syncWorkflowParam(null);
  }
  if (selected) return <WorkflowRunner key={selected.id} recipe={selected} onExit={exit} />;
  if (builder) return <><WorkspaceSiteHeader /><CustomRecipeBuilder initial={builder} onCancel={() => setBuilder(null)} onSave={(recipe) => { persist([...custom.filter((item) => item.id !== recipe.id), recipe]); setBuilder(null); }} /></>;

  const recent = outputs.sessions();
  void historyVersion;
  return <>
    <WorkspaceSiteHeader />
    <main data-testid="workflows-landing">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
        <SectionHeading level={1} eyebrow="Workflows" className="max-w-4xl" title="What do you want to do" accent="with your screenshot?" lead="Each workflow connects several Shotexa tools into one guided job. It stops whenever you need to decide something, and your screenshots stay on this device." />
        <ul className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {BUILT_IN_WORKFLOWS.map((recipe) => <li key={recipe.id}><WorkflowCard recipe={recipe} onOpen={() => open(recipe)} /></li>)}
          <li>
            <article className="relative flex h-full min-h-60 flex-col rounded-xl border border-dashed border-line-strong bg-surface-3 p-6 transition hover:border-accent focus-within:border-accent">
              <span className="inline-flex size-11 items-center justify-center rounded-md bg-dark text-white"><Plus aria-hidden /></span>
              <h2 className="mt-5 font-display text-2xl"><button type="button" onClick={() => setBuilder(newCustomRecipe())} className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">Custom workflow</button></h2>
              <p className="t-body-sm mt-2 flex-1 text-ink-2">Put your own steps in order — resize, compress, convert, remove the background and more — and run them again later. Shotexa saves the steps and settings in this browser, never your screenshots.</p>
              <span aria-hidden className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">Build a workflow <ArrowRight className="size-4" /></span>
            </article>
          </li>
        </ul>
        {custom.length > 0 && <section className="mt-14" aria-labelledby="custom-workflows-title">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="custom-workflows-title" className="t-h2">Your workflows</h2><Button onClick={() => setBuilder(newCustomRecipe())}><Plus /> New workflow</Button></div>
          <p className="t-body-sm mt-1 text-ink-2">Saved in this browser. They remember steps and settings — not screenshots.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{custom.map((recipe) => <article key={recipe.id} className="rounded-lg border border-line bg-surface p-5 shadow-xs">
            <h3 className="font-display text-xl">{recipe.name}</h3>
            <p className="t-body-sm mt-1 text-ink-2">{recipe.steps.filter((step) => step.enabled !== false && step.action !== "input").map((step) => step.name).join(" → ") || "No steps yet"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => open(recipe)}><Play /> Run</Button>
              <Button size="sm" onClick={() => setBuilder(cloneRecipe(recipe))}><Pencil /> Edit</Button>
              <Button size="sm" onClick={() => persist([...custom, { ...cloneRecipe(recipe), id: `custom:${crypto.randomUUID()}`, name: `${recipe.name} copy` }])}><Copy /> Duplicate</Button>
              <Button size="sm" variant="ghost" className="text-error hover:bg-error-soft hover:text-error" aria-label={`Delete ${recipe.name}`} onClick={() => persist(custom.filter((item) => item.id !== recipe.id))}><Trash2 /> Delete</Button>
            </div>
          </article>)}</div>
        </section>}
        {recent.length > 0 && <section className="mt-14" aria-labelledby="recent-workflows-title"><div className="flex items-center gap-3"><History aria-hidden className="size-5 text-accent" /><h2 id="recent-workflows-title" className="t-h2">Recent workflows</h2></div><ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">{recent.map((session) => <li key={session.id} className="flex min-h-16 items-center gap-3 px-4 py-3"><span aria-hidden className={cn("size-2 rounded-full", session.status === "completed" ? "bg-success" : session.status === "failed" ? "bg-error" : "bg-ink-3")} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{session.recipeName}</strong><span className="t-body-sm capitalize text-ink-2">{session.status}</span></span>{session.outputIds.length > 0 && <Button size="sm" onClick={() => downloadOutputs(outputs, session.outputIds)}><Download /> Download again</Button>}</li>)}</ul></section>}
      </div>
      {explainer}
    </main>
    {footer}
  </>;
}

/** Outcome first; the whole card opens the workflow through the heading's button. */
function WorkflowCard({ recipe, onOpen }: { recipe: WorkflowRecipe; onOpen(): void }) {
  const guide = guideFor(recipe);
  const optional = recipe.steps.filter((step) => step.optional).length;
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-surface shadow-xs transition hover:-translate-y-0.5 hover:border-accent-line hover:shadow-sm focus-within:border-accent">
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent [&_svg]:size-5">{iconFor(recipe)}</span>
          <span className="t-mono inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-3 px-2.5 py-1 text-[11px] text-ink-2" data-testid="workflow-card-steps">
            <ListChecks aria-hidden className="size-3.5 text-ink-3" />
            {recipe.steps.length} steps{optional ? ` · ${optional} optional` : ""}
          </span>
        </div>
        <h2 className="mt-4 font-display text-2xl"><button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{recipe.name}</button></h2>
        <p className="mt-1.5 text-[15px] leading-snug text-ink">{guide.outcome}</p>
        <div className="mt-4 rounded-lg bg-surface-3/70 p-3">
          <p className="t-micro mb-2 text-ink-3">How it runs</p>
          <WorkflowPipeline recipe={recipe} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-[13px]" data-testid="workflow-card-output">
          <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><FileOutput className="size-3.5" /></span>
          <span className="min-w-0"><span className="t-micro block text-[10px] text-ink-3">You get</span><span className="block font-medium leading-snug text-ink">{guide.output.formats}</span></span>
        </p>
        <span aria-hidden className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent-ink">Start <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </article>
  );
}
