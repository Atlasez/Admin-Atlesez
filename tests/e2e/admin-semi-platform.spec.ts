import { expect, test } from "@playwright/test";

test.describe("ゼミプラットフォーム運営ホーム", () => {
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

  test("運営メニューと現行サイトへの導線を表示する", async ({ page }) => {
    await page.goto("admin/semi-platform/");

    await expect(
      page.getByRole("heading", { name: "ゼミプラットフォーム", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "運営ワークスペース" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "関連サイト" }),
    ).toBeVisible();

    const expectedLinks = [
      ["ゼミ・タスク管理", "/admin/operations/?project=seminar-platform"],
      ["ゼミ・カレンダー", "/admin/calendar/?project=seminar-platform"],
      ["日程・交流", "/admin/co-working/?project=seminar-platform"],
      ["運営内自己紹介", "/admin/introductions/?project=seminar-platform"],
      ["マイページ", "/admin/workspace/?project=seminar-platform"],
    ] as const;

    for (const [name, href] of expectedLinks) {
      const link = page.locator(`.project-links a[href="${href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toContainText(name);
    }

    await expect(
      page.getByRole("link", { name: /現行サイト/ }),
    ).toHaveAttribute("href", "https://sites.google.com/view/atlasez-semi");
  });

  test("メニューカードはデスクトップ2列、モバイル1列で揃う", async ({
    page,
  }) => {
    await page.goto("admin/semi-platform/");
    const cards = page.locator(".menu-group:first-of-type .project-links a");

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopBoxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left) };
      }),
    );
    expect(new Set(desktopBoxes.map((box) => box.top)).size).toBe(2);
    expect(new Set(desktopBoxes.map((box) => box.left)).size).toBe(2);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBoxes = await cards.evaluateAll((elements) =>
      elements.map((element) =>
        Math.round(element.getBoundingClientRect().left),
      ),
    );
    expect(new Set(mobileBoxes).size).toBe(1);
  });
});
