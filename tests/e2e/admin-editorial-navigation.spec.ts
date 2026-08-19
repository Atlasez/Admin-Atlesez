import { test, expect } from "@playwright/test";

test.describe("学習サイト運営の編集・査読導線", () => {
  test("運営トップの3導線がそれぞれの作業画面へつながる", async ({ page }) => {
    await page.goto("admin/atlas/");

    await expect(
      page.getByRole("link", { name: /新規記事作成/ }),
    ).toHaveAttribute("href", "/admin/editor/?new=1&from=atlas");
    await expect(
      page.getByRole("link", { name: /加筆・修正/ }),
    ).toHaveAttribute("href", "/admin/articles/?view=drafts&mode=revise");
    await expect(page.getByRole("link", { name: /^査読/ })).toHaveAttribute(
      "href",
      "/admin/articles/?view=review&mode=review",
    );
    await expect(page.getByRole("link", { name: "査読スペース" })).toHaveCount(
      0,
    );
  });

  test("編集・査読では重複した右上導線を表示せず査読一覧を統合する", async ({
    page,
  }) => {
    await page.goto("admin/articles/?view=review&mode=review");

    await expect(
      page.getByRole("heading", { name: "編集・査読" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "新規記事作成" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "査読依頼を確認" }),
    ).toHaveCount(0);
    await expect(page.locator("[data-admin-review-queue]")).toBeVisible();
    await expect(page.locator("[data-article-library]")).toBeHidden();
  });

  test("旧査読URLは統合後の査読一覧へ移動する", async ({ page }) => {
    await page.goto("admin/review/");
    await expect(page).toHaveURL(
      /\/admin\/articles\/\?view=review&mode=review$/,
    );
  });
});
