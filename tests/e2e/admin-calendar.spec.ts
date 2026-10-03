import { expect, test, type Page } from "@playwright/test";

const expectProjectManageLink = async (page: Page, project: string) => {
  await expect(page.locator(".admin-nav")).toHaveAttribute(
    "data-current-slug",
    project,
  );
  const menuToggle = page.locator("[data-admin-menu-toggle]");
  if (
    (await menuToggle.isVisible()) &&
    (await menuToggle.getAttribute("aria-expanded")) !== "true"
  ) {
    await menuToggle.click();
  }
  await expect(
    page.getByRole("link", { name: "管理", exact: true }),
  ).toHaveAttribute("href", `/admin/manage/?project=${project}`);
};

test("管理タブはプロジェクト遷移後も管理トップへ直接遷移する", async ({
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
  await page.route("**/api/admin/portal?**", (route) =>
    route.fulfill({
      json: {
        projects: [
          {
            id: "atlas",
            slug: "atlas",
            name: "学習サイト「アトラス」運営",
            role: "manager",
          },
          {
            id: "secretariat",
            slug: "secretariat",
            name: "Atlasez運営事務局",
            role: "member",
          },
        ],
        todos: [],
        calendar: { events: [] },
      },
    }),
  );

  await page.goto("admin/atlas/");
  await expectProjectManageLink(page, "atlas");

  await page.getByRole("link", { name: "メンバー用サイトへ戻る" }).click();
  await expect(page.locator(".admin-nav-brand-logo")).toHaveAttribute(
    "aria-label",
    "Atlasezメンバー用サイトのトップへ戻る",
  );
  await page
    .locator('[data-project-group="managed"] a[href="/admin/atlas/"]')
    .click();
  await expectProjectManageLink(page, "atlas");
  await page.getByRole("link", { name: "メンバー用サイトへ戻る" }).click();
  await page.getByRole("link", { name: /Atlasez運営事務局/ }).click();
  await expectProjectManageLink(page, "secretariat");
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

test("横断カレンダーは表示月の予定を最後のページまで読み込む", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "manager@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  let requests = 0;
  await page.route("**/api/admin/member-calendar**", async (route) => {
    requests += 1;
    const cursor = new URL(route.request().url()).searchParams.get(
      "eventCursor",
    );
    await route.fulfill({
      json: {
        scope: { email: "manager@example.com", isManager: false },
        projects: [{ id: "atlas", name: "アトラス", role: "member" }],
        events: [
          {
            id: cursor ? "event-next" : "event-first",
            title: cursor ? "追加予定" : "最初の予定",
            starts_at: "2026-09-10T10:00:00.000Z",
            ends_at: null,
            timezone: "Asia/Tokyo",
            participants: [],
            availabilityCounts: { available: 0, maybe: 0, unavailable: 0 },
          },
        ],
        availabilityBlocks: [],
        availabilityRules: [],
        eventPagination: cursor
          ? { limit: 1, nextCursor: null, hasMore: false }
          : { limit: 1, nextCursor: "event-cursor-1", hasMore: true },
      },
    });
  });

  await page.goto("admin/member-calendar/");
  await expect(page.locator("[data-event-list]")).toContainText("最初の予定");
  const loadMore = page.getByRole("button", { name: "さらに予定を読み込む" });
  await expect(page.locator("[data-event-list]")).toContainText("追加予定");
  await expect(loadMore).toBeHidden();
  expect(requests).toBe(2);
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
  let savedRule: Record<string, unknown> | undefined;

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
      request.method() === "POST" &&
      url.pathname.endsWith("/availability-rules")
    ) {
      savedRule = request.postDataJSON() as Record<string, unknown>;
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
        availabilityRules: savedRule
          ? [
              {
                id: "weekday-rule",
                email: "alice@example.com",
                display_name: "Alice",
                weekday: savedRule.weekday,
                timezone: savedRule.timezone,
                label: savedRule.label ?? "",
                kind: savedRule.kind,
                isSelf: true,
              },
            ]
          : [],
      },
    });
  });

  await page.goto("admin/calendar/?project=atlas");
  await expect(page.locator("[data-calendar-date]")).toHaveCount(
    new Date(year, now.getMonth() + 1, 0).getDate(),
  );

  const todayButton = page.locator(
    ".calendar-cell--today .calendar-date-select",
  );
  const todayNumber = todayButton.locator(".calendar-day");
  await expect(todayButton).toBeVisible();
  await expect(todayNumber).toBeVisible();
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

  const weekdayDates = Array.from(
    { length: new Date(year, now.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  )
    .filter((day) => new Date(year, now.getMonth(), day).getDay() === 2)
    .map((day) => `${year}-${month}-${String(day).padStart(2, "0")}`);
  await page.locator('[data-calendar-weekday="2"]').click();
  await expect(page.locator('[data-calendar-weekday="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-calendar-selection-summary]")).toContainText(
    "毎週火曜日の可否を登録します",
  );
  await expect(page.locator(".calendar-cell--selected")).toHaveCount(
    weekdayDates.length,
  );
  await page.locator("[data-block-kind]").selectOption("available");
  await page.locator("[data-create-block]").click();
  await expect.poll(() => savedRule).toBeDefined();
  expect(savedRule).toMatchObject({
    weekday: 2,
    kind: "available",
    timezone: "Asia/Kathmandu",
  });
  await expect(page.locator("[data-block-list]")).toContainText("毎週火曜日");
});

for (const endpoint of ["operations", "member-calendar"]) {
  test(`${endpoint}: 過去の多数の予定に関係なく表示月を取得し、タイムゾーンと月移動で更新する`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
    const requests: URL[] = [];
    const allEvents = [
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `past-${index}`,
        title: `過去予定${index}`,
        starts_at: "2026-01-01T12:00:00Z",
      })),
      {
        id: "month-boundary",
        title: "東京の月初予定",
        starts_at: "2026-09-30T15:00:00Z",
      },
      ...Array.from({ length: 70 }, (_, index) => ({
        id: `october-${index}`,
        title: `今月予定${index}`,
        starts_at: "2026-10-15T12:00:00Z",
      })),
      { id: "november", title: "翌月予定", starts_at: "2026-11-15T12:00:00Z" },
    ];
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== `/api/admin/${endpoint}`) {
        await route.fulfill({
          json: {
            email: "manager@example.com",
            isManager: true,
            notifications: [],
          },
        });
        return;
      }
      requests.push(url);
      const start = Date.parse(url.searchParams.get("start") ?? "");
      const end = Date.parse(url.searchParams.get("end") ?? "");
      const rows = allEvents.filter(
        (event) =>
          Date.parse(event.starts_at) >= start &&
          Date.parse(event.starts_at) < end,
      );
      const offset = Number(url.searchParams.get("eventCursor") ?? "0");
      const next = offset + 50 < rows.length ? String(offset + 50) : null;
      await route.fulfill({
        json: {
          scope: { isManager: true, email: "manager@example.com" },
          project: { id: "secretariat", slug: "secretariat", name: "事務局" },
          projects: [],
          tasks: [],
          members: [],
          progress: [],
          availabilityBlocks: [],
          availabilityRules: [],
          events: rows.slice(offset, offset + 50),
          eventPagination: {
            hasMore: Boolean(next),
            nextCursor: next,
            limit: 50,
          },
        },
      });
    });
    await page.goto(
      endpoint === "operations"
        ? "admin/calendar/?project=secretariat"
        : "admin/member-calendar/",
    );
    // Select Tokyo explicitly so this assertion does not depend on the test runner's timezone.
    await page.locator("[data-open-calendar-settings]").click();
    await page.locator("[data-calendar-timezone]").fill("Asia/Tokyo");
    await page.locator("[data-close-calendar-settings]").click();
    await expect(
      page.locator('[data-calendar-date="2026-10-01"]'),
    ).toContainText("東京の月初予定");
    await expect(page.locator("[data-event-list] .item")).toHaveCount(71);
    await expect(page.locator("[data-event-list]")).not.toContainText(
      "過去予定",
    );
    expect(
      requests.some(
        (url) => url.searchParams.get("start") === "2026-09-30T15:00:00Z",
      ),
    ).toBe(true);
    expect(
      requests.some((url) => url.searchParams.get("eventCursor") === "50"),
    ).toBe(true);
    await page.locator("[data-open-calendar-settings]").click();
    await page.locator("[data-calendar-timezone]").fill("America/New_York");
    await page.locator("[data-close-calendar-settings]").click();
    await expect(page.locator("[data-event-list] .item")).toHaveCount(70);
    await expect(page.locator("[data-event-list]")).not.toContainText(
      "東京の月初予定",
    );
    expect(requests.at(-1)?.searchParams.get("start")).toBe(
      "2026-10-01T04:00:00Z",
    );
    await page.locator("[data-calendar-next]").click();
    await expect(page.locator("[data-event-list]")).toContainText("翌月予定");
    await expect(page.locator("[data-event-list] .item")).toHaveCount(1);
    expect(requests.at(-1)?.searchParams.get("end")).toBe(
      "2026-12-01T05:00:00Z",
    );
  });
}

test("月移動の古い応答を破棄し、次の月の読込失敗を再試行できる", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  let releaseNovember!: () => void;
  const novemberGate = new Promise<void>((resolve) => {
    releaseNovember = resolve;
  });
  let januaryFails = true;
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/member-calendar") {
      await route.fulfill({
        json: {
          email: "manager@example.com",
          isManager: true,
          notifications: [],
        },
      });
      return;
    }
    const start = url.searchParams.get("start")!;
    const month =
      new Date(Date.parse(start) + 24 * 3600 * 1000).getUTCMonth() + 1;
    if (month === 11) await novemberGate;
    if (month === 1 && januaryFails) {
      await route.fulfill({ status: 503, json: { error: "一時停止中" } });
      return;
    }
    await route.fulfill({
      json: {
        scope: { isManager: true },
        events: [
          {
            id: String(month),
            title: `${month}月の予定`,
            starts_at: new Date(
              Date.parse(start) + 10 * 24 * 3600 * 1000,
            ).toISOString(),
          },
        ],
        eventPagination: { nextCursor: null },
      },
    });
  });
  await page.goto("admin/member-calendar/");
  await expect(page.locator("[data-event-list]")).toContainText("10月の予定");
  const novemberRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/admin/member-calendar") &&
      request.url().includes("start="),
  );
  await page.locator("[data-calendar-next]").click();
  await novemberRequest;
  await page.locator("[data-calendar-next]").click();
  await expect(page.locator("[data-event-list]")).toContainText("12月の予定");
  releaseNovember();
  await expect(page.locator("[data-calendar-title]")).toContainText("12月");
  await expect(page.locator("[data-event-list]")).not.toContainText(
    "11月の予定",
  );
  await page.locator("[data-calendar-next]").click();
  await expect(page.locator("[data-event-feedback]")).toContainText(
    "一時停止中",
  );
  await expect(page.locator("[data-event-list]")).not.toContainText(
    "12月の予定",
  );
  januaryFails = false;
  await page.locator("[data-admin-retry]").click();
  await expect(page.locator("[data-event-list]")).toContainText("1月の予定");
  await expect(page.locator("[data-event-feedback]")).toBeEmpty();
});

test("表示月より前に始まる複数日予定は重なる日を表示し、終了日の午前0時を含めない", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      json:
        url.pathname === "/api/admin/member-calendar"
          ? {
              scope: { isManager: false },
              events: [
                {
                  id: "overlap",
                  title: "月をまたぐ予定",
                  starts_at: "2026-09-30T10:00:00Z",
                  ends_at: "2026-10-03T00:00:00Z",
                },
                {
                  id: "point",
                  title: "単発予定",
                  starts_at: "2026-10-02T10:00:00Z",
                  ends_at: null,
                },
              ],
              eventPagination: { nextCursor: null },
            }
          : {
              isManager: true,
              email: "manager@example.com",
              notifications: [],
            },
    });
  });
  await page.goto("admin/member-calendar/");
  await page.locator("[data-open-calendar-settings]").click();
  await page.locator("[data-calendar-timezone]").fill("UTC");
  await page.locator("[data-close-calendar-settings]").click();
  await expect(page.locator('[data-calendar-date="2026-10-01"]')).toContainText(
    "月をまたぐ予定",
  );
  await expect(page.locator('[data-calendar-date="2026-10-02"]')).toContainText(
    "月をまたぐ予定",
  );
  await expect(
    page.locator('[data-calendar-date="2026-10-03"]'),
  ).not.toContainText("月をまたぐ予定");
  await expect(page.locator('[data-calendar-date="2026-10-02"]')).toContainText(
    "単発予定",
  );
  await expect(
    page.locator('[data-calendar-date="2026-10-03"]'),
  ).not.toContainText("単発予定");
});
