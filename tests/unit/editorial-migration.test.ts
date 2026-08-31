import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import worker, { editorialMarkdown } from "../../src/admin-worker";
import { diagnoseArticleSource } from "../../src/lib/article-diagnostics.mjs";

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

type CatalogDocument = {
  id: string;
  source_article_id: string | null;
  subject: string;
  category: string;
  locale: string;
  slug: string;
  title: string;
  summary: string;
  concept_id: string;
  body: string;
  status: "draft" | "in-review" | "on-hold" | "approved";
  published_at: string | null;
  updated_at: string;
  created_at: string;
};

type CatalogRow = {
  path: string;
  identity_key: string;
  repository: string;
  locale: string;
  subject: string;
  category: string;
  slug: string;
  source_article_id: string | null;
  git_sha: string | null;
  title: string;
  summary: string;
  concept_id: string;
  public_status: string;
  document_id: string | null;
  last_seen_at: string;
  registered_at: string | null;
  registered_by: string | null;
};

type CatalogStore = {
  documents: CatalogDocument[];
  rows: Map<string, CatalogRow>;
};

class CatalogStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly store: CatalogStore,
    private readonly calls: SqlCall[],
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

  async all<T>() {
    if (this.query.includes("FROM editorial_article_catalog"))
      return { results: [...this.store.rows.values()] as T[] };

    if (
      this.query.includes(
        "SELECT id, source_article_id, body, status, published_at FROM editorial_documents",
      )
    ) {
      const [locale, subject, category, slug] = this.values;
      return {
        results: this.store.documents.filter(
          (document) =>
            document.locale === locale &&
            document.subject === subject &&
            document.category === category &&
            document.slug === slug,
        ) as T[],
      };
    }

    if (
      this.query.includes(
        "SELECT id, source_article_id FROM editorial_documents",
      ) &&
      this.query.includes("WHERE locale=?")
    ) {
      const [locale, subject, category, slug] = this.values;
      return {
        results: this.store.documents.filter(
          (document) =>
            document.locale === locale &&
            document.subject === subject &&
            document.category === category &&
            document.slug === slug,
        ) as T[],
      };
    }

    if (
      this.query.includes(
        "SELECT id, source_article_id, subject, category, locale, slug",
      )
    )
      return { results: [...this.store.documents] as T[] };

    return { results: [] as T[] };
  }

  async first<T>() {
    if (
      this.query.includes(
        "SELECT id, locale, subject, category, slug FROM editorial_documents",
      ) &&
      this.query.includes("source_article_id=?")
    ) {
      const [sourceArticleId, excludedDocumentId] = this.values;
      return (this.store.documents.find(
        (document) =>
          document.source_article_id === sourceArticleId &&
          document.id !== excludedDocumentId,
      ) ?? null) as T | null;
    }

    if (
      this.query.includes(
        "SELECT document_id, source_article_id FROM editorial_article_catalog",
      )
    ) {
      const row = this.store.rows.get(String(this.values[0]));
      return (
        row
          ? {
              document_id: row.document_id,
              source_article_id: row.source_article_id,
            }
          : null
      ) as T | null;
    }

    if (
      this.query.includes(
        "SELECT id, source_article_id FROM editorial_documents WHERE id=?",
      )
    )
      return (this.store.documents.find(
        (document) => document.id === this.values[0],
      ) ?? null) as T | null;

    return null as T | null;
  }

  async run() {
    this.calls.push({ query: this.query, values: this.values });

    if (this.query.includes("INSERT OR IGNORE INTO editorial_documents")) {
      const [
        id,
        sourceArticleId,
        subject,
        category,
        locale,
        slug,
        title,
        summary,
        conceptId,
        body,
        createdBy,
        updatedBy,
        createdAt,
        updatedAt,
        _references,
      ] = this.values;
      if (!this.store.documents.some((document) => document.id === id))
        this.store.documents.push({
          id: String(id),
          source_article_id: String(sourceArticleId),
          subject: String(subject),
          category: String(category),
          locale: String(locale),
          slug: String(slug),
          title: String(title),
          summary: String(summary),
          concept_id: String(conceptId),
          body: String(body),
          status: "draft",
          published_at: null,
          updated_at: String(updatedAt),
          created_at: String(createdAt),
        });
      void createdBy;
      void updatedBy;
      void _references;
    }

    if (
      this.query.startsWith("UPDATE editorial_documents SET source_article_id")
    ) {
      const [sourceArticleId, updatedBy, updatedAt, documentId] = this.values;
      const document = this.store.documents.find(
        (item) => item.id === documentId,
      );
      if (document && !document.source_article_id) {
        document.source_article_id = String(sourceArticleId);
        document.updated_at = String(updatedAt);
      }
      void updatedBy;
    }

    if (this.query.includes("INSERT INTO editorial_article_catalog")) {
      const [
        path,
        identityKey,
        repository,
        locale,
        subject,
        category,
        slug,
        sourceArticleId,
        gitSha,
        title,
        summary,
        conceptId,
        documentId,
        lastSeenAt,
        registeredAt,
        registeredBy,
      ] = this.values;
      this.store.rows.set(String(path), {
        path: String(path),
        identity_key: String(identityKey),
        repository: String(repository),
        locale: String(locale),
        subject: String(subject),
        category: String(category),
        slug: String(slug),
        source_article_id: sourceArticleId ? String(sourceArticleId) : null,
        git_sha: gitSha ? String(gitSha) : null,
        title: String(title),
        summary: String(summary),
        concept_id: String(conceptId),
        public_status: "published",
        document_id: documentId ? String(documentId) : null,
        last_seen_at: String(lastSeenAt),
        registered_at: registeredAt ? String(registeredAt) : null,
        registered_by: registeredBy ? String(registeredBy) : null,
      });
    }

    return {};
  }
}

const publicArticlePath =
  "src/content/articles/ja/mathematics/ring-theory/ring-definition.md";
const publicArticleMarkdown = `---
articleId: ja-mathematics-ring-definition
locale: ja
title: 環の定義
slug: ring-definition
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.ring-definition
status: published
summary: 環の定義を説明します。
references: []
---

## 環の定義

公開済みの本文です。
`;

const utf8Base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const catalogEnvironment = (store: CatalogStore, calls: SqlCall[]) => ({
  ...baseEnv,
  GITHUB_PUBLISH_TOKEN: "test-token",
  GITHUB_REPOSITORY: "Atlasez/Atlasez01",
  REPORTS: {
    prepare: (query: string) => new CatalogStatement(query, store, calls),
    batch: async () => [],
  },
});

const withSuccessfulGithubApi = async <T>(
  callback: (requests: { method: string; url: string }[]) => Promise<T>,
) => {
  const originalFetch = globalThis.fetch;
  const requests: { method: string; url: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    requests.push({ method, url });
    if (url.includes("/git/trees/main?recursive=1"))
      return Response.json({
        tree: [{ path: publicArticlePath, type: "blob", sha: "sha-ring" }],
      });
    if (url.includes("/git/blobs/sha-ring"))
      return Response.json({
        content: utf8Base64(publicArticleMarkdown),
        encoding: "base64",
      });
    throw new Error(`Unexpected GitHub request in catalog test: ${url}`);
  }) as typeof fetch;
  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

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
      sameOriginJsonRequest("/api/admin/editor/documents", importedArticle),
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

  it("公開済み記事の更新案でも同じ公開パスとarticleIdを維持する", async () => {
    const calls: SqlCall[] = [];
    const existing = {
      id: "33333333-3333-4333-8333-333333333333",
      ...importedArticle,
      source_article_id: importedArticle.sourceArticleId,
      concept_id: importedArticle.conceptId,
      writing_memo: "",
      latex_engine: importedArticle.latexEngine,
      created_by: "author@example.com",
      updated_by: "reviewer@example.com",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      reviewed_at: "2026-08-31T00:00:00.000Z",
      published_at: "2026-08-31T00:00:00.000Z",
      scheduled_publish_at: null,
      scheduled_publish_claimed_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
      locked_ranges: "[]",
      article_references: "[]",
      body: importedArticle.body,
      status: "approved",
    };
    const env = {
      ...baseEnv,
      REPORTS: {
        prepare: (query: string) =>
          new RecordingStatement(query, calls, existing),
        batch: async () => [],
      },
    };

    const response = await worker.fetch(
      sameOriginJsonRequest(
        `/api/admin/editor/documents/${existing.id}`,
        {
          ...importedArticle,
          status: "approved",
          body: `${importedArticle.body}\n\n## 更新案\n\n公開済み記事への追記です。`,
        },
        "PATCH",
      ),
      env as never,
    );

    expect(response.status).toBe(200);
    const update = calls.find((call) =>
      call.query.includes("UPDATE editorial_documents SET source_article_id"),
    );
    expect(update?.values.slice(0, 5)).toEqual([
      importedArticle.sourceArticleId,
      importedArticle.subject,
      importedArticle.category,
      importedArticle.locale,
      importedArticle.slug,
    ]);
    expect(update?.values[11]).toContain("## 更新案");
    // The update changes the existing file in place; it must not create a new
    // path or replace the stable article identifier with the editorial UUID.
    expect(update?.query).not.toContain("published_at = NULL");
    expect(
      calls.some((call) =>
        call.query.includes("INSERT INTO editorial_documents"),
      ),
    ).toBe(false);
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

    expect(editorSource).toContain(
      "source_article_id: source?.articleId || null",
    );
    expect(editorSource).toContain('status: "draft"');
    expect(editorSource).toContain("published_at: null");
    expect(importHandler).toContain("emptyDocument(source)");
    expect(importHandler).not.toContain("/publish");
  });

  it("GET catalogは公開記事と未登録状態を同じidentityで返す", async () => {
    const store: CatalogStore = { documents: [], rows: new Map() };
    const calls: SqlCall[] = [];

    await withSuccessfulGithubApi(async (githubRequests) => {
      const response = await worker.fetch(
        new Request("http://localhost/api/admin/editor/catalog"),
        catalogEnvironment(store, calls) as never,
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        catalog?: Array<Record<string, unknown>>;
      };
      expect(data.catalog).toHaveLength(1);
      expect(data.catalog?.[0]).toMatchObject({
        identity_key: "ja/mathematics/ring-theory/ring-definition",
        source_article_id: "ja-mathematics-ring-definition",
        state: "unmanaged",
        editorial_document_id: null,
        public_status: "published",
      });
      expect(githubRequests.every((request) => request.method === "GET")).toBe(
        true,
      );
      // GET catalog may cache metadata, but must never publish or mutate GitHub.
      expect(githubRequests.some((request) => request.method === "PUT")).toBe(
        false,
      );
    });
  });

  it("registerを同じidentityで繰り返しても同じ原稿へ冪等に紐付け、公開処理を開始しない", async () => {
    const store: CatalogStore = { documents: [], rows: new Map() };
    const calls: SqlCall[] = [];
    const registrationPayload = {
      locale: "ja",
      subject: "mathematics",
      category: "ring-theory",
      slug: "ring-definition",
    };

    await withSuccessfulGithubApi(async (githubRequests) => {
      const firstResponse = await worker.fetch(
        sameOriginJsonRequest(
          "/api/admin/editor/catalog/register",
          registrationPayload,
        ),
        catalogEnvironment(store, calls) as never,
      );
      const first = (await firstResponse.json()) as Record<string, unknown>;

      const secondResponse = await worker.fetch(
        sameOriginJsonRequest(
          "/api/admin/editor/catalog/register",
          registrationPayload,
        ),
        catalogEnvironment(store, calls) as never,
      );
      const second = (await secondResponse.json()) as Record<string, unknown>;
      const catalogResponse = await worker.fetch(
        new Request("http://localhost/api/admin/editor/catalog"),
        catalogEnvironment(store, calls) as never,
      );
      const catalog = (await catalogResponse.json()) as {
        catalog?: Array<Record<string, unknown>>;
      };

      expect(firstResponse.status).toBe(201);
      expect(first).toMatchObject({
        ok: true,
        registered: true,
        identityKey: "ja/mathematics/ring-theory/ring-definition",
        publicationStarted: false,
      });
      expect(secondResponse.status).toBe(200);
      expect(second).toMatchObject({
        ok: true,
        registered: false,
        documentId: first.documentId,
        identityKey: first.identityKey,
        publicationStarted: false,
      });
      expect(catalogResponse.status).toBe(200);
      expect(catalog.catalog?.[0]).toMatchObject({
        identity_key: first.identityKey,
        state: "managed",
        editorial_document_id: first.documentId,
        public_status: "published",
      });
      expect(store.documents).toHaveLength(1);
      expect(store.rows.size).toBe(1);
      expect(
        calls.filter((call) =>
          call.query.includes("INSERT OR IGNORE INTO editorial_documents"),
        ),
      ).toHaveLength(1);
      expect(githubRequests.some((request) => request.method === "PUT")).toBe(
        false,
      );
    });
  });

  it("同じ公開identityの新規原稿作成を重複として拒否する", async () => {
    const store: CatalogStore = {
      documents: [
        {
          id: "existing-document",
          source_article_id: "ja-mathematics-ring-definition",
          subject: "mathematics",
          category: "ring-theory",
          locale: "ja",
          slug: "ring-definition",
          title: "環の定義",
          summary: "既存記事",
          concept_id: "math.ring-theory.ring-definition",
          body: "本文",
          status: "draft",
          published_at: null,
          updated_at: "2026-08-31T00:00:00.000Z",
          created_at: "2026-08-30T00:00:00.000Z",
        },
      ],
      rows: new Map(),
    };
    const calls: SqlCall[] = [];

    const response = await worker.fetch(
      sameOriginJsonRequest("/api/admin/editor/documents", importedArticle),
      catalogEnvironment(store, calls) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "同じ公開パスの運営原稿が既に存在します。既存原稿を開くか、重複原稿を整理してください。",
    });
    expect(
      calls.some((call) =>
        call.query.includes("INSERT INTO editorial_documents"),
      ),
    ).toBe(false);
  });

  it("同じsource_article_idを別の公開パスへ複製する新規原稿を拒否する", async () => {
    const store: CatalogStore = {
      documents: [
        {
          id: "existing-source-document",
          source_article_id: importedArticle.sourceArticleId,
          subject: importedArticle.subject,
          category: "field-theory",
          locale: importedArticle.locale,
          slug: "ring-definition-copy",
          title: importedArticle.title,
          summary: "既存記事",
          concept_id: importedArticle.conceptId,
          body: "本文",
          status: "draft",
          published_at: null,
          updated_at: "2026-08-31T00:00:00.000Z",
          created_at: "2026-08-30T00:00:00.000Z",
        },
      ],
      rows: new Map(),
    };
    const calls: SqlCall[] = [];

    const response = await worker.fetch(
      sameOriginJsonRequest("/api/admin/editor/documents", {
        ...importedArticle,
        category: "field-theory",
        slug: "ring-definition",
      }),
      catalogEnvironment(store, calls) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "この公開記事は別の運営原稿に紐付いています。",
      documentId: "existing-source-document",
    });
    expect(
      calls.some((call) =>
        call.query.includes("INSERT INTO editorial_documents"),
      ),
    ).toBe(false);
  });

  it("診断結果のseverity・位置・メッセージを編集UIの契約で表示できる", async () => {
    const editorSource = await readFile(
      new URL("../../src/pages/admin/editor.astro", import.meta.url),
      "utf8",
    );
    const result = diagnoseArticleSource("$未完了", { references: [] });

    expect(result[0]).toMatchObject({
      severity: "error",
      code: "inline-math-unclosed",
      line: 1,
      column: 1,
    });
    expect(typeof result[0]?.message).toBe("string");
    expect(editorSource).toContain("data-editor-diagnostics");
    expect(editorSource).toContain("data-diagnostics-trigger-count");
    expect(editorSource).toContain("data-diagnostics-summary");
    expect(editorSource).toContain("data-diagnostics-list");
    expect(editorSource).toContain('item.severity === "error"');
    expect(editorSource).toContain("item.line}:${item.column}");
    expect(editorSource).toContain("esc(item.message)");
  });

  it("記事一覧UIは公開済み・未登録を明示し、catalog/registerへ導く", async () => {
    const articlesSource = await readFile(
      new URL("../../src/pages/admin/articles.astro", import.meta.url),
      "utf8",
    );

    expect(articlesSource).toContain("公開済み・未登録");
    expect(articlesSource).toContain("運営管理へ登録");
    expect(articlesSource).toContain(
      'fetch("/api/admin/editor/catalog/register"',
    );
    expect(articlesSource).toContain(
      'body: JSON.stringify({ locale: "ja", subject: source.subject, category: source.category, slug: source.slug })',
    );
  });
});
