import { expect, test } from "@playwright/test";

test("アップデート履歴を絞り込み、詳細を開ける", async ({ page }) => {
  await page.goto("/admin/update-history/");

  await expect(
    page.getByRole("heading", { name: "アップデート履歴", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("[data-history-row]")).toHaveCount(8);

  await page.locator('input[name="q"]').fill("記事執筆フロー");
  await expect(page.locator("[data-history-row]:not([hidden])")).toHaveCount(1);
  await expect(page.getByText("記事執筆フローを更新")).toBeVisible();

  await page.getByText("記事執筆フローを更新").click();
  await expect(page.locator("[data-history-dialog]")).toBeVisible();
  await expect(page.locator("[data-dialog-title]")).toHaveText(
    "記事執筆フローを更新",
  );
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await expect(page.locator("[data-history-dialog]")).not.toBeVisible();

  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.locator("[data-history-row]:not([hidden])")).toHaveCount(8);
});

test("アップデート履歴を追加取得できる", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/admin/update-history**", async (route) => {
    requestCount += 1;
    const pageNumber = new URL(route.request().url()).searchParams.get("page");
    const entries =
      pageNumber === "2"
        ? [
            {
              version: "commit ccccccc",
              date: "2026-09-08",
              title: "追加の変更",
              summary: "追加取得",
              kind: "改善",
              project: "運営サイト",
              tone: "green",
              author: "運営チーム",
              href: "",
            },
          ]
        : [
            {
              version: "commit aaaaaaa",
              date: "2026-09-10",
              title: "最新の変更",
              summary: "最初のページ",
              kind: "改善",
              project: "運営サイト",
              tone: "green",
              author: "運営チーム",
              href: "",
            },
            {
              version: "commit bbbbbbb",
              date: "2026-09-09",
              title: "前日の変更",
              summary: "最初のページ",
              kind: "運用",
              project: "運営サイト",
              tone: "cyan",
              author: "運営チーム",
              href: "",
            },
          ];
    await route.fulfill({
      json: {
        entries,
        pagination: {
          page: Number(pageNumber ?? "1"),
          limit: 30,
          hasMore: pageNumber !== "2",
          nextPage: pageNumber === "2" ? null : 2,
        },
      },
    });
  });
  await page.goto("/admin/update-history/");
  await expect(page.locator("[data-history-row]")).toHaveCount(2);
  await expect(page.locator("[data-history-pagination]")).toBeVisible();
  await page.getByRole("button", { name: "さらに読み込む" }).click();
  await expect(page.locator("[data-history-row]")).toHaveCount(3);
  await expect(page.locator("[data-history-pagination]")).toBeHidden();
  expect(requestCount).toBe(2);
});
