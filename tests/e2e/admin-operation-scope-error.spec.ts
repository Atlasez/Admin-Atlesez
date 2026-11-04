import { expect, test } from "@playwright/test";

test("進行管理は担当情報がない応答を日本語の案内にする", async ({ page }) => {
  await page.route("**/api/admin/operations**", (route) =>
    route.fulfill({ json: { tasks: [] } }),
  );
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        email: "alice@example.com",
        isManager: true,
        canAccessAdmin: true,
      },
    }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );

  await page.goto("admin/operations/?project=atlas");
  const alert = page.locator("[data-operation-scope-error]");
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole("heading", {
      name: "進行管理の情報を読み込めませんでした",
    }),
  ).toBeVisible();
  await expect(alert).toContainText(
    "担当の判別に必要な情報が応答に含まれていない",
  );
  await expect(
    alert.getByRole("link", { name: "お問い合わせ" }),
  ).toHaveAttribute("href", "https://atlasez.org/contact/");
  await expect(page.locator("body")).not.toContainText("isManager");
  await expect(page.locator("[data-admin-load-error]")).toBeHidden();
  await expect(page.locator("[data-task-show-completed]")).toBeVisible();
});
