import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL runs the suite against an already-running server (e.g. a production build with
// SHOTEXA_ENABLE_SPIKES=1), avoiding dev-server on-demand compilation during tests.
const external = process.env.E2E_BASE_URL;
// Not 3000: that port is commonly taken by other local projects, and reuseExistingServer would test them.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "src/tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: external ?? `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Spike C: the OCR flow must work cross-browser (Playwright WebKit ≠ Safari; see report).
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /ocr-spike|pdf-spike|metadata-spike|workspace/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /ocr-spike|pdf-spike|metadata-spike|workspace/ },
  ],
  webServer: external
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
