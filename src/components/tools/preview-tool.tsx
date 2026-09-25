"use client";

/**
 * Workspace shell for tools that are not built yet (Phase 2+). The route exists so the
 * workspace — including Smart Stitch results — carries over; the page says plainly that
 * the tool is coming and offers what already works. noindex + not in the sitemap.
 */
import { ArrowLeft, Download, Hourglass } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ToolIcon } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge, InspectorSection, Mono } from "@/components/ui/primitives";
import { FilePreview } from "@/components/workspace/file-preview";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { TOOLS, type ToolId } from "@/config/tools";
import { downloadAsset } from "@/core/runtime/runtime";

export function PreviewTool({ tool, landing }: { tool: ToolId; landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <PreviewWorkspace tool={tool} />;
}

function PreviewWorkspace({ tool }: { tool: ToolId }) {
  const { runtime } = useWorkspaceContext();
  const t = TOOLS[tool];
  const selected = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const originals = useWorkspace((s) => s.order.filter((id) => s.files[id]?.kind === "original").length);

  return (
    <WorkspaceShell
      tool={tool}
      status={<Badge tone="neutral">Coming soon</Badge>}
      inspectorTitle={t.name}
      canvas={
        <>
          <h1 className="sr-only">{t.seo.h1}</h1>
          <FilePreview />
        </>
      }
      inspector={
        <InspectorSection
          title={
            <span className="inline-flex items-center gap-2">
              <ToolIcon name={t.icon} className="size-4 text-accent" /> {t.name}
            </span>
          }
        >
          <div className="space-y-4" data-testid="preview-tool">
            <p className="t-body-sm text-ink-2">{t.summary}</p>
            <div className="flex items-start gap-3 rounded-md border border-line bg-surface-3 p-3.5">
              <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="t-body-sm text-ink-2">
                {t.name} is being built. Your screenshots stay loaded in this workspace while you explore — nothing has been uploaded.
              </p>
            </div>
            {selected && (
              <div className="rounded-md border border-line p-3.5" data-testid="active-file">
                <p className="t-micro mb-1.5 text-ink-3">Active file</p>
                <p className="truncate text-sm font-medium text-ink">{selected.name}</p>
                <Mono className="text-[12px]">
                  {selected.width} × {selected.height} px{selected.kind === "artifact" ? " · Smart Stitch result" : ""}
                </Mono>
                <Button variant="secondary" size="sm" className="mt-3 w-full max-md:h-11" onClick={() => downloadAsset(runtime, selected.id)}>
                  <Download /> Download
                </Button>
              </div>
            )}
            {originals >= 2 && (
              <Button variant="primary" className="w-full" asChild>
                <Link href={TOOLS.stitch.route}>
                  <ArrowLeft /> Back to Smart Stitch
                </Link>
              </Button>
            )}
          </div>
        </InspectorSection>
      }
    />
  );
}
