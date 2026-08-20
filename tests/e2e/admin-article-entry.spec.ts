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
      "/admin/articles/?mode=review#article-list",
    );
    await expect(page.locator(".article-view-tabs")).toHaveCount(0);
    await expect(page.locator(".header-actions")).toHaveCount(0);

    const backgrounds = await workflowCards.evaluateAll((cards) =>
      cards.map((card) => getComputedStyle(card).backgroundColor),
    );
    expect(new Set(backgrounds).size).toBe(1);
  });

  test("V-1 査読は原稿一覧で未査読に絞り、自分への依頼を優先する", async ({
    page,
  }) => {
    await page.route("**/api/admin/editor/documents", async (route) => {
      await route.fulfill({
        json: {
          scope: { email: "alice@example.com" },
          documents: [
            {
              id: "other-review",
              subject: "physics",
              category: "mechanics",
              slug: "other-review",
              title: "別の担当者への査読",
              status: "in-review",
              updated_at: "2026-08-20T02:00:00.000Z",
              published_at: null,
              reviewer_email: "bob@example.com",
            },
            {
              id: "my-review",
              subject: "mathematics",
              category: "algebra",
              slug: "my-review",
              title: "自分への査読依頼",
              status: "in-review",
              updated_at: "2026-08-20T01:00:00.000Z",
              published_at: null,
              reviewer_email: "alice@example.com",
            },
            {
              id: "approved",
              subject: "mathematics",
              category: "algebra",
              slug: "approved",
              title: "査読済み原稿",
              status: "approved",
              updated_at: "2026-08-20T03:00:00.000Z",
              published_at: null,
            },
            {
              id: "draft",
              subject: "mathematics",
              category: "algebra",
              slug: "draft",
              title: "まだ下書きの原稿",
              status: "draft",
              updated_at: "2026-08-20T04:00:00.000Z",
              published_at: null,
            },
          ],
        },
      });
    });

    await page.goto("admin/articles/");
    await page.getByRole("link", { name: /^査読/ }).click();

    await expect(page).toHaveURL(
      /\/admin\/articles\/\?mode=review#article-list$/,
    );
    await expect(page.locator("[data-status]")).toHaveValue("all");
    await expect(page.locator("[data-list] .article")).toHaveCount(3);
    await expect(page.locator("[data-list] .article").first()).toContainText(
      "自分への査読依頼",
    );
    await expect(page.locator("[data-list]")).not.toContainText("査読済み原稿");
    await expect(page.locator("[data-list]")).toContainText("まだ下書きの原稿");

    await page.goto("admin/review/");
    await expect(page).toHaveURL(
      /\/admin\/articles\/\?mode=review#article-list$/,
    );
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
