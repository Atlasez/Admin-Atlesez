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
          documents: [],
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

  const bulkButton = page.locator("[data-register-unregistered]");
  await expect(bulkButton).toHaveText("未登録記事を一括登録（1件）");
  await expect(page.locator("[data-list]")).toContainText("公開記事ID未紐付け");
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
