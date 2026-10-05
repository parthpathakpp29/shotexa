import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/alternatives");

const ALTERNATIVES = [
  {
    id: "xnapper",
    name: "Xnapper",
    desc: "Compare Shotexa to Xnapper's native macOS beautification and auto-redaction.",
    route: "/alternatives/xnapper",
  },
  {
    id: "cleanshot-x",
    name: "CleanShot X",
    desc: "See how Shotexa's free, browser-based workflow compares to CleanShot X on Mac.",
    route: "/alternatives/cleanshot-x",
  },
  {
    id: "snagit",
    name: "Snagit",
    desc: "A direct comparison for screenshot editing, redaction, and OCR text extraction.",
    route: "/alternatives/snagit",
  },
  {
    id: "pika",
    name: "Pika.style",
    desc: "Evaluate Shotexa's free screenshot beautifier against Pika's mockup generator.",
    route: "/alternatives/pika",
  },
  {
    id: "shots-so",
    name: "Shots.so",
    desc: "Compare Shotexa's screenshot utility tools with Shots.so's design templates.",
    route: "/alternatives/shots-so",
  },
];

export default function AlternativesHubPage() {
  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading 
          level={1} 
          align="center" 
          eyebrow="Compare" 
          title="Shotexa" 
          accent="Alternatives" 
          lead="Detailed comparisons between Shotexa and popular screenshot tools to help you choose the right workflow." 
        />
        
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALTERNATIVES.map((alt) => (
            <Link 
              key={alt.id} 
              href={alt.route} 
              className="group flex h-full flex-col rounded-xl border border-line bg-surface p-6 shadow-xs transition-colors hover:border-accent-line"
            >
              <h2 className="font-display text-xl">{alt.name}</h2>
              <p className="t-body-sm mt-2 flex-1 text-ink-2">{alt.desc}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                Read comparison <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>

        <section className="mx-auto mt-16 max-w-[760px]" aria-labelledby="choose-screenshot-tool">
          <h2 id="choose-screenshot-tool" className="t-h2">How to choose the right screenshot tool</h2>
          <div className="t-body mt-5 space-y-4 text-ink-2">
            <p>
              Start with the job you need to do before you compare feature lists. Choose CleanShot X if native Mac capture, recording, scrolling capture, and link sharing are part of your daily workflow. Choose Xnapper if you want a fast native Mac workflow for capturing and beautifying screenshots, including automatic sensitive-data redaction.
            </p>
            <p>
              Choose Snagit when you create professional documentation, tutorials, step-by-step guides, or screen recordings. Its desktop capture and annotation workflow is built for that work. Choose Pika or Shots.so when the priority is design-heavy marketing mockups, device presentations, and animation rather than screenshot utility tasks.
            </p>
            <p>
              Choose Shotexa when you already have the screenshot and want a browser-based workspace to work with it. You can upload, paste, or drag and drop screenshots to edit and beautify them; use manual Blur, Pixelate, or Blackout; extract text with OCR; stitch, combine, compare, or split images; create PDFs or searchable PDFs; compress or convert files; clean metadata; and process batches. It does not replace native capture or screen recording, so the right choice depends on whether you need to capture first or process a screenshot you already have.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
