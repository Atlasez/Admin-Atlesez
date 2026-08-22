import { expect, test, type Page } from "@playwright/test";

async function mockOperationsApi(page: Page) {
  const tasks = [
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
  await expect(
    page.getByText(
      "表示対象を切り替えると、一覧に表示するタスクが変わります。",
      { exact: true },
    ),
  ).toBeVisible();
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
