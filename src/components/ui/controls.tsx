"use client";

/**
 * Interactive controls: SegmentedControl, Toggle (switch), Slider, Disclosure,
 * VerificationCard, ToolTab. Keyboard accessible; ≥ 44 px targets on touch screens.
 */
import { ChevronDown, Check } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SegmentedControl<T extends string>({ value, onChange, options, label, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-surface-3 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = options.findIndex((x) => x.value === value);
              const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              "rounded-sm px-2 font-medium transition-colors duration-150 max-md:min-h-11",
              size === "sm" ? "h-7 text-xs" : "h-9 text-[13px]",
              active ? "border border-line bg-surface text-ink shadow-xs" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-md border border-line bg-surface-3 p-3.5", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {description && <div className="t-mono mt-0.5 text-[12px] text-accent-ink">{description}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150", checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2")}
      >
        <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-150", checked ? "translate-x-[22px]" : "translate-x-[3px]")} />
      </button>
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange, label, id, className, valueText }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; id?: string; className?: string; valueText?: string }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      id={id}
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("shotexa-range h-6 w-full cursor-pointer appearance-none bg-transparent", className)}
      style={{ ["--pct" as string]: `${pct}%` }}
    />
  );
}

export function Disclosure({ title, children, defaultOpen = false, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn("border-t border-line pt-3", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="t-micro flex w-full items-center justify-between py-1.5 text-ink-3 hover:text-ink max-md:min-h-11">
        {title}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className="pt-3">
        {children}
      </div>
    </div>
  );
}

/** "Safe Share Ready" style checklist card. */
export function VerificationCard({ title, items, tone = "accent", className }: { title: ReactNode; items: { label: ReactNode; ok: boolean }[]; tone?: "accent" | "neutral"; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface-3 p-4", className)}>
      <div className="flex items-center justify-between border-b border-line pb-3">
        <p className="font-display text-lg">{title}</p>
        {tone === "accent" && <span aria-hidden className="size-2 rounded-full bg-accent" />}
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            <Check aria-hidden className={cn("size-4", it.ok ? "text-accent" : "text-ink-3")} />
            <span className={it.ok ? "text-ink" : "text-ink-3"}>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
