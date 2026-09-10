import { expect, test } from "@playwright/test";

test("開発者向け診断は状態を一覧表示し、再確認できる", async ({ page }) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "admin@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  let requests = 0;
  await page.route("**/api/admin/developer/diagnostics", async (route) => {
    requests += 1;
    await route.fulfill({
      json: {
        generatedAt: "2026-09-10T00:00:00.000Z",
        build: { commit: "test-sha" },
        checks: [
          {
            id: "database",
            label: "運用データベース",
            status: "ok",
            detail: "接続できています",
            durationMs: 2,
          },
          {
            id: "schema",
            label: "管理データのスキーマ",
            status: "warning",
            detail: "未適用のテーブルがあります",
          },
        ],
      },
    });
  });

  await page.goto("admin/developer/");
  await expect(
    page.getByRole("heading", { name: "開発者向け診断" }),
  ).toBeVisible();
  await expect(page.getByText("運用データベース")).toBeVisible();
  await expect(page.getByText("正常")).toBeVisible();
  await expect(page.getByText("確認が必要")).toBeVisible();
  await page.getByRole("button", { name: "再確認" }).click();
  await expect.poll(() => requests).toBe(2);
});
