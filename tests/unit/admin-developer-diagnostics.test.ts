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
