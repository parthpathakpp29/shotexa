"use client";

import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { TOOLS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/cn";
import { useWorkspace } from "./workspace-provider";

/**
 * Tool tabs row ("Smart Stitch ACTIVE · Extract Text · Safe Share …"). Real links, so tools
 * are crawlable and navigation keeps the workspace (shared layout).
 */
export function ToolTabs({ tools, active, status, className }: { tools: ToolId[]; active?: ToolId; status?: React.ReactNode; className?: string }) {
  const count = useWorkspace((s) => s.order.length);
  const select = useWorkspace((s) => s.select);
  const lastArtifactId = useWorkspace((s) => s.lastArtifactId);
  return (
    <nav aria-label="Workspace tools" className={cn("flex items-center gap-0.5 overflow-x-auto rounded-lg [scrollbar-width:none] md:flex-wrap md:overflow-visible border border-line bg-surface p-1.5 shadow-xs", className)}>
      {tools.map((id) => {
        const t = TOOLS[id];
        const isActive = id === active;
        const disabled = count < t.minFiles;
        return (
          <Link
            key={id}
            href={t.route}
            aria-current={isActive ? "page" : undefined}
            aria-disabled={disabled || undefined}
            onClick={(e) => {
              if (disabled) e.preventDefault();
              // Continue working on the latest result when there is one.
              else if (!isActive && lastArtifactId && id !== "stitch" && id !== "combine") select(lastArtifactId);
            }}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13.5px] font-medium transition-colors max-md:min-h-11",
              isActive ? "bg-accent text-white shadow-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              disabled && "pointer-events-auto cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
            title={disabled ? `${t.name} needs ${t.minFiles} screenshots` : t.summary}
          >
            <ToolIcon name={t.icon} className="size-4" />
            {t.name}
            {isActive && <span className="t-micro rounded-xs bg-white/20 px-1.5 py-0.5 text-[9.5px] text-white">Active</span>}
          </Link>
        );
      })}
      {status && <div className="ml-auto hidden shrink-0 items-center gap-1.5 pl-3 pr-2 t-mono text-[12px] text-ink-2 xl:flex">{status}</div>}
    </nav>
  );
}
