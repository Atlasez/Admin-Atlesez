import { expect, test, type Page } from "@playwright/test";

const baseAdminMocks = async (page: Page) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "manager@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
};

test("大元マイページは基本情報を承認申請として送る", async ({ page }) => {
  await baseAdminMocks(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/profile", async (route) => {
    if (route.request().method() === "PUT") {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { ok: true, approvalRequired: true } });
      return;
    }
    await route.fulfill({
      json: {
        email: "member@example.com",
        profile: {
          display_name: "山田 花子",
          university: "Atlasez大学",
          year: "2年",
          affiliation_type: "student",
          country: "日本",
          timezone: "Asia/Tokyo",
          bio: "運営外向けプロフィール",
        },
        profileChangeRequest: null,
      },
    });
  });

  await page.goto("admin/member-profile/");
  await expect(page.getByLabel("運営外自己紹介")).toHaveValue(
    "運営外向けプロフィール",
  );
  await expect(page.getByText("担当原稿")).toHaveCount(0);
  await expect(page.getByText("個人メモ")).toHaveCount(0);
  await page.getByLabel("国・地域").fill("ネパール");
  await page.getByLabel("タイムゾーン").fill("Asia/Kathmandu");
  await page.getByRole("button", { name: "変更を承認申請" }).click();
  await expect(page.locator("[data-message]")).toContainText(
    "運営事務局へ送りました",
  );
  expect(submitted).toMatchObject({
    displayName: "山田 花子",
    country: "ネパール",
    timezone: "Asia/Kathmandu",
    bio: "運営外向けプロフィール",
  });
});

test("APIがHTMLエラーを返してもJSON解析例外を画面へ表示しない", async ({
  page,
}) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/html",
      body: "<!DOCTYPE html><title>Worker error</title>",
    }),
  );

  await page.goto("admin/member-profile/");
  await expect(page.locator("[data-message]")).toContainText(
    "プロフィール情報を読み込めませんでした。（HTTP 500）",
  );
  await expect(page.locator("[data-message]")).not.toContainText(
    "Unexpected token",
  );
});

test("横断タスク管理で複数プロジェクトを一覧・更新できる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  let updatedStatus = "";
  await page.route("**/api/admin/operations/tasks/*", async (route) => {
    updatedStatus = (route.request().postDataJSON() as { status: string })
      .status;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/admin/member-tasks", (route) =>
    route.fulfill({
      json: {
        scope: { email: "manager@example.com" },
        projects: [
          { id: "atlas", name: "アトラス", role: "manager" },
          { id: "secretariat", name: "運営事務局", role: "manager" },
        ],
        members: [],
        tasks: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            project_id: "atlas",
            title: "記事を査読する",
            status: "open",
            assignee_email: "manager@example.com",
            created_by: "member@example.com",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            project_id: "secretariat",
            title: "名簿を更新する",
            status: "doing",
            assignee_email: "manager@example.com",
            created_by: "manager@example.com",
          },
        ],
      },
    }),
  );

  await page.goto("admin/member-tasks/");
  await expect(page.getByText("記事を査読する")).toBeVisible();
  await expect(page.getByText("名簿を更新する")).toBeVisible();
  const firstTask = page.locator(".task").filter({ hasText: "記事を査読する" });
  await firstTask.locator("select").selectOption("done");
  await firstTask.getByRole("button", { name: "状態を保存" }).click();
  expect(updatedStatus).toBe("done");
});

test("横断カレンダーでプロジェクト日程と参加可否を扱える", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.route("**/api/admin/operations/events/*/availability", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/admin/member-calendar", (route) =>
    route.fulfill({
      json: {
        scope: { email: "manager@example.com", isManager: false },
        projects: [
          { id: "atlas", name: "アトラス" },
          { id: "secretariat", name: "運営事務局" },
        ],
        events: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            project_id: "atlas",
            title: "数学同時作業会",
            starts_at: "2027-01-10T10:00",
            timezone: "Asia/Tokyo",
            availabilityCounts: { available: 2, maybe: 1, unavailable: 0 },
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            project_id: "secretariat",
            title: "名簿更新会",
            starts_at: "2027-01-11T10:00",
            timezone: "Asia/Tokyo",
            availabilityCounts: { available: 1, maybe: 0, unavailable: 0 },
          },
        ],
      },
    }),
  );

  await page.goto("admin/member-calendar/");
  await expect(page.getByText("数学同時作業会")).toBeVisible();
  await expect(page.getByText("名簿更新会")).toBeVisible();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
  await page.getByRole("button", { name: "⚙️ 設定" }).click();
  await page.getByLabel("表示タイムゾーン").fill("Asia/Kathmandu");
  await expect(page.locator("[data-timezone-offset]")).toContainText(
    "UTC+05:45",
  );
});

test("運営事務局でプロフィール変更を承認できる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "承認担当" } } }),
  );
  let action = "";
  await page.route("**/api/admin/profile-change-requests/*", async (route) => {
    action = (route.request().postDataJSON() as { action: string }).action;
    await route.fulfill({ json: { ok: true, status: "approved" } });
  });
  await page.route("**/api/admin/profile-change-requests?**", (route) =>
    route.fulfill({
      json: {
        requests: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            email: "member@example.com",
            proposed_display_name: "山田 花子",
            proposed_university: "Atlasez大学",
            proposed_timezone: "Asia/Kathmandu",
            status: "pending",
            submitted_at: "2026-08-22T10:00:00.000Z",
          },
        ],
      },
    }),
  );

  await page.goto("admin/profile-requests/");
  await expect(page.getByRole("heading", { name: "山田 花子" })).toBeVisible();
  await page.getByRole("button", { name: "承認", exact: true }).click();
  expect(action).toBe("approve");
});

test("運営事務局でプロフィール変更を却下できる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "承認担当" } } }),
  );
  let action = "";
  await page.route("**/api/admin/profile-change-requests/*", async (route) => {
    action = (route.request().postDataJSON() as { action: string }).action;
    await route.fulfill({ json: { ok: true, status: "rejected" } });
  });
  await page.route("**/api/admin/profile-change-requests?**", (route) =>
    route.fulfill({
      json: {
        requests: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            email: "member@example.com",
            proposed_display_name: "却下対象",
            status: "pending",
            submitted_at: "2026-08-22T10:00:00.000Z",
          },
        ],
      },
    }),
  );

  await page.goto("admin/profile-requests/");
  await page.getByLabel("承認・却下メモ").fill("所属情報を再確認してください");
  await page.getByRole("button", { name: "却下", exact: true }).click();
  expect(action).toBe("reject");
});
