import Link from "next/link";
import { Logo } from "@/components/brand";
import { Kbd } from "@/components/ui/kbd";
import { Badge } from "@/components/ui/primitives";
import { TOOL_GROUPS, TOOLS } from "@/config/tools";
import { SITE } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      {/* The brand block spans two rows so More and Shortcuts sit under the tool columns. */}
      <div className="mx-auto grid max-w-[1200px] gap-x-10 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-sm md:row-span-2">
          <Logo />
          <p className="t-body-sm mt-4 text-ink-2">A calm, precise screenshot toolbox for stitching, combining, editing, redaction, text extraction and PDF export — entirely inside your web browser.</p>
          <Badge tone="accent" dot className="mt-4">
            {SITE.trustLine}
          </Badge>
        </div>
        {/* Grouped from the registry: a new live tool appears here automatically. */}
        {TOOL_GROUPS.map((group) => (
          <nav key={group.id} aria-label={group.label}>
            <p className="t-micro mb-4 text-ink">{group.label}</p>
            <ul className="space-y-2.5">
              {group.tools.map((id) => (
                <li key={id}>
                  <Link href={TOOLS[id].route} className="t-body-sm text-ink-2 hover:text-ink">
                    {TOOLS[id].name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label="More">
          <p className="t-micro mb-4 text-ink">More</p>
          <ul className="space-y-2.5">
            <li>
              <Link href="/tools" className="t-body-sm text-ink-2 hover:text-ink">
                All tools
              </Link>
            </li>
            <li>
              <Link href="/alternatives" className="t-body-sm text-ink-2 hover:text-ink">
                Alternatives
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="t-body-sm text-ink-2 hover:text-ink">
                How local processing works
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <p className="t-micro mb-4 text-ink">Shortcuts</p>
          <dl className="space-y-2.5">
            {[
              ["Paste screenshot", "⌘V"],
              ["Choose files", "⌘O"],
              ["Export", "⌘S"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="t-mono text-[12px] text-ink-2">{k}</dt>
                <dd>
                  <Kbd>{v}</Kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="t-mono mt-3 text-[11px] text-ink-3">Ctrl on Windows and Linux</p>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-6 sm:px-6">
        <p className="t-mono text-[12px] text-ink-3">© {new Date().getFullYear()} Shotexa. Your screenshots are processed in your browser.</p>
        <p className="t-mono flex items-center gap-2 text-[12px] text-ink-3">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          Local browser engine
        </p>
      </div>
    </footer>
  );
}
