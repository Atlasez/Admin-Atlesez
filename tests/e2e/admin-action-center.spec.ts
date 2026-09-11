import { expect, test, type Page } from "@playwright/test";

async function mockShell(
  page: Page,
  onTransition?: (body: unknown) => void,
  includeBulkTasks = false,
) {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "alice@example.com", isManager: true },
      });
      return;
    }
    if (url.pathname === "/api/admin/profile") {
      await route.fulfill({
        json: { profile: { display_name: "Alice", avatar_url: "" } },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications") {
      await route.fulfill({
        json: { notifications: [], unreadNotificationsCount: 0 },
      });
      return;
    }
    if (url.pathname === "/api/admin/action-center") {
      const firstTask = {
        id: "task:task-1",
        kind: "task",
        title: "定義を確認",
        detail: "フィードバックを確認してください。",
        href: "/admin/operations/?project=atlas",
        status: "open",
        priority: "urgent",
        updatedAt: "2026-09-10T00:00:00.000Z",
        dueAt: "2026-09-10T01:00:00.000Z",
        project: "アトラス",
        subject: "数学",
        read: false,
        actions: [
          {
            entityType: "task",
            entityId: "task-1",
            fromState: "open",
            toState: "doing",
            label: "着手",
            expectedUpdatedAt: "2026-09-10T00:00:00.000Z",
          },
        ],
      };
      const bulkTask = {
        ...firstTask,
        id: "task:task-2",
        title: "命題を確認",
        status: "doing",
        priority: "normal",
        updatedAt: "2026-09-10T00:05:00.000Z",
        dueAt: null,
        actions: [
          {
            entityType: "task",
            entityId: "task-2",
            fromState: "doing",
            toState: "done",
            label: "完了",
            expectedUpdatedAt: "2026-09-10T00:05:00.000Z",
          },
        ],
      };
      const notification = {
        id: "notification:n-1",
        kind: "notification",
        title: "新しいコメント",
        detail: "本文へのコメントがあります。",
        href: "/admin/editor/?document=doc-1",
        status: "unread",
        priority: "new",
        updatedAt: "2026-09-10T00:00:00.000Z",
        dueAt: null,
        project: null,
        subject: null,
        read: false,
        notificationIds: ["n-1"],
        actions: [],
      };
      const items = includeBulkTasks
        ? [
            {
              ...bulkTask,
              id: "task:task-1",
              title: "定義を確認",
              actions: [{ ...bulkTask.actions[0], entityId: "task-1" }],
            },
            bulkTask,
            notification,
          ]
        : [firstTask, notification];
      await route.fulfill({
        json: {
          generatedAt: "2026-09-10T00:00:00.000Z",
          counts: {
            today: 1,
            dueSoon: 1,
            unread: 1,
            approvals: 0,
            assigned: 1,
          },
          items,
          history: [
            {
              id: "task:done-1",
              kind: "task",
              title: "完了タスク",
              detail: "対応済み",
              href: "/admin/operations/?project=atlas",
              status: "done",
              priority: "read",
              updatedAt: "2026-09-09T00:00:00.000Z",
              dueAt: null,
              project: "アトラス",
              subject: null,
              read: true,
              actions: [],
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/workflow/transition") {
      onTransition?.(route.request().postDataJSON());
      await route.fulfill({
        json: {
          ok: true,
          status: "doing",
          transition: { updatedAt: "2026-09-10T02:00:00.000Z" },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/command-search") {
      await route.fulfill({
        json: {
          results: [
            {
              type: "記事",
              title: "群の定義",
              detail: "数学 ／ draft",
              href: "/admin/editor/?document=doc-1",
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications/read") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });
}

test("アクションセンターで絞り込みと状態変更を操作できる", async ({ page }) => {
  let transitionBody: Record<string, unknown> | null = null;
  await mockShell(page, (body) => {
    transitionBody = body as Record<string, unknown>;
  });
  await page.goto("admin/action-center/");
  await expect(
    page.getByRole("heading", { name: "アクションセンター" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "未対応", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("link", { name: /タスク管理を開く/ }),
  ).toHaveAttribute("href", "/admin/member-tasks/");
  page.once("dialog", (dialog) => dialog.accept("未対応の確認"));
  await page.getByRole("button", { name: "表示を保存", exact: true }).click();
  await expect(
    page.locator('[data-action-saved-view] option[value]:not([value=""])'),
  ).toHaveText("未対応の確認");
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(2);
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-open"),
  ).toHaveText("タスク管理で開く");
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-kind-icon"),
  ).toBeVisible();
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-priority-dot"),
  ).toBeVisible();
  await page.getByRole("button", { name: "着手" }).click();
  expect(transitionBody).toMatchObject({
    expectedUpdatedAt: "2026-09-10T00:00:00.000Z",
  });
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(2);
  await page.getByRole("button", { name: "完了・履歴" }).click();
  await expect(page.locator("[data-action-items]")).toContainText("完了タスク");
});

test("⌘Kで横断検索を開き、記事候補へ移動できる", async ({ page }) => {
  await mockShell(page);
  await page.goto("admin/action-center/");
  await page.keyboard.press("Meta+K");
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toBeVisible();
  await page.locator("[data-admin-command-input]").fill("群の");
  await expect(dialog).toContainText("群の定義");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/editor\/\?document=doc-1/);
});

test("選択したタスクを一括完了し、直後に元へ戻せる", async ({ page }) => {
  const transitionBodies: Array<Record<string, unknown>> = [];
  await mockShell(
    page,
    (body) => transitionBodies.push(body as Record<string, unknown>),
    true,
  );
  await page.goto("admin/action-center/");
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(3);
  await page.locator('[data-action-select="task:task-1"]').check();
  await page.locator('[data-action-select="task:task-2"]').check();
  await expect(page.locator("[data-action-bulkbar]")).toBeVisible();
  await page
    .locator("[data-action-bulk-action]")
    .selectOption({ label: "完了（2件）" });
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.locator("[data-action-undo]")).toContainText(
    "2件を完了にしました。",
  );
  expect(
    transitionBodies.filter((body) => body.toState === "done"),
  ).toHaveLength(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.locator("[data-action-undo]")).toBeHidden();
  expect(
    transitionBodies.filter(
      (body) => body.fromState === "done" && body.toState === "open",
    ),
  ).toHaveLength(2);
});
