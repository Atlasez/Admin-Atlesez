import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: "cafe@example.test",
          isManager: false,
          canAccessAdmin: false,
          canAccessScopedAdminPages: false,
          managerProjects: [],
        },
      });
    if (url.pathname === "/api/admin/profile")
      return route.fulfill({
        json: { profile: { display_name: "カフェメンバー" } },
      });
    if (url.pathname === "/api/admin/notifications")
      return route.fulfill({ json: { notifications: [] } });
    if (url.pathname === "/api/admin/project-profile") {
      expect(url.searchParams.get("project")).toBe("thinking-cafe");
      return route.fulfill({
        json: {
          project: {
            id: "thinking-cafe",
            name: "考えるカフェ",
            role: "member",
          },
          canEditArticles: false,
          canReview: false,
          memberProfile: { display_name: "カフェメンバー" },
          projectProfile: { internal_bio: "カフェの自己紹介" },
          assignments: ["運営メンバー"],
        },
      });
    }
    if (url.pathname === "/api/admin/project-introductions") {
      expect(url.searchParams.get("project")).toBe("thinking-cafe");
      return route.fulfill({
        json: {
          entries: [
            {
              display_name: "カフェの仲間",
              internal_bio: "討論を担当",
              assignments: ["運営メンバー"],
            },
          ],
          pagination: { nextCursor: null },
        },
      });
    }
    return route.fulfill({
      status: 403,
      json: { error: "管理者専用APIにはアクセスできません。" },
    });
  });
});

test("通常メンバーのプロジェクトトップとヘッダーはメンバー用タスク・カレンダーへ向く", async ({
  page,
}) => {
  await page.goto("admin/thinking-cafe/");
  const home = page.locator("[data-project-home]");
  await expect(
    home.locator('[data-member-operation-link="tasks"]'),
  ).toHaveAttribute("href", "/admin/member-tasks/?project=thinking-cafe");
  await expect(
    home.locator('[data-member-operation-link="calendar"]'),
  ).toHaveAttribute("href", "/admin/member-calendar/?project=thinking-cafe");
  await expect(
    page.locator(
      'nav [data-admin-site="thinking-cafe"][data-admin-page="operations"]',
    ),
  ).toHaveAttribute("href", "/admin/member-tasks/?project=thinking-cafe");
  await expect(page.locator("[data-admin-action-center-tab]")).toBeHidden();
  await expect(home.getByRole("link", { name: /^管理/ })).toBeHidden();
  await expect(home.getByRole("link", { name: /^マイページ/ })).toHaveAttribute(
    "href",
    "/admin/workspace/?project=thinking-cafe",
  );
});

test("通常メンバーのプロジェクトマイページは対象自己紹介を取得して管理原稿APIを呼ばない", async ({
  page,
}) => {
  let personalWorkspaceCalls = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/admin/personal-workspace")
      personalWorkspaceCalls += 1;
  });
  await page.goto("admin/workspace/?project=thinking-cafe");
  await expect(page.getByLabel("運営内自己紹介", { exact: true })).toHaveValue(
    "カフェの自己紹介",
  );
  await expect(page.locator("[data-article-workspace]")).toBeHidden();
  await expect(page.locator("[data-profile-review-link]")).toBeHidden();
  await expect(
    page.getByRole("link", { name: "自己紹介一覧を見る" }),
  ).toHaveAttribute("href", "/admin/introductions/?project=thinking-cafe");
  expect(personalWorkspaceCalls).toBe(0);
});

test("通常メンバーの自己紹介一覧を直接開いても所属先のデータと編集リンクになる", async ({
  page,
}) => {
  await page.goto("admin/introductions/?project=thinking-cafe");
  await expect(
    page.getByRole("heading", { name: "カフェの仲間" }),
  ).toBeVisible();
  await expect(page.locator(".intro-primary-action")).toHaveAttribute(
    "href",
    "/admin/workspace/?project=thinking-cafe",
  );
});
