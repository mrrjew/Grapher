import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 320, height: 740 },
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        APP_ORIGIN: "",
        SUPABASE_URL: "",
        SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
        RATE_LIMIT_SECRET: "",
      },
    },
    {
      command: "npx vite --config tests/harness/vite.config.ts",
      url: "http://127.0.0.1:3001",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
