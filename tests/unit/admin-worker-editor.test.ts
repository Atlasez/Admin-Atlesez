import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

class EmptyStatement {
  constructor(protected readonly query: string) {}

  bind(...values: unknown[]) {
    const placeholders = (this.query.match(/\?/g) ?? []).length;
    if (placeholders !== values.length)
      throw new Error(
        `Wrong number of parameter bindings: expected ${placeholders}, received ${values.length}`,
      );
    return this;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }

  async run() {
    return {};
  }
}

const emptyEnv = {
  ADMIN_AUTH_MODE: "local",
  ADMIN_LOCAL_EMAIL: "local-editor@atlasez.test",
  REPORTS: {
    prepare: (query: string) => new EmptyStatement(query),
    batch: async () => [],
  },
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

describe("admin worker editor APIs", () => {
  it("serves the CodeMirror completion module used by the article editor", async () => {
    let requestedPath = "";
    const assetEnv = {
      ...emptyEnv,
      ASSETS: {
        fetch: async (request: Request) => {
          requestedPath = new URL(request.url).pathname;
          return new Response("completion module", {
            status: 200,
            headers: { "content-type": "text/javascript" },
          });
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/admin-codemirror.js"),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(requestedPath).toBe("/admin-codemirror.js");
    await expect(response.text()).resolves.toContain("completion module");
  });

  it("returns JSON for unexpected API failures instead of a Cloudflare HTML error", async () => {
    const brokenEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: () => {
          throw new Error("no such table: editorial_member_profiles");
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/profile"),
      brokenEnv as never,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const data = (await response.json()) as {
      error?: string;
      requestId?: string;
    };
    expect(data.error).toContain("データを読み込めませんでした");
    expect(data.error).not.toContain("no such table");
    expect(data.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns empty review request collections for an all-subject manager", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/review-requests"),
      emptyEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requests: [],
      reviewers: [],
    });
  });

  it("reports an unconfigured GitHub publication integration before publishing", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/publication-integration"),
      emptyEnv as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ready: false,
      configured: false,
      repository: "Atlasez/Atlasez01",
    });
  });

  it("checks the publication repository branch and write permission", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          default_branch: "main",
          archived: false,
          permissions: { pull: true, push: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      const response = await worker.fetch(
        new Request(
          "http://localhost/api/admin/editor/publication-integration",
        ),
        { ...emptyEnv, GITHUB_PUBLISH_TOKEN: "test-token" } as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ready: true,
        repository: "Atlasez/Atlasez01",
        defaultBranch: "main",
        canWrite: true,
        canCreatePullRequest: true,
        automaticMerge: false,
        automationReady: false,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("exposes feedback completion progress before publication review", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    class PublicationStateStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 2, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_workflow_roles"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublicationStateStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
      ),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      feedbackTaskTotal: 2,
      feedbackTaskDone: 1,
      feedbackComplete: false,
      canCompleteWriting: true,
    });
  });

  it("blocks publication review until every feedback task is complete", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class PublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 2, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_workflow_roles"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      feedbackTaskTotal: 2,
      feedbackTaskDone: 1,
    });
    expect(executed).toEqual([]);
  });

  it("requires feedback tasks before a draft can enter publication review", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "draft",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class DraftPublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 0, done: 0 } as T;
        return null as T | null;
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new DraftPublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "フィードバック依頼がありません。先にフィードバックを依頼してください。",
    });
    expect(executed).toEqual([]);
  });

  it("requires a project leader even when a subject coordinator is configured", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class RolePublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 1, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("role = 'subject-coordinator'"))
          return { results: [{ email: "coordinator@example.com" }] as T[] };
        if (this.query.includes("role = 'project-leader'"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new RolePublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "プロジェクトリーダーが設定されていないため、公開審査を開始できません。",
    });
    expect(executed).toEqual([]);
  });

  it("serves an editorial asset with its saved MIME type and filename", async () => {
    const assetId = "11111111-1111-4111-8111-111111111111";
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const assetEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          if (!query.includes("FROM editorial_assets a")) return statement;
          return Object.assign(statement, {
            first: async () => ({
              id: assetId,
              document_id: "22222222-2222-4222-8222-222222222222",
              filename: "diagram.png",
              media_type: "image/png",
              bytes: bytes.byteLength,
              data: bytes,
              subject: "mathematics",
              status: "draft",
            }),
          });
        },
      },
    };

    const response = await worker.fetch(
      new Request(`http://localhost/api/admin/editor/assets/${assetId}`),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="diagram.png"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("stores approved comment tags independently from the comment body", async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    const collaborationNotifications: Request[] = [];
    class RecordingStatement extends EmptyStatement {
      private values: unknown[] = [];

      constructor(private readonly sql: string) {
        super(sql);
      }

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async first<T>() {
        if (
          this.sql.includes("SELECT subject, status FROM editorial_documents")
        )
          return { subject: "mathematics", status: "draft" } as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.sql, values: this.values });
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      EDITORIAL_COLLABORATION: {
        idFromName: () => ({}),
        get: () => ({
          fetch: async (request: Request) => {
            collaborationNotifications.push(request);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          },
        }),
      },
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new RecordingStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({
            body: "定義を補足してください。",
            tags: ["定義不足", "例・図の追加"],
            selections: [],
          }),
        },
      ),
      env as never,
    );

    expect(response.status).toBe(201);
    const tagInserts = executed.filter((entry) =>
      entry.query.includes("INSERT INTO editorial_comment_tags"),
    );
    expect(tagInserts.map((entry) => entry.values.at(-1))).toEqual([
      "定義不足",
      "例・図の追加",
    ]);
    const commentInsert = executed.find((entry) =>
      entry.query.includes("INSERT INTO editorial_comments"),
    );
    expect(commentInsert?.values).toContain("定義を補足してください。");
    expect(commentInsert?.values).not.toContain("[定義不足]");
    expect(collaborationNotifications).toHaveLength(1);
    expect(collaborationNotifications[0]?.method).toBe("POST");
    await expect(collaborationNotifications[0]?.json()).resolves.toEqual({
      type: "comments-changed",
    });
  });

  it("accepts a tag-only comment while rejecting a completely empty comment", async () => {
    class CommentStatement extends EmptyStatement {
      constructor(private readonly sql: string) {
        super(sql);
      }

      async first<T>() {
        if (
          this.sql.includes("SELECT subject, status FROM editorial_documents")
        )
          return { subject: "mathematics", status: "draft" } as T;
        return null as T | null;
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new CommentStatement(query),
      },
    };
    const request = (payload: unknown) =>
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify(payload),
        },
      );

    const tagOnly = await worker.fetch(
      request({ body: "", tags: ["根拠確認"], selections: [] }),
      env as never,
    );
    expect(tagOnly.status).toBe(201);

    const empty = await worker.fetch(
      request({ body: "", tags: [], selections: [] }),
      env as never,
    );
    expect(empty.status).toBe(400);
  });

  it("rejects comment tags outside the supported review taxonomy", async () => {
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({
            body: "確認してください。",
            tags: ["任意タグ"],
          }),
        },
      ),
      emptyEnv as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "選択できないコメントタグが含まれています。",
    });
  });

  it("creates an article publication PR without writing to main", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      source_article_id: null,
      subject: "mathematics",
      category: "overview",
      locale: "ja",
      slug: "test-article",
      title: "テスト記事",
      summary: "テスト用の要約",
      concept_id: "mathematics.overview.test",
      body: "本文です。",
      writing_memo: "",
      latex_engine: "katex",
      status: "approved",
      created_by: "local-editor@atlasez.test",
      updated_by: "local-editor@atlasez.test",
      created_at: "2026-08-28T00:00:00.000Z",
      updated_at: "2026-08-28T00:00:00.000Z",
      reviewed_at: "2026-08-28T00:00:00.000Z",
      published_at: null,
      scheduled_publish_at: null,
      scheduled_publish_claimed_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
      publication_pr_number: null,
      publication_pr_url: null,
      publication_branch: null,
      publication_action: null,
      publication_requested_at: null,
      locked_ranges: "[]",
      article_references: "[]",
    };
    const executed: { query: string; values: unknown[] }[] = [];
    class PublishStatement extends EmptyStatement {
      private values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.query, values: this.values });
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      GITHUB_PUBLISH_TOKEN: "test-token",
      GITHUB_REPOSITORY: "Atlasez/Atlasez01",
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublishStatement(query),
      },
    };
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "base-sha" } }));
        if (url.endsWith("/git/refs") && init?.method === "POST")
          return new Response(JSON.stringify({ ref: "refs/heads/editorial" }), {
            status: 201,
          });
        if (url.includes("/contents/") && !init?.method)
          return new Response("Not found", { status: 404 });
        if (url.includes("/contents/") && init?.method === "PUT")
          return new Response(
            JSON.stringify({ content: { sha: "article-sha" } }),
            { status: 201 },
          );
        if (url.endsWith("/pulls") && init?.method === "POST")
          return new Response(
            JSON.stringify({
              number: 321,
              html_url: "https://github.com/Atlasez/Atlasez01/pull/321",
            }),
            { status: 201 },
          );
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    );
    try {
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/admin/editor/documents/${documentId}/publish`,
          {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: "{}",
          },
        ),
        env as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        pending: true,
        pullRequestNumber: 321,
        pullRequestUrl: "https://github.com/Atlasez/Atlasez01/pull/321",
      });
      const contentWrites = requests.filter(
        (request) =>
          request.url.includes("/contents/") && request.init?.method === "PUT",
      );
      expect(contentWrites).toHaveLength(1);
      expect(contentWrites[0]?.url).toContain(
        "/contents/src/content/articles/jpn/mathematics/overview/test-article.md",
      );
      const articleWrite = JSON.parse(String(contentWrites[0]?.init?.body));
      expect(articleWrite.branch).toMatch(/^editorial\/published-/);
      expect(articleWrite.branch).not.toBe("main");
      const pullRequest = requests.find((request) =>
        request.url.endsWith("/pulls"),
      );
      const pullRequestBody = JSON.parse(String(pullRequest?.init?.body));
      expect(pullRequestBody.base).toBe("main");
      expect(pullRequestBody.head).toBe(articleWrite.branch);
      expect(
        executed.some((entry) =>
          entry.query.includes("publication_action = 'publish'"),
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
