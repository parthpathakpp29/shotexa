"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mobile bottom sheet (Radix Dialog: focus trap, Escape, scroll lock, aria wiring).
 * Used for the file tray and tool controls on small screens (architecture §20).
 */
export function BottomSheet({ open, onOpenChange, title, children, footer, className }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-dark/30 backdrop-blur-[1px] data-[state=open]:animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn("fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-xl border border-line bg-surface shadow-md outline-none", className)}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />
            <Dialog.Title className="font-display text-lg">{title}</Dialog.Title>
            <Dialog.Close className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
          {footer && <div className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
