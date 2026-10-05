import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { ToolIcon } from "@/components/brand";
import { TOOLS } from "@/config/tools";

export const metadata = staticMetadata("/alternatives/cleanshot-x");

const TABLE_DATA = [
  { feature: "Native screenshot capture", shotexa: "No", competitor: "Yes" },
  { feature: "Platform", shotexa: "Web Browser", competitor: "macOS native app" },
  { feature: "Price", shotexa: "Free", competitor: "~$35 one-time or $10/mo" },
  { feature: "Screen Recording", shotexa: "No", competitor: "Yes" },
  { feature: "Cloud Hosting / Link Sharing", shotexa: "No", competitor: "Yes" },
  { feature: "Long Content Capture", shotexa: "Smart Stitching", competitor: "Scrolling Capture" },
  { feature: "Annotation & OCR", shotexa: "Yes", competitor: "Yes" },
  { feature: "Installation Required", shotexa: "No", competitor: "Yes" },
];

const FAQ = [
  { q: "How is Shotexa's stitching different from CleanShot's scrolling capture?", a: "CleanShot X actively records the window as you scroll to generate a single long image. Shotexa operates after the fact: you take multiple overlapping screenshots yourself, and our Smart Stitch tool aligns and merges them together." },
  { q: "Is there a CleanShot X version for Windows?", a: "No, CleanShot X is exclusively for macOS. While Shotexa cannot replace native capture functionality on Windows, it provides browser-based tools for annotating, stitching, and extracting text from screenshots on any OS." },
  { q: "Can I record my screen or create GIFs with Shotexa?", a: "No, Shotexa focuses entirely on static image editing. CleanShot X is the appropriate choice if you need to record video or create GIFs." },
];

export default function CleanShotXAlternativePage() {
  const tools = [TOOLS["stitch"], TOOLS["annotate"], TOOLS["editor"]];

  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="left" 
          eyebrow="CleanShot X Alternative" 
          title="Shotexa vs CleanShot X:" 
          accent="A Cross-Platform CleanShot X Alternative" 
          lead="How a free browser-based screenshot editor compares to a native macOS capture utility." 
        />
        
        <div className="mt-12 text-ink">
          <p className="t-body mb-8">
            Choose CleanShot X if you use a Mac and want capture, screen recording, and instant sharing in one native app. Shotexa is aimed at a different workflow: working with screenshots you already have. Instead of replacing the way you take screenshots, Shotexa gives you a free, browser-based workspace to edit, stitch, and redact images without installing another desktop application or paying for a screenshot tool.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="p-4 font-semibold text-ink">Feature</th>
                  <th className="p-4 font-semibold text-ink">Shotexa</th>
                  <th className="p-4 font-semibold text-ink">CleanShot X</th>
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
              <h3 className="t-h3 mb-3 text-success">Where CleanShot X is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Includes screen recording and GIF creation.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Built-in cloud storage for instant link sharing.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Deep macOS integration with keyboard shortcuts and capture overlays.</li>
              </ul>
            </div>
            <div>
              <h3 className="t-h3 mb-3 text-accent">Where Shotexa is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Available via web browser on Windows, Linux, and Mac.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Screenshot files stay on your device during Shotexa processing.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Free to use without one-time fees or subscriptions.</li>
              </ul>
            </div>
          </div>

          <h2 className="t-h2 mt-12 mb-6">Who should choose Shotexa?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Shotexa makes more sense if you just need to edit or stitch a few screenshots and do not want to install another application. It is especially useful if you work on Windows or rely on local, browser-based processing to avoid uploading sensitive files.
          </p>

          <h2 className="t-h2 mt-10 mb-6">Who should choose CleanShot X?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            CleanShot X makes more sense if capturing and recording your screen is part of your everyday Mac workflow. If you frequently share visual feedback with a team using instant cloud links, the native integration is worth the price.
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
              Paste or drag your file to annotate, redact, or stitch images directly in your browser.
            </p>
            <Link href="/screenshot-editor" className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover">
              Open Screenshot Editor
            </Link>
          </div>

          <p className="t-body-sm mt-12 text-center text-ink-3">
            Last checked: October 2026. Competitor features and pricing were reviewed against publicly available official product and pricing pages.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
