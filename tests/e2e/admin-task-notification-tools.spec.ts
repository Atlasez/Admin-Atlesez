import { test, expect, type Page } from "@playwright/test";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const row = {
  id,
  project_id: "atlas",
  name: "週報",
  title: "週報を書く",
  details: "",
  assignees: ["me@example.com"],
  timezone: "Asia/Tokyo",
  schedule: "none",
  anchor_at: null,
  due_after_days: null,
  enabled: 0,
  next_run_at: null,
  last_task_id: null,
  last_generated_at: null,
  last_error: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};
async function mock(page: Page) {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/admin/auth-status"
          ? { email: "me@example.com", isManager: true }
          : path === "/api/admin/profile"
            ? { profile: { display_name: "確認担当" } }
            : path === "/api/admin/task-templates"
              ? {
                  templates: [row],
                  projects: [{ id: "atlas", name: "Atlas", role: "manager" }],
                  members: [
                    {
                      project_id: "atlas",
                      email: "me@example.com",
                      name: "自分",
                    },
                  ],
                  email: "me@example.com",
                }
              : {
                  notifications: [],
                  preferences: {
                    available: true,
                    mutedKinds: [],
                    summaryEnabled: true,
                  },
                },
    });
  });
}
test("テンプレート保存のHTMLエラー後に入力を保持して再試行できる", async ({
  page,
}) => {
  await mock(page);
  let posts = 0;
  await page.route("**/api/admin/task-templates", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts++;
    await route.fulfill(
      posts === 1
        ? { status: 502, contentType: "text/html", body: "upstream error" }
        : { json: { ok: true } },
    );
  });
  await page.goto("admin/task-templates/");
  await expect(page.locator("[data-task-templates]")).toHaveAttribute(
    "data-admin-load-state",
    "ready",
  );
  await page.locator('[name="name"]').fill("確認");
  await page.locator('[name="title"]').fill("確認タスク");
  const save = page.locator("[data-template-save]");
  await save.click();
  await expect(save).toBeEnabled();
  await expect(page.locator("[data-template-message]")).toContainText(
    "HTTP 502",
  );
  await expect(page.locator('[name="title"]')).toHaveValue("確認タスク");
  await save.click();
  await expect(page.locator("[data-template-message]")).toHaveText(
    "テンプレートを保存しました。",
  );
  expect(posts).toBe(2);
});
test("テンプレートから作成の連打をまとめ、モバイルでも横にはみ出さない", async ({
  page,
}) => {
  await mock(page);
  let posts = 0;
  await page.route(
    `**/api/admin/task-templates/${id}/create`,
    async (route) => {
      posts++;
      expect(route.request().postDataJSON().idempotencyKey).toMatch(
        /^[a-f0-9-]{36}$/,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        json: { taskId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("admin/task-templates/");
  await page.locator("[data-template-create]").dblclick();
  await expect(page.locator("[data-template-message]")).toHaveText(
    "タスクを作成しました。",
  );
  expect(posts).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("通知要約・重要度・再表示予約を操作できる", async ({ page }) => {
  await mock(page);
  let snoozed = false,
    restored = false,
    importantQuery = false;
  await page.route("**/api/admin/notifications?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    importantQuery ||= params.get("importance") === "important";
    const visible = params.get("snoozedOnly") === "true" ? snoozed : !snoozed;
    await route.fulfill({
      json: {
        notifications: visible
          ? [
              {
                id: "mention-abcdefgh",
                kind: "mention",
                importance: "important",
                title: "確認の依頼",
                detail: "本文",
                href: "/admin/member-tasks/",
                updatedAt: "2026-10-01T00:00:00Z",
                read: false,
              },
            ]
          : [],
        unreadNotificationsCount: visible ? 1 : 0,
        totalNotifications: visible ? 1 : 0,
        nextCursor: null,
        preferences: { available: true, mutedKinds: [], summaryEnabled: true },
      },
    });
  });
  await page.route("**/api/admin/notifications/snooze", async (route) => {
    const body = route.request().postDataJSON();
    if (body.until === null) {
      restored = true;
      snoozed = false;
    } else snoozed = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("admin/notifications/");
  await expect(page.locator("[data-notification-digest]")).toContainText(
    "メンション: 1件（未読1件）",
  );
  await page.locator('[data-notification-filter="important"]').click();
  await expect(page.locator("[data-notification-list]")).toContainText(
    "確認の依頼",
  );
  await page.locator("[data-notification-snooze]").click();
  await expect(page.locator("[data-notification-list]")).not.toContainText(
    "確認の依頼",
  );
  await page.locator('[data-notification-filter="snoozed"]').click();
  await expect(page.locator("[data-notification-snooze]")).toHaveText(
    "再表示する",
  );
  await page.locator("[data-notification-snooze]").click();
  expect(restored).toBe(true);
  expect(importantQuery).toBe(true);
});

test("通知設定の保存失敗後も変更内容を保持して再試行できる", async ({
  page,
}) => {
  await mock(page);
  let saves = 0;
  await page.route("**/api/admin/notifications/preferences", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      mutedKinds: ["comment"],
      summaryEnabled: false,
    });
    saves++;
    await route.fulfill(
      saves === 1
        ? { status: 502, contentType: "text/html", body: "upstream error" }
        : { json: { ok: true } },
    );
  });
  await page.goto("admin/notifications/");
  await page.getByText("通知の表示設定", { exact: true }).click();
  await page.locator('[name="kind"][value="comment"]').uncheck();
  await page.locator('[name="summaryEnabled"]').uncheck();
  const save = page.getByRole("button", { name: "通知設定を保存" });
  await save.click();
  await expect(
    page.locator("[data-notification-settings-message]"),
  ).toContainText("HTTP 502");
  await expect(save).toBeEnabled();
  await expect(
    page.locator('[name="kind"][value="comment"]'),
  ).not.toBeChecked();
  await expect(page.locator('[name="summaryEnabled"]')).not.toBeChecked();
  await save.click();
  await expect(page.locator("[data-notification-settings-message]")).toHaveText(
    "通知設定を保存しました。",
  );
  expect(saves).toBe(2);
});
