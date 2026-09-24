import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "src/tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Spike C: the OCR flow must work cross-browser (Playwright WebKit ≠ Safari; see report).
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /ocr-spike|pdf-spike/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /ocr-spike|pdf-spike/ },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/spikes/stitch",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
