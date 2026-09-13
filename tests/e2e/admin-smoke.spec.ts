import { expect, test, type Page } from "@playwright/test";

const mockAdminApis = async (page: Page) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const payload = (() => {
      switch (url.pathname) {
        case "/api/admin/auth-status":
          return { email: "smoke@example.com", isManager: true };
        case "/api/admin/profile":
          return { profile: { display_name: "スモーク確認" } };
        case "/api/admin/notifications":
          return { notifications: [] };
        case "/api/admin/portal":
          return {
            projects: [],
            availableProjects: [],
            todos: [],
            pendingApprovals: 0,
            calendar: { events: [] },
          };
        case "/api/admin/genre-overviews":
          return {
            members: [],
            overviews: [],
            editableSubjects: [],
            canEditAll: true,
          };
        case "/api/admin/genre-role-catalog":
          return { catalog: [], assignments: [] };
        case "/api/admin/member-tasks":
          return {
            scope: { email: "smoke@example.com" },
            projects: [],
            members: [],
            tasks: [],
          };
        case "/api/admin/operations":
          return { events: [] };
        case "/api/admin/progress":
          return { progress: [] };
        case "/api/admin/member-procedures":
          return { requests: [] };
        case "/api/admin/applications":
          return {
            applications: [],
            pagination: { hasMore: false, nextCursor: null },
            summary: {
              total: 0,
              new: 0,
              reviewing: 0,
              accepted: 0,
              rejected: 0,
            },
          };
        case "/api/admin/editor/documents":
          return {
            documents: [],
            pagination: { hasMore: false, nextCursor: null },
            scope: { email: "smoke@example.com", subjects: [] },
          };
        case "/api/admin/editor/catalog":
          return { catalog: [] };
        case "/api/admin/profile-change-requests":
          return { requests: [] };
        case "/api/admin/report-admin-permissions":
          return { permissions: [] };
        default:
          return {};
      }
    })();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
};

const pages = [
  ["ポータル", "admin/portal/", "Atlasezメンバー用サイト"],
  ["記事一覧", "admin/articles/", "編集・フィードバック"],
  ["ジャンル概要", "admin/genres/", "各ジャンル概要"],
  ["ジャンル管理", "admin/genre-roles/", "ジャンル管理"],
  ["役割管理", "admin/roles/", "役割管理"],
  ["タスク管理", "admin/member-tasks/", "タスク管理"],
  ["同時作業会", "admin/co-working/", "同時作業会"],
  ["諸手続き", "admin/procedures/", "諸手続き"],
  ["応募管理", "admin/applications/", "応募管理"],
  [
    "面談メモ",
    "admin/application-interview/?application=smoke&project=atlas",
    "面談メモ",
  ],
  ["問題報告", "admin/reports/", "問題報告"],
  ["運営メンバー管理", "admin/member-management/", "運営メンバー管理"],
  ["運営メンバー統計", "admin/operations-statistics/", "運営メンバー統計"],
  ["メンバー情報の承認", "admin/profile-requests/", "メンバー情報の承認"],
  [
    "プロジェクトマイページ",
    "admin/workspace/?project=secretariat",
    "マイページ",
  ],
  ["記事編集", "admin/editor/", "記事編集ワークスペース"],
  ["学習サイトの目次", "admin/editor/outline/", "学習サイトの目次"],
  ["作業の進め方", "admin/guide/", "作業の進め方"],
] as const;

for (const [label, path, heading] of pages) {
  test(`管理画面スモーク: ${label}`, async ({ page }) => {
    await mockAdminApis(page);
    const response = await page.goto(path);
    expect(response?.status(), `${path} のHTML応答`).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  });
}

test("記事編集の未選択案内が横方向に崩れない", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto("admin/editor/");
  const layout = await page.locator("[data-editor-empty]").evaluate((empty) => {
    const sourcePicker = empty.querySelector<HTMLElement>(".source-picker");
    const style = getComputedStyle(empty);
    return {
      flexDirection: style.flexDirection,
      emptyWidth: empty.getBoundingClientRect().width,
      sourceWidth: sourcePicker?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(layout.flexDirection).toBe("column");
  expect(layout.sourceWidth).toBeLessThanOrEqual(layout.emptyWidth);
});

test("目次画面に構成・保存・公開の利用説明を表示する", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto("admin/editor/outline/");
  await expect(
    page.getByRole("heading", {
      name: "学習サイトに表示する「分野 → カテゴリ → 記事」の構成を管理します",
    }),
  ).toBeVisible();
  await expect(page.locator(".outline-guide-steps li")).toHaveCount(3);
  await expect(page.getByText("並び順を保存", { exact: true })).toBeVisible();
  await expect(
    page.getByText("承認された構成が学習サイトへ反映されます。", {
      exact: false,
    }),
  ).toBeVisible();
});

test("ジャンル管理は読み込み完了後に左上のloadingを残さない", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.goto("admin/genre-roles/?project=atlas&view=genres");
  const root = page.locator("[data-genre-roles]");
  await expect(root).toHaveAttribute("aria-busy", "false");
  await expect(root).toHaveAttribute("data-admin-load-state", "ready");
  await expect(
    page.locator(
      "[data-content] .loading, [data-custom-content] .loading, [data-taxonomy-content] .loading",
    ),
  ).toHaveCount(0);
});

test("ジャンル管理の読み込み失敗時に全ての領域が停止表示へ切り替わる", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === "/api/admin/genre-overviews" ||
      path === "/api/admin/genre-role-catalog" ||
      path === "/api/admin/editor/taxonomy"
    ) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "監査用の一時エラー" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.goto("admin/genre-roles/?project=atlas&view=genres");
  await expect(page.locator("[data-admin-load-error]")).toBeVisible();
  await expect(page.locator("[data-content]")).toContainText(
    "監査用の一時エラー",
  );
  await expect(page.locator("[data-custom-content]")).toContainText(
    "監査用の一時エラー",
  );
  await expect(page.locator("[data-taxonomy-content]")).toContainText(
    "監査用の一時エラー",
  );
  await expect(
    page.locator(
      "[data-content] .loading, [data-custom-content] .loading, [data-taxonomy-content] .loading",
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      "[data-content] .error-state, [data-custom-content] .error-state, [data-taxonomy-content] .error-state",
    ),
  ).toHaveCount(3);
  await expect(page.getByText("読み込み中…", { exact: true })).toHaveCount(0);
});

test("記事編集の未選択案内は作成済み記事と矛盾しない", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto("admin/editor/");
  await expect(page.locator("[data-editor-empty]")).toBeVisible();
  await expect(page.locator("[data-editor-empty] h2")).toHaveCount(0);
  await expect(page.locator("[data-editor-empty] > p")).toHaveCount(0);
  await expect(page.locator("[data-workflow-current]")).toHaveText(
    "記事を選択してください",
  );
  await expect(page.locator("[data-save-message]")).toHaveText(
    "保存状態：記事を選択してください",
  );
  await expect(page.locator("body")).not.toContainText("原稿を選んでください");
});

test("運営メンバー統計は共通のエラー状態から再試行できる", async ({ page }) => {
  await mockAdminApis(page);
  let genreRequests = 0;
  await page.route("**/api/admin/genre-overviews*", async (route) => {
    genreRequests += 1;
    if (genreRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "一時的に利用できません。" }),
      });
      return;
    }
    await route.fulfill({
      json: { members: [], overviews: [] },
    });
  });
  await page.goto("admin/operations-statistics/");
  const root = page.locator("[data-operations-statistics]");
  await expect(root).toHaveAttribute("aria-busy", "false");
  const notice = root.locator("[data-admin-load-error]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("一時的に利用できません。");
  await notice.getByRole("button", { name: "再試行" }).click();
  await expect(root.locator("[data-admin-empty-state]")).toBeVisible();
  await expect(root).toHaveAttribute("data-admin-load-state", "empty");
  expect(genreRequests).toBe(2);
});

test("運営メンバー管理の通常名簿には検証用アカウントを混在させない", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.route("**/api/admin/member-management*", async (route) => {
    await route.fulfill({
      json: {
        members: [
          {
            email: "editor@example.com",
            display_name: "通常メンバー",
            subjects: [],
            workflow_subjects: [],
            workflow_roles: [],
            catalog_assignments: [],
            discord_role_ids: [],
            discord_user_id: "",
            university: "",
            year: "",
            interests: "",
            avatar_url: "",
            membership_role: "member",
            updated_at: "",
          },
        ],
        discord_roles: [],
      },
    });
  });
  await page.goto("admin/member-management/");
  await expect(
    page.getByRole("heading", { name: "運営メンバー管理", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".member-card")).toContainText("通常メンバー");
  await expect(page.locator(".member-card")).not.toContainText(
    "operator@example.com",
  );
});

test("指定アカウントのセッション失効は対象固定と確認入力を表示する", async ({
  page,
}) => {
  await mockAdminApis(page);
  let resetBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/account-sessions/reset", async (route) => {
    resetBody = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      json: {
        ok: true,
        email: "account-b@example.invalid",
        revokedSessions: 1,
      },
    });
  });
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("admin/member-management/");
  const panel = page.locator(".session-reset-panel");
  await expect(panel).toContainText(
    "プロフィール・記事・応募・権限・監査履歴は保持",
  );
  await expect(panel.locator("[data-session-reset-email] option")).toHaveCount(
    3,
  );
  await panel
    .locator("[data-session-reset-email]")
    .selectOption("account-b@example.invalid");
  await panel.locator("[data-session-reset-confirm]").fill("失効");
  await panel.getByRole("button", { name: "セッションのみ失効" }).click();

  await expect
    .poll(() => resetBody)
    .toMatchObject({
      email: "account-b@example.invalid",
      confirmation: "失効",
    });
  await expect(panel.locator("[data-session-reset-message]")).toContainText(
    "1 件失効しました",
  );
});

test("作業の進め方に運営画面のスクリーンショットが表示される", async ({
  page,
}) => {
  await mockAdminApis(page);
  await page.goto("admin/guide/");
  const images = page.locator(".guide-screen img");
  await expect(images).toHaveCount(3);
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every(
          (element) =>
            (element as HTMLImageElement).complete &&
            (element as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
});

test("管理トップのタグは一般管理者の実効スコープを表す", async ({ page }) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: { email: "subject-editor@example.com", isManager: false },
    }),
  );
  await page.goto("admin/manage/?project=atlas");

  await expect(
    page.locator('a[href*="/admin/reports/"] [data-scope-tag]'),
  ).toHaveText("担当分野のみ");
  await expect(
    page.locator('a[href*="/admin/analytics/"] [data-scope-tag]'),
  ).toHaveText("担当分野のみ");
  await expect(
    page.locator('a[href*="/admin/publication-runs/"] [data-scope-tag]'),
  ).toHaveText("担当分野のみ");
  await expect(
    page.locator('a[href*="/admin/operations-statistics/"] [data-scope-tag]'),
  ).toHaveText("所属プロジェクト・担当分野");
  await expect(page.locator(".management-home")).not.toContainText(
    "記事の閲覧状況",
  );
  await expect(page.locator(".management-home")).not.toContainText("失敗確認");
});

test("管理トップのタグは全分野管理者の実効スコープを表す", async ({ page }) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: { email: "manager@example.com", isManager: true },
    }),
  );
  await page.goto("admin/manage/?project=atlas");

  await expect(
    page.locator('a[href*="/admin/reports/"] [data-scope-tag]'),
  ).toHaveText("全分野管理者");
  await expect(
    page.locator('a[href*="/admin/analytics/"] [data-scope-tag]'),
  ).toHaveText("全分野管理者");
  await expect(
    page.locator('a[href*="/admin/publication-runs/"] [data-scope-tag]'),
  ).toHaveText("全分野管理者");
  await expect(
    page.locator('a[href*="/admin/operations-statistics/"] [data-scope-tag]'),
  ).toHaveText("全分野管理者");
});

test("管理トップのタグはauth-statusの分野スコープと一致する", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        email: "subject-editor@example.com",
        hasAdminAccess: true,
        isManager: false,
        allSubjects: false,
        subjects: ["mathematics"],
        managerProjects: [],
      },
    }),
  );
  await page.goto("admin/manage/?project=atlas");

  await expect(
    page.locator('a[href*="/admin/reports/"] [data-scope-tag]'),
  ).toHaveText("担当分野（1件）");
  await expect(
    page.locator('a[href*="/admin/analytics/"] [data-scope-tag]'),
  ).toHaveText("担当分野（1件）");
  await expect(
    page.locator('a[href*="/admin/publication-runs/"] [data-scope-tag]'),
  ).toHaveText("担当分野（1件）");
  await expect(
    page.locator('a[href*="/admin/operations-statistics/"] [data-scope-tag]'),
  ).toHaveText("担当分野（1件）");
});

const responsiveSmokePages = [
  ["ポータル", "admin/portal/"],
  ["アクションセンター", "admin/action-center/"],
  ["タスク管理", "admin/member-tasks/"],
  ["記事一覧", "admin/articles/"],
  ["権限管理", "admin/permissions/"],
  ["記事編集", "admin/editor/"],
] as const;

for (const [label, path] of responsiveSmokePages) {
  for (const width of [1440, 768, 390]) {
    test(`${label}が${width}pxで横方向に崩れない`, async ({ page }) => {
      await mockAdminApis(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(geometry.viewport).toBe(width);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
    });
  }
}
