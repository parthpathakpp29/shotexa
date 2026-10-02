/**
 * Site-wide configuration. Production is the only indexable environment: Vercel preview
 * deployments (VERCEL_ENV=preview) and development are always noindex (architecture §50).
 */
export const SITE = {
  name: "Shotexa",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://shotexa.com").replace(/\/$/, ""),
  tagline: "Everything you need for screenshots — private, fast, and in your browser.",
  description:
    "Stitch screenshots, hide sensitive information, extract text and create PDFs directly in your browser. Files stay on your device — no sign-up, no watermark.",
  trustLine: "Processed locally · Files stay on your device",
} as const;

/** Indexable only on the production deployment. */
export function isIndexable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SHOTEXA_NOINDEX === "1") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}
