import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OcrSpike } from "./ocr-spike";

/**
 * Spike C — OCR developer prototype. NOT the /screenshot-to-text product page.
 * Hidden in production builds unless SHOTEXA_ENABLE_SPIKES=1.
 */
export const metadata: Metadata = {
  title: "Spike C — OCR (dev)",
  robots: { index: false, follow: false },
};

export default function OcrSpikePage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOTEXA_ENABLE_SPIKES !== "1") notFound();
  return <OcrSpike />;
}
