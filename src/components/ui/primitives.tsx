/**
 * Small Shotexa primitives: IconButton, Badge/Status, Panel, SectionHeading, Notice,
 * Progress, EmptyState, InspectorSection, Toolbar. Server-safe (no hooks).
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function IconButton({ label, className, children, active, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40 max-md:size-11 [&_svg]:size-[18px]",
        active && "bg-surface-2 text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "error" | "dark";
const TONES: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-ink-2",
  accent: "border-accent-line bg-accent-soft text-accent-ink",
  success: "border-[#cfe5d6] bg-success-soft text-success",
  warning: "border-[#f0dcb4] bg-warning-soft text-warning",
  error: "border-[#f3c9c4] bg-error-soft text-error",
  dark: "border-dark bg-dark text-white",
};
const DOTS: Record<Tone, string> = { neutral: "bg-ink-3", accent: "bg-accent", success: "bg-success", warning: "bg-warning", error: "bg-error", dark: "bg-accent" };

/** Pill status label, mono type (e.g. "● High confidence · Screenshots aligned automatically"). */
export function Badge({ tone = "neutral", dot, mono = true, className, children }: { tone?: Tone; dot?: boolean; mono?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 leading-none", mono ? "font-mono text-[11.5px]" : "text-xs font-medium", TONES[tone], className)}>
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} {...props} />;
}

/** Eyebrow (mono, accent) + serif title with an optional italic accent part + lead. */
export function SectionHeading({ eyebrow, title, accent, lead, level = 2, className, align = "center" }: { eyebrow?: string; title: string; accent?: string; lead?: ReactNode; level?: 1 | 2; className?: string; align?: "center" | "left" }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}>
      {eyebrow && <p className="t-micro mb-3 text-accent-ink">{eyebrow}</p>}
      <H className={level === 1 ? "t-display" : "t-h1"}>
        {title}
        {accent && (
          <>
            {" "}
            <em className="text-ink">{accent}</em>
          </>
        )}
      </H>
      {lead && <p className="t-body mt-4 text-ink-2">{lead}</p>}
    </div>
  );
}

export function Notice({ tone = "neutral", icon, title, children, actions, className }: { tone?: "neutral" | "accent" | "warning" | "error" | "success"; icon?: ReactNode; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  const tones = {
    neutral: "border-line bg-surface",
    accent: "border-line bg-surface",
    success: "border-[#cfe5d6] bg-success-soft",
    warning: "border-[#f0dcb4] bg-warning-soft",
    error: "border-[#f3c9c4] bg-error-soft",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex flex-col gap-4 rounded-lg border p-4 shadow-xs sm:flex-row sm:items-center sm:gap-5 sm:px-5", tones[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        {icon && <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-[18px]", tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2")}>{icon}</span>}
        <div className="min-w-0">
          {title && <p className="font-display text-xl leading-snug">{title}</p>}
          {children && <div className="t-body-sm mt-0.5 text-ink-2">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Progress({ value, label, className }: { value: number | null; label: string; className?: string }) {
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn("h-full rounded-full bg-accent transition-[width] duration-200", pct === null && "w-1/3 animate-pulse")} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {icon && <span className="inline-flex size-11 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>}
      <p className="font-display text-xl">{title}</p>
      {children && <div className="t-body-sm max-w-sm text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

/** Mono uppercase section label used in inspectors ("VIEW MODE", "JOIN POSITION"). */
export function FieldLabel({ children, value, className, htmlFor }: { children: ReactNode; value?: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-2", className)}>
      <label htmlFor={htmlFor} className="t-micro text-ink-3">
        {children}
      </label>
      {value !== undefined && <span className="t-mono text-ink">{value}</span>}
    </div>
  );
}

export function InspectorSection({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-lg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-surface p-1 shadow-xs", className)} {...props} />;
}

export function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}

/** Mono technical value, e.g. "1440 × 900 px". */
export function Mono({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("t-mono text-ink-2", className)} {...props} />;
}
