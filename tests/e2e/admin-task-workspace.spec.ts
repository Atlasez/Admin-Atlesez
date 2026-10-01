import { expect, test, type Page } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111",
  dependency = "22222222-2222-4222-8222-222222222222";
function initial(canEdit = true) {
  return {
    task: {
      id,
      title: "記事の公開前確認",
      status: "doing",
      updatedAt: "2026-10-01T00:00:00Z",
      assigneeEmails: ["a@example.com"],
    },
    workspace: {
      summary: "本文の確認が完了",
      nextAction: "参考文献を確認",
      waitingFor: "分野担当の返信",
      documentId: null,
      checklist: [] as Array<{ id: string; label: string; done: boolean }>,
      revision: 0,
    },
    dependencies: [] as Array<{
      id: string;
      title: string;
      status: string;
      available: boolean;
    }>,
    candidates: [{ id: dependency, title: "原稿を仕上げる", status: "doing" }],
    members: [
      { email: "a@example.com", name: "担当A" },
      { email: "b@example.com", name: "担当B" },
    ],
    history: [],
    canEdit,
    canAssign: canEdit,
  };
}
async function mock(
  page: Page,
  options: {
    canEdit?: boolean;
    hold?: Promise<void>;
    htmlError?: boolean;
  } = {},
) {
  let data = initial(options.canEdit ?? true),
    lastPayload: Record<string, unknown> | null = null,
    puts = 0;
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/admin/task-workspaces/")) {
      if (route.request().method() === "PUT") {
        puts++;
        lastPayload = route.request().postDataJSON();
        if (options.hold) await options.hold;
        if (options.htmlError && puts === 1) {
          await route.fulfill({
            status: 503,
            contentType: "text/html",
            body: "<html>unavailable</html>",
          });
          return;
        }
        const payload = lastPayload!;
        const revision = Number(payload.revision) + 1;
        data = {
          ...data,
          task: { ...data.task, updatedAt: "2026-10-02T00:00:00Z" },
          workspace: {
            ...data.workspace,
            summary: String(payload.summary),
            nextAction: String(payload.nextAction),
            waitingFor: String(payload.waitingFor),
            checklist: payload.checklist as typeof data.workspace.checklist,
            revision,
          },
          dependencies: (payload.dependencyIds as string[]).map((id) => ({
            id,
            title: "原稿を仕上げる",
            status: "doing",
            available: true,
          })),
        };
        await route.fulfill({
          json: { ok: true, revision, updatedAt: data.task.updatedAt },
        });
        return;
      }
      await route.fulfill({ json: data });
      return;
    }
    if (path === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "a@example.com", isManager: true },
      });
      return;
    }
    if (path === "/api/admin/profile") {
      await route.fulfill({
        json: { profile: { display_name: "担当A" }, email: "a@example.com" },
      });
      return;
    }
    if (path === "/api/admin/my-access") {
      await route.fulfill({
        json: {
          allSubjects: false,
          isManager: false,
          subjects: [{ id: "math", label: "数学" }],
          coordinatorSubjects: [],
          isProjectLeader: false,
          canEditArticles: true,
          projects: [
            {
              id: "atlas",
              name: "アトラス",
              role: "運営メンバー",
              canManage: false,
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        notifications: [],
        projects: [],
        availableProjects: [],
        members: [],
        roles: [],
        tasks: [],
      },
    });
  });
  return { payload: () => lastPayload, puts: () => puts };
}
test("チェックリストと前提タスクを保存し、HTML障害後も入力と操作を維持する", async ({
  page,
}) => {
  const state = await mock(page, { htmlError: true });
  await page.goto(`/admin/task-detail/?task=${id}`);
  await expect(
    page.getByRole("heading", { name: "記事の公開前確認" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "確認項目", exact: true })
    .fill("参考文献のリンクを確認");
  await page.getByRole("button", { name: "項目を追加", exact: true }).click();
  await page.getByRole("checkbox", { name: "参考文献のリンクを確認" }).check();
  await page.getByLabel("前提タスクの候補").selectOption(dependency);
  await page
    .getByRole("button", { name: "前提タスクを追加", exact: true })
    .click();
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存する", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("次にすること", { exact: true })).toHaveValue(
    "参考文献を確認",
  );
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.locator("[data-workspace-message]")).toHaveText(
    "保存しました。",
  );
  expect(state.payload()).toMatchObject({
    dependencyIds: [dependency],
    checklist: [{ label: "参考文献のリンクを確認", done: true }],
  });
  await expect(page.locator("[data-checklist-count]")).toHaveText("1/1件完了");
  expect(state.puts()).toBe(2);
});
test("保存待ちの追加入力を保持し、二重送信を防ぐ", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await mock(page, { hold });
  await page.goto(`/admin/task-detail/?task=${id}`);
  await page.getByLabel("現在の状況", { exact: true }).fill("送信内容");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.locator("[data-workspace-message]")).toHaveText(
    "保存しています…",
  );
  await page.getByLabel("現在の状況", { exact: true }).fill("追加入力を保持");
  await expect(
    page.getByRole("button", { name: "保存する", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.locator("[data-workspace-message]")).toHaveText(
    "送信した内容を保存しました。追加入力は未保存です。",
  );
  await expect(page.getByLabel("現在の状況", { exact: true })).toHaveValue(
    "追加入力を保持",
  );
  expect(state.payload()?.summary).toBe("送信内容");
  expect(state.puts()).toBe(1);
});
for (const width of [1440, 390])
  test(`閲覧専用とレイアウト ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page, { canEdit: false });
    await page.goto(`/admin/task-detail/?task=${id}`);
    await expect(
      page.getByRole("button", { name: "保存する", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("現在の状況", { exact: true })).toBeDisabled();
    await page.evaluate(() => {
      document.documentElement.dataset.prefBg = "dark";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/atlasez-task-workspace-${width}.png`,
      fullPage: true,
    });
  });
test("本人の担当権限と相談先をマイページに表示する", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/member-profile/");
  const panel = page.locator("[data-my-access]");
  await expect(panel).toContainText("記事の担当範囲: 数学");
  await expect(panel).toContainText("運営内運営へ相談");
  await expect(
    panel.getByRole("link", { name: "編集・フィードバックを開く" }),
  ).toBeVisible();
});
test("運営統計の対応リンクから条件付きの全件タスク一覧を開く", async ({
  page,
}) => {
  await mock(page);
  let params = new URLSearchParams();
  await page.route("**/api/admin/member-tasks?*", async (route) => {
    params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      json: {
        projects: [{ id: "atlas", name: "アトラス", role: "manager" }],
        tasks: [
          {
            id,
            title: "記事の公開前確認",
            status: "doing",
            project_id: "atlas",
          },
        ],
        members: [],
        counts: { total: 1, open: 0, doing: 1, done: 0 },
      },
    });
  });
  for (const [name, key, value] of [
    ["未完了タスクを確認", "status", "unfinished"],
    ["期限超過タスクを確認", "due", "overdue"],
  ]) {
    await page.goto("/admin/operations-statistics/");
    await page.getByRole("link", { name, exact: true }).click();
    await expect(
      page.getByRole("link", { name: "詳細・引き継ぎ →", exact: true }),
    ).toHaveAttribute("href", `/admin/task-detail/?task=${id}`);
    expect(params.get("view")).toBe("all");
    expect(params.get("project")).toBe("atlas");
    expect(params.get(key)).toBe(value);
    await expect(
      page.locator(
        key === "status" ? "[data-status-filter]" : "[data-due-filter]",
      ),
    ).toHaveValue(value);
  }
});
