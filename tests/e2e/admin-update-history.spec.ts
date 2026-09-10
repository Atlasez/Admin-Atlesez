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
