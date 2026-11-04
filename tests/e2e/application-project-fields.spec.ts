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

test("保存後の応答喪失から再送した409は本人の状態へ案内し運営確認中を伝える", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/user/status", (route) =>
    route.fulfill({
      json: {
        email: "lost-response@atlasez.test",
        stage: "NEW_USER",
        applicationProjects: [],
      },
    }),
  );
  await page.route("**/api/application-profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          email: "lost-response@atlasez.test",
          family_name: "応答",
          given_name: "喪失",
          family_name_kana: "おうとう",
          given_name_kana: "そうしつ",
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
  let committed = false;
  await page.route("**/api/apply", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      committed = true;
      await route.abort("failed");
      return;
    }
    expect(committed).toBe(true);
    await route.fulfill({
      status: 409,
      json: {
        error:
          "このプロジェクトの応募または参加情報はすでに登録されています。応募状況を確認してください。",
        code: "APPLICATION_ALREADY_EXISTS",
        statusUrl: "/applicant/?submission=already-received",
      },
    });
  });
  await page.route("**/api/applicant/me", (route) =>
    route.fulfill({
      json: {
        email: "lost-response@atlasez.test",
        stage: "APPLICANT",
        applications: [
          {
            project: "考えるカフェ",
            status: "new",
            intakeNeedsOperatorAttention: true,
          },
        ],
      },
    }),
  );

  await page.goto("apply/thinking-cafe/");
  await page.locator('[name="interests"]').fill("対話の場づくり");
  await page.locator('[name="message"]').fill("応答喪失後の再送を検証");
  await page.locator('[name="referralSource"]').fill("公式サイト");
  await page
    .locator('[name="interviewAvailability"]')
    .fill("平日18時 Asia/Tokyo");
  await page.locator('[data-project-answer="theme"]').fill("安全な再送");
  const submit = page.getByRole("button", { name: "応募を送信", exact: true });

  await submit.click();
  await expect(page.locator("[data-result]")).toContainText(
    "送信結果を確認できませんでした",
  );
  await expect(page.locator("[data-application-status-link]")).toBeVisible();
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page).toHaveURL(/\/applicant\/\?submission=already-received$/);
  await expect(page.locator("[data-submission-confirmation]")).toContainText(
    "受付処理に運営の確認が必要です",
  );
  await expect(page.locator("[data-application-list]")).toContainText(
    "考えるカフェ：応募を受け付けました（運営確認中）",
  );
  expect(attempts).toBe(2);
});

test("応募は保存済みだが受付処理に修復が必要な503は状態確認へ案内する", async ({
  page,
}) => {
  await page.route("**/api/user/status", (route) =>
    route.fulfill({
      json: {
        email: "repair-needed@atlasez.test",
        stage: "NEW_USER",
        applicationProjects: [],
      },
    }),
  );
  await page.route("**/api/application-profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          email: "repair-needed@atlasez.test",
          family_name: "受付",
          given_name: "修復",
          family_name_kana: "うけつけ",
          given_name_kana: "しゅうふく",
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
  await page.route("**/api/apply", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "APPLICATION_SETUP_REQUIRES_REVIEW",
        applicationSaved: true,
        error:
          "応募内容は保存され、受付処理の不足分を修復しました。運営確認中です。",
      },
    }),
  );
  await page.route("**/api/applicant/me", (route) =>
    route.fulfill({
      json: {
        email: "repair-needed@atlasez.test",
        stage: "APPLICANT",
        applications: [
          {
            project: "考えるカフェ",
            status: "new",
            intakeNeedsOperatorAttention: true,
          },
        ],
      },
    }),
  );

  await page.goto("apply/thinking-cafe/");
  await page.locator('[name="interests"]').fill("応募状況の確認");
  await page.locator('[name="message"]').fill("保存済み状態を確認します");
  await page.locator('[name="referralSource"]').fill("公式サイト");
  await page
    .locator('[name="interviewAvailability"]')
    .fill("平日18時 Asia/Tokyo");
  await page.locator('[data-project-answer="theme"]').fill("受付修復の確認");
  await page.getByRole("button", { name: "応募を送信", exact: true }).click();

  await expect(page).toHaveURL(/\/applicant\/\?submission=check$/);
  await expect(page.locator("[data-submission-confirmation]")).toContainText(
    "応募内容は保存されていますが、受付処理に運営の確認が必要です",
  );
});
