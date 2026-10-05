import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { ToolIcon } from "@/components/brand";
import { TOOLS } from "@/config/tools";

export const metadata = staticMetadata("/alternatives/shots-so");

const TABLE_DATA = [
  { feature: "Primary Focus", shotexa: "Utility, editing, and redaction", competitor: "Design, mockups, and animation" },
  { feature: "Platform", shotexa: "Web Browser", competitor: "Web Browser" },
  { feature: "Pricing Model", shotexa: "Free", competitor: "Free tier / Paid Pro subscriptions" },
  { feature: "Video & Animations", shotexa: "No", competitor: "Yes" },
  { feature: "Exports", shotexa: "Static image and PDF exports", competitor: "Static and animated exports" },
  { feature: "Image Stitching", shotexa: "Yes", competitor: "No" },
  { feature: "Text OCR / Redaction", shotexa: "Yes", competitor: "No" },
];

const FAQ = [
  { q: "Can Shotexa create the animated zoom videos like Shots.so?", a: "No. Shotexa focuses exclusively on static screenshot manipulation. It does not support video rendering, motion zooms, or animations." },
  { q: "Is Shotexa a complete replacement for Shots.so?", a: "No. If you need stylized, animated mockups for a landing page or app store listing, Shots.so is built for that purpose. Shotexa makes more sense when you need to quickly beautify, redact, or extract text from an everyday screenshot for documentation or communication." },
];

export default function ShotsSoAlternativePage() {
  const tools = [TOOLS["beautify"], TOOLS["combine"], TOOLS["safe-share"]];

  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="left" 
          eyebrow="Shots.so Alternative" 
          title="Shotexa vs Shots.so:" 
          accent="A Screenshot Editing Alternative" 
          lead="Compare the design and animation capabilities of Shots.so with the utility-focused screenshot tools of Shotexa." 
        />
        
        <div className="mt-12 text-ink">
          <p className="t-body mb-8">
            Shots.so is a web-based design tool for turning plain images into mockups and animations for social media and marketing. Shotexa serves a different need: it is a free utility workspace for everyday screenshot tasks. Rather than generating complex animations, Shotexa provides browser-based editing, redaction, OCR, stitching, and simple frames for screenshots you already have.
          </p>

          <h2 className="t-h2 mt-12 mb-6">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="p-4 font-semibold text-ink">Feature</th>
                  <th className="p-4 font-semibold text-ink">Shotexa</th>
                  <th className="p-4 font-semibold text-ink">Shots.so</th>
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
              <h3 className="t-h3 mb-3 text-success">Where Shots.so is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Extensive library of specific device mockups (iPhones, MacBooks).</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> Exporting animated MP4s and video zooms.</li>
                <li className="flex gap-2"><Minus className="size-4 shrink-0 mt-0.5 text-ink-3" /> High-end design options like glassmorphism and generated backgrounds.</li>
              </ul>
            </div>
            <div>
              <h3 className="t-h3 mb-3 text-accent">Where Shotexa is stronger</h3>
              <ul className="space-y-2 t-body-sm text-ink-2">
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Broader screenshot utility work: edit, beautify, redact, OCR, stitch, combine, split, compare, compress, and convert.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Creates PDFs, searchable PDFs, and metadata-cleaned files alongside image edits.</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-accent" /> Supports batch processing without paid upgrade tiers.</li>
              </ul>
            </div>
          </div>

          <h2 className="t-h2 mt-12 mb-6">Who should choose Shotexa?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Shotexa makes more sense if you need a quick, reliable tool to add a generic frame to a screenshot, or if you need to combine or redact images for documentation. It is practical for utility tasks where you do not need complex marketing mockups or animations.
          </p>

          <h2 className="t-h2 mt-10 mb-6">Who should choose Shots.so?</h2>
          <p className="t-body-sm mb-4 text-ink-2">
            Choose Shots.so if your primary goal is creating promotional mockups, animated social posts, or specific hardware-device presentations.
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
            <h2 className="font-display text-2xl mb-3">Create a Screenshot Mockup</h2>
            <p className="t-body-sm text-ink-2 mb-6 max-w-md mx-auto">
              Add a plain browser or phone frame to your screenshot instantly, without uploading the image to a server.
            </p>
            <Link href="/screenshot-beautifier" className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-hover">
              Open Beautifier
            </Link>
          </div>

          <p className="t-body-sm mt-12 text-center text-ink-3">
            Last checked: October 2026. Competitor features and pricing were reviewed against publicly available official product and pricing pages.
          </p>

          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="t-micro mb-3 text-ink">Official Shots.so Sources</h3>
            <ul className="space-y-1.5 t-body-sm text-ink-2">
              <li>
                <a href="https://shots.so" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Shots.so — Official Website ↗
                </a>
              </li>
              <li>
                <a href="https://shots.so/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  Shots.so Pricing ↗
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
