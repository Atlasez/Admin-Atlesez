import { expect, test } from "@playwright/test";

const catalogEntry = (
  sourceArticleId: string,
  subject: string,
  slug: string,
  title: string,
  state: string,
  editorialDocumentId?: string,
) => ({
  locale: "ja",
  public_status: "published",
  source_article_id: sourceArticleId,
  subject,
  category: subject === "physics" ? "newtonian-mechanics" : "group-theory",
  slug,
  title,
  public_updated_at: "2026-09-01T00:00:00.000Z",
  state,
  editorial_document_id: editorialDocumentId,
});

test("一括登録は編集権限内の非テスト未登録記事だけを送る", async ({ page }) => {
  const bulkPosts: Array<{ url: string; body: unknown }> = [];
  const otherPosts: string[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/editor/documents") {
      await route.fulfill({
        json: {
          documents: [
            {
              id: "managed-document",
              source_article_id: "article-managed",
              subject: "mathematics",
              category: "group-theory",
              slug: "managed-article",
              title: "公開記事と連携済み",
              status: "draft",
              updated_at: "2026-09-02T00:00:00.000Z",
              published_at: null,
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
          scope: {
            email: "writer@example.com",
            subjects: ["mathematics"],
            coordinatorSubjects: ["physics"],
            allSubjects: false,
            isManager: false,
            isProjectLeader: false,
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/editor/catalog") {
      await route.fulfill({
        json: {
          catalog: [
            catalogEntry(
              "article-normal",
              "mathematics",
              "normal-article",
              "登録対象の記事",
              "unmanaged",
            ),
            catalogEntry(
              "article-test",
              "mathematics",
              "test-article",
              "【テスト記事】表示確認",
              "unmanaged",
            ),
            catalogEntry(
              "article-linked-later",
              "mathematics",
              "linked-later",
              "公開記事ID未紐付け",
              "needs-registration",
              "existing-document",
            ),
            catalogEntry(
              "article-coordinator",
              "physics",
              "coordinator-only",
              "調整担当のみの記事",
              "unmanaged",
            ),
            catalogEntry(
              "article-out-of-scope",
              "chemistry",
              "out-of-scope",
              "担当範囲外の記事",
              "unmanaged",
            ),
            catalogEntry(
              "article-managed",
              "mathematics",
              "managed-article",
              "公開記事と連携済み",
              "managed",
              "managed-document",
            ),
            catalogEntry(
              "article-duplicate",
              "physics",
              "duplicate-article",
              "重複確認の記事",
              "duplicate",
              "duplicate-document",
            ),
            catalogEntry(
              "article-unknown",
              "mathematics",
              "unknown-state",
              "状態未判定の記事",
              "editorial-only",
            ),
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/editor/catalog/register-bulk") {
      const body = request.postDataJSON() as {
        articles: Array<{
          locale: string;
          subject: string;
          category: string;
          slug: string;
        }>;
      };
      bulkPosts.push({ url: url.pathname, body });
      await route.fulfill({
        json: {
          attempted: body.articles.length,
          results: body.articles.map((article) => ({
            identityKey: `${article.locale}/${article.subject}/${article.category}/${article.slug}`,
            status: "registered",
            documentId: "new-editorial-document",
          })),
        },
      });
      return;
    }
    if (request.method() === "POST") otherPosts.push(url.pathname);
    await route.fulfill({ json: {} });
  });

  await page.goto("admin/articles/?verify=registration-candidates");

  const catalogOverview = page.locator("[data-catalog-overview]");
  await expect(catalogOverview).toHaveJSProperty("open", false);
  await expect(page.locator("[data-catalog-compact-summary]")).toContainText(
    "公開記事 8件 ・ 運営原稿あり 1件 ・ 運営原稿未登録 4件 ・ 紐付け要確認 3件",
  );
  await page.screenshot({
    path: "test-results/admin-articles-linkage-summary-collapsed.png",
    fullPage: true,
  });
  await catalogOverview.locator(":scope > summary").click();

  const bulkButton = page.locator("[data-register-unregistered]");
  await expect(bulkButton).toHaveText("未登録の運営原稿を一括作成（1件）");
  await expect(
    page.getByRole("heading", { name: "連携状況の詳細" }),
  ).toBeVisible();
  await expect(page.locator('[data-catalog-filter="managed"]')).toContainText(
    "1件",
  );
  await expect(
    page.locator('[data-catalog-filter="needs-registration"]'),
  ).toContainText("1件");
  await expect(page.locator('[data-catalog-filter="unmanaged"]')).toContainText(
    "4件",
  );
  await expect(page.locator('[data-catalog-filter="conflict"]')).toContainText(
    "1件",
  );
  await expect(page.locator('[data-catalog-filter="unknown"]')).toContainText(
    "1件",
  );
  await expect(page.locator("[data-catalog-summary]")).toContainText(
    "公開中の記事 8件",
  );
  const adoptedArticle = page.locator(
    '[data-list] article[data-document-id="managed-document"]',
  );
  await expect(
    adoptedArticle.locator(".article-status-group").nth(0),
  ).toContainText("下書き");
  await expect(
    adoptedArticle.locator(".article-status-group").nth(1),
  ).toContainText("公開中");
  const conflictCard = page.locator(
    '[data-list] article[aria-label*="重複確認の記事"]',
  );
  await expect(conflictCard).toContainText("重複・紐付け要確認");
  await expect(conflictCard).not.toContainText("連携状態を判定できない");
  await page.locator('[data-catalog-filter="conflict"]').click();
  await expect(page.locator("[data-list] .article")).toHaveCount(1);
  await expect(page.locator("[data-list]")).toContainText("重複・紐付け要確認");
  await page.locator('[data-catalog-filter="conflict"]').click();
  await page.locator('[data-catalog-filter="unknown"]').click();
  await expect(page.locator("[data-list] .article")).toHaveCount(1);
  await expect(page.locator("[data-list]")).toContainText(
    "連携状態を判定できない",
  );
  await page.locator('[data-catalog-filter="unknown"]').click();
  await page.screenshot({
    path: "test-results/admin-articles-status-redesign.png",
    fullPage: true,
  });
  await page.locator('[data-catalog-filter="needs-registration"]').click();
  await expect(page.locator("[data-list] .article")).toHaveCount(1);
  await expect(page.locator("[data-list]")).toContainText(
    "原稿あり・公開記事ID未連携",
  );
  await page.locator('[data-catalog-filter="needs-registration"]').click();
  await expect(page.locator("[data-list]")).toContainText("公開記事ID未連携");
  await expect(page.locator("[data-list]")).not.toContainText("テスト記事");
  await expect(page.locator("[data-list]")).not.toContainText(
    "担当範囲外の記事",
  );
  await expect(
    page.locator('[data-list] article[aria-label*="調整担当のみの記事"]'),
  ).toContainText("登録には編集権限が必要");
  await expect(
    page.locator(
      '[data-list] article[aria-label*="調整担当のみの記事"] [data-register-link]',
    ),
  ).toHaveCount(0);
  await expect(page.locator("[data-list] [data-register-link]")).toHaveCount(1);

  await bulkButton.click();

  await expect.poll(() => bulkPosts.length).toBe(1);
  expect(bulkPosts[0]?.url).toBe("/api/admin/editor/catalog/register-bulk");
  expect(bulkPosts[0]?.body).toEqual({
    articles: [
      {
        locale: "ja",
        subject: "mathematics",
        category: "group-theory",
        slug: "normal-article",
      },
    ],
  });
  expect(otherPosts).toEqual([]);
});

test("分野一覧とカテゴリ別の記事表示をプロトタイプに合わせて操作できる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => {
    localStorage.setItem("atlasez-prefs", JSON.stringify({ bg: "dark" }));
  });
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/editor/documents") {
      await route.fulfill({
        json: {
          documents: [],
          pagination: { hasMore: false, nextCursor: null },
          scope: {
            email: "manager@example.com",
            subjects: [],
            coordinatorSubjects: [],
            allSubjects: true,
            isManager: true,
            isProjectLeader: false,
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/editor/catalog") {
      await route.fulfill({
        json: {
          catalog: [
            ...Array.from({ length: 5 }, (_, index) =>
              catalogEntry(
                `group-${index + 1}`,
                "mathematics",
                `definition-${index + 1}`,
                `群論の記事${index + 1}`,
                "unmanaged",
              ),
            ),
            catalogEntry(
              "physics-article",
              "physics",
              "mechanics",
              "力学の記事",
              "unmanaged",
            ),
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("admin/articles/");
  const subjects = page.locator("[data-subject-quick]");
  await expect(subjects).toHaveCount(23);
  await expect(page.locator('[data-subject-quick="kanbun"]')).toContainText(
    "0件",
  );
  await expect(
    page.locator('[data-subject-quick="mathematics"]'),
  ).toContainText("5件");
  await expect(page.locator("[data-list] .article")).toHaveCount(5);
  await expect(page.locator("[data-list]")).toContainText("2カテゴリ");
  await page.screenshot({
    path: "test-results/admin-articles-horizontal-all-subjects.png",
    fullPage: true,
  });

  await page.locator('[data-subject-quick="mathematics"]').click();
  await expect(page.locator("[data-list] .article")).toHaveCount(4);
  await expect(
    page.locator("[data-list] .article-group__heading"),
  ).toContainText("群論");
  await expect(
    page.locator("[data-list] .article-group__heading"),
  ).toContainText("5件");
  await page.screenshot({
    path: "test-results/admin-articles-horizontal-subjects.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "残り1件を表示" }).click();
  await expect(page.locator("[data-list] .article")).toHaveCount(5);
  await page.getByRole("button", { name: "先頭4件に戻す" }).click();
  await expect(page.locator("[data-list] .article")).toHaveCount(4);

  await page.locator('[data-subject-quick="physics"]').click();
  await expect(page.locator("[data-list]")).toContainText("力学の記事");
  await expect(page.locator("[data-list] .article")).toHaveCount(1);
  await page.locator('[data-subject-quick="kanbun"]').click();
  await expect(page.locator("[data-list]")).toContainText(
    "条件に一致する原稿はありません。",
  );
  await page.getByRole("button", { name: "全分野に戻る" }).click();
  await expect(page.locator("[data-list] .article")).toHaveCount(5);
});
