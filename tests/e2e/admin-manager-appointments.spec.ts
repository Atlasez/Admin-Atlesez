import { expect, test } from "@playwright/test";

test("付与元の確認と古い画面の拒否をロール任命画面で確認できる", async ({
  page,
}) => {
  let expectedRevision = 3;
  const saves: Array<Record<string, unknown>> = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/admin/project-manager-grants") {
      if (request.method() === "PATCH") {
        saves.push(request.postDataJSON());
        if (saves.length === 1) {
          expectedRevision = 4;
          return route.fulfill({
            status: 409,
            json: {
              error: "他の変更が先に反映されています。再読み込みしてください。",
            },
          });
        }
        return route.fulfill({
          json: { ok: true, role: "manager", source: "explicit" },
        });
      }
      return route.fulfill({
        json: {
          members: [
            {
              project_id: "atlas",
              project_name: "アトラス",
              email: "legacy@example.test",
              role: "manager",
              source: "legacy",
              revision: expectedRevision,
              review_required: 1,
            },
          ],
        },
      });
    }
    if (path === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: "global@example.test",
          isManager: true,
          canAccessAdmin: true,
          managerProjects: ["atlas"],
        },
      });
    if (path === "/api/admin/report-admin-permissions")
      return route.fulfill({
        json: { permissions: [], workflowRoles: [], discordRoles: [] },
      });
    if (path === "/api/admin/notifications")
      return route.fulfill({ json: { notifications: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("admin/permissions/?project=atlas");
  const panel = page.locator("[data-manager-grants]");
  await expect(panel).toContainText("Discord同期の解除判断が必要");
  await panel.getByRole("button", { name: "任命を保存・確認" }).click();
  await expect(panel.locator("[data-manager-grants-message]")).toContainText(
    "再読み込みしてください",
  );
  expect(saves[0]).toMatchObject({
    expectedRole: "manager",
    expectedSource: "legacy",
    revision: 3,
  });
  await panel.getByRole("button", { name: "再読み込み", exact: true }).click();
  await panel.getByRole("button", { name: "任命を保存・確認" }).click();
  await expect(panel.locator("[data-manager-grants-message]")).toContainText(
    "任命を記録しました",
  );
  expect(saves[1]).toMatchObject({
    expectedSource: "legacy",
    revision: 4,
    role: "manager",
  });
});

test("任命一覧が読めない場合はエラーと再読み込みを表示する", async ({
  page,
}) => {
  let loads = 0;
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/project-manager-grants") {
      loads++;
      return loads === 1
        ? route.fulfill({
            status: 503,
            json: { error: "任命データの読み込みに失敗しました。" },
          })
        : route.fulfill({ json: { members: [] } });
    }
    return route.fulfill({ json: { permissions: [], notifications: [] } });
  });
  await page.goto("admin/permissions/?project=atlas");
  const panel = page.locator("[data-manager-grants]");
  await expect(panel.locator("[data-manager-grants-message]")).toContainText(
    "読み込みに失敗",
  );
  await panel.getByRole("button", { name: "再読み込み", exact: true }).click();
  await expect(panel.locator("[data-manager-grants-list]")).toHaveText(
    "該当する所属はありません。",
  );
});
