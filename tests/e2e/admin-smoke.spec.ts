import { expect, test, type Page } from "@playwright/test";

const mockAdminApis = async (page: Page) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const payload = (() => {
      switch (url.pathname) {
        case "/api/admin/auth-status":
          return { email: "smoke@example.com", isManager: true };
        case "/api/admin/profile":
          return { profile: { display_name: "スモーク確認" } };
        case "/api/admin/notifications":
          return { notifications: [] };
        case "/api/admin/portal":
          return {
            projects: [],
            availableProjects: [],
            todos: [],
            pendingApprovals: 0,
            calendar: { events: [] },
          };
        case "/api/admin/genre-overviews":
          return {
            members: [],
            overviews: [],
            editableSubjects: [],
            canEditAll: true,
          };
        case "/api/admin/genre-role-catalog":
          return { catalog: [], assignments: [] };
        case "/api/admin/member-tasks":
          return {
            scope: { email: "smoke@example.com" },
            projects: [],
            members: [],
            tasks: [],
          };
        case "/api/admin/operations":
          return { events: [] };
        case "/api/admin/progress":
          return { progress: [] };
        case "/api/admin/member-procedures":
          return { requests: [] };
        case "/api/admin/applications":
          return {
            applications: [],
            pagination: { hasMore: false, nextCursor: null },
            summary: {
              total: 0,
              new: 0,
              reviewing: 0,
              accepted: 0,
              rejected: 0,
            },
          };
        case "/api/admin/editor/documents":
          return {
            documents: [],
            pagination: { hasMore: false, nextCursor: null },
            scope: { email: "smoke@example.com", subjects: [] },
          };
        case "/api/admin/editor/catalog":
          return { catalog: [] };
        case "/api/admin/profile-change-requests":
          return { requests: [] };
        case "/api/admin/report-admin-permissions":
          return { permissions: [] };
        default:
          return {};
      }
    })();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
};

const pages = [
  ["ポータル", "admin/portal/", "Atlasezメンバー用サイト"],
  ["記事一覧", "admin/articles/", "編集・フィードバック"],
  ["ジャンル概要", "admin/genres/", "各ジャンル概要"],
  ["ジャンル・役割管理", "admin/genre-roles/", "ジャンル・役割管理"],
  ["タスク管理", "admin/member-tasks/", "タスク管理"],
  ["同時作業会", "admin/co-working/", "同時作業会"],
  ["諸手続き", "admin/procedures/", "諸手続き"],
  ["応募管理", "admin/applications/", "応募管理"],
  [
    "面談メモ",
    "admin/application-interview/?application=smoke&project=atlas",
    "面談メモ",
  ],
  ["問題報告", "admin/reports/", "問題報告"],
  ["運営メンバー管理", "admin/member-management/", "運営メンバー管理"],
  ["運営メンバー統計", "admin/operations-statistics/", "運営メンバー統計"],
  ["メンバー情報の承認", "admin/profile-requests/", "メンバー情報の承認"],
  [
    "プロジェクトマイページ",
    "admin/workspace/?project=secretariat",
    "マイページ",
  ],
  ["記事編集", "admin/editor/", "記事編集ワークスペース"],
  ["作業の進め方", "admin/guide/", "作業の進め方"],
] as const;

for (const [label, path, heading] of pages) {
  test(`管理画面スモーク: ${label}`, async ({ page }) => {
    await mockAdminApis(page);
    const response = await page.goto(path);
    expect(response?.status(), `${path} のHTML応答`).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  });
}

test("記事編集の未選択案内が横方向に崩れない", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto("admin/editor/");
  const layout = await page.locator("[data-editor-empty]").evaluate((empty) => {
    const sourcePicker = empty.querySelector<HTMLElement>(".source-picker");
    const style = getComputedStyle(empty);
    return {
      flexDirection: style.flexDirection,
      emptyWidth: empty.getBoundingClientRect().width,
      sourceWidth: sourcePicker?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(layout.flexDirection).toBe("column");
  expect(layout.sourceWidth).toBeLessThanOrEqual(layout.emptyWidth);
});

test("記事編集の未選択案内は作成済み記事と矛盾しない", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto("admin/editor/");
  await expect(page.locator("[data-editor-empty]")).toBeVisible();
  await expect(page.locator("[data-editor-empty] h2")).toHaveCount(0);
  await expect(page.locator("[data-editor-empty] > p")).toHaveCount(0);
  await expect(page.locator("[data-workflow-current]")).toHaveText(
    "記事を選択してください",
  );
  await expect(page.locator("[data-save-message]")).toHaveText(
    "保存状態：記事を選択してください",
  );
  await expect(page.locator("body")).not.toContainText("原稿を選んでください");
});

test("運営メンバー統計は共通のエラー状態から再試行できる", async ({ page }) => {
  await mockAdminApis(page);
  let genreRequests = 0;
  await page.route("**/api/admin/genre-overviews*", async (route) => {
    genreRequests += 1;
    if (genreRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "一時的に利用できません。" }),
      });
      return;
    }
    await route.fulfill({
      json: { members: [], overviews: [] },
    });
  });
  await page.goto("admin/operations-statistics/");
  const root = page.locator("[data-operations-statistics]");
  await expect(root).toHaveAttribute("aria-busy", "false");
  const notice = root.locator("[data-admin-load-error]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("一時的に利用できません。");
  await notice.getByRole("button", { name: "再試行" }).click();
  await expect(root.locator("[data-admin-empty-state]")).toBeVisible();
  await expect(root).toHaveAttribute("data-admin-load-state", "empty");
  expect(genreRequests).toBe(2);
});

test("運営メンバー管理は検証用アカウントを専用アーカイブへ分離する", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.route("**/api/admin/verification-members", async (route) => {
    await route.fulfill({
      json: {
        members: [
          {
            email: "operator@example.com",
            display_name: "検証アカウント",
            avatar_url: "",
          },
        ],
      },
    });
  });
  await page.goto("admin/member-management/");
  const archive = page.locator("[data-verification-archive]");
  await expect(archive).toBeVisible();
  await expect(archive).toContainText("検証アカウント");
  await expect(page.locator("[data-table-body]")).not.toContainText(
    "operator@example.com",
  );
});

test("作業の進め方に運営画面のスクリーンショットが表示される", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.goto("admin/guide/");
  const images = page.locator(".guide-screen img");
  await expect(images).toHaveCount(3);
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every(
          (element) =>
            (element as HTMLImageElement).complete &&
            (element as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
});

const responsiveSmokePages = [
  ["ポータル", "admin/portal/"],
  ["アクションセンター", "admin/action-center/"],
  ["タスク管理", "admin/member-tasks/"],
  ["記事一覧", "admin/articles/"],
  ["権限管理", "admin/permissions/"],
  ["記事編集", "admin/editor/"],
] as const;

for (const [label, path] of responsiveSmokePages) {
  for (const width of [1440, 768, 390]) {
    test(`${label}が${width}pxで横方向に崩れない`, async ({ page }) => {
      await mockAdminApis(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(geometry.viewport).toBe(width);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
    });
  }
}
