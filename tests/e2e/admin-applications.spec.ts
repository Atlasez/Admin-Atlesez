import { expect, test } from "@playwright/test";

for (const width of [1440, 800, 390]) {
  test(`応募管理は最新の応募者から開き、前へ・次へを隣接表示する（${width}px）`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let newestId = "latest";
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        json:
          url.pathname === "/api/admin/applications"
            ? {
                applications: [
                  {
                    id: "old",
                    family_name: "山田",
                    given_name: "太郎",
                    status: "new",
                    created_at: "2026-09-01T09:00:00Z",
                  },
                  {
                    id: newestId,
                    family_name: "佐藤",
                    given_name: "花子",
                    status: "accepted",
                    created_at: "2026-09-04T09:00:00Z",
                  },
                  {
                    id: "middle",
                    family_name: "鈴木",
                    given_name: "次郎",
                    status: "reviewing",
                    created_at: "2026-09-03T09:00:00Z",
                  },
                  {
                    id: "undated",
                    family_name: "日時",
                    given_name: "未登録",
                    status: "new",
                  },
                ],
              }
            : {},
      });
    });
    await page.goto("./admin/applications/?project=atlas");
    const select = page.locator("[data-application-select]");
    const previous = page.getByRole("button", { name: "前の応募者" });
    const next = page.getByRole("button", { name: "次の応募者" });
    await expect(select).toHaveValue("latest");
    await expect(page.locator(".application-list h2")).toHaveText("佐藤 花子");
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await page.locator("[data-application-navigator]").scrollIntoViewIfNeeded();
    const left = (await previous.boundingBox())!;
    const right = (await next.boundingBox())!;
    expect(Math.abs(left.y - right.y)).toBeLessThan(2);
    expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(0);
    expect(right.x - (left.x + left.width)).toBeLessThanOrEqual(12);
    const picker = (await page.locator(".application-picker").boundingBox())!;
    const position = (await page
      .locator("[data-application-position]")
      .boundingBox())!;
    expect(
      position.x >= picker.x + picker.width ||
        position.y >= picker.y + picker.height,
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("applications-latest.png"),
    });
    await next.click();
    await expect(select).toHaveValue("middle");
    await previous.click();
    await expect(select).toHaveValue("latest");
    await select.selectOption("old");
    newestId = "new-arrival";
    await page.reload();
    await expect(select).toHaveValue("new-arrival");
    await page.locator("[data-filter-status]").selectOption("new");
    await expect(select).toHaveValue("old");
    await page.locator("[data-clear-filter]").click();
    await expect(select).toHaveValue("new-arrival");
  });
}

test("B-1: 応募フロー・状況集計・検索と状態フィルターを表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/applications")
      expect(url.searchParams.get("project")).toBe("atlas");
    const payload =
      url.pathname === "/api/admin/applications"
        ? {
            project: { slug: "atlas", name: "学習サイト「アトラス」" },
            subjectLabels: { mathematics: "数学", physics: "物理" },
            applications: [
              {
                id: "application-1",
                form_language: "ja",
                family_name: "山田",
                given_name: "太郎",
                email: "taro@example.com",
                affiliation_type: "大学",
                institution: "東京大学",
                grade: "学部1年",
                country: "JP",
                timezone: "Asia/Tokyo",
                desired_subjects: "mathematics",
                article_ideas: "群論",
                interests: "数学",
                message: "参加希望",
                project_slug: "atlas",
                status: "new",
                provisioning_status: "not_started",
              },
              {
                id: "application-2",
                form_language: "ja",
                family_name: "佐藤",
                given_name: "花子",
                email: "hanako@example.com",
                affiliation_type: "高校",
                institution: "Atlasez高校",
                grade: "高校2年",
                country: "JP",
                timezone: "Asia/Tokyo",
                desired_subjects: "physics",
                article_ideas: "力学",
                interests: "物理",
                message: "参加希望",
                project_slug: "atlas",
                status: "reviewing",
                provisioning_status: "pending",
              },
            ],
          }
        : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto("./admin/applications/?project=atlas");
  await expect(
    page.getByRole("heading", { name: "学習サイト「アトラス」：応募管理" }),
  ).toBeVisible();
  await expect(page.locator(".project-switcher")).toHaveCount(0);
  await expect(page.locator(".flow-steps > li")).toHaveCount(4);
  await expect(page.locator("[data-total-count]")).toHaveText("2件");
  await expect(page.locator("[data-summary-new]")).toHaveText("1");
  await expect(page.locator("[data-summary-reviewing]")).toHaveText("1");

  await page.locator("[data-search]").fill("東京大学");
  await expect(page.locator(".application-list .app")).toHaveCount(1);
  await expect(page.locator(".application-list")).toContainText("山田 太郎");

  await page.locator("[data-clear-filter]").click();
  await page.locator("[data-filter-status]").selectOption("reviewing");
  await expect(page.locator(".application-list .app")).toHaveCount(1);
  await expect(page.locator(".application-list")).toContainText("佐藤 花子");
});

test("応募管理の導線は現在のプロジェクトに引き継がれる", async ({ page }) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: { email: "manager@example.com", isManager: true },
    }),
  );
  await page.goto("./admin/manage/?project=seminar-platform");
  await expect(page.locator("main header p")).toHaveText(
    "ゼミプラットフォーム",
  );
  await expect(
    page.locator('a[data-manager-only][href*="permissions"]'),
  ).toBeVisible();
  await expect(
    page.locator('a[data-manager-only][href*="permissions"] strong'),
  ).toHaveText("権限管理");
  await expect(
    page.locator('a[data-manager-only][href*="permissions"]'),
  ).toHaveAttribute("href", "/admin/permissions/?project=seminar-platform");
  await expect(
    page.locator('a[data-project-manager-only][href*="applications"]'),
  ).toHaveAttribute("href", "/admin/applications/?project=seminar-platform");
});

test("OAuth連携済みの受入応募はDiscord同期を再試行できる", async ({ page }) => {
  let provisioningStatus = "failed";
  let retryCalled = false;
  await page.route("**/api/admin/applications/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/discord-retry")) {
      retryCalled = route.request().method() === "POST";
      provisioningStatus = "synced";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provisioning: { status: "synced", warnings: [] },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/admin/applications?project=atlas", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: { slug: "atlas", name: "学習サイト「アトラス」" },
        subjectLabels: { mathematics: "数学" },
        formLabels: { atlas: "学習サイト「アトラス」" },
        applications: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            form_language: "ja",
            family_name: "山田",
            given_name: "太郎",
            email: "taro@example.com",
            affiliation_type: "大学",
            institution: "東京大学",
            grade: "B1",
            country: "JP",
            timezone: "Asia/Tokyo",
            desired_subjects: "mathematics",
            project_slug: "atlas",
            status: "accepted",
            provisioning_status: provisioningStatus,
            provisioning_attempt_count: 1,
            provisioning_next_attempt_at: "2026-08-29T12:00:00.000Z",
            discord_oauth_connected_at: "2026-08-29T11:00:00.000Z",
            verified_discord_user_id: "123456789012345678",
          },
        ],
      }),
    });
  });

  await page.goto("./admin/applications/?project=atlas");
  await expect(page.locator(".application-list")).toContainText(
    "OAuth同意済み・連携済み",
  );
  await expect(page.locator("[data-retry]")).toBeVisible();
  await page.locator("[data-retry]").click();
  await expect.poll(() => retryCalled).toBe(true);
  await expect(page.locator(".application-list")).toContainText(
    "Discord同期済み",
  );
});

test("面談の入力は追加読込・応募者切替・検索・受入取消でも保持される", async ({
  page,
}) => {
  let releasePage!: () => void;
  const pageReady = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
  const newest = {
    id: "newest-draft",
    family_name: "入力中",
    given_name: "応募者",
    created_at: "2026-09-05T09:00:00Z",
    status: "new",
    interview: { mode: "in_person", location: "保存済み会場" },
  };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/applications") {
      await route.fulfill({ json: {} });
      return;
    }
    if (url.searchParams.has("cursor")) {
      await pageReady;
      await route.fulfill({
        json: {
          applications: [
            {
              id: "older-draft",
              family_name: "別の",
              given_name: "応募者",
              status: "new",
              created_at: "2026-09-01T09:00:00Z",
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        },
      });
    } else
      await route.fulfill({
        json: {
          applications: [newest],
          pagination: { hasMore: true, nextCursor: "page-two" },
        },
      });
  });
  await page.goto("admin/applications/?project=atlas");
  const location = page.locator('[data-interview-location="newest-draft"]');
  const date = page.locator('[data-interview-date="newest-draft"]');
  await location.fill("未保存の会場");
  await date.fill("2026-10-06T15:30");
  await location.focus();
  releasePage();
  await expect(page.locator("[data-application-select] option")).toHaveCount(2);
  await expect(location).toHaveValue("未保存の会場");
  await expect(date).toHaveValue("2026-10-06T15:30");
  await expect(location).toBeFocused();
  await page.locator("[data-application-select]").selectOption("older-draft");
  await page.locator("[data-application-select]").selectOption("newest-draft");
  await expect(location).toHaveValue("未保存の会場");
  await page.locator("[data-search]").fill("存在しない氏名");
  await expect(page.locator(".application-list")).toContainText(
    "条件に一致する応募はありません",
  );
  await page.locator("[data-clear-filter]").click();
  await expect(location).toHaveValue("未保存の会場");
  await page.locator('[data-id="newest-draft"]').selectOption("accepted");
  await page.locator("[data-accept-cancel]").click();
  await expect(location).toHaveValue("未保存の会場");
  await expect(
    page.locator('[data-interview-draft-state="newest-draft"]'),
  ).toContainText("未保存");
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored).not.toContain("未保存の会場");
});

test("面談保存の失敗は入力を保持し、保存後の通知失敗は保存済みと表示する", async ({
  page,
}) => {
  let failSave = true;
  const application = {
    id: "save-draft",
    family_name: "面談",
    given_name: "応募者",
    status: "new",
    interview: {
      mode: "in_person",
      location: "以前の会場",
      scheduledAt: "2026-10-06T06:30:00Z",
    },
  };
  let savedLocation = "";
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/interview/notify")) {
      await route.fulfill({
        status: 503,
        json: { error: "通知を送れませんでした。" },
      });
      return;
    }
    if (
      url.pathname.endsWith("/interview") &&
      route.request().method() === "PUT"
    ) {
      if (failSave) {
        await route.fulfill({
          status: 500,
          json: { error: "保存に失敗しました。" },
        });
        return;
      }
      const values = route.request().postDataJSON();
      application.interview = values;
      savedLocation = values.location;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json:
        url.pathname === "/api/admin/applications"
          ? { applications: [application] }
          : {},
    });
  });
  await page.goto("admin/applications/?project=atlas");
  const location = page.locator('[data-interview-location="save-draft"]');
  await location.fill("新しい会場");
  await page.locator('[data-interview-save="save-draft"]').click();
  await expect(page.locator("[data-notice]")).toContainText("保存に失敗");
  await expect(location).toHaveValue("新しい会場");
  await expect(page.locator("[data-interview-draft-state]")).toContainText(
    "未保存",
  );
  failSave = false;
  await page.locator('[data-interview-notify="save-draft"]').click();
  await expect(page.locator("[data-notice]")).toContainText(
    "面談情報は保存済みです。通知を送れませんでした。",
  );
  expect(savedLocation).toBe("新しい会場");
  await expect(page.locator("[data-interview-draft-state]")).toContainText(
    "保存済み",
  );
  await page.locator("[data-search]").fill("別の応募者");
  await page.locator("[data-clear-filter]").click();
  await expect(location).toHaveValue("新しい会場");
  await location.fill("さらに変更した会場");
  await page.locator('[data-interview-save="save-draft"]').click();
  await expect(page.locator("[data-notice]")).toHaveText(
    "面談情報を保存しました。",
  );
  await expect(page.locator("[data-interview-draft-state]")).toContainText(
    "保存済み",
  );
  await expect(location).toHaveValue("さらに変更した会場");
});

test("面談保存中は再描画や応募者切替後も入力をロックする", async ({ page }) => {
  let releaseSave!: () => void;
  const saveReady = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const first = {
    id: "pending-draft",
    family_name: "保存中",
    given_name: "応募者",
    status: "new",
    created_at: "2026-09-05T09:00:00Z",
    interview: { mode: "in_person", location: "元の会場" },
  };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.endsWith("/interview") &&
      route.request().method() === "PUT"
    ) {
      const values = route.request().postDataJSON();
      await saveReady;
      first.interview = values;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json:
        url.pathname === "/api/admin/applications"
          ? {
              applications: [
                first,
                {
                  id: "other-draft",
                  family_name: "別の",
                  given_name: "応募者",
                  status: "new",
                  created_at: "2026-09-01T09:00:00Z",
                },
              ],
            }
          : {},
    });
  });
  await page.goto("admin/applications/?project=atlas");
  const location = page.locator('[data-interview-location="pending-draft"]');
  await location.fill("保存する会場");
  const putStarted = page.waitForRequest(
    (request) =>
      request.method() === "PUT" && request.url().includes("/interview?"),
  );
  await page.locator('[data-interview-save="pending-draft"]').click();
  await putStarted;
  await expect(location).toBeDisabled();
  await expect(
    page.locator('[data-interview-format="pending-draft"]'),
  ).toBeDisabled();
  await page.locator("[data-application-select]").selectOption("other-draft");
  await page.locator("[data-application-select]").selectOption("pending-draft");
  await expect(location).toHaveValue("保存する会場");
  await expect(location).toBeDisabled();
  await expect(
    page.locator('[data-interview-notify="pending-draft"]'),
  ).toBeDisabled();
  releaseSave();
  await expect(location).toBeEnabled();
  await expect(location).toHaveValue("保存する会場");
  await expect(
    page.locator('[data-interview-draft-state="pending-draft"]'),
  ).toContainText("保存済み");
});
