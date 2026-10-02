import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SiteFooter } from "@/components/site/site-footer";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Badge, SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { TOOL_GROUPS, TOOLS, UPCOMING_TOOLS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/cn";

export const metadata = staticMetadata("/tools");

function ToolCard({ id }: { id: ToolId }) {
  const t = TOOLS[id];
  const upcoming = t.status !== "live";
  return (
    <li>
      <Link
        href={t.route}
        className={cn(
          "group flex h-full flex-col rounded-xl border p-6 shadow-xs transition-colors hover:border-accent-line",
          upcoming ? "border-line bg-surface-3" : "border-line bg-surface",
        )}
      >
        <span className="flex items-center justify-between">
          <span
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-md border",
              upcoming ? "border-line bg-surface-2 text-ink-3" : "border-accent-line bg-accent-soft text-accent",
            )}
          >
            <ToolIcon name={t.icon} className="size-[18px]" />
          </span>
          {upcoming ? (
            <Badge tone="neutral">Coming soon</Badge>
          ) : (
            <Badge tone="accent" dot>
              Available
            </Badge>
          )}
        </span>
        <span className={cn("t-h3 mt-5", upcoming && "text-ink-2")}>{t.name}</span>
        <span className="t-body-sm mt-2 flex-1 text-ink-2">{t.summary}</span>
        {upcoming ? (
          <span className="t-body-sm mt-4 text-ink-3">Not available yet</span>
        ) : (
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
            Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </Link>
    </li>
  );
}

export default function ToolsPage() {
  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading level={1} eyebrow="Tools" title="Every Screenshot Tool," accent="One Workspace" lead="Add screenshots once and move between tools — everything runs in your browser." />
        {TOOL_GROUPS.map((group) => (
          <section key={group.id} className="mt-14 first:mt-12">
            <h2 className="t-h2">{group.label}</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((id) => (
                <ToolCard key={id} id={id} />
              ))}
            </ul>
          </section>
        ))}
        {UPCOMING_TOOLS.length > 0 && (
          <section className="mt-16 border-t border-line pt-12">
            <h2 className="t-h2 text-ink-2">Coming soon</h2>
            <p className="t-body-sm mt-2 max-w-xl text-ink-3">These routes already keep your workspace, so your screenshots carry over — the tools themselves are still being built.</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {UPCOMING_TOOLS.map((id) => (
                <ToolCard key={id} id={id} />
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
