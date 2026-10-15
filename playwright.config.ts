import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    ...(process.env.TEST_BASE_URL ? [] : [{
      command: "npm run dev -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    }]),
    { command: "npx vite --config tests/workspace-harness/vite.config.ts", url: "http://127.0.0.1:4180", reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
  reporter: "list",
});
