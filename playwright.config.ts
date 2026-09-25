import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL runs the suite against an already-running server (e.g. a production build with
// SHOTEXA_ENABLE_SPIKES=1), avoiding dev-server on-demand compilation during tests.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "src/tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: external ?? "http://localhost:3000" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Spike C: the OCR flow must work cross-browser (Playwright WebKit ≠ Safari; see report).
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /ocr-spike|pdf-spike|metadata-spike/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /ocr-spike|pdf-spike|metadata-spike/ },
  ],
  webServer: external
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/spikes/stitch",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
