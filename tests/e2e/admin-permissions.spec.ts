import { expect, test } from "@playwright/test";

test("参加者カードは概要表示に絞り、個人設定モーダルを主導線にする", async ({
  page,
}) => {
  let catalogLoaded = true;
  let catalogProvisionRequests = 0;
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
    catalogProvisionRequests += 1;
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
  await page.route("**/api/admin/member-discord-roles", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error:
          "Discordロール「数学運営」を付与できませんでした（HTTP 403）。Botのロールが対象ロールより上位にあることを確認してください。",
        provisioning: {
          status: "failed",
          applied: 0,
          removed: 0,
          warnings: [
            "Discordロール「数学運営」を付与できませんでした（HTTP 403）。",
          ],
        },
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
  await expect(buttons).toHaveCount(4);

  const buttonMetrics = await buttons.evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      height: element.getBoundingClientRect().height,
    })),
  );
  expect(buttonMetrics[0]?.text).toBe("設定");
  expect(buttonMetrics[0]?.height).toBeLessThanOrEqual(40);
  await expect(card.locator(".member-action-menu")).not.toHaveAttribute(
    "open",
    "",
  );
  await card.locator(".member-action-menu > summary").click();
  await expect(card.locator(".member-action-menu")).toHaveAttribute("open", "");
  await expect(
    card.getByRole("button", { name: "Discordロールを再同期" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("名前・メールアドレスで検索"),
  ).toBeVisible();
  await expect(page.locator("[data-member-filter]")).toBeVisible();
  await expect(page.locator("[data-summary-member-count]")).toHaveText("1");
  await expect(page.locator("[data-summary-role-count]")).toHaveText("1");
  expect(catalogProvisionRequests).toBe(0);
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
  expect(shellGeometry.left + shellGeometry.width).toBeCloseTo(
    shellGeometry.viewportWidth,
    0,
  );
  expect(shellGeometry.width).toBeLessThanOrEqual(780);
  expect(shellGeometry.height).toBeLessThanOrEqual(
    shellGeometry.viewportHeight,
  );
  expect(shellGeometry.top).toBeGreaterThanOrEqual(0);
  expect(shellGeometry.top + shellGeometry.height).toBeLessThanOrEqual(
    shellGeometry.viewportHeight,
  );
  await expect(memberModal.locator("[data-modal-discord-role]")).toHaveCount(1);
  await expect(memberModal.locator(".member-role-option span")).toHaveText(
    "数学運営",
  );
  await memberModal.locator("[data-modal-discord-role]").check();
  await memberModal
    .getByRole("button", { name: "保存してDiscordへ同期" })
    .click();
  await expect(memberModal).toBeVisible();
  await expect(
    memberModal.locator("[data-member-modal-message]"),
  ).toHaveAttribute("data-state", "error");
  const syncErrorMessage = await memberModal
    .locator("[data-member-modal-message]")
    .evaluate((element) => (element as HTMLOutputElement).value);
  expect(syncErrorMessage).toMatch(
    /Discordロールの付与に失敗|対象ロールより上位/,
  );
  await page.keyboard.press("Escape");
  await expect(memberModal).toBeHidden();
  await page.locator(".discord-role-catalog > summary").click();
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

test("分野統括は同じ分野の共同担当と一人の兼任を表示・保存できる", async ({
  page,
}) => {
  let workflowRoles = [
    {
      email: "alice@example.com",
      role: "subject-coordinator",
      subject: "mathematics",
      display_name: "Alice",
    },
    {
      email: "alice@example.com",
      role: "subject-coordinator",
      subject: "physics",
      display_name: "Alice",
    },
    {
      email: "bob@example.com",
      role: "subject-coordinator",
      subject: "mathematics",
      display_name: "Bob",
    },
  ];
  let posted: { email?: string; subjects?: string[] } | null = null;
  await page.route("**/api/admin/report-admin-permissions", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          permissions: [
            {
              email: "alice@example.com",
              display_name: "Alice",
              subjects: "mathematics,physics",
            },
            {
              email: "bob@example.com",
              display_name: "Bob",
              subjects: "mathematics",
            },
          ],
          workflowRoles,
          discordRoles: [
            {
              discord_role_id: "role-mathematics",
              name: "数学運営",
              position: 10,
              is_managed: 0,
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/admin/editorial-workflow-roles**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      posted = JSON.parse(request.postData() ?? "{}") as typeof posted;
      workflowRoles = [
        ...workflowRoles,
        ...(posted?.subjects ?? []).map((subject) => ({
          email: posted?.email ?? "",
          role: "subject-coordinator",
          subject,
          display_name: "Alice",
        })),
      ];
      await route.fulfill({
        status: 201,
        json: { ok: true, added: posted?.subjects?.length ?? 0 },
      });
      return;
    }
    const url = new URL(request.url());
    workflowRoles = workflowRoles.filter(
      (role) =>
        !(
          role.email === url.searchParams.get("email") &&
          role.subject === url.searchParams.get("subject")
        ),
    );
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("./admin/permissions/?project=atlas");

  await expect(
    page.locator('[data-workflow-subject-group="mathematics"]'),
  ).toContainText("2人（共同担当）");
  await expect(
    page.locator('[data-workflow-subject-group="physics"]'),
  ).toContainText("1人（共同担当）");
  await expect(page.locator("[data-workflow-role-list]")).toContainText(
    "1人が兼任",
  );

  await page.locator(".workflow-role-admin > summary").click();

  await page
    .locator('input[name="email"][list="workflow-coordinator-members"]')
    .fill("alice@example.com");
  await page
    .locator('.workflow-role-admin select[name="subject"][multiple]')
    .selectOption(["chemistry", "biology"]);
  await expect(page.locator("[data-workflow-role-selection]")).toHaveText(
    "2分野を選択中",
  );
  await page.getByRole("button", { name: "統括を追加" }).click();
  await expect(page.locator("[data-message]")).toHaveText(
    "2分野の分野統括を追加しました。",
  );
  expect(posted).toEqual({
    email: "alice@example.com",
    role: "subject-coordinator",
    subjects: ["chemistry", "biology"],
  });

  await expect(
    page.locator('[data-workflow-subject-group="chemistry"]'),
  ).toContainText("Alice");
  await page.getByRole("button", { name: "Aliceの数学統括を削除" }).click();
  await expect(
    page.locator('[data-workflow-subject-group="mathematics"]'),
  ).toContainText("1人（共同担当）");
});
