import { expect, test, type Page } from "@playwright/test";

async function mockWorkspaceApi(page: Page) {
  let savedProfile: Record<string, string> | undefined;
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/profile") {
      if (request.method() === "PUT") {
        savedProfile = request.postDataJSON() as Record<string, string>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ profile: savedProfile }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile: {
            display_name: "山田 花子",
            avatar_url: "",
            university: "既存大学 既存学部",
            year: "修士課程1年",
            affiliation_type: "大学",
            country: "日本",
            timezone: "Asia/Tokyo",
            bio: "既存の自己紹介",
          },
          subjects: ["mathematics"],
          roles: ["編集者"],
        }),
      });
      return;
    }
    if (url.pathname === "/api/admin/personal-workspace") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: "alice@example.com",
          privateNote: "",
          privateNoteUpdatedAt: null,
          documents: [
            {
              id: "doc-1",
              subject: "mathematics",
              category: "algebra",
              title: "担当中の原稿",
              status: "draft",
              updated_at: "2026-08-20T00:00:00.000Z",
              published_at: null,
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not found" }),
    });
  });
  return () => savedProfile;
}

test("マイページの入力例、学年互換性、担当原稿カードの高さ", async ({
  page,
}) => {
  const getSavedProfile = await mockWorkspaceApi(page);
  await page.goto("admin/workspace/");

  await expect(page.locator('input[name="displayName"]')).toHaveAttribute(
    "placeholder",
    "例：山田 花子",
  );
  await expect(page.locator('input[name="university"]')).toHaveAttribute(
    "placeholder",
    "例：○○大学 ○○学部",
  );
  await expect(page.locator('input[name="affiliationType"]')).toHaveAttribute(
    "placeholder",
    "例：大学、研究機関、社会人",
  );
  await expect(page.locator('input[name="country"]')).toHaveAttribute(
    "placeholder",
    "例：日本",
  );
  await expect(page.locator('textarea[name="bio"]')).toHaveAttribute(
    "placeholder",
    "例：数学分野を担当しています。代数学と機械学習に興味があります。",
  );
  await expect(page.locator('input[name="university"]')).toHaveValue(
    "既存大学 既存学部",
  );

  const year = page.locator('select[name="year"]');
  await expect(year).toHaveValue("修士課程1年");
  await expect(year.locator('option[value="修士課程1年"]')).toHaveText(
    "修士課程1年（登録済み）",
  );
  await expect(year.locator('option[value="M1"]')).toHaveCount(1);
  await expect(year.locator('option[value="その他"]')).toHaveCount(1);
  await expect(year.locator('option[value=""]')).toHaveText("未選択・該当なし");

  await page.getByRole("button", { name: "基本情報を保存" }).click();
  await expect.poll(() => getSavedProfile()?.year).toBe("修士課程1年");

  const heights = await page.locator(".workspace-grid").evaluate(() => {
    const card = document.querySelector<HTMLElement>(".document-card")!;
    const note = document.querySelector<HTMLElement>(".personal-note")!;
    const documents = document.querySelector<HTMLElement>(".my-documents")!;
    return {
      card: card.getBoundingClientRect().height,
      note: note.getBoundingClientRect().height,
      documents: documents.getBoundingClientRect().height,
    };
  });
  expect(heights.card).toBeLessThan(140);
  expect(heights.documents).toBeLessThan(heights.note);
});
