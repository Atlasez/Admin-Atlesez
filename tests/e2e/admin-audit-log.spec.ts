import { expect, test } from "@playwright/test";

test("操作履歴を検索し、誰がいつ何を変更したかを詳細表示できる", async ({
  page,
}) => {
  await page.route("**/api/admin/audit-log?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            id: "audit-1",
            actor_email: "editor@example.com",
            action: "article_updated",
            actionLabel: "記事を更新",
            target_type: "article",
            target_id: "doc-1",
            target_label: "群の定義",
            summary: "記事を更新：群の定義",
            details_json: JSON.stringify({
              changedFields: ["body", "summary"],
            }),
            created_at: "2026-09-10T02:00:00.000Z",
          },
        ],
      }),
    });
  });
  await page.goto("/admin/audit-log/");
  await expect(
    page.getByRole("heading", { name: "操作履歴", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".audit-row")).toHaveCount(1);
  await expect(page.getByText("記事を更新：群の定義")).toBeVisible();
  await page.getByText("記事を更新：群の定義").click();
  await expect(page.locator("[data-audit-dialog]")).toBeVisible();
  await expect(page.locator("[data-dialog-actor]")).toHaveText(
    "editor@example.com",
  );
  await expect(page.locator("[data-dialog-details]")).toContainText(
    "changedFields",
  );
});

test("操作履歴のフィルターはタブレット幅で画面外へはみ出さない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.route("**/api/admin/audit-log?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
    }),
  );
  await page.goto("/admin/audit-log/");
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    filterRight:
      document.querySelector(".audit-filters")?.getBoundingClientRect().right ??
      0,
  }));
  expect(geometry.viewport).toBe(768);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.filterRight).toBeLessThanOrEqual(geometry.viewport);
});
