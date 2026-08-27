import { expect, test } from "@playwright/test";

test("応募フォームの基本情報にプロジェクト選択を置かず、個人情報案内と表示設定を表示する", async ({
  page,
}) => {
  await page.goto("apply/");
  await expect(page.getByRole("group", { name: "基本情報" })).toBeVisible();
  await expect(page.getByLabel("応募先プロジェクト")).toHaveCount(0);
  await expect(page.locator(".privacy-notice")).toContainText(
    "個人情報の取り扱いについて",
  );
  await expect(page.locator("[data-settings-menu] > summary")).toBeVisible();
  await page.goto("applicant/");
  await expect(page.getByText("ATLASEZ / APPLICATION")).toHaveCount(0);
});

test("基本情報とプロジェクト情報を別ページで入力し、マイページへ進める", async ({
  page,
}) => {
  let savedBasicProfile: Record<string, string> | undefined;
  await page.route("**/api/onboarding/me", async (route) => {
    if (route.request().method() === "POST") {
      savedBasicProfile = route.request().postDataJSON() as Record<
        string,
        string
      >;
      await route.fulfill({ json: { ok: true, next: "/onboarding/project/" } });
      return;
    }
    await route.fulfill({
      json: {
        email: "accepted@example.com",
        project: "学習サイト「アトラス」",
        profile: { displayName: "", bio: "", internalBio: "" },
      },
    });
  });
  await page.route("**/api/onboarding/project", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { ok: true, next: "/onboarding/tutorial/" },
      });
      return;
    }
    await route.fulfill({
      json: {
        email: "accepted@example.com",
        project: "学習サイト「アトラス」",
        internalBio: "",
      },
    });
  });
  await page.goto("onboarding/");

  await expect(
    page.getByRole("heading", { name: "基本情報を設定してください" }),
  ).toBeVisible();
  await expect(page.getByLabel("運営内自己紹介")).toHaveCount(0);
  await page.getByLabel("表示名").fill("山田 花子");
  await page.getByLabel("運営外自己紹介").fill("よろしくお願いします。");
  const projectNavigation = page.waitForURL(/\/onboarding\/project\/$/);
  await page
    .getByRole("button", { name: "基本情報を保存して次へ進む" })
    .click();
  await projectNavigation;
  await expect
    .poll(() => savedBasicProfile)
    .toMatchObject({
      displayName: "山田 花子",
      bio: "よろしくお願いします。",
    });

  await expect(
    page.getByRole("heading", { name: "プロジェクトの情報を設定してください" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "マイページ" })).toHaveAttribute(
    "href",
    "/admin/member-profile/",
  );
  await expect(page.getByLabel("プロジェクト内自己紹介")).toBeVisible();
});
