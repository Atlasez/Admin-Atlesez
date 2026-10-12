import { expect, test, type Page } from "@playwright/test";

async function mockOperationsApi(
  page: Page,
  taskFixtures?: Record<string, unknown>[],
) {
  const tasks: Record<string, unknown>[] = taskFixtures ?? [
    {
      id: "task-1",
      title: "既存のタスク",
      status: "open",
      subject: "mathematics",
      assignee_email: "alice@example.com",
      created_by: "alice@example.com",
      due_at: null,
      due_timezone: "Asia/Tokyo",
      details: "",
      reminders: [],
      created_at: "2026-09-01T00:00:00.000Z",
    },
  ];
  await page.route("**/api/admin/operations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.pathname === "/api/admin/operations/tasks"
    ) {
      const body = request.postDataJSON() as { title: string };
      tasks.push({
        ...tasks[0],
        id: "task-2",
        title: body.title,
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ task: tasks[1] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: {
          email: "alice@example.com",
          isManager: false,
        },
        project: { id: "atlas", slug: "atlas", name: "Atlasez" },
        tasks,
        events: [],
        progress: [],
        members: [{ email: "alice@example.com", display_name: "Alice" }],
        availabilityBlocks: [],
      }),
    });
  });
}

test("T-1/T-2/T-5: タスク管理の初期表示が仕様どおりになる", async ({
  page,
}) => {
  await mockOperationsApi(page);
  await page.goto("admin/operations/?project=atlas");

  await expect(
    page.getByRole("heading", { level: 1, name: "タスク管理" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "タスク一覧" }),
  ).toBeVisible();
  await expect(page.getByLabel("完了済みを表示")).toBeVisible();
  await expect(page.locator("[data-task-list]")).toContainText("既存のタスク");

  const dialog = page.locator("[data-task-create-dialog]");
  await expect(dialog).toBeHidden();
  const openButton = page.getByRole("button", { name: "タスクを作成・依頼" });
  await openButton.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { level: 2, name: "タスク作成・依頼" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await openButton.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  await openButton.click();
  await dialog.locator("[data-task-title]").fill("新しいタスク");
  await dialog.getByRole("button", { name: "タスクを追加" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-task-list]")).toContainText("新しいタスク");
  await expect(page.locator("[data-task-list-feedback]")).toHaveText(
    "タスクを追加しました。",
  );
  await expect(page.getByRole("heading", { name: "ToDo" })).toHaveCount(0);
});

test("タスク一覧はカーソルで追加読み込みできる", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/operations**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const cursor = requestUrl.searchParams.get("cursor");
    requests += 1;
    const task = cursor
      ? {
          id: "task-next",
          title: "次ページのタスク",
          status: "open",
          subject: "mathematics",
          assignee_email: "alice@example.com",
          created_by: "alice@example.com",
          due_at: null,
          due_timezone: "Asia/Tokyo",
          details: "",
          reminders: [],
        }
      : {
          id: "task-first",
          title: "最初のタスク",
          status: "open",
          subject: "mathematics",
          assignee_email: "alice@example.com",
          created_by: "alice@example.com",
          due_at: null,
          due_timezone: "Asia/Tokyo",
          details: "",
          reminders: [],
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: { email: "alice@example.com", isManager: false },
        project: { id: "atlas", slug: "atlas", name: "Atlasez" },
        tasks: [task],
        events: [],
        progress: [],
        members: [{ email: "alice@example.com", display_name: "Alice" }],
        availabilityBlocks: [],
        pagination: cursor
          ? { limit: 1, nextCursor: null, hasMore: false }
          : { limit: 1, nextCursor: "cursor-1", hasMore: true },
      }),
    });
  });

  await page.goto("admin/operations/?project=atlas");
  await expect(page.locator("[data-task-list]")).toContainText("最初のタスク");
  const loadMore = page.getByRole("button", { name: "さらに読み込む" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(page.locator("[data-task-list]")).toContainText(
    "次ページのタスク",
  );
  await expect(loadMore).toBeHidden();
  expect(requests).toBe(2);
});

test("権限限定タスクは安全な担当者表示を使い、別人の通知先を送信しない", async ({
  page,
}) => {
  let reminderUpdate: Record<string, unknown> | null = null;
  await page.route("**/api/admin/operations**", async (route) => {
    if (route.request().method() === "PATCH") {
      reminderUpdate = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: { email: "reviewer@example.com", isManager: false },
        project: { id: "atlas", slug: "atlas", name: "Atlasez" },
        tasks: [
          {
            id: "scoped-task",
            title: "担当分野のタスク",
            status: "open",
            subject: "mathematics",
            assigned_to_me: true,
            created_by_me: false,
            assignee_display_name: "他のメンバー",
            created_by_display_name: "他のメンバー",
            reminder_email: null,
            reminder_email_hidden: true,
            reminders: [],
            created_at: "2026-09-01T00:00:00.000Z",
          },
          {
            id: "read-only-task",
            title: "閲覧のみのタスク",
            status: "open",
            subject: "mathematics",
            assigned_to_me: false,
            created_by_me: false,
            can_update: false,
            assignee_display_name: "他のメンバー",
            created_by_display_name: "他のメンバー",
            reminders: [],
            created_at: "2026-09-01T00:00:00.000Z",
          },
        ],
        events: [],
        progress: [],
        members: [],
        availabilityBlocks: [],
      }),
    });
  });

  await page.goto("admin/operations/?project=atlas");
  const list = page.locator("[data-task-list]");
  await page.locator('[data-task-filter="all"]').click();
  await expect(list).toContainText("担当分野のタスク");
  await expect(list).toContainText("担当：他のメンバー");
  await expect(list).toContainText("依頼者：他のメンバー");
  await expect(list).not.toContainText("@example.com");

  const assignedTask = list.locator(".task-item", {
    hasText: "担当分野のタスク",
  });
  await assignedTask.getByText("リマインダーを確認・編集").click();
  await expect(
    assignedTask.getByLabel("自分の通知先メールアドレス（任意）"),
  ).toBeDisabled();
  await assignedTask
    .getByRole("button", { name: "このタスクの設定を保存" })
    .click();
  await expect.poll(() => reminderUpdate).not.toBeNull();
  expect(reminderUpdate).not.toHaveProperty("reminderEmail");

  const readOnlyTask = list.locator(".task-item", {
    hasText: "閲覧のみのタスク",
  });
  await expect(
    readOnlyTask.getByRole("combobox", { name: "閲覧のみのタスクの状態" }),
  ).toBeDisabled();
  await readOnlyTask.getByText("リマインダーを確認・編集").click();
  await expect(
    readOnlyTask.getByRole("button", { name: "このタスクの設定を保存" }),
  ).toBeDisabled();
});

test("終端失敗したタスクリマインダーを設定欄の外にも知らせる", async ({
  page,
}) => {
  await page.route("**/api/admin/operations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: { email: "alice@example.com", isManager: false },
        project: { id: "atlas", slug: "atlas", name: "Atlasez" },
        tasks: [
          {
            id: "failed-reminder-task",
            title: "期限確認タスク",
            status: "open",
            subject: "mathematics",
            assigned_to_me: true,
            created_by_me: true,
            reminders: [],
            reminder_delivery_failed_count: 1,
            reminder_delivery_latest_failed_at: "2026-10-12T01:00:00.000Z",
          },
        ],
        events: [],
        progress: [],
        members: [],
        availabilityBlocks: [],
      }),
    });
  });

  await page.goto("admin/operations/?project=atlas");
  const task = page.locator(".task-item", { hasText: "期限確認タスク" });
  const warning = task.getByRole("status");
  await expect(warning).toContainText("メール通知が1件");
  await expect(warning).toContainText("自動再試行されません");
  await expect(warning).toBeVisible();
});

test("進捗報告一覧はカーソルで追加読み込みできる", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/progress**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const cursor = requestUrl.searchParams.get("cursor");
    requests += 1;
    const report = cursor
      ? {
          id: "progress-next",
          project_id: "atlas",
          project_name: "アトラス",
          subject: "mathematics",
          body: "次ページの進捗",
          created_at: "2026-09-01T00:00:00.000Z",
          email: "alice@example.com",
          display_name: "Alice",
        }
      : {
          id: "progress-first",
          project_id: "atlas",
          project_name: "アトラス",
          subject: "mathematics",
          body: "最初の進捗",
          created_at: "2026-09-02T00:00:00.000Z",
          email: "alice@example.com",
          display_name: "Alice",
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: {
          email: "alice@example.com",
          isManager: false,
          subjects: ["mathematics"],
        },
        projects: [{ id: "atlas", slug: "atlas", name: "アトラス" }],
        progress: [report],
        progressPagination: cursor
          ? { limit: 1, nextCursor: null, hasMore: false }
          : { limit: 1, nextCursor: "cursor-1", hasMore: true },
      }),
    });
  });

  await page.goto("admin/progress/");
  await expect(page.locator("[data-progress-list]")).toContainText(
    "最初の進捗",
  );
  const loadMore = page.getByRole("button", { name: "さらに読み込む" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(page.locator("[data-progress-list]")).toContainText(
    "次ページの進捗",
  );
  await expect(loadMore).toBeHidden();
  expect(requests).toBe(2);
});

test("進捗報告のいいねは状態と件数を更新できる", async ({ page }) => {
  const writes: { reacted: boolean; pathname: string }[] = [];
  await page.route("**/api/admin/progress**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { reacted: boolean };
      writes.push({ reacted: body.reacted, pathname: url.pathname });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          reactionCount: body.reacted ? 3 : 2,
          reactedByMe: body.reacted,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scope: {
          email: "alice@example.com",
          isManager: false,
          subjects: ["mathematics"],
        },
        projects: [{ id: "atlas", slug: "atlas", name: "アトラス" }],
        progress: [
          {
            id: "progress-react",
            project_id: "atlas",
            project_name: "アトラス",
            subject: "mathematics",
            body: "リアクション対象の進捗",
            created_at: "2026-09-02T00:00:00.000Z",
            email: "alice@example.com",
            display_name: "Alice",
            reaction_count: 2,
            reacted_by_me: 0,
          },
        ],
        progressPagination: { limit: 50, nextCursor: null, hasMore: false },
      }),
    });
  });

  await page.goto("admin/progress/");
  const reaction = page.locator('[data-progress-reaction="progress-react"]');
  await expect(reaction).toHaveAttribute("aria-pressed", "false");
  await expect(reaction).toContainText("2");
  await reaction.click();
  await expect(
    page.locator('[data-progress-reaction="progress-react"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('[data-progress-reaction="progress-react"]'),
  ).toContainText("3");
  await page.locator('[data-progress-reaction="progress-react"]').click();
  await expect(
    page.locator('[data-progress-reaction="progress-react"]'),
  ).toHaveAttribute("aria-pressed", "false");
  expect(writes).toEqual([
    { reacted: true, pathname: "/api/admin/progress/progress-react/reaction" },
    { reacted: false, pathname: "/api/admin/progress/progress-react/reaction" },
  ]);
});

test("375px幅のタスク一覧で主要操作のタッチ領域を44px以上に保つ", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockOperationsApi(page, [
    {
      id: "task-open",
      title: "進行中タスク",
      status: "open",
      subject: "mathematics",
      assignee_email: "alice@example.com",
      created_by: "alice@example.com",
      due_at: null,
      due_timezone: "Asia/Tokyo",
      details: "",
      reminders: [],
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "task-done",
      title: "完了タスク",
      status: "done",
      subject: "mathematics",
      assigned_to_me: true,
      created_by_me: true,
      created_by: "alice@example.com",
      assignee_display_name: "Alice",
      created_by_display_name: "Alice",
      can_update: true,
      due_at: null,
      due_timezone: "Asia/Tokyo",
      details:
        "記事編集画面: /admin/editor/?document=11111111-1111-4111-8111-111111111111",
      reminders: [],
      created_at: "2026-09-02T00:00:00.000Z",
    },
  ]);
  await page.goto("admin/operations/?project=atlas");
  await page.locator('[data-task-filter="all"]').click();
  await page.getByLabel("完了済みを表示").check();
  await expect(page.locator("[data-task-list] .task-item")).toHaveCount(2);
  await expect(
    page.locator("[data-task-list] .task-archive-button"),
  ).toHaveCount(1);
  await expect(page.locator("[data-task-list] .task-open-editor")).toHaveCount(
    1,
  );

  const targets = [
    page.locator(".task-create-open"),
    ...(await page.locator(".task-filters button").all()),
    ...(await page.locator(".task-view-tools label").all()),
    ...(await page.locator("[data-task-list] .task-archive-button").all()),
    ...(await page.locator("[data-task-list] .task-open-editor").all()),
  ];
  for (const target of targets) {
    const bounds = await target.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});
