import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";

const QUESTIONS = [
  { q: "Does Shotexa upload my screenshots?", a: "No. Pagination and PDF creation happen in your browser. Screenshot bytes are not sent to a Shotexa processing server." },
  { q: "What does Smart Pagination change?", a: "It looks near each expected page boundary for whitespace and visual separators, then moves the cut when that avoids splitting content. Every suggested break remains editable." },
  { q: "Does PDF conversion run OCR?", a: "No. Normal PDF and Smart Pagination do not load OCR. Use Searchable PDF when you need an OCR text layer for searching and selecting text." },
  { q: "Can I combine several screenshots?", a: "Yes. Add several screenshots, reorder them in the Files panel, and Shotexa places their pages in that order." },
];

export function PdfLanding() {
  return (
    <ToolLanding tool="pdf" dropHint="or drag and drop PNG, JPEG or WebP screenshots here">
      <section className="border-t border-line bg-surface-3/60 py-16">
        <div className="mx-auto max-w-[1060px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="A better cut for" accent="long screenshots" />
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              ["Add screenshots", "Paste, drop or choose one or more screenshots. Existing Shotexa results can be used without another upload."],
              ["Review the pages", "Choose A4, Letter or Fit. Smart Pagination finds nearby whitespace and flags uncertain breaks for review."],
              ["Adjust and export", "Drag or nudge any break, then create a valid PDF locally and keep it in the workspace."],
            ].map(([title, body], index) => <li key={title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono text-accent-ink">0{index + 1}</span><h2 className="t-h3 mt-3">{title}</h2><p className="t-body-sm mt-2 text-ink-2">{body}</p></li>)}
          </ol>
          <p className="t-body-sm mt-6 text-center text-ink-2">PDF creation runs locally in your browser. <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">Read how local processing works.</Link></p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Screenshot PDFs" accent="answered" />
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
            <Link href="/screenshot-to-text" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Extract Text</Link>
            <Link href="/screenshot-to-searchable-pdf" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Searchable PDF</Link>
            <Link href="/redact-screenshot" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Safe Share</Link>
          </div>
        </div>
      </section>
    </ToolLanding>
  );
}
