import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfSpike } from "./pdf-spike";

/**
 * Spike D — Smart screenshot-to-PDF pagination developer prototype. NOT the
 * /screenshot-to-pdf product page. Hidden in production builds unless SHOTEXA_ENABLE_SPIKES=1.
 */
export const metadata: Metadata = {
  title: "Spike D — Smart PDF (dev)",
  robots: { index: false, follow: false },
};

export default function PdfSpikePage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOTEXA_ENABLE_SPIKES !== "1") notFound();
  return <PdfSpike />;
}
