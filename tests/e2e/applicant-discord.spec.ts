import { expect, test } from "@playwright/test";

test("応募者は応募状況からDiscord連携を一度開始できる", async ({ page }) => {
  await page.route("**/api/applicant/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: "applicant@example.com",
        stage: "APPLICANT",
        basicProfileComplete: true,
        applications: [
          {
            project: "学習サイト「アトラス」",
            submittedAt: "2026-08-29T10:00:00.000Z",
            status: "accepted",
            provisioningStatus: "skipped",
            discordConnected: false,
          },
        ],
        discord: { connected: false, oauthConnected: false },
      }),
    });
  });

  await page.goto("./applicant/");
  await expect(page.locator("[data-discord-card]")).toBeVisible();
  await expect(page.locator("[data-discord-message]")).toContainText("1回実行");
  await expect(page.locator("[data-discord-link]")).toHaveAttribute(
    "href",
    "/auth/discord/start?returnTo=%2Fapplicant%2F",
  );
});

test("承認前の応募者にはDiscord連携ボタンを表示しない", async ({ page }) => {
  await page.route("**/api/applicant/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: "applicant@example.com",
        stage: "APPLICANT",
        basicProfileComplete: true,
        applications: [
          {
            project: "学習サイト「アトラス」",
            submittedAt: "2026-08-29T10:00:00.000Z",
            status: "reviewing",
            provisioningStatus: "skipped",
            discordConnected: false,
          },
        ],
        discord: { connected: false, oauthConnected: false },
      }),
    });
  });

  await page.goto("./applicant/");
  await expect(page.locator("[data-discord-card]")).toBeVisible();
  await expect(page.locator("[data-discord-status]")).toHaveText("承認待ち");
  await expect(page.locator("[data-discord-message]")).toContainText(
    "承認された後",
  );
  await expect(page.locator("[data-discord-link]")).toBeHidden();
});
