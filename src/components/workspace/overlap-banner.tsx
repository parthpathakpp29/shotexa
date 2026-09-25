"use client";

import { Wand2 } from "lucide-react";
import Link from "next/link";
import { ToolIcon } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { TOOLS } from "@/config/tools";
import { useWorkspace } from "./workspace-provider";

/**
 * "These screenshots appear to overlap." Driven by the real lightweight overlap hint
 * (128-px greyscale proxies, no OpenCV). Only shown when the hint says likely.
 */
export function OverlapBanner({ className }: { className?: string }) {
  const hint = useWorkspace((s) => s.overlapHint);
  const setOverlapHint = useWorkspace((s) => s.setOverlapHint);
  const originals = useWorkspace((s) => s.order.filter((id) => s.files[id]?.kind === "original").length);
  if (hint.status !== "likely" || hint.dismissed) return null;
  const all = hint.pairs.length === originals - 1;
  return (
    <Notice
      tone="accent"
      icon={<Wand2 />}
      title="These screenshots appear to overlap."
      className={className}
      actions={
        <>
          <Button variant="soft" onClick={() => setOverlapHint({ dismissed: true })}>
            Keep separate
          </Button>
          <Button variant="primary" asChild>
            <Link href={TOOLS.stitch.route}>
              <ToolIcon name="stitch" /> Smart Stitch
            </Link>
          </Button>
        </>
      }
    >
      {all ? "We found matching sections between your screenshots — Smart Stitch can join them into one long image." : "Some of your screenshots share matching sections — Smart Stitch can join them into one long image."}
    </Notice>
  );
}
