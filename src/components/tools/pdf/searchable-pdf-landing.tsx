import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";

const QUESTIONS = [
  { q: "Does a searchable PDF change how my screenshot looks?", a: "No. Shotexa keeps the screenshot as the visible PDF page and places an invisible OCR text layer over it for search and selection." },
  { q: "Will Shotexa run OCR again?", a: "Only when a selected screenshot has no structured OCR result. Existing results from Screenshot to Text are reused without another recognition job." },
  { q: "Is edited OCR text used in the PDF layer?", a: "No. The searchable layer uses the original OCR words and geometry. Your edited text remains available for Copy and TXT, where it is reliable." },
  { q: "Do screenshots or OCR text leave my device?", a: "No. OCR, page planning, font embedding and PDF creation run locally in your browser." },
];

export function SearchablePdfLanding() {
  return (
    <ToolLanding tool="searchable-pdf" dropHint="or drag and drop PNG, JPEG or WebP screenshots here">
      <section className="border-t border-line bg-surface-3/60 py-16">
        <div className="mx-auto max-w-[1060px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Screenshot fidelity with" accent="searchable text" />
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              ["Add screenshots", "Paste, drop or choose screenshots. Smart Stitch and Safe Share results carry into this workspace without another upload."],
              ["Prepare text and pages", "Reuse existing OCR or extract it locally, then review Smart Pagination and adjust any uncertain break."],
              ["Export searchable PDF", "Shotexa keeps each screenshot as the page image and adds a local, invisible English or Hindi text layer."],
            ].map(([title, body], index) => <li key={title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono text-accent-ink">0{index + 1}</span><h2 className="t-h3 mt-3">{title}</h2><p className="t-body-sm mt-2 text-ink-2">{body}</p></li>)}
          </ol>
          <p className="t-body-sm mt-6 text-center text-ink-2">OCR and PDF creation run locally in your browser. <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">Read how local processing works.</Link></p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Searchable PDFs" accent="answered" />
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {QUESTIONS.map((item) => <div key={item.q} className="px-5 py-4"><dt className="font-display text-[1.0625rem]">{item.q}</dt><dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd></div>)}
          </dl>
        </div>
      </section>
      <section className="border-t border-line bg-surface-3/60 py-12">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <p className="t-micro text-accent-ink">Related tools</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/screenshot-to-text" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Extract Text</Link>
            <Link href="/screenshot-to-pdf" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Screenshot to PDF</Link>
            <Link href="/stitch-screenshots" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Smart Stitch</Link>
          </div>
        </div>
      </section>
    </ToolLanding>
  );
}

