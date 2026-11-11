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

test("公開記事との運営原稿連携を参照表示し、移行操作は表示しない", async ({
  page,
}) => {
  const retiredEndpoints: string[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/editor/documents") {
      await route.fulfill({
        json: {
          documents: [
            {
              id: "published-document",
              source_article_id: "article-linked",
              subject: "mathematics",
              category: "group-theory",
              slug: "linked-article",
              title: "群の定義",
              status: "draft",
              updated_at: "2026-08-30T00:00:00.000Z",
              published_at: "2026-08-30T00:00:00.000Z",
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
          scope: {
            email: "writer@example.com",
            subjects: ["mathematics"],
            coordinatorSubjects: [],
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
              "article-linked",
              "mathematics",
              "linked-article",
              "群の定義",
              "managed",
              "published-document",
            ),
          ],
        },
      });
      return;
    }
    if (url.pathname.startsWith("/api/admin/editor/catalog/")) {
      retiredEndpoints.push(url.pathname);
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("admin/articles/");
  const linkedArticle = page.locator(
    '[data-list] article[data-document-id="published-document"]',
  );
  await expect(linkedArticle).toBeVisible();
  await expect(
    linkedArticle.locator(".article-status-group").nth(0),
  ).toContainText("下書き");
  await expect(
    linkedArticle.locator(".article-status-group").nth(1),
  ).toContainText("公開中");
  await expect(
    linkedArticle.locator('[data-update-proposal-state="available"]'),
  ).toHaveText("更新案を作成");

  await expect(
    page.locator(
      "[data-catalog-overview], [data-catalog-diagnostics], [data-register-unregistered], [data-linkage]",
    ),
  ).toHaveCount(0);
  await expect(page.locator("[data-list]")).not.toContainText("運営連携");
  await expect(page.locator("[data-list]")).not.toContainText("運営原稿を作成");
  expect(retiredEndpoints).toEqual([]);
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
          documents: [
            ...Array.from({ length: 5 }, (_, index) => ({
              id: `math-document-${index + 1}`,
              source_article_id: `group-${index + 1}`,
              subject: "mathematics",
              category: "group-theory",
              slug: `definition-${index + 1}`,
              title: `群論の記事${index + 1}`,
              status: "draft",
              updated_at: "2026-09-02T00:00:00.000Z",
              published_at: null,
            })),
            {
              id: "physics-document",
              source_article_id: "physics-article",
              subject: "physics",
              category: "newtonian-mechanics",
              slug: "mechanics",
              title: "力学の記事",
              status: "draft",
              updated_at: "2026-09-02T00:00:00.000Z",
              published_at: null,
            },
          ],
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
