import { expect, test } from "@playwright/test";

const projects = [
  { slug: "atlas", answers: [], articles: true, roles: true },
  { slug: "thinking-cafe", answers: ["theme"], articles: false, roles: false },
  { slug: "seminar-platform", answers: [], articles: true, roles: true },
  {
    slug: "student-council-exchange",
    answers: ["councilStatus", "councilRole", "councilPlans"],
    articles: false,
    roles: true,
  },
  {
    slug: "secretariat",
    answers: ["strengths", "problemAwareness", "plans"],
    articles: false,
    roles: true,
  },
];

for (const width of [1280, 390]) {
  for (const project of projects) {
    test(`${project.slug}: ${width}pxで対象設問だけを表示して応募する`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/user/status", (route) =>
        route.fulfill({
          json: {
            email: "applicant@atlasez.test",
            stage: "NEW_USER",
            applicationProjects: [],
          },
        }),
      );
      await page.route("**/api/application-profile", (route) =>
        route.fulfill({
          json: {
            profile: {
              email: "applicant@atlasez.test",
              family_name: "検証",
              given_name: "太郎",
              family_name_kana: "けんしょう",
              given_name_kana: "たろう",
              form_language: "ja",
              affiliation_email: "school@atlasez.test",
              affiliation_type: "大学",
              institution: "検証大学",
              grade: "B1",
              country: "日本",
              timezone: "Asia/Tokyo",
              birth_date: "2000-01-01",
              residence_city: "検証市",
              middle_name: "",
              nickname: "",
              current_organizations: "",
              referral_source: "",
            },
          },
        }),
      );
      await page.route("**/api/public/application-config", (route) =>
        route.fulfill({ json: {} }),
      );
      let submitted: Record<string, unknown> | undefined;
      await page.route("**/api/apply", async (route) => {
        submitted = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({ json: { ok: true } });
      });
      await page.goto(`apply/${project.slug}/`);
      await expect(page.locator("[data-project-fieldset]")).toBeVisible();
      await expect(page.locator("[data-basic-fieldset]")).toBeHidden();
      await expect(page.locator(".privacy-notice a")).toHaveAttribute(
        "href",
        "https://atlasez.org/privacy-policy/",
      );

      for (const extra of [
        "thinking-cafe",
        "student-council-exchange",
        "secretariat",
      ]) {
        const section = page.locator(`[data-project-extra="${extra}"]`);
        if (extra === project.slug) await expect(section).toBeVisible();
        else {
          await expect(section).toBeHidden();
          for (const input of await section.locator("input,textarea").all()) {
            await expect(input).toBeDisabled();
            await expect(input).toHaveJSProperty("required", false);
          }
        }
      }
      for (const [name, visible] of [
        ["articleIdeas", project.articles],
        ["motivationReasons", project.roles],
        ["desiredRoles", project.roles],
      ] as const) {
        const input = page.locator(`[name="${name}"]`);
        if (visible) {
          await expect(input).toBeVisible();
          await input.fill("検証用の回答");
        } else {
          await expect(input).toBeHidden();
          await expect(input).toBeDisabled();
          await expect(input).toHaveJSProperty("required", false);
        }
      }
      // 再利用・自動入力で非表示欄に値が残っても他プロジェクトへ送らない。
      await page
        .locator(
          "[data-project-fieldset] input,[data-project-fieldset] textarea",
        )
        .evaluateAll((controls) => {
          for (const control of controls) {
            if (
              (control instanceof HTMLInputElement ||
                control instanceof HTMLTextAreaElement) &&
              control.closest("[hidden]")
            ) {
              if (
                control instanceof HTMLInputElement &&
                control.type === "checkbox"
              )
                control.checked = true;
              else control.value = "他プロジェクトの残存回答";
            }
          }
        });
      for (const name of [
        "referralSource",
        "interests",
        "message",
        "interviewAvailability",
      ]) {
        await page.locator(`[name="${name}"]`).fill("検証用の回答");
      }
      for (const answer of project.answers)
        await page
          .locator(`[data-project-answer="${answer}"]`)
          .fill("検証用の回答");
      if (project.slug === "atlas")
        await page.locator('[name="desiredSubjects"][value="other"]').check();
      expect(
        await page
          .locator("[data-application]")
          .evaluate((form) => (form as HTMLFormElement).checkValidity()),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "応募を送信", exact: true })
        .click();
      await expect.poll(() => submitted).toBeDefined();
      expect(submitted?.projectSlug).toBe(project.slug);
      expect(submitted?.projectAnswers).toEqual(
        Object.fromEntries(project.answers.map((key) => [key, "検証用の回答"])),
      );
      expect(submitted?.desiredSubjects).toEqual(
        project.slug === "atlas" ? ["other"] : [],
      );
      if (!project.articles)
        expect(submitted).not.toHaveProperty("articleIdeas");
      if (!project.roles) {
        expect(submitted).not.toHaveProperty("motivationReasons");
        expect(submitted).not.toHaveProperty("desiredRoles");
      }
    });
  }
}

test("応募保存の一時障害を成功と誤認せず、同じ入力の再送で応募状況へ進める", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/user/status", (route) =>
    route.fulfill({
      json: {
        email: "retry-applicant@atlasez.test",
        stage: "NEW_USER",
        applicationProjects: [],
      },
    }),
  );
  await page.route("**/api/application-profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          email: "retry-applicant@atlasez.test",
          family_name: "再試行",
          given_name: "検証",
          family_name_kana: "さいしこう",
          given_name_kana: "けんしょう",
          form_language: "ja",
          affiliation_email: "school@atlasez.test",
          affiliation_type: "大学",
          institution: "検証大学",
          grade: "B1",
          country: "日本",
          timezone: "Asia/Tokyo",
          birth_date: "2000-01-01",
          residence_city: "検証市",
        },
      },
    }),
  );
  await page.route("**/api/public/application-config", (route) =>
    route.fulfill({ json: {} }),
  );
  let attempts = 0;
  await page.route("**/api/apply", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        json: {
          error: "応募を保存できませんでした。時間をおいて再試行してください。",
        },
      });
      return;
    }
    await route.fulfill({
      status: 201,
      json: {
        ok: true,
        responseTaskCreated: true,
        emailQueued: true,
        emailQueueCount: 1,
        emailProviderConfigured: false,
      },
    });
  });
  await page.route("**/api/applicant/me", (route) =>
    route.fulfill({
      json: {
        email: "retry-applicant@atlasez.test",
        stage: "APPLICANT",
        applications: [{ project: "考えるカフェ", status: "new" }],
      },
    }),
  );

  await page.goto("apply/thinking-cafe/");
  await page.locator('[name="interests"]').fill("対話の場づくり");
  await page.locator('[name="message"]').fill("再試行の隔離検証");
  await page.locator('[name="referralSource"]').fill("公式サイト");
  await page
    .locator('[name="interviewAvailability"]')
    .fill("平日18時 Asia/Tokyo");
  await page.locator('[data-project-answer="theme"]').fill("学びの場づくり");
  const submit = page.getByRole("button", { name: "応募を送信", exact: true });

  await submit.click();
  await expect(
    page.getByText(
      "応募を保存できませんでした。時間をおいて再試行してください。",
    ),
  ).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(page).not.toHaveURL(/\/applicant\//);
  await expect(page.locator('[name="message"]')).toHaveValue(
    "再試行の隔離検証",
  );

  await submit.click();
  await expect(page).toHaveURL(/\/applicant\/$/);
  await expect(
    page.getByRole("heading", { name: "応募状況を確認できます" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});
