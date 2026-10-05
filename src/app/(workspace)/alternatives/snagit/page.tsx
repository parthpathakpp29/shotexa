import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { ToolIcon } from "@/components/brand";
import { TOOLS } from "@/config/tools";

export const metadata = staticMetadata("/alternatives/snagit");

const TABLE_DATA = [
  { feature: "Native screenshot capture", shotexa: "No", competitor: "Yes" },
  { feature: "Platform", shotexa: "Web Browser", competitor: "Windows & macOS" },
  { feature: "Pricing model", shotexa: "Free", competitor: "Paid annual subscription" },
  { feature: "Text Extraction (OCR)", shotexa: "Yes", competitor: "Yes" },
  { feature: "Redaction", shotexa: "Yes", competitor: "Yes" },
  { feature: "Image Stitching", shotexa: "Yes (Smart Stitch)", competitor: "Yes (Scrolling capture)" },
  { feature: "Video Recording", shotexa: "No", competitor: "Yes" },
  { feature: "Installation Required", shotexa: "No", competitor: "Yes" },
];

const FAQ = [
  { q: "Is Shotexa a complete replacement for Snagit?", a: "No. If you rely on Snagit to capture your screen, record video tutorials, or automatically document step-by-step processes, Shotexa does not replace those features. Shotexa is a workspace for editing, redacting, and extracting text from screenshots you have already captured." },
  { q: "How does Shotexa's stitching compare to Snagit's scrolling capture?", a: "Snagit captures a long scrolling window automatically while you scroll. Shotexa requires you to take standard overlapping screenshots first, and then our Smart Stitch tool aligns and merges them into one image." },
];

export default function SnagitAlternativePage() {
  const tools = [TOOLS["extract-text"], TOOLS["stitch"], TOOLS["safe-share"]];

  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="left" 
          eyebrow="Snagit Alternative" 
          title="Shotexa vs Snagit:" 
          accent="A Free Browser-Based Snagit Alternative" 
          lead="How a free browser-based screenshot editor compares to a full desktop capture and documentation suite." 
        />
        
        <div className="mt-12 text-ink">
          <p className="t-body mb-8">
            Snagit remains the stronger option for teams creating tutorials, documentation, and screen recordings on a daily basis. It is a complete desktop application with an extensive library of markup tools, step capture, and video capabilities. Shotexa is built for a different use case: providing a free, quick way to process an existing screenshot. You can paste or drag an image into your browser to extract text, redact information, or stitch files together. It is free to use instead of requiring a paid annual subscription.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Feature Comparison</h2>
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="p-4 font-semibold text-ink">Feature</th>
                  <th className="p-4 font-semibold text-ink">Shotexa</th>
                  <th className="p-4 font-semibold text-ink">Snagit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {TABLE_DATA.map((row, i) => (
                  <tr key={i} className="bg-surface">
                    <td className="p-4 font-medium text-ink">{row.feature}</td>
                    <td className="p-4 text-ink-2">{row.shotexa}</td>
                    <td className="p-4 text-ink-2">{row.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="t-h3 mb-3 text-success">Where Snagit is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Dedicated video recording and GIF creation.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Automatic generation of step-by-step visual guides.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Broad library of stamps, shapes, and technical markup assets.</li>
              </ul>
            </div>
            <div>
              <h3 className="t-h3 mb-3 text-accent">Where Shotexa is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Runs entirely in the web browser with no installation required.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Free to use instead of requiring a paid annual subscription.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Designed for quick utility tasks without managing a desktop library.</li>
              </ul>
            </div>
          </div>

          <h2 className="t-h2 mt-12 mb-6">Who should choose Shotexa?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Shotexa makes more sense if you already have the screenshot and want to edit, redact, or extract text from it without installing software. It is a practical tool for occasional tasks where a full desktop capture suite is not necessary.
          </p>

          <h2 className="t-h2 mt-10 mb-6">Who should choose Snagit?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Choose Snagit if you are a technical writer, support agent, or educator who constantly creates detailed visual documentation and needs native capture and screen recording capabilities.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Relevant Shotexa Tools</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {tools.map((t) => (
              <Link key={t.id} href={t.route} className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-accent-line">
                <span className="inline-flex size-9 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent">
                  <ToolIcon name={t.icon} className="size-4" />
                </span>
                <span className="mt-4 font-display text-lg">{t.name}</span>
                <span className="t-body-sm mt-1 flex-1 text-ink-2">{t.summary}</span>
              </Link>
            ))}
          </div>

          <h2 className="t-h2 mt-12 mb-6">Frequently Asked Questions</h2>
          <dl className="divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
            {FAQ.map((x) => (
              <div key={x.q} className="px-5 py-4">
                <dt className="font-display text-[1.0625rem]">{x.q}</dt>
                <dd className="t-body-sm mt-1.5 text-ink-2">{x.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 rounded-xl bg-surface-2 p-8 text-center border border-line">
            <h2 className="font-display text-2xl mb-3">Try OCR & Redaction</h2>
            <p className="t-body-sm text-ink-2 mb-6 max-w-md mx-auto">
              Extract text or hide sensitive data from your images directly in your browser.
            </p>
            <Link href="/screenshot-to-text" className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover">
              Open Text Extractor
            </Link>
          </div>

          <p className="t-body-sm mt-12 text-center text-ink-3">
            Last checked: October 2026. Competitor features and pricing were reviewed against publicly available official product and pricing pages.
          </p>

          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="t-micro mb-3 text-ink">Official Snagit Sources</h3>
            <ul className="space-y-1.5 t-body-sm text-ink-2">
              <li>
                <a href="https://www.techsmith.com/snagit/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Snagit — Official Website ↗
                </a>
              </li>
              <li>
                <a href="https://www.techsmith.com/snagit/pricing/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Snagit Pricing ↗
                </a>
              </li>
              <li>
                <a href="https://www.techsmith.com/snagit/features/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Snagit Features ↗
                </a>
              </li>
            </ul>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
