"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { Badge } from "@/components/ui/primitives";
import { TOOLS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/cn";
import { useWorkspace } from "./workspace-provider";

/**
 * "Continue with" cards (architecture §15). Selecting a card keeps the workspace (shared
 * layout) and makes `fileId` — usually the tool's result — the active file of the next tool.
 */
export function ContinueWith({ tools, fileId, title = "Continue with", className }: { tools: ToolId[]; fileId?: string | null; title?: string; className?: string }) {
  const select = useWorkspace((s) => s.select);
  return (
    <section aria-label={title} className={cn("mt-6", className)}>
      <p className="t-micro mb-3 text-ink-3">{title}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((id, i) => {
          const t = TOOLS[id];
          const upcoming = t.status !== "live";
          return (
            <li key={id}>
              <Link
                href={t.route}
                onClick={() => fileId && select(fileId)}
                className={cn(
                  "group flex h-full flex-col rounded-lg border bg-surface p-4 shadow-xs transition-colors hover:border-accent-line",
                  !upcoming && i === 0 ? "border-accent-line" : "border-line",
                  upcoming && "bg-surface-3",
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-md border",
                      upcoming ? "border-line bg-surface-2 text-ink-3" : "border-accent-line bg-accent-soft text-accent",
                    )}
                  >
                    <ToolIcon name={t.icon} className="size-[18px]" />
                  </span>
                  {upcoming && <Badge tone="neutral">Coming soon</Badge>}
                </span>
                <span className={cn("mt-3 font-display text-xl", upcoming && "text-ink-2")}>{t.name}</span>
                <span className="t-body-sm mt-1 flex-1 text-ink-2">{t.summary}</span>
                {/* An unfinished tool never gets a call to action that implies it works. */}
                {upcoming ? (
                  <span className="t-body-sm mt-3 text-ink-3">Not available yet — your files stay in the workspace.</span>
                ) : (
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                    Open {t.name} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
