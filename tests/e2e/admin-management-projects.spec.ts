import { expect, test } from "@playwright/test";

const projects = [
  ["atlas", "学習サイト「アトラス」", "atlas"],
  ["secretariat", "Atlasez運営事務局", "secretariat"],
  ["seminar-platform", "ゼミプラットフォーム", "semi-platform"],
  ["student-council-exchange", "日本生徒会協会", "student-council"],
  ["thinking-cafe", "考えるカフェ", "thinking-cafe"],
] as const;

for (const [project, label, site] of projects) {
  test(`管理トップは${project}の機能と権限に一致する`, async ({ page }) => {
    await page.route("**/api/admin/auth-status", (route) =>
      route.fulfill({
        json: {
          isManager: true,
          managerProjects: [],
          canAccessScopedAdminPages: true,
        },
      }),
    );
    await page.goto(`admin/manage/?project=${project}`);
    const main = page.locator("[data-management-home]");
    await expect(main.locator("header p")).toHaveText(label);
    await expect(main.locator('a[href*="applications"]')).toBeVisible();
    await expect(main.locator('a[href*="applications"]')).toHaveAttribute(
      "href",
      `/admin/applications/?project=${project}`,
    );
    await expect(main.locator('a[href*="applications"]')).toHaveAttribute(
      "data-admin-site",
      site,
    );
    for (const path of [
      "member-management",
      "genre-roles",
      "operations-statistics",
      "reports",
      "analytics",
      "publication-runs",
    ]) {
      await expect(main.locator(`a[href*="/${path}/"]`)).toHaveCount(
        project === "atlas" ? 1 : 0,
      );
    }
    const approvals = main.locator('a[href*="project-profile-requests"]');
    await expect(approvals).toHaveCount(project === "atlas" ? 0 : 1);
    if (project !== "atlas") {
      await expect(approvals).toBeVisible();
      await expect(approvals).toHaveAttribute(
        "href",
        `/admin/project-profile-requests/?project=${project}`,
      );
    }
    await page.evaluate(() =>
      document.dispatchEvent(new Event("astro:page-load")),
    );
    await expect(main.locator('[data-management-project="atlas"]')).toHaveCount(
      project === "atlas" ? 6 : 0,
    );
  });
  if (project === "atlas") continue;
  test(`${project}の自己紹介承認は対象プロジェクトのAPIを読み込む`, async ({
    page,
  }) => {
    let apiProject = "";
    await page.route("**/api/admin/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/admin/project-profile-change-requests") {
        apiProject = url.searchParams.get("project") ?? "";
        return route.fulfill({
          json: {
            requests: [
              {
                id: "request-one",
                email: "member@example.com",
                display_name: "申請者",
                status: "pending",
                current_internal_bio: "現在の自己紹介",
                proposed_internal_bio: "変更した自己紹介",
              },
            ],
          },
        });
      }
      return route.fulfill({
        json: { isManager: false, managerProjects: [project] },
      });
    });
    await page.goto(`admin/project-profile-requests/?project=${project}`);
    await expect(page).toHaveURL(
      new RegExp(`project-profile-requests/\\?project=${project}$`),
    );
    await expect(page.locator("[data-list]")).toContainText("変更した自己紹介");
    expect(apiProject).toBe(project);
  });
}

test("管理トップは所属プロジェクト責任者にだけそのプロジェクトの応募・承認を表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        isManager: false,
        managerProjects: ["thinking-cafe"],
        canAccessScopedAdminPages: false,
      },
    }),
  );
  await page.goto("admin/manage/?project=thinking-cafe");
  await expect(page.locator('main a[href*="applications"]')).toBeVisible();
  await expect(
    page.locator('main a[href*="project-profile-requests"]'),
  ).toBeVisible();
  await expect(page.locator("main [data-manager-only]:visible")).toHaveCount(0);
  await page.goto("admin/manage/?project=seminar-platform");
  await expect(
    page.locator("main [data-project-manager-only]:visible"),
  ).toHaveCount(0);
});

test("管理トップの未知プロジェクトはatlasへ一貫してフォールバックする", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { isManager: true } }),
  );
  await page.goto("admin/manage/?project=unknown-project");
  await expect(page.locator("main header p")).toHaveText(
    "学習サイト「アトラス」",
  );
  await expect(page.locator('main a[href*="applications"]')).toHaveAttribute(
    "href",
    "/admin/applications/?project=atlas",
  );
  await expect(page.locator('main a[href*="member-management"]')).toBeVisible();
});

test("旧semi-platform IDのプロジェクト責任者も正規URLの管理入口を開ける", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        isManager: false,
        managerProjects: ["semi-platform"],
        canAccessScopedAdminPages: false,
      },
    }),
  );
  await page.goto("admin/manage/?project=seminar-platform");
  await expect(page.locator('main a[href*="applications"]')).toBeVisible();
  await expect(
    page.locator('main a[href*="project-profile-requests"]'),
  ).toBeVisible();
  await expect(page.locator("main [data-manager-only]:visible")).toHaveCount(0);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("astro:page-load")),
  );
  await expect(page.locator('main a[href*="applications"]')).toBeVisible();
});
