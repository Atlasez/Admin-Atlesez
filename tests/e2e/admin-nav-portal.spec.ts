import { expect, test, type Page } from "@playwright/test";

type MockOptions = {
  notificationStatus?: number;
  avatarUrl?: string;
  projects?: Array<{
    id: string;
    slug?: string;
    name: string;
    description?: string;
    role: "manager" | "member";
  }>;
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
          profile: {
            display_name: "Alice",
            avatar_url: options.avatarUrl ?? "",
          },
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
          projects: options.projects ?? [
            {
              id: "atlas",
              slug: "atlas",
              name: "学習サイト「アトラス」運営",
              role: "manager",
            },
          ],
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

test("ブランド・通知・プロフィールの各アイコンを表示する", async ({ page }) => {
  const avatarUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%232d6ea8'/%3E%3C/svg%3E";
  await mockAdminShell(page, { avatarUrl });
  await page.goto("admin/portal/");

  const brand = page.locator(".admin-nav-brand-logo img");
  const avatar = page.locator("[data-admin-account-image]");
  const notification = page.locator("[data-admin-notifications] svg");
  await expect(brand).toBeVisible();
  await expect(avatar).toBeVisible();
  await expect(notification).toBeVisible();
  await expect(brand).toHaveJSProperty("complete", true);
  await expect(avatar).toHaveJSProperty("complete", true);
  expect(
    await brand.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  expect(
    await avatar.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});

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
  await expect(page.locator('[data-admin-project-link="manage"]')).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "運営として参加中" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "参加者として参加中" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "同時作業会・交流会の日程" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "自分の未完了タスク" }),
  ).toBeVisible();
});

test("参加中のプロジェクトを運営と参加者に分けて表示する", async ({ page }) => {
  await mockAdminShell(page, {
    projects: [
      {
        id: "atlas",
        slug: "atlas",
        name: "学習サイト「アトラス」運営",
        description: "学習サイトの編集と運営",
        role: "manager",
      },
      {
        id: "secretariat",
        slug: "secretariat",
        name: "Atlasez運営事務局",
        role: "member",
      },
      {
        id: "seminar-platform",
        slug: "seminar-platform",
        name: "ゼミプラットフォーム",
        role: "member",
      },
    ],
  });
  await page.goto("admin/portal/");

  const managed = page.locator('[data-project-group="managed"]');
  const member = page.locator('[data-project-group="member"]');
  await expect(managed.getByRole("link")).toHaveCount(1);
  await expect(managed).toContainText("学習サイト「アトラス」運営");
  await expect(member.getByRole("link")).toHaveCount(2);
  await expect(member).toContainText("Atlasez運営事務局");
  await expect(member).toContainText("ゼミプラットフォーム");
  await expect(managed).not.toContainText("Atlasez運営事務局");
  await expect(member).not.toContainText("学習サイト「アトラス」運営");
  await expect(page.locator('[data-admin-project-link="manage"]')).toBeHidden();
});

test("メンバー用サイトの未完了タスクは参加中プロジェクトを横断して表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "alice@example.com", isManager: false },
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
      await route.fulfill({ json: { notifications: [] } });
      return;
    }
    if (url.pathname === "/api/admin/portal") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            { id: "atlas", name: "学習サイト「アトラス」運営", role: "member" },
            { id: "secretariat", name: "Atlasez運営事務局", role: "member" },
          ],
          todos: [
            {
              project_id: "atlas",
              project_name: "学習サイト「アトラス」運営",
              title: "数学記事の確認",
              status: "open",
            },
            {
              project_id: "secretariat",
              project_name: "Atlasez運営事務局",
              title: "応募管理の確認",
              status: "doing",
            },
          ],
          calendar: { events: [] },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });

  await page.goto("admin/portal/");
  await expect(page.locator("[data-todos] .todo").nth(0)).toContainText(
    "数学記事の確認",
  );
  await expect(page.locator("[data-todos] .todo").nth(1)).toContainText(
    "応募管理の確認",
  );
  await expect(page.locator("[data-todos] .todo")).toHaveCount(2);
  await expect(page.locator("[data-todos] .todo").nth(0)).toContainText(
    "学習サイト「アトラス」運営",
  );
  await expect(page.locator("[data-todos] .todo").nth(1)).toContainText(
    "Atlasez運営事務局",
  );
});
