'use client';

import type { CSSProperties } from "react";
import { useToastStore } from './use-toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const icons = {
  success: <CheckCircle />,
  error: <AlertCircle />,
  warning: <AlertTriangle />,
  info: <Info />,
};

const tones = {
  success: { icon: "bg-success-soft text-success", rail: "bg-success" },
  error: { icon: "bg-error-soft text-error", rail: "bg-error" },
  warning: { icon: "bg-warning-soft text-warning", rail: "bg-warning" },
  info: { icon: "bg-accent-soft text-accent-ink", rail: "bg-accent" },
};

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:mx-0 sm:w-[25rem] sm:max-w-none sm:px-0 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
    >
      {toasts.map((toast) => {
        const tone = tones[toast.type];
        const duration = toast.duration ?? 4_000;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto relative isolate flex items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface px-4 py-3.5 pr-3 shadow-md motion-safe:animate-[toast-enter_var(--duration-slow)_var(--ease-out)_both]"
            role="status"
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
            <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${tone.icon} [&_svg]:size-[18px]`}>
              {icons[toast.type]}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="t-label text-ink">{toast.message}</p>
              {toast.description && <p className="t-body-sm mt-1 text-ink-2">{toast.description}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label={`Close ${toast.message}`}
              className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-none"
            >
              <X className="size-4" />
            </button>
            {duration > 0 && (
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line">
                <span className={`block h-full origin-left ${tone.rail} motion-safe:animate-[toast-countdown_linear_forwards]`} style={{ animationDuration: `${duration}ms` } as CSSProperties} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
