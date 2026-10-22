"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SITE } from "@/config/site";
import { cn } from "@/lib/cn";
import { useShortcutLabel } from "@/lib/use-shortcut-label";
import { useDropTarget, useWorkspaceContext } from "./workspace-provider";

/**
 * Primary input surface (homepage hero, tool landings). Paste works anywhere on the page
 * via the provider — the "Paste a screenshot" line is a hint, not a clipboard button.
 */
export function Uploader({ className, sample = true, multipleHint = "or drag and drop screenshots anywhere in this area", fileLabel = "screenshots" }: { className?: string; sample?: boolean; multipleHint?: string; fileLabel?: string }) {
  const { openPicker, loadSample } = useWorkspaceContext();
  const drop = useDropTarget();
  const paste = useShortcutLabel("V");
  const open = useShortcutLabel("O");
  const [loading, setLoading] = useState(false);
  return (
    <div
      {...drop.props}
      data-testid="dropzone"
      className={cn(
        "group relative rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center shadow-sm transition-[background-color,border-color,box-shadow] duration-200 sm:p-10",
        drop.over && "is-dragging border-accent bg-accent-soft shadow-accent",
        className,
      )}
    >
      {/* Touch screens can't paste into the page or drag files in, so they get a plain prompt. */}
      <p className="inline-flex items-center gap-2.5 rounded-md border border-line bg-surface-3 px-3.5 py-2 text-sm text-ink pointer-coarse:hidden">
        <ImagePlus aria-hidden className="size-4 text-accent" />
        Paste {fileLabel === "screenshots" ? "a screenshot" : "an image"}
        <Kbd>{paste}</Kbd>
      </p>
      <p className="t-body-sm mt-4 text-ink-2 pointer-coarse:mt-0">
        <span className="pointer-coarse:hidden">{drop.over ? "Drop to add your screenshots" : multipleHint}</span>
        <span className="hidden pointer-coarse:inline">Choose {fileLabel} from your photos or files.</span>
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="lg" kbd={open} onClick={openPicker}>
          Choose {fileLabel}
        </Button>
        {sample && (
          <Button
            variant="secondary"
            size="lg"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await loadSample();
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading && <Loader2 className="animate-spin" />}
            Try sample screenshots
          </Button>
        )}
      </div>
      <p className="t-mono mt-6 flex items-center justify-center gap-2 text-[12px] text-ink-3">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {SITE.trustLine}
      </p>
    </div>
  );
}
