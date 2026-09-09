import { defineConfig } from "@playwright/test";

const baseURL = `${(process.env.E2E_BASE_URL ?? "http://localhost:4321").replace(/\/$/, "")}/`;
const remoteBaseURL =
  /^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/))/i.test(baseURL);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
  },
  ...(remoteBaseURL
    ? {}
    : {
        webServer: {
          command: "node scripts/serve-dist.mjs",
          port: 4321,
          reuseExistingServer: true,
        },
      }),
});
