import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";

const STEPS = [
  { title: "Pick the result you want", body: "Choose a workflow by its outcome — a safe copy to share, a product image, a bug report — and add the screenshots it needs." },
  { title: "Shotexa guides each step", body: "Steps run in order. Where a decision is yours, such as what to hide or how an image should look, the workflow stops and waits for you." },
  { title: "Download the result", body: "Every workflow ends with the files it made, ready to download — or to open in another Shotexa tool." },
];

const FAQ = [
  { q: "Are my screenshots uploaded?", a: "No. Workflows use the same in-browser engines as the individual tools. Steps that read text or remove a background download their recognition data or model the first time; your screenshots are never sent with that request." },
  { q: "Can I change the screenshot after I’ve started?", a: "Yes. Use Change or Remove in “Your screenshots”. If no step has used it yet, it changes in place. Otherwise Shotexa starts the steps again with the new screenshot and keeps the settings you chose." },
  { q: "Can I leave out a step?", a: "Optional steps can be switched off before you start, or skipped when the workflow reaches them. Steps that the result depends on always run." },
  { q: "What does a custom workflow save?", a: "Its steps, their order and their settings, in this browser. Screenshots and generated files are never saved with it." },
  { q: "What happens to my files when I close the tab?", a: "Screenshots and results live only in the open tab and are cleared when you close or reload it, so download what you need first." },
];

/** Server-rendered explanation under the workflow cards — what the feature is, for people and search. */
export function WorkflowsExplainer() {
  return (
    <>
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20" aria-labelledby="workflows-what">
        <div className="mx-auto grid max-w-[1100px] gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="t-micro text-accent-ink">About workflows</p>
            <h2 id="workflows-what" className="t-h1 mt-3">One guided job instead of several tools</h2>
            <p className="t-body mt-4 text-ink-2">A Shotexa workflow connects several screenshot tools into one process. Instead of opening a redaction tool, then a metadata cleaner, then a compressor, you choose the result you want and Shotexa takes your screenshot through each step in order.</p>
            <p className="t-body mt-3 text-ink-2">Use one to prepare a screenshot for safe sharing, create a polished product image, build a bug report, turn screenshots into documentation, get an image ready for the web, or compare two screenshots for visual QA.</p>
          </div>
          <ol className="grid gap-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
                <span aria-hidden className="t-mono inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-dark text-[12px] text-white">{index + 1}</span>
                <div>
                  <h3 className="t-h3">{step.title}</h3>
                  <p className="t-body-sm mt-1 text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="py-16 sm:py-20" aria-label="Workflow questions">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Workflows," accent="answered" />
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {FAQ.map((item) => (
              <div key={item.q} className="px-5 py-4">
                <dt className="font-display text-[1.0625rem]">{item.q}</dt>
                <dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="t-body-sm mt-6 text-center text-ink-2">
            Prefer one tool at a time? <Link href="/tools" className="text-accent-ink underline-offset-4 hover:underline">Browse every Shotexa tool</Link> or read <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">how local processing works</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
