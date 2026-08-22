import { expect, test } from "@playwright/test";

test("管理メニューはプロジェクト遷移後も同じ個数・順序を保つ", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await route.fulfill({
      json: { email: "manager@example.com", isManager: true },
    });
  });
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/admin/portal", (route) =>
    route.fulfill({ json: { todos: [], calendar: { events: [] } } }),
  );

  await page.goto("admin/atlas/");
  const menu = page.locator(".admin-management-menu");
  const common = [
    "管理トップ",
    "運営内自己紹介",
    "同時作業会",
    "運営者・担当管理",
    "問題報告・統計",
    "作業の進め方",
    "応募管理",
  ];
  await menu.locator("summary").click();
  await expect(menu.locator(":scope > div > a:visible")).toHaveText(common);

  await page.getByRole("link", { name: "メンバー用サイトへ戻る" }).click();
  await page.getByRole("link", { name: /Atlasez運営事務局/ }).click();
  await menu.locator("summary").click();
  await expect(menu.locator(":scope > div > a:visible")).toHaveText([
    "管理トップ",
    "運営内自己紹介",
    "事務局の日程・交流",
    ...common.slice(3),
  ]);
});

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
  const recurringDay = Array.from(
    { length: new Date(year, now.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  ).find((day) => new Date(year, now.getMonth(), day).getDay() === 2)!;
  const recurringDate = `${year}-${month}-${String(recurringDay).padStart(2, "0")}`;
  const recurringStartsAt = new Date(
    Date.UTC(year, now.getMonth(), recurringDay, 12, 0),
  ).toISOString();
  const emptyDay = Array.from(
    { length: new Date(year, now.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  ).find(
    (day) =>
      day !== 10 &&
      day !== 11 &&
      day !== recurringDay &&
      new Date(year, now.getMonth(), day).getDay() === 6,
  )!;
  const emptyDate = `${year}-${month}-${String(emptyDay).padStart(2, "0")}`;
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
          { email: "carol@example.com", display_name: "Carol" },
        ],
        tasks: [],
        events: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "企画会議",
            starts_at: `${startDate}T15:00:00Z`,
            ends_at: null,
            availability: "available",
            availabilityCounts: { available: 1, maybe: 0, unavailable: 2 },
            participants: [
              {
                displayName: "Alice",
                availability: "available",
                isSelf: true,
              },
              {
                displayName: "Bob",
                availability: "unavailable",
                isSelf: false,
              },
              {
                displayName: "Carol",
                availability: "unavailable",
                isSelf: false,
              },
            ],
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            title: "同時作業会",
            starts_at: recurringStartsAt,
            ends_at: null,
            availabilityCounts: { available: 0, maybe: 0, unavailable: 0 },
            participants: [],
          },
        ],
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
          {
            id: "carol-block",
            email: "carol@example.com",
            display_name: "Carol",
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
  await expect(
    page.locator("[data-calendar-settings-dialog]"),
  ).not.toBeVisible();
  await page.locator("[data-open-calendar-settings]").click();
  await expect(page.locator("[data-calendar-settings-dialog]")).toBeVisible();
  await page.locator("[data-holiday-add]").click();
  await page.locator("[data-holiday-search]").fill("US/CA");
  await expect(
    holidayRegions.locator('option[value="US/CA"]'),
  ).not.toHaveAttribute("hidden", "");
  await holidayRegions.selectOption(["JP", "US/CA"]);
  await expect(holidayRegions.locator("option:checked")).toHaveCount(2);

  await page.locator("[data-timezone-toggle]").click();
  await expect(page.locator("[data-timezone-options]")).toBeVisible();
  await page.locator("[data-calendar-timezone]").fill("New_York");
  await page.locator('[data-timezone-value="America/New_York"]').click();
  await expect(page.locator("[data-calendar-timezone]")).toHaveValue(
    "America/New_York",
  );
  await page.locator("[data-calendar-timezone]").fill("Kathmandu");
  await expect(
    page.locator('[data-timezone-value="Asia/Kathmandu"]'),
  ).toContainText("UTC+05:45");
  await page.locator('[data-timezone-value="Asia/Kathmandu"]').click();
  await expect(
    page.locator('[data-timezone-value="Asia/Kathmandu"]'),
  ).toHaveCount(1);
  await page.locator("[data-close-calendar-settings]").click();

  const startCell = page.locator(`[data-calendar-date="${startDate}"]`);
  const daySummary = startCell.getByRole("button", {
    name: /の対応可否。クリックまたは右クリック/,
  });
  await expect(daySummary).toHaveText("○1×2");
  await expect(startCell).not.toContainText("Alice");
  await expect(startCell).not.toContainText("Bob");
  await expect(startCell).not.toContainText("Carol");

  await daySummary.click({ button: "right" });
  const popover = page.locator("[data-availability-popover]");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("参加可能 ○");
  await expect(popover).toContainText("自分");
  await expect(popover).toContainText("参加不可 ×");
  await expect(popover).toContainText("Bob");
  await expect(popover).toContainText("Carol");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await daySummary.click();
  await expect(popover).toBeVisible();
  await page.locator("[data-calendar-title]").click();
  await expect(popover).toBeHidden();

  const eventSummary = startCell
    .locator('[data-calendar-event-id="11111111-1111-4111-8111-111111111111"]')
    .getByRole("button");
  await expect(eventSummary).toHaveText("○1×2");
  await eventSummary.click();
  await expect(popover).toContainText("企画会議の参加状況");
  await expect(popover).toContainText("Carol");
  await page.keyboard.press("Escape");

  const recurringCell = page.locator(`[data-calendar-date="${recurringDate}"]`);
  await expect(
    recurringCell.locator(".calendar-event", { hasText: "同時作業会" }),
  ).toHaveCount(1);

  const eventHeader = await startCell
    .locator("[data-calendar-date-header]")
    .boundingBox();
  const emptyCell = page.locator(`[data-calendar-date="${emptyDate}"]`);
  const emptyHeader = await emptyCell
    .locator("[data-calendar-date-header]")
    .boundingBox();
  const eventCellBox = await startCell.boundingBox();
  const emptyCellBox = await emptyCell.boundingBox();
  expect(eventHeader?.height).toBe(emptyHeader?.height);
  expect((eventHeader?.y ?? 0) - (eventCellBox?.y ?? 0)).toBe(
    (emptyHeader?.y ?? 0) - (emptyCellBox?.y ?? 0),
  );
  const todayButton = page.locator(
    ".calendar-cell--today .calendar-date-select",
  );
  const todayNumber = todayButton.locator(".calendar-day");
  const todayButtonBox = await todayButton.boundingBox();
  const todayNumberBox = await todayNumber.boundingBox();
  expect(
    Math.abs(
      (todayButtonBox?.x ?? 0) +
        (todayButtonBox?.width ?? 0) / 2 -
        ((todayNumberBox?.x ?? 0) + (todayNumberBox?.width ?? 0) / 2),
    ),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      (todayButtonBox?.y ?? 0) +
        (todayButtonBox?.height ?? 0) / 2 -
        ((todayNumberBox?.y ?? 0) + (todayNumberBox?.height ?? 0) / 2),
    ),
  ).toBeLessThan(1);

  await expect(page.getByText("本人だけのメモ")).toHaveCount(1);

  const endCell = page.locator(`[data-calendar-date="${endDate}"]`);
  await startCell.scrollIntoViewIfNeeded();
  await startCell.locator("[data-calendar-select]").click();
  await endCell.locator("[data-calendar-select]").click();
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
    timezone: "Asia/Kathmandu",
  });
  expect(String(savedBlock?.startsAt)).toMatch(/Z$/);
  expect(String(savedBlock?.endsAt)).toMatch(/Z$/);
});
