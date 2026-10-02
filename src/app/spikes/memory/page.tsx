import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemoryHarness } from "./memory-harness";

/**
 * Spike B — large image / browser memory harness. Driven by scripts/spikes/memory/run.ts.
 * Hidden in production builds unless SHOTEXA_ENABLE_SPIKES=1.
 */
export const metadata: Metadata = {
  title: "Spike B — Memory harness (dev)",
  robots: { index: false, follow: false },
};

export default function MemorySpikePage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOTEXA_ENABLE_SPIKES !== "1") notFound();
  return <MemoryHarness />;
}
