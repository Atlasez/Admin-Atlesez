import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `${(
  process.env.E2E_BASE_URL ?? `http://localhost:${testPort}`
).replace(/\/$/, "")}/`;
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
          command: `PORT=${testPort} node scripts/serve-dist.mjs`,
          port: testPort,
          reuseExistingServer: true,
        },
      }),
});
