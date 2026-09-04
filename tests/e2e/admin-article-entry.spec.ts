import { test, expect } from "@playwright/test";

test.describe("A/D 原稿一覧の作業導線", () => {
  test("運営トップを指定どおり4グループに分け、プロジェクト側マイページを表示しない", async ({
    page,
  }) => {
    await page.goto("admin/atlas/");

    const groups = page.locator("[data-menu-group]");
    await expect(groups).toHaveCount(4);
    await expect(groups.nth(0).locator(".project-links > a")).toHaveCount(3);
    await expect(groups.nth(1).locator(".project-links > a")).toHaveCount(4);
    await expect(groups.nth(2).locator(".project-links > a")).toHaveCount(4);
    await expect(
      groups.nth(2).getByRole("link", { name: /諸手続きを開く/ }),
    ).toHaveAttribute("href", "/admin/procedures/?project=atlas");
    await expect(groups.nth(3).locator(".project-links > a")).toHaveCount(1);
    await expect(
      groups.nth(2).getByRole("link", { name: /規則を開く/ }),
    ).toHaveAttribute("href", "/admin/rules/");
    await expect(
      page.locator("[data-admin-atlas-menu] .menu-groups"),
    ).not.toContainText("マイページ");
    await expect(page.locator(".menu-group-heading > span")).toHaveText([
      "・",
      "・",
      "・",
      "・",
    ]);
    await expect(page.locator(".menu-group-heading p")).toHaveCount(0);
    await expect(page.locator(".project-utility")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /閲覧統計を開く/ }),
    ).toHaveCount(0);
  });

  test("規則ページの主要セクションと作業の進め方への導線を表示する", async ({
    page,
  }) => {
    await page.goto("admin/rules/");

    await expect(
      page.getByRole("heading", { name: "規則", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rule-section")).toHaveCount(6);
    await expect(
      page.getByRole("link", { name: /作業の進め方を確認する/ }),
    ).toHaveAttribute("href", "/admin/guide/");
  });

  test("プロジェクトHomeでは原稿一覧だけを入口にする", async ({ page }) => {
    await page.goto("admin/atlas/");

    await expect(
      page.getByRole("link", { name: /原稿一覧を開く/ }),
    ).toHaveAttribute("href", "/admin/articles/");
    await expect(page.getByRole("link", { name: /新規記事作成/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /加筆・修正/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^査読/ })).toHaveCount(0);
  });

  test("D-1: 原稿一覧に3つの作業入口を表示し、カード内の旧ボタンは表示しない", async ({
    page,
  }) => {
    await page.goto("admin/articles/");

    await expect(page.locator(".workflow-card")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /新規記事作成/ }),
    ).toHaveAttribute("href", "/admin/editor/?new=1&from=articles");
    await expect(
      page.getByRole("button", { name: /加筆・修正/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /フィードバック/ }),
    ).toBeVisible();
    await expect(page.locator("[data-workflow-action]")).toHaveCount(2);
    await expect(page.locator("[data-workflow-filter]")).toHaveValue("all");
    await expect(page.locator(".article-view-tabs")).toHaveCount(0);
    await expect(page.locator(".header-actions")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /編集・フィードバックを開く/ }),
    ).toHaveCount(0);
  });

  test("D-2: 原稿一覧で現在編集中のメンバーと項目を確認できる", async ({
    page,
  }) => {
    await page.route("**/api/admin/editor/documents", async (route) => {
      await route.fulfill({
        json: {
          scope: { email: "alice@example.com" },
          documents: [
            {
              id: "presence-doc",
              subject: "mathematics",
              category: "algebra",
              title: "編集中の記事",
              status: "draft",
              updated_at: "2026-08-28T00:00:00.000Z",
              published_at: null,
              active_editors: [
                {
                  sessionId: "session-1",
                  email: "bob@example.com",
                  displayName: "山田花子",
                  field: "body",
                },
              ],
            },
          ],
        },
      });
    });

    await page.goto("admin/articles/?verify=presence");

    const card = page.locator('[data-document-id="presence-doc"]');
    await expect(card).toContainText("編集中：山田花子（本文）");
    await expect(card.locator(".badge.editing")).toHaveText(/1人が編集中/);
    await expect(card).toHaveAttribute("aria-label", /編集中/);
  });

  test("D-3: 原稿一覧を分野とカテゴリで絞り込める", async ({ page }) => {
    await page.route("**/api/admin/editor/documents", async (route) => {
      await route.fulfill({
        json: {
          scope: { email: "alice@example.com" },
          documents: [
            {
              id: "ring-doc",
              subject: "mathematics",
              category: "ring-theory",
              title: "環論の記事",
              status: "draft",
              updated_at: "2026-08-28T00:00:00.000Z",
              published_at: null,
            },
            {
              id: "group-doc",
              subject: "mathematics",
              category: "group-theory",
              title: "群論の記事",
              status: "draft",
              updated_at: "2026-08-27T00:00:00.000Z",
              published_at: null,
            },
            {
              id: "physics-doc",
              subject: "physics",
              category: "newtonian-mechanics",
              title: "力学の記事",
              status: "draft",
              updated_at: "2026-08-26T00:00:00.000Z",
              published_at: null,
            },
          ],
        },
      });
    });

    await page.goto("admin/articles/?verify=taxonomy-filter");

    await expect(page.locator("[data-subject] option")).toHaveCount(24);
    await expect(page.locator("[data-category] option")).toContainText([
      "すべてのカテゴリ",
      "環論",
    ]);
    await page.locator("[data-subject]").selectOption("mathematics");
    await expect(page.locator("[data-list] .article")).toHaveCount(2);
    await expect(page.locator("[data-list]")).toContainText("環論の記事");
    await expect(page.locator("[data-list]")).toContainText("群論の記事");
    await expect(page.locator("[data-list]")).not.toContainText("力学の記事");

    await page.locator("[data-category]").selectOption("ring-theory");
    await expect(page.locator("[data-list] .article")).toHaveCount(1);
    await expect(page.locator("[data-list]")).toContainText("環論の記事");
    await expect(page.locator("[data-list]")).not.toContainText("群論の記事");
    await expect(page.locator("[data-count]")).toHaveText("1件");

    await page.locator("[data-subject]").selectOption("all");
    await expect(page.locator("[data-category]")).toHaveValue("ring-theory");
    await expect(page.locator("[data-list] .article")).toHaveCount(1);
  });

  test("D-4: 下書きをアーカイブし、30日以内なら一覧から復元できる", async ({
    page,
  }) => {
    const activeId = "11111111-1111-4111-8111-111111111111";
    const archivedId = "22222222-2222-4222-8222-222222222222";
    let activeArchived = false;
    await page.route("**/api/admin/editor/documents**", async (route) => {
      await route.fulfill({
        json: {
          scope: { email: "alice@example.com" },
          documents: [
            {
              id: activeId,
              subject: "mathematics",
              category: "algebra",
              title: "整理前の下書き",
              status: "draft",
              created_by: "alice@example.com",
              updated_at: "2026-08-28T00:00:00.000Z",
              published_at: null,
              ...(activeArchived
                ? {
                    archived_at: "2026-08-29T00:00:00.000Z",
                    archive_expires_at: "2026-09-28T00:00:00.000Z",
                  }
                : {}),
            },
            {
              id: archivedId,
              subject: "mathematics",
              category: "algebra",
              title: "保管中の下書き",
              status: "draft",
              created_by: "alice@example.com",
              updated_at: "2026-08-27T00:00:00.000Z",
              published_at: null,
              archived_at: "2026-08-28T00:00:00.000Z",
              archive_expires_at: "2026-09-27T00:00:00.000Z",
            },
          ],
        },
      });
    });
    await page.route(
      `**/api/admin/editor/documents/${activeId}/archive`,
      async (route) => {
        activeArchived = true;
        await route.fulfill({
          json: {
            ok: true,
            archived: true,
            archived_at: "2026-08-29T00:00:00.000Z",
            archive_expires_at: "2026-09-28T00:00:00.000Z",
          },
        });
      },
    );
    await page.route(
      `**/api/admin/editor/documents/${activeId}/unarchive`,
      async (route) => {
        activeArchived = false;
        await route.fulfill({
          json: {
            ok: true,
            archived: false,
            archived_at: null,
            archive_expires_at: null,
          },
        });
      },
    );

    await page.goto("admin/articles/?verify=archive");
    await expect(page.locator("[data-archive]")).toHaveValue("active");
    await expect(page.locator("[data-list] .article")).toHaveCount(1);
    await expect(page.locator("[data-list]")).toContainText("整理前の下書き");
    await expect(page.locator("[data-list]")).not.toContainText(
      "保管中の下書き",
    );

    await page
      .locator(
        `[data-document-id="${activeId}"] [data-archive-action="archive"]`,
      )
      .click();
    await expect(page).toHaveURL(/admin\/articles\/\?verify=archive$/);
    await expect(page.locator("[data-list]")).not.toContainText(
      "整理前の下書き",
    );

    await page.locator("[data-archive]").selectOption("archived");
    await expect(page.locator("[data-list] .article")).toHaveCount(2);
    await expect(page.locator("[data-list]")).toContainText("整理前の下書き");
    await expect(page.locator("[data-list]")).toContainText("保管中の下書き");
    await page
      .locator(
        `[data-document-id="${activeId}"] [data-archive-action="unarchive"]`,
      )
      .click();
    await expect(page.locator("[data-list] .article")).toHaveCount(1);
    await expect(page.locator("[data-list]")).toContainText("保管中の下書き");
    await expect(page.locator("[data-list]")).not.toContainText(
      "整理前の下書き",
    );
  });

  test("V-1 フィードバックは原稿一覧で未確認に絞り、自分への依頼を優先する", async ({
    page,
  }) => {
    await page.route("**/api/admin/editor/documents", async (route) => {
      await route.fulfill({
        json: {
          scope: { email: "alice@example.com" },
          documents: [
            {
              id: "other-review",
              subject: "physics",
              category: "mechanics",
              slug: "other-review",
              title: "別の担当者への査読",
              status: "in-review",
              updated_at: "2026-08-20T02:00:00.000Z",
              published_at: null,
              reviewer_email: "bob@example.com",
            },
            {
              id: "my-review",
              subject: "mathematics",
              category: "algebra",
              slug: "my-review",
              title: "自分への査読依頼",
              status: "in-review",
              updated_at: "2026-08-20T01:00:00.000Z",
              published_at: null,
              reviewer_email: "alice@example.com",
            },
            {
              id: "approved",
              subject: "mathematics",
              category: "algebra",
              slug: "approved",
              title: "査読済み原稿",
              status: "approved",
              updated_at: "2026-08-20T03:00:00.000Z",
              published_at: null,
            },
            {
              id: "draft",
              subject: "mathematics",
              category: "algebra",
              slug: "draft",
              title: "まだ下書きの原稿",
              status: "draft",
              updated_at: "2026-08-20T04:00:00.000Z",
              published_at: null,
            },
          ],
        },
      });
    });

    await page.goto("admin/articles/?mode=review#article-list");

    await expect(page).toHaveURL(
      /\/admin\/articles\/\?mode=review#article-list$/,
    );
    await expect(page.locator("[data-status]")).toHaveValue("all");
    await expect(page.locator("[data-workflow-filter]")).toHaveValue("review");
    await expect(page.locator("[data-list] .article")).toHaveCount(3);
    await expect(page.locator("[data-list] .article").first()).toContainText(
      "自分への査読依頼",
    );
    await expect(page.locator("[data-list]")).not.toContainText("査読済み原稿");
    await expect(page.locator("[data-list]")).toContainText("まだ下書きの原稿");

    await page.goto("admin/review/");
    await expect(page).toHaveURL(
      /\/admin\/articles\/\?mode=review#article-list$/,
    );
  });
});

test.describe("A-2 管理導線", () => {
  test("管理タブは管理トップへ直接遷移する", async ({ page }) => {
    await page.goto("admin/atlas/");

    await expect(page.locator(".admin-management-menu")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "管理", exact: true }),
    ).toHaveAttribute("href", "/admin/manage/?project=atlas");
  });
});
