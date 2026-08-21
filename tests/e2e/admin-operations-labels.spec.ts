import { expect, test } from "@playwright/test";

test("T-1/T-2/T-5: タスク管理の初期表示が仕様どおりになる", async ({
  page,
}) => {
  await page.goto("admin/operations/?project=atlas");

  await expect(
    page.getByRole("heading", { level: 1, name: "タスク管理" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "タスク作成・依頼" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "表示対象を切り替えると、このフォームの下にあるタスク一覧が変わります。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "ToDo" })).toHaveCount(0);
});
