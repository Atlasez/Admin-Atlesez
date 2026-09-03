import { expect, test } from "@playwright/test";

test("ワークスペース切り替えで記事執筆UIをAtlasだけに表示する", async ({
  page,
}) => {
  await page.goto("/admin/ui-prototype/");

  await expect(
    page.getByRole("heading", { name: "Atlasホーム" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^記事 5$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "編集キュー" })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "自分の仕事", exact: true })
      .locator("svg"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "現在のワークスペース: Atlas" })
    .click();
  await page
    .getByRole("menuitemradio", { name: /^運営事務局 メンバー情報/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "運営事務局ホーム" }),
  ).toBeVisible();
  await expect(
    page.getByText("承認と全体タスクを、優先度の高い順に確認できます。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^記事 5$/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /^レビュー 3$/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /^問題報告 2$/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "ジャンル" })).toBeHidden();
  await expect(page.getByRole("button", { name: "閲覧統計" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "編集キュー" })).toBeHidden();
  await expect(
    page.getByText("プロフィール申請", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "プロトタイプを検索" }).click();
  await expect(page.getByLabel("ワークスペース内を検索")).toBeVisible();
  await page.getByRole("button", { name: "ダイアログを閉じる" }).click();

  await page.getByRole("button", { name: "通知、未読2件" }).click();
  await expect(page.getByText("プロフィール申請が届いています")).toBeVisible();
  await page
    .getByRole("button", { name: /プロフィール申請が届いています/ })
    .click();
  await expect(
    page.getByText("この通知に関連するタスクや予定を確認できます。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "関連項目を開く" }).click();
  await expect(
    page.getByRole("heading", { name: "運営事務局ホーム" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "現在のワークスペース: 運営事務局" })
    .click();
  await page.getByRole("menuitemradio", { name: /^Atlas 学習サイト/ }).click();

  await expect(
    page.getByRole("heading", { name: "Atlasホーム" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^記事 5$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "編集キュー" })).toBeVisible();
});

test("スマートフォン幅でも切り替え後にホーム全体を表示する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/ui-prototype/");

  await page.getByRole("button", { name: "ナビゲーションを開く" }).click();
  await page
    .getByRole("button", { name: "現在のワークスペース: Atlas" })
    .click();
  await page
    .getByRole("menuitemradio", { name: /^ゼミプラットフォーム/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "ゼミプラットフォームホーム" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "自分の仕事", exact: true })
      .locator("svg"),
  ).toBeVisible();
  await expect(page.locator("[data-prototype-shell]")).not.toHaveClass(
    /nav-open/,
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        scrollX: window.scrollX,
      })),
    )
    .toEqual({ scrollWidth: 360, viewportWidth: 360, scrollX: 0 });
});

test("デスクトップのサイドバーを閉じ、ドラッグで幅を調整できる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/ui-prototype/");

  const shell = page.locator("[data-prototype-shell]");
  const resizeHandle = page.getByRole("separator", {
    name: "サイドバーの幅を変更",
  });
  await expect(resizeHandle).toBeVisible();
  const initialColumns = await shell.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns,
  );
  expect(initialColumns.startsWith("236px")).toBe(true);

  await page.getByRole("button", { name: "ナビゲーションを閉じる" }).click();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
  await expect(
    page.getByRole("button", { name: "サイドバーを開く" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "サイドバーを開く" }).click();
  await expect(shell).not.toHaveClass(/sidebar-collapsed/);
  await page.waitForTimeout(260);
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) return;
  const centerY = handleBox.y + handleBox.height / 2;
  const centerX = handleBox.x + handleBox.width / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 60, centerY);
  await page.mouse.up();
  await expect
    .poll(() =>
      shell.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns,
      ),
    )
    .toMatch(/^296px/);

  const widerHandleBox = await resizeHandle.boundingBox();
  expect(widerHandleBox).not.toBeNull();
  if (!widerHandleBox) return;
  const widerCenterX = widerHandleBox.x + widerHandleBox.width / 2;
  await page.mouse.move(widerCenterX, centerY);
  await page.mouse.down();
  await page.mouse.move(widerCenterX - 210, centerY);
  await page.mouse.up();
  await expect(shell).toHaveClass(/sidebar-collapsed/);
});
