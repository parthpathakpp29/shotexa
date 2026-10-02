import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { continuationsFor, TOOLS } from "@/config/tools";
import type { EncodeTool } from "@/core/image-encode/types";

const COPY: Record<EncodeTool, { drop: string; heading: [string, string]; steps: { title: string; body: string }[]; qa: { q: string; a: string }[] }> = {
  compress: {
    drop: "or drag and drop a screenshot to make it smaller",
    heading: ["Make a Screenshot Smaller", "in Three Steps"],
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose a PNG, JPEG or WebP — or open a result from another Shotexa tool without uploading it again." },
      { title: "Pick format and quality", body: "Keep the format or choose JPEG or WebP, set the quality, and check the exact file size before you download." },
      { title: "Download the smaller file", body: "See the original and new size side by side. The same pixel dimensions, encoded on your device." },
    ],
    qa: [
      { q: "How much smaller will my screenshot get?", a: "It depends on the image. Shotexa encodes it on your device and shows the exact new size and the percentage saved before you download — and says so plainly if a setting would make the file larger." },
      { q: "Why is there no quality slider for PNG?", a: "PNG is lossless: the browser keeps every pixel exactly and has no quality setting. For a much smaller file, choose WebP or JPEG." },
      { q: "Are my screenshots uploaded?", a: "No. Compression happens in your browser. Your screenshot is not sent to a server." },
      { q: "Does compressing change the image size?", a: "No. The width and height stay the same; only the file gets smaller. Re-encoding normally omits source metadata; use Privacy Clean when you need a verified metadata check." },
    ],
  },
  convert: {
    drop: "or drag and drop a screenshot to convert it",
    heading: ["Convert PNG, JPEG and WebP", "Without Uploading"],
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose a PNG, JPEG or WebP — or open a result from another Shotexa tool without uploading it again." },
      { title: "Choose the new format", body: "Convert to PNG, JPEG or WebP. Pick a quality for JPEG and WebP, and a background for transparent images going to JPEG." },
      { title: "Download it", body: "The converted file has exactly the same pixel dimensions as the original, and your original stays unchanged." },
    ],
    qa: [
      { q: "What happens to transparent areas when I convert to JPEG?", a: "JPEG can't store transparency, so transparent areas are filled with a background you choose — white by default, or black, cream or any custom colour. PNG and WebP keep transparency." },
      { q: "Will converting change the dimensions?", a: "No. The converted image has the same width and height. WebP holds at most 16,383 px per side, so very long screenshots can be converted to PNG or JPEG, or split first." },
      { q: "Are my screenshots uploaded?", a: "No. Conversion happens in your browser. Your screenshot is not sent to a server." },
      { q: "Which formats are supported?", a: "PNG, JPEG and WebP, in any direction." },
    ],
  },
};

export function EncodeLanding({ tool }: { tool: EncodeTool }) {
  const copy = COPY[tool];
  const related = continuationsFor(tool).slice(0, 4);
  return (
    <ToolLanding tool={tool} dropHint={copy.drop}>
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title={copy.heading[0]} accent={copy.heading[1]} />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {copy.steps.map((s, i) => (
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
            {copy.qa.map((x) => (
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
