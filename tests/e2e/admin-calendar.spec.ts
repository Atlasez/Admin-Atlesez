import { expect, test } from "@playwright/test";

test("予定の取得に失敗してもカレンダーを表示する", async ({ page }) => {
  const now = new Date();
  const expectedDays = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  await page.route("**/api/admin/operations**", async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: "予定を一時的に取得できません。" },
    });
  });

  await page.goto("admin/calendar/?project=atlas");

  await expect(page.locator("[data-calendar-date]")).toHaveCount(expectedDays);
  await expect(page.locator("[data-calendar-title]")).not.toHaveText(
    "読み込み中…",
  );
  await expect(page.locator("[data-event-feedback]")).toContainText(
    "予定を読み込めませんでした。",
  );
});

test("カレンダーで複数地域・タイムゾーン・可否期間を操作できる", async ({
  page,
}) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const startDate = `${year}-${month}-10`;
  const endDate = `${year}-${month}-12`;
  let savedBlock: Record<string, unknown> | undefined;

  await page.route("**/api/admin/operations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.pathname.endsWith("/availability-blocks")
    ) {
      savedBlock = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (
      request.method() !== "GET" ||
      url.pathname !== "/api/admin/operations"
    ) {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        scope: { email: "alice@example.com", isManager: false },
        project: { id: "atlas", slug: "atlas", name: "アトラス" },
        members: [
          { email: "alice@example.com", display_name: "Alice" },
          { email: "bob@example.com", display_name: "Bob" },
        ],
        tasks: [],
        events: [],
        progress: [],
        availabilityBlocks: [
          {
            id: "self-block",
            email: "alice@example.com",
            display_name: "Alice",
            starts_at: `${startDate}T00:00:00Z`,
            ends_at: `${endDate}T00:00:00Z`,
            timezone: "Asia/Tokyo",
            label: "本人だけのメモ",
            kind: "available",
            isSelf: true,
          },
          {
            id: "other-block",
            email: "bob@example.com",
            display_name: "Bob",
            starts_at: `${startDate}T00:00:00Z`,
            ends_at: `${endDate}T00:00:00Z`,
            timezone: "Asia/Tokyo",
            label: "",
            kind: "unavailable",
            isSelf: false,
          },
        ],
      },
    });
  });

  await page.goto("admin/calendar/?project=atlas");
  await expect(page.locator("[data-calendar-date]")).toHaveCount(
    new Date(year, now.getMonth() + 1, 0).getDate(),
  );

  const holidayRegions = page.locator("[data-calendar-holiday-country]");
  expect(await holidayRegions.locator("option").count()).toBeGreaterThanOrEqual(
    500,
  );
  await page.locator('[data-calendar-tab="settings"]').click();
  await page.locator("[data-holiday-add]").click();
  await holidayRegions.selectOption(["JP", "US/CA"]);
  await expect(holidayRegions.locator("option:checked")).toHaveCount(2);

  await page.locator("[data-timezone-toggle]").click();
  await expect(page.locator("[data-timezone-options]")).toBeVisible();
  await page.locator("[data-calendar-timezone]").fill("New_York");
  await page.locator('[data-timezone-value="America/New_York"]').click();
  await expect(page.locator("[data-calendar-timezone]")).toHaveValue(
    "America/New_York",
  );
  await page.locator('[data-calendar-tab="agenda"]').click();

  await expect(page.getByText("自分：動ける").first()).toBeVisible();
  await expect(page.getByText("Bob：動けない").first()).toBeVisible();
  await expect(page.getByText("本人だけのメモ")).toHaveCount(1);

  const startCell = page.locator(`[data-calendar-date="${startDate}"]`);
  const endCell = page.locator(`[data-calendar-date="${endDate}"]`);
  await startCell.scrollIntoViewIfNeeded();
  await startCell.click();
  await endCell.click();
  await expect(startCell).toHaveClass(/calendar-cell--selected/);
  await expect(endCell).toHaveClass(/calendar-cell--selected/);

  await expect(page.locator("[data-block-editor]")).toHaveAttribute("open", "");
  await expect(page.locator("[data-block-all-day]")).toBeChecked();
  await expect(page.locator("[data-block-start]")).toHaveValue(
    `${startDate}T00:00`,
  );
  const dayAfterEnd = new Date(`${endDate}T00:00:00Z`);
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
  await expect(page.locator("[data-block-end]")).toHaveValue(
    `${dayAfterEnd.toISOString().slice(0, 10)}T00:00`,
  );

  await page.locator("[data-block-kind]").selectOption("unavailable");
  await page.locator("[data-create-block]").click();
  await expect.poll(() => savedBlock).toBeDefined();
  expect(savedBlock).toMatchObject({
    kind: "unavailable",
    timezone: "America/New_York",
  });
  expect(String(savedBlock?.startsAt)).toMatch(/Z$/);
  expect(String(savedBlock?.endsAt)).toMatch(/Z$/);
});
