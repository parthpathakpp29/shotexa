import Link from "next/link";
import { Logo } from "@/components/brand";
import { Kbd } from "@/components/ui/kbd";
import { Badge } from "@/components/ui/primitives";
import { TOOLS } from "@/config/tools";
import { SITE } from "@/config/site";

const TOOL_LINKS = [TOOLS.stitch, TOOLS["safe-share"], TOOLS["extract-text"], TOOLS.pdf];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="t-body-sm mt-4 text-ink-2">A calm, precise screenshot toolbox for stitching, redaction, text extraction and PDF export — entirely inside your web browser.</p>
          <Badge tone="accent" dot className="mt-4">
            {SITE.trustLine}
          </Badge>
        </div>
        <nav aria-label="Tools">
          <p className="t-micro mb-4 text-ink">Tools</p>
          <ul className="space-y-2.5">
            {TOOL_LINKS.map((t) => (
              <li key={t.id}>
                <Link href={t.route} className="t-body-sm text-ink-2 hover:text-ink">
                  {t.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/tools" className="t-body-sm text-ink-2 hover:text-ink">
                All tools
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Privacy">
          <p className="t-micro mb-4 text-ink">Privacy</p>
          <ul className="space-y-2.5">
            <li>
              <Link href="/privacy" className="t-body-sm text-ink-2 hover:text-ink">
                How local processing works
              </Link>
            </li>
            <li>
              <Link href={TOOLS.metadata.route} className="t-body-sm text-ink-2 hover:text-ink">
                Remove image metadata
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
