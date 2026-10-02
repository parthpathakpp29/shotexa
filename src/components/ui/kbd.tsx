import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "inverse"; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1 font-mono text-[10.5px] font-medium leading-none",
        tone === "inverse" ? "bg-white/20 text-white" : "border border-line bg-surface-2 text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
