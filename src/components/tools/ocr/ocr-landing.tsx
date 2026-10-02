import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";

const QUESTIONS = [
  { q: "Does Shotexa upload my screenshot or extracted text?", a: "No. The screenshot, OCR model and extracted text stay in your browser. Shotexa does not send either to a screenshot-processing server." },
  { q: "Which languages are available?", a: "English is the default. English + Hindi is optional and its additional language model loads only after you select it and start extraction." },
  { q: "Can I correct the extracted text?", a: "Yes. The result is editable before you copy it or download a TXT file. Complex layouts can need small reading-order corrections." },
];

export function OcrLanding() {
  return (
    <ToolLanding tool="extract-text" dropHint="or drag and drop a PNG, JPEG or WebP screenshot here">
      <section className="border-t border-line bg-surface-3/60 py-16">
        <div className="mx-auto max-w-[1060px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From screenshot to" accent="editable text" />
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              ["Add a screenshot", "Paste, drop or choose one screenshot. If several are in the workspace, Shotexa reads the selected one."],
              ["Extract locally", "Choose English or English + Hindi, then run OCR in a dedicated browser worker."],
              ["Review and use", "Correct any mistakes, copy the text, download TXT or continue with another Shotexa tool."],
            ].map(([title, body], index) => <li key={title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono text-accent-ink">0{index + 1}</span><h2 className="t-h3 mt-3">{title}</h2><p className="t-body-sm mt-2 text-ink-2">{body}</p></li>)}
          </ol>
          <p className="t-body-sm mt-6 text-center text-ink-2">OCR runs locally in your browser. <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">Read how local processing works.</Link></p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Screenshot OCR" accent="answered" />
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {QUESTIONS.map((item) => <div key={item.q} className="px-5 py-4"><dt className="font-display text-[1.0625rem]">{item.q}</dt><dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd></div>)}
          </dl>
        </div>
      </section>
      <section className="border-t border-line bg-surface-3/60 py-12">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <p className="t-micro text-accent-ink">Related tools</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/stitch-screenshots" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Smart Stitch</Link>
            <Link href="/redact-screenshot" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Redact Screenshot</Link>
            <Link href="/screenshot-to-pdf" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Screenshot to PDF</Link>
          </div>
        </div>
      </section>
    </ToolLanding>
  );
}
