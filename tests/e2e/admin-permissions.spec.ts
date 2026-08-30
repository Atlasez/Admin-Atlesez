import { expect, test } from "@playwright/test";

test("参加者カードは概要表示に絞り、個人設定モーダルを主導線にする", async ({
  page,
}) => {
  let catalogLoaded = false;
  await page.route("**/api/admin/report-admin-permissions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        permissions: [
          {
            email: "editor@example.com",
            display_name: "編集担当",
            subjects: "mathematics",
            university: "",
            year: "",
            interests: "",
          },
        ],
        workflowRoles: [],
        discordRoles: catalogLoaded
          ? [
              {
                discord_role_id: "role-mathematics",
                name: "数学運営",
                position: 10,
                is_managed: 0,
              },
            ]
          : [],
      }),
    });
  });
  await page.route("**/api/admin/discord-provision-roles", async (route) => {
    catalogLoaded = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/admin/discord-readiness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ready: false,
        configured: { emailDelivery: false },
        checks: {
          botApi: false,
          guildApi: false,
          rolesApi: false,
          botMember: false,
          manageRoles: false,
          roleHierarchy: false,
          roleMappings: false,
        },
        warnings: ["テスト用の未設定"],
      }),
    });
  });

  await page.goto("./admin/permissions/?project=atlas");

  const card = page.locator(".member-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".member-card__name")).toHaveAttribute(
    "data-open-member",
    "",
  );
  await expect(page.locator("[data-message]")).toBeHidden();
  await expect(page.locator("[data-discord-readiness-message]")).toBeHidden();
  const buttons = card.locator(".member-card__actions button");
  await expect(buttons).toHaveCount(3);

  const buttonMetrics = await buttons.evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      height: element.getBoundingClientRect().height,
      gridColumn: getComputedStyle(element).gridColumn,
    })),
  );
  expect(buttonMetrics[0]?.text).toBe("全分野管理者に変更");
  expect(buttonMetrics[0]?.height).toBeLessThanOrEqual(40);
  expect(buttonMetrics[2]?.height).toBeLessThanOrEqual(40);
  expect(buttonMetrics[1]?.gridColumn).toBe("1 / -1");
  await expect(
    page.getByPlaceholder("名前・メールアドレスで検索"),
  ).toBeVisible();
  await expect(page.locator("[data-member-filter]")).toBeVisible();
  await expect(card.locator("[data-discord-role]")).toHaveCount(0);
  await expect(
    card.getByText("役職・プロフィールを編集", { exact: true }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "編集担当の個人設定を開く" }).click();
  const memberModal = page.locator("[data-member-modal]");
  await expect(memberModal).toBeVisible();
  const shellGeometry = await memberModal
    .locator(".member-modal__shell")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
  if (shellGeometry.width < shellGeometry.viewportWidth) {
    expect(shellGeometry.left).toBeCloseTo(
      (shellGeometry.viewportWidth - shellGeometry.width) / 2,
      0,
    );
  }
  expect(shellGeometry.width).toBeLessThanOrEqual(900);
  expect(shellGeometry.height).toBeLessThanOrEqual(760);
  expect(shellGeometry.top).toBeGreaterThanOrEqual(0);
  expect(shellGeometry.top + shellGeometry.height).toBeLessThanOrEqual(
    shellGeometry.viewportHeight,
  );
  await expect(memberModal.locator("[data-modal-discord-role]")).toHaveCount(1);
  await expect(memberModal.locator(".member-role-option span")).toHaveText(
    "数学運営",
  );
  await page.keyboard.press("Escape");
  await expect(memberModal).toBeHidden();
  const readinessButton = page.locator("[data-discord-readiness]");
  await expect(readinessButton).toHaveText("運用事前チェック");
  await readinessButton.click();
  await expect(page.locator("[data-discord-readiness-message]")).toContainText(
    "未完了の項目があります",
  );

  await expect(page.locator(".member-admin__eyebrow").first()).toHaveText(
    "権限管理",
  );
  await expect(
    page.getByText("ATLAS / ACCESS CONTROL", { exact: true }),
  ).toHaveCount(0);

  await page.locator("html").evaluate((html) => {
    html.dataset.prefBg = "dark";
  });
  const darkThemeMetrics = await page.locator("body").evaluate(() => ({
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    cardBackground: getComputedStyle(document.querySelector(".member-card")!)
      .backgroundColor,
    cardText: getComputedStyle(document.querySelector(".member-card__name")!)
      .color,
    inputBackground: getComputedStyle(
      document.querySelector(".member-admin input")!,
    ).backgroundColor,
  }));
  expect(darkThemeMetrics).toEqual({
    bodyBackground: "rgb(25, 26, 28)",
    cardBackground: "rgb(35, 36, 39)",
    cardText: "rgb(232, 230, 225)",
    inputBackground: "rgb(25, 26, 28)",
  });
});
