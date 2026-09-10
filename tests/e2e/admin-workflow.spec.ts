import { test, expect } from "@playwright/test";

test.describe("状態遷移の管理画面", () => {
  test("状態件数と許可された遷移を表示する", async ({ page }) => {
    await page.route("**/api/admin/workflow/transitions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: "2026-09-10T00:00:00.000Z",
          entities: {
            task: {
              label: "タスク",
              states: ["open", "doing", "done"],
              counts: { open: 2, doing: 1, done: 3 },
            },
            document: {
              label: "記事",
              states: ["draft", "in-review", "approved"],
              counts: { draft: 4, "in-review": 1, approved: 2 },
            },
          },
          transitions: [
            {
              entityType: "task",
              from: "open",
              to: "doing",
              label: "着手",
              requiredRole: "assignee",
            },
            {
              entityType: "document",
              from: "in-review",
              to: "approved",
              label: "承認",
              requiredRole: "reviewer",
            },
          ],
        }),
      });
    });
    await page.goto("admin/workflow/");
    await expect(
      page.getByRole("heading", { name: "状態遷移", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".workflow-entity")).toHaveCount(2);
    await expect(page.locator(".workflow-state strong").first()).toHaveText(
      "2",
    );
    await expect(page.locator(".workflow-rule")).toHaveCount(2);
    await expect(page.locator(".workflow-rules")).toContainText("着手");
  });

  test("読み込み失敗時に再試行を表示する", async ({ page }) => {
    await page.route("**/api/admin/workflow/transitions", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "一時的な障害" }),
      });
    });
    await page.goto("admin/workflow/");
    await expect(page.getByRole("alert")).toContainText(
      "状態遷移を読み込めませんでした",
    );
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();
  });
});
