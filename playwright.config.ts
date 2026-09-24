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
    // Firefox/WebKit are required before production (architecture §54); not installed for the spike.
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/spikes/stitch",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
