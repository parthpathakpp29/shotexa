import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Badge } from "@/components/ui/primitives";
import { TOOL_CONTENT } from "@/config/tool-content";
import { TOOLS, type ToolId } from "@/config/tools";
import { ToolEducation } from "./tool-education";
import { Uploader } from "./uploader";

/**
 * Tool entry page before any screenshot is loaded: real H1 + intent copy for search and the
 * shared uploader first, then the tool's explanation below it. Server component (the
 * uploader is a client island).
 */
export function ToolLanding({ tool, dropHint, children, variant, showEducation = true, fileLabel }: { tool: ToolId; dropHint?: string; children?: ReactNode; variant?: { name: string; h1: string; description: string }; showEducation?: boolean; fileLabel?: string }) {
  const t = TOOLS[tool];
  return (
    <>
      <WorkspaceSiteHeader />
      <main>
        <section className="mx-auto max-w-[880px] px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-16">
          <nav aria-label="Breadcrumb" className="t-micro mb-5 flex items-center justify-center gap-2 text-ink-3">
            <Link href="/" className="-mx-1.5 inline-flex min-h-10 items-center px-1.5 hover:text-accent-ink md:min-h-0">Home</Link><span aria-hidden>/</span><Link href="/tools" className="-mx-1.5 inline-flex min-h-10 items-center px-1.5 hover:text-accent-ink md:min-h-0">Tools</Link><span aria-hidden>/</span><span className="text-ink">{variant?.name ?? t.name}</span>
          </nav>
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="accent" dot>
              {variant?.name ?? t.name}
            </Badge>
            {t.status !== "live" && <Badge tone="neutral">Coming soon</Badge>}
          </div>
          <h1 className="t-display">{variant?.h1 ?? t.seo.h1}</h1>
          <p className="t-body mx-auto mt-5 max-w-xl text-ink-2">{variant?.description ?? t.seo.description}</p>
          <Uploader className="mt-10" multipleHint={dropHint ?? TOOL_CONTENT[tool].dropHint} fileLabel={fileLabel} sample={tool === "stitch"} />
        </section>
        {children}
        {showEducation && t.status === "live" && <ToolEducation tool={tool} />}
      </main>
      <SiteFooter />
    </>
  );
}
