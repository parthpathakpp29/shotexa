import Link from "next/link";
import { Logo } from "@/components/brand";
import { Kbd } from "@/components/ui/kbd";
import { Badge } from "@/components/ui/primitives";
import { TOOL_GROUPS, TOOLS } from "@/config/tools";
import { isIndexable, SITE } from "@/config/site";
import { AnalyticsPreferencesButton } from "./analytics-consent";

export function SiteFooter() {
  return (
    <footer data-testid="site-footer" className="border-t border-dark bg-dark text-white">
      {/* The brand block spans two rows so More and Shortcuts sit under the tool columns. */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 sm:gap-x-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-y-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="col-span-2 max-w-sm md:col-span-1 md:row-span-2">
          <Logo className="[&>span]:text-white" />
          <p className="t-body-sm mt-4 text-white/65">A calm, precise screenshot toolbox for stitching, combining, editing, redaction, text extraction and PDF export — entirely inside your web browser.</p>
          <Badge tone="accent" dot className="mt-4 border-accent/40 bg-accent/10 text-[#ffbf9f]">
            {SITE.trustLine}
          </Badge>
        </div>
        {/* Grouped from the registry: a new live tool appears here automatically. */}
        {TOOL_GROUPS.map((group) => (
          <nav key={group.id} aria-label={group.label}>
            <p className="t-micro mb-2 text-white/70 md:mb-4">{group.label}</p>
            <ul className="md:space-y-2.5">
              {group.tools.map((id) => (
                <li key={id}>
                  <Link href={TOOLS[id].route} className="t-body-sm flex min-h-10 w-full items-center text-white/65 transition-colors hover:text-white md:inline-flex md:min-h-0 md:w-auto">
                    {TOOLS[id].name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label="More">
          <p className="t-micro mb-2 text-white/70 md:mb-4">More</p>
          <ul className="md:space-y-2.5">
            <li>
              <Link href="/tools" className="t-body-sm flex min-h-10 w-full items-center text-white/65 transition-colors hover:text-white md:inline-flex md:min-h-0 md:w-auto">
                All tools
              </Link>
            </li>
            <li>
              <Link href="/alternatives" className="t-body-sm flex min-h-10 w-full items-center text-white/65 transition-colors hover:text-white md:inline-flex md:min-h-0 md:w-auto">
                Alternatives
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="t-body-sm flex min-h-10 w-full items-center text-white/65 transition-colors hover:text-white md:inline-flex md:min-h-0 md:w-auto">
                How local processing works
              </Link>
            </li>
            {isIndexable() && <li><AnalyticsPreferencesButton /></li>}
          </ul>
        </nav>
        <div className="max-md:hidden">
          <p className="t-micro mb-2 text-white/70 md:mb-4">Shortcuts</p>
          <dl className="space-y-2.5">
            {[
              ["Paste screenshot", "⌘V"],
              ["Choose files", "⌘O"],
              ["Export", "⌘S"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="t-mono text-[12px] text-white/65">{k}</dt>
                <dd>
                  <Kbd>{v}</Kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="t-mono mt-3 text-[11px] text-white/40">Ctrl on Windows and Linux</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 sm:px-6">
        <p className="t-mono text-[12px] text-white/45">© {new Date().getFullYear()} Shotexa. Your screenshots are processed in your browser.</p>
        <p className="t-mono flex items-center gap-2 text-[12px] text-white/45">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          Local browser engine
        </p>
      </div>
    </footer>
  );
}
