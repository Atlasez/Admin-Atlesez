import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * 認証後の主要な管理画面を、実データに依存せず同じ条件で検査する。
 * APIを空状態にすることで、一覧が空のときのフォーカス・ラベル・レイアウトも回帰対象に含める。
 */
const mockAdminApis = async (page: Page) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload: Record<string, unknown> = {
      "/api/admin/auth-status": { email: "a11y@example.com", isManager: true },
      "/api/admin/profile": {
        profile: { display_name: "アクセシビリティ確認" },
      },
      "/api/admin/notifications": { notifications: [] },
      "/api/admin/portal": {
        projects: [],
        availableProjects: [],
        todos: [],
        pendingApprovals: 0,
        calendar: { events: [] },
      },
      "/api/admin/genre-overviews": {
        members: [],
        overviews: [],
        editableSubjects: [],
        canEditAll: true,
      },
      "/api/admin/genre-role-catalog": { catalog: [], assignments: [] },
      "/api/admin/member-tasks": {
        scope: { email: "a11y@example.com" },
        projects: [],
        members: [],
        tasks: [],
      },
      "/api/admin/operations": { events: [] },
      "/api/admin/member-procedures": { requests: [] },
      "/api/admin/applications": {
        applications: [],
        pagination: { hasMore: false, nextCursor: null },
        summary: { total: 0, new: 0, reviewing: 0, accepted: 0, rejected: 0 },
      },
      "/api/admin/editor/documents": {
        documents: [],
        pagination: { hasMore: false, nextCursor: null },
        scope: { email: "a11y@example.com", subjects: [] },
      },
      "/api/admin/editor/catalog": { catalog: [] },
      "/api/admin/profile-change-requests": { requests: [] },
      "/api/admin/project-introductions": { entries: [] },
      "/api/admin/report-admin-permissions": { permissions: [] },
      "/api/admin/progress": { progress: [] },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload[path] ?? {}),
    });
  });
};

const pages = [
  "admin/portal/",
  "admin/notifications/",
  "admin/member-tasks/",
  "admin/articles/",
  "admin/editor/",
  "admin/genres/",
  "admin/permissions/?project=atlas",
] as const;

for (const path of pages) {
  test(`認証済み管理画面のaxe検査: ${path}`, async ({ page }) => {
    await mockAdminApis(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
}

test("1280px幅ではナビを折りたたみ、末尾リンクを操作できる", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.goto("admin/articles/");

  const menuToggle = page.locator(".admin-menu-toggle");
  const nav = page.locator(".admin-nav nav");
  await expect(menuToggle).toBeVisible();
  await menuToggle.click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await expect(page.locator(".admin-management-link")).toBeVisible();
  await menuToggle.click();
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
});

test("390px幅でも管理メニューを名前で識別でき、axe違反がない", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockAdminApis(page);
  await page.goto("admin/applications/?project=atlas");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  ).toEqual([]);
});

test("375px幅の運営ヘッダーと開いたメニューに44px以上の操作領域がある", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAdminApis(page);
  await page.goto("admin/portal/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-admin-account]")).toBeVisible();

  const headerTargets = [
    ".admin-nav-brand-logo",
    ".admin-project-switcher-title",
    ".admin-menu-toggle",
    ".admin-action-center-utility-link",
    ".admin-command-button",
    ".admin-notifications",
    ".admin-account-profile",
    ".admin-logout",
  ];
  for (const selector of headerTargets) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds, `${selector} should be visible`).not.toBeNull();
    expect(bounds!.width, selector).toBeGreaterThanOrEqual(44);
    expect(bounds!.height, selector).toBeGreaterThanOrEqual(44);
  }

  await page.locator(".admin-menu-toggle").click();
  const menuTargets = page.locator(
    "#admin-primary-nav a:visible, #admin-primary-nav summary:visible, #admin-primary-nav button:visible",
  );
  for (const target of await menuTargets.all()) {
    const bounds = await target.boundingBox();
    const targetName =
      (await target.getAttribute("class")) ||
      (await target.evaluate((element) => element.tagName.toLowerCase()));
    const computed = await target.evaluate((element) => ({
      minHeight: getComputedStyle(element).minHeight,
      height: getComputedStyle(element).height,
      media: matchMedia("(max-width: 620px)").matches,
    }));
    expect(bounds).not.toBeNull();
    expect(bounds!.width, `${targetName} width`).toBeGreaterThanOrEqual(44);
    expect(
      bounds!.height,
      `${targetName} height (${JSON.stringify(computed)})`,
    ).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});
