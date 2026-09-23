import { defineConfig } from "@playwright/test";

const requestedE2ePort = Number(process.env.E2E_PORT ?? 4321);
const e2ePort =
  Number.isInteger(requestedE2ePort) &&
  requestedE2ePort > 0 &&
  requestedE2ePort < 65_536
    ? requestedE2ePort
    : 4321;
const baseURL = `${(process.env.E2E_BASE_URL ?? `http://localhost:${e2ePort}`).replace(/\/$/, "")}/`;
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
          port: e2ePort,
          // 別ワークツリーの開発サーバーを誤ってテスト対象にしない。
          // 既存サーバーを使う場合だけ E2E_REUSE_SERVER=1 を明示する。
          reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
          env: {
            PORT: String(e2ePort),
            BASE_PATH: process.env.BASE_PATH ?? "",
          },
        },
      }),
});
