import { expect, test } from "@playwright/test";

test("操作履歴は読み込み中に変更された最後の検索条件を表示する", async ({
  page,
}) => {
  let releaseInitialResponse!: () => void;
  const initialResponseGate = new Promise<void>((resolve) => {
    releaseInitialResponse = resolve;
  });
  let signalInitialRequest!: () => void;
  const initialRequestStarted = new Promise<void>((resolve) => {
    signalInitialRequest = resolve;
  });
  let signalInitialResponse!: () => void;
  const initialResponseFinished = new Promise<void>((resolve) => {
    signalInitialResponse = resolve;
  });
  const requestedQueries: string[] = [];

  await page.route("**/api/admin/audit-log**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    requestedQueries.push(query);
    if (!query) {
      signalInitialRequest();
      await initialResponseGate;
      await route.fulfill({
        json: {
          entries: [
            {
              id: "initial-entry",
              actor_email: "admin@example.com",
              action: "article_updated",
              actionLabel: "記事を更新",
              target_type: "article",
              target_id: "initial-article",
              target_label: "旧条件の記事",
              summary: "旧条件の結果",
              details_json: "{}",
              created_at: "2026-11-09T00:00:00.000Z",
            },
          ],
        },
      });
      signalInitialResponse();
      return;
    }

    await route.fulfill({
      json: {
        entries: [
          {
            id: "latest-entry",
            actor_email: "admin@example.com",
            action: "article_updated",
            actionLabel: "記事を更新",
            target_type: "article",
            target_id: "latest-article",
            target_label: "最新条件の記事",
            summary: "最新条件の結果",
            details_json: "{}",
            created_at: "2026-11-09T00:00:00.000Z",
          },
        ],
      },
    });
  });

  await page.goto("/admin/audit-log/");
  await initialRequestStarted;
  try {
    await page.locator('[name="q"]').fill("最新検索条件");
    await expect.poll(() => requestedQueries).toContain("最新検索条件");
    await expect(
      page.getByText("最新条件の結果", { exact: true }),
    ).toBeVisible();
  } finally {
    releaseInitialResponse();
  }

  await initialResponseFinished;
  await expect(page.getByText("最新条件の結果", { exact: true })).toBeVisible();
  await expect(page.getByText("旧条件の結果", { exact: true })).toHaveCount(0);
});

test("操作履歴は検索条件を保ったまま次のカーソルを読み込める", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "admin@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  let requests = 0;
  let nextRequestUrl = "";
  await page.route("**/api/admin/audit-log**", async (route) => {
    requests += 1;
    nextRequestUrl = route.request().url();
    await route.fulfill({
      json: {
        entries: [
          {
            id: `entry-${requests}`,
            actor_email: "admin@example.com",
            action: "article_updated",
            actionLabel: "記事を更新",
            target_type: "article",
            target_id: "article-1",
            target_label: "テスト記事",
            summary: `更新 ${requests}`,
            details_json: "{}",
            created_at: "2026-09-10T00:00:00.000Z",
          },
        ],
        pagination: { nextCursor: requests === 1 ? "next-cursor" : null },
      },
    });
  });

  await page.goto("admin/audit-log/");
  await expect(page.getByText("更新 1")).toBeVisible();
  await page.getByRole("button", { name: "次の100件を読み込む" }).click();
  await expect.poll(() => requests).toBe(2);
  expect(nextRequestUrl).toContain("cursor=next-cursor");
  await expect(page.getByText("更新 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "次の100件を読み込む" }),
  ).toBeHidden();
});
