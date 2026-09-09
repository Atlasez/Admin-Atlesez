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
        nodes: violation.nodes.length,
      })),
    ).toEqual([]);
  });
}
