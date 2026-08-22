import { expect, test, type Page } from "@playwright/test";

type MockOptions = {
  notificationStatus?: number;
};

async function mockAdminShell(page: Page, options: MockOptions = {}) {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: "alice@example.com",
          isManager: false,
        }),
      });
      return;
    }
    if (url.pathname === "/api/admin/profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile: { display_name: "Alice", avatar_url: "" },
        }),
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications") {
      const status = options.notificationStatus ?? 200;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status === 200
            ? {
                notifications: [
                  {
                    id: "comment-12345678",
                    kind: "comment",
                    title: "原稿へのコメント",
                    detail: "定義を確認してください。",
                    href: "/admin/editor/?document=doc-1",
                    updatedAt: "2026-08-22T00:00:00.000Z",
                    read: false,
                  },
                ],
              }
            : { error: "SQL: no such table: internal_notifications" },
        ),
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications/read") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    if (url.pathname === "/api/admin/portal") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          todos: [],
          calendar: { events: [] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not found" }),
    });
  });
}

test("通知panelをtoggle・外側・Escape・閉じるボタンで操作できる", async ({
  page,
}) => {
  await mockAdminShell(page);
  await page.goto("admin/portal/");

  const toggle = page.locator("[data-admin-notifications]");
  const panel = page.locator("[data-admin-notification-panel]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute(
    "aria-controls",
    "admin-notification-panel",
  );
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toContainText("原稿へのコメント");

  await panel.getByText("通知", { exact: true }).click();
  await expect(panel).toBeVisible();

  await toggle.click();
  await expect(panel).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByRole("heading", { name: "Atlasezメンバー用サイト" }).click();
  await expect(panel).toBeHidden();

  await toggle.click();
  await panel.getByRole("button", { name: "通知を閉じる" }).click();
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("通知取得失敗を空状態や内部エラーに置き換えない", async ({ page }) => {
  await mockAdminShell(page, { notificationStatus: 500 });
  await page.goto("admin/portal/");

  await page.locator("[data-admin-notifications]").click();
  const panel = page.locator("[data-admin-notification-panel]");
  await expect(panel).toContainText(
    "通知を取得できませんでした。時間をおいて再度お試しください。",
  );
  await expect(panel).not.toContainText("通知はまだありません。");
  await expect(panel).not.toContainText("internal_notifications");
  await expect(
    panel.locator("[data-mark-all-notifications-read]"),
  ).toBeHidden();
});

test("ClientRouterで往復後も通知とportal言語更新が一度の操作で動く", async ({
  page,
}) => {
  await mockAdminShell(page);
  await page.goto("admin/portal/");

  await page.getByRole("link", { name: /学習サイト「アトラス」運営/ }).click();
  await expect(page).toHaveURL(/\/admin\/atlas\/$/);
  await page.locator(".project-heading > a").click();
  await expect(page).toHaveURL(/\/admin\/portal\/$/);

  const toggle = page.locator("[data-admin-notifications]");
  const panel = page.locator("[data-admin-notification-panel]");
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  await panel.getByText("通知", { exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.evaluate(() => {
    localStorage.setItem("atlasez-prefs", JSON.stringify({ lang: "eng" }));
    window.dispatchEvent(new CustomEvent("atlasez-lang-change"));
  });
  await expect(page.locator("[data-todos]")).toHaveText(
    "There are no open tasks.",
  );
  await expect(
    page.getByRole("heading", { name: "Co-working & social events" }),
  ).toBeVisible();
});

test("portalの小ラベルだけを削除し主要sectionを維持する", async ({ page }) => {
  await mockAdminShell(page);
  await page.goto("admin/portal/");

  await expect(page.getByText("PROJECTS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("EVENTS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("MY TASKS", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "参加中のプロジェクト" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "同時作業会・交流会の日程" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "自分の未完了タスク" }),
  ).toBeVisible();
});
