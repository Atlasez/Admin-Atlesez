import { expect, test } from "@playwright/test";

const projects = [
  {
    path: "admin/student-council/",
    title: "日本生徒会協会運営",
    project: "student-council-exchange",
  },
  {
    path: "admin/thinking-cafe/",
    title: "考えるカフェ運営",
    project: "thinking-cafe",
  },
] as const;

test.describe("プロジェクト運営ホーム", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/auth-status") {
        await route.fulfill({
          json: { email: "alice@example.com", isManager: false },
        });
        return;
      }
      if (path === "/api/admin/profile") {
        await route.fulfill({
          json: { profile: { display_name: "Alice", avatar_url: "" } },
        });
        return;
      }
      if (path === "/api/admin/notifications") {
        await route.fulfill({ json: { notifications: [] } });
        return;
      }
      await route.fulfill({ status: 404, json: { error: "not found" } });
    });
  });

  for (const { path, title, project } of projects) {
    test(`${title}のトップからタスク管理とカレンダーを開ける`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(
          `[data-project-home="${project}"] .project-links a[href="/admin/operations/?project=${project}"]`,
        ),
      ).toContainText("タスク管理");
      await expect(
        page.locator(
          `[data-project-home="${project}"] .project-links a[href="/admin/calendar/?project=${project}"]`,
        ),
      ).toContainText("カレンダー");
      await expect(page.locator(".project-heading > a")).toHaveAttribute(
        "href",
        "/admin/portal/",
      );
    });
  }
});
