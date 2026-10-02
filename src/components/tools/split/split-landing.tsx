import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { continuationsFor, TOOLS } from "@/config/tools";

const STEPS = [
  { title: "Add a long screenshot", body: "Paste, drop or choose an image — or open a Smart Stitch, Combine or edited result without uploading it again." },
  { title: "Choose where to cut", body: "Split into equal sections, every so many pixels, or at your own lines. Drag, add and remove lines; every change can be undone." },
  { title: "Export every piece", body: "Each piece is cut from the original at full resolution. Download them one by one or all at once." },
];

const QA = [
  { q: "Will I lose any part of my screenshot?", a: "No. The pieces meet exactly at each split line, so every row of the original appears in exactly one piece — nothing is cut away or repeated." },
  { q: "Can I choose where each cut goes?", a: "Yes. Start from an equal split and drag any line, or switch to Custom and click the image to place your own lines." },
  { q: "Are my screenshots uploaded?", a: "No. Splitting and exporting happen in your browser. Your screenshot is not sent to a server." },
  { q: "Which formats can I export?", a: "PNG (the lossless default), JPEG and WebP. Very tall pieces are saved as PNG." },
];

export function SplitLanding() {
  const related = continuationsFor("split").slice(0, 4);
  return (
    <ToolLanding tool="split" dropHint="or drag and drop a long screenshot to cut it into several images">
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Cut a Long Screenshot" accent="in Three Steps" />
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
          <SectionHeading eyebrow="Questions" title="Splitting," accent="answered" />
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
