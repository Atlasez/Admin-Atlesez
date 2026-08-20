import { expect, test, type Page } from "@playwright/test";

const documentItem = {
  id: "doc-1",
  source_article_id: null,
  subject: "mathematics",
  category: "group-theory",
  locale: "ja",
  slug: "group-definition",
  title: "群の定義",
  summary: "群の定義を説明します。",
  concept_id: "math.group-theory.group-definition",
  body: "## 群\n\n群の本文です。",
  writing_memo: "参考文献を確認する",
  latex_engine: "uplatex",
  status: "draft",
  created_by: "alice@example.com",
  updated_by: "alice@example.com",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
  reviewed_at: null,
  published_at: null,
};

const comments = [
  {
    id: "comment-1",
    parent_comment_id: null,
    body: "@Bob 定義を確認してください。",
    created_by: "alice@example.com",
    author_display_name: "Alice",
    created_at: "2026-08-20T00:00:00.000Z",
    selection_start: null,
    selection_end: null,
    selection_text: null,
    selections: [],
    acknowledged_at: "2026-08-20T01:00:00.000Z",
    acknowledged_by: "alice@example.com",
    acknowledged_by_emails: ["alice@example.com"],
    unacknowledged_by_emails: ["bob@example.com"],
    resolved_at: null,
    resolved_by: null,
    action_actor_counts: {
      acknowledge: [
        {
          actor_email: "alice@example.com",
          actor_display_name: "Alice",
          count: 1,
        },
      ],
      unacknowledge: [
        { actor_email: "bob@example.com", actor_display_name: "Bob", count: 1 },
      ],
    },
  },
  {
    id: "reply-1",
    parent_comment_id: "comment-1",
    body: "確認しました。",
    created_by: "bob@example.com",
    author_display_name: "Bob",
    created_at: "2026-08-20T01:10:00.000Z",
    selection_start: null,
    selection_end: null,
    selection_text: null,
    selections: [],
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledged_by_emails: [],
    unacknowledged_by_emails: [],
    resolved_at: null,
    resolved_by: null,
  },
];

async function mockAdminApi(page: Page) {
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload: unknown = {};
    if (url.pathname === "/api/admin/editor/documents") {
      payload = {
        documents: [documentItem],
        mentionNames: ["Alice", "Bob"],
        scope: {
          email: "alice@example.com",
          subjects: ["mathematics"],
          isManager: true,
        },
      };
    } else if (url.pathname === "/api/admin/editor/documents/doc-1") {
      payload = { document: documentItem, comments };
    } else if (url.pathname.endsWith("/assets")) {
      payload = { assets: [] };
    } else if (url.pathname === "/api/admin/personal-workspace") {
      payload = { privateNote: "", updatedAt: null };
    } else if (url.pathname.endsWith("/revisions")) {
      payload = { revisions: [] };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

test("E-1〜E-5/E-13: 全5枠をボタンで切り替え、四辺移動とライブ別窓同期が使える", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  await expect(page.locator(".document-sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: /[123]画面/ })).toHaveCount(0);
  await expect(page.locator('[data-pane-tab="writing"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator('[data-pane-tab="memo"]').click();
  await page.locator('[data-pane-tab="media"]').click();
  await expect(page.locator(".editor-split > section:visible")).toHaveCount(5);
  for (const pane of ["writing", "preview", "media", "review", "memo"]) {
    await expect(
      page.locator(`[data-editor-pane="${pane}"] [data-pane-edge]`),
    ).toHaveCount(4);
  }
  await expect(
    page.locator('[data-editor-pane="memo"] [data-edge="top"]'),
  ).toHaveAttribute("aria-label", "メモ枠を上へ移動");

  const popupPromise = page.waitForEvent("popup");
  await page.locator('[data-pane-popout="writing"]').click();
  const popup = await popupPromise;
  await popup.locator("[data-body]").fill("## 別窓\n\n同期された本文");
  await popup.close();
  await expect(page.locator("[data-body]")).toHaveValue(
    "## 別窓\n\n同期された本文",
  );
});

test("E-6〜E-11: コメント操作、返信表示、メンション候補を復元する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  const thread = page.locator('[data-comment-context="comment-1"]');
  await expect(
    thread.getByRole("button", { name: "✓ 確認済み" }),
  ).toBeEnabled();
  await expect(thread.locator(".comment-action-count").first()).toHaveText("1");
  await expect(thread.locator(".comment-action-count").nth(1)).toHaveText("1");
  await expect(thread.locator(".comment-action-actor-list")).toHaveCount(0);

  await thread.click({ button: "right" });
  await expect(page.locator("[data-comment-context-menu]")).toContainText(
    "確認済み：Alice",
  );
  await expect(page.locator("[data-comment-context-menu]")).toContainText(
    "未反映：Bob",
  );
  await page.keyboard.press("Escape");

  await thread.locator("[data-toggle-replies]").click();
  const replyContent = thread.locator(".comment-reply .comment-content");
  await expect(replyContent).toBeVisible();
  expect(
    await replyContent.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeLessThan(14);

  await thread.locator("[data-open-reply]").click();
  await expect(thread.locator(".reply-target")).toHaveCount(0);
  const reply = thread.locator("[data-reply-body]");
  await reply.fill("@A");
  await expect(page.locator("#comment-mention-suggestions")).toBeVisible();
  await expect(page.locator("#comment-mention-suggestions")).toContainText(
    "@Alice",
  );
  await page.keyboard.press("Enter");
  await expect(reply).toHaveValue("@Alice ");
});
