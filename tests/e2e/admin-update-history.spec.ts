import { expect, test } from "@playwright/test";

test("アップデート履歴を絞り込み、詳細を開ける", async ({ page }) => {
  let markRequestStarted!: () => void;
  let releaseResponse!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/admin/update-history**", async (route) => {
    markRequestStarted();
    await responseGate;
    await route.fulfill({
      json: {
        entries: [
          {
            version: "commit aaaaaaa",
            date: "2026-09-10",
            title: "記事執筆フローを更新",
            summary: "実データを表示",
            kind: "機能追加",
            project: "アトラス",
            tone: "blue",
            author: "運営チーム",
            href: "",
          },
          {
            version: "commit bbbbbbb",
            date: "2026-09-09",
            title: "一覧の表示を改善",
            summary: "フィルターを改善",
            kind: "改善",
            project: "運営サイト",
            tone: "green",
            author: "運営チーム",
            href: "",
          },
        ],
        pagination: { page: 1, limit: 30, hasMore: false, nextPage: null },
      },
    });
  });
  const navigation = page.goto("/admin/update-history/");

  await expect(
    page.getByRole("heading", { name: "アップデート履歴", level: 1 }),
  ).toBeVisible();
  await requestStarted;
  await expect(page.locator("[data-admin-load-skeleton]")).toBeVisible();
  await expect(
    page.locator("[data-admin-load-skeleton] .history-skeleton-row"),
  ).toHaveCount(6);
  await expect(page.locator("[data-history-row]")).toHaveCount(0);
  await expect(page.locator("[data-summary-total]")).toHaveText("—");
  await expect(page.locator("[data-result-count]")).toHaveText("読み込み中");
  releaseResponse();
  await navigation;

  await expect(page.locator("[data-history-row]")).toHaveCount(2);
  await expect(page.locator("[data-summary-total]")).toHaveText("2");
  await expect(page.locator("[data-result-count]")).toHaveText("2件");
  await expect(page.locator("[data-admin-load-skeleton]")).toBeHidden();
  await expect(page.locator("[data-history-row]").first()).toHaveCSS(
    "display",
    "grid",
  );
  const rowWidth = await page
    .locator("[data-history-row]")
    .first()
    .evaluate((row) => ({
      row: row.getBoundingClientRect().width,
      list: row.parentElement!.getBoundingClientRect().width,
    }));
  expect(Math.abs(rowWidth.row - rowWidth.list)).toBeLessThanOrEqual(2);
  await expect(page.locator(".history-copy strong").first()).toHaveCSS(
    "display",
    "block",
  );

  await page.locator('input[name="q"]').fill("記事執筆フロー");
  await expect(page.locator("[data-history-row]:not([hidden])")).toHaveCount(1);
  await expect(page.getByText("記事執筆フローを更新")).toBeVisible();

  await page.getByText("記事執筆フローを更新").click();
  await expect(page.locator("[data-history-dialog]")).toBeVisible();
  await expect(page.locator("[data-dialog-title]")).toHaveText(
    "記事執筆フローを更新",
  );
  await expect(page.locator("[data-dialog-link]")).toBeHidden();
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await expect(page.locator("[data-history-dialog]")).not.toBeVisible();

  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.locator("[data-history-row]:not([hidden])")).toHaveCount(2);

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("[data-history-row]").first()).toHaveCSS(
      "display",
      "grid",
    );
    if (width <= 900) {
      await expect(page.locator(".history-project").first()).toBeHidden();
      await expect(page.locator(".history-kind").first()).toBeHidden();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("update-history-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: test.info().outputPath("update-history-desktop.png"),
    fullPage: true,
  });
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
  await expect(page.locator('select[name="project"] option')).toHaveCount(2);
  await expect(page.locator('select[name="kind"] option')).toHaveCount(3);
  await expect(page.locator("[data-history-pagination]")).toBeVisible();
  await page.getByRole("button", { name: "さらに読み込む" }).click();
  await expect(page.locator("[data-history-row]")).toHaveCount(3);
  await expect(page.locator('select[name="project"] option')).toHaveCount(2);
  await expect(page.locator('select[name="kind"] option')).toHaveCount(3);
  await expect(page.locator("[data-history-pagination]")).toBeHidden();
  expect(requestCount).toBe(2);
});

test("取得失敗後は読み込み表示を隠し、再試行で最新の履歴を表示する", async ({
  page,
}) => {
  let requests = 0;
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route("**/api/admin/update-history**", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 502, json: { error: "取得失敗" } });
      return;
    }
    await retryGate;
    await route.fulfill({
      json: {
        entries: [
          {
            version: "commit ddddddd",
            date: "2026-10-03",
            title: "再試行後の更新",
            kind: "改善",
            project: "運営サイト",
            tone: "green",
          },
        ],
        pagination: { hasMore: false, nextPage: null },
      },
    });
  });
  await page.goto("/admin/update-history/");
  await expect(page.locator("[data-admin-load-error]")).toBeVisible();
  await expect(page.locator("[data-admin-load-skeleton]")).toBeHidden();
  await expect(page.locator("[data-history-row]")).toHaveCount(0);
  await expect(page.locator("[data-summary-total]")).toHaveText("—");

  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator("[data-admin-load-skeleton]")).toBeVisible();
  releaseRetry();
  await expect(page.getByText("再試行後の更新", { exact: true })).toBeVisible();
  await expect(page.locator("[data-admin-load-error]")).toBeHidden();
  await expect(page.locator("[data-admin-load-skeleton]")).toBeHidden();
  await expect(page.locator("[data-summary-total]")).toHaveText("1");
  expect(requests).toBe(2);
});
