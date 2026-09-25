import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Badge } from "@/components/ui/primitives";
import { TOOLS, type ToolId } from "@/config/tools";
import { Uploader } from "./uploader";

/**
 * Tool entry page before any screenshot is loaded: real H1 + intent copy for search, the
 * shared uploader, then tool-specific content. Server component (the uploader is a client island).
 */
export function ToolLanding({ tool, dropHint, children }: { tool: ToolId; dropHint?: string; children?: ReactNode }) {
  const t = TOOLS[tool];
  return (
    <>
      <WorkspaceSiteHeader />
      <main>
        <section className="mx-auto max-w-[880px] px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-16">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="accent" dot>
              {t.name}
            </Badge>
            {t.status !== "live" && <Badge tone="neutral">Coming soon</Badge>}
          </div>
          <h1 className="t-display">{t.seo.h1}</h1>
          <p className="t-body mx-auto mt-5 max-w-xl text-ink-2">{t.seo.description}</p>
          <Uploader className="mt-10" multipleHint={dropHint} sample={tool === "stitch"} />
        </section>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
