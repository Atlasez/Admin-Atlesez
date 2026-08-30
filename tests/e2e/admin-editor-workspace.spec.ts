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
    tags: ["定義不足"],
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
    tags: ["根拠確認"],
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledged_by_emails: [],
    unacknowledged_by_emails: [],
    action_actor_counts: {
      acknowledge: [
        {
          actor_email: "carol@example.com",
          actor_display_name: "Carol",
          count: 1,
        },
      ],
      unacknowledge: [],
    },
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
  document = documentItem,
) {
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload: unknown = {};
    if (url.pathname === "/api/admin/editor/documents") {
      payload = {
        documents: [document],
        mentionNames: ["Alice", "Bob"],
        scope,
      };
    } else if (url.pathname === "/api/admin/editor/documents/doc-1") {
      payload = { document, comments };
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

  const settings = page.locator("details.metadata");
  const personalNotebook = page.locator("details.personal-notebook");
  await expect(settings.locator(":scope > summary")).toHaveText("記事設定");
  await expect(personalNotebook.locator("summary")).toHaveText("自分用メモ帳");
  await settings.locator(":scope > summary").click();
  await expect(settings).not.toHaveAttribute("open", "");
  await personalNotebook.locator("summary").click();
  await expect(personalNotebook).toHaveAttribute("open", "");
});

test("概念名を選ぶと内部IDが自動設定され、利用者はIDを覚えなくてよい", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  await page.locator('select[name="category"]').selectOption("group-theory");
  const picker = page.locator("[data-concept-picker]");
  await expect(
    picker.locator('option[value="math.group-theory.group-definition"]'),
  ).toHaveCount(1);
  await picker.selectOption("math.group-theory.group-definition");
  await expect(page.locator('[name="conceptId"]')).toHaveValue(
    "math.group-theory.group-definition",
  );
  await expect(page.locator("[data-concept-id-preview]")).toContainText(
    "内部ID：math.group-theory.group-definition",
  );
  await expect(page.locator(".concept-id-advanced")).not.toHaveAttribute(
    "open",
  );
});

test("フィードバック済みは公開審査の承認前に状態選択できない", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  const status = page.locator('[name="status"]');
  await expect(status).toHaveValue("draft");
  await expect(status.locator('option[value="approved"]')).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(page.locator("[data-status-help]")).toContainText(
    "公開審査で承認されたときに自動で設定",
  );
});

test("公開Runの失敗原因・CIログ・再試行導線を表示する", async ({ page }) => {
  const failedDocument = {
    ...documentItem,
    status: "approved" as const,
    publication_pr_number: 321,
    publication_pr_url: "https://github.com/Atlasez/Atlasez01/pull/321",
    publication_branch: "editorial/published-doc-1-run-1",
    publication_action: "publish" as const,
    publication_run: {
      id: "run-1",
      state: "failed",
      action: "publish" as const,
      attempt: 3,
      error_code: "ci_failed",
      error_message: "CIが失敗しました（content-check）。",
      failure_kind: "ci",
      check_name: "content-check",
      check_url: "https://github.com/Atlasez/Atlasez01/actions/runs/123",
      diagnostic_url: "https://github.com/Atlasez/Atlasez01/pull/321",
    },
  };
  await mockAdminApi(page, undefined, failedDocument);
  await page.goto("./admin/editor/?document=doc-1");

  await expect(page.locator("[data-publication-run]")).toContainText(
    "CIが失敗しました（content-check）。［原因：CI］（ci_failed）",
  );
  await expect(page.locator("[data-publication-link] a")).toHaveCount(2);
  await expect(page.locator("[data-publication-link] a").nth(0)).toHaveText(
    "公開PRを確認",
  );
  await expect(page.locator("[data-publication-link] a").nth(1)).toHaveText(
    "CIログ（content-check）",
  );
  await expect(
    page.locator("[data-publication-link] a").nth(1),
  ).toHaveAttribute(
    "href",
    "https://github.com/Atlasez/Atlasez01/actions/runs/123",
  );
  await expect(
    page.getByRole("button", { name: "公開処理を再試行" }),
  ).toBeVisible();
});

test("新規原稿では存在しない公開審査URLを呼ばず、枠の高さを調整できる", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.route(
    "**/api/admin/editor/documents//publication-review",
    async (route) => {
      await route.fulfill({ status: 404, json: { error: "Not found" } });
    },
  );
  await page.goto("./admin/editor/?new=1");

  await expect(page.locator(".document-form")).toBeVisible();
  await expect(page.locator("[data-save-message]")).not.toContainText(
    "サーバーエラーが発生しました",
  );

  const handle = page.locator('[data-pane-resize="writing"]');
  await expect(handle).toHaveAttribute("title", /ドラッグして本文枠/);
  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "240");
  await expect(page.locator('[data-editor-pane="writing"]')).toHaveClass(
    /is-pane-resized/,
  );
  await handle.press("ArrowDown");
  await expect(handle).toHaveAttribute("aria-valuenow", "264");
  await handle.dblclick();
  await expect(page.locator('[data-editor-pane="writing"]')).not.toHaveClass(
    /is-pane-resized/,
  );
});

test("長文のDirective境界でも本文の重ね合わせ表示が行順を崩さない", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  const source = [
    ...Array.from({ length: 350 }, (_, index) => `本文 ${index + 1}`),
    ":::",
    "",
    "",
    "::: proof",
    "",
    "証明本文です。",
    ":::",
  ].join("\n");
  await page.locator("textarea[data-body]").evaluate((element, value) => {
    (element as HTMLTextAreaElement).value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, source);

  await expect(page.locator("[data-locked-range-markup]")).toBeHidden();
  await expect(page.locator("[data-locked-range-markup]")).toHaveText("");
  await expect(
    page.locator(".cm-line").filter({ hasText: "::: proof" }),
  ).toHaveCount(1);
});

test("本文欄を拡張してもCodeMirrorが欄全体を使う", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  const handle = page.locator('[data-pane-resize="writing"]');
  await handle.press("End");
  await expect(page.locator('[data-editor-pane="writing"]')).toHaveClass(
    /is-pane-resized/,
  );

  const heights = await page
    .locator("[data-body-surface]")
    .evaluate((surface) => ({
      surface: surface.clientHeight,
      codemirror:
        surface.querySelector<HTMLElement>(".body-codemirror")?.clientHeight ??
        0,
    }));
  expect(Math.abs(heights.surface - heights.codemirror)).toBeLessThanOrEqual(1);
});

test("E-12: 1段目の枠を上へ移動すると単独行を全面表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  const writing = page.locator('[data-editor-pane="writing"]');
  const preview = page.locator('[data-editor-pane="preview"]');
  const review = page.locator('[data-editor-pane="review"]');
  await writing.locator('[data-edge="top"]').click();

  await expect(writing).toHaveCSS("grid-row-start", "1");
  await expect(writing).toHaveCSS("grid-column-start", "1");
  await expect(writing).toHaveCSS("grid-column-end", "span 2");
  await expect(preview).toHaveCSS("grid-row-start", "2");
  await expect(preview).toHaveCSS("grid-column-start", "1");
  await expect(review).toHaveCSS("grid-row-start", "2");
  await expect(review).toHaveCSS("grid-column-start", "2");
});

test("E-4: 必須の記事設定にアスタリスクとrequired属性を表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?new=1");

  await expect(page.locator(".required-mark")).toHaveCount(6);
  await expect(page.locator(".field-heading > .required-mark")).toHaveCount(6);
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

  const colors = await page
    .locator('.cm-content[aria-label="本文（Markdown）"]')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        text: style.color,
        caret: style.caretColor,
      };
    });
  expect(colors.background).not.toBe("rgb(255, 255, 255)");
  expect(colors.text).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.caret).toBe("rgb(255, 255, 255)");

  const lockedMarkColors = await page
    .locator("[data-locked-range-markup]")
    .evaluate((element) => {
      element.innerHTML = '<mark class="locked-range-mark">ロック範囲</mark>';
      const mark = element.querySelector("mark");
      if (!mark) return null;
      const style = getComputedStyle(mark);
      return {
        background: style.backgroundColor,
        border: style.borderLeftColor,
      };
    });
  expect(lockedMarkColors?.background).not.toBe("rgb(255, 255, 0)");
  expect(lockedMarkColors?.border).toBe("rgb(255, 122, 135)");
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

test("E-14: 編集画面から戻ると編集・フィードバック一覧へ移動する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/articles/");
  await page.goto("./admin/editor/?new=1");
  await expect(page.locator("[data-editor-workspace]")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/articles\/?(?:$|#)/);
});

test("既存記事を一覧から開いても編集画面は先頭から表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.goto("./admin/articles/");
  await expect(page.locator('[data-document-id="doc-1"]')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.locator('[data-document-id="doc-1"]').click();

  await expect(page).toHaveURL(/\/admin\/editor\/\?document=doc-1/);
  await expect(page.locator('[name="title"]')).toHaveValue("群の定義");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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

test("V-2: フィードバック担当者と依頼内容を選んで保存できる", async ({
  page,
}) => {
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

  await page.getByRole("button", { name: "フィードバックを依頼する" }).click();
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
  await dialog
    .getByRole("button", { name: "フィードバックを依頼する" })
    .click();

  await expect
    .poll(() => assignment)
    .toEqual({
      reviewerEmails: ["bob@example.com"],
      note: "定義と例を重点確認してください",
    });
  await expect(page.locator("[data-save-message]")).toHaveText(
    "フィードバックを依頼しました。",
  );
});

test("V-3: 依頼先未選択でもキャンセルできる", async ({ page }) => {
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
        ],
      },
    });
  });
  await page.goto("./admin/editor/?document=doc-1");

  await page.getByRole("button", { name: "フィードバックを依頼する" }).click();
  const dialog = page.locator("[data-review-request-dialog]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).not.toBeVisible();
});

test("V-4: 確認済み操作後も展開した返信を保持する", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("./admin/editor/?document=doc-1");

  const thread = page.locator(".comment-thread").first();
  await thread.locator("[data-toggle-replies]").click();
  await expect(thread.locator("[data-replies]")).not.toHaveAttribute(
    "hidden",
    "",
  );
  await thread.locator("[data-comment-action=acknowledge]").first().click();
  await expect(thread.locator("[data-replies]")).not.toHaveAttribute(
    "hidden",
    "",
  );
  await expect(thread.locator("[data-toggle-replies]")).toHaveText(
    "返信を隠す",
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
  await expect(page.locator(".revision-diff-line.is-removed")).toContainText(
    "- 古い本文です。",
  );
  await expect(page.locator(".revision-diff-line.is-added")).toContainText(
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

test("CM-1: コメントと返信に本文とは独立したタグを付与・絞り込みできる", async ({
  page,
}) => {
  await mockAdminApi(page);
  let commentPayload: Record<string, unknown> | null = null;
  await page.route(
    "**/api/admin/editor/documents/doc-1/comments",
    async (route) => {
      commentPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("./admin/editor/?document=doc-1");

  const mainTag = page.locator(
    '.review-panel > .comment-tags [data-comment-tag="定義不足"]',
  );
  await mainTag.click();
  await expect(mainTag).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-comment-body]").fill("定義を補足してください。");
  await page.locator("[data-send-comment]").click();
  await expect
    .poll(() => commentPayload)
    .toMatchObject({
      body: "定義を補足してください。",
      tags: ["定義不足"],
    });
  expect((commentPayload as unknown as { body: string }).body).not.toContain(
    "[定義不足]",
  );

  const thread = page.locator('[data-comment-context="comment-1"]');
  await thread.locator("[data-open-reply]").click();
  const replyTag = thread.locator('[data-comment-tag="根拠確認"]');
  await replyTag.click();
  await expect(replyTag).toHaveAttribute("aria-pressed", "true");
  await expect(thread.locator("[data-reply-body]")).toHaveValue("");

  await page.locator("[data-comment-tag-filter]").selectOption("根拠確認");
  await expect(
    page.locator('[data-comment-context="comment-1"]'),
  ).toBeVisible();
  await page.locator("[data-comment-tag-filter]").selectOption("数式確認");
  await expect(page.locator("[data-comment-list]")).toContainText(
    "コメントはありません",
  );
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
  await expect(page.locator("[data-selection-action]")).toBeHidden();
  await expect(page.locator("[data-selected-ranges]")).toBeVisible();
  await expect(page.locator("[data-comment-selection]")).toContainText(
    "最初の選択範囲を自動で添付しました",
  );

  await body.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(0, 0);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("[data-selection-action]")).toBeHidden();
  await expect(page.locator("[data-comment-selection]")).toContainText(
    "選択範囲を1件添付中",
  );

  await body.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(5, 9);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("[data-selection-action]")).toBeVisible();
  await page.locator("[data-comment-body]").click();
  await expect(page.locator("[data-selection-action]")).toBeHidden();
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
  await quote.getByRole("button", { name: "本文で確認" }).click();
  await expect(page.locator("[data-save-message]")).toHaveText(
    "元の文章は変更または削除されています。コメントには当時の内容を保持しています。",
  );
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

test("CK-4: autosave OFFの未保存本文をコメント状態変更で保存・破棄しない", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("atlasez-editor-autosave", "off"),
  );
  await mockAdminApi(page);
  let documentPatchCount = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "PATCH" &&
      url.pathname === "/api/admin/editor/documents/doc-1"
    )
      documentPatchCount += 1;
  });
  await page.goto("./admin/editor/?document=doc-1");

  const body = page.locator("[data-body]");
  const unsavedBody = `${documentItem.body}\n\n未保存の追記です。`;
  await body.fill(unsavedBody);
  await page
    .locator('[data-comment-context="comment-1"]')
    .getByRole("button", { name: /確認済み/ })
    .click();

  await expect(body).toHaveValue(unsavedBody);
  expect(documentPatchCount).toBe(0);
  const prevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return !window.dispatchEvent(event);
  });
  expect(prevented).toBe(true);
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
  await expect(thread.locator(".comment-action-count")).toHaveText([
    "0",
    "0",
    "0",
    "0",
  ]);
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

  const previewImage = page
    .locator("[data-preview]")
    .locator(`[data-editorial-asset="${assetId}"]`);
  await expect(previewImage).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      previewImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1);
  await expect(page.locator("[data-media-status]")).toHaveText("1件の素材");
});

test("IM-2: uploadから保存・参照解除・asset削除まで一連で成功する", async ({
  page,
}) => {
  const documentId = "22222222-2222-4222-8222-222222222222";
  const assetId = "33333333-3333-4333-8333-333333333333";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  let savedDocument: typeof documentItem | null = null;
  let assets: Array<Record<string, unknown>> = [];
  let deleteSucceeded = false;
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/editor/documents") {
      if (request.method() === "POST") {
        const payload = request.postDataJSON();
        savedDocument = {
          ...documentItem,
          ...payload,
          id: documentId,
          source_article_id: null,
          concept_id: payload.conceptId,
          writing_memo: payload.writingMemo,
          latex_engine: payload.latexEngine,
        };
        await route.fulfill({
          status: 201,
          json: { ok: true, id: documentId },
        });
      } else
        await route.fulfill({
          json: {
            documents: savedDocument ? [savedDocument] : [],
            mentionNames: [],
            scope: {
              email: "alice@example.com",
              subjects: ["mathematics"],
              isManager: true,
            },
          },
        });
      return;
    }
    if (url.pathname === `/api/admin/editor/documents/${documentId}`) {
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON();
        savedDocument = { ...savedDocument!, ...payload, body: payload.body };
        await route.fulfill({ json: { ok: true } });
      } else
        await route.fulfill({
          json: { document: savedDocument, comments: [] },
        });
      return;
    }
    if (url.pathname === `/api/admin/editor/documents/${documentId}/assets`) {
      if (request.method() === "POST") {
        assets = [
          {
            id: assetId,
            filename: "diagram.png",
            mediaType: "image/png",
            bytes: png.byteLength,
            alt: "図",
            latexName: "diagram",
            createdAt: "2026-08-21T00:00:00.000Z",
            marker: `asset://${assetId}`,
          },
        ];
        await route.fulfill({ status: 201, json: { asset: assets[0] } });
      } else await route.fulfill({ json: { assets } });
      return;
    }
    if (url.pathname === `/api/admin/editor/assets/${assetId}`) {
      if (request.method() === "DELETE") {
        if (savedDocument?.body.includes(`asset://${assetId}`)) {
          await route.fulfill({
            status: 409,
            json: {
              error:
                "本文から画像参照を削除して原稿を保存してから、素材を削除してください。",
            },
          });
        } else {
          assets = [];
          deleteSucceeded = true;
          await route.fulfill({ json: { ok: true } });
        }
      } else
        await route.fulfill({
          contentType: "image/png",
          body: png,
        });
      return;
    }
    if (url.pathname === "/api/admin/personal-workspace") {
      await route.fulfill({ json: { privateNote: "", updatedAt: null } });
      return;
    }
    if (url.pathname.endsWith("/revisions")) {
      await route.fulfill({ json: { revisions: [] } });
      return;
    }
    if (url.pathname.endsWith("/publication-review")) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  await page.goto("./admin/editor/?new=1");
  await page.locator('[name="title"]').fill("画像フローのテスト");
  await page.locator('[name="summary"]').fill("画像の一連操作を確認します。");
  await page.locator('[name="slug"]').fill("image-flow-test");
  await page.locator(".concept-id-advanced summary").click();
  await page
    .locator('[name="conceptId"]')
    .fill("math.group-theory.image-flow-test");
  await page.locator("[data-body]").fill("## 画像");
  await page.locator("[data-save-document]").click();
  await page
    .locator("[data-progress-dialog]")
    .getByRole("button", { name: "編集を続ける" })
    .click();

  await page.locator('[data-pane-tab="media"]').click();
  await page.locator("[data-media-alt]").fill("図");
  await page.locator("[data-media-input]").setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".media-item-name b")).toHaveText("diagram.png");
  const previewImage = page
    .locator(`[data-editorial-asset="${assetId}"]`)
    .last();
  await expect(previewImage).toHaveAttribute("src", /^blob:/);

  await page.locator("[data-save-document]").click();
  await page
    .locator("[data-progress-dialog]")
    .getByRole("button", { name: "編集を続ける" })
    .click();
  await page.locator("[data-body]").fill("## 画像\n\n画像参照を削除しました。");
  await page.locator("[data-save-document]").click();
  await page
    .locator("[data-progress-dialog]")
    .getByRole("button", { name: "編集を続ける" })
    .click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.locator("[data-media-status]")).toHaveText(
    "素材はまだありません",
  );
  await expect(page.locator(".media-item")).toHaveCount(0);
  expect(deleteSucceeded).toBe(true);
});

test("IM-3: 認証切れ等でHTMLが返った場合は画像として扱わず再試行案内を表示する", async ({
  page,
}) => {
  await mockAdminApi(page);
  const assetId = "44444444-4444-4444-8444-444444444444";
  await page.route("**/api/admin/editor/documents/doc-1", async (route) => {
    await route.fulfill({
      json: {
        document: {
          ...documentItem,
          body: `![表示できない図](asset://${assetId})`,
        },
        comments,
      },
    });
  });
  await page.route(
    "**/api/admin/editor/documents/doc-1/assets",
    async (route) => {
      await route.fulfill({ json: { assets: [] } });
    },
  );
  await page.route(`**/api/admin/editor/assets/${assetId}`, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<html>login</html>",
    });
  });
  await page.goto("./admin/editor/?document=doc-1");

  await expect(
    page.locator("[data-preview] .editorial-image-error"),
  ).toHaveText("画像を表示できません。再読み込みしてください。");
  await expect(
    page.locator(`[data-editorial-asset="${assetId}"]`),
  ).not.toHaveAttribute("src", /api\/admin/);
});

test("E-1〜E-5/E-13: 全4枠をボタンで切り替え、四辺移動とライブ別窓同期が使える", async ({
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

  await page.locator('[data-pane-tab="media"]').click();
  await expect(page.locator(".editor-split > section:visible")).toHaveCount(4);
  for (const pane of ["writing", "preview", "media", "review"]) {
    await expect(
      page.locator(`[data-editor-pane="${pane}"] [data-pane-edge]`),
    ).toHaveCount(4);
  }
  await expect(page.locator('[data-pane-tab="memo"]')).toHaveCount(1);
  await expect(page.locator(".memo-area")).toHaveCount(1);
  await expect(page.locator(".memo-area")).toBeHidden();

  const writing = page.locator('[data-editor-pane="writing"]');
  const preview = page.locator('[data-editor-pane="preview"]');
  const review = page.locator('[data-editor-pane="review"]');
  await expect(writing.locator('[data-edge="left"]')).toBeDisabled();
  await expect(review.locator('[data-edge="right"]')).toBeDisabled();
  await writing.locator('[data-edge="top"]').click();
  await expect(writing).toHaveCSS("grid-row-start", "1");
  await expect(preview).toHaveCSS("grid-row-start", "2");
  await expect(writing.locator('[data-edge="top"]')).toBeDisabled();
  await preview.locator('[data-edge="top"]').click();
  await expect(writing).toHaveCSS("grid-row-start", "1");
  await expect(preview).toHaveCSS("grid-row-start", "1");
  await expect(review).toHaveCSS("grid-row-start", "2");
  await writing.locator('[data-edge="right"]').click();
  await expect(writing).toHaveCSS("grid-column-start", "2");
  await expect(preview).toHaveCSS("grid-column-start", "1");

  const popupPromise = page.waitForEvent("popup");
  await writing.locator('[data-pane-popout="writing"]').click();
  const popup = await popupPromise;
  await expect(writing).toBeHidden();
  await expect(popup.locator("[data-body]")).toBeVisible();
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
  await expect(
    thread.locator(
      'article[data-comment-history="comment-1"] .comment-action-acknowledge .comment-action-count',
    ),
  ).toHaveText("1");
  await expect(
    thread.locator(
      'article[data-comment-history="comment-1"] .comment-action-unacknowledge .comment-action-count',
    ),
  ).toHaveText("1");
  await expect(thread.locator(".comment-action-actor-list")).toHaveCount(0);

  await thread.locator(".thread-summary").click({ button: "right" });
  await expect(page.locator("[data-comment-context-menu]")).toContainText(
    "確認済み：Alice",
  );
  await expect(page.locator("[data-comment-context-menu]")).toContainText(
    "未反映：Bob",
  );
  await page.keyboard.press("Escape");

  await expect(thread.locator(".comment-action-history")).toHaveCount(0);
  const acknowledge = thread.getByRole("button", { name: /確認済み/ });
  await acknowledge.hover();
  await expect(page.locator(".comment-action-history-tooltip")).toHaveText(
    "確認済み：Alice",
  );

  await acknowledge.click({ button: "right" });
  await expect(page.locator("[data-comment-context-menu]")).toHaveText(
    "確認済みの操作履歴確認済み：Alice",
  );
  await page.keyboard.press("Escape");

  await thread.locator("[data-toggle-replies]").click();
  const replyContent = thread.locator(".comment-reply .comment-content");
  await expect(replyContent).toBeVisible();
  await expect(thread.locator(".comment-replies")).toHaveCSS("display", "grid");
  await expect(thread.locator(".comment-reply")).toHaveCSS("width", /px/);
  expect(
    await replyContent.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeLessThan(14);
  await thread.locator(".comment-reply").click({ button: "right" });
  await expect(page.locator("[data-comment-context-menu]")).toContainText(
    "確認済み：Carol",
  );
  await page.keyboard.press("Escape");

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

test("CM-RT: コメント変更通知を受けると一覧をリアルタイム更新する", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class TestSocket extends EventTarget {
      static readonly OPEN = 1;
      readonly readyState = 0;
      binaryType = "arraybuffer";
      constructor() {
        super();
        (window as Window & { __testSockets?: TestSocket[] }).__testSockets ??=
          [];
        (
          window as unknown as { __testSockets: TestSocket[] }
        ).__testSockets.push(this);
        queueMicrotask(() => {
          Object.defineProperty(this, "readyState", { value: TestSocket.OPEN });
          this.dispatchEvent(new Event("open"));
        });
      }
      send() {}
      close() {
        Object.defineProperty(this, "readyState", { value: 3 });
        this.dispatchEvent(new Event("close"));
      }
    }
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: TestSocket,
    });
  });
  let documentReads = 0;
  const newComment = {
    id: "comment-realtime",
    parent_comment_id: null,
    body: "別画面から追加されたコメントです。",
    created_by: "bob@example.com",
    author_display_name: "Bob",
    created_at: "2026-08-20T02:00:00.000Z",
    selection_start: null,
    selection_end: null,
    selection_text: null,
    selections: [],
    tags: [],
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledged_by_emails: [],
    unacknowledged_by_emails: [],
    resolved_at: null,
    resolved_by: null,
    action_actor_counts: { acknowledge: [], unacknowledge: [] },
  };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "alice@example.com", isManager: true },
      });
      return;
    }
    if (url.pathname === "/api/admin/profile") {
      await route.fulfill({
        json: { profile: { display_name: "Alice", avatar_url: "" } },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications") {
      await route.fulfill({ json: { notifications: [] } });
      return;
    }
    if (url.pathname === "/api/admin/editor/documents") {
      await route.fulfill({
        json: {
          documents: [documentItem],
          mentionNames: ["Alice", "Bob"],
          scope: {
            email: "alice@example.com",
            subjects: ["mathematics"],
            isManager: true,
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/editor/documents/doc-1") {
      documentReads += 1;
      await route.fulfill({
        json: {
          document: documentItem,
          comments: documentReads > 1 ? [...comments, newComment] : comments,
        },
      });
      return;
    }
    if (url.pathname.endsWith("/assets")) {
      await route.fulfill({ json: { assets: [] } });
      return;
    }
    if (url.pathname.endsWith("/revisions")) {
      await route.fulfill({ json: { revisions: [] } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });
  await page.goto("./admin/editor/?document=doc-1");
  await expect(
    page.locator('[data-comment-context="comment-1"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __testSockets?: unknown[] }).__testSockets
            ?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const sockets =
      (window as Window & { __testSockets?: EventTarget[] }).__testSockets ??
      [];
    sockets.forEach((socket) =>
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ type: "comments-changed" }),
        }),
      ),
    );
  });
  await expect(
    page.locator('[data-comment-context="comment-realtime"]'),
  ).toBeVisible();
});
