import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";

const STEPS = [
  { title: "Add your screenshots in order", body: "Paste, drop or choose two or more overlapping captures — top to bottom, as you scrolled. You can reorder them later." },
  { title: "Review the automatic join", body: "Smart Stitch finds where they overlap and shows how confident it is. Check the seam in normal, overlay or difference view and move it if needed." },
  { title: "Export at full resolution", body: "The final image is built from your original files on your device. Very tall results are written in sections so they don’t run out of memory." },
];

const QA = [
  { q: "Why are fixed headers not repeated?", a: "Bars that stay in place while you scroll — like app headers, tab bars or chat inputs — are detected and kept only once, at the top and bottom of the result." },
  { q: "What if the automatic result is wrong?", a: "Use Adjust manually: drag the seam line, use the arrow keys, or type an exact position. Undo and redo work for every change." },
  { q: "Are my screenshots uploaded?", a: "No. Stitching happens in your browser. Nothing is sent to a server, and the files are cleared when you close the tab." },
];

export function StitchLanding() {
  return (
    <ToolLanding tool="stitch" dropHint="or drag and drop two or more overlapping screenshots here">
      <section className="border-t border-line bg-surface-3/60 py-16 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Three steps to" accent="one long screenshot" />
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
          <SectionHeading eyebrow="Questions" title="Stitching," accent="answered" />
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
    </ToolLanding>
  );
}
