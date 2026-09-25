"use client";

/**
 * Homepage: marketing + uploader until the first screenshot arrives, then the connected
 * workspace in place (screen4) — overlap suggestion, contextual tools, preview, next steps.
 */
import type { ReactNode } from "react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Badge } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { FilePreview } from "@/components/workspace/file-preview";
import { FileTray } from "@/components/workspace/file-tray";
import { OverlapBanner } from "@/components/workspace/overlap-banner";
import { ToolTabs } from "@/components/workspace/tool-tabs";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { suggestedTools, type ToolId } from "@/config/tools";

export function HomeView({ marketing, footer }: { marketing: ReactNode; footer: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return (
    <>
      <WorkspaceSiteHeader />
      {count === 0 ? <main>{marketing}</main> : <ConnectedWorkspace />}
      {footer}
    </>
  );
}

function ConnectedWorkspace() {
  const count = useWorkspace((s) => s.order.length);
  const originals = useWorkspace((s) => s.order.filter((id) => s.files[id]?.kind === "original").length);
  const selectedId = useWorkspace((s) => s.selectedId);
  const checking = useWorkspace((s) => s.overlapHint.status === "checking");
  const tools = suggestedTools(count);
  const next: ToolId[] = originals >= 2 ? ["stitch", "safe-share", "extract-text"] : ["safe-share", "extract-text", "pdf"];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-5 sm:px-6 sm:py-8" data-testid="connected-workspace">
      <h1 className="sr-only">Your screenshot workspace</h1>
      <OverlapBanner className="mb-5" />
      <div className="grid gap-5 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <aside className="rounded-lg border border-line bg-surface p-5 shadow-xs md:sticky md:top-22 md:max-h-[calc(100dvh-7rem)] md:self-start md:overflow-hidden">
          <FileTray className="max-md:max-h-[340px] md:max-h-[calc(100dvh-9.5rem)]" />
        </aside>
        <div className="min-w-0">
          <ToolTabs
            tools={tools}
            className="mb-4"
            status={
              originals >= 2 ? (
                <Badge tone="accent" dot className="border-0 bg-transparent">
                  {checking ? "Checking for overlap…" : "Ready to stitch"}
                </Badge>
              ) : (
                <Badge tone="neutral" dot className="border-0 bg-transparent">
                  Ready
                </Badge>
              )
            }
          />
          <FilePreview />
          <ContinueWith title="Suggested next" tools={next} fileId={selectedId} />
        </div>
      </div>
    </main>
  );
}
