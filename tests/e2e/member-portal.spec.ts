import { expect, test, type Page } from "@playwright/test";

const baseAdminMocks = async (page: Page) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "manager@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
};

test("マイページは基本情報を表示し、編集画面から公開プロフィールを承認申請する", async ({
  page,
}) => {
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
        email: "hanako@school.example",
        profile: {
          display_name: "山田 花子",
          university: "Atlasez大学",
          year: "B2",
          affiliation_type: "student",
          country: "日本",
          timezone: "Asia/Tokyo",
          bio: "運営外向けプロフィール",
        },
        discordUserId: "",
        profileChangeRequest: null,
      },
    });
  });

  await page.goto("admin/member-profile/");
  await expect(page.getByRole("heading", { name: "山田 花子" })).toBeVisible();
  await expect(page.locator("[data-email]")).toHaveText(
    "hanako@school.example",
  );
  await expect(page.locator("[data-fact=university]")).toHaveText(
    "Atlasez大学",
  );
  await expect(page.locator("[data-fact=year]")).toHaveText("B2");
  await expect(page.locator("[data-bio]")).toHaveText("運営外向けプロフィール");
  await expect(
    page.getByRole("link", { name: "プロフィールを編集" }),
  ).toHaveAttribute("href", "/admin/member-profile/edit/");
  await expect(page.locator("[data-discord-status]")).toHaveText("未連携");
  await expect(page.locator("[data-discord-link]")).toHaveText("Discordと連携");
  await expect(page.locator("[data-discord-link]")).toHaveAttribute(
    "href",
    "/auth/discord/start?returnTo=%2Fadmin%2Fmember-profile%2F",
  );
  await page.goto("admin/member-profile/edit/");
  await expect(page.locator("[data-display-name]")).toHaveValue("山田 花子");
  await page.locator("[data-bio]").fill("更新した公開プロフィール");
  await page.getByRole("button", { name: "変更を承認申請" }).click();
  await expect(page.locator("[data-message]")).toContainText(
    "運営事務局へ送りました",
  );
  expect(submitted).toMatchObject({
    displayName: "山田 花子",
    bio: "更新した公開プロフィール",
  });
});

test("マイページはDiscord連携済みの状態と再連携ボタンを表示する", async ({
  page,
}) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({
      json: {
        email: "member@example.com",
        discordUserId: "discord-user-123",
        profile: { display_name: "連携済みメンバー" },
      },
    }),
  );

  await page.goto("admin/member-profile/");
  await expect(page.locator("[data-discord-status]")).toHaveText("連携済み");
  await expect(page.locator("[data-discord-link]")).toHaveText(
    "Discord連携を更新",
  );
  await expect(page.locator("[data-discord-description]")).toContainText(
    "連携済み",
  );
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

test("マイページの読み込み失敗から共通の再試行で復帰できる", async ({
  page,
}) => {
  await baseAdminMocks(page);
  let attempts = 0;
  await page.route("**/api/admin/profile", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, json: { error: "一時的な障害" } });
      return;
    }
    await route.fulfill({
      json: {
        email: "retry@example.com",
        profile: { display_name: "再試行メンバー" },
      },
    });
  });

  await page.goto("admin/member-profile/");
  const notice = page.locator("[data-admin-load-error]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("一時的な障害");
  await notice.getByRole("button", { name: "再試行" }).click();
  await expect(
    page.getByRole("heading", { name: "再試行メンバー" }),
  ).toBeVisible();
  await expect(notice).toBeHidden();
  expect(attempts).toBeGreaterThanOrEqual(2);
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
  await page.route("**/api/admin/member-tasks**", (route) =>
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
  await expect(page.locator("[data-scroll-create]")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /未対応を確認/ }),
  ).toHaveAttribute("href", "/admin/action-center/");
  await page.locator("[data-scroll-create]").click();
  await expect(page.locator("[data-title]")).toBeFocused();
  await expect(page.locator("[data-summary-total]")).toHaveText("2");
  await expect(page.locator("[data-summary-open]")).toHaveText("1");
  await expect(page.locator("[data-summary-doing]")).toHaveText("1");
  await expect(page.locator("[data-summary-done]")).toHaveText("0");
  await expect(page.locator('[data-filter="assigned"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("記事を査読する")).toBeVisible();
  await expect(page.getByText("名簿を更新する")).toBeVisible();
  await expect(page.locator(".project-filters label").first()).toHaveCSS(
    "border-radius",
    "999px",
  );
  const firstTask = page.locator(".task").filter({ hasText: "記事を査読する" });
  await expect(firstTask).toHaveCSS("display", "grid");
  await expect(firstTask.locator(".task-actions")).toHaveCSS("display", "grid");
  await firstTask.locator("select").selectOption("done");
  const updateRequest = page.waitForRequest("**/api/admin/operations/tasks/*");
  await firstTask.getByRole("button", { name: "状態を保存" }).click();
  await updateRequest;
  expect(updatedStatus).toBe("done");

  await page.goto(
    "admin/member-tasks/?focus=22222222-2222-4222-8222-222222222222",
  );
  await expect(
    page.locator('[data-task-id="22222222-2222-4222-8222-222222222222"]'),
  ).toHaveClass(/is-focused/);
});

test("完了タスクをアーカイブし、必要なときに復元できる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  let archived = false;
  await page.route("**/api/admin/operations/tasks/*", async (route) => {
    const body = route.request().postDataJSON() as { archived?: boolean };
    archived = body.archived === true;
    await route.fulfill({ json: { ok: true, archived } });
  });
  await page.route("**/api/admin/member-tasks**", async (route) => {
    const includeArchived =
      new URL(route.request().url()).searchParams.get("includeArchived") ===
      "1";
    await route.fulfill({
      json: {
        scope: { email: "manager@example.com" },
        projects: [{ id: "atlas", name: "アトラス", role: "manager" }],
        members: [],
        tasks:
          includeArchived || !archived
            ? [
                {
                  id: "done-1",
                  project_id: "atlas",
                  title: "完了済みタスク",
                  status: "done",
                  created_by: "manager@example.com",
                  assignee_email: "manager@example.com",
                  ...(archived
                    ? { archived_at: "2026-09-01T00:00:00.000Z" }
                    : {}),
                },
              ]
            : [],
      },
    });
  });
  await page.goto("admin/member-tasks/");
  const task = page.locator(".task").filter({ hasText: "完了済みタスク" });
  await expect(task.getByRole("button", { name: "アーカイブ" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await task.getByRole("button", { name: "アーカイブ" }).click();
  await expect(page.getByText("完了済みタスク")).toHaveCount(0);
  await page.getByLabel("アーカイブ済みを表示").check();
  await expect(page.getByText("アーカイブ済み", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "復元" }).click();
  expect(archived).toBe(false);
});

test("横断タスク管理はカーソルで追加読み込みできる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.route("**/api/admin/member-tasks**", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    const task = cursor
      ? {
          id: "member-task-next",
          project_id: "atlas",
          title: "追加ページのタスク",
          status: "open",
          assignee_email: "manager@example.com",
          created_by: "manager@example.com",
        }
      : {
          id: "member-task-first",
          project_id: "atlas",
          title: "最初のタスク",
          status: "open",
          assignee_email: "manager@example.com",
          created_by: "manager@example.com",
        };
    await route.fulfill({
      json: {
        scope: { email: "manager@example.com" },
        projects: [{ id: "atlas", name: "アトラス", role: "manager" }],
        members: [],
        tasks: [task],
        pagination: cursor
          ? { limit: 1, nextCursor: null, hasMore: false }
          : { limit: 1, nextCursor: "member-cursor-1", hasMore: true },
      },
    });
  });

  await page.goto("admin/member-tasks/");
  await expect(page.locator("[data-list]")).toContainText("最初のタスク");
  const loadMore = page.getByRole("button", { name: "さらに読み込む" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(page.locator("[data-list]")).toContainText("追加ページのタスク");
  await expect(loadMore).toBeHidden();
});

test("タスク一覧の再読み込み要求をまとめ、最新の条件だけを反映する", async ({
  page,
}) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  const requests: string[] = [];
  await page.route("**/api/admin/member-tasks**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (requests.length === 1)
      await new Promise((resolve) => setTimeout(resolve, 180));
    const includeArchived =
      new URL(url).searchParams.get("includeArchived") === "1";
    await route.fulfill({
      json: {
        scope: { email: "manager@example.com" },
        projects: [{ id: "atlas", name: "アトラス", role: "manager" }],
        members: [],
        tasks: includeArchived
          ? [
              {
                id: "archived-task",
                project_id: "atlas",
                title: "アーカイブ済み",
                status: "done",
                archived_at: "2026-09-01T00:00:00.000Z",
                created_by: "manager@example.com",
                assignee_email: "manager@example.com",
              },
            ]
          : [],
      },
    });
  });
  await page.goto("admin/member-tasks/");
  await page.getByLabel("アーカイブ済みを表示").check();
  await expect(
    page.getByRole("heading", { name: "アーカイブ済み", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(new URL(requests[1]).searchParams.get("includeArchived")).toBe("1");
});

test("横断カレンダーでプロジェクト日程と参加可否を扱える", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.route("**/api/admin/operations/events/*/availability", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/admin/member-calendar**", (route) =>
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
  await page.getByRole("button", { name: "承認する", exact: true }).click();
  expect(action).toBe("approve");
});

test("承認一覧はカーソルで追加の申請を読み込める", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "承認担当" } } }),
  );
  const requestUrls: string[] = [];
  let calls = 0;
  await page.route("**/api/admin/profile-change-requests?**", async (route) => {
    calls += 1;
    requestUrls.push(route.request().url());
    if (calls === 1) {
      await route.fulfill({
        json: {
          requests: [
            {
              id: "88888888-8888-4888-8888-888888888888",
              email: "first@example.com",
              proposed_display_name: "最初の申請",
              status: "approved",
              submitted_at: "2026-08-22T10:00:00.000Z",
            },
          ],
          atlasInternalBioRequests: [],
          pagination: {
            nextCursor:
              "1|2026-08-22T10:00:00.000Z|88888888-8888-4888-8888-888888888888",
            hasMore: true,
          },
          atlasPagination: { nextCursor: null, hasMore: false },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        requests: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            email: "second@example.com",
            proposed_display_name: "追加の申請",
            status: "approved",
            submitted_at: "2026-08-21T10:00:00.000Z",
          },
        ],
        atlasInternalBioRequests: [],
        pagination: { nextCursor: null, hasMore: false },
        atlasPagination: { nextCursor: null, hasMore: false },
      },
    });
  });

  await page.goto("admin/profile-requests/?status=all");
  await expect(page.getByRole("heading", { name: "最初の申請" })).toBeVisible();
  const loadMore = page.getByRole("button", { name: "さらに読み込む" });
  await expect(loadMore).toHaveCount(1);
  await loadMore.click();
  await expect(page.getByRole("heading", { name: "追加の申請" })).toBeVisible();
  expect(requestUrls[1]).toContain(
    "cursor=1%7C2026-08-22T10%3A00%3A00.000Z%7C88888888-8888-4888-8888-888888888888",
  );
});

test("承認一覧の読み込みエラーから再試行できる", async ({ page }) => {
  await baseAdminMocks(page);
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "承認担当" } } }),
  );
  let calls = 0;
  await page.route("**/api/admin/profile-change-requests?**", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "一時的に申請を読み込めません。" },
      });
      return;
    }
    await route.fulfill({
      json: { requests: [], atlasInternalBioRequests: [], pendingApprovals: 0 },
    });
  });

  await page.goto("admin/profile-requests/");
  const retry = page.locator("[data-retry]");
  await expect(retry).toBeVisible();
  await expect(page.locator("[data-message]")).toContainText(
    "一時的に申請を読み込めません。",
  );

  await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.locator("[data-count]")).toHaveText("0件");
  expect(calls).toBe(2);
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
  await page
    .getByLabel("処理メモ（任意）")
    .fill("所属情報を再確認してください");
  await page.getByRole("button", { name: "却下する", exact: true }).click();
  expect(action).toBe("reject");
});

test("統合された学習サイトの運営内自己紹介を承認できる", async ({ page }) => {
  await baseAdminMocks(page);
  let action = "";
  let reviewUrl = "";
  await page.route(
    "**/api/admin/project-profile-change-requests/*",
    async (route) => {
      action = (route.request().postDataJSON() as { action: string }).action;
      reviewUrl = route.request().url();
      await route.fulfill({ json: { ok: true, status: "approved" } });
    },
  );
  await page.route("**/api/admin/profile-change-requests?**", (route) =>
    route.fulfill({
      json: {
        requests: [],
        atlasInternalBioRequests: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            email: "member@example.com",
            display_name: "申請メンバー",
            current_internal_bio: "変更前",
            proposed_internal_bio: "変更後",
            status: "pending",
            submitted_at: "2026-08-22T10:00:00.000Z",
          },
        ],
      },
    }),
  );

  await page.goto("admin/profile-requests/?section=atlas");
  await expect(page.getByText("変更後", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "承認する", exact: true }).click();
  expect(action).toBe("approve");
  expect(reviewUrl).toContain("/api/admin/project-profile-change-requests/");
});
