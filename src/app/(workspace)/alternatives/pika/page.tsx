import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { ToolIcon } from "@/components/brand";
import { TOOLS } from "@/config/tools";

export const metadata = staticMetadata("/alternatives/pika");

const TABLE_DATA = [
  { feature: "Focus", shotexa: "Screenshot utility & editing", competitor: "Screenshot mockups & design" },
  { feature: "Platform", shotexa: "Web Browser", competitor: "Web Browser" },
  { feature: "Pricing", shotexa: "Free", competitor: "Free tier / Paid Pro" },
  { feature: "Watermarks on Free Tier", shotexa: "No", competitor: "Yes" },
  { feature: "Data Processing", shotexa: "Local in-browser", competitor: "Local in-browser" },
  { feature: "3D Tilting Effects", shotexa: "No", competitor: "Yes (Pro)" },
  { feature: "Text Extraction & Redaction", shotexa: "Yes", competitor: "No" },
  { feature: "Image Stitching", shotexa: "Yes (Smart Stitch)", competitor: "No" },
];

const FAQ = [
  { q: "Does Shotexa put a watermark on my screenshots?", a: "No. Shotexa never adds a watermark to your exported images, regardless of which tool you use." },
  { q: "Can I export high-resolution mockups for free?", a: "Yes. Shotexa uses the original resolution of your uploaded screenshot to generate the beautified result, ensuring crisp exports without requiring a premium upgrade." },
  { q: "Does Shotexa have 3D tilt effects like Pika?", a: "No, Shotexa's Beautifier focuses on clean, flat presentations (like plain browser windows and generic phone frames) and does not support 3D perspective tilting." },
];

export default function PikaAlternativePage() {
  const tools = [TOOLS["beautify"], TOOLS["safe-share"], TOOLS["compare"]];

  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="left" 
          eyebrow="Pika Alternative" 
          title="Shotexa vs Pika:" 
          accent="A Free Pika Alternative for Screenshot Editing" 
          lead="How a free screenshot utility workspace compares to a design-focused mockup generator." 
        />
        
        <div className="mt-12 text-ink">
          <p className="t-body mb-8">
            Pika (pika.style) is a web-based tool dedicated to creating polished screenshot mockups with gradients, 3D tilts, and custom templates. While it offers a free tier, features like watermark removal and advanced export options require a paid Pro subscription. Both Pika and Shotexa process images locally in your browser. However, Shotexa is geared toward a broader utility workflow: adding backgrounds and frames for free, but also providing tools to extract text, redact information, and stitch images together.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="p-4 font-semibold text-ink">Feature</th>
                  <th className="p-4 font-semibold text-ink">Shotexa</th>
                  <th className="p-4 font-semibold text-ink">Pika.style</th>
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
              <h3 className="t-h3 mb-3 text-success">Where Pika is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Advanced design tools like 3D tilting and complex shadows.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Specific templates for code snippets and Twitter/X posts.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Ability to save custom template presets.</li>
              </ul>
            </div>
            <div>
              <h3 className="t-h3 mb-3 text-accent">Where Shotexa is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> No watermarks on exports.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Offers broader utility, including image stitching, OCR, and redaction.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> All tools are available without a subscription.</li>
              </ul>
            </div>
          </div>

          <h2 className="t-h2 mt-12 mb-6">Who should choose Shotexa?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Shotexa makes more sense if you want to quickly add a basic background or device frame to a screenshot, or if you also need to stitch, combine, or redact images. It provides a free, unwatermarked utility workspace for everyday screenshot tasks.
          </p>

          <h2 className="t-h2 mt-10 mb-6">Who should choose Pika?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Choose Pika if you are actively designing marketing assets and need to apply 3D perspective tilts, manage saved branding presets, or format specific elements like code blocks for social media.
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
            <h2 className="font-display text-2xl mb-3">Open Screenshot Beautifier</h2>
            <p className="t-body-sm text-ink-2 mb-6 max-w-md mx-auto">
              Add plain backgrounds, frames, and padding to your screenshots and export them without watermarks.
            </p>
            <Link href="/screenshot-beautifier" className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover">
              Open Beautifier
            </Link>
          </div>

          <p className="t-body-sm mt-12 text-center text-ink-3">
            Last checked: October 2026. Competitor features and pricing were reviewed against publicly available official product and pricing pages.
          </p>

          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="t-micro mb-3 text-ink">Official Pika Sources</h3>
            <ul className="space-y-1.5 t-body-sm text-ink-2">
              <li>
                <a href="https://pika.style" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Pika — Official Website ↗
                </a>
              </li>
              <li>
                <a href="https://pika.style/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Pika Pricing ↗
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
