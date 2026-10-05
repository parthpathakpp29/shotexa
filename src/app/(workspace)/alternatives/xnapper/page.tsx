import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { ToolIcon } from "@/components/brand";
import { TOOLS } from "@/config/tools";

export const metadata = staticMetadata("/alternatives/xnapper");

const TABLE_DATA = [
  { feature: "Native screenshot capture", shotexa: "No", competitor: "Yes" },
  { feature: "Platform", shotexa: "Web Browser", competitor: "macOS native app" },
  { feature: "Price", shotexa: "Free", competitor: "Paid one-time license (from $29.99)" },
  { feature: "Screenshot Beautifier", shotexa: "Yes", competitor: "Yes" },
  { feature: "Auto-Redaction", shotexa: "No \u2014 manual Blur, Pixelate & Blackout", competitor: "Yes" },
  { feature: "Text Extraction (OCR)", shotexa: "Yes", competitor: "Yes" },
  { feature: "Image Stitching", shotexa: "Yes (Smart Stitch)", competitor: "No" },
  { feature: "Installation Required", shotexa: "No", competitor: "Yes" },
];

const FAQ = [
  { q: "Can I use Xnapper on Windows?", a: "No, Xnapper is a macOS native application. If you need a Windows tool to beautify screenshots, Shotexa runs directly in your web browser." },
  { q: "Does Shotexa automatically blur sensitive data like Xnapper?", a: "No. Xnapper includes automatic detection for things like emails and credit cards. Shotexa provides manual blur, pixelate, and blackout tools so you can exactly control what gets hidden." },
];

export default function XnapperAlternativePage() {
  const tools = [TOOLS["beautify"], TOOLS["safe-share"], TOOLS["extract-text"]];

  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="left" 
          eyebrow="Xnapper Alternative" 
          title="Shotexa vs Xnapper:" 
          accent="A Browser-Based Xnapper Alternative" 
          lead="Understand the differences between a native Mac capture app and a browser-based screenshot editor." 
        />
        
        <div className="mt-12 text-ink">
          <p className="t-body mb-8">
            Choose Xnapper if you use a Mac and want a native tool that captures your screen, automatically redacts sensitive text, and applies padding and backgrounds in one step. Shotexa is aimed at a different workflow: working with screenshots you already have. Instead of replacing your system capture tool, Shotexa acts as a browser workspace where you can upload, paste, beautify, edit, and stitch existing screenshots on any operating system.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="p-4 font-semibold text-ink">Feature</th>
                  <th className="p-4 font-semibold text-ink">Shotexa</th>
                  <th className="p-4 font-semibold text-ink">Xnapper</th>
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
              <h3 className="t-h3 mb-3 text-success">Where Xnapper is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Native macOS keyboard shortcuts for capturing.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Automatic detection and redaction of sensitive text.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Dedicated iOS companion app.</li>
              </ul>
            </div>
            <div>
              <h3 className="t-h3 mb-3 text-accent">Where Shotexa is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Available on Windows, Linux, and ChromeOS via the browser.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Includes image stitching to combine long scrolling content.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Free to use without needing to purchase a license.</li>
              </ul>
            </div>
          </div>

          <h2 className="t-h2 mt-12 mb-6">Who should choose Shotexa?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Shotexa makes more sense if you already have the screenshot and want to edit, redact, or format it without installing software. Because it runs locally in your browser, it works equally well on a Windows PC or a Mac.
          </p>

          <h2 className="t-h2 mt-10 mb-6">Who should choose Xnapper?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Choose Xnapper if your primary goal is speeding up the capture process on a Mac. If you take screenshots constantly and want them automatically formatted and redacted as soon as you press the keyboard shortcut, Xnapper justifies its license fee.
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
            <h2 className="font-display text-2xl mb-3">Edit a Screenshot in Shotexa</h2>
            <p className="t-body-sm text-ink-2 mb-6 max-w-md mx-auto">
              Paste or drop your existing screenshot to add backgrounds, frames, or manual redactions directly in your browser.
            </p>
            <Link href="/screenshot-beautifier" className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover">
              Open Screenshot Beautifier
            </Link>
          </div>
          
          <p className="t-body-sm mt-12 text-center text-ink-3">
            Last checked: October 2026. Competitor features and pricing were reviewed against publicly available official product and pricing pages.
          </p>

          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="t-micro mb-3 text-ink">Official Xnapper Sources</h3>
            <ul className="space-y-1.5 t-body-sm text-ink-2">
              <li>
                <a href="https://xnapper.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Xnapper — Official Website ↗
                </a>
              </li>
              <li>
                <a href="https://xnapper.com/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Xnapper Pricing ↗
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
