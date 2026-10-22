import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Local production QA deliberately declines analytics before hydration. This avoids
// a consent-panel click race and the Vercel-only analytics script's localhost 404.
// Consent behavior itself is covered by the separate analytics test suites.
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Quality audit config is local-only");
export default defineConfig({
  ...base,
  // Heavy local engines and cold WebKit canvas/route initialization can exceed
  // Playwright's 5 s assertion default on the audit machine. Conditions are unchanged.
  expect: { ...base.expect, timeout: 30_000 },
  outputDir: "test-results/quality-audit",
  use: { ...base.use, baseURL: origin, storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "shotexa.analytics-consent.v1", value: "rejected" }, { name: "shotexa.vercel-analytics-opt-out.v1", value: "true" }] }] } },
});
