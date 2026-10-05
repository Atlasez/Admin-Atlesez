import { expect, test } from "@playwright/test";

test("担当プロジェクトへの受入フォローリンクは直接そのプロジェクトの記録を読み込む", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: "reviewer@example.test",
          isManager: false,
          canAccessAdmin: false,
          canAccessScopedAdminPages: false,
          managerProjects: ["thinking-cafe"],
        },
      });
    if (url.pathname === "/api/admin/profile")
      return route.fulfill({ json: { profile: { display_name: "受入担当" } } });
    if (url.pathname === "/api/admin/notifications")
      return route.fulfill({ json: { notifications: [] } });
    if (url.pathname === "/api/admin/member-intake") {
      expect(url.searchParams.get("project")).toBe("thinking-cafe");
      return route.fulfill({
        json: {
          project: {
            id: "thinking-cafe",
            slug: "thinking-cafe",
            name: "考えるカフェ",
          },
          entries: [
            {
              email: "member@example.test",
              display_name: "参加メンバー",
              is_member: 1,
              revision: 0,
            },
          ],
          responsibleCandidates: [
            { email: "reviewer@example.test", displayName: "受入担当" },
          ],
        },
      });
    }
    return route.fulfill({
      status: 403,
      json: { error: "別の管理APIは使用できません。" },
    });
  });
  await page.goto("admin/member-intake/?project=thinking-cafe");
  await expect(page.locator("[data-project-select]")).toHaveValue(
    "thinking-cafe",
  );
  await expect(
    page.getByRole("heading", { name: "参加メンバー" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "応募管理へ戻る →" }),
  ).toHaveAttribute("href", "/admin/applications/?project=thinking-cafe");
});
