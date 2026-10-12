import { expect, it } from "vitest";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

it("定期処理の実行履歴がない場合に稼働中と表示しない", async () => {
  const { request } = createAdminTestEnvironment();
  const response = await request(
    "/api/admin/developer/diagnostics",
    "global@atlasez.test",
  );

  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    checks: Array<{
      id: string;
      status: string;
      detail: string;
    }>;
  };
  const cron = data.checks.find((check) => check.id === "cron");

  expect(cron).toMatchObject({ status: "warning" });
  expect(cron?.detail).toContain("この画面では判定できません");
});

it("GitHub Appの必須設定が一部だけの場合は連携済みと表示しない", async () => {
  const { request, env } = createAdminTestEnvironment();
  Object.assign(env, {
    GITHUB_REPOSITORY: "Atlasez/Atlasez01",
    GITHUB_APP_ID: "isolated-app-id",
  });

  const response = await request(
    "/api/admin/developer/diagnostics",
    "global@atlasez.test",
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    checks: Array<{ id: string; detail: string }>;
  };

  expect(
    data.checks.find((check) => check.id === "bindings")?.detail,
  ).toContain("github:未設定");
});
