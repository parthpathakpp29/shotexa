import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { TOOLS } from "@/config/tools";

const QUESTIONS = [
  { q: "Are Blur and Pixelate permanent redaction?", a: "They visually obscure an area, but Blackout is the mode designed to permanently replace selected pixels in the exported copy." },
  { q: "Does Shotexa upload my screenshot?", a: "No. Editing, export, metadata cleaning and verification run locally in your browser." },
  { q: "Can I undo a redaction?", a: "Yes. Regions remain logical, editable operations until export. Undo and redo never store full raster snapshots." },
];

export function PrivacyLanding({ tool }: { tool: "safe-share" | "blur" }) {
  const t = TOOLS[tool];
  return (
    <ToolLanding tool={tool} dropHint="or drag and drop a PNG, JPEG or WebP screenshot here">
      <section className="border-t border-line bg-surface-3/60 py-16">
        <div className="mx-auto max-w-[1060px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Hide details, then" accent="verify the copy" />
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              ["Select", "Draw one or more rectangles over information you do not want to share."],
              ["Choose a mode", "Use Blur or Pixelate for visual obscuring, or Blackout to replace the selected pixels."],
              ["Export safely", "Shotexa flattens the edits, encodes the image, removes privacy metadata and verifies the result."],
            ].map(([title, body], i) => <li key={title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono text-accent-ink">0{i + 1}</span><h2 className="t-h3 mt-3">{title}</h2><p className="t-body-sm mt-2 text-ink-2">{body}</p></li>)}
          </ol>
          <p className="t-body-sm mt-6 text-center text-ink-2">Your screenshot files stay on your device. <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">Read how local processing works.</Link></p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <SectionHeading eyebrow="Questions" title={t.name} accent="answered" />
          <dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {QUESTIONS.map((item) => <div key={item.q} className="px-5 py-4"><dt className="font-display text-[1.0625rem]">{item.q}</dt><dd className="t-body-sm mt-1.5 text-ink-2">{item.a}</dd></div>)}
          </dl>
        </div>
      </section>
      <section className="border-t border-line bg-surface-3/60 py-12">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <p className="t-micro text-accent-ink">Related tools</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={tool === "safe-share" ? "/blur-screenshot" : "/redact-screenshot"} className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">
              {tool === "safe-share" ? "Blur Screenshot" : "Safe Share"}
            </Link>
            <Link href="/remove-image-metadata" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Remove Image Metadata</Link>
            <Link href="/stitch-screenshots" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Smart Stitch</Link>
          </div>
        </div>
      </section>
    </ToolLanding>
  );
}
