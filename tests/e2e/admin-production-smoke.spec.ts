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
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.repository).toBe("Atlasez/Admin-Atlesez");
    expect(body.target).toBe("admin");
    expect(typeof body.commit).toBe("string");
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
      expect(response?.status(), `${path} のHTML応答`).toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/auth\//);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "Internal Server Error",
      );
    });
  }
});
