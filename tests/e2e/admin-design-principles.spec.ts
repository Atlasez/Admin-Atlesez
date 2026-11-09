import { expect, test } from "@playwright/test";

test("設計原則を元フィードバックへ紐付けて登録し、一覧で絞り込める", async ({
  page,
}) => {
  const principles: Record<string, unknown>[] = [];
  let created: Record<string, unknown> | undefined;
  await page.route("**/api/admin/auth-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ isManager: true, managerProjects: ["atlas"] }),
    });
  });
  await page.route("**/api/admin/design-principles**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      created = request.postDataJSON() as Record<string, unknown>;
      principles.push({
        id: "principle-1",
        ...created,
        updated_at: "2026-11-09T00:00:00.000Z",
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: "principle-1",
          updatedAt: "2026-11-09T00:00:00.000Z",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principles }),
    });
  });

  await page.goto("admin/design-principles/");
  await expect(
    page.getByRole("heading", { level: 1, name: "設計原則" }),
  ).toBeVisible();
  await page.getByLabel("原則名").fill("選択肢が多い項目");
  await page
    .locator("[data-principle-form]")
    .getByLabel("分類")
    .selectOption("selection");
  await page
    .locator("[data-principle-form]")
    .getByRole("textbox", { name: "設計原則" })
    .fill("多数の候補を選ぶ入力は、検索できるタグ形式で追加する。");
  await page
    .getByLabel("背景・判断理由")
    .fill("長い一覧を避け、必要な候補を名前で探せるようにする。");
  await page.getByLabel("フィードバック名").fill("タスク担当者選択の要望");
  await page
    .getByLabel("ADMIN内URL")
    .fill("/admin/editor/?document=abc#feedback");
  await page
    .getByLabel("要点・抜粋（任意）")
    .fill("担当者が多いのでタグ形式にしてほしい。");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect
    .poll(() => created)
    .toMatchObject({
      title: "選択肢が多い項目",
      category: "selection",
      status: "candidate",
      sources: [
        {
          label: "タスク担当者選択の要望",
          href: "/admin/editor/?document=abc#feedback",
        },
      ],
    });
  await expect(page.locator("[data-principle-list]")).toContainText(
    "選択肢が多い項目",
  );
  await page.locator("[data-filter-category]").selectOption("accessibility");
  await expect(page.locator("[data-principle-list]")).toContainText(
    "条件に一致する設計原則はありません。",
  );
});
