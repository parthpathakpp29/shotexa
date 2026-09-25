import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { SiteFooter } from "@/components/site/site-footer";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { Badge, SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";
import { TOOL_LIST } from "@/config/tools";

export const metadata = staticMetadata("/tools");

export default function ToolsPage() {
  const tools = [...TOOL_LIST].sort((a, b) => (a.status === b.status ? 0 : a.status === "live" ? -1 : 1));
  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading level={1} eyebrow="Tools" title="Every Screenshot Tool," accent="One Workspace" lead="Add screenshots once and move between tools — everything runs in your browser." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => (
            <li key={t.id}>
              <Link href={t.route} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-6 shadow-xs transition-colors hover:border-accent-line">
                <span className="flex items-center justify-between">
                  <span className="inline-flex size-10 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent">
                    <ToolIcon name={t.icon} className="size-[18px]" />
                  </span>
                  {t.status === "live" ? (
                    <Badge tone="accent" dot>
                      Available
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Coming soon</Badge>
                  )}
                </span>
                <span className="t-h3 mt-5">{t.name}</span>
                <span className="t-body-sm mt-2 flex-1 text-ink-2">{t.summary}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                  Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
