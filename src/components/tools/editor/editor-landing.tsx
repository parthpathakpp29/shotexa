import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { continuationsFor, TOOLS } from "@/config/tools";

const STEPS = [
  { title: "Add a screenshot", body: "Paste, drop or choose an image — or open a result from another Shotexa tool without uploading it again." },
  { title: "Crop, rotate, flip or resize", body: "Drag the crop box or type exact values. Every change can be undone, and nothing touches your original." },
  { title: "Export at full resolution", body: "The result is rendered from your original file on your device and saved as a new image." },
];

const QA = [
  { q: "Will editing change my original screenshot?", a: "No. Edits are kept as instructions until you export. Exporting creates a new image and your original stays exactly as it was." },
  { q: "Does resizing lose quality?", a: "Making an image smaller keeps it sharp. Making it larger than the original adds pixels but not detail, and Shotexa tells you when that happens." },
  { q: "Are my screenshots uploaded?", a: "No. Cropping, rotating, flipping and resizing all happen in your browser. Your screenshot is not sent to a server." },
  { q: "Which formats can I export?", a: "PNG (the lossless default), JPEG and WebP. Very tall results — such as long stitched screenshots — are saved as PNG." },
];

export function EditorLanding() {
  const related = continuationsFor("editor").slice(0, 4);
  return (
    <ToolLanding tool="editor" dropHint="or drag and drop a screenshot to crop, rotate or resize it">
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Crop, Rotate and Resize" accent="Without Uploading" />
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
          <SectionHeading eyebrow="Questions" title="Editing," accent="answered" />
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
