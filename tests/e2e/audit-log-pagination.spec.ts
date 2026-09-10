import { expect, test } from "@playwright/test";

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
