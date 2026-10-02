/**
 * Abstract product illustrations for the homepage (skeleton UI, no fake brands or data).
 * Pure markup + tokens so they stay crisp, theme-consistent and weightless.
 */
import { cn } from "@/lib/cn";

const ROWS = [
  [72, 40],
  [88, 0],
  [64, 24],
  [80, 0],
  [56, 32],
];

function Bars({ rows = ROWS, className, redact }: { rows?: number[][]; className?: string; redact?: number[] }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {rows.map(([a, b], i) => (
        <div key={i} className="flex gap-2">
          <span className={cn("h-2 rounded-full", redact?.includes(i) ? "h-3 rounded-[3px] bg-ink" : "bg-line-strong/70")} style={{ width: `${a}%` }} />
          {b > 0 && <span className="h-2 rounded-full bg-line" style={{ width: `${b}%` }} />}
        </div>
      ))}
    </div>
  );
}

export function WindowFrame({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-surface shadow-sm", className)}>
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-3 px-3 py-2">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        {label && <span className="t-mono ml-2 truncate text-[10.5px] text-ink-3">{label}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StitchIllustration() {
  return (
    <WindowFrame label="Preview · stitched-screenshot.png">
      <div className="relative rounded-sm border border-line bg-surface-3 p-3">
        <div className="mb-2 flex justify-between">
          <span className="h-2 w-24 rounded-full bg-ink/80" />
          <span className="t-mono text-[10px] text-ink-3">Capture 1 of 2</span>
        </div>
        <Bars />
        <div className="relative my-4 h-0.5 bg-accent">
          <span className="t-mono absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent-line bg-surface px-2.5 py-1 text-[10px] text-ink shadow-sm">
            <span className="size-1.5 rounded-full bg-accent" /> Joined automatically
          </span>
        </div>
        <div className="mb-2 flex justify-end">
          <span className="t-mono text-[10px] text-ink-3">Capture 2 of 2</span>
        </div>
        <Bars rows={[[60, 30], [84, 0], [70, 20]]} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-9 rounded-sm border", i === 2 ? "border-accent-line bg-accent-soft" : "border-line bg-surface")} />
          ))}
        </div>
      </div>
    </WindowFrame>
  );
}

export function ScreenshotIllustration() {
  return (
    <WindowFrame label="Pasted screenshot 1.png">
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="space-y-2 rounded-sm bg-surface-2 p-2.5">
          {[70, 50, 60, 40].map((w, i) => (
            <span key={i} className="block h-2 rounded-full bg-line-strong/70" style={{ width: `${w}%` }} />
          ))}
        </div>
        <Bars />
      </div>
      <p className="t-mono mt-4 text-[10.5px] text-ink-3">1440 × 900 px · PNG</p>
    </WindowFrame>
  );
}

export function RedactIllustration() {
  return (
    <WindowFrame label="Safe Share">
      <Bars redact={[1, 3]} />
      <div className="mt-4 flex flex-wrap gap-2">
        {["Permanent blackout", "Metadata removed"].map((x) => (
          <span key={x} className="t-mono inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[10px] text-accent-ink">
            <span className="size-1 rounded-full bg-accent" /> {x}
          </span>
        ))}
      </div>
    </WindowFrame>
  );
}

export function TextIllustration() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <WindowFrame label="Screenshot">
        <Bars />
      </WindowFrame>
      <div className="rounded-md border border-line bg-surface-3 p-4 shadow-sm">
        <p className="t-micro mb-3 text-accent-ink">Extracted text</p>
        <div className="space-y-2">
          {[92, 80, 86, 60, 74].map((w, i) => (
            <span key={i} className="block h-1.5 rounded-full bg-ink/25" style={{ width: `${w}%` }} />
          ))}
        </div>
        <span className="t-mono mt-4 inline-flex rounded-sm border border-line bg-surface px-2 py-1 text-[10.5px] text-ink-2">Copy all text</span>
      </div>
    </div>
  );
}

export function PdfIllustration() {
  return (
    <div className="flex items-start justify-center gap-4">
      {[1, 2].map((p) => (
        <div key={p} className="w-40 rounded-sm border border-line bg-surface p-3 shadow-sm">
          <Bars rows={p === 1 ? ROWS : ROWS.slice(0, 3)} />
          {p === 1 && <div className="my-3 border-t border-dashed border-accent" />}
          <p className="t-mono mt-3 text-center text-[10px] text-ink-3">Page {p}</p>
        </div>
      ))}
    </div>
  );
}
