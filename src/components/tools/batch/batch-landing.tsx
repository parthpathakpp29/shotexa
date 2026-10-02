import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { continuationsFor, TOOLS } from "@/config/tools";

const STEPS = [
  { title: "Choose your screenshots", body: "Paste, drop or choose two or more PNG, JPEG or WebP files. Existing Shotexa results are ready without another upload." },
  { title: "Pick one operation", body: "Compress, convert, resize or remove privacy metadata with one clear set of settings for the batch." },
  { title: "Download one ZIP", body: "Shotexa processes one full-resolution image at a time, keeps failures isolated and packages successful results locally." },
];

const QA = [
  { q: "Why does Shotexa process files one at a time?", a: "A decoded screenshot can use far more memory than its file size. Sequential work is safer on phones and Safari, and one failed file does not stop the rest." },
  { q: "What happens if one image fails?", a: "Completed files stay available. The failed item is excluded from the ZIP and can be retried after you change the settings." },
  { q: "Are images or the ZIP uploaded?", a: "No. Processing and ZIP creation run in your browser. Your files are not sent to Shotexa servers." },
  { q: "Which batch operations are supported?", a: "V1 supports Compress, Convert, Resize and Privacy Clean. OCR, PDF, annotations and region redaction remain individual workflows." },
];

export function BatchLanding() {
  const related = continuationsFor("batch");
  return (
    <ToolLanding tool="batch" dropHint="or drag and drop several screenshots to process them together">
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="One Safe Queue" accent="One ZIP" />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => <li key={step.title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono inline-flex size-7 items-center justify-center rounded-full bg-dark text-[12px] text-white">{i + 1}</span><h3 className="t-h3 mt-4">{step.title}</h3><p className="t-body-sm mt-2 text-ink-2">{step.body}</p></li>)}
          </ol>
        </div>
      </section>
      <section className="py-16 sm:py-20"><div className="mx-auto max-w-[760px] px-4 sm:px-6"><SectionHeading eyebrow="Questions" title="Good to" accent="know" /><dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">{QA.map((item) => <div key={item.q} className="px-5 py-4"><dt className="font-display text-[1.0625rem]">{item.q}</dt><dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd></div>)}</dl></div></section>
      {related.length > 0 && <section className="border-t border-line py-16 sm:py-20"><div className="mx-auto max-w-[1100px] px-4 sm:px-6"><SectionHeading eyebrow="Related tools" title="Continue with" accent="one result" /><ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((id) => <li key={id}><Link href={TOOLS[id].route} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-xs hover:border-accent-line"><ToolIcon name={TOOLS[id].icon} className="size-5 text-accent" /><span className="mt-4 font-display text-lg">{TOOLS[id].name}</span><span className="t-body-sm mt-1 flex-1 text-ink-2">{TOOLS[id].summary}</span><span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">Open <ArrowRight className="size-4" /></span></Link></li>)}</ul></div></section>}
    </ToolLanding>
  );
}
