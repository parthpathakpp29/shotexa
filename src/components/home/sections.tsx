/**
 * Homepage content sections (server components). Copy is deliberately factual: only what
 * Shotexa actually does, no invented users, logos, certifications or offline claims.
 */
import { Check, Minus, SlidersHorizontal, Sparkles, Lock, ClipboardPaste, FileText, Rows2, ScanText, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, SectionHeading } from "@/components/ui/primitives";
import { SITE } from "@/config/site";
import { ChooseScreenshotsButton } from "./choose-button";
import { Uploader } from "@/components/workspace/uploader";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-soft),transparent)]" />
      <div className="relative mx-auto max-w-[880px] px-4 pb-20 pt-12 text-center sm:px-6 sm:pt-16">
        <Badge tone="neutral" className="bg-surface">
          <span className="text-accent-ink">Screenshot workspace</span>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          Runs in your browser
        </Badge>
        <h1 className="t-display mt-6">
          Everything You Need for <em className="text-accent">Screenshots</em>
        </h1>
        <p className="t-body mx-auto mt-5 max-w-xl text-ink-2">Stitch screenshots, hide sensitive information, extract text and compile PDFs — directly in your browser.</p>
        <Uploader className="mx-auto mt-10 max-w-2xl" multipleHint="or drag and drop multiple screenshots anywhere in this area" />
      </div>
    </section>
  );
}

const PRINCIPLES: { icon: ReactNode; title: string; body: string; points: string[] }[] = [
  {
    icon: <Sparkles />,
    title: "Smart",
    body: "Shotexa looks at what you add and suggests the right next step — like joining screenshots that overlap.",
    points: ["Overlap detection", "Repeated headers and footers handled", "Confidence shown, never hidden"],
  },
  {
    icon: <SlidersHorizontal />,
    title: "Controllable",
    body: "Every automatic result can be reviewed and adjusted before you export it.",
    points: ["Move the join by hand", "Overlay and difference views", "Undo and redo"],
  },
  {
    icon: <Lock />,
    title: "Private",
    body: "Screenshots are processed by your browser on your device, not on our servers.",
    points: ["No upload for processing", "No account needed", "Cleared when you close the tab"],
  },
];

export function PrinciplesSection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <SectionHeading eyebrow="Core principles" title="Smart. Controllable." accent="Private." lead="Automatic where it helps, precise controls when you need them, and private by default." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <article key={p.title} className="rounded-xl border border-line bg-surface p-6 shadow-xs">
              <span className="inline-flex size-10 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent [&_svg]:size-[18px]">{p.icon}</span>
              <h3 className="t-h3 mt-5">{p.title}</h3>
              <p className="t-body-sm mt-2 text-ink-2">{p.body}</p>
              <ul className="mt-5 space-y-2 rounded-md border border-line bg-surface-3 p-3.5">
                {p.points.map((x) => (
                  <li key={x} className="flex items-center gap-2 text-[13px] text-ink">
                    <Check aria-hidden className="size-3.5 shrink-0 text-accent" /> {x}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const ACTIONS: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <ClipboardPaste />, title: "Paste or drop", body: "Add screenshots straight from your clipboard or files." },
  { icon: <Rows2 />, title: "Smart Stitch", body: "Join overlapping captures into one continuous image." },
  { icon: <ShieldCheck />, title: "Safe Share", body: "Black out personal details and remove metadata." },
  { icon: <ScanText />, title: "Extract Text", body: "Copy the text from the result." },
  { icon: <FileText />, title: "Export PDF", body: "Save a document with clean page breaks." },
];

export function ContinuousSection() {
  return (
    <section className="border-y border-line bg-surface-3/60 py-20 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <SectionHeading eyebrow="Effortless multi-tasking" title="One Screenshot," accent="Continuous Actions" lead="Each result stays in your workspace, ready for the next tool — no downloading and re-uploading in between." />
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ACTIONS.map((a, i) => (
            <li key={a.title} className="relative rounded-lg border border-line bg-surface p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="t-micro text-accent-ink">Step {i + 1}</span>
                <span aria-hidden className="text-ink-3 [&_svg]:size-[18px]">
                  {a.icon}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg">{a.title}</h3>
              <p className="t-body-sm mt-1.5 text-ink-2">{a.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const COMPARISON: { feature: string; shotexa: string; upload: string }[] = [
  { feature: "Where files are processed", shotexa: "In your browser, on your device", upload: "On the provider’s servers" },
  { feature: "Upload needed", shotexa: "No", upload: "Yes" },
  { feature: "Account needed", shotexa: "No", upload: "Often" },
  { feature: "What happens to your files", shotexa: "Cleared when you close or refresh the tab", upload: "Depends on the provider’s retention policy" },
  { feature: "Stitch review", shotexa: "Confidence, seam view and manual adjustment", upload: "Varies" },
];

export function PrivacySection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <SectionHeading eyebrow="Privacy & security" title="Built to Protect" accent="Your Private Data" lead="Many online image tools upload your screenshots to a server to process them. Shotexa does the work inside your browser instead." />
        <div className="mt-12 overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">How Shotexa compares with upload-based image tools</caption>
            <thead>
              <tr className="border-b border-line bg-surface-3">
                <th scope="col" className="t-micro px-5 py-4 font-normal text-ink-3">
                  Feature
                </th>
                <th scope="col" className="t-micro bg-accent-soft/60 px-5 py-4 font-normal text-accent-ink">
                  Shotexa · in your browser
                </th>
                <th scope="col" className="t-micro px-5 py-4 font-normal text-ink-3">
                  Typical upload-based tools
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((r) => (
                <tr key={r.feature} className="border-b border-line last:border-0">
                  <th scope="row" className="px-5 py-4 font-medium text-ink">
                    {r.feature}
                  </th>
                  <td className="bg-accent-soft/30 px-5 py-4 text-ink">
                    <span className="inline-flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" /> {r.shotexa}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-2">
                    <span className="inline-flex items-start gap-2">
                      <Minus aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" /> {r.upload}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: "How does Shotexa work without uploading my screenshots?",
    a: "Shotexa runs inside your web browser. When you paste or choose a screenshot, the file is read into this tab’s memory and processed with your browser’s own image engine — it isn’t sent to a server for processing.",
  },
  {
    q: "What happens to my screenshots when I leave?",
    a: "They stay available while you move between Shotexa tools in the same tab. Closing or refreshing the tab clears them. Shotexa doesn’t save your screenshots anywhere.",
  },
  {
    q: "How does Smart Stitch find the overlap?",
    a: "It compares neighbouring screenshots to find where the content repeats, ignoring fixed headers and footers that appear in every capture. It tells you how confident it is, and you can move the join yourself before exporting.",
  },
  {
    q: "Which formats and sizes are supported?",
    a: "PNG, JPEG and WebP. There’s no fixed limit on the number of screenshots; very large images depend on your device’s memory. Tall stitched images are exported as PNG in sections so they don’t exhaust memory, and Shotexa tells you if something is too large to process.",
  },
];

export function FaqSection() {
  return (
    <section className="border-t border-line bg-surface-3/60 py-20 sm:py-24">
      <div className="mx-auto max-w-[760px] px-4 sm:px-6">
        <SectionHeading eyebrow="Common questions" title="Frequently Asked" accent="Questions" lead="Everything you need to know about how Shotexa keeps your screenshots private and simple." />
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-lg border border-line bg-surface shadow-xs">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-[1.0625rem] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="t-mono text-ink-3 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="t-body-sm border-t border-line px-5 py-4 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto flex max-w-[1100px] flex-col items-start justify-between gap-8 rounded-xl bg-dark p-8 text-white shadow-md sm:p-12 md:flex-row md:items-center">
        <div>
          <p className="t-micro text-[#f0a584]">Ready to start</p>
          <h2 className="t-h1 mt-3 text-white">
            Paste Any Screenshot to <em className="text-[#f0a584]">Begin</em>
          </h2>
          <p className="t-body mt-3 text-white/70">No account, no upload. {SITE.trustLine}.</p>
        </div>
        <ChooseScreenshotsButton />
      </div>
    </section>
  );
}
