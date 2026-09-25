import { Crop, Eraser, EyeOff, FileText, LayoutGrid, Minimize2, PenLine, Rows2, ScanText, ShieldCheck, type LucideProps } from "lucide-react";
import Link from "next/link";
import type { ToolIcon as ToolIconName } from "@/config/tools";
import { cn } from "@/lib/cn";

/** Viewfinder mark: corner brackets + accent dot. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#1c1714" />
      <path d="M9 13V10a1 1 0 0 1 1-1h3M19 9h3a1 1 0 0 1 1 1v3M23 19v3a1 1 0 0 1-1 1h-3M13 23h-3a1 1 0 0 1-1-1v-3" fill="none" stroke="#fbf9f5" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.6" fill="#c4532b" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-sm", className)} aria-label="Shotexa home">
      <LogoMark />
      <span className="font-display text-[1.375rem] leading-none tracking-[-0.01em] text-ink">Shotexa</span>
    </Link>
  );
}

const ICONS: Record<ToolIconName, (p: LucideProps) => React.ReactNode> = {
  stitch: Rows2,
  combine: LayoutGrid,
  shield: ShieldCheck,
  blur: EyeOff,
  text: ScanText,
  pdf: FileText,
  crop: Crop,
  pen: PenLine,
  compress: Minimize2,
  eraser: Eraser,
};

export function ToolIcon({ name, className, ...props }: { name: ToolIconName } & LucideProps) {
  const I = ICONS[name];
  return <I aria-hidden className={className} {...props} />;
}
