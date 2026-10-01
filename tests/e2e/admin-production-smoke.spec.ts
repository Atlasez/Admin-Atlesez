import { expect, test } from "@playwright/test";

/**
 * Run against an authenticated deployment with:
 *
 * E2E_LIVE_SMOKE=1 \
 * E2E_BASE_URL=https://admin.atlasez.org \
 * E2E_AUTH_STORAGE_STATE=/absolute/path/admin-auth.json \
 * npm run test:e2e:admin-live
 *
 * The opt-in guard prevents a normal local test run from touching production.
 */
const enabled = process.env.E2E_LIVE_SMOKE === "1";
const storageState = process.env.E2E_AUTH_STORAGE_STATE;

test.describe("管理サイト ライブスモーク", () => {
  test.skip(!enabled, "E2E_LIVE_SMOKE=1 のときだけ実行します。");
  test.skip(
    !storageState,
    "E2E_AUTH_STORAGE_STATE に認証済みStorage Stateを指定してください。",
  );

  test.use({ storageState });

  test("build-info が配信され、管理サイトの正本を確認できる", async ({
    request,
  }) => {
    const response = await request.get("/build-info.json", {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.repository).toBe("Atlasez/Admin-Atlesez");
    expect(body.target).toBe("admin");
    expect(body.commit).toMatch(/^[a-f0-9]{40}$/);
    const expectedCommit = process.env.E2E_EXPECTED_MAIN_SHA;
    if (expectedCommit) {
      expect(expectedCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(
        body.commit,
        "本番のSHAはレビュー済みmainと一致する必要があります",
      ).toBe(expectedCommit);
    }
  });

  const endpoints = [
    ["本人の権限", "/api/admin/auth-status", "email"],
    ["ポータル", "/api/admin/portal", "projects"],
    ["タスク", "/api/admin/member-tasks?limit=1", "tasks"],
    ["カレンダー", "/api/admin/member-calendar?limit=1", "events"],
    ["プロフィール", "/api/admin/profile", "profile"],
    ["記事一覧", "/api/admin/editor/documents?limit=1", "documents"],
  ] as const;
  for (const [label, path, field] of endpoints) {
    test(`${label}の実APIがJSONを返す`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/json");
      const data = await response.json();
      expect(data).toHaveProperty(field);
      expect(data.error).toBeUndefined();
    });
  }
  test("未認証セッションへ保護データを返さない", async ({
    playwright,
    baseURL,
  }) => {
    const anonymous = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      for (const [, path] of endpoints.slice(1)) {
        const response = await anonymous.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(401);
        expect(response.headers()["content-type"]).toContain(
          "application/json",
        );
      }
    } finally {
      await anonymous.dispose();
    }
  });

  const routes = [
    ["ポータル", "/admin/portal/"],
    ["タスク", "/admin/member-tasks/"],
    ["カレンダー", "/admin/member-calendar/"],
    ["マイページ", "/admin/member-profile/"],
    ["管理トップ", "/admin/manage/?project=atlas"],
    ["記事一覧", "/admin/articles/"],
  ] as const;

  for (const [label, path] of routes) {
    test(`${label}が認証済みセッションで表示される`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${path} のHTML応答`).toBe(200);
      await expect(page).not.toHaveURL(/\/auth\//);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(
        page.locator("[data-admin-load-surface]").first(),
      ).toHaveAttribute("data-admin-load-state", /^(ready|empty)$/);
      await expect(page.locator("body")).not.toContainText(
        "Internal Server Error",
      );
    });
  }
});
