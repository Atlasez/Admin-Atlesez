import { expect, test, type Page, type Route } from "@playwright/test";

const applicantProfile = {
  email: "applicant@example.test",
  family_name: "検証",
  given_name: "太郎",
  family_name_kana: "けんしょう",
  given_name_kana: "たろう",
  form_language: "ja" as const,
  affiliation_email: "school@example.test",
  affiliation_type: "大学",
  institution: "検証大学",
  grade: "B1",
  country: "日本",
  timezone: "Asia/Tokyo",
  birth_date: "2000-01-01",
  residence_city: "検証市",
  current_organizations: "",
  middle_name: "",
  nickname: "",
};

const profilePayload = {
  email: "member@example.test",
  profile: {
    display_name: "現在の表示名",
    university: "既存大学",
    year: "B2",
    affiliation_type: "student",
    country: "日本",
    timezone: "Asia/Tokyo",
    bio: "既存の自己紹介",
    avatar_url: "",
  },
  profileChangeRequest: null,
};

async function mockAdminShell(page: Page) {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "member@example.test", isManager: false } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
}

test("応募フォームは初期化完了まで必須入力の検証・送信を受け付けない", async ({
  page,
}) => {
  let releaseApiResponses!: () => void;
  const apiResponsesReleased = new Promise<void>((resolve) => {
    releaseApiResponses = resolve;
  });
  const delayStatus = async (route: Route) => {
    await apiResponsesReleased;
    await route.fulfill({
      json: {
        email: "applicant@example.test",
        stage: "NEW_USER",
        applicationProjects: [],
      },
    });
  };
  await page.route("**/api/user/status", delayStatus);
  await page.route("**/api/application-profile", async (route) => {
    await apiResponsesReleased;
    await route.fulfill({ json: { profile: null, hasProfile: false } });
  });
  await page.route("**/api/public/application-config", (route) =>
    route.fulfill({ json: {} }),
  );

  await page.goto("apply/?step=basic", { waitUntil: "domcontentloaded" });
  const form = page.locator("[data-application]");
  const submit = page.locator('[data-application] [data-i18n="submit"]');
  await expect(form).toHaveAttribute("data-form-ready", "false");
  await expect(submit).toBeDisabled();
  await expect(page.locator("[data-basic-fieldset]")).toHaveJSProperty(
    "disabled",
    true,
  );
  await expect(page.locator("[data-project-fieldset]")).toHaveJSProperty(
    "disabled",
    true,
  );
  expect(
    await form.evaluate((element) =>
      (element as HTMLFormElement).checkValidity(),
    ),
  ).toBe(true);

  releaseApiResponses();
  await expect(form).toHaveAttribute("data-form-ready", "true");
  await expect(page.locator("[data-basic-fieldset]")).toHaveJSProperty(
    "disabled",
    false,
  );
  await expect(page.locator("[data-project-fieldset]")).toHaveJSProperty(
    "disabled",
    true,
  );
  await expect(submit).toBeHidden();
});

test("所属機関候補を上下キーとEnterで選び、Escapeで閉じられる", async ({
  page,
}) => {
  await page.route("**/api/user/status", (route) =>
    route.fulfill({
      json: {
        email: applicantProfile.email,
        stage: "NEW_USER",
        applicationProjects: [],
      },
    }),
  );
  await page.route("**/api/application-profile", (route) =>
    route.fulfill({ json: { profile: null, hasProfile: false } }),
  );
  await page.route("**/api/public/application-config", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/data/institutions.json", (route) =>
    route.fulfill({
      json: {
        institutions: [
          { code: "A001", name: "東京大学" },
          { code: "A002", name: "東京工業大学" },
        ],
      },
    }),
  );

  await page.goto("apply/?step=basic");
  const input = page.getByRole("combobox", { name: "所属機関" });
  await input.fill("東京");
  const options = page.locator('#institution-directory [role="option"]');
  await expect(options).toHaveCount(2);

  await input.press("ArrowDown");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    "institution-option-0",
  );
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    "institution-option-1",
  );
  await input.press("ArrowUp");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    "institution-option-0",
  );
  await input.press("Enter");
  await expect(input).toHaveValue("東京大学");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-institution-status]")).toContainText(
    "東京大学を選択しました",
  );

  await input.fill("東京");
  await input.press("ArrowDown");
  await input.press("Escape");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    "institution-option-0",
  );
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
});

test("プロフィールGET失敗後は保存できず、再読込後に既存値を保って申請できる", async ({
  page,
}) => {
  await mockAdminShell(page);
  let getAttempts = 0;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/profile", async (route) => {
    if (route.request().method() === "PUT") {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { ok: true, approvalRequired: true } });
      return;
    }
    getAttempts += 1;
    if (getAttempts === 1) {
      await route.fulfill({ status: 503, json: { error: "一時的な障害" } });
      return;
    }
    await route.fulfill({ json: profilePayload });
  });

  await page.goto("admin/member-profile/edit/");
  const save = page.getByRole("button", { name: "変更を承認申請" });
  const retry = page.getByRole("button", {
    name: "プロフィールの状態を再読み込み",
  });
  await expect(page.locator("[data-message]")).toContainText("一時的な障害");
  await expect(save).toBeDisabled();
  await expect(page.locator("[data-display-name]")).toBeDisabled();
  await expect(retry).toBeVisible();
  expect(submitted).toBeNull();

  await retry.click();
  await expect(page.locator("[data-display-name]")).toHaveValue("現在の表示名");
  await expect(page.locator("[data-university]")).toHaveValue("既存大学");
  await expect(save).toBeEnabled();
  await page.locator("[data-display-name]").fill("更新後の表示名");
  await save.click();
  await expect(page.locator("[data-message]")).toContainText(
    "運営事務局へ送りました",
  );
  expect(submitted).toMatchObject({
    displayName: "更新後の表示名",
    university: "既存大学",
    year: "B2",
    affiliationType: "student",
    country: "日本",
    bio: "既存の自己紹介",
  });
  expect(getAttempts).toBe(2);
});

test("プロフィールPUT通信失敗は状態未確定と表示し、再読込で受付状態を確認できる", async ({
  page,
}) => {
  await mockAdminShell(page);
  let getAttempts = 0;
  let putAttempts = 0;
  await page.route("**/api/admin/profile", async (route) => {
    if (route.request().method() === "PUT") {
      putAttempts += 1;
      await route.abort("failed");
      return;
    }
    getAttempts += 1;
    if (getAttempts === 1) {
      await route.fulfill({ json: profilePayload });
      return;
    }
    await route.fulfill({
      json: {
        ...profilePayload,
        profileChangeRequest: {
          status: "pending",
          proposed_display_name: "更新後の表示名",
          proposed_university: "既存大学",
          proposed_year: "B2",
          proposed_affiliation_type: "student",
          proposed_country: "日本",
          proposed_timezone: "Asia/Tokyo",
          proposed_bio: "確認対象の申請内容",
        },
      },
    });
  });

  await page.goto("admin/member-profile/edit/");
  await page.locator("[data-display-name]").fill("更新後の表示名");
  await page.locator("[data-bio]").fill("確認対象の申請内容");
  await page.getByRole("button", { name: "変更を承認申請" }).click();
  await expect(page.locator("[data-message]")).toContainText(
    "申請が受け付けられたか確認できません",
  );
  await expect(
    page.getByRole("button", { name: "変更を承認申請" }),
  ).toBeDisabled();
  const retry = page.getByRole("button", {
    name: "プロフィールの状態を再読み込み",
  });
  await expect(retry).toBeVisible();

  await retry.click();
  await expect(page.locator("[data-display-name]")).toHaveValue(
    "更新後の表示名",
  );
  await expect(page.locator("[data-bio]")).toHaveValue("確認対象の申請内容");
  await expect(page.locator("[data-message]")).toContainText("承認待ち");
  await expect(
    page.getByRole("button", { name: "変更を承認申請" }),
  ).toBeEnabled();
  expect(putAttempts).toBe(1);
  expect(getAttempts).toBe(2);
});
