import { test, expect } from "@playwright/test";

test.describe("状態遷移の管理画面", () => {
  test("状態件数と許可された遷移を表示する", async ({ page }) => {
    await page.route("**/api/admin/workflow/diagnostics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: "2026-09-10T00:00:00.000Z",
          issues: [],
        }),
      });
    });
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
    await expect(page.locator(".workflow-diagnostics")).toContainText(
      "不整合はありません",
    );
  });

  test("共通Workflow APIの全エンティティ契約を送信できる", async ({ page }) => {
    const received: Array<{
      entityType: string;
      fromState: string;
      toState: string;
    }> = [];
    await page.route("**/api/admin/workflow/transition", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}");
      received.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: payload.toState }),
      });
    });
    await page.goto("admin/workflow/");
    await page.evaluate(async () => {
      const requests = [
        ["task", "open", "doing"],
        ["task", "doing", "done"],
        ["task", "done", "open"],
        ["document", "draft", "in-review"],
        ["document", "in-review", "approved"],
        ["application", "new", "reviewing"],
        ["application", "reviewing", "accepted"],
        ["application", "reviewing", "rejected"],
        ["approval", "pending", "approved"],
        ["approval", "pending", "rejected"],
      ] as const;
      await Promise.all(
        requests.map(([entityType, fromState, toState]) =>
          fetch("/api/admin/workflow/transition", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              entityType,
              entityId: `test-${entityType}`,
              fromState,
              toState,
              idempotencyKey: `e2e-${entityType}`,
            }),
          }),
        ),
      );
    });
    await expect
      .poll(() =>
        received
          .map(
            (item) => `${item.entityType}:${item.fromState}->${item.toState}`,
          )
          .sort(),
      )
      .toEqual([
        "application:new->reviewing",
        "application:reviewing->accepted",
        "application:reviewing->rejected",
        "approval:pending->approved",
        "approval:pending->rejected",
        "document:draft->in-review",
        "document:in-review->approved",
        "task:doing->done",
        "task:done->open",
        "task:open->doing",
      ]);
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
