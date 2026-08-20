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

async function mockAdminApi(
  page: Page,
  scope = {
    email: "alice@example.com",
    subjects: ["mathematics"],
    isManager: true,
  },
) {
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload: unknown = {};
    if (url.pathname === "/api/admin/editor/documents") {
      payload = {
        documents: [documentItem],
        mentionNames: ["Alice", "Bob"],
        scope,
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

test("E-5: 記事設定には担当分野だけを表示する", async ({ page }) => {
  await mockAdminApi(page, {
    email: "alice@example.com",
    subjects: ["mathematics"],
    isManager: false,
  });
  await page.goto("./admin/editor/?new=1");

  const subject = page.locator('select[name="subject"]');
  await expect(subject).toHaveValue("mathematics");
  await expect(subject.locator("option")).toHaveCount(1);
  await expect(subject.locator("option")).toHaveText("数学");
});

test("E-4: 必須の記事設定にアスタリスクとrequired属性を表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  await expect(page.locator(".required-mark")).toHaveCount(6);
  for (const name of [
    "title",
    "summary",
    "subject",
    "category",
    "slug",
    "conceptId",
  ]) {
    await expect(page.locator(`[name="${name}"]`)).toHaveAttribute(
      "required",
      "",
    );
  }
});

test("E-6: ダークモードでMarkdown本文を読める配色にする", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-pref-bg", "dark"),
  );

  const colors = await page.locator("[data-body]").evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, text: style.color };
  });
  expect(colors.background).not.toBe("rgb(255, 255, 255)");
  expect(colors.background).not.toBe(colors.text);
});

test("E-7: 未保存の変更があると戻る・離脱を警告する", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");
  await page.locator('[name="title"]').fill("未保存のタイトル");

  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return !window.dispatchEvent(event);
  });
  expect(prevented).toBe(true);
});

test("E-8: 自動保存設定を利用者のブラウザ単位で保持する", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");
  const toggle = page.locator("[data-autosave-toggle]");

  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("atlasez-editor-autosave")),
    )
    .toBe("off");
  await page.reload();
  await expect(toggle).not.toBeChecked();
});

test("E-1: 固定ツールバーから作業ガイドを別タブで開ける", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  const guide = page.getByRole("link", { name: "作業の進め方 ↗" });
  await expect(guide).toHaveAttribute("href", "/admin/guide/?project=atlas");
  await expect(guide).toHaveAttribute("target", "_blank");
  await expect(guide).toBeVisible();
});

test("V-2: 査読担当者と依頼内容を選んで保存できる", async ({ page }) => {
  await mockAdminApi(page);
  await page.route("**/api/admin/editor/review-requests", async (route) => {
    await route.fulfill({
      json: {
        reviewers: [
          {
            email: "bob@example.com",
            displayName: "Bob",
            subjects: ["mathematics"],
          },
          {
            email: "carol@example.com",
            displayName: "Carol",
            subjects: ["physics"],
          },
        ],
      },
    });
  });
  let assignment: Record<string, unknown> | null = null;
  await page.route(
    "**/api/admin/editor/review-requests/doc-1",
    async (route) => {
      assignment = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("./admin/editor/?document=doc-1");

  await page.getByRole("button", { name: "査読を依頼する" }).click();
  const dialog = page.locator("[data-review-request-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("option")).toContainText([
    "担当者を選択",
    "この分野の担当者全員",
    "Bob",
  ]);
  await expect(dialog.locator("option", { hasText: "Carol" })).toHaveCount(0);
  await dialog
    .locator("[data-review-request-assignee]")
    .selectOption("bob@example.com");
  await dialog
    .locator("[data-review-request-note]")
    .fill("定義と例を重点確認してください");
  await dialog.getByRole("button", { name: "査読を依頼する" }).click();

  await expect
    .poll(() => assignment)
    .toEqual({
      reviewerEmail: "bob@example.com",
      note: "定義と例を重点確認してください",
    });
  await expect(page.locator("[data-save-message]")).toHaveText(
    "査読を依頼しました。",
  );
});

test("H-1: 保存版と現在の本文の差分を表示できる", async ({ page }) => {
  await mockAdminApi(page);
  await page.route(
    "**/api/admin/editor/documents/doc-1/revisions",
    async (route) => {
      await route.fulfill({
        json: {
          revisions: [
            {
              id: "revision-1",
              title: "群の定義",
              summary: "旧要約",
              body: "## 群\n\n古い本文です。",
              status: "draft",
              saved_by: "alice@example.com",
              saved_at: "2026-08-19T00:00:00.000Z",
            },
          ],
        },
      });
    },
  );
  await page.goto("./admin/editor/?document=doc-1");

  await expect(page.locator("[data-revision-before]")).toHaveCount(1);
  await expect(page.locator("[data-revision-after]")).toHaveValue("current");
  await expect(page.locator("[data-revision-diff]")).toContainText(
    "- 古い本文です。",
  );
  await expect(page.locator("[data-revision-diff]")).toContainText(
    "+ 群の本文です。",
  );
});

test("H-2: 版履歴を査読コメント枠から独立して配置する", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  const revisionWorkspace = page.locator(".revision-workspace");
  await expect(revisionWorkspace).toBeVisible();
  await expect(revisionWorkspace).toContainText("版履歴・差分確認");
  expect(
    await revisionWorkspace.evaluate((element) =>
      Boolean(element.closest(".review-panel")),
    ),
  ).toBe(false);
  await expect(page.locator(".editor-split + .revision-workspace")).toHaveCount(
    1,
  );
});

test("CM-1: コメントと返信の両方でレビュータグを挿入できる", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  await page
    .locator('.review-panel > .comment-tags [data-comment-tag="定義不足"]')
    .click();
  await expect(page.locator("[data-comment-body]")).toHaveValue("[定義不足] ");

  const thread = page.locator('[data-comment-context="comment-1"]');
  await thread.locator("[data-open-reply]").click();
  await thread.locator('[data-comment-tag="根拠確認"]').click();
  await expect(thread.locator("[data-reply-body]")).toHaveValue("[根拠確認] ");
});

test("CM-2: 本文の選択解除時に直前の選択内容を破棄する", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  const body = page.locator("[data-body]");
  await body.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(0, 4);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("[data-selection-action]")).toBeVisible();

  await body.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(0, 0);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("[data-selection-action]")).toBeHidden();
  await expect(page.locator("[data-comment-selection]")).toHaveText(
    "範囲未選択：記事全体へのコメントとして送信します。",
  );
});

test("CM-3: 本文から消えた元文章もコメントの引用として保持する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    const quotedComments = [
      {
        ...comments[0],
        selections: [
          {
            selection_start: 10,
            selection_end: 19,
            selection_text: "削除済みの元文章",
          },
        ],
      },
      ...comments.slice(1),
    ];
    await route.fulfill({
      json: { document: documentItem, comments: quotedComments },
    });
  });
  await page.goto("./admin/editor/?document=doc-1");

  const quote = page.locator(
    '[data-comment-context="comment-1"] .comment-quote',
  );
  await expect(quote).toContainText("対象の文章");
  await expect(quote).toContainText("削除済みの元文章");
  await expect(page.locator("[data-body]")).not.toHaveValue(/削除済みの元文章/);
});

test("CM-7: 親コメントの記事引用を返信へ添付して送信できる", async ({
  page,
}) => {
  await mockAdminApi(page);
  const quotedComments = [
    {
      ...comments[0],
      selections: [
        {
          selection_start: 5,
          selection_end: 10,
          selection_text: "群の本文です。",
        },
      ],
    },
    ...comments.slice(1),
  ];
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    await route.fulfill({
      json: { document: documentItem, comments: quotedComments },
    });
  });
  let replyPayload: Record<string, unknown> | null = null;
  await page.route(
    "**/api/admin/editor/documents/doc-1/comments",
    async (route) => {
      replyPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("./admin/editor/?document=doc-1");

  const thread = page.locator('[data-comment-context="comment-1"]');
  await thread.locator("[data-open-reply]").click();
  await thread.locator("[data-quote-reply]").click();
  await expect(page.locator("[data-selected-ranges]")).toContainText(
    "群の本文です。",
  );
  await thread.locator("[data-reply-body]").fill("引用箇所を修正しました。");
  await thread.locator("[data-send-reply]").click();

  await expect
    .poll(() => replyPayload)
    .toMatchObject({
      parentCommentId: "comment-1",
      body: "引用箇所を修正しました。",
      selections: [
        {
          start: 5,
          end: 10,
          text: "群の本文です。",
          source: "記事",
        },
      ],
    });
});

test("CK-1: 自分の確認済み反応を再クリックして取り消せる", async ({ page }) => {
  await mockAdminApi(page);
  let toggled = false;
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    const updatedComments = [
      {
        ...comments[0],
        acknowledged_by: toggled ? null : "alice@example.com",
        acknowledged_by_emails: toggled ? [] : ["alice@example.com"],
        action_actor_counts: {
          ...comments[0].action_actor_counts,
          acknowledge: toggled
            ? []
            : [
                {
                  actor_email: "alice@example.com",
                  actor_display_name: "Alice",
                  count: 1,
                },
              ],
        },
      },
      ...comments.slice(1),
    ];
    await route.fulfill({
      json: { document: documentItem, comments: updatedComments },
    });
  });
  await page.route(
    "**/api/admin/editor/documents/doc-1/comments/comment-1",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({ action: "acknowledge" });
      toggled = true;
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("./admin/editor/?document=doc-1");

  const action = page
    .locator('[data-comment-context="comment-1"]')
    .getByRole("button", { name: /確認済み/ });
  await expect(action).toHaveClass(/is-acted-by-me/);
  await action.click();
  await expect(action).not.toHaveClass(/is-acted-by-me/);
  await expect(action.locator(".comment-action-count")).toHaveText("0");
});

test("CK-3: 新規コメントは確認済み0件の対応待ちで表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    await route.fulfill({
      json: {
        document: documentItem,
        comments: [
          {
            ...comments[0],
            id: "new-comment",
            acknowledged_at: null,
            acknowledged_by: null,
            acknowledged_by_emails: [],
            unacknowledged_by_emails: [],
            action_actor_counts: { acknowledge: [], unacknowledge: [] },
          },
        ],
      },
    });
  });
  await page.goto("./admin/editor/?document=doc-1");

  const thread = page.locator('[data-comment-context="new-comment"]');
  await expect(thread.locator(".thread-status")).toHaveText("対応待ち");
  await expect(thread.locator(".comment-action-count")).toHaveText(["0", "0"]);
  await expect(
    thread.getByRole("button", { name: /確認済み/ }),
  ).not.toHaveClass(/is-acted-by-me/);
});

test("IM-1: 認証付き画像を取得してPreviewへBlob表示する", async ({ page }) => {
  await mockAdminApi(page);
  const assetId = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    await route.fulfill({
      json: {
        document: {
          ...documentItem,
          body: `## 図\n\n![群の図](asset://${assetId})`,
        },
        comments,
      },
    });
  });
  await page.route(
    "**/api/admin/editor/documents/doc-1/assets",
    async (route) => {
      await route.fulfill({
        json: {
          assets: [
            {
              id: assetId,
              filename: "group.gif",
              mediaType: "image/gif",
              bytes: 34,
              alt: "群の図",
              latexName: "group-diagram",
              createdAt: "2026-08-20T00:00:00.000Z",
              marker: `asset://${assetId}`,
            },
          ],
        },
      });
    },
  );
  await page.route(`**/api/admin/editor/assets/${assetId}`, async (route) => {
    await route.fulfill({
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        "base64",
      ),
    });
  });
  await page.goto("./admin/editor/?document=doc-1");

  const previewImage = page.locator(`[data-editorial-asset="${assetId}"]`);
  await expect(previewImage).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      previewImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1);
  await expect(page.locator("[data-media-status]")).toHaveText("1件の素材");
});

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
