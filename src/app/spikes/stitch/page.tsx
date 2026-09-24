import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StitchSpike } from "./stitch-spike";

/**
 * Spike A — Smart Stitch developer prototype. NOT a product page.
 * Hidden in production builds unless SHOTEXA_ENABLE_SPIKES=1.
 */
export const metadata: Metadata = {
  title: "Spike A — Smart Stitch (dev)",
  robots: { index: false, follow: false },
};

export default function StitchSpikePage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOTEXA_ENABLE_SPIKES !== "1") notFound();
  return <StitchSpike />;
}
