import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { continuationsFor, TOOLS } from "@/config/tools";

const STEPS = [
  { title: "Add a screenshot", body: "Paste, drop or choose an image — or open a result from another Shotexa tool without uploading it again." },
  { title: "Pick a style", body: "Put it on a background, inside a plain browser window, or in a generic phone frame. Adjust padding, corners, shadow and size." },
  { title: "Export at full resolution", body: "The composition is drawn from your original pixels on your device and saved as a new image." },
];

const QA = [
  { q: "Is my screenshot stretched to fit a frame?", a: "Never. The screenshot keeps its proportions. In the phone frame you choose whether to fill the screen — which trims the edges — or fit the whole screenshot, which leaves space above and below." },
  { q: "Are these real browser or phone designs?", a: "No. The frames are plain, generic shapes drawn by Shotexa. They carry no company's logo and copy no particular device." },
  { q: "Does the address bar show my real URL?", a: "Only if you type one. Shotexa never reads a URL out of your screenshot; the bar starts with a neutral placeholder." },
  { q: "Are my screenshots uploaded?", a: "No. The composition is drawn in your browser. Your screenshot is not sent to a server." },
];

export function BeautifyLanding() {
  const related = continuationsFor("beautify").slice(0, 4);
  return (
    <ToolLanding tool="beautify" dropHint="or drag and drop a screenshot to put it on a background or in a frame">
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Make a Screenshot Presentable" accent="in Three Steps" />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-6 shadow-xs">
                <span className="t-mono inline-flex size-7 items-center justify-center rounded-full bg-dark text-[12px] text-white">{i + 1}</span>
                <h3 className="t-h3 mt-4">{s.title}</h3>
                <p className="t-body-sm mt-2 text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Good to" accent="know" />
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {QA.map((x) => (
              <div key={x.q} className="px-5 py-4">
                <dt className="font-display text-[1.0625rem]">{x.q}</dt>
                <dd className="t-body-sm mt-1.5 text-ink-2">{x.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      {related.length > 0 && (
        <section className="border-t border-line py-16 sm:py-20">
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
            <SectionHeading eyebrow="Related tools" title="Then take it" accent="further" />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((id) => (
                <li key={id}>
                  <Link href={TOOLS[id].route} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-accent-line">
                    <span className="inline-flex size-9 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent">
                      <ToolIcon name={TOOLS[id].icon} className="size-4" />
                    </span>
                    <span className="mt-4 font-display text-lg">{TOOLS[id].name}</span>
                    <span className="t-body-sm mt-1 flex-1 text-ink-2">{TOOLS[id].summary}</span>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                      Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </ToolLanding>
  );
}
