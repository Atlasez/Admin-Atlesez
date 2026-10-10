import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:4322",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command:
      "npx astro build && ASTRO_PREVIEW_BACKGROUND=0 npx astro preview --host 127.0.0.1 --port 4325 --strictPort",
    url: "http://127.0.0.1:4325",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
