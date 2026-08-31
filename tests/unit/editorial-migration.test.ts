import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import worker, { editorialMarkdown } from "../../src/admin-worker";

type SqlCall = { query: string; values: unknown[] };

class RecordingStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly calls: SqlCall[],
    private readonly firstResult: unknown = null,
  ) {}

  bind(...values: unknown[]) {
    const placeholders = (this.query.match(/\?/g) ?? []).length;
    if (placeholders !== values.length)
      throw new Error(
        `Wrong number of parameter bindings: expected ${placeholders}, received ${values.length}`,
      );
    this.values = values;
    return this;
  }

  async first<T>() {
    return this.firstResult as T | null;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async run() {
    this.calls.push({ query: this.query, values: this.values });
    return {};
  }
}

const baseEnv = {
  ADMIN_AUTH_MODE: "local",
  ADMIN_LOCAL_EMAIL: "migration-tester@atlasez.test",
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const importedArticle = {
  sourceArticleId: "ja-mathematics-ring-definition",
  subject: "mathematics",
  category: "ring-theory",
  locale: "ja",
  slug: "ring-definition",
  title: "環の定義",
  summary: "環の定義を説明します。",
  conceptId: "math.ring-theory.ring-definition",
  body: "## 環の定義\n\n既存公開記事から取り込んだ本文です。",
  writingMemo: "",
  latexEngine: "katex",
  status: "draft",
  lockedRanges: [],
  references: [],
};

const sameOriginJsonRequest = (
  pathname: string,
  body: unknown,
  method = "POST",
) =>
  new Request(`http://localhost${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });

describe("既存公開記事の運営原稿移行契約", () => {
  it("既存公開記事の取り込みは公開せず、sourceArticleId付き下書きとして保存する", async () => {
    const calls: SqlCall[] = [];
    const env = {
      ...baseEnv,
      REPORTS: {
        prepare: (query: string) => new RecordingStatement(query, calls),
        batch: async () => [],
      },
    };

    const response = await worker.fetch(
      sameOriginJsonRequest(
        "/api/admin/editor/documents",
        importedArticle,
      ),
      env as never,
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as { id?: string };
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);

    const insert = calls.find((call) =>
      call.query.includes("INSERT INTO editorial_documents"),
    );
    expect(insert?.values).toContain(importedArticle.sourceArticleId);
    expect(insert?.values).toContain(importedArticle.slug);
    expect(insert?.values).toContain("draft");
    // Import/save must not call the publication endpoint or set published_at.
    expect(calls.some((call) => call.query.includes("published_at"))).toBe(
      false,
    );
  });

  it("紐付いた原稿を更新しても公開記事の識別情報を保持する", async () => {
    const calls: SqlCall[] = [];
    const existing = {
      id: "22222222-2222-4222-8222-222222222222",
      ...importedArticle,
      source_article_id: importedArticle.sourceArticleId,
      concept_id: importedArticle.conceptId,
      writing_memo: "",
      latex_engine: importedArticle.latexEngine,
      created_by: "author@example.com",
      updated_by: "author@example.com",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
      reviewed_at: null,
      published_at: null,
      scheduled_publish_at: null,
      scheduled_publish_claimed_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
      locked_ranges: "[]",
      article_references: "[]",
      body: importedArticle.body,
      status: "draft",
    };
    const env = {
      ...baseEnv,
      REPORTS: {
        prepare: (query: string) =>
          new RecordingStatement(query, calls, existing),
        batch: async () => [],
      },
    };
    const documentId = existing.id;

    const response = await worker.fetch(
      sameOriginJsonRequest(
        `/api/admin/editor/documents/${documentId}`,
        {
          ...importedArticle,
          body: `${importedArticle.body}\n\n## 追記\n\n修正内容です。`,
        },
        "PATCH",
      ),
      env as never,
    );

    expect(response.status).toBe(200);
    const update = calls.find((call) =>
      call.query.includes("UPDATE editorial_documents SET source_article_id"),
    );
    expect(update?.values[0]).toBe(importedArticle.sourceArticleId);
    expect(update?.values).toContain(importedArticle.slug);
    expect(update?.values).toContain(importedArticle.category);
  });

  it("公開用Markdownでも既存記事のarticleIdを維持する", () => {
    const markdown = editorialMarkdown({
      id: "22222222-2222-4222-8222-222222222222",
      source_article_id: importedArticle.sourceArticleId,
      subject: importedArticle.subject,
      category: importedArticle.category,
      locale: importedArticle.locale,
      slug: importedArticle.slug,
      title: importedArticle.title,
      summary: importedArticle.summary,
      concept_id: importedArticle.conceptId,
      body: "## 更新後の環の定義\n\n本文を更新しました。",
      writing_memo: "",
      latex_engine: "katex",
      status: "approved",
      created_by: "author@example.com",
      updated_by: "reviewer@example.com",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      reviewed_at: "2026-08-31T00:00:00.000Z",
      published_at: "2026-08-30T00:00:00.000Z",
      scheduled_publish_at: null,
      scheduled_publish_claimed_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
      locked_ranges: "[]",
      article_references: "[]",
    } as never);

    expect(markdown).toContain(
      `articleId: "${importedArticle.sourceArticleId}"`,
    );
    expect(markdown).toContain("## 更新後の環の定義");
  });

  it("UIは既存公開記事を自動公開せず、紐付け用の下書きを作る", async () => {
    const editorSource = await readFile(
      new URL("../../src/pages/admin/editor.astro", import.meta.url),
      "utf8",
    );
    const importHandlerStart = editorSource.indexOf(
      'root.querySelector<HTMLButtonElement>("[data-import-source]")',
    );
    const importHandler = editorSource.slice(
      importHandlerStart,
      importHandlerStart + 1_000,
    );

    expect(editorSource).toContain("source_article_id: source?.articleId || null");
    expect(editorSource).toContain('status: "draft"');
    expect(editorSource).toContain("published_at: null");
    expect(importHandler).toContain("emptyDocument(source)");
    expect(importHandler).not.toContain("/publish");
  });

  // These TODOs are intentional: the current API has no dedicated management
  // registration endpoint or database uniqueness constraint for public paths.
  it.todo(
    "既存公開記事の管理下登録を同じsourceArticleIdで繰り返しても同じ原稿を返す",
  );
  it.todo(
    "locale/subject/category/slugの同一公開パスに複数の運営原稿を保存できない",
  );
  it.todo(
    "目次で公開済み・運営原稿未登録の記事を明示し、登録操作を提供する",
  );
});
