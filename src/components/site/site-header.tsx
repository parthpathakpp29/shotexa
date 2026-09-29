"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { Logo, ToolIcon } from "@/components/brand";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { TOOL_GROUPS, TOOLS } from "@/config/tools";
import { cn } from "@/lib/cn";
import { useShortcutLabel } from "@/lib/use-shortcut-label";

/**
 * The header stays compact as the toolbox grows: every live tool is reachable through one
 * grouped Tools menu (built from the registry) rather than a widening row of links.
 */
const NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/tools", label: "All tools" },
];

function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="t-micro inline-flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink">
        Tools
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {/* Anchored left: the Tools button sits near the viewport edge, so a centred menu would clip. */}
      {open && (
        <div role="menu" aria-label="Tools" className="absolute left-0 top-full z-40 mt-3 w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-md">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {TOOL_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="t-micro mb-2 text-accent-ink">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.tools.map((id) => (
                    <li key={id}>
                      <Link role="menuitem" href={TOOLS[id].route} onClick={() => setOpen(false)} className="flex min-h-9 items-center gap-2 rounded-sm px-2 text-[13.5px] text-ink hover:bg-surface-2">
                        <ToolIcon name={TOOLS[id].icon} className="size-4 text-accent" />
                        {TOOLS[id].name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Link href="/tools" onClick={() => setOpen(false)} className="mt-3 flex min-h-10 items-center justify-between rounded-md border border-line bg-surface-3 px-3 text-sm font-medium text-accent-ink hover:border-accent-line">
            All tools
            <span className="t-mono text-[11px] text-ink-3">Everything runs in your browser</span>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Marketing header (homepage and content pages). */
export function SiteHeader({ onChoose, className }: { onChoose?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const openKey = useShortcutLabel("O");
  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur supports-[backdrop-filter]:bg-page/80", className)}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          <ToolsMenu />
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="t-micro text-ink-2 transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Badge tone="accent" dot className="hidden sm:inline-flex">
            Runs locally
          </Badge>
          {onChoose ? (
            <Button variant="dark" size="sm" kbd={openKey} onClick={onChoose} className="max-sm:hidden">
              Choose screenshots
            </Button>
          ) : (
            <Button variant="dark" size="sm" asChild className="max-sm:hidden">
              <Link href="/">Choose screenshots</Link>
            </Button>
          )}
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      <BottomSheet open={open} onOpenChange={setOpen} title="Menu">
        <nav aria-label="Mobile" className="flex flex-col gap-5">
          {TOOL_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="t-micro mb-1 text-accent-ink">{group.label}</p>
              {group.tools.map((id) => (
                <Link key={id} href={TOOLS[id].route} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 border-b border-line text-[15px] last:border-0">
                  <ToolIcon name={TOOLS[id].icon} className="size-4 text-accent" />
                  {TOOLS[id].name}
                </Link>
              ))}
            </div>
          ))}
          <div>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center border-b border-line text-[15px] last:border-0">
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </BottomSheet>
    </header>
  );
}
