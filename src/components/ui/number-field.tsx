"use client";

import { useId, useRef, useState } from "react";

/**
 * Whole-number field that commits on Enter or blur, not on every keystroke — typing "1170"
 * is one edit (one undo step), never four intermediate resizes. Invalid input reverts.
 */
export function NumberField({ label, ariaLabel, value, min, max, onCommit, testId, unit = "px" }: { label: string; ariaLabel?: string; value: number; min: number; max: number; onCommit: (n: number) => void; testId: string; unit?: string }) {
  const id = useId();
  // A draft exists only while the field is being edited; otherwise it shows the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const text = draft ?? String(value);

  /** Returns the value now shown in the field. */
  function commit(): string {
    const raw = text.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return String(value);
    const clamped = Math.min(max, Math.max(min, Math.round(n)));
    if (clamped !== value) onCommit(clamped);
    return String(clamped);
  }

  return (
    <label htmlFor={id} className="block">
      {label && <span className="t-micro mb-1.5 block text-ink-3">{label}</span>}
      <span className="flex items-center rounded-sm border border-line bg-surface focus-within:border-accent">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          data-testid={testId}
          aria-label={ariaLabel}
          value={text}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.-]/g, ""))}
          onFocus={() => setDraft(String(value))}
          onBlur={() => {
            // Escape blurs too, but must abandon the draft rather than commit it.
            if (!cancelled.current) commit();
            cancelled.current = false;
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setDraft(commit());
            } else if (e.key === "Escape") {
              cancelled.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="t-mono h-9 w-full min-w-0 bg-transparent px-2.5 text-[13px] text-ink outline-none max-md:h-11"
        />
        {unit && <span className="t-mono pr-2.5 text-[11px] text-ink-3">{unit}</span>}
      </span>
    </label>
  );
}
