import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { TOOL_CONTENT } from "@/config/tool-content";
import { continuationsFor, TOOLS, type ToolId } from "@/config/tools";
import { WORKFLOW_GUIDES } from "@/config/workflow-guides";
import { workflowById } from "@/core/workflows/recipes";

const STEP_COLUMNS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * The explanation under a tool's uploader: what it does, how it works, when to use it,
 * privacy, formats, questions and where to go next. Server-rendered from `TOOL_CONTENT`, so
 * it adds no client JavaScript and never touches a tool engine.
 */
export function ToolEducation({ tool }: { tool: ToolId }) {
  const content = TOOL_CONTENT[tool];
  const t = TOOLS[tool];
  const related = continuationsFor(tool).slice(0, 4);
  const workflows = (content.workflows ?? []).map((id) => workflowById(id)).filter((recipe) => !!recipe);
  return (
    <div data-testid="tool-education">
      <section aria-labelledby="tool-what" className="border-t border-line bg-surface-3/60 py-14 sm:py-20">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          <div>
            <p className="t-micro text-accent-ink">About this tool</p>
            <h2 id="tool-what" className="t-h1 mt-3">{content.whatHeading}</h2>
            <p className="t-body mt-4 text-ink-2">{content.intro}</p>
          </div>
          <aside aria-label={`${t.name} at a glance`} className="rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
            <h3 className="t-micro text-ink-3">Exports</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="tool-outputs">
              {content.outputs.map((format) => <li key={format} className="t-mono rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink">{format}</li>)}
            </ul>
            <h3 className="t-micro mt-5 text-ink-3">Works with</h3>
            <p className="t-body-sm mt-1 text-ink">{t.minFiles === 2 ? "Two or more PNG, JPEG or WebP images" : "PNG, JPEG and WebP images"}</p>
            <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden className="size-4 text-accent" /> Privacy and processing</h3>
            <p className="t-body-sm mt-1.5 text-ink-2">{content.privacy}</p>
            <Link href="/privacy" className="mt-1 inline-flex min-h-10 items-center text-sm text-accent-ink underline-offset-4 hover:underline">How Shotexa keeps files local</Link>
          </aside>
        </div>
      </section>

      <section aria-labelledby="tool-how" className="py-14 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <h2 id="tool-how" className="t-h1">How it works</h2>
          <ol className={`mt-8 grid gap-4 sm:grid-cols-2 ${STEP_COLUMNS[content.steps.length] ?? "lg:grid-cols-3"}`}>
            {content.steps.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                <span aria-hidden className="t-mono inline-flex size-7 items-center justify-center rounded-full bg-dark text-[12px] text-white">{index + 1}</span>
                <h3 className="t-h3 mt-4">{step.title}</h3>
                <p className="t-body-sm mt-2 text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="tool-when" className="border-t border-line bg-surface-3/60 py-14 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <h2 id="tool-when" className="t-h1">When to use it</h2>
          <ul className={`mt-8 grid gap-4 sm:grid-cols-2 ${content.useCases.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {content.useCases.map((item) => (
              <li key={item.title} className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                <h3 className="t-h3">{item.title}</h3>
                <p className="t-body-sm mt-2 text-ink-2">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="tool-faq" className="py-14 sm:py-20">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <h2 id="tool-faq" className="t-h1">Questions about {t.name}</h2>
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {content.faq.map((item) => (
              <div key={item.q} className="px-5 py-4">
                <dt className="font-display text-[1.0625rem]">{item.q}</dt>
                <dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {(related.length > 0 || workflows.length > 0) && (
        <section aria-labelledby="tool-related" className="border-t border-line py-14 sm:py-20" data-testid="tool-related">
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
            <h2 id="tool-related" className="t-h1">{workflows.length ? "Related tools and workflows" : "Related tools"}</h2>
            {related.length > 0 && (
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((id) => (
                  <li key={id}>
                    <Link href={TOOLS[id].route} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-accent-line">
                      <span className="inline-flex size-9 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent"><ToolIcon name={TOOLS[id].icon} className="size-4" /></span>
                      <span className="mt-4 font-display text-lg">{TOOLS[id].name}</span>
                      <span className="t-body-sm mt-1 flex-1 text-ink-2">{TOOLS[id].summary}</span>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {workflows.length > 0 && (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {workflows.map((recipe) => (
                  <li key={recipe.id}>
                    <Link href={`/workflows?workflow=${recipe.id}`} className="group flex h-full items-start gap-4 rounded-xl border border-dashed border-line-strong bg-surface-3 p-5 transition-colors hover:border-accent">
                      <span className="t-micro shrink-0 rounded-sm bg-dark px-2 py-1 text-[10px] text-white">Workflow</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg">{recipe.name}</span>
                        <span className="t-body-sm mt-1 block text-ink-2">{WORKFLOW_GUIDES[recipe.id]?.outcome ?? recipe.description}</span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">Start workflow <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
