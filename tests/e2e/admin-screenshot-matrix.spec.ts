import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const routes = [
  ["admin-top", "admin/manage/?project=atlas"],
  ["action-center", "admin/action-center/"],
  ["notifications", "admin/notifications/"],
  ["tasks", "admin/operations/?project=atlas"],
  ["edit-feedback", "admin/articles/"],
  ["editor", "admin/editor/"],
  ["outline", "admin/editor/outline/"],
  ["genres", "admin/genre-roles/?project=atlas&view=genres"],
  ["roles", "admin/roles/?project=atlas"],
  ["member-management", "admin/member-management/"],
  ["permissions", "admin/permissions/?project=atlas"],
  ["progress", "admin/progress/?project=atlas"],
  ["developer", "admin/developer/"],
  ["audit-log", "admin/audit-log/"],
  ["applications", "admin/applications/?project=atlas"],
  ["calendar", "admin/calendar/?project=atlas"],
  ["guide", "admin/guide/"],
  ["procedures", "admin/procedures/?project=atlas"],
] as const;

const widths = [
  ["desktop", 1440],
  ["wide-tablet", 1024],
  ["tablet", 768],
  ["mobile", 390],
] as const;

test("列挙した管理画面を全幅・全テーマで撮影し、横方向の崩れがない", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const outputDir = "/private/tmp/atlasez-goal-screens/final-matrix";
  mkdirSync(outputDir, { recursive: true });
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const member = {
      email: "editor@example.com",
      display_name: "編集担当",
      university: "東京大学",
      year: "大学3年",
      interests: "数学",
      avatar_url: "",
      membership_role: "member",
      subjects: ["mathematics"],
      workflow_subjects: ["mathematics"],
      workflow_roles: [{ role: "subject-coordinator", subject: "mathematics" }],
      catalog_assignments: [
        { id: "genre-1", kind: "genre", name: "統計", slug: "statistics" },
      ],
      discord_user_id: "123456789012345678",
      discord_role_ids: ["987654321098765"],
      updated_at: "2026-09-13T00:00:00.000Z",
    };
    const task = {
      id: "task-screenshot",
      project_id: "atlas",
      subject: "mathematics",
      task_kind: "task",
      title: "定義のレビュー",
      details: "公開前の最終確認を行います。",
      status: "doing",
      assignee_email: "manager@example.com",
      created_by: "manager@example.com",
      due_at: "2026-09-14T12:00:00.000Z",
      due_timezone: "Asia/Tokyo",
      archived_at: null,
    };
    let payload: unknown = {};
    switch (url.pathname) {
      case "/api/admin/auth-status":
        payload = { email: "manager@example.com", isManager: true };
        break;
      case "/api/admin/profile":
        payload = { profile: { display_name: "管理者" } };
        break;
      case "/api/admin/portal":
        payload = {
          projects: [
            { id: "atlas", slug: "atlas", name: "アトラス", role: "manager" },
          ],
          availableProjects: [],
          todos: [task],
          pendingApprovals: 1,
          calendar: { events: [] },
          notifications: [],
          unreadNotificationsCount: 1,
        };
        break;
      case "/api/admin/action-center":
        payload = {
          items: [
            {
              id: "task:task-screenshot",
              kind: "task",
              title: task.title,
              detail: task.details,
              href: "/admin/operations/?project=atlas",
              status: task.status,
              priority: "urgent",
              updatedAt: "2026-09-13T00:00:00.000Z",
              dueAt: task.due_at,
              project: "アトラス",
              subject: "mathematics",
              read: false,
              actions: [],
            },
          ],
          history: [],
          counts: {
            today: 1,
            dueSoon: 1,
            unread: 1,
            approvals: 1,
            assigned: 1,
          },
          generatedAt: "2026-09-13T00:00:00.000Z",
        };
        break;
      case "/api/admin/notifications":
        payload = {
          notifications: [
            {
              id: "notification-screenshot",
              kind: "task-reminder",
              title: "期限が近いタスクがあります",
              detail: task.title,
              href: "/admin/operations/?project=atlas",
              updatedAt: "2026-09-13T00:00:00.000Z",
              read: false,
            },
          ],
          unreadNotificationsCount: 1,
        };
        break;
      case "/api/admin/member-tasks":
        payload = {
          scope: { email: "manager@example.com" },
          projects: [{ id: "atlas", name: "アトラス", role: "manager" }],
          members: [
            {
              project_id: "atlas",
              email: "editor@example.com",
              display_name: "編集担当",
            },
          ],
          tasks: [task],
          pagination: { hasMore: false, nextCursor: null },
        };
        break;
      case "/api/admin/operations":
        payload = {
          scope: { email: "manager@example.com", isManager: true },
          project: { id: "atlas", slug: "atlas", name: "アトラス" },
          projects: [
            { id: "atlas", slug: "atlas", name: "アトラス", role: "manager" },
          ],
          tasks: [task],
          events: [],
          progress: [],
          members: [{ email: "editor@example.com", display_name: "編集担当" }],
          pagination: { hasMore: false, nextCursor: null },
          eventPagination: { hasMore: false, nextCursor: null },
          progressPagination: { hasMore: false, nextCursor: null },
        };
        break;
      case "/api/admin/progress":
      case "/api/admin/operations/progress":
        payload = {
          scope: { email: "manager@example.com", isManager: true },
          progress: [
            {
              id: "progress-screenshot",
              project_id: "atlas",
              project_name: "アトラス",
              subject: "mathematics",
              body: "定義の確認を完了しました。",
              display_name: "編集担当",
              email: "editor@example.com",
              created_at: "2026-09-13T00:00:00.000Z",
              like_count: 2,
              liked_by_me: false,
            },
          ],
          projects: [{ id: "atlas", slug: "atlas", name: "アトラス" }],
        };
        break;
      case "/api/admin/genre-overviews":
        payload = {
          members: [
            {
              email: member.email,
              display_name: member.display_name,
              role: "member",
              subjectAssignments: ["mathematics"],
              workflowSubjects: ["mathematics"],
            },
          ],
          overviews: [],
          editableSubjects: ["mathematics"],
          canEditAll: true,
        };
        break;
      case "/api/admin/genre-role-catalog":
        payload = {
          catalog: [
            {
              id: "genre-1",
              project_id: "atlas",
              kind: "genre",
              slug: "statistics",
              name: "統計",
              description: "データを扱うジャンル",
              status: "active",
            },
          ],
          assignments: [
            {
              catalog_id: "genre-1",
              email: member.email,
              display_name: member.display_name,
              avatar_url: "",
            },
          ],
          canEdit: true,
        };
        break;
      case "/api/admin/member-management":
        payload = {
          members: [member],
          total: 1,
          discord_roles: [
            {
              discord_role_id: "987654321098765",
              name: "編集担当",
              is_managed: 0,
            },
          ],
          canEdit: true,
        };
        break;
      case "/api/admin/permission-audit":
      case "/api/admin/audit-log":
        payload = {
          entries: [
            {
              id: "audit-screenshot",
              actor_email: "manager@example.com",
              action: "member_updated",
              actionLabel: "メンバー情報を更新",
              target_type: "member",
              target_label: member.email,
              target_id: member.email,
              summary: "運営メンバー情報を更新：editor@example.com",
              details_json: "{}",
              created_at: "2026-09-13T00:00:00.000Z",
              archived_at: null,
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        };
        break;
      case "/api/admin/editor/taxonomy":
        payload = {
          catalog: [
            {
              id: "taxonomy-subject-math",
              kind: "subject",
              subject_slug: "",
              slug: "mathematics",
              name: "数学",
              status: "active",
              publication_status: "published",
              sort_order: 0,
            },
            {
              id: "taxonomy-category-1",
              kind: "category",
              subject_slug: "mathematics",
              slug: "group-theory",
              name: "群論",
              status: "active",
              publication_status: "published",
              sort_order: 0,
            },
            {
              id: "taxonomy-category-2",
              kind: "category",
              subject_slug: "mathematics",
              slug: "linear-algebra",
              name: "線形代数",
              status: "active",
              publication_status: "published",
              sort_order: 10,
            },
            {
              id: "taxonomy-category-3",
              kind: "category",
              subject_slug: "mathematics",
              slug: "probability",
              name: "確率論",
              status: "active",
              publication_status: "published",
              sort_order: 20,
            },
          ],
        };
        break;
      case "/api/admin/editor/outline":
        payload = {
          entries: [],
          pagination: { hasMore: false, nextCursor: null },
        };
        break;
      case "/api/admin/applications":
        payload = {
          applications: [
            {
              id: "application-screenshot",
              email: "applicant@example.com",
              status: "reviewing",
              proposed_display_name: "応募者",
              created_at: "2026-09-13T00:00:00.000Z",
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
          summary: { total: 1, new: 0, reviewing: 1, accepted: 0, rejected: 0 },
        };
        break;
      case "/api/admin/developer/diagnostics":
        payload = {
          checks: [
            {
              id: "database",
              label: "運用データベース",
              status: "ok",
              detail: "接続できています",
            },
          ],
        };
        break;
      case "/api/admin/editor/documents":
        payload = {
          documents: [],
          pagination: { hasMore: false, nextCursor: null },
          scope: { email: "manager@example.com", subjects: ["mathematics"] },
        };
        break;
      default:
        payload = {};
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  for (const theme of ["light", "dark", "black"] as const) {
    for (const [widthName, width] of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("admin/portal/", { waitUntil: "domcontentloaded" });
      await page.evaluate((bg) => {
        if (bg === "light") localStorage.removeItem("atlasez-prefs");
        else localStorage.setItem("atlasez-prefs", JSON.stringify({ bg }));
      }, theme);
      for (const [routeName, route] of routes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(80);
        if (routeName === "genres") {
          await expect(page.locator("[data-taxonomy-filter]")).toBeVisible();
          await expect(
            page.locator("[data-content].loading, [data-content] .loading"),
          ).toHaveCount(0);
          await expect(
            page.locator("[data-custom-content] .loading"),
          ).toHaveCount(0);
          await expect(
            page.locator("[data-taxonomy-content] .loading"),
          ).toHaveCount(0);
          const visibleLoadingIndicators = await page
            .locator(".loading, .admin-notification-loading")
            .evaluateAll((elements) =>
              elements
                .filter((element) => {
                  const style = getComputedStyle(element);
                  return (
                    style.display !== "none" && style.visibility !== "hidden"
                  );
                })
                .map((element) => ({
                  className: element.className,
                  text: element.textContent?.trim(),
                })),
            );
          expect(visibleLoadingIndicators).toEqual([]);
          const taxonomyLayout = await page
            .locator("[data-taxonomy-content]")
            .evaluate((root) => {
              const lanes = [
                ...root.querySelectorAll<HTMLElement>(".taxonomy-lane"),
              ];
              const populated = lanes.filter(
                (lane) => lane.querySelectorAll(".taxonomy-category").length,
              );
              const empty = lanes.filter(
                (lane) => !lane.querySelectorAll(".taxonomy-category").length,
              );
              const categoryLabels = [
                ...root.querySelectorAll<HTMLElement>(
                  ".taxonomy-category__label",
                ),
              ];
              return {
                populatedLaneMinHeight: Math.min(
                  ...populated.map(
                    (lane) => lane.getBoundingClientRect().height,
                  ),
                ),
                emptyLaneMaxHeight: Math.max(
                  ...empty.map((lane) => lane.getBoundingClientRect().height),
                ),
                minCategoryMetaWidth: Math.min(
                  ...categoryLabels.map(
                    (label) => label.getBoundingClientRect().width,
                  ),
                ),
                hasPopulatedLane: populated.length > 0,
                hasEmptyLane: empty.length > 0,
              };
            });
          if (taxonomyLayout.hasPopulatedLane && taxonomyLayout.hasEmptyLane) {
            expect(
              taxonomyLayout.emptyLaneMaxHeight,
              `${theme}/${widthName}/genres の空分野がカテゴリ分野の行高に引き伸ばされています`,
            ).toBeLessThan(taxonomyLayout.populatedLaneMinHeight);
          }
          expect(
            taxonomyLayout.minCategoryMetaWidth,
            `${theme}/${widthName}/genres のカテゴリメタ情報が狭すぎます`,
          ).toBeGreaterThan(100);
        }
        if (routeName === "roles") {
          await expect(page.locator("[data-role-list] .loading")).toHaveCount(
            0,
          );
        }
        const geometry = await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(
          geometry.scrollWidth,
          `${theme}/${widthName}/${routeName} に横スクロール`,
        ).toBeLessThanOrEqual(geometry.width + 1);
        await page.screenshot({
          path: path.join(outputDir, `${routeName}-${theme}-${widthName}.png`),
          fullPage: true,
        });
      }
    }
  }
});
