import { CombineTool } from "@/components/tools/combine/combine-tool";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { toolMetadata } from "@/config/routes";
import type { ReactNode } from "react";

export const metadata = toolMetadata("combine");

export default function CombineScreenshotsPage() {
  return (
    <CombineTool
      landing={(
        <ToolLanding tool="combine" dropHint="Add two or more screenshots to arrange them in one image.">
          <CombineLanding />
        </ToolLanding>
      )}
    />
  );
}

function CombineLanding() {
  return (
    <section className="border-y border-line bg-surface-3 py-14">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:grid-cols-3 sm:px-6">
        <LandingPoint eyebrow="HOW IT WORKS" title="Arrange the screenshots">Choose a vertical stack, row or simple grid. Reorder files whenever you need.</LandingPoint>
        <LandingPoint eyebrow="KEEP CONTROL" title="Set the details">Adjust spacing, alignment, sizing and the background without distorting your screenshots.</LandingPoint>
        <LandingPoint eyebrow="PRIVATE EXPORT" title="Download one image">Composition and export stay in your browser. Continue with another Shotexa tool without uploading again.</LandingPoint>
      </div>
      <div className="mx-auto mt-10 max-w-5xl px-4 sm:px-6">
        <h2 className="font-display text-2xl">Questions</h2>
        <details className="mt-4 border-t border-line py-4">
          <summary className="cursor-pointer text-sm font-medium">Will combining stretch my screenshots?</summary>
          <p className="mt-2 text-sm leading-6 text-ink-2">No. Match-width and match-height scale each image uniformly, so its proportions stay intact.</p>
        </details>
        <details className="border-t border-line py-4">
          <summary className="cursor-pointer text-sm font-medium">Do my screenshots leave my device?</summary>
          <p className="mt-2 text-sm leading-6 text-ink-2">No screenshot content is uploaded for combining. Processing runs locally in your browser.</p>
        </details>
      </div>
    </section>
  );
}

function LandingPoint({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div><p className="t-micro text-accent-ink">{eyebrow}</p><h2 className="mt-3 font-display text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-2">{children}</p></div>;
}
