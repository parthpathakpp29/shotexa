import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetadataSpike } from "./metadata-spike";

/**
 * Spike E — metadata inspection / Privacy Clean developer prototype. NOT the
 * /remove-image-metadata product page. Hidden in production unless SHOTEXA_ENABLE_SPIKES=1.
 */
export const metadata: Metadata = {
  title: "Spike E — Metadata / Privacy Clean (dev)",
  robots: { index: false, follow: false },
};

export default function MetadataSpikePage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOTEXA_ENABLE_SPIKES !== "1") notFound();
  return <MetadataSpike />;
}
