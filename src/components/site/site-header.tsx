"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { TOOLS } from "@/config/tools";
import { cn } from "@/lib/cn";
import { useShortcutLabel } from "@/lib/use-shortcut-label";

const NAV = [
  { href: "/tools", label: "Tools" },
  { href: TOOLS.stitch.route, label: "Smart Stitch" },
  { href: TOOLS["safe-share"].route, label: "Safe Share" },
  { href: TOOLS["extract-text"].route, label: "OCR" },
  { href: TOOLS.pdf.route, label: "PDF" },
  { href: "/privacy", label: "Privacy" },
];

/** Marketing header (homepage and content pages). */
export function SiteHeader({ onChoose, className }: { onChoose?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const openKey = useShortcutLabel("O");
  return (
    <header className={cn("sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur supports-[backdrop-filter]:bg-page/80", className)}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
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
        <nav aria-label="Mobile" className="flex flex-col">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center border-b border-line text-[15px] last:border-0">
              {n.label}
            </Link>
          ))}
        </nav>
      </BottomSheet>
    </header>
  );
}
