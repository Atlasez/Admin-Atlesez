import { expect, test } from "@playwright/test";

test("B-1: 応募フロー・状況集計・検索と状態フィルターを表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/applications")
      expect(url.searchParams.get("project")).toBe("atlas");
    const payload =
      url.pathname === "/api/admin/applications"
        ? {
            project: { slug: "atlas", name: "学習サイト「アトラス」" },
            subjectLabels: { mathematics: "数学", physics: "物理" },
            applications: [
              {
                id: "application-1",
                form_language: "ja",
                family_name: "山田",
                given_name: "太郎",
                email: "taro@example.com",
                affiliation_type: "大学",
                institution: "東京大学",
                grade: "学部1年",
                country: "JP",
                timezone: "Asia/Tokyo",
                desired_subjects: "mathematics",
                article_ideas: "群論",
                interests: "数学",
                message: "参加希望",
                project_slug: "atlas",
                status: "new",
                provisioning_status: "not_started",
              },
              {
                id: "application-2",
                form_language: "ja",
                family_name: "佐藤",
                given_name: "花子",
                email: "hanako@example.com",
                affiliation_type: "高校",
                institution: "Atlasez高校",
                grade: "高校2年",
                country: "JP",
                timezone: "Asia/Tokyo",
                desired_subjects: "physics",
                article_ideas: "力学",
                interests: "物理",
                message: "参加希望",
                project_slug: "atlas",
                status: "reviewing",
                provisioning_status: "pending",
              },
            ],
          }
        : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto("./admin/applications/?project=atlas");
  await expect(page.getByRole("heading", { name: "学習サイト「アトラス」：応募管理" })).toBeVisible();
  await expect(page.locator(".flow-steps > li")).toHaveCount(4);
  await expect(page.locator("[data-total-count]")).toHaveText("2件");
  await expect(page.locator("[data-summary-new]")).toHaveText("1");
  await expect(page.locator("[data-summary-reviewing]")).toHaveText("1");

  await page.locator("[data-search]").fill("東京大学");
  await expect(page.locator(".application-list .app")).toHaveCount(1);
  await expect(page.locator(".application-list")).toContainText("山田 太郎");

  await page.locator("[data-clear-filter]").click();
  await page.locator("[data-filter-status]").selectOption("reviewing");
  await expect(page.locator(".application-list .app")).toHaveCount(1);
  await expect(page.locator(".application-list")).toContainText("佐藤 花子");
});

test("応募管理の導線は現在のプロジェクトに引き継がれる", async ({ page }) => {
  await page.goto("./admin/manage/?project=seminar-platform");
  await expect(page.locator("main header p")).toHaveText("ゼミプラットフォーム");
  await expect(page.locator('a[data-project-manager-only]')).toHaveAttribute(
    "href",
    "/admin/applications/?project=seminar-platform",
  );
});
