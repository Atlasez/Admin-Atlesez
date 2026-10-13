import { expect, test, type Locator, type Page } from "@playwright/test";

function contrast(foreground: number[], background: number[]) {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color: number[]) =>
    0.2126 * channel(color[0]) +
    0.7152 * channel(color[1]) +
    0.0722 * channel(color[2]);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(value: string) {
  const color = value.match(
    /color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)/,
  );
  if (color) {
    return {
      rgb: [1, 2, 3].map((index) => Math.round(Number(color[index]) * 255)),
      alpha: color[4] === undefined ? 1 : Number(color[4]),
    };
  }
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return {
    rgb: channels.slice(0, 3),
    alpha: channels.length > 3 ? channels[3] : 1,
  };
}

async function readCommandPanel(dialog: Locator) {
  const raw = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const filter = [
      style.backdropFilter,
      style.getPropertyValue("-webkit-backdrop-filter"),
    ]
      .filter((value) => value && value !== "none")
      .join(" ");
    const search = element.querySelector(".admin-command-search");
    const action = element.querySelector(".admin-command-action");
    const meta = element.querySelector("small");
    const row = element.querySelector(".admin-command-action-item");
    const list = element.querySelector(".admin-command-list");
    const hint = element.querySelector(".admin-command-hint");
    const inner = element.querySelector(".admin-command-inner");
    return {
      background: style.backgroundColor,
      backdrop: getComputedStyle(element, "::backdrop").backgroundColor,
      filter,
      title: getComputedStyle(element.querySelector("h2")!).color,
      meta: meta ? getComputedStyle(meta).color : "",
      row: row ? getComputedStyle(row).backgroundColor : "",
      list: list ? getComputedStyle(list).backgroundColor : "",
      hint: hint ? getComputedStyle(hint).backgroundColor : "",
      inner: inner ? getComputedStyle(inner).backgroundColor : "",
      search: search ? getComputedStyle(search).backgroundColor : "",
      action: action ? getComputedStyle(action).backgroundColor : "",
    };
  });
  const background = parseColor(raw.background);
  return {
    ...background,
    backdropAlpha: parseColor(raw.backdrop).alpha,
    filter: raw.filter,
    title: parseColor(raw.title).rgb,
    meta: parseColor(raw.meta).rgb,
    row: parseColor(raw.row),
    listAlpha: parseColor(raw.list).alpha,
    hintAlpha: parseColor(raw.hint).alpha,
    innerAlpha: parseColor(raw.inner).alpha,
    searchAlpha: parseColor(raw.search).alpha,
    actionAlpha: parseColor(raw.action).alpha,
  };
}

async function mockShell(
  page: Page,
  includeBulkTasks = false,
  assignedTotal = 1,
  assignedItemsTruncated = false,
) {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "alice@example.com", isManager: true },
      });
      return;
    }
    if (url.pathname === "/api/admin/profile") {
      await route.fulfill({
        json: { profile: { display_name: "Alice", avatar_url: "" } },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications") {
      await route.fulfill({
        json: { notifications: [], unreadNotificationsCount: 0 },
      });
      return;
    }
    if (url.pathname === "/api/admin/action-center") {
      const firstTask = {
        id: "task:task-1",
        kind: "task",
        title: "定義を確認",
        detail: "フィードバックを確認してください。",
        href: "/admin/operations/?project=atlas",
        status: "open",
        priority: "urgent",
        updatedAt: "2026-09-10T00:00:00.000Z",
        dueAt: "2026-09-10T01:00:00.000Z",
        project: "アトラス",
        subject: "数学",
        read: false,
        actions: [
          {
            entityType: "task",
            entityId: "task-1",
            fromState: "open",
            toState: "doing",
            label: "着手",
            expectedUpdatedAt: "2026-09-10T00:00:00.000Z",
          },
        ],
      };
      const bulkTask = {
        ...firstTask,
        id: "task:task-2",
        title: "命題を確認",
        status: "doing",
        priority: "normal",
        updatedAt: "2026-09-10T00:05:00.000Z",
        dueAt: null,
        actions: [
          {
            entityType: "task",
            entityId: "task-2",
            fromState: "doing",
            toState: "done",
            label: "完了",
            expectedUpdatedAt: "2026-09-10T00:05:00.000Z",
          },
        ],
      };
      const notification = {
        id: "notification:n-1",
        kind: "notification",
        title: "新しいコメント",
        detail: "本文へのコメントがあります。",
        href: "/admin/editor/?document=doc-1",
        status: "unread",
        priority: "new",
        updatedAt: "2026-09-10T00:00:00.000Z",
        dueAt: null,
        project: null,
        subject: null,
        read: false,
        notificationIds: ["n-1"],
        actions: [],
      };
      const draftDocument = {
        id: "document:draft-1",
        kind: "document",
        title: "下書き査読依頼は記事から行う",
        detail: "個別記事でフィードバックを依頼してください。",
        href: "/admin/editor/?document=draft-1",
        status: "draft",
        priority: "new",
        updatedAt: "2026-09-10T00:01:00.000Z",
        dueAt: null,
        project: "アトラス",
        subject: "数学",
        read: false,
        actions: [
          {
            entityType: "document",
            entityId: "draft-1",
            fromState: "draft",
            toState: "in-review",
            label: "査読を依頼",
            expectedUpdatedAt: "2026-09-10T00:01:00.000Z",
          },
        ],
      };
      const items = includeBulkTasks
        ? [
            {
              ...bulkTask,
              id: "task:task-1",
              title: "定義を確認",
              actions: [{ ...bulkTask.actions[0], entityId: "task-1" }],
            },
            bulkTask,
            notification,
            draftDocument,
          ]
        : [firstTask, notification, draftDocument];
      await route.fulfill({
        json: {
          generatedAt: "2026-09-10T00:00:00.000Z",
          counts: {
            today: 1,
            dueSoon: 1,
            unread: 1,
            approvals: 0,
            assigned: assignedTotal,
            assignedItemsTruncated,
          },
          items,
          history: [
            {
              id: "task:done-1",
              kind: "task",
              title: "完了タスク",
              detail: "対応済み",
              href: "/admin/operations/?project=atlas",
              status: "done",
              priority: "read",
              updatedAt: "2026-09-09T00:00:00.000Z",
              dueAt: null,
              project: "アトラス",
              subject: null,
              read: true,
              actions: [],
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/workflow/transition") {
      await route.fulfill({
        json: {
          ok: true,
          status: "doing",
          transition: { updatedAt: "2026-09-10T02:00:00.000Z" },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/command-search") {
      await route.fulfill({
        json: {
          results: [
            {
              type: "記事",
              title: "群の定義",
              detail: "数学 ／ draft",
              href: "/admin/editor/?document=doc-1",
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications/read") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });
}

test("アクションセンターで絞り込みと状態変更を操作できる", async ({ page }) => {
  await mockShell(page);
  await page.goto("admin/action-center/");
  await expect(
    page.getByRole("heading", { name: "アクションセンター" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "未対応", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".page-note")).toContainText("要対応");
  page.once("dialog", (dialog) => dialog.accept("未対応の確認"));
  await page.getByRole("button", { name: "表示を保存", exact: true }).click();
  await expect(
    page.locator('[data-action-saved-view] option[value]:not([value=""])'),
  ).toHaveText("未対応の確認");
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(1);
  await expect(page.locator("[data-action-items]")).not.toContainText(
    "下書き査読依頼は記事から行う",
  );
  await expect(page.locator("[data-action-items]")).not.toContainText(
    "新しいコメント",
  );
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-open"),
  ).toHaveText("タスク管理で開く");
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-kind-icon"),
  ).toBeVisible();
  await expect(
    page
      .locator("[data-action-items] .action-item")
      .first()
      .locator(".item-priority-dot"),
  ).toBeVisible();
  const transitionRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      url.pathname === "/api/admin/workflow/transition"
    );
  });
  await page.getByRole("button", { name: "着手" }).click();
  expect((await transitionRequest).postDataJSON()).toMatchObject({
    expectedUpdatedAt: "2026-09-10T00:00:00.000Z",
  });
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(1);
  await page.getByRole("button", { name: "完了・履歴" }).click();
  await expect(page.locator("[data-action-items]")).toContainText("完了タスク");
});

test("担当項目が表示上限を超えた場合は全件数と一覧への導線を示す", async ({
  page,
}) => {
  await mockShell(page, false, 51, true);
  await page.goto("admin/action-center/");
  const notice = page.locator("[data-action-truncation]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    "全51件のうち、この画面には1件を表示しています。",
  );
  await expect(
    notice.getByRole("link", { name: "タスク管理" }),
  ).toHaveAttribute("href", "/admin/member-tasks/");
  await expect(notice.getByRole("link", { name: "記事一覧" })).toHaveAttribute(
    "href",
    "/admin/editor/",
  );
});

test("⌘Kで横断検索を開き、記事候補へ移動できる", async ({ page }) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  await expect(
    page.getByRole("link", { name: "アクションセンター" }),
  ).toHaveAttribute("href", "/admin/action-center/");
  const commandButton = page.getByRole("button", {
    name: "操作を検索（⌘K）",
  });
  await expect(commandButton).toBeVisible();
  await expect(commandButton.locator("svg")).toHaveAttribute(
    "viewBox",
    "0 0 24 24",
  );
  await expect(commandButton.locator("kbd")).toHaveCount(0);
  await expect(commandButton).toHaveCSS("border-top-width", "0px");
  await page.evaluate(() => {
    localStorage.setItem(
      "atlasez-command-history",
      JSON.stringify([
        {
          label: "編集・フィードバック",
          detail: "記事とフィードバック",
          href: "/admin/articles/",
          count: 2,
          lastUsed: Date.now(),
        },
      ]),
    );
  });
  await page.keyboard.press("Meta+K");
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-command-mode", "command");
  const searchPanel = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      filter: `${style.backdropFilter} ${style.getPropertyValue("-webkit-backdrop-filter")}`,
    };
  });
  expect(searchPanel.background).toBe("rgb(245, 247, 248)");
  expect(searchPanel.filter).not.toContain("saturate");
  const searchBackdrop = parseColor(
    await dialog.evaluate(
      (element) => getComputedStyle(element, "::backdrop").backgroundColor,
    ),
  );
  expect(searchBackdrop.alpha).toBeGreaterThan(0.5);
  const dialogSize = await dialog.evaluate((element) => ({
    width: Number.parseFloat(getComputedStyle(element).width),
    maxHeight: Number.parseFloat(getComputedStyle(element).maxHeight),
    rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));
  expect(dialogSize.width).toBeGreaterThan(30 * dialogSize.rem);
  expect(dialogSize.width).toBeLessThan(39 * dialogSize.rem);
  expect(dialogSize.maxHeight).toBeLessThanOrEqual(34 * dialogSize.rem);
  await expect(
    dialog.getByRole("heading", { name: "最近使った操作" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "クイック操作" }),
  ).toBeVisible();
  await expect(dialog.getByRole("option", { name: /要対応/ })).toContainText(
    "確認・実行が必要な項目",
  );
  await expect(
    dialog.getByRole("option", { name: /編集・フィードバック/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("option", { name: /編集・フィードバック/ }),
  ).toContainText("記事とフィードバック・2回");
  await page.locator("[data-admin-command-input]").fill("群の");
  await expect(dialog.getByRole("heading", { name: "検索結果" })).toBeVisible();
  await expect(dialog).toContainText("群の定義");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/editor\/\?document=doc-1/);
});

test("ヘッダーのアクションセンターはページ遷移せずポップアップで対応項目を開く", async ({
  page,
}) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  const actionCenterTab = page.getByRole("link", {
    name: "アクションセンター",
  });
  await expect(actionCenterTab).toHaveAttribute(
    "href",
    "/admin/action-center/",
  );
  await actionCenterTab.click();
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "要対応" })).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "対応が必要な項目" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("option", { name: /定義を確認/ }),
  ).toContainText("タスク");
  await expect(page).toHaveURL(/\/admin\/articles\//);
  await expect(dialog).toHaveAttribute("data-command-mode", "action");
  const glass = await readCommandPanel(dialog);
  expect(glass.alpha).toBeGreaterThanOrEqual(0.55);
  expect(glass.alpha).toBeLessThanOrEqual(0.65);
  expect(glass.backdropAlpha).toBeGreaterThanOrEqual(0.08);
  expect(glass.backdropAlpha).toBeLessThanOrEqual(0.14);
  expect(glass.listAlpha).toBe(0);
  expect(glass.hintAlpha).toBe(0);
  expect(glass.innerAlpha).toBe(0);
  expect(glass.row.alpha).toBeGreaterThan(0.35);
  expect(glass.row.alpha).toBeLessThan(0.95);
  expect(glass.filter).toContain("blur");
  expect(glass.filter).toContain("saturate");
  expect(glass.searchAlpha).toBe(1);
  expect(glass.actionAlpha).toBe(1);
  const behind = [255, 255, 255].map(
    (channel) => channel * (1 - glass.backdropAlpha),
  );
  const panel = glass.rgb.map(
    (channel, index) =>
      channel * glass.alpha + behind[index] * (1 - glass.alpha),
  );
  const row = glass.row.rgb.map(
    (channel, index) =>
      channel * glass.row.alpha + panel[index] * (1 - glass.row.alpha),
  );
  expect(contrast(glass.title, panel)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(glass.meta, row)).toBeGreaterThanOrEqual(4.5);
});

test("要対応ポップアップは透過を減らす設定で不透明に戻る", async ({ page }) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  await page.getByRole("link", { name: "アクションセンター" }).click();
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toHaveAttribute("data-command-mode", "action");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const style = getComputedStyle(element);
        const filter = `${style.backdropFilter} ${style.getPropertyValue("-webkit-backdrop-filter")}`;
        return (
          style.backgroundColor === "rgb(245, 247, 248)" &&
          !filter.includes("blur") &&
          !filter.includes("saturate")
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+K");
  await expect(dialog).toHaveAttribute("data-command-mode", "command");
  await expect(
    dialog.getByRole("heading", { name: "操作を検索" }),
  ).toBeVisible();
});

test("表示設定のスライダーで要対応の透け感を広く調整し、保存・復元できる", async ({
  page,
}) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  const menu = page.locator("[data-settings-menu]");
  const glassSetting = menu.locator("fieldset", { hasText: "要対応の透け感" });
  await menu.locator("> summary").click();
  const slider = glassSetting.getByRole("slider", { name: "要対応の透け感" });
  const value = glassSetting.locator("[data-glass-value]");
  await expect(slider).toHaveValue("60");
  await expect(value).toHaveText("40%");

  // Strongest: 100% see-through (0% panel opacity).
  await slider.focus();
  await slider.press("Home");
  await expect(value).toHaveText("100%");
  await expect(slider).toHaveAttribute("aria-valuetext", "要対応の透け感 100%");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--command-glass-opacity")
          .trim(),
      ),
    )
    .toBe("0%");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("atlasez-prefs") ?? "{}").glass,
    ),
  ).toBe("0%");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "アクションセンター" }).click();
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toHaveAttribute("data-command-mode", "action");
  const strong = await readCommandPanel(dialog);
  expect(strong.alpha).toBe(0);
  expect(strong.backdropAlpha).toBe(0);
  await page.keyboard.press("Escape");

  await page.reload();
  await menu.locator("> summary").click();
  await expect(slider).toHaveValue("0");
  await expect(value).toHaveText("100%");

  // Weakest: opaque panel.
  await slider.focus();
  await slider.press("End");
  await expect(value).toHaveText("0%");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "アクションセンター" }).click();
  const solid = await readCommandPanel(dialog);
  expect(solid.alpha).toBe(1);
  await page.keyboard.press("Escape");

  await menu.locator("> summary").click();
  await menu.locator("[data-a11y-reset]").click();
  await expect(slider).toHaveValue("60");
  await expect(value).toHaveText("40%");
  const resetGlass = await page.evaluate(
    () => JSON.parse(localStorage.getItem("atlasez-prefs") ?? "{}").glass,
  );
  expect(resetGlass).toBeUndefined();
  await page.reload();
  await page.getByRole("link", { name: "アクションセンター" }).click();
  const standard = await readCommandPanel(dialog);
  expect(standard.alpha).toBeGreaterThanOrEqual(0.55);
  expect(standard.alpha).toBeLessThanOrEqual(0.65);
});

test("ポップアップ内のスライダーで背景・ぼかし・暗幕・項目の透け感が即座に変わる", async ({
  page,
}) => {
  await mockShell(page);
  await page.goto("admin/portal/");
  await page.getByRole("link", { name: "アクションセンター" }).click();
  const dialog = page.locator("[data-admin-command-dialog]");
  await expect(dialog).toHaveAttribute("data-command-mode", "action");
  const slider = dialog.getByRole("slider", { name: "背景の透け感" });
  await expect(slider).toHaveValue("40");
  await expect(dialog.locator("[data-admin-command-glass-output]")).toHaveText(
    "40%",
  );
  const initial = await readCommandPanel(dialog);
  expect(initial.alpha).toBeGreaterThan(0.55);

  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  await expect(dialog.locator("[data-admin-command-glass-output]")).toHaveText(
    "100%",
  );
  await expect(slider).toHaveAttribute("aria-valuetext", "背景の透け感 100%");
  const transparent = await readCommandPanel(dialog);
  expect(transparent.alpha).toBe(0);
  expect(transparent.backdropAlpha).toBe(0);
  expect(transparent.row.alpha).toBe(0);
  expect(transparent.filter).not.toContain("blur");
  const savedOpacity = await page.evaluate(
    () => JSON.parse(localStorage.getItem("atlasez-prefs") ?? "{}").glass,
  );
  expect(savedOpacity).toBe("0%");

  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("link", { name: "アクションセンター" }).click();
  await expect(slider).toHaveValue("100");
  const restored = await readCommandPanel(dialog);
  expect(restored.alpha).toBe(0);

  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  const opaque = await readCommandPanel(dialog);
  expect(opaque.alpha).toBe(1);
  expect(opaque.backdropAlpha).toBeGreaterThan(0.16);
  await page.keyboard.press("Escape");
  await page.locator("[data-settings-menu] > summary").click();
  await expect(
    page.getByRole("slider", { name: "要対応の透け感" }),
  ).toHaveValue("100");
});

test("以前の3段階の透過設定をスライダーでも復元できる", async ({ page }) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  await page.evaluate(() =>
    localStorage.setItem("atlasez-prefs", JSON.stringify({ glass: "40%" })),
  );
  await page.reload();
  const menu = page.locator("[data-settings-menu]");
  await menu.locator("> summary").click();
  await expect(
    menu.getByRole("slider", { name: "要対応の透け感" }),
  ).toHaveValue("40");
  await expect(menu.locator("[data-glass-value]")).toHaveText("60%");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--command-glass-opacity")
          .trim(),
      ),
    )
    .toBe("40%");
});

test("要対応ポップアップから状態変更を実行し、通知を混在させない", async ({
  page,
}) => {
  await mockShell(page);
  await page.goto("admin/articles/");
  const dialog = page.locator("[data-admin-command-dialog]");
  await page.getByRole("link", { name: "アクションセンター" }).click();
  await expect(dialog.getByRole("button", { name: "着手" })).toBeVisible();
  const transitionRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      url.pathname === "/api/admin/workflow/transition"
    );
  });
  await dialog.getByRole("button", { name: "着手" }).click();
  expect((await transitionRequest).postDataJSON()).toMatchObject({
    entityType: "task",
    entityId: "task-1",
    fromState: "open",
    toState: "doing",
  });
  await expect(dialog).not.toContainText("新しいコメント");
  await expect(dialog.getByRole("button", { name: "既読にする" })).toHaveCount(
    0,
  );
});

test("アクションセンターをタブで開いた履歴を別画面の操作検索から再利用できる", async ({
  page,
}) => {
  await mockShell(page);
  await page.goto("admin/action-center/");
  await page.goto("admin/atlas/");
  await page.keyboard.press("Meta+K");

  const dialog = page.locator("[data-admin-command-dialog]");
  const recentSection = dialog.locator(".admin-command-section").filter({
    has: page.getByRole("heading", { name: "最近使った操作" }),
  });
  await expect(
    recentSection.getByRole("option", { name: /要対応/ }),
  ).toContainText("確認・実行が必要な項目・1回");
  await recentSection.getByRole("option", { name: /要対応/ }).click();
  await expect(page).toHaveURL(/\/admin\/atlas\//);
  await expect(page.locator("[data-admin-command-dialog]")).toBeVisible();
  await expect(
    page
      .locator("[data-admin-command-dialog]")
      .getByRole("heading", { name: "要対応" }),
  ).toBeVisible();
});

test("選択したタスクを一括完了し、直後に元へ戻せる", async ({ page }) => {
  const transitionBodies: Array<Record<string, unknown>> = [];
  await mockShell(page, true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.pathname === "/api/admin/workflow/transition"
    )
      transitionBodies.push(request.postDataJSON() as Record<string, unknown>);
  });
  await page.goto("admin/action-center/");
  await expect(page.locator("[data-action-items] .action-item")).toHaveCount(2);
  await page.locator('[data-action-select="task:task-1"]').check();
  await page.locator('[data-action-select="task:task-2"]').check();
  await expect(page.locator("[data-action-bulkbar]")).toBeVisible();
  await page
    .locator("[data-action-bulk-action]")
    .selectOption({ label: "完了（2件）" });
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.locator("[data-action-undo]")).toContainText(
    "2件を完了にしました。",
  );
  await expect.poll(() => transitionBodies.length).toBe(2);
  expect(
    transitionBodies.filter((body) => body.toState === "done"),
  ).toHaveLength(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.locator("[data-action-undo]")).toBeHidden();
  await expect.poll(() => transitionBodies.length).toBe(4);
  expect(
    transitionBodies.filter(
      (body) => body.fromState === "done" && body.toState === "open",
    ),
  ).toHaveLength(2);
});

test("375px幅の個別選択チェックボックスに24px以上の操作領域がある", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockShell(page, true);
  await page.goto("admin/action-center/");

  const checkboxes = page.locator("[data-action-items] [data-action-select]");
  await expect(checkboxes).toHaveCount(2);
  for (const checkbox of await checkboxes.all()) {
    const bounds = await checkbox.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(24);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test.describe("要対応一覧の期限タイムゾーン", () => {
  test.use({ timezoneId: "America/New_York" });

  test("閲覧者のタイムゾーンを送信し締切の現地時刻を保って表示する", async ({
    page,
  }) => {
    await mockShell(page);
    const zones: string[] = [];
    await page.route("**/api/admin/action-center*", async (route) => {
      zones.push(
        new URL(route.request().url()).searchParams.get("timezone") ?? "",
      );
      await route.fulfill({
        json: {
          counts: { today: 1, dueSoon: 0, approvals: 0 },
          items: [
            {
              id: "task:zone",
              kind: "task",
              title: "Tokyo締切",
              detail: "",
              href: "/admin/task-detail/?task=zone",
              status: "open",
              priority: "urgent",
              updatedAt: "2026-10-03T09:00:00Z",
              dueAt: "2026-10-03T18:00",
              dueTimezone: "Asia/Tokyo",
              project: "アトラス",
              subject: null,
              read: false,
              actions: [
                {
                  entityType: "task",
                  entityId: "zone",
                  fromState: "open",
                  toState: "doing",
                  label: "着手",
                },
              ],
            },
          ],
        },
      });
    });
    await page.goto("admin/action-center/");
    await expect(page.locator(".item-due")).toHaveText(
      "期限 2026-10-03 18:00 (Asia/Tokyo)",
    );
    expect(zones).toEqual(["America/New_York"]);
  });
});
