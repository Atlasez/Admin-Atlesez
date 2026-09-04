import { expect, test } from "@playwright/test";

for (const width of [1440, 800, 390]) {
  test(`応募管理は最新の応募者から開き、前へ・次へを隣接表示する（${width}px）`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let newestId = "latest";
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        json:
          url.pathname === "/api/admin/applications"
            ? {
                applications: [
                  {
                    id: "old",
                    family_name: "山田",
                    given_name: "太郎",
                    status: "new",
                    created_at: "2026-09-01T09:00:00Z",
                  },
                  {
                    id: newestId,
                    family_name: "佐藤",
                    given_name: "花子",
                    status: "accepted",
                    created_at: "2026-09-04T09:00:00Z",
                  },
                  {
                    id: "middle",
                    family_name: "鈴木",
                    given_name: "次郎",
                    status: "reviewing",
                    created_at: "2026-09-03T09:00:00Z",
                  },
                  {
                    id: "undated",
                    family_name: "日時",
                    given_name: "未登録",
                    status: "new",
                  },
                ],
              }
            : {},
      });
    });
    await page.goto("./admin/applications/?project=atlas");
    const select = page.locator("[data-application-select]");
    const previous = page.getByRole("button", { name: "前の応募者" });
    const next = page.getByRole("button", { name: "次の応募者" });
    await expect(select).toHaveValue("latest");
    await expect(page.locator(".application-list h2")).toHaveText("佐藤 花子");
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await page.locator("[data-application-navigator]").scrollIntoViewIfNeeded();
    const left = (await previous.boundingBox())!;
    const right = (await next.boundingBox())!;
    expect(Math.abs(left.y - right.y)).toBeLessThan(2);
    expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(0);
    expect(right.x - (left.x + left.width)).toBeLessThanOrEqual(12);
    const picker = (await page.locator(".application-picker").boundingBox())!;
    const position = (await page
      .locator("[data-application-position]")
      .boundingBox())!;
    expect(
      position.x >= picker.x + picker.width ||
        position.y >= picker.y + picker.height,
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("applications-latest.png"),
    });
    await next.click();
    await expect(select).toHaveValue("middle");
    await previous.click();
    await expect(select).toHaveValue("latest");
    await select.selectOption("old");
    newestId = "new-arrival";
    await page.reload();
    await expect(select).toHaveValue("new-arrival");
    await page.locator("[data-filter-status]").selectOption("new");
    await expect(select).toHaveValue("old");
    await page.locator("[data-clear-filter]").click();
    await expect(select).toHaveValue("new-arrival");
  });
}

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
  await expect(
    page.getByRole("heading", { name: "学習サイト「アトラス」：応募管理" }),
  ).toBeVisible();
  await expect(page.locator(".project-switcher")).toHaveCount(0);
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
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: { email: "manager@example.com", isManager: true },
    }),
  );
  await page.goto("./admin/manage/?project=seminar-platform");
  await expect(page.locator("main header p")).toHaveText(
    "ゼミプラットフォーム",
  );
  await expect(page.locator("a[data-manager-only]")).toBeVisible();
  await expect(page.locator("a[data-manager-only]")).toHaveAttribute(
    "href",
    "/admin/permissions/?project=seminar-platform",
  );
  await expect(page.locator("a[data-project-manager-only]")).toHaveAttribute(
    "href",
    "/admin/applications/?project=seminar-platform",
  );
});

test("OAuth連携済みの受入応募はDiscord同期を再試行できる", async ({ page }) => {
  let provisioningStatus = "failed";
  let retryCalled = false;
  await page.route("**/api/admin/applications/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/discord-retry")) {
      retryCalled = route.request().method() === "POST";
      provisioningStatus = "synced";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provisioning: { status: "synced", warnings: [] },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/admin/applications?project=atlas", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: { slug: "atlas", name: "学習サイト「アトラス」" },
        subjectLabels: { mathematics: "数学" },
        formLabels: { atlas: "学習サイト「アトラス」" },
        applications: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            form_language: "ja",
            family_name: "山田",
            given_name: "太郎",
            email: "taro@example.com",
            affiliation_type: "大学",
            institution: "東京大学",
            grade: "B1",
            country: "JP",
            timezone: "Asia/Tokyo",
            desired_subjects: "mathematics",
            project_slug: "atlas",
            status: "accepted",
            provisioning_status: provisioningStatus,
            provisioning_attempt_count: 1,
            provisioning_next_attempt_at: "2026-08-29T12:00:00.000Z",
            discord_oauth_connected_at: "2026-08-29T11:00:00.000Z",
            verified_discord_user_id: "123456789012345678",
          },
        ],
      }),
    });
  });

  await page.goto("./admin/applications/?project=atlas");
  await expect(page.locator(".application-list")).toContainText(
    "OAuth同意済み・連携済み",
  );
  await expect(page.locator("[data-retry]")).toBeVisible();
  await page.locator("[data-retry]").click();
  await expect.poll(() => retryCalled).toBe(true);
  await expect(page.locator(".application-list")).toContainText(
    "Discord同期済み",
  );
});
