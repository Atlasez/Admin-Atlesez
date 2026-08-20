import { test, expect } from "@playwright/test";

test.describe("A/D 原稿一覧の作業導線", () => {
  test("プロジェクトHomeでは原稿一覧だけを入口にする", async ({ page }) => {
    await page.goto("admin/atlas/");

    await expect(
      page.getByRole("link", { name: /原稿一覧を開く/ }),
    ).toHaveAttribute("href", "/admin/articles/");
    await expect(page.getByRole("link", { name: /新規記事作成/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /加筆・修正/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^査読/ })).toHaveCount(0);
  });

  test("原稿一覧に同じスタイルの3導線だけを表示する", async ({ page }) => {
    await page.goto("admin/articles/");

    const workflowCards = page.locator(".workflow-card");
    await expect(workflowCards).toHaveCount(3);
    await expect(workflowCards.nth(0)).toHaveAttribute(
      "href",
      "/admin/editor/?new=1&from=articles",
    );
    await expect(workflowCards.nth(1)).toHaveAttribute(
      "href",
      "/admin/articles/?mode=revise#article-list",
    );
    await expect(workflowCards.nth(2)).toHaveAttribute(
      "href",
      "/admin/review/",
    );
    await expect(page.locator(".article-view-tabs")).toHaveCount(0);
    await expect(page.locator(".header-actions")).toHaveCount(0);

    const backgrounds = await workflowCards.evaluateAll((cards) =>
      cards.map((card) => getComputedStyle(card).backgroundColor),
    );
    expect(new Set(backgrounds).size).toBe(1);
  });
});

test.describe("A-2 管理メニュー", () => {
  test("外側クリックとEscapeで閉じる", async ({ page }) => {
    await page.goto("admin/atlas/");

    const menu = page.locator(".admin-management-menu");
    await menu.locator("summary").click();
    await expect(menu).toHaveAttribute("open", "");
    await page.locator(".project-heading h1").click();
    await expect(menu).not.toHaveAttribute("open", "");

    await menu.locator("summary").click();
    await expect(menu).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
  });
});
