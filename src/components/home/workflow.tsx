"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge, SectionHeading } from "@/components/ui/primitives";
import { TOOLS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/cn";
import { PdfIllustration, RedactIllustration, ScreenshotIllustration, StitchIllustration, TextIllustration } from "./illustrations";

interface Step {
  key: string;
  label: string;
  tool?: ToolId;
  title: string;
  body: string;
  points: string[];
  art: ReactNode;
}

const STEPS: Step[] = [
  {
    key: "input",
    label: "Screenshot",
    title: "Start with a paste",
    body: "Press Ctrl or ⌘ + V anywhere on the page, drop files, or choose them. Shotexa checks each file and keeps it in this browser tab.",
    points: ["PNG, JPEG and WebP", "Several screenshots at once", "Reorder any time"],
    art: <ScreenshotIllustration />,
  },
  {
    key: "stitch",
    label: "Smart Stitch",
    tool: "stitch",
    title: "Seamless screenshot alignment",
    body: "Shotexa finds where overlapping screenshots repeat, keeps fixed headers and footers from appearing twice, and joins them into one long image.",
    points: ["Repeated headers handled", "Confidence you can see", "Full-resolution export"],
    art: <StitchIllustration />,
  },
  {
    key: "redact",
    label: "Redact",
    tool: "safe-share",
    title: "Share without the private parts",
    body: "Black out names, numbers and messages permanently, and remove hidden metadata before a screenshot leaves your device.",
    points: ["Solid, irreversible blackout", "Metadata check", "Review before export"],
    art: <RedactIllustration />,
  },
  {
    key: "ocr",
    label: "OCR",
    tool: "extract-text",
    title: "Copy the text in any screenshot",
    body: "Recognise text on your device and copy it, keeping the reading order of the original.",
    points: ["On-device recognition", "Copy or download", "Works on stitched results"],
    art: <TextIllustration />,
  },
  {
    key: "pdf",
    label: "PDF",
    tool: "pdf",
    title: "Long screenshots, clean pages",
    body: "Turn screenshots into a PDF with page breaks placed between lines of content instead of through them.",
    points: ["Smart page breaks", "Standard page sizes", "One file to share"],
    art: <PdfIllustration />,
  },
];

export function WorkflowSection() {
  const [active, setActive] = useState(1);
  const step = STEPS[active];
  const tool = step.tool ? TOOLS[step.tool] : undefined;
  return (
    <section className="border-t border-line bg-surface-3/60 py-20 sm:py-24">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <SectionHeading eyebrow="Connected workflow" title="Upload Once." accent="Execute Any Tool." lead="Your screenshots stay loaded in this browser tab, so you can move from one tool to the next without adding them again." />
        <div role="tablist" aria-label="Workflow steps" className="mx-auto mt-10 flex max-w-3xl items-center justify-between gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
              <button
                role="tab"
                type="button"
                id={`wf-tab-${s.key}`}
                aria-selected={i === active}
                aria-controls="wf-panel"
                onClick={() => setActive(i)}
                className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm transition-colors", i === active ? "bg-dark text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
              >
                <span className={cn("t-mono inline-flex size-5 items-center justify-center rounded-full text-[11px]", i === active ? "bg-accent text-white" : "border border-line-strong")}>{i + 1}</span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-line-strong max-sm:hidden" />}
            </div>
          ))}
        </div>
        <div id="wf-panel" role="tabpanel" aria-labelledby={`wf-tab-${step.key}`} className="mt-8 grid items-center gap-8 rounded-xl border border-line bg-surface p-6 shadow-sm md:grid-cols-2 md:p-10">
          <div>
            <Badge tone="accent" dot>
              {tool ? `${tool.name}${tool.status === "live" ? "" : " · coming soon"}` : "Input"}
            </Badge>
            <h3 className="t-h2 mt-4">{step.title}</h3>
            <p className="t-body mt-3 text-ink-2">{step.body}</p>
            <ul className="mt-5 space-y-2 rounded-md border border-line bg-surface-3 p-4">
              {step.points.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-sm text-ink">
                  <Check aria-hidden className="size-4 text-accent" /> {p}
                </li>
              ))}
            </ul>
            {tool?.status === "live" && (
              <Button variant="dark" className="mt-6" asChild>
                <Link href={tool.route}>
                  Open {tool.name} <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
          <div aria-hidden>{step.art}</div>
        </div>
      </div>
    </section>
  );
}
